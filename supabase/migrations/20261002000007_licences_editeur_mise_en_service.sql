-- Phases 2 à 4 : couche commerciale (offres, licences, échéances), espace éditeur
-- Agence Elite, mise en service d'un établissement et import d'articles.
--
-- Quatre notions restent séparées :
--   module proposé par la solution (solution_modules)
--   module commercialement autorisé (offre de la licence + modules supplémentaires)
--   module activé (etablissement_modules)
--   permission de l'utilisateur (rôle + ajustements)

-- Offres commerciales ------------------------------------------------------------------
create table public.offres (
  id text primary key check (id ~ '^[a-z0-9_-]+$'),
  solution_id text not null references public.solutions(id) on delete restrict,
  nom text not null check (btrim(nom) <> ''),
  description text,
  modules text[] not null default '{}',
  prix_acquisition numeric(14, 2) not null default 0 check (prix_acquisition >= 0),
  prix_mensuel numeric(14, 2) not null default 0 check (prix_mensuel >= 0),
  prix_annuel numeric(14, 2) not null default 0 check (prix_annuel >= 0),
  devise text not null default 'XAF',
  offre_essai boolean not null default false,
  actif boolean not null default true,
  ordre integer not null default 0,
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now()
);
create unique index offres_essai_unique on public.offres(solution_id) where offre_essai;
create trigger offres_modifie_le before update on public.offres for each row execute function public.fixer_modifie_le();

-- Prix à 0 : Agence Elite les fixe dans son espace (décision commerciale, pas technique).
insert into public.offres(id, solution_id, nom, description, modules, offre_essai, ordre) values
  ('commerce-caisse', 'commerce', 'Commerce Caisse',
   'Articles, stock, caisse, ventes, paiements, reçus et ticket Z.',
   array['articles', 'stock', 'caisse', 'ventes', 'paiements', 'recus', 'cloture'], false, 1),
  ('commerce-complet', 'commerce', 'Commerce Complet',
   'Commerce Caisse, plus les contacts (crédits clients, fournisseurs) et les dépenses.',
   array['articles', 'stock', 'caisse', 'ventes', 'paiements', 'recus', 'cloture', 'contacts', 'depenses'], true, 2)
on conflict do nothing;

-- Licences ------------------------------------------------------------------------------
create table public.licences (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  offre_id text not null references public.offres(id) on delete restrict,
  formule text not null check (formule in ('essai', 'acquisition', 'mensuel', 'annuel')),
  debut date not null default current_date,
  echeance date,
  statut text not null default 'active' check (statut in ('active', 'suspendue', 'terminee')),
  modules_supplementaires text[] not null default '{}',
  montant numeric(14, 2) not null default 0 check (montant >= 0),
  devise text not null default 'XAF',
  note text,
  motif_statut text,
  cree_par uuid references auth.users(id) on delete restrict,
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  check (echeance is null or echeance >= debut),
  check (formule in ('acquisition') or echeance is not null)
);
create index licences_etablissement_id_idx on public.licences(etablissement_id);
create index licences_offre_id_idx on public.licences(offre_id);
create index licences_cree_par_idx on public.licences(cree_par);
-- Une seule licence en cours par établissement ; l'historique est conservé.
create unique index licences_une_en_cours on public.licences(etablissement_id) where statut <> 'terminee';
create trigger licences_modifie_le before update on public.licences for each row execute function public.fixer_modifie_le();

create table public.licence_evenements (
  id uuid primary key default gen_random_uuid(),
  licence_id uuid not null references public.licences(id) on delete restrict,
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  type text not null check (type in ('attribution', 'renouvellement', 'suspension', 'reactivation', 'fin')),
  ancienne_echeance date,
  nouvelle_echeance date,
  montant numeric(14, 2) not null default 0 check (montant >= 0),
  reference text,
  motif text,
  acteur uuid references auth.users(id) on delete restrict,
  cree_le timestamptz not null default now()
);
create index licence_evenements_licence_id_idx on public.licence_evenements(licence_id);
create index licence_evenements_etablissement_id_idx on public.licence_evenements(etablissement_id);
create index licence_evenements_acteur_idx on public.licence_evenements(acteur);

alter table public.offres enable row level security;
alter table public.licences enable row level security;
alter table public.licence_evenements enable row level security;

-- Date de première mise en service de l'établissement.
alter table public.etablissements add column mis_en_service_le timestamptz;

