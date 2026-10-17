-- Super admin : copier des articles d'un client vers un autre, et bibliothèque d'articles Agence Elite (2026-10-13,
-- demande de Juste : « copier les articles d'un client et les mettre sur un autre client qui fait la même chose… la
-- bouteille de 33 vendue à The Dream est la même que celle vendue à Hôtel 2i, le prix peut être différent »).
--
-- - Source : un établissement de n'importe quel client, ou la bibliothèque Agence Elite.
-- - Copié : nom, variante, description, catégorie (créée si absente), unité, casier, poste, photo, conditionnements
--   sans fournisseur. JAMAIS le coût d'achat (secret du client source), le stock, les ventes, les fournisseurs.
-- - Prix : identiques, ajustés d'un pourcentage, ou à saisir (article copié inactif tant que son prix n'est pas mis).
-- - Déjà présent (même code-barres, sinon même nom et variante) : ignoré.
-- - Démonstration et vrais clients ne se mélangent jamais.
-- - Chaque copie est notée (copies_articles) et peut être annulée : les articles copiés sont désactivés, jamais effacés.
-- Réservé au super administrateur.

create table public.bibliotheque_articles (
  id uuid primary key default gen_random_uuid(),
  nom text not null check (btrim(nom) <> '' and length(nom) <= 200),
  variante text check (variante is null or length(variante) <= 80),
  categorie text check (categorie is null or length(categorie) <= 80),
  description text,
  unite text not null default 'unité',
  unites_par_lot integer check (unites_par_lot between 2 and 10000),
  nom_lot text check (length(nom_lot) between 1 and 30),
  code_barres text,
  photo text check (photo is null or length(photo) <= 400000),
  poste_preparation text not null default 'aucun',
  suivi_stock boolean not null default true,
  actif boolean not null default true,
  cree_par uuid references auth.users(id) on delete restrict,
  cree_le timestamptz not null default now()
);
create unique index bibliotheque_articles_nom_unique on public.bibliotheque_articles (lower(btrim(nom)), coalesce(variante, '')) where actif;
alter table public.bibliotheque_articles enable row level security;
create policy bibliotheque_articles_lecture on public.bibliotheque_articles for select to authenticated using (public.est_editeur());

create table public.copies_articles (
  id uuid primary key default gen_random_uuid(),
  source_etablissement_id uuid references public.etablissements(id) on delete restrict,
  cible_etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  mode_prix text not null check (mode_prix in ('identique', 'pourcentage', 'a_saisir')),
  pourcentage numeric(6, 2),
  articles_crees uuid[] not null default '{}',
  fait_par uuid references auth.users(id) on delete restrict,
  fait_le timestamptz not null default now(),
  annulee_le timestamptz,
  annulee_par uuid references auth.users(id) on delete restrict
);
create index copies_articles_cible_idx on public.copies_articles (cible_etablissement_id);
alter table public.copies_articles enable row level security;
create policy copies_articles_lecture on public.copies_articles for select to authenticated using (public.est_editeur());

create function public.exiger_super_admin_copie()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.est_super_admin() then
    raise exception 'Réservé au super administrateur Agence Elite' using errcode = '42501';
  end if;
end
$$;
revoke execute on function public.exiger_super_admin_copie() from public, anon, authenticated;

-- Client de démonstration ou de test (jamais mélangé avec un vrai client).
create function public.client_de_demonstration(p_etablissement_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select c.nom ~* '(d[ée]mo|pilote fictif)' from public.etablissements e join public.clients c on c.id = e.client_id
                   where e.id = p_etablissement_id), false)
$$;
revoke execute on function public.client_de_demonstration(uuid) from public, anon, authenticated;

