import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { commeRole, creerBase } from './helpers/db.js';
import { resteMinimum } from '../src/modules/restaurant/vip.js';
import { filtrerReserves, formatReste } from '../src/modules/caisse/reserves.js';
import { situationClient, totalConsignes } from '../src/modules/stock/emballages.js';

// Emballages consignés, bouteilles en réserve, tables VIP avec minimum (migration 20261013000136). Données fictives.
let db;
let sa;
let gerant;
let serveur;
let lecteur;
let autreGerant;
let etab;
let autreEtab;
let hub;
let fournisseur;
let client;
let casier;
let whisky;
let poulet;
let session;

const utilisateur = async (email) => (await db.query('insert into auth.users(email) values($1) returning id', [email])).rows[0].id;
const comme = (user, sql, params = []) => commeRole(db, 'authenticated', user, async (tx) => (await tx.query(sql, params)).rows);
const valeur = async (user, sql, params = []) => Object.values((await comme(user, sql, params))[0])[0];
const json = (v) => JSON.stringify(v);
const mouvement = (user, p) => valeur(user, 'select noter_mouvement_emballage($1, $2::jsonb)', [etab, json(p)]);
const situation = async (user = gerant) => (await valeur(user, 'select situation_emballages($1)', [etab])).find((e) => e.id === casier);

beforeAll(async () => {
  db = await creerBase();
  sa = await utilisateur('sa@vip.test');
  gerant = await utilisateur('gerant@vip.test');
  serveur = await utilisateur('serveur@vip.test');
  lecteur = await utilisateur('lecteur@vip.test');
  autreGerant = await utilisateur('autre@vip.test');
  await db.query("insert into plateforme_admins(user_id, role) values($1, 'super_admin')", [sa]);
  const c1 = await valeur(sa, "select creer_client('Bar Démo VIP')");
  const c2 = await valeur(sa, "select creer_client('Autre Bar Démo')");
  etab = await valeur(sa, "select creer_etablissement($1, 'restaurant', 'Lounge Démo')", [c1]);
  autreEtab = await valeur(sa, "select creer_etablissement($1, 'restaurant', 'Autre Lounge')", [c2]);
  await db.query(
    `insert into etablissement_membres(etablissement_id, user_id, role_id) values
     ($1, $2, 'gerant'), ($1, $3, 'serveur'), ($1, $4, 'lecteur'), ($5, $6, 'gerant')`,
    [etab, gerant, serveur, lecteur, autreEtab, autreGerant]
  );
  await db.query("insert into etablissement_modules(etablissement_id, module_id) values($1, 'contacts') on conflict (etablissement_id, module_id) do update set actif = true", [etab]);
  hub = (await db.query('select id from hubs where etablissement_id = $1 and principal', [etab])).rows[0].id;
  fournisseur = await valeur(gerant, 'select enregistrer_contact($1, $2::jsonb)', [etab, json({ nom: 'Brasserie Fictive', type: 'fournisseur' })]);
  client = await valeur(gerant, 'select enregistrer_contact($1, $2::jsonb)', [etab, json({ nom: 'M. Test VIP', telephone: '+242 06 000 00 01' })]);
  whisky = await valeur(gerant, 'select enregistrer_article($1, $2::jsonb)', [etab, json({ nom: 'Whisky fictif 70 cl', prix_vente: 40000, suivi_stock: false })]);
  poulet = await valeur(gerant, 'select enregistrer_article($1, $2::jsonb)', [etab, json({ nom: 'Poulet DG', prix_vente: 6000, suivi_stock: false })]);
  session = await valeur(serveur, 'select ouvrir_caisse($1, null, 0)', [etab]);
});

afterAll(async () => db.close());

