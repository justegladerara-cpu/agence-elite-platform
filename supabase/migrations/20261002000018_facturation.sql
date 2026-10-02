-- Facturation (2026-10-02) : devis, factures, avoirs. Le module « facturation », jusqu'ici « Prévu », devient réel.
-- Principe : une facture émise devient une vente (origine « facture ») avec ses lignes, ses sorties de stock
-- et ses paiements. Chiffre d'affaires, créances des contacts, reçus et tableaux de bord restent uniques.
-- Numérotation sans trou : un brouillon de facture n'a pas de numéro ; il le reçoit à l'émission.
-- Une facture émise ne se modifie jamais : on l'annule par un avoir (motif obligatoire), après annulation
-- de ses paiements. Les devis ne touchent ni au stock ni au chiffre d'affaires.

-- ---------------------------------------------------------------------------
-- 1. Catalogue : permissions, rôles, paramètres
-- ---------------------------------------------------------------------------
update public.modules set
  description = 'Devis, factures numérotées, échéances, paiements, avoirs ; une facture émise devient une vente.',
  documentation = 'docs/FACTURATION.md',
  parametres_schema = '[
    {"cle": "delai_paiement_jours", "libelle": "Délai de paiement des factures (jours)", "type": "nombre", "defaut": 30},
    {"cle": "validite_devis_jours", "libelle": "Validité des devis (jours)", "type": "nombre", "defaut": 30},
    {"cle": "tva_par_defaut", "libelle": "Taux de TVA proposé sur les lignes (%, 0 si non assujetti)", "type": "nombre", "defaut": 0},
    {"cle": "conditions_paiement", "libelle": "Conditions de paiement imprimées", "type": "texte", "defaut": ""},
    {"cle": "mentions_factures", "libelle": "Mentions en bas des devis et factures", "type": "texte", "defaut": ""}
  ]'::jsonb
where id = 'facturation';

insert into public.permissions (id, module_id, description) values
  ('facturation.lire', 'facturation', 'Voir les devis, factures et avoirs'),
  ('facturation.gerer', 'facturation', 'Créer les devis et factures, émettre, convertir, encaisser une facture'),
  ('facturation.annuler', 'facturation', 'Annuler une facture émise par un avoir')
on conflict (id) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r, p from unnest(array['gerant', 'responsable', 'comptable']) r
cross join unnest(array['facturation.lire', 'facturation.gerer', 'facturation.annuler']) p
on conflict do nothing;
insert into public.role_permissions (role_id, permission_id) values
  ('responsable_hub', 'facturation.lire'), ('responsable_hub', 'facturation.gerer'), ('lecteur', 'facturation.lire')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 2. Briques communes réutilisées
-- ---------------------------------------------------------------------------
-- Contacts : raison sociale et identifiant fiscal (factures aux entreprises).
alter table public.contacts add column if not exists societe text check (societe is null or length(societe) <= 120);
alter table public.contacts add column if not exists identifiant_fiscal text check (identifiant_fiscal is null or length(identifiant_fiscal) <= 40);

