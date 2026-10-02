-- CRM (2026-10-02) : le module « crm_pipeline », jusqu'ici « Prévu », devient réel.
-- Prospects = contacts de type « prospect » (même table que les clients : aucune fiche en double).
-- Opportunités (OP-) dans un pipeline d'étapes propre à chaque établissement, activités et relances,
-- devis lié (module Facturation) ; une opportunité gagnée transforme le prospect en client.
-- Rien ne se supprime : une opportunité se perd (motif obligatoire), une activité s'annule.

-- ---------------------------------------------------------------------------
-- 1. Catalogue et droits
-- ---------------------------------------------------------------------------
update public.modules set
  description = 'Prospects, opportunités dans un pipeline, activités et relances, devis lié.',
  documentation = 'docs/CRM.md',
  parametres_schema = '[
    {"cle": "relance_jours", "libelle": "Relance proposée après un contact (jours)", "type": "nombre", "defaut": 3},
    {"cle": "jours_sans_activite", "libelle": "Alerte : opportunité ouverte sans activité depuis (jours)", "type": "nombre", "defaut": 14}
  ]'::jsonb
where id = 'crm_pipeline';

insert into public.permissions (id, module_id, description) values
  ('crm_pipeline.lire', 'crm_pipeline', 'Voir les prospects, opportunités et activités'),
  ('crm_pipeline.gerer', 'crm_pipeline', 'Créer et faire avancer ses opportunités, planifier des activités'),
  ('crm_pipeline.administrer', 'crm_pipeline', 'Configurer le pipeline, réattribuer et modifier toutes les opportunités')
on conflict (id) do nothing;

insert into public.roles (id, nom, description, ordre, modules_requis) values
  ('commercial', 'Commercial', 'Prospects, opportunités, relances et devis', 45, '{crm_pipeline}')
on conflict (id) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r, p from unnest(array['gerant', 'responsable']) r
cross join unnest(array['crm_pipeline.lire', 'crm_pipeline.gerer', 'crm_pipeline.administrer']) p
on conflict do nothing;
insert into public.role_permissions (role_id, permission_id) values
  ('commercial', 'crm_pipeline.lire'), ('commercial', 'crm_pipeline.gerer'),
  ('commercial', 'contacts.lire'), ('commercial', 'contacts.gerer'), ('commercial', 'etablissement.lire'),
  ('commercial', 'tableau_de_bord.lire'), ('commercial', 'articles.lire'),
  ('commercial', 'facturation.lire'), ('commercial', 'facturation.gerer'),
  ('comptable', 'crm_pipeline.lire'), ('lecteur', 'crm_pipeline.lire')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 2. Contacts : prospects, origine, responsable
-- ---------------------------------------------------------------------------
do $$
declare
  contrainte text;
begin
  select c.conname into contrainte from pg_constraint c
  where c.conrelid = 'public.contacts'::regclass and c.contype = 'c' and pg_get_constraintdef(c.oid) like '%les_deux%';
  if contrainte is not null then
    execute format('alter table public.contacts drop constraint %I', contrainte);
  end if;
end
$$;
alter table public.contacts add constraint contacts_type_check check (type in ('client', 'fournisseur', 'les_deux', 'prospect'));
alter table public.contacts add column if not exists source text
  check (source is null or source in ('instagram', 'facebook', 'whatsapp', 'appel', 'recommandation', 'site', 'salon', 'passage', 'autre'));
alter table public.contacts add column if not exists responsable_id uuid references auth.users(id) on delete restrict;