describe('emballages consignés', () => {
  test('seul un responsable crée les types ; nom unique ; consigne 0 permise', async () => {
    await expect(comme(serveur, 'select enregistrer_emballage($1, $2::jsonb)', [etab, json({ nom: 'Casier 12' })])).rejects.toThrow(/Permission refusée/);
    casier = await valeur(gerant, 'select enregistrer_emballage($1, $2::jsonb)', [etab, json({ nom: 'Casier 12', consigne: 3000 })]);
    await expect(comme(gerant, 'select enregistrer_emballage($1, $2::jsonb)', [etab, json({ nom: ' casier 12 ' })])).rejects.toThrow(/déjà/);
    const sansConsigne = await valeur(gerant, 'select enregistrer_emballage($1, $2::jsonb)', [etab, json({ nom: 'Bouteille 65 cl', consigne: 0 })]);
    expect(sansConsigne).toBeTruthy();
    await expect(comme(gerant, 'select enregistrer_emballage($1, $2::jsonb)', [etab, json({ nom: 'X', consigne: -1 })])).rejects.toThrow(/Consigne invalide/);
  });

  test('fournisseur : reçu, rendu ; on ne rend pas plus qu’on ne doit', async () => {
    await mouvement(serveur, { emballage_id: casier, type: 'recu_fournisseur', quantite: 10, contact_id: fournisseur });
    await expect(mouvement(serveur, { emballage_id: casier, type: 'recu_fournisseur', quantite: 2 })).rejects.toThrow(/fournisseur/);
    await expect(mouvement(serveur, { emballage_id: casier, type: 'recu_fournisseur', quantite: 2, contact_id: client })).rejects.toThrow(/fournisseur/);
    await mouvement(serveur, { emballage_id: casier, type: 'rendu_fournisseur', quantite: 4, contact_id: fournisseur });
    await expect(mouvement(serveur, { emballage_id: casier, type: 'rendu_fournisseur', quantite: 7, contact_id: fournisseur })).rejects.toThrow(/ne doit pas autant/);
    const s = await situation();
    expect(Number(s.chez_nous)).toBe(6);
    expect(s.fournisseurs).toEqual([{ contact_id: fournisseur, nom: 'Brasserie Fictive', du: 6 }]);
  });

  test('client : consigne proposée d’après l’emballage, rendue ou gardée', async () => {
    await mouvement(serveur, { emballage_id: casier, type: 'donne_client', quantite: 2, contact_id: client });
    await mouvement(serveur, { emballage_id: casier, type: 'donne_client', quantite: 1, nom_client: 'Client de la terrasse', montant: 0 });
    let s = await situation();
    expect(Number(s.chez_nous)).toBe(3);
    expect(Number(s.chez_clients)).toBe(3);
    expect(Number(s.consignes_gardees)).toBe(6000);
    await mouvement(serveur, { emballage_id: casier, type: 'rendu_client', quantite: 1, contact_id: client, montant: 3000 });
    s = await situation();
    expect(Number(s.chez_clients)).toBe(2);
    expect(Number(s.consignes_gardees)).toBe(3000);
    expect(s.clients.map((c) => [c.nom, c.quantite])).toEqual([['Client de la terrasse', 1], ['M. Test VIP', 1]]);
    await expect(mouvement(serveur, { emballage_id: casier, type: 'donne_client', quantite: 0 })).rejects.toThrow(/supérieur à 0/);
    await expect(mouvement(serveur, { emballage_id: casier, type: 'donne_client', quantite: 1.5 })).rejects.toThrow(/entier/);
  });

  test('ajustement (casse) : responsable et motif ; annulation avec motif, jamais de suppression', async () => {
    await expect(mouvement(serveur, { emballage_id: casier, type: 'ajustement', quantite: -1, note: 'Casse' })).rejects.toThrow(/Permission refusée/);
    await expect(mouvement(gerant, { emballage_id: casier, type: 'ajustement', quantite: -1 })).rejects.toThrow(/motif/);
    const casse = await mouvement(gerant, { emballage_id: casier, type: 'ajustement', quantite: -1, note: 'Casier cassé' });
    expect(Number((await situation()).chez_nous)).toBe(3);
    await expect(comme(serveur, "select annuler_mouvement_emballage($1, 'erreur')", [casse])).rejects.toThrow(/Permission refusée/);
    await expect(comme(gerant, "select annuler_mouvement_emballage($1, '  ')", [casse])).rejects.toThrow(/motif/);
    await comme(gerant, "select annuler_mouvement_emballage($1, 'Pas cassé finalement')", [casse]);
    expect(Number((await situation()).chez_nous)).toBe(4);
    await expect(comme(gerant, "select annuler_mouvement_emballage($1, 'encore')", [casse])).rejects.toThrow(/déjà annulé/);
    await expect(db.query('delete from emballages_mouvements where id = $1', [casse])).rejects.toThrow();
  });

  test('lecture : l’autre établissement ne voit rien et ne peut rien écrire', async () => {
    expect(await comme(autreGerant, 'select id from emballages')).toEqual([]);
    await expect(comme(autreGerant, 'select situation_emballages($1)', [etab])).rejects.toThrow(/Accès refusé/);
    await expect(comme(autreGerant, 'select noter_mouvement_emballage($1, $2::jsonb)', [etab, json({ emballage_id: casier, type: 'donne_client', quantite: 1 })])).rejects.toThrow(/Permission refusée/);
    expect((await comme(lecteur, 'select id from emballages_mouvements')).length).toBeGreaterThan(0);
  });
});

