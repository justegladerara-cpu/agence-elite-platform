-- Démonstration des modules métier ajoutés à « Commerce Démo » (RH, documents, puis les suivants).
-- Toutes les données sont fictives. Exécuté après commerce_demo.sql, en local (PGlite) et en production
-- (workflow « Démo et comptes »). Chaque section est idempotente : elle ne fait rien si ses données existent.
-- Comme commerce_demo.sql, tout passe par les fonctions de la plateforme, dans la peau d'un utilisateur fictif.

-- ---------------------------------------------------------------------------
-- RH et documents
-- ---------------------------------------------------------------------------
do $$
declare
  etab uuid;
  sa uuid;
  gerante uuid;
  caisse_marche uuid;
  depotier uuid;
  compta uuid;
  userdemo uuid;
  hub_mp uuid;
  hub_bmt uuid;
  hub_dep uuid;
  dep jsonb := '{}'::jsonb;
  poste jsonb := '{}'::jsonb;
  emp jsonb := '{}'::jsonb;
  horaire uuid;
  horaire_depot uuid;
  ligne record;
  id_tmp uuid;
  v_jour date;
  rang integer := 0;
  aujourdhui date;
  dossier uuid;
  m text;
begin
  select id into etab from public.etablissements where nom = 'Commerce Démo' order by cree_le limit 1;
  if etab is null or exists (select 1 from public.rh_employes where etablissement_id = etab) then
    return;
  end if;
  select u.id into sa from auth.users u join public.plateforme_admins a on a.user_id = u.id
  where a.role = 'super_admin' and a.actif order by u.created_at limit 1;
  select id into gerante from auth.users where email = 'gerante@demo.agence-elite.fr';
  select id into caisse_marche from auth.users where email = 'caisse-marche@demo.agence-elite.fr';
  select id into depotier from auth.users where email = 'depot@demo.agence-elite.fr';
  select id into compta from auth.users where email = 'compta@demo.agence-elite.fr';
  select user_id into userdemo from public.comptes_connexion where lower(identifiant) = 'userdemo';
  select id into hub_mp from public.hubs where etablissement_id = etab and code = 'MP';
  select id into hub_bmt from public.hubs where etablissement_id = etab and code = 'BMT';
  select id into hub_dep from public.hubs where etablissement_id = etab and code = 'DEP';
  aujourdhui := public.date_locale(etab);

  -- 1. Le super administrateur accorde et active les modules (hors offre, comme une option vendue).
  perform set_config('request.jwt.claims', json_build_object('sub', sa, 'role', 'authenticated')::text, true);
  foreach m in array array['rh_employes', 'rh_presences', 'rh_conges', 'documents'] loop
    perform public.accorder_module(etab, m, true);
    perform public.definir_module_etablissement(etab, m, true);
  end loop;

  -- 2. Organisation (la gérante).
  perform set_config('request.jwt.claims', json_build_object('sub', gerante, 'role', 'authenticated')::text, true);
  for ligne in select * from (values ('Direction', 'DIR'), ('Ventes', 'VEN'), ('Logistique', 'LOG'), ('Administration', 'ADM')) as t(nom, code) loop
    dep := dep || jsonb_build_object(ligne.code, public.rh_enregistrer_departement(etab, jsonb_build_object('nom', ligne.nom, 'code', ligne.code)));
  end loop;
  for ligne in select * from (values
    ('gerant', 'Gérante', 'DIR'), ('chef', 'Chef de boutique', 'VEN'), ('caissier', 'Caissier', 'VEN'),
    ('vendeur', 'Vendeuse', 'VEN'), ('magasinier', 'Magasinier', 'LOG'), ('livreur', 'Livreur', 'LOG'), ('comptable', 'Comptable', 'ADM')
  ) as t(cle, intitule, departement) loop
    poste := poste || jsonb_build_object(ligne.cle, public.rh_enregistrer_poste(etab, jsonb_build_object(
      'intitule', ligne.intitule, 'departement_id', dep ->> ligne.departement)));
  end loop;
  horaire := public.rh_enregistrer_horaire(etab, jsonb_build_object('nom', 'Boutique (lundi-samedi)', 'jours', (
    select jsonb_agg(jsonb_build_object('jour', j, 'debut', '08:00', 'fin', case when j = 6 then '14:00' else '18:00' end, 'pause', case when j = 6 then 0 else 60 end))
    from generate_series(1, 6) j)));
  horaire_depot := public.rh_enregistrer_horaire(etab, jsonb_build_object('nom', 'Dépôt (lundi-vendredi)', 'jours', (
    select jsonb_agg(jsonb_build_object('jour', j, 'debut', '07:00', 'fin', '16:00', 'pause', 60)) from generate_series(1, 5) j)));
  foreach v_jour in array array[make_date(extract(year from aujourdhui)::integer, 1, 1), make_date(extract(year from aujourdhui)::integer, 5, 1),
    make_date(extract(year from aujourdhui)::integer, 6, 10), make_date(extract(year from aujourdhui)::integer, 8, 15),
    make_date(extract(year from aujourdhui)::integer, 11, 1), make_date(extract(year from aujourdhui)::integer, 11, 28),
    make_date(extract(year from aujourdhui)::integer, 12, 25)] loop
    perform public.rh_enregistrer_jour_ferie(etab, v_jour, case extract(month from v_jour)::integer
      when 1 then 'Jour de l’An' when 5 then 'Fête du Travail' when 6 then 'Fête de la Réconciliation' when 8 then 'Fête de l’Indépendance'
      when 11 then case when extract(day from v_jour) = 1 then 'Toussaint' else 'Proclamation de la République' end else 'Noël' end, true);
  end loop;

  -- 3. Employés fictifs (la gérante d'abord : elle manage les autres).
  for ligne in select * from (values
    ('mireille', 'Mireille', 'Ngoma', 'F', 'DIR', 'gerant', null, 'MP', 'b', 900, 'cdi', 450000),
    ('junior', 'Junior', 'Mabiala', 'M', 'VEN', 'caissier', 'mireille', 'BMT', 'b', 400, 'cdi', 150000),
    ('grace', 'Grâce', 'Loubaki', 'F', 'VEN', 'vendeur', 'mireille', 'MP', 'b', 200, 'cdd', 120000),
    ('aristide', 'Aristide', 'Kouka', 'M', 'LOG', 'magasinier', 'mireille', 'DEP', 'd', 700, 'cdi', 160000),
    ('blaise', 'Blaise', 'Moukoko', 'M', 'LOG', 'livreur', 'aristide', 'DEP', 'd', 60, 'journalier', 5000),
    ('prisca', 'Prisca', 'Okemba', 'F', 'ADM', 'comptable', 'mireille', 'MP', 'b', 500, 'cdi', 300000),
    ('sandra', 'Sandra', 'Tchibinda', 'F', 'VEN', 'chef', 'mireille', 'BMT', 'b', 30, 'cdi', 220000)
  ) as t(cle, prenom, nom, sexe, departement, poste_cle, manager, hub_code, horaire_cle, anciennete, contrat, salaire) loop
    rang := rang + 1;
    id_tmp := public.rh_enregistrer_employe(etab, jsonb_build_object(
      'prenom', ligne.prenom, 'nom', ligne.nom, 'sexe', ligne.sexe, 'departement_id', dep ->> ligne.departement,
      'poste_id', poste ->> ligne.poste_cle, 'manager_id', emp ->> ligne.manager,
      'hub_id', (select id from public.hubs where etablissement_id = etab and code = ligne.hub_code),
      'horaire_id', case ligne.horaire_cle when 'b' then horaire else horaire_depot end,
      'date_entree', aujourdhui - ligne.anciennete, 'telephone', '+242 06 100 00 ' || lpad(rang::text, 2, '0'),
      'prive', jsonb_build_object('nationalite', 'Congolaise', 'adresse', 'Pointe-Noire (fictif)', 'contact_urgence_nom', 'Contact fictif',
        'contact_urgence_telephone', '+242 05 999 00 00')));
    emp := emp || jsonb_build_object(ligne.cle, id_tmp);
    perform public.rh_enregistrer_contrat(etab, jsonb_build_object(
      'employe_id', id_tmp, 'type', ligne.contrat, 'poste_id', poste ->> ligne.poste_cle, 'debut', aujourdhui - ligne.anciennete,
      'fin', case when ligne.contrat = 'cdd' then aujourdhui + 20 end,
      'fin_periode_essai', case when ligne.anciennete < 90 then aujourdhui - ligne.anciennete + 90 end,
      'salaire_base', ligne.salaire, 'periodicite', case when ligne.contrat = 'journalier' then 'journalier' else 'mensuel' end,
      'heures_hebdo', case when ligne.horaire_cle = 'b' then 51 else 40 end));
  end loop;
  perform public.rh_enregistrer_departement(etab, jsonb_build_object('id', dep ->> 'VEN', 'nom', 'Ventes', 'code', 'VEN', 'responsable_id', emp ->> 'sandra'));
  perform public.rh_enregistrer_departement(etab, jsonb_build_object('id', dep ->> 'LOG', 'nom', 'Logistique', 'code', 'LOG', 'responsable_id', emp ->> 'aristide'));
  perform public.rh_lier_compte(etab, (emp ->> 'mireille')::uuid, gerante);
  perform public.rh_lier_compte(etab, (emp ->> 'junior')::uuid, caisse_marche);
  perform public.rh_lier_compte(etab, (emp ->> 'aristide')::uuid, depotier);
  perform public.rh_lier_compte(etab, (emp ->> 'prisca')::uuid, compta);
  if userdemo is not null and exists (select 1 from public.etablissement_membres where etablissement_id = etab and user_id = userdemo) then
    perform public.rh_lier_compte(etab, (emp ->> 'grace')::uuid, userdemo);
  end if;

  -- 4. Pointages des dix derniers jours ouvrés (saisis par la gérante), quelques retards.
  for v_jour in select d::date from generate_series(aujourdhui - 14, aujourdhui - 1, interval '1 day') d
              where extract(isodow from d) between 1 and 6 loop
    for ligne in select * from (values
      ('junior', '08:05', '18:02'), ('grace', '07:55', '18:00'), ('sandra', '07:50', '18:10'), ('prisca', '08:00', '17:30'),
      ('aristide', '06:55', '16:05'), ('blaise', '07:20', '16:00')) as t(cle, arrivee, depart) loop
      continue when extract(isodow from v_jour) = 6 and ligne.cle in ('aristide', 'blaise');
      continue when exists (select 1 from public.rh_jours_feries where etablissement_id = etab and jour = v_jour and actif);
      perform public.rh_enregistrer_pointage(etab, jsonb_build_object(
        'employe_id', emp ->> ligne.cle, 'jour', v_jour,
        'arrivee', case when ligne.cle = 'blaise' and extract(day from v_jour)::integer % 3 = 0 then '07:40' else ligne.arrivee end,
        'depart', case when extract(isodow from v_jour) = 6 then '14:00' else ligne.depart end));
    end loop;
  end loop;

  -- 5. Congés : un congé approuvé à venir, une demande en attente (Grâce, compte User démo), une maladie passée.
  perform public.rh_demander_absence(etab, jsonb_build_object('employe_id', emp ->> 'sandra', 'type', 'conge_paye',
    'debut', aujourdhui + 10, 'fin', aujourdhui + 14, 'motif', 'Congé annuel', 'approuver', true));
  perform public.rh_demander_absence(etab, jsonb_build_object('employe_id', emp ->> 'aristide', 'type', 'maladie',
    'debut', aujourdhui - 20, 'fin', aujourdhui - 19, 'motif', 'Certificat médical fourni', 'approuver', true));
  perform public.rh_demander_absence(etab, jsonb_build_object('employe_id', emp ->> 'grace', 'type', 'conge_paye',
    'debut', aujourdhui + 21, 'fin', aujourdhui + 23, 'motif', 'Mariage d’une cousine'));

  -- 6. Bibliothèque de documents (dossiers ; les fichiers s'ajoutent depuis l'écran).
  perform set_config('request.jwt.claims', json_build_object('sub', gerante, 'role', 'authenticated')::text, true);
  dossier := public.enregistrer_dossier(etab, jsonb_build_object('nom', 'Procédures', 'description', 'Ouverture, clôture de caisse, réception de marchandise'));
  perform public.enregistrer_dossier(etab, jsonb_build_object('nom', 'Caisse', 'parent_id', dossier));
  perform public.enregistrer_dossier(etab, jsonb_build_object('nom', 'Modèles de documents', 'description', 'Contrats types, attestations'));
  perform public.enregistrer_dossier(etab, jsonb_build_object('nom', 'Règlement intérieur'));
  perform set_config('request.jwt.claims', '', true);
end
$$;
