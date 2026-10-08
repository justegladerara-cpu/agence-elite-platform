-- Gestion immobilière (2026-10-08) : solution « Immobilier » pour les agences (gestion locative pour compte de
-- propriétaires), multi-agences (un client = un réseau, une agence = un établissement). Modules :
--   immo_biens       : propriétaires, mandats (commission), immeubles et lots, statut des biens ;
--   immo_locations   : locataires, baux, échéancier des loyers, encaissements (partiels, avances), quittances, impayés,
--                      cautions (reçue, restituée, retenue motivée), reversements aux propriétaires (relevé de gérance) ;
--   immo_maintenance : incidents et travaux (prestataire, devis, coût, à la charge de qui).
-- Règles : écriture par RPC (permission + établissement), lecture par RLS, jamais de suppression (annulation motivée),
-- un encaissement annulé libère ses affectations, un bail ne se crée que sur un bien libre, tout est audité.

-- ---------------------------------------------------------------------------
-- 1. Catalogue, droits, rôles
-- ---------------------------------------------------------------------------
insert into public.categories_modules (id, nom, description, icone, ordre) values
  ('immobilier', 'Immobilier', 'Biens, baux, loyers, cautions, maintenance, reversements.', 'cle', 90)
on conflict (id) do nothing;
insert into public.modules (id, nom, description, nature, statut, categorie, icone, ordre, documentation) values
  ('immo_biens', 'Biens et propriétaires', 'Propriétaires, mandats de gestion, immeubles et lots, disponibilité.', 'metier', 'actif', 'immobilier', 'depot', 300, 'docs/IMMOBILIER.md'),
  ('immo_locations', 'Locations', 'Locataires, baux, échéancier, encaissements, quittances, impayés, cautions, reversements.', 'metier', 'actif', 'immobilier', 'cle', 310, 'docs/IMMOBILIER.md'),
  ('immo_maintenance', 'Maintenance', 'Incidents, travaux, prestataires et refacturation.', 'metier', 'actif', 'immobilier', 'alerte', 320, 'docs/IMMOBILIER.md')
on conflict (id) do nothing;
insert into public.module_dependances (module_id, depend_de) values
  ('immo_biens', 'etablissement'), ('immo_locations', 'immo_biens'), ('immo_maintenance', 'immo_biens')
on conflict do nothing;

insert into public.permissions (id, module_id, description) values
  ('immo_biens.lire', 'immo_biens', 'Voir les biens et les propriétaires'),
  ('immo_biens.gerer', 'immo_biens', 'Créer et modifier biens, propriétaires et mandats'),
  ('immo_locations.lire', 'immo_locations', 'Voir les locataires, baux, loyers et cautions'),
  ('immo_locations.gerer', 'immo_locations', 'Créer, modifier et résilier les baux ; gérer locataires et cautions'),
  ('immo_locations.encaisser', 'immo_locations', 'Encaisser les loyers et éditer les quittances'),
  ('immo_locations.reverser', 'immo_locations', 'Préparer et régler les reversements aux propriétaires'),
  ('immo_maintenance.lire', 'immo_maintenance', 'Voir les incidents et travaux'),
  ('immo_maintenance.gerer', 'immo_maintenance', 'Déclarer et suivre les incidents et travaux')
on conflict (id) do nothing;

insert into public.roles (id, nom, description, ordre, modules_requis) values
  ('gestionnaire_immobilier', 'Gestionnaire locatif', 'Biens, baux, locataires, encaissements, cautions, maintenance', 53, '{immo_locations}'),
  ('agent_immobilier', 'Agent commercial', 'Biens, propriétaires et visites ; consultation des baux', 54, '{immo_biens}')
on conflict (id) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r, p from unnest(array['gerant', 'responsable']) r
cross join unnest(array['immo_biens.lire', 'immo_biens.gerer', 'immo_locations.lire', 'immo_locations.gerer',
  'immo_locations.encaisser', 'immo_locations.reverser', 'immo_maintenance.lire', 'immo_maintenance.gerer']) p
on conflict do nothing;
insert into public.role_permissions (role_id, permission_id)
select 'gestionnaire_immobilier', p from unnest(array['etablissement.lire', 'immo_biens.lire', 'immo_biens.gerer', 'immo_locations.lire',
  'immo_locations.gerer', 'immo_locations.encaisser', 'immo_maintenance.lire', 'immo_maintenance.gerer']) p
on conflict do nothing;
insert into public.role_permissions (role_id, permission_id)
select 'agent_immobilier', p from unnest(array['etablissement.lire', 'immo_biens.lire', 'immo_biens.gerer', 'immo_locations.lire', 'immo_maintenance.lire']) p
on conflict do nothing;
insert into public.role_permissions (role_id, permission_id)
select 'comptable', p from unnest(array['immo_biens.lire', 'immo_locations.lire', 'immo_locations.encaisser', 'immo_locations.reverser', 'immo_maintenance.lire']) p
on conflict do nothing;
insert into public.role_permissions (role_id, permission_id)
select r, p from unnest(array['employe', 'lecteur']) r
cross join unnest(array['immo_biens.lire', 'immo_locations.lire', 'immo_maintenance.lire']) p
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 2. Tables
-- ---------------------------------------------------------------------------
create table if not exists public.immo_proprietaires (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  nom text not null check (btrim(nom) <> '' and length(nom) <= 120),
  telephone text check (telephone is null or length(telephone) <= 40),
  email text check (email is null or length(email) <= 160),
  adresse text check (adresse is null or length(adresse) <= 300),
  piece_identite text check (piece_identite is null or length(piece_identite) <= 80),
  commission_taux numeric(5, 2) not null default 10 check (commission_taux between 0 and 100),
  mode_reversement text check (mode_reversement is null or mode_reversement in ('especes', 'mobile_money', 'virement', 'cheque')),
  coordonnees_reversement text check (coordonnees_reversement is null or length(coordonnees_reversement) <= 200),
  mandat_debut date,
  mandat_fin date,
  notes text check (notes is null or length(notes) <= 2000),
  actif boolean not null default true,
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  unique (id, etablissement_id)
);
create index if not exists immo_proprietaires_etab_idx on public.immo_proprietaires(etablissement_id);

create table if not exists public.immo_biens (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  parent_id uuid references public.immo_biens(id) on delete restrict,
  proprietaire_id uuid,
  type text not null check (type in ('immeuble', 'appartement', 'studio', 'villa', 'maison', 'chambre', 'local', 'bureau', 'entrepot', 'terrain')),
  nom text not null check (btrim(nom) <> '' and length(nom) <= 120),
  reference text check (reference is null or length(reference) <= 40),
  adresse text check (adresse is null or length(adresse) <= 300),
  quartier text check (quartier is null or length(quartier) <= 120),
  ville text check (ville is null or length(ville) <= 120),
  surface numeric(10, 2) check (surface is null or surface >= 0),
  pieces integer check (pieces is null or pieces between 0 and 200),
  equipements text check (equipements is null or length(equipements) <= 1000),
  description text check (description is null or length(description) <= 4000),
  statut text not null default 'libre' check (statut in ('libre', 'loue', 'reserve', 'travaux', 'a_vendre', 'vendu')),
  loyer_indicatif numeric(14, 2) check (loyer_indicatif is null or loyer_indicatif >= 0),
  prix_vente numeric(16, 2) check (prix_vente is null or prix_vente >= 0),
  actif boolean not null default true,
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  unique (etablissement_id, nom),
  unique (id, etablissement_id),
  foreign key (proprietaire_id, etablissement_id) references public.immo_proprietaires(id, etablissement_id) on delete restrict
);
create index if not exists immo_biens_etab_idx on public.immo_biens(etablissement_id);
create index if not exists immo_biens_parent_idx on public.immo_biens(parent_id);
create index if not exists immo_biens_proprietaire_idx on public.immo_biens(proprietaire_id);

