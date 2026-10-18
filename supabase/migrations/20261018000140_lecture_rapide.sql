-- Lecture rapide des grosses tables (2026-10-18).
--
-- Pourquoi : les politiques de lecture appelaient lecture_autorisee() et lecture_hub() pour CHAQUE ligne. Ces fonctions
-- sont « security definer », donc jamais simplifiées par Postgres : environ 1 ms par ligne. Avec 7 000 mouvements de
-- stock, une lecture prenait plus de 7 s et la base l'arrêtait (« statement timeout ») ; la plateforme ralentissait aussi
-- pour les vrais clients (The Dream : près de 1 000 mouvements, une seconde à chaque lecture).
--
-- Correction : on calcule UNE fois par requête la liste des établissements (et des hubs) que la personne peut lire,
-- puis chaque ligne est comparée à cette liste. Les règles d'accès ne changent pas : la liste est faite avec les mêmes
-- fonctions (lecture_autorisee, a_permission, lecture_hub), appelées une fois par établissement ou hub au lieu d'une
-- fois par ligne.

-- Établissements où la personne connectée a le droit de lecture demandé (mêmes règles que lecture_autorisee).
create or replace function public.etablissements_en_lecture(p_permission text)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select e.id from public.etablissements e where public.lecture_autorisee(e.id, p_permission)
$$;

-- Établissements où la personne connectée a la permission demandée (mêmes règles que a_permission).
create or replace function public.etablissements_avec_permission(p_permission text)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select e.id from public.etablissements e where public.a_permission(e.id, p_permission)
$$;

-- Hubs que la personne connectée peut lire (mêmes règles que lecture_hub ; une ligne sans hub reste lisible).
create or replace function public.hubs_en_lecture()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select h.id from public.hubs h where public.lecture_hub(h.etablissement_id, h.id)
$$;

revoke all on function public.etablissements_en_lecture(text) from public, anon;
revoke all on function public.etablissements_avec_permission(text) from public, anon;
revoke all on function public.hubs_en_lecture() from public, anon;
grant execute on function public.etablissements_en_lecture(text) to authenticated;
grant execute on function public.etablissements_avec_permission(text) to authenticated;
grant execute on function public.hubs_en_lecture() to authenticated;

alter policy lecture on public.mouvements_stock using (
  etablissement_id in (select public.etablissements_en_lecture('stock.lire'))
  and (hub_id is null or hub_id in (select public.hubs_en_lecture()))
);

alter policy lecture on public.ventes using (
  etablissement_id in (select public.etablissements_en_lecture('ventes.lire'))
  and (hub_id is null or hub_id in (select public.hubs_en_lecture()))
);

alter policy lecture on public.paiements using (
  etablissement_id in (select public.etablissements_en_lecture('paiements.lire'))
  and (hub_id is null or hub_id in (select public.hubs_en_lecture()))
);

-- Une ligne de vente reste lisible seulement si sa vente l'est (la vente porte le contrôle du hub).
alter policy lecture on public.lignes_vente using (
  etablissement_id in (select public.etablissements_en_lecture('ventes.lire'))
  and exists (select 1 from public.ventes v where v.id = lignes_vente.vente_id)
);

alter policy lecture on public.articles using (
  etablissement_id in (select public.etablissements_en_lecture('articles.lire'))
  or etablissement_id in (select public.etablissements_avec_permission('caisse.utiliser'))
);

notify pgrst, 'reload schema';
