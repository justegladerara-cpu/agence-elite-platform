-- Démonstration « The Dream (démo) » : un lounge bar FICTIF pour tester la nouvelle version (2026-10-25).
-- Toutes les données sont inventées (produits, prix, personnes, ventes). Aucune donnée réelle de The Dream.
-- Exécuté seulement dans la démo locale du navigateur (PGlite), jamais en production.
-- Comptes : « Georges » (gérant) et « Caissiere » (caissière Ornella), mot de passe app.demo_mot_de_passe.
-- Idempotent : ne fait rien si le client « The Dream (démo) » existe déjà.
do $$
declare
  mdp text := coalesce(nullif(current_setting('app.demo_mot_de_passe', true), ''), '1234');
  domaine constant text := 'demo.agence-elite.fr';
  sa uuid;
  georges uuid; ornella uuid; benedicte uuid;
  client uuid; etab uuid; hub uuid; caisse uuid; tz text := 'Africa/Brazzaville';
  cat jsonb := '{}'::jsonb; art jsonb := '{}'::jsonb; serv jsonb := '[]'::jsonb;
  ligne record; a jsonb; tirage jsonb; arts_par_ref jsonb := '{}'::jsonb;
  d date; j integer; k integer; n integer; i integer; nb integer; q integer;
  graine bigint; quand timestamptz; v uuid; s uuid; total numeric; remise numeric; mode text; moyen text; ref text;
  caissier uuid; serveur uuid; ouverte timestamptz; fermee timestamptz; numero integer := 0;
  qr uuid;
  lignes jsonb;
