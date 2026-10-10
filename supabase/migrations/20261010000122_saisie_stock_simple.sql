-- Stock simplifié (2026-10-10, plainte des clients : saisir le stock article par article est trop long).
-- Une seule fonction pour les deux gestes du quotidien, sur une liste de plusieurs articles :
--   « J'ai reçu de la marchandise » (mode reception) : quantités reçues, ajoutées au stock ;
--   « Je compte mon stock » (mode comptage) : quantités comptées, l'écart est calculé et tracé (inventaire).
-- Une ligne désigne un article existant (article_id, ou référence, ou nom) ou un nouvel article (nom, prix de vente,
-- catégorie facultative) : c'est ce qui permet d'importer un fichier de stock. Taper une quantité active le suivi du
-- stock de l'article. p_simulation = true : aperçu sans rien écrire. Aucune donnée existante n'est modifiée par cette
-- migration.

create function public.saisir_stock(p_hub_id uuid, p_mode text, p_lignes jsonb, p_motif text default null, p_simulation boolean default false)
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
      begin
        v_quantite := round(replace(nullif(btrim(coalesce(l ->> 'quantite', '')), ''), ',', '.')::numeric, 3);
      exception when others then
        raise exception 'quantité illisible';
      end;
      if v_quantite is null or v_quantite = 'NaN'::numeric or v_quantite < 0 or v_quantite >= 1000000000 then
        raise exception 'quantité invalide';
      end if;
      if p_mode = 'reception' and v_quantite = 0 then
        raise exception 'une quantité reçue doit être supérieure à 0';
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
          insert into public.articles(etablissement_id, reference, nom, categorie_id, prix_vente, suivi_stock, actif)
          values (hub.etablissement_id, v_reference, v_nom, v_categorie, v_prix, true, true)
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

revoke execute on function public.saisir_stock(uuid, text, jsonb, text, boolean) from public, anon;
grant execute on function public.saisir_stock(uuid, text, jsonb, text, boolean) to authenticated;

notify pgrst, 'reload schema';
