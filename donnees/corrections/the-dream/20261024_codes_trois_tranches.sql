-- The Dream : E-Zéro Fuite (300 000 FCFA/an) payé en 3 tranches de 100 000 FCFA (contrat AE-LOG-TD-2026-01).
-- Demandé par Juste le 24/10/2026 : 3 codes d'activation, que le gérant entre lui-même au fur et à mesure des paiements :
--   code 1 (tranche 1, payée en espèces le 24/10) : 8 jours, coupure le 8e jour à 12h00 (Brazzaville) ;
--   code 2 (tranche 2) : 8 jours, même coupure ;
--   code 3 (tranche 3) : licence annuelle E-Zéro Fuite, 12 mois, sans coupure.
-- Crée 2 modèles de licence (offre commerce-caisse, celle de The Dream : aucun module ne change) et 3 clés « disponibles ».
-- Rien n'est activé ici : la licence change seulement quand le gérant entre un code. Aucune suppression.
-- Exécutée UNIQUEMENT par le workflow « Corriger des données » (simulation puis appliquer + JE CONFIRME, après sauvegarde).
\set ON_ERROR_STOP on
begin;
set local statement_timeout = '60s';

do $$
declare
  semaine uuid;
  annuel uuid;
  v_cle text;
  i integer;
  client constant text := 'The Dream Lounge Bar Restaurant';
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'licence_modeles' and column_name = 'coupure_midi') then
    raise exception 'Migration 20261024130000 absente : arrêt';
  end if;
  if not exists (select 1 from public.etablissements where id = 'b82a598d-c956-4f00-89f5-5b7bf0f13bf5' and nom = client) then
    raise exception 'Établissement introuvable : arrêt';
  end if;
  if exists (select 1 from public.licence_cles where client_nom = client and note like 'Contrat AE-LOG-TD-2026-01%') then
    raise exception 'Codes déjà créés : arrêt';
  end if;

  select id into semaine from public.licence_modeles where nom = 'E-Zéro Fuite · 1 semaine (paiement en 3 fois)';
  if semaine is null then
    insert into public.licence_modeles(nom, description, offre_id, formule, duree_jours, montant, frais_installation, appareils_max, formule_suivante, actif, ordre, coupure_midi)
    values ('E-Zéro Fuite · 1 semaine (paiement en 3 fois)', 'Une tranche de 100 000 FCFA : 8 jours, coupure le 8e jour à 12h00 (Brazzaville).',
            'commerce-caisse', 'mensuel', 8, 100000, 0, null, 'annuel', true, 10, true)
    returning id into semaine;
  end if;
  select id into annuel from public.licence_modeles where nom = 'E-Zéro Fuite (1 an)';
  if annuel is null then
    insert into public.licence_modeles(nom, description, offre_id, formule, duree_jours, montant, frais_installation, appareils_max, formule_suivante, actif, ordre, coupure_midi)
    values ('E-Zéro Fuite (1 an)', 'Licence annuelle E-Zéro Fuite : 300 000 FCFA par an.', 'commerce-caisse', 'annuel', null, 300000, 0, null, null, true, 11, false)
    returning id into annuel;
  end if;

  for i in 1 .. 3 loop
    loop
      v_cle := 'ELITE-COM-' || public.partenaires_aleatoire(4) || '-' || public.partenaires_aleatoire(4);
      exit when not exists (select 1 from public.licence_cles k where k.cle = v_cle);
    end loop;
    insert into public.licence_cles(cle, modele_id, client_nom, note)
    values (v_cle, case when i < 3 then semaine else annuel end, client,
            'Contrat AE-LOG-TD-2026-01 · code ' || i || '/3 · tranche ' || i || ' (100 000 FCFA)'
            || case when i = 3 then ' · licence annuelle' else ' · 8 jours, coupure à midi' end);
  end loop;
  raise notice 'Résultat : modèles % (1 semaine) et % (1 an), 3 codes créés pour %', semaine, annuel, client;
end
$$;

\if :appliquer
  commit;
  \echo 'APPLIQUÉ.'
\else
  rollback;
  \echo 'SIMULATION : tout a été annulé, rien n''est écrit.'
\endif
