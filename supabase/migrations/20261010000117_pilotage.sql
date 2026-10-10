-- Pilotage (lot H, 2026-10-10) : une page de pilotage pour la direction, en lecture seule.
-- Rentabilité par client (chiffre, marge connue, heures passées, reste dû), par canal d'acquisition (origine du
-- contact ou de l'opportunité), prévision pondérée du pipeline, opportunités sans prochaine action, charge par
-- personne (tâches, retards, heures, relances) et engagements à risque (contrats et abonnements d'un client en
-- retard de paiement, qui finissent bientôt ou sont suspendus). Aucune table, aucune écriture.
-- Chaque partie n'est calculée que si le module est actif et lisible par l'utilisateur ; sinon elle vaut null.
-- Les ventes des Hubs que l'utilisateur ne peut pas lire sont exclues (ventes_rapport, lecture_hub).

insert into public.permissions (id, module_id, description) values
  ('rapports.pilotage', 'rapports', 'Voir le pilotage : rentabilité par client et par canal, prévision, charge par personne, engagements à risque')
on conflict (id) do nothing;
insert into public.role_permissions (role_id, permission_id)
select r, 'rapports.pilotage' from unnest(array['gerant', 'responsable']) r
on conflict do nothing;

-- Nom affichable d'un membre (interne).
create function public.nom_membre(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select nullif(btrim(pr.nom_complet), '') from public.profils pr where pr.id = p_user_id),
                  (select split_part(u.email, '@', 1) from auth.users u where u.id = p_user_id), 'Membre')
$$;

-- Reste dû échu par client : factures émises dont l'échéance (ou la date, sans échéance) est passée et dont la
-- vente n'est pas soldée (interne).
create function public.impayes_echus(p_etablissement_id uuid, p_jour date)
returns table (contact_id uuid, reste numeric, factures integer)
language sql
stable
security definer
set search_path = ''
as $$
  select d.contact_id, sum(v.total - v.montant_paye), count(*)::integer
  from public.documents_vente d join public.ventes v on v.id = d.vente_id
  where d.etablissement_id = p_etablissement_id and d.type = 'facture' and d.statut = 'emise'
    and v.statut = 'validee' and v.montant_paye < v.total
    and coalesce(d.echeance, d.date_document) < p_jour
    and public.lecture_hub(p_etablissement_id, d.hub_id)
  group by d.contact_id
$$;

