import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { commeRole, creerBase } from './helpers/db.js';
import {
  creneauActif, erreurCreneau, happyHourEnCours, minutesDe, pourcentageArticle, remiseHappyHour, texteBandeau, texteJours,
} from '../src/modules/caisse/happyHour.js';
import {
  ajouterAuPanier, annulerOffert, cleLigne, fusionnerLignes, lignesPourVente, noteOfferts, offertsPourVente, offrirLigne, RAISONS_OFFERT,
  totauxPanier,
} from '../src/modules/caisse/offerts.js';
import {
  alerteStock, articlesSousMinimum, grouperCommande, retenusParArticle, suggestion, texteCommande, texteLigne,
} from '../src/modules/stock/preparerCommande.js';
import { lienWhatsApp } from '../src/noyau/messagesWhatsapp.js';
import { semerDemo } from '../src/noyau/donnees/demo.js';
import { creerBaseLocale } from './helpers/locale.js';

// Lot 3 bars et restaurants (migration 20261017000135) : happy hour, offerts avec raison, pourboires, alerte de stock.

// Vendredi 16 octobre 2026, heure locale de l'appareil.
const vendredi = (h, m = 0) => new Date(2026, 9, 16, h, m);
const samedi = (h, m = 0) => new Date(2026, 9, 17, h, m);

describe('happy hour : règles pures', () => {
  const soir = { nom: 'Happy hour', jours: [1, 2, 3, 4, 5], debut: '18:00', fin: '20:00', pourcentage: 20, categories: [], actif: true };
  const nuit = { nom: 'Nuit', jours: [5], debut: '22:00:00', fin: '02:00:00', pourcentage: 30, categories: ['boissons'], actif: true };

  test('heures et jours', () => {
    expect(minutesDe('18:30')).toBe(1110);
    expect(minutesDe('25:00')).toBeNull();
    expect(minutesDe('')).toBeNull();
    expect(texteJours([1, 2, 3, 4, 5])).toBe('du lundi au vendredi');
    expect(texteJours([1, 2, 3, 4, 5, 6, 7])).toBe('tous les jours');
    expect(texteJours([5, 6])).toBe('ven, sam');
  });

  test('créneau du soir : début compris, fin exclue, jours respectés', () => {
    expect(creneauActif(soir, vendredi(18, 0))).toBe(true);
    expect(creneauActif(soir, vendredi(19, 59))).toBe(true);
    expect(creneauActif(soir, vendredi(20, 0))).toBe(false);
    expect(creneauActif(soir, vendredi(17, 59))).toBe(false);
    expect(creneauActif(soir, samedi(18, 30))).toBe(false);
    expect(creneauActif({ ...soir, actif: false }, vendredi(18, 30))).toBe(false);
  });

  test('créneau qui passe minuit : du vendredi 22:00 au samedi 02:00', () => {
    expect(creneauActif(nuit, vendredi(21, 59))).toBe(false);
    expect(creneauActif(nuit, vendredi(22, 0))).toBe(true);
    expect(creneauActif(nuit, vendredi(23, 59))).toBe(true);
    expect(creneauActif(nuit, samedi(0, 30))).toBe(true);
    expect(creneauActif(nuit, samedi(1, 59))).toBe(true);
    expect(creneauActif(nuit, samedi(2, 0))).toBe(false);
    // Le jeudi soir n'est pas réglé : le vendredi 01:00 n'est pas en happy hour.
    expect(creneauActif(nuit, vendredi(1, 0))).toBe(false);
    // Dimanche → lundi : le lundi 01:00 vient du dimanche.
    expect(creneauActif({ ...nuit, jours: [7] }, new Date(2026, 9, 19, 1, 0))).toBe(true);
  });

  test('pourcentage par article : catégories, le plus fort gagne, bandeau', () => {
    const biere = { categorie_id: 'boissons', prix_vente: 1000 };
    const plat = { categorie_id: 'plats', prix_vente: 5000 };
    const creneaux = [{ ...soir, jours: [5], debut: '21:00', fin: '23:00' }, nuit];
    expect(pourcentageArticle(creneaux, biere, vendredi(22, 30))).toBe(30);
    expect(pourcentageArticle(creneaux, plat, vendredi(22, 30))).toBe(20);
    expect(pourcentageArticle(creneaux, plat, samedi(0, 30))).toBe(0);
    expect(happyHourEnCours(creneaux, vendredi(22, 30)).nom).toBe('Nuit');
    expect(happyHourEnCours(creneaux, samedi(12, 0))).toBeNull();
    expect(texteBandeau(nuit)).toBe('Happy hour : -30 % jusqu’à 02:00 (Nuit)');
    expect(texteBandeau(soir)).toBe('Happy hour : -20 % jusqu’à 20:00');
  });

  test('remise arrondie au franc (2 décimales pour une autre devise), jamais plus que le prix', () => {
    expect(remiseHappyHour(1000, 3, 20)).toBe(600);
    expect(remiseHappyHour(1250, 1, 15)).toBe(188);
    expect(remiseHappyHour(12.5, 1, 15, 2)).toBe(1.88);
    expect(remiseHappyHour(1000, 1, 0)).toBe(0);
    expect(remiseHappyHour(1000, 1, 150)).toBe(1000);
  });

  test('formulaire : messages clairs', () => {
    expect(erreurCreneau({ nom: '', jours: [1], debut: '18:00', fin: '20:00', pourcentage: 10 })).toMatch(/nom/);
    expect(erreurCreneau({ nom: 'A', jours: [], debut: '18:00', fin: '20:00', pourcentage: 10 })).toMatch(/jour/);
    expect(erreurCreneau({ nom: 'A', jours: [1], debut: '18:00', fin: '18:00', pourcentage: 10 })).toMatch(/différente/);
    expect(erreurCreneau({ nom: 'A', jours: [1], debut: '18:00', fin: '20:00', pourcentage: '0' })).toMatch(/Pourcentage/);
    expect(erreurCreneau({ nom: 'A', jours: [1], debut: '22:00', fin: '02:00', pourcentage: '12,5' })).toBe('');
  });
});

