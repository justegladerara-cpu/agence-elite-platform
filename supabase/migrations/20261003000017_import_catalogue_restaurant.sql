-- Import professionnel minimal de catalogue : aperçu transactionnel, références idempotentes,
-- disponibilité opérationnelle et métadonnées de variante. Aucune recette ni aucun stock n'est créé.

alter table public.categories_articles add column if not exists ordre integer not null default 0;
alter table public.articles add column if not exists variante text check (variante is null or length(variante) <= 80);
alter table public.articles add column if not exists ordre_affichage integer not null default 0;
alter table public.articles add column if not exists disponible boolean not null default true;
alter table public.articles add column if not exists epuise boolean not null default false;

create function public.importer_catalogue(
  p_etablissement_id uuid,
  p_lignes jsonb,
  p_simulation boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  ligne jsonb;
  numero integer := 0;
  v_categorie uuid;
  v_existant public.articles%rowtype;
  v_nom text;
  v_reference text;
  v_prix numeric;
  v_actif boolean;
  v_crees integer := 0;
  v_modifies integer := 0;
  v_inchanges integer := 0;
  v_attente integer := 0;
  v_categories integer := 0;
  v_variantes integer := 0;
  v_details jsonb := '[]'::jsonb;
begin
  perform public.exiger_permission(p_etablissement_id, 'articles.gerer');
  if jsonb_typeof(p_lignes) <> 'array' or jsonb_array_length(p_lignes) = 0 then
    raise exception 'Le catalogue ne contient aucune ligne';
  end if;
  if jsonb_array_length(p_lignes) > 5000 then
    raise exception 'Import limité à 5 000 lignes à la fois';
  end if;

  for ligne in select value from jsonb_array_elements(p_lignes) loop
    numero := numero + 1;
    begin
      v_nom := btrim(coalesce(ligne ->> 'nom', ''));
      v_reference := nullif(btrim(ligne ->> 'reference'), '');
      v_actif := lower(coalesce(ligne ->> 'actif', 'oui')) in ('oui', 'true', '1', 'actif');
      if v_nom = '' then raise exception 'nom manquant'; end if;
      if v_reference is null then raise exception 'référence stable manquante'; end if;

      if nullif(btrim(coalesce(ligne ->> 'prix', ligne ->> 'prix_vente')), '') is null then
        v_attente := v_attente + 1;
        v_details := v_details || jsonb_build_array(jsonb_build_object(
          'ligne', numero, 'reference', v_reference, 'action', 'attente',
          'motif', coalesce(nullif(ligne ->> 'motif_attente', ''), 'Prix absent')));
        continue;
      end if;
      v_prix := coalesce(ligne ->> 'prix', ligne ->> 'prix_vente')::numeric;
      if v_prix < 0 then raise exception 'prix négatif'; end if;
      if not v_actif then
        v_attente := v_attente + 1;
        v_details := v_details || jsonb_build_array(jsonb_build_object('ligne', numero, 'reference', v_reference, 'action', 'attente', 'motif', 'Article déclaré inactif'));
        continue;
      end if;

      select * into v_existant from public.articles
      where etablissement_id = p_etablissement_id and reference = v_reference;
      if v_existant.id is null then
        v_crees := v_crees + 1;
        v_details := v_details || jsonb_build_array(jsonb_build_object('ligne', numero, 'reference', v_reference, 'action', 'creer'));
      elsif v_existant.nom = v_nom and v_existant.prix_vente = v_prix
        and coalesce(v_existant.description, '') = coalesce(ligne ->> 'description', '')
        and coalesce(v_existant.variante, '') = coalesce(ligne ->> 'variante', '') then
        v_inchanges := v_inchanges + 1;
      else
        v_modifies := v_modifies + 1;
        v_details := v_details || jsonb_build_array(jsonb_build_object('ligne', numero, 'reference', v_reference, 'action', 'modifier'));
      end if;
      if nullif(btrim(ligne ->> 'variante'), '') is not null then v_variantes := v_variantes + 1; end if;

      if not p_simulation then
        if coalesce(btrim(ligne ->> 'categorie'), '') <> '' then
          select id into v_categorie from public.categories_articles
          where etablissement_id = p_etablissement_id and lower(nom) = lower(btrim(ligne ->> 'categorie'));
          if v_categorie is null then
            insert into public.categories_articles(etablissement_id, nom, ordre)
            values (p_etablissement_id, btrim(ligne ->> 'categorie'), coalesce(nullif(ligne ->> 'ordre_categorie', '')::integer, numero))
            returning id into v_categorie;
            v_categories := v_categories + 1;
          end if;
        else v_categorie := null;
        end if;
        if v_existant.id is null then
          insert into public.articles(etablissement_id, reference, nom, description, categorie_id, prix_vente,
            unite, suivi_stock, stock_minimum, actif, poste_preparation, variante, ordre_affichage, disponible, epuise)
          values (p_etablissement_id, v_reference, v_nom, nullif(btrim(ligne ->> 'description'), ''), v_categorie, v_prix,
            'unité', false, 0, true, coalesce(nullif(ligne ->> 'poste_preparation', ''), 'aucun'),
            nullif(btrim(ligne ->> 'variante'), ''), coalesce(nullif(ligne ->> 'ordre_affichage', '')::integer, numero), true, false);
        else
          update public.articles set nom = v_nom, description = nullif(btrim(ligne ->> 'description'), ''),
            categorie_id = v_categorie, prix_vente = v_prix, suivi_stock = false, stock_minimum = 0, actif = true,
            poste_preparation = coalesce(nullif(ligne ->> 'poste_preparation', ''), poste_preparation),
            variante = nullif(btrim(ligne ->> 'variante'), ''),
            ordre_affichage = coalesce(nullif(ligne ->> 'ordre_affichage', '')::integer, ordre_affichage),
            disponible = true, epuise = false
          where id = v_existant.id;
        end if;
      end if;
    exception when others then
      raise exception 'Ligne % : %', numero, sqlerrm;
    end;
  end loop;
  return jsonb_build_object('simulation', p_simulation, 'crees', v_crees, 'modifies', v_modifies,
    'inchanges', v_inchanges, 'attente', v_attente, 'categories_creees', v_categories,
    'variantes', v_variantes, 'details', v_details);
end
$$;

revoke execute on function public.importer_catalogue(uuid, jsonb, boolean) from public, anon;
grant execute on function public.importer_catalogue(uuid, jsonb, boolean) to authenticated;