create function public.rapport_pilotage(p_etablissement_id uuid, p_du date, p_au date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  tz text;
  auj date;
  v_debut timestamptz;
  v_fin timestamptz;
  v_crm boolean := public.lecture_autorisee(p_etablissement_id, 'crm_pipeline.lire');
  v_projets boolean := public.lecture_autorisee(p_etablissement_id, 'projets.lire');
  v_contrats boolean := public.lecture_autorisee(p_etablissement_id, 'contrats.lire');
  v_abonnements boolean := public.lecture_autorisee(p_etablissement_id, 'abonnements.lire');
  v_facturation boolean := public.lecture_autorisee(p_etablissement_id, 'facturation.lire');
  r_clients jsonb;
  r_canaux jsonb;
  r_prevision jsonb;
  r_sans_action jsonb;
  r_charge jsonb;
  r_engagements jsonb;
begin
  if not public.lecture_autorisee(p_etablissement_id, 'rapports.pilotage') then
    raise exception 'Permission refusée : rapports.pilotage' using errcode = '42501';
  end if;
  if p_du is null or p_au is null or p_au < p_du then
    raise exception 'Période invalide';
  end if;
  if p_au - p_du + 1 > 1100 then
    raise exception 'Période trop longue (3 ans au plus)';
  end if;
  select coalesce(e.fuseau, 'UTC') into tz from public.etablissements e where e.id = p_etablissement_id;
  auj := public.date_locale(p_etablissement_id);
  v_debut := p_du::timestamp at time zone tz;
  v_fin := (p_au + 1)::timestamp at time zone tz;

  -- 1. Rentabilité par client : ventes validées de la période (caisse, factures, boutique…), marge sur les lignes
  -- au coût d'achat connu, heures passées sur ses projets, reste dû échu aujourd'hui. 200 clients au plus.
  with v as (
    select x.id, x.contact_id, x.total from public.ventes_rapport(p_etablissement_id, p_du, p_au, null) x where x.contact_id is not null
  ),
  ventes_client as (select v.contact_id, count(*) ventes, sum(v.total) chiffre from v group by v.contact_id),
  marges as (
    select v.contact_id,
      sum(l.total - l.quantite * l.cout_unitaire) filter (where l.cout_unitaire is not null) marge,
      coalesce(sum(l.total) filter (where l.cout_unitaire is not null), 0) chiffre_cout_connu
    from v join public.lignes_vente l on l.vente_id = v.id group by v.contact_id
  ),
  temps as (
    select p.contact_id, sum(t.minutes) minutes
    from public.projet_temps t join public.projets p on p.id = t.projet_id
    where v_projets and t.etablissement_id = p_etablissement_id and t.statut = 'valide'
      and t.date_travail between p_du and p_au and p.contact_id is not null
    group by p.contact_id
  ),
  impayes as (select i.contact_id, i.reste from public.impayes_echus(p_etablissement_id, auj) i where v_facturation),
  ids as (select contact_id from ventes_client union select contact_id from temps)
  select coalesce(jsonb_agg(to_jsonb(t) order by t.chiffre desc, t.nom), '[]'::jsonb) into r_clients
  from (
    select c.id contact_id, coalesce(nullif(btrim(c.societe), ''), c.nom) nom, c.source,
      coalesce(vc.ventes, 0) ventes, coalesce(vc.chiffre, 0) chiffre,
      m.marge, coalesce(m.chiffre_cout_connu, 0) chiffre_cout_connu,
      case when v_projets then round(coalesce(tp.minutes, 0) / 60.0, 1) end heures,
      case when coalesce(tp.minutes, 0) > 0 then round(coalesce(vc.chiffre, 0) * 60 / tp.minutes, 2) end chiffre_par_heure,
      case when v_facturation then coalesce(ip.reste, 0) end reste_du_echu
    from ids
    join public.contacts c on c.id = ids.contact_id and c.etablissement_id = p_etablissement_id
    left join ventes_client vc on vc.contact_id = c.id
    left join marges m on m.contact_id = c.id
    left join temps tp on tp.contact_id = c.id
    left join impayes ip on ip.contact_id = c.id
    order by coalesce(vc.chiffre, 0) desc, 2
    limit 200
  ) t;

  -- 2. Par canal d'acquisition : origine du contact (ou de l'opportunité si elle est renseignée).
  with v as (
    select x.contact_id, x.total from public.ventes_rapport(p_etablissement_id, p_du, p_au, null) x where x.contact_id is not null
  ),
  lignes as (
    select coalesce(c.source, 'non_renseigne') canal, 1 nouveaux, 0 clients, 0::numeric chiffre,
      0 creees, 0 gagnees, 0 perdues, 0::numeric montant_gagne
    from public.contacts c
    where c.etablissement_id = p_etablissement_id and c.type <> 'fournisseur' and c.cree_le >= v_debut and c.cree_le < v_fin
    union all
    select coalesce(c.source, 'non_renseigne'), 0, 1, sum(v.total), 0, 0, 0, 0
    from v join public.contacts c on c.id = v.contact_id
    group by c.id, c.source
    union all
    select coalesce(o.source, c.source, 'non_renseigne'), 0, 0, 0,
      (o.cree_le >= v_debut and o.cree_le < v_fin)::integer,
      (o.statut = 'gagnee' and o.cloturee_le >= v_debut and o.cloturee_le < v_fin)::integer,
      (o.statut = 'perdue' and o.cloturee_le >= v_debut and o.cloturee_le < v_fin)::integer,
      case when o.statut = 'gagnee' and o.cloturee_le >= v_debut and o.cloturee_le < v_fin then o.montant else 0 end
    from public.crm_opportunites o join public.contacts c on c.id = o.contact_id
    where v_crm and o.etablissement_id = p_etablissement_id
      and ((o.cree_le >= v_debut and o.cree_le < v_fin) or (o.cloturee_le >= v_debut and o.cloturee_le < v_fin))
  )
  select coalesce(jsonb_agg(to_jsonb(t) order by t.chiffre desc, t.nouveaux desc, t.canal), '[]'::jsonb) into r_canaux
  from (
    select canal, sum(nouveaux)::integer nouveaux, sum(clients)::integer clients, sum(chiffre) chiffre,
      case when v_crm then sum(creees)::integer end opportunites,
      case when v_crm then sum(gagnees)::integer end gagnees,
      case when v_crm then sum(perdues)::integer end perdues,
      case when v_crm then sum(montant_gagne) end montant_gagne,
      case when v_crm and sum(gagnees) + sum(perdues) > 0 then round(sum(gagnees) * 100.0 / (sum(gagnees) + sum(perdues)), 1) end taux_conversion
    from lignes group by canal
  ) t;

  if v_crm then
    -- 3. Prévision pondérée : opportunités ouvertes par mois de signature prévue (montant × probabilité).
    select coalesce(jsonb_agg(jsonb_build_object('cle', t.cle, 'nombre', t.nombre, 'montant', t.montant, 'pondere', t.pondere)
      order by t.ordre), '[]'::jsonb) into r_prevision
    from (
      select case when o.cloture_prevue is null then 'sans_date' when o.cloture_prevue < auj then 'depassee'
                  else to_char(o.cloture_prevue, 'YYYY-MM') end cle,
        case when o.cloture_prevue is null then '9' when o.cloture_prevue < auj then '0'
             else '1' || to_char(o.cloture_prevue, 'YYYY-MM') end ordre,
        count(*)::integer nombre, sum(o.montant) montant, round(sum(o.montant * o.probabilite) / 100, 2) pondere
      from public.crm_opportunites o
      where o.etablissement_id = p_etablissement_id and o.statut = 'ouverte'
      group by 1, 2
    ) t;

    -- 4. Opportunités ouvertes sans aucune action à faire, la plus ancienne activité d'abord (100 au plus).
    select coalesce(jsonb_agg(to_jsonb(t) order by t.derniere_activite), '[]'::jsonb) into r_sans_action
    from (
      select o.id, o.numero, o.titre, coalesce(nullif(btrim(c.societe), ''), c.nom) contact, o.montant, o.cloture_prevue,
        o.derniere_activite, auj - public.date_locale(p_etablissement_id, o.derniere_activite) jours,
        public.nom_membre(o.responsable_id) responsable
      from public.crm_opportunites o join public.contacts c on c.id = o.contact_id
      where o.etablissement_id = p_etablissement_id and o.statut = 'ouverte'
        and not exists (select 1 from public.crm_activites a where a.opportunite_id = o.id and a.statut = 'a_faire')
      order by o.derniere_activite
      limit 100
    ) t;
  end if;

  -- 5. Charge par personne : membres actifs qui ont des tâches ouvertes, des heures sur la période ou des relances.
  if v_projets or v_crm then
    select coalesce(jsonb_agg(to_jsonb(t) order by t.retards desc, t.taches desc, t.nom), '[]'::jsonb) into r_charge
    from (
      select m.user_id, public.nom_membre(m.user_id) nom, m.role_id role,
        coalesce(tk.ouvertes, 0) taches, coalesce(tk.en_retard, 0) taches_en_retard,
        coalesce(tk.heures_estimees, 0) heures_estimees, round(coalesce(tm.minutes, 0) / 60.0, 1) heures_saisies,
        coalesce(ac.a_faire, 0) relances, coalesce(ac.en_retard, 0) relances_en_retard,
        coalesce(tk.en_retard, 0) + coalesce(ac.en_retard, 0) retards
      from public.etablissement_membres m
      left join lateral (
        select count(*)::integer ouvertes, (count(*) filter (where k.echeance < auj))::integer en_retard,
          coalesce(sum(k.estimation_heures), 0) heures_estimees
        from public.projet_taches k
        where v_projets and k.etablissement_id = p_etablissement_id and k.assigne_a = m.user_id
          and k.statut in ('a_faire', 'en_cours', 'en_revue')
      ) tk on true
      left join lateral (
        select sum(x.minutes) minutes from public.projet_temps x
        where v_projets and x.etablissement_id = p_etablissement_id and x.user_id = m.user_id and x.statut = 'valide'
          and x.date_travail between p_du and p_au
      ) tm on true
      left join lateral (
        select count(*)::integer a_faire, (count(*) filter (where a.echeance < now()))::integer en_retard
        from public.crm_activites a
        where v_crm and a.etablissement_id = p_etablissement_id and a.assigne_a = m.user_id and a.statut = 'a_faire'
      ) ac on true
      where m.etablissement_id = p_etablissement_id and m.actif
        and (coalesce(tk.ouvertes, 0) > 0 or coalesce(tm.minutes, 0) > 0 or coalesce(ac.a_faire, 0) > 0)
    ) t;
  end if;

  -- 6. Engagements à risque : contrats clients actifs et abonnements en cours dont le client a un retard de paiement,
  -- qui finissent dans les 60 jours sans reconduction, dont la date limite de préavis tombe dans les 30 jours,
  -- dont la fin est passée, ou suspendus.
  if v_contrats or v_abonnements then
    with impayes as (select i.contact_id, i.reste from public.impayes_echus(p_etablissement_id, auj) i where v_facturation),
    items as (
      select 'contrat' nature, k.id, k.numero, k.objet libelle, k.contact_id, k.montant, k.periodicite, k.fin, k.statut,
        array_remove(array[
          case when ip.reste > 0 then 'impaye' end,
          case when k.fin < auj then 'fin_depassee' end,
          case when not k.reconduction_tacite and k.fin between auj and auj + 60 then 'fin_proche' end,
          case when k.reconduction_tacite and k.fin - k.preavis_jours between auj and auj + 30 then 'preavis_proche' end
        ], null) raisons,
        coalesce(ip.reste, 0) reste_du_echu
      from public.contrats k left join impayes ip on ip.contact_id = k.contact_id
      where v_contrats and k.etablissement_id = p_etablissement_id and k.sens = 'client' and k.statut = 'actif'
      union all
      select 'abonnement', a.id, a.numero, f.nom, a.contact_id, a.prix, null, a.fin, a.statut,
        array_remove(array[
          case when ip.reste > 0 then 'impaye' end,
          case when a.statut = 'suspendu' then 'suspendu' end,
          case when a.fin < auj then 'fin_depassee' end,
          case when a.fin between auj and auj + 60 then 'fin_proche' end
        ], null),
        coalesce(ip.reste, 0)
      from public.abonnements a join public.abo_formules f on f.id = a.formule_id
      left join impayes ip on ip.contact_id = a.contact_id
      where v_abonnements and a.etablissement_id = p_etablissement_id and a.statut in ('actif', 'suspendu')
    )
    select coalesce(jsonb_agg(to_jsonb(t) order by t.reste_du_echu desc, t.fin nulls last, t.numero), '[]'::jsonb) into r_engagements
    from (
      select i.*, coalesce(nullif(btrim(c.societe), ''), c.nom) contact
      from items i join public.contacts c on c.id = i.contact_id
      where cardinality(i.raisons) > 0
      limit 200
    ) t;
  end if;

  return jsonb_build_object(
    'du', p_du, 'au', p_au, 'aujourdhui', auj,
    'clients', r_clients, 'canaux', r_canaux, 'prevision', r_prevision, 'sans_action', r_sans_action,
    'charge', r_charge, 'engagements', r_engagements
  );
end
$$;

revoke execute on function public.nom_membre(uuid) from public, anon, authenticated;
revoke execute on function public.impayes_echus(uuid, date) from public, anon, authenticated;
revoke execute on function public.rapport_pilotage(uuid, date, date) from public, anon;
grant execute on function public.rapport_pilotage(uuid, date, date) to authenticated;

notify pgrst, 'reload schema';
