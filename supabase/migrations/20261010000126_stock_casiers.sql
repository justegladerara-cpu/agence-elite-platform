-- Casiers, cartons, packs (2026-10-10, demande de Juste : simplifier le stock des boissons en casiers).
-- On vend à l'unité (la bouteille) ; on reçoit et on compte au casier. Un article peut déclarer combien d'unités
-- contient son casier (« unites_par_lot ») et comment il s'appelle (« nom_lot » : casier, carton, pack… ; casier par
-- défaut à l'écran). La saisie du stock accepte « lots » (nombre de casiers) en plus des unités : 5 casiers de 24 + 3
-- = 123. Le stock reste compté en unités : rien ne change pour la caisse ni pour les mouvements existants.

alter table public.articles add column unites_par_lot integer check (unites_par_lot between 2 and 10000);
alter table public.articles add column nom_lot text check (length(nom_lot) between 1 and 30);

-- Réglage du casier d'un article (droit articles.gerer). p_unites_par_lot null : l'article n'a plus de casier.
create function public.regler_lot_article(p_article_id uuid, p_unites_par_lot integer, p_nom_lot text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  article public.articles%rowtype;
begin
  select * into article from public.articles where id = p_article_id;
  if article.id is null then
    raise exception 'Article introuvable';
  end if;
  perform public.exiger_permission(article.etablissement_id, 'articles.gerer');
  if p_unites_par_lot is not null and (p_unites_par_lot < 2 or p_unites_par_lot > 10000) then
    raise exception 'Un casier contient de 2 à 10 000 unités';
  end if;
  if length(btrim(coalesce(p_nom_lot, ''))) > 30 then
    raise exception 'Nom du casier trop long (30 caractères au plus)';
  end if;
  update public.articles set unites_par_lot = p_unites_par_lot,
    nom_lot = case when p_unites_par_lot is null then null else nullif(btrim(coalesce(p_nom_lot, '')), '') end
  where id = article.id;
end
$$;
revoke execute on function public.regler_lot_article(uuid, integer, text) from public, anon;
grant execute on function public.regler_lot_article(uuid, integer, text) to authenticated;

-- Saisie du stock (migration 20261010000122) : quantité en unités et/ou en casiers.
create or replace function public.saisir_stock(p_hub_id uuid, p_mode text, p_lignes jsonb, p_motif text default null, p_simulation boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  hub public.hubs%rowtype;
  l jsonb;
  numero integer := 0;
  article public.articles%rowtype;
  v_nom text;
  v_reference text;
  v_cat_nom text;
  v_categorie uuid;
  v_prix numeric;
  v_quantite numeric;
  v_unites numeric;
  v_lots numeric;
  v_par_lot integer;
  v_lot_ligne integer;
  v_actuel numeric;
  v_nombre integer;
  v_details jsonb := '[]'::jsonb;
  v_vus uuid[] := '{}';
  v_noms text[] := '{}';
  v_inventaire jsonb := '[]'::jsonb;
  v_nouveaux integer := 0;
  v_actives integer := 0;
  v_total numeric := 0;
  v_motif text := nullif(btrim(coalesce(p_motif, '')), '');
  v_resultat jsonb;
begin
  select * into hub from public.hubs where id = p_hub_id;
  if hub.id is null then
    raise exception 'Hub introuvable';
  end if;
  perform public.exiger_permission(hub.etablissement_id, 'stock.ajuster');
  perform public.exiger_acces_hub(hub.id);
  if not hub.actif or not hub.capacite_stock then
    raise exception 'Ce Hub ne gère pas de stock';
  end if;
  if p_mode not in ('reception', 'comptage') then
    raise exception 'Mode inconnu : reception ou comptage';
  end if;
  if p_lignes is null or jsonb_typeof(p_lignes) is distinct from 'array' or jsonb_array_length(p_lignes) = 0 then
    raise exception 'Indiquez au moins une quantité';
  end if;
  if jsonb_array_length(p_lignes) > 3000 then
    raise exception 'Pas plus de 3 000 articles à la fois';
  end if;
  if length(coalesce(v_motif, '')) > 200 then
    raise exception 'Motif trop long (200 caractères au plus)';
  end if;

  for l in select value from jsonb_array_elements(p_lignes) loop
    numero := numero + 1;
    begin
      if jsonb_typeof(l) <> 'object' then
        raise exception 'ligne invalide';
      end if;
      -- Quantité en unités, ou en casiers (lots) plus unités : 5 casiers de 24 + 3 = 123.
      begin
        v_unites := round(replace(nullif(btrim(coalesce(l ->> 'quantite', '')), ''), ',', '.')::numeric, 3);
        v_lots := round(replace(nullif(btrim(coalesce(l ->> 'lots', '')), ''), ',', '.')::numeric, 3);
        v_lot_ligne := replace(nullif(btrim(coalesce(l ->> 'par_lot', '')), ''), ',', '.')::numeric::integer;
      exception when others then
        raise exception 'quantité illisible';
      end;
      if (v_unites is null and v_lots is null) or v_unites = 'NaN'::numeric or v_lots = 'NaN'::numeric
         or coalesce(v_unites, 0) < 0 or coalesce(v_lots, 0) < 0 or coalesce(v_unites, 0) >= 1000000000 or coalesce(v_lots, 0) >= 1000000 then
        raise exception 'quantité invalide';
      end if;
      if v_lot_ligne is not null and (v_lot_ligne < 2 or v_lot_ligne > 10000) then
        raise exception 'unités par casier invalides (de 2 à 10 000)';
      end if;
      v_nom := btrim(coalesce(l ->> 'nom', ''));
      v_reference := nullif(btrim(coalesce(l ->> 'reference', '')), '');
      v_cat_nom := nullif(btrim(coalesce(l ->> 'categorie', '')), '');
      article := null;
      if nullif(l ->> 'article_id', '') is not null then
        select * into article from public.articles where id = (l ->> 'article_id')::uuid and etablissement_id = hub.etablissement_id;
        if article.id is null then
          raise exception 'article inconnu dans cet établissement';
        end if;
      elsif v_reference is not null then
        select * into article from public.articles where etablissement_id = hub.etablissement_id and reference = v_reference;
      end if;
      if article.id is null and nullif(l ->> 'article_id', '') is null then
        if v_nom = '' then
          raise exception 'nom de l''article manquant';
        end if;
        select count(*) into v_nombre from public.articles a
        where a.etablissement_id = hub.etablissement_id and a.actif
          and lower(public.unaccent_simple(btrim(a.nom))) = lower(public.unaccent_simple(v_nom));
        if v_nombre > 1 then
          raise exception 'plusieurs articles s''appellent « % » : ajoutez la référence', v_nom;
        end if;
        select * into article from public.articles a
        where a.etablissement_id = hub.etablissement_id and a.actif
          and lower(public.unaccent_simple(btrim(a.nom))) = lower(public.unaccent_simple(v_nom));
      end if;

      if article.id is not null then
        if not article.actif then
          raise exception 'l''article « % » est archivé', article.nom;
        end if;
        if article.id = any(v_vus) then
          raise exception '« % » apparaît deux fois', article.nom;
        end if;
        v_vus := v_vus || article.id;
        v_par_lot := coalesce(article.unites_par_lot, v_lot_ligne);
        if v_lots is not null and v_par_lot is null then
          raise exception 'indiquez combien d''unités contient un casier de « % » (colonne par_casier)', article.nom;
        end if;
        v_quantite := coalesce(v_lots, 0) * coalesce(v_par_lot, 0) + coalesce(v_unites, 0);
        if p_mode = 'reception' and v_quantite = 0 then
          raise exception 'une quantité reçue doit être supérieure à 0';
        end if;
        -- Casier indiqué dans le fichier pour un article qui n'en avait pas : retenu si l'on peut gérer les articles.
        if article.unites_par_lot is null and v_lot_ligne is not null and not p_simulation
           and public.a_permission(hub.etablissement_id, 'articles.gerer') then
          update public.articles set unites_par_lot = v_lot_ligne where id = article.id;
        end if;
        v_actuel := public.stock_hub(hub.id, article.id);
        v_details := v_details || jsonb_build_array(jsonb_build_object('ligne', numero, 'article_id', article.id, 'nom', article.nom,
          'action', case when article.suivi_stock then 'existant' else 'suivi_active' end, 'quantite', v_quantite, 'actuel', v_actuel,
          'apres', case when p_mode = 'reception' then v_actuel + v_quantite else v_quantite end));
        if not article.suivi_stock then
          v_actives := v_actives + 1;
          if not p_simulation then
            update public.articles set suivi_stock = true where id = article.id;
          end if;
        end if;
      else
        -- Nouvel article (fichier de stock) : prix de vente obligatoire, catégorie créée au besoin.
        perform public.exiger_permission(hub.etablissement_id, 'articles.gerer');
        if length(v_nom) > 120 then
          raise exception 'nom trop long (120 caractères au plus)';
        end if;
        if v_lots is not null and v_lot_ligne is null then
          raise exception 'indiquez combien d''unités contient un casier de « % » (colonne par_casier)', v_nom;
        end if;
        v_quantite := coalesce(v_lots, 0) * coalesce(v_lot_ligne, 0) + coalesce(v_unites, 0);
        if p_mode = 'reception' and v_quantite = 0 then
          raise exception 'une quantité reçue doit être supérieure à 0';
        end if;
        if lower(public.unaccent_simple(v_nom)) = any(v_noms) then
          raise exception '« % » apparaît deux fois', v_nom;
        end if;
        v_noms := v_noms || lower(public.unaccent_simple(v_nom));
        begin
          v_prix := round(replace(nullif(btrim(coalesce(l ->> 'prix_vente', '')), ''), ',', '.')::numeric, 2);
        exception when others then
          raise exception 'prix de vente illisible pour le nouvel article « % »', v_nom;
        end;
        if v_prix is null or v_prix = 'NaN'::numeric or v_prix < 0 then
          raise exception 'prix de vente manquant pour le nouvel article « % »', v_nom;
        end if;
        if v_cat_nom is not null and length(v_cat_nom) > 80 then
          raise exception 'catégorie trop longue (80 caractères au plus)';
        end if;
        v_nouveaux := v_nouveaux + 1;
        v_details := v_details || jsonb_build_array(jsonb_build_object('ligne', numero, 'nom', v_nom, 'action', 'nouveau',
          'categorie', v_cat_nom, 'prix_vente', v_prix, 'quantite', v_quantite, 'actuel', 0, 'apres', v_quantite));
        if not p_simulation then
          v_categorie := null;
          if v_cat_nom is not null then
            select id into v_categorie from public.categories_articles
            where etablissement_id = hub.etablissement_id and lower(public.unaccent_simple(nom)) = lower(public.unaccent_simple(v_cat_nom));
            if v_categorie is null then
              insert into public.categories_articles(etablissement_id, nom, ordre)
              values (hub.etablissement_id, v_cat_nom,
                coalesce((select max(ordre) + 10 from public.categories_articles where etablissement_id = hub.etablissement_id), 10))
              returning id into v_categorie;
            else
              update public.categories_articles set actif = true, archivee_le = null where id = v_categorie and not actif;
            end if;
          end if;
          insert into public.articles(etablissement_id, reference, nom, categorie_id, prix_vente, suivi_stock, actif, unites_par_lot)
          values (hub.etablissement_id, v_reference, v_nom, v_categorie, v_prix, true, true, v_lot_ligne)
          returning * into article;
          v_vus := v_vus || article.id;
        end if;
      end if;

      v_total := v_total + v_quantite;
      if not p_simulation then
        if p_mode = 'reception' then
          insert into public.mouvements_stock(etablissement_id, hub_id, article_id, type, quantite, motif, acteur)
          values (hub.etablissement_id, hub.id, article.id, 'entree', v_quantite, coalesce(v_motif, 'Marchandise reçue'), auth.uid());
        else
          v_inventaire := v_inventaire || jsonb_build_array(jsonb_build_object('article_id', article.id, 'quantite_comptee', v_quantite));
        end if;
      end if;
    exception when others then
      raise exception 'Ligne % : %', numero, sqlerrm;
    end;
  end loop;

  v_resultat := jsonb_build_object('simulation', p_simulation, 'mode', p_mode, 'articles', numero, 'nouveaux', v_nouveaux,
    'suivi_active', v_actives, 'quantite_totale', v_total, 'details', v_details);
  if not p_simulation and p_mode = 'comptage' then
    v_resultat := v_resultat || jsonb_build_object('inventaire',
      public.enregistrer_inventaire(hub.id, v_inventaire, coalesce(v_motif, 'Stock compté')));
  end if;
  return v_resultat;
end
$$;


notify pgrst, 'reload schema';
