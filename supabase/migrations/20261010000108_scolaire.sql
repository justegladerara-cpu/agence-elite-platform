-- Scolaire (module M09, Bêta) : années scolaires, classes et frais, élèves et responsables, inscriptions, paiements
-- des frais, impayés. Pour écoles, centres de formation, crèches. Aucun barème imposé : chaque classe a ses frais.
-- Rien ne se supprime : une inscription se termine (abandon, transfert) avec motif ; un paiement est définitif.
-- Proposé, jamais activé d'office.

-- ---------------------------------------------------------------------------
-- 1. Catalogue, droits, rôle Secrétariat
-- ---------------------------------------------------------------------------
insert into public.categories_modules (id, nom, description, icone, ordre) values
  ('education', 'Éducation', 'Écoles, formations, inscriptions et frais.', 'membres', 105)
on conflict (id) do nothing;
insert into public.modules (id, nom, description, nature, statut, categorie, icone, ordre, version, documentation) values
  ('scolaire', 'Scolaire', 'Années scolaires, classes et frais, élèves, inscriptions, paiements et impayés.',
   'metier', 'beta', 'education', 'membres', 400, '0.1', 'docs/SCOLAIRE.md')
on conflict (id) do nothing;
update public.modules set parametres_schema = '[
  {"cle": "jours_avant_relance", "libelle": "Jours après l’inscription avant de signaler un impayé", "type": "nombre", "defaut": 30}
]'::jsonb where id = 'scolaire';
insert into public.module_dependances (module_id, depend_de) values ('scolaire', 'contacts')
on conflict do nothing;
insert into public.solution_modules (solution_id, module_id, par_defaut)
select s.id, 'scolaire', false from public.solutions s where s.id in ('services')
on conflict (solution_id, module_id) do nothing;

insert into public.roles (id, nom, description, ordre, modules_requis) values
  ('secretariat', 'Secrétariat', 'Élèves, inscriptions et paiements des frais', 57, '{scolaire}')
on conflict (id) do nothing;

insert into public.permissions (id, module_id, description) values
  ('scolaire.lire', 'scolaire', 'Voir les élèves, classes, inscriptions et paiements'),
  ('scolaire.inscrire', 'scolaire', 'Enregistrer les élèves et les inscriptions'),
  ('scolaire.encaisser', 'scolaire', 'Encaisser les frais de scolarité'),
  ('scolaire.gerer', 'scolaire', 'Gérer les années, classes, frais, remises et fins d''inscription')
on conflict (id) do nothing;
insert into public.role_permissions (role_id, permission_id)
select r, p from unnest(array['gerant', 'responsable']) r
cross join unnest(array['scolaire.lire', 'scolaire.inscrire', 'scolaire.encaisser', 'scolaire.gerer']) p
where exists (select 1 from public.roles where id = r)
on conflict do nothing;
insert into public.role_permissions (role_id, permission_id)
select r, p from unnest(array['secretariat']) r
cross join unnest(array['scolaire.lire', 'scolaire.inscrire', 'scolaire.encaisser']) p
where exists (select 1 from public.roles where id = r)
on conflict do nothing;
insert into public.role_permissions (role_id, permission_id)
select r, p from unnest(array['comptable']) r cross join unnest(array['scolaire.lire', 'scolaire.encaisser']) p
where exists (select 1 from public.roles where id = r)
on conflict do nothing;
insert into public.role_permissions (role_id, permission_id) select 'lecteur', 'scolaire.lire'
where exists (select 1 from public.roles where id = 'lecteur')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 2. Tables
-- ---------------------------------------------------------------------------
create table public.sco_annees (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  libelle text not null check (btrim(libelle) <> '' and length(libelle) <= 40),
  debut date not null,
  fin date not null,
  active boolean not null default false,
  cree_le timestamptz not null default now(),
  unique (etablissement_id, libelle),
  check (fin > debut)
);
create unique index sco_annees_une_active on public.sco_annees(etablissement_id) where active;

