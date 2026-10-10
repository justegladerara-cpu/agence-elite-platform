-- Elite Partners : réseau de partenaires d'Agence Elite (licences, clés d'activation, commissions sur 3 niveaux).
-- Non destructive et rejouable : aucune donnée existante n'est modifiée, seules des colonnes facultatives sont ajoutées
-- à public.licences.
--
-- Règles (décidées par Juste le 2026-10-10) :
--   * un partenaire vend et installe les licences chez ses clients ; il est payé à la commission (20 % par défaut) ;
--   * son parrain touche 5 %, le parrain du parrain 2 % (réglables, rien n'est écrit dans le code de l'application) ;
--   * on ne gagne que sur l'argent d'une licence (attribution ou renouvellement avec un montant) : jamais sur le
--     recrutement, jamais sur les frais d'installation ;
--   * rangs Partenaire / Bronze / Argent / Or : le niveau 2 s'ouvre à Bronze, le niveau 3 à Argent, et il faut avoir
--     vendu dans les 90 derniers jours pour toucher sur son équipe ;
--   * une clé d'activation sert une seule fois ; la licence peut être verrouillée sur un nombre d'appareils ;
--   * tout l'argent des clients passe par Agence Elite, qui reverse les commissions (Mobile Money le plus souvent).

-- 1. Réglages -----------------------------------------------------------------------------------------------------
create table if not exists public.partenaires_reglages (
  id boolean primary key default true check (id),
  taux_niveau1 numeric(5, 2) not null default 20 check (taux_niveau1 between 0 and 60),
  taux_niveau2 numeric(5, 2) not null default 5 check (taux_niveau2 between 0 and 30),
  taux_niveau3 numeric(5, 2) not null default 2 check (taux_niveau3 between 0 and 30),
  delai_validation_jours integer not null default 30 check (delai_validation_jours between 0 and 365),
  seuil_paiement numeric(14, 2) not null default 10000 check (seuil_paiement >= 0),
  jours_activite integer not null default 90 check (jours_activite between 1 and 730),
  devise text not null default 'XAF' check (devise ~ '^[A-Z]{3}$'),
  inscription_ouverte boolean not null default true,
  -- Rangs, du plus bas au plus haut : clients actifs, partenaires actifs dans l'équipe directe, bonus (points de %)
  -- ajouté au taux du vendeur, niveaux de commission ouverts (1 à 3).
  rangs jsonb not null default '[
    {"id": "partenaire", "nom": "Partenaire", "clients": 0, "equipe": 0, "bonus": 0, "niveaux": 1},
    {"id": "bronze", "nom": "Bronze", "clients": 3, "equipe": 0, "bonus": 0, "niveaux": 2},
    {"id": "argent", "nom": "Argent", "clients": 10, "equipe": 2, "bonus": 2, "niveaux": 3},
    {"id": "or", "nom": "Or", "clients": 25, "equipe": 10, "bonus": 3, "niveaux": 3}
  ]'::jsonb check (jsonb_typeof(rangs) = 'array'),
  modifie_le timestamptz not null default now()
);
insert into public.partenaires_reglages(id) values (true) on conflict do nothing;
drop trigger if exists partenaires_reglages_modifie_le on public.partenaires_reglages;
create trigger partenaires_reglages_modifie_le before update on public.partenaires_reglages for each row execute function public.fixer_modifie_le();

-- 2. Partenaires ---------------------------------------------------------------------------------------------------
create table if not exists public.partenaires (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete restrict,
  code text not null unique check (code ~ '^[A-Z0-9]{4,12}$'),
  nom text not null check (length(btrim(nom)) between 2 and 120),
  telephone text check (telephone is null or length(telephone) <= 40),
  email text check (email is null or length(email) <= 160),
  ville text check (ville is null or length(ville) <= 80),
  mobile_money_numero text check (mobile_money_numero is null or length(mobile_money_numero) <= 40),
  mobile_money_operateur text check (mobile_money_operateur is null or mobile_money_operateur in ('airtel', 'mtn', 'autre')),
  parrain_id uuid references public.partenaires(id) on delete restrict,
  statut text not null default 'en_attente' check (statut in ('en_attente', 'actif', 'suspendu', 'refuse')),
  motif_statut text check (motif_statut is null or length(motif_statut) <= 300),
  note text check (note is null or length(note) <= 1000),
  valide_le timestamptz,
  valide_par uuid references auth.users(id) on delete restrict,
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  check (parrain_id is null or parrain_id <> id)
);
create index if not exists partenaires_parrain_idx on public.partenaires(parrain_id);
create unique index if not exists partenaires_email_unique on public.partenaires(lower(email)) where email is not null;
drop trigger if exists partenaires_modifie_le on public.partenaires;
create trigger partenaires_modifie_le before update on public.partenaires for each row execute function public.fixer_modifie_le();

-- Un parrainage ne forme jamais de boucle (A parrain de B parrain de A).
create or replace function public.partenaires_sans_boucle()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  courant uuid := new.parrain_id;
  pas integer := 0;
begin
  while courant is not null and pas < 50 loop
    if courant = new.id then
      raise exception 'Ce parrainage formerait une boucle';
    end if;
    select parrain_id into courant from public.partenaires where id = courant;
    pas := pas + 1;
  end loop;
  return new;
end
$$;
drop trigger if exists partenaires_boucle on public.partenaires;
create trigger partenaires_boucle before insert or update of parrain_id on public.partenaires for each row execute function public.partenaires_sans_boucle();

-- Le client appartient au partenaire dont la clé a été installée (ou à celui que choisit Agence Elite).
create table if not exists public.partenaire_clients (
  etablissement_id uuid primary key references public.etablissements(id) on delete restrict,
  partenaire_id uuid not null references public.partenaires(id) on delete restrict,
  source text not null default 'cle' check (source in ('cle', 'lien', 'manuel')),
  depuis timestamptz not null default now(),
  attribue_par uuid references auth.users(id) on delete restrict
);
create index if not exists partenaire_clients_partenaire_idx on public.partenaire_clients(partenaire_id);

-- Demandes laissées par un prospect depuis le lien d'un partenaire (#/partenaire/demande/<CODE>).
create table if not exists public.partenaire_demandes (
  id uuid primary key default gen_random_uuid(),
  partenaire_id uuid not null references public.partenaires(id) on delete restrict,
  nom text not null check (length(btrim(nom)) between 2 and 120),
  telephone text not null check (length(btrim(telephone)) between 6 and 40),
  entreprise text check (entreprise is null or length(entreprise) <= 120),
  ville text check (ville is null or length(ville) <= 80),
  message text check (message is null or length(message) <= 600),
  statut text not null default 'nouvelle' check (statut in ('nouvelle', 'traitee', 'abandonnee')),
  cree_le timestamptz not null default now(),
  traitee_le timestamptz
);
create index if not exists partenaire_demandes_partenaire_idx on public.partenaire_demandes(partenaire_id, cree_le desc);

