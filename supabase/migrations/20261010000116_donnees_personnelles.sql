-- Données personnelles et partage (lot F, 2026-10-10).
--  * Export des données d'un contact : tout ce que l'établissement garde sur lui, en un fichier JSON.
--  * Anonymisation sur demande : les coordonnées du contact (et leurs copies dans les réservations, tickets,
--    commandes, livraisons…) sont effacées ; montants, dates et numéros restent pour la comptabilité.
--    Les traces du journal d'audit sur ces lignes sont expurgées des mêmes champs.
--  * Liens de partage à durée limitée : une pièce jointe (non confidentielle) s'ouvre sans compte pendant
--    une durée choisie, puis le lien ne marche plus ; il peut être révoqué avant.
-- Rien ne change pour un établissement qui n'utilise pas ces outils.

-- ---------------------------------------------------------------------------
-- 1. Droits
-- ---------------------------------------------------------------------------
insert into public.permissions (id, module_id, description) values
  ('contacts.donnees_personnelles', 'contacts', 'Exporter ou anonymiser les données personnelles d''un contact')
on conflict (id) do nothing;
insert into public.role_permissions (role_id, permission_id) values ('gerant', 'contacts.donnees_personnelles')
on conflict do nothing;

alter table public.contacts add column anonymise_le timestamptz;

-- Registre des anonymisations (sans aucune donnée personnelle).
create table public.anonymisations (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  contact_id uuid not null unique references public.contacts(id) on delete restrict,
  motif text not null check (btrim(motif) <> '' and length(motif) <= 500),
  lignes jsonb not null default '{}'::jsonb,
  par uuid not null references auth.users(id) on delete restrict,
  le timestamptz not null default now()
);
create index anonymisations_etablissement_idx on public.anonymisations(etablissement_id, le desc);

create table public.liens_partage (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  piece_jointe_id uuid not null references public.pieces_jointes(id) on delete restrict,
  jeton_empreinte text not null unique check (jeton_empreinte ~ '^[0-9a-f]{64}$'),
  expire_le timestamptz not null,
  revoque_le timestamptz,
  revoque_par uuid references auth.users(id) on delete restrict,
  ouvertures integer not null default 0 check (ouvertures >= 0),
  derniere_ouverture timestamptz,
  cree_par uuid not null references auth.users(id) on delete restrict,
  cree_le timestamptz not null default now(),
  check (expire_le > cree_le)
);
create index liens_partage_piece_idx on public.liens_partage(piece_jointe_id);

do $$
declare nom_table text;
begin
  foreach nom_table in array array['anonymisations', 'liens_partage'] loop
    execute format('create trigger %I_sans_suppression before delete on public.%I for each row execute function public.refuser_suppression()', nom_table, nom_table);
    execute format('create trigger %I_verrou_etablissement before update on public.%I for each row execute function public.verrouiller_etablissement_id()', nom_table, nom_table);
    execute format('create trigger %I_audit after insert or update or delete on public.%I for each row execute function public.journaliser_modification()', nom_table, nom_table);
    execute format('alter table public.%I enable row level security', nom_table);
  end loop;
end
$$;
create trigger anonymisations_immuable before update on public.anonymisations
for each row execute function public.refuser_modification();
create policy lecture on public.anonymisations for select to authenticated
  using (public.lecture_autorisee(etablissement_id, 'contacts.donnees_personnelles'));
-- Le jeton n'est jamais stocké : seulement son empreinte SHA-256, qui ne permet pas d'ouvrir le lien.
create policy lecture on public.liens_partage for select to authenticated
  using (exists (select 1 from public.pieces_jointes p where p.id = piece_jointe_id));

-- ---------------------------------------------------------------------------
-- 2. Journal d'audit : reste en ajout seul, sauf l'expurgation faite par anonymiser_contact.
-- ---------------------------------------------------------------------------
create function public.proteger_journal_audit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and current_setting('app.anonymisation_en_cours', true) = 'oui'
     and new.id = old.id and new.table_nom = old.table_nom and new.operation = old.operation
     and new.ligne_id is not distinct from old.ligne_id and new.etablissement_id is not distinct from old.etablissement_id
     and new.acteur is not distinct from old.acteur and new.cree_le = old.cree_le then
    return new;
  end if;
  raise exception 'Un journal est en ajout seul';
end
$$;
drop trigger journal_audit_immuable on public.journal_audit;
create trigger journal_audit_immuable before update or delete on public.journal_audit
for each row execute function public.proteger_journal_audit();

