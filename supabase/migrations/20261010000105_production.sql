-- Production (module M04, Bêta) : nomenclatures (recettes de fabrication) et ordres de fabrication.
-- Terminer un ordre consomme les composants et fait entrer le produit fini dans le stock du Hub, en un seul geste
-- (mouvements « production_sortie » et « production_entree », liés à l'ordre). Rien ne se supprime : un ordre se
-- termine ou s'annule (motif). Lecture par RLS, écriture par RPC. Proposé, jamais activé d'office.

-- ---------------------------------------------------------------------------
-- 1. Catalogue et droits
-- ---------------------------------------------------------------------------
insert into public.modules (id, nom, description, nature, statut, categorie, icone, ordre, version, documentation) values
  ('production', 'Production', 'Recettes de fabrication, ordres de fabrication, consommation des composants et entrée du produit fini en stock.',
   'transversal', 'beta', 'stock', 'inventaire', 145, '0.1', 'docs/PRODUCTION.md')
on conflict (id) do nothing;
update public.modules set parametres_schema = '[
  {"cle": "stock_negatif", "libelle": "Autoriser la fabrication même si un composant manque en stock", "type": "booleen", "defaut": false}
]'::jsonb where id = 'production';
insert into public.module_dependances (module_id, depend_de) values ('production', 'articles'), ('production', 'stock')
on conflict do nothing;
insert into public.solution_modules (solution_id, module_id, par_defaut)
select s.id, 'production', false from public.solutions s where s.id in ('commerce', 'restaurant', 'hotel', 'ecommerce', 'services')
on conflict (solution_id, module_id) do nothing;

insert into public.permissions (id, module_id, description) values
  ('production.lire', 'production', 'Voir les recettes et les ordres de fabrication'),
  ('production.produire', 'production', 'Créer, terminer et annuler des ordres de fabrication'),
  ('production.gerer', 'production', 'Créer et modifier les recettes de fabrication')
on conflict (id) do nothing;
insert into public.role_permissions (role_id, permission_id)
select r, p from unnest(array['gerant', 'responsable']) r
cross join unnest(array['production.lire', 'production.produire', 'production.gerer']) p
where exists (select 1 from public.roles where id = r)
on conflict do nothing;
insert into public.role_permissions (role_id, permission_id)
select r, p from unnest(array['responsable_hub', 'gestionnaire_depot']) r
cross join unnest(array['production.lire', 'production.produire']) p
where exists (select 1 from public.roles where id = r)
on conflict do nothing;
insert into public.role_permissions (role_id, permission_id)
select r, 'production.lire' from unnest(array['lecteur', 'comptable']) r
where exists (select 1 from public.roles where id = r)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 2. Tables
-- ---------------------------------------------------------------------------
create table public.prod_nomenclatures (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  article_id uuid not null references public.articles(id) on delete restrict,
  quantite_produite numeric(14, 3) not null check (quantite_produite > 0),
  composants jsonb not null check (jsonb_typeof(composants) = 'array' and jsonb_array_length(composants) between 1 and 50),
  note text check (note is null or length(note) <= 500),
  actif boolean not null default true,
  cree_par uuid not null references auth.users(id) on delete restrict,
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  unique (etablissement_id, article_id)
);