-- 3. Modèles de licence et clés d'activation ----------------------------------------------------------------------
create table if not exists public.licence_modeles (
  id uuid primary key default gen_random_uuid(),
  nom text not null check (length(btrim(nom)) between 2 and 80),
  description text check (description is null or length(description) <= 300),
  offre_id text not null references public.offres(id) on delete restrict,
  formule text not null check (formule in ('essai', 'acquisition', 'mensuel', 'annuel')),
  -- Durée en jours (vide : 1 mois pour le mensuel, 1 an pour l'annuel, 30 jours pour l'essai, illimitée pour l'acquisition).
  duree_jours integer check (duree_jours is null or duree_jours between 1 and 3660),
  montant numeric(14, 2) not null default 0 check (montant >= 0),
  frais_installation numeric(14, 2) not null default 0 check (frais_installation >= 0),
  -- Nombre d'ordinateurs autorisés (vide : sans limite).
  appareils_max integer check (appareils_max is null or appareils_max between 1 and 50),
  formule_suivante text check (formule_suivante is null or formule_suivante in ('mensuel', 'annuel')),
  actif boolean not null default true,
  ordre integer not null default 0,
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now()
);
drop trigger if exists licence_modeles_modifie_le on public.licence_modeles;
create trigger licence_modeles_modifie_le before update on public.licence_modeles for each row execute function public.fixer_modifie_le();

create table if not exists public.licence_cles (
  id uuid primary key default gen_random_uuid(),
  cle text not null unique check (cle ~ '^ELITE-[A-Z0-9]{3}-[A-Z0-9]{4}-[A-Z0-9]{4}$'),
  modele_id uuid not null references public.licence_modeles(id) on delete restrict,
  partenaire_id uuid references public.partenaires(id) on delete restrict,
  client_nom text check (client_nom is null or length(client_nom) <= 120),
  client_telephone text check (client_telephone is null or length(client_telephone) <= 40),
  note text check (note is null or length(note) <= 300),
  statut text not null default 'disponible' check (statut in ('disponible', 'activee', 'bloquee')),
  etablissement_id uuid references public.etablissements(id) on delete restrict,
  licence_id uuid references public.licences(id) on delete restrict,
  motif text check (motif is null or length(motif) <= 300),
  cree_par uuid references auth.users(id) on delete restrict,
  cree_le timestamptz not null default now(),
  activee_le timestamptz,
  activee_par uuid references auth.users(id) on delete restrict,
  bloquee_le timestamptz
);
create index if not exists licence_cles_partenaire_idx on public.licence_cles(partenaire_id, statut);
create index if not exists licence_cles_modele_idx on public.licence_cles(modele_id);
create index if not exists licence_cles_etablissement_idx on public.licence_cles(etablissement_id);

alter table public.licences add column if not exists appareils_max integer check (appareils_max is null or appareils_max between 1 and 50);
alter table public.licences add column if not exists cle_id uuid references public.licence_cles(id) on delete restrict;

-- Ordinateurs autorisés pour un établissement (identifiant aléatoire gardé par l'application sur l'appareil).
create table if not exists public.licence_appareils (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  appareil text not null check (appareil ~ '^[A-Za-z0-9_-]{16,64}$'),
  nom text check (nom is null or length(nom) <= 120),
  actif boolean not null default true,
  premier_vu timestamptz not null default now(),
  dernier_vu timestamptz not null default now(),
  enregistre_par uuid references auth.users(id) on delete restrict,
  retire_le timestamptz,
  retire_par uuid references auth.users(id) on delete restrict,
  unique (etablissement_id, appareil)
);
create index if not exists licence_appareils_etab_idx on public.licence_appareils(etablissement_id) where actif;

-- 4. Commissions et paiements --------------------------------------------------------------------------------------
create table if not exists public.partenaire_paiements (
  id uuid primary key default gen_random_uuid(),
  partenaire_id uuid not null references public.partenaires(id) on delete restrict,
  montant numeric(14, 2) not null check (montant > 0),
  devise text not null default 'XAF',
  mode text not null check (mode in ('mobile_money', 'especes', 'virement')),
  reference text check (reference is null or length(reference) <= 80),
  note text check (note is null or length(note) <= 300),
  cree_par uuid references auth.users(id) on delete restrict,
  cree_le timestamptz not null default now()
);
create index if not exists partenaire_paiements_partenaire_idx on public.partenaire_paiements(partenaire_id, cree_le desc);

create table if not exists public.partenaire_commissions (
  id uuid primary key default gen_random_uuid(),
  partenaire_id uuid not null references public.partenaires(id) on delete restrict,
  niveau integer not null check (niveau between 1 and 3),
  vendeur_id uuid not null references public.partenaires(id) on delete restrict,
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  licence_evenement_id uuid not null references public.licence_evenements(id) on delete restrict,
  base numeric(14, 2) not null check (base > 0),
  taux numeric(5, 2) not null check (taux > 0),
  montant numeric(14, 2) not null check (montant >= 0),
  devise text not null default 'XAF',
  rang text,
  statut text not null default 'en_attente' check (statut in ('en_attente', 'validee', 'payee', 'annulee')),
  motif text check (motif is null or length(motif) <= 300),
  paiement_id uuid references public.partenaire_paiements(id) on delete restrict,
  cree_le timestamptz not null default now(),
  validee_le timestamptz,
  payee_le timestamptz,
  unique (licence_evenement_id, niveau)
);
create index if not exists partenaire_commissions_partenaire_idx on public.partenaire_commissions(partenaire_id, statut);
create index if not exists partenaire_commissions_vendeur_idx on public.partenaire_commissions(vendeur_id, cree_le desc);

-- 5. Sécurité : lecture par l'équipe Agence Elite, aucune écriture directe (tout passe par les fonctions ci-dessous).
do $$
declare
  t text;
begin
  foreach t in array array['partenaires_reglages', 'partenaires', 'partenaire_clients', 'partenaire_demandes', 'licence_modeles',
                           'licence_cles', 'licence_appareils', 'partenaire_paiements', 'partenaire_commissions'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists lecture_editeur on public.%I', t);
    execute format('create policy lecture_editeur on public.%I for select to authenticated using (public.est_editeur())', t);
    execute format('revoke insert, update, delete, truncate on public.%I from anon, authenticated', t);
    execute format('drop trigger if exists %I on public.%I', t || '_audit', t);
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.journaliser_modification()', t || '_audit', t);
  end loop;
end
$$;
drop trigger if exists partenaire_paiements_sans_suppression on public.partenaire_paiements;
create trigger partenaire_paiements_sans_suppression before delete on public.partenaire_paiements for each row execute function public.refuser_suppression();
drop trigger if exists partenaire_paiements_figes on public.partenaire_paiements;
create trigger partenaire_paiements_figes before update on public.partenaire_paiements for each row execute function public.refuser_modification();
drop trigger if exists partenaire_commissions_sans_suppression on public.partenaire_commissions;
create trigger partenaire_commissions_sans_suppression before delete on public.partenaire_commissions for each row execute function public.refuser_suppression();
drop trigger if exists licence_cles_sans_suppression on public.licence_cles;
create trigger licence_cles_sans_suppression before delete on public.licence_cles for each row execute function public.refuser_suppression();
drop trigger if exists partenaires_sans_suppression on public.partenaires;
create trigger partenaires_sans_suppression before delete on public.partenaires for each row execute function public.refuser_suppression();

-- 6. Outils internes (fermés à l'API) --------------------------------------------------------------------------------
-- Suite de caractères lisibles tirée d'un UUID aléatoire (sans 0/O ni 1/I).
create or replace function public.partenaires_aleatoire(p_longueur integer)
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  octets bytea := decode(replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''), 'hex');
  resultat text := '';
begin
  for i in 0 .. least(p_longueur, 30) - 1 loop
    resultat := resultat || substr(alphabet, (get_byte(octets, i) % 32) + 1, 1);
  end loop;
  return resultat;
end
$$;

create or replace function public.partenaires_nouveau_code(p_nom text)
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  base text := left(regexp_replace(upper(translate(coalesce(p_nom, ''), 'àâäéèêëîïôöùûüçÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ', 'aaaeeeeiioouuucAAAEEEEIIOOUUUC')), '[^A-Z]', '', 'g'), 5);
  v_code text;
begin
  if length(base) < 3 then
    base := 'ELITE';
  end if;
  for essai in 1 .. 40 loop
    v_code := base || public.partenaires_aleatoire(3);
    if not exists (select 1 from public.partenaires p where p.code = v_code) then
      return v_code;
    end if;
  end loop;
  raise exception 'Impossible de créer un code partenaire';
end
$$;

create or replace function public.partenaires_reglage()
returns public.partenaires_reglages
language sql
stable
security definer
set search_path = ''
as $$
  select * from public.partenaires_reglages where id
$$;

-- Le partenaire a-t-il vendu (commission de niveau 1) dans la période d'activité, ou a-t-il été validé récemment ?
create or replace function public.partenaire_actif(p_partenaire_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.partenaires p
    where p.id = p_partenaire_id and p.statut = 'actif' and (
      p.valide_le >= now() - make_interval(days => (select jours_activite from public.partenaires_reglages where id))
      or exists (
        select 1 from public.partenaire_commissions c
        where c.vendeur_id = p.id and c.niveau = 1 and c.statut <> 'annulee'
          and c.cree_le >= now() - make_interval(days => (select jours_activite from public.partenaires_reglages where id))
      )
    )
  )
$$;

-- Clients actifs d'un partenaire : établissements rattachés avec une licence valide et payante (hors essai).
create or replace function public.partenaire_clients_actifs(p_partenaire_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
  from public.partenaire_clients pc
  where pc.partenaire_id = p_partenaire_id
    and public.licence_valide(pc.etablissement_id)
    and exists (
      select 1 from public.licences l
      where l.etablissement_id = pc.etablissement_id and l.statut = 'active' and l.formule <> 'essai'
    )
$$;

create or replace function public.partenaire_equipe_active(p_partenaire_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from public.partenaires f
  where f.parrain_id = p_partenaire_id and public.partenaire_actif(f.id)
$$;

-- Rang atteint : le plus haut dont les deux seuils sont remplis.
create or replace function public.partenaire_rang(p_partenaire_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  clients integer := public.partenaire_clients_actifs(p_partenaire_id);
  equipe integer := public.partenaire_equipe_active(p_partenaire_id);
  rangs jsonb := (select r.rangs from public.partenaires_reglages r where r.id);
  rang jsonb;
  atteint jsonb := rangs -> 0;
  suivant jsonb;
begin
  for i in 0 .. jsonb_array_length(rangs) - 1 loop
    rang := rangs -> i;
    if clients >= coalesce((rang ->> 'clients')::integer, 0) and equipe >= coalesce((rang ->> 'equipe')::integer, 0) then
      atteint := rang;
      suivant := rangs -> (i + 1);
    end if;
  end loop;
  return jsonb_build_object('rang', atteint, 'suivant', suivant, 'clients_actifs', clients, 'equipe_active', equipe);
end
$$;

-- Commissions d'un paiement de licence : vendeur (niveau 1), son parrain (2) et le parrain du parrain (3).
create or replace function public.partenaires_commissionner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  reglage public.partenaires_reglages := public.partenaires_reglage();
  vendeur public.partenaires%rowtype;
  beneficiaire public.partenaires%rowtype;
  info jsonb;
  v_taux numeric;
  v_niveau integer := 1;
  client uuid;
begin
  if new.type not in ('attribution', 'renouvellement') or coalesce(new.montant, 0) <= 0 then
    return new;
  end if;
  select p.* into vendeur from public.partenaire_clients pc join public.partenaires p on p.id = pc.partenaire_id
  where pc.etablissement_id = new.etablissement_id;
  if vendeur.id is null or vendeur.statut <> 'actif' then
    return new;
  end if;
  -- Pas de commission sur son propre établissement (membre ou dirigeant du client).
  select e.client_id into client from public.etablissements e where e.id = new.etablissement_id;
  if vendeur.user_id is not null and (
       exists (select 1 from public.etablissement_membres m where m.etablissement_id = new.etablissement_id and m.user_id = vendeur.user_id)
       or exists (select 1 from public.client_membres m where m.client_id = client and m.user_id = vendeur.user_id)
     ) then
    return new;
  end if;
  beneficiaire := vendeur;
  while beneficiaire.id is not null and v_niveau <= 3 loop
    if beneficiaire.statut = 'actif' then
      info := public.partenaire_rang(beneficiaire.id);
      if v_niveau = 1 then
        v_taux := reglage.taux_niveau1 + coalesce((info -> 'rang' ->> 'bonus')::numeric, 0);
      elsif coalesce((info -> 'rang' ->> 'niveaux')::integer, 1) >= v_niveau and public.partenaire_actif(beneficiaire.id) then
        v_taux := case v_niveau when 2 then reglage.taux_niveau2 else reglage.taux_niveau3 end;
      else
        v_taux := 0;
      end if;
      if v_taux > 0 then
        insert into public.partenaire_commissions(partenaire_id, niveau, vendeur_id, etablissement_id, licence_evenement_id, base, taux, montant, devise, rang)
        values (beneficiaire.id, v_niveau, vendeur.id, new.etablissement_id, new.id, new.montant, v_taux, round(new.montant * v_taux / 100, 0),
                coalesce((select l.devise from public.licences l where l.id = new.licence_id), reglage.devise), info -> 'rang' ->> 'id')
        on conflict (licence_evenement_id, niveau) do nothing;
      end if;
    end if;
    v_niveau := v_niveau + 1;
    select * into beneficiaire from public.partenaires where id = beneficiaire.parrain_id;
  end loop;
  return new;
end
$$;
drop trigger if exists licence_evenements_commissions on public.licence_evenements;
create trigger licence_evenements_commissions after insert on public.licence_evenements
for each row execute function public.partenaires_commissionner();

-- Commissions dont le délai de validation est passé : « validée » (prête à payer).
create or replace function public.partenaires_valider_echues()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  update public.partenaire_commissions
  set statut = 'validee', validee_le = now()
  where statut = 'en_attente'
    and cree_le <= now() - make_interval(days => (select delai_validation_jours from public.partenaires_reglages where id));
  get diagnostics n = row_count;
  return n;
end
$$;

create or replace function public.partenaires_notifier_editeurs(p_titre text, p_texte text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.notifications(user_id, type, titre, texte, lien)
  select a.user_id, 'partenaires.info', left(p_titre, 160), left(p_texte, 600), 'editeur/partenaires'
  from public.plateforme_admins a where a.role = 'super_admin' and a.actif
$$;

-- Création d'un établissement sans contrôle de rôle : utilisée par creer_etablissement (équipe Agence Elite) et
-- par l'activation d'une clé (le client crée son propre établissement).
create or replace function public.initialiser_etablissement(p_client_id uuid, p_solution_id text, p_nom text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  resultat uuid;
begin
  insert into public.etablissements(client_id, solution_id, nom)
  values (p_client_id, p_solution_id, p_nom)
  returning id into resultat;
  insert into public.etablissement_modules(etablissement_id, module_id, actif, active_le, active_par, source)
  with recursive profondeur(module_id, niveau) as (
    select sm.module_id, 0
    from public.solution_modules sm
    where sm.solution_id = p_solution_id and sm.par_defaut
    union all
    select d.depend_de, p.niveau + 1
    from profondeur p
    join public.module_dependances d on d.module_id = p.module_id
    where p.niveau < 20
  )
  select resultat, sm.module_id, true, now(), auth.uid(), 'inclus'
  from public.solution_modules sm
  join (select module_id, max(niveau) as niveau from profondeur group by module_id) p on p.module_id = sm.module_id
  where sm.solution_id = p_solution_id and sm.par_defaut
  order by p.niveau desc;
  insert into public.points_de_vente(etablissement_id, nom) values (resultat, 'Caisse principale');
  insert into public.etablissement_identite(etablissement_id, nom_commercial) values (resultat, p_nom);
  return resultat;
end
$$;

create or replace function public.creer_etablissement(p_client_id uuid, p_solution_id text, p_nom text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.exiger_editeur();
  return public.initialiser_etablissement(p_client_id, p_solution_id, p_nom);
end
$$;

-- Pose une licence issue d'un modèle sur un établissement (la licence en cours est terminée, l'historique reste).
create or replace function public.poser_licence_modele(p_etablissement_id uuid, p_modele public.licence_modeles, p_cle_id uuid, p_reference text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  offre public.offres%rowtype;
  debut date := current_date;
  echeance date;
  resultat uuid;
  note text;
begin
  select * into offre from public.offres where id = p_modele.offre_id;
  echeance := case
    when p_modele.duree_jours is not null and p_modele.formule <> 'acquisition' then debut + p_modele.duree_jours
    when p_modele.formule = 'mensuel' then (debut + interval '1 month')::date
    when p_modele.formule = 'annuel' then (debut + interval '1 year')::date
    when p_modele.formule = 'essai' then debut + 30
  end;
  note := 'Clé ' || p_reference || ' (' || p_modele.nom || ')'
    || case when p_modele.frais_installation > 0 then ' · installation ' || p_modele.frais_installation::text || ' ' || offre.devise else '' end;
  update public.licences
  set statut = 'terminee', motif_statut = 'Remplacée par une clé d''activation'
  where etablissement_id = p_etablissement_id and statut <> 'terminee';
  insert into public.licences(etablissement_id, offre_id, formule, debut, echeance, montant, devise, note, cree_par, appareils_max, cle_id)
  values (p_etablissement_id, offre.id, p_modele.formule, debut, echeance, p_modele.montant, offre.devise, note, auth.uid(), p_modele.appareils_max, p_cle_id)
  returning id into resultat;
  insert into public.licence_evenements(licence_id, etablissement_id, type, nouvelle_echeance, montant, reference, motif, acteur)
  values (resultat, p_etablissement_id, 'attribution', echeance, p_modele.montant, p_reference, note, auth.uid());
  perform public.synchroniser_modules_licence(p_etablissement_id);
  return resultat;
end
$$;

-- 7. Fonctions de l'équipe Agence Elite ---------------------------------------------------------------------------
create or replace function public.enregistrer_reglages_partenaires(p jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r jsonb;
begin
  perform public.exiger_super_admin();
  if p ? 'rangs' then
    if jsonb_typeof(p -> 'rangs') <> 'array' or jsonb_array_length(p -> 'rangs') not between 1 and 8 then
      raise exception 'De 1 à 8 rangs';
    end if;
    for r in select * from jsonb_array_elements(p -> 'rangs') loop
      if coalesce(btrim(r ->> 'id'), '') !~ '^[a-z0-9_-]{2,20}$' or coalesce(btrim(r ->> 'nom'), '') = ''
         or coalesce((r ->> 'clients')::integer, -1) < 0 or coalesce((r ->> 'equipe')::integer, -1) < 0
         or coalesce((r ->> 'bonus')::numeric, -1) not between 0 and 20 or coalesce((r ->> 'niveaux')::integer, 0) not between 1 and 3 then
        raise exception 'Rang invalide : identifiant, nom, seuils positifs, bonus de 0 à 20, niveaux de 1 à 3';
      end if;
    end loop;
  end if;
  update public.partenaires_reglages set
    taux_niveau1 = coalesce((p ->> 'taux_niveau1')::numeric, taux_niveau1),
    taux_niveau2 = coalesce((p ->> 'taux_niveau2')::numeric, taux_niveau2),
    taux_niveau3 = coalesce((p ->> 'taux_niveau3')::numeric, taux_niveau3),
    delai_validation_jours = coalesce((p ->> 'delai_validation_jours')::integer, delai_validation_jours),
    seuil_paiement = coalesce((p ->> 'seuil_paiement')::numeric, seuil_paiement),
    jours_activite = coalesce((p ->> 'jours_activite')::integer, jours_activite),
    inscription_ouverte = coalesce((p ->> 'inscription_ouverte')::boolean, inscription_ouverte),
    rangs = coalesce(p -> 'rangs', rangs)
  where id;
end
$$;

create or replace function public.enregistrer_partenaire(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := nullif(p ->> 'id', '')::uuid;
  v_nom text := btrim(coalesce(p ->> 'nom', ''));
  v_email text := nullif(lower(btrim(coalesce(p ->> 'email', ''))), '');
  v_parrain uuid := nullif(p ->> 'parrain_id', '')::uuid;
  v_user uuid;
  resultat uuid;
begin
  perform public.exiger_super_admin();
  if length(v_nom) < 2 then
    raise exception 'Le nom du partenaire est obligatoire';
  end if;
  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Adresse e-mail invalide';
  end if;
  if v_email is not null then
    select id into v_user from auth.users where lower(email) = v_email;
  end if;
  if v_id is null then
    insert into public.partenaires(code, nom, telephone, email, ville, mobile_money_numero, mobile_money_operateur, parrain_id, note,
                                   user_id, statut, valide_le, valide_par)
    values (public.partenaires_nouveau_code(v_nom), v_nom, nullif(btrim(p ->> 'telephone'), ''), v_email, nullif(btrim(p ->> 'ville'), ''),
            nullif(btrim(p ->> 'mobile_money_numero'), ''), nullif(p ->> 'mobile_money_operateur', ''), v_parrain, nullif(btrim(p ->> 'note'), ''),
            case when not exists (select 1 from public.partenaires where user_id = v_user) then v_user end, 'actif', now(), auth.uid())
    returning id into resultat;
  else
    update public.partenaires set
      nom = v_nom, telephone = nullif(btrim(p ->> 'telephone'), ''), email = v_email, ville = nullif(btrim(p ->> 'ville'), ''),
      mobile_money_numero = nullif(btrim(p ->> 'mobile_money_numero'), ''), mobile_money_operateur = nullif(p ->> 'mobile_money_operateur', ''),
      parrain_id = v_parrain, note = nullif(btrim(p ->> 'note'), ''),
      user_id = coalesce(user_id, case when not exists (select 1 from public.partenaires where user_id = v_user) then v_user end)
    where id = v_id
    returning id into resultat;
    if resultat is null then
      raise exception 'Partenaire introuvable';
    end if;
  end if;
  return resultat;
end
$$;

create or replace function public.definir_statut_partenaire(p_partenaire_id uuid, p_statut text, p_motif text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.exiger_super_admin();
  if p_statut not in ('actif', 'suspendu', 'refuse') then
    raise exception 'Statut invalide';
  end if;
  if p_statut <> 'actif' and coalesce(btrim(p_motif), '') = '' then
    raise exception 'Le motif est obligatoire';
  end if;
  update public.partenaires set
    statut = p_statut, motif_statut = nullif(btrim(p_motif), ''),
    valide_le = case when p_statut = 'actif' and valide_le is null then now() else valide_le end,
    valide_par = case when p_statut = 'actif' and valide_par is null then auth.uid() else valide_par end
  where id = p_partenaire_id;
  if not found then
    raise exception 'Partenaire introuvable';
  end if;
end
$$;

create or replace function public.rattacher_client_partenaire(p_etablissement_id uuid, p_partenaire_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.exiger_super_admin();
  if not exists (select 1 from public.etablissements where id = p_etablissement_id) then
    raise exception 'Établissement introuvable';
  end if;
  if p_partenaire_id is null then
    raise exception 'Choisissez un partenaire';
  end if;
  insert into public.partenaire_clients(etablissement_id, partenaire_id, source, attribue_par)
  values (p_etablissement_id, p_partenaire_id, 'manuel', auth.uid())
  on conflict (etablissement_id) do update set partenaire_id = excluded.partenaire_id, source = 'manuel', depuis = now(), attribue_par = auth.uid();
end
$$;

create or replace function public.enregistrer_modele_licence(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := nullif(p ->> 'id', '')::uuid;
  v_offre public.offres%rowtype;
  resultat uuid;
begin
  perform public.exiger_super_admin();
  select * into v_offre from public.offres where id = p ->> 'offre_id';
  if v_offre.id is null then
    raise exception 'Choisissez une offre';
  end if;
  if coalesce(p ->> 'formule', '') not in ('essai', 'acquisition', 'mensuel', 'annuel') then
    raise exception 'Formule invalide';
  end if;
  if coalesce((p ->> 'montant')::numeric, 0) < 0 or coalesce((p ->> 'frais_installation')::numeric, 0) < 0 then
    raise exception 'Les montants ne peuvent pas être négatifs';
  end if;
  if v_id is null then
    insert into public.licence_modeles(nom, description, offre_id, formule, duree_jours, montant, frais_installation, appareils_max, formule_suivante, actif, ordre)
    values (btrim(p ->> 'nom'), nullif(btrim(p ->> 'description'), ''), v_offre.id, p ->> 'formule', nullif(p ->> 'duree_jours', '')::integer,
            coalesce((p ->> 'montant')::numeric, 0), coalesce((p ->> 'frais_installation')::numeric, 0), nullif(p ->> 'appareils_max', '')::integer,
            nullif(p ->> 'formule_suivante', ''), coalesce((p ->> 'actif')::boolean, true), coalesce((p ->> 'ordre')::integer, 0))
    returning id into resultat;
  else
    update public.licence_modeles set
      nom = btrim(p ->> 'nom'), description = nullif(btrim(p ->> 'description'), ''), offre_id = v_offre.id, formule = p ->> 'formule',
      duree_jours = nullif(p ->> 'duree_jours', '')::integer, montant = coalesce((p ->> 'montant')::numeric, 0),
      frais_installation = coalesce((p ->> 'frais_installation')::numeric, 0), appareils_max = nullif(p ->> 'appareils_max', '')::integer,
      formule_suivante = nullif(p ->> 'formule_suivante', ''), actif = coalesce((p ->> 'actif')::boolean, true), ordre = coalesce((p ->> 'ordre')::integer, 0)
    where id = v_id
    returning id into resultat;
    if resultat is null then
      raise exception 'Modèle introuvable';
    end if;
  end if;
  return resultat;
end
$$;

create or replace function public.generer_cles_licence(
  p_modele_id uuid,
  p_nombre integer default 1,
  p_partenaire_id uuid default null,
  p_client_nom text default null,
  p_client_telephone text default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  modele public.licence_modeles%rowtype;
  prefixe text;
  v_cle text;
  cles jsonb := '[]'::jsonb;
begin
  perform public.exiger_super_admin();
  select * into modele from public.licence_modeles where id = p_modele_id;
  if modele.id is null or not modele.actif then
    raise exception 'Modèle de licence introuvable ou retiré';
  end if;
  if p_nombre is null or p_nombre not between 1 and 100 then
    raise exception 'De 1 à 100 clés à la fois';
  end if;
  if p_partenaire_id is not null and not exists (select 1 from public.partenaires where id = p_partenaire_id and statut = 'actif') then
    raise exception 'Ce partenaire n''est pas actif';
  end if;
  select upper(left(regexp_replace(o.solution_id, '[^a-zA-Z0-9]', '', 'g') || 'XXX', 3)) into prefixe from public.offres o where o.id = modele.offre_id;
  for i in 1 .. p_nombre loop
    loop
      v_cle := 'ELITE-' || prefixe || '-' || public.partenaires_aleatoire(4) || '-' || public.partenaires_aleatoire(4);
      exit when not exists (select 1 from public.licence_cles k where k.cle = v_cle);
    end loop;
    insert into public.licence_cles(cle, modele_id, partenaire_id, client_nom, client_telephone, note, cree_par)
    values (v_cle, modele.id, p_partenaire_id, nullif(btrim(p_client_nom), ''), nullif(btrim(p_client_telephone), ''), nullif(btrim(p_note), ''), auth.uid());
    cles := cles || to_jsonb(v_cle);
  end loop;
  return cles;
end
$$;

create or replace function public.attribuer_cle_partenaire(p_cle_id uuid, p_partenaire_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.exiger_super_admin();
  if p_partenaire_id is not null and not exists (select 1 from public.partenaires where id = p_partenaire_id and statut = 'actif') then
    raise exception 'Ce partenaire n''est pas actif';
  end if;
  update public.licence_cles set partenaire_id = p_partenaire_id where id = p_cle_id and statut = 'disponible';
  if not found then
    raise exception 'Seule une clé disponible change de partenaire';
  end if;
end
$$;

-- Bloquer une clé : inutilisable ; si elle est déjà activée, sa licence est suspendue (réactivable depuis la fiche).
create or replace function public.bloquer_cle_licence(p_cle_id uuid, p_motif text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  k public.licence_cles%rowtype;
begin
  perform public.exiger_super_admin();
  if coalesce(btrim(p_motif), '') = '' then
    raise exception 'Le motif est obligatoire';
  end if;
  select * into k from public.licence_cles where id = p_cle_id for update;
  if k.id is null or k.statut = 'bloquee' then
    raise exception 'Clé introuvable ou déjà bloquée';
  end if;
  update public.licence_cles set statut = 'bloquee', bloquee_le = now(), motif = btrim(p_motif) where id = k.id;
  if k.licence_id is not null and exists (select 1 from public.licences where id = k.licence_id and statut = 'active') then
    perform public.definir_statut_licence(k.licence_id, 'suspendue', 'Clé bloquée : ' || btrim(p_motif));
  end if;
end
$$;

create or replace function public.annuler_commission(p_commission_id uuid, p_motif text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.exiger_super_admin();
  if coalesce(btrim(p_motif), '') = '' then
    raise exception 'Le motif est obligatoire';
  end if;
  update public.partenaire_commissions set statut = 'annulee', motif = btrim(p_motif)
  where id = p_commission_id and statut in ('en_attente', 'validee');
  if not found then
    raise exception 'Seule une commission non payée peut être annulée';
  end if;
end
$$;

-- Payer un partenaire : toutes ses commissions validées, en un seul paiement tracé.
create or replace function public.payer_partenaire(p_partenaire_id uuid, p_mode text, p_reference text default null, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  total numeric;
  nombre integer;
  paiement uuid;
  devise text := (select r.devise from public.partenaires_reglages r where r.id);
begin
  perform public.exiger_super_admin();
  if p_mode not in ('mobile_money', 'especes', 'virement') then
    raise exception 'Mode de paiement invalide';
  end if;
  if p_mode = 'mobile_money' and coalesce(btrim(p_reference), '') = '' then
    raise exception 'Indiquez la référence de la transaction Mobile Money';
  end if;
  perform public.partenaires_valider_echues();
  select coalesce(sum(montant), 0), count(*) into total, nombre
  from public.partenaire_commissions where partenaire_id = p_partenaire_id and statut = 'validee';
  if total <= 0 then
    raise exception 'Aucune commission validée à payer';
  end if;
  insert into public.partenaire_paiements(partenaire_id, montant, devise, mode, reference, note, cree_par)
  values (p_partenaire_id, total, devise, p_mode, nullif(btrim(p_reference), ''), nullif(btrim(p_note), ''), auth.uid())
  returning id into paiement;
  update public.partenaire_commissions set statut = 'payee', payee_le = now(), paiement_id = paiement
  where partenaire_id = p_partenaire_id and statut = 'validee';
  return jsonb_build_object('paiement_id', paiement, 'montant', total, 'commissions', nombre);
end
$$;

create or replace function public.traiter_demande_partenaire(p_demande_id uuid, p_statut text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_statut not in ('nouvelle', 'traitee', 'abandonnee') then
    raise exception 'Statut invalide';
  end if;
  update public.partenaire_demandes d set statut = p_statut, traitee_le = case when p_statut = 'nouvelle' then null else now() end
  where d.id = p_demande_id and (
    public.est_super_admin()
    or d.partenaire_id = (select p.id from public.partenaires p where p.user_id = auth.uid() and p.statut = 'actif')
  );
  if not found then
    raise exception 'Demande introuvable';
  end if;
end
$$;

-- Vue complète de l'espace « Elite Partners » (équipe Agence Elite).
create or replace function public.partenaires_editeur()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  resultat jsonb;
begin
  perform public.exiger_editeur();
  if public.est_super_admin() then
    perform public.partenaires_valider_echues();
  end if;
  select jsonb_build_object(
    'reglages', (select to_jsonb(r) from public.partenaires_reglages r where r.id),
    'partenaires', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'code', p.code, 'nom', p.nom, 'telephone', p.telephone, 'email', p.email, 'ville', p.ville,
        'mobile_money_numero', p.mobile_money_numero, 'mobile_money_operateur', p.mobile_money_operateur,
        'parrain_id', p.parrain_id, 'parrain', (select q.nom from public.partenaires q where q.id = p.parrain_id),
        'statut', p.statut, 'motif_statut', p.motif_statut, 'note', p.note, 'compte', p.user_id is not null,
        'cree_le', p.cree_le, 'valide_le', p.valide_le,
        'rang', public.partenaire_rang(p.id), 'actif_recemment', public.partenaire_actif(p.id),
        'filleuls', (select count(*) from public.partenaires f where f.parrain_id = p.id),
        'clients', (select count(*) from public.partenaire_clients pc where pc.partenaire_id = p.id),
        'cles_disponibles', (select count(*) from public.licence_cles k where k.partenaire_id = p.id and k.statut = 'disponible'),
        'en_attente', (select coalesce(sum(c.montant), 0) from public.partenaire_commissions c where c.partenaire_id = p.id and c.statut = 'en_attente'),
        'a_payer', (select coalesce(sum(c.montant), 0) from public.partenaire_commissions c where c.partenaire_id = p.id and c.statut = 'validee'),
        'paye', (select coalesce(sum(c.montant), 0) from public.partenaire_commissions c where c.partenaire_id = p.id and c.statut = 'payee'),
        'ventes', (select coalesce(sum(c.base), 0) from public.partenaire_commissions c where c.vendeur_id = p.id and c.niveau = 1 and c.statut <> 'annulee')
      ) order by p.cree_le desc) from public.partenaires p), '[]'::jsonb),
    'modeles', coalesce((
      select jsonb_agg(to_jsonb(m) || jsonb_build_object(
        'offre', o.nom, 'solution_id', o.solution_id, 'devise', o.devise,
        'cles', (select count(*) from public.licence_cles k where k.modele_id = m.id),
        'cles_activees', (select count(*) from public.licence_cles k where k.modele_id = m.id and k.statut = 'activee')
      ) order by m.ordre, m.nom) from public.licence_modeles m join public.offres o on o.id = m.offre_id), '[]'::jsonb),
    'offres', coalesce((
      select jsonb_agg(jsonb_build_object('id', o.id, 'nom', o.nom, 'solution_id', o.solution_id, 'devise', o.devise,
        'prix_acquisition', o.prix_acquisition, 'prix_mensuel', o.prix_mensuel, 'prix_annuel', o.prix_annuel, 'prix_mise_en_service', o.prix_mise_en_service
      ) order by o.solution_id, o.ordre) from public.offres o where o.actif), '[]'::jsonb),
    'cles', coalesce((
      select jsonb_agg(x.ligne order by x.cree_le desc) from (
        select k.cree_le, jsonb_build_object(
          'id', k.id, 'cle', k.cle, 'statut', k.statut, 'modele_id', k.modele_id, 'modele', m.nom, 'formule', m.formule,
          'partenaire_id', k.partenaire_id, 'partenaire', p.nom, 'client_nom', k.client_nom, 'client_telephone', k.client_telephone,
          'note', k.note, 'motif', k.motif, 'cree_le', k.cree_le, 'activee_le', k.activee_le,
          'etablissement_id', k.etablissement_id, 'etablissement', e.nom
        ) as ligne
        from public.licence_cles k
        join public.licence_modeles m on m.id = k.modele_id
        left join public.partenaires p on p.id = k.partenaire_id
        left join public.etablissements e on e.id = k.etablissement_id
        order by k.cree_le desc limit 1000
      ) x), '[]'::jsonb),
    'clients', coalesce((
      select jsonb_agg(jsonb_build_object(
        'etablissement_id', e.id, 'etablissement', e.nom, 'client', c.nom, 'partenaire_id', pc.partenaire_id, 'partenaire', p.nom,
        'source', pc.source, 'depuis', pc.depuis,
        'licence', (select jsonb_build_object('formule', l.formule, 'echeance', l.echeance, 'statut', l.statut, 'appareils_max', l.appareils_max)
                    from public.licences l where l.etablissement_id = e.id and l.statut <> 'terminee' order by l.cree_le desc limit 1),
        'valide', public.licence_valide(e.id),
        'appareils', (select count(*) from public.licence_appareils a where a.etablissement_id = e.id and a.actif)
      ) order by pc.depuis desc)
      from public.partenaire_clients pc
      join public.etablissements e on e.id = pc.etablissement_id
      join public.clients c on c.id = e.client_id
      join public.partenaires p on p.id = pc.partenaire_id), '[]'::jsonb),
    'etablissements', coalesce((
      select jsonb_agg(jsonb_build_object('id', e.id, 'nom', e.nom, 'client', c.nom) order by c.nom, e.nom)
      from public.etablissements e join public.clients c on c.id = e.client_id
      where e.statut <> 'archive' and not exists (select 1 from public.partenaire_clients pc where pc.etablissement_id = e.id)), '[]'::jsonb),
    'commissions', coalesce((
      select jsonb_agg(x.ligne order by x.cree_le desc) from (
        select c.cree_le, jsonb_build_object(
          'id', c.id, 'partenaire_id', c.partenaire_id, 'partenaire', p.nom, 'niveau', c.niveau, 'vendeur', v.nom,
          'etablissement', e.nom, 'base', c.base, 'taux', c.taux, 'montant', c.montant, 'devise', c.devise, 'rang', c.rang,
          'statut', c.statut, 'motif', c.motif, 'cree_le', c.cree_le, 'validee_le', c.validee_le, 'payee_le', c.payee_le
        ) as ligne
        from public.partenaire_commissions c
        join public.partenaires p on p.id = c.partenaire_id
        join public.partenaires v on v.id = c.vendeur_id
        join public.etablissements e on e.id = c.etablissement_id
        order by c.cree_le desc limit 1000
      ) x), '[]'::jsonb),
    'paiements', coalesce((
      select jsonb_agg(jsonb_build_object('id', x.id, 'partenaire', p.nom, 'montant', x.montant, 'devise', x.devise, 'mode', x.mode,
        'reference', x.reference, 'note', x.note, 'cree_le', x.cree_le) order by x.cree_le desc)
      from public.partenaire_paiements x join public.partenaires p on p.id = x.partenaire_id), '[]'::jsonb),
    'demandes', coalesce((
      select jsonb_agg(jsonb_build_object('id', d.id, 'partenaire', p.nom, 'partenaire_id', p.id, 'nom', d.nom, 'telephone', d.telephone,
        'entreprise', d.entreprise, 'ville', d.ville, 'message', d.message, 'statut', d.statut, 'cree_le', d.cree_le) order by d.cree_le desc)
      from public.partenaire_demandes d join public.partenaires p on p.id = d.partenaire_id), '[]'::jsonb)
  ) into resultat;
  return resultat;
end
$$;

-- 8. Fonctions du partenaire --------------------------------------------------------------------------------------
-- Devenir partenaire (compte connecté). Si l'équipe a déjà créé la fiche avec cette adresse, elle est reliée.
create or replace function public.devenir_partenaire(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  courriel text;
  existant public.partenaires%rowtype;
  parrain public.partenaires%rowtype;
  v_nom text := btrim(coalesce(p ->> 'nom', ''));
  v_tel text := btrim(coalesce(p ->> 'telephone', ''));
  resultat uuid;
begin
  if auth.uid() is null or not public.compte_pret() then
    raise exception 'Une connexion est requise';
  end if;
  if exists (select 1 from public.partenaires where user_id = auth.uid()) then
    raise exception 'Vous êtes déjà inscrit comme partenaire';
  end if;
  select lower(email) into courriel from auth.users where id = auth.uid();
  select * into existant from public.partenaires where user_id is null and courriel is not null and lower(email) = courriel for update;
  if existant.id is not null then
    update public.partenaires set user_id = auth.uid() where id = existant.id;
    return jsonb_build_object('id', existant.id, 'statut', existant.statut, 'relie', true);
  end if;
  if not (select r.inscription_ouverte from public.partenaires_reglages r where r.id) then
    raise exception 'Les inscriptions de partenaires sont fermées pour le moment';
  end if;
  if length(v_nom) < 2 then
    raise exception 'Indiquez votre nom';
  end if;
  if length(v_tel) < 6 then
    raise exception 'Indiquez votre téléphone';
  end if;
  if nullif(btrim(p ->> 'parrain'), '') is not null then
    select * into parrain from public.partenaires where code = upper(btrim(p ->> 'parrain')) and statut = 'actif';
    if parrain.id is null then
      raise exception 'Code de parrain inconnu';
    end if;
  end if;
  insert into public.partenaires(user_id, code, nom, telephone, email, ville, mobile_money_numero, mobile_money_operateur, parrain_id)
  values (auth.uid(), public.partenaires_nouveau_code(v_nom), v_nom, left(v_tel, 40), courriel, nullif(left(btrim(p ->> 'ville'), 80), ''),
          nullif(left(btrim(p ->> 'mobile_money_numero'), 40), ''), nullif(p ->> 'mobile_money_operateur', ''), parrain.id)
  returning id into resultat;
  perform public.partenaires_notifier_editeurs('Nouveau partenaire à valider', v_nom || coalesce(' · parrain ' || parrain.nom, ''));
  return jsonb_build_object('id', resultat, 'statut', 'en_attente', 'relie', false);
end
$$;

create or replace function public.modifier_mon_profil_partenaire(p jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.partenaires set
    telephone = coalesce(nullif(left(btrim(p ->> 'telephone'), 40), ''), telephone),
    ville = nullif(left(btrim(coalesce(p ->> 'ville', '')), 80), ''),
    mobile_money_numero = nullif(left(btrim(coalesce(p ->> 'mobile_money_numero', '')), 40), ''),
    mobile_money_operateur = nullif(p ->> 'mobile_money_operateur', '')
  where user_id = auth.uid() and statut <> 'refuse';
  if not found then
    raise exception 'Profil partenaire introuvable';
  end if;
end
$$;

-- L'espace du partenaire connecté : profil, rang, clients, clés, équipe, gains. Rien sur les clients de son équipe.
create or replace function public.partenaire_espace()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  moi public.partenaires%rowtype;
  reglage public.partenaires_reglages := public.partenaires_reglage();
begin
  if auth.uid() is null then
    raise exception 'Une connexion est requise';
  end if;
  select * into moi from public.partenaires where user_id = auth.uid();
  if moi.id is null then
    return jsonb_build_object('partenaire', null, 'inscription_ouverte', reglage.inscription_ouverte);
  end if;
  return jsonb_build_object(
    'partenaire', jsonb_build_object(
      'id', moi.id, 'code', moi.code, 'nom', moi.nom, 'telephone', moi.telephone, 'email', moi.email, 'ville', moi.ville,
      'mobile_money_numero', moi.mobile_money_numero, 'mobile_money_operateur', moi.mobile_money_operateur,
      'statut', moi.statut, 'motif_statut', moi.motif_statut, 'cree_le', moi.cree_le, 'valide_le', moi.valide_le,
      'parrain', (select q.nom from public.partenaires q where q.id = moi.parrain_id)
    ),
    'reglages', jsonb_build_object('taux_niveau1', reglage.taux_niveau1, 'taux_niveau2', reglage.taux_niveau2, 'taux_niveau3', reglage.taux_niveau3,
      'delai_validation_jours', reglage.delai_validation_jours, 'seuil_paiement', reglage.seuil_paiement, 'jours_activite', reglage.jours_activite,
      'devise', reglage.devise, 'rangs', reglage.rangs),
    'rang', public.partenaire_rang(moi.id),
    'actif_recemment', public.partenaire_actif(moi.id),
    'totaux', (select jsonb_build_object(
      'en_attente', coalesce(sum(c.montant) filter (where c.statut = 'en_attente'), 0),
      'validee', coalesce(sum(c.montant) filter (where c.statut = 'validee'), 0),
      'payee', coalesce(sum(c.montant) filter (where c.statut = 'payee'), 0),
      'ventes', coalesce(sum(c.base) filter (where c.niveau = 1 and c.statut <> 'annulee'), 0)
    ) from public.partenaire_commissions c where c.partenaire_id = moi.id),
    'clients', coalesce((
      select jsonb_agg(jsonb_build_object(
        'etablissement_id', e.id, 'etablissement', e.nom, 'client', c.nom, 'solution_id', e.solution_id, 'depuis', pc.depuis,
        'licence', (select jsonb_build_object('formule', l.formule, 'echeance', l.echeance, 'statut', l.statut, 'appareils_max', l.appareils_max)
                    from public.licences l where l.etablissement_id = e.id and l.statut <> 'terminee' order by l.cree_le desc limit 1),
        'valide', public.licence_valide(e.id),
        'appareils', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'nom', a.nom, 'premier_vu', a.premier_vu, 'dernier_vu', a.dernier_vu) order by a.premier_vu)
                               from public.licence_appareils a where a.etablissement_id = e.id and a.actif), '[]'::jsonb)
      ) order by pc.depuis desc)
      from public.partenaire_clients pc
      join public.etablissements e on e.id = pc.etablissement_id
      join public.clients c on c.id = e.client_id
      where pc.partenaire_id = moi.id), '[]'::jsonb),
    'cles', coalesce((
      select jsonb_agg(jsonb_build_object('id', k.id, 'cle', k.cle, 'statut', k.statut, 'modele', m.nom, 'formule', m.formule,
        'montant', m.montant, 'frais_installation', m.frais_installation, 'client_nom', k.client_nom, 'client_telephone', k.client_telephone,
        'etablissement', e.nom, 'activee_le', k.activee_le, 'cree_le', k.cree_le) order by k.statut = 'disponible' desc, k.cree_le desc)
      from public.licence_cles k join public.licence_modeles m on m.id = k.modele_id
      left join public.etablissements e on e.id = k.etablissement_id
      where k.partenaire_id = moi.id), '[]'::jsonb),
    'equipe', coalesce((
      select jsonb_agg(jsonb_build_object('nom', f.nom, 'ville', f.ville, 'statut', f.statut, 'cree_le', f.cree_le,
        'rang', public.partenaire_rang(f.id) -> 'rang' ->> 'nom', 'actif_recemment', public.partenaire_actif(f.id),
        'clients_actifs', public.partenaire_clients_actifs(f.id),
        'filleuls', (select count(*) from public.partenaires g where g.parrain_id = f.id)) order by f.cree_le desc)
      from public.partenaires f where f.parrain_id = moi.id), '[]'::jsonb),
    'commissions', coalesce((
      select jsonb_agg(x.ligne order by x.cree_le desc) from (
        select c.cree_le, jsonb_build_object('id', c.id, 'niveau', c.niveau, 'base', c.base, 'taux', c.taux, 'montant', c.montant,
          'devise', c.devise, 'statut', c.statut, 'cree_le', c.cree_le, 'payee_le', c.payee_le,
          -- Niveau 1 : son propre client ; niveaux 2 et 3 : seulement le nom du vendeur de son équipe.
          'origine', case when c.niveau = 1 then e.nom else 'Vente de ' || v.nom end) as ligne
        from public.partenaire_commissions c
        join public.etablissements e on e.id = c.etablissement_id
        join public.partenaires v on v.id = c.vendeur_id
        where c.partenaire_id = moi.id
        order by c.cree_le desc limit 500
      ) x), '[]'::jsonb),
    'paiements', coalesce((
      select jsonb_agg(jsonb_build_object('montant', x.montant, 'devise', x.devise, 'mode', x.mode, 'reference', x.reference, 'cree_le', x.cree_le) order by x.cree_le desc)
      from public.partenaire_paiements x where x.partenaire_id = moi.id), '[]'::jsonb),
    'demandes', coalesce((
      select jsonb_agg(jsonb_build_object('id', d.id, 'nom', d.nom, 'telephone', d.telephone, 'entreprise', d.entreprise, 'ville', d.ville,
        'message', d.message, 'statut', d.statut, 'cree_le', d.cree_le) order by d.cree_le desc)
      from public.partenaire_demandes d where d.partenaire_id = moi.id), '[]'::jsonb)
  );
end
$$;

-- Libérer la place d'un ordinateur (Agence Elite, ou le partenaire du client).
create or replace function public.retirer_appareil_licence(p_appareil_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.licence_appareils%rowtype;
begin
  select * into a from public.licence_appareils where id = p_appareil_id and actif for update;
  if a.id is null then
    raise exception 'Appareil introuvable';
  end if;
  if not (
    public.est_super_admin()
    or exists (
      select 1 from public.partenaire_clients pc join public.partenaires p on p.id = pc.partenaire_id
      where pc.etablissement_id = a.etablissement_id and p.user_id = auth.uid() and p.statut = 'actif'
    )
  ) then
    raise exception 'Seuls Agence Elite et le partenaire du client libèrent un ordinateur' using errcode = '42501';
  end if;
  update public.licence_appareils set actif = false, retire_le = now(), retire_par = auth.uid() where id = a.id;
end
$$;

-- 9. Activation d'une clé et contrôle de l'ordinateur ---------------------------------------------------------------
-- p_etablissement_id : activer sur un établissement existant (Agence Elite, ou son responsable) ;
-- sinon p_nouveau = { entreprise, etablissement, ville, pays } : le compte connecté crée son entreprise et en devient gérant.
create or replace function public.activer_cle_licence(p_cle text, p_etablissement_id uuid default null, p_nouveau jsonb default null, p_partenaire_code text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  k public.licence_cles%rowtype;
  modele public.licence_modeles%rowtype;
  offre public.offres%rowtype;
  etab public.etablissements%rowtype;
  v_cle text := upper(regexp_replace(coalesce(p_cle, ''), '\s', '', 'g'));
  v_client uuid;
  v_etab uuid := p_etablissement_id;
  v_entreprise text := btrim(coalesce(p_nouveau ->> 'entreprise', ''));
  v_nom text := btrim(coalesce(p_nouveau ->> 'etablissement', ''));
  v_partenaire uuid;
  v_licence uuid;
  v_echeance date;
begin
  if auth.uid() is null or not public.compte_pret() then
    raise exception 'Une connexion est requise';
  end if;
  select * into k from public.licence_cles where cle = v_cle for update;
  if k.id is null or k.statut <> 'disponible' then
    raise exception 'Clé inconnue, déjà utilisée ou bloquée';
  end if;
  select * into modele from public.licence_modeles where id = k.modele_id;
  select * into offre from public.offres where id = modele.offre_id;
  if not modele.actif or offre.id is null or not offre.actif then
    raise exception 'Cette clé correspond à une offre retirée : contactez Agence Elite';
  end if;
  if v_etab is not null then
    select * into etab from public.etablissements where id = v_etab;
    if etab.id is null then
      raise exception 'Établissement introuvable';
    end if;
    if not (public.est_super_admin() or public.a_permission(v_etab, 'etablissement.modifier')) then
      raise exception 'Seul le responsable de l''établissement peut y activer une licence' using errcode = '42501';
    end if;
    if etab.solution_id <> offre.solution_id then
      raise exception 'Cette clé est prévue pour une autre solution';
    end if;
  else
    if length(v_entreprise) < 2 or length(v_nom) < 2 then
      raise exception 'Indiquez le nom de l''entreprise et celui de l''établissement';
    end if;
    if length(v_entreprise) > 120 or length(v_nom) > 120 then
      raise exception 'Nom trop long (120 caractères au plus)';
    end if;
    insert into public.clients(nom, pays) values (v_entreprise, nullif(left(btrim(coalesce(p_nouveau ->> 'pays', '')), 60), ''))
    returning id into v_client;
    v_etab := public.initialiser_etablissement(v_client, offre.solution_id, v_nom);
    if nullif(btrim(p_nouveau ->> 'ville'), '') is not null then
      update public.etablissements set ville = left(btrim(p_nouveau ->> 'ville'), 80) where id = v_etab;
    end if;
    insert into public.etablissement_membres(etablissement_id, user_id, role_id)
    values (v_etab, auth.uid(), 'gerant')
    on conflict (etablissement_id, user_id) do update set role_id = 'gerant', actif = true;
  end if;

  -- Le client revient au partenaire de la clé, sinon à celui du lien suivi ; un client déjà rattaché le reste.
  v_partenaire := k.partenaire_id;
  if v_partenaire is null and nullif(btrim(p_partenaire_code), '') is not null then
    select id into v_partenaire from public.partenaires where code = upper(btrim(p_partenaire_code)) and statut = 'actif';
  end if;
  if v_partenaire is not null then
    insert into public.partenaire_clients(etablissement_id, partenaire_id, source, attribue_par)
    values (v_etab, v_partenaire, case when k.partenaire_id is not null then 'cle' else 'lien' end, auth.uid())
    on conflict (etablissement_id) do nothing;
  end if;

  update public.licence_cles set statut = 'activee', etablissement_id = v_etab, activee_le = now(), activee_par = auth.uid() where id = k.id;
  v_licence := public.poser_licence_modele(v_etab, modele, k.id, k.cle);
  update public.licence_cles set licence_id = v_licence where id = k.id;
  select echeance into v_echeance from public.licences where id = v_licence;
  perform public.partenaires_notifier_editeurs('Clé activée', k.cle || ' · ' || (select nom from public.etablissements where id = v_etab));
  return jsonb_build_object('etablissement_id', v_etab, 'licence_id', v_licence, 'formule', modele.formule, 'echeance', v_echeance,
                            'appareils_max', modele.appareils_max, 'nouveau', p_etablissement_id is null);
end
$$;

-- À l'ouverture : cet ordinateur peut-il utiliser l'établissement ? Il est enregistré s'il reste une place.
create or replace function public.verifier_appareil(p_etablissement_id uuid, p_appareil text, p_nom text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  limite integer;
  utilises integer;
  existant public.licence_appareils%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Une connexion est requise';
  end if;
  if coalesce(p_appareil, '') !~ '^[A-Za-z0-9_-]{16,64}$' then
    raise exception 'Identifiant d''appareil invalide';
  end if;
  -- Équipe Agence Elite, dirigeant et support : jamais bloqués par cette règle.
  if not public.est_membre(p_etablissement_id) then
    return jsonb_build_object('autorise', true, 'controle', false);
  end if;
  select l.appareils_max into limite from public.licences l
  where l.etablissement_id = p_etablissement_id and l.statut <> 'terminee' order by l.cree_le desc limit 1;
  select * into existant from public.licence_appareils where etablissement_id = p_etablissement_id and appareil = p_appareil;
  if existant.id is not null and existant.actif then
    update public.licence_appareils set dernier_vu = now() where id = existant.id and dernier_vu < now() - interval '5 minutes';
    return jsonb_build_object('autorise', true, 'controle', limite is not null, 'limite', limite);
  end if;
  if limite is null then
    return jsonb_build_object('autorise', true, 'controle', false);
  end if;
  select count(*) into utilises from public.licence_appareils where etablissement_id = p_etablissement_id and actif;
  if utilises >= limite then
    return jsonb_build_object('autorise', false, 'controle', true, 'limite', limite, 'utilises', utilises);
  end if;
  insert into public.licence_appareils(etablissement_id, appareil, nom, enregistre_par)
  values (p_etablissement_id, p_appareil, nullif(left(btrim(coalesce(p_nom, '')), 120), ''), auth.uid())
  on conflict (etablissement_id, appareil) do update set actif = true, retire_le = null, retire_par = null, dernier_vu = now(), nom = excluded.nom;
  return jsonb_build_object('autorise', true, 'controle', true, 'limite', limite, 'utilises', utilises + 1, 'nouveau', true);
end
$$;

-- 10. Pages publiques (sans compte) ---------------------------------------------------------------------------------
-- Nom affiché d'un partenaire actif à partir de son code (rien d'autre).
create or replace function public.partenaire_public(p_code text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('code', p.code, 'nom', p.nom)
  from public.partenaires p where p.code = upper(btrim(coalesce(p_code, ''))) and p.statut = 'actif'
$$;

-- Un prospect laisse ses coordonnées sur le lien d'un partenaire (30 demandes par partenaire et par jour au plus).
create or replace function public.demande_partenaire(p_code text, p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  partenaire public.partenaires%rowtype;
  v_nom text := btrim(coalesce(p ->> 'nom', ''));
  v_tel text := btrim(coalesce(p ->> 'telephone', ''));
begin
  select * into partenaire from public.partenaires where code = upper(btrim(coalesce(p_code, ''))) and statut = 'actif';
  if partenaire.id is null then
    raise exception 'Lien de partenaire inconnu';
  end if;
  if length(v_nom) not between 2 and 120 then
    raise exception 'Indiquez votre nom';
  end if;
  if length(v_tel) not between 6 and 40 then
    raise exception 'Indiquez votre téléphone';
  end if;
  if (select count(*) from public.partenaire_demandes where partenaire_id = partenaire.id and cree_le > now() - interval '1 day') >= 30 then
    raise exception 'Trop de demandes aujourd''hui : réessayez demain';
  end if;
  insert into public.partenaire_demandes(partenaire_id, nom, telephone, entreprise, ville, message)
  values (partenaire.id, v_nom, v_tel, nullif(left(btrim(coalesce(p ->> 'entreprise', '')), 120), ''),
          nullif(left(btrim(coalesce(p ->> 'ville', '')), 80), ''), nullif(left(btrim(coalesce(p ->> 'message', '')), 600), ''));
  if partenaire.user_id is not null then
    insert into public.notifications(user_id, type, titre, texte, lien)
    values (partenaire.user_id, 'partenaires.demande', 'Nouvelle demande d''un prospect', left(v_nom || ' · ' || v_tel, 600), 'partenaire');
  end if;
  return jsonb_build_object('ok', true, 'partenaire', partenaire.nom);
end
$$;

-- 11. Modèles proposés au départ (prix repris des offres, modifiables ensuite) --------------------------------------
insert into public.licence_modeles(nom, description, offre_id, formule, duree_jours, montant, frais_installation, appareils_max, formule_suivante, ordre)
select v.nom, v.description, o.id, v.formule, v.duree, v.montant, v.installation, 1, v.suivante, v.ordre
from public.offres o
cross join lateral (values
  ('Essai 1 mois (installation payée)', 'Le client a réglé l''installation ; 30 jours offerts, puis mensuel ou annuel.', 'essai', 30, 0::numeric, o.prix_mise_en_service, 'mensuel', 1),
  ('Mensuel', 'Abonnement d''un mois.', 'mensuel', null::integer, o.prix_mensuel, 0::numeric, null::text, 2),
  ('Annuel', 'Abonnement d''un an.', 'annuel', null::integer, o.prix_annuel, 0::numeric, null::text, 3),
  ('Acquisition (à vie)', 'Licence achetée une fois.', 'acquisition', null::integer, o.prix_acquisition, o.prix_mise_en_service, null::text, 4)
) as v(nom, description, formule, duree, montant, installation, suivante, ordre)
where o.id = 'commerce-complet' and o.actif
  and not exists (select 1 from public.licence_modeles);

-- 12. Droits d'exécution --------------------------------------------------------------------------------------------
revoke execute on function public.partenaires_sans_boucle() from public, anon, authenticated;
revoke execute on function public.partenaires_aleatoire(integer) from public, anon, authenticated;
revoke execute on function public.partenaires_nouveau_code(text) from public, anon, authenticated;
revoke execute on function public.partenaires_reglage() from public, anon, authenticated;
revoke execute on function public.partenaire_actif(uuid) from public, anon, authenticated;
revoke execute on function public.partenaire_clients_actifs(uuid) from public, anon, authenticated;
revoke execute on function public.partenaire_equipe_active(uuid) from public, anon, authenticated;
revoke execute on function public.partenaire_rang(uuid) from public, anon, authenticated;
revoke execute on function public.partenaires_commissionner() from public, anon, authenticated;
revoke execute on function public.partenaires_valider_echues() from public, anon, authenticated;
revoke execute on function public.partenaires_notifier_editeurs(text, text) from public, anon, authenticated;
revoke execute on function public.initialiser_etablissement(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.poser_licence_modele(uuid, public.licence_modeles, uuid, text) from public, anon, authenticated;

revoke execute on function public.creer_etablissement(uuid, text, text) from public, anon;
grant execute on function public.creer_etablissement(uuid, text, text) to authenticated;

do $$
declare
  f text;
begin
  foreach f in array array[
    'enregistrer_reglages_partenaires(jsonb)', 'enregistrer_partenaire(jsonb)', 'definir_statut_partenaire(uuid, text, text)',
    'rattacher_client_partenaire(uuid, uuid)', 'enregistrer_modele_licence(jsonb)', 'generer_cles_licence(uuid, integer, uuid, text, text, text)',
    'attribuer_cle_partenaire(uuid, uuid)', 'bloquer_cle_licence(uuid, text)', 'annuler_commission(uuid, text)',
    'payer_partenaire(uuid, text, text, text)', 'traiter_demande_partenaire(uuid, text)', 'partenaires_editeur()',
    'devenir_partenaire(jsonb)', 'modifier_mon_profil_partenaire(jsonb)', 'partenaire_espace()', 'retirer_appareil_licence(uuid)',
    'activer_cle_licence(text, uuid, jsonb, text)', 'verifier_appareil(uuid, text, text)'
  ] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end
$$;

revoke execute on function public.partenaire_public(text) from public;
grant execute on function public.partenaire_public(text) to anon, authenticated;
revoke execute on function public.demande_partenaire(text, jsonb) from public;
grant execute on function public.demande_partenaire(text, jsonb) to anon, authenticated;

notify pgrst, 'reload schema';
