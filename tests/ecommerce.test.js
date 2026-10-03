import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { commeRole, creerBase } from './helpers/db.js';

// E-commerce : boutique publique, variantes, commande sans compte, codes promo, confirmation (stock, vente, contact),
// livraison, paiement commun, annulation et retour ; accès anonyme limité aux fonctions publiques.
let db;
let sa;
let gerant;
let employe;
let lecteur;
let autreGerant;
let etab;
let autreEtab;
let hub;
let tshirtS;
let tshirtM;
let casquette;
let cache;
let commande;

const utilisateur = async (email) => (await db.query('insert into auth.users(email) values($1) returning id', [email])).rows[0].id;
const comme = (user, sql, params = []) => commeRole(db, 'authenticated', user, async (tx) => (await tx.query(sql, params)).rows);
const valeur = async (user, sql, params = []) => Object.values((await comme(user, sql, params))[0])[0];
const anonyme = async (sql, params = []) => Object.values((await commeRole(db, 'anon', null, async (tx) => (await tx.query(sql, params)).rows))[0])[0];
const json = (v) => JSON.stringify(v);
const commandeDe = async (id) => (await db.query('select * from boutique_commandes where id = $1', [id])).rows[0];
const stock = async (article) => Number((await db.query('select coalesce(sum(quantite), 0) q from mouvements_stock where hub_id = $1 and article_id = $2', [hub, article])).rows[0].q);
const panier = (lignes, extra = {}) => json({ nom_client: 'Awa Moukala', telephone: '+242 06 444 55 66', mode_livraison: 'livraison', adresse_livraison: 'Bacongo, rue 12', lignes, ...extra });

beforeAll(async () => {
  db = await creerBase();
  sa = await utilisateur('sa@ec.test');
  gerant = await utilisateur('gerant@ec.test');
  employe = await utilisateur('employe@ec.test');
  lecteur = await utilisateur('lecteur@ec.test');
  autreGerant = await utilisateur('autre@ec.test');
  await db.query("insert into plateforme_admins(user_id, role) values($1, 'super_admin')", [sa]);
  const c1 = await valeur(sa, "select creer_client('Mode Bacongo')");
  const c2 = await valeur(sa, "select creer_client('Concurrent')");
  etab = await valeur(sa, "select creer_etablissement($1, 'ecommerce', 'Mode Bacongo')", [c1]);
  autreEtab = await valeur(sa, "select creer_etablissement($1, 'ecommerce', 'Autre boutique')", [c2]);
  await db.query(
    `insert into etablissement_membres(etablissement_id, user_id, role_id) values
     ($1, $2, 'gerant'), ($1, $3, 'employe'), ($1, $4, 'lecteur'), ($5, $6, 'gerant')`,
    [etab, gerant, employe, lecteur, autreEtab, autreGerant]
  );
  hub = (await db.query('select id from hubs where etablissement_id = $1 and principal', [etab])).rows[0].id;
  tshirtS = await valeur(gerant, 'select enregistrer_article($1, $2::jsonb)', [etab, json({ nom: 'T-shirt Elite S', prix_vente: 7500, cout_achat: 3000 })]);
  tshirtM = await valeur(gerant, 'select enregistrer_article($1, $2::jsonb)', [etab, json({ nom: 'T-shirt Elite M', prix_vente: 7500, cout_achat: 3000 })]);
  casquette = await valeur(gerant, 'select enregistrer_article($1, $2::jsonb)', [etab, json({ nom: 'Casquette', prix_vente: 5000, cout_achat: 2000 })]);
  cache = await valeur(gerant, 'select enregistrer_article($1, $2::jsonb)', [etab, json({ nom: 'Article interne', prix_vente: 100 })]);
  await comme(gerant, "select ajuster_stock_hub($1, $2, 'entree', 10, 'Réception', 3000)", [hub, tshirtS]);
  await comme(gerant, "select ajuster_stock_hub($1, $2, 'entree', 1, 'Réception', 3000)", [hub, tshirtM]);
  await comme(gerant, "select ajuster_stock_hub($1, $2, 'entree', 5, 'Réception', 2000)", [hub, casquette]);
});

afterAll(async () => db.close());

