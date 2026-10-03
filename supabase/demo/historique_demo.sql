-- Historique de démonstration : plusieurs mois d'activité FICTIVE pour que les tableaux de bord de la
-- démo (Patrondemo et les comptes de démonstration) montrent des tendances et des comparaisons.
-- Exécuté après commerce_demo.sql et modules_demo.sql, en local (PGlite) et en production (workflow
-- « Démo et comptes »). Idempotent : ne fait rien si l'historique existe déjà.
-- Les lignes sont écrites directement avec leur date passée (les fonctions de la plateforme datent tout
-- « maintenant ») mais restent cohérentes : chaque vente a ses lignes, son paiement et ses mouvements de
-- stock (réassort puis sortie, le stock du jour n'est pas modifié). Aucune paie, aucune donnée réelle.
do $$
declare
  marque constant text := 'Historique de démonstration';
  domaine constant text := 'demo.agence-elite.fr';
  etab uuid; resto uuid; hotel uuid; boutique uuid;
  gerante uuid; caissier uuid; serveur uuid; hotelier uuid; vendeuse uuid;
  tz text;
  arts jsonb; plats jsonb; produits jsonb;
  h record; ch record; ligne record;
  d date; j integer; k integer; n integer; graine bigint; i integer; nb integer;
  quand timestamptz; v uuid; total numeric; paye numeric; mode text; q integer; a jsonb; lignes jsonb;
  hub_resto uuid; hub_boutique uuid; tables uuid[];
  arrivee date; depart date; nuits integer; noms text[] := array['M. Mabiala', 'Mme Nkounkou', 'M. Okemba', 'Mme Bouanga', 'M. Tchicaya',
    'Mme Loemba', 'M. Moukala', 'Mme Ngoma', 'M. Itoua', 'Mme Massamba', 'M. Kimbembe', 'Mme Samba'];
  sources text[] := array['direct', 'telephone', 'whatsapp', 'site_web', 'agence'];
  contacts uuid[]; etape_gagnee uuid; etape_perdue uuid;
begin
  select e.id, e.fuseau into etab, tz from public.etablissements e where e.nom = 'Commerce Démo' order by e.cree_le limit 1;
  if etab is null or exists (select 1 from public.ventes where etablissement_id = etab and note = marque) then
    return;
  end if;
  tz := coalesce(tz, 'Africa/Brazzaville');
  select id into gerante from auth.users where email = 'gerante@' || domaine;
  select id into caissier from auth.users where email = 'caisse-marche@' || domaine;
  select id into resto from public.etablissements where nom = 'Restaurant Démo' and client_id = (select client_id from public.etablissements where id = etab);
  select id into hotel from public.etablissements where nom = 'Hôtel Démo' and client_id = (select client_id from public.etablissements where id = etab);
  select id into boutique from public.etablissements where nom = 'Boutique en ligne Démo' and client_id = (select client_id from public.etablissements where id = etab);
  select id into serveur from auth.users where email = 'serveur@' || domaine;
  select id into hotelier from auth.users where email = 'hotel@' || domaine;
  select id into vendeuse from auth.users where email = 'boutique@' || domaine;

  -- 1. Commerce Démo : 120 jours de ventes dans les deux points de vente (tendance en hausse, week-ends plus forts).
  select jsonb_agg(jsonb_build_object('id', a.id, 'nom', a.nom, 'prix', a.prix_vente, 'cout', a.cout_achat) order by a.reference)
  into arts from public.articles a where a.etablissement_id = etab and a.actif and a.suivi_stock;
  for h in
    select hb.id hub, pv.id caisse, case when hb.principal then gerante else coalesce(caissier, gerante) end vendeur,
           hb.code, case when hb.principal then 4 else 2 end base
    from public.hubs hb join public.points_de_vente pv on pv.hub_id = hb.id
    where hb.etablissement_id = etab and hb.capacite_vente and hb.actif
  loop
    for j in 1..120 loop
      d := current_date - j;
      n := h.base + (abs(hashtext(d::text || h.code)) % 4) + case when extract(dow from d) in (5, 6) then 2 else 0 end + case when j <= 30 then 1 else 0 end;
      for k in 1..n loop
        graine := abs(hashtext(d::text || h.code || k));
        quand := (d + time '08:30' + (graine % 600) * interval '1 minute') at time zone tz;
        mode := case when graine % 10 < 6 then 'especes' when graine % 10 < 9 then 'mobile_money' else 'carte' end;
        -- Lignes d'abord (une vente validée ne se modifie plus), puis la vente, ses lignes, son stock, son paiement.
        lignes := '[]'::jsonb;
        total := 0;
        nb := 1 + graine % 3;
        for i in 1..nb loop
          a := arts -> ((graine / (i * 7) + i * 5) % jsonb_array_length(arts))::int;
          q := 1 + (graine / (i * 11)) % 3;
          lignes := lignes || jsonb_build_array(a || jsonb_build_object('q', q));
          total := total + q * (a ->> 'prix')::numeric;
        end loop;
        -- Quelques ventes à crédit (encore dues ou payées à moitié), le reste payé comptant.
        paye := case when graine % 29 = 0 then 0 when graine % 31 = 0 then round(total / 2) else total end;
        insert into public.ventes (etablissement_id, numero, point_de_vente_id, statut, sous_total, remise, total, montant_paye, statut_paiement,
                                   vendeur, cree_le, hub_id, origine, note)
        values (etab, format('H%s-%s-%s', to_char(d, 'YYMMDD'), h.code, k), h.caisse, 'validee', total, 0, total, paye,
                case when paye = 0 then 'impayee' when paye < total then 'partielle' else 'payee' end, h.vendeur, quand, h.hub, 'caisse', marque)
        returning id into v;
        for a in select * from jsonb_array_elements(lignes) loop
          q := (a ->> 'q')::int;
          insert into public.lignes_vente (vente_id, etablissement_id, article_id, libelle, quantite, prix_unitaire, remise, total, cout_unitaire)
          values (v, etab, (a ->> 'id')::uuid, a ->> 'nom', q, (a ->> 'prix')::numeric, 0, q * (a ->> 'prix')::numeric, (a ->> 'cout')::numeric);
          insert into public.mouvements_stock (etablissement_id, article_id, type, quantite, cout_unitaire, motif, acteur, cree_le, hub_id)
          values (etab, (a ->> 'id')::uuid, 'entree', q, (a ->> 'cout')::numeric, 'Réassort (' || marque || ')', h.vendeur, quand - interval '1 hour', h.hub);
          insert into public.mouvements_stock (etablissement_id, article_id, type, quantite, cout_unitaire, motif, vente_id, acteur, cree_le, hub_id)
          values (etab, (a ->> 'id')::uuid, 'sortie_vente', -q, (a ->> 'cout')::numeric, 'Vente', v, h.vendeur, quand, h.hub);
        end loop;
        if paye > 0 then
          insert into public.paiements (etablissement_id, vente_id, mode, montant, reference, statut, encaisse_par, cree_le, hub_id)
          values (etab, v, mode, paye, case when mode = 'mobile_money' then format('MM-H%s', graine % 100000) end, 'valide', h.vendeur, quand, h.hub);
        end if;
      end loop;
    end loop;
  end loop;

  -- Dépenses courantes de quatre mois (aucune paie).
  for j in 0..3 loop
    d := (date_trunc('month', current_date) - (j || ' month')::interval)::date;
    insert into public.depenses (etablissement_id, date_depense, categorie, libelle, montant, mode, statut, cree_par, cree_le, hub_id)
    select etab, x.jour, x.categorie, x.libelle, x.montant, x.mode, 'valide', gerante, (x.jour + time '10:00') at time zone tz,
           (select id from public.hubs where etablissement_id = etab and principal)
    from (values (d + 2, 'Loyer', 'Loyer du magasin (fictif)', 150000, 'virement'),
                 (d + 9, 'Énergie', 'Électricité (fictive)', 17000 + j * 1500, 'virement'),
                 (d + 15, 'Transport', 'Transport depuis le dépôt', 12000, 'especes'),
                 (d + 20, 'Fournitures', 'Sachets et fournitures de caisse', 8500, 'especes')) as x(jour, categorie, libelle, montant, mode)
    where x.jour < current_date;
  end loop;

  -- CRM : affaires gagnées et perdues sur quatre mois.
  select array_agg(id order by nom) into contacts from public.contacts where etablissement_id = etab and type in ('client', 'prospect') and actif;
  select id into etape_gagnee from public.crm_etapes where etablissement_id = etab and nature = 'gagnee' limit 1;
  select id into etape_perdue from public.crm_etapes where etablissement_id = etab and nature = 'perdue' limit 1;
  if contacts is not null and etape_gagnee is not null and etape_perdue is not null then
    for k in 1..14 loop
      quand := (current_date - (k * 8)) + time '15:00';
      insert into public.crm_opportunites (etablissement_id, numero, titre, contact_id, etape_id, statut, montant, probabilite, source,
                                           responsable_id, motif_perte, cloturee_le, derniere_activite, cree_par, cree_le)
      values (etab, format('OPP-H%s', lpad(k::text, 3, '0')),
              (array['Approvisionnement mensuel', 'Commande événement', 'Contrat de livraison', 'Fournitures de bureau', 'Réassort restaurant'])[1 + k % 5],
              contacts[1 + k % array_length(contacts, 1)], case when k % 3 = 0 then etape_perdue else etape_gagnee end,
              case when k % 3 = 0 then 'perdue' else 'gagnee' end, 60000 + (k * 37000) % 400000, case when k % 3 = 0 then 0 else 100 end,
              (array['instagram', 'whatsapp', 'recommandation', 'appel'])[1 + k % 4], gerante,
              case when k % 3 = 0 then 'Prix jugé trop élevé' end, quand, quand, gerante, quand - interval '20 days');
    end loop;
  end if;

  -- Support : tickets résolus sur deux mois.
  for k in 1..12 loop
    quand := (current_date - (k * 5)) + time '09:30';
    insert into public.support_tickets (etablissement_id, numero, sujet, nom_client, canal, priorite, statut, echeance, resolu_le, cree_le)
    values (etab, format('TK-H%s', lpad(k::text, 3, '0')),
            (array['Article manquant à la livraison', 'Erreur de prix sur le reçu', 'Demande de facture', 'Retour produit abîmé'])[1 + k % 4],
            noms[1 + k % 12], (array['telephone', 'whatsapp', 'email'])[1 + k % 3], case when k % 5 = 0 then 'haute' else 'normale' end,
            'resolu', quand + interval '2 days', quand + ((4 + k % 30) * interval '1 hour'), quand);
  end loop;

  -- 2. Restaurant Démo : 75 jours d'additions encaissées (couverts, ventes, paiements).
  if resto is not null and serveur is not null then
    select id into hub_resto from public.hubs where etablissement_id = resto and principal;
    select array_agg(id order by nom) into tables from public.rest_tables where etablissement_id = resto and actif;
    select jsonb_agg(jsonb_build_object('id', a.id, 'nom', a.nom, 'prix', a.prix_vente, 'cout', a.cout_achat) order by a.nom)
    into plats from public.articles a where a.etablissement_id = resto and a.actif and a.prix_vente > 0;
    if plats is not null then
      for j in 1..75 loop
        d := current_date - j;
        n := 6 + abs(hashtext(d::text || 'resto')) % 6 + case when extract(dow from d) in (5, 6) then 5 else 0 end;
        for k in 1..n loop
          graine := abs(hashtext(d::text || 'resto' || k));
          quand := (d + case when k % 2 = 0 then time '12:00' else time '19:00' end + (graine % 150) * interval '1 minute') at time zone tz;
          q := 1 + graine % 5;
          lignes := '[]'::jsonb;
          total := 0;
          for i in 1..(q + 1) loop
            a := plats -> ((graine / (i * 13) + i * 3) % jsonb_array_length(plats))::int;
            lignes := lignes || jsonb_build_array(a);
            total := total + (a ->> 'prix')::numeric;
          end loop;
          insert into public.ventes (etablissement_id, numero, statut, sous_total, remise, total, montant_paye, statut_paiement, vendeur, cree_le, hub_id, origine, note)
          values (resto, format('H%s-R-%s', to_char(d, 'YYMMDD'), k), 'validee', total, 0, total, total, 'payee', serveur, quand + interval '50 minutes', hub_resto, 'restaurant', marque)
          returning id into v;
          insert into public.lignes_vente (vente_id, etablissement_id, article_id, libelle, quantite, prix_unitaire, remise, total, cout_unitaire)
          select v, resto, (x ->> 'id')::uuid, x ->> 'nom', 1, (x ->> 'prix')::numeric, 0, (x ->> 'prix')::numeric, (x ->> 'cout')::numeric
          from jsonb_array_elements(lignes) x;
          insert into public.paiements (etablissement_id, vente_id, mode, montant, statut, encaisse_par, cree_le, hub_id)
          values (resto, v, case when graine % 3 = 0 then 'mobile_money' else 'especes' end, total, 'valide', serveur, quand + interval '50 minutes', hub_resto);
          insert into public.rest_commandes (etablissement_id, hub_id, numero, table_id, type, couverts, statut, serveur_id, ouverte_le, cloturee_le, modifie_le)
          values (resto, hub_resto, format('H%s-%s', to_char(d, 'YYMMDD'), k),
                  case when graine % 4 = 0 or tables is null then null else tables[1 + graine % array_length(tables, 1)] end,
                  case when graine % 4 = 0 or tables is null then 'a_emporter' else 'sur_place' end,
                  q, 'encaissee', serveur, quand, quand + interval '50 minutes', quand + interval '50 minutes');
        end loop;
      end loop;
    end if;
  end if;

  -- 3. Hôtel Démo : 90 jours de séjours terminés, chambre par chambre (aucun chevauchement avec l'actuel).
  if hotel is not null and hotelier is not null then
    for ch in select c.id, c.type_id, t.tarif_nuit, c.numero from public.hotel_chambres c join public.hotel_types_chambre t on t.id = c.type_id
              where c.etablissement_id = hotel and c.actif and c.menage <> 'hors_service' order by c.numero loop
      arrivee := current_date - 90;
      k := 0;
      loop
        graine := abs(hashtext(ch.numero || arrivee::text));
        arrivee := arrivee + (graine % 3)::int;
        nuits := 1 + (graine % 5)::int;
        depart := arrivee + nuits;
        exit when depart > current_date - 4;
        k := k + 1;
        insert into public.hotel_reservations (etablissement_id, numero, nom_client, telephone, type_id, chambre_id, arrivee, depart, adultes, enfants,
                                               tarif_nuit, source, statut, check_in_le, check_out_le, cree_par, cree_le)
        values (hotel, format('H-%s-%s', ch.numero, lpad(k::text, 3, '0')), noms[1 + graine % 12], '+242 06 000 ' || lpad((graine % 10000)::text, 4, '0'),
                ch.type_id, ch.id, arrivee, depart, 1 + (graine % 2)::int, (graine % 3 = 0)::int, ch.tarif_nuit, sources[1 + graine % 5], 'terminee',
                (arrivee + time '14:00') at time zone tz, (depart + time '11:00') at time zone tz, hotelier, (arrivee - 7 + time '10:00') at time zone tz);
        arrivee := depart;
      end loop;
    end loop;
  end if;

  -- 4. Boutique en ligne Démo : 60 jours de commandes livrées et payées.
  if boutique is not null and vendeuse is not null then
    select id into hub_boutique from public.hubs where etablissement_id = boutique and principal;
    select jsonb_agg(jsonb_build_object('id', a.id, 'nom', a.nom, 'prix', a.prix_vente, 'cout', a.cout_achat) order by a.nom)
    into produits from public.boutique_articles b join public.articles a on a.id = b.article_id where b.etablissement_id = boutique and b.publie and a.actif;
    if produits is not null then
      for j in 1..60 loop
        d := current_date - j;
        n := 1 + abs(hashtext(d::text || 'boutique')) % 4;
        for k in 1..n loop
          graine := abs(hashtext(d::text || 'boutique' || k));
          quand := (d + time '09:00' + (graine % 720) * interval '1 minute') at time zone tz;
          a := produits -> (graine % jsonb_array_length(produits))::int;
          q := 1 + graine % 2;
          total := q * (a ->> 'prix')::numeric;
          insert into public.ventes (etablissement_id, numero, statut, sous_total, remise, total, montant_paye, statut_paiement, vendeur, cree_le, hub_id, origine, note)
          values (boutique, format('H%s-B-%s', to_char(d, 'YYMMDD'), k), 'validee', total, 0, total, total, 'payee', vendeuse, quand + interval '1 hour', hub_boutique, 'boutique', marque)
          returning id into v;
          insert into public.lignes_vente (vente_id, etablissement_id, article_id, libelle, quantite, prix_unitaire, remise, total, cout_unitaire)
          values (v, boutique, (a ->> 'id')::uuid, a ->> 'nom', q, (a ->> 'prix')::numeric, 0, total, (a ->> 'cout')::numeric);
          insert into public.paiements (etablissement_id, vente_id, mode, montant, statut, encaisse_par, cree_le, hub_id)
          values (boutique, v, case when graine % 2 = 0 then 'mobile_money' else 'especes' end, total, 'valide', vendeuse, quand + interval '1 day', hub_boutique);
          insert into public.boutique_commandes (etablissement_id, hub_id, numero, nom_client, telephone, mode_livraison, adresse_livraison, sous_total, remise, frais_livraison, total,
                                                 statut, vente_id, traitee_par, cree_le, confirmee_le, expediee_le, livree_le, modifie_le)
          values (boutique, hub_boutique, format('H%s-%s', to_char(d, 'YYMMDD'), k), noms[1 + graine % 12], '+242 05 000 ' || lpad((graine % 10000)::text, 4, '0'),
                  case when graine % 3 = 0 then 'retrait' else 'livraison' end,
                  case when graine % 3 <> 0 then (array['Poto-Poto, Brazzaville', 'Bacongo, Brazzaville', 'Moungali, Brazzaville', 'Ouenzé, Brazzaville', 'Talangaï, Brazzaville'])[1 + graine % 5] end,
                  total, 0, 0, total, 'livree', v, vendeuse,
                  quand, quand + interval '1 hour', quand + interval '5 hours', quand + interval '1 day', quand + interval '1 day')
          returning id into v;
          insert into public.boutique_lignes (commande_id, etablissement_id, article_id, libelle, quantite, prix_unitaire, total)
          values (v, boutique, (a ->> 'id')::uuid, a ->> 'nom', q, (a ->> 'prix')::numeric, total);
        end loop;
      end loop;
    end if;
  end if;
end
$$;
