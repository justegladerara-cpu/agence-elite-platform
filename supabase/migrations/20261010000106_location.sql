-- Location (module M07, Bêta) : parc d'objets loués, contrats (réservation → remise → retour), caution, paiements.
-- Un objet ne peut pas être dans deux contrats actifs qui se chevauchent (vérifié par la base, objets verrouillés).
-- Rien ne se supprime : un contrat se rend ou s'annule (motif) ; un objet se met hors service.
-- Proposé, jamais activé d'office. Lecture par RLS, écriture par RPC.

-- ---------------------------------------------------------------------------
-- 1. Catalogue et droits
-- ---------------------------------------------------------------------------
insert into public.modules (id, nom, description, nature, statut, categorie, icone, ordre, version, documentation) values
  ('location', 'Location', 'Parc d’objets loués, contrats, disponibilités, remise et retour, caution et paiements.',
   'transversal', 'beta', 'ventes', 'cle', 135, '0.1', 'docs/LOCATION.md')
on conflict (id) do nothing;
update public.modules set parametres_schema = '[
  {"cle": "jours_minimum", "libelle": "Nombre de jours facturés au minimum", "type": "nombre", "defaut": 1}
]'::jsonb where id = 'location';
insert into public.module_dependances (module_id, depend_de) values ('location', 'contacts')
on conflict do nothing;
insert into public.solution_modules (solution_id, module_id, par_defaut)
select s.id, 'location', false from public.solutions s where s.id in ('commerce', 'hotel', 'ecommerce', 'services')
on conflict (solution_id, module_id) do nothing;

insert into public.permissions (id, module_id, description) values
  ('location.lire', 'location', 'Voir le parc et les contrats de location'),
  ('location.louer', 'location', 'Créer des contrats, remettre, reprendre et encaisser'),
  ('location.gerer', 'location', 'Gérer le parc d''objets et annuler des contrats')
on conflict (id) do nothing;
insert into public.role_permissions (role_id, permission_id)
select r, p from unnest(array['gerant', 'responsable']) r
cross join unnest(array['location.lire', 'location.louer', 'location.gerer']) p
where exists (select 1 from public.roles where id = r)
on conflict do nothing;
insert into public.role_permissions (role_id, permission_id)
select r, p from unnest(array['responsable_hub', 'employe', 'receptionniste', 'commercial']) r
cross join unnest(array['location.lire', 'location.louer']) p
where exists (select 1 from public.roles where id = r)
on conflict do nothing;
insert into public.role_permissions (role_id, permission_id)
select r, 'location.lire' from unnest(array['lecteur', 'comptable']) r
where exists (select 1 from public.roles where id = r)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 2. Tables
-- ---------------------------------------------------------------------------
create table public.loc_objets (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  hub_id uuid,
  nom text not null check (btrim(nom) <> '' and length(nom) <= 120),
  reference text check (reference is null or length(reference) <= 60),
  categorie text check (categorie is null or length(categorie) <= 60),
  tarif_jour numeric(14, 2) not null check (tarif_jour >= 0),
  caution numeric(14, 2) not null default 0 check (caution >= 0),
  etat text not null default 'disponible' check (etat in ('disponible', 'maintenance', 'hors_service')),
  note text check (note is null or length(note) <= 500),
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  foreign key (hub_id, etablissement_id) references public.hubs(id, etablissement_id) on delete restrict
);
create unique index loc_objets_reference on public.loc_objets(etablissement_id, lower(reference)) where reference is not null;