describe('solution E-commerce', () => {
  test('un établissement E-commerce démarre avec la boutique, le stock et les ventes', async () => {
    const actifs = (await db.query('select module_id from etablissement_modules where etablissement_id = $1 and actif order by 1', [etab])).rows.map((r) => r.module_id);
    expect(actifs).toEqual(expect.arrayContaining(['ecommerce_boutique', 'articles', 'stock', 'ventes', 'paiements', 'contacts']));
    expect((await db.query("select statut from solutions where id = 'ecommerce'")).rows[0].statut).toBe('active');
    expect((await db.query('select formule, offre_id from licences where etablissement_id = $1', [etab])).rows[0]).toEqual({ formule: 'essai', offre_id: 'ecommerce-complet' });
  });
});

describe('configuration', () => {
  test('seul le gérant configure ; adresse unique et valide', async () => {
    await expect(comme(employe, 'select enregistrer_boutique($1, $2::jsonb)', [etab, json({ adresse: 'mode-bacongo', titre: 'X' })])).rejects.toThrow(/Permission refusée/);
    await expect(comme(gerant, 'select enregistrer_boutique($1, $2::jsonb)', [etab, json({ adresse: 'A b', titre: 'X' })])).rejects.toThrow(/Adresse de boutique invalide/);
    await expect(comme(gerant, 'select enregistrer_boutique($1, $2::jsonb)', [etab, json({ adresse: 'mode-bacongo', titre: 'X', livraison: false, retrait: false })])).rejects.toThrow(/au moins/);
    await comme(gerant, 'select enregistrer_boutique($1, $2::jsonb)', [etab, json({
      adresse: 'Mode-Bacongo', titre: 'Mode Bacongo', publiee: false, frais_livraison: 1000, zone_livraison: 'Brazzaville', adresse_retrait: 'Marché Total', minimum_commande: 2000,
      paiement_instructions: 'Mobile Money à la livraison',
    })]);
    await expect(comme(autreGerant, 'select enregistrer_boutique($1, $2::jsonb)', [autreEtab, json({ adresse: 'mode-bacongo', titre: 'Copie' })])).rejects.toThrow(/déjà prise/);
    const autreHub = (await db.query('select id from hubs where etablissement_id = $1', [autreEtab])).rows[0].id;
    await expect(comme(gerant, 'select enregistrer_boutique($1, $2::jsonb)', [etab, json({ adresse: 'mode-bacongo', titre: 'X', hub_id: autreHub })])).rejects.toThrow(/Hub actif/);
  });

  test('publication : variantes groupées, le reste invisible ; boutique non publiée introuvable', async () => {
    await comme(gerant, 'select publier_article_boutique($1, $2::jsonb)', [tshirtS, json({ groupe: 'T-shirt Elite', variante: 'S' })]);
    await comme(gerant, 'select publier_article_boutique($1, $2::jsonb)', [tshirtM, json({ groupe: 'T-shirt Elite', variante: 'M' })]);
    await comme(gerant, 'select publier_article_boutique($1, $2::jsonb)', [casquette, json({ description: 'Brodée' })]);
    await expect(comme(gerant, 'select publier_article_boutique($1, $2::jsonb)', [casquette, json({ groupe: 'X' })])).rejects.toThrow(/variante/);
    await expect(comme(autreGerant, 'select publier_article_boutique($1, $2::jsonb)', [casquette, json({})])).rejects.toThrow(/Permission refusée/);
    await expect(anonyme("select boutique_publique('mode-bacongo')")).rejects.toThrow(/introuvable ou fermée/);
    await comme(gerant, 'select enregistrer_boutique($1, $2::jsonb)', [etab, json({
      adresse: 'mode-bacongo', titre: 'Mode Bacongo', publiee: true, frais_livraison: 1000, adresse_retrait: 'Marché Total', minimum_commande: 2000,
    })]);
    const b = await anonyme("select boutique_publique('mode-bacongo')");
    expect(b.titre).toBe('Mode Bacongo');
    expect(b.produits.map((p) => p.nom)).toEqual(['Casquette', 'T-shirt Elite M', 'T-shirt Elite S']);
    expect(b.produits.find((p) => p.variante === 'S')).toMatchObject({ groupe: 'T-shirt Elite', disponible: true, prix: 7500 });
    expect(JSON.stringify(b)).not.toContain('cout_achat');
    expect(JSON.stringify(b)).not.toContain('Article interne');
  });
});