describe('bouteilles en réserve', () => {
  let reserve;
  test('après une vente normale, le reste est gardé au nom du client', async () => {
    const vente = await valeur(serveur, 'select enregistrer_vente($1, $2, $3::jsonb, $4::jsonb)', [etab, session,
      json([{ article_id: whisky, quantite: 1 }]), json([{ mode: 'especes', montant: 40000 }])]);
    await expect(comme(serveur, 'select mettre_bouteille_en_reserve($1, $2::jsonb)', [etab, json({ article_id: whisky, reste: 0.5 })])).rejects.toThrow(/nom du client/);
    await expect(comme(serveur, 'select mettre_bouteille_en_reserve($1, $2::jsonb)', [etab, json({ nom_client: 'X', article_id: whisky, reste: 1.5 })])).rejects.toThrow(/dépasser/);
    await expect(comme(serveur, 'select mettre_bouteille_en_reserve($1, $2::jsonb)', [etab, json({ nom_client: 'X', libelle: 'W', reste: 0.5, expire_le: '2020-01-01' })])).rejects.toThrow(/déjà passée/);
    const r = await valeur(serveur, 'select mettre_bouteille_en_reserve($1, $2::jsonb)', [etab,
      json({ contact_id: client, article_id: whisky, reste: 0.5, vente_id: vente.vente_id, photo: 'data:image/png;base64,AAAA' })]);
    reserve = r.id;
    expect(r.numero).toMatch(/^RB-/);
    const ligne = (await db.query('select * from reserves_bouteilles where id = $1', [reserve])).rows[0];
    expect(ligne).toMatchObject({ nom_client: 'M. Test VIP', telephone: '+242 06 000 00 01', libelle: 'Whisky fictif 70 cl', unite: 'bouteille', statut: 'en_cours' });
    expect(Number(ligne.reste)).toBe(0.5);
    // Aucune vente de plus n'est créée par la réserve ni par les services.
    expect((await db.query('select count(*)::int n from ventes where etablissement_id = $1', [etab])).rows[0].n).toBe(1);
  });

  test('servir diminue le reste sans vente ; journal ; vide = terminée', async () => {
    await expect(comme(serveur, 'select servir_depuis_reserve($1, 0.75)', [reserve])).rejects.toThrow(/Il ne reste que 0,5 : impossible de servir 0,75/);
    expect((await valeur(serveur, 'select servir_depuis_reserve($1, 0.25)', [reserve])).reste).toBe(0.25);
    const fin = await valeur(serveur, "select servir_depuis_reserve($1, 0.25, 'Fin de bouteille')", [reserve]);
    expect(fin).toEqual({ reste: 0, terminee: true });
    await expect(comme(serveur, 'select servir_depuis_reserve($1, 0.1)', [reserve])).rejects.toThrow(/terminée/);
    const journal = (await db.query('select servi_par, quantite from reserves_services where reserve_id = $1 order by servi_le', [reserve])).rows;
    expect(journal.map((j) => [j.servi_par, Number(j.quantite)])).toEqual([[serveur, 0.25], [serveur, 0.25]]);
    expect((await db.query('select count(*)::int n from ventes where etablissement_id = $1', [etab])).rows[0].n).toBe(1);
  });

  test('annuler un service : responsable, motif, le reste revient', async () => {
    const service = (await db.query('select id from reserves_services where reserve_id = $1 order by servi_le desc limit 1', [reserve])).rows[0].id;
    await expect(comme(serveur, "select annuler_service_reserve($1, 'erreur')", [service])).rejects.toThrow(/Permission refusée/);
    await comme(gerant, "select annuler_service_reserve($1, 'Servi à la mauvaise table')", [service]);
    const r = (await db.query('select reste, statut from reserves_bouteilles where id = $1', [reserve])).rows[0];
    expect([Number(r.reste), r.statut]).toEqual([0.25, 'en_cours']);
  });

  test('réserve en verres ; annulation de la réserve avec motif ; réserve expirée refusée au service', async () => {
    const r = await valeur(serveur, 'select mettre_bouteille_en_reserve($1, $2::jsonb)', [etab,
      json({ nom_client: 'Mme Fictive', telephone: '06 111', libelle: 'Cognac fictif', unite: 'verre', quantite_initiale: 12, reste: 8 })]);
    expect(Number((await valeur(serveur, 'select servir_depuis_reserve($1, 2)', [r.id])).reste)).toBe(6);
    await expect(comme(serveur, "select annuler_reserve_bouteille($1, 'erreur')", [r.id])).rejects.toThrow(/Permission refusée/);
    await expect(comme(gerant, "select annuler_reserve_bouteille($1, '')", [r.id])).rejects.toThrow(/motif/);
    await comme(gerant, "select annuler_reserve_bouteille($1, 'Bouteille cassée')", [r.id]);
    await expect(comme(serveur, 'select servir_depuis_reserve($1, 1)', [r.id])).rejects.toThrow(/annulée/);
    // Date limite dépassée (simulée) : le service est refusé.
    await db.transaction(async (tx) => {
      await tx.query("set local session_replication_role = 'replica'");
      await tx.query("update reserves_bouteilles set expire_le = current_date - 3 where id = $1", [reserve]);
    });
    await expect(comme(serveur, 'select servir_depuis_reserve($1, 0.1)', [reserve])).rejects.toThrow(/expiré/);
    await expect(db.query('delete from reserves_bouteilles where id = $1', [reserve])).rejects.toThrow();
  });

  test('lecture réservée à l’établissement', async () => {
    expect(await comme(autreGerant, 'select id from reserves_bouteilles')).toEqual([]);
    expect((await comme(serveur, 'select id from reserves_bouteilles')).length).toBe(2);
    await expect(comme(autreGerant, 'select servir_depuis_reserve($1, 0.1)', [reserve])).rejects.toThrow(/Permission refusée/);
  });
});

