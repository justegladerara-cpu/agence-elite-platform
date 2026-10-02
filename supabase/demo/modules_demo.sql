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