-- Protections : pas de suppression, établissement verrouillé, journal d'audit.
create trigger licences_sans_suppression before delete on public.licences for each row execute function public.refuser_suppression();
create trigger licence_evenements_sans_suppression before delete on public.licence_evenements for each row execute function public.refuser_suppression();
create trigger licence_evenements_figes before update on public.licence_evenements for each row execute function public.refuser_modification();
create trigger licences_verrou_etablissement before update on public.licences for each row execute function public.verrouiller_etablissement_id();
create trigger offres_audit after insert or update or delete on public.offres for each row execute function public.journaliser_modification();
create trigger licences_audit after insert or update or delete on public.licences for each row execute function public.journaliser_modification();
create trigger licence_evenements_audit after insert or update or delete on public.licence_evenements for each row execute function public.journaliser_modification();

-- Règles d'accès -------------------------------------------------------------------------
-- Délai de grâce après l'échéance d'un abonnement payant (pas pour un essai).
create function public.licence_valide(p_etablissement_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.licences l
    where l.etablissement_id = p_etablissement_id
      and l.statut = 'active'
      and l.debut <= current_date
      and (l.echeance is null or current_date <= l.echeance + case when l.formule = 'essai' then 0 else 7 end)
  )
$$;

-- Écrire exige : établissement actif, client actif ET licence valide.
create or replace function public.etablissement_autorise_ecriture(p_etablissement_id uuid)
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
    where e.id = p_etablissement_id and e.statut = 'actif' and c.statut = 'actif'
  ) and public.licence_valide(p_etablissement_id)
$$;

-- Un module est commercialement autorisé s'il est du socle, ou compris dans la
-- licence en cours (offre + modules supplémentaires).
create function public.module_couvert(p_etablissement_id uuid, p_module_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.modules where id = p_module_id and nature = 'socle')
    or exists (
      select 1 from public.licences l
      join public.offres o on o.id = l.offre_id
      where l.etablissement_id = p_etablissement_id
        and l.statut <> 'terminee'
        and p_module_id = any (o.modules || l.modules_supplementaires)
    )
$$;

create function public.verifier_module_licencie()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.actif and (tg_op = 'INSERT' or not old.actif)
     and not public.module_couvert(new.etablissement_id, new.module_id) then
    raise exception 'Le module % n''est pas compris dans la licence de l''établissement', new.module_id;
  end if;
  return new;
end
$$;
create trigger etablissement_modules_licence
before insert or update on public.etablissement_modules
for each row execute function public.verifier_module_licencie();

-- Tout nouvel établissement démarre avec un essai de 30 jours de l'offre d'essai
-- de sa solution, s'il en existe une.
create function public.creer_licence_essai()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  offre public.offres%rowtype;
  resultat uuid;
begin
  select * into offre from public.offres where solution_id = new.solution_id and offre_essai and actif;
  if offre.id is null then
    return new;
  end if;
  insert into public.licences(etablissement_id, offre_id, formule, debut, echeance, devise, note, cree_par)
  values (new.id, offre.id, 'essai', current_date, current_date + 30, offre.devise, 'Essai automatique de 30 jours', auth.uid())
  returning id into resultat;
  insert into public.licence_evenements(licence_id, etablissement_id, type, nouvelle_echeance, motif, acteur)
  values (resultat, new.id, 'attribution', current_date + 30, 'Essai automatique', auth.uid());
  return new;
end
$$;
create trigger etablissements_licence_essai
after insert on public.etablissements
for each row execute function public.creer_licence_essai();

create policy catalogue_lecture on public.offres for select to authenticated using (true);
create policy lecture on public.licences for select to authenticated
using (
  public.est_super_admin()
  or public.a_permission(etablissement_id, 'etablissement.lire')
  or public.est_dirigeant((select e.client_id from public.etablissements e where e.id = etablissement_id))
  or public.session_support_active(etablissement_id)
);
create policy lecture on public.licence_evenements for select to authenticated
using (
  public.est_super_admin()
  or public.a_permission(etablissement_id, 'etablissement.modifier')
  or public.est_dirigeant((select e.client_id from public.etablissements e where e.id = etablissement_id))
);

-- Ordre des modules d'une solution selon leurs dépendances : plus le niveau est
-- élevé, plus d'autres modules en dépendent.
create function public.niveaux_modules(p_solution_id text)
returns table (module_id text, niveau integer)
language sql
stable
security definer
set search_path = ''
as $$
  with recursive profondeur(module_id, niveau) as (
    select sm.module_id, 0 from public.solution_modules sm where sm.solution_id = p_solution_id
    union all
    select d.depend_de, p.niveau + 1
    from profondeur p
    join public.module_dependances d on d.module_id = p.module_id
    where p.niveau < 20
  )
  select module_id, max(niveau)::integer from profondeur group by module_id