create table public.prod_ordres (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  hub_id uuid not null,
  numero text not null,
  nomenclature_id uuid not null references public.prod_nomenclatures(id) on delete restrict,
  article_id uuid not null references public.articles(id) on delete restrict,
  quantite_prevue numeric(14, 3) not null check (quantite_prevue > 0),
  date_prevue date,
  statut text not null default 'planifie' check (statut in ('planifie', 'termine', 'annule')),
  quantite_produite numeric(14, 3) check (quantite_produite is null or quantite_produite > 0),
  consommation jsonb,
  cout_total numeric(14, 2),
  note text check (note is null or length(note) <= 500),
  cree_par uuid not null references auth.users(id) on delete restrict,
  cree_le timestamptz not null default now(),
  termine_par uuid references auth.users(id) on delete restrict,
  termine_le timestamptz,
  annule_par uuid references auth.users(id) on delete restrict,
  annule_le timestamptz,
  motif_annulation text,
  unique (etablissement_id, numero),
  foreign key (hub_id, etablissement_id) references public.hubs(id, etablissement_id) on delete restrict,
  check (statut <> 'termine' or (quantite_produite is not null and termine_le is not null)),
  check (statut <> 'annule' or (annule_le is not null and btrim(coalesce(motif_annulation, '')) <> ''))
);
create index prod_ordres_etab_idx on public.prod_ordres(etablissement_id, statut, date_prevue);

alter table public.mouvements_stock add column if not exists ordre_fabrication_id uuid references public.prod_ordres(id) on delete restrict;
create index if not exists mouvements_stock_ordre_fabrication_idx on public.mouvements_stock(ordre_fabrication_id) where ordre_fabrication_id is not null;
alter table public.mouvements_stock drop constraint if exists mouvements_stock_type_check;
alter table public.mouvements_stock add constraint mouvements_stock_type_check check (type in (
  'entree', 'sortie_vente', 'retour_annulation', 'retour_partiel', 'ajustement', 'inventaire',
  'transfert_sortie', 'transfert_entree', 'transfert_annulation', 'production_sortie', 'production_entree'
));

alter table public.prod_nomenclatures enable row level security;
alter table public.prod_ordres enable row level security;
create policy lecture on public.prod_nomenclatures for select to authenticated
  using (public.lecture_autorisee(etablissement_id, 'production.lire'));
create policy lecture on public.prod_ordres for select to authenticated
  using (public.lecture_autorisee(etablissement_id, 'production.lire') and public.lecture_hub(etablissement_id, hub_id));
revoke insert, update, delete on public.prod_nomenclatures, public.prod_ordres from anon, authenticated;

create trigger prod_nomenclatures_etab before update on public.prod_nomenclatures for each row execute function public.verrouiller_etablissement_id();
create trigger prod_nomenclatures_sans_suppression before delete on public.prod_nomenclatures for each row execute function public.refuser_suppression();
create trigger prod_nomenclatures_audit after insert or update or delete on public.prod_nomenclatures for each row execute function public.journaliser_modification();
create trigger prod_ordres_etab before update on public.prod_ordres for each row execute function public.verrouiller_etablissement_id();
create trigger prod_ordres_sans_suppression before delete on public.prod_ordres for each row execute function public.refuser_suppression();
create trigger prod_ordres_audit after insert or update or delete on public.prod_ordres for each row execute function public.journaliser_modification();

