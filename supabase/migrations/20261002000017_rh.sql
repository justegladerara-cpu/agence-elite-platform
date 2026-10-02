-- Ressources humaines (2026-10-02) : trois modules du catalogue, jusqu'ici « Prévus », deviennent réels.
--   rh_employes  : employés, organisation (départements, postes, managers), contrats, dossier, espace employé ;
--   rh_presences : horaires, planning (créneaux), pointages, retards, corrections tracées ;
--   rh_conges    : demandes d'absence, validation (RH ou manager), soldes, jours fériés.
-- Pas de paie : aucune règle sociale ou fiscale n'est définie. Le salaire de base du contrat et l'export
-- des présences/absences préparent une paie future (docs/RH.md).
-- Règles : écritures par fonctions (permission + module + établissement en service), lecture par RLS,
-- aucune suppression, journal d'audit, données personnelles séparées de l'annuaire.

-- ---------------------------------------------------------------------------
-- 0. Outils
-- ---------------------------------------------------------------------------
-- Date et heure locales de l'établissement (son fuseau).
create function public.date_locale(p_etablissement_id uuid, p_instant timestamptz default now())
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select (p_instant at time zone coalesce((select fuseau from public.etablissements where id = p_etablissement_id), 'UTC'))::date
$$;

create function public.heure_locale(p_etablissement_id uuid, p_instant timestamptz)
returns time
language sql
stable
security definer
set search_path = ''
as $$
  select (p_instant at time zone coalesce((select fuseau from public.etablissements where id = p_etablissement_id), 'UTC'))::time
$$;

-- Format « HH:MM » (00:00 à 23:59).
create function public.heure_valide(p text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p is not null and p ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
$$;

-- ---------------------------------------------------------------------------
-- 1. Catalogue : les modules RH passent « En développement » puis « Disponible » en fin de migration
-- ---------------------------------------------------------------------------
update public.modules set
  description = 'Fiches employés, départements, postes, managers, contrats, dossier numérique et espace employé.',
  documentation = 'docs/RH.md',
  parametres_schema = '[]'::jsonb
where id = 'rh_employes';
update public.modules set
  description = 'Horaires, planning, pointage arrivée/départ, retards, corrections tracées.',
  documentation = 'docs/RH.md',
  parametres_schema = '[
    {"cle": "tolerance_retard", "libelle": "Tolérance avant retard (minutes)", "type": "nombre", "defaut": 10},
    {"cle": "pointage_libre", "libelle": "Autoriser le pointage depuis l''espace employé", "type": "booleen", "defaut": true}
  ]'::jsonb
where id = 'rh_presences';
update public.modules set
  description = 'Demandes de congés et absences, validation, soldes annuels, jours fériés.',
  documentation = 'docs/RH.md',
  parametres_schema = '[
    {"cle": "jours_conges_annuels", "libelle": "Droit annuel de congés payés (jours ouvrables, à adapter à votre législation)", "type": "nombre", "defaut": 30},
    {"cle": "jours_travailles", "libelle": "Jours travaillés (1 = lundi … 7 = dimanche, séparés par des virgules)", "type": "texte", "defaut": "1,2,3,4,5,6"}
  ]'::jsonb
where id = 'rh_conges';

insert into public.permissions (id, module_id, description) values
  ('rh_employes.lire', 'rh_employes', 'Voir l''annuaire des employés et l''organisation'),
  ('rh_employes.gerer', 'rh_employes', 'Créer et modifier les employés, départements, postes et contrats'),
  ('rh_employes.confidentiel', 'rh_employes', 'Voir les données personnelles, contrats, salaires et documents RH'),
  ('rh_employes.espace', 'rh_employes', 'Accéder à son espace employé (fiche, documents)'),
  ('rh_presences.lire', 'rh_presences', 'Voir les présences, retards et plannings'),
  ('rh_presences.gerer', 'rh_presences', 'Corriger les pointages, gérer horaires et planning'),
  ('rh_presences.pointer', 'rh_presences', 'Pointer son arrivée et son départ'),
  ('rh_conges.lire', 'rh_conges', 'Voir les absences et les soldes'),
  ('rh_conges.demander', 'rh_conges', 'Demander un congé ou déclarer une absence pour soi'),
  ('rh_conges.valider', 'rh_conges', 'Valider ou refuser les demandes, ajuster les soldes, jours fériés')
on conflict do nothing;

insert into public.roles (id, nom, description, ordre, modules_requis) values
  ('responsable_rh', 'Responsable RH', 'Employés, contrats, présences et congés', 35, '{rh_employes}'),
  ('collaborateur', 'Collaborateur', 'Son espace employé : pointage, congés, documents', 65, '{rh_employes}')
on conflict (id) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r, p from unnest(array['gerant', 'responsable', 'responsable_rh']) r
cross join unnest(array['rh_employes.lire', 'rh_employes.gerer', 'rh_employes.confidentiel', 'rh_employes.espace',
  'rh_presences.lire', 'rh_presences.gerer', 'rh_presences.pointer', 'rh_conges.lire', 'rh_conges.demander', 'rh_conges.valider']) p
on conflict do nothing;
insert into public.role_permissions (role_id, permission_id) values
  ('responsable_rh', 'etablissement.lire'), ('responsable_rh', 'membres.lire'), ('responsable_rh', 'tableau_de_bord.lire'),
  ('responsable_rh', 'documents.lire'),
  ('responsable_hub', 'rh_employes.lire'), ('responsable_hub', 'rh_presences.lire'), ('responsable_hub', 'rh_presences.gerer'),
  ('responsable_hub', 'rh_conges.lire'),
  ('comptable', 'rh_employes.lire'), ('comptable', 'rh_employes.confidentiel'), ('comptable', 'rh_presences.lire'), ('comptable', 'rh_conges.lire'),
  ('lecteur', 'rh_employes.lire'), ('lecteur', 'rh_presences.lire'), ('lecteur', 'rh_conges.lire'),
  ('collaborateur', 'etablissement.lire')
on conflict do nothing;
insert into public.role_permissions (role_id, permission_id)
select r, p from unnest(array['responsable_hub', 'gestionnaire_depot', 'employe', 'comptable', 'lecteur', 'collaborateur']) r
cross join unnest(array['rh_employes.espace', 'rh_presences.pointer', 'rh_conges.demander']) p
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 2. Tables
-- ---------------------------------------------------------------------------
create table public.rh_departements (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  nom text not null check (length(btrim(nom)) between 1 and 80),
  code text check (code is null or code ~ '^[A-Z0-9-]{1,12}$'),
  parent_id uuid references public.rh_departements(id) on delete restrict,
  responsable_id uuid,
  description text check (description is null or length(description) <= 300),
  actif boolean not null default true,
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  unique (etablissement_id, nom),
  unique (id, etablissement_id)
);

create table public.rh_postes (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  intitule text not null check (length(btrim(intitule)) between 1 and 80),
  departement_id uuid,
  description text check (description is null or length(description) <= 600),
  actif boolean not null default true,
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  unique (etablissement_id, intitule),
  unique (id, etablissement_id),
  foreign key (departement_id, etablissement_id) references public.rh_departements(id, etablissement_id) on delete restrict
);

-- Modèle d'horaires hebdomadaires : [{ "jour": 1..7, "debut": "08:00", "fin": "17:00", "pause": 60 }]
create table public.rh_horaires (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  nom text not null check (length(btrim(nom)) between 1 and 60),
  jours jsonb not null default '[]' check (jsonb_typeof(jours) = 'array' and jsonb_array_length(jours) <= 7),
  actif boolean not null default true,
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  unique (etablissement_id, nom),
  unique (id, etablissement_id)
);

create table public.rh_employes (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  matricule text not null,
  prenom text not null check (length(btrim(prenom)) between 1 and 60),
  nom text not null check (length(btrim(nom)) between 1 and 60),
  sexe text check (sexe is null or sexe in ('F', 'M')),
  telephone text check (telephone is null or length(telephone) <= 30),
  email text check (email is null or (length(email) <= 120 and email = lower(email))),
  photo text check (public.image_acceptable(photo) and (photo is null or length(photo) <= 400000)),
  departement_id uuid,
  poste_id uuid,
  manager_id uuid,
  hub_id uuid,
  horaire_id uuid,
  user_id uuid references auth.users(id) on delete restrict,
  date_entree date not null default current_date,
  date_sortie date,
  motif_sortie text,
  statut text not null default 'actif' check (statut in ('actif', 'suspendu', 'sorti')),
  notes text check (notes is null or length(notes) <= 2000),
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  unique (etablissement_id, matricule),
  unique (id, etablissement_id),
  check (manager_id is null or manager_id <> id),
  check (date_sortie is null or date_sortie >= date_entree),
  check (statut <> 'sorti' or (date_sortie is not null and btrim(coalesce(motif_sortie, '')) <> '')),
  foreign key (departement_id, etablissement_id) references public.rh_departements(id, etablissement_id) on delete restrict,
  foreign key (poste_id, etablissement_id) references public.rh_postes(id, etablissement_id) on delete restrict,
  foreign key (manager_id, etablissement_id) references public.rh_employes(id, etablissement_id) on delete restrict,
  foreign key (hub_id, etablissement_id) references public.hubs(id, etablissement_id) on delete restrict,
  foreign key (horaire_id, etablissement_id) references public.rh_horaires(id, etablissement_id) on delete restrict
);
create unique index rh_employes_compte_unique on public.rh_employes(etablissement_id, user_id) where user_id is not null;
create index rh_employes_manager_id_idx on public.rh_employes(manager_id);
create index rh_employes_departement_id_idx on public.rh_employes(departement_id);
create index rh_employes_user_id_idx on public.rh_employes(user_id);
alter table public.rh_departements add constraint rh_departements_responsable_fk
  foreign key (responsable_id, etablissement_id) references public.rh_employes(id, etablissement_id) on delete restrict;
alter table public.rh_departements add constraint rh_departements_parent_fk
  foreign key (parent_id, etablissement_id) references public.rh_departements(id, etablissement_id) on delete restrict;

-- Données personnelles : lues seulement avec le droit « confidentiel » ou par l'employé lui-même.
create table public.rh_employes_prives (
  employe_id uuid primary key,
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  date_naissance date,
  lieu_naissance text check (lieu_naissance is null or length(lieu_naissance) <= 80),
  nationalite text check (nationalite is null or length(nationalite) <= 60),
  adresse text check (adresse is null or length(adresse) <= 200),
  situation_familiale text check (situation_familiale is null or length(situation_familiale) <= 40),
  enfants integer check (enfants is null or enfants between 0 and 30),
  piece_identite text check (piece_identite is null or length(piece_identite) <= 60),
  numero_securite_sociale text check (numero_securite_sociale is null or length(numero_securite_sociale) <= 40),
  contact_urgence_nom text check (contact_urgence_nom is null or length(contact_urgence_nom) <= 80),
  contact_urgence_telephone text check (contact_urgence_telephone is null or length(contact_urgence_telephone) <= 30),
  mode_paiement_salaire text check (mode_paiement_salaire is null or mode_paiement_salaire in ('especes', 'mobile_money', 'virement', 'cheque')),
  coordonnees_paiement text check (coordonnees_paiement is null or length(coordonnees_paiement) <= 80),
  modifie_le timestamptz not null default now(),
  foreign key (employe_id, etablissement_id) references public.rh_employes(id, etablissement_id) on delete restrict
);