$$;

-- Aligne les modules activés sur la licence en cours : retire ce qui n'est plus
-- couvert, active ce qui est couvert.
create function public.synchroniser_modules_licence(p_etablissement_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  solution text;
  ligne record;
begin
  select solution_id into solution from public.etablissements where id = p_etablissement_id;
  for ligne in
    select em.module_id from public.etablissement_modules em
    join public.niveaux_modules(solution) n on n.module_id = em.module_id
    where em.etablissement_id = p_etablissement_id and em.actif
      and not public.module_couvert(p_etablissement_id, em.module_id)
    order by n.niveau asc
  loop
    update public.etablissement_modules set actif = false, source = 'licence'
    where etablissement_id = p_etablissement_id and module_id = ligne.module_id;
  end loop;
  for ligne in
    select sm.module_id from public.solution_modules sm
    join public.niveaux_modules(solution) n on n.module_id = sm.module_id
    where sm.solution_id = solution and sm.par_defaut
      and public.module_couvert(p_etablissement_id, sm.module_id)
      and not exists (
        select 1 from public.etablissement_modules em
        where em.etablissement_id = p_etablissement_id and em.module_id = sm.module_id and em.actif
      )
    order by n.niveau desc
  loop
    insert into public.etablissement_modules(etablissement_id, module_id, actif, active_le, active_par, source)
    values (p_etablissement_id, ligne.module_id, true, now(), auth.uid(), 'licence')
    on conflict (etablissement_id, module_id) do update
    set actif = true, active_le = now(), active_par = auth.uid(), source = 'licence';
  end loop;
end
$$;

create function public.verifier_modules_offre(p_solution_id text, p_modules text[])
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  manquant text;
begin
  select m into manquant from unnest(p_modules) m
  where not exists (select 1 from public.solution_modules sm where sm.solution_id = p_solution_id and sm.module_id = m)
  limit 1;
  if manquant is not null then
    raise exception 'Le module % n''est pas proposé par cette solution', manquant;
  end if;
  select d.depend_de into manquant
  from unnest(p_modules) m
  join public.module_dependances d on d.module_id = m
  join public.modules dm on dm.id = d.depend_de
  where dm.nature <> 'socle' and not d.depend_de = any (p_modules)
  limit 1;
  if manquant is not null then
    raise exception 'Il manque le module % dont dépend un module choisi', manquant;
  end if;
end
$$;

-- Fonctions éditeur : offres et licences -------------------------------------------------
create function public.enregistrer_offre(p_offre jsonb)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  modules_offre text[] := coalesce(array(select jsonb_array_elements_text(p_offre -> 'modules')), '{}');
  identifiant text := lower(btrim(coalesce(p_offre ->> 'id', '')));
  solution text := coalesce(p_offre ->> 'solution_id', 'commerce');
begin
  perform public.exiger_super_admin();
  if identifiant = '' then
    raise exception 'L''identifiant de l''offre est obligatoire';
  end if;
  perform public.verifier_modules_offre(solution, modules_offre);
  insert into public.offres(id, solution_id, nom, description, modules, prix_acquisition, prix_mensuel, prix_annuel, devise, actif, ordre)
  values (
    identifiant, solution, btrim(p_offre ->> 'nom'), nullif(btrim(p_offre ->> 'description'), ''), modules_offre,
    coalesce((p_offre ->> 'prix_acquisition')::numeric, 0), coalesce((p_offre ->> 'prix_mensuel')::numeric, 0),
    coalesce((p_offre ->> 'prix_annuel')::numeric, 0), coalesce(nullif(p_offre ->> 'devise', ''), 'XAF'),
    coalesce((p_offre ->> 'actif')::boolean, true), coalesce((p_offre ->> 'ordre')::integer, 0)
  )
  on conflict (id) do update set
    nom = excluded.nom, description = excluded.description, modules = excluded.modules,
    prix_acquisition = excluded.prix_acquisition, prix_mensuel = excluded.prix_mensuel,
    prix_annuel = excluded.prix_annuel, devise = excluded.devise, actif = excluded.actif, ordre = excluded.ordre
  where public.offres.solution_id = excluded.solution_id;
  return identifiant;
end
$$;

create function public.attribuer_licence(
  p_etablissement_id uuid,
  p_offre_id text,
  p_formule text,
  p_debut date default current_date,
  p_echeance date default null,
  p_montant numeric default 0,
  p_modules_supplementaires text[] default '{}',
  p_reference text default null,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  etab public.etablissements%rowtype;
  offre public.offres%rowtype;
  debut date := coalesce(p_debut, current_date);
  echeance date := p_echeance;
  supplementaires text[] := coalesce(p_modules_supplementaires, '{}');
  resultat uuid;
begin
  perform public.exiger_super_admin();
  select * into etab from public.etablissements where id = p_etablissement_id;
  if etab.id is null then
    raise exception 'Établissement introuvable';
  end if;
  select * into offre from public.offres where id = p_offre_id;
  if offre.id is null or not offre.actif or offre.solution_id <> etab.solution_id then
    raise exception 'Offre inconnue ou non disponible pour cette solution';
  end if;
  if p_formule not in ('essai', 'acquisition', 'mensuel', 'annuel') then
    raise exception 'Formule invalide';
  end if;
  if coalesce(p_montant, 0) < 0 then
    raise exception 'Le montant ne peut pas être négatif';
  end if;
  if echeance is null then
    echeance := case p_formule
      when 'mensuel' then (debut + interval '1 month')::date
      when 'annuel' then (debut + interval '1 year')::date
      when 'essai' then debut + 30
    end;
  end if;
  if echeance is not null and echeance < debut then
    raise exception 'L''échéance doit suivre le début';
  end if;
  perform public.verifier_modules_offre(etab.solution_id, offre.modules || supplementaires);

  update public.licences
  set statut = 'terminee', motif_statut = 'Remplacée par une nouvelle licence'
  where etablissement_id = p_etablissement_id and statut <> 'terminee';

  insert into public.licences(etablissement_id, offre_id, formule, debut, echeance, modules_supplementaires, montant, devise, note, cree_par)
  values (p_etablissement_id, offre.id, p_formule, debut, echeance, supplementaires, coalesce(p_montant, 0), offre.devise, nullif(btrim(p_note), ''), auth.uid())
  returning id into resultat;
  insert into public.licence_evenements(licence_id, etablissement_id, type, nouvelle_echeance, montant, reference, motif, acteur)
  values (resultat, p_etablissement_id, 'attribution', echeance, coalesce(p_montant, 0), nullif(btrim(p_reference), ''), nullif(btrim(p_note), ''), auth.uid());

  perform public.synchroniser_modules_licence(p_etablissement_id);
  return resultat;
end
$$;

create function public.renouveler_licence(
  p_licence_id uuid,
  p_nouvelle_echeance date default null,
  p_montant numeric default 0,
  p_reference text default null,
  p_note text default null
)
returns date
language plpgsql
security definer
set search_path = ''
as $$
declare
  licence public.licences%rowtype;
  base date;
  nouvelle date := p_nouvelle_echeance;
begin
  perform public.exiger_super_admin();
  select * into licence from public.licences where id = p_licence_id for update;
  if licence.id is null or licence.statut = 'terminee' then
    raise exception 'Licence introuvable ou terminée';
  end if;
  if coalesce(p_montant, 0) < 0 then
    raise exception 'Le montant ne peut pas être négatif';
  end if;
  -- Le renouvellement part de l'échéance, ou d'aujourd'hui si elle est dépassée.
  base := greatest(coalesce(licence.echeance, current_date), current_date);
  if nouvelle is null then
    nouvelle := case licence.formule
      when 'mensuel' then (base + interval '1 month')::date
      when 'annuel' then (base + interval '1 year')::date
      else null
    end;
  end if;
  if nouvelle is null or nouvelle <= coalesce(licence.echeance, licence.debut) then
    raise exception 'La nouvelle échéance doit être postérieure à l''actuelle';
  end if;
  update public.licences set echeance = nouvelle where id = p_licence_id;
  insert into public.licence_evenements(licence_id, etablissement_id, type, ancienne_echeance, nouvelle_echeance, montant, reference, motif, acteur)
  values (p_licence_id, licence.etablissement_id, 'renouvellement', licence.echeance, nouvelle, coalesce(p_montant, 0), nullif(btrim(p_reference), ''), nullif(btrim(p_note), ''), auth.uid());
  return nouvelle;
end
$$;

create function public.definir_statut_licence(p_licence_id uuid, p_statut text, p_motif text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  licence public.licences%rowtype;
begin
  perform public.exiger_super_admin();
  if coalesce(btrim(p_motif), '') = '' then
    raise exception 'Le motif est obligatoire';
  end if;
  if p_statut not in ('active', 'suspendue', 'terminee') then
    raise exception 'Statut de licence invalide';
  end if;
  select * into licence from public.licences where id = p_licence_id for update;
  if licence.id is null or licence.statut = 'terminee' then
    raise exception 'Licence introuvable ou terminée';
  end if;
  if licence.statut = p_statut then
    return;
  end if;
  update public.licences set statut = p_statut, motif_statut = btrim(p_motif) where id = p_licence_id;
  insert into public.licence_evenements(licence_id, etablissement_id, type, ancienne_echeance, nouvelle_echeance, motif, acteur)
  values (
    p_licence_id, licence.etablissement_id,
    case p_statut when 'active' then 'reactivation' when 'suspendue' then 'suspension' else 'fin' end,
    licence.echeance, licence.echeance, btrim(p_motif), auth.uid()
  );
end
$$;

-- Clients et établissements ------------------------------------------------------------------
create function public.modifier_client(p_client_id uuid, p_client jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.exiger_super_admin();
  update public.clients set
    nom = coalesce(nullif(btrim(p_client ->> 'nom'), ''), nom),
    pays = case when p_client ? 'pays' then nullif(btrim(p_client ->> 'pays'), '') else pays end,
    devise_facturation = coalesce(nullif(p_client ->> 'devise_facturation', ''), devise_facturation),
    contact = case when p_client ? 'contact' and jsonb_typeof(p_client -> 'contact') = 'object' then p_client -> 'contact' else contact end
  where id = p_client_id;
  if not found then
    raise exception 'Client introuvable';
  end if;
end
$$;

create function public.modifier_etablissement(p_etablissement_id uuid, p_etablissement jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.est_super_admin() then
    perform public.exiger_permission(p_etablissement_id, 'etablissement.modifier');
  end if;
  update public.etablissements set
    nom = coalesce(nullif(btrim(p_etablissement ->> 'nom'), ''), nom),
    ville = case when p_etablissement ? 'ville' then nullif(btrim(p_etablissement ->> 'ville'), '') else ville end,
    pays = case when p_etablissement ? 'pays' then nullif(btrim(p_etablissement ->> 'pays'), '') else pays end,
    devise = coalesce(nullif(p_etablissement ->> 'devise', ''), devise),
    fuseau = coalesce(nullif(p_etablissement ->> 'fuseau', ''), fuseau)
  where id = p_etablissement_id;
  if not found then
    raise exception 'Établissement introuvable';
  end if;
end
$$;

-- Mise en service ------------------------------------------------------------------------------
create function public.etat_mise_en_service(p_etablissement_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  identite public.etablissement_identite%rowtype;
  etapes jsonb;
begin
  if not (
    public.est_super_admin()
    or public.a_permission(p_etablissement_id, 'etablissement.lire')
    or public.est_dirigeant((select client_id from public.etablissements where id = p_etablissement_id))
  ) then
    raise exception 'Permission refusée : etablissement.lire' using errcode = '42501';
  end if;
  select * into identite from public.etablissement_identite where etablissement_id = p_etablissement_id;
  etapes := jsonb_build_array(
    jsonb_build_object('id', 'licence', 'libelle', 'Licence active', 'fait', public.licence_valide(p_etablissement_id)),
    jsonb_build_object('id', 'gerant', 'libelle', 'Responsable invité et connecté', 'fait', exists (
      select 1 from public.etablissement_membres where etablissement_id = p_etablissement_id and role_id = 'gerant' and actif)),
    jsonb_build_object('id', 'identite', 'libelle', 'Nom, adresse et téléphone sur les reçus', 'fait',
      coalesce(identite.nom_commercial, '') <> '' and coalesce(identite.adresse, '') <> '' and coalesce(identite.telephone, '') <> ''),
    jsonb_build_object('id', 'logo', 'libelle', 'Logo', 'fait', coalesce(identite.logo_url, '') <> ''),
    jsonb_build_object('id', 'caisses', 'libelle', 'Caisse(s) nommée(s)', 'fait', exists (
      select 1 from public.points_de_vente where etablissement_id = p_etablissement_id and actif)),
    jsonb_build_object('id', 'equipe', 'libelle', 'Équipe invitée', 'fait', exists (
      select 1 from public.etablissement_membres where etablissement_id = p_etablissement_id and role_id <> 'gerant')
      or exists (select 1 from public.invitations where etablissement_id = p_etablissement_id and role_id <> 'gerant' and annulee_le is null)),
    jsonb_build_object('id', 'articles', 'libelle', 'Articles enregistrés', 'fait', exists (
      select 1 from public.articles where etablissement_id = p_etablissement_id)),
    jsonb_build_object('id', 'stock', 'libelle', 'Stock de départ saisi', 'fait', exists (
      select 1 from public.mouvements_stock where etablissement_id = p_etablissement_id)),
    jsonb_build_object('id', 'premiere_vente', 'libelle', 'Première vente', 'fait', exists (
      select 1 from public.ventes where etablissement_id = p_etablissement_id))
  );
  return jsonb_build_object(
    'etapes', etapes,
    'faites', (select count(*) from jsonb_array_elements(etapes) e where (e ->> 'fait')::boolean),
    'total', jsonb_array_length(etapes),
    'mis_en_service_le', (select mis_en_service_le from public.etablissements where id = p_etablissement_id)
  );
end
$$;

create function public.mettre_en_service(p_etablissement_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  resultat timestamptz;
begin
  if not public.est_super_admin() then
    perform public.exiger_permission(p_etablissement_id, 'etablissement.modifier');
  end if;
  if not public.licence_valide(p_etablissement_id) then
    raise exception 'Une licence active est nécessaire pour la mise en service';
  end if;
  update public.etablissements set mis_en_service_le = coalesce(mis_en_service_le, now())
  where id = p_etablissement_id
  returning mis_en_service_le into resultat;
  return resultat;
end
$$;

-- Licence en cours, en lecture simple, pour l'application.
create function public.resume_licence(p_etablissement_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', l.id,
    'offre_id', l.offre_id,
    'offre', o.nom,
    'formule', l.formule,
    'statut', l.statut,
    'debut', l.debut,
    'echeance', l.echeance,
    'jours_restants', case when l.echeance is null then null else l.echeance - current_date end,
    'montant', l.montant,
    'devise', l.devise,
    'modules', to_jsonb(o.modules || l.modules_supplementaires),
    'modules_supplementaires', to_jsonb(l.modules_supplementaires),
    'valide', public.licence_valide(p_etablissement_id)
  )
  from public.licences l
  join public.offres o on o.id = l.offre_id
  where l.etablissement_id = p_etablissement_id and l.statut <> 'terminee'
$$;

-- Contexte de l'utilisateur : établissements comme membre, comme dirigeant du
-- client, ou en session support (lecture seule).
create or replace function public.mon_contexte()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with acces as (
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
    select distinct on (id) id, role from acces order by id, priorite
  )
  select jsonb_build_object(
    'utilisateur', jsonb_build_object(
      'id', auth.uid(),
      'email', (select email from auth.users where id = auth.uid()),
      'nom', (select nom_complet from public.profils where id = auth.uid())
    ),
    'editeur', (select role from public.plateforme_admins where user_id = auth.uid() and actif),
    'invitations', public.mes_invitations(),
    'etablissements', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id,
        'nom', e.nom,
        'ville', e.ville,
        'devise', e.devise,
        'statut', e.statut,
        'solution_id', e.solution_id,
        'client', c.nom,
        'client_statut', c.statut,
        'ecriture', a.role not in ('dirigeant', 'support') and public.etablissement_autorise_ecriture(e.id),
        'role', a.role,
        'mis_en_service_le', e.mis_en_service_le,
        'licence', public.resume_licence(e.id),
        'identite', (select to_jsonb(i) - 'etablissement_id' from public.etablissement_identite i where i.etablissement_id = e.id),
        'modules', coalesce((
          select jsonb_agg(em.module_id order by em.module_id)
          from public.etablissement_modules em
          where em.etablissement_id = e.id and em.actif
        ), '[]'::jsonb),
        'permissions', coalesce((
          select jsonb_agg(p.id order by p.id)
          from public.permissions p
          where case
            when a.role in ('dirigeant', 'support') then p.id like '%.lire' and public.module_actif(e.id, p.module_id)
            else public.a_permission(e.id, p.id)
          end
        ), '[]'::jsonb)
      ) order by e.nom)
      from choisi a
      join public.etablissements e on e.id = a.id
      join public.clients c on c.id = e.client_id
      where e.statut <> 'archive' or a.role = 'support'
    ), '[]'::jsonb)
  )
$$;

-- Vue d'ensemble de l'espace éditeur Agence Elite.
create function public.editeur_vue()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.exiger_super_admin();
  return jsonb_build_object(
    'solutions', (select jsonb_agg(to_jsonb(s) order by s.nom) from public.solutions s),
    'offres', coalesce((select jsonb_agg(to_jsonb(o) order by o.solution_id, o.ordre) from public.offres o), '[]'::jsonb),
    'roles', (select jsonb_agg(jsonb_build_object('id', r.id, 'nom', r.nom, 'ordre', r.ordre) order by r.ordre) from public.roles r),
    'clients', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id,
        'nom', c.nom,
        'pays', c.pays,
        'statut', c.statut,
        'devise_facturation', c.devise_facturation,
        'contact', c.contact,
        'cree_le', c.cree_le,
        'dirigeants', coalesce((
          select jsonb_agg(jsonb_build_object('email', u.email, 'nom', p.nom_complet, 'actif', cm.actif))
          from public.client_membres cm
          join auth.users u on u.id = cm.user_id
          left join public.profils p on p.id = cm.user_id
          where cm.client_id = c.id
        ), '[]'::jsonb),
        'invitations', coalesce((
          select jsonb_agg(jsonb_build_object('id', i.id, 'email', i.email, 'expire_le', i.expire_le))
          from public.invitations i
          where i.client_id = c.id and i.acceptee_le is null and i.annulee_le is null and i.expire_le > now()
        ), '[]'::jsonb),
        'etablissements', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', e.id,
            'nom', e.nom,
            'ville', e.ville,
            'pays', e.pays,
            'devise', e.devise,
            'statut', e.statut,
            'solution_id', e.solution_id,
            'cree_le', e.cree_le,
            'mis_en_service_le', e.mis_en_service_le,
            'ecriture', public.etablissement_autorise_ecriture(e.id),
            'licence', public.resume_licence(e.id),
            'membres_actifs', (select count(*) from public.etablissement_membres m where m.etablissement_id = e.id and m.actif),
            'gerants', coalesce((
              select jsonb_agg(u.email)
              from public.etablissement_membres m join auth.users u on u.id = m.user_id
              where m.etablissement_id = e.id and m.actif and m.role_id = 'gerant'
            ), '[]'::jsonb),
            'invitations_en_attente', (
              select count(*) from public.invitations i
              where i.etablissement_id = e.id and i.acceptee_le is null and i.annulee_le is null and i.expire_le > now()
            )
          ) order by e.nom)
          from public.etablissements e where e.client_id = c.id
        ), '[]'::jsonb)
      ) order by c.nom)
      from public.clients c
    ), '[]'::jsonb)
  );