create table public.loc_contrats (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  hub_id uuid not null,
  numero text not null,
  contact_id uuid not null references public.contacts(id) on delete restrict,
  debut date not null,
  fin_prevue date not null,
  statut text not null default 'reserve' check (statut in ('reserve', 'en_cours', 'rendu', 'annule')),
  montant_prevu numeric(14, 2) not null default 0 check (montant_prevu >= 0),
  montant_final numeric(14, 2) check (montant_final is null or montant_final >= 0),
  montant_paye numeric(14, 2) not null default 0 check (montant_paye >= 0),
  caution_montant numeric(14, 2) not null default 0 check (caution_montant >= 0),
  caution_statut text not null default 'aucune' check (caution_statut in ('aucune', 'a_recevoir', 'recue', 'rendue', 'retenue')),
  caution_retenue numeric(14, 2) not null default 0 check (caution_retenue >= 0),
  note text check (note is null or length(note) <= 500),
  remis_le timestamptz,
  rendu_le date,
  etat_retour text check (etat_retour is null or length(etat_retour) <= 500),
  cree_par uuid not null references auth.users(id) on delete restrict,
  cree_le timestamptz not null default now(),
  annule_le timestamptz,
  motif_annulation text,
  unique (etablissement_id, numero),
  foreign key (hub_id, etablissement_id) references public.hubs(id, etablissement_id) on delete restrict,
  check (fin_prevue >= debut),
  check (caution_retenue <= caution_montant),
  check (statut <> 'annule' or (annule_le is not null and btrim(coalesce(motif_annulation, '')) <> '')),
  check (statut <> 'rendu' or (rendu_le is not null and montant_final is not null))
);
create index loc_contrats_etab_idx on public.loc_contrats(etablissement_id, statut, fin_prevue);

create table public.loc_lignes (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  contrat_id uuid not null references public.loc_contrats(id) on delete restrict,
  objet_id uuid not null references public.loc_objets(id) on delete restrict,
  tarif_jour numeric(14, 2) not null check (tarif_jour >= 0),
  unique (contrat_id, objet_id)
);
create index loc_lignes_objet_idx on public.loc_lignes(objet_id);

create table public.loc_paiements (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  contrat_id uuid not null references public.loc_contrats(id) on delete restrict,
  montant numeric(14, 2) not null check (montant > 0),
  mode text not null check (mode in ('especes', 'mobile_money', 'carte', 'virement', 'cheque')),
  reference text check (reference is null or length(reference) <= 100),
  par uuid not null references auth.users(id) on delete restrict,
  cree_le timestamptz not null default now()
);

alter table public.loc_objets enable row level security;
alter table public.loc_contrats enable row level security;
alter table public.loc_lignes enable row level security;
alter table public.loc_paiements enable row level security;
create policy lecture on public.loc_objets for select to authenticated
  using (public.lecture_autorisee(etablissement_id, 'location.lire') and (hub_id is null or public.lecture_hub(etablissement_id, hub_id)));
create policy lecture on public.loc_contrats for select to authenticated
  using (public.lecture_autorisee(etablissement_id, 'location.lire') and public.lecture_hub(etablissement_id, hub_id));
create policy lecture on public.loc_lignes for select to authenticated
  using (public.lecture_autorisee(etablissement_id, 'location.lire')
         and exists (select 1 from public.loc_contrats c where c.id = contrat_id and public.lecture_hub(c.etablissement_id, c.hub_id)));
create policy lecture on public.loc_paiements for select to authenticated
  using (public.lecture_autorisee(etablissement_id, 'location.lire')
         and exists (select 1 from public.loc_contrats c where c.id = contrat_id and public.lecture_hub(c.etablissement_id, c.hub_id)));
revoke insert, update, delete on public.loc_objets, public.loc_contrats, public.loc_lignes, public.loc_paiements from anon, authenticated;

create trigger loc_objets_etab before update on public.loc_objets for each row execute function public.verrouiller_etablissement_id();
create trigger loc_objets_sans_suppression before delete on public.loc_objets for each row execute function public.refuser_suppression();
create trigger loc_objets_audit after insert or update or delete on public.loc_objets for each row execute function public.journaliser_modification();
create trigger loc_contrats_etab before update on public.loc_contrats for each row execute function public.verrouiller_etablissement_id();
create trigger loc_contrats_sans_suppression before delete on public.loc_contrats for each row execute function public.refuser_suppression();
create trigger loc_contrats_audit after insert or update or delete on public.loc_contrats for each row execute function public.journaliser_modification();
create trigger loc_lignes_definitives before update on public.loc_lignes for each row execute function public.refuser_modification();
create trigger loc_lignes_sans_suppression before delete on public.loc_lignes for each row execute function public.refuser_suppression();
create trigger loc_paiements_definitifs before update on public.loc_paiements for each row execute function public.refuser_modification();
create trigger loc_paiements_sans_suppression before delete on public.loc_paiements for each row execute function public.refuser_suppression();
create trigger loc_paiements_audit after insert or update or delete on public.loc_paiements for each row execute function public.journaliser_modification();