describe('table VIP avec minimum de consommation', () => {
  let table;
  let commande;
  test('le minimum se règle par un responsable et passe à la commande', async () => {
    table = await valeur(gerant, 'select enregistrer_table_restaurant($1, $2::jsonb)', [etab, json({ hub_id: hub, nom: 'VIP 1', places: 6 })]);
    await expect(comme(serveur, 'select regler_minimum_table($1, 50000)', [table])).rejects.toThrow(/Permission refusée/);
    await expect(comme(gerant, 'select regler_minimum_table($1, 0)', [table])).rejects.toThrow(/Minimum invalide/);
    await comme(gerant, 'select regler_minimum_table($1, 50000)', [table]);
    commande = await valeur(serveur, 'select ouvrir_commande_restaurant($1, $2::jsonb)', [etab, json({ table_id: table, couverts: 4 })]);
    expect(Number((await db.query('select minimum_consommation from rest_commandes where id = $1', [commande])).rows[0].minimum_consommation)).toBe(50000);
  });

  test('sous le minimum, l’encaissement final est refusé et rien n’est encaissé', async () => {
    await comme(serveur, 'select ajouter_lignes_restaurant($1, $2::jsonb)', [commande, json([{ article_id: poulet, quantite: 2 }])]);
    await comme(serveur, 'select envoyer_commande_restaurant($1)', [commande]);
    const ventesAvant = (await db.query('select count(*)::int n from ventes')).rows[0].n;
    await expect(comme(serveur, 'select encaisser_commande_restaurant($1, $2, $3::jsonb)', [commande, session, json([{ mode: 'especes', montant: 12000 }])]))
      .rejects.toThrow(/Minimum de consommation non atteint : encore 38 000 à consommer/);
    expect((await db.query('select count(*)::int n from ventes')).rows[0].n).toBe(ventesAvant);
  });

  test('addition séparée : une part se paie ; la dernière part est contrôlée', async () => {
    const ligne = (await db.query('select id from rest_lignes where commande_id = $1', [commande])).rows[0].id;
    const part = await valeur(serveur, 'select scinder_ligne_restaurant($1, 1)', [ligne]);
    const r = await valeur(serveur, 'select encaisser_commande_restaurant($1, $2, $3::jsonb, $4::uuid[])', [commande, session, json([{ mode: 'especes', montant: 6000 }]), [part]]);
    expect(r.commande_close).toBe(false);
  });

  test('complément minimum : ligne de montant, puis l’addition passe et atteint le minimum', async () => {
    await expect(comme(lecteur, 'select ajouter_complement_minimum($1)', [commande])).rejects.toThrow(/Permission refusée/);
    const c = await valeur(serveur, 'select ajouter_complement_minimum($1)', [commande]);
    expect(c.montant).toBe(38000);
    await expect(comme(serveur, 'select ajouter_complement_minimum($1)', [commande])).rejects.toThrow(/déjà atteint/);
    const r = await valeur(serveur, 'select encaisser_commande_restaurant($1, $2, $3::jsonb)', [commande, session, json([{ mode: 'especes', montant: 44000 }])]);
    expect(r.commande_close).toBe(true);
    expect(Number(r.total)).toBe(44000);
    const lv = (await db.query("select libelle, quantite, prix_unitaire, total from lignes_vente where vente_id = $1 and libelle like 'Complément%'", [r.vente_id])).rows[0];
    expect([Number(lv.quantite), Number(lv.prix_unitaire), Number(lv.total)]).toEqual([38000, 1, 38000]);
    const art = (await db.query("select suivi_stock, disponible, visible_menu from articles where etablissement_id = $1 and reference = 'COMPLEMENT-MINIMUM'", [etab])).rows[0];
    expect(art).toEqual({ suivi_stock: false, disponible: false, visible_menu: false });
  });

  test('lever le minimum : responsable seulement, motif obligatoire, puis l’encaissement passe', async () => {
    const autre = await valeur(serveur, 'select ouvrir_commande_restaurant($1, $2::jsonb)', [etab, json({ table_id: table, couverts: 2 })]);
    await comme(serveur, 'select ajouter_lignes_restaurant($1, $2::jsonb)', [autre, json([{ article_id: poulet, quantite: 1 }])]);
    await comme(serveur, 'select envoyer_commande_restaurant($1)', [autre]);
    await expect(comme(serveur, "select lever_minimum_commande($1, 'client fidèle')", [autre])).rejects.toThrow(/Permission refusée/);
    await expect(comme(gerant, "select lever_minimum_commande($1, ' ')", [autre])).rejects.toThrow(/motif/);
    await comme(gerant, "select lever_minimum_commande($1, 'Client fidèle, geste commercial')", [autre]);
    const c = (await db.query('select minimum_leve_par, minimum_motif from rest_commandes where id = $1', [autre])).rows[0];
    expect(c).toEqual({ minimum_leve_par: gerant, minimum_motif: 'Client fidèle, geste commercial' });
    await expect(comme(serveur, 'select ajouter_complement_minimum($1)', [autre])).rejects.toThrow(/levé/);
    const r = await valeur(serveur, 'select encaisser_commande_restaurant($1, $2, $3::jsonb)', [autre, session, json([{ mode: 'especes', montant: 6000 }])]);
    expect(r.commande_close).toBe(true);
  });

  test('réservation avec minimum : il passe à la commande à l’arrivée (prioritaire sur la table)', async () => {
    const debut = new Date(Date.now() + 3600000).toISOString();
    const resa = await valeur(serveur, 'select enregistrer_reservation_restaurant($1, $2::jsonb)', [etab,
      json({ hub_id: hub, table_id: table, nom_client: 'Groupe Fictif', debut, couverts: 4 })]);
    await comme(serveur, 'select regler_minimum_reservation($1, 80000)', [resa]);
    await comme(serveur, "select statut_reservation_restaurant($1, 'arrivee')", [resa]);
    await expect(comme(serveur, 'select regler_minimum_reservation($1, 10)', [resa])).rejects.toThrow(/déjà traitée/);
    const c = await valeur(serveur, 'select ouvrir_commande_restaurant($1, $2::jsonb)', [etab, json({ table_id: table, couverts: 4 })]);
    expect(Number((await db.query('select minimum_consommation from rest_commandes where id = $1', [c])).rows[0].minimum_consommation)).toBe(80000);
    // Un responsable peut le changer sur la commande ouverte ; une commande sans plat s'annule sans contrôle du minimum.
    await expect(comme(serveur, 'select regler_minimum_commande($1, 1000)', [c])).rejects.toThrow(/Permission refusée/);
    await comme(gerant, 'select regler_minimum_commande($1, 60000)', [c]);
    await comme(gerant, "select annuler_commande_restaurant($1, 'Groupe parti')", [c]);
  });

  test('l’article technique ne se commande pas comme un plat', async () => {
    const art = (await db.query("select id from articles where etablissement_id = $1 and reference = 'COMPLEMENT-MINIMUM'", [etab])).rows[0].id;
    const c = await valeur(serveur, 'select ouvrir_commande_restaurant($1, $2::jsonb)', [etab, json({ table_id: table, couverts: 1 })]);
    await expect(comme(serveur, 'select ajouter_lignes_restaurant($1, $2::jsonb)', [c, json([{ article_id: art, quantite: 1 }])])).rejects.toThrow(/indisponible/);
  });
});