-- Liste des articles d'une source (sans coût d'achat) : établissement, ou bibliothèque si p_source est null.
create function public.articles_a_copier(p_source uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.exiger_super_admin_copie();
  if p_source is null then
    return coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'nom', b.nom, 'variante', b.variante, 'categorie', b.categorie,
      'photo', b.photo, 'prix_vente', null, 'unite', b.unite, 'code_barres', b.code_barres) order by b.categorie nulls last, b.nom)
      from public.bibliotheque_articles b where b.actif), '[]'::jsonb);
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'nom', a.nom, 'variante', a.variante, 'categorie', c.nom,
      'photo', a.photo, 'prix_vente', a.prix_vente, 'unite', a.unite, 'code_barres', a.code_barres) order by c.nom nulls last, a.nom)
    from public.articles a left join public.categories_articles c on c.id = a.categorie_id
    where a.etablissement_id = p_source and a.actif), '[]'::jsonb);
end
$$;

-- Copier. p_source null = bibliothèque (prix toujours à saisir). p_ids null = tout. Simulation par défaut.
create function public.copier_articles(
  p_source uuid,
  p_cible uuid,
  p_ids uuid[] default null,
  p_mode_prix text default 'identique',
  p_pourcentage numeric default 0,
  p_simulation boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_existe uuid;
  v_cat uuid;
  v_nouvel uuid;
  v_prix numeric;
  v_mode text := case when p_source is null then 'a_saisir' else coalesce(p_mode_prix, 'identique') end;
  v_cats text[] := '{}';
  v_crees uuid[] := '{}';
  v_noms text[] := '{}';
  v_liste jsonb := '[]'::jsonb;
  v_gardes integer := 0;
  v_copie uuid;
  v_code text;
  v_cle text;
begin
  perform public.exiger_super_admin_copie();
  if p_cible is null or p_source = p_cible then
    raise exception 'Choisissez deux établissements différents';
  end if;
  if not exists (select 1 from public.etablissements where id = p_cible and statut <> 'archive') then
    raise exception 'Établissement cible introuvable';
  end if;
  if p_source is not null and not exists (select 1 from public.etablissements where id = p_source) then
    raise exception 'Établissement source introuvable';
  end if;
  if v_mode not in ('identique', 'pourcentage', 'a_saisir') then
    raise exception 'Choix de prix inconnu';
  end if;
  if v_mode = 'pourcentage' and (p_pourcentage is null or p_pourcentage < -90 or p_pourcentage > 500) then
    raise exception 'Pourcentage entre -90 et +500';
  end if;
  if p_source is not null and public.client_de_demonstration(p_source) <> public.client_de_demonstration(p_cible) then
    raise exception 'Démonstration et vrais clients ne se mélangent pas';
  end if;

  for r in
    select x.* from (
      select a.id, a.nom, a.variante, a.description, c.nom as categorie, a.unite, a.unites_par_lot, a.nom_lot, a.code_barres,
             a.photo, a.poste_preparation, a.suivi_stock, a.prix_vente, a.reference, a.visible_menu
      from public.articles a left join public.categories_articles c on c.id = a.categorie_id
      where p_source is not null and a.etablissement_id = p_source and a.actif
      union all
      select b.id, b.nom, b.variante, b.description, b.categorie, b.unite, b.unites_par_lot, b.nom_lot, b.code_barres,
             b.photo, b.poste_preparation, b.suivi_stock, null::numeric, null::text, true
      from public.bibliotheque_articles b
      where p_source is null and b.actif
    ) x
    where p_ids is null or x.id = any(p_ids)
    order by x.categorie nulls last, x.nom
  loop
    v_existe := null;
    if r.code_barres is not null then
      select id into v_existe from public.articles where etablissement_id = p_cible and code_barres = r.code_barres limit 1;
    end if;
    if v_existe is null then
      select id into v_existe from public.articles where etablissement_id = p_cible and actif
        and lower(public.unaccent_simple(btrim(nom))) = lower(public.unaccent_simple(btrim(r.nom)))
        and coalesce(variante, '') = coalesce(r.variante, '')
      limit 1;
    end if;
    v_cle := lower(public.unaccent_simple(btrim(r.nom))) || '|' || coalesce(r.variante, '');
    if v_existe is not null or v_cle = any(v_noms) then
      v_gardes := v_gardes + 1;
      v_liste := v_liste || jsonb_build_object('nom', r.nom, 'variante', r.variante, 'statut', 'deja_present');
      continue;
    end if;
    v_noms := v_noms || v_cle;
    v_prix := case v_mode
      when 'identique' then r.prix_vente
      when 'pourcentage' then round(r.prix_vente * (1 + p_pourcentage / 100.0))
      else 0 end;
    v_liste := v_liste || jsonb_build_object('nom', r.nom, 'variante', r.variante, 'statut', 'nouveau',
      'prix_vente', case when v_mode = 'a_saisir' then null else v_prix end);
    if r.categorie is not null and not exists (
      select 1 from public.categories_articles d where d.etablissement_id = p_cible
        and lower(public.unaccent_simple(d.nom)) = lower(public.unaccent_simple(r.categorie))
    ) and not (lower(r.categorie) = any(v_cats)) then
      v_cats := v_cats || lower(r.categorie);
      if not p_simulation then
        insert into public.categories_articles (etablissement_id, nom, ordre)
        values (p_cible, r.categorie, coalesce((select max(ordre) + 10 from public.categories_articles where etablissement_id = p_cible), 10));
      end if;
    end if;
    if p_simulation then
      continue;
    end if;
    select id into v_cat from public.categories_articles d where d.etablissement_id = p_cible
      and lower(public.unaccent_simple(d.nom)) = lower(public.unaccent_simple(r.categorie)) limit 1;
    v_code := case when r.code_barres is not null and not exists (
      select 1 from public.articles where etablissement_id = p_cible and code_barres = r.code_barres) then r.code_barres end;
    insert into public.articles (etablissement_id, reference, code_barres, nom, description, categorie_id, prix_vente, cout_achat, unite,
      suivi_stock, photo, poste_preparation, variante, unites_par_lot, nom_lot, visible_menu, actif)
    values (p_cible,
      case when r.reference is not null and not exists (select 1 from public.articles where etablissement_id = p_cible and reference = r.reference) then r.reference end,
      v_code, r.nom, r.description, v_cat, v_prix, null, r.unite, r.suivi_stock, r.photo, r.poste_preparation, r.variante,
      r.unites_par_lot, r.nom_lot, coalesce(r.visible_menu, true), v_mode <> 'a_saisir')
    returning id into v_nouvel;
    v_crees := v_crees || v_nouvel;
    if p_source is not null then
      insert into public.conditionnements_articles (etablissement_id, article_id, fournisseur_id, nom, unites, dernier_prix)
      select p_cible, v_nouvel, null, ca.nom, ca.unites, null
      from public.conditionnements_articles ca where ca.article_id = r.id and ca.fournisseur_id is null;
    end if;
  end loop;

  if not p_simulation and array_length(v_crees, 1) > 0 then
    insert into public.copies_articles (source_etablissement_id, cible_etablissement_id, mode_prix, pourcentage, articles_crees, fait_par)
    values (p_source, p_cible, v_mode, case when v_mode = 'pourcentage' then p_pourcentage end, v_crees, auth.uid())
    returning id into v_copie;
  end if;
  return jsonb_build_object(
    'simulation', p_simulation, 'copie_id', v_copie, 'mode_prix', v_mode,
    'articles_crees', jsonb_array_length(coalesce((select jsonb_agg(e) from jsonb_array_elements(v_liste) e where e ->> 'statut' = 'nouveau'), '[]'::jsonb)),
    'articles_deja_presents', v_gardes, 'categories_creees', coalesce(array_length(v_cats, 1), 0), 'articles', v_liste,
    'source', coalesce((select nom from public.etablissements where id = p_source), 'Bibliothèque Agence Elite'),
    'cible', (select nom from public.etablissements where id = p_cible));
end
$$;

-- Prix à saisir après une copie : { "<article_id>": prix } ; l'article devient actif (vendable).
create function public.fixer_prix_copie(p_copie uuid, p_prix jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.copies_articles%rowtype;
  k text;
  v numeric;
  n integer := 0;
begin
  perform public.exiger_super_admin_copie();
  select * into c from public.copies_articles where id = p_copie;
  if c.id is null then
    raise exception 'Copie introuvable';
  end if;
  if c.annulee_le is not null then
    raise exception 'Cette copie a été annulée';
  end if;
  for k in select jsonb_object_keys(coalesce(p_prix, '{}'::jsonb)) loop
    if not (k::uuid = any(c.articles_crees)) then
      raise exception 'Article hors de cette copie';
    end if;
    v := (p_prix ->> k)::numeric;
    if v is null or v < 0 then
      raise exception 'Prix invalide';
    end if;
    update public.articles set prix_vente = v, actif = true where id = k::uuid;
    n := n + 1;
  end loop;
  return n;
end
$$;

-- Articles créés par une copie (pour la saisie des prix).
create function public.articles_de_copie(p_copie uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.exiger_super_admin_copie();
  return coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'nom', a.nom, 'variante', a.variante, 'photo', a.photo,
      'prix_vente', a.prix_vente, 'actif', a.actif) order by a.nom)
    from public.copies_articles c join public.articles a on a.id = any(c.articles_crees)
    where c.id = p_copie), '[]'::jsonb);