describe('panier : offrir une ligne', () => {
  const articles = { b: { id: 'b', nom: 'Primus', prix_vente: 1000, categorie_id: 'boissons' }, p: { id: 'p', nom: 'Poulet', prix_vente: 6500, categorie_id: 'plats' } };

  test('offrir une partie : la ligne se coupe en deux, puis annuler l’offert', () => {
    let panier = ajouterAuPanier(ajouterAuPanier(ajouterAuPanier([], 'b', 1), 'b', 2), 'p', 1);
    expect(panier).toEqual([{ article_id: 'b', quantite: 3 }, { article_id: 'p', quantite: 1 }]);
    panier = offrirLigne(panier, 'b', 1, { raison: 'Client fidèle', precision: ' ' });
    expect(panier).toEqual([{ article_id: 'b', quantite: 2 }, { article_id: 'b', quantite: 1, offert: { raison: 'Client fidèle' } }, { article_id: 'p', quantite: 1 }]);
    expect(panier.map(cleLigne)).toEqual(['b', 'b:offert', 'p']);
    // Un nouvel article touché va sur la ligne payante.
    panier = ajouterAuPanier(panier, 'b');
    expect(panier[0].quantite).toBe(3);
    expect(offertsPourVente(panier)).toEqual([{ article_id: 'b', quantite: 1, raison: 'Client fidèle' }]);
    expect(noteOfferts(panier, articles)).toBe('Offert : 1 × Primus (Client fidèle)');
    panier = annulerOffert(panier, 'b:offert');
    expect(panier).toEqual([{ article_id: 'b', quantite: 4 }, { article_id: 'p', quantite: 1 }]);
  });

  test('offrir toute la ligne, raison « Autre » avec précision', () => {
    const panier = offrirLigne([{ article_id: 'p', quantite: 1 }], 'p', 5, { raison: 'Autre', precision: 'Anniversaire' });
    expect(panier).toEqual([{ article_id: 'p', quantite: 1, offert: { raison: 'Autre', precision: 'Anniversaire' } }]);
    expect(noteOfferts(panier, articles)).toBe('Offert : 1 × Poulet (Anniversaire)');
    expect(RAISONS_OFFERT).toEqual(['Client fidèle', 'Geste commercial', 'Erreur de service', 'Patron', 'Autre']);
  });

  test('lignes envoyées à la vente : offert = prix complet, happy hour sur le reste', () => {
    const creneaux = [{ nom: 'Happy hour', jours: [5], debut: '18:00', fin: '20:00', pourcentage: 20, categories: ['boissons'] }];
    const panier = [{ article_id: 'b', quantite: 2 }, { article_id: 'b', quantite: 1, offert: { raison: 'Patron' } }, { article_id: 'p', quantite: 1 }];
    const options = { creneaux, date: vendredi(19, 0) };
    expect(lignesPourVente(panier, articles, options)).toEqual([
      { article_id: 'b', quantite: 2, remise: 400 }, { article_id: 'b', quantite: 1, remise: 1000 }, { article_id: 'p', quantite: 1 },
    ]);
    expect(totauxPanier(panier, articles, options)).toEqual({ brut: 9500, offerts: 1000, happyHour: 400, sousTotal: 8100 });
    expect(lignesPourVente(panier, articles, { creneaux, date: vendredi(21, 0) })[0]).toEqual({ article_id: 'b', quantite: 2 });
    // Facture en cours reprise : une ligne par article.
    expect(fusionnerLignes([{ article_id: 'b', quantite: 2 }, { article_id: 'b', quantite: 1 }])).toEqual([{ article_id: 'b', quantite: 3 }]);
  });
});