create table public.rh_contrats (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  employe_id uuid not null,
  numero text not null,
  type text not null check (type in ('cdi', 'cdd', 'stage', 'apprentissage', 'prestation', 'journalier', 'autre')),
  poste_id uuid,
  intitule text check (intitule is null or length(intitule) <= 80),
  debut date not null,
  fin date,
  fin_periode_essai date,
  salaire_base numeric(14, 2) check (salaire_base is null or (salaire_base >= 0 and salaire_base < 1000000000)),
  periodicite text not null default 'mensuel' check (periodicite in ('mensuel', 'journalier', 'horaire', 'forfait')),
  heures_hebdo numeric(5, 2) check (heures_hebdo is null or heures_hebdo between 0 and 84),
  statut text not null default 'actif' check (statut in ('actif', 'termine', 'rompu')),
  termine_le date,
  motif_fin text,
  notes text check (notes is null or length(notes) <= 1000),
  cree_par uuid not null references auth.users(id) on delete restrict,
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  unique (etablissement_id, numero),
  check (fin is null or fin >= debut),
  check (fin_periode_essai is null or fin_periode_essai >= debut),
  check (type <> 'cdd' or fin is not null),
  check (statut = 'actif' or (termine_le is not null and btrim(coalesce(motif_fin, '')) <> '')),
  foreign key (employe_id, etablissement_id) references public.rh_employes(id, etablissement_id) on delete restrict,
  foreign key (poste_id, etablissement_id) references public.rh_postes(id, etablissement_id) on delete restrict
);
create unique index rh_contrats_un_actif on public.rh_contrats(employe_id) where statut = 'actif';
create index rh_contrats_etablissement_fin_idx on public.rh_contrats(etablissement_id, fin);

create table public.rh_jours_feries (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  jour date not null,
  libelle text not null check (length(btrim(libelle)) between 1 and 80),
  actif boolean not null default true,
  cree_le timestamptz not null default now(),
  unique (etablissement_id, jour)
);