describe('calculs à l’écran', () => {
  test('reste à consommer', () => {
    expect(resteMinimum(50000, 12000)).toBe(38000);
    expect(resteMinimum(50000, 60000)).toBe(0);
    expect(resteMinimum(null, 1000)).toBe(0);
    expect(resteMinimum(1000, 999.5)).toBe(1);
  });
  test('reste d’une bouteille lisible', () => {
    expect(formatReste(0.5, 'bouteille')).toBe('1/2 bouteille');
    expect(formatReste(0.25, 'bouteille')).toBe('1/4 bouteille');
    expect(formatReste(0.75, 'bouteille')).toBe('3/4 bouteille');
    expect(formatReste(1, 'bouteille')).toBe('1 bouteille');
    expect(formatReste(1.5, 'bouteille')).toBe('1 bouteille 1/2');
    expect(formatReste(0.4, 'bouteille')).toBe('0,4 bouteille');
    expect(formatReste(3, 'verre')).toBe('3 verres');
    expect(formatReste(1, 'verre')).toBe('1 verre');
    expect(formatReste(35, 'cl')).toBe('35 cl');
  });
  test('recherche d’une réserve par nom ou téléphone', () => {
    const liste = [{ nom_client: 'Éric Fictif', telephone: '+242 06 123 45 67', libelle: 'Whisky', numero: 'RB-00001' },
      { nom_client: 'Awa', telephone: null, libelle: 'Cognac', numero: 'RB-00002' }];
    expect(filtrerReserves(liste, 'eric').length).toBe(1);
    expect(filtrerReserves(liste, '06 123').map((r) => r.numero)).toEqual(['RB-00001']);
    expect(filtrerReserves(liste, 'cognac').map((r) => r.numero)).toEqual(['RB-00002']);
    expect(filtrerReserves(liste, '').length).toBe(2);
  });
  test('emballages chez un client et total des consignes', () => {
    expect(totalConsignes([{ consignes_gardees: 3000 }, { consignes_gardees: '1500.5' }])).toBe(4500.5);
    expect(situationClient([{ type: 'donne_client', quantite: 3 }, { type: 'rendu_client', quantite: 1 }, { type: 'rendu_client', quantite: 1, annule_le: 'x' }])).toBe(2);
  });
});
