create table if not exists public.hse_membres (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nom text,
  role text not null default 'membre' check (role in ('admin','membre','lecture')),
  cree_le timestamptz not null default now()
);
create table if not exists public.hse_codes (
  code text primary key,
  role text not null default 'membre' check (role in ('admin','membre','lecture')),
  actif boolean not null default true,
  cree_le timestamptz not null default now()
);
create table if not exists public.hse_parametres (cle text primary key, valeur jsonb not null, modifie_le timestamptz not null default now());
create table if not exists public.hse_journal (
  jour date primary key,
  personnes int, heures_reelles numeric,
  jsa int, causeries int, permis_chaud int, permis_froid int, inspections int, accueils int,
  visites_infirmerie int,
  presque_accidents int, dangers int, premiers_soins int, soins_medicaux int, travail_limite int,
  accidents_arret int, deces int, degats int, pollutions int,
  formations int, reunions_generales int, reunions_poste int, exercices int, cartes_zero int,
  actions_cloturees int, permis_confine int, evacuations int, evenements_info int,
  dechets_produits_kg numeric, dechets_evacues_kg numeric,
  commentaire text,
  modifie_le timestamptz not null default now(),
  modifie_par uuid default auth.uid()
);
create table if not exists public.hse_incidents (
  id uuid primary key default gen_random_uuid(),
  num bigint generated always as identity,
  date_evt timestamptz not null default now(),
  type text not null, gravite text not null default 'faible', titre text not null,
  lieu text, description text, personnes text, causes text, actions_immediates text, declare_par text,
  statut text not null default 'ouvert', photos text[] not null default '{}',
  cree_le timestamptz not null default now(), cree_par uuid default auth.uid()
);
create table if not exists public.hse_actions (
  id uuid primary key default gen_random_uuid(),
  num bigint generated always as identity,
  titre text not null, description text, origine text not null default 'autre',
  incident_id uuid references public.hse_incidents(id) on delete set null,
  responsable text, echeance date, priorite text not null default 'normale',
  statut text not null default 'a_faire', cloture_le date,
  cree_le timestamptz not null default now(), cree_par uuid default auth.uid()
);
create table if not exists public.hse_permis (
  id uuid primary key default gen_random_uuid(),
  num bigint generated always as identity,
  type text not null, date_debut date not null default current_date, date_fin date,
  zone text, travaux text, entreprise text, demandeur text, autorise_par text,
  statut text not null default 'ouvert', remarques text,
  cree_le timestamptz not null default now(), cree_par uuid default auth.uid()
);
create table if not exists public.hse_inspections (
  id uuid primary key default gen_random_uuid(),
  date_insp date not null default current_date, type text not null, zone text, inspecteur text,
  resultat text not null default 'conforme', points_ok int, points_nok int, observations text,
  photos text[] not null default '{}',
  cree_le timestamptz not null default now(), cree_par uuid default auth.uid()
);
create table if not exists public.hse_formations (
  id uuid primary key default gen_random_uuid(),
  date_form date not null default current_date, type text not null default 'formation', theme text not null,
  formateur text, participants int, duree_h numeric, liste_presence text, remarques text,
  cree_le timestamptz not null default now(), cree_par uuid default auth.uid()
);
create table if not exists public.hse_personnel (
  id uuid primary key default gen_random_uuid(),
  nom text not null, poste text, entreprise text, telephone text,
  taille_combinaison text, pointure text, taille_casque text,
  date_arrivee date, induction_le date, visite_medicale_le date,
  actif boolean not null default true, cree_le timestamptz not null default now()
);
create table if not exists public.hse_epi (
  id uuid primary key default gen_random_uuid(),
  personnel_id uuid references public.hse_personnel(id) on delete set null,
  date_remise date not null default current_date, article text not null,
  quantite int not null default 1, taille text, remarques text,
  cree_le timestamptz not null default now()
);
create table if not exists public.hse_documents (
  id uuid primary key default gen_random_uuid(),
  titre text not null, categorie text not null default 'autre', date_doc date default current_date,
  fichier text, lien text, description text,
  cree_le timestamptz not null default now(), cree_par uuid default auth.uid()
);
alter table public.hse_membres enable row level security;
alter table public.hse_codes enable row level security;
alter table public.hse_parametres enable row level security;
alter table public.hse_journal enable row level security;
alter table public.hse_incidents enable row level security;
alter table public.hse_actions enable row level security;
alter table public.hse_permis enable row level security;
alter table public.hse_inspections enable row level security;
alter table public.hse_formations enable row level security;
alter table public.hse_personnel enable row level security;
alter table public.hse_epi enable row level security;
alter table public.hse_documents enable row level security;