describe('alerte de stock et commande fournisseur', () => {
  test('« Plus que N » au minimum ou en dessous', () => {
    expect(alerteStock(3, 5)).toBe('Plus que 3');
    expect(alerteStock(5, 5)).toBe('Plus que 5');
    expect(alerteStock(6, 5)).toBeNull();
    expect(alerteStock(0, 5)).toBe('Épuisé');
    expect(alerteStock(2, 0)).toBeNull();
  });

  test('articles sous le minimum, conditionnement retenu, texte WhatsApp', () => {
    const articles = [
      { id: 'a', nom: 'Primus 65 cl', suivi_stock: true, stock_minimum: 24, unite: 'unité' },
      { id: 'b', nom: 'Sucre 1 kg', suivi_stock: true, stock_minimum: 10, unite: 'paquet' },
      { id: 'c', nom: 'Service', suivi_stock: false, stock_minimum: 5 },
      { id: 'd', nom: 'Eau', suivi_stock: true, stock_minimum: 6 },
    ];
    const sous = articlesSousMinimum(articles, { a: 10, b: 10, d: 30 });
    expect(sous.map((s) => s.article_id)).toEqual(['a', 'b']);
    const retenus = retenusParArticle([
      { article_id: 'a', fournisseur_id: null, nom: 'Casier', unites: 12, utilise_le: '2026-10-01' },
      { article_id: 'a', fournisseur_id: 'f1', nom: 'Casier', unites: 24, utilise_le: '2026-09-01' },
    ]);
    expect(retenus.a).toEqual({ fournisseur_id: 'f1', conditionnement: 'Casier', unites: 12 });
    // Double du minimum (48) moins le stock (10) = 38 unités → 4 casiers de 12.
    expect(suggestion(sous[0], retenus.a)).toEqual({ quantite: 4, parConditionnement: 12 });
    expect(suggestion(sous[1], undefined)).toEqual({ quantite: 10, parConditionnement: 1 });
    const lignes = [
      { ...sous[0], fournisseur_id: 'f1', quantite: 4, parConditionnement: 12, conditionnement: 'Casier' },
      { ...sous[1], fournisseur_id: null, quantite: 10, parConditionnement: 1 },
    ];
    expect(grouperCommande(lignes).map((g) => g.fournisseur_id)).toEqual(['f1', null]);
    expect(texteLigne(lignes[0])).toBe('Primus 65 cl : 4 casiers de 12 (48)');
    expect(texteLigne(lignes[1])).toBe('Sucre 1 kg : 10 paquet');
    const texte = texteCommande({ fournisseur: 'Grossiste Démo', etablissement: 'Bar Démo', lignes: [...lignes, { ...lignes[1], nom: 'Rien', quantite: 0 }] });
    expect(texte).toBe('Bonjour Grossiste Démo,\n\nVoici notre commande :\n- Primus 65 cl : 4 casiers de 12 (48)\n- Sucre 1 kg : 10 paquet\n\nMerci de nous confirmer la disponibilité, le prix et le jour de livraison.\nBonne journée,\nBar Démo');
    expect(lienWhatsApp('', 'Bonjour')).toBe('https://wa.me/?text=Bonjour');
  });
});