-- ---------------------------------------------------------------------------
-- 3. Fonctions
-- ---------------------------------------------------------------------------
-- Jours facturés : fin − début (au moins le minimum réglé, 1 par défaut).
create function public.loc_jours(p_etablissement_id uuid, p_debut date, p_fin date)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select greatest(coalesce((public.parametre_module(p_etablissement_id, 'location', 'jours_minimum') #>> '{}')::integer, 1), 1, p_fin - p_debut)
$$;
revoke all on function public.loc_jours(uuid, date, date) from public, anon, authenticated;

-- Objet : p = { id?, nom, reference?, categorie?, tarif_jour, caution?, hub_id?, etat?, note? }
create function public.enregistrer_objet_location(p_etablissement_id uuid, p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := nullif(p ->> 'id', '')::uuid;
  v_hub uuid := nullif(p ->> 'hub_id', '')::uuid;
  v_tarif numeric := nullif(p ->> 'tarif_jour', '')::numeric;
  v_caution numeric := coalesce(nullif(p ->> 'caution', '')::numeric, 0);
  v_etat text := coalesce(nullif(p ->> 'etat', ''), 'disponible');
begin
  perform public.exiger_permission(p_etablissement_id, 'location.gerer');
  if coalesce(btrim(p ->> 'nom'), '') = '' then raise exception 'Le nom est obligatoire'; end if;
  if v_tarif is null or v_tarif < 0 or v_tarif = 'NaN'::numeric then raise exception 'Tarif par jour invalide'; end if;
  if v_caution < 0 or v_caution = 'NaN'::numeric then raise exception 'Caution invalide'; end if;
  if v_etat not in ('disponible', 'maintenance', 'hors_service') then raise exception 'État inconnu'; end if;
  if v_hub is not null then
    if not exists (select 1 from public.hubs where id = v_hub and etablissement_id = p_etablissement_id) then raise exception 'Hub introuvable'; end if;
    perform public.exiger_acces_hub(v_hub);
  end if;
  if v_id is null then
    insert into public.loc_objets (etablissement_id, hub_id, nom, reference, categorie, tarif_jour, caution, etat, note)
    values (p_etablissement_id, v_hub, btrim(p ->> 'nom'), nullif(btrim(p ->> 'reference'), ''), nullif(btrim(p ->> 'categorie'), ''),
            round(v_tarif, 2), round(v_caution, 2), v_etat, nullif(btrim(p ->> 'note'), ''))
    returning id into v_id;
  else
    update public.loc_objets
    set hub_id = v_hub, nom = btrim(p ->> 'nom'), reference = nullif(btrim(p ->> 'reference'), ''), categorie = nullif(btrim(p ->> 'categorie'), ''),
        tarif_jour = round(v_tarif, 2), caution = round(v_caution, 2), etat = v_etat, note = nullif(btrim(p ->> 'note'), ''), modifie_le = now()
    where id = v_id and etablissement_id = p_etablissement_id;
    if not found then raise exception 'Objet introuvable'; end if;
  end if;
  return v_id;
exception when unique_violation then
  raise exception 'Cette référence existe déjà';
end
$$;

-- Contrat : p = { contact_id, objets: [uuid], debut, fin_prevue, hub_id?, caution?, note? }
create function public.creer_contrat_location(p_etablissement_id uuid, p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hub uuid := coalesce(nullif(p ->> 'hub_id', '')::uuid, public.hub_principal(p_etablissement_id));
  v_debut date := nullif(p ->> 'debut', '')::date;
  v_fin date := nullif(p ->> 'fin_prevue', '')::date;
  v_objets uuid[];
  v_nb integer;
  v_occupe text;
  v_jours integer;
  v_montant numeric;
  v_caution numeric;
  v_id uuid;
  v_numero text;
begin
  perform public.exiger_permission(p_etablissement_id, 'location.louer');
  if not exists (select 1 from public.hubs where id = v_hub and etablissement_id = p_etablissement_id and actif) then raise exception 'Hub introuvable'; end if;
  perform public.exiger_acces_hub(v_hub);
  if not exists (select 1 from public.contacts where id = nullif(p ->> 'contact_id', '')::uuid and etablissement_id = p_etablissement_id) then
    raise exception 'Client introuvable';
  end if;
  if v_debut is null or v_fin is null or v_fin < v_debut then raise exception 'Dates invalides'; end if;
  if v_fin - v_debut > 366 then raise exception 'Location d''un an au plus'; end if;
  if jsonb_typeof(p -> 'objets') <> 'array' or jsonb_array_length(p -> 'objets') = 0 then raise exception 'Choisissez au moins un objet'; end if;
  select array_agg(distinct x::uuid) into v_objets from jsonb_array_elements_text(p -> 'objets') x;
  -- Verrou sur les objets : deux réservations simultanées ne peuvent pas prendre le même objet.
  select count(*) into v_nb from (
    select 1 from public.loc_objets o where o.id = any (v_objets) and o.etablissement_id = p_etablissement_id and o.etat = 'disponible'
    order by o.id for update) t;
  if v_nb <> cardinality(v_objets) then raise exception 'Un objet est introuvable, en maintenance ou hors service'; end if;
  select string_agg(distinct o.nom, ', ') into v_occupe
  from public.loc_lignes l join public.loc_contrats c on c.id = l.contrat_id join public.loc_objets o on o.id = l.objet_id
  where l.objet_id = any (v_objets) and c.statut in ('reserve', 'en_cours')
    and c.debut <= v_fin and greatest(c.fin_prevue, case when c.statut = 'en_cours' then current_date else c.fin_prevue end) >= v_debut;
  if v_occupe is not null then raise exception 'Déjà loué sur ces dates : %', v_occupe; end if;
  v_jours := public.loc_jours(p_etablissement_id, v_debut, v_fin);
  select coalesce(sum(o.tarif_jour), 0) * v_jours, coalesce(sum(o.caution), 0) into v_montant, v_caution
  from public.loc_objets o where o.id = any (v_objets);
  v_caution := coalesce(nullif(p ->> 'caution', '')::numeric, v_caution);
  if v_caution < 0 or v_caution = 'NaN'::numeric then raise exception 'Caution invalide'; end if;
  v_numero := public.prochain_numero(p_etablissement_id, 'contrat_location', 'LC-');
  insert into public.loc_contrats (etablissement_id, hub_id, numero, contact_id, debut, fin_prevue, montant_prevu, caution_montant, caution_statut, note, cree_par)
  values (p_etablissement_id, v_hub, v_numero, (p ->> 'contact_id')::uuid, v_debut, v_fin, round(v_montant, 2), round(v_caution, 2),
          case when v_caution > 0 then 'a_recevoir' else 'aucune' end, nullif(btrim(p ->> 'note'), ''), auth.uid())
  returning id into v_id;
  insert into public.loc_lignes (etablissement_id, contrat_id, objet_id, tarif_jour)
  select p_etablissement_id, v_id, o.id, o.tarif_jour from public.loc_objets o where o.id = any (v_objets);
  return jsonb_build_object('id', v_id, 'numero', v_numero, 'jours', v_jours, 'montant_prevu', round(v_montant, 2));
end
$$;

create function public.loc_contrat_verrouille(p_contrat_id uuid, p_permission text)
returns public.loc_contrats
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.loc_contrats%rowtype;
begin
  select * into c from public.loc_contrats where id = p_contrat_id for update;
  if c.id is null then raise exception 'Contrat introuvable'; end if;
  perform public.exiger_permission(c.etablissement_id, p_permission);
  perform public.exiger_acces_hub(c.hub_id);
  return c;
end
$$;
revoke all on function public.loc_contrat_verrouille(uuid, text) from public, anon, authenticated;

-- Remise des objets au client ; p_caution_recue = la caution est encaissée à la remise.
create function public.remettre_contrat_location(p_contrat_id uuid, p_caution_recue boolean default false)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.loc_contrats%rowtype := public.loc_contrat_verrouille(p_contrat_id, 'location.louer');
begin
  if c.statut <> 'reserve' then raise exception 'Seule une réservation peut être remise au client'; end if;
  update public.loc_contrats
  set statut = 'en_cours', remis_le = now(),
      caution_statut = case when c.caution_montant > 0 and p_caution_recue then 'recue' else c.caution_statut end
  where id = c.id;
end
$$;

-- Retour : p = { date_retour?, caution: 'rendue'|'retenue', caution_retenue?, etat_retour?, objets_maintenance?: [uuid] }
create function public.retourner_contrat_location(p_contrat_id uuid, p jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.loc_contrats%rowtype := public.loc_contrat_verrouille(p_contrat_id, 'location.louer');
  v_retour date := coalesce(nullif(p ->> 'date_retour', '')::date, current_date);
  v_jours integer;
  v_montant numeric;
  v_retenue numeric := coalesce(nullif(p ->> 'caution_retenue', '')::numeric, 0);
  v_caution text := c.caution_statut;
begin
  if c.statut <> 'en_cours' then raise exception 'Seule une location en cours peut être rendue'; end if;
  if v_retour < c.debut then raise exception 'Date de retour avant le début'; end if;
  v_jours := public.loc_jours(c.etablissement_id, c.debut, v_retour);
  select coalesce(sum(l.tarif_jour), 0) * v_jours into v_montant from public.loc_lignes l where l.contrat_id = c.id;
  if c.caution_statut = 'recue' then
    if coalesce(p ->> 'caution', 'rendue') = 'retenue' then
      if v_retenue <= 0 or v_retenue > c.caution_montant then raise exception 'Montant retenu invalide (entre 0 et la caution)'; end if;
      if coalesce(btrim(p ->> 'etat_retour'), '') = '' then raise exception 'Expliquez la retenue dans l''état au retour'; end if;
      v_caution := 'retenue';
    else
      v_retenue := 0;
      v_caution := 'rendue';
    end if;
  else
    v_retenue := 0;
    v_caution := case when c.caution_statut = 'a_recevoir' then 'aucune' else c.caution_statut end;
  end if;
  update public.loc_contrats
  set statut = 'rendu', rendu_le = v_retour, montant_final = round(v_montant, 2), caution_statut = v_caution, caution_retenue = round(v_retenue, 2),
      etat_retour = nullif(btrim(p ->> 'etat_retour'), '')
  where id = c.id;
  if jsonb_typeof(p -> 'objets_maintenance') = 'array' then
    update public.loc_objets o set etat = 'maintenance', modifie_le = now()
    where o.etablissement_id = c.etablissement_id
      and o.id in (select l.objet_id from public.loc_lignes l where l.contrat_id = c.id)
      and o.id in (select x::uuid from jsonb_array_elements_text(p -> 'objets_maintenance') x);
  end if;
  return jsonb_build_object('numero', c.numero, 'jours', v_jours, 'montant_final', round(v_montant, 2),
                            'reste_a_payer', greatest(round(v_montant, 2) - c.montant_paye, 0));
end
$$;

create function public.encaisser_contrat_location(p_contrat_id uuid, p_montant numeric, p_mode text, p_reference text default null)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.loc_contrats%rowtype := public.loc_contrat_verrouille(p_contrat_id, 'location.louer');
  v_du numeric;
begin
  if c.statut = 'annule' then raise exception 'Contrat annulé'; end if;
  if p_montant is null or p_montant <= 0 or p_montant = 'NaN'::numeric then raise exception 'Montant invalide'; end if;
  if p_mode is null or p_mode not in ('especes', 'mobile_money', 'carte', 'virement', 'cheque') then raise exception 'Mode de paiement inconnu'; end if;
  v_du := coalesce(c.montant_final, c.montant_prevu) - c.montant_paye;
  if round(p_montant, 2) > v_du then raise exception 'Le montant dépasse le reste à payer (%)', v_du; end if;
  insert into public.loc_paiements (etablissement_id, contrat_id, montant, mode, reference, par)
  values (c.etablissement_id, c.id, round(p_montant, 2), p_mode, nullif(btrim(p_reference), ''), auth.uid());
  update public.loc_contrats set montant_paye = montant_paye + round(p_montant, 2) where id = c.id;
  return v_du - round(p_montant, 2);
end
$$;

create function public.annuler_contrat_location(p_contrat_id uuid, p_motif text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.loc_contrats%rowtype := public.loc_contrat_verrouille(p_contrat_id, 'location.gerer');
begin
  if c.statut <> 'reserve' then raise exception 'Seule une réservation peut être annulée'; end if;
  if c.montant_paye > 0 then raise exception 'Un acompte a été encaissé : remboursez-le d''abord hors plateforme et notez-le'; end if;
  if coalesce(btrim(p_motif), '') = '' then raise exception 'Le motif est obligatoire'; end if;
  update public.loc_contrats set statut = 'annule', annule_le = now(), motif_annulation = left(btrim(p_motif), 300) where id = c.id;
end
$$;

-- ---------------------------------------------------------------------------
-- 4. Tableau de bord (security invoker, même forme que les autres)
-- ---------------------------------------------------------------------------
create function public.cockpit_location(p_etablissement_id uuid, p_du date, p_au date, p_filtres jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  c public.cockpit_ctx;
  v_objets bigint; v_loues bigint; v_en_cours bigint; v_retard bigint; v_departs bigint; v_revenus numeric; v_revenus_p numeric;
  v_nb_p bigint; v_premier date; v_comp boolean; v_cautions numeric; v_impayes bigint;
begin
  if not public.lecture_autorisee(p_etablissement_id, 'location.lire') then
    raise exception 'Permission refusée : location.lire' using errcode = '42501';
  end if;
  c := public.cockpit_preparer(p_etablissement_id, p_du, p_au, p_filtres);
  select count(*) filter (where o.etat <> 'hors_service') into v_objets
  from public.loc_objets o where o.etablissement_id = p_etablissement_id and (o.hub_id is null or public.cockpit_hub_ok(c, o.hub_id));
  select count(distinct l.objet_id) into v_loues
  from public.loc_lignes l join public.loc_contrats k on k.id = l.contrat_id
  where k.etablissement_id = p_etablissement_id and k.statut = 'en_cours' and public.cockpit_hub_ok(c, k.hub_id);
  select count(*) filter (where k.statut = 'en_cours'),
         count(*) filter (where k.statut = 'en_cours' and k.fin_prevue < c.auj),
         count(*) filter (where k.statut = 'reserve' and k.debut <= c.auj),
         coalesce(sum(k.montant_final) filter (where k.statut = 'rendu' and k.rendu_le between c.du and c.au), 0),
         coalesce(sum(k.montant_final) filter (where k.statut = 'rendu' and k.rendu_le between c.pdu and c.pau), 0),
         count(*) filter (where k.statut = 'rendu' and k.rendu_le between c.pdu and c.pau),
         min(k.rendu_le),
         coalesce(sum(k.caution_montant) filter (where k.caution_statut = 'recue'), 0),
         count(*) filter (where k.statut = 'rendu' and k.montant_paye < k.montant_final)
  into v_en_cours, v_retard, v_departs, v_revenus, v_revenus_p, v_nb_p, v_premier, v_cautions, v_impayes
  from public.loc_contrats k where k.etablissement_id = p_etablissement_id and public.cockpit_hub_ok(c, k.hub_id);
  v_comp := public.cockpit_comparable(v_nb_p, v_premier, c.pdu);
  return jsonb_build_object(
    'domaine', 'location',
    'periode', jsonb_build_object('du', c.du, 'au', c.au, 'du_precedent', c.pdu, 'au_precedent', c.pau, 'comparable', v_comp),
    'kpis', public.cockpit_liste(array[
      public.cockpit_kpi('revenus', 'Locations rendues', v_revenus, 'montant', 'location?statut=rendu', case when v_comp then v_revenus_p end, null, null, true),
      public.cockpit_kpi('occupation', 'Objets loués', v_loues, 'nombre', 'location?vue=parc', null, format('sur %s objet(s)', v_objets), null, true),
      public.cockpit_kpi('en_cours', 'Locations en cours', v_en_cours, 'nombre', 'location?statut=en_cours', null,
        case when v_retard > 0 then format('%s en retard', v_retard) end, case when v_retard > 0 then 'attention' end),
      public.cockpit_kpi('cautions', 'Cautions détenues', v_cautions, 'montant', 'location?statut=en_cours')
    ]),
    'attention', public.cockpit_liste(array[
      public.cockpit_alerte('retours_retard', 'critique', 'Retours de location en retard', 'Date de fin dépassée', v_retard, 'location?statut=en_cours'),
      public.cockpit_alerte('departs', 'alerte', 'Réservations à remettre', 'Date de début atteinte', v_departs, 'location?statut=reserve'),
      public.cockpit_alerte('impayes', 'alerte', 'Locations rendues non soldées', null, v_impayes, 'location?statut=rendu')
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
    (4, 'boutique', 'E-commerce', public.lecture_autorisee(p_etablissement_id, 'ecommerce_boutique.lire')),
    (5, 'location', 'Location', public.lecture_autorisee(p_etablissement_id, 'location.lire')),
    (6, 'facturation', 'Facturation', public.lecture_autorisee(p_etablissement_id, 'facturation.lire')),
    (7, 'tresorerie', 'Trésorerie', public.lecture_autorisee(p_etablissement_id, 'depenses.lire') and public.lecture_autorisee(p_etablissement_id, 'paiements.lire')),
    (8, 'crm', 'CRM', public.lecture_autorisee(p_etablissement_id, 'crm_pipeline.lire')),
    (9, 'achats', 'Achats', public.lecture_autorisee(p_etablissement_id, 'achats.lire')),
    (10, 'production', 'Production', public.lecture_autorisee(p_etablissement_id, 'production.lire')),
    (11, 'rh', 'RH', public.lecture_autorisee(p_etablissement_id, 'rh_employes.lire')),
    (12, 'projets', 'Projets', public.lecture_autorisee(p_etablissement_id, 'projets.lire')),
    (13, 'agenda', 'Agenda', public.lecture_autorisee(p_etablissement_id, 'agenda.lire')),
    (14, 'support', 'Support', public.lecture_autorisee(p_etablissement_id, 'support_tickets.lire')),
    (15, 'abonnements', 'Abonnements', public.lecture_autorisee(p_etablissement_id, 'abonnements.lire')),
    (16, 'fidelite', 'Fidélité', public.lecture_autorisee(p_etablissement_id, 'fidelite.lire')),
    (17, 'siteweb', 'Site web', public.lecture_autorisee(p_etablissement_id, 'site_web.lire'))
  ) as d(ordre, id, titre, visible)
  where d.visible
$$;

revoke all on function public.enregistrer_objet_location(uuid, jsonb) from public, anon;
revoke all on function public.creer_contrat_location(uuid, jsonb) from public, anon;
revoke all on function public.remettre_contrat_location(uuid, boolean) from public, anon;
revoke all on function public.retourner_contrat_location(uuid, jsonb) from public, anon;
revoke all on function public.encaisser_contrat_location(uuid, numeric, text, text) from public, anon;
revoke all on function public.annuler_contrat_location(uuid, text) from public, anon;
revoke all on function public.cockpit_location(uuid, date, date, jsonb) from public, anon;
grant execute on function public.enregistrer_objet_location(uuid, jsonb) to authenticated;
grant execute on function public.creer_contrat_location(uuid, jsonb) to authenticated;
grant execute on function public.remettre_contrat_location(uuid, boolean) to authenticated;
grant execute on function public.retourner_contrat_location(uuid, jsonb) to authenticated;
grant execute on function public.encaisser_contrat_location(uuid, numeric, text, text) to authenticated;
grant execute on function public.annuler_contrat_location(uuid, text) to authenticated;
grant execute on function public.cockpit_location(uuid, date, date, jsonb) to authenticated;

notify pgrst, 'reload schema';
