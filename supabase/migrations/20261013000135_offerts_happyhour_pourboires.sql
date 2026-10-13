-- Bars et restaurants : happy hour automatique, offerts avec raison, pourboires par serveur (2026-10-13, lot 3 de Juste).
--   1. Happy hour (prix par horaire) : le gérant règle des créneaux (jours, heure de début et de fin, pourcentage, catégories).
--      Pendant un créneau, la caisse met elle-même une remise sur chaque ligne concernée (remise par ligne, déjà acceptée
--      par enregistrer_vente). Un créneau peut passer minuit (ex. 22:00 à 02:00). Le plafond de remise de la caisse ne
--      compte pas la part due au happy hour.
--   2. Offerts : une ligne offerte est une ligne entièrement remisée ; la raison (« Client fidèle », « Patron »…) est
--      gardée dans la table offerts, liée à la ligne de vente. Droit : caisse.remise_libre (gérant, responsable).
--   3. Pourboires : montant facultatif saisi à l'encaissement, par serveur, en espèces ou Mobile Money. Simple
--      information : le total de la vente et le ticket Z ne changent pas.
--   4. Rapport « Offerts et pertes » : offerts, remises, retraits de stock (perdu, cassé, périmé) et pourboires sur une
--      période, avec les totaux. Droit : caisse.offerts_pertes.
-- Rien n'est modifié dans enregistrer_vente ; rien ne se supprime (une vente annulée sort simplement des rapports).

-- ---------------------------------------------------------------------------
-- 1. Droits
-- ---------------------------------------------------------------------------
insert into public.permissions (id, module_id, description) values
  ('caisse.happy_hour', 'caisse', 'Régler les happy hours (prix réduits selon l''heure)'),
  ('caisse.offerts_pertes', 'caisse', 'Voir les offerts, remises, pertes et pourboires')
on conflict (id) do nothing;
insert into public.role_permissions (role_id, permission_id)
select r, 'caisse.happy_hour' from unnest(array['gerant', 'responsable']) r
where exists (select 1 from public.roles where id = r)
on conflict do nothing;
insert into public.role_permissions (role_id, permission_id)
select r, 'caisse.offerts_pertes' from unnest(array['gerant', 'responsable', 'comptable']) r
where exists (select 1 from public.roles where id = r)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 2. Tables
-- ---------------------------------------------------------------------------
-- jours : 1 = lundi … 7 = dimanche. categories vide = tous les articles. debut > fin : le créneau passe minuit.
create table public.happy_hours (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  nom text not null check (length(btrim(nom)) between 1 and 40),
  jours smallint[] not null check (cardinality(jours) between 1 and 7 and jours <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[]),
  debut time not null,
  fin time not null,
  pourcentage numeric(5, 2) not null check (pourcentage > 0 and pourcentage <= 100),
  categories uuid[] not null default '{}',
  actif boolean not null default true,
  cree_par uuid references auth.users(id) on delete restrict,
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  check (debut <> fin)
);
create index happy_hours_etablissement_idx on public.happy_hours(etablissement_id, actif);

create table public.offerts (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  vente_id uuid not null references public.ventes(id) on delete restrict,
  ligne_vente_id uuid not null unique references public.lignes_vente(id) on delete restrict,
  article_id uuid references public.articles(id) on delete restrict,
  libelle text not null,
  quantite numeric(14, 3) not null check (quantite > 0),
  valeur numeric(14, 2) not null check (valeur >= 0),
  raison text not null check (raison in ('Client fidèle', 'Geste commercial', 'Erreur de service', 'Patron', 'Autre')),
  precision_raison text check (precision_raison is null or length(precision_raison) between 1 and 120),
  offert_par uuid not null references auth.users(id) on delete restrict,
  cree_le timestamptz not null default now(),
  check (raison <> 'Autre' or precision_raison is not null)
);
create index offerts_etablissement_idx on public.offerts(etablissement_id, cree_le desc);
create index offerts_vente_idx on public.offerts(vente_id);

