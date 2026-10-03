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

-- ---------------------------------------------------------------------------
-- Facturation : devis, factures (payée en partie, en retard, brouillon), avoir
-- ---------------------------------------------------------------------------
do $$
declare
  etab uuid;
  sa uuid;
  gerante uuid;
  compta uuid;
  hub_dep uuid;
  hotel uuid;
  ecole uuid;
  restaurant uuid;
  riz uuid;
  huile uuid;
  eau uuid;
  livraison uuid;
  d uuid;
  f uuid;
  aujourdhui date;
begin
  select id into etab from public.etablissements where nom = 'Commerce Démo' order by cree_le limit 1;
  if etab is null or exists (select 1 from public.documents_vente where etablissement_id = etab) then
    return;
  end if;
  select u.id into sa from auth.users u join public.plateforme_admins a on a.user_id = u.id
  where a.role = 'super_admin' and a.actif order by u.created_at limit 1;
  select id into gerante from auth.users where email = 'gerante@demo.agence-elite.fr';
  select id into compta from auth.users where email = 'compta@demo.agence-elite.fr';
  select id into hub_dep from public.hubs where etablissement_id = etab and code = 'DEP';
  select id into restaurant from public.contacts where etablissement_id = etab and nom = 'Restaurant Démo (compte)';
  select id into riz from public.articles where etablissement_id = etab and reference = 'RIZ-25';
  select id into huile from public.articles where etablissement_id = etab and reference = 'HUI-05';
  select id into eau from public.articles where etablissement_id = etab and reference = 'EAU-15';
  select id into livraison from public.articles where etablissement_id = etab and reference = 'LIV-01';
  aujourdhui := public.date_locale(etab);

  perform set_config('request.jwt.claims', json_build_object('sub', sa, 'role', 'authenticated')::text, true);
  perform public.accorder_module(etab, 'facturation', true);
  perform public.definir_module_etablissement(etab, 'facturation', true);

  perform set_config('request.jwt.claims', json_build_object('sub', gerante, 'role', 'authenticated')::text, true);
  perform public.enregistrer_parametres_module(etab, 'facturation', jsonb_build_object('delai_paiement_jours', 30, 'validite_devis_jours', 15,
    'tva_par_defaut', 0, 'conditions_paiement', 'Paiement à 30 jours par virement ou Mobile Money.',
    'mentions_factures', 'Données de démonstration : documents fictifs.'));
  hotel := public.enregistrer_contact(etab, jsonb_build_object('nom', 'M. Ibara (économat)', 'societe', 'Hôtel Démo Côte Sauvage', 'type', 'client',
    'identifiant_fiscal', 'M0000HOTEL01X', 'telephone', '+242 05 000 00 20', 'adresse', 'Côte Sauvage, Pointe-Noire'));
  ecole := public.enregistrer_contact(etab, jsonb_build_object('nom', 'Mme Bouanga', 'societe', 'École Démo Les Palmiers', 'type', 'client',
    'telephone', '+242 05 000 00 21', 'adresse', 'Quartier Loandjili, Pointe-Noire'));

  -- Devis envoyé (en attente) à l'école.
  d := public.enregistrer_document_vente(etab, jsonb_build_object('type', 'devis', 'contact_id', ecole, 'objet', 'Cantine : riz et huile du trimestre',
    'lignes', jsonb_build_array(jsonb_build_object('article_id', riz, 'quantite', 10), jsonb_build_object('article_id', huile, 'quantite', 6),
      jsonb_build_object('article_id', livraison, 'quantite', 3))));
  perform public.changer_statut_devis(d, 'envoye');

  -- Devis accepté par l'hôtel, facturé, payé en partie (livraison depuis le dépôt).
  d := public.enregistrer_document_vente(etab, jsonb_build_object('type', 'devis', 'contact_id', hotel, 'hub_id', hub_dep, 'objet', 'Eau minérale pour les chambres',
    'lignes', jsonb_build_array(jsonb_build_object('article_id', eau, 'quantite', 20, 'remise', 4000),
      jsonb_build_object('libelle', 'Livraison et mise en place', 'quantite', 1, 'prix_unitaire', 5000))));
  perform public.changer_statut_devis(d, 'envoye');
  perform public.changer_statut_devis(d, 'accepte');
  f := public.convertir_devis(d);
  perform public.emettre_facture(f);
  perform set_config('request.jwt.claims', json_build_object('sub', compta, 'role', 'authenticated')::text, true);
  perform public.encaisser_facture(f, 25000, 'virement', 'VIR-DEMO-001');

  -- Facture ancienne, en retard, au restaurant.
  perform set_config('request.jwt.claims', json_build_object('sub', gerante, 'role', 'authenticated')::text, true);
  f := public.enregistrer_document_vente(etab, jsonb_build_object('type', 'facture', 'contact_id', restaurant, 'hub_id', hub_dep,
    'date_document', aujourdhui - 45, 'echeance', aujourdhui - 15, 'objet', 'Approvisionnement du mois dernier',
    'lignes', jsonb_build_array(jsonb_build_object('article_id', riz, 'quantite', 2), jsonb_build_object('article_id', huile, 'quantite', 2))));
  perform public.emettre_facture(f);

  -- Facture en brouillon.
  perform public.enregistrer_document_vente(etab, jsonb_build_object('type', 'facture', 'contact_id', ecole,
    'objet', 'Fournitures diverses', 'lignes', jsonb_build_array(jsonb_build_object('libelle', 'Kit d''entretien', 'quantite', 4, 'prix_unitaire', 3500))));

  -- Facture émise par erreur puis annulée par un avoir.
  f := public.enregistrer_document_vente(etab, jsonb_build_object('type', 'facture', 'contact_id', hotel,
    'lignes', jsonb_build_array(jsonb_build_object('libelle', 'Prestation saisie en double', 'quantite', 1, 'prix_unitaire', 12000))));
  perform public.emettre_facture(f);
  perform set_config('request.jwt.claims', json_build_object('sub', compta, 'role', 'authenticated')::text, true);
  perform public.annuler_document_vente(f, 'Facture saisie en double');
  perform set_config('request.jwt.claims', '', true);
