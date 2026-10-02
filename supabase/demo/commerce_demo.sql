-- Démonstration « Commerce Démo » : un commerce fictif à trois Hubs (deux points de vente, un dépôt).
-- Toutes les données sont fictives. Aucune donnée réelle (ni Kangourou, ni client).
-- Exécuté tel quel en local (PGlite) et en production (workflow « Démo et comptes »).
-- Paramètres (set_config avant l'exécution) :
--   app.demo_mot_de_passe        mot de passe temporaire des comptes Admin, Patrondemo, Userdemo
--   app.demo_super_admin_email   adresse du super administrateur existant (reçoit l'identifiant Justegladerara)
-- Idempotent : ne fait rien si le client « Commerce Démo » existe déjà (les comptes sont créés s'ils manquent).
-- Les opérations passent par les fonctions de la plateforme, en se plaçant successivement dans la
-- peau de chaque utilisateur fictif (request.jwt.claims) : mêmes contrôles qu'à l'écran.
do $$
declare
  mdp text := nullif(current_setting('app.demo_mot_de_passe', true), '');
  sa_email text := lower(coalesce(nullif(current_setting('app.demo_super_admin_email', true), ''), ''));
  sa uuid;
  gerante uuid;
  caisse_marche uuid;
  depotier uuid;
  compta uuid;
  patron uuid;
  userdemo uuid;
  admin uuid;
  client uuid;
  etab uuid;
  hub_mp uuid;
  hub_bmt uuid;
  hub_dep uuid;
  caisse_mp uuid;
  caisse_bmt uuid;
  session_mp uuid;
  session_bmt uuid;
  cat jsonb := '{}'::jsonb;
  art jsonb := '{}'::jsonb;
  ligne record;
  id_tmp uuid;
  vente jsonb;
  client_fidele uuid;
  restaurant uuid;
  fournisseur uuid;
  domaine constant text := 'demo.agence-elite.fr';
  quand constant timestamptz := now();
begin
  if mdp is null then
    raise exception 'Paramètre app.demo_mot_de_passe manquant';
  end if;
  select u.id into sa from auth.users u join public.plateforme_admins a on a.user_id = u.id
  where a.role = 'super_admin' and a.actif and (sa_email = '' or lower(u.email) = sa_email)
  order by u.created_at limit 1;
  if sa is null then
    raise exception 'Super administrateur introuvable';
  end if;

  -- 1. Identifiant Justegladerara sur le super administrateur existant (son mot de passe ne change pas).
  perform set_config('request.jwt.claims', json_build_object('sub', sa, 'role', 'authenticated')::text, true);
  if not exists (select 1 from public.comptes_connexion where lower(identifiant) = 'justegladerara') then
    perform public.definir_identifiant(sa, 'Justegladerara');
  end if;
  update public.profils set nom_complet = 'Juste Glade' where id = sa and coalesce(nom_complet, '') in ('', 'Agence Elite (éditeur)');

  -- 2. Compte Admin (équipe Agence Elite).
  select user_id into admin from public.comptes_connexion where lower(identifiant) = 'admin';
  if admin is null then
    admin := public.creer_compte('admin@identifiants.agence-elite.fr', 'Admin', 'Admin Agence Elite', mdp, 30);
    perform public.definir_admin_plateforme(admin, 'admin', true);
  end if;

  if exists (select 1 from public.clients where nom = 'Commerce Démo') then
    return;
  end if;

  -- 3. Équipe fictive du commerce (ces comptes ne peuvent pas se connecter : mot de passe aléatoire).
  for ligne in select * from (values
    ('gerante', 'Mireille N. (gérante)'), ('caisse-marche', 'Junior M. (caissier Marché)'),
    ('depot', 'Aristide K. (dépôt)'), ('compta', 'Prisca O. (comptable)')) as t(cle, nom)
  loop
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change)
    values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', ligne.cle || '@' || domaine,
      extensions.crypt(md5(random()::text || clock_timestamp()::text), extensions.gen_salt('bf')), now(),
      '{"provider": "email", "providers": ["email"]}'::jsonb, jsonb_build_object('nom', ligne.nom), now(), now(), '', '', '', '')
    returning id into id_tmp;
    insert into public.profils (id, nom_complet) values (id_tmp, ligne.nom)
    on conflict (id) do update set nom_complet = excluded.nom_complet;
    case ligne.cle
      when 'gerante' then gerante := id_tmp;
      when 'caisse-marche' then caisse_marche := id_tmp;
      when 'depot' then depotier := id_tmp;
      else compta := id_tmp;
    end case;
  end loop;

  -- 4. Client, établissement, licence (super administrateur).
  perform set_config('request.jwt.claims', json_build_object('sub', sa, 'role', 'authenticated')::text, true);
  client := public.creer_client('Commerce Démo', 'Congo');
  perform public.modifier_client(client, jsonb_build_object('contact', jsonb_build_object(
    'responsable', 'Patron Démo', 'telephone', '+242 06 000 00 00', 'email', 'patrondemo@identifiants.agence-elite.fr', 'adresse', 'Avenue de la Démo, Pointe-Noire')));
  etab := public.creer_etablissement(client, 'commerce', 'Commerce Démo');
  perform public.modifier_etablissement(etab, jsonb_build_object('ville', 'Pointe-Noire', 'pays', 'Congo', 'devise', 'XAF'));
  perform public.attribuer_licence(etab, 'commerce-complet', 'annuel', current_date, null, 0, '{}', 'DEMO', 'Licence de démonstration (fictive)');
  insert into public.etablissement_membres (etablissement_id, user_id, role_id) values
    (etab, gerante, 'gerant'), (etab, caisse_marche, 'employe'), (etab, depotier, 'gestionnaire_depot'), (etab, compta, 'comptable');

  -- 5. Hubs : le Hub principal devient « Magasin principal », puis un second point de vente et un dépôt.
  perform set_config('request.jwt.claims', json_build_object('sub', gerante, 'role', 'authenticated')::text, true);
  hub_mp := public.hub_principal(etab);
  perform public.enregistrer_hub(etab, jsonb_build_object('id', hub_mp, 'nom', 'Magasin principal', 'code', 'MP', 'type', 'mixte',
    'adresse', 'Avenue de la Démo, Pointe-Noire', 'telephone', '+242 06 000 00 01'));
  hub_bmt := public.enregistrer_hub(etab, jsonb_build_object('nom', 'Boutique Marché Total', 'code', 'BMT', 'type', 'point_de_vente',
    'adresse', 'Marché Total, Pointe-Noire', 'telephone', '+242 06 000 00 02', 'creer_caisse', false));
  hub_dep := public.enregistrer_hub(etab, jsonb_build_object('nom', 'Dépôt principal', 'code', 'DEP', 'type', 'depot',
    'adresse', 'Zone portuaire, Pointe-Noire'));
  select id into caisse_mp from public.points_de_vente where hub_id = hub_mp order by cree_le limit 1;
  perform public.enregistrer_caisse(etab, hub_mp, 'Caisse Magasin principal', caisse_mp, true);
  caisse_bmt := public.enregistrer_caisse(etab, hub_bmt, 'Caisse Marché Total');
  perform public.definir_hubs_membre(etab, caisse_marche, array[hub_bmt]);
  perform public.definir_hubs_membre(etab, depotier, array[hub_dep]);

  perform public.enregistrer_identite(etab, jsonb_build_object(
    'nom_commercial', 'Commerce Démo', 'adresse', 'Avenue de la Démo, Pointe-Noire', 'telephone', '+242 06 000 00 00',
    'email', 'contact@demo.agence-elite.fr', 'rccm', 'CG-PNR-DEMO-0001', 'niu', 'M0000DEMO0001X',
    'mentions_recu', 'Merci de votre visite. Données de démonstration : ce reçu est fictif.', 'couleur_principale', '#1F4FD8'));
  perform public.enregistrer_parametres_module(etab, 'caisse', '{"stock_negatif": false}'::jsonb);

  -- 6. Catalogue.
  for ligne in select * from unnest(array['Épicerie', 'Boissons', 'Hygiène et entretien', 'Bazar', 'Services']) as c(nom) loop
    cat := cat || jsonb_build_object(ligne.nom, public.enregistrer_categorie(etab, ligne.nom));
  end loop;
  for ligne in select * from (values
    ('RIZ-25', 'Riz parfumé 25 kg', 'Épicerie', 18500, 15000, 'sac', true, 5),
    ('HUI-05', 'Huile végétale 5 L', 'Épicerie', 7500, 6000, 'bidon', true, 6),
    ('SUC-01', 'Sucre en poudre 1 kg', 'Épicerie', 900, 700, 'unité', true, 20),
    ('LAI-40', 'Lait en poudre 400 g', 'Épicerie', 2800, 2200, 'boîte', true, 12),
    ('SPA-50', 'Spaghetti 500 g', 'Épicerie', 650, 480, 'paquet', true, 30),
    ('TOM-40', 'Tomate concentrée 400 g', 'Épicerie', 750, 550, 'boîte', true, 24),
    ('SAR-12', 'Sardines 125 g', 'Épicerie', 600, 430, 'boîte', true, 30),
    ('EAU-15', 'Eau minérale 1,5 L (pack de 6)', 'Boissons', 2400, 1800, 'pack', true, 10),
    ('JUS-01', 'Jus de fruits 1 L', 'Boissons', 1200, 850, 'unité', true, 12),
    ('SAV-40', 'Savon de ménage 400 g', 'Hygiène et entretien', 500, 330, 'unité', true, 40),
    ('DET-01', 'Détergent en poudre 1 kg', 'Hygiène et entretien', 1800, 1300, 'paquet', true, 15),
    ('BOU-10', 'Bougies (paquet de 10)', 'Bazar', 1000, 650, 'paquet', true, 10),
    ('PIL-AA', 'Piles AA (lot de 4)', 'Bazar', 1500, 950, 'lot', true, 10),
    ('LIV-01', 'Livraison à domicile', 'Services', 1000, null, 'course', false, 0)
  ) as a(reference, nom, categorie, prix, cout, unite, suivi, minimum) loop
    art := art || jsonb_build_object(ligne.reference, public.enregistrer_article(etab, jsonb_build_object(
      'reference', ligne.reference, 'nom', ligne.nom, 'categorie_id', cat ->> ligne.categorie, 'prix_vente', ligne.prix,
      'cout_achat', ligne.cout, 'unite', ligne.unite, 'suivi_stock', ligne.suivi, 'stock_minimum', ligne.minimum)));
  end loop;
  client_fidele := public.enregistrer_contact(etab, jsonb_build_object('nom', 'Client fidèle Démo', 'type', 'client', 'telephone', '+242 05 000 00 10'));
  restaurant := public.enregistrer_contact(etab, jsonb_build_object('nom', 'Restaurant Démo (compte)', 'type', 'client', 'telephone', '+242 05 000 00 11'));
  fournisseur := public.enregistrer_contact(etab, jsonb_build_object('nom', 'Grossiste Démo', 'type', 'fournisseur', 'telephone', '+242 05 000 00 12'));

  -- 7. Réception au dépôt, puis réassort des deux boutiques par transferts.
  perform set_config('request.jwt.claims', json_build_object('sub', depotier, 'role', 'authenticated')::text, true);
  for ligne in select * from (values
    ('RIZ-25', 60), ('HUI-05', 80), ('SUC-01', 300), ('LAI-40', 120), ('SPA-50', 400), ('TOM-40', 240), ('SAR-12', 300),
    ('EAU-15', 150), ('JUS-01', 120), ('SAV-40', 400), ('DET-01', 120), ('BOU-10', 80), ('PIL-AA', 60)
  ) as r(reference, quantite) loop
    perform public.ajuster_stock_hub(hub_dep, (art ->> ligne.reference)::uuid, 'entree', ligne.quantite, 'Réception Grossiste Démo', null);
  end loop;
  perform public.transferer_stock(etab, hub_dep, hub_mp, jsonb_build_array(
    jsonb_build_object('article_id', art ->> 'RIZ-25', 'quantite', 12), jsonb_build_object('article_id', art ->> 'HUI-05', 'quantite', 20),
    jsonb_build_object('article_id', art ->> 'SUC-01', 'quantite', 80), jsonb_build_object('article_id', art ->> 'LAI-40', 'quantite', 30),
    jsonb_build_object('article_id', art ->> 'SPA-50', 'quantite', 100), jsonb_build_object('article_id', art ->> 'TOM-40', 'quantite', 60),
    jsonb_build_object('article_id', art ->> 'SAR-12', 'quantite', 80), jsonb_build_object('article_id', art ->> 'EAU-15', 'quantite', 40),
    jsonb_build_object('article_id', art ->> 'JUS-01', 'quantite', 30), jsonb_build_object('article_id', art ->> 'SAV-40', 'quantite', 100),
    jsonb_build_object('article_id', art ->> 'DET-01', 'quantite', 30), jsonb_build_object('article_id', art ->> 'BOU-10', 'quantite', 20),
    jsonb_build_object('article_id', art ->> 'PIL-AA', 'quantite', 15)), 'Réassort hebdomadaire');
  perform set_config('request.jwt.claims', json_build_object('sub', gerante, 'role', 'authenticated')::text, true);
  perform public.transferer_stock(etab, hub_dep, hub_bmt, jsonb_build_array(
    jsonb_build_object('article_id', art ->> 'RIZ-25', 'quantite', 6), jsonb_build_object('article_id', art ->> 'HUI-05', 'quantite', 10),
    jsonb_build_object('article_id', art ->> 'SUC-01', 'quantite', 40), jsonb_build_object('article_id', art ->> 'SPA-50', 'quantite', 60),
    jsonb_build_object('article_id', art ->> 'TOM-40', 'quantite', 30), jsonb_build_object('article_id', art ->> 'SAR-12', 'quantite', 40),
    jsonb_build_object('article_id', art ->> 'EAU-15', 'quantite', 25), jsonb_build_object('article_id', art ->> 'SAV-40', 'quantite', 50),
    jsonb_build_object('article_id', art ->> 'PIL-AA', 'quantite', 4)), 'Ouverture du stand du marché');

  -- 8. Ventes du jour dans les deux boutiques.
  session_mp := public.ouvrir_caisse(etab, caisse_mp, 25000);
  perform public.enregistrer_vente(etab, session_mp, jsonb_build_array(
    jsonb_build_object('article_id', art ->> 'RIZ-25', 'quantite', 1), jsonb_build_object('article_id', art ->> 'HUI-05', 'quantite', 1)),
    jsonb_build_array(jsonb_build_object('mode', 'especes', 'montant', 30000)), null, 0, null);
  perform public.enregistrer_vente(etab, session_mp, jsonb_build_array(
    jsonb_build_object('article_id', art ->> 'LAI-40', 'quantite', 2), jsonb_build_object('article_id', art ->> 'SUC-01', 'quantite', 3),
    jsonb_build_object('article_id', art ->> 'JUS-01', 'quantite', 2)),
    jsonb_build_array(jsonb_build_object('mode', 'mobile_money', 'montant', 10700, 'reference', 'MM-DEMO-001')), null, 0, null);
  perform public.enregistrer_vente(etab, session_mp, jsonb_build_array(
    jsonb_build_object('article_id', art ->> 'EAU-15', 'quantite', 5), jsonb_build_object('article_id', art ->> 'LIV-01', 'quantite', 1)),
    jsonb_build_array(jsonb_build_object('mode', 'especes', 'montant', 5000)), restaurant, 0, 'Livraison restaurant, solde à 15 jours');
  vente := public.enregistrer_vente(etab, session_mp, jsonb_build_array(
    jsonb_build_object('article_id', art ->> 'DET-01', 'quantite', 2), jsonb_build_object('article_id', art ->> 'SAV-40', 'quantite', 6)),
    jsonb_build_array(jsonb_build_object('mode', 'especes', 'montant', 6600)), null, 0, null);
  perform public.annuler_vente((vente ->> 'vente_id')::uuid, 'Erreur de saisie : article remplacé');
  perform public.enregistrer_vente(etab, session_mp, jsonb_build_array(
    jsonb_build_object('article_id', art ->> 'DET-01', 'quantite', 1), jsonb_build_object('article_id', art ->> 'SAV-40', 'quantite', 6),
    jsonb_build_object('article_id', art ->> 'BOU-10', 'quantite', 2)),
    jsonb_build_array(jsonb_build_object('mode', 'especes', 'montant', 10000)), client_fidele, 0, null);
  perform public.enregistrer_depense(etab, jsonb_build_object('libelle', 'Transport depuis le dépôt', 'montant', 3000, 'mode', 'especes',
    'categorie', 'Transport', 'session_caisse_id', session_mp));
  perform public.enregistrer_depense(etab, jsonb_build_object('libelle', 'Facture électricité (fictive)', 'montant', 18000, 'mode', 'virement',
    'categorie', 'Énergie', 'date_depense', current_date - 5, 'hub_id', hub_mp, 'fournisseur_id', fournisseur));

  perform set_config('request.jwt.claims', json_build_object('sub', caisse_marche, 'role', 'authenticated')::text, true);
  session_bmt := public.ouvrir_caisse(etab, caisse_bmt, 10000);
  perform public.enregistrer_vente(etab, session_bmt, jsonb_build_array(
    jsonb_build_object('article_id', art ->> 'SPA-50', 'quantite', 5), jsonb_build_object('article_id', art ->> 'TOM-40', 'quantite', 3),
    jsonb_build_object('article_id', art ->> 'SAR-12', 'quantite', 4)),
    jsonb_build_array(jsonb_build_object('mode', 'especes', 'montant', 10000)), null, 0, null);
  perform public.enregistrer_vente(etab, session_bmt, jsonb_build_array(
    jsonb_build_object('article_id', art ->> 'RIZ-25', 'quantite', 1), jsonb_build_object('article_id', art ->> 'SUC-01', 'quantite', 5)),
    jsonb_build_array(jsonb_build_object('mode', 'mobile_money', 'montant', 23000, 'reference', 'MM-DEMO-002')), null, 0, null);
  perform public.enregistrer_vente(etab, session_bmt, jsonb_build_array(
    jsonb_build_object('article_id', art ->> 'EAU-15', 'quantite', 2), jsonb_build_object('article_id', art ->> 'SAV-40', 'quantite', 4)),
    jsonb_build_array(jsonb_build_object('mode', 'especes', 'montant', 7000)), null, 0, null);
  perform set_config('request.jwt.claims', json_build_object('sub', gerante, 'role', 'authenticated')::text, true);
  perform public.cloturer_caisse(session_bmt, 24500, 'Clôture de démonstration (200 FCFA manquants)');

  -- 9. Inventaire du dépôt (un petit écart sur le savon).
  perform set_config('request.jwt.claims', json_build_object('sub', depotier, 'role', 'authenticated')::text, true);
  perform public.enregistrer_inventaire(hub_dep, jsonb_build_array(
    jsonb_build_object('article_id', art ->> 'SAV-40', 'quantite_comptee', 248),
    jsonb_build_object('article_id', art ->> 'PIL-AA', 'quantite_comptee', 41)), 'Inventaire tournant (démo)');

  -- 10. Mise en service, puis comptes du patron et de l'utilisateur limité (mot de passe temporaire).
  perform set_config('request.jwt.claims', json_build_object('sub', sa, 'role', 'authenticated')::text, true);
  perform public.mettre_en_service(etab);
  select user_id into patron from public.comptes_connexion where lower(identifiant) = 'patrondemo';
  if patron is null then
    patron := public.creer_compte('patrondemo@identifiants.agence-elite.fr', 'Patrondemo', 'Patron Démo', mdp, 30);
  end if;
  select user_id into userdemo from public.comptes_connexion where lower(identifiant) = 'userdemo';
  if userdemo is null then
    userdemo := public.creer_compte('userdemo@identifiants.agence-elite.fr', 'Userdemo', 'User Démo', mdp, 30);
  end if;
  insert into public.etablissement_membres (etablissement_id, user_id, role_id) values (etab, patron, 'gerant'), (etab, userdemo, 'employe')
  on conflict (etablissement_id, user_id) do nothing;
  perform public.definir_hubs_membre(etab, userdemo, array[hub_mp]);
  perform set_config('request.jwt.claims', '', true);
end
$$;