// ---------------------------------------------------------------------------
// Base de données
// ---------------------------------------------------------------------------
let db;
let gerant;
let caissier;
let autre;
let comptable;
let etab;
let biere;
let plat;
let boissons;

const utilisateur = async (email) => (await db.query('insert into auth.users(email) values($1) returning id', [email])).rows[0].id;
const comme = (user, sql, params = []) => commeRole(db, 'authenticated', user, async (tx) => (await tx.query(sql, params)).rows);
const valeur = async (user, sql, params = []) => Object.values((await comme(user, sql, params))[0])[0];
const json = JSON.stringify;
const vendre = (user, session, lignes, paiements = [], note = null) => valeur(user, 'select enregistrer_vente($1, $2, $3::jsonb, $4::jsonb, null, 0, $5)', [
  etab, session, json(lignes), json(paiements), note,
]);

beforeAll(async () => {
  db = await creerBase();
  const admin = await utilisateur('admin@lot3.test');
  gerant = await utilisateur('gerant@lot3.test');
  caissier = await utilisateur('caissier@lot3.test');
  autre = await utilisateur('autre@lot3.test');
  comptable = await utilisateur('compta@lot3.test');
  await db.query("insert into plateforme_admins(user_id, role) values($1, 'super_admin')", [admin]);
  const client = await valeur(admin, "select creer_client('Lot 3 Démo')");
  etab = await valeur(admin, "select creer_etablissement($1, 'commerce', 'Bar Lot 3')", [client]);
  await db.query("insert into etablissement_membres(etablissement_id, user_id, role_id) values ($1, $2, 'gerant'), ($1, $3, 'employe'), ($1, $4, 'employe'), ($1, $5, 'comptable')", [etab, gerant, caissier, autre, comptable]);
  await db.query("insert into profils(id, nom_complet) values ($1, 'Gérant Test'), ($2, 'Caissier Test') on conflict (id) do update set nom_complet = excluded.nom_complet", [gerant, caissier]);
  boissons = await valeur(gerant, "select enregistrer_categorie($1, 'Boissons')", [etab]);
  biere = await valeur(gerant, 'select enregistrer_article($1, $2::jsonb)', [etab, json({ nom: 'Bière test', prix_vente: 1000, suivi_stock: false, categorie_id: boissons })]);
  plat = await valeur(gerant, 'select enregistrer_article($1, $2::jsonb)', [etab, json({ nom: 'Plat test', prix_vente: 5000, suivi_stock: false })]);
});

afterAll(async () => db.close());