end
$$;

-- ---------------------------------------------------------------------------
-- Achats : demande en attente, commande reçue en partie et payée en partie, commande reçue à payer en retard, brouillon
-- ---------------------------------------------------------------------------
do $$
declare
  etab uuid;
  sa uuid;
  gerante uuid;
  compta uuid;
  depotier uuid;
  hub_dep uuid;
  grossiste uuid;
  brasserie uuid;
  c uuid;
  aujourdhui date;
  art jsonb := '{}'::jsonb;
  ligne record;
begin
  select id into etab from public.etablissements where nom = 'Commerce Démo' order by cree_le limit 1;
  if etab is null or exists (select 1 from public.commandes_achat where etablissement_id = etab) then
    return;
  end if;
  select u.id into sa from auth.users u join public.plateforme_admins a on a.user_id = u.id
  where a.role = 'super_admin' and a.actif order by u.created_at limit 1;
  select id into gerante from auth.users where email = 'gerante@demo.agence-elite.fr';
  select id into compta from auth.users where email = 'compta@demo.agence-elite.fr';
  select id into depotier from auth.users where email = 'depot@demo.agence-elite.fr';
  select id into hub_dep from public.hubs where etablissement_id = etab and code = 'DEP';
  select id into grossiste from public.contacts where etablissement_id = etab and nom = 'Grossiste Démo';
  for ligne in select reference, id from public.articles where etablissement_id = etab loop
    art := art || jsonb_build_object(ligne.reference, ligne.id);
  end loop;
  aujourdhui := public.date_locale(etab);

  perform set_config('request.jwt.claims', json_build_object('sub', sa, 'role', 'authenticated')::text, true);
  perform public.accorder_module(etab, 'achats', true);
  perform public.definir_module_etablissement(etab, 'achats', true);

  perform set_config('request.jwt.claims', json_build_object('sub', gerante, 'role', 'authenticated')::text, true);
  brasserie := public.enregistrer_contact(etab, jsonb_build_object('nom', 'M. Loemba', 'societe', 'Boissons Démo Distribution', 'type', 'fournisseur',
    'telephone', '+242 05 000 00 30', 'adresse', 'Zone portuaire, Pointe-Noire'));

  -- Commande reçue en entier il y a trois semaines, pas encore payée : dette en retard.
  c := public.enregistrer_commande_achat(etab, jsonb_build_object('fournisseur_id', brasserie, 'hub_id', hub_dep, 'date_commande', aujourdhui - 25,
    'echeance', aujourdhui - 5, 'reference_fournisseur', 'PRO-DEMO-114',
    'lignes', jsonb_build_array(jsonb_build_object('article_id', art ->> 'EAU-15', 'quantite', 30), jsonb_build_object('article_id', art ->> 'JUS-01', 'quantite', 24))));
  perform public.changer_statut_commande_achat(c, 'envoyee');
  perform set_config('request.jwt.claims', json_build_object('sub', depotier, 'role', 'authenticated')::text, true);
  perform public.receptionner_commande_achat(c, (select jsonb_agg(jsonb_build_object('ligne_id', id, 'quantite', quantite)) from public.lignes_commande_achat where commande_id = c), 'BL-DEMO-0381');

  -- Commande envoyée, reçue en partie (l'huile manque), acompte versé.
  perform set_config('request.jwt.claims', json_build_object('sub', gerante, 'role', 'authenticated')::text, true);
  c := public.enregistrer_commande_achat(etab, jsonb_build_object('fournisseur_id', grossiste, 'hub_id', hub_dep, 'date_commande', aujourdhui - 4,
    'livraison_prevue', aujourdhui + 2,
    'lignes', jsonb_build_array(jsonb_build_object('article_id', art ->> 'RIZ-25', 'quantite', 10, 'cout_unitaire', 14800),
      jsonb_build_object('article_id', art ->> 'HUI-05', 'quantite', 12))));
  perform public.changer_statut_commande_achat(c, 'envoyee');
  perform set_config('request.jwt.claims', json_build_object('sub', depotier, 'role', 'authenticated')::text, true);
  perform public.receptionner_commande_achat(c, (select jsonb_agg(jsonb_build_object('ligne_id', id, 'quantite', case when article_id = (art ->> 'RIZ-25')::uuid then 10 else 6 end))
    from public.lignes_commande_achat where commande_id = c), 'BL-DEMO-0402', '6 bidons d''huile en rupture chez le grossiste');
  perform set_config('request.jwt.claims', json_build_object('sub', compta, 'role', 'authenticated')::text, true);
  perform public.payer_fournisseur(c, 100000, 'mobile_money', 'MM-DEMO-7781', aujourdhui - 1);

  -- Brouillon en préparation.
  perform set_config('request.jwt.claims', json_build_object('sub', gerante, 'role', 'authenticated')::text, true);
  perform public.enregistrer_commande_achat(etab, jsonb_build_object('fournisseur_id', grossiste, 'hub_id', hub_dep,
    'lignes', jsonb_build_array(jsonb_build_object('article_id', art ->> 'SAV-40', 'quantite', 120), jsonb_build_object('article_id', art ->> 'DET-01', 'quantite', 30))));

  -- Demande du dépôt en attente d'approbation.
  perform set_config('request.jwt.claims', json_build_object('sub', depotier, 'role', 'authenticated')::text, true);
  perform public.enregistrer_commande_achat(etab, jsonb_build_object('demande', true, 'hub_id', hub_dep, 'notes', 'Rentrée scolaire : la demande en lait et sucre augmente.',
    'lignes', jsonb_build_array(jsonb_build_object('article_id', art ->> 'SUC-01', 'quantite', 60), jsonb_build_object('article_id', art ->> 'LAI-40', 'quantite', 24))));
  perform set_config('request.jwt.claims', '', true);
end
$$;

-- ---------------------------------------------------------------------------
-- CRM : prospects (Instagram, WhatsApp, recommandation), pipeline, activités, devis lié, gagnée, perdue
-- ---------------------------------------------------------------------------
do $$
declare
  etab uuid;
  sa uuid;
  gerante uuid;
  p_snack uuid;
  p_ecole uuid;
  p_salon uuid;
  p_boutique uuid;
  o uuid;
  maintenant timestamptz := now();
  e jsonb := '{}'::jsonb;
  ligne record;
begin
  select id into etab from public.etablissements where nom = 'Commerce Démo' order by cree_le limit 1;
  if etab is null or exists (select 1 from public.crm_opportunites where etablissement_id = etab) then
    return;
  end if;
  select u.id into sa from auth.users u join public.plateforme_admins a on a.user_id = u.id
  where a.role = 'super_admin' and a.actif order by u.created_at limit 1;
  select id into gerante from auth.users where email = 'gerante@demo.agence-elite.fr';

  perform set_config('request.jwt.claims', json_build_object('sub', sa, 'role', 'authenticated')::text, true);
  perform public.accorder_module(etab, 'crm_pipeline', true);
  perform public.definir_module_etablissement(etab, 'crm_pipeline', true);

  perform set_config('request.jwt.claims', json_build_object('sub', gerante, 'role', 'authenticated')::text, true);
  perform public.crm_initialiser(etab);
  for ligne in select nom, id from public.crm_etapes where etablissement_id = etab loop
    e := e || jsonb_build_object(ligne.nom, ligne.id);
  end loop;
  p_snack := public.enregistrer_contact(etab, jsonb_build_object('nom', 'M. Mavoungou', 'societe', 'Snack Démo Le Palmier', 'type', 'prospect',
    'source', 'instagram', 'telephone', '+242 05 000 00 40', 'responsable_id', gerante));
  p_ecole := public.enregistrer_contact(etab, jsonb_build_object('nom', 'Sœur Marie', 'societe', 'Collège Démo Saint-Joseph', 'type', 'prospect',
    'source', 'recommandation', 'telephone', '+242 05 000 00 41', 'responsable_id', gerante));
  p_salon := public.enregistrer_contact(etab, jsonb_build_object('nom', 'Mme Nzaba', 'societe', 'Salon Démo Beauté Divine', 'type', 'prospect',
    'source', 'whatsapp', 'telephone', '+242 05 000 00 42'));
  p_boutique := public.enregistrer_contact(etab, jsonb_build_object('nom', 'M. Bikindou', 'type', 'prospect', 'source', 'passage',
    'telephone', '+242 05 000 00 43'));

  -- En négociation, devis envoyé, relance prévue demain.
  o := public.enregistrer_opportunite(etab, jsonb_build_object('titre', 'Approvisionnement mensuel boissons et épicerie', 'contact_id', p_snack,
    'montant', 185000, 'cloture_prevue', current_date + 7, 'notes', 'Le gérant veut être livré le lundi. Concurrent : grossiste du marché.'));
  perform public.enregistrer_activite_crm(etab, jsonb_build_object('opportunite_id', o, 'type', 'message', 'sujet', 'Premier échange sur Instagram', 'faite', true,
    'resultat', 'Intéressé, demande les tarifs.'));
  perform public.creer_devis_opportunite(o, jsonb_build_array(
    jsonb_build_object('article_id', (select id from public.articles where etablissement_id = etab and reference = 'EAU-15'), 'quantite', 40),
    jsonb_build_object('article_id', (select id from public.articles where etablissement_id = etab and reference = 'JUS-01'), 'quantite', 48),
    jsonb_build_object('article_id', (select id from public.articles where etablissement_id = etab and reference = 'RIZ-25'), 'quantite', 2)));
  perform public.deplacer_opportunite(o, (e ->> 'Négociation')::uuid);
  perform public.enregistrer_activite_crm(etab, jsonb_build_object('opportunite_id', o, 'type', 'appel', 'sujet', 'Relancer sur le devis',
    'echeance', maintenant + interval '1 day'));

  -- Qualifiée, rendez-vous en retard.
  o := public.enregistrer_opportunite(etab, jsonb_build_object('titre', 'Fournitures de la cantine (trimestre)', 'contact_id', p_ecole,
    'montant', 420000, 'etape_id', e ->> 'Qualifié', 'cloture_prevue', current_date + 21));
  perform public.enregistrer_activite_crm(etab, jsonb_build_object('opportunite_id', o, 'type', 'rdv', 'sujet', 'Rendez-vous avec l''économe',
    'echeance', maintenant - interval '1 day'));

  -- Nouveau, appel aujourd'hui.
  o := public.enregistrer_opportunite(etab, jsonb_build_object('titre', 'Produits d''hygiène pour le salon', 'contact_id', p_salon, 'montant', 60000));
  perform public.enregistrer_activite_crm(etab, jsonb_build_object('opportunite_id', o, 'type', 'appel', 'sujet', 'Appeler Mme Nzaba',
    'echeance', date_trunc('hour', maintenant) + interval '2 hours'));

  -- Gagnée (le prospect devient client) et perdue.
  o := public.enregistrer_opportunite(etab, jsonb_build_object('titre', 'Stock de démarrage', 'contact_id', p_boutique, 'montant', 95000));
  perform public.deplacer_opportunite(o, (e ->> 'Gagné')::uuid);
  o := public.enregistrer_opportunite(etab, jsonb_build_object('titre', 'Boissons pour un mariage', 'contact_id', p_salon, 'montant', 150000));
  perform public.deplacer_opportunite(o, (e ->> 'Perdu')::uuid, 'Choix d''un concurrent');
  perform set_config('request.jwt.claims', '', true);
end
$$;

-- ---------------------------------------------------------------------------
-- Projets : ouverture d'un point de vente (interne), installation chez un client (temps facturable), terminé
-- ---------------------------------------------------------------------------
do $$
declare
  etab uuid;
  sa uuid;
  gerante uuid;
  patron uuid;
  hotel uuid;
  pr uuid;
  t1 uuid;
  t2 uuid;
  t3 uuid;
  jour date;
begin
  select id into etab from public.etablissements where nom = 'Commerce Démo' order by cree_le limit 1;
  if etab is null or exists (select 1 from public.projets where etablissement_id = etab) then
    return;
  end if;
  select u.id into sa from auth.users u join public.plateforme_admins a on a.user_id = u.id
  where a.role = 'super_admin' and a.actif order by u.created_at limit 1;
  select id into gerante from auth.users where email = 'gerante@demo.agence-elite.fr';
  select user_id into patron from public.comptes_connexion where lower(identifiant) = 'patrondemo';
  select id into hotel from public.contacts where etablissement_id = etab and societe = 'Hôtel Démo Côte Sauvage';
  jour := public.date_locale(etab);

  perform set_config('request.jwt.claims', json_build_object('sub', sa, 'role', 'authenticated')::text, true);
  perform public.accorder_module(etab, 'projets', true);
  perform public.definir_module_etablissement(etab, 'projets', true);

  perform set_config('request.jwt.claims', json_build_object('sub', gerante, 'role', 'authenticated')::text, true);
  perform public.enregistrer_parametres_module(etab, 'projets', '{"taux_horaire": 10000, "saisie_temps_jours": 31}'::jsonb);

  -- Projet client : mini-boutique dans le hall de l'hôtel, temps facturable.
  pr := public.enregistrer_projet(etab, jsonb_build_object('nom', 'Mini-boutique du hall de l''hôtel', 'contact_id', hotel,
    'date_debut', jour - 10, 'date_fin_prevue', jour + 12, 'budget', 350000, 'heures_prevues', 30,
    'description', 'Installation d''un présentoir, mise en place du stock de dépannage et formation du réceptionniste.'));
  t1 := public.enregistrer_tache_projet(etab, jsonb_build_object('projet_id', pr, 'titre', 'Relevé des besoins avec l''économe', 'estimation_heures', 2));
  perform public.enregistrer_tache_projet(etab, jsonb_build_object('id', t1, 'statut', 'terminee'));
  t2 := public.enregistrer_tache_projet(etab, jsonb_build_object('projet_id', pr, 'titre', 'Installer le présentoir', 'priorite', 'haute',
    'echeance', jour + 3, 'estimation_heures', 6));
  perform public.enregistrer_tache_projet(etab, jsonb_build_object('id', t2, 'statut', 'en_cours'));
  t3 := public.enregistrer_tache_projet(etab, jsonb_build_object('projet_id', pr, 'titre', 'Former le réceptionniste à la caisse', 'echeance', jour + 10,
    'assigne_a', patron));
  perform public.saisir_temps_projet(etab, jsonb_build_object('projet_id', pr, 'tache_id', t1, 'minutes', 120, 'date_travail', jour - 9,
    'description', 'Visite et liste des produits'));
  perform public.saisir_temps_projet(etab, jsonb_build_object('projet_id', pr, 'tache_id', t2, 'minutes', 210, 'date_travail', jour - 2,
    'description', 'Montage et étiquetage'));
  perform public.saisir_temps_projet(etab, jsonb_build_object('projet_id', pr, 'minutes', 45, 'date_travail', jour - 2, 'facturable', false,
    'description', 'Trajet'));

  -- Projet interne en retard : réaménagement du dépôt.
  pr := public.enregistrer_projet(etab, jsonb_build_object('nom', 'Réaménagement du dépôt', 'date_debut', jour - 30, 'date_fin_prevue', jour - 3,
    'heures_prevues', 16));
  t1 := public.enregistrer_tache_projet(etab, jsonb_build_object('projet_id', pr, 'titre', 'Étiqueter les allées', 'echeance', jour - 5));
  perform public.enregistrer_tache_projet(etab, jsonb_build_object('projet_id', pr, 'titre', 'Commander les étagères', 'echeance', jour - 12));
  perform public.saisir_temps_projet(etab, jsonb_build_object('projet_id', pr, 'tache_id', t1, 'minutes', 90, 'date_travail', jour - 6, 'facturable', false));

  -- Projet terminé.
  pr := public.enregistrer_projet(etab, jsonb_build_object('nom', 'Ouverture de la Boutique Marché Total', 'date_debut', jour - 60, 'date_fin_prevue', jour - 20));
  t1 := public.enregistrer_tache_projet(etab, jsonb_build_object('projet_id', pr, 'titre', 'Installer la caisse', 'statut', 'terminee'));
  perform public.changer_statut_projet(pr, 'termine');
  perform set_config('request.jwt.claims', '', true);
end
$$;

-- ---------------------------------------------------------------------------
-- Restaurant : établissement « Restaurant Démo » (même client), tables, plats, une table servie et encaissée,
-- une table en cours (plats en cuisine, prêts, à envoyer), une commande à emporter.
-- ---------------------------------------------------------------------------
do $$
declare
  client uuid;
  etab uuid;
  sa uuid;
  gerante uuid;
  patron uuid;
  serveur uuid;
  cuisinier uuid;
  hub uuid;
  ligne record;
  id_tmp uuid;
  art jsonb := '{}'::jsonb;
  cat_plats uuid;
  cat_boissons uuid;
  t jsonb := '{}'::jsonb;
  cmd uuid;
  session uuid;
  l record;
  domaine constant text := 'demo.agence-elite.fr';
begin
  select id into client from public.clients where nom = 'Commerce Démo' order by cree_le limit 1;
  if client is null or exists (select 1 from public.etablissements where client_id = client and nom = 'Restaurant Démo') then
    return;
  end if;
  select u.id into sa from auth.users u join public.plateforme_admins a on a.user_id = u.id
  where a.role = 'super_admin' and a.actif order by u.created_at limit 1;
  select user_id into patron from public.comptes_connexion where lower(identifiant) = 'patrondemo';

  -- Équipe fictive de salle et de cuisine (mot de passe aléatoire : ces comptes ne se connectent pas).
  for ligne in select * from (values ('resto', 'Gisèle M. (gérante du restaurant)'), ('serveur', 'Rodrigue T. (serveur)'), ('cuisine', 'Mama Odile (cuisine)')) as v(cle, nom) loop
    select id into id_tmp from auth.users where email = ligne.cle || '@' || domaine;
    if id_tmp is null then
      insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change)
      values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', ligne.cle || '@' || domaine,
        extensions.crypt(md5(random()::text || clock_timestamp()::text), extensions.gen_salt('bf')), now(),
        '{"provider": "email", "providers": ["email"]}'::jsonb, jsonb_build_object('nom', ligne.nom), now(), now(), '', '', '', '')
      returning id into id_tmp;
      insert into public.profils (id, nom_complet) values (id_tmp, ligne.nom)
      on conflict (id) do update set nom_complet = excluded.nom_complet;
    end if;
    case ligne.cle when 'resto' then gerante := id_tmp; when 'serveur' then serveur := id_tmp; else cuisinier := id_tmp; end case;
  end loop;

  perform set_config('request.jwt.claims', json_build_object('sub', sa, 'role', 'authenticated')::text, true);
  etab := public.creer_etablissement(client, 'restaurant', 'Restaurant Démo');
  insert into public.etablissement_membres (etablissement_id, user_id, role_id) values
    (etab, gerante, 'gerant'), (etab, serveur, 'serveur'), (etab, cuisinier, 'cuisinier')
  on conflict (etablissement_id, user_id) do nothing;
  if patron is not null then
    insert into public.etablissement_membres (etablissement_id, user_id, role_id) values (etab, patron, 'gerant')
    on conflict (etablissement_id, user_id) do nothing;
  end if;
  select id into hub from public.hubs where etablissement_id = etab and principal;

  -- Carte : plats (cuisine), boissons (bar), eau servie directement.
  perform set_config('request.jwt.claims', json_build_object('sub', gerante, 'role', 'authenticated')::text, true);
  cat_plats := public.enregistrer_categorie(etab, 'Plats');
  cat_boissons := public.enregistrer_categorie(etab, 'Boissons');
  for ligne in select * from (values
    ('PLT-PDG', 'Poulet DG', 6500, 'cuisine', false, 'plats'), ('PLT-POI', 'Poisson braisé', 7000, 'cuisine', false, 'plats'),
    ('PLT-SAK', 'Saka-saka et riz', 3500, 'cuisine', false, 'plats'), ('PLT-BRO', 'Brochettes de bœuf (5)', 3000, 'cuisine', false, 'plats'),
    ('BAR-PRI', 'Primus 65 cl', 1000, 'bar', true, 'boissons'), ('BAR-JUS', 'Jus de gingembre', 1000, 'bar', false, 'boissons'),
    ('BAR-EAU', 'Eau 1,5 L', 700, 'aucun', true, 'boissons')) as v(ref, nom, prix, poste, stock, cat)
  loop
    id_tmp := public.enregistrer_article(etab, jsonb_build_object('reference', ligne.ref, 'nom', ligne.nom, 'prix_vente', ligne.prix,
      'suivi_stock', ligne.stock, 'categorie_id', case ligne.cat when 'plats' then cat_plats else cat_boissons end,
      'cout_achat', case when ligne.stock then round(ligne.prix * 0.6) end));
    perform public.definir_poste_preparation(id_tmp, ligne.poste);
    if ligne.stock then
      perform public.ajuster_stock_hub(hub, id_tmp, 'entree', 48, 'Stock d''ouverture', round(ligne.prix * 0.6));
    end if;
    art := art || jsonb_build_object(ligne.ref, id_tmp);
  end loop;

  -- Tables : salle et terrasse.
  for ligne in select * from (values ('T1', 'Salle', 4, 1), ('T2', 'Salle', 4, 2), ('T3', 'Salle', 6, 3), ('T4', 'Salle', 2, 4),
    ('Terrasse 1', 'Terrasse', 4, 5), ('Terrasse 2', 'Terrasse', 8, 6)) as v(nom, zone, places, ordre) loop
    t := t || jsonb_build_object(ligne.nom, public.enregistrer_table_restaurant(etab, jsonb_build_object('hub_id', hub, 'nom', ligne.nom,
      'zone', ligne.zone, 'places', ligne.places, 'ordre', ligne.ordre)));
  end loop;

  session := public.ouvrir_caisse(etab, null, 20000);

  -- Table T3 : servie et encaissée (addition séparée : un client paie sa part en espèces, le reste en Mobile Money).
  perform set_config('request.jwt.claims', json_build_object('sub', serveur, 'role', 'authenticated')::text, true);
  cmd := public.ouvrir_commande_restaurant(etab, jsonb_build_object('table_id', t ->> 'T3', 'couverts', 4));
  perform public.ajouter_lignes_restaurant(cmd, jsonb_build_array(
    jsonb_build_object('article_id', art ->> 'PLT-PDG', 'quantite', 2), jsonb_build_object('article_id', art ->> 'PLT-POI', 'quantite', 2),
    jsonb_build_object('article_id', art ->> 'BAR-PRI', 'quantite', 4), jsonb_build_object('article_id', art ->> 'BAR-EAU', 'quantite', 1)));
  perform public.envoyer_commande_restaurant(cmd);
  perform set_config('request.jwt.claims', json_build_object('sub', cuisinier, 'role', 'authenticated')::text, true);
  for l in select id from public.rest_lignes where commande_id = cmd and statut = 'envoyee' loop
    perform public.avancer_ligne_restaurant(l.id, 'prete');
  end loop;
  perform set_config('request.jwt.claims', json_build_object('sub', serveur, 'role', 'authenticated')::text, true);
  for l in select id from public.rest_lignes where commande_id = cmd and statut = 'prete' loop
    perform public.avancer_ligne_restaurant(l.id, 'servie');
  end loop;
  select id into id_tmp from public.rest_lignes where commande_id = cmd and article_id = (art ->> 'PLT-PDG')::uuid;
  id_tmp := public.scinder_ligne_restaurant(id_tmp, 1);
  perform public.encaisser_commande_restaurant(cmd, session, jsonb_build_array(jsonb_build_object('mode', 'especes', 'montant', 10000)), array[id_tmp]);
  perform public.encaisser_commande_restaurant(cmd, session,
    jsonb_build_array(jsonb_build_object('mode', 'mobile_money', 'montant', 25200, 'reference', 'MM-DEMO-0042')));

  -- Table T1 : en cours (poisson prêt, saka-saka en préparation, boissons servies, un plat pas encore envoyé).
  cmd := public.ouvrir_commande_restaurant(etab, jsonb_build_object('table_id', t ->> 'T1', 'couverts', 3));
  perform public.ajouter_lignes_restaurant(cmd, jsonb_build_array(
    jsonb_build_object('article_id', art ->> 'PLT-POI', 'quantite', 1, 'note', 'Bien pimenté'),
    jsonb_build_object('article_id', art ->> 'PLT-SAK', 'quantite', 2),
    jsonb_build_object('article_id', art ->> 'BAR-JUS', 'quantite', 3)));
  perform public.envoyer_commande_restaurant(cmd);
  perform set_config('request.jwt.claims', json_build_object('sub', cuisinier, 'role', 'authenticated')::text, true);
  select id into id_tmp from public.rest_lignes where commande_id = cmd and article_id = (art ->> 'PLT-POI')::uuid;
  perform public.avancer_ligne_restaurant(id_tmp, 'prete');
  select id into id_tmp from public.rest_lignes where commande_id = cmd and article_id = (art ->> 'PLT-SAK')::uuid;
  perform public.avancer_ligne_restaurant(id_tmp, 'en_preparation');
  select id into id_tmp from public.rest_lignes where commande_id = cmd and article_id = (art ->> 'BAR-JUS')::uuid;
  perform public.avancer_ligne_restaurant(id_tmp, 'prete');
  perform set_config('request.jwt.claims', json_build_object('sub', serveur, 'role', 'authenticated')::text, true);
  perform public.avancer_ligne_restaurant(id_tmp, 'servie');
  perform public.ajouter_lignes_restaurant(cmd, jsonb_build_array(jsonb_build_object('article_id', art ->> 'PLT-BRO', 'quantite', 1)));

  -- Terrasse 1 : bières envoyées au bar.
  cmd := public.ouvrir_commande_restaurant(etab, jsonb_build_object('table_id', t ->> 'Terrasse 1', 'couverts', 2));
  perform public.ajouter_lignes_restaurant(cmd, jsonb_build_array(jsonb_build_object('article_id', art ->> 'BAR-PRI', 'quantite', 2),
    jsonb_build_object('article_id', art ->> 'PLT-BRO', 'quantite', 2)));
  perform public.envoyer_commande_restaurant(cmd);

  -- À emporter.
  cmd := public.ouvrir_commande_restaurant(etab, jsonb_build_object('hub_id', hub, 'nom_client', 'M. Okemba'));
  perform public.ajouter_lignes_restaurant(cmd, jsonb_build_array(jsonb_build_object('article_id', art ->> 'PLT-PDG', 'quantite', 1)));
  perform public.envoyer_commande_restaurant(cmd);
  perform set_config('request.jwt.claims', '', true);
