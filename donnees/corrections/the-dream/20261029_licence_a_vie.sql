-- The Dream : licence À VIE à partir du 29/10/2026, demandée par Juste le 29/10/2026 (« active la licence à vie,
-- ils ne doivent plus avoir d'arrêt »). Plus d'échéance, plus d'heure de coupure (fin_a), plus de tranche.
-- Comment : la licence en cours (code d'une semaine E-Zéro Fuite) est terminée (historique gardé) et remplacée par une
-- licence « acquisition » sans échéance ni fin_a : licence_valide() est vraie pour toujours, licence_coupee() fausse.
-- Les codes d'une semaine encore disponibles du contrat AE-LOG-TD-2026-01 sont bloqués : saisis par erreur, ils
-- remplaceraient la licence à vie par une licence de 8 jours.
-- Exécutée par le workflow « Corriger des données » (simulation = tout est annulé ; appliquer = JE CONFIRME).
-- Aucune suppression. Le script s'arrête si l'état n'est pas celui attendu ; relancé une 2e fois, il ne change rien.
\set ON_ERROR_STOP on
begin;
set local statement_timeout = '60s';

do $$
declare
  etab uuid;
  enCours public.licences%rowtype;
  vie uuid;
  n integer;
  motif text := 'Licence à vie accordée par Agence Elite le 29/10/2026 (contrat AE-LOG-TD-2026-01)';
begin
  select e.id into etab from public.etablissements e join public.clients c on c.id = e.client_id
  where e.id = 'b82a598d-c956-4f00-89f5-5b7bf0f13bf5' and e.nom = 'The Dream Lounge Bar Restaurant';
  if etab is null then raise exception 'Établissement introuvable : arrêt'; end if;

  select count(*) into n from public.licences where etablissement_id = etab and statut <> 'terminee';
  if n > 1 then raise exception 'État inattendu : % licences en cours : arrêt', n; end if;
  select * into enCours from public.licences where etablissement_id = etab and statut <> 'terminee';

  if enCours.id is not null and enCours.formule = 'acquisition' and enCours.echeance is null
     and enCours.fin_a is null and enCours.statut = 'active' then
    raise notice 'Déjà à vie (licence %) : rien à faire', enCours.id;
    vie := enCours.id;
  else
    if enCours.id is not null then
      raise notice 'Licence en cours remplacée : % (%, statut %, échéance %, fin_a %)',
        enCours.id, enCours.formule, enCours.statut, enCours.echeance, enCours.fin_a;
      update public.licences set statut = 'terminee', motif_statut = 'Remplacée par une licence à vie (29/10/2026)'
      where id = enCours.id;
      insert into public.licence_evenements(licence_id, etablissement_id, type, ancienne_echeance, nouvelle_echeance, montant, motif)
      values (enCours.id, etab, 'fin', enCours.echeance, current_date, 0, 'Remplacée par une licence à vie');
    end if;

    insert into public.licences(etablissement_id, offre_id, formule, debut, echeance, fin_a, statut, modules_supplementaires,
                                montant, devise, note, support, appareils_max)
    select etab, coalesce(enCours.offre_id, 'commerce-caisse'), 'acquisition', current_date, null, null, 'active',
           coalesce(enCours.modules_supplementaires, '{}'), 0, coalesce(enCours.devise, 'XAF'),
           'À vie : ' || motif, coalesce(enCours.support, false), enCours.appareils_max
    returning id into vie;
    insert into public.licence_evenements(licence_id, etablissement_id, type, nouvelle_echeance, montant, motif)
    values (vie, etab, 'attribution', null, 0, motif);
    perform public.synchroniser_modules_licence(etab);

    perform public.notifier(r, etab, 'licence.echeance', 'Licence à vie activée',
      'Votre licence est désormais à vie : plus d''échéance ni de coupure. Merci de votre confiance. Agence Elite.', 'parametres/licence')
    from public.membres_avec_permission(etab, 'etablissement.modifier') r;
    perform public.notifier(a.user_id, etab, 'licence.echeance_equipe', 'The Dream : licence à vie activée', motif, null)
    from public.plateforme_admins a where a.actif and a.role in ('super_admin', 'admin');
  end if;

  -- Codes encore disponibles du contrat The Dream : bloqués (ils écraseraient la licence à vie).
  update public.licence_cles
  set statut = 'bloquee', bloquee_le = now(), motif = 'Bloqué : The Dream est passé à la licence à vie le 29/10/2026'
  where statut = 'disponible'
    and (note ilike '%AE-LOG-TD-2026-01%' or client_nom ilike '%dream%');
  get diagnostics n = row_count;
  raise notice 'Codes The Dream bloqués : %', n;

  -- Contrôles finaux
  select count(*) into n from public.licences where etablissement_id = etab and statut <> 'terminee';
  if n <> 1 then raise exception 'Résultat inattendu : % licences en cours : arrêt', n; end if;
  if not public.licence_valide(etab) then raise exception 'Résultat inattendu : licence non valide : arrêt'; end if;
  if public.licence_coupee(etab) then raise exception 'Résultat inattendu : licence coupée : arrêt'; end if;
  raise notice 'Résultat : licence à vie % (acquisition, sans échéance, sans coupure) pour The Dream', vie;
end
$$;

\if :appliquer
  commit;
  \echo 'APPLIQUÉ.'
\else
  rollback;
  \echo 'SIMULATION : tout a été annulé, rien n''est écrit.'
\endif