describe('base : happy hour', () => {
  let creneau;
  test('seuls gérant et responsable règlent ; contrôles en français', async () => {
    const p = { nom: 'Nuit', jours: [5], debut: '22:00', fin: '02:00', pourcentage: 30, categories: [boissons] };
    await expect(comme(caissier, 'select enregistrer_happy_hour($1, $2::jsonb)', [etab, json(p)])).rejects.toThrow(/Permission refusée/);
    await expect(comme(gerant, 'select enregistrer_happy_hour($1, $2::jsonb)', [etab, json({ ...p, fin: '22:00' })])).rejects.toThrow(/différente/);
    await expect(comme(gerant, 'select enregistrer_happy_hour($1, $2::jsonb)', [etab, json({ ...p, jours: [] })])).rejects.toThrow(/au moins un jour/);
    await expect(comme(gerant, 'select enregistrer_happy_hour($1, $2::jsonb)', [etab, json({ ...p, debut: '25:00' })])).rejects.toThrow(/HH:MM/);
    await expect(comme(gerant, 'select enregistrer_happy_hour($1, $2::jsonb)', [etab, json({ ...p, pourcentage: 0 })])).rejects.toThrow(/Pourcentage/);
    await expect(comme(gerant, 'select enregistrer_happy_hour($1, $2::jsonb)', [etab, json({ ...p, categories: [biere] })])).rejects.toThrow(/Catégorie inconnue/);
    creneau = await valeur(gerant, 'select enregistrer_happy_hour($1, $2::jsonb)', [etab, json(p)]);
    // La caisse lit les créneaux.
    expect((await comme(caissier, 'select nom, jours, pourcentage from happy_hours where etablissement_id = $1', [etab]))).toEqual([{ nom: 'Nuit', jours: [5], pourcentage: '30.00' }]);
  });

  test('calcul à l’heure de l’établissement (Brazzaville), minuit passé, catégories', async () => {
    const pct = (article, instant) => valeur(caissier, 'select pourcentage_happy_hour($1, $2, $3::timestamptz)', [etab, article, instant]);
    expect(Number(await pct(biere, '2026-10-16 22:30:00+01'))).toBe(30);
    expect(Number(await pct(biere, '2026-10-17 01:30:00+01'))).toBe(30);
    expect(Number(await pct(biere, '2026-10-17 02:00:00+01'))).toBe(0);
    expect(Number(await pct(biere, '2026-10-16 21:59:00+01'))).toBe(0);
    expect(Number(await pct(biere, '2026-10-16 01:00:00+01'))).toBe(0);
    expect(Number(await pct(plat, '2026-10-16 22:30:00+01'))).toBe(0);
    // Éteint : plus de remise ; rallumé ensuite.
    await comme(gerant, 'select enregistrer_happy_hour($1, $2::jsonb)', [etab, json({ id: creneau, actif: false })]);
    expect(Number(await pct(biere, '2026-10-16 22:30:00+01'))).toBe(0);
    await comme(gerant, 'select enregistrer_happy_hour($1, $2::jsonb)', [etab, json({ id: creneau, actif: true })]);
    expect(Number(await pct(biere, '2026-10-16 22:30:00+01'))).toBe(30);
    // Rien ne se supprime, même directement dans la base.
    await expect(db.query('delete from happy_hours where id = $1', [creneau])).rejects.toThrow();
  });

  test('plafond de remise : la part du happy hour n’est pas comptée', async () => {
    await comme(gerant, "select enregistrer_parametres_module($1, 'caisse', '{\"remise_max_pourcentage\": 10}'::jsonb)", [etab]);
    const session = await valeur(caissier, 'select ouvrir_caisse($1, null, 0)', [etab]);
    // Sans happy hour en cours : 30 % de remise refusés au caissier.
    await expect(vendre(caissier, session, [{ article_id: biere, quantite: 1, remise: 300 }], [{ mode: 'especes', montant: 700 }]))
      .rejects.toThrow(/un responsable doit valider/);
    // Happy hour toute la journée sur les boissons : la même remise passe.
    await comme(gerant, 'select enregistrer_happy_hour($1, $2::jsonb)', [etab, json({ nom: 'Toute la journée', jours: [1, 2, 3, 4, 5, 6, 7], debut: '00:00', fin: '23:59', pourcentage: 30, categories: [boissons] })]);
    const v = await vendre(caissier, session, [{ article_id: biere, quantite: 1, remise: 300 }], [{ mode: 'especes', montant: 700 }]);
    expect(Number(v.total)).toBe(700);
    // Au-delà du happy hour, le plafond s'applique encore.
    await expect(vendre(caissier, session, [{ article_id: biere, quantite: 1, remise: 500 }], [{ mode: 'especes', montant: 500 }]))
      .rejects.toThrow(/un responsable doit valider/);
    await comme(gerant, "select enregistrer_parametres_module($1, 'caisse', '{\"remise_max_pourcentage\": 100}'::jsonb)", [etab]);
  });
});