-- Les destinataires d'une campagne restent figés, sauf l'effacement de leurs coordonnées par anonymiser_contact.
create function public.figer_destinataire_campagne()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_setting('app.anonymisation_en_cours', true) = 'oui'
     and (to_jsonb(new) - array['nom', 'coordonnee']) = (to_jsonb(old) - array['nom', 'coordonnee']) then
    return new;
  end if;
  raise exception 'Cette ligne est définitive et ne peut pas être modifiée';
end
$$;
drop trigger mkt_destinataires_figes on public.mkt_destinataires;
create trigger mkt_destinataires_figes before update on public.mkt_destinataires
for each row execute function public.figer_destinataire_campagne();

-- ---------------------------------------------------------------------------
-- 3. Export des données d'un contact
-- ---------------------------------------------------------------------------
-- Toutes les tables de l'établissement qui pointent vers le contact (colonne contact_id ou fournisseur_id),
-- trouvées dans le catalogue : une table ajoutée plus tard est exportée sans changer cette fonction.
-- Les justificatifs et contenus de fichiers (images base64) ne sont pas recopiés.
create function public.exporter_donnees_contact(p_contact_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  k public.contacts%rowtype;
  t record;
  lignes jsonb;
  resultat jsonb := '{}'::jsonb;
begin
  select * into k from public.contacts where id = p_contact_id;
  if k.id is null then
    raise exception 'Contact introuvable';
  end if;
  perform public.exiger_permission(k.etablissement_id, 'contacts.donnees_personnelles');
  for t in
    select c.table_name, c.column_name from information_schema.columns c
    join information_schema.tables tb on tb.table_schema = c.table_schema and tb.table_name = c.table_name and tb.table_type = 'BASE TABLE'
    where c.table_schema = 'public' and c.column_name in ('contact_id', 'fournisseur_id')
      and exists (select 1 from information_schema.columns e where e.table_schema = 'public' and e.table_name = c.table_name and e.column_name = 'etablissement_id')
    order by c.table_name, c.column_name
  loop
    execute format('select coalesce(jsonb_agg(to_jsonb(x) - ''justificatif''), ''[]''::jsonb) from public.%I x where x.%I = $1 and x.etablissement_id = $2',
      t.table_name, t.column_name) into lignes using k.id, k.etablissement_id;
    if jsonb_array_length(lignes) > 0 then
      resultat := resultat || jsonb_build_object(t.table_name, coalesce(resultat -> t.table_name, '[]'::jsonb) || lignes);
    end if;
  end loop;
  insert into public.evenements (etablissement_id, type, acteur, donnees)
  values (k.etablissement_id, 'contact.export', auth.uid(), jsonb_build_object('contact_id', k.id));
  return jsonb_build_object(
    'genere_le', now(),
    'etablissement', (select nom from public.etablissements where id = k.etablissement_id),
    'contact', to_jsonb(k),
    'donnees', resultat
  );
end
$$;

-- ---------------------------------------------------------------------------
-- 4. Anonymisation sur demande
-- ---------------------------------------------------------------------------
-- Champs effacés dans les tables qui recopient les coordonnées d'un contact : ces noms de colonnes partout,
-- plus quelques colonnes propres à une table (ailleurs, « nom » ou « adresse » désignent autre chose : un projet, un bien).
-- Une colonne obligatoire reçoit « Contact anonymisé », une colonne facultative devient vide.
create function public.champs_personnels(p_table text)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['nom_client', 'destinataire', 'telephone', 'email', 'adresse_livraison', 'coordonnee'] || case p_table
    when 'contact_interlocuteurs' then array['nom', 'fonction', 'notes']
    when 'mkt_destinataires' then array['nom']
    when 'liv_livraisons' then array['adresse', 'instructions']
    when 'contacts' then array['nom', 'societe', 'adresse', 'notes', 'identifiant_fiscal']
    else array[]::text[] end
$$;

create function public.anonymiser_contact(p_contact_id uuid, p_motif text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  k public.contacts%rowtype;
  t record;
  col record;
  affectations text[];
  ids text[];
  n integer;
  bilan jsonb := '{}'::jsonb;
  touchees jsonb := '[]'::jsonb;
  libelle text := 'Contact anonymisé';
  bloquant text;
begin
  select * into k from public.contacts where id = p_contact_id for update;
  if k.id is null then
    raise exception 'Contact introuvable';
  end if;
  perform public.exiger_permission(k.etablissement_id, 'contacts.donnees_personnelles');
  if k.anonymise_le is not null then
    raise exception 'Ce contact est déjà anonymisé';
  end if;
  if coalesce(btrim(p_motif), '') = '' then
    raise exception 'Indiquez la demande (date, canal) qui justifie l''anonymisation';
  end if;
  -- Ce qui est encore en cours avec le contact doit être terminé avant.
  bloquant := case
    when exists (select 1 from public.documents_vente d join public.ventes v on v.id = d.vente_id
                 where d.contact_id = k.id and d.type = 'facture' and d.statut = 'emise' and v.statut = 'validee' and v.total > v.montant_paye)
      then 'une facture reste à payer'
    when exists (select 1 from public.credits_client where contact_id = k.id and statut = 'disponible')
      then 'un crédit client est disponible'
    when exists (select 1 from public.abonnements where contact_id = k.id and statut in ('actif', 'suspendu'))
      then 'un abonnement est en cours'
    when exists (select 1 from public.contrats where contact_id = k.id and statut in ('brouillon', 'actif', 'suspendu'))
      then 'un contrat est en cours'
    when exists (select 1 from public.loc_contrats where contact_id = k.id and statut in ('reserve', 'en_cours'))
      then 'une location est en cours'
  end;
  if bloquant is not null then
    raise exception 'Anonymisation impossible : % (terminez-le d''abord)', bloquant;
  end if;

  perform set_config('app.anonymisation_en_cours', 'oui', true);
  -- Tables qui pointent vers le contact et recopient ses coordonnées.
  for t in
    select c.table_name from information_schema.columns c
    join information_schema.tables tb on tb.table_schema = c.table_schema and tb.table_name = c.table_name and tb.table_type = 'BASE TABLE'
    where c.table_schema = 'public' and c.column_name = 'contact_id' and c.table_name not in ('contacts')
    order by c.table_name
  loop
    affectations := array[]::text[];
    for col in
      select column_name, is_nullable from information_schema.columns
      where table_schema = 'public' and table_name = t.table_name and column_name = any(public.champs_personnels(t.table_name)) and data_type = 'text'
    loop
      affectations := affectations || format('%I = %s', col.column_name, case when col.is_nullable = 'YES' then 'null' else quote_literal(libelle) end);
    end loop;
    if array_length(affectations, 1) > 0 then
      execute format('with m as (update public.%I set %s where contact_id = $1 returning id::text) select array_agg(id) from m',
        t.table_name, array_to_string(affectations, ', ')) into ids using k.id;
      n := coalesce(array_length(ids, 1), 0);
      if n > 0 then
        bilan := bilan || jsonb_build_object(t.table_name, n);
        touchees := touchees || jsonb_build_object('table', t.table_name, 'ids', to_jsonb(ids));
      end if;
    end if;
  end loop;
  update public.contacts set nom = libelle, societe = null, telephone = null, email = null, adresse = null, notes = null,
    identifiant_fiscal = null, actif = false, anonymise_le = now()
  where id = k.id;
  touchees := touchees || jsonb_build_object('table', 'contacts', 'ids', jsonb_build_array(k.id::text));
  -- Le journal d'audit garde les opérations (qui, quand, quoi) mais plus les coordonnées de ces lignes.
  update public.journal_audit j
  set avant = case when j.avant is null then null else j.avant - public.champs_personnels(j.table_nom) end,
      apres = case when j.apres is null then null else j.apres - public.champs_personnels(j.table_nom) end
  from (select x ->> 'table' table_nom, jsonb_array_elements_text(x -> 'ids') ligne_id from jsonb_array_elements(touchees) x) cible
  where j.table_nom = cible.table_nom and j.ligne_id = cible.ligne_id;
  perform set_config('app.anonymisation_en_cours', '', true);
  insert into public.anonymisations (etablissement_id, contact_id, motif, lignes, par)
  values (k.etablissement_id, k.id, btrim(p_motif), bilan, auth.uid());
  return bilan;
end
$$;

-- ---------------------------------------------------------------------------
-- 5. Liens de partage à durée limitée
-- ---------------------------------------------------------------------------
-- Renvoie le jeton une seule fois (à mettre dans l'adresse #/partage/<jeton>) ; seule son empreinte est gardée.
create function public.creer_lien_partage(p_piece_id uuid, p_duree_heures integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  piece public.pieces_jointes%rowtype;
  jeton text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  lien uuid;
  expire timestamptz;
begin
  select * into piece from public.pieces_jointes where id = p_piece_id;
  if piece.id is null or piece.statut <> 'active' or not public.piece_lisible(piece.etablissement_id, piece.objet_type, piece.objet_id, false) then
    raise exception 'Pièce introuvable';
  end if;
  perform public.exiger_permission(piece.etablissement_id, (select permission_ecrire from public.types_pieces_jointes where objet_type = piece.objet_type));
  if piece.confidentiel then
    raise exception 'Un document confidentiel ne se partage pas par lien';
  end if;
  if p_duree_heures is null or p_duree_heures < 1 or p_duree_heures > 720 then
    raise exception 'Durée du lien : entre 1 heure et 30 jours';
  end if;
  expire := now() + make_interval(hours => p_duree_heures);
  insert into public.liens_partage (etablissement_id, piece_jointe_id, jeton_empreinte, expire_le, cree_par)
  values (piece.etablissement_id, piece.id, encode(sha256(convert_to(jeton, 'UTF8')), 'hex'), expire, auth.uid())
  returning id into lien;
  return jsonb_build_object('id', lien, 'jeton', jeton, 'expire_le', expire);
end
$$;

create function public.revoquer_lien_partage(p_lien_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.liens_partage%rowtype;
  piece public.pieces_jointes%rowtype;
begin
  select * into l from public.liens_partage where id = p_lien_id for update;
  select * into piece from public.pieces_jointes where id = l.piece_jointe_id;
  if l.id is null or not public.piece_lisible(piece.etablissement_id, piece.objet_type, piece.objet_id, false) then
    raise exception 'Lien introuvable';
  end if;
  perform public.exiger_permission(piece.etablissement_id, (select permission_ecrire from public.types_pieces_jointes where objet_type = piece.objet_type));
  if l.revoque_le is not null then
    return;
  end if;
  update public.liens_partage set revoque_le = now(), revoque_par = auth.uid() where id = l.id;
end
$$;

-- Ouverture sans compte. Même message pour un lien inconnu, expiré, révoqué ou dont le document est archivé.
create function public.ouvrir_lien_partage(p_jeton text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.liens_partage%rowtype;
  piece public.pieces_jointes%rowtype;
begin
  if p_jeton is null or p_jeton !~ '^[0-9a-f]{64}$' then
    raise exception 'Ce lien n''existe pas ou a expiré';
  end if;
  select * into l from public.liens_partage where jeton_empreinte = encode(sha256(convert_to(p_jeton, 'UTF8')), 'hex') for update;
  select * into piece from public.pieces_jointes where id = l.piece_jointe_id;
  if l.id is null or l.revoque_le is not null or l.expire_le <= now() or piece.statut <> 'active' or piece.confidentiel
     or not exists (select 1 from public.etablissements e join public.clients c on c.id = e.client_id
                    where e.id = l.etablissement_id and e.statut = 'actif' and c.statut = 'actif') then
    raise exception 'Ce lien n''existe pas ou a expiré';
  end if;
  update public.liens_partage set ouvertures = ouvertures + 1, derniere_ouverture = now() where id = l.id;
  return jsonb_build_object(
    'nom', piece.nom, 'type_mime', piece.type_mime, 'taille', piece.taille, 'expire_le', l.expire_le,
    'emetteur', coalesce((select nullif(i.nom_commercial, '') from public.etablissement_identite i where i.etablissement_id = l.etablissement_id),
                         (select nom from public.etablissements where id = l.etablissement_id)),
    'contenu', (select contenu from public.fichiers where id = piece.fichier_id)
  );
end
$$;

-- ---------------------------------------------------------------------------
-- 6. Droits d'exécution
-- ---------------------------------------------------------------------------
do $$
declare signature text;
begin
  foreach signature in array array[
    'public.exporter_donnees_contact(uuid)', 'public.anonymiser_contact(uuid, text)',
    'public.creer_lien_partage(uuid, integer)', 'public.revoquer_lien_partage(uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon', signature);
    execute format('grant execute on function %s to authenticated', signature);
  end loop;
  revoke execute on function public.ouvrir_lien_partage(text) from public;
  grant execute on function public.ouvrir_lien_partage(text) to anon, authenticated;
  revoke execute on function public.champs_personnels(text) from public, anon, authenticated;
  revoke execute on function public.proteger_journal_audit() from public, anon, authenticated;
  revoke execute on function public.figer_destinataire_campagne() from public, anon, authenticated;
end
$$;

notify pgrst, 'reload schema';
