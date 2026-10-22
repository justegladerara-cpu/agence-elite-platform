-- The Dream : la licence annuelle (150 000 XAF, 07/10/2026 → 07/10/2027) n'a pas été payée ; seuls l'installation, la
-- formation et la configuration initiale l'ont été (50 000 FCFA). Demandé par Juste le 2026-10-22 : la licence se
-- termine le samedi 24/10/2026 à 12h00 heure de Brazzaville (11h00 UTC). À cette heure : déconnexion, plus de vente,
-- plus d'ouverture de caisse, plus de stock ; les données restent intactes (migration 20261022000154).
-- Exécutée UNIQUEMENT par le workflow « Corriger des données » (simulation = tout est annulé ; appliquer = JE CONFIRME,
-- après une sauvegarde). Aucune suppression : l'annuelle est terminée (historique gardé), un essai la remplace.
-- Le script s'arrête si l'état de la base n'est pas exactement celui constaté le 2026-10-22.
\set ON_ERROR_STOP on
begin;
set local statement_timeout = '60s';

do $$
declare
  etab uuid;
  annuelle public.licences%rowtype;
  essai uuid;
  fin timestamptz := '2026-10-24 11:00:00+00';
  texte text := 'Votre licence se termine le samedi 24 octobre 2026 à 12h00 (heure de Brazzaville). '
    || 'À cette heure, tous les comptes seront déconnectés : plus de vente, plus d''ouverture de caisse, plus de gestion du stock. '
    || 'Vos données restent intactes. Contactez Agence Elite pour la renouveler.';
  n integer;
begin
  select e.id into etab from public.etablissements e join public.clients c on c.id = e.client_id
  where e.id = 'b82a598d-c956-4f00-89f5-5b7bf0f13bf5' and e.nom = 'The Dream Lounge Bar Restaurant';
  if etab is null then raise exception 'Établissement introuvable : arrêt'; end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'licences' and column_name = 'fin_a') then
    raise exception 'Migration 20261022000154 absente : arrêt';
  end if;

  select * into annuelle from public.licences where etablissement_id = etab and statut <> 'terminee';
  if annuelle.id is distinct from 'bad1e754-d67e-49fd-9e64-15ef7a6b8314'::uuid or annuelle.formule <> 'annuel'
     or annuelle.statut <> 'active' or annuelle.echeance <> '2027-10-07' then
    raise exception 'État inattendu de la licence en cours (%, %, %, %) : arrêt', annuelle.id, annuelle.formule, annuelle.statut, annuelle.echeance;
  end if;
  if now() >= fin then raise exception 'L''heure de fin est déjà passée : arrêt'; end if;

  update public.licences
  set statut = 'terminee', motif_statut = 'Annuel non payé : remplacée par un essai jusqu''au 24/10/2026 12h00 (Brazzaville)'
  where id = annuelle.id;
  insert into public.licence_evenements(licence_id, etablissement_id, type, ancienne_echeance, nouvelle_echeance, montant, motif)
  values (annuelle.id, etab, 'fin', annuelle.echeance, current_date, 0, 'Annuel non payé (payé : installation, formation et configuration initiale, 50 000 FCFA)');

  insert into public.licences(etablissement_id, offre_id, formule, debut, echeance, fin_a, modules_supplementaires, montant, devise, note, support, appareils_max)
  values (etab, annuelle.offre_id, 'essai', current_date, '2026-10-24', fin, annuelle.modules_supplementaires, 0, annuelle.devise,
          'Essai jusqu''au samedi 24/10/2026 12h00 (Brazzaville) : annuel non payé', annuelle.support, annuelle.appareils_max)
  returning id into essai;
  insert into public.licence_evenements(licence_id, etablissement_id, type, nouvelle_echeance, montant, motif)
  values (essai, etab, 'attribution', '2026-10-24', 0, 'Essai jusqu''au 24/10/2026 12h00 (Brazzaville)');
  perform public.synchroniser_modules_licence(etab);

  -- Prévenir tout de suite les responsables (cloche) et l'équipe Agence Elite.
  perform public.notifier(r, etab, 'licence.echeance', 'Licence : fin le samedi 24/10 à 12h00', texte, 'parametres/licence')
  from public.membres_avec_permission(etab, 'etablissement.modifier') r;
  perform public.notifier(a.user_id, etab, 'licence.echeance_equipe', 'The Dream : fin de licence samedi 24/10 12h00',
    'Annuel non payé. Coupure automatique samedi 24/10 à 12h00 (Brazzaville).', null)
  from public.plateforme_admins a where a.actif and a.role in ('super_admin', 'admin');

  select count(*) into n from public.licences where etablissement_id = etab and statut <> 'terminee';
  if n <> 1 then raise exception 'Résultat inattendu : % licences en cours : arrêt', n; end if;
  if public.licence_coupee(etab) or not public.licence_valide(etab) then raise exception 'Résultat inattendu : licence déjà coupée : arrêt'; end if;
  raise notice 'Résultat : essai % jusqu''au %, coupure à % ; licence annuelle % terminée', essai, '2026-10-24', fin, annuelle.id;
end
$$;

\if :appliquer
  commit;
  \echo 'APPLIQUÉ.'
\else
  rollback;
  \echo 'SIMULATION : tout a été annulé, rien n''est écrit.'
\endif
