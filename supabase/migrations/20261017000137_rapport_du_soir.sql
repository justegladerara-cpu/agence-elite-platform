-- Rapport du soir envoyé au patron sur WhatsApp (demande de Juste, 2026-10-13).
-- Le gérant ou le responsable ouvre « Rapport du soir » : le résumé de la journée (ventes, tickets, encaissements par
-- mode, 5 articles les plus vendus, remises, annulations, retours, dépenses, écarts de caisse des tickets Z, montant de
-- chaque caissière, caisses encore ouvertes). L'écran prépare un texte et ouvre WhatsApp (lien wa.me) : rien ne part
-- tout seul, aucune API WhatsApp.
-- Migration additive : une fonction de lecture et un réglage du module Clôture. Aucune donnée existante n'est modifiée.

-- ---------------------------------------------------------------------------
-- 1. Réglage « Numéro WhatsApp du patron » (Paramètres › Réglages des modules › Clôture)
-- ---------------------------------------------------------------------------
-- Vide = WhatsApp demande à qui envoyer. Chiffres, espaces, points, tirets, parenthèses et un « + » devant.
update public.modules set parametres_schema = parametres_schema || '[
  {"cle": "whatsapp_patron", "libelle": "Numéro WhatsApp du patron (rapport du soir), ex. 06 123 45 67 ou +242 06 123 45 67", "type": "texte", "defaut": "", "motif": "^(\\+?[0-9][0-9 .()-]{5,24})?$"}
]'::jsonb
where id = 'cloture' and not parametres_schema @> '[{"cle": "whatsapp_patron"}]'::jsonb;

