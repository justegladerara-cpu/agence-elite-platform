-- Elite License Guard : alertes d'échéance et renouvellement des licences, de bout en bout.
-- Réutilise l'existant : la licence reste celle de `licences` / `licence_evenements` (aucun 2e moteur), les alertes
-- partent par `notifications` (aucun 2e centre), le renouvellement se fait toujours par `renouveler_licence` avec
-- la référence du paiement (aucun paiement ni renouvellement n'est jamais créé ici).
--
-- 1. Réglages (paliers d'alerte, qui prévenir), modifiables par le super admin.
-- 2. Moteur d'échéance : état lisible d'une licence (à jour, bientôt, urgent, aujourd'hui, délai de grâce, expirée…).
-- 3. Calendrier et journal des alertes : une alerte par palier et par échéance, jamais deux.
-- 4. Tâche planifiée quotidienne (pg_cron), avec simulation sans envoi.
-- 5. Continuité de la caisse : une licence échue ne bloque JAMAIS une vente ni un encaissement.
-- 6. Mon abonnement et demandes de renouvellement côté client.
-- 7. Écrans de l'équipe Agence Elite (CRM) et des partenaires.
--
-- Correspondance avec les statuts réels (docs/LICENSE_GUARD.md) :
--   licences.statut 'terminee'                       → terminee   (remplacée, historique)
--   licences.statut 'suspendue'                      → suspendue  (décision manuelle, inchangée)
--   licences.statut 'active', echeance vide           → sans_echeance (acquisition)
--   licences.statut 'active', échéance > palier max   → a_jour
--   licences.statut 'active', 7 < jours <= palier max → bientot
--   licences.statut 'active', 1 <= jours <= 7         → urgent
--   licences.statut 'active', jours = 0               → aujourdhui
--   licences.statut 'active', échue, dans la grâce    → grace     (licence_valide encore vrai : 7 j payant, 0 essai)
--   licences.statut 'active', échue, après la grâce   → expiree   (licence_valide faux)
-- Additive et réversible : aucune table existante n'est modifiée ; seules deux fonctions existantes sont remplacées
-- (exiger_permission, emplacement_qr_ouvert), avec le même nom, les mêmes paramètres et la même règle pour tout ce
-- qui n'est pas la caisse. Retour arrière : docs/LICENSE_GUARD.md § « Revenir en arrière ».

-- ---------------------------------------------------------------------------------------------------------------
-- 1. Réglages
-- ---------------------------------------------------------------------------------------------------------------
create table if not exists public.licence_alertes_reglages (
  id boolean primary key default true check (id),
  actif boolean not null default true,
  -- Jours avant l'échéance (positifs), le jour même (0) et après (négatifs).
  paliers integer[] not null default '{30,15,7,3,1,0,-1,-3,-7}'
    check (cardinality(paliers) between 1 and 20 and -60 <= all (paliers) and 120 >= all (paliers)),
  prevenir_partenaire boolean not null default true,
  -- L'équipe Agence Elite est prévenue à partir de ce nombre de jours avant l'échéance.
  prevenir_equipe_jours integer not null default 7 check (prevenir_equipe_jours between -60 and 120),
  modifie_par uuid references auth.users(id) on delete restrict,
  modifie_le timestamptz not null default now()
);
insert into public.licence_alertes_reglages(id) values (true) on conflict do nothing;
alter table public.licence_alertes_reglages enable row level security;
drop policy if exists lecture on public.licence_alertes_reglages;
create policy lecture on public.licence_alertes_reglages for select to authenticated using (public.est_editeur());
drop trigger if exists licence_alertes_reglages_modifie_le on public.licence_alertes_reglages;
create trigger licence_alertes_reglages_modifie_le before update on public.licence_alertes_reglages
  for each row execute function public.fixer_modifie_le();
drop trigger if exists licence_alertes_reglages_audit on public.licence_alertes_reglages;
create trigger licence_alertes_reglages_audit after insert or update or delete on public.licence_alertes_reglages
  for each row execute function public.journaliser_modification();

create or replace function public.licence_alertes_reglage()
returns public.licence_alertes_reglages
language sql
stable
security definer
set search_path = ''
as $$
  select * from public.licence_alertes_reglages where id
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- 2. Moteur d'échéance
-- ---------------------------------------------------------------------------------------------------------------
-- Délai de grâce : le même que licence_valide (7 jours pour un abonnement payant, aucun pour un essai).
create or replace function public.licence_grace_jours(p_formule text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case when p_formule = 'essai' then 0 else 7 end
$$;

create or replace function public.licence_etat(p_statut text, p_formule text, p_echeance date, p_jour date default current_date)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when p_statut = 'terminee' then 'terminee'
    when p_statut = 'suspendue' then 'suspendue'
    when p_echeance is null then 'sans_echeance'
    when p_echeance - p_jour > coalesce((select max(x) from public.licence_alertes_reglages r, unnest(r.paliers) x where r.id), 30) then 'a_jour'
    when p_echeance - p_jour > 7 then 'bientot'
    when p_echeance - p_jour > 0 then 'urgent'
    when p_echeance = p_jour then 'aujourdhui'
    when p_jour - p_echeance <= public.licence_grace_jours(p_formule) then 'grace'
    else 'expiree'
  end
$$;

-- Toutes les licences en cours, avec leur état, leur client, leur partenaire. Base du calendrier et des alertes.
create or replace function public.licences_echeances(p_jour date default current_date)
returns table (
  licence_id uuid, etablissement_id uuid, etablissement text, etablissement_statut text, client_id uuid, client text,
  client_statut text, offre_id text, offre text, formule text, statut text, debut date, echeance date, jours integer,
  grace integer, fin_grace date, etat text, montant numeric, devise text, prix_mensuel numeric, prix_annuel numeric,
  partenaire_id uuid, partenaire text, partenaire_telephone text, partenaire_user uuid
)
language sql
stable
security definer
set search_path = ''
as $$
  select l.id, e.id, e.nom, e.statut, c.id, c.nom, c.statut, o.id, o.nom, l.formule, l.statut, l.debut, l.echeance,
         l.echeance - p_jour, public.licence_grace_jours(l.formule),
         l.echeance + public.licence_grace_jours(l.formule),
         public.licence_etat(l.statut, l.formule, l.echeance, p_jour),
         l.montant, l.devise, o.prix_mensuel, o.prix_annuel,
         p.id, p.nom, p.telephone, case when p.statut = 'actif' then p.user_id end
  from public.licences l
  join public.etablissements e on e.id = l.etablissement_id
  join public.clients c on c.id = e.client_id
  join public.offres o on o.id = l.offre_id
  left join public.partenaire_clients pc on pc.etablissement_id = e.id
  left join public.partenaires p on p.id = pc.partenaire_id
  where l.statut <> 'terminee'
$$;
revoke all on function public.licences_echeances(date) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- 3. Journal des alertes (une alerte par licence, par échéance et par palier)
-- ---------------------------------------------------------------------------------------------------------------
create table if not exists public.licence_alertes (
  id uuid primary key default gen_random_uuid(),
  licence_id uuid not null references public.licences(id) on delete restrict,
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  echeance date not null,
  palier integer not null,
  jours integer not null,
  etat text not null,
  destinataires integer not null default 0,
  cree_le timestamptz not null default now(),
  unique (licence_id, echeance, palier)
);
create index if not exists licence_alertes_etablissement_idx on public.licence_alertes(etablissement_id, cree_le desc);
create index if not exists licence_alertes_cree_le_idx on public.licence_alertes(cree_le desc);
alter table public.licence_alertes enable row level security;
drop policy if exists lecture on public.licence_alertes;
create policy lecture on public.licence_alertes for select to authenticated
  using (public.est_editeur() or public.a_permission(etablissement_id, 'etablissement.modifier'));
drop trigger if exists licence_alertes_sans_suppression on public.licence_alertes;
create trigger licence_alertes_sans_suppression before delete on public.licence_alertes
  for each row execute function public.refuser_suppression();
drop trigger if exists licence_alertes_figees on public.licence_alertes;
create trigger licence_alertes_figees before update on public.licence_alertes
  for each row execute function public.refuser_modification();

create or replace function public.licence_texte_alerte(p_formule text, p_offre text, p_echeance date, p_jours integer, p_grace integer)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_jours > 0 then
      case when p_formule = 'essai' then 'Votre essai gratuit (' || p_offre || ') se termine le ' else 'Votre abonnement ' || p_offre || ' arrive à échéance le ' end
      || to_char(p_echeance, 'DD/MM/YYYY') || ', dans ' || p_jours || ' jour(s). Demandez le renouvellement dans Paramètres › Mon abonnement.'
    when p_jours = 0 then
      case when p_formule = 'essai' then 'Votre essai gratuit se termine aujourd''hui.' else 'Votre abonnement arrive à échéance aujourd''hui.' end
      || ' Demandez le renouvellement dans Paramètres › Mon abonnement.'
    when -p_jours <= p_grace then
      'Votre abonnement est échu depuis ' || -p_jours || ' jour(s). Il reste ' || (p_grace + p_jours) || ' jour(s) de délai de grâce.'
    else
      'Votre abonnement a expiré le ' || to_char(p_echeance, 'DD/MM/YYYY') || '. Le reste du logiciel passe en consultation seule.'
  end || ' Vos ventes et vos encaissements continuent quoi qu''il arrive.'
$$;

-- Envoie les alertes dues le jour p_jour (aujourd'hui en production ; un autre jour seulement dans les tests). Avec p_simulation : rend la liste sans rien écrire ni envoyer.
-- Rattrapage : si un jour est manqué, le palier le plus proche franchi part une seule fois (jamais un palier
-- moins urgent après un plus urgent). Licence suspendue, établissement ou client non actif : rien n'est envoyé.
create or replace function public.alerter_echeances_licences(p_simulation boolean default false, p_jour date default current_date)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  reglage public.licence_alertes_reglages%rowtype;
  l record;
  v_palier integer;
  titre text;
  texte text;
  destinataires integer;
  liste jsonb := '[]'::jsonb;
  envoyees integer := 0;
begin
  select * into reglage from public.licence_alertes_reglages where id;
  if reglage.id is null or not reglage.actif then
    return jsonb_build_object('actif', false, 'envoyees', 0, 'simulation', p_simulation, 'liste', liste);
  end if;
  for l in
    select * from public.licences_echeances(p_jour) x
    where x.statut = 'active' and x.echeance is not null and x.debut <= p_jour
      and x.etablissement_statut = 'actif' and x.client_statut = 'actif'
    order by x.echeance
  loop
    select min(p) into v_palier from unnest(reglage.paliers) p where p >= l.jours;
    if v_palier is null then
      continue;
    end if;
    -- Déjà prévenu pour ce palier ou un plus urgent, sur cette échéance : rien.
    if exists (select 1 from public.licence_alertes a where a.licence_id = l.licence_id and a.echeance = l.echeance and a.palier <= v_palier) then
      continue;
    end if;
    titre := case
      when l.jours > 0 then case when l.formule = 'essai' then 'Fin de l''essai dans ' else 'Abonnement : échéance dans ' end || l.jours || ' jour(s)'
      when l.jours = 0 then 'Abonnement : échéance aujourd''hui'
      when l.etat = 'grace' then 'Abonnement échu : délai de grâce'
      else 'Abonnement expiré'
    end;
    texte := public.licence_texte_alerte(l.formule, l.offre, l.echeance, l.jours, l.grace);
    select count(*) into destinataires from public.membres_avec_permission(l.etablissement_id, 'etablissement.modifier');
    liste := liste || jsonb_build_object(
      'licence_id', l.licence_id, 'etablissement_id', l.etablissement_id, 'etablissement', l.etablissement, 'client', l.client,
      'echeance', l.echeance, 'jours', l.jours, 'palier', v_palier, 'etat', l.etat, 'titre', titre, 'texte', texte,
      'destinataires', destinataires, 'partenaire', l.partenaire
    );
    if p_simulation then
      continue;
    end if;
    insert into public.licence_alertes(licence_id, etablissement_id, echeance, palier, jours, etat, destinataires)
    values (l.licence_id, l.etablissement_id, l.echeance, v_palier, l.jours, l.etat, destinataires)
    on conflict do nothing;
    if not found then
      continue;
    end if;
    envoyees := envoyees + 1;
    -- Responsables de l'établissement (même règle que les autres alertes : la permission, pas le titre).
    perform public.notifier(r, l.etablissement_id, 'licence.echeance', titre || ' · ' || l.etablissement, texte, 'parametres/licence')
    from public.membres_avec_permission(l.etablissement_id, 'etablissement.modifier') r;
    -- Partenaire Elite Partners du client.
    if reglage.prevenir_partenaire and l.partenaire_user is not null then
      perform public.notifier(l.partenaire_user, null, 'licence.echeance_partenaire',
        'Client à renouveler : ' || l.etablissement,
        l.client || ' · ' || l.offre || ' · échéance le ' || to_char(l.echeance, 'DD/MM/YYYY') || ' (' || l.jours || ' j). Appelez-le pour le renouvellement.',
        'partenaire');
    end if;
    -- Équipe Agence Elite (lue aussi dans le CRM, écran Échéances).
    if l.jours <= reglage.prevenir_equipe_jours then
      perform public.notifier(a.user_id, l.etablissement_id, 'licence.echeance_equipe',
        titre || ' · ' || l.etablissement, l.client || ' · ' || l.offre || ' · échéance le ' || to_char(l.echeance, 'DD/MM/YYYY') || '.', null)
      from public.plateforme_admins a where a.actif and a.role in ('super_admin', 'admin');
    end if;
  end loop;
  return jsonb_build_object('actif', true, 'envoyees', envoyees, 'simulation', p_simulation, 'jour', p_jour, 'liste', liste);
end
$$;
revoke all on function public.alerter_echeances_licences(boolean, date) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- 4. Tâche planifiée : chaque jour à 07:00 UTC (08:00 à Brazzaville). Sans pg_cron (tests, démo locale), l'équipe
--    peut lancer la simulation depuis le CRM ; l'envoi réel reste réservé à la tâche planifiée.
-- ---------------------------------------------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('alerter-echeances-licences', '0 7 * * *', 'select public.alerter_echeances_licences()');
  end if;
exception when others then
  raise warning 'Tâche planifiée non installée (%) : alertes d''échéance à lancer à la main', sqlerrm;
end
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- 5. Continuité de la caisse
-- ---------------------------------------------------------------------------------------------------------------
-- Gestes de vente et d'encaissement qui continuent même quand la licence est échue (date dépassée).
-- La suspension manuelle d'une licence, d'un établissement ou d'un client reste, elle, une décision qui bloque.
-- Même liste côté écran : src/noyau/continuite.js (vérifié par tests/license_guard.test.js).
create or replace function public.permissions_continuite()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array[
    'caisse.utiliser', 'caisse.rattraper', 'caisse.reserve', 'caisse.offerts_pertes', 'cloture.cloturer',
    'ventes.annuler', 'ventes.retourner', 'paiements.encaisser', 'fidelite.utiliser',
    'restaurant_salle.servir', 'restaurant_salle.encaisser', 'restaurant_salle.affecter', 'restaurant_salle.transferer',
    'hotel_reservations.sejour', 'scolaire.encaisser', 'immo_locations.encaisser'
  ]::text[]
$$;

-- Vrai si l'établissement et son client sont actifs et que sa licence en cours n'est ni suspendue ni terminée,
-- même si son échéance est dépassée.
create or replace function public.caisse_continue(p_etablissement_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.etablissements e
    join public.clients c on c.id = e.client_id
    join public.licences l on l.etablissement_id = e.id and l.statut = 'active' and l.debut <= current_date
    where e.id = p_etablissement_id and e.statut = 'actif' and c.statut = 'actif'
  )
$$;

-- Même fonction qu'avant (migration 20261002000004), avec une seule différence : une permission de la liste de
-- continuité passe quand seule l'échéance de la licence est dépassée.
create or replace function public.exiger_permission(p_etablissement_id uuid, p_permission text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Une authentification est requise';
  end if;
  if not public.a_permission(p_etablissement_id, p_permission) then
    raise exception 'Permission refusée : %', p_permission using errcode = '42501';
  end if;
  if not public.etablissement_autorise_ecriture(p_etablissement_id)
     and not (p_permission = any (public.permissions_continuite()) and public.caisse_continue(p_etablissement_id)) then
    raise exception 'Établissement suspendu ou archivé : aucune écriture possible' using errcode = '42501';
  end if;
end
$$;

-- Menu QR des tables : la commande depuis la table continue aussi quand seule l'échéance est dépassée.
create or replace function public.emplacement_qr_ouvert(p_jeton text)
returns public.emplacements_qr
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  e public.emplacements_qr%rowtype;
begin
  select em.* into e from public.emplacements_qr em
  join public.menus_qr m on m.etablissement_id = em.etablissement_id and m.actif
  where em.jeton = lower(btrim(coalesce(p_jeton, ''))) and em.actif;
  if e.id is null or not public.module_actif(e.etablissement_id, 'caisse')
     or not (public.etablissement_autorise_ecriture(e.etablissement_id) or public.caisse_continue(e.etablissement_id)) then
    raise exception 'Menu introuvable ou fermé';
  end if;
  return e;
end
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- 6. Demandes de renouvellement et « Mon abonnement »
-- ---------------------------------------------------------------------------------------------------------------
create table if not exists public.licence_demandes (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  licence_id uuid references public.licences(id) on delete restrict,
  formule text not null check (formule in ('mensuel', 'annuel', 'acquisition', 'autre')),
  message text check (message is null or length(message) <= 600),
  telephone text check (telephone is null or length(telephone) <= 40),
  statut text not null default 'nouvelle' check (statut in ('nouvelle', 'en_cours', 'traitee', 'abandonnee')),
  note text check (note is null or length(note) <= 600),
  demandeur uuid not null references auth.users(id) on delete restrict,
  traite_par uuid references auth.users(id) on delete restrict,
  cree_le timestamptz not null default now(),
  traitee_le timestamptz,
  modifie_le timestamptz not null default now()
);
create index if not exists licence_demandes_etablissement_idx on public.licence_demandes(etablissement_id, cree_le desc);
create index if not exists licence_demandes_statut_idx on public.licence_demandes(statut, cree_le desc);
create index if not exists licence_demandes_licence_idx on public.licence_demandes(licence_id);
create index if not exists licence_demandes_demandeur_idx on public.licence_demandes(demandeur);
create index if not exists licence_demandes_traite_par_idx on public.licence_demandes(traite_par);
-- Une seule demande ouverte à la fois par établissement.
create unique index if not exists licence_demandes_une_ouverte on public.licence_demandes(etablissement_id)
  where statut in ('nouvelle', 'en_cours');
alter table public.licence_demandes enable row level security;
drop policy if exists lecture on public.licence_demandes;
create policy lecture on public.licence_demandes for select to authenticated
  using (
    public.est_editeur()
    or public.a_permission(etablissement_id, 'etablissement.modifier')
    or public.est_dirigeant((select e.client_id from public.etablissements e where e.id = etablissement_id))
  );
drop trigger if exists licence_demandes_modifie_le on public.licence_demandes;
create trigger licence_demandes_modifie_le before update on public.licence_demandes
  for each row execute function public.fixer_modifie_le();
drop trigger if exists licence_demandes_sans_suppression on public.licence_demandes;
create trigger licence_demandes_sans_suppression before delete on public.licence_demandes
  for each row execute function public.refuser_suppression();
drop trigger if exists licence_demandes_verrou_etablissement on public.licence_demandes;
create trigger licence_demandes_verrou_etablissement before update on public.licence_demandes
  for each row execute function public.verrouiller_etablissement_id();
drop trigger if exists licence_demandes_audit on public.licence_demandes;
create trigger licence_demandes_audit after insert or update or delete on public.licence_demandes
  for each row execute function public.journaliser_modification();

-- Le responsable (ou le dirigeant) demande le renouvellement. Marche aussi quand la licence est échue : la demande
-- ne passe pas par exiger_permission. Elle ne prolonge rien : seul un paiement enregistré par Agence Elite le fait.
create or replace function public.demander_renouvellement_licence(p_etablissement_id uuid, p_formule text, p_message text default null,
  p_telephone text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  etab public.etablissements%rowtype;
  licence_id uuid;
  resultat uuid;
  partenaire uuid;
begin
  if auth.uid() is null then
    raise exception 'Une authentification est requise';
  end if;
  select * into etab from public.etablissements where id = p_etablissement_id;
  if etab.id is null or not (public.a_permission(etab.id, 'etablissement.modifier') or public.est_dirigeant(etab.client_id)) then
    raise exception 'Permission refusée : seul un responsable de l''établissement demande le renouvellement' using errcode = '42501';
  end if;
  if etab.statut = 'archive' then
    raise exception 'Établissement archivé';
  end if;
  if p_formule is null or p_formule not in ('mensuel', 'annuel', 'acquisition', 'autre') then
    raise exception 'Formule invalide';
  end if;
  if exists (select 1 from public.licence_demandes d where d.etablissement_id = etab.id and d.statut in ('nouvelle', 'en_cours')) then
    raise exception 'Une demande est déjà en cours : Agence Elite vous recontacte';
  end if;
  select l.id into licence_id from public.licences l where l.etablissement_id = etab.id and l.statut <> 'terminee';
  insert into public.licence_demandes(etablissement_id, licence_id, formule, message, telephone, demandeur)
  values (etab.id, licence_id, p_formule, left(nullif(btrim(p_message), ''), 600), left(nullif(btrim(p_telephone), ''), 40), auth.uid())
  returning id into resultat;
  perform public.notifier(a.user_id, etab.id, 'licence.demande', 'Demande de renouvellement · ' || etab.nom,
    'Formule souhaitée : ' || p_formule || coalesce(' · ' || nullif(btrim(p_telephone), ''), '') || coalesce(' · ' || left(nullif(btrim(p_message), ''), 300), ''), null)
  from public.plateforme_admins a where a.actif and a.role in ('super_admin', 'admin');
  select p.user_id into partenaire from public.partenaire_clients pc join public.partenaires p on p.id = pc.partenaire_id
  where pc.etablissement_id = etab.id and p.statut = 'actif';
  perform public.notifier(partenaire, null, 'licence.demande_partenaire', 'Demande de renouvellement : ' || etab.nom,
    'Votre client souhaite renouveler (' || p_formule || '). Agence Elite enregistre le paiement.', 'partenaire');
  return resultat;
end
$$;

-- L'équipe Agence Elite fait avancer une demande. « Traitée » exige qu'un renouvellement ou une nouvelle licence
-- ait vraiment été enregistré après la demande : une demande ne se clôt jamais sur un paiement inventé.
create or replace function public.traiter_demande_licence(p_demande_id uuid, p_statut text, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.licence_demandes%rowtype;
  nom text;
begin
  perform public.exiger_editeur();
  if p_statut not in ('en_cours', 'traitee', 'abandonnee') then
    raise exception 'Statut de demande invalide';
  end if;
  select * into d from public.licence_demandes where id = p_demande_id for update;
  if d.id is null then
    raise exception 'Demande introuvable';
  end if;
  if d.statut in ('traitee', 'abandonnee') then
    raise exception 'Cette demande est déjà close';
  end if;
  if p_statut = 'abandonnee' and coalesce(btrim(p_note), '') = '' then
    raise exception 'Le motif est obligatoire pour abandonner une demande';
  end if;
  if p_statut = 'traitee' and not exists (
    select 1 from public.licence_evenements ev
    where ev.etablissement_id = d.etablissement_id and ev.type in ('renouvellement', 'attribution') and ev.cree_le >= d.cree_le
  ) then
    raise exception 'Aucun renouvellement enregistré depuis la demande : encaissez d''abord le paiement (avec sa référence)';
  end if;
  update public.licence_demandes
  set statut = p_statut, note = coalesce(left(nullif(btrim(p_note), ''), 600), note), traite_par = auth.uid(),
      traitee_le = case when p_statut in ('traitee', 'abandonnee') then now() end
  where id = d.id;
  if p_statut in ('traitee', 'abandonnee') then
    select e.nom into nom from public.etablissements e where e.id = d.etablissement_id;
    perform public.notifier(d.demandeur, d.etablissement_id, 'licence.demande_close',
      case when p_statut = 'traitee' then 'Abonnement renouvelé · ' || nom else 'Demande de renouvellement close · ' || nom end,
      nullif(btrim(p_note), ''), 'parametres/licence');
  end if;
end
$$;

-- Écran « Mon abonnement » de l'établissement. Le détail (historique, demandes) est réservé aux responsables.
create or replace function public.mon_abonnement(p_etablissement_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  etab public.etablissements%rowtype;
  responsable boolean;
  x record;
begin
  select * into etab from public.etablissements where id = p_etablissement_id;
  if etab.id is null or not (public.a_permission(etab.id, 'etablissement.lire') or public.est_dirigeant(etab.client_id)
                             or public.session_support_active(etab.id)) then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;
  responsable := public.a_permission(etab.id, 'etablissement.modifier') or public.est_dirigeant(etab.client_id);
  select * into x from public.licences_echeances() l where l.etablissement_id = etab.id;
  return jsonb_build_object(
    'responsable', responsable,
    'licence', case when x.licence_id is null then null else jsonb_build_object(
      'id', x.licence_id, 'offre', x.offre, 'formule', x.formule, 'statut', x.statut, 'debut', x.debut, 'echeance', x.echeance,
      'jours', x.jours, 'grace', x.grace, 'fin_grace', x.fin_grace, 'etat', x.etat, 'montant', x.montant, 'devise', x.devise,
      'valide', public.licence_valide(etab.id), 'caisse_continue', public.caisse_continue(etab.id),
      -- Prix réglés par Agence Elite dans son espace (jamais dans le code), à titre indicatif.
      'tarifs', jsonb_build_object('mensuel', x.prix_mensuel, 'annuel', x.prix_annuel, 'devise', x.devise)
    ) end,
    'partenaire', case when x.partenaire_id is null then null else jsonb_build_object('nom', x.partenaire, 'telephone', x.partenaire_telephone) end,
    'historique', case when responsable then coalesce((
      select jsonb_agg(jsonb_build_object('type', ev.type, 'date', ev.cree_le, 'ancienne_echeance', ev.ancienne_echeance,
        'nouvelle_echeance', ev.nouvelle_echeance, 'montant', ev.montant, 'reference', ev.reference) order by ev.cree_le desc)
      from (select * from public.licence_evenements where etablissement_id = etab.id order by cree_le desc limit 20) ev
    ), '[]'::jsonb) else '[]'::jsonb end,
    'demandes', case when responsable then coalesce((
      select jsonb_agg(jsonb_build_object('id', d.id, 'formule', d.formule, 'statut', d.statut, 'message', d.message,
        'note', d.note, 'cree_le', d.cree_le, 'traitee_le', d.traitee_le) order by d.cree_le desc)
      from (select * from public.licence_demandes where etablissement_id = etab.id order by cree_le desc limit 10) d
    ), '[]'::jsonb) else '[]'::jsonb end,
    'alertes', case when responsable then coalesce((
      select jsonb_agg(jsonb_build_object('date', a.cree_le, 'jours', a.jours, 'etat', a.etat, 'echeance', a.echeance) order by a.cree_le desc)
      from (select * from public.licence_alertes where etablissement_id = etab.id order by cree_le desc limit 10) a
    ), '[]'::jsonb) else '[]'::jsonb end
  );
end
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- 7. Équipe Agence Elite (CRM) et partenaires
-- ---------------------------------------------------------------------------------------------------------------
-- Calendrier : licences dont l'échéance tombe entre p_debut et p_fin, plus toutes celles en grâce, expirées ou
-- suspendues ; demandes ouvertes ; 50 dernières alertes ; réglages. Lecture seule.
create or replace function public.editeur_echeances(p_debut date default null, p_fin date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_debut date := coalesce(p_debut, current_date - 31);
  v_fin date := coalesce(p_fin, current_date + 92);
begin
  perform public.exiger_editeur();
  if v_fin < v_debut or v_fin - v_debut > 800 then
    raise exception 'Période invalide (800 jours au plus)';
  end if;
  return jsonb_build_object(
    'jour', current_date,
    'debut', v_debut,
    'fin', v_fin,
    'reglages', (select to_jsonb(r) - 'id' - 'modifie_par' from public.licence_alertes_reglages r where r.id),
    'licences', coalesce((
      select jsonb_agg(to_jsonb(l) - 'partenaire_user' order by l.echeance nulls last, l.etablissement)
      from public.licences_echeances() l
      where l.etablissement_statut <> 'archive'
        and ((l.echeance between v_debut and v_fin) or l.etat in ('grace', 'expiree', 'suspendue'))
    ), '[]'::jsonb),
    'compteurs', coalesce((
      select jsonb_object_agg(etat, n) from (
        select l.etat, count(*) n from public.licences_echeances() l where l.etablissement_statut <> 'archive' group by l.etat
      ) c
    ), '{}'::jsonb),
    'demandes', coalesce((
      select jsonb_agg(jsonb_build_object('id', d.id, 'etablissement_id', d.etablissement_id, 'etablissement', e.nom, 'client_id', e.client_id,
        'client', c.nom, 'formule', d.formule, 'message', d.message, 'telephone', d.telephone, 'statut', d.statut, 'note', d.note,
        'cree_le', d.cree_le, 'demandeur', coalesce(pr.nom_complet, u.email)) order by d.cree_le)
      from public.licence_demandes d
      join public.etablissements e on e.id = d.etablissement_id
      join public.clients c on c.id = e.client_id
      left join public.profils pr on pr.id = d.demandeur
      left join auth.users u on u.id = d.demandeur
      where d.statut in ('nouvelle', 'en_cours')
    ), '[]'::jsonb),
    'alertes', coalesce((
      select jsonb_agg(jsonb_build_object('date', a.cree_le, 'etablissement', e.nom, 'echeance', a.echeance, 'jours', a.jours,
        'palier', a.palier, 'etat', a.etat, 'destinataires', a.destinataires) order by a.cree_le desc)
      from (select * from public.licence_alertes order by cree_le desc limit 50) a
      join public.etablissements e on e.id = a.etablissement_id
    ), '[]'::jsonb)
  );
end
$$;

-- Simulation pour l'équipe : ce que la tâche planifiée enverrait aujourd'hui, sans rien écrire.
create or replace function public.simuler_alertes_echeances()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.exiger_editeur();
  return public.alerter_echeances_licences(true);
end
$$;

create or replace function public.enregistrer_reglages_alertes_licences(p jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_paliers integer[];
begin
  perform public.exiger_super_admin();
  if p ? 'paliers' then
    select array_agg(distinct v::integer order by v::integer desc) into v_paliers from jsonb_array_elements_text(p -> 'paliers') v;
    if v_paliers is null or cardinality(v_paliers) = 0 then
      raise exception 'Au moins un palier d''alerte est nécessaire';
    end if;
  end if;
  update public.licence_alertes_reglages set
    actif = coalesce((p ->> 'actif')::boolean, actif),
    paliers = coalesce(v_paliers, licence_alertes_reglages.paliers),
    prevenir_partenaire = coalesce((p ->> 'prevenir_partenaire')::boolean, prevenir_partenaire),
    prevenir_equipe_jours = coalesce((p ->> 'prevenir_equipe_jours')::integer, prevenir_equipe_jours),
    modifie_par = auth.uid()
  where id;
end
$$;

-- Espace partenaire : échéances de ses propres clients seulement.
create or replace function public.partenaire_echeances()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  moi uuid;
begin
  select id into moi from public.partenaires where user_id = auth.uid() and statut = 'actif';
  if moi is null then
    raise exception 'Espace réservé aux partenaires actifs' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('etablissement', l.etablissement, 'client', l.client, 'offre', l.offre, 'formule', l.formule,
      'echeance', l.echeance, 'jours', l.jours, 'etat', l.etat,
      'demande', exists (select 1 from public.licence_demandes d where d.etablissement_id = l.etablissement_id and d.statut in ('nouvelle', 'en_cours')))
      order by l.echeance nulls last)
    from public.licences_echeances() l
    where l.partenaire_id = moi and l.etablissement_statut <> 'archive' and l.etat <> 'sans_echeance'
  ), '[]'::jsonb);
end
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- Droits
-- ---------------------------------------------------------------------------------------------------------------
revoke all on function public.licence_alertes_reglage() from public, anon, authenticated;
revoke all on function public.licence_texte_alerte(text, text, date, integer, integer) from public, anon;
revoke all on function public.caisse_continue(uuid) from public, anon;
revoke all on function public.demander_renouvellement_licence(uuid, text, text, text) from public, anon;
revoke all on function public.traiter_demande_licence(uuid, text, text) from public, anon;
revoke all on function public.mon_abonnement(uuid) from public, anon;
revoke all on function public.editeur_echeances(date, date) from public, anon;
revoke all on function public.simuler_alertes_echeances() from public, anon;
revoke all on function public.enregistrer_reglages_alertes_licences(jsonb) from public, anon;
revoke all on function public.partenaire_echeances() from public, anon;
grant execute on function public.caisse_continue(uuid) to authenticated;
grant execute on function public.demander_renouvellement_licence(uuid, text, text, text) to authenticated;
grant execute on function public.traiter_demande_licence(uuid, text, text) to authenticated;
grant execute on function public.mon_abonnement(uuid) to authenticated;
grant execute on function public.editeur_echeances(date, date) to authenticated;
grant execute on function public.simuler_alertes_echeances() to authenticated;
grant execute on function public.enregistrer_reglages_alertes_licences(jsonb) to authenticated;
grant execute on function public.partenaire_echeances() to authenticated;

notify pgrst, 'reload schema';
