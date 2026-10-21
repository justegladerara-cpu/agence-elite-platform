-- Tableau de bord Commerce : chiffres justes pour un bar de nuit, et statistiques utiles au gérant.
-- Audit The Dream du 2026-10-21 : TD-001 (jour civil contre service), TD-002 (écart sans format), TD-003 (seuil de
-- 24 h codé en dur), TD-011 (comparaison injuste), TD-014 (fausses ruptures), TD-015 (marge sans valeur),
-- TD-016 (reste à encaisser sans dire « toutes dates »).
-- Nouvelles statistiques : heures de pointe, jour × heure, jour de la semaine, catégories, top 10 et moins vendus,
-- articles qui dorment, serveurs, annulations par personne, écarts de caisse par caissière, ardoises par ancienneté.
-- Ne change aucune donnée. Remplace des fonctions de lecture (mêmes signatures).

-- ---------------------------------------------------------------------------
-- 1. Jour d'exploitation (TD-001)
-- ---------------------------------------------------------------------------
-- Une vente de caisse compte pour le jour (heure locale) où sa caisse a été ouverte : une soirée de 18 h à 3 h reste
-- entière (décision du 2026-10-13 : on compte par service, de l'ouverture au ticket Z, sans heure de bascule ; une
-- caisse oubliée est signalée par l'alerte « ticket Z non tiré »). Sans caisse (facture, boutique en ligne), la date
-- de l'opération compte. C'est la règle du tableau des caissières, désormais la même partout.
create or replace function public.jour_exploitation(p_ouverture timestamptz, p_quand timestamptz, p_fuseau text)
returns date
language sql
immutable
set search_path = ''
as $$
  select ((case when p_ouverture is not null and p_quand >= p_ouverture then p_ouverture else p_quand end) at time zone p_fuseau)::date
$$;
revoke execute on function public.jour_exploitation(timestamptz, timestamptz, text) from public, anon;
grant execute on function public.jour_exploitation(timestamptz, timestamptz, text) to authenticated;

-- Montant lisible dans un texte : « -78 500 FCFA ».
create or replace function public.cockpit_montant_texte(p_montant numeric, p_devise text)
returns text
language sql
immutable
set search_path = ''
as $$
  select replace(to_char(round(coalesce(p_montant, 0)), 'FM999G999G999G999G990'), ',', ' ') || ' ' ||
         case coalesce(p_devise, 'XAF') when 'XAF' then 'FCFA' when 'XOF' then 'FCFA' else coalesce(p_devise, 'XAF') end
$$;
revoke execute on function public.cockpit_montant_texte(numeric, text) from public, anon;
grant execute on function public.cockpit_montant_texte(numeric, text) to authenticated;

-- Ventes et paiements de la période, rattachés à leur jour d'exploitation.
-- Le filtre sur cree_le borne la recherche : une vente n'est jamais avant le début de son jour d'exploitation.
create or replace function public.cockpit_ventes(p_etablissement_id uuid, c public.cockpit_ctx, p_du date, p_au date)
returns setof public.ventes
language sql
stable
security definer
set search_path = ''
as $$
  select v.* from public.ventes v
  left join public.sessions_caisse s on s.id = v.session_caisse_id
  where v.etablissement_id = p_etablissement_id
    and v.cree_le >= (p_du::timestamp at time zone c.tz)
    and public.jour_exploitation(s.ouverte_le, v.cree_le, c.tz) between p_du and p_au
    and public.cockpit_hub_ok(c, v.hub_id)
    and (c.caisse is null or v.point_de_vente_id = c.caisse)
    and (c.vendeur is null or v.vendeur = c.vendeur)
$$;
revoke execute on function public.cockpit_ventes(uuid, public.cockpit_ctx, date, date) from public, anon, authenticated;

create or replace function public.cockpit_paiements(p_etablissement_id uuid, c public.cockpit_ctx, p_du date, p_au date)
returns setof public.paiements
language sql
stable
security definer
set search_path = ''
as $$
  select p.* from public.paiements p
  left join public.sessions_caisse s on s.id = p.session_caisse_id
  where p.etablissement_id = p_etablissement_id and p.statut = 'valide'
    and p.cree_le >= (p_du::timestamp at time zone c.tz)
    and public.jour_exploitation(s.ouverte_le, p.cree_le, c.tz) between p_du and p_au
    and public.cockpit_hub_ok(c, p.hub_id)
    and (c.caisse is null or s.point_de_vente_id = c.caisse)
    and (c.vendeur is null or p.encaisse_par = c.vendeur)
$$;
revoke execute on function public.cockpit_paiements(uuid, public.cockpit_ctx, date, date) from public, anon, authenticated;

-- Tableau des caissières : même règle, par la même fonction (et la même borne de recherche).
create or replace function public.activite_caissiers(p_etablissement_id uuid, p_du date default null, p_au date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  fuseau text := coalesce((select e.fuseau from public.etablissements e where e.id = p_etablissement_id), 'UTC');
  du date := coalesce(p_du, (now() at time zone fuseau)::date);
  au date := coalesce(p_au, du);
begin
  if not public.voit_toutes_caisses(p_etablissement_id) then
    raise exception 'Accès refusé';
  end if;
  return coalesce((
    with ventes as (
      select coalesce(s.ouverte_par, v.vendeur) personne, v.total
      from public.ventes v
      left join public.sessions_caisse s on s.id = v.session_caisse_id
      where v.etablissement_id = p_etablissement_id and v.statut = 'validee'
        and v.cree_le >= (du::timestamp at time zone fuseau)
        and public.jour_exploitation(s.ouverte_le, v.cree_le, fuseau) between du and au
        and public.lecture_hub(v.etablissement_id, v.hub_id)
    ), totaux as (
      select personne, count(*) nombre, sum(total) total from ventes where personne is not null group by personne
    ), ouvertes as (
      select s.ouverte_par personne, min(s.ouverte_le) depuis,
        string_agg(distinct p.nom, ', ') caisses,
        sum((select coalesce(sum(v.total), 0) from public.ventes v where v.session_caisse_id = s.id and v.statut = 'validee')) en_cours,
        sum((select count(*) from public.ventes v where v.session_caisse_id = s.id and v.statut = 'validee')) nombre_en_cours,
        max((select max(v.cree_le) from public.ventes v where v.session_caisse_id = s.id and v.statut = 'validee')) derniere_vente
      from public.sessions_caisse s join public.points_de_vente p on p.id = s.point_de_vente_id
      where s.etablissement_id = p_etablissement_id and s.statut = 'ouverte' and not s.rattrapage
        and public.lecture_hub(s.etablissement_id, s.hub_id)
      group by s.ouverte_par
    )
    select jsonb_agg(jsonb_build_object(
        'id', x.personne, 'nom', public.nom_membre_restaurant(x.personne),
        'nombre_ventes', coalesce(t.nombre, 0), 'total_ventes', coalesce(t.total, 0),
        'en_caisse', o.personne is not null, 'depuis', o.depuis, 'caisses', o.caisses, 'caisse_en_cours', o.en_cours,
        'nombre_en_cours', o.nombre_en_cours, 'derniere_vente', o.derniere_vente)
      order by coalesce(t.total, 0) desc, public.nom_membre_restaurant(x.personne))
    from (select personne from totaux union select personne from ouvertes) x
    left join totaux t on t.personne = x.personne
    left join ouvertes o on o.personne = x.personne
  ), '[]'::jsonb);
end
$$;

-- ---------------------------------------------------------------------------
-- 2. Tableau Commerce
-- ---------------------------------------------------------------------------
create or replace function public.cockpit_commerce(p_etablissement_id uuid, p_du date, p_au date, p_filtres jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  c public.cockpit_ctx;
  per text;
  v_devise text := coalesce((select e.devise from public.etablissements e where e.id = p_etablissement_id), 'XAF');
  v_comp boolean;
  v_pdu date; v_pau date; v_limite timestamptz := 'infinity'; v_lib_comp text; v_en_cours boolean;
  v_nb bigint; v_ca numeric; v_nb_p bigint; v_ca_p numeric; v_premier date;
  v_enc numeric; v_enc_p numeric;
  v_remb numeric; v_remb_p numeric; v_nb_retours bigint;
  v_annul bigint; v_annul_tardives bigint;
  v_marge numeric; v_ca_connu numeric; v_ca_lignes numeric; v_sans_cout bigint; v_lignes bigint; v_couverture numeric;
  v_credits numeric; v_nb_credits bigint; v_credits_anciens bigint;
  v_stock boolean := public.lecture_autorisee(p_etablissement_id, 'stock.lire');
  v_paie boolean := public.lecture_autorisee(p_etablissement_id, 'paiements.lire');
  v_cloture boolean := public.lecture_autorisee(p_etablissement_id, 'cloture.lire') or public.a_permission(p_etablissement_id, 'caisse.utiliser');
  v_ruptures bigint := 0; v_bas bigint := 0; v_ajust bigint := 0; v_sans_depart bigint := 0;
  v_seuil numeric;
  v_caisses bigint := 0; v_caisses_vieilles bigint := 0; v_ecarts bigint := 0; v_ecart_total numeric := 0;
  v_kpis jsonb; v_graphs jsonb; v_listes jsonb; v_activite jsonb;
  v_vendus uuid[];
begin
  if not public.lecture_autorisee(p_etablissement_id, 'ventes.lire') then
    raise exception 'Permission refusée : ventes.lire' using errcode = '42501';
  end if;
  c := public.cockpit_preparer(p_etablissement_id, p_du, p_au, p_filtres);
  per := public.cockpit_periode(c);

  -- Comparaison juste (TD-011) : un jour se compare au même jour de la semaine précédente (un vendredi à un
  -- vendredi) ; une période en cours se compare à la période précédente arrêtée au même moment.
  if c.jours = 1 then
    v_pdu := c.du - 7; v_pau := c.du - 7;
  else
    v_pdu := c.pdu; v_pau := c.pau;
  end if;
  v_en_cours := c.au >= c.auj;
  if v_en_cours then
    v_limite := now() - make_interval(days => c.du - v_pdu);
  end if;
  v_lib_comp := case
    when c.jours = 1 and v_en_cours then 'vs il y a 7 jours, même heure'
    when c.jours = 1 then 'vs même jour, semaine d’avant'
    when v_en_cours then 'vs période d’avant, même moment'
    else 'vs période précédente' end;

  select count(*), coalesce(sum(total), 0) into v_nb, v_ca
  from public.cockpit_ventes(p_etablissement_id, c, c.du, c.au) v where v.statut = 'validee';
  select count(*), coalesce(sum(total), 0) into v_nb_p, v_ca_p
  from public.cockpit_ventes(p_etablissement_id, c, v_pdu, v_pau) v where v.statut = 'validee' and v.cree_le <= v_limite;
  select min((v.cree_le at time zone c.tz)::date) into v_premier
  from public.ventes v where v.etablissement_id = p_etablissement_id and public.cockpit_hub_ok(c, v.hub_id);
  v_comp := public.cockpit_comparable(v_nb_p, v_premier, v_pdu);

  select count(*), count(*) filter (where v.annulee_le > v.cree_le + interval '30 minutes')
  into v_annul, v_annul_tardives
  from public.cockpit_ventes(p_etablissement_id, c, c.du, c.au) v where v.statut = 'annulee';
  select coalesce(sum(montant), 0) into v_enc from public.cockpit_paiements(p_etablissement_id, c, c.du, c.au);
  select coalesce(sum(montant), 0) into v_enc_p from public.cockpit_paiements(p_etablissement_id, c, v_pdu, v_pau) p where p.cree_le <= v_limite;

  select coalesce(sum(r.montant), 0) into v_remb
  from public.remboursements_vente r
  where r.etablissement_id = p_etablissement_id and (r.cree_le at time zone c.tz)::date between c.du and c.au
    and public.cockpit_hub_ok(c, r.hub_id)
    and (c.caisse is null or exists (select 1 from public.sessions_caisse s where s.id = r.session_caisse_id and s.point_de_vente_id = c.caisse))
    and (c.vendeur is null or r.rembourse_par = c.vendeur);
  select count(*) into v_nb_retours
  from public.retours_vente r
  where r.etablissement_id = p_etablissement_id and (r.cree_le at time zone c.tz)::date between c.du and c.au
    and public.cockpit_hub_ok(c, r.hub_id)
    and (c.vendeur is null or r.cree_par = c.vendeur);
  select coalesce(sum(r.montant), 0) into v_remb_p
  from public.remboursements_vente r
  where r.etablissement_id = p_etablissement_id and (r.cree_le at time zone c.tz)::date between v_pdu and v_pau
    and r.cree_le <= v_limite and public.cockpit_hub_ok(c, r.hub_id);

  select coalesce(array_agg(distinct l.article_id) filter (where l.article_id is not null), '{}')
  into v_vendus
  from public.lignes_vente l
  join public.cockpit_ventes(p_etablissement_id, c, c.du, c.au) v on v.id = l.vente_id and v.statut = 'validee';

  -- Marge (TD-015) : coût de la ligne au moment de la vente, sinon prix d'achat actuel de l'article.
  -- Affichée seulement si le coût est connu sur au moins 80 % du chiffre d'affaires.
  select coalesce(sum(l.total - l.quantite * coalesce(l.cout_unitaire, a.cout_achat)) filter (where coalesce(l.cout_unitaire, a.cout_achat) is not null), 0),
         coalesce(sum(l.total) filter (where coalesce(l.cout_unitaire, a.cout_achat) is not null), 0),
         coalesce(sum(l.total), 0),
         count(distinct l.article_id) filter (where coalesce(l.cout_unitaire, a.cout_achat) is null),
         count(*)
  into v_marge, v_ca_connu, v_ca_lignes, v_sans_cout, v_lignes
  from public.lignes_vente l
  join public.cockpit_ventes(p_etablissement_id, c, c.du, c.au) v on v.id = l.vente_id and v.statut = 'validee'
  left join public.articles a on a.id = l.article_id;
  v_couverture := case when v_ca_lignes > 0 then v_ca_connu / v_ca_lignes end;

  -- Reste à encaisser : toutes dates (TD-016), avec l'ancienneté.
  select coalesce(sum(v.total - v.montant_paye), 0), count(*),
         count(*) filter (where (v.cree_le at time zone c.tz)::date < c.auj - 30)
  into v_credits, v_nb_credits, v_credits_anciens
  from public.ventes v
  where v.etablissement_id = p_etablissement_id and v.statut = 'validee' and v.montant_paye < v.total
    and public.cockpit_hub_ok(c, v.hub_id) and (c.caisse is null or v.point_de_vente_id = c.caisse);

  if v_stock then
    -- Ruptures (TD-014) : seulement les articles suivis qui ont déjà eu du stock et qui se vendent (30 derniers jours).
    with niveaux as (
      select a.id, a.stock_minimum,
             exists (select 1 from public.mouvements_stock m where m.article_id = a.id and m.quantite > 0
                       and m.type in ('entree', 'inventaire', 'ajustement', 'transfert_entree', 'production_entree')) as approvisionne,
             exists (select 1 from public.lignes_vente l join public.ventes v on v.id = l.vente_id
                     where l.article_id = a.id and v.statut = 'validee' and v.cree_le > now() - interval '30 days') as vendu,
             coalesce((select sum(s.quantite) from public.stock_hubs s
                       where s.article_id = a.id and public.cockpit_hub_ok(c, s.hub_id)), 0) as quantite
      from public.articles a
      where a.etablissement_id = p_etablissement_id and a.actif and a.suivi_stock
    )
    select count(*) filter (where quantite <= 0 and approvisionne and vendu),
           count(*) filter (where quantite > 0 and quantite <= stock_minimum),
           count(*) filter (where not approvisionne)
    into v_ruptures, v_bas, v_sans_depart from niveaux;
    select count(*) into v_ajust from public.mouvements_stock m
    where m.etablissement_id = p_etablissement_id and m.type in ('ajustement', 'inventaire') and m.quantite < 0
      and (m.cree_le at time zone c.tz)::date between c.du and c.au and public.cockpit_hub_ok(c, m.hub_id);
  end if;

  if v_cloture then
    -- Seuil du réglage de clôture (12 h par défaut) au lieu de 24 h codées en dur (TD-003).
    v_seuil := greatest(coalesce((public.parametre_module(p_etablissement_id, 'cloture', 'alerte_caisse_ouverte_heures', '12'::jsonb) #>> '{}')::numeric, 12), 0);
    select count(*), count(*) filter (where v_seuil > 0 and s.ouverte_le < now() - make_interval(secs => (v_seuil * 3600)::double precision))
    into v_caisses, v_caisses_vieilles
    from public.sessions_caisse s
    where s.etablissement_id = p_etablissement_id and s.statut = 'ouverte' and not s.rattrapage
      and public.cockpit_hub_ok(c, s.hub_id) and (c.caisse is null or s.point_de_vente_id = c.caisse);
    select count(*) filter (where k.ecart <> 0), coalesce(sum(k.ecart), 0) into v_ecarts, v_ecart_total
    from public.clotures k
    left join public.sessions_caisse s on s.id = k.session_caisse_id
    where k.etablissement_id = p_etablissement_id and public.jour_exploitation(s.ouverte_le, k.cloturee_le, c.tz) between c.du and c.au
      and public.cockpit_hub_ok(c, k.hub_id) and (c.caisse is null or k.point_de_vente_id = c.caisse);
  end if;

  -- Graphiques.
  v_graphs := public.cockpit_liste(array[
    -- Chiffre d'affaires par jour (ou par mois au-delà de 62 jours), par jour d'exploitation.
    case when c.jours > 1 then jsonb_build_object('cle', 'ventes_periode', 'type', 'barres', 'format', 'montant',
      'titre', case when c.jours > 62 then 'Chiffre d’affaires par mois' else 'Chiffre d’affaires par jour' end,
      'points', coalesce((
        select jsonb_agg(jsonb_build_object('libelle', libelle, 'valeur', total, 'cle', cle) order by cle)
        from (
          select case when c.jours > 62 then to_char(date_trunc('month', j), 'YYYY-MM') else to_char(j, 'YYYY-MM-DD') end as cle,
                 case when c.jours > 62 then to_char(date_trunc('month', j), 'MM/YYYY') else to_char(j, 'DD/MM') end as libelle,
                 coalesce(sum(v.total), 0) as total
          from generate_series(c.du, c.au, interval '1 day') j
          left join (
            select x.total, public.jour_exploitation(s.ouverte_le, x.cree_le, c.tz) jour
            from public.cockpit_ventes(p_etablissement_id, c, c.du, c.au) x
            left join public.sessions_caisse s on s.id = x.session_caisse_id
            where x.statut = 'validee'
          ) v on v.jour = j::date
          group by 1, 2
        ) t), '[]'::jsonb)) end,
    -- Heures de pointe : CA par heure, de 6 h à 5 h (une nuit se lit dans l'ordre), sans les heures vides aux bords.
    (select case when count(*) > 0 then jsonb_build_object('cle', 'ventes_heure', 'type', 'barres', 'format', 'montant',
      'titre', 'Heures de pointe (chiffre d’affaires par heure)',
      'points', jsonb_agg(jsonb_build_object('libelle', format('%s h', h), 'valeur', total, 'cle', rang) order by rang)) end
     from (
       select h, rang, total from (
         select g.h, (g.h + 18) % 24 rang, coalesce(sum(v.total), 0) total
         from generate_series(0, 23) g(h)
         left join public.cockpit_ventes(p_etablissement_id, c, c.du, c.au) v
           on v.statut = 'validee' and extract(hour from v.cree_le at time zone c.tz)::int = g.h
         group by g.h
       ) t
       where rang between (select min((extract(hour from v.cree_le at time zone c.tz)::int + 18) % 24) from public.cockpit_ventes(p_etablissement_id, c, c.du, c.au) v where v.statut = 'validee')
                      and (select max((extract(hour from v.cree_le at time zone c.tz)::int + 18) % 24) from public.cockpit_ventes(p_etablissement_id, c, c.du, c.au) v where v.statut = 'validee')
     ) t2),
    -- Affluence jour × heure (7 jours ou plus) : quels soirs, à quelle heure.
    case when c.jours >= 7 then (select case when count(*) > 0 then jsonb_build_object('cle', 'jour_heure', 'type', 'grille', 'format', 'montant',
      'titre', 'Affluence : jour de la semaine × heure',
      'lignes', jsonb_build_array('Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'),
      'points', jsonb_agg(jsonb_build_object('ligne', jour - 1, 'colonne', format('%s h', h), 'rang', (h + 18) % 24, 'valeur', total) order by jour, (h + 18) % 24)) end
     from (
       select extract(isodow from public.jour_exploitation(s.ouverte_le, v.cree_le, c.tz))::int jour,
              extract(hour from v.cree_le at time zone c.tz)::int h, sum(v.total) total
       from public.cockpit_ventes(p_etablissement_id, c, c.du, c.au) v
       left join public.sessions_caisse s on s.id = v.session_caisse_id
       where v.statut = 'validee'
       group by 1, 2
     ) t) end,
    -- CA moyen par jour de la semaine (14 jours ou plus).
    case when c.jours >= 14 then (select case when sum(total) > 0 then jsonb_build_object('cle', 'jour_semaine', 'type', 'barres', 'format', 'montant',
      'titre', 'Chiffre d’affaires moyen par jour de la semaine',
      'points', jsonb_agg(jsonb_build_object('libelle', (array['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'])[jour], 'valeur', round(total / nullif(nb_jours, 0)), 'cle', jour) order by jour)) end
     from (
       select d.jour, count(*) nb_jours, coalesce(sum(t.total), 0) total
       from (select extract(isodow from j)::int jour, j::date j from generate_series(c.du, least(c.au, c.auj), interval '1 day') j) d
       left join (
         select public.jour_exploitation(s.ouverte_le, v.cree_le, c.tz) jour_e, sum(v.total) total
         from public.cockpit_ventes(p_etablissement_id, c, c.du, c.au) v
         left join public.sessions_caisse s on s.id = v.session_caisse_id
         where v.statut = 'validee' group by 1
       ) t on t.jour_e = d.j
       group by d.jour
     ) x) end,
    -- Ventes par catégorie.
    (select case when count(*) > 1 then jsonb_build_object('cle', 'categories', 'type', 'repartition', 'format', 'montant',
      'titre', 'Ventes par catégorie',
      'points', jsonb_agg(jsonb_build_object('libelle', nom, 'cle', 'categorie-' || cle, 'valeur', total) order by total desc)) end
     from (
       select coalesce(k.id::text, 'aucune') cle, coalesce(k.nom, 'Sans catégorie') nom, sum(l.total) total
       from public.lignes_vente l
       join public.cockpit_ventes(p_etablissement_id, c, c.du, c.au) v on v.id = l.vente_id and v.statut = 'validee'
       left join public.articles a on a.id = l.article_id
       left join public.categories_articles k on k.id = a.categorie_id
       group by 1, 2 having sum(l.total) > 0
     ) t),
    (select case when v_paie and count(*) > 0 then jsonb_build_object('cle', 'encaissements_mode', 'type', 'repartition', 'format', 'montant',
      'titre', 'Encaissements par mode',
      'points', jsonb_agg(jsonb_build_object('libelle', mode, 'cle', mode, 'valeur', total) order by total desc)) end
     from (select p.mode, sum(p.montant) total from public.cockpit_paiements(p_etablissement_id, c, c.du, c.au) p group by p.mode) t)
  ]);

  v_listes := public.cockpit_liste(array[
    -- Top 10.
    (select case when count(*) > 0 then jsonb_build_object('cle', 'top_articles', 'titre', 'Meilleures ventes (top 10)', 'route', 'articles',
      'lignes', jsonb_agg(jsonb_build_object('libelle', libelle, 'detail', format('%s vendu(s)', trim_scale(round(quantite, 2))), 'valeur', total, 'format', 'montant') order by total desc)) end
     from (select l.libelle, sum(l.quantite) quantite, sum(l.total) total
           from public.lignes_vente l join public.cockpit_ventes(p_etablissement_id, c, c.du, c.au) v on v.id = l.vente_id and v.statut = 'validee'
           group by l.libelle order by sum(l.total) desc limit 10) t),
    -- Moins vendus (parmi les articles vendus), quand la carte est assez large.
    (select case when count(*) > 0 then jsonb_build_object('cle', 'moins_vendus', 'titre', 'Les moins vendus', 'route', 'articles',
      'lignes', jsonb_agg(jsonb_build_object('libelle', libelle, 'detail', format('%s vendu(s)', trim_scale(round(quantite, 2))), 'valeur', total, 'format', 'montant') order by quantite, total)) end
     from (select l.libelle, sum(l.quantite) quantite, sum(l.total) total
           from public.lignes_vente l join public.cockpit_ventes(p_etablissement_id, c, c.du, c.au) v on v.id = l.vente_id and v.statut = 'validee'
           group by l.libelle
           having (select count(distinct l2.libelle) from public.lignes_vente l2
                   join public.cockpit_ventes(p_etablissement_id, c, c.du, c.au) v2 on v2.id = l2.vente_id and v2.statut = 'validee') > 10
           order by sum(l.quantite), sum(l.total) limit 5) t),
    -- Articles qui dorment : actifs, sans vente depuis 30 jours (si l'établissement vend depuis plus de 30 jours).
    case when v_premier is not null and v_premier <= c.auj - 30 then (
      select case when count(*) > 0 then jsonb_build_object('cle', 'dormants',
        'titre', format('Sans vente depuis 30 jours (%s article%s)', max(n), case when max(n) > 1 then 's' else '' end), 'route', 'articles',
        'lignes', jsonb_agg(jsonb_build_object('libelle', nom,
          'detail', case when derniere is null then 'Jamais vendu' else 'Dernière vente le ' || to_char(derniere at time zone c.tz, 'DD/MM/YYYY') end,
          'valeur', prix, 'format', 'montant') order by derniere nulls first, nom)) end
      from (
        select a.nom, a.prix_vente prix, d.derniere, count(*) over () n
        from public.articles a
        left join lateral (select max(v.cree_le) derniere from public.lignes_vente l join public.ventes v on v.id = l.vente_id
                           where l.article_id = a.id and v.statut = 'validee') d on true
        where a.etablissement_id = p_etablissement_id and a.actif
          and (d.derniere is null or d.derniere < now() - interval '30 days')
        order by d.derniere nulls first, a.nom limit 8
      ) t) end,
    case when v_stock then (select case when count(*) > 0 then jsonb_build_object('cle', 'sans_vente', 'titre', 'En stock, sans vente sur la période', 'route', 'stock',
      'lignes', jsonb_agg(jsonb_build_object('libelle', nom, 'detail', format('%s en stock', trim_scale(round(quantite, 2))), 'valeur', valeur, 'format', 'montant') order by valeur desc)) end
     from (
       select a.nom, sum(s.quantite) quantite, sum(s.quantite) * coalesce(a.cout_achat, 0) valeur
       from public.articles a join public.stock_hubs s on s.article_id = a.id and public.cockpit_hub_ok(c, s.hub_id)
       where a.etablissement_id = p_etablissement_id and a.actif and a.suivi_stock
         and a.id <> all(v_vendus)
       group by a.id, a.nom, a.cout_achat having sum(s.quantite) > 0
       order by 3 desc limit 5
     ) t) end,
    -- Classement des serveurs (serveur choisi à la caisse).
    (select case when count(*) > 0 then jsonb_build_object('cle', 'par_serveur', 'titre', 'Classement des serveurs',
      'lignes', jsonb_agg(jsonb_build_object('libelle', nom,
        'detail', format('%s vente(s) · panier %s', nombre, public.cockpit_montant_texte(total / nombre, v_devise)),
        'valeur', total, 'format', 'montant') order by total desc)) end
     from (select coalesce(sc.prenom, btrim(v.servi_par)) nom, count(*) nombre, sum(v.total) total
           from public.cockpit_ventes(p_etablissement_id, c, c.du, c.au) v
           left join public.serveurs_caisse sc on sc.id = coalesce((select f.fusionne_dans from public.serveurs_caisse f where f.id = v.serveur_id), v.serveur_id)
           where v.statut = 'validee' and coalesce(sc.prenom, btrim(v.servi_par)) is not null
           group by 1 order by 3 desc limit 10) t),
    (select case when count(*) > 1 then jsonb_build_object('cle', 'par_vendeur', 'titre', 'Par vendeur',
      'lignes', jsonb_agg(jsonb_build_object('libelle', public.cockpit_nom_utilisateur(vendeur),
        'detail', format('%s vente(s) · panier %s', nombre, public.cockpit_montant_texte(total / nombre, v_devise)), 'valeur', total, 'format', 'montant',
        'route', format('ventes?%s&vendeur=%s', per, vendeur)) order by total desc)) end
     from (select v.vendeur, count(*) nombre, sum(v.total) total from public.cockpit_ventes(p_etablissement_id, c, c.du, c.au) v
           where v.statut = 'validee' and v.vendeur is not null group by v.vendeur order by 3 desc limit 8) t),
    -- Annulations par personne : ventes annulées (dont tardives) et paiements annulés.
    (select case when count(*) > 0 then jsonb_build_object('cle', 'annulations_personnes', 'titre', 'Annulations par personne', 'route', 'ventes?statut=annulee&' || per,
      'lignes', jsonb_agg(jsonb_build_object('libelle', public.cockpit_nom_utilisateur(personne),
        'detail', concat_ws(' · ',
          case when ventes > 0 then format('%s vente(s) annulée(s)', ventes) end,
          case when tardives > 0 then format('%s plus de 30 min après', tardives) end,
          case when paiements > 0 then format('%s paiement(s) annulé(s)', paiements) end),
        'valeur', montant, 'format', 'montant') order by montant desc)) end
     from (
       select personne, sum(ventes) ventes, sum(tardives) tardives, sum(paiements) paiements, sum(montant) montant
       from (
         select v.annulee_par personne, 1 ventes, case when v.annulee_le > v.cree_le + interval '30 minutes' then 1 else 0 end tardives, 0 paiements, v.total montant
         from public.cockpit_ventes(p_etablissement_id, c, c.du, c.au) v where v.statut = 'annulee'
         union all
         select p.annule_par, 0, 0, 1, p.montant
         from public.paiements p
         left join public.ventes vv on vv.id = p.vente_id
         where v_paie and p.etablissement_id = p_etablissement_id and p.statut = 'annule' and vv.statut = 'validee'
           and (p.annule_le at time zone c.tz)::date between c.du and c.au and public.cockpit_hub_ok(c, p.hub_id)
       ) u where personne is not null group by personne order by 5 desc limit 8
     ) t),
    -- Écarts de caisse par caissière, sur les 30 jours qui finissent à la fin de la période.
    case when v_cloture then (select case when count(*) > 0 then jsonb_build_object('cle', 'ecarts_personnes', 'titre', 'Écarts de caisse par personne (30 jours)', 'route', 'clotures',
      'lignes', jsonb_agg(jsonb_build_object('libelle', public.cockpit_nom_utilisateur(personne),
        'detail', format('%s ticket(s) Z · %s avec écart', nb, nb_ecarts), 'valeur', total, 'format', 'montant') order by abs(total) desc)) end
     from (
       select coalesce(s.ouverte_par, k.cloturee_par) personne, count(*) nb, count(*) filter (where k.ecart <> 0) nb_ecarts, sum(k.ecart) total
       from public.clotures k
       left join public.sessions_caisse s on s.id = k.session_caisse_id
       where k.etablissement_id = p_etablissement_id
         and public.jour_exploitation(s.ouverte_le, k.cloturee_le, c.tz) between c.au - 29 and c.au
         and public.cockpit_hub_ok(c, k.hub_id) and (c.caisse is null or k.point_de_vente_id = c.caisse)
       group by 1 having count(*) filter (where k.ecart <> 0) > 0
       order by abs(sum(k.ecart)) desc limit 8
     ) t) end,
    -- Ardoises : ventes non soldées, par ancienneté (toutes dates).
    (select case when count(*) > 0 then jsonb_build_object('cle', 'ardoises', 'titre', 'Ardoises à encaisser (toutes dates)', 'route', 'ventes?paiement=impaye',
      'lignes', jsonb_agg(jsonb_build_object('libelle', libelle, 'detail', format('%s vente(s)', nombre), 'valeur', reste, 'format', 'montant') order by rang)) end
     from (
       select case when v.cree_le > now() - interval '24 hours' then 1 when v.cree_le > now() - interval '7 days' then 2 else 3 end rang,
              case when v.cree_le > now() - interval '24 hours' then 'Moins de 24 h'
                   when v.cree_le > now() - interval '7 days' then 'De 1 à 7 jours' else 'Plus de 7 jours' end libelle,
              count(*) nombre, sum(v.total - v.montant_paye) reste
       from public.ventes v
       where v.etablissement_id = p_etablissement_id and v.statut = 'validee' and v.montant_paye < v.total
         and public.cockpit_hub_ok(c, v.hub_id) and (c.caisse is null or v.point_de_vente_id = c.caisse)
       group by 1, 2
     ) t),
    case when c.hub is null then (select case when count(*) > 1 then jsonb_build_object('cle', 'par_hub', 'titre', 'Par Hub',
      'lignes', jsonb_agg(jsonb_build_object('libelle', nom, 'detail', format('%s vente(s)', nombre), 'valeur', total, 'format', 'montant') order by total desc)) end
     from (select h.nom, count(v.id) nombre, coalesce(sum(v.total), 0) total
           from public.hubs h left join public.cockpit_ventes(p_etablissement_id, c, c.du, c.au) v on v.hub_id = h.id and v.statut = 'validee'
           where h.etablissement_id = p_etablissement_id and h.actif and h.capacite_vente and public.lecture_hub(p_etablissement_id, h.id)
           group by h.id, h.nom) t) end
  ]);

  v_activite := coalesce((
    select jsonb_agg(a order by a ->> 'quand' desc) from (
      select a from (
        select jsonb_build_object('quand', v.cree_le, 'titre', case when v.statut = 'annulee' then 'Vente annulée ' else 'Vente ' end || v.numero,
                                  'montant', v.total, 'route', 'ventes/' || v.id) a, v.cree_le q
        from public.cockpit_ventes(p_etablissement_id, c, c.du, c.au) v order by v.cree_le desc limit 6
      ) x
      union all
      select a from (
        select jsonb_build_object('quand', r.cree_le, 'titre', 'Retour ' || r.numero, 'detail', r.motif, 'montant', r.montant, 'route', 'ventes/' || r.vente_id) a
        from public.retours_vente r
        where r.etablissement_id = p_etablissement_id and (r.cree_le at time zone c.tz)::date between c.du and c.au and public.cockpit_hub_ok(c, r.hub_id)
        order by r.cree_le desc limit 4
      ) x
      union all
      select a from (
        select jsonb_build_object('quand', k.cloturee_le, 'titre', 'Clôture ' || k.numero,
                                  'detail', case when k.ecart <> 0 then 'Écart de caisse : ' || public.cockpit_montant_texte(k.ecart, v_devise) end,
                                  'montant', k.total_ventes, 'route', 'clotures') a
        from public.clotures k
        left join public.sessions_caisse s on s.id = k.session_caisse_id
        where v_cloture and k.etablissement_id = p_etablissement_id and public.jour_exploitation(s.ouverte_le, k.cloturee_le, c.tz) between c.du and c.au
          and public.cockpit_hub_ok(c, k.hub_id)
        order by k.cloturee_le desc limit 3
      ) x
    ) t(a)
  ), '[]'::jsonb);

  v_kpis := public.cockpit_liste(array[
    public.cockpit_kpi('chiffre_affaires', 'Chiffre d’affaires', v_ca, 'montant', 'ventes?' || per, case when v_comp then v_ca_p end,
      'Ventes validées, par service', null, true),
    case when v_paie then public.cockpit_kpi('encaisse', 'Encaissé', v_enc, 'montant', 'ventes?' || per, case when v_comp then v_enc_p end, 'Paiements reçus sur la période', null, true) end,
    public.cockpit_kpi('tickets', 'Ventes', v_nb, 'nombre', 'ventes?' || per, case when v_comp then v_nb_p end, null, null, true),
    public.cockpit_kpi('panier_moyen', 'Panier moyen', case when v_nb > 0 then round(v_ca / v_nb) else 0 end, 'montant', 'ventes?' || per,
      case when v_comp and v_nb_p > 0 then round(v_ca_p / v_nb_p) end, null, null, true),
    public.cockpit_kpi('remboursements', 'Remboursé', v_remb, 'montant', 'ventes?vue=retours&' || per, case when v_comp then v_remb_p end,
      format('%s retour(s)', v_nb_retours), case when v_remb > 0 then 'attention' end),
    case when v_lignes > 0 and v_couverture >= 0.8 then public.cockpit_kpi('marge_brute', 'Marge brute', v_marge, 'montant', 'rapports', null,
      case when v_couverture < 1 then format('Taux de marge %s %% · coût connu sur %s %% des ventes', round(100 * v_marge / nullif(v_ca_connu, 0)), floor(100 * v_couverture))
           else format('Taux de marge %s %% (ventes moins prix d’achat)', round(100 * v_marge / nullif(v_ca_connu, 0))) end) end,
    public.cockpit_kpi('credits', 'Reste à encaisser (toutes dates)', v_credits, 'montant', 'ventes?paiement=impaye', null,
      format('%s vente(s) non soldée(s)', v_nb_credits), case when v_credits_anciens > 0 then 'alerte' end),
    case when v_cloture then public.cockpit_kpi('caisses_ouvertes', 'Caisses ouvertes', v_caisses, 'nombre', 'clotures', null, null, null, true) end,
    case when v_annul > 0 then public.cockpit_kpi('annulations', 'Ventes annulées', v_annul, 'nombre', 'ventes?statut=annulee&' || per, null,
      case when v_annul_tardives > 0 then format('dont %s plus de 30 min après la vente', v_annul_tardives) end, 'attention') end
  ]);
  -- Libellé de la comparaison sur chaque indicateur comparé.
  v_kpis := coalesce((select jsonb_agg(case when k ? 'precedent' then k || jsonb_build_object('comparaison', v_lib_comp) else k end order by n)
                      from jsonb_array_elements(v_kpis) with ordinality t(k, n)), '[]'::jsonb);

  return jsonb_build_object(
    'domaine', 'commerce',
    'periode', jsonb_build_object('du', c.du, 'au', c.au, 'du_precedent', v_pdu, 'au_precedent', v_pau, 'comparable', v_comp,
                                  'comparaison', v_lib_comp, 'regle_jour', 'Un service compte pour le jour où la caisse a été ouverte, même après minuit.'),
    'kpis', v_kpis,
    'attention', public.cockpit_liste(array[
      public.cockpit_alerte('ruptures', 'critique', 'Articles en rupture', 'Stock à zéro, article vendu ces 30 derniers jours', v_ruptures, 'stock?etat=epuise'),
      public.cockpit_alerte('stock_bas', 'alerte', 'Stock sous le minimum', 'À réapprovisionner', v_bas, 'stock?etat=bas'),
      public.cockpit_alerte('caisses_anciennes', 'alerte', format('Caisse ouverte depuis plus de %s h', trim_scale(v_seuil)), 'Pensez à tirer le ticket Z', v_caisses_vieilles, 'clotures'),
      public.cockpit_alerte('ecarts_cloture', 'alerte', 'Écarts de caisse à la clôture', 'Écart cumulé : ' || public.cockpit_montant_texte(v_ecart_total, v_devise), v_ecarts, 'clotures'),
      public.cockpit_alerte('annulations_tardives', 'alerte', 'Ventes annulées plus de 30 min après', 'À vérifier avec la personne qui a annulé', v_annul_tardives, 'ventes?statut=annulee&' || per),
      public.cockpit_alerte('credits_anciens', 'alerte', 'Ventes non soldées depuis plus de 30 jours', 'Relancer les clients', v_credits_anciens, 'ventes?paiement=impaye'),
      case when v_lignes > 0 and v_couverture < 0.8 then public.cockpit_alerte('marge_indisponible', 'info', 'Marge indisponible : prix d’achat manquants',
        format('Saisissez le prix d’achat des articles vendus (coût connu sur %s %% des ventes)', floor(100 * coalesce(v_couverture, 0))), v_sans_cout, 'articles') end,
      public.cockpit_alerte('suivis_sans_stock', 'info', 'Articles suivis sans stock de départ', 'Comptez-les avec un inventaire', v_sans_depart, 'stock?vue=inventaire'),
      public.cockpit_alerte('ajustements', 'info', 'Sorties de stock par ajustement ou inventaire', 'Mouvements à vérifier sur la période', v_ajust, 'stock?vue=mouvements&type=ajustement')
    ]),
    'graphiques', v_graphs,
    'listes', v_listes,
    'activite', v_activite
  );
end
$$;
revoke execute on function public.cockpit_commerce(uuid, date, date, jsonb) from public, anon;
grant execute on function public.cockpit_commerce(uuid, date, date, jsonb) to authenticated;

notify pgrst, 'reload schema';