-- ---------------------------------------------------------------------------
-- 2. Résumé de la journée
-- ---------------------------------------------------------------------------
-- La journée est le jour du calendrier dans le fuseau de l'établissement (aujourd'hui par défaut).
-- - Ventes, tickets, remises, crédit, articles, caissières : ventes validées créées ce jour-là.
-- - Encaissements par mode : paiements valides reçus ce jour-là (y compris une dette réglée ce jour).
-- - Annulations : ventes annulées ce jour-là ; retours : remboursements faits ce jour-là.
-- - Dépenses : dépenses valides datées de ce jour.
-- - Écart de caisse : tickets Z des caisses ouvertes ce jour-là (une caisse de bar ouverte à 18 h et fermée à 2 h
--   compte pour le jour de son ouverture). Un ticket Z automatique pas encore compté est signalé à part.
-- - Caisses encore ouvertes : caisses ouvertes ce jour-là ou avant, pas encore clôturées.
-- Réservé à qui voit toutes les caisses (gérant, responsable, comptable) ou lit les rapports. Lecture seule.
create function public.rapport_du_soir(p_etablissement_id uuid, p_date date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  fuseau text := coalesce((select e.fuseau from public.etablissements e where e.id = p_etablissement_id), 'UTC');
  jour date := coalesce(p_date, public.date_locale(p_etablissement_id));
  ventes jsonb;
  encaissements jsonb;
  articles jsonb;
  annulations jsonb;
  retours jsonb;
  depenses jsonb;
  clotures jsonb;
  caissiers jsonb;
  ouvertes integer;
begin
  if auth.uid() is null then
    raise exception 'Connexion requise';
  end if;
  if not (public.voit_toutes_caisses(p_etablissement_id) or public.lecture_autorisee(p_etablissement_id, 'rapports.lire')) then
    raise exception 'Accès refusé : le rapport du soir est réservé au gérant et au responsable';
  end if;

  select jsonb_build_object(
      'total', coalesce(sum(v.total), 0),
      'nombre', count(*),
      'remises', coalesce(sum(v.remise), 0)
        + coalesce((select sum(l.remise) from public.lignes_vente l join public.ventes w on w.id = l.vente_id
            where w.etablissement_id = p_etablissement_id and w.statut = 'validee'
              and (w.cree_le at time zone fuseau)::date = jour and public.lecture_hub(w.etablissement_id, w.hub_id)), 0),
      'credit', coalesce(sum(v.total - v.montant_paye), 0))
  into ventes
  from public.ventes v
  where v.etablissement_id = p_etablissement_id and v.statut = 'validee'
    and (v.cree_le at time zone fuseau)::date = jour
    and public.lecture_hub(v.etablissement_id, v.hub_id);

  select coalesce(jsonb_agg(jsonb_build_object('mode', t.mode, 'montant', t.montant) order by t.montant desc, t.mode), '[]'::jsonb)
  into encaissements
  from (
    select p.mode, sum(p.montant) montant
    from public.paiements p
    where p.etablissement_id = p_etablissement_id and p.statut = 'valide'
      and (p.cree_le at time zone fuseau)::date = jour
      and public.lecture_hub(p.etablissement_id, p.hub_id)
    group by p.mode
  ) t;

  select coalesce(jsonb_agg(jsonb_build_object('libelle', a.libelle, 'quantite', a.quantite, 'total', a.total)
      order by a.total desc, a.quantite desc, a.libelle), '[]'::jsonb)
  into articles
  from (
    select l.libelle, sum(l.quantite) quantite, sum(l.total) total
    from public.lignes_vente l join public.ventes v on v.id = l.vente_id
    where v.etablissement_id = p_etablissement_id and v.statut = 'validee'
      and (v.cree_le at time zone fuseau)::date = jour
      and public.lecture_hub(v.etablissement_id, v.hub_id)
    group by l.libelle
    order by sum(l.total) desc, sum(l.quantite) desc, l.libelle
    limit 5
  ) a;

  select jsonb_build_object('nombre', count(*), 'montant', coalesce(sum(v.total), 0))
  into annulations
  from public.ventes v
  where v.etablissement_id = p_etablissement_id and v.statut = 'annulee'
    and (v.annulee_le at time zone fuseau)::date = jour
    and public.lecture_hub(v.etablissement_id, v.hub_id);

  select jsonb_build_object('nombre', count(*), 'montant', coalesce(sum(r.montant), 0))
  into retours
  from public.remboursements_vente r
  where r.etablissement_id = p_etablissement_id
    and (r.cree_le at time zone fuseau)::date = jour
    and public.lecture_hub(r.etablissement_id, r.hub_id);

  select jsonb_build_object('nombre', count(*), 'montant', coalesce(sum(d.montant), 0))
  into depenses
  from public.depenses d
  where d.etablissement_id = p_etablissement_id and d.statut = 'valide' and d.date_depense = jour
    and public.lecture_hub(d.etablissement_id, d.hub_id);

  select jsonb_build_object(
      'nombre', count(*),
      'ecart', coalesce(sum(z.ecart), 0),
      'a_compter', count(*) filter (where z.especes_comptees is null),
      'liste', coalesce(jsonb_agg(jsonb_build_object(
          'numero', z.numero, 'caissier', public.nom_membre_restaurant(s.ouverte_par),
          'ecart', z.ecart, 'a_compter', z.especes_comptees is null)
        order by z.cloturee_le), '[]'::jsonb))
  into clotures
  from public.clotures z
  join public.sessions_caisse s on s.id = z.session_caisse_id
  where z.etablissement_id = p_etablissement_id
    and (z.ouverte_le at time zone fuseau)::date = jour
    and public.lecture_hub(z.etablissement_id, z.hub_id);

  -- Une vente compte pour la personne de sa caisse (sinon pour son vendeur : facture, boutique en ligne...).
  select coalesce(jsonb_agg(jsonb_build_object('id', c.personne, 'nom', public.nom_membre_restaurant(c.personne),
      'nombre_ventes', c.nombre, 'total_ventes', c.total)
      order by c.total desc, public.nom_membre_restaurant(c.personne)), '[]'::jsonb)
  into caissiers
  from (
    select coalesce(s.ouverte_par, v.vendeur) personne, count(*) nombre, sum(v.total) total
    from public.ventes v
    left join public.sessions_caisse s on s.id = v.session_caisse_id
    where v.etablissement_id = p_etablissement_id and v.statut = 'validee'
      and (v.cree_le at time zone fuseau)::date = jour
      and public.lecture_hub(v.etablissement_id, v.hub_id)
    group by 1
  ) c;

  select count(*) into ouvertes
  from public.sessions_caisse s
  where s.etablissement_id = p_etablissement_id and s.statut = 'ouverte' and not s.rattrapage
    and (s.ouverte_le at time zone fuseau)::date <= jour
    and public.lecture_hub(s.etablissement_id, s.hub_id);

  return jsonb_build_object(
    'date', jour,
    'etablissement', (select coalesce(nullif(btrim(i.nom_commercial), ''), e.nom)
                      from public.etablissements e left join public.etablissement_identite i on i.etablissement_id = e.id
                      where e.id = p_etablissement_id),
    'devise', (select e.devise from public.etablissements e where e.id = p_etablissement_id),
    'whatsapp_patron', coalesce((select btrim(p.data ->> 'whatsapp_patron') from public.etablissement_parametres p
                                 where p.etablissement_id = p_etablissement_id and p.module_id = 'cloture'), ''),
    'total_ventes', ventes -> 'total',
    'nombre_tickets', ventes -> 'nombre',
    'total_remises', ventes -> 'remises',
    'credit', ventes -> 'credit',
    'encaissements', encaissements,
    'top_articles', articles,
    'annulations', annulations,
    'retours', retours,
    'depenses', depenses,
    'clotures', clotures,
    'caissiers', caissiers,
    'caisses_ouvertes', ouvertes
  );
end
$$;
revoke execute on function public.rapport_du_soir(uuid, date) from public, anon;
grant execute on function public.rapport_du_soir(uuid, date) to authenticated;

notify pgrst, 'reload schema';