create table if not exists public.immo_locataires (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  type text not null default 'particulier' check (type in ('particulier', 'entreprise')),
  nom text not null check (btrim(nom) <> '' and length(nom) <= 120),
  telephone text check (telephone is null or length(telephone) <= 40),
  email text check (email is null or length(email) <= 160),
  piece_identite text check (piece_identite is null or length(piece_identite) <= 80),
  profession text check (profession is null or length(profession) <= 120),
  garant_nom text check (garant_nom is null or length(garant_nom) <= 120),
  garant_telephone text check (garant_telephone is null or length(garant_telephone) <= 40),
  notes text check (notes is null or length(notes) <= 2000),
  actif boolean not null default true,
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  unique (id, etablissement_id)
);
create index if not exists immo_locataires_etab_idx on public.immo_locataires(etablissement_id);

create table if not exists public.immo_baux (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  numero text not null,
  bien_id uuid not null,
  locataire_id uuid not null,
  date_debut date not null,
  duree_mois integer not null check (duree_mois between 1 and 120),
  date_fin date not null,
  jour_echeance integer not null default 5 check (jour_echeance between 1 and 28),
  loyer numeric(14, 2) not null check (loyer > 0),
  charges numeric(14, 2) not null default 0 check (charges >= 0),
  caution numeric(14, 2) not null default 0 check (caution >= 0),
  commission_taux numeric(5, 2) not null check (commission_taux between 0 and 100),
  conditions text check (conditions is null or length(conditions) <= 4000),
  statut text not null default 'actif' check (statut in ('actif', 'resilie', 'termine')),
  resilie_le date,
  motif_fin text,
  cree_par uuid references auth.users(id) on delete restrict,
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  unique (etablissement_id, numero),
  unique (id, etablissement_id),
  foreign key (bien_id, etablissement_id) references public.immo_biens(id, etablissement_id) on delete restrict,
  foreign key (locataire_id, etablissement_id) references public.immo_locataires(id, etablissement_id) on delete restrict,
  check (date_fin > date_debut)
);
create index if not exists immo_baux_etab_idx on public.immo_baux(etablissement_id);
create index if not exists immo_baux_bien_idx on public.immo_baux(bien_id);
create index if not exists immo_baux_locataire_idx on public.immo_baux(locataire_id);
create unique index if not exists immo_baux_un_actif_par_bien on public.immo_baux(bien_id) where statut = 'actif';

create table if not exists public.immo_echeances (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  bail_id uuid not null,
  periode date not null,
  date_echeance date not null,
  montant numeric(14, 2) not null check (montant >= 0),
  paye numeric(14, 2) not null default 0 check (paye >= 0),
  statut text not null default 'a_payer' check (statut in ('a_payer', 'partielle', 'payee', 'annulee')),
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  unique (bail_id, periode),
  unique (id, etablissement_id),
  foreign key (bail_id, etablissement_id) references public.immo_baux(id, etablissement_id) on delete restrict,
  check (paye <= montant)
);
create index if not exists immo_echeances_etab_idx on public.immo_echeances(etablissement_id, date_echeance);

create table if not exists public.immo_encaissements (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  bail_id uuid not null,
  numero text not null,
  montant numeric(14, 2) not null check (montant > 0),
  mode text not null check (mode in ('especes', 'mobile_money', 'virement', 'cheque')),
  date_encaissement date not null default current_date,
  reference text check (reference is null or length(reference) <= 80),
  note text check (note is null or length(note) <= 500),
  statut text not null default 'valide' check (statut in ('valide', 'annule')),
  motif_annulation text,
  annule_le timestamptz,
  annule_par uuid references auth.users(id) on delete restrict,
  encaisse_par uuid references auth.users(id) on delete restrict,
  cree_le timestamptz not null default now(),
  unique (etablissement_id, numero),
  unique (id, etablissement_id),
  foreign key (bail_id, etablissement_id) references public.immo_baux(id, etablissement_id) on delete restrict
);
create index if not exists immo_encaissements_bail_idx on public.immo_encaissements(bail_id);
create index if not exists immo_encaissements_etab_idx on public.immo_encaissements(etablissement_id, date_encaissement);

create table if not exists public.immo_affectations (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  encaissement_id uuid not null,
  echeance_id uuid not null,
  montant numeric(14, 2) not null check (montant > 0),
  cree_le timestamptz not null default now(),
  foreign key (encaissement_id, etablissement_id) references public.immo_encaissements(id, etablissement_id) on delete restrict,
  foreign key (echeance_id, etablissement_id) references public.immo_echeances(id, etablissement_id) on delete restrict
);
create index if not exists immo_affectations_encaissement_idx on public.immo_affectations(encaissement_id);
create index if not exists immo_affectations_echeance_idx on public.immo_affectations(echeance_id);

create table if not exists public.immo_cautions (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  bail_id uuid not null,
  type text not null check (type in ('recue', 'restituee', 'retenue')),
  montant numeric(14, 2) not null check (montant > 0),
  mode text check (mode is null or mode in ('especes', 'mobile_money', 'virement', 'cheque')),
  motif text check (motif is null or length(motif) <= 500),
  date_mouvement date not null default current_date,
  cree_par uuid references auth.users(id) on delete restrict,
  cree_le timestamptz not null default now(),
  foreign key (bail_id, etablissement_id) references public.immo_baux(id, etablissement_id) on delete restrict,
  check (type <> 'retenue' or (motif is not null and btrim(motif) <> ''))
);
create index if not exists immo_cautions_bail_idx on public.immo_cautions(bail_id);

create table if not exists public.immo_incidents (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  bien_id uuid not null,
  bail_id uuid,
  titre text not null check (btrim(titre) <> '' and length(titre) <= 160),
  description text check (description is null or length(description) <= 4000),
  priorite text not null default 'normale' check (priorite in ('basse', 'normale', 'haute', 'urgente')),
  statut text not null default 'ouvert' check (statut in ('ouvert', 'en_cours', 'resolu', 'annule')),
  prestataire text check (prestataire is null or length(prestataire) <= 160),
  devis numeric(14, 2) check (devis is null or devis >= 0),
  cout numeric(14, 2) check (cout is null or cout >= 0),
  a_charge_de text not null default 'proprietaire' check (a_charge_de in ('proprietaire', 'locataire', 'agence')),
  resolu_le date,
  motif_annulation text,
  cree_par uuid references auth.users(id) on delete restrict,
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  foreign key (bien_id, etablissement_id) references public.immo_biens(id, etablissement_id) on delete restrict,
  foreign key (bail_id, etablissement_id) references public.immo_baux(id, etablissement_id) on delete restrict
);
create index if not exists immo_incidents_etab_idx on public.immo_incidents(etablissement_id, statut);

create table if not exists public.immo_reversements (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  proprietaire_id uuid not null,
  numero text not null,
  du date not null,
  au date not null,
  loyers_encaisses numeric(14, 2) not null default 0,
  commission numeric(14, 2) not null default 0,
  frais numeric(14, 2) not null default 0,
  net numeric(14, 2) not null default 0,
  detail jsonb not null default '[]'::jsonb,
  statut text not null default 'prepare' check (statut in ('prepare', 'paye', 'annule')),
  paye_le date,
  reference_paiement text,
  motif_annulation text,
  cree_par uuid references auth.users(id) on delete restrict,
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  unique (etablissement_id, numero),
  foreign key (proprietaire_id, etablissement_id) references public.immo_proprietaires(id, etablissement_id) on delete restrict,
  check (au >= du)
);
create index if not exists immo_reversements_etab_idx on public.immo_reversements(etablissement_id, proprietaire_id);