-- ---------------------------------------------------------------------------
-- 3. Fonctions
-- ---------------------------------------------------------------------------
-- Recette : p = { id?, article_id, quantite_produite, composants: [{ article_id, quantite }], note?, actif? }
create function public.enregistrer_nomenclature(p_etablissement_id uuid, p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := nullif(p ->> 'id', '')::uuid;
  v_article uuid := nullif(p ->> 'article_id', '')::uuid;
  v_qte numeric := nullif(p ->> 'quantite_produite', '')::numeric;
  v_comp jsonb := '[]'::jsonb;
  c jsonb;
  v_c_article uuid;
  v_c_qte numeric;
begin
  perform public.exiger_permission(p_etablissement_id, 'production.gerer');
  if v_article is null or not exists (select 1 from public.articles where id = v_article and etablissement_id = p_etablissement_id and suivi_stock) then
    raise exception 'Produit fini introuvable ou non suivi en stock';
  end if;
  if v_qte is null or v_qte <= 0 or v_qte = 'NaN'::numeric then raise exception 'Quantité produite invalide'; end if;
  if jsonb_typeof(p -> 'composants') <> 'array' or jsonb_array_length(p -> 'composants') = 0 then
    raise exception 'Ajoutez au moins un composant';
  end if;
  if jsonb_array_length(p -> 'composants') > 50 then raise exception 'Au plus 50 composants'; end if;
  for c in select * from jsonb_array_elements(p -> 'composants') loop
    v_c_article := nullif(c ->> 'article_id', '')::uuid;
    v_c_qte := nullif(c ->> 'quantite', '')::numeric;
    if v_c_article is null or not exists (select 1 from public.articles where id = v_c_article and etablissement_id = p_etablissement_id and suivi_stock) then
      raise exception 'Composant introuvable ou non suivi en stock';
    end if;
    if v_c_article = v_article then raise exception 'Un produit ne peut pas être son propre composant'; end if;
    if v_c_qte is null or v_c_qte <= 0 or v_c_qte = 'NaN'::numeric then raise exception 'Quantité de composant invalide'; end if;
    if v_comp @> jsonb_build_array(jsonb_build_object('article_id', v_c_article)) then raise exception 'Composant en double'; end if;
    v_comp := v_comp || jsonb_build_array(jsonb_build_object('article_id', v_c_article, 'quantite', round(v_c_qte, 3)));
  end loop;
  if v_id is null then
    insert into public.prod_nomenclatures (etablissement_id, article_id, quantite_produite, composants, note, cree_par)
    values (p_etablissement_id, v_article, round(v_qte, 3), v_comp, nullif(btrim(p ->> 'note'), ''), auth.uid())
    returning id into v_id;
  else
    update public.prod_nomenclatures
    set article_id = v_article, quantite_produite = round(v_qte, 3), composants = v_comp, note = nullif(btrim(p ->> 'note'), ''),
        actif = coalesce((p ->> 'actif')::boolean, actif), modifie_le = now()
    where id = v_id and etablissement_id = p_etablissement_id;
    if not found then raise exception 'Recette introuvable'; end if;
  end if;
  return v_id;
exception when unique_violation then
  raise exception 'Ce produit a déjà une recette : modifiez-la';
end
$$;

-- Ordre : p = { nomenclature_id, quantite, hub_id?, date_prevue?, note? }
create function public.creer_ordre_fabrication(p_etablissement_id uuid, p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  n public.prod_nomenclatures%rowtype;
  v_hub uuid := coalesce(nullif(p ->> 'hub_id', '')::uuid, public.hub_principal(p_etablissement_id));
  v_qte numeric := nullif(p ->> 'quantite', '')::numeric;
  v_id uuid;
begin
  perform public.exiger_permission(p_etablissement_id, 'production.produire');
  select * into n from public.prod_nomenclatures where id = nullif(p ->> 'nomenclature_id', '')::uuid and etablissement_id = p_etablissement_id;
  if n.id is null or not n.actif then raise exception 'Recette introuvable ou désactivée'; end if;
  if v_qte is null or v_qte <= 0 or v_qte = 'NaN'::numeric then raise exception 'Quantité à fabriquer invalide'; end if;
  if not exists (select 1 from public.hubs where id = v_hub and etablissement_id = p_etablissement_id and actif and capacite_stock) then
    raise exception 'Ce Hub ne gère pas de stock';
  end if;
  perform public.exiger_acces_hub(v_hub);
  insert into public.prod_ordres (etablissement_id, hub_id, numero, nomenclature_id, article_id, quantite_prevue, date_prevue, note, cree_par)
  values (p_etablissement_id, v_hub, public.prochain_numero(p_etablissement_id, 'ordre_fabrication', 'OF-'), n.id, n.article_id,
          round(v_qte, 3), nullif(p ->> 'date_prevue', '')::date, nullif(btrim(p ->> 'note'), ''), auth.uid())
  returning id into v_id;
  return v_id;
end
$$;

-- Besoin en composants d'un ordre (quantité à produire / quantité de la recette × quantité du composant), avec le stock du Hub.
create function public.besoins_ordre_fabrication(p_ordre_id uuid, p_quantite numeric default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  o public.prod_ordres%rowtype;
  n public.prod_nomenclatures%rowtype;
  v_facteur numeric;
begin
  select * into o from public.prod_ordres where id = p_ordre_id;
  if o.id is null then raise exception 'Ordre introuvable'; end if;
  perform public.exiger_permission(o.etablissement_id, 'production.lire');
  perform public.exiger_acces_hub(o.hub_id);
  select * into n from public.prod_nomenclatures where id = o.nomenclature_id;
  v_facteur := coalesce(p_quantite, o.quantite_prevue) / n.quantite_produite;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'article_id', a.id, 'nom', a.nom, 'unite', a.unite, 'besoin', round((c ->> 'quantite')::numeric * v_facteur, 3),
      'stock', public.stock_hub(o.hub_id, a.id), 'cout_unitaire', a.cout_achat) order by a.nom)
    from jsonb_array_elements(n.composants) c join public.articles a on a.id = (c ->> 'article_id')::uuid
  ), '[]'::jsonb);