describe('base : offerts et pourboires', () => {
  let sessionGerant;
  let venteOfferte;
  test('le gérant offre une ligne avec sa raison ; le caissier ne peut pas', async () => {
    sessionGerant = await valeur(gerant, 'select ouvrir_caisse($1, null, 0)', [etab]);
    const v = await vendre(gerant, sessionGerant, [
      { article_id: biere, quantite: 2, remise: 2000 }, { article_id: plat, quantite: 1 },
    ], [{ mode: 'especes', montant: 5000 }], 'Offert : 2 × Bière test (Client fidèle)');
    venteOfferte = v.vente_id;
    expect(Number(v.total)).toBe(5000);
    await expect(comme(gerant, 'select enregistrer_offerts_vente($1, $2::jsonb)', [v.vente_id, json([{ article_id: biere, quantite: 2, raison: 'Autre' }])]))
      .rejects.toThrow(/Précisez/);
    await expect(comme(gerant, 'select enregistrer_offerts_vente($1, $2::jsonb)', [v.vente_id, json([{ article_id: plat, quantite: 1, raison: 'Patron' }])]))
      .rejects.toThrow(/introuvable/);
    expect(await valeur(gerant, 'select enregistrer_offerts_vente($1, $2::jsonb)', [v.vente_id, json([{ article_id: biere, quantite: 2, raison: 'Client fidèle' }])])).toBe(1);
    // Une ligne n'est offerte qu'une fois.
    await expect(comme(gerant, 'select enregistrer_offerts_vente($1, $2::jsonb)', [v.vente_id, json([{ article_id: biere, quantite: 2, raison: 'Patron' }])]))
      .rejects.toThrow(/introuvable/);
    const offert = (await db.query('select raison, valeur, quantite from offerts where vente_id = $1', [v.vente_id])).rows[0];
    expect(offert).toEqual({ raison: 'Client fidèle', valeur: '2000.00', quantite: '2.000' });
    await expect(db.query("update offerts set raison = 'Patron' where vente_id = $1", [v.vente_id])).rejects.toThrow();
    await expect(db.query('delete from offerts where vente_id = $1', [v.vente_id])).rejects.toThrow();

    const sessionCaissier = (await db.query("select id from sessions_caisse where ouverte_par = $1 and statut = 'ouverte'", [caissier])).rows[0].id;
    const w = await vendre(caissier, sessionCaissier, [{ article_id: plat, quantite: 1, remise: 5000 }]);
    await expect(comme(caissier, 'select enregistrer_offerts_vente($1, $2::jsonb)', [w.vente_id, json([{ article_id: plat, quantite: 1, raison: 'Patron' }])]))
      .rejects.toThrow(/Permission refusée/);
  });

  test('pourboire : information seulement, pas dans le total ni le ticket Z', async () => {
    const session = await valeur(autre, 'select ouvrir_caisse($1, null, 0)', [etab]);
    const v = await vendre(autre, session, [{ article_id: plat, quantite: 1 }], [{ mode: 'especes', montant: 5000 }]);
    await comme(autre, "select indiquer_serveur_vente($1, 'Alex')", [v.vente_id]);
    await expect(comme(autre, "select enregistrer_pourboire($1, 0, 'especes')", [v.vente_id])).rejects.toThrow(/invalide/);
    await expect(comme(autre, "select enregistrer_pourboire($1, 500, 'carte')", [v.vente_id])).rejects.toThrow(/Mobile Money/);
    await expect(comme(caissier, "select enregistrer_pourboire($1, 500, 'especes')", [v.vente_id])).rejects.toThrow(/Permission refusée/);
    await comme(autre, "select enregistrer_pourboire($1, 500, 'especes')", [v.vente_id]);
    await expect(comme(autre, "select enregistrer_pourboire($1, 500, 'especes')", [v.vente_id])).rejects.toThrow(/déjà/);
    const b = (await db.query('select serveur, montant, mode, session_caisse_id from pourboires where vente_id = $1', [v.vente_id])).rows[0];
    expect(b).toEqual({ serveur: 'Alex', montant: '500.00', mode: 'especes', session_caisse_id: session });
    expect(Number((await db.query('select total from ventes where id = $1', [v.vente_id])).rows[0].total)).toBe(5000);
    const z = await valeur(autre, 'select cloturer_caisse($1, 5000)', [session]);
    expect(Number(z.total_ventes)).toBe(5000);
    expect(Number(z.ecart)).toBe(0);
    // Le gérant ajoute un pourboire en Mobile Money sur la vente offerte, pour un autre serveur.
    await comme(gerant, "select enregistrer_pourboire($1, 1000, 'mobile_money', 'Marc')", [venteOfferte]);
  });

  test('rapport « Offerts et pertes » : gérant et comptable, pas le caissier', async () => {
    const hub = (await db.query('select id from hubs where etablissement_id = $1 and principal', [etab])).rows[0].id;
    const sucre = await valeur(gerant, 'select enregistrer_article($1, $2::jsonb)', [etab, json({ nom: 'Sucre test', prix_vente: 900, cout_achat: 700, suivi_stock: true })]);
    await comme(gerant, "select ajuster_stock_hub($1, $2, 'entree', 10, 'Réception', 700)", [hub, sucre]);
    await comme(gerant, "select ajuster_stock_hub($1, $2, 'ajustement', -2, 'Cassé', null)", [hub, sucre]);
    const jour = (await db.query('select date_locale($1) j', [etab])).rows[0].j;
    await expect(comme(caissier, 'select rapport_offerts_pertes($1, $2, $2)', [etab, jour])).rejects.toThrow(/Permission refusée/);
    await expect(comme(gerant, "select rapport_offerts_pertes($1, $2::date, $2::date - 1)", [etab, jour])).rejects.toThrow(/Période invalide/);
    const r = await valeur(comptable, 'select rapport_offerts_pertes($1, $2, $2)', [etab, jour]);
    expect(r.offerts).toHaveLength(1);
    expect(r.offerts[0]).toMatchObject({ article: 'Bière test', raison: 'Client fidèle', par: 'Gérant Test', valeur: 2000 });
    expect(r.pertes.map((p) => [p.article, p.quantite, p.motif, p.valeur])).toEqual([['Sucre test', 2, 'Cassé', 1400]]);
    // Remises : la bière en happy hour (300) et le plat offert par le caissier sans raison (5000), pas l'offert du gérant.
    expect(r.remises.map((x) => Number(x.valeur)).sort((a, b) => a - b)).toEqual([300, 5000]);
    expect(r.pourboires.map((p) => [p.serveur, p.total, p.especes, p.mobile_money])).toEqual([['Marc', 1000, null, 1000], ['Alex', 500, 500, null]]);
    expect(r.totaux).toEqual({ offerts: 2000, remises: 5300, pertes: 1400, pourboires: 1500 });
    // Vente annulée : elle sort du rapport.
    await comme(gerant, "select annuler_vente($1, 'Erreur de saisie')", [venteOfferte]);
    const apres = await valeur(gerant, 'select rapport_offerts_pertes($1, $2, $2)', [etab, jour]);
    expect(apres.offerts).toHaveLength(0);
    expect(apres.totaux.pourboires).toBe(500);
    await expect(comme(gerant, 'select enregistrer_pourboire($1, 100, $2)', [venteOfferte, 'especes'])).rejects.toThrow(/annulée/);
  });

  test('lecture : chacun voit ses offerts et pourboires, le gérant voit tout', async () => {
    expect((await comme(caissier, 'select count(*)::int n from pourboires'))[0].n).toBe(0);
    expect((await comme(gerant, 'select count(*)::int n from pourboires'))[0].n).toBe(2);
    expect((await comme(autre, 'select count(*)::int n from pourboires'))[0].n).toBe(1);
    const droits = (await db.query("select permission_id, role_id from role_permissions where permission_id in ('caisse.happy_hour', 'caisse.offerts_pertes') order by 1, 2")).rows;
    expect(droits.map((d) => `${d.permission_id}:${d.role_id}`)).toEqual([
      'caisse.happy_hour:gerant', 'caisse.happy_hour:responsable',
      'caisse.offerts_pertes:comptable', 'caisse.offerts_pertes:gerant', 'caisse.offerts_pertes:responsable',
    ]);
  });
});