begin
  if exists (select 1 from public.clients where nom = 'The Dream (démo)') then
    return;
  end if;
  select u.id into sa from auth.users u join public.plateforme_admins p on p.user_id = u.id where p.role = 'super_admin' order by u.created_at limit 1;
  if sa is null then raise exception 'Super administrateur introuvable'; end if;

  -- 1. Comptes : Georges (gérant), Ornella (caissière, peut se connecter), Bénédicte (caissière, fiche seulement).
  perform set_config('request.jwt.claims', json_build_object('sub', sa, 'role', 'authenticated')::text, true);
  georges := public.creer_compte('georges@identifiants.agence-elite.fr', 'Georges', 'Georges (gérant)', mdp, 30);
  ornella := public.creer_compte('caissiere@identifiants.agence-elite.fr', 'Caissiere', 'Ornella (caissière)', mdp, 30);
  -- Démo d'essai : pas de changement de mot de passe obligatoire à la première connexion.
  update public.comptes_connexion set doit_changer_mot_de_passe = false, temporaire_expire_le = null
  where user_id in (georges, ornella);
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change)
  values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', 'benedicte@' || domaine,
    extensions.crypt(md5(random()::text), extensions.gen_salt('bf')), now(),
    '{"provider": "email", "providers": ["email"]}'::jsonb, '{"nom": "Bénédicte (caissière)"}'::jsonb, now(), now(), '', '', '', '')
  returning id into benedicte;
  insert into public.profils (id, nom_complet) values (benedicte, 'Bénédicte (caissière)')
  on conflict (id) do update set nom_complet = excluded.nom_complet;

  -- 2. Client, établissement, licence.
  client := public.creer_client('The Dream (démo)', 'Congo');
  etab := public.creer_etablissement(client, 'commerce', 'The Dream (démo)');
  perform public.modifier_etablissement(etab, jsonb_build_object('ville', 'Brazzaville', 'pays', 'Congo', 'devise', 'XAF'));
  perform public.attribuer_licence(etab, 'commerce-complet', 'annuel', current_date, null, 0, '{}', 'DEMO', 'Licence de démonstration (fictive)');
  insert into public.etablissement_membres (etablissement_id, user_id, role_id) values
    (etab, georges, 'gerant'), (etab, ornella, 'employe'), (etab, benedicte, 'employe');

  perform set_config('request.jwt.claims', json_build_object('sub', georges, 'role', 'authenticated')::text, true);
  hub := public.hub_principal(etab);
  perform public.enregistrer_hub(etab, jsonb_build_object('id', hub, 'nom', 'Salle principale', 'code', 'SP', 'type', 'mixte',
    'adresse', 'Avenue de la Démo, Brazzaville'));
  select id into caisse from public.points_de_vente where hub_id = hub order by cree_le limit 1;
  perform public.enregistrer_caisse(etab, hub, 'Caisse du bar', caisse, true);
  perform public.enregistrer_identite(etab, jsonb_build_object(
    'nom_commercial', 'The Dream (démo)', 'adresse', 'Avenue de la Démo, Brazzaville', 'telephone', '+242 06 000 00 00',
    'mentions_recu', 'Merci de votre visite. Démonstration : ce reçu est fictif.', 'couleur_principale', '#b45309'));
  perform public.enregistrer_parametres_module(etab, 'etablissement', jsonb_build_object(
    'nouvelle_version', true, 'objectif_jour', 450000, 'suggestions_actives', true,
    'apparence', jsonb_build_object('theme', 'dream', 'mode', 'nuit')));
  perform public.enregistrer_parametres_module(etab, 'caisse', jsonb_build_object(
    'stock_negatif', true, 'qui_a_servi', 'rappel', 'presence_controle', true, 'presence_minutes', 40,
    'moyens_encaissement', jsonb_build_array(
      jsonb_build_object('id', 'mtn', 'libelle', 'MTN Mobile Money', 'mode', 'mobile_money', 'actif', true, 'reference', 'obligatoire'),
      jsonb_build_object('id', 'airtel', 'libelle', 'Airtel Money', 'mode', 'mobile_money', 'actif', true, 'reference', 'obligatoire'),
      jsonb_build_object('id', 'especes', 'libelle', 'Espèces', 'mode', 'especes', 'actif', true, 'reference', 'non'),
      jsonb_build_object('id', 'tpe', 'libelle', 'TPE (carte)', 'mode', 'carte', 'actif', true, 'reference', 'facultative'),
      jsonb_build_object('id', 'cheque', 'libelle', 'Chèque', 'mode', 'cheque', 'actif', false, 'reference', 'facultative'),
      jsonb_build_object('id', 'virement', 'libelle', 'Virement', 'mode', 'virement', 'actif', false, 'reference', 'facultative'))));

  -- 3. Catalogue fictif d'un lounge bar (prix inventés).
  for ligne in select * from unnest(array['Bières', 'Sucreries', 'Cocktails', 'Vins et champagnes', 'Spiritueux', 'Chicha', 'Grillades', 'Test']) as c(nom) loop
    cat := cat || jsonb_build_object(ligne.nom, public.enregistrer_categorie(etab, ligne.nom));
  end loop;
  for ligne in select * from (values
    ('PRI', 'Primus 65 cl', 'Bières', 1000, 650), ('NGO', 'Ngok 65 cl', 'Bières', 1000, 650), ('TUR', 'Turbo King', 'Bières', 1000, 680),
    ('MUT', 'Mützig', 'Bières', 1000, 660), ('BEA', 'Beaufort', 'Bières', 1000, 640), ('CAS', 'Castel', 'Bières', 1000, 630),
    ('HEI', 'Heineken', 'Bières', 1500, 950), ('GUI', 'Guinness', 'Bières', 1500, 980), ('DOP', 'Doppel Munich', 'Bières', 1000, null),
    ('COC', 'Coca-Cola', 'Sucreries', 700, 400), ('FAN', 'Fanta', 'Sucreries', 700, 400), ('SPR', 'Sprite', 'Sucreries', 700, 400),
    ('VIM', 'Vimto', 'Sucreries', 700, 420), ('EAU', 'Eau 1,5 L', 'Sucreries', 800, 450), ('RED', 'Red Bull', 'Sucreries', 1500, 1000),
    ('MOJ', 'Mojito', 'Cocktails', 4000, 1500), ('ANA', 'Anakin', 'Cocktails', 5000, 1800), ('SEX', 'Sex on the beach', 'Cocktails', 4500, 1700),
    ('PIN', 'Piña colada', 'Cocktails', 4500, null), ('SIG', 'Dream Signature', 'Cocktails', 6000, 2200), ('VIR', 'Cocktail sans alcool', 'Cocktails', 3000, 1000),
    ('MOE', 'Moët Impérial', 'Vins et champagnes', 45000, 30000), ('VEU', 'Veuve Clicquot', 'Vins et champagnes', 55000, 37000),
    ('BOR', 'Vin rouge Bordeaux', 'Vins et champagnes', 15000, 8000), ('ROS', 'Vin rosé', 'Vins et champagnes', 12000, null),
    ('JAC', 'Jack Daniel''s (bouteille)', 'Spiritueux', 35000, 22000), ('BLA', 'Black Label (bouteille)', 'Spiritueux', 40000, 26000),
    ('HEN', 'Hennessy VS (bouteille)', 'Spiritueux', 45000, 30000), ('VWH', 'Verre de whisky', 'Spiritueux', 3000, 1100),
    ('SHO', 'Shot de tequila', 'Spiritueux', 2500, 800),
    ('CHM', 'Chicha menthe', 'Chicha', 8000, 2500), ('CHF', 'Chicha fruits rouges', 'Chicha', 10000, 3000),
    ('BRO', 'Brochettes de bœuf', 'Grillades', 3000, 1300), ('POU', 'Poulet braisé', 'Grillades', 6000, 2800),
    ('POI', 'Poisson braisé', 'Grillades', 8000, 4000), ('FRI', 'Frites', 'Grillades', 1500, 500), ('PLA', 'Bananes plantains', 'Grillades', 1500, 500),
    ('APE', 'Assiette apéro', 'Grillades', 5000, null), ('TST', 'Article test', 'Test', 100, null)
  ) as x(reference, nom, categorie, prix, cout) loop
    art := art || jsonb_build_object(ligne.reference, public.enregistrer_article(etab, jsonb_build_object(
      'reference', 'DEMO-' || ligne.reference, 'nom', ligne.nom, 'categorie_id', cat ->> ligne.categorie, 'prix_vente', ligne.prix,
      'cout_achat', ligne.cout, 'unite', 'unité', 'suivi_stock', ligne.categorie not in ('Cocktails', 'Grillades', 'Test'),
      'stock_minimum', case when ligne.categorie = 'Bières' then 24 when ligne.categorie = 'Sucreries' then 12 else 3 end)));
    arts_par_ref := arts_par_ref || jsonb_build_object(ligne.reference, jsonb_build_object('id', art ->> ligne.reference, 'nom', ligne.nom,
      'prix', ligne.prix, 'cout', ligne.cout));
  end loop;

  -- Tirage pondéré : les bières et les sucreries partent le plus, les bouteilles rarement.
  tirage := '[]'::jsonb;
  for ligne in select * from (values
    ('PRI', 14), ('NGO', 12), ('BEA', 10), ('TUR', 7), ('MUT', 6), ('CAS', 5), ('HEI', 6), ('GUI', 4), ('DOP', 2),
    ('COC', 6), ('FAN', 4), ('SPR', 3), ('VIM', 3), ('EAU', 5), ('RED', 3),
    ('MOJ', 4), ('ANA', 4), ('SEX', 2), ('PIN', 2), ('SIG', 2), ('VIR', 1),
    ('MOE', 1), ('VEU', 1), ('BOR', 1), ('ROS', 1), ('JAC', 1), ('BLA', 1), ('HEN', 1), ('VWH', 3), ('SHO', 3),
    ('CHM', 2), ('CHF', 2), ('BRO', 6), ('POU', 3), ('POI', 2), ('FRI', 4), ('PLA', 3), ('APE', 2)
  ) as t(reference, poids) loop
    for i in 1..ligne.poids loop
      tirage := tirage || jsonb_build_array(arts_par_ref -> ligne.reference);
    end loop;
  end loop;

  -- 4. Serveurs (fiches fictives).
  for ligne in select * from (values ('Merveille', 'Serveuse'), ('Prisca', 'Serveuse'), ('Divine', 'Serveuse'),
    ('Chancelvie', 'Serveuse'), ('Jordy', 'Serveur'), ('Grâce', 'Serveuse')) as t(prenom, role) loop
    insert into public.serveurs_caisse (etablissement_id, prenom, role, telephone, cree_par)
    values (etab, ligne.prenom, ligne.role, '+242 06 000 00 ' || lpad((jsonb_array_length(serv) + 21)::text, 2, '0'), georges)
    returning id into s;
    serv := serv || jsonb_build_array(s);
  end loop;

  -- 5. Stock de départ (livraison fictive du dépôt).
  for ligne in select * from (values ('PRI', 180), ('NGO', 150), ('TUR', 96), ('MUT', 72), ('BEA', 5), ('CAS', 60), ('HEI', 48),
    ('GUI', 36), ('DOP', 24), ('COC', 72), ('FAN', 48), ('SPR', 36), ('VIM', 30), ('EAU', 40), ('RED', 24),
    ('MOE', 6), ('VEU', 4), ('BOR', 8), ('ROS', 6), ('JAC', 3), ('BLA', 2), ('HEN', 3), ('VWH', 1), ('SHO', 2),
    ('CHM', 10), ('CHF', 8)) as r(reference, quantite) loop
    perform public.ajuster_stock_hub(hub, (art ->> ligne.reference)::uuid, 'entree', ligne.quantite, 'Livraison du dépôt (démo)', null);
  end loop;

  -- 6. Historique : 35 soirées fictives (18 h → 3 h), plus fortes le vendredi et le samedi, Z à la fin de chaque soirée.
  --    Puis la soirée en cours (j = 0) : la caisse d'Ornella est ouverte depuis 3 heures, avec ses premières ventes.
  --    Une vente validée ne se modifie plus : les lignes sont tirées d'abord, la vente est écrite avec son total.
  for j in reverse 35..0 loop
    d := current_date - j;
    caissier := case when j % 3 = 0 and j > 0 then benedicte else ornella end;
    perform set_config('request.jwt.claims', json_build_object('sub', caissier, 'role', 'authenticated')::text, true);
    if j = 0 then
      ouverte := now() - interval '3 hours';
      fermee := null;
      n := 18;
    else
      ouverte := (d + time '17:45') at time zone tz;
      fermee := (d + 1 + time '03:20') at time zone tz;
      n := 26 + (abs(hashtext(d::text)) % 14) + case when extract(dow from d) in (5, 6) then 22 when extract(dow from d) = 0 then 8 else 0 end
           + case when j <= 14 then 4 else 0 end;
    end if;
    insert into public.sessions_caisse (etablissement_id, point_de_vente_id, statut, fond_initial, ouverte_par, ouverte_le, cloturee_le, hub_id)
    values (etab, caisse, case when j = 0 then 'ouverte' else 'cloturee' end, 20000, caissier, ouverte, fermee, hub) returning id into s;
    for k in 1..n loop
      graine := abs(hashtext(d::text || '-' || k));
      if j = 0 then
        quand := ouverte + (5 + graine % 170) * interval '1 minute';
      else
        quand := ouverte + interval '15 minutes' + case when graine % 3 = 0 then (graine % 240) else 180 + (graine % 330) end * interval '1 minute';
      end if;
      lignes := '[]'::jsonb;
      total := 0;
      nb := 1 + graine % 4;
      for i in 1..nb loop
        a := tirage -> ((graine / (i * 13) + i * 7) % jsonb_array_length(tirage))::int;
        q := case when (a ->> 'prix')::numeric >= 15000 then 1 else 1 + (graine / (i * 17)) % 3 end;
        lignes := lignes || jsonb_build_array(a || jsonb_build_object('q', q));
        total := total + q * (a ->> 'prix')::numeric;
      end loop;
      remise := case when graine % 37 = 0 then round(total * 0.1 / 100) * 100 else 0 end;
      mode := case when graine % 20 < 10 then 'especes' when graine % 20 < 18 then 'mobile_money' else 'carte' end;
      moyen := case when mode = 'especes' then null when mode = 'carte' then 'TPE' when graine % 20 < 15 then 'MTN' else 'AIRTEL' end;
      ref := case when moyen is null then null else moyen || ' · ' || lpad((graine % 9000 + 1000)::text, 4, '0') end;
      numero := numero + 1;
      serveur := case when graine % 9 = 0 then null else (serv ->> ((graine / 7) % jsonb_array_length(serv))::int)::uuid end;
      -- Quelques additions laissées « à encaisser » (payées plus tard).
      insert into public.ventes (etablissement_id, numero, session_caisse_id, point_de_vente_id, statut, sous_total, remise, total,
        montant_paye, statut_paiement, vendeur, cree_le, hub_id, origine, serveur_id, servi_par)
      values (etab, 'D' || lpad(numero::text, 6, '0'), s, caisse, 'validee', total, remise, total - remise,
        case when graine % 41 = 0 then 0 else total - remise end, case when graine % 41 = 0 then 'impayee' else 'payee' end,
        caissier, quand, hub, 'caisse', serveur, (select prenom from public.serveurs_caisse where id = serveur))
      returning id into v;
      for a in select * from jsonb_array_elements(lignes) loop
        q := (a ->> 'q')::int;
        insert into public.lignes_vente (vente_id, etablissement_id, article_id, libelle, quantite, prix_unitaire, remise, total, cout_unitaire)
        values (v, etab, (a ->> 'id')::uuid, a ->> 'nom', q, (a ->> 'prix')::numeric, 0, q * (a ->> 'prix')::numeric, (a ->> 'cout')::numeric);
        insert into public.mouvements_stock (etablissement_id, article_id, type, quantite, cout_unitaire, motif, acteur, cree_le, hub_id)
        values (etab, (a ->> 'id')::uuid, 'entree', q, (a ->> 'cout')::numeric, 'Livraison (démo)', caissier, quand - interval '2 hours', hub);
        insert into public.mouvements_stock (etablissement_id, article_id, type, quantite, cout_unitaire, motif, vente_id, acteur, cree_le, hub_id)
        values (etab, (a ->> 'id')::uuid, 'sortie_vente', -q, (a ->> 'cout')::numeric, 'Vente', v, caissier, quand, hub);
      end loop;
      if graine % 41 <> 0 and total - remise > 0 then
        insert into public.paiements (etablissement_id, vente_id, session_caisse_id, mode, montant, reference, encaisse_par, cree_le)
        values (etab, v, s, mode, total - remise, ref, caissier, quand + interval '2 minutes');
      end if;
      if graine % 47 = 0 then
        update public.paiements set statut = 'annule', annule_le = quand + interval '6 minutes', annule_par = caissier,
          motif_annulation = 'Vente annulée' where vente_id = v;
        update public.ventes set statut = 'annulee', annulee_le = quand + interval '6 minutes', annulee_par = caissier,
          motif_annulation = (array['Erreur de saisie', 'Client parti', 'Mauvais produit', 'Doublon'])[1 + graine % 4] where id = v;
      end if;
    end loop;
    continue when j = 0;
    insert into public.clotures (etablissement_id, hub_id, numero, session_caisse_id, point_de_vente_id, ouverte_le, cloturee_le, cloturee_par,
      fond_initial, nombre_ventes, total_ventes, nombre_annulations, total_annulations, total_remises, encaissements, depenses_especes,
      credit_accorde, especes_attendues, especes_comptees, ecart, articles_vendus)
    select etab, hub, 'Z-D' || to_char(d, 'YYMMDD'), s, caisse, ouverte, fermee, caissier, 20000,
      count(*) filter (where vt.statut = 'validee'), coalesce(sum(vt.total) filter (where vt.statut = 'validee'), 0),
      count(*) filter (where vt.statut = 'annulee'), coalesce(sum(vt.total) filter (where vt.statut = 'annulee'), 0),
      coalesce(sum(vt.remise) filter (where vt.statut = 'validee'), 0),
      coalesce((select jsonb_object_agg(e.mode, e.m) from (select p.mode, sum(p.montant) m from public.paiements p
        where p.session_caisse_id = s and p.statut = 'valide' group by 1) e), '{}'::jsonb),
      0, coalesce(sum(vt.total - vt.montant_paye) filter (where vt.statut = 'validee'), 0),
      20000 + coalesce((select sum(p.montant) from public.paiements p where p.session_caisse_id = s and p.statut = 'valide' and p.mode = 'especes'), 0),
      20000 + coalesce((select sum(p.montant) from public.paiements p where p.session_caisse_id = s and p.statut = 'valide' and p.mode = 'especes'), 0)
        - case when caissier = benedicte and j % 2 = 0 then 3000 + (abs(hashtext(d::text)) % 4) * 1000 when j % 7 = 0 then 1000 else 0 end,
      - case when caissier = benedicte and j % 2 = 0 then 3000 + (abs(hashtext(d::text)) % 4) * 1000 when j % 7 = 0 then 1000 else 0 end,
      coalesce((select jsonb_agg(jsonb_build_object('libelle', av.libelle, 'quantite', av.qte, 'total', av.t) order by av.t desc) from (
        select l.libelle, sum(l.quantite) qte, sum(l.total) t from public.lignes_vente l join public.ventes x on x.id = l.vente_id
        where x.session_caisse_id = s and x.statut = 'validee' group by 1) av), '[]'::jsonb)
    from public.ventes vt where vt.session_caisse_id = s;
  end loop;

  perform set_config('request.jwt.claims', json_build_object('sub', georges, 'role', 'authenticated')::text, true);
  -- 8. QR « Menu The Dream » et ses scans (anonymes), suggestions des clients, présence en caisse.
  insert into public.qr_codes (etablissement_id, nom, type, cible, jeton, avec_logo, cree_par)
  values (etab, 'Menu The Dream', 'lien', 'https://example.com/menu-the-dream-demo', substr(md5(etab::text || 'menu'), 1, 20), true, georges)
  returning id into qr;
  insert into public.qr_scans (etablissement_id, qr_code_id, scanne_le, appareil)
  select etab, qr, ((current_date - (g % 30)) + time '19:00' + (g * 37 % 420) * interval '1 minute') at time zone tz,
         (array['mobile', 'mobile', 'mobile', 'tablette', 'ordinateur'])[1 + g % 5]
  from generate_series(1, 152) g;
  insert into public.suggestions_clients (etablissement_id, qr_code_id, note, sujets, message, cree_le) values
    (etab, qr, 5, '{Ambiance,Musique}', 'Super soirée, le DJ était top !', now() - interval '2 days'),
    (etab, qr, 4, '{Service}', 'Bon service, un peu d''attente pour les grillades.', now() - interval '3 days'),
    (etab, qr, 2, '{Attente,Prix}', 'Trop d''attente samedi soir, et la Heineken est chère.', now() - interval '1 day'),
    (etab, qr, 5, '{Cocktails}', 'L''Anakin est excellent.', now() - interval '5 days'),
    (etab, qr, 3, '{Propreté}', 'Les toilettes pourraient être plus propres.', now() - interval '6 days'),
    (etab, qr, 4, '{Ambiance}', null, now() - interval '8 hours');
  insert into public.presences_caisse (etablissement_id, user_id, evenement, delai_secondes, cree_le)
  select etab, case when g % 3 = 0 then benedicte else ornella end,
         case when g % 3 = 0 and g % 2 = 0 then 'manquee' else 'presente' end, case when g % 3 = 0 and g % 2 = 0 then null else 4 + g % 40 end,
         ((current_date - (g % 30)) + time '20:00' + (g * 53 % 360) * interval '1 minute') at time zone tz
  from generate_series(1, 120) g;

  perform set_config('request.jwt.claims', json_build_object('sub', sa, 'role', 'authenticated')::text, true);
  perform public.mettre_en_service(etab);
  perform set_config('request.jwt.claims', '', true);
end
$$;