describe('codes promo', () => {
  test('création réservée ; validité, minimum, plafond', async () => {
    await expect(comme(employe, 'select enregistrer_coupon_boutique($1, $2::jsonb)', [etab, json({ code: 'BIENVENUE', type: 'pourcentage', valeur: 10 })])).rejects.toThrow(/Permission refusée/);
    await expect(comme(gerant, 'select enregistrer_coupon_boutique($1, $2::jsonb)', [etab, json({ code: 'X', type: 'pourcentage', valeur: 10 })])).rejects.toThrow(/invalide/);
    await comme(gerant, 'select enregistrer_coupon_boutique($1, $2::jsonb)', [etab, json({ code: 'bienvenue', type: 'pourcentage', valeur: 10, minimum: 10000 })]);
    await comme(gerant, 'select enregistrer_coupon_boutique($1, $2::jsonb)', [etab, json({ code: 'UNE-FOIS', type: 'montant', valeur: 500, utilisations_max: 1 })]);
    await comme(gerant, 'select enregistrer_coupon_boutique($1, $2::jsonb)', [etab, json({ code: 'VIEUX', type: 'montant', valeur: 500, debut: '2020-01-01', fin: '2020-02-01' })]);
    await expect(comme(gerant, 'select enregistrer_coupon_boutique($1, $2::jsonb)', [etab, json({ code: 'BIENVENUE', type: 'montant', valeur: 1 })])).rejects.toThrow(/existe déjà/);
    expect(await anonyme("select verifier_coupon_boutique('mode-bacongo', 'Bienvenue', 15000)")).toMatchObject({ code: 'BIENVENUE', remise: 1500 });
    await expect(anonyme("select verifier_coupon_boutique('mode-bacongo', 'BIENVENUE', 5000)")).rejects.toThrow(/au moins/);
    await expect(anonyme("select verifier_coupon_boutique('mode-bacongo', 'VIEUX', 5000)")).rejects.toThrow(/inconnu ou expiré/);
    await expect(anonyme("select verifier_coupon_boutique('mode-bacongo', 'NEXISTEPAS', 5000)")).rejects.toThrow(/inconnu ou expiré/);
  });
});