create or replace function public.enregistrer_contact(p_etablissement_id uuid, p_contact jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  resultat uuid := nullif(p_contact ->> 'id', '')::uuid;
  v_responsable uuid := nullif(p_contact ->> 'responsable_id', '')::uuid;
begin
  perform public.exiger_permission(p_etablissement_id, 'contacts.gerer');
  if v_responsable is not null and not exists (
    select 1 from public.etablissement_membres where etablissement_id = p_etablissement_id and user_id = v_responsable and actif
  ) then
    raise exception 'Le responsable doit être un membre actif de l''établissement';
  end if;
  if resultat is null then
    insert into public.contacts(etablissement_id, type, nom, telephone, email, adresse, notes, societe, identifiant_fiscal, source, responsable_id)
    values (
      p_etablissement_id,
      coalesce(nullif(p_contact ->> 'type', ''), 'client'),
      btrim(p_contact ->> 'nom'),
      nullif(btrim(p_contact ->> 'telephone'), ''),
      nullif(lower(btrim(p_contact ->> 'email')), ''),
      nullif(btrim(p_contact ->> 'adresse'), ''),
      nullif(btrim(p_contact ->> 'notes'), ''),
      nullif(btrim(p_contact ->> 'societe'), ''),
      nullif(upper(btrim(p_contact ->> 'identifiant_fiscal')), ''),
      nullif(p_contact ->> 'source', ''),
      v_responsable
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
      source = case when p_contact ? 'source' then nullif(p_contact ->> 'source', '') else source end,
      responsable_id = case when p_contact ? 'responsable_id' then v_responsable else responsable_id end,
      actif = coalesce((p_contact ->> 'actif')::boolean, actif)
    where id = resultat and etablissement_id = p_etablissement_id;
    if not found then
      raise exception 'Contact introuvable dans cet établissement';
    end if;
  end if;
  return resultat;
end
$$;

-- ---------------------------------------------------------------------------
-- 3. Tables
-- ---------------------------------------------------------------------------
create table public.crm_etapes (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  nom text not null check (btrim(nom) <> '' and length(nom) <= 40),
  ordre integer not null default 0,
  probabilite integer not null default 0 check (probabilite between 0 and 100),
  nature text not null default 'ouverte' check (nature in ('ouverte', 'gagnee', 'perdue')),
  actif boolean not null default true,
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  unique (id, etablissement_id)
);
create index crm_etapes_etablissement_idx on public.crm_etapes(etablissement_id, ordre);
create unique index crm_etapes_une_gagnee on public.crm_etapes(etablissement_id) where nature = 'gagnee' and actif;
create unique index crm_etapes_une_perdue on public.crm_etapes(etablissement_id) where nature = 'perdue' and actif;

create table public.crm_opportunites (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  numero text not null,
  titre text not null check (btrim(titre) <> '' and length(titre) <= 160),
  contact_id uuid not null references public.contacts(id) on delete restrict,
  etape_id uuid not null,
  statut text not null default 'ouverte' check (statut in ('ouverte', 'gagnee', 'perdue')),
  montant numeric(14, 2) not null default 0 check (montant >= 0),
  probabilite integer not null default 0 check (probabilite between 0 and 100),
  cloture_prevue date,
  source text check (source is null or source in ('instagram', 'facebook', 'whatsapp', 'appel', 'recommandation', 'site', 'salon', 'passage', 'autre')),
  responsable_id uuid not null references auth.users(id) on delete restrict,
  document_vente_id uuid references public.documents_vente(id) on delete restrict,
  notes text check (notes is null or length(notes) <= 4000),
  motif_perte text check (motif_perte is null or length(motif_perte) <= 500),
  cloturee_le timestamptz,
  derniere_activite timestamptz not null default now(),
  cree_par uuid not null references auth.users(id) on delete restrict,
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  unique (etablissement_id, numero),
  unique (id, etablissement_id),
  check (statut <> 'perdue' or btrim(coalesce(motif_perte, '')) <> ''),
  check ((statut = 'ouverte') = (cloturee_le is null)),
  foreign key (etape_id, etablissement_id) references public.crm_etapes(id, etablissement_id) on delete restrict
);
create index crm_opportunites_etablissement_idx on public.crm_opportunites(etablissement_id, statut, etape_id);
create index crm_opportunites_contact_idx on public.crm_opportunites(contact_id);
create index crm_opportunites_responsable_idx on public.crm_opportunites(responsable_id);

create table public.crm_activites (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  opportunite_id uuid,
  contact_id uuid references public.contacts(id) on delete restrict,
  type text not null check (type in ('appel', 'message', 'rdv', 'email', 'visite', 'demo', 'tache', 'note')),
  sujet text not null check (btrim(sujet) <> '' and length(sujet) <= 200),
  details text check (details is null or length(details) <= 4000),
  echeance timestamptz,
  statut text not null default 'a_faire' check (statut in ('a_faire', 'faite', 'annulee')),
  resultat text check (resultat is null or length(resultat) <= 1000),
  assigne_a uuid not null references auth.users(id) on delete restrict,
  faite_le timestamptz,
  cree_par uuid not null references auth.users(id) on delete restrict,
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  check (opportunite_id is not null or contact_id is not null),
  check ((statut = 'faite') = (faite_le is not null)),
  foreign key (opportunite_id, etablissement_id) references public.crm_opportunites(id, etablissement_id) on delete restrict
);
create index crm_activites_etablissement_idx on public.crm_activites(etablissement_id, statut, echeance);
create index crm_activites_opportunite_idx on public.crm_activites(opportunite_id);
create index crm_activites_contact_idx on public.crm_activites(contact_id);
create index crm_activites_assigne_idx on public.crm_activites(assigne_a, statut);

do $$
declare
  nom_table text;
begin
  foreach nom_table in array array['crm_etapes', 'crm_opportunites', 'crm_activites'] loop
    execute format('create trigger %I_modifie_le before update on public.%I for each row execute function public.fixer_modifie_le()', nom_table, nom_table);
    execute format('create trigger %I_sans_suppression before delete on public.%I for each row execute function public.refuser_suppression()', nom_table, nom_table);
    execute format('create trigger %I_verrou_etablissement before update on public.%I for each row execute function public.verrouiller_etablissement_id()', nom_table, nom_table);
    execute format('create trigger %I_audit after insert or update or delete on public.%I for each row execute function public.journaliser_modification()', nom_table, nom_table);
    execute format('alter table public.%I enable row level security', nom_table);
    execute format('create policy lecture on public.%I for select to authenticated using (public.lecture_autorisee(etablissement_id, ''crm_pipeline.lire''))', nom_table);
  end loop;
end
$$;

insert into public.types_pieces_jointes (objet_type, table_nom, module_id, permission_lire, permission_ecrire, libelle)
values ('crm_opportunite', 'crm_opportunites', 'crm_pipeline', 'crm_pipeline.lire', 'crm_pipeline.gerer', 'Opportunité')
on conflict (objet_type) do nothing;

-- ---------------------------------------------------------------------------
-- 4. Fonctions
-- ---------------------------------------------------------------------------
-- Pipeline par défaut, créé à la première utilisation (idempotent).
create function public.crm_initialiser(p_etablissement_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.a_permission(p_etablissement_id, 'crm_pipeline.lire') then
    raise exception 'Permission refusée : crm_pipeline.lire' using errcode = '42501';
  end if;
  if exists (select 1 from public.crm_etapes where etablissement_id = p_etablissement_id) then
    return;
  end if;
  perform pg_advisory_xact_lock(hashtext('crm_etapes:' || p_etablissement_id::text));
  if exists (select 1 from public.crm_etapes where etablissement_id = p_etablissement_id) then
    return;
  end if;
  insert into public.crm_etapes (etablissement_id, nom, ordre, probabilite, nature) values
    (p_etablissement_id, 'Nouveau', 1, 10, 'ouverte'),
    (p_etablissement_id, 'Contacté', 2, 20, 'ouverte'),
    (p_etablissement_id, 'Qualifié', 3, 40, 'ouverte'),
    (p_etablissement_id, 'Proposition', 4, 60, 'ouverte'),
    (p_etablissement_id, 'Négociation', 5, 80, 'ouverte'),
    (p_etablissement_id, 'Gagné', 6, 100, 'gagnee'),
    (p_etablissement_id, 'Perdu', 7, 0, 'perdue');
end
$$;

-- Étape : créer, renommer, réordonner, désactiver (administrer). Les natures gagnée/perdue sont uniques.
create function public.enregistrer_etape_crm(p_etablissement_id uuid, p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  resultat uuid := nullif(p ->> 'id', '')::uuid;
  existante public.crm_etapes%rowtype;
begin
  perform public.exiger_permission(p_etablissement_id, 'crm_pipeline.administrer');
  if resultat is null then
    insert into public.crm_etapes (etablissement_id, nom, ordre, probabilite, nature)
    values (p_etablissement_id, btrim(p ->> 'nom'), coalesce((p ->> 'ordre')::integer, 50),
            coalesce((p ->> 'probabilite')::integer, 50), 'ouverte')
    returning id into resultat;
  else
    select * into existante from public.crm_etapes where id = resultat and etablissement_id = p_etablissement_id;
    if existante.id is null then
      raise exception 'Étape introuvable';
    end if;
    if existante.nature <> 'ouverte' and coalesce((p ->> 'actif')::boolean, true) = false then
      raise exception 'Les étapes Gagné et Perdu restent actives';
    end if;
    if coalesce((p ->> 'actif')::boolean, true) = false and exists (
      select 1 from public.crm_opportunites where etape_id = resultat and statut = 'ouverte') then
      raise exception 'Déplacez d''abord les opportunités de cette étape';
    end if;
    update public.crm_etapes set
      nom = coalesce(nullif(btrim(p ->> 'nom'), ''), nom),
      ordre = coalesce((p ->> 'ordre')::integer, ordre),
      probabilite = case when nature = 'ouverte' then coalesce((p ->> 'probabilite')::integer, probabilite) else probabilite end,
      actif = coalesce((p ->> 'actif')::boolean, actif)
    where id = resultat;
  end if;
  return resultat;
end
$$;

-- Droit de modifier une opportunité : son responsable ou son créateur (gérer), ou un administrateur.
create function public.exiger_droit_opportunite(o public.crm_opportunites)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.exiger_permission(o.etablissement_id, 'crm_pipeline.gerer');
  if auth.uid() not in (o.responsable_id, o.cree_par) and not public.a_permission(o.etablissement_id, 'crm_pipeline.administrer') then
    raise exception 'Permission refusée : cette opportunité est suivie par un autre commercial' using errcode = '42501';
  end if;
end
$$;

-- Crée ou modifie une opportunité. p : { id?, titre, contact_id, etape_id?, montant?, cloture_prevue?, source?, responsable_id?, notes? }
create function public.enregistrer_opportunite(p_etablissement_id uuid, p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  resultat uuid := nullif(p ->> 'id', '')::uuid;
  existante public.crm_opportunites%rowtype;
  v_contact uuid := nullif(p ->> 'contact_id', '')::uuid;
  v_etape public.crm_etapes%rowtype;
  v_responsable uuid := nullif(p ->> 'responsable_id', '')::uuid;
  v_montant numeric := coalesce(nullif(p ->> 'montant', '')::numeric, 0);
begin
  perform public.exiger_permission(p_etablissement_id, 'crm_pipeline.gerer');
  perform public.crm_initialiser(p_etablissement_id);
  if resultat is not null then
    select * into existante from public.crm_opportunites where id = resultat and etablissement_id = p_etablissement_id for update;
    if existante.id is null then
      raise exception 'Opportunité introuvable dans cet établissement';
    end if;
    perform public.exiger_droit_opportunite(existante);
    if existante.statut <> 'ouverte' then
      raise exception 'Une opportunité clôturée ne se modifie plus (rouvrez-la)';
    end if;
  end if;
  if v_contact is null or not exists (
    select 1 from public.contacts where id = v_contact and etablissement_id = p_etablissement_id and type <> 'fournisseur' and actif) then
    raise exception 'Choisissez un prospect ou un client actif de cet établissement';
  end if;
  if v_montant = 'NaN'::numeric or v_montant < 0 or v_montant <> round(v_montant, 2) then
    raise exception 'Montant invalide';
  end if;
  v_responsable := coalesce(v_responsable, existante.responsable_id, auth.uid());
  if v_responsable <> coalesce(existante.responsable_id, auth.uid()) then
    perform public.exiger_permission(p_etablissement_id, 'crm_pipeline.administrer');
  end if;
  if v_responsable not in (select public.membres_avec_permission(p_etablissement_id, 'crm_pipeline.gerer')) then
    raise exception 'Le responsable doit être un membre actif qui gère le CRM';
  end if;
  select * into v_etape from public.crm_etapes
  where id = coalesce(nullif(p ->> 'etape_id', '')::uuid, existante.etape_id) and etablissement_id = p_etablissement_id;
  if v_etape.id is null then
    select * into v_etape from public.crm_etapes
    where etablissement_id = p_etablissement_id and nature = 'ouverte' and actif order by ordre limit 1;
  end if;
  if v_etape.id is null or not v_etape.actif or v_etape.nature <> 'ouverte' then
    raise exception 'Choisissez une étape ouverte du pipeline (gagner ou perdre passe par le bouton dédié)';
  end if;

  if resultat is null then
    insert into public.crm_opportunites (etablissement_id, numero, titre, contact_id, etape_id, montant, probabilite, cloture_prevue,
      source, responsable_id, notes, cree_par)
    values (p_etablissement_id, public.prochain_numero(p_etablissement_id, 'opportunite', 'OP-'), btrim(p ->> 'titre'), v_contact,
      v_etape.id, v_montant, v_etape.probabilite, nullif(p ->> 'cloture_prevue', '')::date,
      coalesce(nullif(p ->> 'source', ''), (select source from public.contacts where id = v_contact)),
      v_responsable, nullif(btrim(p ->> 'notes'), ''), auth.uid())
    returning id into resultat;
  else
    update public.crm_opportunites set
      titre = btrim(p ->> 'titre'), contact_id = v_contact, etape_id = v_etape.id, montant = v_montant,
      probabilite = case when v_etape.id <> existante.etape_id then v_etape.probabilite else probabilite end,
      cloture_prevue = nullif(p ->> 'cloture_prevue', '')::date,
      source = case when p ? 'source' then nullif(p ->> 'source', '') else source end,
      responsable_id = v_responsable, notes = nullif(btrim(p ->> 'notes'), '')
    where id = resultat;
  end if;
  if v_responsable <> auth.uid() and (existante.id is null or existante.responsable_id <> v_responsable) then
    perform public.notifier(v_responsable, p_etablissement_id, 'crm.opportunite_attribuee', 'Opportunité attribuée',
      btrim(p ->> 'titre'), 'crm/' || resultat);
  end if;
  return resultat;
end
$$;

-- Avance une opportunité dans le pipeline (glisser-déposer) ; une étape de nature gagnée/perdue la clôture.
create function public.deplacer_opportunite(p_opportunite_id uuid, p_etape_id uuid, p_motif text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.crm_opportunites%rowtype;
  v_etape public.crm_etapes%rowtype;
begin
  select * into o from public.crm_opportunites where id = p_opportunite_id for update;
  if o.id is null then
    raise exception 'Opportunité introuvable';
  end if;
  perform public.exiger_droit_opportunite(o);
  select * into v_etape from public.crm_etapes where id = p_etape_id and etablissement_id = o.etablissement_id and actif;
  if v_etape.id is null then
    raise exception 'Étape inconnue';
  end if;
  if v_etape.nature = 'perdue' and coalesce(btrim(p_motif), '') = '' then
    raise exception 'Indiquez pourquoi l''opportunité est perdue';
  end if;
  update public.crm_opportunites set
    etape_id = v_etape.id, probabilite = v_etape.probabilite,
    statut = case v_etape.nature when 'gagnee' then 'gagnee' when 'perdue' then 'perdue' else 'ouverte' end,
    cloturee_le = case when v_etape.nature = 'ouverte' then null else coalesce(cloturee_le, now()) end,
    motif_perte = case when v_etape.nature = 'perdue' then btrim(p_motif) else null end,
    derniere_activite = now()
  where id = o.id;
  if v_etape.nature = 'gagnee' then
    update public.contacts set type = 'client' where id = o.contact_id and type = 'prospect';
    perform public.notifier_permission(o.etablissement_id, 'crm_pipeline.administrer', 'crm.gagnee', 'Opportunité gagnée',
      o.numero || ' · ' || o.titre, 'crm/' || o.id);
  end if;
end
$$;

-- Planifie (ou note) une activité sur une opportunité ou un contact.
-- p : { id?, opportunite_id?, contact_id?, type, sujet, details?, echeance?, assigne_a?, faite?: bool, resultat? }
create function public.enregistrer_activite_crm(p_etablissement_id uuid, p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  resultat uuid := nullif(p ->> 'id', '')::uuid;
  existante public.crm_activites%rowtype;
  o public.crm_opportunites%rowtype;
  v_contact uuid := nullif(p ->> 'contact_id', '')::uuid;
  v_assigne uuid := nullif(p ->> 'assigne_a', '')::uuid;
  v_faite boolean := coalesce((p ->> 'faite')::boolean, false) or p ->> 'type' = 'note';
begin
  perform public.exiger_permission(p_etablissement_id, 'crm_pipeline.gerer');
  if resultat is not null then
    select * into existante from public.crm_activites where id = resultat and etablissement_id = p_etablissement_id for update;
    if existante.id is null then
      raise exception 'Activité introuvable';
    end if;
    if existante.statut <> 'a_faire' then
      raise exception 'Une activité faite ou annulée ne se modifie plus';
    end if;
    if auth.uid() not in (existante.assigne_a, existante.cree_par) then
      perform public.exiger_permission(p_etablissement_id, 'crm_pipeline.administrer');
    end if;
  end if;
  if nullif(p ->> 'opportunite_id', '') is not null then
    select * into o from public.crm_opportunites where id = (p ->> 'opportunite_id')::uuid and etablissement_id = p_etablissement_id;
    if o.id is null then
      raise exception 'Opportunité introuvable dans cet établissement';
    end if;
    v_contact := o.contact_id;
  elsif v_contact is null or not exists (select 1 from public.contacts where id = v_contact and etablissement_id = p_etablissement_id) then
    raise exception 'Rattachez l''activité à une opportunité ou à un contact de l''établissement';
  end if;
  v_assigne := coalesce(v_assigne, existante.assigne_a, auth.uid());
  if v_assigne not in (select public.membres_avec_permission(p_etablissement_id, 'crm_pipeline.gerer')) then
    raise exception 'La personne assignée doit être un membre actif qui gère le CRM';
  end if;
  if v_assigne <> auth.uid() and not public.a_permission(p_etablissement_id, 'crm_pipeline.administrer') then
    raise exception 'Seul un administrateur du CRM assigne une activité à quelqu''un d''autre' using errcode = '42501';
  end if;
  if not v_faite and nullif(p ->> 'echeance', '') is null then
    raise exception 'Indiquez la date de l''activité à faire';
  end if;
  if resultat is null then
    insert into public.crm_activites (etablissement_id, opportunite_id, contact_id, type, sujet, details, echeance, statut, resultat,
      assigne_a, faite_le, cree_par)
    values (p_etablissement_id, o.id, v_contact, p ->> 'type', btrim(p ->> 'sujet'), nullif(btrim(p ->> 'details'), ''),
      nullif(p ->> 'echeance', '')::timestamptz, case when v_faite then 'faite' else 'a_faire' end,
      nullif(btrim(p ->> 'resultat'), ''), v_assigne, case when v_faite then now() end, auth.uid())
    returning id into resultat;
  else
    update public.crm_activites set type = p ->> 'type', sujet = btrim(p ->> 'sujet'), details = nullif(btrim(p ->> 'details'), ''),
      echeance = nullif(p ->> 'echeance', '')::timestamptz, assigne_a = v_assigne
    where id = resultat;
  end if;
  if o.id is not null then
    update public.crm_opportunites set derniere_activite = now() where id = o.id;
  end if;
  if v_assigne <> auth.uid() and (existante.id is null or existante.assigne_a <> v_assigne) then
    perform public.notifier(v_assigne, p_etablissement_id, 'crm.activite', 'Activité à faire : ' || btrim(p ->> 'sujet'),
      to_char(nullif(p ->> 'echeance', '')::timestamptz at time zone coalesce((select fuseau from public.etablissements where id = p_etablissement_id), 'UTC'), 'DD/MM HH24:MI'),
      'crm/' || coalesce(o.id::text, 'activites'));
  end if;
  return resultat;
end
$$;

-- Termine une activité (résultat) ou l'annule ; propose la relance suivante côté écran.
create function public.terminer_activite_crm(p_activite_id uuid, p_resultat text, p_annuler boolean default false)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.crm_activites%rowtype;
begin
  select * into a from public.crm_activites where id = p_activite_id for update;
  if a.id is null then
    raise exception 'Activité introuvable';
  end if;
  perform public.exiger_permission(a.etablissement_id, 'crm_pipeline.gerer');
  if auth.uid() not in (a.assigne_a, a.cree_par) then
    perform public.exiger_permission(a.etablissement_id, 'crm_pipeline.administrer');
  end if;
  if a.statut <> 'a_faire' then
    raise exception 'Activité déjà terminée ou annulée';
  end if;
  if p_annuler and coalesce(btrim(p_resultat), '') = '' then
    raise exception 'Indiquez pourquoi l''activité est annulée';
  end if;
  update public.crm_activites set statut = case when p_annuler then 'annulee' else 'faite' end,
    faite_le = case when p_annuler then null else now() end, resultat = nullif(btrim(p_resultat), '')
  where id = a.id;
  if a.opportunite_id is not null then
    update public.crm_opportunites set derniere_activite = now() where id = a.opportunite_id;
  end if;
end
$$;

-- Rouvre une opportunité gagnée ou perdue (erreur de saisie) dans une étape ouverte.
create function public.rouvrir_opportunite(p_opportunite_id uuid, p_etape_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.crm_opportunites%rowtype;
begin
  select * into o from public.crm_opportunites where id = p_opportunite_id for update;
  if o.id is null then
    raise exception 'Opportunité introuvable';
  end if;
  perform public.exiger_droit_opportunite(o);
  if o.statut = 'ouverte' then
    raise exception 'Opportunité déjà ouverte';
  end if;
  if not exists (select 1 from public.crm_etapes where id = p_etape_id and etablissement_id = o.etablissement_id and actif and nature = 'ouverte') then
    raise exception 'Choisissez une étape ouverte';
  end if;
  perform public.deplacer_opportunite(o.id, p_etape_id);
end
$$;

-- Crée le devis (module Facturation) d'une opportunité et l'y rattache ; l'opportunité passe à l'étape « Proposition » si elle existe.
create function public.creer_devis_opportunite(p_opportunite_id uuid, p_lignes jsonb default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.crm_opportunites%rowtype;
  v_devis uuid;
  v_etape uuid;
begin
  select * into o from public.crm_opportunites where id = p_opportunite_id for update;
  if o.id is null then
    raise exception 'Opportunité introuvable';
  end if;
  perform public.exiger_droit_opportunite(o);
  if o.statut <> 'ouverte' then
    raise exception 'Opportunité clôturée';
  end if;
  if o.document_vente_id is not null and exists (
    select 1 from public.documents_vente where id = o.document_vente_id and statut not in ('annule', 'refuse')) then
    raise exception 'Un devis est déjà lié à cette opportunité';
  end if;
  v_devis := public.enregistrer_document_vente(o.etablissement_id, jsonb_build_object(
    'type', 'devis', 'contact_id', o.contact_id, 'objet', o.titre,
    'lignes', coalesce(nullif(p_lignes, '[]'::jsonb),
      jsonb_build_array(jsonb_build_object('libelle', o.titre, 'quantite', 1, 'prix_unitaire', o.montant)))));
  select id into v_etape from public.crm_etapes
  where etablissement_id = o.etablissement_id and actif and nature = 'ouverte' and lower(nom) = 'proposition';
  update public.crm_opportunites set document_vente_id = v_devis, derniere_activite = now(),
    etape_id = coalesce(case when (select ordre from public.crm_etapes where id = v_etape) > (select ordre from public.crm_etapes where id = o.etape_id) then v_etape end, etape_id),
    probabilite = coalesce((select probabilite from public.crm_etapes where id = v_etape and ordre > (select ordre from public.crm_etapes where id = o.etape_id)), probabilite)
  where id = o.id;
  return v_devis;
end
$$;

-- Membres qui suivent des opportunités (noms pour les listes et l'attribution), sans exposer l'équipe entière.
create function public.crm_commerciaux(p_etablissement_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.lecture_autorisee(p_etablissement_id, 'crm_pipeline.lire') then
    raise exception 'Permission refusée : crm_pipeline.lire' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('user_id', u.id, 'nom', coalesce(nullif(p.nom_complet, ''), split_part(u.email, '@', 1)),
      'moi', u.id = auth.uid()) order by coalesce(p.nom_complet, u.email))
    from auth.users u left join public.profils p on p.id = u.id
    where u.id in (select public.membres_avec_permission(p_etablissement_id, 'crm_pipeline.gerer'))
       or u.id in (select responsable_id from public.crm_opportunites where etablissement_id = p_etablissement_id)
  ), '[]'::jsonb);
end
$$;

create function public.tableau_de_bord_crm(p_etablissement_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  fuseau text := coalesce((select e.fuseau from public.etablissements e where e.id = p_etablissement_id), 'UTC');
  aujourdhui date := public.date_locale(p_etablissement_id);
  seuil integer := coalesce((public.parametre_module(p_etablissement_id, 'crm_pipeline', 'jours_sans_activite') #>> '{}')::integer, 14);
begin
  if not public.lecture_autorisee(p_etablissement_id, 'crm_pipeline.lire') then
    raise exception 'Permission refusée : crm_pipeline.lire' using errcode = '42501';
  end if;
  return (
    with o as (select * from public.crm_opportunites where etablissement_id = p_etablissement_id),
    a as (select * from public.crm_activites where etablissement_id = p_etablissement_id and statut = 'a_faire'),
    mois as (select * from o where statut <> 'ouverte' and (cloturee_le at time zone fuseau)::date >= date_trunc('month', aujourdhui)::date)
    select jsonb_build_object(
      'ouvertes', (select count(*) from o where statut = 'ouverte'),
      'valeur_pipeline', coalesce((select sum(montant) from o where statut = 'ouverte'), 0),
      'valeur_ponderee', coalesce((select round(sum(montant * probabilite / 100.0), 2) from o where statut = 'ouverte'), 0),
      'gagnees_mois', (select count(*) from mois where statut = 'gagnee'),
      'gagne_mois', coalesce((select sum(montant) from mois where statut = 'gagnee'), 0),
      'perdues_mois', (select count(*) from mois where statut = 'perdue'),
      'taux_conversion', (select case when count(*) = 0 then null else round(100.0 * count(*) filter (where statut = 'gagnee') / count(*)) end
                          from o where statut <> 'ouverte'),
      'activites_retard', (select count(*) from a where echeance < now()),
      'activites_jour', (select count(*) from a where (echeance at time zone fuseau)::date = aujourdhui),
      'mes_activites_retard', (select count(*) from a where echeance < now() and assigne_a = auth.uid()),
      'sans_activite', (select count(*) from o where statut = 'ouverte' and derniere_activite < now() - make_interval(days => seuil)),
      'prospects', (select count(*) from public.contacts where etablissement_id = p_etablissement_id and type = 'prospect' and actif),
      'par_etape', coalesce((select jsonb_agg(jsonb_build_object('etape_id', e.id, 'nom', e.nom, 'nombre', x.n, 'montant', x.m) order by e.ordre)
                             from public.crm_etapes e
                             cross join lateral (select count(*) n, coalesce(sum(montant), 0) m from o where o.etape_id = e.id and o.statut = 'ouverte') x
                             where e.etablissement_id = p_etablissement_id and e.actif and e.nature = 'ouverte'), '[]'::jsonb),
      'par_source', coalesce((select jsonb_agg(jsonb_build_object('source', s, 'gagnees', g, 'total', t) order by g desc)
                              from (select coalesce(source, 'autre') s, count(*) filter (where statut = 'gagnee') g, count(*) t from o group by 1) x), '[]'::jsonb)
    )
  );
end
$$;

-- ---------------------------------------------------------------------------
-- 5. Disponibilité et droits d'exécution
-- ---------------------------------------------------------------------------
update public.modules set statut = 'actif', version = '1.0' where id = 'crm_pipeline';

do $$
declare signature text;
begin
  foreach signature in array array[
    'public.crm_initialiser(uuid)',
    'public.enregistrer_etape_crm(uuid, jsonb)',
    'public.enregistrer_opportunite(uuid, jsonb)',
    'public.deplacer_opportunite(uuid, uuid, text)',
    'public.enregistrer_activite_crm(uuid, jsonb)',
    'public.terminer_activite_crm(uuid, text, boolean)',
    'public.rouvrir_opportunite(uuid, uuid)',
    'public.creer_devis_opportunite(uuid, jsonb)',
    'public.tableau_de_bord_crm(uuid)',
    'public.crm_commerciaux(uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon', signature);
    execute format('grant execute on function %s to authenticated', signature);
  end loop;
  revoke execute on function public.exiger_droit_opportunite(public.crm_opportunites) from public, anon, authenticated;
end
$$;