-- Planning : créneaux prévus (remplacent l'horaire type ce jour-là).
create table public.rh_creneaux (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  employe_id uuid not null,
  hub_id uuid,
  jour date not null,
  debut time not null,
  fin time not null,
  note text check (note is null or length(note) <= 200),
  statut text not null default 'prevu' check (statut in ('prevu', 'annule')),
  cree_par uuid not null references auth.users(id) on delete restrict,
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  check (fin <> debut),
  foreign key (employe_id, etablissement_id) references public.rh_employes(id, etablissement_id) on delete restrict,
  foreign key (hub_id, etablissement_id) references public.hubs(id, etablissement_id) on delete restrict
);
create unique index rh_creneaux_un_par_jour on public.rh_creneaux(employe_id, jour) where statut = 'prevu';
create index rh_creneaux_etablissement_jour_idx on public.rh_creneaux(etablissement_id, jour);

create table public.rh_pointages (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  employe_id uuid not null,
  hub_id uuid,
  jour date not null,
  arrivee timestamptz not null,
  depart timestamptz,
  retard_minutes integer not null default 0 check (retard_minutes >= 0),
  source text not null default 'employe' check (source in ('employe', 'manager')),
  note text check (note is null or length(note) <= 200),
  corrige boolean not null default false,
  motif_correction text,
  cree_par uuid not null references auth.users(id) on delete restrict,
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  check (depart is null or depart > arrivee),
  check (depart is null or depart - arrivee <= interval '24 hours'),
  check (not corrige or btrim(coalesce(motif_correction, '')) <> ''),
  foreign key (employe_id, etablissement_id) references public.rh_employes(id, etablissement_id) on delete restrict,
  foreign key (hub_id, etablissement_id) references public.hubs(id, etablissement_id) on delete restrict
);
create unique index rh_pointages_un_par_jour on public.rh_pointages(employe_id, jour);
create index rh_pointages_etablissement_jour_idx on public.rh_pointages(etablissement_id, jour desc);

create table public.rh_absences (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  employe_id uuid not null,
  type text not null check (type in ('conge_paye', 'maladie', 'sans_solde', 'maternite', 'paternite', 'evenement_familial', 'formation', 'recuperation', 'autre')),
  debut date not null,
  fin date not null,
  demi_journee_debut boolean not null default false,
  demi_journee_fin boolean not null default false,
  jours numeric(5, 1) not null check (jours > 0),
  motif text check (motif is null or length(motif) <= 500),
  statut text not null default 'demandee' check (statut in ('demandee', 'approuvee', 'refusee', 'annulee')),
  demandee_par uuid not null references auth.users(id) on delete restrict,
  demandee_le timestamptz not null default now(),
  decidee_par uuid references auth.users(id) on delete restrict,
  decidee_le timestamptz,
  commentaire_decision text check (commentaire_decision is null or length(commentaire_decision) <= 500),
  annulee_par uuid references auth.users(id) on delete restrict,
  annulee_le timestamptz,
  motif_annulation text,
  check (fin >= debut),
  check (statut not in ('approuvee', 'refusee') or (decidee_par is not null and decidee_le is not null)),
  check (statut <> 'annulee' or (annulee_par is not null and annulee_le is not null and btrim(coalesce(motif_annulation, '')) <> '')),
  foreign key (employe_id, etablissement_id) references public.rh_employes(id, etablissement_id) on delete restrict
);
create index rh_absences_employe_idx on public.rh_absences(employe_id, debut);
create index rh_absences_etablissement_idx on public.rh_absences(etablissement_id, debut desc);

-- Ajustements de solde de congés (reprise d'ancienneté, report, correction) : ajout seul.
create table public.rh_ajustements_conges (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  employe_id uuid not null,
  annee integer not null check (annee between 2000 and 2100),
  jours numeric(5, 1) not null check (jours <> 0 and abs(jours) <= 366),
  motif text not null check (length(btrim(motif)) between 1 and 300),
  auteur uuid not null references auth.users(id) on delete restrict,
  cree_le timestamptz not null default now(),
  foreign key (employe_id, etablissement_id) references public.rh_employes(id, etablissement_id) on delete restrict
);
create index rh_ajustements_conges_employe_idx on public.rh_ajustements_conges(employe_id, annee);

-- Protections, audit, RLS activée -------------------------------------------------
do $$
declare
  nom_table text;
begin
  foreach nom_table in array array['rh_departements', 'rh_postes', 'rh_horaires', 'rh_employes', 'rh_contrats', 'rh_creneaux', 'rh_pointages'] loop
    execute format('create trigger %I_modifie_le before update on public.%I for each row execute function public.fixer_modifie_le()', nom_table, nom_table);
  end loop;
  execute 'create trigger rh_employes_prives_modifie_le before update on public.rh_employes_prives for each row execute function public.fixer_modifie_le()';
  foreach nom_table in array array['rh_departements', 'rh_postes', 'rh_horaires', 'rh_employes', 'rh_employes_prives', 'rh_contrats',
    'rh_jours_feries', 'rh_creneaux', 'rh_pointages', 'rh_absences', 'rh_ajustements_conges'] loop
    execute format('create trigger %I_sans_suppression before delete on public.%I for each row execute function public.refuser_suppression()', nom_table, nom_table);
    execute format('create trigger %I_verrou_etablissement before update on public.%I for each row execute function public.verrouiller_etablissement_id()', nom_table, nom_table);
    execute format('create trigger %I_audit after insert or update or delete on public.%I for each row execute function public.journaliser_modification()', nom_table, nom_table);
    execute format('alter table public.%I enable row level security', nom_table);
  end loop;
end
$$;
create trigger rh_ajustements_conges_immuables before update on public.rh_ajustements_conges
for each row execute function public.refuser_modification();

-- Une absence décidée ou annulée ne revient pas en arrière ; ses dates ne changent plus après la demande.
create function public.proteger_absence()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.statut in ('refusee', 'annulee') then
    raise exception 'Cette absence est clôturée';
  end if;
  if (new.employe_id, new.type, new.debut, new.fin, new.demi_journee_debut, new.demi_journee_fin, new.jours, new.demandee_par, new.demandee_le)
     is distinct from
     (old.employe_id, old.type, old.debut, old.fin, old.demi_journee_debut, old.demi_journee_fin, old.jours, old.demandee_par, old.demandee_le) then
    raise exception 'Une demande d''absence ne se modifie pas : annulez-la et faites une nouvelle demande';
  end if;
  if old.statut = 'approuvee' and new.statut not in ('approuvee', 'annulee') then
    raise exception 'Une absence approuvée ne peut qu''être annulée';
  end if;
  return new;
end
$$;
create trigger rh_absences_protection before update on public.rh_absences
for each row execute function public.proteger_absence();

-- ---------------------------------------------------------------------------
-- 3. Accès personnels : soi-même, et manager (direct ou indirect)
-- ---------------------------------------------------------------------------
create function public.rh_mon_employe(p_etablissement_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select e.id from public.rh_employes e
  where e.etablissement_id = p_etablissement_id and e.user_id = auth.uid() and e.statut <> 'sorti'
    and public.est_membre(p_etablissement_id)
$$;

create function public.rh_est_moi(p_employe_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.rh_employes e
    where e.id = p_employe_id and e.user_id = auth.uid() and e.statut <> 'sorti'
      and public.est_membre(e.etablissement_id)
      and public.module_actif(e.etablissement_id, 'rh_employes')
  )
$$;

-- Vrai si l'utilisateur connecté est le manager (direct ou au-dessus) de cet employé.
create function public.rh_est_manager_de(p_employe_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with recursive chaine as (
    select e.manager_id, 1 as profondeur from public.rh_employes e where e.id = p_employe_id
    union all
    select e.manager_id, c.profondeur + 1 from chaine c join public.rh_employes e on e.id = c.manager_id
    where c.profondeur < 12
  )
  select exists (
    select 1 from chaine c join public.rh_employes m on m.id = c.manager_id
    where m.user_id = auth.uid() and m.statut = 'actif'
      and public.est_membre(m.etablissement_id)
      and public.module_actif(m.etablissement_id, 'rh_employes')
  )
$$;

-- L'employé est propriétaire de son dossier et de ses absences (pièces non confidentielles).
create or replace function public.proprietaire_objet(p_objet_type text, p_objet_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_objet_type = 'rh_employe' then
    return public.rh_est_moi(p_objet_id);
  elsif p_objet_type = 'rh_absence' then
    return exists (select 1 from public.rh_absences a where a.id = p_objet_id and public.rh_est_moi(a.employe_id));
  end if;
  return false;
end
$$;

insert into public.types_pieces_jointes (objet_type, table_nom, module_id, permission_lire, permission_ecrire, libelle) values
  ('rh_employe', 'rh_employes', 'rh_employes', 'rh_employes.confidentiel', 'rh_employes.gerer', 'Dossier employé'),
  ('rh_absence', 'rh_absences', 'rh_conges', 'rh_conges.lire', 'rh_conges.valider', 'Justificatif d''absence')
on conflict (objet_type) do nothing;

-- Politiques de lecture -------------------------------------------------------------
create policy lecture on public.rh_departements for select to authenticated
using (public.lecture_autorisee(etablissement_id, 'rh_employes.lire') or public.a_permission(etablissement_id, 'rh_employes.espace'));
create policy lecture on public.rh_postes for select to authenticated
using (public.lecture_autorisee(etablissement_id, 'rh_employes.lire') or public.a_permission(etablissement_id, 'rh_employes.espace'));
create policy lecture on public.rh_horaires for select to authenticated
using (public.lecture_autorisee(etablissement_id, 'rh_employes.lire') or public.lecture_autorisee(etablissement_id, 'rh_presences.lire')
  or public.a_permission(etablissement_id, 'rh_employes.espace'));
create policy lecture on public.rh_jours_feries for select to authenticated
using (public.lecture_autorisee(etablissement_id, 'rh_conges.lire') or public.a_permission(etablissement_id, 'rh_conges.demander')
  or public.lecture_autorisee(etablissement_id, 'rh_presences.lire'));
create policy lecture on public.rh_employes for select to authenticated
using (public.lecture_autorisee(etablissement_id, 'rh_employes.lire') or public.rh_est_moi(id) or public.rh_est_manager_de(id));
create policy lecture on public.rh_employes_prives for select to authenticated
using (public.lecture_autorisee(etablissement_id, 'rh_employes.confidentiel') or public.rh_est_moi(employe_id));
create policy lecture on public.rh_contrats for select to authenticated
using (public.lecture_autorisee(etablissement_id, 'rh_employes.confidentiel') or public.rh_est_moi(employe_id));
create policy lecture on public.rh_creneaux for select to authenticated
using (public.lecture_autorisee(etablissement_id, 'rh_presences.lire') or public.rh_est_moi(employe_id) or public.rh_est_manager_de(employe_id));
create policy lecture on public.rh_pointages for select to authenticated
using ((public.lecture_autorisee(etablissement_id, 'rh_presences.lire') and public.lecture_hub(etablissement_id, hub_id))
  or public.rh_est_moi(employe_id) or public.rh_est_manager_de(employe_id));
create policy lecture on public.rh_absences for select to authenticated
using (public.lecture_autorisee(etablissement_id, 'rh_conges.lire') or public.rh_est_moi(employe_id) or public.rh_est_manager_de(employe_id));
create policy lecture on public.rh_ajustements_conges for select to authenticated
using (public.lecture_autorisee(etablissement_id, 'rh_conges.lire') or public.rh_est_moi(employe_id));

-- ---------------------------------------------------------------------------
-- 4. Calculs
-- ---------------------------------------------------------------------------
create function public.rh_jours_travailles(p_etablissement_id uuid)
returns integer[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  brut text := coalesce(public.parametre_module(p_etablissement_id, 'rh_conges', 'jours_travailles') #>> '{}', '1,2,3,4,5,6');
  jours integer[];
begin
  select array_agg(distinct j::integer) into jours
  from regexp_split_to_table(brut, '\s*,\s*') j where j ~ '^[1-7]$';
  return coalesce(jours, array[1, 2, 3, 4, 5, 6]);
end
$$;

-- Jours ouvrables d'une période (jours travaillés, hors jours fériés actifs), demi-journées déduites.
create function public.rh_jours_ouvrables(p_etablissement_id uuid, p_debut date, p_fin date,
  p_demi_debut boolean default false, p_demi_fin boolean default false)
returns numeric
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  travailles integer[] := public.rh_jours_travailles(p_etablissement_id);
  total numeric;
  ouvre_debut boolean;
  ouvre_fin boolean;
begin
  if p_debut is null or p_fin is null or p_fin < p_debut or p_fin - p_debut > 366 then
    raise exception 'Période invalide';
  end if;
  select count(*) into total
  from generate_series(p_debut, p_fin, interval '1 day') d
  where extract(isodow from d)::integer = any (travailles)
    and not exists (select 1 from public.rh_jours_feries f where f.etablissement_id = p_etablissement_id and f.jour = d::date and f.actif);
  ouvre_debut := extract(isodow from p_debut)::integer = any (travailles)
    and not exists (select 1 from public.rh_jours_feries f where f.etablissement_id = p_etablissement_id and f.jour = p_debut and f.actif);
  ouvre_fin := extract(isodow from p_fin)::integer = any (travailles)
    and not exists (select 1 from public.rh_jours_feries f where f.etablissement_id = p_etablissement_id and f.jour = p_fin and f.actif);
  if p_demi_debut and ouvre_debut then
    total := total - 0.5;
  end if;
  if p_demi_fin and ouvre_fin and p_fin <> p_debut then
    total := total - 0.5;
  end if;
  return total;
end
$$;

-- Solde de congés payés d'une année : droit (au prorata de l'entrée/sortie) + ajustements − pris (approuvés).
create function public.rh_solde_conges(p_employe_id uuid, p_annee integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  employe public.rh_employes%rowtype;
  annuel numeric;
  debut_droit date;
  fin_droit date;
  droit numeric := 0;
  ajustements numeric;
  pris numeric;
  attente numeric;
begin
  select * into employe from public.rh_employes where id = p_employe_id;
  if employe.id is null then
    return null;
  end if;
  annuel := coalesce((public.parametre_module(employe.etablissement_id, 'rh_conges', 'jours_conges_annuels') #>> '{}')::numeric, 30);
  debut_droit := greatest(make_date(p_annee, 1, 1), employe.date_entree);
  fin_droit := least(make_date(p_annee, 12, 31), coalesce(employe.date_sortie, make_date(p_annee, 12, 31)));
  if fin_droit >= debut_droit then
    droit := round(annuel * ((fin_droit - debut_droit + 1)::numeric / (make_date(p_annee, 12, 31) - make_date(p_annee, 1, 1) + 1)) * 2) / 2;
  end if;
  select coalesce(sum(jours), 0) into ajustements from public.rh_ajustements_conges where employe_id = p_employe_id and annee = p_annee;
  select coalesce(sum(jours) filter (where statut = 'approuvee'), 0), coalesce(sum(jours) filter (where statut = 'demandee'), 0)
  into pris, attente
  from public.rh_absences
  where employe_id = p_employe_id and type = 'conge_paye' and extract(year from debut)::integer = p_annee;
  return jsonb_build_object('annee', p_annee, 'droit', droit, 'ajustements', ajustements, 'pris', pris,
    'en_attente', attente, 'solde', droit + ajustements - pris);
end
$$;

-- Début prévu d'une journée pour un employé : créneau du planning, sinon horaire type.
create function public.rh_debut_prevu(p_employe_id uuid, p_jour date)
returns time
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select c.debut from public.rh_creneaux c where c.employe_id = p_employe_id and c.jour = p_jour and c.statut = 'prevu'),
    (select (j ->> 'debut')::time
     from public.rh_employes e
     join public.rh_horaires h on h.id = e.horaire_id
     cross join jsonb_array_elements(h.jours) j
     where e.id = p_employe_id and (j ->> 'jour')::integer = extract(isodow from p_jour)::integer
     limit 1)
  )
$$;

-- ---------------------------------------------------------------------------
-- 5. Organisation : départements, postes, horaires, jours fériés
-- ---------------------------------------------------------------------------
create function public.rh_enregistrer_departement(p_etablissement_id uuid, p_departement jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  resultat uuid := nullif(p_departement ->> 'id', '')::uuid;
  parent uuid := nullif(p_departement ->> 'parent_id', '')::uuid;
  responsable uuid := nullif(p_departement ->> 'responsable_id', '')::uuid;
  remonte uuid;
begin
  perform public.exiger_permission(p_etablissement_id, 'rh_employes.gerer');
  if parent is not null and not exists (select 1 from public.rh_departements where id = parent and etablissement_id = p_etablissement_id) then
    raise exception 'Département parent introuvable';
  end if;
  if responsable is not null and not exists (select 1 from public.rh_employes where id = responsable and etablissement_id = p_etablissement_id) then
    raise exception 'Responsable introuvable dans cet établissement';
  end if;
  if resultat is null then
    insert into public.rh_departements (etablissement_id, nom, code, parent_id, responsable_id, description)
    values (p_etablissement_id, btrim(p_departement ->> 'nom'), nullif(upper(btrim(p_departement ->> 'code')), ''), parent, responsable,
            nullif(btrim(p_departement ->> 'description'), ''))
    returning id into resultat;
  else
    remonte := parent;
    while remonte is not null loop
      if remonte = resultat then
        raise exception 'Un département ne peut pas dépendre de lui-même';
      end if;
      select parent_id into remonte from public.rh_departements where id = remonte;
    end loop;
    update public.rh_departements set
      nom = btrim(p_departement ->> 'nom'),
      code = nullif(upper(btrim(p_departement ->> 'code')), ''),
      parent_id = parent,
      responsable_id = responsable,
      description = nullif(btrim(p_departement ->> 'description'), ''),
      actif = coalesce((p_departement ->> 'actif')::boolean, actif)
    where id = resultat and etablissement_id = p_etablissement_id;
    if not found then
      raise exception 'Département introuvable dans cet établissement';
    end if;
  end if;
  return resultat;
end
$$;

create function public.rh_enregistrer_poste(p_etablissement_id uuid, p_poste jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  resultat uuid := nullif(p_poste ->> 'id', '')::uuid;
  departement uuid := nullif(p_poste ->> 'departement_id', '')::uuid;
begin
  perform public.exiger_permission(p_etablissement_id, 'rh_employes.gerer');
  if departement is not null and not exists (select 1 from public.rh_departements where id = departement and etablissement_id = p_etablissement_id) then
    raise exception 'Département introuvable dans cet établissement';
  end if;
  if resultat is null then
    insert into public.rh_postes (etablissement_id, intitule, departement_id, description)
    values (p_etablissement_id, btrim(p_poste ->> 'intitule'), departement, nullif(btrim(p_poste ->> 'description'), ''))
    returning id into resultat;
  else
    update public.rh_postes set
      intitule = btrim(p_poste ->> 'intitule'),
      departement_id = departement,
      description = nullif(btrim(p_poste ->> 'description'), ''),
      actif = coalesce((p_poste ->> 'actif')::boolean, actif)
    where id = resultat and etablissement_id = p_etablissement_id;
    if not found then
      raise exception 'Poste introuvable dans cet établissement';
    end if;
  end if;
  return resultat;
end
$$;

create function public.rh_enregistrer_horaire(p_etablissement_id uuid, p_horaire jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  resultat uuid := nullif(p_horaire ->> 'id', '')::uuid;
  v_jours jsonb := coalesce(p_horaire -> 'jours', '[]'::jsonb);
  j jsonb;
  propres jsonb := '[]'::jsonb;
begin
  perform public.exiger_permission(p_etablissement_id, 'rh_presences.gerer');
  if jsonb_typeof(v_jours) <> 'array' then
    raise exception 'Horaires invalides';
  end if;
  for j in select * from jsonb_array_elements(v_jours) loop
    if jsonb_typeof(j) <> 'object' or coalesce(j ->> 'jour', '') !~ '^[1-7]$'
       or not public.heure_valide(j ->> 'debut') or not public.heure_valide(j ->> 'fin')
       or (j ->> 'debut') = (j ->> 'fin')
       or coalesce(j ->> 'pause', '0') !~ '^[0-9]{1,3}$' then
      raise exception 'Horaire invalide : jour de 1 à 7, heures HH:MM différentes, pause en minutes';
    end if;
    if propres @> jsonb_build_array(jsonb_build_object('jour', (j ->> 'jour')::integer)) then
      raise exception 'Un même jour apparaît deux fois';
    end if;
    propres := propres || jsonb_build_array(jsonb_build_object(
      'jour', (j ->> 'jour')::integer, 'debut', j ->> 'debut', 'fin', j ->> 'fin', 'pause', coalesce((j ->> 'pause')::integer, 0)));
  end loop;
  if resultat is null then
    insert into public.rh_horaires (etablissement_id, nom, jours)
    values (p_etablissement_id, btrim(p_horaire ->> 'nom'), propres)
    returning id into resultat;
  else
    update public.rh_horaires set
      nom = btrim(p_horaire ->> 'nom'), jours = propres, actif = coalesce((p_horaire ->> 'actif')::boolean, actif)
    where id = resultat and etablissement_id = p_etablissement_id;
    if not found then
      raise exception 'Horaire introuvable dans cet établissement';
    end if;
  end if;
  return resultat;
end
$$;

create function public.rh_enregistrer_jour_ferie(p_etablissement_id uuid, p_jour date, p_libelle text, p_actif boolean default true)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  resultat uuid;
begin
  perform public.exiger_permission(p_etablissement_id, 'rh_conges.valider');
  if p_jour is null then
    raise exception 'Date obligatoire';
  end if;
  insert into public.rh_jours_feries (etablissement_id, jour, libelle, actif)
  values (p_etablissement_id, p_jour, btrim(p_libelle), coalesce(p_actif, true))
  on conflict (etablissement_id, jour) do update set libelle = excluded.libelle, actif = excluded.actif
  returning id into resultat;
  return resultat;
end
$$;

-- ---------------------------------------------------------------------------
-- 6. Employés, comptes, sorties, contrats
-- ---------------------------------------------------------------------------
create function public.rh_enregistrer_employe(p_etablissement_id uuid, p_employe jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  resultat uuid := nullif(p_employe ->> 'id', '')::uuid;
  departement uuid := nullif(p_employe ->> 'departement_id', '')::uuid;
  poste uuid := nullif(p_employe ->> 'poste_id', '')::uuid;
  manager uuid := nullif(p_employe ->> 'manager_id', '')::uuid;
  hub uuid := nullif(p_employe ->> 'hub_id', '')::uuid;
  horaire uuid := nullif(p_employe ->> 'horaire_id', '')::uuid;
  remonte uuid;
  prive jsonb := p_employe -> 'prive';
begin
  perform public.exiger_permission(p_etablissement_id, 'rh_employes.gerer');
  if departement is not null and not exists (select 1 from public.rh_departements where id = departement and etablissement_id = p_etablissement_id) then
    raise exception 'Département introuvable dans cet établissement';
  end if;
  if poste is not null and not exists (select 1 from public.rh_postes where id = poste and etablissement_id = p_etablissement_id) then
    raise exception 'Poste introuvable dans cet établissement';
  end if;
  if manager is not null and not exists (select 1 from public.rh_employes where id = manager and etablissement_id = p_etablissement_id) then
    raise exception 'Manager introuvable dans cet établissement';
  end if;
  if hub is not null and not exists (select 1 from public.hubs where id = hub and etablissement_id = p_etablissement_id) then
    raise exception 'Hub introuvable dans cet établissement';
  end if;
  if horaire is not null and not exists (select 1 from public.rh_horaires where id = horaire and etablissement_id = p_etablissement_id) then
    raise exception 'Horaire introuvable dans cet établissement';
  end if;
  if resultat is null then
    insert into public.rh_employes (
      etablissement_id, matricule, prenom, nom, sexe, telephone, email, photo, departement_id, poste_id, manager_id, hub_id,
      horaire_id, date_entree, notes
    ) values (
      p_etablissement_id,
      coalesce(nullif(upper(btrim(p_employe ->> 'matricule')), ''), public.prochain_numero(p_etablissement_id, 'employe', 'EMP-')),
      btrim(p_employe ->> 'prenom'), btrim(p_employe ->> 'nom'), nullif(p_employe ->> 'sexe', ''),
      nullif(btrim(p_employe ->> 'telephone'), ''), nullif(lower(btrim(p_employe ->> 'email')), ''), nullif(p_employe ->> 'photo', ''),
      departement, poste, manager, hub, horaire,
      coalesce(nullif(p_employe ->> 'date_entree', '')::date, public.date_locale(p_etablissement_id)),
      nullif(btrim(p_employe ->> 'notes'), '')
    )
    returning id into resultat;
  else
    -- Pas de boucle hiérarchique.
    remonte := manager;
    while remonte is not null loop
      if remonte = resultat then
        raise exception 'Un employé ne peut pas être son propre manager (même indirectement)';
      end if;
      select manager_id into remonte from public.rh_employes where id = remonte;
    end loop;
    update public.rh_employes set
      matricule = coalesce(nullif(upper(btrim(p_employe ->> 'matricule')), ''), matricule),
      prenom = btrim(p_employe ->> 'prenom'),
      nom = btrim(p_employe ->> 'nom'),
      sexe = nullif(p_employe ->> 'sexe', ''),
      telephone = nullif(btrim(p_employe ->> 'telephone'), ''),
      email = nullif(lower(btrim(p_employe ->> 'email')), ''),
      photo = case when p_employe ? 'photo' then nullif(p_employe ->> 'photo', '') else photo end,
      departement_id = departement,
      poste_id = poste,
      manager_id = manager,
      hub_id = hub,
      horaire_id = horaire,
      date_entree = coalesce(nullif(p_employe ->> 'date_entree', '')::date, date_entree),
      notes = nullif(btrim(p_employe ->> 'notes'), ''),
      statut = case when statut = 'sorti' then statut
                    when p_employe ->> 'statut' in ('actif', 'suspendu') then p_employe ->> 'statut' else statut end
    where id = resultat and etablissement_id = p_etablissement_id;
    if not found then
      raise exception 'Employé introuvable dans cet établissement';
    end if;
  end if;
  -- Données personnelles : seulement avec le droit « confidentiel ».
  if prive is not null and jsonb_typeof(prive) = 'object' then
    perform public.exiger_permission(p_etablissement_id, 'rh_employes.confidentiel');
    insert into public.rh_employes_prives (
      employe_id, etablissement_id, date_naissance, lieu_naissance, nationalite, adresse, situation_familiale, enfants,
      piece_identite, numero_securite_sociale, contact_urgence_nom, contact_urgence_telephone, mode_paiement_salaire, coordonnees_paiement
    ) values (
      resultat, p_etablissement_id, nullif(prive ->> 'date_naissance', '')::date, nullif(btrim(prive ->> 'lieu_naissance'), ''),
      nullif(btrim(prive ->> 'nationalite'), ''), nullif(btrim(prive ->> 'adresse'), ''), nullif(btrim(prive ->> 'situation_familiale'), ''),
      nullif(prive ->> 'enfants', '')::integer, nullif(btrim(prive ->> 'piece_identite'), ''), nullif(btrim(prive ->> 'numero_securite_sociale'), ''),
      nullif(btrim(prive ->> 'contact_urgence_nom'), ''), nullif(btrim(prive ->> 'contact_urgence_telephone'), ''),
      nullif(prive ->> 'mode_paiement_salaire', ''), nullif(btrim(prive ->> 'coordonnees_paiement'), '')
    )
    on conflict (employe_id) do update set
      date_naissance = excluded.date_naissance, lieu_naissance = excluded.lieu_naissance, nationalite = excluded.nationalite,
      adresse = excluded.adresse, situation_familiale = excluded.situation_familiale, enfants = excluded.enfants,
      piece_identite = excluded.piece_identite, numero_securite_sociale = excluded.numero_securite_sociale,
      contact_urgence_nom = excluded.contact_urgence_nom, contact_urgence_telephone = excluded.contact_urgence_telephone,
      mode_paiement_salaire = excluded.mode_paiement_salaire, coordonnees_paiement = excluded.coordonnees_paiement;
  end if;
  return resultat;
end
$$;

-- Lien employé ↔ compte de connexion (membre de l'établissement) pour l'espace employé.
create function public.rh_lier_compte(p_etablissement_id uuid, p_employe_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.exiger_permission(p_etablissement_id, 'rh_employes.gerer');
  if not exists (select 1 from public.rh_employes where id = p_employe_id and etablissement_id = p_etablissement_id) then
    raise exception 'Employé introuvable dans cet établissement';
  end if;
  if p_user_id is not null and not exists (
    select 1 from public.etablissement_membres where etablissement_id = p_etablissement_id and user_id = p_user_id
  ) then
    raise exception 'Ce compte n''est pas membre de l''établissement : ajoutez-le d''abord à l''équipe';
  end if;
  if p_user_id is not null and exists (
    select 1 from public.rh_employes where etablissement_id = p_etablissement_id and user_id = p_user_id and id <> p_employe_id
  ) then
    raise exception 'Ce compte est déjà lié à un autre employé';
  end if;
  update public.rh_employes set user_id = p_user_id where id = p_employe_id;
end
$$;

-- Sortie : statut « sorti », contrat actif terminé à la même date. Rien n'est supprimé.
create function public.rh_sortie_employe(p_employe_id uuid, p_date date, p_motif text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  employe public.rh_employes%rowtype;
begin
  select * into employe from public.rh_employes where id = p_employe_id for update;
  if employe.id is null then
    raise exception 'Employé introuvable';
  end if;
  perform public.exiger_permission(employe.etablissement_id, 'rh_employes.gerer');
  if employe.statut = 'sorti' then
    raise exception 'Cet employé est déjà sorti des effectifs';
  end if;
  if coalesce(btrim(p_motif), '') = '' or p_date is null then
    raise exception 'La date et le motif de sortie sont obligatoires';
  end if;
  if p_date < employe.date_entree then
    raise exception 'La sortie ne peut pas précéder l''entrée';
  end if;
  update public.rh_contrats set statut = 'termine', termine_le = p_date, fin = coalesce(least(fin, p_date), p_date),
    motif_fin = 'Sortie : ' || btrim(p_motif)
  where employe_id = employe.id and statut = 'actif';
  update public.rh_employes set statut = 'sorti', date_sortie = p_date, motif_sortie = btrim(p_motif) where id = employe.id;
  -- Les employés qu'il encadrait remontent d'un niveau.
  update public.rh_employes set manager_id = employe.manager_id where manager_id = employe.id;
end
$$;

create function public.rh_enregistrer_contrat(p_etablissement_id uuid, p_contrat jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  resultat uuid := nullif(p_contrat ->> 'id', '')::uuid;
  employe public.rh_employes%rowtype;
  poste uuid := nullif(p_contrat ->> 'poste_id', '')::uuid;
  v_debut date := nullif(p_contrat ->> 'debut', '')::date;
  salaire numeric := nullif(p_contrat ->> 'salaire_base', '')::numeric;
  actuel public.rh_contrats%rowtype;
  v_numero text;
begin
  perform public.exiger_permission(p_etablissement_id, 'rh_employes.gerer');
  perform public.exiger_permission(p_etablissement_id, 'rh_employes.confidentiel');
  select * into employe from public.rh_employes
  where id = nullif(p_contrat ->> 'employe_id', '')::uuid and etablissement_id = p_etablissement_id;
  if employe.id is null then
    raise exception 'Employé introuvable dans cet établissement';
  end if;
  if employe.statut = 'sorti' then
    raise exception 'Employé sorti des effectifs : aucun nouveau contrat';
  end if;
  if poste is not null and not exists (select 1 from public.rh_postes where id = poste and etablissement_id = p_etablissement_id) then
    raise exception 'Poste introuvable dans cet établissement';
  end if;
  if salaire = 'NaN'::numeric then
    raise exception 'Salaire invalide';
  end if;
  if resultat is null then
    if v_debut is null then
      raise exception 'Date de début obligatoire';
    end if;
    select * into actuel from public.rh_contrats where employe_id = employe.id and statut = 'actif' for update;
    if actuel.id is not null then
      if not coalesce((p_contrat ->> 'remplacer')::boolean, false) then
        raise exception 'Cet employé a déjà un contrat en cours (%) : terminez-le ou cochez « remplace le contrat en cours »', actuel.numero;
      end if;
      if v_debut <= actuel.debut then
        raise exception 'Le nouveau contrat doit commencer après le début du contrat en cours';
      end if;
    end if;
    v_numero := public.prochain_numero(p_etablissement_id, 'contrat_rh', 'CTR-');
    if actuel.id is not null then
      update public.rh_contrats set statut = 'termine', termine_le = v_debut - 1, fin = least(coalesce(fin, v_debut - 1), v_debut - 1),
        motif_fin = 'Remplacé par ' || v_numero
      where id = actuel.id;
    end if;
    insert into public.rh_contrats (
      etablissement_id, employe_id, numero, type, poste_id, intitule, debut, fin, fin_periode_essai, salaire_base, periodicite,
      heures_hebdo, notes, cree_par
    ) values (
      p_etablissement_id, employe.id, v_numero, p_contrat ->> 'type', poste,
      coalesce(nullif(btrim(p_contrat ->> 'intitule'), ''), (select intitule from public.rh_postes where id = poste)),
      v_debut, nullif(p_contrat ->> 'fin', '')::date, nullif(p_contrat ->> 'fin_periode_essai', '')::date, salaire,
      coalesce(nullif(p_contrat ->> 'periodicite', ''), 'mensuel'), nullif(p_contrat ->> 'heures_hebdo', '')::numeric,
      nullif(btrim(p_contrat ->> 'notes'), ''), auth.uid()
    )
    returning id into resultat;
    if poste is not null then
      update public.rh_employes set poste_id = poste where id = employe.id;
    end if;
  else
    -- Avenant : les champs changent, le journal d'audit garde l'historique ligne par ligne.
    update public.rh_contrats set
      type = coalesce(nullif(p_contrat ->> 'type', ''), type),
      poste_id = poste,
      intitule = nullif(btrim(p_contrat ->> 'intitule'), ''),
      debut = coalesce(v_debut, rh_contrats.debut),
      fin = nullif(p_contrat ->> 'fin', '')::date,
      fin_periode_essai = nullif(p_contrat ->> 'fin_periode_essai', '')::date,
      salaire_base = salaire,
      periodicite = coalesce(nullif(p_contrat ->> 'periodicite', ''), periodicite),
      heures_hebdo = nullif(p_contrat ->> 'heures_hebdo', '')::numeric,
      notes = nullif(btrim(p_contrat ->> 'notes'), '')
    where id = resultat and etablissement_id = p_etablissement_id and employe_id = employe.id and statut = 'actif';
    if not found then
      raise exception 'Contrat en cours introuvable (un contrat terminé ne se modifie plus)';
    end if;
  end if;
  return resultat;
end
$$;

create function public.rh_terminer_contrat(p_contrat_id uuid, p_date date, p_motif text, p_rupture boolean default false)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  contrat public.rh_contrats%rowtype;
begin
  select * into contrat from public.rh_contrats where id = p_contrat_id for update;
  if contrat.id is null then
    raise exception 'Contrat introuvable';
  end if;
  perform public.exiger_permission(contrat.etablissement_id, 'rh_employes.gerer');
  perform public.exiger_permission(contrat.etablissement_id, 'rh_employes.confidentiel');
  if contrat.statut <> 'actif' then
    raise exception 'Ce contrat est déjà terminé';
  end if;
  if p_date is null or p_date < contrat.debut or coalesce(btrim(p_motif), '') = '' then
    raise exception 'Date de fin (après le début) et motif obligatoires';
  end if;
  update public.rh_contrats set statut = case when p_rupture then 'rompu' else 'termine' end, termine_le = p_date,
    fin = p_date, motif_fin = btrim(p_motif)
  where id = contrat.id;
end
$$;

-- ---------------------------------------------------------------------------
-- 7. Présences
-- ---------------------------------------------------------------------------
-- Pointage par l'employé lui-même (arrivée puis départ), dans le fuseau de l'établissement.
create function public.rh_pointer(p_etablissement_id uuid, p_sens text, p_hub_id uuid default null, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  moi uuid;
  employe public.rh_employes%rowtype;
  aujourdhui date := public.date_locale(p_etablissement_id);
  pointage public.rh_pointages%rowtype;
  prevu time;
  tolerance integer;
  retard integer := 0;
  hub uuid := coalesce(p_hub_id, (select hub_id from public.rh_employes where id = public.rh_mon_employe(p_etablissement_id)));
begin
  perform public.exiger_permission(p_etablissement_id, 'rh_presences.pointer');
  if not coalesce((public.parametre_module(p_etablissement_id, 'rh_presences', 'pointage_libre') #>> '{}')::boolean, true) then
    raise exception 'Le pointage depuis l''espace employé est désactivé : voyez votre responsable';
  end if;
  moi := public.rh_mon_employe(p_etablissement_id);
  if moi is null then
    raise exception 'Votre compte n''est lié à aucune fiche employé de cet établissement';
  end if;
  select * into employe from public.rh_employes where id = moi;
  if employe.statut <> 'actif' then
    raise exception 'Fiche employé suspendue : pointage impossible';
  end if;
  if hub is not null then
    if not exists (select 1 from public.hubs where id = hub and etablissement_id = p_etablissement_id and actif) then
      raise exception 'Hub introuvable dans cet établissement';
    end if;
    perform public.exiger_acces_hub(hub);
  end if;
  select * into pointage from public.rh_pointages where employe_id = moi and jour = aujourdhui for update;
  if p_sens = 'arrivee' then
    if pointage.id is not null then
      raise exception 'Arrivée déjà pointée aujourd''hui à %', to_char(public.heure_locale(p_etablissement_id, pointage.arrivee), 'HH24:MI');
    end if;
    prevu := public.rh_debut_prevu(moi, aujourdhui);
    tolerance := coalesce((public.parametre_module(p_etablissement_id, 'rh_presences', 'tolerance_retard') #>> '{}')::integer, 10);
    if prevu is not null then
      retard := greatest(0, (extract(epoch from (public.heure_locale(p_etablissement_id, now()) - prevu)) / 60)::integer);
      if retard <= tolerance then
        retard := 0;
      end if;
    end if;
    insert into public.rh_pointages (etablissement_id, employe_id, hub_id, jour, arrivee, retard_minutes, source, note, cree_par)
    values (p_etablissement_id, moi, hub, aujourdhui, now(), retard, 'employe', nullif(btrim(p_note), ''), auth.uid())
    returning * into pointage;
  elsif p_sens = 'depart' then
    if pointage.id is null then
      raise exception 'Pointez d''abord votre arrivée';
    end if;
    if pointage.depart is not null then
      raise exception 'Départ déjà pointé aujourd''hui';
    end if;
    update public.rh_pointages set depart = now(), note = coalesce(nullif(btrim(p_note), ''), note) where id = pointage.id
    returning * into pointage;
  else
    raise exception 'Sens de pointage inconnu';
  end if;
  return jsonb_build_object('id', pointage.id, 'arrivee', pointage.arrivee, 'depart', pointage.depart, 'retard_minutes', pointage.retard_minutes);
end
$$;

-- Saisie ou correction par un responsable (motif obligatoire pour corriger).
create function public.rh_enregistrer_pointage(p_etablissement_id uuid, p_pointage jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  resultat uuid := nullif(p_pointage ->> 'id', '')::uuid;
  employe uuid := nullif(p_pointage ->> 'employe_id', '')::uuid;
  hub uuid := nullif(p_pointage ->> 'hub_id', '')::uuid;
  v_jour date := nullif(p_pointage ->> 'jour', '')::date;
  v_arrivee timestamptz;
  v_depart timestamptz;
  fuseau text := (select e.fuseau from public.etablissements e where e.id = p_etablissement_id);
  prevu time;
  tolerance integer;
  retard integer := 0;
  motif text := nullif(btrim(p_pointage ->> 'motif'), '');
begin
  perform public.exiger_permission(p_etablissement_id, 'rh_presences.gerer');
  if not exists (select 1 from public.rh_employes where id = employe and etablissement_id = p_etablissement_id) then
    raise exception 'Employé introuvable dans cet établissement';
  end if;
  if hub is not null then
    if not exists (select 1 from public.hubs where id = hub and etablissement_id = p_etablissement_id) then
      raise exception 'Hub introuvable dans cet établissement';
    end if;
    perform public.exiger_acces_hub(hub);
  end if;
  if v_jour is null or not public.heure_valide(p_pointage ->> 'arrivee') then
    raise exception 'Jour et heure d''arrivée (HH:MM) obligatoires';
  end if;
  if v_jour > public.date_locale(p_etablissement_id) then
    raise exception 'On ne pointe pas une journée future';
  end if;
  v_arrivee := (v_jour + (p_pointage ->> 'arrivee')::time) at time zone fuseau;
  if nullif(p_pointage ->> 'depart', '') is not null then
    if not public.heure_valide(p_pointage ->> 'depart') then
      raise exception 'Heure de départ invalide (HH:MM)';
    end if;
    v_depart := (v_jour + (p_pointage ->> 'depart')::time) at time zone fuseau;
    if v_depart <= v_arrivee then
      v_depart := v_depart + interval '1 day';
    end if;
  end if;
  prevu := public.rh_debut_prevu(employe, v_jour);
  tolerance := coalesce((public.parametre_module(p_etablissement_id, 'rh_presences', 'tolerance_retard') #>> '{}')::integer, 10);
  if prevu is not null then
    retard := greatest(0, (extract(epoch from ((p_pointage ->> 'arrivee')::time - prevu)) / 60)::integer);
    if retard <= tolerance then
      retard := 0;
    end if;
  end if;
  if resultat is null then
    select id into resultat from public.rh_pointages where employe_id = employe and rh_pointages.jour = v_jour;
  end if;
  if resultat is null then
    insert into public.rh_pointages (etablissement_id, employe_id, hub_id, jour, arrivee, depart, retard_minutes, source, note, cree_par)
    values (p_etablissement_id, employe, hub, v_jour, v_arrivee, v_depart, retard, 'manager', nullif(btrim(p_pointage ->> 'note'), ''), auth.uid())
    returning id into resultat;
  else
    if motif is null then
      raise exception 'Le motif de correction est obligatoire';
    end if;
    update public.rh_pointages set
      hub_id = hub, arrivee = v_arrivee, depart = v_depart, retard_minutes = retard,
      note = nullif(btrim(p_pointage ->> 'note'), ''), corrige = true, motif_correction = motif
    where id = resultat and etablissement_id = p_etablissement_id and employe_id = employe;
    if not found then
      raise exception 'Pointage introuvable';
    end if;
  end if;
  return resultat;
end
$$;

create function public.rh_enregistrer_creneau(p_etablissement_id uuid, p_creneau jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  resultat uuid := nullif(p_creneau ->> 'id', '')::uuid;
  employe uuid := nullif(p_creneau ->> 'employe_id', '')::uuid;
  hub uuid := nullif(p_creneau ->> 'hub_id', '')::uuid;
begin
  perform public.exiger_permission(p_etablissement_id, 'rh_presences.gerer');
  if not exists (select 1 from public.rh_employes where id = employe and etablissement_id = p_etablissement_id and statut <> 'sorti') then
    raise exception 'Employé introuvable dans cet établissement';
  end if;
  if hub is not null and not exists (select 1 from public.hubs where id = hub and etablissement_id = p_etablissement_id) then
    raise exception 'Hub introuvable dans cet établissement';
  end if;
  if nullif(p_creneau ->> 'jour', '') is null or not public.heure_valide(p_creneau ->> 'debut') or not public.heure_valide(p_creneau ->> 'fin') then
    raise exception 'Jour et heures (HH:MM) obligatoires';
  end if;
  if resultat is null then
    insert into public.rh_creneaux (etablissement_id, employe_id, hub_id, jour, debut, fin, note, cree_par)
    values (p_etablissement_id, employe, hub, (p_creneau ->> 'jour')::date, (p_creneau ->> 'debut')::time, (p_creneau ->> 'fin')::time,
            nullif(btrim(p_creneau ->> 'note'), ''), auth.uid())
    returning id into resultat;
  else
    update public.rh_creneaux set
      hub_id = hub, jour = (p_creneau ->> 'jour')::date, debut = (p_creneau ->> 'debut')::time, fin = (p_creneau ->> 'fin')::time,
      note = nullif(btrim(p_creneau ->> 'note'), ''),
      statut = case when p_creneau ->> 'statut' in ('prevu', 'annule') then p_creneau ->> 'statut' else statut end
    where id = resultat and etablissement_id = p_etablissement_id and employe_id = employe;
    if not found then
      raise exception 'Créneau introuvable';
    end if;
  end if;
  return resultat;
end
$$;

-- Tableau de présence d'une journée : prévu, pointé, absence, état.
create function public.rh_presences_du_jour(p_etablissement_id uuid, p_jour date default null, p_hub_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_jour date := coalesce(p_jour, public.date_locale(p_etablissement_id));
begin
  if not public.lecture_autorisee(p_etablissement_id, 'rh_presences.lire') then
    raise exception 'Permission refusée : rh_presences.lire' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(ligne order by ligne ->> 'nom')
    from (
      select jsonb_build_object(
        'employe_id', e.id, 'matricule', e.matricule, 'nom', e.prenom || ' ' || e.nom, 'hub_id', e.hub_id,
        'departement', (select d.nom from public.rh_departements d where d.id = e.departement_id),
        'poste', (select p.intitule from public.rh_postes p where p.id = e.poste_id),
        'prevu', public.rh_debut_prevu(e.id, v_jour),
        'jour_travaille', public.rh_debut_prevu(e.id, v_jour) is not null,
        'pointage', (select jsonb_build_object('id', p.id, 'arrivee', p.arrivee, 'depart', p.depart, 'retard_minutes', p.retard_minutes,
                       'corrige', p.corrige, 'hub_id', p.hub_id)
                     from public.rh_pointages p where p.employe_id = e.id and p.jour = v_jour),
        'absence', (select jsonb_build_object('id', a.id, 'type', a.type, 'statut', a.statut)
                    from public.rh_absences a where a.employe_id = e.id and a.statut = 'approuvee'
                      and v_jour between a.debut and a.fin limit 1),
        'ferie', (select f.libelle from public.rh_jours_feries f where f.etablissement_id = p_etablissement_id and f.jour = v_jour and f.actif)
      ) as ligne
      from public.rh_employes e
      where e.etablissement_id = p_etablissement_id and e.statut = 'actif' and e.date_entree <= v_jour
        and (p_hub_id is null or e.hub_id = p_hub_id or exists (
          select 1 from public.rh_pointages p where p.employe_id = e.id and p.jour = v_jour and p.hub_id = p_hub_id))
        and public.lecture_hub(p_etablissement_id, e.hub_id)
    ) t
  ), '[]'::jsonb);
end
$$;

-- ---------------------------------------------------------------------------
-- 8. Congés et absences
-- ---------------------------------------------------------------------------
create function public.rh_demander_absence(p_etablissement_id uuid, p_absence jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  employe public.rh_employes%rowtype;
  pour_moi boolean;
  v_debut date := nullif(p_absence ->> 'debut', '')::date;
  v_fin date := nullif(p_absence ->> 'fin', '')::date;
  demi_debut boolean := coalesce((p_absence ->> 'demi_journee_debut')::boolean, false);
  demi_fin boolean := coalesce((p_absence ->> 'demi_journee_fin')::boolean, false);
  v_jours numeric;
  resultat uuid;
  manager_user uuid;
  libelle text;
  approuver boolean := coalesce((p_absence ->> 'approuver')::boolean, false);
begin
  select * into employe from public.rh_employes
  where id = coalesce(nullif(p_absence ->> 'employe_id', '')::uuid, public.rh_mon_employe(p_etablissement_id))
    and etablissement_id = p_etablissement_id;
  if employe.id is null then
    raise exception 'Employé introuvable (votre compte est-il lié à une fiche employé ?)';
  end if;
  pour_moi := employe.user_id is not distinct from auth.uid() and auth.uid() is not null;
  if pour_moi and not approuver then
    perform public.exiger_permission(p_etablissement_id, 'rh_conges.demander');
  else
    perform public.exiger_permission(p_etablissement_id, 'rh_conges.valider');
  end if;
  if employe.statut = 'sorti' then
    raise exception 'Employé sorti des effectifs';
  end if;
  if v_debut is null or v_fin is null or v_fin < v_debut then
    raise exception 'Dates invalides : la fin doit suivre le début';
  end if;
  if v_debut < employe.date_entree then
    raise exception 'L''absence ne peut pas précéder l''entrée de l''employé';
  end if;
  if exists (
    select 1 from public.rh_absences a
    where a.employe_id = employe.id and a.statut in ('demandee', 'approuvee') and a.debut <= v_fin and a.fin >= v_debut
  ) then
    raise exception 'Une demande couvre déjà une partie de ces dates';
  end if;
  v_jours := public.rh_jours_ouvrables(p_etablissement_id, v_debut, v_fin, demi_debut, demi_fin);
  if v_jours <= 0 then
    raise exception 'Aucun jour ouvrable sur cette période';
  end if;
  insert into public.rh_absences (etablissement_id, employe_id, type, debut, fin, demi_journee_debut, demi_journee_fin, jours, motif,
    statut, demandee_par, decidee_par, decidee_le)
  values (p_etablissement_id, employe.id, coalesce(nullif(p_absence ->> 'type', ''), 'conge_paye'), v_debut, v_fin, demi_debut, demi_fin, v_jours,
    nullif(btrim(p_absence ->> 'motif'), ''),
    case when approuver then 'approuvee' else 'demandee' end, auth.uid(),
    case when approuver then auth.uid() end, case when approuver then now() end)
  returning id into resultat;
  libelle := employe.prenom || ' ' || employe.nom || ' : ' || to_char(v_debut, 'DD/MM') || ' au ' || to_char(v_fin, 'DD/MM') || ' (' || v_jours || ' j)';
  if not approuver then
    select m.user_id into manager_user from public.rh_employes m where m.id = employe.manager_id;
    if manager_user is not null and manager_user <> auth.uid() then
      perform public.notifier(manager_user, p_etablissement_id, 'rh.absence_demandee', 'Demande d''absence à valider', libelle, 'mon-espace');
    end if;
    perform public.notifier_permission(p_etablissement_id, 'rh_conges.valider', 'rh.absence_demandee', 'Demande d''absence à valider', libelle, 'conges');
  elsif employe.user_id is not null and employe.user_id <> auth.uid() then
    perform public.notifier(employe.user_id, p_etablissement_id, 'rh.absence_decidee', 'Absence enregistrée et approuvée', libelle, 'mon-espace');
  end if;
  return resultat;
end
$$;

-- Décision : droit « valider » ou manager de l'employé ; jamais sur sa propre demande.
create function public.rh_decider_absence(p_absence_id uuid, p_decision text, p_commentaire text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  absence public.rh_absences%rowtype;
  employe public.rh_employes%rowtype;
begin
  select * into absence from public.rh_absences where id = p_absence_id for update;
  if absence.id is null then
    raise exception 'Demande introuvable';
  end if;
  select * into employe from public.rh_employes where id = absence.employe_id;
  if not (public.a_permission(absence.etablissement_id, 'rh_conges.valider')
          or (public.rh_est_manager_de(employe.id) and public.module_actif(absence.etablissement_id, 'rh_conges'))) then
    raise exception 'Permission refusée : rh_conges.valider' using errcode = '42501';
  end if;
  if not public.etablissement_autorise_ecriture(absence.etablissement_id) then
    raise exception 'Établissement suspendu ou archivé : aucune écriture possible' using errcode = '42501';
  end if;
  if employe.user_id = auth.uid() then
    raise exception 'Vous ne pouvez pas décider de votre propre demande';
  end if;
  if absence.statut <> 'demandee' then
    raise exception 'Cette demande a déjà été traitée';
  end if;
  if p_decision not in ('approuvee', 'refusee') then
    raise exception 'Décision inconnue';
  end if;
  if p_decision = 'refusee' and coalesce(btrim(p_commentaire), '') = '' then
    raise exception 'Expliquez le refus en quelques mots';
  end if;
  update public.rh_absences set statut = p_decision, decidee_par = auth.uid(), decidee_le = now(),
    commentaire_decision = nullif(btrim(p_commentaire), '')
  where id = absence.id;
  perform public.notifier(employe.user_id, absence.etablissement_id, 'rh.absence_decidee',
    case when p_decision = 'approuvee' then 'Votre absence est approuvée' else 'Votre demande d''absence est refusée' end,
    to_char(absence.debut, 'DD/MM') || ' au ' || to_char(absence.fin, 'DD/MM') || coalesce(' — ' || nullif(btrim(p_commentaire), ''), ''),
    'mon-espace');
end
$$;

-- Annulation : l'employé (demande non commencée) ou un valideur, toujours avec motif.
create function public.rh_annuler_absence(p_absence_id uuid, p_motif text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  absence public.rh_absences%rowtype;
  par_moi boolean;
begin
  select * into absence from public.rh_absences where id = p_absence_id for update;
  if absence.id is null then
    raise exception 'Demande introuvable';
  end if;
  par_moi := public.rh_est_moi(absence.employe_id);
  if not public.a_permission(absence.etablissement_id, 'rh_conges.valider') then
    if not par_moi then
      raise exception 'Permission refusée : rh_conges.valider' using errcode = '42501';
    end if;
    perform public.exiger_permission(absence.etablissement_id, 'rh_conges.demander');
    if absence.debut <= public.date_locale(absence.etablissement_id) then
      raise exception 'L''absence a commencé : demandez à votre responsable de l''annuler';
    end if;
  else
    perform public.exiger_permission(absence.etablissement_id, 'rh_conges.valider');
  end if;
  if absence.statut not in ('demandee', 'approuvee') then
    raise exception 'Cette demande est déjà clôturée';
  end if;
  if coalesce(btrim(p_motif), '') = '' then
    raise exception 'Le motif est obligatoire';
  end if;
  update public.rh_absences set statut = 'annulee', annulee_par = auth.uid(), annulee_le = now(), motif_annulation = btrim(p_motif)
  where id = absence.id;
end
$$;

create function public.rh_ajuster_solde(p_etablissement_id uuid, p_employe_id uuid, p_annee integer, p_jours numeric, p_motif text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  resultat uuid;
begin
  perform public.exiger_permission(p_etablissement_id, 'rh_conges.valider');
  if not exists (select 1 from public.rh_employes where id = p_employe_id and etablissement_id = p_etablissement_id) then
    raise exception 'Employé introuvable dans cet établissement';
  end if;
  if p_jours is null or p_jours = 'NaN'::numeric or p_jours = 0 or p_jours * 2 <> round(p_jours * 2) then
    raise exception 'Nombre de jours invalide (par demi-journée)';
  end if;
  insert into public.rh_ajustements_conges (etablissement_id, employe_id, annee, jours, motif, auteur)
  values (p_etablissement_id, p_employe_id, p_annee, p_jours, btrim(p_motif), auth.uid())
  returning id into resultat;
  return resultat;
end
$$;

create function public.rh_soldes_conges(p_etablissement_id uuid, p_annee integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.lecture_autorisee(p_etablissement_id, 'rh_conges.lire') then
    raise exception 'Permission refusée : rh_conges.lire' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('employe_id', e.id, 'nom', e.prenom || ' ' || e.nom, 'matricule', e.matricule)
                     || public.rh_solde_conges(e.id, p_annee) order by e.nom, e.prenom)
    from public.rh_employes e
    where e.etablissement_id = p_etablissement_id and (e.statut <> 'sorti' or extract(year from e.date_sortie)::integer >= p_annee)
      and e.date_entree <= make_date(p_annee, 12, 31)
  ), '[]'::jsonb);
end
$$;

-- ---------------------------------------------------------------------------
-- 9. Espace employé et tableau de bord RH
-- ---------------------------------------------------------------------------
create function public.rh_mon_espace(p_etablissement_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  moi uuid := public.rh_mon_employe(p_etablissement_id);
  employe public.rh_employes%rowtype;
  aujourdhui date := public.date_locale(p_etablissement_id);
  debut_mois date := date_trunc('month', public.date_locale(p_etablissement_id))::date;
begin
  if not public.a_permission(p_etablissement_id, 'rh_employes.espace') then
    raise exception 'Permission refusée : rh_employes.espace' using errcode = '42501';
  end if;
  if moi is null then
    return jsonb_build_object('lie', false);
  end if;
  select * into employe from public.rh_employes where id = moi;
  return jsonb_build_object(
    'lie', true,
    'employe', to_jsonb(employe) - 'notes',
    'prive', (select to_jsonb(p) - 'employe_id' - 'etablissement_id' from public.rh_employes_prives p where p.employe_id = moi),
    'departement', (select nom from public.rh_departements where id = employe.departement_id),
    'poste', (select intitule from public.rh_postes where id = employe.poste_id),
    'manager', (select prenom || ' ' || nom from public.rh_employes where id = employe.manager_id),
    'horaire', (select to_jsonb(h) from public.rh_horaires h where h.id = employe.horaire_id),
    'contrat', (select to_jsonb(c) - 'notes' from public.rh_contrats c where c.employe_id = moi and c.statut = 'actif'),
    'pointage_du_jour', (select to_jsonb(p) from public.rh_pointages p where p.employe_id = moi and p.jour = aujourdhui),
    'prevu_du_jour', public.rh_debut_prevu(moi, aujourdhui),
    'pointages_du_mois', coalesce((select jsonb_agg(to_jsonb(p) order by p.jour desc) from public.rh_pointages p
                                    where p.employe_id = moi and p.jour >= debut_mois), '[]'::jsonb),
    'creneaux', coalesce((select jsonb_agg(to_jsonb(c) order by c.jour) from public.rh_creneaux c
                           where c.employe_id = moi and c.statut = 'prevu' and c.jour between aujourdhui and aujourdhui + 13), '[]'::jsonb),
    'solde', case when public.module_actif(p_etablissement_id, 'rh_conges') then public.rh_solde_conges(moi, extract(year from aujourdhui)::integer) end,
    'absences', coalesce((select jsonb_agg(to_jsonb(a) order by a.debut desc) from (
                           select * from public.rh_absences where employe_id = moi order by debut desc limit 30) a), '[]'::jsonb),
    'documents', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'nom', d.nom, 'categorie', d.categorie, 'type_mime', d.type_mime,
                             'taille', d.taille, 'ajoute_le', d.ajoute_le) order by d.ajoute_le desc)
                           from public.pieces_jointes d where d.objet_type = 'rh_employe' and d.objet_id = moi
                             and d.statut = 'active' and not d.confidentiel), '[]'::jsonb),
    'equipe', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'nom', s.prenom || ' ' || s.nom, 'poste',
                          (select intitule from public.rh_postes where id = s.poste_id)) order by s.nom)
                        from public.rh_employes s where s.manager_id = moi and s.statut <> 'sorti'), '[]'::jsonb),
    'a_valider', coalesce((select jsonb_agg(to_jsonb(a) || jsonb_build_object('nom', s.prenom || ' ' || s.nom) order by a.debut)
                           from public.rh_absences a join public.rh_employes s on s.id = a.employe_id
                           where a.etablissement_id = p_etablissement_id and a.statut = 'demandee' and s.id <> moi
                             and public.rh_est_manager_de(s.id)), '[]'::jsonb)
  );
end
$$;

create function public.tableau_de_bord_rh(p_etablissement_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  aujourdhui date := public.date_locale(p_etablissement_id);
  presences jsonb;
begin
  if not (public.lecture_autorisee(p_etablissement_id, 'rh_employes.lire')
          or public.lecture_autorisee(p_etablissement_id, 'rh_presences.lire')
          or public.lecture_autorisee(p_etablissement_id, 'rh_conges.lire')) then
    raise exception 'Permission refusée : RH' using errcode = '42501';
  end if;
  if public.lecture_autorisee(p_etablissement_id, 'rh_presences.lire') then
    presences := public.rh_presences_du_jour(p_etablissement_id, aujourdhui, null);
  end if;
  return jsonb_build_object(
    'effectif', (select count(*) from public.rh_employes where etablissement_id = p_etablissement_id and statut = 'actif'),
    'suspendus', (select count(*) from public.rh_employes where etablissement_id = p_etablissement_id and statut = 'suspendu'),
    'entrees_mois', (select count(*) from public.rh_employes where etablissement_id = p_etablissement_id
                       and date_entree >= date_trunc('month', aujourdhui)::date),
    'par_departement', coalesce((
      select jsonb_agg(jsonb_build_object('departement', coalesce(d.nom, 'Sans département'), 'nombre', t.n) order by t.n desc)
      from (select departement_id, count(*) n from public.rh_employes
            where etablissement_id = p_etablissement_id and statut = 'actif' group by departement_id) t
      left join public.rh_departements d on d.id = t.departement_id), '[]'::jsonb),
    'presences', case when presences is null then null else jsonb_build_object(
      'attendus', (select count(*) from jsonb_array_elements(presences) x where (x ->> 'jour_travaille')::boolean and x -> 'absence' = 'null'::jsonb and x ->> 'ferie' is null),
      'presents', (select count(*) from jsonb_array_elements(presences) x where x -> 'pointage' <> 'null'::jsonb),
      'retards', (select count(*) from jsonb_array_elements(presences) x where (x -> 'pointage' ->> 'retard_minutes')::integer > 0),
      'absents', (select count(*) from jsonb_array_elements(presences) x where x -> 'absence' <> 'null'::jsonb)
    ) end,
    'demandes_en_attente', case when public.lecture_autorisee(p_etablissement_id, 'rh_conges.lire') then
      (select count(*) from public.rh_absences where etablissement_id = p_etablissement_id and statut = 'demandee') end,
    'absents_semaine', case when public.lecture_autorisee(p_etablissement_id, 'rh_conges.lire') then coalesce((
      select jsonb_agg(jsonb_build_object('nom', e.prenom || ' ' || e.nom, 'type', a.type, 'debut', a.debut, 'fin', a.fin) order by a.debut)
      from public.rh_absences a join public.rh_employes e on e.id = a.employe_id
      where a.etablissement_id = p_etablissement_id and a.statut = 'approuvee' and a.debut <= aujourdhui + 7 and a.fin >= aujourdhui), '[]'::jsonb) end,
    'contrats_a_echeance', case when public.lecture_autorisee(p_etablissement_id, 'rh_employes.confidentiel') then coalesce((
      select jsonb_agg(jsonb_build_object('nom', e.prenom || ' ' || e.nom, 'numero', c.numero, 'type', c.type, 'fin', c.fin,
                                          'fin_periode_essai', c.fin_periode_essai) order by least(c.fin, c.fin_periode_essai))
      from public.rh_contrats c join public.rh_employes e on e.id = c.employe_id
      where c.etablissement_id = p_etablissement_id and c.statut = 'actif'
        and (c.fin between aujourdhui and aujourdhui + 30 or c.fin_periode_essai between aujourdhui and aujourdhui + 15)), '[]'::jsonb) end,
    'sans_contrat', case when public.lecture_autorisee(p_etablissement_id, 'rh_employes.confidentiel') then (
      select count(*) from public.rh_employes e where e.etablissement_id = p_etablissement_id and e.statut = 'actif'
        and not exists (select 1 from public.rh_contrats c where c.employe_id = e.id and c.statut = 'actif')) end
  );
end
$$;

-- ---------------------------------------------------------------------------
-- 10. Disponibilité : les trois modules sont désormais exploitables
-- ---------------------------------------------------------------------------
update public.modules set statut = 'actif', version = '1.0' where id in ('rh_employes', 'rh_presences', 'rh_conges');
update public.solutions set statut = 'active' where id = 'rh';
update public.solution_modules set par_defaut = true where solution_id = 'rh' and module_id in ('rh_employes', 'rh_presences', 'rh_conges');
insert into public.solution_modules (solution_id, module_id, par_defaut) values
  ('rh', 'documents', false), ('hotel', 'rh_presences', false), ('hotel', 'rh_conges', false),
  ('restaurant', 'rh_presences', false), ('restaurant', 'rh_conges', false)
on conflict (solution_id, module_id) do nothing;
insert into public.offres (id, solution_id, nom, description, modules, offre_essai, ordre) values
  ('rh-essentiel', 'rh', 'RH Essentiel', 'Employés, organisation, contrats, présences, congés et espace employé.',
   array['rh_employes', 'rh_presences', 'rh_conges'], true, 1)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 11. Contexte : la fiche employé liée au compte, par établissement
-- ---------------------------------------------------------------------------
create or replace function public.mon_contexte()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with compte as (
    select c.identifiant, coalesce(c.doit_changer_mot_de_passe, false) as doit_changer, c.temporaire_expire_le
    from (select auth.uid() as id) moi
    left join public.comptes_connexion c on c.user_id = moi.id
  ),
  acces as (
    select m.etablissement_id as id, m.role_id as role, 1 as priorite
    from public.etablissement_membres m
    where m.user_id = auth.uid() and m.actif
    union all
    select e.id, 'dirigeant', 2
    from public.etablissements e
    join public.client_membres cm on cm.client_id = e.client_id
    where cm.user_id = auth.uid() and cm.actif
    union all
    select s.etablissement_id, 'support', 3
    from public.sessions_support s
    where s.admin_id = auth.uid() and s.fermee_le is null and public.session_support_active(s.etablissement_id)
  ),
  choisi as (
    select distinct on (id) id, role from acces
    where public.compte_pret()
    order by id, priorite
  )
  select jsonb_build_object(
    'utilisateur', (
      select jsonb_build_object(
        'id', u.id,
        'email', u.email,
        'nom', p.nom_complet,
        'prenom', p.prenom,
        'nom_famille', p.nom,
        'nom_affiche', p.nom_affiche,
        'initiales', p.initiales,
        'avatar_url', p.avatar_url,
        'telephone', p.telephone,
        'fonction', p.fonction,
        'preferences', coalesce(p.preferences, '{}'::jsonb)
      )
      from auth.users u left join public.profils p on p.id = u.id
      where u.id = auth.uid()
    ),
    'compte', (select jsonb_build_object(
      'identifiant', identifiant,
      'doit_changer_mot_de_passe', doit_changer,
      'temporaire_expire_le', temporaire_expire_le,
      'temporaire_expire', doit_changer and temporaire_expire_le is not null and temporaire_expire_le < now()
    ) from compte),
    'editeur', case when public.compte_pret() then (select role from public.plateforme_admins where user_id = auth.uid() and actif) end,
    'plateforme', (select to_jsonb(p) - 'id' - 'modifie_le' from public.plateforme_identite p),
    'invitations', case when public.compte_pret() then public.mes_invitations() else '[]'::jsonb end,
    'etablissements', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id,
        'nom', e.nom,
        'ville', e.ville,
        'devise', e.devise,
        'statut', e.statut,
        'solution_id', e.solution_id,
        'solution', (select s.nom from public.solutions s where s.id = e.solution_id),
        'client', c.nom,
        'client_id', c.id,
        'client_statut', c.statut,
        'ecriture', a.role not in ('dirigeant', 'support') and public.etablissement_autorise_ecriture(e.id),
        'role', a.role,
        'mis_en_service_le', e.mis_en_service_le,
        'licence', public.resume_licence(e.id),
        'identite', (select to_jsonb(i) - 'etablissement_id' from public.etablissement_identite i where i.etablissement_id = e.id),
        'marque', public.identite_effective(e.id),
        'modules', coalesce((
          select jsonb_agg(em.module_id order by em.module_id)
          from public.etablissement_modules em
          where em.etablissement_id = e.id and em.actif
        ), '[]'::jsonb),
        'parametres', coalesce((
          select jsonb_object_agg(ep.module_id, ep.data)
          from public.etablissement_parametres ep
          where ep.etablissement_id = e.id
        ), '{}'::jsonb),
        'permissions', coalesce((
          select jsonb_agg(p.id order by p.id)
          from public.permissions p
          where case
            when a.role in ('dirigeant', 'support') then p.id like '%.lire' and public.module_actif(e.id, p.module_id)
            else public.a_permission(e.id, p.id)
          end
        ), '[]'::jsonb),
        'hubs_restreints', exists (select 1 from public.membre_hubs r where r.etablissement_id = e.id and r.user_id = auth.uid()),
        'hubs', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', h.id, 'nom', h.nom, 'code', h.code, 'type', h.type, 'principal', h.principal, 'actif', h.actif,
            'capacite_vente', h.capacite_vente, 'capacite_stock', h.capacite_stock,
            'capacite_caisse', h.capacite_caisse, 'capacite_transfert', h.capacite_transfert,
            'caisses', coalesce((
              select jsonb_agg(jsonb_build_object('id', p.id, 'nom', p.nom, 'actif', p.actif) order by p.nom)
              from public.points_de_vente p where p.hub_id = h.id
            ), '[]'::jsonb)
          ) order by h.principal desc, h.nom)
          from public.hubs h
          where h.etablissement_id = e.id
            and (a.role in ('dirigeant', 'support') or public.acces_hub(h.id))
        ), '[]'::jsonb),
        'hubs_total', (select count(*) from public.hubs h where h.etablissement_id = e.id and h.actif),
        -- Fiche employé liée au compte (espace employé, pointage, congés).
        'employe_id', (select r.id from public.rh_employes r where r.etablissement_id = e.id and r.user_id = auth.uid() and r.statut <> 'sorti')
      ) order by e.nom)
      from choisi a
      join public.etablissements e on e.id = a.id
      join public.clients c on c.id = e.client_id
      where e.statut <> 'archive' or a.role = 'support'
    ), '[]'::jsonb)
  )
$$;

-- ---------------------------------------------------------------------------
-- Droits d'exécution
-- ---------------------------------------------------------------------------
do $$
declare signature text;
begin
  foreach signature in array array[
    'public.rh_enregistrer_departement(uuid, jsonb)',
    'public.rh_enregistrer_poste(uuid, jsonb)',
    'public.rh_enregistrer_horaire(uuid, jsonb)',
    'public.rh_enregistrer_jour_ferie(uuid, date, text, boolean)',
    'public.rh_enregistrer_employe(uuid, jsonb)',
    'public.rh_lier_compte(uuid, uuid, uuid)',
    'public.rh_sortie_employe(uuid, date, text)',
    'public.rh_enregistrer_contrat(uuid, jsonb)',
    'public.rh_terminer_contrat(uuid, date, text, boolean)',
    'public.rh_pointer(uuid, text, uuid, text)',
    'public.rh_enregistrer_pointage(uuid, jsonb)',
    'public.rh_enregistrer_creneau(uuid, jsonb)',
    'public.rh_presences_du_jour(uuid, date, uuid)',
    'public.rh_demander_absence(uuid, jsonb)',
    'public.rh_decider_absence(uuid, text, text)',
    'public.rh_annuler_absence(uuid, text)',
    'public.rh_ajuster_solde(uuid, uuid, integer, numeric, text)',
    'public.rh_soldes_conges(uuid, integer)',
    'public.rh_mon_espace(uuid)',
    'public.tableau_de_bord_rh(uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon', signature);
    execute format('grant execute on function %s to authenticated', signature);
  end loop;
  foreach signature in array array[
    'public.date_locale(uuid, timestamptz)',
    'public.heure_locale(uuid, timestamptz)',
    'public.heure_valide(text)',
    'public.rh_mon_employe(uuid)',
    'public.rh_jours_travailles(uuid)',
    'public.rh_jours_ouvrables(uuid, date, date, boolean, boolean)',
    'public.rh_solde_conges(uuid, integer)',
    'public.rh_debut_prevu(uuid, date)',
    'public.proteger_absence()'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', signature);
  end loop;
  foreach signature in array array['public.rh_est_moi(uuid)', 'public.rh_est_manager_de(uuid)'] loop
    execute format('revoke execute on function %s from public, anon', signature);
    execute format('grant execute on function %s to authenticated', signature);
  end loop;
end
$$;