describe('commande du visiteur', () => {
  test('contrôles : panier, stock, minimum, mode, article non publié, quantités', async () => {
    const commander = (p) => anonyme("select commander_boutique('mode-bacongo', $1::jsonb)", [p]);
    await expect(commander(panier([]))).rejects.toThrow(/vide/);
    await expect(commander(panier([{ article_id: tshirtM, quantite: 2 }]))).rejects.toThrow(/Stock insuffisant/);
    await expect(commander(panier([{ article_id: cache, quantite: 1 }]))).rejects.toThrow(/plus disponible/);
    await expect(commander(panier([{ article_id: casquette, quantite: 1.5 }]))).rejects.toThrow(/Quantité invalide/);
    await expect(commander(panier([{ article_id: casquette, quantite: -1 }]))).rejects.toThrow(/Quantité invalide/);
    await expect(commander(panier([{ article_id: casquette, quantite: 'NaN' }]))).rejects.toThrow(/Quantité invalide/);
    await expect(commander(panier([{ article_id: casquette, quantite: 1 }], { adresse_livraison: '' }))).rejects.toThrow(/adresse de livraison/);
    await expect(commander(panier([{ article_id: casquette, quantite: 1 }], { telephone: '12' }))).rejects.toThrow(/téléphone/);
    await expect(commander(panier([{ article_id: casquette, quantite: 1 }], { mode_livraison: 'drone' }))).rejects.toThrow(/Mode de remise/);
    await expect(commander(panier([{ article_id: casquette, quantite: 1 }]).replace('"lignes"', '"x"'))).rejects.toThrow(/vide/);
    await expect(anonyme("select commander_boutique('autre', $1::jsonb)", [panier([{ article_id: casquette, quantite: 1 }])])).rejects.toThrow(/introuvable/);
  });

  test('prix recalculés côté serveur, code promo, frais de livraison, suivi par lien', async () => {
    const r = await anonyme("select commander_boutique('mode-bacongo', $1::jsonb)", [panier(
      [{ article_id: tshirtS, quantite: 2, prix: 1 }, { article_id: casquette, quantite: 1 }], { code_promo: 'BIENVENUE', email: 'Awa@Exemple.cg' },
    )]);
    expect(r.numero).toMatch(/^CW-/);
    expect(Number(r.total)).toBe(20000 - 2000 + 1000);
    commande = (await db.query('select id from boutique_commandes where suivi = $1', [r.suivi])).rows[0].id;
    const c = await commandeDe(commande);
    expect(c).toMatchObject({ statut: 'nouvelle', email: 'awa@exemple.cg', vente_id: null });
    expect(Number(c.remise)).toBe(2000);
    const suivi = await anonyme('select suivi_commande_boutique($1)', [r.suivi]);
    expect(suivi).toMatchObject({ numero: r.numero, statut: 'nouvelle', boutique: 'Mode Bacongo' });
    expect(suivi.lignes.map((l) => l.libelle)).toEqual(['Casquette', 'T-shirt Elite S · S']);
    expect(JSON.stringify(suivi)).not.toContain('06 444');
    await expect(anonyme('select suivi_commande_boutique($1)', ['00000000-0000-0000-0000-000000000000'])).rejects.toThrow(/introuvable/);
    // Le gérant et l'employé sont prévenus.
    expect((await comme(employe, "select lien from notifications where type = 'boutique.commande'")).map((n) => n.lien)).toEqual([`boutique/${commande}`]);
  });

  test('un code à usage unique ne sert qu’une fois ; anti-abus par téléphone', async () => {
    const commander = (p) => anonyme("select commander_boutique('mode-bacongo', $1::jsonb)", [p]);
    await commander(panier([{ article_id: casquette, quantite: 1 }], { code_promo: 'UNE-FOIS', telephone: '+242 05 000 00 01', mode_livraison: 'retrait' }));
    await expect(commander(panier([{ article_id: casquette, quantite: 1 }], { code_promo: 'UNE-FOIS', telephone: '+242 05 000 00 02' }))).rejects.toThrow(/inconnu ou expiré/);
    for (let i = 0; i < 5; i += 1) await commander(panier([{ article_id: casquette, quantite: 1 }], { telephone: '+242 05 999 99 99' }));
    await expect(commander(panier([{ article_id: casquette, quantite: 1 }], { telephone: '242059999999' }))).rejects.toThrow(/Trop de commandes/);
  });

  test('le visiteur ne lit aucune table ni fonction interne', async () => {
    for (const table of ['boutiques', 'boutique_commandes', 'boutique_coupons', 'boutique_lignes', 'boutique_articles', 'articles']) {
      expect((await commeRole(db, 'anon', null, (tx) => tx.query(`select * from ${table}`))).rows).toEqual([]);
    }
    await expect(anonyme("select remise_coupon_boutique($1, 'BIENVENUE', 100000)", [etab])).rejects.toThrow(/permission denied/);
    await expect(anonyme('select confirmer_commande_boutique($1)', [commande])).rejects.toThrow(/permission denied/);
    await expect(anonyme("select boutique_ouverte('mode-bacongo')")).rejects.toThrow(/permission denied/);
  });
});