end
$$;

create function public.terminer_ordre_fabrication(p_ordre_id uuid, p_quantite_produite numeric default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.prod_ordres%rowtype;
  v_qte numeric;
  v_besoins jsonb;
  b jsonb;
  v_negatif boolean;
  v_cout numeric := 0;
  v_cout_connu boolean := true;
  v_manque text;
begin
  select * into o from public.prod_ordres where id = p_ordre_id for update;
  if o.id is null then raise exception 'Ordre introuvable'; end if;
  perform public.exiger_permission(o.etablissement_id, 'production.produire');
  perform public.exiger_acces_hub(o.hub_id);
  if o.statut <> 'planifie' then raise exception 'Cet ordre est déjà terminé ou annulé'; end if;
  v_qte := coalesce(p_quantite_produite, o.quantite_prevue);
  if v_qte is null or v_qte <= 0 or v_qte = 'NaN'::numeric then raise exception 'Quantité produite invalide'; end if;
  v_qte := round(v_qte, 3);
  -- Verrouille les articles concernés (ordre stable) avant de lire le stock.
  perform 1 from public.articles a
  where a.id in (select (c ->> 'article_id')::uuid from public.prod_nomenclatures n, jsonb_array_elements(n.composants) c where n.id = o.nomenclature_id)
     or a.id = o.article_id
  order by a.id for update;
  v_besoins := public.besoins_ordre_fabrication(o.id, v_qte);
  v_negatif := coalesce((public.parametre_module(o.etablissement_id, 'production', 'stock_negatif') #>> '{}')::boolean, false);
  if not v_negatif then
    select string_agg(format('%s (besoin %s, stock %s)', x ->> 'nom', x ->> 'besoin', x ->> 'stock'), ', ') into v_manque
    from jsonb_array_elements(v_besoins) x where (x ->> 'besoin')::numeric > (x ->> 'stock')::numeric;
    if v_manque is not null then raise exception 'Stock insuffisant : %', v_manque; end if;
  end if;
  for b in select * from jsonb_array_elements(v_besoins) loop
    if (b ->> 'cout_unitaire') is null then v_cout_connu := false; else v_cout := v_cout + (b ->> 'besoin')::numeric * (b ->> 'cout_unitaire')::numeric; end if;
    insert into public.mouvements_stock (etablissement_id, hub_id, article_id, type, quantite, cout_unitaire, motif, ordre_fabrication_id, acteur)
    values (o.etablissement_id, o.hub_id, (b ->> 'article_id')::uuid, 'production_sortie', -(b ->> 'besoin')::numeric,
            (b ->> 'cout_unitaire')::numeric, 'Fabrication ' || o.numero, o.id, auth.uid());
  end loop;
  insert into public.mouvements_stock (etablissement_id, hub_id, article_id, type, quantite, cout_unitaire, motif, ordre_fabrication_id, acteur)
  values (o.etablissement_id, o.hub_id, o.article_id, 'production_entree', v_qte,
          case when v_cout_connu then round(v_cout / v_qte, 2) end, 'Fabrication ' || o.numero, o.id, auth.uid());
  update public.prod_ordres
  set statut = 'termine', quantite_produite = v_qte, consommation = v_besoins, cout_total = case when v_cout_connu then round(v_cout, 2) end,
      termine_par = auth.uid(), termine_le = now()
  where id = o.id;
  return jsonb_build_object('numero', o.numero, 'quantite_produite', v_qte, 'cout_total', case when v_cout_connu then round(v_cout, 2) end);
end
$$;

create function public.annuler_ordre_fabrication(p_ordre_id uuid, p_motif text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.prod_ordres%rowtype;
begin
  select * into o from public.prod_ordres where id = p_ordre_id for update;
  if o.id is null then raise exception 'Ordre introuvable'; end if;
  perform public.exiger_permission(o.etablissement_id, 'production.produire');
  perform public.exiger_acces_hub(o.hub_id);
  if o.statut <> 'planifie' then raise exception 'Seul un ordre planifié peut être annulé'; end if;
  if coalesce(btrim(p_motif), '') = '' then raise exception 'Le motif est obligatoire'; end if;
  update public.prod_ordres set statut = 'annule', annule_par = auth.uid(), annule_le = now(), motif_annulation = left(btrim(p_motif), 300)
  where id = o.id;
end
$$;

-- ---------------------------------------------------------------------------
-- 4. Tableau de bord (même forme que les autres cockpit_<domaine>, security invoker)
-- ---------------------------------------------------------------------------
create function public.cockpit_production(p_etablissement_id uuid, p_du date, p_au date, p_filtres jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  c public.cockpit_ctx;
  v_planifies bigint; v_retard bigint; v_termines bigint; v_cout numeric; v_termines_p bigint; v_premier date; v_comp boolean;
begin
  if not public.lecture_autorisee(p_etablissement_id, 'production.lire') then
    raise exception 'Permission refusée : production.lire' using errcode = '42501';
  end if;
  c := public.cockpit_preparer(p_etablissement_id, p_du, p_au, p_filtres);
  select count(*) filter (where o.statut = 'planifie'),
         count(*) filter (where o.statut = 'planifie' and o.date_prevue < c.auj),
         count(*) filter (where o.statut = 'termine' and (o.termine_le at time zone c.tz)::date between c.du and c.au),
         coalesce(sum(o.cout_total) filter (where o.statut = 'termine' and (o.termine_le at time zone c.tz)::date between c.du and c.au), 0),
         count(*) filter (where o.statut = 'termine' and (o.termine_le at time zone c.tz)::date between c.pdu and c.pau),
         min((o.termine_le at time zone c.tz)::date)
  into v_planifies, v_retard, v_termines, v_cout, v_termines_p, v_premier
  from public.prod_ordres o
  where o.etablissement_id = p_etablissement_id and public.cockpit_hub_ok(c, o.hub_id);
  v_comp := public.cockpit_comparable(v_termines_p, v_premier, c.pdu);
  return jsonb_build_object(
    'domaine', 'production',
    'periode', jsonb_build_object('du', c.du, 'au', c.au, 'du_precedent', c.pdu, 'au_precedent', c.pau, 'comparable', v_comp),
    'kpis', public.cockpit_liste(array[
      public.cockpit_kpi('planifies', 'Ordres à fabriquer', v_planifies, 'nombre', 'production', null,
        case when v_retard > 0 then format('%s en retard', v_retard) end, case when v_retard > 0 then 'attention' end, true),
      public.cockpit_kpi('termines', 'Ordres terminés', v_termines, 'nombre', 'production?statut=termine', case when v_comp then v_termines_p end, null, null, true),
      public.cockpit_kpi('cout', 'Coût des composants', v_cout, 'montant', 'production?statut=termine')
    ]),
    'attention', public.cockpit_liste(array[
      public.cockpit_alerte('ordres_retard', 'alerte', 'Ordres de fabrication en retard', 'Date prévue dépassée', v_retard, 'production')
    ]),
    'graphiques', '[]'::jsonb,
    'listes', public.cockpit_liste(array[
      (select case when count(*) > 0 then jsonb_build_object('cle', 'produits', 'titre', 'Produits fabriqués', 'route', 'production?statut=termine',
        'lignes', jsonb_agg(jsonb_build_object('libelle', nom, 'valeur', q, 'format', 'nombre') order by q desc)) end
       from (select a.nom, sum(o.quantite_produite) q from public.prod_ordres o join public.articles a on a.id = o.article_id
             where o.etablissement_id = p_etablissement_id and o.statut = 'termine' and public.cockpit_hub_ok(c, o.hub_id)
               and (o.termine_le at time zone c.tz)::date between c.du and c.au
             group by a.nom order by 2 desc limit 5) t)
    ]),
    'activite', '[]'::jsonb
  );
end
$$;

-- Les domaines visibles : liste existante + Production.
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
    (5, 'facturation', 'Facturation', public.lecture_autorisee(p_etablissement_id, 'facturation.lire')),
    (6, 'tresorerie', 'Trésorerie', public.lecture_autorisee(p_etablissement_id, 'depenses.lire') and public.lecture_autorisee(p_etablissement_id, 'paiements.lire')),
    (7, 'crm', 'CRM', public.lecture_autorisee(p_etablissement_id, 'crm_pipeline.lire')),
    (8, 'achats', 'Achats', public.lecture_autorisee(p_etablissement_id, 'achats.lire')),
    (9, 'production', 'Production', public.lecture_autorisee(p_etablissement_id, 'production.lire')),
    (10, 'rh', 'RH', public.lecture_autorisee(p_etablissement_id, 'rh_employes.lire')),
    (11, 'projets', 'Projets', public.lecture_autorisee(p_etablissement_id, 'projets.lire')),
    (12, 'agenda', 'Agenda', public.lecture_autorisee(p_etablissement_id, 'agenda.lire')),
    (13, 'support', 'Support', public.lecture_autorisee(p_etablissement_id, 'support_tickets.lire')),
    (14, 'abonnements', 'Abonnements', public.lecture_autorisee(p_etablissement_id, 'abonnements.lire')),
    (15, 'fidelite', 'Fidélité', public.lecture_autorisee(p_etablissement_id, 'fidelite.lire')),
    (16, 'siteweb', 'Site web', public.lecture_autorisee(p_etablissement_id, 'site_web.lire'))
  ) as d(ordre, id, titre, visible)
  where d.visible
$$;

revoke all on function public.enregistrer_nomenclature(uuid, jsonb) from public, anon;
revoke all on function public.creer_ordre_fabrication(uuid, jsonb) from public, anon;
revoke all on function public.besoins_ordre_fabrication(uuid, numeric) from public, anon;
revoke all on function public.terminer_ordre_fabrication(uuid, numeric) from public, anon;
revoke all on function public.annuler_ordre_fabrication(uuid, text) from public, anon;
revoke all on function public.cockpit_production(uuid, date, date, jsonb) from public, anon;
grant execute on function public.enregistrer_nomenclature(uuid, jsonb) to authenticated;
grant execute on function public.creer_ordre_fabrication(uuid, jsonb) to authenticated;
grant execute on function public.besoins_ordre_fabrication(uuid, numeric) to authenticated;
grant execute on function public.terminer_ordre_fabrication(uuid, numeric) to authenticated;
grant execute on function public.annuler_ordre_fabrication(uuid, text) to authenticated;
grant execute on function public.cockpit_production(uuid, date, date, jsonb) to authenticated;

notify pgrst, 'reload schema';