end
$$;

-- Détail d'un établissement pour l'éditeur : modules, licence, historique, équipe.
-- Aucune donnée commerciale (ventes, articles) : celles-ci restent derrière le mode support.
create function public.editeur_etablissement(p_etablissement_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  etab public.etablissements%rowtype;
begin
  perform public.exiger_super_admin();
  select * into etab from public.etablissements where id = p_etablissement_id;
  if etab.id is null then
    raise exception 'Établissement introuvable';
  end if;
  return jsonb_build_object(
    'etablissement', to_jsonb(etab),
    'client', (select jsonb_build_object('id', c.id, 'nom', c.nom, 'statut', c.statut) from public.clients c where c.id = etab.client_id),
    'licence', public.resume_licence(etab.id),
    'ecriture', public.etablissement_autorise_ecriture(etab.id),
    'historique_licences', coalesce((
      select jsonb_agg(jsonb_build_object(
        'type', ev.type, 'cree_le', ev.cree_le, 'ancienne_echeance', ev.ancienne_echeance,
        'nouvelle_echeance', ev.nouvelle_echeance, 'montant', ev.montant, 'reference', ev.reference,
        'motif', ev.motif, 'offre', o.nom, 'formule', l.formule
      ) order by ev.cree_le desc)
      from public.licence_evenements ev
      join public.licences l on l.id = ev.licence_id
      join public.offres o on o.id = l.offre_id
      where ev.etablissement_id = etab.id
    ), '[]'::jsonb),
    'modules', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id, 'nom', m.nom, 'nature', m.nature,
        'actif', coalesce(em.actif, false),
        'couvert', public.module_couvert(etab.id, m.id),
        'depend_de', coalesce((select jsonb_agg(d.depend_de) from public.module_dependances d where d.module_id = m.id), '[]'::jsonb)
      ) order by n.niveau desc, m.nom)
      from public.solution_modules sm
      join public.modules m on m.id = sm.module_id
      join public.niveaux_modules(etab.solution_id) n on n.module_id = m.id
      left join public.etablissement_modules em on em.etablissement_id = etab.id and em.module_id = m.id
      where sm.solution_id = etab.solution_id
    ), '[]'::jsonb),
    'equipe', public.equipe_etablissement(etab.id),
    'mise_en_service', public.etat_mise_en_service(etab.id),
    'sessions_support', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'motif', s.motif, 'ouverte_le', s.ouverte_le, 'fermee_le', s.fermee_le,
        'active', s.fermee_le is null and s.ouverte_le > now() - interval '8 hours'
      ) order by s.ouverte_le desc)
      from (select * from public.sessions_support where etablissement_id = etab.id and admin_id = auth.uid() order by ouverte_le desc limit 10) s
    ), '[]'::jsonb)
  );
