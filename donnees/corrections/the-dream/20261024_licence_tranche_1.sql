-- The Dream : E-Zéro Fuite (300 000 FCFA/an) payé en 3 tranches de 100 000 FCFA (contrat AE-LOG-TD-2026-01).
-- Tranche 1 reçue en espèces le 24/10/2026. Demandé par Juste le 24/10/2026 : activer tout de suite, accès jusqu'au
-- dimanche 1er novembre 2026 à 12h00 (Brazzaville) = 11h00 UTC. Ensuite, coupure automatique (migration 154) sauf si un
-- code est saisi (tranche 2 : 1 semaine ; tranche 3 : licence annuelle).
-- Exécutée UNIQUEMENT par le workflow « Corriger des données » (simulation puis appliquer + JE CONFIRME, après sauvegarde).
-- Aucune suppression : l'essai coupé est terminé (historique gardé), la nouvelle licence le remplace.
\set ON_ERROR_STOP on
begin;
set local statement_timeout = '60s';

do $$
declare
  etab uuid;
  essai public.licences%rowtype;
  nouvelle uuid;
  fin timestamptz := '2026-11-01 11:00:00+00';
  texte text := 'Licence E-Zéro Fuite activée : tranche 1 sur 3 reçue (100 000 FCFA). Accès ouvert jusqu''au dimanche 1er novembre 2026 '
    || 'à 12h00 (heure de Brazzaville). Au paiement de la tranche 2, Agence Elite vous remet un code à entrer dans Paramètres › Mon abonnement.';
  n integer;
begin
  select e.id into etab from public.etablissements e
  where e.id = 'b82a598d-c956-4f00-89f5-5b7bf0f13bf5' and e.nom = 'The Dream Lounge Bar Restaurant';
  if etab is null then raise exception 'Établissement introuvable : arrêt'; end if;

  select * into essai from public.licences where etablissement_id = etab and statut <> 'terminee';
  if essai.id is distinct from '2d4aeacf-79a5-4a91-92d3-53f3057df4ca'::uuid or essai.formule <> 'essai' or essai.statut <> 'active' then
    raise exception 'État inattendu de la licence en cours (%, %, %) : arrêt', essai.id, essai.formule, essai.statut;
  end if;

  update public.licences
  set statut = 'terminee', motif_statut = 'Remplacée : E-Zéro Fuite, tranche 1/3 payée le 24/10/2026'
  where id = essai.id;
  insert into public.licence_evenements(licence_id, etablissement_id, type, ancienne_echeance, nouvelle_echeance, montant, motif)
  values (essai.id, etab, 'fin', essai.echeance, current_date, 0, 'Remplacée par E-Zéro Fuite (paiement en 3 tranches)');

  insert into public.licences(etablissement_id, offre_id, formule, debut, echeance, fin_a, modules_supplementaires, montant, devise, note, support, appareils_max)
  values (etab, essai.offre_id, 'mensuel', current_date, '2026-11-01', fin, essai.modules_supplementaires, 100000, essai.devise,
          'E-Zéro Fuite 300 000 FCFA/an en 3 tranches (contrat AE-LOG-TD-2026-01). Tranche 1/3 : 100 000 FCFA espèces le 24/10/2026. Accès jusqu''au 01/11/2026 12h00 (Brazzaville).',
          essai.support, 3)
  returning id into nouvelle;
  insert into public.licence_evenements(licence_id, etablissement_id, type, nouvelle_echeance, montant, reference, motif)
  values (nouvelle, etab, 'attribution', '2026-11-01', 100000, 'Espèces 24/10/2026 · tranche 1/3',
          'E-Zéro Fuite, tranche 1/3 payée : accès jusqu''au 01/11/2026 12h00 (Brazzaville)');
  perform public.synchroniser_modules_licence(etab);

  perform public.notifier(r, etab, 'licence.echeance', 'Licence activée jusqu''au 1er novembre 12h00', texte, 'parametres/licence')
  from public.membres_avec_permission(etab, 'etablissement.modifier') r;

  select count(*) into n from public.licences where etablissement_id = etab and statut <> 'terminee';
  if n <> 1 then raise exception 'Résultat inattendu : % licences en cours : arrêt', n; end if;
  if public.licence_coupee(etab) or not public.licence_valide(etab) or not public.caisse_continue(etab) then
    raise exception 'Résultat inattendu : licence toujours coupée : arrêt';
  end if;
  raise notice 'Résultat : licence % active jusqu''au 01/11/2026, coupure à % ; essai % terminé', nouvelle, fin, essai.id;
end
$$;

\if :appliquer
  commit;
  \echo 'APPLIQUÉ.'
\else
  rollback;
  \echo 'SIMULATION : tout a été annulé, rien n''est écrit.'
\endif