describe('traitement', () => {
  test('confirmation : vente « boutique », stock sorti, contact créé ; droits respectés', async () => {
    await expect(comme(lecteur, 'select confirmer_commande_boutique($1)', [commande])).rejects.toThrow(/Permission refusée/);
    await expect(comme(autreGerant, 'select confirmer_commande_boutique($1)', [commande])).rejects.toThrow(/Permission refusée/);
    const vente = await valeur(employe, 'select confirmer_commande_boutique($1)', [commande]);
    await expect(comme(employe, 'select confirmer_commande_boutique($1)', [commande])).rejects.toThrow(/déjà traitée/);
    const v = (await db.query('select * from ventes where id = $1', [vente])).rows[0];
    expect(v).toMatchObject({ origine: 'boutique', statut_paiement: 'impayee' });
    expect(Number(v.total)).toBe(19000);
    expect((await db.query("select libelle from lignes_vente where vente_id = $1 order by libelle", [vente])).rows.map((l) => l.libelle)).toEqual(['Casquette', 'Livraison', 'T-shirt Elite S · S']);
    expect(await stock(tshirtS)).toBe(8);
    const contact = (await db.query('select c.* from contacts c join boutique_commandes b on b.contact_id = c.id where b.id = $1', [commande])).rows[0];
    expect(contact).toMatchObject({ nom: 'Awa Moukala', adresse: 'Bacongo, rue 12' });
  });

  test('livraison et paiement communs ; tableau de bord', async () => {
    await expect(comme(employe, "select avancer_commande_boutique($1, 'livree')", [commande])).rejects.toThrow(/Passage impossible/);
    await comme(employe, "select avancer_commande_boutique($1, 'preparee')", [commande]);
    await comme(employe, "select avancer_commande_boutique($1, 'expediee')", [commande]);
    await comme(employe, "select avancer_commande_boutique($1, 'livree')", [commande]);
    const c = await commandeDe(commande);
    expect(c.statut).toBe('livree');
    await comme(gerant, "select encaisser_paiement($1, 19000, 'mobile_money', null, 'MM-778')", [c.vente_id]);
    expect((await db.query('select statut_paiement from ventes where id = $1', [c.vente_id])).rows[0].statut_paiement).toBe('payee');
    const tdb = await valeur(lecteur, 'select tableau_de_bord_boutique($1)', [etab]);
    expect(tdb).toMatchObject({ publiee: true, adresse: 'mode-bacongo', produits_publies: 3 });
    expect(Number(tdb.chiffre_mois)).toBe(19000);
    await expect(comme(autreGerant, 'select tableau_de_bord_boutique($1)', [etab])).rejects.toThrow(/Accès refusé/);
  });

  test('retour après livraison : motif, stock remis, vente et paiement annulés ; rien ne se supprime', async () => {
    await expect(comme(employe, "select annuler_commande_boutique($1, 'x')", [commande])).rejects.toThrow(/Permission refusée/);
    await expect(comme(gerant, "select annuler_commande_boutique($1, ' ')", [commande])).rejects.toThrow(/motif/);
    await comme(gerant, "select annuler_commande_boutique($1, 'Taille trop petite')", [commande]);
    const c = await commandeDe(commande);
    expect(c).toMatchObject({ statut: 'retournee', motif: 'Taille trop petite' });
    expect(await stock(tshirtS)).toBe(10);
    expect((await db.query('select statut from ventes where id = $1', [c.vente_id])).rows[0].statut).toBe('annulee');
    expect((await db.query('select statut from paiements where vente_id = $1', [c.vente_id])).rows.map((p) => p.statut)).toEqual(['annule']);
    await expect(comme(gerant, "select annuler_commande_boutique($1, 'Encore')", [commande])).rejects.toThrow(/déjà close/);
    await expect(db.query('delete from boutique_commandes where id = $1', [commande])).rejects.toThrow();
    await expect(db.query("update boutique_lignes set prix_unitaire = 1 where commande_id = $1", [commande])).rejects.toThrow();
    await expect(comme(gerant, "update boutique_commandes set total = 0 where id = $1 returning id", [commande])).resolves.toEqual([]);
  });

  test('une commande nouvelle s’annule sans vente ; le code promo est rendu', async () => {
    const r = await anonyme("select commander_boutique('mode-bacongo', $1::jsonb)", [panier([{ article_id: tshirtS, quantite: 2 }], { code_promo: 'BIENVENUE', telephone: '+242 06 123 45 67' })]);
    const id = (await db.query('select id from boutique_commandes where suivi = $1', [r.suivi])).rows[0].id;
    const avant = Number((await db.query("select utilisations from boutique_coupons where code = 'BIENVENUE'")).rows[0].utilisations);
    await comme(gerant, "select annuler_commande_boutique($1, 'Client injoignable')", [id]);
    expect((await commandeDe(id)).statut).toBe('annulee');
    expect(Number((await db.query("select utilisations from boutique_coupons where code = 'BIENVENUE'")).rows[0].utilisations)).toBe(avant - 1);
    expect(await stock(tshirtS)).toBe(10);
  });

  test('module désactivé : la boutique publique ferme sans rien perdre', async () => {
    await db.query("update etablissement_modules set actif = false where etablissement_id = $1 and module_id = 'ecommerce_boutique'", [etab]);
    await expect(anonyme("select boutique_publique('mode-bacongo')")).rejects.toThrow(/introuvable ou fermée/);
    expect(Number((await db.query('select count(*) n from boutique_commandes where etablissement_id = $1', [etab])).rows[0].n)).toBeGreaterThan(0);
    await db.query("update etablissement_modules set actif = true where etablissement_id = $1 and module_id = 'ecommerce_boutique'", [etab]);
  });
});