create table public.pourboires (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  vente_id uuid not null unique references public.ventes(id) on delete restrict,
  session_caisse_id uuid references public.sessions_caisse(id) on delete restrict,
  serveur text check (serveur is null or length(btrim(serveur)) between 1 and 60),
  montant numeric(14, 2) not null check (montant > 0 and montant <= 10000000),
  mode text not null check (mode in ('especes', 'mobile_money')),
  cree_par uuid not null references auth.users(id) on delete restrict,
  cree_le timestamptz not null default now()
);
create index pourboires_etablissement_idx on public.pourboires(etablissement_id, cree_le desc);
create index pourboires_session_idx on public.pourboires(session_caisse_id);

alter table public.happy_hours enable row level security;
alter table public.offerts enable row level security;
alter table public.pourboires enable row level security;
-- La caisse lit les créneaux pour appliquer le happy hour ; le gérant les règle.
create policy lecture on public.happy_hours for select to authenticated
  using (public.lecture_autorisee(etablissement_id, 'caisse.utiliser') or public.a_permission(etablissement_id, 'caisse.happy_hour'));
create policy lecture on public.offerts for select to authenticated
  using (public.lecture_autorisee(etablissement_id, 'caisse.offerts_pertes') or offert_par = auth.uid());
create policy lecture on public.pourboires for select to authenticated
  using (public.lecture_autorisee(etablissement_id, 'caisse.offerts_pertes') or cree_par = auth.uid());

create trigger happy_hours_verrou_etablissement before update on public.happy_hours
  for each row execute function public.verrouiller_etablissement_id();
create trigger happy_hours_sans_suppression before delete on public.happy_hours
  for each row execute function public.refuser_suppression();
create trigger happy_hours_audit after insert or update on public.happy_hours
  for each row execute function public.journaliser_modification();
create trigger offerts_sans_suppression before delete on public.offerts
  for each row execute function public.refuser_suppression();
create trigger offerts_audit after insert on public.offerts
  for each row execute function public.journaliser_modification();
create trigger pourboires_sans_suppression before delete on public.pourboires
  for each row execute function public.refuser_suppression();
create trigger pourboires_audit after insert on public.pourboires
  for each row execute function public.journaliser_modification();
-- Offerts et pourboires ne se modifient pas : on les lit, c'est tout.
create trigger offerts_immuables before update on public.offerts
  for each row execute function public.refuser_modification();
create trigger pourboires_immuables before update on public.pourboires
  for each row execute function public.refuser_modification();