do $$
declare
  t text;
begin
  foreach t in array array['immo_proprietaires', 'immo_biens', 'immo_locataires', 'immo_baux', 'immo_echeances', 'immo_incidents', 'immo_reversements'] loop
    execute format('drop trigger if exists %I_modifie_le on public.%I', t, t);
    execute format('create trigger %I_modifie_le before update on public.%I for each row execute function public.fixer_modifie_le()', t, t);
  end loop;
  foreach t in array array['immo_proprietaires', 'immo_biens', 'immo_locataires', 'immo_baux', 'immo_echeances', 'immo_encaissements',
                           'immo_affectations', 'immo_cautions', 'immo_incidents', 'immo_reversements'] loop
    execute format('drop trigger if exists %I_sans_suppression on public.%I', t, t);
    execute format('create trigger %I_sans_suppression before delete on public.%I for each row execute function public.refuser_suppression()', t, t);
    execute format('drop trigger if exists %I_verrou_etablissement on public.%I', t, t);
    execute format('create trigger %I_verrou_etablissement before update on public.%I for each row execute function public.verrouiller_etablissement_id()', t, t);
    execute format('drop trigger if exists %I_audit on public.%I', t, t);
    execute format('create trigger %I_audit after insert or update or delete on public.%I for each row execute function public.journaliser_modification()', t, t);
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke insert, update, delete, truncate on public.%I from anon, authenticated', t);
  end loop;
end
$$;

drop policy if exists lecture on public.immo_proprietaires;
create policy lecture on public.immo_proprietaires for select to authenticated
using (public.lecture_autorisee(etablissement_id, 'immo_biens.lire'));
drop policy if exists lecture on public.immo_biens;
create policy lecture on public.immo_biens for select to authenticated
using (public.lecture_autorisee(etablissement_id, 'immo_biens.lire') or public.lecture_autorisee(etablissement_id, 'immo_locations.lire'));
drop policy if exists lecture on public.immo_locataires;
create policy lecture on public.immo_locataires for select to authenticated
using (public.lecture_autorisee(etablissement_id, 'immo_locations.lire'));
drop policy if exists lecture on public.immo_baux;
create policy lecture on public.immo_baux for select to authenticated
using (public.lecture_autorisee(etablissement_id, 'immo_locations.lire'));
drop policy if exists lecture on public.immo_echeances;
create policy lecture on public.immo_echeances for select to authenticated
using (public.lecture_autorisee(etablissement_id, 'immo_locations.lire'));
drop policy if exists lecture on public.immo_encaissements;
create policy lecture on public.immo_encaissements for select to authenticated
using (public.lecture_autorisee(etablissement_id, 'immo_locations.lire'));
drop policy if exists lecture on public.immo_affectations;
create policy lecture on public.immo_affectations for select to authenticated
using (public.lecture_autorisee(etablissement_id, 'immo_locations.lire'));
drop policy if exists lecture on public.immo_cautions;
create policy lecture on public.immo_cautions for select to authenticated
using (public.lecture_autorisee(etablissement_id, 'immo_locations.lire'));
drop policy if exists lecture on public.immo_incidents;
create policy lecture on public.immo_incidents for select to authenticated
using (public.lecture_autorisee(etablissement_id, 'immo_maintenance.lire'));
drop policy if exists lecture on public.immo_reversements;
create policy lecture on public.immo_reversements for select to authenticated
using (public.lecture_autorisee(etablissement_id, 'immo_locations.reverser') or public.lecture_autorisee(etablissement_id, 'immo_biens.gerer'));

-- Situation de chaque bail (dû échu, payé, reste, retard), lue avec les droits de l'utilisateur.
create or replace view public.immo_situation_baux with (security_invoker = true) as
select b.id as bail_id, b.etablissement_id, b.numero, b.statut, b.date_debut, b.date_fin, b.loyer, b.charges, b.caution,
  b.bien_id, bi.nom as bien, b.locataire_id, l.nom as locataire, l.telephone as locataire_telephone,
  coalesce(sum(e.montant) filter (where e.statut <> 'annulee' and e.date_echeance <= current_date), 0) as du_echu,
  coalesce(sum(e.paye) filter (where e.statut <> 'annulee'), 0) as paye,
  coalesce(sum(e.montant - e.paye) filter (where e.statut in ('a_payer', 'partielle') and e.date_echeance <= current_date), 0) as impaye,
  min(e.date_echeance) filter (where e.statut in ('a_payer', 'partielle') and e.date_echeance <= current_date) as plus_ancien_impaye,
  coalesce((select sum(case c.type when 'recue' then c.montant else -c.montant end) from public.immo_cautions c where c.bail_id = b.id), 0) as caution_detenue
from public.immo_baux b
join public.immo_biens bi on bi.id = b.bien_id
join public.immo_locataires l on l.id = b.locataire_id
left join public.immo_echeances e on e.bail_id = b.id
group by b.id, bi.nom, l.nom, l.telephone;

insert into public.types_pieces_jointes (objet_type, table_nom, module_id, permission_lire, permission_ecrire, libelle) values
  ('immo_bien', 'immo_biens', 'immo_biens', 'immo_biens.lire', 'immo_biens.gerer', 'Bien'),
  ('immo_bail', 'immo_baux', 'immo_locations', 'immo_locations.lire', 'immo_locations.gerer', 'Bail'),
  ('immo_locataire', 'immo_locataires', 'immo_locations', 'immo_locations.lire', 'immo_locations.gerer', 'Locataire'),
  ('immo_incident', 'immo_incidents', 'immo_maintenance', 'immo_maintenance.lire', 'immo_maintenance.gerer', 'Incident')
on conflict (objet_type) do nothing;

-- ---------------------------------------------------------------------------
-- 3. Fonctions
-- ---------------------------------------------------------------------------
create or replace function public.immo_nombre(p jsonb, p_cle text)
returns numeric
language plpgsql
immutable
set search_path = ''
as $$
declare
  v numeric;
begin
  if p is null or not (p ? p_cle) or coalesce(p ->> p_cle, '') = '' then
    return null;
  end if;
  v := (p ->> p_cle)::numeric;
  if v = 'NaN'::numeric then
    raise exception 'Valeur invalide pour %', p_cle;
  end if;
  return v;
exception when invalid_text_representation then
  raise exception 'Valeur invalide pour %', p_cle;
end
$$;