end
$$;

-- Annuler une copie : les articles copiés sont désactivés (jamais effacés : ventes et historique restent lisibles).
create function public.annuler_copie_articles(p_copie uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.copies_articles%rowtype;
  n integer;
begin
  perform public.exiger_super_admin_copie();
  select * into c from public.copies_articles where id = p_copie for update;
  if c.id is null then
    raise exception 'Copie introuvable';
  end if;
  if c.annulee_le is not null then
    raise exception 'Cette copie est déjà annulée';
  end if;
  update public.articles set actif = false where id = any(c.articles_crees) and actif;
  get diagnostics n = row_count;
  update public.copies_articles set annulee_le = now(), annulee_par = auth.uid() where id = c.id;
  return n;
end
$$;

-- Ranger des articles d'un client dans la bibliothèque (sans prix ni coût). Déjà présent (même nom et variante) : ignoré.
create function public.ajouter_a_bibliotheque(p_articles uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  perform public.exiger_super_admin_copie();
  insert into public.bibliotheque_articles (nom, variante, categorie, description, unite, unites_par_lot, nom_lot, code_barres, photo,
    poste_preparation, suivi_stock, cree_par)
  select distinct on (lower(btrim(a.nom)), coalesce(a.variante, ''))
    btrim(a.nom), a.variante, c.nom, a.description, a.unite, a.unites_par_lot, a.nom_lot, a.code_barres, a.photo,
    a.poste_preparation, a.suivi_stock, auth.uid()
  from public.articles a left join public.categories_articles c on c.id = a.categorie_id
  where a.id = any(coalesce(p_articles, '{}')) and not public.client_de_demonstration(a.etablissement_id)
    and not exists (select 1 from public.bibliotheque_articles b where b.actif
      and lower(btrim(b.nom)) = lower(btrim(a.nom)) and coalesce(b.variante, '') = coalesce(a.variante, ''))
  order by lower(btrim(a.nom)), coalesce(a.variante, ''), a.photo is null;
  get diagnostics n = row_count;
  return n;
end
$$;

-- Retirer un article de la bibliothèque (désactivé, jamais effacé).
create function public.retirer_de_bibliotheque(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.exiger_super_admin_copie();
  update public.bibliotheque_articles set actif = false where id = p_id;
end
$$;

do $$
declare signature text;
begin
  foreach signature in array array[
    'public.articles_a_copier(uuid)',
    'public.copier_articles(uuid, uuid, uuid[], text, numeric, boolean)',
    'public.fixer_prix_copie(uuid, jsonb)',
    'public.articles_de_copie(uuid)',
    'public.annuler_copie_articles(uuid)',
    'public.ajouter_a_bibliotheque(uuid[])',
    'public.retirer_de_bibliotheque(uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon', signature);
    execute format('grant execute on function %s to authenticated', signature);
  end loop;
end
$$;

notify pgrst, 'reload schema';