create table public.sco_classes (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  annee_id uuid not null references public.sco_annees(id) on delete restrict,
  nom text not null check (btrim(nom) <> '' and length(nom) <= 60),
  niveau text check (niveau is null or length(niveau) <= 60),
  capacite integer check (capacite is null or capacite > 0),
  frais_inscription numeric(14, 2) not null default 0 check (frais_inscription >= 0),
  frais_scolarite numeric(14, 2) not null default 0 check (frais_scolarite >= 0),
  actif boolean not null default true,
  cree_le timestamptz not null default now(),
  unique (annee_id, nom)
);

create table public.sco_eleves (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  matricule text not null check (btrim(matricule) <> '' and length(matricule) <= 30),
  nom text not null check (btrim(nom) <> '' and length(nom) <= 80),
  prenom text check (prenom is null or length(prenom) <= 80),
  date_naissance date,
  responsable_id uuid references public.contacts(id) on delete restrict,
  note text check (note is null or length(note) <= 500),
  actif boolean not null default true,
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  unique (etablissement_id, matricule)
);

create table public.sco_inscriptions (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  eleve_id uuid not null references public.sco_eleves(id) on delete restrict,
  annee_id uuid not null references public.sco_annees(id) on delete restrict,
  classe_id uuid not null references public.sco_classes(id) on delete restrict,
  montant_du numeric(14, 2) not null check (montant_du >= 0),
  remise numeric(14, 2) not null default 0 check (remise >= 0),
  motif_remise text check (motif_remise is null or length(motif_remise) <= 200),
  montant_paye numeric(14, 2) not null default 0 check (montant_paye >= 0),
  statut text not null default 'inscrit' check (statut in ('inscrit', 'abandon', 'transfere')),
  motif_fin text,
  cree_par uuid not null references auth.users(id) on delete restrict,
  cree_le timestamptz not null default now(),
  termine_le timestamptz,
  unique (eleve_id, annee_id),
  check (remise <= montant_du),
  check (montant_paye <= montant_du - remise),
  check (remise = 0 or btrim(coalesce(motif_remise, '')) <> ''),
  check (statut = 'inscrit' or (termine_le is not null and btrim(coalesce(motif_fin, '')) <> ''))
);
create index sco_inscriptions_classe_idx on public.sco_inscriptions(classe_id);

create table public.sco_paiements (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  inscription_id uuid not null references public.sco_inscriptions(id) on delete restrict,
  numero text not null,
  montant numeric(14, 2) not null check (montant > 0),
  mode text not null check (mode in ('especes', 'mobile_money', 'carte', 'virement', 'cheque')),
  reference text check (reference is null or length(reference) <= 100),
  par uuid not null references auth.users(id) on delete restrict,
  cree_le timestamptz not null default now(),
  unique (etablissement_id, numero)
);

alter table public.sco_annees enable row level security;
alter table public.sco_classes enable row level security;
alter table public.sco_eleves enable row level security;
alter table public.sco_inscriptions enable row level security;
alter table public.sco_paiements enable row level security;
create policy lecture on public.sco_annees for select to authenticated using (public.lecture_autorisee(etablissement_id, 'scolaire.lire'));
create policy lecture on public.sco_classes for select to authenticated using (public.lecture_autorisee(etablissement_id, 'scolaire.lire'));
create policy lecture on public.sco_eleves for select to authenticated using (public.lecture_autorisee(etablissement_id, 'scolaire.lire'));
create policy lecture on public.sco_inscriptions for select to authenticated using (public.lecture_autorisee(etablissement_id, 'scolaire.lire'));
create policy lecture on public.sco_paiements for select to authenticated using (public.lecture_autorisee(etablissement_id, 'scolaire.lire'));
revoke insert, update, delete on public.sco_annees, public.sco_classes, public.sco_eleves, public.sco_inscriptions, public.sco_paiements from anon, authenticated;