create or replace function public.enregistrer_contact(p_etablissement_id uuid, p_contact jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  resultat uuid := nullif(p_contact ->> 'id', '')::uuid;
begin
  perform public.exiger_permission(p_etablissement_id, 'contacts.gerer');
  if resultat is null then
    insert into public.contacts(etablissement_id, type, nom, telephone, email, adresse, notes, societe, identifiant_fiscal)
    values (
      p_etablissement_id,
      coalesce(nullif(p_contact ->> 'type', ''), 'client'),
      btrim(p_contact ->> 'nom'),
      nullif(btrim(p_contact ->> 'telephone'), ''),
      nullif(lower(btrim(p_contact ->> 'email')), ''),
      nullif(btrim(p_contact ->> 'adresse'), ''),
      nullif(btrim(p_contact ->> 'notes'), ''),
      nullif(btrim(p_contact ->> 'societe'), ''),
      nullif(upper(btrim(p_contact ->> 'identifiant_fiscal')), '')
    )
    returning id into resultat;
  else
    update public.contacts set
      type = coalesce(nullif(p_contact ->> 'type', ''), type),
      nom = btrim(p_contact ->> 'nom'),
      telephone = nullif(btrim(p_contact ->> 'telephone'), ''),
      email = nullif(lower(btrim(p_contact ->> 'email')), ''),
      adresse = nullif(btrim(p_contact ->> 'adresse'), ''),
      notes = nullif(btrim(p_contact ->> 'notes'), ''),
      societe = case when p_contact ? 'societe' then nullif(btrim(p_contact ->> 'societe'), '') else societe end,
      identifiant_fiscal = case when p_contact ? 'identifiant_fiscal' then nullif(upper(btrim(p_contact ->> 'identifiant_fiscal')), '') else identifiant_fiscal end,
      actif = coalesce((p_contact ->> 'actif')::boolean, actif)
    where id = resultat and etablissement_id = p_etablissement_id;
    if not found then
      raise exception 'Contact introuvable dans cet établissement';
    end if;
  end if;
  return resultat;
end
$$;

-- Ventes : origine de la vente ; lignes libres (prestation sans article) possibles hors caisse.
alter table public.ventes add column if not exists origine text not null default 'caisse'
  check (origine in ('caisse', 'facture', 'boutique', 'restaurant', 'hotel', 'abonnement'));
alter table public.lignes_vente alter column article_id drop not null;
alter table public.lignes_vente add constraint lignes_vente_article_ou_libelle check (article_id is not null or btrim(libelle) <> '');

-- Une vente issue d'une facture s'annule par un avoir, jamais depuis la liste des ventes.
create or replace function public.annuler_vente(p_vente_id uuid, p_motif text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  vente public.ventes%rowtype;
  session_statut text;
begin
  select * into vente from public.ventes where id = p_vente_id for update;
  if vente.id is null then
    raise exception 'Vente introuvable';
  end if;
  perform public.exiger_permission(vente.etablissement_id, 'ventes.annuler');
  perform public.exiger_acces_hub(vente.hub_id);
  if vente.statut = 'annulee' then
    raise exception 'Cette vente est déjà annulée';
  end if;
  if vente.origine <> 'caisse' then
    raise exception 'Cette vente vient d''une facture ou d''un autre module : annulez-la depuis son document (avoir)';
  end if;
  if coalesce(btrim(p_motif), '') = '' then
    raise exception 'Le motif d''annulation est obligatoire';
  end if;
  select statut into session_statut from public.sessions_caisse where id = vente.session_caisse_id for update;
  if session_statut is distinct from 'ouverte' then
    raise exception 'La caisse de cette vente est clôturée : l''annulation n''est plus possible';
  end if;
  if exists (
    select 1 from public.paiements p join public.sessions_caisse s on s.id = p.session_caisse_id
    where p.vente_id = vente.id and p.statut = 'valide' and s.statut <> 'ouverte'
  ) then
    raise exception 'Un paiement de cette vente appartient à une caisse clôturée : l''annulation n''est plus possible';
  end if;

  insert into public.mouvements_stock(etablissement_id, hub_id, article_id, type, quantite, cout_unitaire, motif, vente_id, acteur)
  select vente.etablissement_id, m.hub_id, m.article_id, 'retour_annulation', -m.quantite, m.cout_unitaire,
         'Annulation ' || vente.numero, vente.id, auth.uid()
  from public.mouvements_stock m
  where m.vente_id = vente.id and m.type = 'sortie_vente';

  update public.paiements
  set statut = 'annule', annule_le = now(), annule_par = auth.uid(), motif_annulation = 'Annulation de la vente : ' || btrim(p_motif)
  where vente_id = vente.id and statut = 'valide';

  update public.ventes
  set statut = 'annulee', annulee_le = now(), annulee_par = auth.uid(), motif_annulation = btrim(p_motif),
      montant_paye = 0, statut_paiement = 'impayee'
  where id = vente.id;
end
$$;

-- ---------------------------------------------------------------------------
-- 3. Tables
-- ---------------------------------------------------------------------------
create table public.documents_vente (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  hub_id uuid not null,
  type text not null check (type in ('devis', 'facture', 'avoir')),
  numero text,
  statut text not null default 'brouillon'
    check (statut in ('brouillon', 'envoye', 'accepte', 'refuse', 'converti', 'emise', 'annule')),
  contact_id uuid not null references public.contacts(id) on delete restrict,
  date_document date not null default current_date,
  echeance date,
  objet text check (objet is null or length(objet) <= 200),
  notes text check (notes is null or length(notes) <= 2000),
  conditions text check (conditions is null or length(conditions) <= 1000),
  total_ht numeric(14, 2) not null default 0 check (total_ht >= 0),
  total_tva numeric(14, 2) not null default 0 check (total_tva >= 0),
  total_ttc numeric(14, 2) not null default 0 check (total_ttc >= 0),
  origine_id uuid references public.documents_vente(id) on delete restrict,
  vente_id uuid unique references public.ventes(id) on delete restrict,
  cree_par uuid not null references auth.users(id) on delete restrict,
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  emis_le timestamptz,
  emis_par uuid references auth.users(id) on delete restrict,
  annule_le timestamptz,
  annule_par uuid references auth.users(id) on delete restrict,
  motif_annulation text,
  check (total_ttc = total_ht + total_tva),
  check (type <> 'facture' or statut in ('brouillon', 'emise', 'annule')),
  check (type <> 'avoir' or (statut = 'emise' and origine_id is not null)),
  check (type <> 'devis' or statut in ('brouillon', 'envoye', 'accepte', 'refuse', 'converti', 'annule')),
  check (numero is not null or (type = 'facture' and statut = 'brouillon') or (type = 'facture' and statut = 'annule' and vente_id is null)),
  check (type <> 'facture' or statut = 'brouillon' or statut = 'annule' or vente_id is not null),
  check (statut <> 'annule' or (annule_le is not null and annule_par is not null and btrim(coalesce(motif_annulation, '')) <> '')),
  unique (id, etablissement_id),
  foreign key (hub_id, etablissement_id) references public.hubs(id, etablissement_id) on delete restrict
);
create unique index documents_vente_numero on public.documents_vente(etablissement_id, numero) where numero is not null;
create index documents_vente_etablissement_idx on public.documents_vente(etablissement_id, type, date_document desc);
create index documents_vente_contact_idx on public.documents_vente(contact_id);
create index documents_vente_origine_idx on public.documents_vente(origine_id);

create table public.lignes_document_vente (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null,
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  ordre integer not null default 0,
  article_id uuid references public.articles(id) on delete restrict,
  libelle text not null check (length(btrim(libelle)) between 1 and 200),
  description text check (description is null or length(description) <= 1000),
  quantite numeric(14, 3) not null check (quantite > 0),
  unite text check (unite is null or length(unite) <= 20),
  prix_unitaire numeric(14, 2) not null check (prix_unitaire >= 0),
  remise numeric(14, 2) not null default 0 check (remise >= 0),
  taux_tva numeric(5, 2) not null default 0 check (taux_tva between 0 and 100),
  total_ht numeric(14, 2) not null check (total_ht >= 0),
  total_tva numeric(14, 2) not null check (total_tva >= 0),
  total_ttc numeric(14, 2) not null check (total_ttc >= 0),
  foreign key (document_id, etablissement_id) references public.documents_vente(id, etablissement_id) on delete restrict
);
create index lignes_document_vente_document_idx on public.lignes_document_vente(document_id, ordre);
create index lignes_document_vente_article_idx on public.lignes_document_vente(article_id);

-- Un document figé (émis, converti, refusé, annulé) ne change plus, sauf son passage à « annulé ».
create function public.proteger_document_vente()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  champs text[] := array['statut', 'annule_le', 'annule_par', 'motif_annulation', 'modifie_le'];
begin
  if old.statut in ('annule', 'converti', 'refuse') or (old.type = 'avoir') then
    if to_jsonb(new) - 'modifie_le' is distinct from to_jsonb(old) - 'modifie_le' then
      raise exception 'Ce document est définitif';
    end if;
  elsif old.statut = 'emise' then
    if to_jsonb(new) - champs is distinct from to_jsonb(old) - champs or new.statut not in ('emise', 'annule') then
      raise exception 'Une facture émise ne se modifie pas : annulez-la par un avoir';
    end if;
  end if;
  return new;
end
$$;
create trigger documents_vente_protection before update on public.documents_vente
for each row execute function public.proteger_document_vente();

-- Les lignes ne bougent que tant que le document est modifiable (brouillon, ou devis envoyé).
create function public.proteger_ligne_document()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  doc public.documents_vente%rowtype;
begin
  select * into doc from public.documents_vente where id = coalesce(old.document_id, new.document_id);
  if not (doc.statut = 'brouillon' or (doc.type = 'devis' and doc.statut = 'envoye')) then
    raise exception 'Les lignes d''un document figé ne se modifient pas';
  end if;
  return coalesce(new, old);
end
$$;
create trigger lignes_document_vente_protection before update or delete on public.lignes_document_vente
for each row execute function public.proteger_ligne_document();

do $$
declare
  nom_table text;
begin
  execute 'create trigger documents_vente_modifie_le before update on public.documents_vente for each row execute function public.fixer_modifie_le()';
  execute 'create trigger documents_vente_sans_suppression before delete on public.documents_vente for each row execute function public.refuser_suppression()';
  foreach nom_table in array array['documents_vente', 'lignes_document_vente'] loop
    execute format('create trigger %I_verrou_etablissement before update on public.%I for each row execute function public.verrouiller_etablissement_id()', nom_table, nom_table);
    execute format('create trigger %I_audit after insert or update or delete on public.%I for each row execute function public.journaliser_modification()', nom_table, nom_table);
    execute format('alter table public.%I enable row level security', nom_table);
  end loop;
end
$$;

create policy lecture on public.documents_vente for select to authenticated
using (public.lecture_autorisee(etablissement_id, 'facturation.lire') and public.lecture_hub(etablissement_id, hub_id));
create policy lecture on public.lignes_document_vente for select to authenticated
using (public.lecture_autorisee(etablissement_id, 'facturation.lire')
  and exists (select 1 from public.documents_vente d where d.id = document_id));

insert into public.types_pieces_jointes (objet_type, table_nom, module_id, permission_lire, permission_ecrire, libelle)
values ('document_vente', 'documents_vente', 'facturation', 'facturation.lire', 'facturation.gerer', 'Devis ou facture')
on conflict (objet_type) do nothing;

-- ---------------------------------------------------------------------------
-- 4. Fonctions
-- ---------------------------------------------------------------------------
-- Hub par défaut d'un document : celui demandé (s'il est permis), sinon le premier Hub autorisé.
create function public.hub_document(p_etablissement_id uuid, p_hub_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  resultat uuid := p_hub_id;
begin
  if resultat is null then
    select h.id into resultat from public.hubs h
    where h.etablissement_id = p_etablissement_id and h.actif and public.acces_hub(h.id)
    order by h.principal desc, h.cree_le limit 1;
  end if;
  if resultat is null or not exists (select 1 from public.hubs where id = resultat and etablissement_id = p_etablissement_id and actif) then
    raise exception 'Hub introuvable dans cet établissement';
  end if;
  perform public.exiger_acces_hub(resultat);
  return resultat;
end
$$;

-- Recalcule les totaux d'un document à partir de ses lignes.
create function public.recalculer_document_vente(p_document_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.documents_vente d set
    total_ht = t.ht, total_tva = t.tva, total_ttc = t.ht + t.tva
  from (select coalesce(sum(total_ht), 0) ht, coalesce(sum(total_tva), 0) tva
        from public.lignes_document_vente where document_id = p_document_id) t
  where d.id = p_document_id
$$;

-- Crée ou met à jour un devis ou une facture en brouillon, avec ses lignes (remplacées en entier).
-- p_document : { id?, type: 'devis'|'facture', contact_id, hub_id?, date_document?, echeance?, objet?, notes?, conditions?,
--                lignes: [{ article_id?, libelle, description?, quantite, unite?, prix_unitaire, remise?, taux_tva? }] }
create function public.enregistrer_document_vente(p_etablissement_id uuid, p_document jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  resultat uuid := nullif(p_document ->> 'id', '')::uuid;
  existant public.documents_vente%rowtype;
  v_type text := coalesce(nullif(p_document ->> 'type', ''), 'facture');
  v_contact uuid := nullif(p_document ->> 'contact_id', '')::uuid;
  v_hub uuid;
  v_date date := coalesce(nullif(p_document ->> 'date_document', '')::date, public.date_locale(p_etablissement_id));
  v_echeance date := nullif(p_document ->> 'echeance', '')::date;
  v_lignes jsonb := coalesce(p_document -> 'lignes', '[]'::jsonb);
  l jsonb;
  v_article public.articles%rowtype;
  v_quantite numeric;
  v_prix numeric;
  v_remise numeric;
  v_taux numeric;
  v_ht numeric;
  v_tva numeric;
  v_rang integer := 0;
  delai integer;
begin
  perform public.exiger_permission(p_etablissement_id, 'facturation.gerer');
  if v_type not in ('devis', 'facture') then
    raise exception 'Type de document invalide';
  end if;
  if not exists (select 1 from public.contacts where id = v_contact and etablissement_id = p_etablissement_id and type <> 'fournisseur') then
    raise exception 'Choisissez un client de cet établissement';
  end if;
  if jsonb_typeof(v_lignes) <> 'array' or jsonb_array_length(v_lignes) = 0 then
    raise exception 'Ajoutez au moins une ligne';
  end if;
  if jsonb_array_length(v_lignes) > 200 then
    raise exception 'Pas plus de 200 lignes par document';
  end if;
  if resultat is not null then
    select * into existant from public.documents_vente where id = resultat and etablissement_id = p_etablissement_id for update;
    if existant.id is null then
      raise exception 'Document introuvable dans cet établissement';
    end if;
    perform public.exiger_acces_hub(existant.hub_id);
    if not (existant.statut = 'brouillon' or (existant.type = 'devis' and existant.statut = 'envoye')) then
      raise exception 'Ce document n''est plus modifiable';
    end if;
    v_type := existant.type;
  end if;
  v_hub := public.hub_document(p_etablissement_id, coalesce(nullif(p_document ->> 'hub_id', '')::uuid, existant.hub_id));
  if v_echeance is null then
    delai := coalesce((public.parametre_module(p_etablissement_id, 'facturation',
      case v_type when 'devis' then 'validite_devis_jours' else 'delai_paiement_jours' end) #>> '{}')::integer, 30);
    v_echeance := v_date + delai;
  end if;
  if v_echeance < v_date then
    raise exception 'L''échéance ne peut pas précéder la date du document';
  end if;

  if resultat is null then
    insert into public.documents_vente (etablissement_id, hub_id, type, numero, contact_id, date_document, echeance, objet, notes, conditions, cree_par)
    values (p_etablissement_id, v_hub, v_type,
            case when v_type = 'devis' then public.prochain_numero(p_etablissement_id, 'devis', 'DE-') end,
            v_contact, v_date, v_echeance, nullif(btrim(p_document ->> 'objet'), ''), nullif(btrim(p_document ->> 'notes'), ''),
            nullif(btrim(p_document ->> 'conditions'), ''), auth.uid())
    returning id into resultat;
  else
    update public.documents_vente set
      hub_id = v_hub, contact_id = v_contact, date_document = v_date, echeance = v_echeance,
      objet = nullif(btrim(p_document ->> 'objet'), ''), notes = nullif(btrim(p_document ->> 'notes'), ''),
      conditions = nullif(btrim(p_document ->> 'conditions'), '')
    where id = resultat;
    delete from public.lignes_document_vente where document_id = resultat;
  end if;

  for l in select * from jsonb_array_elements(v_lignes) loop
    v_rang := v_rang + 1;
    if jsonb_typeof(l) <> 'object' then
      raise exception 'Ligne % invalide', v_rang;
    end if;
    v_article := null;
    if nullif(l ->> 'article_id', '') is not null then
      select * into v_article from public.articles where id = (l ->> 'article_id')::uuid and etablissement_id = p_etablissement_id;
      if v_article.id is null then
        raise exception 'Article inconnu dans cet établissement (ligne %)', v_rang;
      end if;
    end if;
    v_quantite := nullif(l ->> 'quantite', '')::numeric;
    v_prix := round(coalesce(nullif(l ->> 'prix_unitaire', '')::numeric, v_article.prix_vente), 2);
    v_remise := round(coalesce(nullif(l ->> 'remise', '')::numeric, 0), 2);
    v_taux := coalesce(nullif(l ->> 'taux_tva', '')::numeric,
                       (public.parametre_module(p_etablissement_id, 'facturation', 'tva_par_defaut') #>> '{}')::numeric, 0);
    if v_quantite is null or v_quantite = 'NaN'::numeric or v_quantite <= 0 then
      raise exception 'Quantité invalide (ligne %)', v_rang;
    end if;
    if v_prix is null or v_prix = 'NaN'::numeric or v_prix < 0 then
      raise exception 'Prix invalide (ligne %)', v_rang;
    end if;
    if v_remise = 'NaN'::numeric or v_remise < 0 or v_remise > round(v_quantite * v_prix, 2) then
      raise exception 'Remise invalide (ligne %)', v_rang;
    end if;
    if v_taux = 'NaN'::numeric or v_taux < 0 or v_taux > 100 then
      raise exception 'Taux de TVA invalide (ligne %)', v_rang;
    end if;
    v_ht := round(v_quantite * v_prix, 2) - v_remise;
    v_tva := round(v_ht * v_taux / 100, 2);
    insert into public.lignes_document_vente (document_id, etablissement_id, ordre, article_id, libelle, description, quantite, unite,
      prix_unitaire, remise, taux_tva, total_ht, total_tva, total_ttc)
    values (resultat, p_etablissement_id, v_rang, v_article.id,
            coalesce(nullif(btrim(l ->> 'libelle'), ''), v_article.nom),
            nullif(btrim(l ->> 'description'), ''), v_quantite, coalesce(nullif(btrim(l ->> 'unite'), ''), v_article.unite),
            v_prix, v_remise, v_taux, v_ht, v_tva, v_ht + v_tva);
  end loop;
  perform public.recalculer_document_vente(resultat);
  return resultat;
end
$$;

-- Devis : envoyé, accepté, refusé (retour possible d'« envoyé » vers « brouillon »).
create function public.changer_statut_devis(p_document_id uuid, p_statut text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  doc public.documents_vente%rowtype;
begin
  select * into doc from public.documents_vente where id = p_document_id for update;
  if doc.id is null or doc.type <> 'devis' then
    raise exception 'Devis introuvable';
  end if;
  perform public.exiger_permission(doc.etablissement_id, 'facturation.gerer');
  perform public.exiger_acces_hub(doc.hub_id);
  if not ((doc.statut = 'brouillon' and p_statut = 'envoye')
       or (doc.statut = 'envoye' and p_statut in ('brouillon', 'accepte', 'refuse'))
       or (doc.statut = 'accepte' and p_statut = 'envoye')) then
    raise exception 'Passage impossible de « % » à « % »', doc.statut, p_statut;
  end if;
  update public.documents_vente set statut = p_statut where id = doc.id;
end
$$;

-- Transforme un devis (envoyé ou accepté) en facture brouillon ; le devis devient « converti ».
create function public.convertir_devis(p_document_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  doc public.documents_vente%rowtype;
  resultat uuid;
  delai integer;
begin
  select * into doc from public.documents_vente where id = p_document_id for update;
  if doc.id is null or doc.type <> 'devis' then
    raise exception 'Devis introuvable';
  end if;
  perform public.exiger_permission(doc.etablissement_id, 'facturation.gerer');
  perform public.exiger_acces_hub(doc.hub_id);
  if doc.statut not in ('envoye', 'accepte', 'brouillon') then
    raise exception 'Ce devis ne peut plus être facturé (%)', doc.statut;
  end if;
  delai := coalesce((public.parametre_module(doc.etablissement_id, 'facturation', 'delai_paiement_jours') #>> '{}')::integer, 30);
  insert into public.documents_vente (etablissement_id, hub_id, type, contact_id, date_document, echeance, objet, notes, conditions, origine_id, cree_par)
  values (doc.etablissement_id, doc.hub_id, 'facture', doc.contact_id, public.date_locale(doc.etablissement_id),
          public.date_locale(doc.etablissement_id) + delai, doc.objet, doc.notes, doc.conditions, doc.id, auth.uid())
  returning id into resultat;
  insert into public.lignes_document_vente (document_id, etablissement_id, ordre, article_id, libelle, description, quantite, unite,
    prix_unitaire, remise, taux_tva, total_ht, total_tva, total_ttc)
  select resultat, etablissement_id, ordre, article_id, libelle, description, quantite, unite, prix_unitaire, remise, taux_tva,
         total_ht, total_tva, total_ttc
  from public.lignes_document_vente where document_id = doc.id;
  perform public.recalculer_document_vente(resultat);
  update public.documents_vente set statut = 'converti' where id = doc.id;
  return resultat;
end
$$;

-- Copie un document en nouveau brouillon (même type ; un avoir n'est pas dupliqué).
create function public.dupliquer_document_vente(p_document_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  doc public.documents_vente%rowtype;
  resultat uuid;
begin
  select * into doc from public.documents_vente where id = p_document_id;
  if doc.id is null or doc.type = 'avoir' then
    raise exception 'Document introuvable';
  end if;
  perform public.exiger_permission(doc.etablissement_id, 'facturation.gerer');
  resultat := public.enregistrer_document_vente(doc.etablissement_id, jsonb_build_object(
    'type', doc.type, 'contact_id', doc.contact_id, 'hub_id', doc.hub_id, 'objet', doc.objet, 'notes', doc.notes, 'conditions', doc.conditions,
    'lignes', (select jsonb_agg(jsonb_build_object('article_id', article_id, 'libelle', libelle, 'description', description, 'quantite', quantite,
                 'unite', unite, 'prix_unitaire', prix_unitaire, 'remise', remise, 'taux_tva', taux_tva) order by ordre)
               from public.lignes_document_vente where document_id = doc.id)));
  return resultat;
end
$$;

-- Émission d'une facture : numéro définitif, vente (origine « facture »), sorties de stock du Hub du document.
create function public.emettre_facture(p_document_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  doc public.documents_vente%rowtype;
  hub public.hubs%rowtype;
  besoin record;
  l record;
  v_article public.articles%rowtype;
  stock_negatif boolean;
  disponible numeric;
  v_numero text;
  v_vente uuid;
begin
  select * into doc from public.documents_vente where id = p_document_id for update;
  if doc.id is null or doc.type <> 'facture' then
    raise exception 'Facture introuvable';
  end if;
  perform public.exiger_permission(doc.etablissement_id, 'facturation.gerer');
  perform public.exiger_permission(doc.etablissement_id, 'ventes.lire');
  perform public.exiger_acces_hub(doc.hub_id);
  if doc.statut <> 'brouillon' then
    raise exception 'Cette facture est déjà émise';
  end if;
  if not exists (select 1 from public.lignes_document_vente where document_id = doc.id) then
    raise exception 'Facture vide';
  end if;
  select * into hub from public.hubs where id = doc.hub_id;
  if not hub.actif then
    raise exception 'Le Hub de la facture est désactivé';
  end if;
  select coalesce((data ->> 'stock_negatif')::boolean, false) into stock_negatif
  from public.etablissement_parametres where etablissement_id = doc.etablissement_id and module_id = 'caisse';
  stock_negatif := coalesce(stock_negatif, false);
  for besoin in
    select article_id, sum(quantite) quantite from public.lignes_document_vente
    where document_id = doc.id and article_id is not null group by 1 order by 1
  loop
    select * into v_article from public.articles where id = besoin.article_id for update;
    if v_article.suivi_stock then
      if not hub.capacite_stock then
        raise exception 'Le Hub « % » ne gère pas de stock : choisissez un Hub qui stocke « % »', hub.nom, v_article.nom;
      end if;
      if not stock_negatif then
        disponible := public.stock_hub(hub.id, v_article.id);
        if disponible < besoin.quantite then
          raise exception 'Stock insuffisant pour « % » dans % (disponible : %)', v_article.nom, hub.nom, disponible;
        end if;
      end if;
    end if;
  end loop;

  v_numero := public.prochain_numero(doc.etablissement_id, 'facture', 'FA-');
  insert into public.ventes (etablissement_id, hub_id, numero, contact_id, sous_total, remise, total, montant_paye, statut_paiement,
    note, vendeur, origine)
  values (doc.etablissement_id, doc.hub_id, v_numero, doc.contact_id, doc.total_ttc, 0, doc.total_ttc, 0,
          case when doc.total_ttc = 0 then 'payee' else 'impayee' end, coalesce(doc.objet, 'Facture ' || v_numero), auth.uid(), 'facture')
  returning id into v_vente;
  for l in select * from public.lignes_document_vente where document_id = doc.id order by ordre loop
    select * into v_article from public.articles where id = l.article_id;
    insert into public.lignes_vente (vente_id, etablissement_id, article_id, libelle, quantite, prix_unitaire, remise, total, cout_unitaire)
    values (v_vente, doc.etablissement_id, l.article_id, l.libelle, l.quantite,
            round(l.prix_unitaire * (1 + l.taux_tva / 100), 2), round(l.remise * (1 + l.taux_tva / 100), 2), l.total_ttc, v_article.cout_achat);
    if v_article.suivi_stock then
      insert into public.mouvements_stock (etablissement_id, hub_id, article_id, type, quantite, cout_unitaire, motif, vente_id, acteur)
      values (doc.etablissement_id, hub.id, v_article.id, 'sortie_vente', -l.quantite, v_article.cout_achat, 'Facture ' || v_numero, v_vente, auth.uid());
    end if;
  end loop;
  update public.documents_vente set statut = 'emise', numero = v_numero, vente_id = v_vente, emis_le = now(), emis_par = auth.uid()
  where id = doc.id;
  return jsonb_build_object('numero', v_numero, 'vente_id', v_vente);
end
$$;

-- Paiement d'une facture émise (espèces : rattaché à une caisse ouverte).
create function public.encaisser_facture(p_document_id uuid, p_montant numeric, p_mode text, p_reference text default null, p_session_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  doc public.documents_vente%rowtype;
  vente public.ventes%rowtype;
  session public.sessions_caisse%rowtype;
  resultat uuid;
begin
  select * into doc from public.documents_vente where id = p_document_id;
  if doc.id is null or doc.type <> 'facture' or doc.statut <> 'emise' then
    raise exception 'Seule une facture émise s''encaisse';
  end if;
  perform public.exiger_permission(doc.etablissement_id, 'facturation.gerer');
  perform public.exiger_acces_hub(doc.hub_id);
  select * into vente from public.ventes where id = doc.vente_id for update;
  if p_mode is null or p_mode not in ('especes', 'mobile_money', 'carte', 'virement', 'cheque') then
    raise exception 'Mode de paiement inconnu : %', p_mode;
  end if;
  if p_montant is null or p_montant = 'NaN'::numeric or p_montant <= 0 or p_montant <> round(p_montant, 2)
     or p_montant > vente.total - vente.montant_paye then
    raise exception 'Le montant doit être positif et ne pas dépasser le reste dû (%)', vente.total - vente.montant_paye;
  end if;
  if p_session_id is not null then
    select * into session from public.sessions_caisse
    where id = p_session_id and etablissement_id = doc.etablissement_id and statut = 'ouverte';
    if session.id is null then
      raise exception 'Caisse introuvable ou clôturée';
    end if;
    perform public.exiger_acces_hub(session.hub_id);
  elsif p_mode = 'especes' then
    raise exception 'Un paiement en espèces doit être rattaché à une caisse ouverte';
  end if;
  insert into public.paiements (etablissement_id, hub_id, vente_id, session_caisse_id, mode, montant, reference, encaisse_par)
  values (doc.etablissement_id, coalesce(session.hub_id, doc.hub_id), vente.id, p_session_id, p_mode, p_montant,
          nullif(btrim(p_reference), ''), auth.uid())
  returning id into resultat;
  perform public.recalculer_paiement_vente(vente.id);
  return resultat;
end
$$;

-- Annulation : brouillon ou devis → « annulé » ; facture émise → avoir total (paiements annulés au préalable),
-- vente annulée, stock remis dans le Hub d'origine.
create function public.annuler_document_vente(p_document_id uuid, p_motif text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  doc public.documents_vente%rowtype;
  vente public.ventes%rowtype;
  v_avoir uuid;
begin
  select * into doc from public.documents_vente where id = p_document_id for update;
  if doc.id is null or doc.type = 'avoir' then
    raise exception 'Document introuvable';
  end if;
  perform public.exiger_acces_hub(doc.hub_id);
  if coalesce(btrim(p_motif), '') = '' then
    raise exception 'Le motif d''annulation est obligatoire';
  end if;
  if doc.statut in ('annule', 'converti') then
    raise exception 'Ce document ne peut plus être annulé';
  end if;
  if doc.statut <> 'emise' then
    perform public.exiger_permission(doc.etablissement_id, 'facturation.gerer');
    update public.documents_vente set statut = 'annule', annule_le = now(), annule_par = auth.uid(), motif_annulation = btrim(p_motif)
    where id = doc.id;
    return null;
  end if;

  perform public.exiger_permission(doc.etablissement_id, 'facturation.annuler');
  select * into vente from public.ventes where id = doc.vente_id for update;
  if exists (select 1 from public.paiements where vente_id = vente.id and statut = 'valide') then
    raise exception 'Cette facture a des paiements : annulez-les d''abord (ou remboursez le client), puis émettez l''avoir';
  end if;
  insert into public.documents_vente (etablissement_id, hub_id, type, numero, statut, contact_id, date_document, objet, notes,
    total_ht, total_tva, total_ttc, origine_id, cree_par, emis_le, emis_par)
  values (doc.etablissement_id, doc.hub_id, 'avoir', public.prochain_numero(doc.etablissement_id, 'avoir', 'AV-'), 'emise', doc.contact_id,
          public.date_locale(doc.etablissement_id), 'Avoir sur facture ' || doc.numero, btrim(p_motif),
          doc.total_ht, doc.total_tva, doc.total_ttc, doc.id, auth.uid(), now(), auth.uid())
  returning id into v_avoir;
  insert into public.lignes_document_vente (document_id, etablissement_id, ordre, article_id, libelle, description, quantite, unite,
    prix_unitaire, remise, taux_tva, total_ht, total_tva, total_ttc)
  select v_avoir, etablissement_id, ordre, article_id, libelle, description, quantite, unite, prix_unitaire, remise, taux_tva,
         total_ht, total_tva, total_ttc
  from public.lignes_document_vente where document_id = doc.id;
  insert into public.mouvements_stock (etablissement_id, hub_id, article_id, type, quantite, cout_unitaire, motif, vente_id, acteur)
  select vente.etablissement_id, m.hub_id, m.article_id, 'retour_annulation', -m.quantite, m.cout_unitaire,
         'Avoir sur facture ' || doc.numero, vente.id, auth.uid()
  from public.mouvements_stock m where m.vente_id = vente.id and m.type = 'sortie_vente';
  update public.ventes set statut = 'annulee', annulee_le = now(), annulee_par = auth.uid(),
    motif_annulation = 'Avoir : ' || btrim(p_motif), montant_paye = 0, statut_paiement = 'impayee'
  where id = vente.id;
  update public.documents_vente set statut = 'annule', annule_le = now(), annule_par = auth.uid(), motif_annulation = btrim(p_motif)
  where id = doc.id;
  return v_avoir;
end
$$;

-- Document complet pour l'écran et l'impression : en-tête, lignes, client, identité, paiements.
create function public.document_vente_complet(p_document_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  doc public.documents_vente%rowtype;
begin
  select * into doc from public.documents_vente where id = p_document_id;
  if doc.id is null or not public.lecture_autorisee(doc.etablissement_id, 'facturation.lire')
     or not public.lecture_hub(doc.etablissement_id, doc.hub_id) then
    raise exception 'Document introuvable';
  end if;
  return jsonb_build_object(
    'document', to_jsonb(doc),
    'lignes', coalesce((select jsonb_agg(to_jsonb(l) order by l.ordre) from public.lignes_document_vente l where l.document_id = doc.id), '[]'::jsonb),
    'contact', (select jsonb_build_object('id', c.id, 'nom', c.nom, 'societe', c.societe, 'adresse', c.adresse, 'telephone', c.telephone,
                  'email', c.email, 'identifiant_fiscal', c.identifiant_fiscal) from public.contacts c where c.id = doc.contact_id),
    'hub', (select jsonb_build_object('nom', h.nom, 'adresse', h.adresse, 'telephone', h.telephone) from public.hubs h where h.id = doc.hub_id),
    'identite', public.identite_effective(doc.etablissement_id),
    'devise', (select devise from public.etablissements where id = doc.etablissement_id),
    'parametres', jsonb_build_object(
      'conditions_paiement', public.parametre_module(doc.etablissement_id, 'facturation', 'conditions_paiement') #>> '{}',
      'mentions', public.parametre_module(doc.etablissement_id, 'facturation', 'mentions_factures') #>> '{}'),
    'vente', (select jsonb_build_object('numero', v.numero, 'total', v.total, 'montant_paye', v.montant_paye,
               'statut_paiement', v.statut_paiement, 'statut', v.statut) from public.ventes v where v.id = doc.vente_id),
    'paiements', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'mode', p.mode, 'montant', p.montant, 'reference', p.reference,
                   'statut', p.statut, 'cree_le', p.cree_le) order by p.cree_le)
                 from public.paiements p where p.vente_id = doc.vente_id), '[]'::jsonb),
    'origine', (select jsonb_build_object('id', o.id, 'type', o.type, 'numero', o.numero) from public.documents_vente o where o.id = doc.origine_id),
    'derives', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'type', d.type, 'numero', d.numero, 'statut', d.statut))
                         from public.documents_vente d where d.origine_id = doc.id), '[]'::jsonb)
  );
end
$$;

create function public.tableau_de_bord_facturation(p_etablissement_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  aujourdhui date := public.date_locale(p_etablissement_id);
begin
  if not public.lecture_autorisee(p_etablissement_id, 'facturation.lire') then
    raise exception 'Permission refusée : facturation.lire' using errcode = '42501';
  end if;
  return (
    with factures as (
      select d.*, v.total - v.montant_paye as reste
      from public.documents_vente d join public.ventes v on v.id = d.vente_id
      where d.etablissement_id = p_etablissement_id and d.type = 'facture' and d.statut = 'emise'
        and public.lecture_hub(d.etablissement_id, d.hub_id)
    ),
    devis as (
      select * from public.documents_vente d
      where d.etablissement_id = p_etablissement_id and d.type = 'devis' and public.lecture_hub(d.etablissement_id, d.hub_id)
    )
    select jsonb_build_object(
      'a_encaisser', coalesce((select sum(reste) from factures), 0),
      'factures_ouvertes', (select count(*) from factures where reste > 0),
      'en_retard', coalesce((select sum(reste) from factures where reste > 0 and echeance < aujourdhui), 0),
      'nb_en_retard', (select count(*) from factures where reste > 0 and echeance < aujourdhui),
      'facture_mois', coalesce((select sum(total_ttc) from factures where date_document >= date_trunc('month', aujourdhui)::date), 0),
      'devis_ouverts', (select count(*) from devis where statut in ('brouillon', 'envoye', 'accepte')),
      'devis_ouverts_montant', coalesce((select sum(total_ttc) from devis where statut in ('envoye', 'accepte')), 0),
      'taux_conversion', (select case when count(*) filter (where statut in ('converti', 'refuse')) = 0 then null
                                 else round(100.0 * count(*) filter (where statut = 'converti') / count(*) filter (where statut in ('converti', 'refuse'))) end
                          from devis),
      'retards', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'numero', f.numero, 'client', c.nom, 'echeance', f.echeance, 'reste', f.reste)
                                            order by f.echeance)
                           from (select * from factures where reste > 0 and echeance < aujourdhui order by echeance limit 8) f
                           join public.contacts c on c.id = f.contact_id), '[]'::jsonb)
    )
  );
end
$$;

-- ---------------------------------------------------------------------------
-- 5. Disponibilité et droits d'exécution
-- ---------------------------------------------------------------------------
update public.modules set statut = 'actif', version = '1.0' where id = 'facturation';
insert into public.solution_modules (solution_id, module_id, par_defaut) values
  ('restaurant', 'facturation', false), ('hotel', 'facturation', false)
on conflict (solution_id, module_id) do nothing;

do $$
declare signature text;
begin
  foreach signature in array array[
    'public.enregistrer_contact(uuid, jsonb)',
    'public.annuler_vente(uuid, text)',
    'public.enregistrer_document_vente(uuid, jsonb)',
    'public.changer_statut_devis(uuid, text)',
    'public.convertir_devis(uuid)',
    'public.dupliquer_document_vente(uuid)',
    'public.emettre_facture(uuid)',
    'public.encaisser_facture(uuid, numeric, text, text, uuid)',
    'public.annuler_document_vente(uuid, text)',
    'public.document_vente_complet(uuid)',
    'public.tableau_de_bord_facturation(uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon', signature);
    execute format('grant execute on function %s to authenticated', signature);
  end loop;
  foreach signature in array array[
    'public.hub_document(uuid, uuid)',
    'public.recalculer_document_vente(uuid)',
    'public.proteger_document_vente()',
    'public.proteger_ligne_document()'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', signature);
  end loop;
end
$$;
