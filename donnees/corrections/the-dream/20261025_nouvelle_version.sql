-- The Dream : allume la nouvelle version (écrans en tuiles, centre de commande, encaissement MTN / Airtel / espèces /
-- TPE, noir et or). Demandé par Juste le 2026-10-25 (« Tu mets tout en ligne… je veux que tout soit prêt dans The Dream »).
-- Exécutée UNIQUEMENT par le workflow « Corriger des données » (simulation = tout est annulé ; appliquer = JE CONFIRME).
-- Seulement des réglages (etablissement_parametres), fusionnés avec ceux qui existent : aucune vente, aucun stock,
-- aucun compte touché. Pour revenir en arrière : remettre "nouvelle_version" à false dans le même réglage.
-- Le script s'arrête si l'établissement ou la migration 20261025200000 manquent.
\set ON_ERROR_STOP on
begin;
set local statement_timeout = '60s';

do $$
declare
  etab uuid;
  avant jsonb;
begin
  select e.id into etab from public.etablissements e
  where e.id = 'b82a598d-c956-4f00-89f5-5b7bf0f13bf5' and e.nom = 'The Dream Lounge Bar Restaurant';
  if etab is null then raise exception 'Établissement introuvable : arrêt'; end if;
  if not exists (select 1 from public.modules m, jsonb_array_elements(m.parametres_schema) d
                 where m.id = 'etablissement' and d ->> 'cle' = 'nouvelle_version') then
    raise exception 'Migration 20261025200000 absente : arrêt';
  end if;
  if not exists (select 1 from pg_proc where proname = 'pilotage_bar') then
    raise exception 'Fonction pilotage_bar absente : arrêt';
  end if;

  -- Établissement : nouvelle version, noir et or (nuit), boîte à suggestions ouverte.
  select data into avant from public.etablissement_parametres where etablissement_id = etab and module_id = 'etablissement';
  raise notice 'Réglages établissement avant : %', coalesce(avant, '{}'::jsonb);
  insert into public.etablissement_parametres(etablissement_id, module_id, data)
  values (etab, 'etablissement', jsonb_build_object('nouvelle_version', true, 'apparence', jsonb_build_object('theme', 'dream', 'mode', 'nuit'),
          'suggestions_actives', true))
  on conflict (etablissement_id, module_id) do update
  set data = public.etablissement_parametres.data || jsonb_build_object('nouvelle_version', true,
        'apparence', coalesce(public.etablissement_parametres.data -> 'apparence', '{}'::jsonb) || jsonb_build_object('theme', 'dream'),
        'suggestions_actives', coalesce(public.etablissement_parametres.data -> 'suggestions_actives', 'true'::jsonb));

  -- Caisse : les 4 moyens de The Dream (les autres existent, éteints) ; « Qui a servi ? » proposé ; présence éteinte
  -- (le gérant l'allume dans Paramètres › Ma caisse). Les réglages déjà là sont gardés.
  select data into avant from public.etablissement_parametres where etablissement_id = etab and module_id = 'caisse';
  raise notice 'Réglages caisse avant : %', coalesce(avant, '{}'::jsonb);
  insert into public.etablissement_parametres(etablissement_id, module_id, data)
  values (etab, 'caisse', '{}'::jsonb)
  on conflict (etablissement_id, module_id) do nothing;
  update public.etablissement_parametres
  set data = jsonb_build_object(
      'moyens_encaissement', '[
        {"id":"mtn","libelle":"MTN Mobile Money","mode":"mobile_money","actif":true,"reference":"obligatoire","couleur":"#FFCB05"},
        {"id":"airtel","libelle":"Airtel Money","mode":"mobile_money","actif":true,"reference":"obligatoire","couleur":"#E4002B"},
        {"id":"especes","libelle":"Espèces","mode":"especes","actif":true,"reference":"non","couleur":"#2FBF71"},
        {"id":"tpe","libelle":"Carte (TPE)","mode":"carte","actif":true,"reference":"facultative","couleur":"#8AA4FF"},
        {"id":"virement","libelle":"Virement","mode":"virement","actif":false,"reference":"facultative","couleur":"#A39E93"},
        {"id":"cheque","libelle":"Chèque","mode":"cheque","actif":false,"reference":"facultative","couleur":"#A39E93"}
      ]'::jsonb,
      'qui_a_servi', 'rappel') || data
  where etablissement_id = etab and module_id = 'caisse';

  if not exists (select 1 from public.etablissement_parametres where etablissement_id = etab and module_id = 'etablissement'
                 and (data ->> 'nouvelle_version')::boolean) then
    raise exception 'Résultat inattendu : nouvelle version pas allumée : arrêt';
  end if;
  if jsonb_array_length((select data -> 'moyens_encaissement' from public.etablissement_parametres where etablissement_id = etab and module_id = 'caisse')) < 4 then
    raise exception 'Résultat inattendu : moyens d''encaissement absents : arrêt';
  end if;
  raise notice 'The Dream : nouvelle version allumée.';
end
$$;

\if :appliquer
  commit;
  \echo 'APPLIQUÉ.'
\else
  rollback;
  \echo 'SIMULATION : tout a été annulé, rien n''est écrit.'
\endif