describe('démonstration (données fictives)', () => {
  test('Restaurant Démo : happy hours, un offert, un pourboire, caisse de Gisèle fermée ; Commerce Démo : un happy hour', async () => {
    const demo = await creerBaseLocale();
    await semerDemo(demo);
    const ligne = async (sql) => (await demo.query(sql)).rows;
    expect(await ligne("select e.nom, h.nom h, h.actif from happy_hours h join etablissements e on e.id = h.etablissement_id order by e.nom, h.nom"))
      .toEqual([
        { nom: 'Commerce Démo', h: 'Fin de journée', actif: true },
        { nom: 'Restaurant Démo', h: 'Happy hour', actif: true },
        { nom: 'Restaurant Démo', h: 'Nuit du samedi', actif: false },
      ]);
    expect(await ligne('select libelle, raison, valeur::int from offerts')).toEqual([{ libelle: 'Primus 65 cl', raison: 'Client fidèle', valeur: 1000 }]);
    expect(await ligne('select serveur, montant::int, mode from pourboires')).toEqual([{ serveur: 'Rodrigue', montant: 500, mode: 'especes' }]);
    expect(await ligne("select count(*)::int n from sessions_caisse s join auth.users u on u.id = s.ouverte_par where u.email = 'resto@demo.agence-elite.fr' and s.statut = 'ouverte'"))
      .toEqual([{ n: 0 }]);
    await demo.close();
  }, 120000);
});