-- ---------------------------------------------------------------------------
-- 3. Happy hour : réglage et calcul
-- ---------------------------------------------------------------------------
-- p : { id?, nom, jours: [1..7], debut: 'HH:MM', fin: 'HH:MM', pourcentage, categories?: [uuid], actif? } ; renvoie le créneau.
create function public.enregistrer_happy_hour(p_etablissement_id uuid, p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := nullif(p ->> 'id', '')::uuid;
  existant public.happy_hours%rowtype;
  v_nom text := btrim(coalesce(p ->> 'nom', ''));
  v_jours smallint[];
  v_categories uuid[] := '{}';
  v_debut time;
  v_fin time;
  v_pct numeric;
begin
  perform public.exiger_permission(p_etablissement_id, 'caisse.happy_hour');
  if p is null or jsonb_typeof(p) <> 'object' then
    raise exception 'Réglages invalides';
  end if;
  if v_id is not null then
    select * into existant from public.happy_hours where id = v_id and etablissement_id = p_etablissement_id for update;
    if existant.id is null then
      raise exception 'Happy hour introuvable dans cet établissement';
    end if;
    -- Seulement allumer ou éteindre : le reste ne bouge pas.
    if not (p ? 'nom') and p ? 'actif' then
      update public.happy_hours set actif = coalesce((p ->> 'actif')::boolean, actif), modifie_le = now() where id = v_id;
      return v_id;
    end if;
  end if;
  if v_nom = '' or length(v_nom) > 40 then
    raise exception 'Donnez un nom au happy hour (40 caractères au plus)';
  end if;
  if jsonb_typeof(p -> 'jours') is distinct from 'array' then
    raise exception 'Choisissez au moins un jour';
  end if;
  begin
    select coalesce(array_agg(distinct j::smallint order by j::smallint), '{}') into v_jours
    from jsonb_array_elements_text(p -> 'jours') j;
  exception when others then
    raise exception 'Jours invalides';
  end;
  if cardinality(v_jours) = 0 or not v_jours <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[] then
    raise exception 'Choisissez au moins un jour (lundi à dimanche)';
  end if;
  if coalesce(p ->> 'debut', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or coalesce(p ->> 'fin', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
    raise exception 'Heures invalides : format HH:MM (ex. 18:00)';
  end if;
  v_debut := (p ->> 'debut')::time;
  v_fin := (p ->> 'fin')::time;
  if v_debut = v_fin then
    raise exception 'L''heure de fin doit être différente de l''heure de début';
  end if;
  begin
    v_pct := round((p ->> 'pourcentage')::numeric, 2);
  exception when others then
    v_pct := null;
  end;
  if v_pct is null or v_pct = 'NaN'::numeric or v_pct <= 0 or v_pct > 100 then
    raise exception 'Pourcentage invalide : entre 1 et 100';
  end if;
  if jsonb_typeof(p -> 'categories') = 'array' then
    begin
      select coalesce(array_agg(distinct c::uuid), '{}') into v_categories from jsonb_array_elements_text(p -> 'categories') c;
    exception when others then
      raise exception 'Catégories invalides';
    end;
    if exists (select 1 from unnest(v_categories) c
               where not exists (select 1 from public.categories_articles k where k.id = c and k.etablissement_id = p_etablissement_id)) then
      raise exception 'Catégorie inconnue dans cet établissement';
    end if;
  end if;
  if existant.id is null then
    if (select count(*) from public.happy_hours where etablissement_id = p_etablissement_id) >= 50 then
      raise exception 'Pas plus de 50 happy hours par établissement';
    end if;
    insert into public.happy_hours (etablissement_id, nom, jours, debut, fin, pourcentage, categories, actif, cree_par)
    values (p_etablissement_id, v_nom, v_jours, v_debut, v_fin, v_pct, v_categories, coalesce((p ->> 'actif')::boolean, true), auth.uid())
    returning id into v_id;
  else
    update public.happy_hours set nom = v_nom, jours = v_jours, debut = v_debut, fin = v_fin, pourcentage = v_pct,
      categories = case when p ? 'categories' then v_categories else categories end,
      actif = coalesce((p ->> 'actif')::boolean, actif), modifie_le = now()
    where id = v_id;
  end if;
  return v_id;
end
$$;
revoke execute on function public.enregistrer_happy_hour(uuid, jsonb) from public, anon;
grant execute on function public.enregistrer_happy_hour(uuid, jsonb) to authenticated;

-- Pourcentage du happy hour pour un article à un instant (0 si aucun), à l'heure locale de l'établissement.
-- Même règle que src/modules/caisse/happyHour.js : un créneau qui passe minuit compte pour le jour où il a commencé.
create function public.pourcentage_happy_hour(p_etablissement_id uuid, p_article_id uuid, p_instant timestamptz default now())
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  with local as (
    select (p_instant at time zone coalesce((select e.fuseau from public.etablissements e where e.id = p_etablissement_id), 'UTC')) as t
  ), moment as (
    select extract(isodow from t)::smallint as jour, (extract(isodow from t)::int + 5) % 7 + 1 as veille, t::time as heure from local
  )
  select coalesce(max(h.pourcentage), 0)
  from public.happy_hours h, moment m
  where h.etablissement_id = p_etablissement_id and h.actif
    and (cardinality(h.categories) = 0
         or (select a.categorie_id from public.articles a where a.id = p_article_id) = any (h.categories))
    and (
      (h.debut < h.fin and m.jour = any (h.jours) and m.heure >= h.debut and m.heure < h.fin)
      or (h.debut > h.fin and ((m.jour = any (h.jours) and m.heure >= h.debut)
                               or (m.veille::smallint = any (h.jours) and m.heure < h.fin)))
    )
$$;
revoke execute on function public.pourcentage_happy_hour(uuid, uuid, timestamptz) from public, anon;
grant execute on function public.pourcentage_happy_hour(uuid, uuid, timestamptz) to authenticated;

-- Plafond de remise (migration 20261010000102) : la part due au happy hour n'est pas comptée. Cinq minutes de marge :
-- le panier calculé à 19:59 et validé à 20:00 garde son prix. Le reste du contrôle ne change pas.
create or replace function public.controler_plafond_remise()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  remises numeric;
  happy numeric;
  brut numeric;
  plafond numeric;
begin
  if new.session_caisse_id is null or auth.uid() is null then return null; end if;
  plafond := coalesce((public.parametre_module(new.etablissement_id, 'caisse', 'remise_max_pourcentage', '100'::jsonb) #>> '{}')::numeric, 100);
  if plafond >= 100 then return null; end if;
  select coalesce(sum(l.remise), 0),
         coalesce(sum(least(l.remise, ceil(l.prix_unitaire * l.quantite * greatest(
           public.pourcentage_happy_hour(new.etablissement_id, l.article_id, new.cree_le),
           public.pourcentage_happy_hour(new.etablissement_id, l.article_id, new.cree_le - interval '5 minutes')) / 100))), 0)
  into remises, happy
  from public.lignes_vente l where l.vente_id = new.id;
  brut := new.sous_total + remises;
  remises := remises - happy + new.remise;
  if brut <= 0 or remises <= 0 then return null; end if;
  if remises * 100 > brut * greatest(plafond, 0) and not public.a_permission(new.etablissement_id, 'caisse.remise_libre') then
    raise exception 'Remise de % %% : au-delà de % %%, un responsable doit valider la vente', round(remises * 100 / brut, 1), plafond
      using errcode = 'P0001';
  end if;
  return null;
end
$$;
revoke execute on function public.controler_plafond_remise() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Offerts : la raison de chaque ligne offerte, juste après la vente
-- ---------------------------------------------------------------------------
-- p_offerts : [{ article_id, quantite, raison, precision? }]. Chaque élément doit correspondre à une ligne de la vente
-- entièrement remisée (total 0). Renvoie le nombre de lignes enregistrées.
create function public.enregistrer_offerts_vente(p_vente_id uuid, p_offerts jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.ventes%rowtype;
  o jsonb;
  l public.lignes_vente%rowtype;
  v_raison text;
  v_precision text;
  n integer := 0;
begin
  select * into v from public.ventes where id = p_vente_id for update;
  if not found then
    raise exception 'Vente introuvable';
  end if;
  perform public.exiger_permission(v.etablissement_id, 'caisse.remise_libre');
  if v.vendeur <> auth.uid() and not public.a_permission(v.etablissement_id, 'cloture.cloturer') then
    raise exception 'Permission refusée';
  end if;
  if v.statut <> 'validee' then
    raise exception 'Une vente annulée est définitive';
  end if;
  if p_offerts is null or jsonb_typeof(p_offerts) <> 'array' or jsonb_array_length(p_offerts) = 0 then
    raise exception 'Aucune ligne offerte';
  end if;
  if jsonb_array_length(p_offerts) > 200 then
    raise exception 'Trop de lignes offertes';
  end if;
  for o in select * from jsonb_array_elements(p_offerts) loop
    if jsonb_typeof(o) <> 'object' then
      raise exception 'Ligne offerte invalide';
    end if;
    v_raison := btrim(coalesce(o ->> 'raison', ''));
    v_precision := nullif(left(btrim(coalesce(o ->> 'precision', '')), 120), '');
    if v_raison not in ('Client fidèle', 'Geste commercial', 'Erreur de service', 'Patron', 'Autre') then
      raise exception 'Choisissez la raison de l''offert';
    end if;
    if v_raison = 'Autre' and v_precision is null then
      raise exception 'Précisez la raison de l''offert';
    end if;
    select lv.* into l from public.lignes_vente lv
    where lv.vente_id = v.id and lv.article_id = nullif(o ->> 'article_id', '')::uuid
      and lv.quantite = (o ->> 'quantite')::numeric and lv.total = 0 and lv.remise > 0
      and not exists (select 1 from public.offerts x where x.ligne_vente_id = lv.id)
    order by lv.id
    limit 1;
    if l.id is null then
      raise exception 'Ligne offerte introuvable dans la vente %', v.numero;
    end if;
    insert into public.offerts (etablissement_id, vente_id, ligne_vente_id, article_id, libelle, quantite, valeur, raison, precision_raison, offert_par)
    values (v.etablissement_id, v.id, l.id, l.article_id, l.libelle, l.quantite, l.remise, v_raison, v_precision, auth.uid());
    n := n + 1;
    l := null;
  end loop;
  return n;
end
$$;
revoke execute on function public.enregistrer_offerts_vente(uuid, jsonb) from public, anon;
grant execute on function public.enregistrer_offerts_vente(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Pourboires : information seulement (aucun paiement, aucun effet sur le ticket Z)
-- ---------------------------------------------------------------------------
create function public.enregistrer_pourboire(p_vente_id uuid, p_montant numeric, p_mode text, p_serveur text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.ventes%rowtype;
  v_montant numeric := round(coalesce(p_montant, 0), 2);
  v_serveur text := nullif(left(btrim(coalesce(p_serveur, '')), 60), '');
  v_id uuid;
begin
  select * into v from public.ventes where id = p_vente_id for update;
  if not found then
    raise exception 'Vente introuvable';
  end if;
  if v.vendeur = auth.uid() then
    perform public.exiger_permission(v.etablissement_id, 'caisse.utiliser');
  else
    perform public.exiger_permission(v.etablissement_id, 'cloture.cloturer');
  end if;
  if v.statut <> 'validee' then
    raise exception 'Une vente annulée est définitive';
  end if;
  if v_montant = 'NaN'::numeric or v_montant <= 0 or v_montant > 10000000 then
    raise exception 'Montant du pourboire invalide';
  end if;
  if coalesce(p_mode, '') not in ('especes', 'mobile_money') then
    raise exception 'Pourboire en espèces ou en Mobile Money';
  end if;
  if exists (select 1 from public.pourboires where vente_id = v.id) then
    raise exception 'Un pourboire est déjà enregistré pour la vente %', v.numero;
  end if;
  insert into public.pourboires (etablissement_id, vente_id, session_caisse_id, serveur, montant, mode, cree_par)
  values (v.etablissement_id, v.id, v.session_caisse_id, coalesce(v_serveur, v.servi_par), v_montant, p_mode, auth.uid())
  returning id into v_id;
  return v_id;
end
$$;
revoke execute on function public.enregistrer_pourboire(uuid, numeric, text, text) from public, anon;
grant execute on function public.enregistrer_pourboire(uuid, numeric, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Rapport « Offerts et pertes » (dates locales de l'établissement, ventes annulées exclues)
-- ---------------------------------------------------------------------------
create function public.rapport_offerts_pertes(p_etablissement_id uuid, p_du date, p_au date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  tz text;
  debut timestamptz;
  fin timestamptz;
  v_offerts jsonb;
  v_remises jsonb;
  v_pertes jsonb;
  v_pourboires jsonb;
begin
  if auth.uid() is null then
    raise exception 'Une authentification est requise';
  end if;
  if not public.lecture_autorisee(p_etablissement_id, 'caisse.offerts_pertes') then
    raise exception 'Permission refusée : caisse.offerts_pertes' using errcode = '42501';
  end if;
  if p_du is null or p_au is null or p_au < p_du then
    raise exception 'Période invalide';
  end if;
  if p_au - p_du > 366 then
    raise exception 'Période trop longue (un an au plus)';
  end if;
  select coalesce(e.fuseau, 'UTC') into tz from public.etablissements e where e.id = p_etablissement_id;
  debut := p_du::timestamp at time zone coalesce(tz, 'UTC');
  fin := (p_au + 1)::timestamp at time zone coalesce(tz, 'UTC');

  select coalesce(jsonb_agg(jsonb_build_object(
      'quand', o.cree_le, 'vente', v.numero, 'article', o.libelle, 'quantite', o.quantite, 'valeur', o.valeur,
      'raison', o.raison, 'precision', o.precision_raison, 'par', coalesce(p.nom_complet, 'Inconnu'), 'servi_par', v.servi_par)
      order by o.cree_le desc), '[]'::jsonb)
  into v_offerts
  from public.offerts o
  join public.ventes v on v.id = o.vente_id and v.statut = 'validee'
  left join public.profils p on p.id = o.offert_par
  where o.etablissement_id = p_etablissement_id and o.cree_le >= debut and o.cree_le < fin;

  -- Remises : lignes remisées (hors offerts) et remises sur le total du ticket.
  select coalesce(jsonb_agg(x.r order by x.quand desc), '[]'::jsonb) into v_remises
  from (
    select v.cree_le as quand, jsonb_build_object('quand', v.cree_le, 'vente', v.numero, 'article', l.libelle, 'quantite', l.quantite,
      'valeur', l.remise, 'brut', round(l.prix_unitaire * l.quantite, 2), 'par', coalesce(p.nom_complet, 'Inconnu')) as r
    from public.lignes_vente l
    join public.ventes v on v.id = l.vente_id and v.statut = 'validee'
    left join public.profils p on p.id = v.vendeur
    where v.etablissement_id = p_etablissement_id and v.cree_le >= debut and v.cree_le < fin and l.remise > 0
      and not exists (select 1 from public.offerts o where o.ligne_vente_id = l.id)
    union all
    select v.cree_le, jsonb_build_object('quand', v.cree_le, 'vente', v.numero, 'article', 'Remise sur le ticket', 'quantite', null,
      'valeur', v.remise, 'brut', v.sous_total, 'par', coalesce(p.nom_complet, 'Inconnu'))
    from public.ventes v
    left join public.profils p on p.id = v.vendeur
    where v.etablissement_id = p_etablissement_id and v.cree_le >= debut and v.cree_le < fin and v.statut = 'validee' and v.remise > 0
  ) x;

  -- Pertes : retraits du stock (Stock › « J'ai perdu / cassé / périmé »), valeur au prix d'achat.
  select coalesce(jsonb_agg(jsonb_build_object(
      'quand', m.cree_le, 'article', a.nom, 'quantite', -m.quantite, 'motif', m.motif, 'hub', h.nom,
      'valeur', case when coalesce(m.cout_unitaire, a.cout_achat) is null then null else round(-m.quantite * coalesce(m.cout_unitaire, a.cout_achat), 2) end,
      'par', coalesce(p.nom_complet, 'Inconnu'))
      order by m.cree_le desc), '[]'::jsonb)
  into v_pertes
  from public.mouvements_stock m
  join public.articles a on a.id = m.article_id
  left join public.hubs h on h.id = m.hub_id
  left join public.profils p on p.id = m.acteur
  where m.etablissement_id = p_etablissement_id and m.type = 'ajustement' and m.quantite < 0
    and m.cree_le >= debut and m.cree_le < fin;

  -- Pourboires par serveur et par jour.
  select coalesce(jsonb_agg(jsonb_build_object('jour', x.jour, 'serveur', x.serveur, 'nombre', x.nombre, 'especes', x.especes,
      'mobile_money', x.mobile_money, 'total', x.total) order by x.jour desc, x.total desc), '[]'::jsonb)
  into v_pourboires
  from (
    select (b.cree_le at time zone coalesce(tz, 'UTC'))::date as jour, coalesce(b.serveur, 'Sans serveur') as serveur, count(*) as nombre,
      sum(b.montant) filter (where b.mode = 'especes') as especes, sum(b.montant) filter (where b.mode = 'mobile_money') as mobile_money,
      sum(b.montant) as total
    from public.pourboires b
    join public.ventes v on v.id = b.vente_id and v.statut = 'validee'
    where b.etablissement_id = p_etablissement_id and b.cree_le >= debut and b.cree_le < fin
    group by 1, 2
  ) x;

  return jsonb_build_object(
    'du', p_du, 'au', p_au,
    'offerts', v_offerts, 'remises', v_remises, 'pertes', v_pertes, 'pourboires', v_pourboires,
    'totaux', jsonb_build_object(
      'offerts', (select coalesce(sum((e ->> 'valeur')::numeric), 0) from jsonb_array_elements(v_offerts) e),
      'remises', (select coalesce(sum((e ->> 'valeur')::numeric), 0) from jsonb_array_elements(v_remises) e),
      'pertes', (select coalesce(sum((e ->> 'valeur')::numeric), 0) from jsonb_array_elements(v_pertes) e),
      'pourboires', (select coalesce(sum((e ->> 'total')::numeric), 0) from jsonb_array_elements(v_pourboires) e)
    )
  );
end
$$;
revoke execute on function public.rapport_offerts_pertes(uuid, date, date) from public, anon;
grant execute on function public.rapport_offerts_pertes(uuid, date, date) to authenticated;

notify pgrst, 'reload schema';
