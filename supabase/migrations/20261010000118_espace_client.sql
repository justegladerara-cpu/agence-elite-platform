-- Espace client (lot P, 2026-10-10 ; module « portail_client », Bêta, jamais activé d'office).
-- Le client ouvre son espace par un lien personnel à durée limitée (#/espace-client/<jeton>), sans compte :
-- seule l'empreinte SHA-256 du jeton est gardée ; le lien se révoque ; il meurt si le contact est désactivé ou
-- anonymisé, si le module est désactivé ou l'établissement suspendu.
-- Dans son espace, le client voit ses devis (accepter en écrivant son nom, refuser, demander une modification),
-- ses factures émises et ce qu'il reste à payer, l'avancement des projets que l'équipe a choisi de partager
-- (tâches, livrables à valider ou à faire corriger), échange des messages avec l'équipe et dépose des fichiers.
-- Chaque geste du client est tracé (portail_evenements) : ouverture, document consulté (accusé de réception),
-- réponse à un devis, décision sur un livrable, message, dépôt. L'équipe est prévenue par une notification.

-- ---------------------------------------------------------------------------
-- 1. Catalogue et droits
-- ---------------------------------------------------------------------------
insert into public.modules (id, nom, description, nature, statut, categorie, icone, ordre, version, documentation) values
  ('portail_client', 'Espace client', 'Lien sécurisé pour vos clients : devis à accepter, factures, avancement des projets partagés, messages, dépôt de fichiers.',
   'transversal', 'beta', 'crm', 'globe', 725, '0.1', 'docs/ESPACE_CLIENT.md')
on conflict (id) do nothing;
update public.modules set parametres_schema = '[
  {"cle": "duree_jours", "libelle": "Durée proposée pour un lien d''accès (jours)", "type": "nombre", "defaut": 30},
  {"cle": "depot_fichiers", "libelle": "Le client peut déposer des fichiers", "type": "booleen", "defaut": true},
  {"cle": "message_accueil", "libelle": "Message d''accueil affiché au client", "type": "texte", "defaut": ""}
]'::jsonb where id = 'portail_client';
insert into public.module_dependances (module_id, depend_de) values ('portail_client', 'contacts')
on conflict do nothing;
insert into public.solution_modules (solution_id, module_id, par_defaut)
select s.id, 'portail_client', false from public.solutions s
on conflict (solution_id, module_id) do nothing;

insert into public.permissions (id, module_id, description) values
  ('portail_client.lire', 'portail_client', 'Voir les accès des clients, leurs messages, dépôts et réponses'),
  ('portail_client.gerer', 'portail_client', 'Créer et révoquer les liens d''accès, répondre aux clients, partager un projet')
on conflict (id) do nothing;
insert into public.role_permissions (role_id, permission_id)
select r, p from unnest(array['gerant', 'responsable', 'commercial']) r
cross join unnest(array['portail_client.lire', 'portail_client.gerer']) p
where exists (select 1 from public.roles where id = r)
on conflict do nothing;
insert into public.role_permissions (role_id, permission_id)
select r, 'portail_client.lire' from unnest(array['collaborateur', 'lecteur']) r
where exists (select 1 from public.roles where id = r)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 2. Tables
-- ---------------------------------------------------------------------------
alter table public.projets add column partage_client boolean not null default false;

create table public.portail_acces (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  contact_id uuid not null references public.contacts(id) on delete restrict,
  libelle text check (libelle is null or length(libelle) <= 80),
  jeton_empreinte text not null unique check (jeton_empreinte ~ '^[0-9a-f]{64}$'),
  expire_le timestamptz not null,
  revoque_le timestamptz,
  revoque_par uuid references auth.users(id) on delete restrict,
  ouvertures integer not null default 0 check (ouvertures >= 0),
  derniere_ouverture timestamptz,
  cree_par uuid not null references auth.users(id) on delete restrict,
  cree_le timestamptz not null default now(),
  unique (id, etablissement_id),
  check (expire_le > cree_le)
);
create index portail_acces_contact_idx on public.portail_acces(contact_id);
create index portail_acces_etablissement_idx on public.portail_acces(etablissement_id, cree_le desc);

create table public.portail_evenements (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  contact_id uuid not null references public.contacts(id) on delete restrict,
  acces_id uuid not null,
  type text not null check (type in ('ouverture', 'document_vu', 'devis_accepte', 'devis_refuse', 'devis_modification',
                                     'livrable_valide', 'livrable_a_corriger', 'message', 'depot')),
  objet_type text check (objet_type in ('document_vente', 'projet', 'projet_livrable')),
  objet_id uuid,
  nom_signataire text check (nom_signataire is null or length(nom_signataire) <= 120),
  note text check (note is null or length(note) <= 2000),
  cree_le timestamptz not null default now(),
  foreign key (acces_id, etablissement_id) references public.portail_acces(id, etablissement_id) on delete restrict
);
create index portail_evenements_contact_idx on public.portail_evenements(contact_id, cree_le desc);
create index portail_evenements_etablissement_idx on public.portail_evenements(etablissement_id, type, cree_le desc);
create index portail_evenements_objet_idx on public.portail_evenements(objet_id) where objet_id is not null;

create table public.portail_messages (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  contact_id uuid not null references public.contacts(id) on delete restrict,
  auteur text not null check (auteur in ('client', 'equipe')),
  auteur_id uuid references auth.users(id) on delete restrict,
  acces_id uuid,
  objet_type text check (objet_type in ('document_vente', 'projet')),
  objet_id uuid,
  texte text not null check (btrim(texte) <> '' and length(texte) <= 2000),
  lu_le timestamptz,
  lu_par uuid references auth.users(id) on delete restrict,
  cree_le timestamptz not null default now(),
  check ((auteur = 'client') = (acces_id is not null)),
  check ((auteur = 'equipe') = (auteur_id is not null)),
  check ((objet_type is null) = (objet_id is null)),
  foreign key (acces_id, etablissement_id) references public.portail_acces(id, etablissement_id) on delete restrict
);
create index portail_messages_contact_idx on public.portail_messages(contact_id, cree_le);
create index portail_messages_non_lus_idx on public.portail_messages(etablissement_id) where auteur = 'client' and lu_le is null;

create table public.portail_depots (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  contact_id uuid not null references public.contacts(id) on delete restrict,
  acces_id uuid not null,
  nom text not null check (length(btrim(nom)) between 1 and 160 and nom !~ '[<>/\\]'),
  type_mime text not null,
  taille integer not null check (taille > 0),
  note text check (note is null or length(note) <= 500),
  contenu text check (contenu is null or (
    length(contenu) <= 4200000
    and contenu ~ '^data:(image/(png|jpeg|gif|webp)|application/pdf|text/(plain|csv)|application/msword|application/vnd\.ms-excel|application/vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|spreadsheetml\.sheet|presentationml\.presentation));base64,[A-Za-z0-9+/=]+$'
  )),
  statut text not null default 'recu' check (statut in ('recu', 'traite')),
  traite_par uuid references auth.users(id) on delete restrict,
  traite_le timestamptz,
  cree_le timestamptz not null default now(),
  check ((statut = 'traite') = (traite_le is not null)),
  foreign key (acces_id, etablissement_id) references public.portail_acces(id, etablissement_id) on delete restrict
);
create index portail_depots_contact_idx on public.portail_depots(contact_id, cree_le desc);
create index portail_depots_recus_idx on public.portail_depots(etablissement_id) where statut = 'recu';

-- Seuls les champs prévus évoluent ; l'anonymisation d'un contact (fonction dédiée) peut effacer le texte.
create function public.proteger_portail()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  modifiables text[] := case tg_table_name
    when 'portail_acces' then array['revoque_le', 'revoque_par', 'ouvertures', 'derniere_ouverture']
    when 'portail_messages' then array['lu_le', 'lu_par']
    when 'portail_depots' then array['statut', 'traite_par', 'traite_le']
    else array[]::text[] end;
begin
  if current_setting('app.anonymisation_en_cours', true) = 'oui' then
    return new;
  end if;
  if (to_jsonb(new) - modifiables) is distinct from (to_jsonb(old) - modifiables) then
    raise exception 'Cette donnée de l''espace client ne se modifie pas';
  end if;
  return new;
end
$$;

do $$
declare
  nom_table text;
begin
  foreach nom_table in array array['portail_acces', 'portail_evenements', 'portail_messages', 'portail_depots'] loop
    execute format('create trigger %I_protege before update on public.%I for each row execute function public.proteger_portail()', nom_table, nom_table);
    execute format('create trigger %I_sans_suppression before delete on public.%I for each row execute function public.refuser_suppression()', nom_table, nom_table);
    execute format('create trigger %I_verrou_etablissement before update on public.%I for each row execute function public.verrouiller_etablissement_id()', nom_table, nom_table);
    execute format('alter table public.%I enable row level security', nom_table);
    execute format('create policy lecture on public.%I for select to authenticated using (public.lecture_autorisee(etablissement_id, ''portail_client.lire''))', nom_table);
  end loop;
end
$$;
create trigger portail_acces_audit after insert or update or delete on public.portail_acces
for each row execute function public.journaliser_modification();
-- Le contenu des fichiers déposés ne se lit que par telecharger_depot_portail.
revoke select on public.portail_depots from anon, authenticated;
grant select (id, etablissement_id, contact_id, acces_id, nom, type_mime, taille, note, statut, traite_par, traite_le, cree_le)
  on public.portail_depots to authenticated;
-- Seule l'empreinte du jeton est gardée ; elle ne sert à rien côté interface.
revoke select on public.portail_acces from anon, authenticated;
grant select (id, etablissement_id, contact_id, libelle, expire_le, revoque_le, revoque_par, ouvertures, derniere_ouverture, cree_par, cree_le)
  on public.portail_acces to authenticated;

-- Données personnelles (lot F) : textes écrits par le client effacés à l'anonymisation du contact.
create or replace function public.champs_personnels(p_table text)
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
    when 'portail_messages' then array['texte']
    when 'portail_evenements' then array['nom_signataire', 'note']
    when 'portail_depots' then array['nom', 'note', 'contenu']
    when 'portail_acces' then array['libelle']
    else array[]::text[] end
$$;

-- ---------------------------------------------------------------------------
-- 3. Côté équipe
-- ---------------------------------------------------------------------------
create function public.creer_acces_portail(p_etablissement_id uuid, p_contact_id uuid, p_libelle text default null, p_jours integer default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  k public.contacts%rowtype;
  jeton text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  jours integer;
  expire timestamptz;
  v_id uuid;
begin
  perform public.exiger_permission(p_etablissement_id, 'portail_client.gerer');
  select * into k from public.contacts where id = p_contact_id and etablissement_id = p_etablissement_id;
  if k.id is null then
    raise exception 'Contact introuvable';
  end if;
  if not k.actif or k.anonymise_le is not null or k.type = 'fournisseur' then
    raise exception 'L''espace client s''ouvre pour un client ou un prospect actif';
  end if;
  jours := coalesce(p_jours, (public.parametre_module(p_etablissement_id, 'portail_client', 'duree_jours') #>> '{}')::integer, 30);
  if jours < 1 or jours > 365 then
    raise exception 'Durée de l''accès : entre 1 et 365 jours';
  end if;
  expire := now() + make_interval(days => jours);
  insert into public.portail_acces (etablissement_id, contact_id, libelle, jeton_empreinte, expire_le, cree_par)
  values (p_etablissement_id, k.id, left(nullif(btrim(p_libelle), ''), 80), encode(sha256(convert_to(jeton, 'UTF8')), 'hex'), expire, auth.uid())
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'jeton', jeton, 'expire_le', expire);
end
$$;

create function public.revoquer_acces_portail(p_acces_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.portail_acces%rowtype;
begin
  select * into a from public.portail_acces where id = p_acces_id for update;
  if a.id is null then
    raise exception 'Accès introuvable';
  end if;
  perform public.exiger_permission(a.etablissement_id, 'portail_client.gerer');
  if a.revoque_le is null then
    update public.portail_acces set revoque_le = now(), revoque_par = auth.uid() where id = a.id;
  end if;
end
$$;

-- Partager (ou non) un projet dans l'espace de son client : nom, avancement, tâches, livrables.
create function public.partager_projet_client(p_projet_id uuid, p_partage boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  pr public.projets%rowtype;
begin
  select * into pr from public.projets where id = p_projet_id for update;
  if pr.id is null then
    raise exception 'Projet introuvable';
  end if;
  perform public.exiger_permission(pr.etablissement_id, 'projets.gerer');
  perform public.exiger_permission(pr.etablissement_id, 'portail_client.gerer');
  if p_partage and pr.contact_id is null then
    raise exception 'Ce projet n''a pas de client';
  end if;
  update public.projets set partage_client = coalesce(p_partage, false) where id = pr.id;
end
$$;

create function public.repondre_client_portail(p_etablissement_id uuid, p_contact_id uuid, p_texte text, p_objet_type text default null, p_objet_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform public.exiger_permission(p_etablissement_id, 'portail_client.gerer');
  if not exists (select 1 from public.contacts where id = p_contact_id and etablissement_id = p_etablissement_id and anonymise_le is null) then
    raise exception 'Contact introuvable';
  end if;
  if coalesce(btrim(p_texte), '') = '' or length(p_texte) > 2000 then
    raise exception 'Message vide ou trop long (2 000 caractères au plus)';
  end if;
  if (p_objet_type is null) <> (p_objet_id is null) or (p_objet_type is not null and p_objet_type not in ('document_vente', 'projet')) then
    raise exception 'Sujet du message inconnu';
  end if;
  if p_objet_type = 'document_vente' and not exists (select 1 from public.documents_vente where id = p_objet_id and contact_id = p_contact_id) then
    raise exception 'Document inconnu pour ce client';
  end if;
  if p_objet_type = 'projet' and not exists (select 1 from public.projets where id = p_objet_id and contact_id = p_contact_id) then
    raise exception 'Projet inconnu pour ce client';
  end if;
  update public.portail_messages set lu_le = now(), lu_par = auth.uid()
  where etablissement_id = p_etablissement_id and contact_id = p_contact_id and auteur = 'client' and lu_le is null;
  insert into public.portail_messages (etablissement_id, contact_id, auteur, auteur_id, objet_type, objet_id, texte)
  values (p_etablissement_id, p_contact_id, 'equipe', auth.uid(), p_objet_type, p_objet_id, btrim(p_texte))
  returning id into v_id;
  return v_id;
end
$$;

create function public.marquer_messages_portail_lus(p_etablissement_id uuid, p_contact_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  perform public.exiger_permission(p_etablissement_id, 'portail_client.lire');
  update public.portail_messages set lu_le = now(), lu_par = auth.uid()
  where etablissement_id = p_etablissement_id and contact_id = p_contact_id and auteur = 'client' and lu_le is null;
  get diagnostics n = row_count;
  return n;
end
$$;

create function public.telecharger_depot_portail(p_depot_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.portail_depots%rowtype;
begin
  select * into d from public.portail_depots where id = p_depot_id;
  if d.id is null or not public.lecture_autorisee(d.etablissement_id, 'portail_client.lire') then
    raise exception 'Fichier introuvable';
  end if;
  if d.contenu is null then
    raise exception 'Ce fichier a été effacé';
  end if;
  return jsonb_build_object('nom', d.nom, 'type_mime', d.type_mime, 'contenu', d.contenu);
end
$$;

create function public.traiter_depot_portail(p_depot_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.portail_depots%rowtype;
begin
  select * into d from public.portail_depots where id = p_depot_id for update;
  if d.id is null then
    raise exception 'Fichier introuvable';
  end if;
  perform public.exiger_permission(d.etablissement_id, 'portail_client.gerer');
  if d.statut = 'recu' then
    update public.portail_depots set statut = 'traite', traite_par = auth.uid(), traite_le = now() where id = d.id;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 4. Côté client (sans compte, par le jeton du lien)
-- ---------------------------------------------------------------------------
-- Accès valide et verrouillé, sinon un message unique qui ne dit pas pourquoi (interne).
create function public.portail_acces_valide(p_jeton text)
returns public.portail_acces
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.portail_acces%rowtype;
begin
  if p_jeton is null or p_jeton !~ '^[0-9a-f]{64}$' then
    raise exception 'Ce lien n''existe pas ou a expiré';
  end if;
  select * into a from public.portail_acces where jeton_empreinte = encode(sha256(convert_to(p_jeton, 'UTF8')), 'hex') for update;
  if a.id is null or a.revoque_le is not null or a.expire_le <= now()
     or not public.module_actif(a.etablissement_id, 'portail_client')
     or not exists (select 1 from public.contacts k where k.id = a.contact_id and k.actif and k.anonymise_le is null)
     or not exists (select 1 from public.etablissements e join public.clients c on c.id = e.client_id
                    where e.id = a.etablissement_id and e.statut = 'actif' and c.statut = 'actif') then
    raise exception 'Ce lien n''existe pas ou a expiré';
  end if;
  return a;
end
$$;

-- Limite de gestes par lien et par 24 heures (contre les abus d'un lien qui aurait fuité, interne).
create function public.portail_limiter(p_acces_id uuid, p_type text, p_maximum integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.portail_evenements where acces_id = p_acces_id and type = p_type and cree_le > now() - interval '24 hours') >= p_maximum then
    raise exception 'Trop de demandes aujourd''hui depuis ce lien : réessayez demain ou contactez-nous directement';
  end if;
end
$$;

create function public.portail_tracer(a public.portail_acces, p_type text, p_objet_type text default null, p_objet_id uuid default null,
  p_nom text default null, p_note text default null)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.portail_evenements (etablissement_id, contact_id, acces_id, type, objet_type, objet_id, nom_signataire, note)
  values (a.etablissement_id, a.contact_id, a.id, p_type, p_objet_type, p_objet_id, left(nullif(btrim(p_nom), ''), 120), left(nullif(btrim(p_note), ''), 2000))
$$;

-- Devis et factures que le client peut voir : devis déjà envoyés, factures et avoirs émis (interne).
create function public.portail_document_visible(a public.portail_acces, p_document_id uuid)
returns public.documents_vente
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  d public.documents_vente%rowtype;
begin
  select * into d from public.documents_vente where id = p_document_id;
  if d.id is null or d.etablissement_id <> a.etablissement_id or d.contact_id <> a.contact_id
     or not public.module_actif(a.etablissement_id, 'facturation')
     or not ((d.type = 'devis' and d.statut in ('envoye', 'accepte', 'refuse', 'converti')) or (d.type in ('facture', 'avoir') and d.statut = 'emise')) then
    raise exception 'Document introuvable';
  end if;
  return d;
end
$$;

create function public.portail_ouvrir(p_jeton text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.portail_acces%rowtype := public.portail_acces_valide(p_jeton);
  k public.contacts%rowtype;
  v_facturation boolean := public.module_actif(a.etablissement_id, 'facturation');
  v_projets boolean := public.module_actif(a.etablissement_id, 'projets');
begin
  select * into k from public.contacts where id = a.contact_id;
  if a.derniere_ouverture is null or a.derniere_ouverture < now() - interval '1 hour' then
    perform public.portail_tracer(a, 'ouverture');
  end if;
  update public.portail_acces set ouvertures = ouvertures + 1, derniere_ouverture = now() where id = a.id;
  return jsonb_build_object(
    'emetteur', (select jsonb_build_object(
        'nom', coalesce(nullif(i.nom_commercial, ''), e.nom), 'logo_url', i.logo_url, 'couleur', i.couleur_principale,
        'telephone', i.telephone, 'email', i.email, 'adresse', i.adresse, 'devise', e.devise)
      from public.etablissements e left join public.etablissement_identite i on i.etablissement_id = e.id where e.id = a.etablissement_id),
    'message_accueil', nullif(public.parametre_module(a.etablissement_id, 'portail_client', 'message_accueil') #>> '{}', ''),
    'depot_fichiers', coalesce((public.parametre_module(a.etablissement_id, 'portail_client', 'depot_fichiers') #>> '{}')::boolean, true),
    'contact', jsonb_build_object('nom', k.nom, 'societe', k.societe),
    'expire_le', a.expire_le,
    'documents', case when v_facturation then (
      select coalesce(jsonb_agg(jsonb_build_object(
          'id', d.id, 'type', d.type, 'numero', d.numero, 'statut', d.statut, 'date_document', d.date_document, 'echeance', d.echeance,
          'objet', d.objet, 'notes', d.notes, 'conditions', d.conditions, 'version', d.version,
          'total_ht', d.total_ht, 'total_tva', d.total_tva, 'total_ttc', d.total_ttc,
          'reste', case when d.type = 'facture' and v.statut = 'validee' then v.total - v.montant_paye end,
          'vu_le', (select min(x.cree_le) from public.portail_evenements x where x.contact_id = a.contact_id and x.type = 'document_vu' and x.objet_id = d.id),
          'reponse', (select jsonb_build_object('type', x.type, 'nom', x.nom_signataire, 'le', x.cree_le) from public.portail_evenements x
                      where x.contact_id = a.contact_id and x.objet_id = d.id and x.type in ('devis_accepte', 'devis_refuse', 'devis_modification')
                      order by x.cree_le desc limit 1),
          'lignes', (select coalesce(jsonb_agg(jsonb_build_object('libelle', l.libelle, 'description', l.description, 'quantite', l.quantite,
                       'unite', l.unite, 'prix_unitaire', l.prix_unitaire, 'remise', l.remise, 'taux_tva', l.taux_tva, 'total_ttc', l.total_ttc,
                       'optionnelle', l.optionnelle, 'retenue', l.retenue) order by l.ordre), '[]'::jsonb)
                     from public.lignes_document_vente l where l.document_id = d.id),
          'pieces', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'nom', p.nom, 'taille', p.taille) order by p.ajoute_le), '[]'::jsonb)
                     from public.pieces_jointes p where p.objet_type = 'document_vente' and p.objet_id = d.id and p.statut = 'active' and not p.confidentiel)
        ) order by d.date_document desc, d.numero desc), '[]'::jsonb)
      from (select * from public.documents_vente x
            where x.etablissement_id = a.etablissement_id and x.contact_id = a.contact_id
              and ((x.type = 'devis' and x.statut in ('envoye', 'accepte', 'refuse', 'converti')) or (x.type in ('facture', 'avoir') and x.statut = 'emise'))
            order by x.date_document desc limit 100) d
      left join public.ventes v on v.id = d.vente_id) end,
    'projets', case when v_projets then (
      select coalesce(jsonb_agg(jsonb_build_object(
          'id', p.id, 'numero', p.numero, 'nom', p.nom, 'statut', p.statut, 'date_debut', p.date_debut, 'date_fin_prevue', p.date_fin_prevue,
          'avancement', (select case when count(*) filter (where t.statut <> 'annulee') = 0 then 0
                                     else round(count(*) filter (where t.statut = 'terminee') * 100.0 / count(*) filter (where t.statut <> 'annulee')) end
                         from public.projet_taches t where t.projet_id = p.id),
          'taches', (select coalesce(jsonb_agg(jsonb_build_object('titre', t.titre, 'statut', t.statut, 'echeance', t.echeance)
                       order by t.statut = 'terminee', t.echeance nulls last, t.ordre), '[]'::jsonb)
                     from public.projet_taches t where t.projet_id = p.id and t.statut <> 'annulee'),
          'livrables', (select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'titre', l.titre, 'description', l.description, 'statut', l.statut,
                          'version', l.version,
                          'note', (select lv.note from public.projet_livrable_versions lv where lv.livrable_id = l.id and lv.version = l.version))
                        order by l.cree_le), '[]'::jsonb)
                        from public.projet_livrables l where l.projet_id = p.id and l.statut in ('soumis', 'valide', 'a_corriger'))
        ) order by p.statut = 'termine', p.cree_le desc), '[]'::jsonb)
      from public.projets p
      where p.etablissement_id = a.etablissement_id and p.contact_id = a.contact_id and p.partage_client and p.statut <> 'annule') end,
    'messages', (select coalesce(jsonb_agg(jsonb_build_object('auteur', m.auteur, 'texte', m.texte, 'cree_le', m.cree_le,
                   'objet_type', m.objet_type, 'objet_id', m.objet_id) order by m.cree_le), '[]'::jsonb)
                 from (select * from public.portail_messages x where x.contact_id = a.contact_id order by x.cree_le desc limit 100) m),
    'depots', (select coalesce(jsonb_agg(jsonb_build_object('nom', d.nom, 'taille', d.taille, 'cree_le', d.cree_le, 'statut', d.statut)
                 order by d.cree_le desc), '[]'::jsonb)
               from (select * from public.portail_depots x where x.contact_id = a.contact_id order by x.cree_le desc limit 50) d)
  );
end
$$;

-- Le client a ouvert un document : accusé de réception (une fois par document et par lien).
create function public.portail_document_vu(p_jeton text, p_document_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.portail_acces%rowtype := public.portail_acces_valide(p_jeton);
  d public.documents_vente%rowtype := public.portail_document_visible(a, p_document_id);
begin
  if not exists (select 1 from public.portail_evenements where acces_id = a.id and type = 'document_vu' and objet_id = d.id) then
    perform public.portail_tracer(a, 'document_vu', 'document_vente', d.id);
  end if;
end
$$;

-- Réponse à un devis envoyé : accepter (nom écrit obligatoire), refuser, ou demander une modification.
create function public.portail_repondre_devis(p_jeton text, p_document_id uuid, p_reponse text, p_nom text default null, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.portail_acces%rowtype := public.portail_acces_valide(p_jeton);
  d public.documents_vente%rowtype := public.portail_document_visible(a, p_document_id);
  k public.contacts%rowtype;
  v_titre text;
begin
  if d.type <> 'devis' then
    raise exception 'Document introuvable';
  end if;
  if p_reponse not in ('accepte', 'refuse', 'modification') then
    raise exception 'Réponse inconnue';
  end if;
  if d.statut <> 'envoye' then
    raise exception 'Ce devis a déjà reçu une réponse';
  end if;
  perform public.portail_limiter(a.id, 'devis_' || p_reponse, 20);
  if p_reponse = 'accepte' and length(coalesce(btrim(p_nom), '')) < 2 then
    raise exception 'Écrivez votre nom pour accepter le devis';
  end if;
  if p_reponse = 'modification' and coalesce(btrim(p_note), '') = '' then
    raise exception 'Dites ce qu''il faut modifier';
  end if;
  if length(coalesce(p_note, '')) > 2000 then
    raise exception 'Commentaire trop long (2 000 caractères au plus)';
  end if;
  select * into k from public.contacts where id = a.contact_id;
  if p_reponse = 'accepte' then
    update public.documents_vente set statut = 'accepte' where id = d.id;
    perform public.crm_synchroniser_devis(d.id, 'gagnee');
    v_titre := 'Devis accepté en ligne : ' || d.numero;
  elsif p_reponse = 'refuse' then
    update public.documents_vente set statut = 'refuse' where id = d.id;
    perform public.crm_synchroniser_devis(d.id, 'perdue');
    v_titre := 'Devis refusé en ligne : ' || d.numero;
  else
    v_titre := 'Modification demandée : ' || d.numero;
  end if;
  perform public.portail_tracer(a, 'devis_' || p_reponse, 'document_vente', d.id, p_nom, p_note);
  if coalesce(btrim(p_note), '') <> '' then
    insert into public.portail_messages (etablissement_id, contact_id, auteur, acces_id, objet_type, objet_id, texte)
    values (a.etablissement_id, a.contact_id, 'client', a.id, 'document_vente', d.id, left(btrim(p_note), 2000));
  end if;
  perform public.notifier_permission(a.etablissement_id, 'facturation.gerer', 'portail.devis', v_titre,
    coalesce(nullif(k.societe, ''), k.nom) || coalesce(' · ' || nullif(btrim(p_nom), ''), ''), 'factures/' || d.id);
end
$$;

-- Décision du client sur un livrable soumis d'un projet partagé (même effet que decider_livrable).
create function public.portail_decider_livrable(p_jeton text, p_livrable_id uuid, p_decision text, p_nom text default null, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.portail_acces%rowtype := public.portail_acces_valide(p_jeton);
  l public.projet_livrables%rowtype;
  pr public.projets%rowtype;
begin
  select * into l from public.projet_livrables where id = p_livrable_id for update;
  select * into pr from public.projets where id = l.projet_id;
  if l.id is null or pr.etablissement_id <> a.etablissement_id or pr.contact_id is distinct from a.contact_id
     or not pr.partage_client or not public.module_actif(a.etablissement_id, 'projets') then
    raise exception 'Livrable introuvable';
  end if;
  if l.statut <> 'soumis' then
    raise exception 'Ce livrable n''attend pas de décision';
  end if;
  if p_decision not in ('valide', 'a_corriger') then
    raise exception 'Décision inconnue';
  end if;
  if length(coalesce(btrim(p_nom), '')) < 2 then
    raise exception 'Écrivez votre nom';
  end if;
  if p_decision = 'a_corriger' and coalesce(btrim(p_note), '') = '' then
    raise exception 'Dites ce qu''il faut corriger';
  end if;
  perform public.portail_limiter(a.id, 'livrable_' || p_decision, 20);
  update public.projet_livrable_versions set decision = p_decision, decision_note = left(nullif(btrim(p_note), ''), 2000),
    decide_par = null, decide_par_nom = left('Client : ' || btrim(p_nom), 120), decide_le = now()
  where livrable_id = l.id and version = l.version;
  update public.projet_livrables set statut = p_decision where id = l.id;
  if p_decision = 'a_corriger' then
    insert into public.projet_taches (etablissement_id, projet_id, titre, description, priorite, assigne_a, ordre, livrable_id, cree_par)
    values (l.etablissement_id, l.projet_id, left(format('Correction : %s (V%s)', l.titre, l.version), 200), left(btrim(p_note), 4000), 'haute',
            pr.responsable_id, coalesce((select max(ordre) + 1 from public.projet_taches where projet_id = l.projet_id), 1), l.id, pr.responsable_id);
  end if;
  perform public.portail_tracer(a, 'livrable_' || p_decision, 'projet_livrable', l.id, p_nom, p_note);
  perform public.notifier(pr.responsable_id, l.etablissement_id, 'portail.livrable',
    case p_decision when 'valide' then 'Livrable validé par le client : ' else 'Correction demandée par le client : ' end || l.titre,
    pr.numero || ' · ' || pr.nom, 'projets/' || pr.id);
end
$$;

create function public.portail_envoyer_message(p_jeton text, p_texte text, p_objet_type text default null, p_objet_id uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.portail_acces%rowtype := public.portail_acces_valide(p_jeton);
  k public.contacts%rowtype;
begin
  if coalesce(btrim(p_texte), '') = '' or length(p_texte) > 2000 then
    raise exception 'Message vide ou trop long (2 000 caractères au plus)';
  end if;
  if (p_objet_type is null) <> (p_objet_id is null) or (p_objet_type is not null and p_objet_type not in ('document_vente', 'projet')) then
    raise exception 'Sujet du message inconnu';
  end if;
  if p_objet_type = 'document_vente' then
    perform public.portail_document_visible(a, p_objet_id);
  elsif p_objet_type = 'projet' and not exists (select 1 from public.projets where id = p_objet_id and contact_id = a.contact_id and partage_client) then
    raise exception 'Projet introuvable';
  end if;
  perform public.portail_limiter(a.id, 'message', 30);
  insert into public.portail_messages (etablissement_id, contact_id, auteur, acces_id, objet_type, objet_id, texte)
  values (a.etablissement_id, a.contact_id, 'client', a.id, p_objet_type, p_objet_id, btrim(p_texte));
  perform public.portail_tracer(a, 'message', p_objet_type, p_objet_id);
  select * into k from public.contacts where id = a.contact_id;
  perform public.notifier_permission(a.etablissement_id, 'portail_client.gerer', 'portail.message',
    'Message de ' || coalesce(nullif(k.societe, ''), k.nom), left(btrim(p_texte), 200), 'espace-client/' || k.id);
end
$$;

create function public.portail_deposer_fichier(p_jeton text, p_nom text, p_contenu text, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.portail_acces%rowtype := public.portail_acces_valide(p_jeton);
  k public.contacts%rowtype;
  v_type text;
  v_taille integer;
begin
  if not coalesce((public.parametre_module(a.etablissement_id, 'portail_client', 'depot_fichiers') #>> '{}')::boolean, true) then
    raise exception 'Le dépôt de fichiers n''est pas ouvert';
  end if;
  if length(coalesce(btrim(p_nom), '')) not between 1 and 160 or p_nom ~ '[<>/\\]' then
    raise exception 'Nom de fichier invalide';
  end if;
  if p_contenu is null or length(p_contenu) > 4200000 then
    raise exception 'Fichier trop lourd (3 Mo au plus)';
  end if;
  v_type := substring(p_contenu from '^data:([a-z0-9.+/-]+);base64,');
  if v_type is null or v_type !~ '^(image/(png|jpeg|gif|webp)|application/pdf|text/(plain|csv)|application/msword|application/vnd\.ms-excel|application/vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|spreadsheetml\.sheet|presentationml\.presentation))$'
     or substring(p_contenu from length(v_type) + 14) !~ '^[A-Za-z0-9+/=]+$' then
    raise exception 'Type de fichier non accepté (images, PDF, texte, Word, Excel, PowerPoint)';
  end if;
  perform public.portail_limiter(a.id, 'depot', 10);
  v_taille := greatest(1, (length(p_contenu) - length(v_type) - 13) * 3 / 4);
  insert into public.portail_depots (etablissement_id, contact_id, acces_id, nom, type_mime, taille, note, contenu)
  values (a.etablissement_id, a.contact_id, a.id, btrim(p_nom), v_type, v_taille, left(nullif(btrim(p_note), ''), 500), p_contenu);
  perform public.portail_tracer(a, 'depot', null, null, null, btrim(p_nom));
  select * into k from public.contacts where id = a.contact_id;
  perform public.notifier_permission(a.etablissement_id, 'portail_client.gerer', 'portail.depot',
    'Fichier déposé par ' || coalesce(nullif(k.societe, ''), k.nom), btrim(p_nom), 'espace-client/' || k.id);
end
$$;

-- Pièce jointe non confidentielle d'un devis ou d'une facture que le client voit.
create function public.portail_telecharger(p_jeton text, p_piece_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.portail_acces%rowtype := public.portail_acces_valide(p_jeton);
  p public.pieces_jointes%rowtype;
begin
  select * into p from public.pieces_jointes where id = p_piece_id;
  if p.id is null or p.objet_type <> 'document_vente' or p.statut <> 'active' or p.confidentiel or p.etablissement_id <> a.etablissement_id then
    raise exception 'Fichier introuvable';
  end if;
  perform public.portail_document_visible(a, p.objet_id);
  return jsonb_build_object('nom', p.nom, 'type_mime', p.type_mime, 'contenu', (select contenu from public.fichiers where id = p.fichier_id));
end
$$;

-- ---------------------------------------------------------------------------
-- 5. Tableau de bord
-- ---------------------------------------------------------------------------
create function public.cockpit_portail(p_etablissement_id uuid, p_du date, p_au date, p_filtres jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  c public.cockpit_ctx;
  v_actifs bigint; v_ouvertures bigint; v_ouvertures_p bigint; v_acceptes bigint; v_acceptes_p bigint; v_premier date; v_comp boolean;
  v_messages bigint; v_depots bigint; v_livrables bigint;
begin
  if not public.lecture_autorisee(p_etablissement_id, 'portail_client.lire') then
    raise exception 'Permission refusée : portail_client.lire' using errcode = '42501';
  end if;
  c := public.cockpit_preparer(p_etablissement_id, p_du, p_au, p_filtres);
  select count(*) into v_actifs from public.portail_acces
  where etablissement_id = p_etablissement_id and revoque_le is null and expire_le > now();
  select count(*) filter (where type = 'ouverture' and (cree_le at time zone c.tz)::date between c.du and c.au),
         count(*) filter (where type = 'ouverture' and (cree_le at time zone c.tz)::date between c.pdu and c.pau),
         count(*) filter (where type = 'devis_accepte' and (cree_le at time zone c.tz)::date between c.du and c.au),
         count(*) filter (where type = 'devis_accepte' and (cree_le at time zone c.tz)::date between c.pdu and c.pau),
         min((cree_le at time zone c.tz)::date)
  into v_ouvertures, v_ouvertures_p, v_acceptes, v_acceptes_p, v_premier
  from public.portail_evenements where etablissement_id = p_etablissement_id;
  v_comp := public.cockpit_comparable(v_ouvertures_p, v_premier, c.pdu);
  select count(*) into v_messages from public.portail_messages where etablissement_id = p_etablissement_id and auteur = 'client' and lu_le is null;
  select count(*) into v_depots from public.portail_depots where etablissement_id = p_etablissement_id and statut = 'recu';
  select count(*) into v_livrables from public.projet_livrables l join public.projets p on p.id = l.projet_id
  where l.etablissement_id = p_etablissement_id and l.statut = 'soumis' and p.partage_client;
  return jsonb_build_object(
    'domaine', 'portail',
    'periode', jsonb_build_object('du', c.du, 'au', c.au, 'du_precedent', c.pdu, 'au_precedent', c.pau, 'comparable', v_comp),
    'kpis', public.cockpit_liste(array[
      public.cockpit_kpi('acces', 'Accès clients actifs', v_actifs, 'nombre', 'espace-client', null, 'Liens non expirés, non révoqués'),
      public.cockpit_kpi('ouvertures', 'Visites des clients', v_ouvertures, 'nombre', 'espace-client', case when v_comp then v_ouvertures_p end, null, null, true),
      public.cockpit_kpi('acceptes', 'Devis acceptés en ligne', v_acceptes, 'nombre', 'espace-client', case when v_comp then v_acceptes_p end)
    ]),
    'attention', public.cockpit_liste(array[
      public.cockpit_alerte('messages', 'alerte', 'Messages de clients non lus', null, v_messages, 'espace-client?filtre=messages'),
      public.cockpit_alerte('depots', 'info', 'Fichiers déposés à traiter', null, v_depots, 'espace-client?filtre=depots'),
      public.cockpit_alerte('livrables', 'info', 'Livrables en attente du client', 'Projets partagés', v_livrables, 'projets')
    ]),
    'graphiques', '[]'::jsonb,
    'listes', '[]'::jsonb,
    'activite', '[]'::jsonb
  );
end
$$;

create or replace function public.cockpit_domaines(p_etablissement_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'titre', d.titre) order by d.ordre), '[]'::jsonb)
  from (values
    (1, 'commerce', 'Commerce', public.lecture_autorisee(p_etablissement_id, 'ventes.lire') and public.module_actif(p_etablissement_id, 'caisse')
        and ((select e.solution_id from public.etablissements e where e.id = p_etablissement_id) = 'commerce'
             or exists (select 1 from public.ventes v where v.etablissement_id = p_etablissement_id and v.origine = 'caisse'))),
    (2, 'restaurant', 'Restaurant', public.lecture_autorisee(p_etablissement_id, 'restaurant_salle.lire')),
    (3, 'hotel', 'Hôtel', public.lecture_autorisee(p_etablissement_id, 'hotel_reservations.lire')),
    (4, 'scolaire', 'Scolaire', public.lecture_autorisee(p_etablissement_id, 'scolaire.lire')),
    (5, 'boutique', 'E-commerce', public.lecture_autorisee(p_etablissement_id, 'ecommerce_boutique.lire')),
    (6, 'livraisons', 'Livraisons', public.lecture_autorisee(p_etablissement_id, 'livraisons.lire')),
    (7, 'location', 'Location', public.lecture_autorisee(p_etablissement_id, 'location.lire')),
    (8, 'facturation', 'Facturation', public.lecture_autorisee(p_etablissement_id, 'facturation.lire')),
    (9, 'contrats', 'Contrats', public.lecture_autorisee(p_etablissement_id, 'contrats.lire')),
    (10, 'tresorerie', 'Trésorerie', public.lecture_autorisee(p_etablissement_id, 'depenses.lire') and public.lecture_autorisee(p_etablissement_id, 'paiements.lire')),
    (11, 'comptabilite', 'Comptabilité', public.lecture_autorisee(p_etablissement_id, 'comptabilite.lire')),
    (12, 'crm', 'CRM', public.lecture_autorisee(p_etablissement_id, 'crm_pipeline.lire')),
    (13, 'marketing', 'Marketing', public.lecture_autorisee(p_etablissement_id, 'marketing.lire')),
    (14, 'achats', 'Achats', public.lecture_autorisee(p_etablissement_id, 'achats.lire')),
    (15, 'production', 'Production', public.lecture_autorisee(p_etablissement_id, 'production.lire')),
    (16, 'rh', 'RH', public.lecture_autorisee(p_etablissement_id, 'rh_employes.lire')),
    (17, 'projets', 'Projets', public.lecture_autorisee(p_etablissement_id, 'projets.lire')),
    (18, 'agenda', 'Agenda', public.lecture_autorisee(p_etablissement_id, 'agenda.lire')),
    (19, 'support', 'Support', public.lecture_autorisee(p_etablissement_id, 'support_tickets.lire')),
    (20, 'abonnements', 'Abonnements', public.lecture_autorisee(p_etablissement_id, 'abonnements.lire')),
    (21, 'fidelite', 'Fidélité', public.lecture_autorisee(p_etablissement_id, 'fidelite.lire')),
    (22, 'siteweb', 'Site web', public.lecture_autorisee(p_etablissement_id, 'site_web.lire')),
    (23, 'portail', 'Espace client', public.lecture_autorisee(p_etablissement_id, 'portail_client.lire'))
  ) as d(ordre, id, titre, visible)
  where d.visible
$$;

-- ---------------------------------------------------------------------------
-- 6. Droits d'exécution
-- ---------------------------------------------------------------------------
revoke execute on function public.proteger_portail() from public, anon, authenticated;
revoke execute on function public.portail_acces_valide(text) from public, anon, authenticated;
revoke execute on function public.portail_limiter(uuid, text, integer) from public, anon, authenticated;
revoke execute on function public.portail_tracer(public.portail_acces, text, text, uuid, text, text) from public, anon, authenticated;
revoke execute on function public.portail_document_visible(public.portail_acces, uuid) from public, anon, authenticated;
revoke execute on function public.creer_acces_portail(uuid, uuid, text, integer) from public, anon;
revoke execute on function public.revoquer_acces_portail(uuid) from public, anon;
revoke execute on function public.partager_projet_client(uuid, boolean) from public, anon;
revoke execute on function public.repondre_client_portail(uuid, uuid, text, text, uuid) from public, anon;
revoke execute on function public.marquer_messages_portail_lus(uuid, uuid) from public, anon;
revoke execute on function public.telecharger_depot_portail(uuid) from public, anon;
revoke execute on function public.traiter_depot_portail(uuid) from public, anon;
revoke execute on function public.cockpit_portail(uuid, date, date, jsonb) from public, anon;
grant execute on function public.creer_acces_portail(uuid, uuid, text, integer) to authenticated;
grant execute on function public.revoquer_acces_portail(uuid) to authenticated;
grant execute on function public.partager_projet_client(uuid, boolean) to authenticated;
grant execute on function public.repondre_client_portail(uuid, uuid, text, text, uuid) to authenticated;
grant execute on function public.marquer_messages_portail_lus(uuid, uuid) to authenticated;
grant execute on function public.telecharger_depot_portail(uuid) to authenticated;
grant execute on function public.traiter_depot_portail(uuid) to authenticated;
grant execute on function public.cockpit_portail(uuid, date, date, jsonb) to authenticated;
do $$
declare
  f text;
begin
  foreach f in array array['portail_ouvrir(text)', 'portail_document_vu(text, uuid)', 'portail_repondre_devis(text, uuid, text, text, text)',
                            'portail_decider_livrable(text, uuid, text, text, text)', 'portail_envoyer_message(text, text, text, uuid)',
                            'portail_deposer_fichier(text, text, text, text)', 'portail_telecharger(text, uuid)'] loop
    execute format('revoke execute on function public.%s from public', f);
    execute format('grant execute on function public.%s to anon, authenticated', f);
  end loop;
end
$$;

notify pgrst, 'reload schema';