create trigger sco_annees_etab before update on public.sco_annees for each row execute function public.verrouiller_etablissement_id();
create trigger sco_annees_sans_suppression before delete on public.sco_annees for each row execute function public.refuser_suppression();
create trigger sco_annees_audit after insert or update or delete on public.sco_annees for each row execute function public.journaliser_modification();
create trigger sco_classes_etab before update on public.sco_classes for each row execute function public.verrouiller_etablissement_id();
create trigger sco_classes_sans_suppression before delete on public.sco_classes for each row execute function public.refuser_suppression();
create trigger sco_classes_audit after insert or update or delete on public.sco_classes for each row execute function public.journaliser_modification();
create trigger sco_eleves_etab before update on public.sco_eleves for each row execute function public.verrouiller_etablissement_id();
create trigger sco_eleves_sans_suppression before delete on public.sco_eleves for each row execute function public.refuser_suppression();
create trigger sco_eleves_audit after insert or update or delete on public.sco_eleves for each row execute function public.journaliser_modification();
create trigger sco_inscriptions_etab before update on public.sco_inscriptions for each row execute function public.verrouiller_etablissement_id();
create trigger sco_inscriptions_sans_suppression before delete on public.sco_inscriptions for each row execute function public.refuser_suppression();
create trigger sco_inscriptions_audit after insert or update or delete on public.sco_inscriptions for each row execute function public.journaliser_modification();
create trigger sco_paiements_definitifs before update on public.sco_paiements for each row execute function public.refuser_modification();
create trigger sco_paiements_sans_suppression before delete on public.sco_paiements for each row execute function public.refuser_suppression();
create trigger sco_paiements_audit after insert or update or delete on public.sco_paiements for each row execute function public.journaliser_modification();

