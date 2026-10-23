-- Analyses du Tableau de bord et rapport PDF d'une page (demande de Juste, 2026-10-23).
-- Une seule fonction en lecture seule, analyse_commerce, donne tout ce qu'il faut aux onglets Aujourd'hui, Ventes,
-- Clients & produits, Équipe, et au rapport A4 (journalier, hebdomadaire, mensuel, période libre).
-- Mêmes règles que le tableau Commerce (migration 153) : jour d'exploitation, comparaison au même jour de la semaine
-- d'avant ou à la période d'avant arrêtée au même moment, filtres Hub / caisse / collaborateur.
-- Une personne qui tient une caisse sans pouvoir clôturer ne voit que ses propres ventes (son rapport).
-- Ne crée aucune table, ne change aucune donnée.

create or replace function public.analyse_commerce(p_etablissement_id uuid, p_du date, p_au date, p_filtres jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  c public.cockpit_ctx;
  v_devise text := coalesce((select e.devise from public.etablissements e where e.id = p_etablissement_id), 'XAF');
  v_pdu date; v_pau date; v_limite timestamptz := 'infinity'; v_en_cours boolean; v_lib_comp text;
  v_premier date; v_nb_p bigint; v_comp boolean;
  v_stock boolean := public.lecture_autorisee(p_etablissement_id, 'stock.lire');
  v_paie boolean := public.lecture_autorisee(p_etablissement_id, 'paiements.lire');
  v_depenses boolean := public.lecture_autorisee(p_etablissement_id, 'depenses.lire');
  v_cloture boolean;
  v_tous boolean := public.voit_toutes_caisses(p_etablissement_id);
  r jsonb;
begin
  if not public.lecture_autorisee(p_etablissement_id, 'ventes.lire') then
    raise exception 'Permission refusée : ventes.lire' using errcode = '42501';
  end if;
  c := public.cockpit_preparer(p_etablissement_id, p_du, p_au, p_filtres);
  -- Une caissière ne voit que son rapport : ses ventes, ses annulations, ses tickets Z.
  if not v_tous and public.a_permission(p_etablissement_id, 'caisse.utiliser') then
    c.vendeur := auth.uid();
  else
    v_tous := true;
  end if;
  v_cloture := public.lecture_autorisee(p_etablissement_id, 'cloture.lire') or public.a_permission(p_etablissement_id, 'caisse.utiliser');

  if c.jours = 1 then
    v_pdu := c.du - 7; v_pau := c.du - 7;
  else
    v_pdu := c.pdu; v_pau := c.pau;
  end if;
  -- Avant 6 h, le service de la veille est encore en cours (un bar qui ferme à 3 h).
  v_en_cours := c.au >= c.auj or (c.au = c.auj - 1 and extract(hour from now() at time zone c.tz) < 6);
  if v_en_cours then
    v_limite := now() - make_interval(days => c.du - v_pdu);
  end if;
  v_lib_comp := case
    when c.jours = 1 and v_en_cours then 'vs il y a 7 jours, même heure'
    when c.jours = 1 then 'vs même jour, semaine d’avant'
    when v_en_cours then 'vs période d’avant, même moment'
    else 'vs période précédente' end;
  select count(*) into v_nb_p from public.cockpit_ventes(p_etablissement_id, c, v_pdu, v_pau) v
  where v.statut = 'validee' and v.cree_le <= v_limite;
  select min((v.cree_le at time zone c.tz)::date) into v_premier
  from public.ventes v where v.etablissement_id = p_etablissement_id and public.cockpit_hub_ok(c, v.hub_id);
  v_comp := public.cockpit_comparable(v_nb_p, v_premier, v_pdu);

  with
  toutes as materialized (
    select x.id, x.numero, x.statut, x.total, x.sous_total, x.remise, x.montant_paye, x.contact_id, x.cree_le,
           x.annulee_le, x.annulee_par, x.motif_annulation,
           coalesce(s.ouverte_par, x.vendeur) personne,
           public.jour_exploitation(s.ouverte_le, x.cree_le, c.tz) jour_e,
           extract(hour from x.cree_le at time zone c.tz)::int h
    from public.cockpit_ventes(p_etablissement_id, c, c.du, c.au) x
    left join public.sessions_caisse s on s.id = x.session_caisse_id
  ),
  v as (select * from toutes where statut = 'validee'),
  vp as (
    select x.total, x.sous_total, x.remise, x.id, x.statut
    from public.cockpit_ventes(p_etablissement_id, c, v_pdu, v_pau) x
    where x.cree_le <= v_limite
  ),
  l as materialized (
    select l.vente_id, l.article_id, l.libelle, l.quantite, l.total, l.remise, v.h,
           coalesce(l.cout_unitaire, a.cout_achat) cout
    from public.lignes_vente l join v on v.id = l.vente_id
    left join public.articles a on a.id = l.article_id
  ),
  lp as (
    select l.total, l.remise, l.quantite, coalesce(l.cout_unitaire, a.cout_achat) cout
    from public.lignes_vente l join vp on vp.id = l.vente_id and vp.statut = 'validee'
    left join public.articles a on a.id = l.article_id
  ),
  paie as (
    select p.mode, p.montant from public.cockpit_paiements(p_etablissement_id, c, c.du, c.au) p where v_paie
  ),
  paie_p as (
    select p.montant from public.cockpit_paiements(p_etablissement_id, c, v_pdu, v_pau) p where v_paie and p.cree_le <= v_limite
  ),
  dep as (
    select d.categorie, d.montant, d.date_depense
    from public.depenses d
    where v_depenses and v_tous and d.etablissement_id = p_etablissement_id and d.statut = 'valide'
      and d.date_depense between least(c.du, v_pdu) and c.au and public.cockpit_hub_ok(c, d.hub_id)
  ),
  z as (
    select k.*, coalesce(s.ouverte_par, k.cloturee_par) personne
    from public.clotures k
    left join public.sessions_caisse s on s.id = k.session_caisse_id
    where v_cloture and k.etablissement_id = p_etablissement_id
      and public.jour_exploitation(s.ouverte_le, k.cloturee_le, c.tz) between c.du and c.au
      and public.cockpit_hub_ok(c, k.hub_id) and (c.caisse is null or k.point_de_vente_id = c.caisse)
      and (c.vendeur is null or coalesce(s.ouverte_par, k.cloturee_par) = c.vendeur)
  ),
  -- Même jour de la semaine, les 4 semaines d'avant : sert à la prévision de fin de service et au rush à venir.
  hist as (
    select extract(hour from x.cree_le at time zone c.tz)::int h, sum(x.total) total,
           count(distinct public.jour_exploitation(s.ouverte_le, x.cree_le, c.tz)) jours
    from public.cockpit_ventes(p_etablissement_id, c, c.du - 28, c.du - 7) x
    left join public.sessions_caisse s on s.id = x.session_caisse_id
    where c.jours = 1 and x.statut = 'validee'
      and (c.du - public.jour_exploitation(s.ouverte_le, x.cree_le, c.tz)) % 7 = 0
    group by 1
  ),
  stock as (
    select a.id, a.stock_minimum, sum(s.quantite) quantite
    from public.articles a join public.stock_hubs s on s.article_id = a.id and public.cockpit_hub_ok(c, s.hub_id)
    where v_stock and a.etablissement_id = p_etablissement_id and a.actif and a.suivi_stock
    group by a.id, a.stock_minimum
  ),
  -- Rythme de vente des 30 derniers jours (jusqu'à maintenant), pour les jours avant rupture.
  rythme as (
    select l.article_id, sum(l.quantite) quantite
    from public.lignes_vente l join public.ventes w on w.id = l.vente_id
    where v_stock and w.etablissement_id = p_etablissement_id and w.statut = 'validee'
      and w.cree_le > now() - interval '30 days' and public.cockpit_hub_ok(c, w.hub_id)
    group by l.article_id
  ),
  articles as (
    select l.article_id, coalesce(a.nom, min(l.libelle)) libelle, coalesce(k.nom, 'Sans catégorie') categorie,
           sum(l.quantite) quantite, sum(l.total) chiffre, count(distinct l.vente_id) tickets,
           case when bool_and(l.cout is not null) then sum(l.total - l.quantite * l.cout) end marge,
           case when a.suivi_stock and v_stock then coalesce(st.quantite, 0) end stock,
           case when a.suivi_stock and v_stock then coalesce(ry.quantite, 0) end vendu_30j
    from l
    left join public.articles a on a.id = l.article_id
    left join public.categories_articles k on k.id = a.categorie_id
    left join stock st on st.id = l.article_id
    left join rythme ry on ry.article_id = l.article_id
    group by l.article_id, a.nom, k.nom, a.suivi_stock, st.quantite, ry.quantite
  ),
  paires as (
    select x.article_id a1, y.article_id a2, count(*) nombre
    from (select distinct vente_id, article_id from l) x
    join (select distinct vente_id, article_id from l) y on y.vente_id = x.vente_id and x.article_id < y.article_id
    group by 1, 2
  )
  select jsonb_build_object(
    'devise', v_devise,
    'periode', jsonb_build_object('du', c.du, 'au', c.au, 'jours', c.jours, 'du_precedent', v_pdu, 'au_precedent', v_pau,
      'comparable', v_comp, 'comparaison', v_lib_comp, 'en_cours', v_en_cours, 'aujourdhui', c.auj,
      'maintenant', to_char(now() at time zone c.tz, 'YYYY-MM-DD"T"HH24:MI'), 'fuseau', c.tz),
    'portee', jsonb_build_object('tous', v_tous, 'personne', case when not v_tous then public.cockpit_nom_utilisateur(c.vendeur) end,
      'stock', v_stock, 'paiements', v_paie, 'depenses', v_depenses and v_tous, 'clotures', v_cloture),
    'totaux', jsonb_build_object(
      'chiffre', (select coalesce(sum(total), 0) from v),
      'tickets', (select count(*) from v),
      'articles', (select coalesce(sum(quantite), 0) from l),
      'remises', (select coalesce(sum(remise), 0) from v) + (select coalesce(sum(remise), 0) from l),
      'annulations', (select count(*) from toutes where statut = 'annulee'),
      'annulations_montant', (select coalesce(sum(total), 0) from toutes where statut = 'annulee'),
      'marge', (select sum(total - quantite * cout) from l where cout is not null),
      'chiffre_cout_connu', (select coalesce(sum(total), 0) from l where cout is not null),
      'chiffre_lignes', (select coalesce(sum(total), 0) from l),
      'encaisse', case when v_paie then (select coalesce(sum(montant), 0) from paie) end,
      'credit_periode', (select coalesce(sum(total - montant_paye), 0) from v),
      'clients_identifies', (select count(distinct contact_id) from v where contact_id is not null),
      'depenses', case when v_depenses and v_tous then (select coalesce(sum(montant), 0) from dep where date_depense between c.du and c.au) end
    ),
    'precedent', case when v_comp then jsonb_build_object(
      'chiffre', (select coalesce(sum(total), 0) from vp where statut = 'validee'),
      'tickets', (select count(*) from vp where statut = 'validee'),
      'articles', (select coalesce(sum(quantite), 0) from lp),
      'remises', (select coalesce(sum(remise), 0) from vp where statut = 'validee') + (select coalesce(sum(remise), 0) from lp),
      'annulations', (select count(*) from vp where statut = 'annulee'),
      'annulations_montant', (select coalesce(sum(total), 0) from vp where statut = 'annulee'),
      'marge', (select sum(total - quantite * cout) from lp where cout is not null),
      'chiffre_cout_connu', (select coalesce(sum(total), 0) from lp where cout is not null),
      'chiffre_lignes', (select coalesce(sum(total), 0) from lp),
      'encaisse', case when v_paie then (select coalesce(sum(montant), 0) from paie_p) end,
      'depenses', case when v_depenses and v_tous then (select coalesce(sum(montant), 0) from dep where date_depense between v_pdu and v_pau) end
    ) end,
    'par_jour', (
      select coalesce(jsonb_agg(jsonb_build_object('jour', j::date, 'chiffre', coalesce(t.chiffre, 0), 'tickets', coalesce(t.tickets, 0)) order by j), '[]'::jsonb)
      from generate_series(c.du, c.au, interval '1 day') j
      left join (select jour_e, sum(total) chiffre, count(*) tickets from v group by jour_e) t on t.jour_e = j::date
    ),
    'par_heure', (
      select coalesce(jsonb_agg(jsonb_build_object('heure', h, 'chiffre', chiffre, 'tickets', tickets, 'jours', jours) order by (h + 18) % 24), '[]'::jsonb)
      from (select h, sum(total) chiffre, count(*) tickets, count(distinct jour_e) jours from v group by h) t
    ),
    'grille', (
      select coalesce(jsonb_agg(jsonb_build_object('jour_semaine', js, 'heure', h, 'chiffre', chiffre, 'tickets', tickets)), '[]'::jsonb)
      from (select extract(isodow from jour_e)::int js, h, sum(total) chiffre, count(*) tickets from v group by 1, 2) t
    ),
    'jours_semaine', (
      select coalesce(jsonb_agg(jsonb_build_object('jour_semaine', d.js, 'jours', d.nb, 'chiffre', coalesce(t.chiffre, 0), 'tickets', coalesce(t.tickets, 0)) order by d.js), '[]'::jsonb)
      from (select extract(isodow from j)::int js, count(*) nb from generate_series(c.du, least(c.au, c.auj), interval '1 day') j group by 1) d
      left join (select extract(isodow from jour_e)::int js, sum(total) chiffre, count(*) tickets from v group by 1) t on t.js = d.js
    ),
    'historique_meme_jour', (
      select coalesce(jsonb_agg(jsonb_build_object('heure', h, 'chiffre', round(total / greatest(jours_max, 1)))), '[]'::jsonb)
      from (select h, total, max(jours) over () jours_max from hist) t
    ),
    'articles', (
      select coalesce(jsonb_agg(to_jsonb(t) - 'article_id' || jsonb_build_object('id', t.article_id) order by t.chiffre desc), '[]'::jsonb)
      from (select * from articles order by chiffre desc limit 300) t
    ),
    'nombre_articles_vendus', (select count(*) from articles),
    'categories', (
      select coalesce(jsonb_agg(jsonb_build_object('libelle', categorie, 'chiffre', chiffre, 'quantite', quantite) order by chiffre desc), '[]'::jsonb)
      from (select categorie, sum(chiffre) chiffre, sum(quantite) quantite from articles group by categorie) t
    ),
    'star_par_heure', (
      select coalesce(jsonb_agg(jsonb_build_object('heure', h, 'libelle', libelle, 'quantite', quantite) order by (h + 18) % 24), '[]'::jsonb)
      from (
        select distinct on (l.h) l.h, coalesce(a.nom, min(l.libelle)) libelle, sum(l.quantite) quantite
        from l left join public.articles a on a.id = l.article_id
        group by l.h, l.article_id, a.nom
        order by l.h, sum(l.quantite) desc, coalesce(a.nom, min(l.libelle))
      ) t
    ),
    'paires', (
      select coalesce(jsonb_agg(jsonb_build_object('a', a1.nom, 'b', a2.nom, 'nombre', p.nombre) order by p.nombre desc, a1.nom), '[]'::jsonb)
      from (select * from paires where nombre >= 2 order by nombre desc limit 8) p
      join public.articles a1 on a1.id = p.a1 join public.articles a2 on a2.id = p.a2
    ),
    'paiements', case when v_paie then (
      select coalesce(jsonb_agg(jsonb_build_object('mode', mode, 'montant', montant, 'nombre', nombre) order by montant desc), '[]'::jsonb)
      from (select mode, sum(montant) montant, count(*) nombre from paie group by mode) t
    ) end,
    'clients', (
      select coalesce(jsonb_agg(jsonb_build_object('libelle', nom, 'tickets', tickets, 'chiffre', chiffre, 'reste_du', reste) order by chiffre desc), '[]'::jsonb)
      from (
        select coalesce(nullif(ct.societe, ''), ct.nom) nom, count(*) tickets, sum(v.total) chiffre, sum(v.total - v.montant_paye) reste
        from v join public.contacts ct on ct.id = v.contact_id
        group by ct.id, ct.nom, ct.societe order by 3 desc limit 8
      ) t
    ),
    'equipe', (
      select coalesce(jsonb_agg(jsonb_build_object('id', p.personne, 'nom', public.cockpit_nom_utilisateur(p.personne),
        'tickets', coalesce(a.tickets, 0), 'chiffre', coalesce(a.chiffre, 0), 'remises', coalesce(a.remises, 0),
        'annulations', coalesce(b.nombre, 0), 'annulations_montant', coalesce(b.montant, 0),
        'z', coalesce(zz.nombre, 0), 'ecart', zz.ecart) order by coalesce(a.chiffre, 0) desc), '[]'::jsonb)
      from (select personne from v union select annulee_par from toutes where statut = 'annulee' union select personne from z) p
      left join (select personne, count(*) tickets, sum(total) chiffre, sum(remise) remises from v group by personne) a on a.personne = p.personne
      left join (select annulee_par personne, count(*) nombre, sum(total) montant from toutes where statut = 'annulee' group by annulee_par) b on b.personne = p.personne
      left join (select personne, count(*) nombre, sum(ecart) ecart from z group by personne) zz on zz.personne = p.personne
      where p.personne is not null
    ),
    'annulations', (
      select coalesce(jsonb_agg(jsonb_build_object('quand', annulee_le, 'vendu_le', cree_le, 'numero', numero, 'montant', total,
        'par', public.cockpit_nom_utilisateur(annulee_par), 'motif', motif_annulation,
        'tardive', annulee_le > cree_le + interval '30 minutes') order by annulee_le desc), '[]'::jsonb)
      from (select * from toutes where statut = 'annulee' order by annulee_le desc limit 30) t
    ),
    'ticket_z', jsonb_build_object(
      'nombre', (select count(*) from z),
      'especes_attendues', (select sum(especes_attendues) from z),
      'especes_comptees', (select sum(especes_comptees) from z),
      'ecart', (select sum(ecart) from z),
      'ecarts', (select count(*) from z where ecart <> 0),
      'remboursements', (select coalesce(sum(r.montant), 0) from public.remboursements_vente r
        where r.etablissement_id = p_etablissement_id and (r.cree_le at time zone c.tz)::date between c.du and c.au
          and public.cockpit_hub_ok(c, r.hub_id) and (c.vendeur is null or r.rembourse_par = c.vendeur))
    ),
    'stock', case when v_stock then jsonb_build_object(
      'suivis', (select count(*) from stock),
      'ruptures', (select count(*) from stock s join rythme ry on ry.article_id = s.id where s.quantite <= 0),
      'bas', (select count(*) from stock where quantite > 0 and quantite <= stock_minimum),
      'dormants', (select count(*) from stock s where s.quantite > 0 and not exists (select 1 from l where l.article_id = s.id)),
      'dormants_valeur', (select coalesce(sum(s.quantite * a.cout_achat), 0) from stock s join public.articles a on a.id = s.id
                          where s.quantite > 0 and not exists (select 1 from l where l.article_id = s.id)),
      'dormants_liste', (select coalesce(jsonb_agg(jsonb_build_object('libelle', nom, 'quantite', quantite, 'valeur', valeur) order by valeur desc nulls last), '[]'::jsonb)
                         from (select a.nom, s.quantite, s.quantite * a.cout_achat valeur from stock s join public.articles a on a.id = s.id
                               where s.quantite > 0 and not exists (select 1 from l where l.article_id = s.id)
                               order by 3 desc nulls last limit 8) t)
    ) end,
    'depenses_categories', case when v_depenses and v_tous then (
      select coalesce(jsonb_agg(jsonb_build_object('libelle', categorie, 'montant', montant) order by montant desc), '[]'::jsonb)
      from (select categorie, sum(montant) montant from dep where date_depense between c.du and c.au group by categorie order by 2 desc limit 6) t
    ) end,
    'credits', case when v_tous then (
      select jsonb_build_object('montant', coalesce(sum(w.total - w.montant_paye), 0), 'nombre', count(*))
      from public.ventes w
      where w.etablissement_id = p_etablissement_id and w.statut = 'validee' and w.montant_paye < w.total
        and public.cockpit_hub_ok(c, w.hub_id) and (c.caisse is null or w.point_de_vente_id = c.caisse)
    ) end
  ) into r;
  return r;
end
$$;
revoke execute on function public.analyse_commerce(uuid, date, date, jsonb) from public, anon;
grant execute on function public.analyse_commerce(uuid, date, date, jsonb) to authenticated;

notify pgrst, 'reload schema';
