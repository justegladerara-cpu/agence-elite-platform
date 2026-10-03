-- Cockpit : tableaux de bord pilotés par période (global établissement et un par module).
-- Chaque fonction cockpit_<domaine>(établissement, du, au, filtres) renvoie la même forme :
--   kpis[]      { cle, libelle, valeur, format, route, precedent?, detail?, ton?, principal? }
--   attention[] { cle, niveau (critique|alerte|info), titre, detail, nombre, route }  (données réelles uniquement)
--   graphiques[] { cle, titre, type (barres|repartition), format, points[{ libelle, valeur, route? }] }
--   listes[]    { cle, titre, route?, lignes[{ libelle, detail?, valeur?, format?, route? }] }
--   activite[]  { quand, titre, detail?, montant?, route? }
-- « precedent » n'est fourni que si la période précédente a assez de données pour comparer.
-- Les fonctions sont en « security invoker » : la RLS de chaque table s'applique (établissement, Hub,
-- rôle, permissions, modules activés, licence). Aucune donnée n'est écrite.

-- ---------------------------------------------------------------------------
-- 1. Outils communs
-- ---------------------------------------------------------------------------
create type public.cockpit_ctx as (
  tz text, auj date, du date, au date, pdu date, pau date, jours integer,
  hub uuid, caisse uuid, vendeur uuid, hubs uuid[]
);

create function public.cockpit_preparer(p_etablissement_id uuid, p_du date, p_au date, p_filtres jsonb)
returns public.cockpit_ctx
language plpgsql
stable
set search_path = ''
as $$
declare
  c public.cockpit_ctx;
  f jsonb := coalesce(p_filtres, '{}'::jsonb);
begin
  if p_du is null or p_au is null or p_du > p_au then
    raise exception 'Période invalide' using errcode = '22023';
  end if;
  if p_au - p_du > 1100 then
    raise exception 'Période trop longue (3 ans au plus)' using errcode = '22023';
  end if;
  if jsonb_typeof(f) <> 'object' then
    raise exception 'Filtres invalides' using errcode = '22023';
  end if;
  c.tz := coalesce((select e.fuseau from public.etablissements e where e.id = p_etablissement_id), 'UTC');
  c.auj := (now() at time zone c.tz)::date;
  c.du := p_du;
  c.au := p_au;
  c.jours := p_au - p_du + 1;
  c.pdu := p_du - c.jours;
  c.pau := p_du - 1;
  begin
    c.hub := nullif(f ->> 'hub_id', '')::uuid;
    c.caisse := nullif(f ->> 'caisse_id', '')::uuid;
    c.vendeur := nullif(f ->> 'utilisateur_id', '')::uuid;
  exception when invalid_text_representation then
    raise exception 'Filtres invalides' using errcode = '22023';
  end;
  if c.hub is not null and not exists (
    select 1 from public.hubs h where h.id = c.hub and h.etablissement_id = p_etablissement_id
      and public.lecture_hub(p_etablissement_id, h.id)
  ) then
    raise exception 'Accès refusé à ce Hub' using errcode = '42501';
  end if;
  -- Hubs que l'utilisateur peut lire (les lignes sans Hub restent visibles).
  c.hubs := array(select h.id from public.hubs h where h.etablissement_id = p_etablissement_id and public.lecture_hub(p_etablissement_id, h.id));
  if c.caisse is not null and not exists (
    select 1 from public.points_de_vente p where p.id = c.caisse and p.etablissement_id = p_etablissement_id
  ) then
    raise exception 'Caisse inconnue' using errcode = '22023';
  end if;
  return c;
end
$$;

-- Comparaison possible : au moins 3 éléments sur la période précédente et des données
-- antérieures à son début (sinon la période précédente est incomplète).
create function public.cockpit_comparable(p_nombre bigint, p_premier date, p_debut_precedent date)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_nombre, 0) >= 3 and p_premier is not null and p_premier <= p_debut_precedent
$$;

-- Ligne rattachée à un Hub : dans le filtre demandé et parmi les Hubs autorisés.
create function public.cockpit_hub_ok(c public.cockpit_ctx, p_hub_id uuid)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select (c.hub is null or p_hub_id = c.hub) and (p_hub_id is null or p_hub_id = any(c.hubs))
$$;

create function public.cockpit_kpi(
  p_cle text, p_libelle text, p_valeur numeric, p_format text default 'nombre', p_route text default null,
  p_precedent numeric default null, p_detail text default null, p_ton text default null, p_principal boolean default false
)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'cle', p_cle, 'libelle', p_libelle, 'valeur', coalesce(p_valeur, 0), 'format', p_format, 'route', p_route,
    'precedent', p_precedent, 'detail', p_detail, 'ton', p_ton, 'principal', case when p_principal then true end
  ))
$$;

-- Alerte « À surveiller » : rien si le nombre est nul (jamais d'alerte inventée).
create function public.cockpit_alerte(p_cle text, p_niveau text, p_titre text, p_detail text, p_nombre numeric, p_route text default null)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case when coalesce(p_nombre, 0) > 0 then jsonb_strip_nulls(jsonb_build_object(
    'cle', p_cle, 'niveau', p_niveau, 'titre', p_titre, 'detail', p_detail, 'nombre', p_nombre, 'route', p_route
  )) end
$$;

-- Tableau JSON sans les éléments nuls, dans l'ordre donné.
create function public.cockpit_liste(p_elements jsonb[])
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(jsonb_agg(e order by i) filter (where e is not null and e <> 'null'::jsonb), '[]'::jsonb)
  from unnest(p_elements) with ordinality as t(e, i)
$$;

-- Nombre tiré d'une synthèse existante : valeur numérique, longueur d'une liste, 0 si absent.
create function public.cockpit_n(p_valeur jsonb)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case jsonb_typeof(p_valeur) when 'number' then (p_valeur #>> '{}')::numeric when 'array' then jsonb_array_length(p_valeur) else 0 end
$$;

create function public.cockpit_periode(c public.cockpit_ctx)
returns text
language sql
immutable
set search_path = ''
as $$
  select format('du=%s&au=%s', c.du, c.au)
$$;

-- Ventes validées ou annulées d'une période, filtrées (Hub, caisse, vendeur). Lecture directe (sans RLS,
-- pour la rapidité) : réservée aux fonctions cockpit, qui vérifient la permission avant l'appel.
create function public.cockpit_ventes(p_etablissement_id uuid, c public.cockpit_ctx, p_du date, p_au date)
returns setof public.ventes
language sql
stable
security definer
set search_path = ''
as $$
  select v.* from public.ventes v
  where v.etablissement_id = p_etablissement_id
    and (v.cree_le at time zone c.tz)::date between p_du and p_au
    and public.cockpit_hub_ok(c, v.hub_id)
    and (c.caisse is null or v.point_de_vente_id = c.caisse)
    and (c.vendeur is null or v.vendeur = c.vendeur)
$$;

create function public.cockpit_paiements(p_etablissement_id uuid, c public.cockpit_ctx, p_du date, p_au date)
returns setof public.paiements
language sql
stable
security definer
set search_path = ''
as $$
  select p.* from public.paiements p
  where p.etablissement_id = p_etablissement_id and p.statut = 'valide'
    and (p.cree_le at time zone c.tz)::date between p_du and p_au
    and public.cockpit_hub_ok(c, p.hub_id)
    and (c.caisse is null or exists (select 1 from public.sessions_caisse s where s.id = p.session_caisse_id and s.point_de_vente_id = c.caisse))
    and (c.vendeur is null or p.encaisse_par = c.vendeur)
$$;

create function public.cockpit_nom_utilisateur(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  -- Uniquement pour un membre d'un établissement que l'appelant peut piloter.
  select coalesce(nullif(p.nom_affiche, ''), nullif(p.nom_complet, ''), 'Utilisateur')
  from public.profils p
  where p.id = p_user_id
    and exists (select 1 from public.etablissement_membres em
                where em.user_id = p_user_id and public.lecture_autorisee(em.etablissement_id, 'tableau_de_bord.lire'))
$$;

-- ---------------------------------------------------------------------------
-- 2. Commerce : ventes, encaissements, retours, caisses, stock
-- ---------------------------------------------------------------------------
create function public.cockpit_commerce(p_etablissement_id uuid, p_du date, p_au date, p_filtres jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  c public.cockpit_ctx;
  per text;
  v_comp boolean;
  v_nb bigint; v_ca numeric; v_nb_p bigint; v_ca_p numeric; v_premier date;
  v_enc numeric; v_enc_p numeric;
  v_remb numeric; v_remb_p numeric; v_nb_retours bigint;
  v_annul bigint;
  v_marge numeric; v_sans_cout bigint; v_lignes bigint;
  v_credits numeric; v_nb_credits bigint; v_credits_anciens bigint;
  v_stock boolean := public.lecture_autorisee(p_etablissement_id, 'stock.lire');
  v_paie boolean := public.lecture_autorisee(p_etablissement_id, 'paiements.lire');
  v_cloture boolean := public.lecture_autorisee(p_etablissement_id, 'cloture.lire') or public.a_permission(p_etablissement_id, 'caisse.utiliser');
  v_ruptures bigint := 0; v_bas bigint := 0; v_ajust bigint := 0;
  v_caisses bigint := 0; v_caisses_vieilles bigint := 0; v_ecarts bigint := 0; v_ecart_total numeric := 0;
  v_graphs jsonb; v_listes jsonb; v_activite jsonb;
  v_vendus uuid[];
begin
  if not public.lecture_autorisee(p_etablissement_id, 'ventes.lire') then
    raise exception 'Permission refusée : ventes.lire' using errcode = '42501';
  end if;
  c := public.cockpit_preparer(p_etablissement_id, p_du, p_au, p_filtres);
  per := public.cockpit_periode(c);

  select count(*), coalesce(sum(total), 0) into v_nb, v_ca
  from public.cockpit_ventes(p_etablissement_id, c, c.du, c.au) v where v.statut = 'validee';
  select count(*), coalesce(sum(total), 0) into v_nb_p, v_ca_p
  from public.cockpit_ventes(p_etablissement_id, c, c.pdu, c.pau) v where v.statut = 'validee';
  select min((v.cree_le at time zone c.tz)::date) into v_premier
  from public.ventes v where v.etablissement_id = p_etablissement_id and public.cockpit_hub_ok(c, v.hub_id);
  v_comp := public.cockpit_comparable(v_nb_p, v_premier, c.pdu);

  select count(*) into v_annul from public.cockpit_ventes(p_etablissement_id, c, c.du, c.au) v where v.statut = 'annulee';
  select coalesce(sum(montant), 0) into v_enc from public.cockpit_paiements(p_etablissement_id, c, c.du, c.au);
  select coalesce(sum(montant), 0) into v_enc_p from public.cockpit_paiements(p_etablissement_id, c, c.pdu, c.pau);

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
  where r.etablissement_id = p_etablissement_id and (r.cree_le at time zone c.tz)::date between c.pdu and c.pau
    and public.cockpit_hub_ok(c, r.hub_id);

  select coalesce(array_agg(distinct l.article_id) filter (where l.article_id is not null), '{}')
  into v_vendus
  from public.lignes_vente l
  join public.cockpit_ventes(p_etablissement_id, c, c.du, c.au) v on v.id = l.vente_id and v.statut = 'validee';

  select coalesce(sum(l.total - l.quantite * coalesce(l.cout_unitaire, 0)), 0),
         count(*) filter (where l.cout_unitaire is null), count(*)
  into v_marge, v_sans_cout, v_lignes
  from public.lignes_vente l
  join public.cockpit_ventes(p_etablissement_id, c, c.du, c.au) v on v.id = l.vente_id and v.statut = 'validee';

  select coalesce(sum(v.total - v.montant_paye), 0), count(*),
         count(*) filter (where (v.cree_le at time zone c.tz)::date < c.auj - 30)
  into v_credits, v_nb_credits, v_credits_anciens
  from public.ventes v
  where v.etablissement_id = p_etablissement_id and v.statut = 'validee' and v.montant_paye < v.total
    and public.cockpit_hub_ok(c, v.hub_id) and (c.caisse is null or v.point_de_vente_id = c.caisse);

  if v_stock then
    with niveaux as (
      select a.id, a.stock_minimum,
             coalesce((select sum(s.quantite) from public.stock_hubs s
                       where s.article_id = a.id and public.cockpit_hub_ok(c, s.hub_id)), 0) as quantite
      from public.articles a
      where a.etablissement_id = p_etablissement_id and a.actif and a.suivi_stock
    )
    select count(*) filter (where quantite <= 0), count(*) filter (where quantite > 0 and quantite <= stock_minimum)
    into v_ruptures, v_bas from niveaux;
    select count(*) into v_ajust from public.mouvements_stock m
    where m.etablissement_id = p_etablissement_id and m.type in ('ajustement', 'inventaire') and m.quantite < 0
      and (m.cree_le at time zone c.tz)::date between c.du and c.au and public.cockpit_hub_ok(c, m.hub_id);
  end if;

  if v_cloture then
    select count(*), count(*) filter (where s.ouverte_le < now() - interval '24 hours')
    into v_caisses, v_caisses_vieilles
    from public.sessions_caisse s
    where s.etablissement_id = p_etablissement_id and s.statut = 'ouverte'
      and public.cockpit_hub_ok(c, s.hub_id) and (c.caisse is null or s.point_de_vente_id = c.caisse);
    select count(*) filter (where k.ecart <> 0), coalesce(sum(k.ecart), 0) into v_ecarts, v_ecart_total
    from public.clotures k
    where k.etablissement_id = p_etablissement_id and (k.cloturee_le at time zone c.tz)::date between c.du and c.au
      and public.cockpit_hub_ok(c, k.hub_id) and (c.caisse is null or k.point_de_vente_id = c.caisse);
  end if;

  -- Graphiques : ventes par jour (ou par mois au-delà de 62 jours) et encaissements par mode.
  v_graphs := public.cockpit_liste(array[
    case when c.jours > 1 then jsonb_build_object('cle', 'ventes_periode', 'type', 'barres', 'format', 'montant',
      'titre', case when c.jours > 62 then 'Chiffre d’affaires par mois' else 'Chiffre d’affaires par jour' end,
      'points', coalesce((
        select jsonb_agg(jsonb_build_object('libelle', libelle, 'valeur', total, 'cle', cle) order by cle)
        from (
          select case when c.jours > 62 then to_char(date_trunc('month', j), 'YYYY-MM') else to_char(j, 'YYYY-MM-DD') end as cle,
                 case when c.jours > 62 then to_char(date_trunc('month', j), 'MM/YYYY') else to_char(j, 'DD/MM') end as libelle,
                 coalesce(sum(v.total), 0) as total
          from generate_series(c.du, c.au, interval '1 day') j
          left join public.cockpit_ventes(p_etablissement_id, c, c.du, c.au) v
            on v.statut = 'validee' and (v.cree_le at time zone c.tz)::date = j::date
          group by 1, 2
        ) t), '[]'::jsonb)) end,
    (select case when v_paie and count(*) > 0 then jsonb_build_object('cle', 'encaissements_mode', 'type', 'repartition', 'format', 'montant',
      'titre', 'Encaissements par mode',
      'points', jsonb_agg(jsonb_build_object('libelle', mode, 'cle', mode, 'valeur', total) order by total desc)) end
     from (select p.mode, sum(p.montant) total from public.cockpit_paiements(p_etablissement_id, c, c.du, c.au) p group by p.mode) t)
  ]);

  v_listes := public.cockpit_liste(array[
    (select case when count(*) > 0 then jsonb_build_object('cle', 'top_articles', 'titre', 'Meilleures ventes', 'route', 'articles',
      'lignes', jsonb_agg(jsonb_build_object('libelle', libelle, 'detail', format('%s vendu(s)', trim_scale(round(quantite, 2))), 'valeur', total, 'format', 'montant') order by total desc)) end
     from (select l.libelle, sum(l.quantite) quantite, sum(l.total) total
           from public.lignes_vente l join public.cockpit_ventes(p_etablissement_id, c, c.du, c.au) v on v.id = l.vente_id and v.statut = 'validee'
           group by l.libelle order by sum(l.total) desc limit 5) t),
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
    (select case when count(*) > 1 then jsonb_build_object('cle', 'par_vendeur', 'titre', 'Par vendeur',
      'lignes', jsonb_agg(jsonb_build_object('libelle', public.cockpit_nom_utilisateur(vendeur), 'detail', format('%s vente(s)', nombre), 'valeur', total, 'format', 'montant',
                                             'route', format('ventes?%s&vendeur=%s', per, vendeur)) order by total desc)) end
     from (select v.vendeur, count(*) nombre, sum(v.total) total from public.cockpit_ventes(p_etablissement_id, c, c.du, c.au) v
           where v.statut = 'validee' and v.vendeur is not null group by v.vendeur order by 3 desc limit 8) t),
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
                                  'detail', case when k.ecart <> 0 then 'Écart de caisse' end, 'montant', k.total_ventes, 'route', 'clotures') a
        from public.clotures k
        where v_cloture and k.etablissement_id = p_etablissement_id and (k.cloturee_le at time zone c.tz)::date between c.du and c.au
          and public.cockpit_hub_ok(c, k.hub_id)
        order by k.cloturee_le desc limit 3
      ) x
    ) t(a)
  ), '[]'::jsonb);

  return jsonb_build_object(
    'domaine', 'commerce',
    'periode', jsonb_build_object('du', c.du, 'au', c.au, 'du_precedent', c.pdu, 'au_precedent', c.pau, 'comparable', v_comp),
    'kpis', public.cockpit_liste(array[
      public.cockpit_kpi('chiffre_affaires', 'Chiffre d’affaires', v_ca, 'montant', 'ventes?' || per, case when v_comp then v_ca_p end, 'Ventes validées', null, true),
      case when v_paie then public.cockpit_kpi('encaisse', 'Encaissé', v_enc, 'montant', 'ventes?' || per, case when v_comp then v_enc_p end, 'Paiements reçus sur la période', null, true) end,
      public.cockpit_kpi('tickets', 'Ventes', v_nb, 'nombre', 'ventes?' || per, case when v_comp then v_nb_p end),
      public.cockpit_kpi('panier_moyen', 'Panier moyen', case when v_nb > 0 then round(v_ca / v_nb) else 0 end, 'montant', 'ventes?' || per,
        case when v_comp and v_nb_p > 0 then round(v_ca_p / v_nb_p) end),
      public.cockpit_kpi('remboursements', 'Remboursé', v_remb, 'montant', 'ventes?vue=retours&' || per, case when v_comp then v_remb_p end,
        format('%s retour(s)', v_nb_retours), case when v_remb > 0 then 'attention' end),
      case when v_lignes > 0 then public.cockpit_kpi('marge_brute', 'Marge brute', v_marge, 'montant', 'rapports', null,
        case when v_sans_cout > 0 then format('Coût inconnu sur %s ligne(s) : marge surestimée', v_sans_cout) else 'Ventes moins coût d’achat' end,
        case when v_sans_cout > 0 then 'attention' end) end,
      public.cockpit_kpi('credits', 'Reste à encaisser', v_credits, 'montant', 'ventes?paiement=impaye', null,
        format('%s vente(s) non soldée(s)', v_nb_credits), case when v_credits_anciens > 0 then 'alerte' end),
      case when v_cloture then public.cockpit_kpi('caisses_ouvertes', 'Caisses ouvertes', v_caisses, 'nombre', 'clotures') end,
      case when v_annul > 0 then public.cockpit_kpi('annulations', 'Ventes annulées', v_annul, 'nombre', 'ventes?statut=annulee&' || per, null, null, 'attention') end
    ]),
    'attention', public.cockpit_liste(array[
      public.cockpit_alerte('ruptures', 'critique', 'Articles en rupture', 'Stock à zéro ou négatif', v_ruptures, 'stock?etat=epuise'),
      public.cockpit_alerte('stock_bas', 'alerte', 'Stock sous le minimum', 'À réapprovisionner', v_bas, 'stock?etat=bas'),
      public.cockpit_alerte('caisses_anciennes', 'alerte', 'Caisse ouverte depuis plus de 24 h', 'Pensez à la clôturer', v_caisses_vieilles, 'clotures'),
      public.cockpit_alerte('ecarts_cloture', 'alerte', 'Écarts de caisse à la clôture', format('Écart cumulé : %s', round(v_ecart_total)), v_ecarts, 'clotures'),
      public.cockpit_alerte('credits_anciens', 'alerte', 'Ventes non soldées depuis plus de 30 jours', 'Relancer les clients', v_credits_anciens, 'ventes?paiement=impaye'),
      public.cockpit_alerte('ajustements', 'info', 'Sorties de stock par ajustement ou inventaire', 'Mouvements à vérifier sur la période', v_ajust, 'stock?vue=mouvements&type=ajustement')
    ]),
    'graphiques', v_graphs,
    'listes', v_listes,
    'activite', v_activite
  );