end
$$;

-- ---------------------------------------------------------------------------
-- Hôtel : établissement « Hôtel Démo » (même client), 7 chambres, séjours en cours, arrivées, réservations à venir,
-- un départ facturé et payé, une absence, une chambre à nettoyer et une hors service.
-- ---------------------------------------------------------------------------
do $$
declare
  client uuid;
  etab uuid;
  sa uuid;
  patron uuid;
  gerant uuid;
  reception uuid;
  menage uuid;
  ligne record;
  id_tmp uuid;
  ty jsonb := '{}'::jsonb;
  ch jsonb := '{}'::jsonb;
  r uuid;
  res jsonb;
  jour date;
  eau uuid;
  repas uuid;
  domaine constant text := 'demo.agence-elite.fr';
begin
  select id into client from public.clients where nom = 'Commerce Démo' order by cree_le limit 1;
  if client is null or exists (select 1 from public.etablissements where client_id = client and nom = 'Hôtel Démo') then
    return;
  end if;
  select u.id into sa from auth.users u join public.plateforme_admins a on a.user_id = u.id
  where a.role = 'super_admin' and a.actif order by u.created_at limit 1;
  select user_id into patron from public.comptes_connexion where lower(identifiant) = 'patrondemo';

  for ligne in select * from (values ('hotel', 'Serge B. (directeur de l''hôtel)'), ('reception', 'Nadège L. (réception)'),
    ('menage', 'Bienvenu K. (entretien)')) as v(cle, nom) loop
    select id into id_tmp from auth.users where email = ligne.cle || '@' || domaine;
    if id_tmp is null then
      insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change)
      values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', ligne.cle || '@' || domaine,
        extensions.crypt(md5(random()::text || clock_timestamp()::text), extensions.gen_salt('bf')), now(),
        '{"provider": "email", "providers": ["email"]}'::jsonb, jsonb_build_object('nom', ligne.nom), now(), now(), '', '', '', '')
      returning id into id_tmp;
      insert into public.profils (id, nom_complet) values (id_tmp, ligne.nom)
      on conflict (id) do update set nom_complet = excluded.nom_complet;
    end if;
    case ligne.cle when 'hotel' then gerant := id_tmp; when 'reception' then reception := id_tmp; else menage := id_tmp; end case;
  end loop;

  perform set_config('request.jwt.claims', json_build_object('sub', sa, 'role', 'authenticated')::text, true);
  etab := public.creer_etablissement(client, 'hotel', 'Hôtel Démo');
  insert into public.etablissement_membres (etablissement_id, user_id, role_id) values
    (etab, gerant, 'gerant'), (etab, reception, 'receptionniste'), (etab, menage, 'agent_entretien')
  on conflict (etablissement_id, user_id) do nothing;
  if patron is not null then
    insert into public.etablissement_membres (etablissement_id, user_id, role_id) values (etab, patron, 'gerant')
    on conflict (etablissement_id, user_id) do nothing;
  end if;
  jour := public.date_locale(etab);

  perform set_config('request.jwt.claims', json_build_object('sub', gerant, 'role', 'authenticated')::text, true);
  for ligne in select * from (values ('Standard', 25000, 2, 1, 'Lit double, climatisation, TV'), ('Supérieure', 35000, 3, 2, 'Lit double et canapé, vue jardin'),
    ('Suite', 60000, 4, 3, 'Chambre et salon, vue mer')) as v(nom, tarif, capacite, ordre, descr) loop
    ty := ty || jsonb_build_object(ligne.nom, public.enregistrer_type_chambre(etab, jsonb_build_object('nom', ligne.nom, 'tarif_nuit', ligne.tarif,
      'capacite', ligne.capacite, 'ordre', ligne.ordre, 'description', ligne.descr)));
  end loop;
  for ligne in select * from (values ('101', 'Standard', '1'), ('102', 'Standard', '1'), ('103', 'Standard', '1'), ('104', 'Standard', '1'),
    ('201', 'Supérieure', '2'), ('202', 'Supérieure', '2'), ('301', 'Suite', '3')) as v(numero, type, etage) loop
    ch := ch || jsonb_build_object(ligne.numero, public.enregistrer_chambre(etab, jsonb_build_object('numero', ligne.numero,
      'type_id', ty ->> ligne.type, 'etage', ligne.etage)));
  end loop;
  eau := public.enregistrer_article(etab, jsonb_build_object('nom', 'Minibar : eau 50 cl', 'prix_vente', 500, 'suivi_stock', false));
  repas := public.enregistrer_article(etab, jsonb_build_object('nom', 'Petit-déjeuner', 'prix_vente', 4000, 'suivi_stock', false));
  perform public.enregistrer_contact(etab, jsonb_build_object('nom', 'M. Itoua', 'societe', 'Société Pétrolière Démo', 'type', 'client', 'telephone', '+242 06 222 33 44'));

  perform set_config('request.jwt.claims', json_build_object('sub', reception, 'role', 'authenticated')::text, true);
  -- Séjour en cours en suite, avec prestations.
  r := public.enregistrer_reservation_hotel(etab, jsonb_build_object('contact_id',
    (select id from public.contacts where etablissement_id = etab and nom = 'M. Itoua'), 'type_id', ty ->> 'Suite', 'chambre_id', ch ->> '301',
    'arrivee', jour, 'depart', jour + 4, 'adultes', 2, 'source', 'telephone', 'note', 'Facture au nom de la société'));
  perform public.check_in_hotel(r, null);
  perform public.ajouter_prestation_hotel(r, jsonb_build_object('article_id', repas, 'quantite', 2));
  perform public.ajouter_prestation_hotel(r, jsonb_build_object('libelle', 'Transfert aéroport', 'quantite', 1, 'prix_unitaire', 10000));
  -- Séjour en cours en Standard.
  r := public.enregistrer_reservation_hotel(etab, jsonb_build_object('nom_client', 'Mme Loemba', 'telephone', '+242 05 444 55 66',
    'type_id', ty ->> 'Standard', 'arrivee', jour, 'depart', jour + 2, 'source', 'whatsapp'));
  perform public.check_in_hotel(r, (ch ->> '102')::uuid);
  perform public.ajouter_prestation_hotel(r, jsonb_build_object('article_id', eau, 'quantite', 3));
  -- Client de passage : arrivé et reparti (facture émise et payée) ; la 101 est à nettoyer.
  r := public.enregistrer_reservation_hotel(etab, jsonb_build_object('nom_client', 'M. Ngoma (de passage)', 'type_id', ty ->> 'Standard',
    'arrivee', jour, 'depart', jour + 1, 'source', 'direct'));
  perform public.check_in_hotel(r, (ch ->> '101')::uuid);
  perform public.ajouter_prestation_hotel(r, jsonb_build_object('article_id', repas, 'quantite', 1));
  res := public.check_out_hotel(r);
  perform public.encaisser_facture((res ->> 'document_id')::uuid, 29000, 'mobile_money', 'MM-DEMO-HOTEL-1');
  -- Arrivées attendues aujourd'hui.
  perform public.enregistrer_reservation_hotel(etab, jsonb_build_object('nom_client', 'Famille Massamba', 'type_id', ty ->> 'Supérieure',
    'arrivee', jour, 'depart', jour + 3, 'adultes', 2, 'enfants', 1, 'source', 'site_web', 'note', 'Arrivée vers 18 h'));
  r := public.enregistrer_reservation_hotel(etab, jsonb_build_object('nom_client', 'M. Kimbembe', 'type_id', ty ->> 'Standard',
    'arrivee', jour, 'depart', jour + 1, 'source', 'telephone'));
  perform public.annuler_reservation_hotel(r, 'Pas venu, téléphone injoignable', true);
  -- Réservations à venir.
  perform public.enregistrer_reservation_hotel(etab, jsonb_build_object('nom_client', 'Délégation ministère (démo)', 'type_id', ty ->> 'Supérieure',
    'arrivee', jour + 5, 'depart', jour + 8, 'adultes', 2, 'source', 'agence'));
  perform public.enregistrer_reservation_hotel(etab, jsonb_build_object('nom_client', 'Mlle Bouanga', 'type_id', ty ->> 'Standard',
    'chambre_id', ch ->> '103', 'arrivee', jour + 2, 'depart', jour + 6, 'source', 'plateforme', 'tarif_nuit', 22000));

  perform set_config('request.jwt.claims', json_build_object('sub', menage, 'role', 'authenticated')::text, true);
  perform public.changer_menage_chambre((ch ->> '202')::uuid, 'hors_service', 'Climatisation en réparation');
  perform set_config('request.jwt.claims', '', true);
end
$$;