-- ---------------------------------------------------------------------------
-- 3. Fonctions
-- ---------------------------------------------------------------------------
-- Année : p = { id?, libelle, debut, fin, active? } ; une seule année active.
create function public.enregistrer_annee_scolaire(p_etablissement_id uuid, p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := nullif(p ->> 'id', '')::uuid;
  v_active boolean := coalesce((p ->> 'active')::boolean, false);
begin
  perform public.exiger_permission(p_etablissement_id, 'scolaire.gerer');
  if coalesce(btrim(p ->> 'libelle'), '') = '' then raise exception 'Le libellé est obligatoire (ex. 2026-2027)'; end if;
  if nullif(p ->> 'debut', '') is null or nullif(p ->> 'fin', '') is null or (p ->> 'fin')::date <= (p ->> 'debut')::date then
    raise exception 'Dates invalides';
  end if;
  if v_active then
    update public.sco_annees set active = false where etablissement_id = p_etablissement_id and active and id is distinct from v_id;
  end if;
  if v_id is null then
    insert into public.sco_annees (etablissement_id, libelle, debut, fin, active)
    values (p_etablissement_id, btrim(p ->> 'libelle'), (p ->> 'debut')::date, (p ->> 'fin')::date, v_active)
    returning id into v_id;
  else
    update public.sco_annees set libelle = btrim(p ->> 'libelle'), debut = (p ->> 'debut')::date, fin = (p ->> 'fin')::date, active = v_active
    where id = v_id and etablissement_id = p_etablissement_id;
    if not found then raise exception 'Année introuvable'; end if;
  end if;
  return v_id;
exception when unique_violation then
  raise exception 'Cette année existe déjà';
end
$$;

-- Classe : p = { id?, annee_id, nom, niveau?, capacite?, frais_inscription?, frais_scolarite?, actif? }
create function public.enregistrer_classe(p_etablissement_id uuid, p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := nullif(p ->> 'id', '')::uuid;
  v_annee uuid := nullif(p ->> 'annee_id', '')::uuid;
  v_fi numeric := coalesce(nullif(p ->> 'frais_inscription', '')::numeric, 0);
  v_fs numeric := coalesce(nullif(p ->> 'frais_scolarite', '')::numeric, 0);
  v_cap integer := nullif(p ->> 'capacite', '')::integer;
begin
  perform public.exiger_permission(p_etablissement_id, 'scolaire.gerer');
  if not exists (select 1 from public.sco_annees where id = v_annee and etablissement_id = p_etablissement_id) then raise exception 'Année introuvable'; end if;
  if coalesce(btrim(p ->> 'nom'), '') = '' then raise exception 'Le nom de la classe est obligatoire'; end if;
  if v_fi < 0 or v_fs < 0 or v_fi = 'NaN'::numeric or v_fs = 'NaN'::numeric then raise exception 'Frais invalides'; end if;
  if v_cap is not null and v_cap <= 0 then raise exception 'Capacité invalide'; end if;
  if v_id is null then
    insert into public.sco_classes (etablissement_id, annee_id, nom, niveau, capacite, frais_inscription, frais_scolarite)
    values (p_etablissement_id, v_annee, btrim(p ->> 'nom'), nullif(btrim(p ->> 'niveau'), ''), v_cap, round(v_fi, 2), round(v_fs, 2))
    returning id into v_id;
  else
    -- Les frais d'une classe ne changent pas les inscriptions déjà faites (montant figé à l'inscription).
    update public.sco_classes set nom = btrim(p ->> 'nom'), niveau = nullif(btrim(p ->> 'niveau'), ''), capacite = v_cap,
      frais_inscription = round(v_fi, 2), frais_scolarite = round(v_fs, 2), actif = coalesce((p ->> 'actif')::boolean, actif)
    where id = v_id and etablissement_id = p_etablissement_id and annee_id = v_annee;
    if not found then raise exception 'Classe introuvable'; end if;
  end if;
  return v_id;
exception when unique_violation then
  raise exception 'Cette classe existe déjà pour cette année';
end
$$;

-- Élève : p = { id?, matricule?, nom, prenom?, date_naissance?, responsable_id?, note?, actif? } ; matricule généré si vide.
create function public.enregistrer_eleve(p_etablissement_id uuid, p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := nullif(p ->> 'id', '')::uuid;
  v_resp uuid := nullif(p ->> 'responsable_id', '')::uuid;
  v_matricule text := nullif(btrim(p ->> 'matricule'), '');
begin
  perform public.exiger_permission(p_etablissement_id, 'scolaire.inscrire');
  if coalesce(btrim(p ->> 'nom'), '') = '' then raise exception 'Le nom est obligatoire'; end if;
  if v_resp is not null and not exists (select 1 from public.contacts where id = v_resp and etablissement_id = p_etablissement_id) then
    raise exception 'Responsable introuvable';
  end if;
  if v_id is null then
    insert into public.sco_eleves (etablissement_id, matricule, nom, prenom, date_naissance, responsable_id, note)
    values (p_etablissement_id, coalesce(v_matricule, public.prochain_numero(p_etablissement_id, 'eleve', 'EL-')), btrim(p ->> 'nom'),
            nullif(btrim(p ->> 'prenom'), ''), nullif(p ->> 'date_naissance', '')::date, v_resp, nullif(btrim(p ->> 'note'), ''))
    returning id into v_id;
  else
    update public.sco_eleves set matricule = coalesce(v_matricule, matricule), nom = btrim(p ->> 'nom'), prenom = nullif(btrim(p ->> 'prenom'), ''),
      date_naissance = nullif(p ->> 'date_naissance', '')::date, responsable_id = v_resp, note = nullif(btrim(p ->> 'note'), ''),
      actif = coalesce((p ->> 'actif')::boolean, actif), modifie_le = now()
    where id = v_id and etablissement_id = p_etablissement_id;
    if not found then raise exception 'Élève introuvable'; end if;
  end if;
  return v_id;
exception when unique_violation then
  raise exception 'Ce matricule existe déjà';
end
$$;

-- Inscription : p = { eleve_id, classe_id, remise?, motif_remise? } ; montant dû = frais de la classe au jour de l'inscription.
create function public.inscrire_eleve(p_etablissement_id uuid, p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  k public.sco_classes%rowtype;
  v_remise numeric := coalesce(nullif(p ->> 'remise', '')::numeric, 0);
  v_inscrits integer;
  v_id uuid;
begin
  perform public.exiger_permission(p_etablissement_id, 'scolaire.inscrire');
  select * into k from public.sco_classes where id = nullif(p ->> 'classe_id', '')::uuid and etablissement_id = p_etablissement_id for update;
  if k.id is null or not k.actif then raise exception 'Classe introuvable ou fermée'; end if;
  if not exists (select 1 from public.sco_eleves where id = nullif(p ->> 'eleve_id', '')::uuid and etablissement_id = p_etablissement_id and actif) then
    raise exception 'Élève introuvable';
  end if;
  if v_remise < 0 or v_remise = 'NaN'::numeric then raise exception 'Remise invalide'; end if;
  if v_remise > 0 and not public.a_permission(p_etablissement_id, 'scolaire.gerer') then raise exception 'Seul un responsable accorde une remise'; end if;
  if v_remise > 0 and coalesce(btrim(p ->> 'motif_remise'), '') = '' then raise exception 'Le motif de la remise est obligatoire'; end if;
  if v_remise > k.frais_inscription + k.frais_scolarite then raise exception 'La remise dépasse les frais'; end if;
  select count(*) into v_inscrits from public.sco_inscriptions where classe_id = k.id and statut = 'inscrit';
  if k.capacite is not null and v_inscrits >= k.capacite then raise exception 'Classe complète (% places)', k.capacite; end if;
  insert into public.sco_inscriptions (etablissement_id, eleve_id, annee_id, classe_id, montant_du, remise, motif_remise, cree_par)
  values (p_etablissement_id, (p ->> 'eleve_id')::uuid, k.annee_id, k.id, k.frais_inscription + k.frais_scolarite, round(v_remise, 2),
          nullif(btrim(p ->> 'motif_remise'), ''), auth.uid())
  returning id into v_id;
  return v_id;
exception when unique_violation then
  raise exception 'Cet élève est déjà inscrit cette année';
end
$$;

create function public.encaisser_scolarite(p_inscription_id uuid, p_montant numeric, p_mode text, p_reference text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  i public.sco_inscriptions%rowtype;
  v_reste numeric;
  v_numero text;
begin
  select * into i from public.sco_inscriptions where id = p_inscription_id for update;
  if i.id is null then raise exception 'Inscription introuvable'; end if;
  perform public.exiger_permission(i.etablissement_id, 'scolaire.encaisser');
  if p_montant is null or p_montant <= 0 or p_montant = 'NaN'::numeric then raise exception 'Montant invalide'; end if;
  if p_mode is null or p_mode not in ('especes', 'mobile_money', 'carte', 'virement', 'cheque') then raise exception 'Mode de paiement inconnu'; end if;
  v_reste := i.montant_du - i.remise - i.montant_paye;
  if round(p_montant, 2) > v_reste then raise exception 'Le montant dépasse le reste à payer (%)', v_reste; end if;
  v_numero := public.prochain_numero(i.etablissement_id, 'recu_scolarite', 'RS-');
  insert into public.sco_paiements (etablissement_id, inscription_id, numero, montant, mode, reference, par)
  values (i.etablissement_id, i.id, v_numero, round(p_montant, 2), p_mode, nullif(btrim(p_reference), ''), auth.uid());
  update public.sco_inscriptions set montant_paye = montant_paye + round(p_montant, 2) where id = i.id;
  return jsonb_build_object('numero', v_numero, 'reste', v_reste - round(p_montant, 2));
end
$$;

create function public.terminer_inscription(p_inscription_id uuid, p_statut text, p_motif text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  i public.sco_inscriptions%rowtype;
begin
  select * into i from public.sco_inscriptions where id = p_inscription_id for update;
  if i.id is null then raise exception 'Inscription introuvable'; end if;
  perform public.exiger_permission(i.etablissement_id, 'scolaire.gerer');
  if i.statut <> 'inscrit' then raise exception 'Inscription déjà terminée'; end if;
  if p_statut not in ('abandon', 'transfere') then raise exception 'Statut inconnu'; end if;
  if coalesce(btrim(p_motif), '') = '' then raise exception 'Le motif est obligatoire'; end if;
  update public.sco_inscriptions set statut = p_statut, motif_fin = left(btrim(p_motif), 300), termine_le = now() where id = i.id;
end
$$;

-- ---------------------------------------------------------------------------
-- 4. Tableau de bord
-- ---------------------------------------------------------------------------
create function public.cockpit_scolaire(p_etablissement_id uuid, p_du date, p_au date, p_filtres jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  c public.cockpit_ctx;
  v_annee public.sco_annees%rowtype;
  v_inscrits bigint; v_du numeric; v_paye numeric; v_impayes bigint; v_encaisse numeric; v_encaisse_p numeric; v_nb_p bigint; v_premier date;
  v_comp boolean; v_completes bigint; v_delai integer;
begin
  if not public.lecture_autorisee(p_etablissement_id, 'scolaire.lire') then
    raise exception 'Permission refusée : scolaire.lire' using errcode = '42501';
  end if;
  c := public.cockpit_preparer(p_etablissement_id, p_du, p_au, p_filtres);
  select * into v_annee from public.sco_annees where etablissement_id = p_etablissement_id and active;
  v_delai := coalesce((select (ep.data ->> 'jours_avant_relance')::integer from public.etablissement_parametres ep
                       where ep.etablissement_id = p_etablissement_id and ep.module_id = 'scolaire'), 30);
  select count(*), coalesce(sum(i.montant_du - i.remise), 0), coalesce(sum(i.montant_paye), 0),
         count(*) filter (where i.montant_paye < i.montant_du - i.remise and i.cree_le < now() - make_interval(days => v_delai))
  into v_inscrits, v_du, v_paye, v_impayes
  from public.sco_inscriptions i where i.etablissement_id = p_etablissement_id and i.annee_id = v_annee.id and i.statut = 'inscrit';
  select coalesce(sum(p.montant) filter (where (p.cree_le at time zone c.tz)::date between c.du and c.au), 0),
         coalesce(sum(p.montant) filter (where (p.cree_le at time zone c.tz)::date between c.pdu and c.pau), 0),
         count(*) filter (where (p.cree_le at time zone c.tz)::date between c.pdu and c.pau), min((p.cree_le at time zone c.tz)::date)
  into v_encaisse, v_encaisse_p, v_nb_p, v_premier
  from public.sco_paiements p where p.etablissement_id = p_etablissement_id;
  v_comp := public.cockpit_comparable(v_nb_p, v_premier, c.pdu);
  select count(*) into v_completes from public.sco_classes k
  where k.annee_id = v_annee.id and k.actif and k.capacite is not null
    and (select count(*) from public.sco_inscriptions i where i.classe_id = k.id and i.statut = 'inscrit') >= k.capacite;
  return jsonb_build_object(
    'domaine', 'scolaire',
    'periode', jsonb_build_object('du', c.du, 'au', c.au, 'du_precedent', c.pdu, 'au_precedent', c.pau, 'comparable', v_comp),
    'kpis', public.cockpit_liste(array[
      public.cockpit_kpi('inscrits', 'Élèves inscrits', v_inscrits, 'nombre', 'scolaire', null, v_annee.libelle, null, true),
      public.cockpit_kpi('encaisse', 'Frais encaissés', v_encaisse, 'montant', 'scolaire?vue=paiements', case when v_comp then v_encaisse_p end, null, null, true),
      public.cockpit_kpi('reste', 'Reste à percevoir', v_du - v_paye, 'montant', 'scolaire?paiement=impaye', null,
        case when v_du > 0 then format('%s %% perçu', round(v_paye * 100 / v_du)) end, case when v_impayes > 0 then 'attention' end)
    ]),
    'attention', public.cockpit_liste(array[
      public.cockpit_alerte('impayes', 'alerte', 'Élèves avec des frais impayés', format('Inscrits depuis plus de %s jours', v_delai), v_impayes, 'scolaire?paiement=impaye'),
      public.cockpit_alerte('completes', 'info', 'Classes complètes', null, v_completes, 'scolaire?vue=classes'),
      public.cockpit_alerte('sans_annee', 'alerte', 'Aucune année scolaire active', 'Créez ou activez l’année en cours',
        case when v_annee.id is null then 1 else 0 end, 'scolaire?vue=classes')
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
    (9, 'tresorerie', 'Trésorerie', public.lecture_autorisee(p_etablissement_id, 'depenses.lire') and public.lecture_autorisee(p_etablissement_id, 'paiements.lire')),
    (10, 'crm', 'CRM', public.lecture_autorisee(p_etablissement_id, 'crm_pipeline.lire')),
    (11, 'achats', 'Achats', public.lecture_autorisee(p_etablissement_id, 'achats.lire')),
    (12, 'production', 'Production', public.lecture_autorisee(p_etablissement_id, 'production.lire')),
    (13, 'rh', 'RH', public.lecture_autorisee(p_etablissement_id, 'rh_employes.lire')),
    (14, 'projets', 'Projets', public.lecture_autorisee(p_etablissement_id, 'projets.lire')),
    (15, 'agenda', 'Agenda', public.lecture_autorisee(p_etablissement_id, 'agenda.lire')),
    (16, 'support', 'Support', public.lecture_autorisee(p_etablissement_id, 'support_tickets.lire')),
    (17, 'abonnements', 'Abonnements', public.lecture_autorisee(p_etablissement_id, 'abonnements.lire')),
    (18, 'fidelite', 'Fidélité', public.lecture_autorisee(p_etablissement_id, 'fidelite.lire')),
    (19, 'siteweb', 'Site web', public.lecture_autorisee(p_etablissement_id, 'site_web.lire'))
  ) as d(ordre, id, titre, visible)
  where d.visible
$$;

revoke all on function public.enregistrer_annee_scolaire(uuid, jsonb) from public, anon;
revoke all on function public.enregistrer_classe(uuid, jsonb) from public, anon;
revoke all on function public.enregistrer_eleve(uuid, jsonb) from public, anon;
revoke all on function public.inscrire_eleve(uuid, jsonb) from public, anon;
revoke all on function public.encaisser_scolarite(uuid, numeric, text, text) from public, anon;
revoke all on function public.terminer_inscription(uuid, text, text) from public, anon;
revoke all on function public.cockpit_scolaire(uuid, date, date, jsonb) from public, anon;
grant execute on function public.enregistrer_annee_scolaire(uuid, jsonb) to authenticated;
grant execute on function public.enregistrer_classe(uuid, jsonb) to authenticated;
grant execute on function public.enregistrer_eleve(uuid, jsonb) to authenticated;
grant execute on function public.inscrire_eleve(uuid, jsonb) to authenticated;
grant execute on function public.encaisser_scolarite(uuid, numeric, text, text) to authenticated;
grant execute on function public.terminer_inscription(uuid, text, text) to authenticated;
grant execute on function public.cockpit_scolaire(uuid, date, date, jsonb) to authenticated;

notify pgrst, 'reload schema';
