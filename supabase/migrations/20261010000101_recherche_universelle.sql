-- Recherche universelle (2026-10-09) : une seule fonction cherche, dans l'établissement actif, les articles, contacts,
-- ventes, factures et devis, réservations et chambres d'hôtel, tables, employés, tickets, opportunités, projets,
-- commandes d'achat et rendez-vous. Elle sert la palette « Ctrl+K » de l'écran.
-- Sécurité : fonction « security invoker » : la RLS de chaque table s'applique (droits, Hubs, isolement entre
-- établissements) ; en plus, chaque famille n'est cherchée que si la personne peut ouvrir l'écran correspondant.
-- Aucune écriture, aucune table. Numérotée après 20261010000001 (PR #11 en attente) pour garder un ordre croissant.

create or replace function public.recherche_universelle(p_etablissement_id uuid, p_texte text, p_limite integer default 5)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_texte text := btrim(coalesce(p_texte, ''));
  v_motif text;
  v_n integer := greatest(1, least(coalesce(p_limite, 5), 10));
  resultats jsonb := '[]'::jsonb;
  bloc jsonb;
begin
  if auth.uid() is null then
    raise exception 'Connexion requise';
  end if;
  if length(v_texte) < 2 then
    return resultats;
  end if;
  -- Les caractères spéciaux de LIKE sont neutralisés : « 50% » cherche « 50% ».
  v_motif := '%' || replace(replace(replace(left(v_texte, 80), '\', '\\'), '%', '\%'), '_', '\_') || '%';

  if public.lecture_autorisee(p_etablissement_id, 'articles.lire') then
    select coalesce(jsonb_agg(x), '[]') into bloc from (
      select 'article' as type, a.id, a.nom as libelle,
        concat_ws(' · ', nullif(a.reference, ''), nullif(a.code_barres, '')) as detail,
        'articles?q=' || a.nom as route
      from public.articles a
      where a.etablissement_id = p_etablissement_id and a.actif
        and (a.nom ilike v_motif or a.reference ilike v_motif or a.code_barres = v_texte)
      order by (a.nom ilike v_texte || '%') desc, a.nom limit v_n) x;
    resultats := resultats || bloc;
  end if;

  if public.lecture_autorisee(p_etablissement_id, 'contacts.lire') then
    select coalesce(jsonb_agg(x), '[]') into bloc from (
      select 'contact' as type, c.id, c.nom as libelle, concat_ws(' · ', nullif(c.telephone, ''), nullif(c.email, '')) as detail,
        'contacts/' || c.id as route
      from public.contacts c
      where c.etablissement_id = p_etablissement_id and c.actif
        and (c.nom ilike v_motif or c.telephone ilike v_motif or c.email ilike v_motif)
      order by (c.nom ilike v_texte || '%') desc, c.nom limit v_n) x;
    resultats := resultats || bloc;
  end if;

  if public.lecture_autorisee(p_etablissement_id, 'ventes.lire') then
    select coalesce(jsonb_agg(x), '[]') into bloc from (
      select 'vente' as type, v.id, v.numero as libelle,
        concat_ws(' · ', c.nom, to_char(v.cree_le, 'DD/MM/YYYY'), v.total::text) as detail,
        'ventes/' || v.id as route
      from public.ventes v
      left join public.contacts c on c.id = v.contact_id
      where v.etablissement_id = p_etablissement_id and (v.numero ilike v_motif or c.nom ilike v_motif)
      order by v.cree_le desc limit v_n) x;
    resultats := resultats || bloc;
  end if;

  if public.lecture_autorisee(p_etablissement_id, 'facturation.lire') then
    select coalesce(jsonb_agg(x), '[]') into bloc from (
      select case d.type when 'devis' then 'devis' when 'avoir' then 'avoir' else 'facture' end as type, d.id,
        coalesce(d.numero, 'Brouillon') || coalesce(' · ' || nullif(d.objet, ''), '') as libelle,
        concat_ws(' · ', c.nom, d.statut, d.total_ttc::text) as detail,
        'factures/' || d.id as route
      from public.documents_vente d
      left join public.contacts c on c.id = d.contact_id
      where d.etablissement_id = p_etablissement_id and (d.numero ilike v_motif or d.objet ilike v_motif or c.nom ilike v_motif)
      order by d.cree_le desc limit v_n) x;
    resultats := resultats || bloc;
  end if;

  if public.lecture_autorisee(p_etablissement_id, 'hotel_reservations.lire') then
    select coalesce(jsonb_agg(x), '[]') into bloc from (
      select 'reservation' as type, r.id, r.numero || ' · ' || r.nom_client as libelle,
        concat_ws(' · ', r.statut, r.telephone) as detail, 'hotel/' || r.id as route
      from public.hotel_reservations r
      where r.etablissement_id = p_etablissement_id and (r.numero ilike v_motif or r.nom_client ilike v_motif or r.telephone ilike v_motif)
      order by r.cree_le desc limit v_n) x;
    resultats := resultats || bloc;
  end if;

  if public.lecture_autorisee(p_etablissement_id, 'hotel_chambres.lire') then
    select coalesce(jsonb_agg(x), '[]') into bloc from (
      select 'chambre' as type, ch.id, 'Chambre ' || ch.numero as libelle, null::text as detail, 'chambres' as route
      from public.hotel_chambres ch
      where ch.etablissement_id = p_etablissement_id and ch.actif and ch.numero ilike v_motif
      order by ch.numero limit v_n) x;
    resultats := resultats || bloc;
  end if;

  if public.lecture_autorisee(p_etablissement_id, 'restaurant_salle.lire') then
    select coalesce(jsonb_agg(x), '[]') into bloc from (
      select 'table' as type, t.id, 'Table ' || t.nom as libelle, null::text as detail, 'salle' as route
      from public.rest_tables t
      where t.etablissement_id = p_etablissement_id and t.actif and t.nom ilike v_motif
      order by t.nom limit v_n) x;
    resultats := resultats || bloc;
  end if;

  if public.lecture_autorisee(p_etablissement_id, 'rh_employes.lire') then
    select coalesce(jsonb_agg(x), '[]') into bloc from (
      select 'employe' as type, e.id, concat_ws(' ', e.prenom, e.nom) as libelle, e.matricule as detail, 'employes/' || e.id as route
      from public.rh_employes e
      where e.etablissement_id = p_etablissement_id
        and (concat_ws(' ', e.prenom, e.nom) ilike v_motif or e.matricule ilike v_motif or e.telephone ilike v_motif)
      order by e.nom limit v_n) x;
    resultats := resultats || bloc;
  end if;

  if public.lecture_autorisee(p_etablissement_id, 'support_tickets.lire') then
    select coalesce(jsonb_agg(x), '[]') into bloc from (
      select 'ticket' as type, t.id, t.numero || ' · ' || t.sujet as libelle, concat_ws(' · ', t.nom_client, t.statut) as detail,
        'support/' || t.id as route
      from public.support_tickets t
      where t.etablissement_id = p_etablissement_id and (t.numero ilike v_motif or t.sujet ilike v_motif or t.nom_client ilike v_motif)
      order by t.cree_le desc limit v_n) x;
    resultats := resultats || bloc;
  end if;

  if public.lecture_autorisee(p_etablissement_id, 'crm_pipeline.lire') then
    select coalesce(jsonb_agg(x), '[]') into bloc from (
      select 'opportunite' as type, o.id, o.numero || ' · ' || o.titre as libelle, concat_ws(' · ', c.nom, o.statut) as detail,
        'crm/' || o.id as route
      from public.crm_opportunites o
      left join public.contacts c on c.id = o.contact_id
      where o.etablissement_id = p_etablissement_id and (o.numero ilike v_motif or o.titre ilike v_motif or c.nom ilike v_motif)
      order by o.cree_le desc limit v_n) x;
    resultats := resultats || bloc;
  end if;

  if public.lecture_autorisee(p_etablissement_id, 'projets.lire') then
    select coalesce(jsonb_agg(x), '[]') into bloc from (
      select 'projet' as type, p.id, p.numero || ' · ' || p.nom as libelle, p.statut as detail, 'projets/' || p.id as route
      from public.projets p
      where p.etablissement_id = p_etablissement_id and (p.numero ilike v_motif or p.nom ilike v_motif)
      order by p.cree_le desc limit v_n) x;
    resultats := resultats || bloc;
  end if;

  if public.lecture_autorisee(p_etablissement_id, 'achats.lire') then
    select coalesce(jsonb_agg(x), '[]') into bloc from (
      select 'commande_achat' as type, ca.id, ca.numero as libelle, concat_ws(' · ', f.nom, ca.statut) as detail, 'achats/' || ca.id as route
      from public.commandes_achat ca
      left join public.contacts f on f.id = ca.fournisseur_id
      where ca.etablissement_id = p_etablissement_id and (ca.numero ilike v_motif or f.nom ilike v_motif or ca.reference_fournisseur ilike v_motif)
      order by ca.cree_le desc limit v_n) x;
    resultats := resultats || bloc;
  end if;

  if public.lecture_autorisee(p_etablissement_id, 'agenda.lire') then
    select coalesce(jsonb_agg(x), '[]') into bloc from (
      select 'rendez_vous' as type, r.id, r.numero || ' · ' || r.titre as libelle,
        concat_ws(' · ', coalesce(c.nom, r.nom_client), to_char(r.debut, 'DD/MM/YYYY HH24:MI')) as detail, 'agenda/' || r.id as route
      from public.agenda_rendez_vous r
      left join public.contacts c on c.id = r.contact_id
      where r.etablissement_id = p_etablissement_id
        and (r.numero ilike v_motif or r.titre ilike v_motif or r.nom_client ilike v_motif or c.nom ilike v_motif)
      order by r.debut desc limit v_n) x;
    resultats := resultats || bloc;
  end if;

  return resultats;
end
$$;

revoke execute on function public.recherche_universelle(uuid, text, integer) from public, anon;
grant execute on function public.recherche_universelle(uuid, text, integer) to authenticated;

notify pgrst, 'reload schema';