-- Numéro lisible et unique par établissement (préfixe + année + rang).
create or replace function public.immo_prochain_numero(p_etablissement_id uuid, p_prefixe text, p_table text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  rang integer;
  annee text := to_char(current_date, 'YYYY');
begin
  perform pg_advisory_xact_lock(hashtext(p_etablissement_id::text || p_table));
  execute format('select count(*) + 1 from public.%I where etablissement_id = $1 and numero like $2', p_table)
    into rang using p_etablissement_id, p_prefixe || '-' || annee || '-%';
  return p_prefixe || '-' || annee || '-' || lpad(rang::text, 4, '0');
end
$$;

-- p : { id?, nom, telephone?, email?, adresse?, piece_identite?, commission_taux?, mode_reversement?, coordonnees_reversement?,
--       mandat_debut?, mandat_fin?, notes?, actif? }
create or replace function public.enregistrer_proprietaire_immo(p_etablissement_id uuid, p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  resultat uuid := nullif(p ->> 'id', '')::uuid;
  v_taux numeric := coalesce(public.immo_nombre(p, 'commission_taux'), 10);
begin
  perform public.exiger_permission(p_etablissement_id, 'immo_biens.gerer');
  if coalesce(btrim(p ->> 'nom'), '') = '' then
    raise exception 'Le nom du propriétaire est obligatoire';
  end if;
  if v_taux < 0 or v_taux > 100 then
    raise exception 'Le taux de commission doit être entre 0 et 100 %%';
  end if;
  if resultat is null then
    insert into public.immo_proprietaires (etablissement_id, nom, telephone, email, adresse, piece_identite, commission_taux,
      mode_reversement, coordonnees_reversement, mandat_debut, mandat_fin, notes, actif)
    values (p_etablissement_id, btrim(p ->> 'nom'), nullif(btrim(p ->> 'telephone'), ''), nullif(btrim(p ->> 'email'), ''),
      nullif(btrim(p ->> 'adresse'), ''), nullif(btrim(p ->> 'piece_identite'), ''), v_taux, nullif(p ->> 'mode_reversement', ''),
      nullif(btrim(p ->> 'coordonnees_reversement'), ''), nullif(p ->> 'mandat_debut', '')::date, nullif(p ->> 'mandat_fin', '')::date,
      nullif(btrim(p ->> 'notes'), ''), coalesce((p ->> 'actif')::boolean, true))
    returning id into resultat;
  else
    update public.immo_proprietaires set nom = btrim(p ->> 'nom'), telephone = nullif(btrim(p ->> 'telephone'), ''),
      email = nullif(btrim(p ->> 'email'), ''), adresse = nullif(btrim(p ->> 'adresse'), ''), piece_identite = nullif(btrim(p ->> 'piece_identite'), ''),
      commission_taux = v_taux, mode_reversement = nullif(p ->> 'mode_reversement', ''), coordonnees_reversement = nullif(btrim(p ->> 'coordonnees_reversement'), ''),
      mandat_debut = nullif(p ->> 'mandat_debut', '')::date, mandat_fin = nullif(p ->> 'mandat_fin', '')::date,
      notes = nullif(btrim(p ->> 'notes'), ''), actif = coalesce((p ->> 'actif')::boolean, true)
    where id = resultat and etablissement_id = p_etablissement_id;
    if not found then
      raise exception 'Propriétaire introuvable dans cet établissement';
    end if;
  end if;
  return resultat;
end
$$;

-- p : { id?, type, nom, parent_id?, proprietaire_id?, reference?, adresse?, quartier?, ville?, surface?, pieces?, equipements?,
--       description?, statut?, loyer_indicatif?, prix_vente?, actif? }
create or replace function public.enregistrer_bien_immo(p_etablissement_id uuid, p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  resultat uuid := nullif(p ->> 'id', '')::uuid;
  v_parent uuid := nullif(p ->> 'parent_id', '')::uuid;
  v_proprietaire uuid := nullif(p ->> 'proprietaire_id', '')::uuid;
  v_statut text := coalesce(nullif(p ->> 'statut', ''), 'libre');
  ancien public.immo_biens%rowtype;
begin
  perform public.exiger_permission(p_etablissement_id, 'immo_biens.gerer');
  if coalesce(btrim(p ->> 'nom'), '') = '' then
    raise exception 'Le nom du bien est obligatoire';
  end if;
  if v_parent is not null and not exists (select 1 from public.immo_biens where id = v_parent and etablissement_id = p_etablissement_id and type = 'immeuble') then
    raise exception 'Immeuble parent introuvable dans cet établissement';
  end if;
  if v_parent is not null and v_parent = resultat then
    raise exception 'Un bien ne peut pas être son propre immeuble';
  end if;
  if v_proprietaire is not null and not exists (select 1 from public.immo_proprietaires where id = v_proprietaire and etablissement_id = p_etablissement_id) then
    raise exception 'Propriétaire introuvable dans cet établissement';
  end if;
  if exists (select 1 from public.immo_biens where etablissement_id = p_etablissement_id and lower(nom) = lower(btrim(p ->> 'nom')) and id is distinct from resultat) then
    raise exception 'Un bien « % » existe déjà', btrim(p ->> 'nom');
  end if;
  if resultat is not null then
    select * into ancien from public.immo_biens where id = resultat and etablissement_id = p_etablissement_id for update;
    if ancien.id is null then
      raise exception 'Bien introuvable dans cet établissement';
    end if;
    -- Le statut « loué » se gère par les baux, jamais à la main.
    if exists (select 1 from public.immo_baux where bien_id = resultat and statut = 'actif') then
      v_statut := 'loue';
    elsif v_statut = 'loue' then
      raise exception 'Un bien ne passe « loué » qu''en créant un bail';
    end if;
    update public.immo_biens set type = p ->> 'type', nom = btrim(p ->> 'nom'), parent_id = v_parent, proprietaire_id = v_proprietaire,
      reference = nullif(btrim(p ->> 'reference'), ''), adresse = nullif(btrim(p ->> 'adresse'), ''), quartier = nullif(btrim(p ->> 'quartier'), ''),
      ville = nullif(btrim(p ->> 'ville'), ''), surface = public.immo_nombre(p, 'surface'), pieces = public.immo_nombre(p, 'pieces')::integer,
      equipements = nullif(btrim(p ->> 'equipements'), ''), description = nullif(btrim(p ->> 'description'), ''), statut = v_statut,
      loyer_indicatif = public.immo_nombre(p, 'loyer_indicatif'), prix_vente = public.immo_nombre(p, 'prix_vente'),
      actif = coalesce((p ->> 'actif')::boolean, true)
    where id = resultat;
  else
    if v_statut = 'loue' then
      raise exception 'Un bien ne passe « loué » qu''en créant un bail';
    end if;
    insert into public.immo_biens (etablissement_id, type, nom, parent_id, proprietaire_id, reference, adresse, quartier, ville, surface, pieces,
      equipements, description, statut, loyer_indicatif, prix_vente, actif)
    values (p_etablissement_id, p ->> 'type', btrim(p ->> 'nom'), v_parent, v_proprietaire, nullif(btrim(p ->> 'reference'), ''),
      nullif(btrim(p ->> 'adresse'), ''), nullif(btrim(p ->> 'quartier'), ''), nullif(btrim(p ->> 'ville'), ''), public.immo_nombre(p, 'surface'),
      public.immo_nombre(p, 'pieces')::integer, nullif(btrim(p ->> 'equipements'), ''), nullif(btrim(p ->> 'description'), ''), v_statut,
      public.immo_nombre(p, 'loyer_indicatif'), public.immo_nombre(p, 'prix_vente'), coalesce((p ->> 'actif')::boolean, true))
    returning id into resultat;
  end if;
  return resultat;
end
$$;

-- p : { id?, type?, nom, telephone?, email?, piece_identite?, profession?, garant_nom?, garant_telephone?, notes?, actif? }
create or replace function public.enregistrer_locataire_immo(p_etablissement_id uuid, p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  resultat uuid := nullif(p ->> 'id', '')::uuid;
begin
  perform public.exiger_permission(p_etablissement_id, 'immo_locations.gerer');
  if coalesce(btrim(p ->> 'nom'), '') = '' then
    raise exception 'Le nom du locataire est obligatoire';
  end if;
  if resultat is null then
    insert into public.immo_locataires (etablissement_id, type, nom, telephone, email, piece_identite, profession, garant_nom, garant_telephone, notes, actif)
    values (p_etablissement_id, coalesce(nullif(p ->> 'type', ''), 'particulier'), btrim(p ->> 'nom'), nullif(btrim(p ->> 'telephone'), ''),
      nullif(btrim(p ->> 'email'), ''), nullif(btrim(p ->> 'piece_identite'), ''), nullif(btrim(p ->> 'profession'), ''),
      nullif(btrim(p ->> 'garant_nom'), ''), nullif(btrim(p ->> 'garant_telephone'), ''), nullif(btrim(p ->> 'notes'), ''),
      coalesce((p ->> 'actif')::boolean, true))
    returning id into resultat;
  else
    update public.immo_locataires set type = coalesce(nullif(p ->> 'type', ''), type), nom = btrim(p ->> 'nom'),
      telephone = nullif(btrim(p ->> 'telephone'), ''), email = nullif(btrim(p ->> 'email'), ''), piece_identite = nullif(btrim(p ->> 'piece_identite'), ''),
      profession = nullif(btrim(p ->> 'profession'), ''), garant_nom = nullif(btrim(p ->> 'garant_nom'), ''),
      garant_telephone = nullif(btrim(p ->> 'garant_telephone'), ''), notes = nullif(btrim(p ->> 'notes'), ''), actif = coalesce((p ->> 'actif')::boolean, true)
    where id = resultat and etablissement_id = p_etablissement_id;
    if not found then
      raise exception 'Locataire introuvable dans cet établissement';
    end if;
  end if;
  return resultat;
end
$$;

-- Recalcule le payé et le statut d'une échéance à partir de ses affectations valides.
create or replace function public.immo_recalculer_echeance(p_echeance_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  total numeric;
begin
  select coalesce(sum(a.montant), 0) into total
  from public.immo_affectations a join public.immo_encaissements e on e.id = a.encaissement_id
  where a.echeance_id = p_echeance_id and e.statut = 'valide';
  update public.immo_echeances set paye = total,
    statut = case when statut = 'annulee' then 'annulee' when total >= montant then 'payee' when total > 0 then 'partielle' else 'a_payer' end
  where id = p_echeance_id;
end
$$;

-- p : { bien_id, locataire_id, date_debut, duree_mois, loyer, charges?, caution?, caution_encaissee?, mode_caution?, jour_echeance?,
--       commission_taux? (défaut : celui du propriétaire), conditions? }
create or replace function public.creer_bail_immo(p_etablissement_id uuid, p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  resultat uuid;
  v_bien public.immo_biens%rowtype;
  v_debut date := nullif(p ->> 'date_debut', '')::date;
  v_duree integer := coalesce(public.immo_nombre(p, 'duree_mois')::integer, 12);
  v_loyer numeric := public.immo_nombre(p, 'loyer');
  v_charges numeric := coalesce(public.immo_nombre(p, 'charges'), 0);
  v_caution numeric := coalesce(public.immo_nombre(p, 'caution'), 0);
  v_jour integer := coalesce(public.immo_nombre(p, 'jour_echeance')::integer, 5);
  v_taux numeric;
  i integer;
  v_periode date;
begin
  perform public.exiger_permission(p_etablissement_id, 'immo_locations.gerer');
  if v_debut is null then
    raise exception 'La date de début du bail est obligatoire';
  end if;
  if v_loyer is null or v_loyer <= 0 then
    raise exception 'Le loyer doit être supérieur à zéro';
  end if;
  if v_duree < 1 or v_duree > 120 then
    raise exception 'La durée du bail doit être de 1 à 120 mois';
  end if;
  if v_jour < 1 or v_jour > 28 then
    raise exception 'Le jour d''échéance doit être entre 1 et 28';
  end if;
  if v_charges < 0 or v_caution < 0 then
    raise exception 'Charges et caution ne peuvent pas être négatives';
  end if;
  select * into v_bien from public.immo_biens where id = nullif(p ->> 'bien_id', '')::uuid and etablissement_id = p_etablissement_id for update;
  if v_bien.id is null then
    raise exception 'Bien introuvable dans cet établissement';
  end if;
  if v_bien.type = 'immeuble' then
    raise exception 'On loue un lot (appartement, local…), pas l''immeuble entier';
  end if;
  if not v_bien.actif or v_bien.statut in ('loue', 'vendu', 'travaux') then
    raise exception 'Le bien « % » n''est pas disponible à la location (%)', v_bien.nom, v_bien.statut;
  end if;
  if not exists (select 1 from public.immo_locataires where id = nullif(p ->> 'locataire_id', '')::uuid and etablissement_id = p_etablissement_id and actif) then
    raise exception 'Locataire introuvable dans cet établissement';
  end if;
  v_taux := coalesce(public.immo_nombre(p, 'commission_taux'),
    (select commission_taux from public.immo_proprietaires where id = v_bien.proprietaire_id), 0);
  if v_taux < 0 or v_taux > 100 then
    raise exception 'Le taux de commission doit être entre 0 et 100 %%';
  end if;
  insert into public.immo_baux (etablissement_id, numero, bien_id, locataire_id, date_debut, duree_mois, date_fin, jour_echeance, loyer,
    charges, caution, commission_taux, conditions, cree_par)
  values (p_etablissement_id, public.immo_prochain_numero(p_etablissement_id, 'BAIL', 'immo_baux'), v_bien.id,
    (p ->> 'locataire_id')::uuid, v_debut, v_duree, (v_debut + make_interval(months => v_duree))::date, v_jour, round(v_loyer, 2),
    round(v_charges, 2), round(v_caution, 2), v_taux, nullif(btrim(p ->> 'conditions'), ''), auth.uid())
  returning id into resultat;
  for i in 0 .. v_duree - 1 loop
    v_periode := (date_trunc('month', v_debut) + make_interval(months => i))::date;
    insert into public.immo_echeances (etablissement_id, bail_id, periode, date_echeance, montant)
    values (p_etablissement_id, resultat, v_periode, v_periode + (v_jour - 1), round(v_loyer + v_charges, 2));
  end loop;
  update public.immo_biens set statut = 'loue' where id = v_bien.id;
  if v_caution > 0 and coalesce((p ->> 'caution_encaissee')::boolean, false) then
    insert into public.immo_cautions (etablissement_id, bail_id, type, montant, mode, motif, cree_par)
    values (p_etablissement_id, resultat, 'recue', round(v_caution, 2), coalesce(nullif(p ->> 'mode_caution', ''), 'especes'), 'Caution à la signature', auth.uid());
  end if;
  insert into public.evenements (etablissement_id, client_id, type, acteur, donnees)
  select e.id, e.client_id, 'immo.bail_cree', auth.uid(), jsonb_build_object('bail_id', resultat, 'bien', v_bien.nom)
  from public.etablissements e where e.id = p_etablissement_id;
  return resultat;
end
$$;

-- Résiliation : les échéances postérieures non payées sont annulées, le bien redevient libre.
create or replace function public.resilier_bail_immo(p_bail_id uuid, p_date_fin date, p_motif text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.immo_baux%rowtype;
begin
  select * into b from public.immo_baux where id = p_bail_id for update;
  if b.id is null then
    raise exception 'Bail introuvable';
  end if;
  perform public.exiger_permission(b.etablissement_id, 'immo_locations.gerer');
  if b.statut <> 'actif' then
    raise exception 'Ce bail n''est plus actif';
  end if;
  if nullif(btrim(coalesce(p_motif, '')), '') is null then
    raise exception 'Le motif de la résiliation est obligatoire';
  end if;
  if p_date_fin is null or p_date_fin < b.date_debut then
    raise exception 'Date de fin invalide';
  end if;
  update public.immo_echeances set statut = 'annulee'
  where bail_id = b.id and periode > date_trunc('month', p_date_fin)::date and paye = 0 and statut <> 'annulee';
  if exists (select 1 from public.immo_echeances where bail_id = b.id and periode > date_trunc('month', p_date_fin)::date and paye > 0) then
    raise exception 'Des loyers après cette date sont déjà payés : annulez d''abord ces encaissements ou choisissez une date plus tardive';
  end if;
  update public.immo_baux set statut = 'resilie', resilie_le = p_date_fin, motif_fin = btrim(p_motif) where id = b.id;
  update public.immo_biens set statut = 'libre' where id = b.bien_id and statut = 'loue';
end
$$;

-- Encaissement d'un loyer : affecté aux échéances les plus anciennes non soldées (un surplus paie les mois suivants).
-- Verrou sur le bail : deux encaissements simultanés ne paient jamais deux fois la même échéance.
create or replace function public.encaisser_loyer_immo(p_bail_id uuid, p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.immo_baux%rowtype;
  v_montant numeric := public.immo_nombre(p, 'montant');
  v_mode text := coalesce(nullif(p ->> 'mode', ''), 'especes');
  reste numeric;
  ech record;
  part numeric;
  v_encaissement uuid;
  v_numero text;
  total_du numeric;
begin
  select * into b from public.immo_baux where id = p_bail_id for update;
  if b.id is null then
    raise exception 'Bail introuvable';
  end if;
  perform public.exiger_permission(b.etablissement_id, 'immo_locations.encaisser');
  if v_montant is null or v_montant <= 0 then
    raise exception 'Le montant doit être supérieur à zéro';
  end if;
  if v_mode not in ('especes', 'mobile_money', 'virement', 'cheque') then
    raise exception 'Mode de paiement inconnu';
  end if;
  select coalesce(sum(montant - paye), 0) into total_du from public.immo_echeances where bail_id = b.id and statut in ('a_payer', 'partielle');
  if v_montant > total_du then
    raise exception 'Le montant (%) dépasse le total restant dû sur le bail (%)', v_montant, total_du;
  end if;
  v_numero := public.immo_prochain_numero(b.etablissement_id, 'Q', 'immo_encaissements');
  insert into public.immo_encaissements (etablissement_id, bail_id, numero, montant, mode, date_encaissement, reference, note, encaisse_par)
  values (b.etablissement_id, b.id, v_numero, round(v_montant, 2), v_mode, coalesce(nullif(p ->> 'date', '')::date, current_date),
    nullif(btrim(p ->> 'reference'), ''), nullif(btrim(p ->> 'note'), ''), auth.uid())
  returning id into v_encaissement;
  reste := round(v_montant, 2);
  for ech in
    select id, montant - paye as du from public.immo_echeances
    where bail_id = b.id and statut in ('a_payer', 'partielle') order by periode
  loop
    exit when reste <= 0;
    part := least(reste, ech.du);
    insert into public.immo_affectations (etablissement_id, encaissement_id, echeance_id, montant) values (b.etablissement_id, v_encaissement, ech.id, part);
    perform public.immo_recalculer_echeance(ech.id);
    reste := reste - part;
  end loop;
  return jsonb_build_object('encaissement_id', v_encaissement, 'numero', v_numero, 'montant', round(v_montant, 2));
end
$$;

create or replace function public.annuler_encaissement_immo(p_encaissement_id uuid, p_motif text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  enc public.immo_encaissements%rowtype;
  ech record;
begin
  select * into enc from public.immo_encaissements where id = p_encaissement_id;
  if enc.id is null then
    raise exception 'Encaissement introuvable';
  end if;
  perform public.exiger_permission(enc.etablissement_id, 'immo_locations.encaisser');
  perform 1 from public.immo_baux where id = enc.bail_id for update;
  if enc.statut = 'annule' then
    raise exception 'Cet encaissement est déjà annulé';
  end if;
  if nullif(btrim(coalesce(p_motif, '')), '') is null then
    raise exception 'Le motif de l''annulation est obligatoire';
  end if;
  if exists (select 1 from public.immo_reversements r, jsonb_array_elements(r.detail) d
             where r.etablissement_id = enc.etablissement_id and r.statut <> 'annule' and d ->> 'encaissement_id' = enc.id::text) then
    raise exception 'Cet encaissement figure dans un reversement au propriétaire : annulez d''abord le reversement';
  end if;
  update public.immo_encaissements set statut = 'annule', motif_annulation = btrim(p_motif), annule_le = now(), annule_par = auth.uid()
  where id = enc.id;
  for ech in select distinct echeance_id from public.immo_affectations where encaissement_id = enc.id loop
    perform public.immo_recalculer_echeance(ech.echeance_id);
  end loop;
end
$$;

-- Caution : reçue, restituée ou retenue (motif obligatoire) ; jamais plus que ce qui est détenu.
create or replace function public.mouvement_caution_immo(p_bail_id uuid, p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.immo_baux%rowtype;
  v_type text := p ->> 'type';
  v_montant numeric := public.immo_nombre(p, 'montant');
  detenue numeric;
  resultat uuid;
begin
  select * into b from public.immo_baux where id = p_bail_id for update;
  if b.id is null then
    raise exception 'Bail introuvable';
  end if;
  perform public.exiger_permission(b.etablissement_id, 'immo_locations.gerer');
  if v_type not in ('recue', 'restituee', 'retenue') then
    raise exception 'Type de mouvement de caution inconnu';
  end if;
  if v_montant is null or v_montant <= 0 then
    raise exception 'Le montant doit être supérieur à zéro';
  end if;
  if v_type = 'retenue' and nullif(btrim(coalesce(p ->> 'motif', '')), '') is null then
    raise exception 'Une retenue sur caution doit être motivée';
  end if;
  select coalesce(sum(case type when 'recue' then montant else -montant end), 0) into detenue from public.immo_cautions where bail_id = b.id;
  if v_type <> 'recue' and v_montant > detenue then
    raise exception 'Montant supérieur à la caution détenue (%)', detenue;
  end if;
  insert into public.immo_cautions (etablissement_id, bail_id, type, montant, mode, motif, date_mouvement, cree_par)
  values (b.etablissement_id, b.id, v_type, round(v_montant, 2), nullif(p ->> 'mode', ''), nullif(btrim(p ->> 'motif'), ''),
    coalesce(nullif(p ->> 'date', '')::date, current_date), auth.uid())
  returning id into resultat;
  return resultat;
end
$$;

-- p : { id?, bien_id, bail_id?, titre, description?, priorite?, prestataire?, devis?, a_charge_de? }
create or replace function public.enregistrer_incident_immo(p_etablissement_id uuid, p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  resultat uuid := nullif(p ->> 'id', '')::uuid;
  v_bien uuid := nullif(p ->> 'bien_id', '')::uuid;
  v_bail uuid := nullif(p ->> 'bail_id', '')::uuid;
begin
  perform public.exiger_permission(p_etablissement_id, 'immo_maintenance.gerer');
  if coalesce(btrim(p ->> 'titre'), '') = '' then
    raise exception 'Le titre de l''incident est obligatoire';
  end if;
  if not exists (select 1 from public.immo_biens where id = v_bien and etablissement_id = p_etablissement_id) then
    raise exception 'Bien introuvable dans cet établissement';
  end if;
  if v_bail is not null and not exists (select 1 from public.immo_baux where id = v_bail and bien_id = v_bien) then
    raise exception 'Ce bail ne concerne pas ce bien';
  end if;
  if resultat is null then
    insert into public.immo_incidents (etablissement_id, bien_id, bail_id, titre, description, priorite, prestataire, devis, a_charge_de, cree_par)
    values (p_etablissement_id, v_bien, v_bail, btrim(p ->> 'titre'), nullif(btrim(p ->> 'description'), ''),
      coalesce(nullif(p ->> 'priorite', ''), 'normale'), nullif(btrim(p ->> 'prestataire'), ''), public.immo_nombre(p, 'devis'),
      coalesce(nullif(p ->> 'a_charge_de', ''), 'proprietaire'), auth.uid())
    returning id into resultat;
  else
    update public.immo_incidents set bien_id = v_bien, bail_id = v_bail, titre = btrim(p ->> 'titre'), description = nullif(btrim(p ->> 'description'), ''),
      priorite = coalesce(nullif(p ->> 'priorite', ''), priorite), prestataire = nullif(btrim(p ->> 'prestataire'), ''),
      devis = public.immo_nombre(p, 'devis'), a_charge_de = coalesce(nullif(p ->> 'a_charge_de', ''), a_charge_de)
    where id = resultat and etablissement_id = p_etablissement_id and statut in ('ouvert', 'en_cours');
    if not found then
      raise exception 'Incident introuvable ou déjà clos';
    end if;
  end if;
  return resultat;
end
$$;

-- Statut d'un incident : en_cours, resolu (coût final), annule (motif obligatoire).
create or replace function public.changer_statut_incident_immo(p_incident_id uuid, p_statut text, p jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  inc public.immo_incidents%rowtype;
begin
  select * into inc from public.immo_incidents where id = p_incident_id for update;
  if inc.id is null then
    raise exception 'Incident introuvable';
  end if;
  perform public.exiger_permission(inc.etablissement_id, 'immo_maintenance.gerer');
  if inc.statut in ('resolu', 'annule') then
    raise exception 'Cet incident est déjà clos';
  end if;
  if p_statut not in ('en_cours', 'resolu', 'annule') then
    raise exception 'Statut inconnu';
  end if;
  if p_statut = 'annule' and nullif(btrim(coalesce(p ->> 'motif', '')), '') is null then
    raise exception 'Le motif de l''annulation est obligatoire';
  end if;
  update public.immo_incidents set statut = p_statut,
    cout = coalesce(public.immo_nombre(p, 'cout'), cout),
    prestataire = coalesce(nullif(btrim(p ->> 'prestataire'), ''), prestataire),
    resolu_le = case when p_statut = 'resolu' then coalesce(nullif(p ->> 'date', '')::date, current_date) else resolu_le end,
    motif_annulation = case when p_statut = 'annule' then btrim(p ->> 'motif') else motif_annulation end
  where id = inc.id;
end
$$;

-- Reversement au propriétaire pour une période : loyers encaissés sur ses biens − commission (taux du bail) − travaux à sa
-- charge résolus dans la période. Un encaissement ou des travaux ne sont jamais comptés dans deux reversements.
create or replace function public.preparer_reversement_immo(p_etablissement_id uuid, p_proprietaire_id uuid, p_du date, p_au date)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  resultat uuid;
  v_detail jsonb;
  v_loyers numeric;
  v_commission numeric;
  v_frais numeric;
begin
  perform public.exiger_permission(p_etablissement_id, 'immo_locations.reverser');
  if not exists (select 1 from public.immo_proprietaires where id = p_proprietaire_id and etablissement_id = p_etablissement_id) then
    raise exception 'Propriétaire introuvable dans cet établissement';
  end if;
  if p_du is null or p_au is null or p_au < p_du then
    raise exception 'Période invalide';
  end if;
  perform pg_advisory_xact_lock(hashtext('immo_reversement' || p_proprietaire_id::text));
  select coalesce(jsonb_agg(jsonb_build_object('encaissement_id', e.id, 'numero', e.numero, 'date', e.date_encaissement, 'bail', b.numero,
           'bien', bi.nom, 'montant', e.montant, 'taux', b.commission_taux, 'commission', round(e.montant * b.commission_taux / 100, 2))
           order by e.date_encaissement), '[]'::jsonb),
         coalesce(sum(e.montant), 0), coalesce(sum(round(e.montant * b.commission_taux / 100, 2)), 0)
  into v_detail, v_loyers, v_commission
  from public.immo_encaissements e
  join public.immo_baux b on b.id = e.bail_id
  join public.immo_biens bi on bi.id = b.bien_id
  where e.etablissement_id = p_etablissement_id and e.statut = 'valide' and bi.proprietaire_id = p_proprietaire_id
    and e.date_encaissement between p_du and p_au
    and not exists (select 1 from public.immo_reversements r, jsonb_array_elements(r.detail) d
                    where r.etablissement_id = p_etablissement_id and r.statut <> 'annule' and d ->> 'encaissement_id' = e.id::text);
  select coalesce(sum(i.cout), 0),
         v_detail || coalesce(jsonb_agg(jsonb_build_object('incident_id', i.id, 'titre', i.titre, 'bien', bi.nom, 'date', i.resolu_le, 'frais', i.cout)), '[]'::jsonb)
  into v_frais, v_detail
  from public.immo_incidents i join public.immo_biens bi on bi.id = i.bien_id
  where i.etablissement_id = p_etablissement_id and bi.proprietaire_id = p_proprietaire_id and i.statut = 'resolu'
    and i.a_charge_de = 'proprietaire' and i.resolu_le between p_du and p_au and coalesce(i.cout, 0) > 0
    and not exists (select 1 from public.immo_reversements r, jsonb_array_elements(r.detail) d
                    where r.etablissement_id = p_etablissement_id and r.statut <> 'annule' and d ->> 'incident_id' = i.id::text);
  if v_loyers = 0 and v_frais = 0 then
    raise exception 'Rien à reverser sur cette période';
  end if;
  insert into public.immo_reversements (etablissement_id, proprietaire_id, numero, du, au, loyers_encaisses, commission, frais, net, detail, cree_par)
  values (p_etablissement_id, p_proprietaire_id, public.immo_prochain_numero(p_etablissement_id, 'REV', 'immo_reversements'), p_du, p_au,
    v_loyers, v_commission, v_frais, v_loyers - v_commission - v_frais, v_detail, auth.uid())
  returning id into resultat;
  return resultat;
end
$$;

create or replace function public.regler_reversement_immo(p_reversement_id uuid, p jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.immo_reversements%rowtype;
begin
  select * into r from public.immo_reversements where id = p_reversement_id for update;
  if r.id is null then
    raise exception 'Reversement introuvable';
  end if;
  perform public.exiger_permission(r.etablissement_id, 'immo_locations.reverser');
  if (p ->> 'action') = 'annuler' then
    if r.statut <> 'prepare' then
      raise exception 'Seul un reversement préparé peut être annulé';
    end if;
    if nullif(btrim(coalesce(p ->> 'motif', '')), '') is null then
      raise exception 'Le motif de l''annulation est obligatoire';
    end if;
    update public.immo_reversements set statut = 'annule', motif_annulation = btrim(p ->> 'motif') where id = r.id;
  else
    if r.statut <> 'prepare' then
      raise exception 'Ce reversement est déjà réglé ou annulé';
    end if;
    update public.immo_reversements set statut = 'paye', paye_le = coalesce(nullif(p ->> 'date', '')::date, current_date),
      reference_paiement = nullif(btrim(p ->> 'reference'), '') where id = r.id;
  end if;
end
$$;

-- Quittance d'un encaissement (impression) : identité de l'agence, bail, bien, locataire, période(s) couvertes.
create or replace function public.quittance_immo(p_encaissement_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  enc public.immo_encaissements%rowtype;
begin
  select * into enc from public.immo_encaissements where id = p_encaissement_id;
  if enc.id is null then
    raise exception 'Encaissement introuvable';
  end if;
  if not public.a_permission(enc.etablissement_id, 'immo_locations.lire') then
    raise exception 'Permission refusée : immo_locations.lire' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'numero', enc.numero, 'date', enc.date_encaissement, 'montant', enc.montant, 'mode', enc.mode, 'reference', enc.reference, 'statut', enc.statut,
    'agence', (select jsonb_build_object('nom', coalesce(i.nom_commercial, e.nom), 'adresse', i.adresse, 'telephone', i.telephone, 'logo', i.logo_url)
               from public.etablissements e left join public.etablissement_identite i on i.etablissement_id = e.id where e.id = enc.etablissement_id),
    'bail', (select jsonb_build_object('numero', b.numero, 'loyer', b.loyer, 'charges', b.charges) from public.immo_baux b where b.id = enc.bail_id),
    'bien', (select jsonb_build_object('nom', bi.nom, 'adresse', bi.adresse, 'quartier', bi.quartier, 'ville', bi.ville)
             from public.immo_baux b join public.immo_biens bi on bi.id = b.bien_id where b.id = enc.bail_id),
    'locataire', (select jsonb_build_object('nom', l.nom, 'telephone', l.telephone)
                  from public.immo_baux b join public.immo_locataires l on l.id = b.locataire_id where b.id = enc.bail_id),
    'periodes', coalesce((select jsonb_agg(jsonb_build_object('periode', ech.periode, 'montant', a.montant, 'solde', ech.statut = 'payee') order by ech.periode)
                          from public.immo_affectations a join public.immo_echeances ech on ech.id = a.echeance_id
                          where a.encaissement_id = enc.id), '[]'::jsonb)
  );
end
$$;

-- Tableau de bord de l'agence (calculé par la base).
create or replace function public.tableau_de_bord_immobilier(p_etablissement_id uuid, p_jour date default current_date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  mois date := date_trunc('month', p_jour)::date;
  lots integer;
  loues integer;
begin
  if not public.a_permission(p_etablissement_id, 'immo_locations.lire') and not public.a_permission(p_etablissement_id, 'immo_biens.lire') then
    raise exception 'Permission refusée : immo_locations.lire' using errcode = '42501';
  end if;
  select count(*) filter (where type <> 'immeuble' and actif and statut <> 'vendu'), count(*) filter (where type <> 'immeuble' and actif and statut = 'loue')
  into lots, loues from public.immo_biens where etablissement_id = p_etablissement_id;
  return jsonb_build_object(
    'lots', lots, 'loues', loues,
    'taux_occupation', case when lots > 0 then round(100.0 * loues / lots, 1) else 0 end,
    'libres', (select count(*) from public.immo_biens where etablissement_id = p_etablissement_id and type <> 'immeuble' and actif and statut = 'libre'),
    'baux_actifs', (select count(*) from public.immo_baux where etablissement_id = p_etablissement_id and statut = 'actif'),
    'loyers_attendus_mois', (select coalesce(sum(montant), 0) from public.immo_echeances where etablissement_id = p_etablissement_id and periode = mois and statut <> 'annulee'),
    'encaisse_mois', (select coalesce(sum(montant), 0) from public.immo_encaissements where etablissement_id = p_etablissement_id and statut = 'valide'
                      and date_trunc('month', date_encaissement) = mois),
    'impayes', (select coalesce(sum(montant - paye), 0) from public.immo_echeances where etablissement_id = p_etablissement_id
                and statut in ('a_payer', 'partielle') and date_echeance < p_jour),
    'locataires_en_retard', (select count(distinct bail_id) from public.immo_echeances where etablissement_id = p_etablissement_id
                and statut in ('a_payer', 'partielle') and date_echeance < p_jour),
    'cautions_detenues', (select coalesce(sum(case type when 'recue' then montant else -montant end), 0) from public.immo_cautions where etablissement_id = p_etablissement_id),
    'baux_a_echeance', (select count(*) from public.immo_baux where etablissement_id = p_etablissement_id and statut = 'actif' and date_fin between p_jour and p_jour + 60),
    'reversements_a_faire', (select coalesce(sum(net), 0) from public.immo_reversements where etablissement_id = p_etablissement_id and statut = 'prepare'),
    'commissions_mois', (select coalesce(sum(round(e.montant * b.commission_taux / 100, 2)), 0) from public.immo_encaissements e
                         join public.immo_baux b on b.id = e.bail_id where e.etablissement_id = p_etablissement_id and e.statut = 'valide'
                         and date_trunc('month', e.date_encaissement) = mois),
    'incidents_ouverts', (select count(*) from public.immo_incidents where etablissement_id = p_etablissement_id and statut in ('ouvert', 'en_cours'))
  );
end
$$;

-- ---------------------------------------------------------------------------
-- 4. Solution « Immobilier », offre d'essai, droits d'exécution
-- ---------------------------------------------------------------------------
insert into public.solutions (id, nom, statut) values ('immobilier', 'Immobilier', 'active') on conflict (id) do nothing;
update public.solutions set statut = 'active', icone = coalesce(icone, 'cle'),
  description = coalesce(description, 'Agences immobilières : biens, propriétaires, baux, loyers, quittances, cautions, maintenance, reversements.')
where id = 'immobilier';
insert into public.solution_modules (solution_id, module_id, par_defaut) values
  ('immobilier', 'etablissement', true), ('immobilier', 'membres', true), ('immobilier', 'tableau_de_bord', true),
  ('immobilier', 'immo_biens', true), ('immobilier', 'immo_locations', true), ('immobilier', 'immo_maintenance', true),
  ('immobilier', 'documents', false), ('immobilier', 'depenses', false), ('immobilier', 'contacts', false), ('immobilier', 'agenda', false),
  ('immobilier', 'crm_pipeline', false)
on conflict (solution_id, module_id) do nothing;
insert into public.offres (id, solution_id, nom, description, modules, offre_essai, actif, ordre) values
  ('immobilier-gestion', 'immobilier', 'Gestion immobilière',
   'Biens et propriétaires, baux, échéancier, encaissements, quittances, cautions, maintenance, reversements.',
   array['immo_biens', 'immo_locations', 'immo_maintenance'], true, true, 40)
on conflict (id) do nothing;

do $$
declare signature text;
begin
  foreach signature in array array[
    'public.enregistrer_proprietaire_immo(uuid, jsonb)',
    'public.enregistrer_bien_immo(uuid, jsonb)',
    'public.enregistrer_locataire_immo(uuid, jsonb)',
    'public.creer_bail_immo(uuid, jsonb)',
    'public.resilier_bail_immo(uuid, date, text)',
    'public.encaisser_loyer_immo(uuid, jsonb)',
    'public.annuler_encaissement_immo(uuid, text)',
    'public.mouvement_caution_immo(uuid, jsonb)',
    'public.enregistrer_incident_immo(uuid, jsonb)',
    'public.changer_statut_incident_immo(uuid, text, jsonb)',
    'public.preparer_reversement_immo(uuid, uuid, date, date)',
    'public.regler_reversement_immo(uuid, jsonb)',
    'public.quittance_immo(uuid)',
    'public.tableau_de_bord_immobilier(uuid, date)'
  ] loop
    execute format('revoke execute on function %s from public, anon', signature);
    execute format('grant execute on function %s to authenticated', signature);
  end loop;
  foreach signature in array array['public.immo_recalculer_echeance(uuid)', 'public.immo_prochain_numero(uuid, text, text)', 'public.immo_nombre(jsonb, text)'] loop
    execute format('revoke execute on function %s from public, anon, authenticated', signature);
  end loop;
end
$$;
grant select on public.immo_situation_baux to authenticated;

notify pgrst, 'reload schema';