end
$$;

-- ---------------------------------------------------------------------------
-- 3. Restaurant : salle, cuisine, réservations, ventes de la période
-- ---------------------------------------------------------------------------
create function public.cockpit_restaurant(p_etablissement_id uuid, p_du date, p_au date, p_filtres jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  c public.cockpit_ctx;
  per text;
  v_comp boolean; v_premier date;
  v_tables bigint; v_occupees bigint; v_reservees bigint;
  v_ouvertes bigint; v_cuisine bigint; v_prets bigint; v_prets_attente bigint; v_longues bigint;
  v_resa_jour bigint; v_couverts_resa bigint; v_resa_retard bigint;
  v_ca numeric; v_nb bigint; v_ca_p numeric; v_nb_p bigint; v_couverts bigint; v_couverts_p bigint;
begin
  if not public.lecture_autorisee(p_etablissement_id, 'restaurant_salle.lire') then
    raise exception 'Permission refusée : restaurant_salle.lire' using errcode = '42501';
  end if;
  c := public.cockpit_preparer(p_etablissement_id, p_du, p_au, p_filtres);
  per := public.cockpit_periode(c);

  select count(*) into v_tables from public.rest_tables t
  where t.etablissement_id = p_etablissement_id and t.actif and public.cockpit_hub_ok(c, t.hub_id);
  select count(distinct k.table_id) into v_occupees from public.rest_commandes k
  where k.etablissement_id = p_etablissement_id and k.statut = 'ouverte' and k.table_id is not null and public.cockpit_hub_ok(c, k.hub_id);
  select count(distinct r.table_id) into v_reservees from public.rest_reservations r
  where r.etablissement_id = p_etablissement_id and r.statut = 'confirmee' and r.table_id is not null
    and (r.debut at time zone c.tz)::date = c.auj and r.debut > now() - interval '30 minutes'
    and public.cockpit_hub_ok(c, r.hub_id)
    and not exists (select 1 from public.rest_commandes k where k.table_id = r.table_id and k.statut = 'ouverte');
  select count(*), count(*) filter (where k.ouverte_le < now() - interval '3 hours') into v_ouvertes, v_longues
  from public.rest_commandes k
  where k.etablissement_id = p_etablissement_id and k.statut = 'ouverte' and public.cockpit_hub_ok(c, k.hub_id);
  select count(*) filter (where l.statut in ('envoyee', 'en_preparation')),
         count(*) filter (where l.statut = 'prete'),
         count(*) filter (where l.statut = 'prete' and l.prete_le < now() - interval '10 minutes')
  into v_cuisine, v_prets, v_prets_attente
  from public.rest_lignes l join public.rest_commandes k on k.id = l.commande_id
  where l.etablissement_id = p_etablissement_id and k.statut = 'ouverte' and public.cockpit_hub_ok(c, k.hub_id);
  select count(*) filter (where r.statut in ('confirmee', 'arrivee', 'terminee')),
         coalesce(sum(r.couverts) filter (where r.statut in ('confirmee', 'arrivee')), 0),
         count(*) filter (where r.statut = 'confirmee' and r.debut < now() - interval '15 minutes')
  into v_resa_jour, v_couverts_resa, v_resa_retard
  from public.rest_reservations r
  where r.etablissement_id = p_etablissement_id and (r.debut at time zone c.tz)::date = c.auj and public.cockpit_hub_ok(c, r.hub_id);

  select count(*), coalesce(sum(v.total), 0) into v_nb, v_ca
  from public.cockpit_ventes(p_etablissement_id, c, c.du, c.au) v where v.statut = 'validee' and v.origine = 'restaurant';
  select count(*), coalesce(sum(v.total), 0) into v_nb_p, v_ca_p
  from public.cockpit_ventes(p_etablissement_id, c, c.pdu, c.pau) v where v.statut = 'validee' and v.origine = 'restaurant';
  select min((v.cree_le at time zone c.tz)::date) into v_premier from public.ventes v
  where v.etablissement_id = p_etablissement_id and v.origine = 'restaurant' and public.cockpit_hub_ok(c, v.hub_id);
  v_comp := public.cockpit_comparable(v_nb_p, v_premier, c.pdu);
  select coalesce(sum(k.couverts) filter (where (k.cloturee_le at time zone c.tz)::date between c.du and c.au), 0),
         coalesce(sum(k.couverts) filter (where (k.cloturee_le at time zone c.tz)::date between c.pdu and c.pau), 0)
  into v_couverts, v_couverts_p
  from public.rest_commandes k
  where k.etablissement_id = p_etablissement_id and k.statut = 'encaissee' and public.cockpit_hub_ok(c, k.hub_id);

  return jsonb_build_object(
    'domaine', 'restaurant',
    'periode', jsonb_build_object('du', c.du, 'au', c.au, 'du_precedent', c.pdu, 'au_precedent', c.pau, 'comparable', v_comp),
    'kpis', public.cockpit_liste(array[
      public.cockpit_kpi('chiffre_affaires', 'Ventes restaurant', v_ca, 'montant', 'ventes?origine=restaurant&' || per, case when v_comp then v_ca_p end, format('%s addition(s)', v_nb), null, true),
      public.cockpit_kpi('tables_occupees', 'Tables occupées', v_occupees, 'nombre', 'salle', null, format('sur %s table(s)', v_tables), null, true),
      public.cockpit_kpi('tables_libres', 'Tables libres', greatest(v_tables - v_occupees - v_reservees, 0), 'nombre', 'salle',
        null, case when v_reservees > 0 then format('%s réservée(s) pour bientôt', v_reservees) end),
      public.cockpit_kpi('en_cuisine', 'En cuisine', v_cuisine, 'nombre', 'cuisine', null, 'Plats envoyés ou en préparation'),
      public.cockpit_kpi('prets', 'Prêts à servir', v_prets, 'nombre', 'salle', null, null, case when v_prets_attente > 0 then 'attention' end),
      public.cockpit_kpi('reservations_jour', 'Réservations du jour', v_resa_jour, 'nombre', 'salle?vue=reservations', null, format('%s couvert(s) attendus', v_couverts_resa)),
      public.cockpit_kpi('couverts', 'Couverts servis', v_couverts, 'nombre', 'salle', case when v_comp then v_couverts_p end),
      public.cockpit_kpi('addition_moyenne', 'Addition moyenne', case when v_nb > 0 then round(v_ca / v_nb) else 0 end, 'montant', 'ventes?origine=restaurant&' || per,
        case when v_comp and v_nb_p > 0 then round(v_ca_p / v_nb_p) end)
    ]),
    'attention', public.cockpit_liste(array[
      public.cockpit_alerte('prets_attente', 'alerte', 'Plats prêts en attente depuis plus de 10 min', 'À servir maintenant', v_prets_attente, 'salle'),
      public.cockpit_alerte('reservations_retard', 'alerte', 'Réservations en retard', 'Client attendu depuis plus de 15 min', v_resa_retard, 'salle?vue=reservations'),
      public.cockpit_alerte('commandes_longues', 'info', 'Tables ouvertes depuis plus de 3 h', 'Addition oubliée ?', v_longues, 'salle')
    ]),
    'graphiques', '[]'::jsonb,
    'listes', public.cockpit_liste(array[
      (select case when count(*) > 0 then jsonb_build_object('cle', 'prochains', 'titre', 'Prochains clients', 'route', 'salle?vue=reservations',
        'lignes', jsonb_agg(jsonb_build_object('libelle', nom_client, 'detail', format('%s · %s couvert(s)%s', to_char(debut at time zone c.tz, 'HH24:MI'), couverts,
                                                                  coalesce(' · ' || tbl, ''))) order by debut)) end
       from (select r.nom_client, r.debut, r.couverts, t.nom tbl from public.rest_reservations r left join public.rest_tables t on t.id = r.table_id
             where r.etablissement_id = p_etablissement_id and r.statut = 'confirmee' and r.debut >= now() - interval '30 minutes'
               and (r.debut at time zone c.tz)::date <= c.auj + 1 and public.cockpit_hub_ok(c, r.hub_id)
             order by r.debut limit 6) t),
      (select case when count(*) > 0 then jsonb_build_object('cle', 'top_plats', 'titre', 'Plats les plus vendus',
        'lignes', jsonb_agg(jsonb_build_object('libelle', libelle, 'detail', format('%s servi(s)', trim_scale(quantite))) order by quantite desc)) end
       from (select l.libelle, sum(l.quantite) quantite from public.rest_lignes l join public.rest_commandes k on k.id = l.commande_id
             where l.etablissement_id = p_etablissement_id and l.statut <> 'annulee' and (l.cree_le at time zone c.tz)::date between c.du and c.au
               and public.cockpit_hub_ok(c, k.hub_id)
             group by l.libelle order by 2 desc limit 5) t)
    ]),
    'activite', coalesce((select jsonb_agg(a order by a ->> 'quand' desc) from (
      select jsonb_build_object('quand', k.cloturee_le, 'titre', format('Addition encaissée · %s', coalesce(t.nom, 'à emporter')), 'detail', format('%s couvert(s)', k.couverts), 'route', 'salle') a
      from public.rest_commandes k left join public.rest_tables t on t.id = k.table_id
      where k.etablissement_id = p_etablissement_id and k.statut = 'encaissee' and (k.cloturee_le at time zone c.tz)::date between c.du and c.au
        and public.cockpit_hub_ok(c, k.hub_id)
      order by k.cloturee_le desc limit 6) x), '[]'::jsonb)
  );
end
$$;

-- ---------------------------------------------------------------------------
-- 4. Hôtel : chambres, arrivées, départs, occupation, revenus, impayés
-- ---------------------------------------------------------------------------
create function public.cockpit_hotel(p_etablissement_id uuid, p_du date, p_au date, p_filtres jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  c public.cockpit_ctx;
  v_comp boolean; v_premier date;
  v_chambres bigint; v_hs bigint; v_sales bigint; v_occupees bigint; v_disponibles bigint; v_reservees bigint;
  v_arrivees bigint; v_departs bigint; v_presents bigint;
  v_nuitees bigint; v_nuitees_p bigint; v_heberg numeric; v_heberg_p numeric; v_presta numeric; v_presta_p numeric;
  v_impayes numeric; v_nb_impayes bigint; v_arrivees_retard bigint; v_departs_retard bigint; v_nb_p bigint;
begin
  if not public.lecture_autorisee(p_etablissement_id, 'hotel_reservations.lire') then
    raise exception 'Permission refusée : hotel_reservations.lire' using errcode = '42501';
  end if;
  c := public.cockpit_preparer(p_etablissement_id, p_du, p_au, p_filtres);

  select count(*), count(*) filter (where ch.menage = 'hors_service'), count(*) filter (where ch.menage in ('sale', 'en_nettoyage'))
  into v_chambres, v_hs, v_sales
  from public.hotel_chambres ch where ch.etablissement_id = p_etablissement_id and ch.actif;
  select count(distinct r.chambre_id), coalesce(sum(r.adultes + r.enfants), 0) into v_occupees, v_presents
  from public.hotel_reservations r where r.etablissement_id = p_etablissement_id and r.statut = 'en_cours';
  select count(*) into v_disponibles from public.hotel_chambres ch
  where ch.etablissement_id = p_etablissement_id and ch.actif and ch.menage = 'propre'
    and not exists (select 1 from public.hotel_reservations r where r.chambre_id = ch.id and r.statut = 'en_cours');
  select count(*) filter (where r.statut = 'confirmee' and r.arrivee = c.auj),
         count(*) filter (where r.statut = 'en_cours' and r.depart = c.auj),
         count(*) filter (where r.statut = 'confirmee' and r.arrivee < c.auj),
         count(*) filter (where r.statut = 'en_cours' and r.depart < c.auj),
         count(*) filter (where r.statut = 'confirmee' and r.arrivee <= c.auj and r.depart > c.auj)
  into v_arrivees, v_departs, v_arrivees_retard, v_departs_retard, v_reservees
  from public.hotel_reservations r where r.etablissement_id = p_etablissement_id;

  -- Nuitées réalisées (séjours en cours ou terminés) dans la période : chaque nuit du jour j au j+1.
  with nuits as (
    select r.id, r.tarif_nuit, n::date as nuit
    from public.hotel_reservations r, generate_series(r.arrivee, r.depart - 1, interval '1 day') n
    where r.etablissement_id = p_etablissement_id and r.statut in ('en_cours', 'terminee')
      and r.arrivee <= c.au and r.depart > c.pdu
  )
  select count(*) filter (where nuit between c.du and c.au), coalesce(sum(tarif_nuit) filter (where nuit between c.du and c.au), 0),
         count(*) filter (where nuit between c.pdu and c.pau), coalesce(sum(tarif_nuit) filter (where nuit between c.pdu and c.pau), 0)
  into v_nuitees, v_heberg, v_nuitees_p, v_heberg_p from nuits;
  select coalesce(sum(p.quantite * p.prix_unitaire) filter (where p.date_prestation between c.du and c.au), 0),
         coalesce(sum(p.quantite * p.prix_unitaire) filter (where p.date_prestation between c.pdu and c.pau), 0)
  into v_presta, v_presta_p
  from public.hotel_prestations p where p.etablissement_id = p_etablissement_id and p.statut = 'valide';
  select count(*) into v_nb_p from public.hotel_reservations r
  where r.etablissement_id = p_etablissement_id and r.statut in ('en_cours', 'terminee') and r.arrivee between c.pdu and c.pau;
  select min(r.arrivee) into v_premier from public.hotel_reservations r where r.etablissement_id = p_etablissement_id;
  v_comp := public.cockpit_comparable(v_nb_p, v_premier, c.pdu);

  select coalesce(sum(v.total - v.montant_paye), 0), count(*) into v_impayes, v_nb_impayes
  from public.hotel_reservations r join public.documents_vente d on d.id = r.document_vente_id
  join public.ventes v on v.id = d.vente_id
  where r.etablissement_id = p_etablissement_id and v.statut = 'validee' and v.montant_paye < v.total;

  return jsonb_build_object(
    'domaine', 'hotel',
    'periode', jsonb_build_object('du', c.du, 'au', c.au, 'du_precedent', c.pdu, 'au_precedent', c.pau, 'comparable', v_comp),
    'kpis', public.cockpit_liste(array[
      public.cockpit_kpi('occupation', 'Taux d’occupation',
        case when (v_chambres - v_hs) > 0 then round(100.0 * v_nuitees / ((v_chambres - v_hs) * c.jours)) else 0 end, 'pourcent', 'hotel',
        case when v_comp and (v_chambres - v_hs) > 0 then round(100.0 * v_nuitees_p / ((v_chambres - v_hs) * c.jours)) end,
        format('%s nuitée(s) sur la période', v_nuitees), null, true),
      public.cockpit_kpi('hebergement', 'Hébergement réalisé', v_heberg, 'montant', 'hotel', case when v_comp then v_heberg_p end,
        'Nuitées × tarif (pas encore forcément encaissé)', null, true),
      public.cockpit_kpi('occupees', 'Chambres occupées', v_occupees, 'nombre', 'chambres?etat=occupee', null, format('%s client(s) présent(s)', v_presents)),
      public.cockpit_kpi('disponibles', 'Chambres disponibles', v_disponibles, 'nombre', 'chambres?etat=libre', null, 'Propres et libres'),
      public.cockpit_kpi('reservees', 'Réservées ce soir', v_reservees, 'nombre', 'hotel?statut=confirmee'),
      public.cockpit_kpi('a_nettoyer', 'À nettoyer', v_sales, 'nombre', 'chambres?menage=sale', null, null, case when v_sales > 0 then 'attention' end),
      public.cockpit_kpi('arrivees', 'Arrivées du jour', v_arrivees, 'nombre', 'hotel?vue=arrivees'),
      public.cockpit_kpi('departs', 'Départs du jour', v_departs, 'nombre', 'hotel?vue=departs'),
      public.cockpit_kpi('prestations', 'Prestations', v_presta, 'montant', 'hotel', case when v_comp then v_presta_p end),
      public.cockpit_kpi('impayes', 'Factures séjour impayées', v_impayes, 'montant', 'factures?onglet=facture', null, format('%s facture(s)', v_nb_impayes),
        case when v_nb_impayes > 0 then 'attention' end),
      case when v_hs > 0 then public.cockpit_kpi('hors_service', 'Hors service', v_hs, 'nombre', 'chambres?menage=hors_service') end
    ]),
    'attention', public.cockpit_liste(array[
      public.cockpit_alerte('departs_retard', 'critique', 'Départs dépassés', 'Séjour terminé mais client non sorti', v_departs_retard, 'hotel?vue=departs'),
      public.cockpit_alerte('arrivees_retard', 'alerte', 'Arrivées non enregistrées', 'Date d’arrivée passée : check-in ou no-show', v_arrivees_retard, 'hotel?vue=arrivees'),
      public.cockpit_alerte('a_nettoyer', 'alerte', 'Chambres à nettoyer', case when v_arrivees > 0 then format('%s arrivée(s) aujourd’hui', v_arrivees) end, v_sales, 'chambres?menage=sale'),
      public.cockpit_alerte('hors_service', 'info', 'Chambres hors service', null, v_hs, 'chambres?menage=hors_service'),
      public.cockpit_alerte('impayes', 'alerte', 'Séjours facturés non soldés', null, v_nb_impayes, 'factures?onglet=facture')
    ]),
    'graphiques', '[]'::jsonb,
    'listes', public.cockpit_liste(array[
      (select case when count(*) > 0 then jsonb_build_object('cle', 'arrivees', 'titre', 'Prochaines arrivées', 'route', 'hotel?vue=arrivees',
        'lignes', jsonb_agg(jsonb_build_object('libelle', nom_client, 'detail', format('%s → %s · %s', to_char(arrivee, 'DD/MM'), to_char(depart, 'DD/MM'), coalesce(chambre, type_nom)),
                                               'route', 'hotel/' || id) order by arrivee)) end
       from (select r.id, r.nom_client, r.arrivee, r.depart, ch.numero chambre, t.nom type_nom
             from public.hotel_reservations r left join public.hotel_chambres ch on ch.id = r.chambre_id
             left join public.hotel_types_chambre t on t.id = r.type_id
             where r.etablissement_id = p_etablissement_id and r.statut = 'confirmee' and r.arrivee >= c.auj
             order by r.arrivee limit 6) t),
      (select case when count(*) > 0 then jsonb_build_object('cle', 'departs', 'titre', 'Départs du jour', 'route', 'hotel?vue=departs',
        'lignes', jsonb_agg(jsonb_build_object('libelle', nom_client, 'detail', 'Chambre ' || chambre, 'route', 'hotel/' || id))) end
       from (select r.id, r.nom_client, ch.numero chambre from public.hotel_reservations r join public.hotel_chambres ch on ch.id = r.chambre_id
             where r.etablissement_id = p_etablissement_id and r.statut = 'en_cours' and r.depart <= c.auj order by r.depart limit 6) t)
    ]),
    'activite', coalesce((select jsonb_agg(a order by a ->> 'quand' desc) from (
      select jsonb_build_object('quand', greatest(r.check_in_le, coalesce(r.check_out_le, r.check_in_le)),
                                'titre', case when r.check_out_le is not null then 'Départ · ' else 'Arrivée · ' end || r.nom_client,
                                'detail', 'Réservation ' || r.numero, 'route', 'hotel/' || r.id) a
      from public.hotel_reservations r
      where r.etablissement_id = p_etablissement_id and r.check_in_le is not null
        and (greatest(r.check_in_le, coalesce(r.check_out_le, r.check_in_le)) at time zone c.tz)::date between c.du and c.au
      order by greatest(r.check_in_le, coalesce(r.check_out_le, r.check_in_le)) desc limit 6) x), '[]'::jsonb)
  );
end
$$;

-- ---------------------------------------------------------------------------
-- 5. CRM : pipeline, activités, relances, conversion
-- ---------------------------------------------------------------------------
create function public.cockpit_crm(p_etablissement_id uuid, p_du date, p_au date, p_filtres jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  c public.cockpit_ctx;
  per text;
  s jsonb;
  v_comp boolean; v_premier date;
  v_gagnees bigint; v_gagne numeric; v_perdues bigint; v_gagne_p numeric; v_clos_p bigint;
  v_nouvelles bigint; v_nouvelles_p bigint; v_nouveaux_prospects bigint;
  v_retard bigint; v_prevues bigint; v_devis bigint; v_devis_montant numeric; v_cloture_depassee bigint;
begin
  if not public.lecture_autorisee(p_etablissement_id, 'crm_pipeline.lire') then
    raise exception 'Permission refusée : crm_pipeline.lire' using errcode = '42501';
  end if;
  c := public.cockpit_preparer(p_etablissement_id, p_du, p_au, p_filtres);
  per := public.cockpit_periode(c);
  s := public.tableau_de_bord_crm(p_etablissement_id);

  select count(*) filter (where o.statut = 'gagnee' and (o.cloturee_le at time zone c.tz)::date between c.du and c.au),
         coalesce(sum(o.montant) filter (where o.statut = 'gagnee' and (o.cloturee_le at time zone c.tz)::date between c.du and c.au), 0),
         count(*) filter (where o.statut = 'perdue' and (o.cloturee_le at time zone c.tz)::date between c.du and c.au),
         coalesce(sum(o.montant) filter (where o.statut = 'gagnee' and (o.cloturee_le at time zone c.tz)::date between c.pdu and c.pau), 0),
         count(*) filter (where o.statut <> 'ouverte' and (o.cloturee_le at time zone c.tz)::date between c.pdu and c.pau),
         count(*) filter (where (o.cree_le at time zone c.tz)::date between c.du and c.au),
         count(*) filter (where (o.cree_le at time zone c.tz)::date between c.pdu and c.pau),
         count(*) filter (where o.statut = 'ouverte' and o.cloture_prevue < c.auj),
         min((o.cree_le at time zone c.tz)::date)
  into v_gagnees, v_gagne, v_perdues, v_gagne_p, v_clos_p, v_nouvelles, v_nouvelles_p, v_cloture_depassee, v_premier
  from public.crm_opportunites o
  where o.etablissement_id = p_etablissement_id and (c.vendeur is null or o.responsable_id = c.vendeur);
  v_comp := public.cockpit_comparable(v_clos_p + v_nouvelles_p, v_premier, c.pdu);

  select count(*) filter (where a.echeance < now()), count(*) filter (where a.echeance >= now())
  into v_retard, v_prevues
  from public.crm_activites a
  where a.etablissement_id = p_etablissement_id and a.statut = 'a_faire' and (c.vendeur is null or a.assigne_a = c.vendeur);
  select count(*) into v_nouveaux_prospects from public.contacts k
  where k.etablissement_id = p_etablissement_id and k.type = 'prospect' and (k.cree_le at time zone c.tz)::date between c.du and c.au;
  v_devis := 0; v_devis_montant := 0;
  if public.lecture_autorisee(p_etablissement_id, 'facturation.lire') then
    select count(*), coalesce(sum(d.total_ttc), 0) into v_devis, v_devis_montant from public.documents_vente d
    where d.etablissement_id = p_etablissement_id and d.type = 'devis' and d.statut in ('envoye', 'accepte');
  end if;

  return jsonb_build_object(
    'domaine', 'crm',
    'periode', jsonb_build_object('du', c.du, 'au', c.au, 'du_precedent', c.pdu, 'au_precedent', c.pau, 'comparable', v_comp),
    'kpis', public.cockpit_liste(array[
      public.cockpit_kpi('pipeline', 'Pipeline ouvert', (s ->> 'valeur_pipeline')::numeric, 'montant', 'crm', null,
        format('%s opportunité(s) · pondéré %s', s ->> 'ouvertes', round((s ->> 'valeur_ponderee')::numeric)), null, true),
      public.cockpit_kpi('gagne', 'Gagné sur la période', v_gagne, 'montant', 'crm?vue=liste&statut=gagnee', case when v_comp then v_gagne_p end,
        format('%s affaire(s)', v_gagnees), null, true),
      public.cockpit_kpi('conversion', 'Taux de conversion', case when v_gagnees + v_perdues > 0 then round(100.0 * v_gagnees / (v_gagnees + v_perdues)) end,
        'pourcent', 'crm?vue=liste', null, case when v_gagnees + v_perdues = 0 then 'Aucune affaire clôturée sur la période' else format('%s gagnée(s), %s perdue(s)', v_gagnees, v_perdues) end),
      public.cockpit_kpi('nouvelles', 'Nouvelles opportunités', v_nouvelles, 'nombre', 'crm?vue=liste', case when v_comp then v_nouvelles_p end),
      public.cockpit_kpi('prospects', 'Prospects', (s ->> 'prospects')::numeric, 'nombre', 'crm?vue=prospects', null,
        case when v_nouveaux_prospects > 0 then format('+%s sur la période', v_nouveaux_prospects) end),
      public.cockpit_kpi('activites_prevues', 'Activités prévues', v_prevues, 'nombre', 'crm?vue=activites', null, format('dont %s aujourd’hui', s ->> 'activites_jour')),
      public.cockpit_kpi('activites_retard', 'Activités en retard', v_retard, 'nombre', 'crm?vue=activites&filtre=retard', null, null, case when v_retard > 0 then 'alerte' end),
      case when public.lecture_autorisee(p_etablissement_id, 'facturation.lire') then
        public.cockpit_kpi('devis', 'Devis en attente', v_devis, 'nombre', 'factures?onglet=devis&etat=Envoyé', null, case when v_devis > 0 then format('%s', round(v_devis_montant)) end) end
    ]),
    'attention', public.cockpit_liste(array[
      public.cockpit_alerte('activites_retard', 'alerte', 'Relances en retard', 'Activités prévues non faites', v_retard, 'crm?vue=activites&filtre=retard'),
      public.cockpit_alerte('sans_activite', 'alerte', 'Opportunités sans activité récente', 'Aucune action depuis plusieurs jours', (s ->> 'sans_activite')::numeric, 'crm?vue=liste&filtre=sans_activite'),
      public.cockpit_alerte('cloture_depassee', 'info', 'Date de clôture prévue dépassée', 'Mettre à jour ou clôturer', v_cloture_depassee, 'crm?vue=liste&filtre=cloture_depassee')
    ]),
    'graphiques', public.cockpit_liste(array[
      case when jsonb_array_length(s -> 'par_etape') > 0 then jsonb_build_object('cle', 'par_etape', 'type', 'repartition', 'format', 'montant', 'titre', 'Pipeline par étape',
        'points', (select jsonb_agg(jsonb_build_object('libelle', format('%s (%s)', e ->> 'nom', e ->> 'nombre'), 'valeur', (e ->> 'montant')::numeric, 'route', 'crm')) from jsonb_array_elements(s -> 'par_etape') e)) end
    ]),
    'listes', public.cockpit_liste(array[
      (select case when count(*) > 0 then jsonb_build_object('cle', 'a_relancer', 'titre', 'À relancer', 'route', 'crm?vue=activites',
        'lignes', jsonb_agg(jsonb_build_object('libelle', sujet, 'detail', format('%s · %s', contact, to_char(echeance at time zone c.tz, 'DD/MM HH24:MI')),
                                               'route', case when opportunite_id is not null then 'crm/' || opportunite_id end) order by echeance)) end
       from (select a.sujet, a.echeance, a.opportunite_id, coalesce(k.nom, '—') contact from public.crm_activites a left join public.contacts k on k.id = a.contact_id
             where a.etablissement_id = p_etablissement_id and a.statut = 'a_faire' and (c.vendeur is null or a.assigne_a = c.vendeur)
             order by a.echeance nulls last limit 6) t),
      (select case when count(*) > 0 then jsonb_build_object('cle', 'grosses', 'titre', 'Plus grosses affaires ouvertes', 'route', 'crm',
        'lignes', jsonb_agg(jsonb_build_object('libelle', titre, 'detail', format('%s · %s %%', etape, probabilite), 'valeur', montant, 'format', 'montant', 'route', 'crm/' || id) order by montant desc)) end
       from (select o.id, o.titre, o.montant, o.probabilite, e.nom etape from public.crm_opportunites o join public.crm_etapes e on e.id = o.etape_id
             where o.etablissement_id = p_etablissement_id and o.statut = 'ouverte' and (c.vendeur is null or o.responsable_id = c.vendeur)
             order by o.montant desc limit 5) t)
    ]),
    'activite', coalesce((select jsonb_agg(a order by a ->> 'quand' desc) from (
      select jsonb_build_object('quand', o.cloturee_le, 'titre', case when o.statut = 'gagnee' then 'Affaire gagnée · ' else 'Affaire perdue · ' end || o.titre,
                                'montant', o.montant, 'route', 'crm/' || o.id) a
      from public.crm_opportunites o
      where o.etablissement_id = p_etablissement_id and o.statut <> 'ouverte' and (o.cloturee_le at time zone c.tz)::date between c.du and c.au
      order by o.cloturee_le desc limit 6) x), '[]'::jsonb)
  );
end
$$;

-- ---------------------------------------------------------------------------
-- 6. RH : effectif, présences du jour, congés, contrats (aucune paie)
-- ---------------------------------------------------------------------------
create function public.cockpit_rh(p_etablissement_id uuid, p_du date, p_au date, p_filtres jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  c public.cockpit_ctx;
  s jsonb;
  v_entrees bigint; v_sorties bigint; v_conges_cours bigint; v_retards_periode bigint;
begin
  if not public.lecture_autorisee(p_etablissement_id, 'rh_employes.lire') then
    raise exception 'Permission refusée : rh_employes.lire' using errcode = '42501';
  end if;
  c := public.cockpit_preparer(p_etablissement_id, p_du, p_au, p_filtres);
  s := public.tableau_de_bord_rh(p_etablissement_id);
  select count(*) filter (where e.date_entree between c.du and c.au), count(*) filter (where e.date_sortie between c.du and c.au)
  into v_entrees, v_sorties
  from public.rh_employes e where e.etablissement_id = p_etablissement_id and public.cockpit_hub_ok(c, e.hub_id);
  v_conges_cours := 0; v_retards_periode := 0;
  if public.lecture_autorisee(p_etablissement_id, 'rh_conges.lire') then
    select count(*) into v_conges_cours from public.rh_absences a
    where a.etablissement_id = p_etablissement_id and a.statut = 'approuvee' and c.auj between a.debut and a.fin;
  end if;
  if public.lecture_autorisee(p_etablissement_id, 'rh_presences.lire') then
    select count(*) into v_retards_periode from public.rh_pointages p
    where p.etablissement_id = p_etablissement_id and p.jour between c.du and c.au and p.retard_minutes > 0 and public.cockpit_hub_ok(c, p.hub_id);
  end if;
  return jsonb_build_object(
    'domaine', 'rh',
    'periode', jsonb_build_object('du', c.du, 'au', c.au, 'comparable', false),
    'kpis', public.cockpit_liste(array[
      public.cockpit_kpi('effectif', 'Effectif', public.cockpit_n(s -> 'effectif'), 'nombre', 'employes?statut=actif', null,
        case when public.cockpit_n(s -> 'suspendus') > 0 then format('%s suspendu(s)', s ->> 'suspendus') end, null, true),
      case when s -> 'presences' is not null and s -> 'presences' <> 'null'::jsonb then
        public.cockpit_kpi('presents', 'Présents aujourd’hui', public.cockpit_n(s #> '{presences,presents}'), 'nombre', 'presences', null,
          format('sur %s attendu(s)', s #>> '{presences,attendus}'), null, true) end,
      case when s -> 'presences' is not null and s -> 'presences' <> 'null'::jsonb then
        public.cockpit_kpi('absents', 'Absents aujourd’hui', public.cockpit_n(s #> '{presences,absents}'), 'nombre', 'presences?etat=absence') end,
      case when s -> 'presences' is not null and s -> 'presences' <> 'null'::jsonb then
        public.cockpit_kpi('retards', 'Retards aujourd’hui', public.cockpit_n(s #> '{presences,retards}'), 'nombre', 'presences?etat=retard', null,
          format('%s sur la période', v_retards_periode), case when public.cockpit_n(s #> '{presences,retards}') > 0 then 'attention' end) end,
      case when public.lecture_autorisee(p_etablissement_id, 'rh_conges.lire') then
        public.cockpit_kpi('conges', 'En congé aujourd’hui', v_conges_cours, 'nombre', 'conges?statut=approuvee') end,
      case when jsonb_typeof(s -> 'demandes_en_attente') = 'number' then
        public.cockpit_kpi('demandes', 'Demandes à valider', public.cockpit_n(s -> 'demandes_en_attente'), 'nombre', 'conges?statut=demandee', null, null,
          case when public.cockpit_n(s -> 'demandes_en_attente') > 0 then 'attention' end) end,
      public.cockpit_kpi('entrees', 'Entrées', v_entrees, 'nombre', 'employes', null, format('%s départ(s) sur la période', v_sorties)),
      case when jsonb_typeof(s -> 'contrats_a_echeance') = 'array' then
        public.cockpit_kpi('contrats', 'Contrats à échéance', public.cockpit_n(s -> 'contrats_a_echeance'), 'nombre', 'employes?vue=contrats&filtre=fin_30j', null, 'Dans les 30 jours') end
    ]),
    'attention', public.cockpit_liste(array[
      public.cockpit_alerte('demandes', 'alerte', 'Demandes de congé à valider', null, public.cockpit_n(s -> 'demandes_en_attente'), 'conges?statut=demandee'),
      public.cockpit_alerte('contrats', 'alerte', 'Contrats arrivant à échéance', 'Dans les 30 jours', public.cockpit_n(s -> 'contrats_a_echeance'), 'employes?vue=contrats&filtre=fin_30j'),
      public.cockpit_alerte('sans_contrat', 'info', 'Employés actifs sans contrat', null, public.cockpit_n(s -> 'sans_contrat'), 'employes?filtre=sans_contrat'),
      public.cockpit_alerte('retards_jour', 'info', 'Retards aujourd’hui', null, public.cockpit_n(s #> '{presences,retards}'), 'presences?etat=retard')
    ]),
    'graphiques', public.cockpit_liste(array[
      case when jsonb_typeof(s -> 'par_departement') = 'array' and jsonb_array_length(s -> 'par_departement') > 1 then
        jsonb_build_object('cle', 'par_departement', 'type', 'repartition', 'format', 'nombre', 'titre', 'Effectif par département',
          'points', (select jsonb_agg(jsonb_build_object('libelle', d ->> 'departement', 'valeur', (d ->> 'nombre')::numeric, 'route', 'employes'))
                     from jsonb_array_elements(s -> 'par_departement') d)) end
    ]),
    'listes', public.cockpit_liste(array[
      case when public.cockpit_n(s -> 'contrats_a_echeance') > 0 then jsonb_build_object('cle', 'contrats', 'titre', 'Contrats à échéance', 'route', 'employes?vue=contrats&filtre=fin_30j',
        'lignes', (select jsonb_agg(jsonb_build_object('libelle', x ->> 'nom', 'detail', format('%s %s · fin le %s', upper(x ->> 'type'), x ->> 'numero',
                                                       to_char(coalesce((x ->> 'fin')::date, (x ->> 'fin_periode_essai')::date), 'DD/MM/YYYY'))))
                   from jsonb_array_elements(s -> 'contrats_a_echeance') x)) end,
      case when public.lecture_autorisee(p_etablissement_id, 'rh_conges.lire') then
      (select case when count(*) > 0 then jsonb_build_object('cle', 'absents', 'titre', 'Absences à venir', 'route', 'conges',
        'lignes', jsonb_agg(jsonb_build_object('libelle', nom, 'detail', format('%s → %s', to_char(debut, 'DD/MM'), to_char(fin, 'DD/MM'))) order by debut)) end
       from (select e.prenom || ' ' || e.nom nom, a.debut, a.fin from public.rh_absences a join public.rh_employes e on e.id = a.employe_id
             where a.etablissement_id = p_etablissement_id and a.statut = 'approuvee' and a.fin >= c.auj and a.debut <= c.auj + 14
             order by a.debut limit 6) t) end
    ]),
    'activite', '[]'::jsonb
  );
end
$$;

-- ---------------------------------------------------------------------------
-- 7. Facturation : facturé ≠ encaissé, échéances, retards, devis, avoirs
-- ---------------------------------------------------------------------------
create function public.cockpit_facturation(p_etablissement_id uuid, p_du date, p_au date, p_filtres jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  c public.cockpit_ctx;
  per text;
  v_comp boolean; v_premier date;
  v_facture numeric; v_nb_factures bigint; v_facture_p numeric; v_nb_p bigint;
  v_encaisse numeric; v_encaisse_p numeric;
  v_reste numeric; v_ouvertes bigint; v_retard numeric; v_nb_retard bigint; v_proches bigint; v_proches_montant numeric;
  v_partielles bigint; v_impayees bigint;
  v_avoirs numeric; v_nb_avoirs bigint;
  v_devis_attente bigint; v_devis_attente_montant numeric; v_devis_brouillons bigint; v_devis_expires bigint; v_devis_acceptes bigint;
  v_brouillons bigint;
begin
  if not public.lecture_autorisee(p_etablissement_id, 'facturation.lire') then
    raise exception 'Permission refusée : facturation.lire' using errcode = '42501';
  end if;
  c := public.cockpit_preparer(p_etablissement_id, p_du, p_au, p_filtres);
  per := public.cockpit_periode(c);

  select coalesce(sum(d.total_ttc) filter (where d.date_document between c.du and c.au), 0),
         count(*) filter (where d.date_document between c.du and c.au),
         coalesce(sum(d.total_ttc) filter (where d.date_document between c.pdu and c.pau), 0),
         count(*) filter (where d.date_document between c.pdu and c.pau),
         min(d.date_document)
  into v_facture, v_nb_factures, v_facture_p, v_nb_p, v_premier
  from public.documents_vente d
  where d.etablissement_id = p_etablissement_id and d.type = 'facture' and d.statut = 'emise' and public.cockpit_hub_ok(c, d.hub_id);
  v_comp := public.cockpit_comparable(v_nb_p, v_premier, c.pdu);

  select coalesce(sum(p.montant) filter (where (p.cree_le at time zone c.tz)::date between c.du and c.au), 0),
         coalesce(sum(p.montant) filter (where (p.cree_le at time zone c.tz)::date between c.pdu and c.pau), 0)
  into v_encaisse, v_encaisse_p
  from public.paiements p join public.documents_vente d on d.vente_id = p.vente_id and d.type = 'facture'
  where p.etablissement_id = p_etablissement_id and p.statut = 'valide' and public.cockpit_hub_ok(c, d.hub_id);

  select coalesce(sum(v.total - v.montant_paye), 0), count(*),
         coalesce(sum(v.total - v.montant_paye) filter (where d.echeance < c.auj), 0), count(*) filter (where d.echeance < c.auj),
         count(*) filter (where d.echeance between c.auj and c.auj + 7), coalesce(sum(v.total - v.montant_paye) filter (where d.echeance between c.auj and c.auj + 7), 0),
         count(*) filter (where v.statut_paiement = 'partielle'), count(*) filter (where v.statut_paiement = 'impayee')
  into v_reste, v_ouvertes, v_retard, v_nb_retard, v_proches, v_proches_montant, v_partielles, v_impayees
  from public.documents_vente d join public.ventes v on v.id = d.vente_id
  where d.etablissement_id = p_etablissement_id and d.type = 'facture' and d.statut = 'emise' and v.statut = 'validee' and v.montant_paye < v.total
    and public.cockpit_hub_ok(c, d.hub_id);

  select coalesce(sum(d.total_ttc), 0), count(*) into v_avoirs, v_nb_avoirs from public.documents_vente d
  where d.etablissement_id = p_etablissement_id and d.type = 'avoir' and d.date_document between c.du and c.au and public.cockpit_hub_ok(c, d.hub_id);
  select count(*) filter (where d.statut = 'envoye' and (d.echeance is null or d.echeance >= c.auj)),
         coalesce(sum(d.total_ttc) filter (where d.statut = 'envoye' and (d.echeance is null or d.echeance >= c.auj)), 0),
         count(*) filter (where d.statut = 'brouillon'),
         count(*) filter (where d.statut in ('envoye', 'brouillon') and d.echeance < c.auj),
         count(*) filter (where d.statut = 'accepte')
  into v_devis_attente, v_devis_attente_montant, v_devis_brouillons, v_devis_expires, v_devis_acceptes
  from public.documents_vente d where d.etablissement_id = p_etablissement_id and d.type = 'devis' and public.cockpit_hub_ok(c, d.hub_id);
  select count(*) into v_brouillons from public.documents_vente d
  where d.etablissement_id = p_etablissement_id and d.type = 'facture' and d.statut = 'brouillon' and public.cockpit_hub_ok(c, d.hub_id);

  return jsonb_build_object(
    'domaine', 'facturation',
    'periode', jsonb_build_object('du', c.du, 'au', c.au, 'du_precedent', c.pdu, 'au_precedent', c.pau, 'comparable', v_comp),
    'kpis', public.cockpit_liste(array[
      public.cockpit_kpi('facture', 'Facturé', v_facture, 'montant', 'factures?' || per, case when v_comp then v_facture_p end, format('%s facture(s) émise(s)', v_nb_factures), null, true),
      public.cockpit_kpi('encaisse', 'Encaissé sur factures', v_encaisse, 'montant', 'factures?etat=Payée', case when v_comp then v_encaisse_p end, 'Paiements reçus sur la période', null, true),
      public.cockpit_kpi('reste', 'Reste à encaisser', v_reste, 'montant', 'factures?onglet=facture', null, format('%s facture(s) ouverte(s)', v_ouvertes), null, true),
      public.cockpit_kpi('retard', 'En retard', v_retard, 'montant', 'factures?etat=En retard', null, format('%s facture(s)', v_nb_retard), case when v_nb_retard > 0 then 'alerte' end),
      public.cockpit_kpi('echeances', 'Échéances sous 7 jours', v_proches_montant, 'montant', 'factures?onglet=facture', null, format('%s facture(s)', v_proches)),
      public.cockpit_kpi('partielles', 'Partiellement payées', v_partielles, 'nombre', 'factures?etat=Partiellement payée'),
      public.cockpit_kpi('devis_attente', 'Devis en attente', v_devis_attente, 'nombre', 'factures?onglet=devis&etat=Envoyé', null,
        case when v_devis_attente > 0 then format('Montant : %s', round(v_devis_attente_montant)) end),
      public.cockpit_kpi('avoirs', 'Avoirs émis', v_avoirs, 'montant', 'factures?onglet=avoir', null, format('%s avoir(s) sur la période', v_nb_avoirs))
    ]),
    'attention', public.cockpit_liste(array[
      public.cockpit_alerte('retard', 'critique', 'Factures en retard de paiement', format('Total dû : %s', round(v_retard)), v_nb_retard, 'factures?etat=En retard'),
      public.cockpit_alerte('echeances', 'info', 'Factures arrivant à échéance sous 7 jours', null, v_proches, 'factures?onglet=facture'),
      public.cockpit_alerte('devis_acceptes', 'alerte', 'Devis acceptés à facturer', 'Convertir en facture', v_devis_acceptes, 'factures?onglet=devis&etat=Accepté'),
      public.cockpit_alerte('devis_expires', 'info', 'Devis expirés sans réponse', 'Relancer ou classer', v_devis_expires, 'factures?onglet=devis&etat=Expiré'),
      public.cockpit_alerte('brouillons', 'info', 'Factures en brouillon', 'Non émises', v_brouillons, 'factures?etat=Brouillon')
    ]),
    'graphiques', public.cockpit_liste(array[
      case when c.jours > 6 and (v_facture > 0 or v_encaisse > 0) then jsonb_build_object('cle', 'facture_encaisse', 'type', 'repartition', 'format', 'montant',
        'titre', 'Facturé, encaissé, reste dû', 'points', jsonb_build_array(
          jsonb_build_object('libelle', 'Facturé sur la période', 'valeur', v_facture),
          jsonb_build_object('libelle', 'Encaissé sur la période', 'valeur', v_encaisse),
          jsonb_build_object('libelle', 'Reste à encaisser (toutes périodes)', 'valeur', v_reste))) end
    ]),
    'listes', public.cockpit_liste(array[
      (select case when count(*) > 0 then jsonb_build_object('cle', 'retards', 'titre', 'Retards de paiement', 'route', 'factures?etat=En retard',
        'lignes', jsonb_agg(jsonb_build_object('libelle', numero, 'detail', format('%s · échue le %s', client, to_char(echeance, 'DD/MM/YYYY')),
                                               'valeur', reste, 'format', 'montant', 'route', 'factures/' || id) order by echeance)) end
       from (select d.id, d.numero, d.echeance, coalesce(k.societe, k.nom, '—') client, v.total - v.montant_paye reste
             from public.documents_vente d join public.ventes v on v.id = d.vente_id left join public.contacts k on k.id = d.contact_id
             where d.etablissement_id = p_etablissement_id and d.type = 'facture' and d.statut = 'emise' and v.statut = 'validee'
               and v.montant_paye < v.total and d.echeance < c.auj and public.cockpit_hub_ok(c, d.hub_id)
             order by d.echeance limit 6) t)
    ]),
    'activite', coalesce((select jsonb_agg(a order by a ->> 'quand' desc) from (
      select jsonb_build_object('quand', coalesce(d.emis_le, d.cree_le), 'titre', format('%s %s', case d.type when 'facture' then 'Facture' when 'devis' then 'Devis' else 'Avoir' end, coalesce(d.numero, '(brouillon)')),
                                'montant', d.total_ttc, 'route', 'factures/' || d.id) a
      from public.documents_vente d
      where d.etablissement_id = p_etablissement_id and (coalesce(d.emis_le, d.cree_le) at time zone c.tz)::date between c.du and c.au and public.cockpit_hub_ok(c, d.hub_id)
      order by coalesce(d.emis_le, d.cree_le) desc limit 6) x), '[]'::jsonb)
  );
end
$$;

-- ---------------------------------------------------------------------------
-- 8. Achats : demandes, commandes, réceptions, fournisseurs, dû
-- ---------------------------------------------------------------------------
create function public.cockpit_achats(p_etablissement_id uuid, p_du date, p_au date, p_filtres jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  c public.cockpit_ctx;
  s jsonb;
  v_comp boolean; v_premier date;
  v_recu numeric; v_recu_p numeric; v_nb_recep bigint; v_nb_recep_p bigint;
  v_paye numeric; v_paye_p numeric;
  v_partielles bigint; v_attendus numeric; v_fournisseurs bigint; v_commandes bigint; v_brouillons bigint;
begin
  if not public.lecture_autorisee(p_etablissement_id, 'achats.lire') then
    raise exception 'Permission refusée : achats.lire' using errcode = '42501';
  end if;
  c := public.cockpit_preparer(p_etablissement_id, p_du, p_au, p_filtres);
  s := public.tableau_de_bord_achats(p_etablissement_id);

  select coalesce(sum(r.montant) filter (where (r.recue_le at time zone c.tz)::date between c.du and c.au), 0),
         count(*) filter (where (r.recue_le at time zone c.tz)::date between c.du and c.au),
         coalesce(sum(r.montant) filter (where (r.recue_le at time zone c.tz)::date between c.pdu and c.pau), 0),
         count(*) filter (where (r.recue_le at time zone c.tz)::date between c.pdu and c.pau),
         min((r.recue_le at time zone c.tz)::date)
  into v_recu, v_nb_recep, v_recu_p, v_nb_recep_p, v_premier
  from public.receptions_achat r where r.etablissement_id = p_etablissement_id and public.cockpit_hub_ok(c, r.hub_id);
  v_comp := public.cockpit_comparable(v_nb_recep_p, v_premier, c.pdu);
  select coalesce(sum(p.montant) filter (where p.date_paiement between c.du and c.au), 0),
         coalesce(sum(p.montant) filter (where p.date_paiement between c.pdu and c.pau), 0)
  into v_paye, v_paye_p
  from public.paiements_fournisseur p where p.etablissement_id = p_etablissement_id and p.statut = 'valide';
  select count(*) filter (where k.statut = 'partielle'),
         coalesce((select sum(l.quantite - l.quantite_recue) from public.lignes_commande_achat l join public.commandes_achat k2 on k2.id = l.commande_id
                   where k2.etablissement_id = p_etablissement_id and k2.statut in ('envoyee', 'partielle') and public.cockpit_hub_ok(c, k2.hub_id)), 0),
         count(distinct k.fournisseur_id) filter (where k.date_commande between c.du and c.au and k.statut <> 'annulee'),
         count(*) filter (where k.date_commande between c.du and c.au and k.statut not in ('annulee', 'demande')),
         count(*) filter (where k.statut = 'brouillon')
  into v_partielles, v_attendus, v_fournisseurs, v_commandes, v_brouillons
  from public.commandes_achat k where k.etablissement_id = p_etablissement_id and public.cockpit_hub_ok(c, k.hub_id);

  return jsonb_build_object(
    'domaine', 'achats',
    'periode', jsonb_build_object('du', c.du, 'au', c.au, 'du_precedent', c.pdu, 'au_precedent', c.pau, 'comparable', v_comp),
    'kpis', public.cockpit_liste(array[
      public.cockpit_kpi('recu', 'Achats reçus', v_recu, 'montant', 'achats', case when v_comp then v_recu_p end, format('%s réception(s)', v_nb_recep), null, true),
      public.cockpit_kpi('du', 'Dû aux fournisseurs', (s ->> 'du_fournisseurs')::numeric, 'montant', 'achats?vue=paiements', null,
        case when (s ->> 'du_en_retard')::numeric > 0 then format('dont %s en retard', round((s ->> 'du_en_retard')::numeric)) end,
        case when (s ->> 'du_en_retard')::numeric > 0 then 'alerte' end, true),
      public.cockpit_kpi('paye', 'Payé aux fournisseurs', v_paye, 'montant', 'achats?onglet=toutes', case when v_comp then v_paye_p end),
      public.cockpit_kpi('a_recevoir', 'Commandes à recevoir', (s ->> 'a_recevoir')::numeric, 'nombre', 'achats?onglet=en_cours', null,
        format('%s article(s) attendu(s)', trim_scale(round(v_attendus, 2)))),
      public.cockpit_kpi('partielles', 'Réceptions partielles', v_partielles, 'nombre', 'achats?etat=Reçue en partie'),
      public.cockpit_kpi('demandes', 'Demandes à traiter', (s ->> 'demandes')::numeric, 'nombre', 'achats?etat=Demande'),
      public.cockpit_kpi('commandes', 'Commandes passées', v_commandes, 'nombre', 'achats', null, format('%s fournisseur(s)', v_fournisseurs))
    ]),
    'attention', public.cockpit_liste(array[
      public.cockpit_alerte('du_retard', 'critique', 'Factures fournisseurs échues', format('Montant : %s', round((s ->> 'du_en_retard')::numeric)),
        case when (s ->> 'du_en_retard')::numeric > 0 then 1 else 0 end, 'achats?vue=paiements'),
      public.cockpit_alerte('livraison_retard', 'alerte', 'Livraisons en retard', 'Date prévue dépassée', (s ->> 'en_retard_livraison')::numeric, 'achats?etat=Livraison en retard'),
      public.cockpit_alerte('demandes', 'alerte', 'Demandes d’achat à approuver', null, (s ->> 'demandes')::numeric, 'achats?etat=Demande'),
      public.cockpit_alerte('sous_minimum', 'info', 'Articles sous le minimum à commander', null, (s ->> 'sous_minimum')::numeric, 'stock?etat=bas'),
      public.cockpit_alerte('brouillons', 'info', 'Commandes en brouillon non envoyées', null, v_brouillons, 'achats?etat=Brouillon')
    ]),
    'graphiques', '[]'::jsonb,
    'listes', public.cockpit_liste(array[
      (select case when count(*) > 0 then jsonb_build_object('cle', 'fournisseurs', 'titre', 'Principaux fournisseurs', 'route', 'achats',
        'lignes', jsonb_agg(jsonb_build_object('libelle', nom, 'detail', format('%s commande(s)', n), 'valeur', total, 'format', 'montant') order by total desc)) end
       from (select k.nom, count(*) n, sum(a.total) total from public.commandes_achat a join public.contacts k on k.id = a.fournisseur_id
             where a.etablissement_id = p_etablissement_id and a.statut not in ('annulee', 'demande', 'brouillon') and a.date_commande between c.du and c.au
               and public.cockpit_hub_ok(c, a.hub_id)
             group by k.id, k.nom order by 3 desc limit 5) t),
      (select case when count(*) > 0 then jsonb_build_object('cle', 'attendues', 'titre', 'Livraisons attendues', 'route', 'achats?onglet=en_cours',
        'lignes', jsonb_agg(jsonb_build_object('libelle', numero, 'detail', format('%s · prévue le %s', fournisseur, coalesce(to_char(livraison_prevue, 'DD/MM'), '—')),
                                               'valeur', total, 'format', 'montant', 'route', 'achats/' || id) order by livraison_prevue nulls last)) end
       from (select a.id, a.numero, a.livraison_prevue, a.total, coalesce(k.nom, '—') fournisseur from public.commandes_achat a left join public.contacts k on k.id = a.fournisseur_id
             where a.etablissement_id = p_etablissement_id and a.statut in ('envoyee', 'partielle') and public.cockpit_hub_ok(c, a.hub_id)
             order by a.livraison_prevue nulls last limit 6) t)
    ]),
    'activite', coalesce((select jsonb_agg(a order by a ->> 'quand' desc) from (
      select jsonb_build_object('quand', r.recue_le, 'titre', 'Réception ' || r.numero, 'montant', r.montant, 'route', 'achats/' || r.commande_id) a
      from public.receptions_achat r
      where r.etablissement_id = p_etablissement_id and (r.recue_le at time zone c.tz)::date between c.du and c.au and public.cockpit_hub_ok(c, r.hub_id)
      order by r.recue_le desc limit 6) x), '[]'::jsonb)
  );
end
$$;

-- ---------------------------------------------------------------------------
-- 9. E-commerce : commandes, préparation, livraisons, retours, coupons
-- ---------------------------------------------------------------------------
create function public.cockpit_boutique(p_etablissement_id uuid, p_du date, p_au date, p_filtres jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  c public.cockpit_ctx;
  v_comp boolean; v_premier date;
  v_nb bigint; v_nb_p bigint; v_ca numeric; v_ca_p numeric; v_valides bigint; v_valides_p bigint;
  v_nouvelles bigint; v_prep bigint; v_exp bigint; v_livrees bigint; v_annulees bigint; v_retours bigint; v_clients bigint;
  v_coupons bigint; v_vieilles bigint; v_stock_bas bigint := 0;
begin
  if not public.lecture_autorisee(p_etablissement_id, 'ecommerce_boutique.lire') then
    raise exception 'Permission refusée : ecommerce_boutique.lire' using errcode = '42501';
  end if;
  c := public.cockpit_preparer(p_etablissement_id, p_du, p_au, p_filtres);

  select count(*) filter (where (k.cree_le at time zone c.tz)::date between c.du and c.au),
         count(*) filter (where (k.cree_le at time zone c.tz)::date between c.pdu and c.pau),
         coalesce(sum(k.total) filter (where (k.cree_le at time zone c.tz)::date between c.du and c.au and k.vente_id is not null and k.statut not in ('annulee', 'retournee')), 0),
         coalesce(sum(k.total) filter (where (k.cree_le at time zone c.tz)::date between c.pdu and c.pau and k.vente_id is not null and k.statut not in ('annulee', 'retournee')), 0),
         count(*) filter (where (k.cree_le at time zone c.tz)::date between c.du and c.au and k.vente_id is not null and k.statut not in ('annulee', 'retournee')),
         count(*) filter (where (k.cree_le at time zone c.tz)::date between c.pdu and c.pau and k.vente_id is not null and k.statut not in ('annulee', 'retournee')),
         count(*) filter (where k.statut = 'nouvelle'),
         count(*) filter (where k.statut in ('confirmee', 'preparee')),
         count(*) filter (where k.statut = 'expediee'),
         count(*) filter (where k.statut = 'livree' and (k.livree_le at time zone c.tz)::date between c.du and c.au),
         count(*) filter (where k.statut = 'annulee' and (k.modifie_le at time zone c.tz)::date between c.du and c.au),
         count(*) filter (where k.statut = 'retournee' and (k.modifie_le at time zone c.tz)::date between c.du and c.au),
         count(distinct coalesce(k.contact_id::text, k.telephone)) filter (where (k.cree_le at time zone c.tz)::date between c.du and c.au),
         count(*) filter (where k.coupon_id is not null and (k.cree_le at time zone c.tz)::date between c.du and c.au),
         count(*) filter (where k.statut = 'nouvelle' and k.cree_le < now() - interval '24 hours'),
         min((k.cree_le at time zone c.tz)::date)
  into v_nb, v_nb_p, v_ca, v_ca_p, v_valides, v_valides_p, v_nouvelles, v_prep, v_exp, v_livrees, v_annulees, v_retours, v_clients, v_coupons, v_vieilles, v_premier
  from public.boutique_commandes k where k.etablissement_id = p_etablissement_id and public.cockpit_hub_ok(c, k.hub_id);
  v_comp := public.cockpit_comparable(v_nb_p, v_premier, c.pdu);
  if public.lecture_autorisee(p_etablissement_id, 'stock.lire') then
    select count(*) into v_stock_bas from public.boutique_articles b join public.articles a on a.id = b.article_id
    where b.etablissement_id = p_etablissement_id and b.publie and a.actif and a.suivi_stock
      and coalesce((select sum(s.quantite) from public.stock_hubs s where s.article_id = a.id), 0) <= a.stock_minimum;
  end if;

  return jsonb_build_object(
    'domaine', 'boutique',
    'periode', jsonb_build_object('du', c.du, 'au', c.au, 'du_precedent', c.pdu, 'au_precedent', c.pau, 'comparable', v_comp),
    'kpis', public.cockpit_liste(array[
      public.cockpit_kpi('chiffre_affaires', 'Ventes en ligne', v_ca, 'montant', 'boutique', case when v_comp then v_ca_p end, format('%s commande(s) confirmée(s)', v_valides), null, true),
      public.cockpit_kpi('commandes', 'Commandes reçues', v_nb, 'nombre', 'boutique', case when v_comp then v_nb_p end, null, null, true),
      public.cockpit_kpi('nouvelles', 'Nouvelles à confirmer', v_nouvelles, 'nombre', 'boutique?statut=nouvelle', null, null, case when v_nouvelles > 0 then 'attention' end),
      public.cockpit_kpi('preparation', 'En préparation', v_prep, 'nombre', 'boutique?statut=confirmee'),
      public.cockpit_kpi('expediees', 'Expédiées', v_exp, 'nombre', 'boutique?statut=expediee', null, format('%s livrée(s) sur la période', v_livrees)),
      public.cockpit_kpi('panier', 'Panier moyen', case when v_valides > 0 then round(v_ca / v_valides) else 0 end, 'montant', 'boutique',
        case when v_comp and v_valides_p > 0 then round(v_ca_p / v_valides_p) end),
      public.cockpit_kpi('clients', 'Clients', v_clients, 'nombre', 'boutique', null, case when v_coupons > 0 then format('%s commande(s) avec coupon', v_coupons) end),
      public.cockpit_kpi('retours', 'Annulées ou retournées', v_annulees + v_retours, 'nombre', 'boutique?statut=annulee', null, format('%s retour(s)', v_retours))
    ]),
    'attention', public.cockpit_liste(array[
      public.cockpit_alerte('vieilles', 'critique', 'Commandes non confirmées depuis plus de 24 h', 'Le client attend une réponse', v_vieilles, 'boutique?statut=nouvelle'),
      public.cockpit_alerte('nouvelles', 'alerte', 'Nouvelles commandes à confirmer', null, v_nouvelles - v_vieilles, 'boutique?statut=nouvelle'),
      public.cockpit_alerte('preparation', 'info', 'Commandes à préparer ou expédier', null, v_prep, 'boutique?statut=confirmee'),
      public.cockpit_alerte('stock_bas', 'alerte', 'Produits publiés presque épuisés', null, v_stock_bas, 'stock?etat=bas')
    ]),
    'graphiques', '[]'::jsonb,
    'listes', public.cockpit_liste(array[
      (select case when count(*) > 0 then jsonb_build_object('cle', 'top_produits', 'titre', 'Produits les plus commandés',
        'lignes', jsonb_agg(jsonb_build_object('libelle', libelle, 'detail', format('%s commandé(s)', trim_scale(quantite)), 'valeur', total, 'format', 'montant') order by total desc)) end
       from (select l.libelle, sum(l.quantite) quantite, sum(l.total) total from public.boutique_lignes l join public.boutique_commandes k on k.id = l.commande_id
             where k.etablissement_id = p_etablissement_id and k.statut not in ('annulee', 'retournee') and (k.cree_le at time zone c.tz)::date between c.du and c.au
               and public.cockpit_hub_ok(c, k.hub_id)
             group by l.libelle order by 3 desc limit 5) t)
    ]),
    'activite', coalesce((select jsonb_agg(a order by a ->> 'quand' desc) from (
      select jsonb_build_object('quand', k.cree_le, 'titre', 'Commande ' || k.numero, 'detail', k.nom_client, 'montant', k.total, 'route', 'boutique/' || k.id) a
      from public.boutique_commandes k
      where k.etablissement_id = p_etablissement_id and (k.cree_le at time zone c.tz)::date between c.du and c.au and public.cockpit_hub_ok(c, k.hub_id)
      order by k.cree_le desc limit 6) x), '[]'::jsonb)
  );
end
$$;

-- ---------------------------------------------------------------------------
-- 10. Projets, Agenda, Support, Abonnements, Fidélité, Trésorerie, Site web
-- ---------------------------------------------------------------------------
create function public.cockpit_projets(p_etablissement_id uuid, p_du date, p_au date, p_filtres jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  c public.cockpit_ctx;
  s jsonb;
  v_minutes bigint; v_minutes_p bigint; v_fact_minutes bigint; v_premier date; v_nb_p bigint; v_comp boolean; v_terminees bigint;
begin
  if not public.lecture_autorisee(p_etablissement_id, 'projets.lire') then
    raise exception 'Permission refusée : projets.lire' using errcode = '42501';
  end if;
  c := public.cockpit_preparer(p_etablissement_id, p_du, p_au, p_filtres);
  s := public.tableau_de_bord_projets(p_etablissement_id);
  select coalesce(sum(t.minutes) filter (where t.date_travail between c.du and c.au), 0),
         coalesce(sum(t.minutes) filter (where t.date_travail between c.pdu and c.pau), 0),
         coalesce(sum(t.minutes) filter (where t.date_travail between c.du and c.au and t.facturable), 0),
         count(*) filter (where t.date_travail between c.pdu and c.pau), min(t.date_travail)
  into v_minutes, v_minutes_p, v_fact_minutes, v_nb_p, v_premier
  from public.projet_temps t where t.etablissement_id = p_etablissement_id and t.statut = 'valide' and (c.vendeur is null or t.user_id = c.vendeur);
  v_comp := public.cockpit_comparable(v_nb_p, v_premier, c.pdu);
  select count(*) into v_terminees from public.projet_taches t
  where t.etablissement_id = p_etablissement_id and t.statut = 'terminee' and (t.terminee_le at time zone c.tz)::date between c.du and c.au;
  return jsonb_build_object(
    'domaine', 'projets',
    'periode', jsonb_build_object('du', c.du, 'au', c.au, 'du_precedent', c.pdu, 'au_precedent', c.pau, 'comparable', v_comp),
    'kpis', public.cockpit_liste(array[
      public.cockpit_kpi('en_cours', 'Projets en cours', (s ->> 'en_cours')::numeric, 'nombre', 'projets?statut=en_cours', null,
        case when (s ->> 'en_retard')::int > 0 then format('%s en retard', s ->> 'en_retard') end, case when (s ->> 'en_retard')::int > 0 then 'attention' end, true),
      public.cockpit_kpi('heures', 'Heures saisies', round(v_minutes / 60.0, 1), 'heures', 'projets?vue=temps', case when v_comp then round(v_minutes_p / 60.0, 1) end,
        format('%s h facturables', round(v_fact_minutes / 60.0, 1)), null, true),
      public.cockpit_kpi('a_facturer', 'Heures à facturer', (s ->> 'heures_a_facturer')::numeric, 'heures', 'projets?vue=temps', null, 'Facturables, pas encore facturées'),
      public.cockpit_kpi('taches_ouvertes', 'Tâches ouvertes', (s ->> 'taches_ouvertes')::numeric, 'nombre', 'projets?vue=taches', null, format('%s terminée(s) sur la période', v_terminees)),
      public.cockpit_kpi('taches_retard', 'Tâches en retard', (s ->> 'taches_retard')::numeric, 'nombre', 'projets?vue=taches', null, null, case when (s ->> 'taches_retard')::int > 0 then 'alerte' end),
      public.cockpit_kpi('mes_taches', 'Mes tâches', (s ->> 'mes_taches')::numeric, 'nombre', 'projets?vue=taches')
    ]),
    'attention', public.cockpit_liste(array[
      public.cockpit_alerte('projets_retard', 'alerte', 'Projets en retard', 'Date de fin prévue dépassée', (s ->> 'en_retard')::numeric, 'projets?statut=en_cours'),
      public.cockpit_alerte('taches_retard', 'alerte', 'Tâches en retard', null, (s ->> 'taches_retard')::numeric, 'projets?vue=taches'),
      public.cockpit_alerte('a_facturer', 'info', 'Temps facturable non facturé', format('%s h', s ->> 'heures_a_facturer'), (s ->> 'heures_a_facturer')::numeric, 'projets?vue=temps')
    ]),
    'graphiques', '[]'::jsonb,
    'listes', public.cockpit_liste(array[
      (select case when count(*) > 0 then jsonb_build_object('cle', 'temps_projet', 'titre', 'Temps par projet', 'route', 'projets',
        'lignes', jsonb_agg(jsonb_build_object('libelle', nom, 'detail', format('%s h', round(m / 60.0, 1)), 'route', 'projets/' || id) order by m desc)) end
       from (select p.id, p.nom, sum(t.minutes) m from public.projet_temps t join public.projets p on p.id = t.projet_id
             where t.etablissement_id = p_etablissement_id and t.statut = 'valide' and t.date_travail between c.du and c.au
             group by p.id, p.nom order by 3 desc limit 5) t)
    ]),
    'activite', '[]'::jsonb
  );
end
$$;

create function public.cockpit_agenda(p_etablissement_id uuid, p_du date, p_au date, p_filtres jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  c public.cockpit_ctx;
  s jsonb;
  v_total bigint; v_honores bigint; v_absents bigint; v_annules bigint; v_total_p bigint; v_premier date; v_comp boolean;
begin
  if not public.lecture_autorisee(p_etablissement_id, 'agenda.lire') then
    raise exception 'Permission refusée : agenda.lire' using errcode = '42501';
  end if;
  c := public.cockpit_preparer(p_etablissement_id, p_du, p_au, p_filtres);
  s := public.tableau_de_bord_agenda(p_etablissement_id);
  select count(*) filter (where (r.debut at time zone c.tz)::date between c.du and c.au and r.statut <> 'annule'),
         count(*) filter (where (r.debut at time zone c.tz)::date between c.du and c.au and r.statut = 'honore'),
         count(*) filter (where (r.debut at time zone c.tz)::date between c.du and c.au and r.statut = 'absent'),
         count(*) filter (where (r.debut at time zone c.tz)::date between c.du and c.au and r.statut = 'annule'),
         count(*) filter (where (r.debut at time zone c.tz)::date between c.pdu and c.pau and r.statut <> 'annule'),
         min((r.debut at time zone c.tz)::date)
  into v_total, v_honores, v_absents, v_annules, v_total_p, v_premier
  from public.agenda_rendez_vous r where r.etablissement_id = p_etablissement_id and (c.vendeur is null or r.responsable = c.vendeur);
  v_comp := public.cockpit_comparable(v_total_p, v_premier, c.pdu);
  return jsonb_build_object(
    'domaine', 'agenda',
    'periode', jsonb_build_object('du', c.du, 'au', c.au, 'du_precedent', c.pdu, 'au_precedent', c.pau, 'comparable', v_comp),
    'kpis', public.cockpit_liste(array[
      public.cockpit_kpi('aujourd_hui', 'Rendez-vous aujourd’hui', (s ->> 'aujourd_hui')::numeric, 'nombre', 'agenda', null,
        format('%s cette semaine', s ->> 'semaine'), null, true),
      public.cockpit_kpi('periode', 'Rendez-vous sur la période', v_total, 'nombre', 'agenda?vue=liste', case when v_comp then v_total_p end, format('%s honoré(s)', v_honores)),
      public.cockpit_kpi('absences', 'Clients absents', v_absents, 'nombre', 'agenda?vue=liste&statut=absent', null,
        case when v_honores + v_absents > 0 then format('%s %% des rendez-vous passés', round(100.0 * v_absents / (v_honores + v_absents))) end),
      public.cockpit_kpi('a_confirmer', 'À confirmer', (s ->> 'a_confirmer')::numeric, 'nombre', 'agenda?vue=liste&statut=prevu'),
      public.cockpit_kpi('a_cloturer', 'À clôturer', (s ->> 'a_cloturer')::numeric, 'nombre', 'agenda?vue=liste&statut=confirme', null, 'Passés, sans issue saisie'),
      public.cockpit_kpi('annules', 'Annulés', v_annules, 'nombre', 'agenda?vue=liste&statut=annule')
    ]),
    'attention', public.cockpit_liste(array[
      public.cockpit_alerte('a_cloturer', 'alerte', 'Rendez-vous passés à clôturer', 'Honoré ou absent ?', (s ->> 'a_cloturer')::numeric, 'agenda?vue=liste&statut=confirme'),
      public.cockpit_alerte('a_confirmer', 'info', 'Rendez-vous à confirmer', null, (s ->> 'a_confirmer')::numeric, 'agenda?vue=liste&statut=prevu')
    ]),
    'graphiques', '[]'::jsonb,
    'listes', public.cockpit_liste(array[
      (select case when count(*) > 0 then jsonb_build_object('cle', 'prochains', 'titre', 'Prochains rendez-vous', 'route', 'agenda',
        'lignes', jsonb_agg(jsonb_build_object('libelle', titre, 'detail', format('%s · %s', to_char(debut at time zone c.tz, 'DD/MM HH24:MI'), client)) order by debut)) end
       from (select r.titre, r.debut, coalesce(k.nom, r.nom_client, '—') client from public.agenda_rendez_vous r left join public.contacts k on k.id = r.contact_id
             where r.etablissement_id = p_etablissement_id and r.statut in ('prevu', 'confirme') and r.debut >= now()
               and (c.vendeur is null or r.responsable = c.vendeur)
             order by r.debut limit 6) t)
    ]),
    'activite', '[]'::jsonb
  );
end
$$;

create function public.cockpit_support(p_etablissement_id uuid, p_du date, p_au date, p_filtres jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  c public.cockpit_ctx;
  s jsonb;
  v_crees bigint; v_crees_p bigint; v_resolus bigint; v_resolus_p bigint; v_premier date; v_comp boolean;
begin
  if not public.lecture_autorisee(p_etablissement_id, 'support_tickets.lire') then
    raise exception 'Permission refusée : support_tickets.lire' using errcode = '42501';
  end if;
  c := public.cockpit_preparer(p_etablissement_id, p_du, p_au, p_filtres);
  s := public.tableau_de_bord_support(p_etablissement_id);
  select count(*) filter (where (t.cree_le at time zone c.tz)::date between c.du and c.au),
         count(*) filter (where (t.cree_le at time zone c.tz)::date between c.pdu and c.pau),
         count(*) filter (where (t.resolu_le at time zone c.tz)::date between c.du and c.au),
         count(*) filter (where (t.resolu_le at time zone c.tz)::date between c.pdu and c.pau),
         min((t.cree_le at time zone c.tz)::date)
  into v_crees, v_crees_p, v_resolus, v_resolus_p, v_premier
  from public.support_tickets t where t.etablissement_id = p_etablissement_id;
  v_comp := public.cockpit_comparable(v_crees_p, v_premier, c.pdu);
  return jsonb_build_object(
    'domaine', 'support',
    'periode', jsonb_build_object('du', c.du, 'au', c.au, 'du_precedent', c.pdu, 'au_precedent', c.pau, 'comparable', v_comp),
    'kpis', public.cockpit_liste(array[
      public.cockpit_kpi('ouverts', 'Tickets ouverts', (s ->> 'ouverts')::numeric, 'nombre', 'support?etat=actifs', null,
        case when (s ->> 'urgents')::int > 0 then format('%s urgent(s)', s ->> 'urgents') end, case when (s ->> 'urgents')::int > 0 then 'attention' end, true),
      public.cockpit_kpi('crees', 'Nouveaux tickets', v_crees, 'nombre', 'support', case when v_comp then v_crees_p end),
      public.cockpit_kpi('resolus', 'Résolus', v_resolus, 'nombre', 'support', case when v_comp then v_resolus_p end),
      public.cockpit_kpi('en_retard', 'En retard', (s ->> 'en_retard')::numeric, 'nombre', 'support?etat=retard', null, null, case when (s ->> 'en_retard')::int > 0 then 'alerte' end),
      public.cockpit_kpi('non_assignes', 'Non assignés', (s ->> 'non_assignes')::numeric, 'nombre', 'support?etat=non_assignes'),
      case when s ->> 'delai_moyen_heures' is not null then
        public.cockpit_kpi('delai', 'Délai moyen de résolution', (s ->> 'delai_moyen_heures')::numeric, 'heures', 'support', null, 'Tickets résolus ce mois') end
    ]),
    'attention', public.cockpit_liste(array[
      public.cockpit_alerte('urgents', 'critique', 'Tickets urgents ouverts', null, (s ->> 'urgents')::numeric, 'support?etat=actifs&priorite=urgente'),
      public.cockpit_alerte('en_retard', 'alerte', 'Tickets en retard', 'Échéance dépassée', (s ->> 'en_retard')::numeric, 'support?etat=retard'),
      public.cockpit_alerte('non_assignes', 'info', 'Tickets sans responsable', null, (s ->> 'non_assignes')::numeric, 'support?etat=non_assignes')
    ]),
    'graphiques', '[]'::jsonb,
    'listes', '[]'::jsonb,
    'activite', '[]'::jsonb
  );
end
$$;

create function public.cockpit_abonnements(p_etablissement_id uuid, p_du date, p_au date, p_filtres jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  c public.cockpit_ctx;
  s jsonb;
  v_nouveaux bigint; v_resilies bigint; v_echeances bigint;
begin
  if not public.lecture_autorisee(p_etablissement_id, 'abonnements.lire') then
    raise exception 'Permission refusée : abonnements.lire' using errcode = '42501';
  end if;
  c := public.cockpit_preparer(p_etablissement_id, p_du, p_au, p_filtres);
  s := public.tableau_de_bord_abonnements(p_etablissement_id);
  select count(*) filter (where a.debut between c.du and c.au),
         count(*) filter (where a.statut = 'resilie' and (a.modifie_le at time zone c.tz)::date between c.du and c.au),
         count(*) filter (where a.statut = 'actif' and a.prochaine_echeance between c.auj and c.auj + 7)
  into v_nouveaux, v_resilies, v_echeances
  from public.abonnements a where a.etablissement_id = p_etablissement_id;
  return jsonb_build_object(
    'domaine', 'abonnements',
    'periode', jsonb_build_object('du', c.du, 'au', c.au, 'comparable', false),
    'kpis', public.cockpit_liste(array[
      public.cockpit_kpi('revenu_mensuel', 'Revenu mensuel récurrent', (s ->> 'revenu_mensuel')::numeric, 'montant', 'abonnements?statut=actif', null,
        'Contractuel : ce que rapportent les abonnements actifs, pas un encaissement', null, true),
      public.cockpit_kpi('actifs', 'Abonnements actifs', (s ->> 'actifs')::numeric, 'nombre', 'abonnements?statut=actif', null, format('+%s sur la période', v_nouveaux)),
      public.cockpit_kpi('a_facturer', 'À facturer', (s ->> 'a_facturer')::numeric, 'nombre', 'abonnements?statut=actif', null, 'Échéance atteinte'),
      public.cockpit_kpi('impayes', 'Impayés', (s ->> 'impayes')::numeric, 'nombre', 'factures?etat=En retard', null, null, case when (s ->> 'impayes')::int > 0 then 'alerte' end),
      public.cockpit_kpi('suspendus', 'Suspendus', (s ->> 'suspendus')::numeric, 'nombre', 'abonnements?statut=suspendu'),
      public.cockpit_kpi('resilies', 'Résiliés sur la période', v_resilies, 'nombre', 'abonnements?statut=resilie')
    ]),
    'attention', public.cockpit_liste(array[
      public.cockpit_alerte('a_facturer', 'alerte', 'Abonnements à facturer', 'Échéance atteinte', (s ->> 'a_facturer')::numeric, 'abonnements?statut=actif'),
      public.cockpit_alerte('impayes', 'alerte', 'Abonnements impayés', null, (s ->> 'impayes')::numeric, 'factures?etat=En retard'),
      public.cockpit_alerte('echeances', 'info', 'Échéances dans les 7 jours', null, v_echeances, 'abonnements?statut=actif')
    ]),
    'graphiques', '[]'::jsonb, 'listes', '[]'::jsonb, 'activite', '[]'::jsonb
  );
end
$$;

create function public.cockpit_fidelite(p_etablissement_id uuid, p_du date, p_au date, p_filtres jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  c public.cockpit_ctx;
  s jsonb;
  v_gagnes bigint; v_utilises bigint; v_recompenses bigint; v_clients_actifs bigint;
begin
  if not public.lecture_autorisee(p_etablissement_id, 'fidelite.lire') then
    raise exception 'Permission refusée : fidelite.lire' using errcode = '42501';
  end if;
  c := public.cockpit_preparer(p_etablissement_id, p_du, p_au, p_filtres);
  s := public.tableau_de_bord_fidelite(p_etablissement_id);
  select coalesce(sum(m.points) filter (where m.type = 'gain'), 0), coalesce(-sum(m.points) filter (where m.type = 'utilisation'), 0),
         count(distinct m.contact_id) filter (where m.type = 'gain')
  into v_gagnes, v_utilises, v_clients_actifs
  from public.fidelite_mouvements m
  where m.etablissement_id = p_etablissement_id and (m.cree_le at time zone c.tz)::date between c.du and c.au;
  select count(*) into v_recompenses from public.fidelite_attributions a
  where a.etablissement_id = p_etablissement_id and (a.attribue_le at time zone c.tz)::date between c.du and c.au;
  return jsonb_build_object(
    'domaine', 'fidelite',
    'periode', jsonb_build_object('du', c.du, 'au', c.au, 'comparable', false),
    'kpis', public.cockpit_liste(array[
      public.cockpit_kpi('clients', 'Clients fidélisés', (s ->> 'clients')::numeric, 'nombre', 'fidelite', null, format('%s actif(s) sur la période', v_clients_actifs), null, true),
      public.cockpit_kpi('points', 'Points en circulation', (s ->> 'points_en_cours')::numeric, 'nombre', 'fidelite'),
      public.cockpit_kpi('gagnes', 'Points gagnés', v_gagnes, 'nombre', 'fidelite'),
      public.cockpit_kpi('utilises', 'Points utilisés', v_utilises, 'nombre', 'fidelite'),
      public.cockpit_kpi('recompenses', 'Récompenses remises', v_recompenses, 'nombre', 'fidelite?vue=recompenses')
    ]),
    'attention', '[]'::jsonb, 'graphiques', '[]'::jsonb,
    'listes', public.cockpit_liste(array[
      (select case when count(*) > 0 then jsonb_build_object('cle', 'meilleurs', 'titre', 'Meilleurs clients', 'route', 'fidelite',
        'lignes', jsonb_agg(jsonb_build_object('libelle', nom, 'detail', format('%s point(s)', solde), 'route', 'contacts/' || id) order by solde desc)) end
       from (select k.id, k.nom, sum(m.points) solde from public.fidelite_mouvements m join public.contacts k on k.id = m.contact_id
             where m.etablissement_id = p_etablissement_id group by k.id, k.nom having sum(m.points) > 0 order by 3 desc limit 5) t)
    ]),
    'activite', '[]'::jsonb
  );
end
$$;

-- Trésorerie de la période : encaissé réel moins dépenses et paiements fournisseurs.
create function public.cockpit_tresorerie(p_etablissement_id uuid, p_du date, p_au date, p_filtres jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  c public.cockpit_ctx;
  v_comp boolean; v_premier date; v_nb_p bigint;
  v_enc numeric; v_enc_p numeric; v_remb numeric; v_dep numeric; v_dep_p numeric; v_fourn numeric := 0; v_fourn_p numeric := 0;
  v_achats boolean := public.lecture_autorisee(p_etablissement_id, 'achats.lire');
begin
  if not (public.lecture_autorisee(p_etablissement_id, 'depenses.lire') and public.lecture_autorisee(p_etablissement_id, 'paiements.lire')) then
    raise exception 'Permission refusée : depenses.lire et paiements.lire' using errcode = '42501';
  end if;
  c := public.cockpit_preparer(p_etablissement_id, p_du, p_au, p_filtres);
  select coalesce(sum(montant), 0) into v_enc from public.cockpit_paiements(p_etablissement_id, c, c.du, c.au);
  select coalesce(sum(montant), 0), count(*) into v_enc_p, v_nb_p from public.cockpit_paiements(p_etablissement_id, c, c.pdu, c.pau);
  select min((p.cree_le at time zone c.tz)::date) into v_premier from public.paiements p
  where p.etablissement_id = p_etablissement_id and public.cockpit_hub_ok(c, p.hub_id);
  v_comp := public.cockpit_comparable(v_nb_p, v_premier, c.pdu);
  select coalesce(sum(r.montant), 0) into v_remb from public.remboursements_vente r
  where r.etablissement_id = p_etablissement_id and (r.cree_le at time zone c.tz)::date between c.du and c.au and public.cockpit_hub_ok(c, r.hub_id);
  select coalesce(sum(d.montant) filter (where d.date_depense between c.du and c.au), 0),
         coalesce(sum(d.montant) filter (where d.date_depense between c.pdu and c.pau), 0)
  into v_dep, v_dep_p
  from public.depenses d where d.etablissement_id = p_etablissement_id and d.statut = 'valide' and public.cockpit_hub_ok(c, d.hub_id);
  if v_achats and c.hub is null then
    select coalesce(sum(p.montant) filter (where p.date_paiement between c.du and c.au), 0),
           coalesce(sum(p.montant) filter (where p.date_paiement between c.pdu and c.pau), 0)
    into v_fourn, v_fourn_p
    from public.paiements_fournisseur p where p.etablissement_id = p_etablissement_id and p.statut = 'valide';
  end if;
  return jsonb_build_object(
    'domaine', 'tresorerie',
    'periode', jsonb_build_object('du', c.du, 'au', c.au, 'du_precedent', c.pdu, 'au_precedent', c.pau, 'comparable', v_comp),
    'kpis', public.cockpit_liste(array[
      public.cockpit_kpi('encaisse', 'Encaissé', v_enc, 'montant', 'ventes?' || public.cockpit_periode(c), case when v_comp then v_enc_p end, 'Tous les paiements clients reçus', null, true),
      public.cockpit_kpi('sorties', 'Sorties', v_dep + v_fourn + v_remb, 'montant', 'depenses', case when v_comp then v_dep_p + v_fourn_p end,
        format('Dépenses %s · fournisseurs %s · remboursements %s', round(v_dep), round(v_fourn), round(v_remb))),
      public.cockpit_kpi('solde', 'Solde de trésorerie', v_enc - v_dep - v_fourn - v_remb, 'montant', 'rapports', null,
        'Encaissé moins sorties de la période', case when v_enc - v_dep - v_fourn - v_remb < 0 then 'alerte' end, true),
      public.cockpit_kpi('depenses', 'Dépenses', v_dep, 'montant', 'depenses', case when v_comp then v_dep_p end)
    ]),
    'attention', public.cockpit_liste(array[
      public.cockpit_alerte('solde_negatif', 'alerte', 'Plus de sorties que d’encaissements', 'Sur la période choisie', case when v_enc - v_dep - v_fourn - v_remb < 0 and v_dep + v_fourn > 0 then 1 else 0 end, 'rapports')
    ]),
    'graphiques', public.cockpit_liste(array[
      (select case when count(*) > 0 then jsonb_build_object('cle', 'depenses_categorie', 'type', 'repartition', 'format', 'montant', 'titre', 'Dépenses par catégorie',
        'points', jsonb_agg(jsonb_build_object('libelle', categorie, 'valeur', total, 'route', 'depenses') order by total desc)) end
       from (select coalesce(d.categorie, 'Autre') categorie, sum(d.montant) total from public.depenses d
             where d.etablissement_id = p_etablissement_id and d.statut = 'valide' and d.date_depense between c.du and c.au and public.cockpit_hub_ok(c, d.hub_id)
             group by 1) t)
    ]),
    'listes', '[]'::jsonb, 'activite', '[]'::jsonb
  );
end
$$;

create function public.cockpit_siteweb(p_etablissement_id uuid, p_du date, p_au date, p_filtres jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  c public.cockpit_ctx;
  v_nouveaux bigint; v_recus bigint; v_pages bigint; v_publie boolean;
begin
  if not public.lecture_autorisee(p_etablissement_id, 'site_web.lire') then
    raise exception 'Permission refusée : site_web.lire' using errcode = '42501';
  end if;
  c := public.cockpit_preparer(p_etablissement_id, p_du, p_au, p_filtres);
  select count(*) filter (where m.statut = 'nouveau'), count(*) filter (where (m.cree_le at time zone c.tz)::date between c.du and c.au)
  into v_nouveaux, v_recus from public.site_messages m where m.etablissement_id = p_etablissement_id;
  select count(*) filter (where p.publiee and not p.archivee) into v_pages from public.site_pages p where p.etablissement_id = p_etablissement_id;
  select coalesce((select s.publie from public.sites s where s.etablissement_id = p_etablissement_id), false) into v_publie;
  return jsonb_build_object(
    'domaine', 'siteweb',
    'periode', jsonb_build_object('du', c.du, 'au', c.au, 'comparable', false),
    'kpis', public.cockpit_liste(array[
      public.cockpit_kpi('messages', 'Messages à traiter', v_nouveaux, 'nombre', 'siteweb?vue=messages&statut=nouveau', null, format('%s reçu(s) sur la période', v_recus),
        case when v_nouveaux > 0 then 'attention' end, true),
      public.cockpit_kpi('pages', 'Pages publiées', v_pages, 'nombre', 'siteweb', null, case when v_publie then 'Site en ligne' else 'Site non publié' end)
    ]),
    'attention', public.cockpit_liste(array[
      public.cockpit_alerte('messages', 'alerte', 'Messages du site à traiter', null, v_nouveaux, 'siteweb?vue=messages&statut=nouveau')
    ]),
    'graphiques', '[]'::jsonb, 'listes', '[]'::jsonb, 'activite', '[]'::jsonb
  );
end
$$;

-- ---------------------------------------------------------------------------
-- 11. Catalogue des domaines et cockpit global de l'établissement
-- ---------------------------------------------------------------------------
-- Domaines visibles pour l'utilisateur : module actif (licence comprise) et permission de lecture.
create function public.cockpit_domaines(p_etablissement_id uuid)
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
    (9, 'rh', 'RH', public.lecture_autorisee(p_etablissement_id, 'rh_employes.lire')),
    (10, 'projets', 'Projets', public.lecture_autorisee(p_etablissement_id, 'projets.lire')),
    (11, 'agenda', 'Agenda', public.lecture_autorisee(p_etablissement_id, 'agenda.lire')),
    (12, 'support', 'Support', public.lecture_autorisee(p_etablissement_id, 'support_tickets.lire')),
    (13, 'abonnements', 'Abonnements', public.lecture_autorisee(p_etablissement_id, 'abonnements.lire')),
    (14, 'fidelite', 'Fidélité', public.lecture_autorisee(p_etablissement_id, 'fidelite.lire')),
    (15, 'siteweb', 'Site web', public.lecture_autorisee(p_etablissement_id, 'site_web.lire'))
  ) as d(ordre, id, titre, visible)
  where d.visible
$$;

create function public.cockpit_etablissement(p_etablissement_id uuid, p_du date, p_au date, p_filtres jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  c public.cockpit_ctx;
  d jsonb;
  r jsonb;
  v_domaines jsonb := '[]'::jsonb;
  v_attention jsonb := '[]'::jsonb;
  v_activite jsonb := '[]'::jsonb;
  v_tendance jsonb;
  v_erreurs jsonb := '[]'::jsonb;
begin
  if not public.lecture_autorisee(p_etablissement_id, 'tableau_de_bord.lire') then
    raise exception 'Permission refusée : tableau_de_bord.lire' using errcode = '42501';
  end if;
  c := public.cockpit_preparer(p_etablissement_id, p_du, p_au, p_filtres);
  for d in select * from jsonb_array_elements(public.cockpit_domaines(p_etablissement_id)) loop
    begin
      execute format('select public.cockpit_%s($1, $2, $3, $4)', d ->> 'id') into r using p_etablissement_id, p_du, p_au, p_filtres;
    exception when others then
      -- Un domaine en erreur n'empêche pas les autres de s'afficher ; il est signalé.
      v_erreurs := v_erreurs || jsonb_build_array(d ->> 'id');
      continue;
    end;
    v_domaines := v_domaines || jsonb_build_array(jsonb_build_object(
      'id', d ->> 'id', 'titre', d ->> 'titre', 'comparable', r #> '{periode,comparable}',
      'kpis', coalesce((select jsonb_agg(k) from jsonb_array_elements(r -> 'kpis') k where (k ->> 'principal')::boolean), '[]'::jsonb),
      'attention', jsonb_array_length(r -> 'attention')
    ));
    v_attention := v_attention || coalesce((select jsonb_agg(a || jsonb_build_object('domaine', d ->> 'id', 'module', d ->> 'titre'))
                                            from jsonb_array_elements(r -> 'attention') a), '[]'::jsonb);
    v_activite := v_activite || coalesce((select jsonb_agg(a || jsonb_build_object('domaine', d ->> 'id', 'module', d ->> 'titre'))
                                          from jsonb_array_elements(r -> 'activite') a), '[]'::jsonb);
    if v_tendance is null then
      v_tendance := (select g from jsonb_array_elements(r -> 'graphiques') g where g ->> 'type' = 'barres' limit 1);
    end if;
  end loop;
  return jsonb_build_object(
    'periode', jsonb_build_object('du', c.du, 'au', c.au, 'du_precedent', c.pdu, 'au_precedent', c.pau),
    'domaines', v_domaines,
    'attention', coalesce((select jsonb_agg(a order by case a ->> 'niveau' when 'critique' then 0 when 'alerte' then 1 else 2 end, (a ->> 'nombre')::numeric desc)
                           from jsonb_array_elements(v_attention) a), '[]'::jsonb),
    'activite', coalesce((select jsonb_agg(a order by a ->> 'quand' desc) from (
                            select a from jsonb_array_elements(v_activite) a order by a ->> 'quand' desc limit 12) t), '[]'::jsonb),
    'tendance', v_tendance,
    'erreurs', v_erreurs
  );
end
$$;

-- Options des filtres : caisses visibles et collaborateurs apparaissant dans les ventes visibles.
create function public.cockpit_options(p_etablissement_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'caisses', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'nom', p.nom, 'hub_id', p.hub_id) order by p.nom)
                         from public.points_de_vente p where p.etablissement_id = p_etablissement_id and p.actif), '[]'::jsonb),
    'collaborateurs', coalesce((select jsonb_agg(jsonb_build_object('id', u, 'nom', public.cockpit_nom_utilisateur(u)) order by public.cockpit_nom_utilisateur(u))
                                from (select distinct v.vendeur u from public.ventes v
                                      where v.etablissement_id = p_etablissement_id and v.vendeur is not null
                                        and v.cree_le > now() - interval '400 days') t), '[]'::jsonb)
  )
  where public.lecture_autorisee(p_etablissement_id, 'tableau_de_bord.lire')
$$;

-- ---------------------------------------------------------------------------
-- 12 bis. Super Admin : usage, modules, essais, établissements inactifs
-- ---------------------------------------------------------------------------
-- Complète editeur_tableau_de_bord (inchangé). Aucun montant ici : les montants de licence sont
-- contractuels et la plateforme n'enregistre pas les paiements reçus des clients.
create function public.editeur_pilotage()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  aujourd_hui date := current_date;
begin
  perform public.exiger_editeur();
  return (
    with derniere as (
      select e.id, e.nom, e.client_id, e.solution_id, e.mis_en_service_le, e.statut,
             greatest(
               (select max(j.cree_le) from public.journal_audit j where j.etablissement_id = e.id),
               (select max(v.cree_le) from public.ventes v where v.etablissement_id = e.id),
               (select max(ev.cree_le) from public.evenements ev where ev.etablissement_id = e.id)
             ) as activite
      from public.etablissements e where e.statut <> 'archive'
    )
    select jsonb_build_object(
      'usage', jsonb_build_object(
        'etablissements_actifs_7j', (select count(*) from derniere where activite > now() - interval '7 days'),
        'etablissements_inactifs_14j', (select count(*) from derniere where statut = 'actif' and mis_en_service_le is not null
                                          and (activite is null or activite < now() - interval '14 days')),
        'utilisateurs_actifs_7j', (select count(distinct j.acteur) from public.journal_audit j where j.cree_le > now() - interval '7 days' and j.acteur is not null),
        'operations_7j', (select count(*) from public.journal_audit j where j.cree_le > now() - interval '7 days'),
        'ventes_7j', (select count(*) from public.ventes v where v.cree_le > now() - interval '7 days' and v.statut = 'validee')
      ),
      'inactifs', coalesce((select jsonb_agg(jsonb_build_object('etablissement_id', d.id, 'etablissement', d.nom, 'client', c.nom,
                                                                  'derniere_activite', d.activite) order by d.activite nulls first)
                            from (select * from derniere where statut = 'actif' and mis_en_service_le is not null
                                    and (activite is null or activite < now() - interval '14 days') order by activite nulls first limit 10) d
                            join public.clients c on c.id = d.client_id), '[]'::jsonb),
      'modules', coalesce((select jsonb_agg(jsonb_build_object('module_id', m.id, 'nom', m.nom, 'etablissements', n) order by n desc, m.nom)
                           from (select em.module_id, count(*) n from public.etablissement_modules em
                                 join public.etablissements e on e.id = em.etablissement_id
                                 where em.actif and e.statut <> 'archive' group by em.module_id) t
                           join public.modules m on m.id = t.module_id
                           where m.nature is distinct from 'socle'), '[]'::jsonb),
      'par_solution', coalesce((select jsonb_agg(jsonb_build_object('solution_id', solution_id, 'nombre', n) order by n desc)
                                from (select solution_id, count(*) n from public.etablissements where statut <> 'archive' group by solution_id) t), '[]'::jsonb),
      'essais', coalesce((select jsonb_agg(jsonb_build_object('etablissement_id', e.id, 'etablissement', e.nom, 'client', c.nom,
                                                              'echeance', l.echeance, 'jours_restants', l.echeance - aujourd_hui) order by l.echeance)
                          from public.licences l join public.etablissements e on e.id = l.etablissement_id join public.clients c on c.id = e.client_id
                          where l.statut = 'active' and l.formule = 'essai' and e.statut <> 'archive'), '[]'::jsonb),
      'sans_licence', (select count(*) from public.etablissements e where e.statut = 'actif'
                         and not exists (select 1 from public.licences l where l.etablissement_id = e.id and l.statut = 'active')),
      'encaissements_suivis', false
    )
  );
end
$$;

-- ---------------------------------------------------------------------------
-- 12. Droits d'exécution : utilisateurs connectés uniquement
-- ---------------------------------------------------------------------------
do $$
declare signature text;
begin
  foreach signature in array array[
    'public.cockpit_preparer(uuid, date, date, jsonb)',
    'public.cockpit_nom_utilisateur(uuid)',
    'public.cockpit_domaines(uuid)',
    'public.cockpit_options(uuid)',
    'public.cockpit_etablissement(uuid, date, date, jsonb)',
    'public.cockpit_commerce(uuid, date, date, jsonb)',
    'public.cockpit_restaurant(uuid, date, date, jsonb)',
    'public.cockpit_hotel(uuid, date, date, jsonb)',
    'public.cockpit_crm(uuid, date, date, jsonb)',
    'public.cockpit_rh(uuid, date, date, jsonb)',
    'public.cockpit_facturation(uuid, date, date, jsonb)',
    'public.cockpit_achats(uuid, date, date, jsonb)',
    'public.cockpit_boutique(uuid, date, date, jsonb)',
    'public.cockpit_projets(uuid, date, date, jsonb)',
    'public.cockpit_agenda(uuid, date, date, jsonb)',
    'public.cockpit_support(uuid, date, date, jsonb)',
    'public.cockpit_abonnements(uuid, date, date, jsonb)',
    'public.cockpit_fidelite(uuid, date, date, jsonb)',
    'public.cockpit_tresorerie(uuid, date, date, jsonb)',
    'public.cockpit_siteweb(uuid, date, date, jsonb)'
  ] loop
    execute format('revoke execute on function %s from public, anon', signature);
    execute format('grant execute on function %s to authenticated', signature);
  end loop;
  -- Lectures directes : appelables seulement depuis les fonctions cockpit (propriétaire).
  revoke execute on function public.cockpit_ventes(uuid, public.cockpit_ctx, date, date) from public, anon, authenticated;
  revoke execute on function public.editeur_pilotage() from public, anon;
  grant execute on function public.editeur_pilotage() to authenticated;
  revoke execute on function public.cockpit_paiements(uuid, public.cockpit_ctx, date, date) from public, anon, authenticated;
end
$$;