end
$$;

-- Import d'articles (tableur) : tout ou rien, avec le numéro de ligne fautive.
create function public.importer_articles(p_etablissement_id uuid, p_lignes jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  ligne jsonb;
  numero integer := 0;
  categorie uuid;
  existant uuid;
  article jsonb;
  crees integer := 0;
  mis_a_jour integer := 0;
begin
  perform public.exiger_permission(p_etablissement_id, 'articles.gerer');
  if jsonb_typeof(p_lignes) <> 'array' or jsonb_array_length(p_lignes) = 0 then
    raise exception 'Le fichier ne contient aucune ligne';
  end if;
  if jsonb_array_length(p_lignes) > 5000 then
    raise exception 'Import limité à 5 000 lignes à la fois';
  end if;
  for ligne in select value from jsonb_array_elements(p_lignes)
  loop
    numero := numero + 1;
    begin
      if coalesce(btrim(ligne ->> 'nom'), '') = '' then
        raise exception 'nom manquant';
      end if;
      if (ligne ->> 'prix_vente') is null or (ligne ->> 'prix_vente')::numeric < 0 then
        raise exception 'prix de vente manquant ou négatif';
      end if;
      categorie := null;
      if coalesce(btrim(ligne ->> 'categorie'), '') <> '' then
        categorie := public.enregistrer_categorie(p_etablissement_id, ligne ->> 'categorie');
      end if;
      existant := null;
      if coalesce(btrim(ligne ->> 'reference'), '') <> '' then
        select id into existant from public.articles
        where etablissement_id = p_etablissement_id and reference = btrim(ligne ->> 'reference');
      end if;
      article := (ligne - 'categorie' - 'id' - 'photo')
        || jsonb_build_object('categorie_id', categorie)
        || case when existant is not null then jsonb_build_object('id', existant) else '{}'::jsonb end;
      perform public.enregistrer_article(p_etablissement_id, article);
      if existant is null then crees := crees + 1; else mis_a_jour := mis_a_jour + 1; end if;
    exception when others then
      raise exception 'Ligne % : %', numero, sqlerrm;
    end;
  end loop;
  return jsonb_build_object('crees', crees, 'mis_a_jour', mis_a_jour);
end
$$;

-- Droits d'exécution -------------------------------------------------------------------------
revoke execute on function public.creer_licence_essai() from public, anon, authenticated;
revoke execute on function public.verifier_module_licencie() from public, anon, authenticated;
revoke execute on function public.synchroniser_modules_licence(uuid) from public, anon, authenticated;
revoke execute on function public.verifier_modules_offre(text, text[]) from public, anon, authenticated;
revoke execute on function public.niveaux_modules(text) from public, anon, authenticated;
revoke execute on function public.licence_valide(uuid) from public, anon;
revoke execute on function public.module_couvert(uuid, text) from public, anon;
revoke execute on function public.resume_licence(uuid) from public, anon, authenticated;
grant execute on function public.licence_valide(uuid) to authenticated;
grant execute on function public.module_couvert(uuid, text) to authenticated;
do $$
declare signature text;
begin
  foreach signature in array array[
    'public.enregistrer_offre(jsonb)',
    'public.attribuer_licence(uuid, text, text, date, date, numeric, text[], text, text)',
    'public.renouveler_licence(uuid, date, numeric, text, text)',
    'public.definir_statut_licence(uuid, text, text)',
    'public.modifier_client(uuid, jsonb)',
    'public.modifier_etablissement(uuid, jsonb)',
    'public.etat_mise_en_service(uuid)',
    'public.mettre_en_service(uuid)',
    'public.mon_contexte()',
    'public.editeur_vue()',
    'public.editeur_etablissement(uuid)',
    'public.importer_articles(uuid, jsonb)'
  ] loop
    execute format('revoke execute on function %s from public, anon', signature);
    execute format('grant execute on function %s to authenticated', signature);
  end loop;
end
$$;
