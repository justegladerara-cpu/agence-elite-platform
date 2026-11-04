-- The Dream : activer le code 1/3 (ELITE-COM-QKX3-65AC, « E-Zéro Fuite · 1 semaine ») directement sur l'établissement,
-- sans saisie par le client. Demandé par Juste le 24/10/2026 (« Attache la licence directement à The Dream »).
-- Même effet que activer_cle_licence : clé marquée activée, licence en cours remplacée (historique gardé) par
-- 8 jours, échéance 01/11/2026, coupure à 12h00 (Brazzaville).
-- Exécutée UNIQUEMENT par le workflow « Corriger des données » (simulation puis appliquer + JE CONFIRME).
\set ON_ERROR_STOP on
begin;
set local statement_timeout = '60s';

do $$
declare
  etab uuid;
  k public.licence_cles%rowtype;
  modele public.licence_modeles%rowtype;
  v_licence uuid;
  l public.licences%rowtype;
  n integer;
begin
  select e.id into etab from public.etablissements e
  where e.id = 'b82a598d-c956-4f00-89f5-5b7bf0f13bf5' and e.nom = 'The Dream Lounge Bar Restaurant';
  if etab is null then raise exception 'Établissement introuvable : arrêt'; end if;

  select * into k from public.licence_cles where cle = 'ELITE-COM-QKX3-65AC' for update;
  if k.id is null or k.statut <> 'disponible' then raise exception 'Code 1 introuvable ou déjà utilisé : arrêt'; end if;
  select * into modele from public.licence_modeles where id = k.modele_id;
  if not coalesce(modele.coupure_midi, false) or modele.duree_jours <> 8 then raise exception 'Modèle inattendu : arrêt'; end if;

  update public.licence_cles set statut = 'activee', etablissement_id = etab, activee_le = now(),
    note = coalesce(note, '') || ' · activé par Agence Elite le 24/10/2026 (demande de Juste)'
  where id = k.id;
  v_licence := public.poser_licence_modele(etab, modele, k.id, k.cle);
  update public.licence_cles set licence_id = v_licence where id = k.id;

  perform public.notifier(r, etab, 'licence.echeance', 'Licence E-Zéro Fuite activée',
    'Tranche 1 sur 3 reçue. Votre accès est ouvert jusqu''au dimanche 1er novembre 2026 à 12h00 (heure de Brazzaville). '
    || 'Au paiement de la tranche 2, Agence Elite vous remet le code suivant.', 'parametres/licence')
  from public.membres_avec_permission(etab, 'etablissement.modifier') r;

  select * into l from public.licences where id = v_licence;
  select count(*) into n from public.licences where etablissement_id = etab and statut <> 'terminee';
  if n <> 1 or l.echeance <> date '2026-11-01' or l.fin_a <> timestamptz '2026-11-01 11:00:00+00' then
    raise exception 'Résultat inattendu (% en cours, échéance %, coupure %) : arrêt', n, l.echeance, l.fin_a;
  end if;
  if public.licence_coupee(etab) or not public.licence_valide(etab) then raise exception 'Licence coupée : arrêt'; end if;
  raise notice 'Résultat : code 1 activé, licence % jusqu''au 01/11/2026 12h00 (Brazzaville)', v_licence;
end
$$;

\if :appliquer
  commit;
  \echo 'APPLIQUÉ.'
\else
  rollback;
  \echo 'SIMULATION : tout a été annulé, rien n''est écrit.'
\endif
