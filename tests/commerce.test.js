import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { commeRole, creerBase } from './helpers/db.js';

// Parcours complet de la Solution Commerce, joué en base avec les vrais rôles.
let db;
let admin;
let gerant;
let caissier;
let comptable;
let gerantB;
let etab;
let etabB;
let session;
let stylo;
let cahier;
let service;
let contact;
let venteCredit;

const utilisateur = async (email) => (await db.query('insert into auth.users(email) values($1) returning id', [email])).rows[0].id;
const comme = (user, sql, params = []) => commeRole(db, 'authenticated', user, async (tx) => (await tx.query(sql, params)).rows);
const valeur = async (user, sql, params = []) => Object.values((await comme(user, sql, params))[0])[0];
const stock = async (article) => Number((await db.query('select coalesce(sum(quantite), 0) q from mouvements_stock where article_id = $1', [article])).rows[0].q);

beforeAll(async () => {
  db = await creerBase();
  admin = await utilisateur('admin@commerce.test');
  gerant = await utilisateur('gerant@commerce.test');
  caissier = await utilisateur('caissier@commerce.test');
  comptable = await utilisateur('comptable@commerce.test');
  gerantB = await utilisateur('gerant-b@commerce.test');
  await db.query("insert into plateforme_admins(user_id, role) values($1, 'super_admin')", [admin]);
  const client = await valeur(admin, "select creer_client('Boutiques Démo')");
  etab = await valeur(admin, "select creer_etablissement($1, 'commerce', 'Boutique A')", [client]);
  etabB = await valeur(admin, "select creer_etablissement($1, 'commerce', 'Boutique B')", [client]);
  await db.query(
    "insert into etablissement_membres(etablissement_id, user_id, role_id) values ($1, $2, 'gerant'), ($1, $3, 'employe'), ($1, $4, 'comptable'), ($5, $6, 'gerant')",
    [etab, gerant, caissier, comptable, etabB, gerantB]
  );
});

afterAll(async () => db.close());

describe('Solution Commerce : parcours de bout en bout', () => {
  test('le contexte expose les modules et permissions de chacun', async () => {
    const contexte = await valeur(caissier, 'select mon_contexte()');
    expect(contexte.etablissements).toHaveLength(1);
    expect(contexte.etablissements[0].modules).toContain('caisse');
    expect(contexte.etablissements[0].permissions).toContain('caisse.utiliser');
    expect(contexte.etablissements[0].permissions).not.toContain('articles.gerer');
  });

  test('le gérant crée une catégorie et des articles, avec stock initial', async () => {
    const categorie = await valeur(gerant, "select enregistrer_categorie($1, 'Papeterie')", [etab]);
    stylo = await valeur(gerant, 'select enregistrer_article($1, $2::jsonb)', [etab, JSON.stringify({
      nom: 'Stylo bleu', reference: 'STY-01', categorie_id: categorie, prix_vente: 500, cout_achat: 200, stock_initial: 10, stock_minimum: 3,
    })]);
    cahier = await valeur(gerant, 'select enregistrer_article($1, $2::jsonb)', [etab, JSON.stringify({
      nom: 'Cahier 200 pages', prix_vente: 1500, cout_achat: 900, stock_initial: 4,
    })]);
    service = await valeur(gerant, 'select enregistrer_article($1, $2::jsonb)', [etab, JSON.stringify({
      nom: 'Photocopie', prix_vente: 50, suivi_stock: false,
    })]);
    expect(await stock(stylo)).toBe(10);
    expect(await stock(service)).toBe(0);
  });

  test('le caissier ne peut pas créer un article ni ajuster le stock', async () => {
    await expect(comme(caissier, 'select enregistrer_article($1, $2::jsonb)', [etab, '{"nom":"X","prix_vente":1}'])).rejects.toThrow(/Permission refusée/);
    await expect(comme(caissier, "select ajuster_stock($1, $2, 'entree', 5)", [etab, stylo])).rejects.toThrow(/Permission refusée/);
  });

  test('entrées, ajustements et inventaire laissent une trace', async () => {
    expect(Number(await valeur(gerant, "select ajuster_stock($1, $2, 'entree', 6, 'Réception fournisseur', 900)", [etab, cahier]))).toBe(10);
    await expect(comme(gerant, "select ajuster_stock($1, $2, 'ajustement', -1)", [etab, stylo])).rejects.toThrow(/motif/);
    expect(Number(await valeur(gerant, "select ajuster_stock($1, $2, 'ajustement', -1, 'Cassé')", [etab, stylo]))).toBe(9);
    expect(Number(await valeur(gerant, "select ajuster_stock($1, $2, 'inventaire', 12, 'Inventaire mensuel')", [etab, stylo]))).toBe(12);
    const types = (await db.query('select type, quantite::float q from mouvements_stock where article_id = $1 order by id', [stylo])).rows;
    expect(types).toEqual([{ type: 'entree', q: 10 }, { type: 'ajustement', q: -1 }, { type: 'inventaire', q: 3 }]);
  });

  test('le caissier ouvre la caisse et vend : stock diminué, paiement, monnaie rendue', async () => {
    session = await valeur(caissier, 'select ouvrir_caisse($1, null, 10000)', [etab]);
    expect(await valeur(caissier, 'select ouvrir_caisse($1, null, 0)', [etab])).toBe(session);
    const resultat = await valeur(caissier, 'select enregistrer_vente($1, $2, $3::jsonb, $4::jsonb)', [
      etab, session,
      JSON.stringify([{ article_id: stylo, quantite: 2 }, { article_id: cahier, quantite: 1 }, { article_id: service, quantite: 10 }]),
      JSON.stringify([{ mode: 'especes', montant: 5000 }]),
    ]);
    expect(resultat.numero).toBe('V-00001');
    expect(Number(resultat.total)).toBe(3000);
    expect(Number(resultat.monnaie)).toBe(2000);
    expect(await stock(stylo)).toBe(10);
    expect(await stock(cahier)).toBe(9);
    const paiements = (await db.query('select mode, montant::float m from paiements where vente_id = $1', [resultat.vente_id])).rows;
    expect(paiements).toEqual([{ mode: 'especes', m: 3000 }]);
  });

  test('le stock insuffisant bloque la vente sans rien enregistrer', async () => {
    const avant = (await db.query('select count(*)::int n from ventes')).rows[0].n;
    await expect(comme(caissier, 'select enregistrer_vente($1, $2, $3::jsonb, $4::jsonb)', [
      etab, session, JSON.stringify([{ article_id: cahier, quantite: 50 }]), JSON.stringify([{ mode: 'especes', montant: 75000 }]),
    ])).rejects.toThrow(/Stock insuffisant/);
    expect((await db.query('select count(*)::int n from ventes')).rows[0].n).toBe(avant);
    expect(await stock(cahier)).toBe(9);
  });

  test('une vente à crédit exige un contact, puis le reste est encaissé', async () => {
    await expect(comme(caissier, 'select enregistrer_vente($1, $2, $3::jsonb, $4::jsonb)', [
      etab, session, JSON.stringify([{ article_id: cahier, quantite: 2 }]), JSON.stringify([{ mode: 'mobile_money', montant: 1000 }]),
    ])).rejects.toThrow(/contact/);
    contact = await valeur(caissier, 'select enregistrer_contact($1, $2::jsonb)', [etab, JSON.stringify({ nom: 'École Saint-Pierre', telephone: '06 000 00 00' })]);
    const resultat = await valeur(caissier, 'select enregistrer_vente($1, $2, $3::jsonb, $4::jsonb, $5)', [
      etab, session, JSON.stringify([{ article_id: cahier, quantite: 2 }]), JSON.stringify([{ mode: 'mobile_money', montant: 1000, reference: 'MM-123' }]), contact,
    ]);
    venteCredit = resultat.vente_id;
    expect(Number(resultat.reste)).toBe(2000);
    await expect(comme(caissier, "select encaisser_paiement($1, 5000, 'especes', $2)", [venteCredit, session])).rejects.toThrow(/reste dû/);
    await comme(caissier, "select encaisser_paiement($1, 2000, 'especes', $2)", [venteCredit, session]);
    const vente = (await db.query('select statut_paiement, montant_paye::float p from ventes where id = $1', [venteCredit])).rows[0];
    expect(vente).toEqual({ statut_paiement: 'payee', p: 3000 });
  });

  test('une vente validée ne peut pas être modifiée en silence', async () => {
    await expect(db.query('update ventes set total = 1 where id = $1', [venteCredit])).rejects.toThrow(/annulez-la/);
    await expect(db.query('update lignes_vente set quantite = 1 where vente_id = $1', [venteCredit])).rejects.toThrow(/définitive/);
    await expect(db.query('delete from ventes where id = $1', [venteCredit])).rejects.toThrow(/Suppression interdite/);
    await expect(comme(gerant, 'update ventes set note = $2 where id = $1', [venteCredit, 'x'])).resolves.toEqual([]);
  });

  test("le caissier ne peut pas annuler ; le gérant annule avec motif et le stock revient", async () => {
    await expect(comme(caissier, "select annuler_vente($1, 'Erreur')", [venteCredit])).rejects.toThrow(/Permission refusée/);
    await expect(comme(gerant, "select annuler_vente($1, '')", [venteCredit])).rejects.toThrow(/motif/);
    await comme(gerant, "select annuler_vente($1, 'Erreur de saisie')", [venteCredit]);
    const vente = (await db.query('select statut, motif_annulation from ventes where id = $1', [venteCredit])).rows[0];
    expect(vente).toEqual({ statut: 'annulee', motif_annulation: 'Erreur de saisie' });
    expect(await stock(cahier)).toBe(9);
    expect((await db.query("select count(*)::int n from paiements where vente_id = $1 and statut = 'annule'", [venteCredit])).rows[0].n).toBe(2);
    await expect(comme(gerant, "select annuler_vente($1, 'Encore')", [venteCredit])).rejects.toThrow(/déjà annulée/);
  });

  test('le reçu contient l\'identité, les lignes et les paiements', async () => {
    const vente = (await db.query("select id from ventes where numero = 'V-00001' and etablissement_id = $1", [etab])).rows[0].id;
    const recu = await valeur(caissier, 'select recu_vente($1)', [vente]);
    expect(recu.identite.nom_commercial).toBe('Boutique A');
    expect(recu.lignes).toHaveLength(3);
    expect(recu.paiements[0].mode).toBe('especes');
    await expect(comme(gerantB, 'select recu_vente($1)', [vente])).rejects.toThrow(/introuvable/);
  });

  test('une dépense en espèces payée par la caisse est déduite au ticket Z', async () => {
    await expect(comme(caissier, 'select enregistrer_depense($1, $2::jsonb)', [etab, '{"libelle":"Eau","montant":500,"mode":"especes"}'])).rejects.toThrow(/Permission refusée/);
    const depense = await valeur(gerant, 'select enregistrer_depense($1, $2::jsonb)', [etab, JSON.stringify({
      libelle: 'Transport marchandise', montant: 1500, mode: 'especes', categorie: 'Transport', session_caisse_id: session,
    })]);
    const autre = await valeur(comptable, 'select enregistrer_depense($1, $2::jsonb)', [etab, JSON.stringify({ libelle: 'Loyer', montant: 50000, mode: 'virement', categorie: 'Loyer' })]);
    await comme(comptable, "select annuler_depense($1, 'Doublon')", [autre]);
    expect((await db.query('select statut from depenses where id = $1', [autre])).rows[0].statut).toBe('annulee');
    expect(depense).toBeTruthy();
  });

  test('la clôture fige un ticket Z exact et ferme la caisse', async () => {
    const apercu = await valeur(caissier, 'select apercu_cloture($1)', [session]);
    // Fond 10 000 + espèces (3 000 de V-00001 ; 2 000 annulés) − dépense 1 500.
    expect(Number(apercu.especes_attendues)).toBe(11500);
    await expect(comme(caissier, 'select cloturer_caisse($1, 11500)', [session])).rejects.toThrow(/Permission refusée/);
    const z = await valeur(gerant, "select cloturer_caisse($1, 11000, 'Manque 500')", [session]);
    expect(z.numero).toBe('Z-00001');
    expect(z.nombre_ventes).toBe(1);
    expect(Number(z.total_ventes)).toBe(3000);
    expect(z.nombre_annulations).toBe(1);
    expect(Number(z.ecart)).toBe(-500);
    await expect(comme(caissier, 'select enregistrer_vente($1, $2, $3::jsonb, $4::jsonb)', [
      etab, session, JSON.stringify([{ article_id: stylo, quantite: 1 }]), JSON.stringify([{ mode: 'especes', montant: 500 }]),
    ])).rejects.toThrow(/Aucune caisse ouverte/);
    await expect(db.query('update clotures set ecart = 0 where session_caisse_id = $1', [session])).rejects.toThrow(/définitive/);
    await expect(comme(gerant, "select cloturer_caisse($1, 0)", [session])).rejects.toThrow(/déjà clôturée/);
    const vente = (await db.query("select id from ventes where numero = 'V-00001' and etablissement_id = $1", [etab])).rows[0].id;
    await expect(comme(gerant, "select annuler_vente($1, 'Trop tard')", [vente])).rejects.toThrow(/clôturée/);
  });

  test('le tableau de bord donne les indicateurs de la période', async () => {
    const tdb = await valeur(gerant, 'select tableau_de_bord_commerce($1, current_date - 1, current_date + 1)', [etab]);
    expect(Number(tdb.chiffre_affaires)).toBe(3000);
    expect(tdb.nombre_ventes).toBe(1);
    expect(Number(tdb.depenses)).toBe(1500);
    expect(Number(tdb.marge_brute)).toBe(3000 - (2 * 200 + 900));
    expect(tdb.top_articles[0].libelle).toBe('Cahier 200 pages');
  });
});

describe('Solution Commerce : isolation et sécurité', () => {
  test("le gérant de B ne voit ni n'écrit rien dans A", async () => {
    for (const table of ['articles', 'ventes', 'lignes_vente', 'paiements', 'mouvements_stock', 'contacts', 'depenses', 'clotures', 'sessions_caisse', 'stock_articles']) {
      expect(await comme(gerantB, `select * from ${table} where etablissement_id = $1`, [etab])).toHaveLength(0);
    }
    await expect(comme(gerantB, "select ajuster_stock($1, $2, 'entree', 100)", [etab, stylo])).rejects.toThrow(/Permission refusée/);
    await expect(comme(gerantB, "select annuler_vente(id, 'x') from ventes limit 1")).resolves.toEqual([]);
    const sessionB = await valeur(gerantB, 'select ouvrir_caisse($1)', [etabB]);
    await expect(comme(gerantB, 'select enregistrer_vente($1, $2, $3::jsonb, $4::jsonb)', [
      etabB, sessionB, JSON.stringify([{ article_id: stylo, quantite: 1 }]), JSON.stringify([{ mode: 'especes', montant: 500 }]),
    ])).rejects.toThrow(/Article inconnu/);
    await expect(comme(gerantB, 'select enregistrer_vente($1, $2, $3::jsonb, $4::jsonb)', [
      etab, sessionB, JSON.stringify([{ article_id: stylo, quantite: 1 }]), JSON.stringify([]),
    ])).rejects.toThrow(/Permission refusée/);
  });

  test("aucune écriture directe n'est possible, même pour le gérant", async () => {
    await expect(comme(gerant, "insert into articles(etablissement_id, nom, prix_vente) values($1, 'Direct', 1)", [etab])).rejects.toThrow();
    await expect(comme(gerant, "insert into mouvements_stock(etablissement_id, article_id, type, quantite, acteur) values($1, $2, 'entree', 99, $3)", [etab, stylo, gerant])).rejects.toThrow();
    expect(await comme(gerant, 'update articles set prix_vente = 1 where id = $1 returning id', [stylo])).toHaveLength(0);
  });

  test('anon ne lit rien et ne peut appeler aucune fonction métier', async () => {
    await commeRole(db, 'anon', null, async (tx) => {
      expect((await tx.query('select * from articles')).rows).toHaveLength(0);
      expect((await tx.query('select * from stock_articles')).rows).toHaveLength(0);
    });
    await expect(commeRole(db, 'anon', null, (tx) => tx.query('select enregistrer_vente($1, $2, $3::jsonb)', [etab, session, '[]']))).rejects.toThrow(/permission denied/);
    await expect(commeRole(db, 'anon', null, (tx) => tx.query('select mon_contexte()'))).rejects.toThrow(/permission denied/);
  });

  test('les fonctions internes ne sont pas appelables', async () => {
    await expect(comme(gerant, "select prochain_numero($1, 'vente', 'V-')", [etab])).rejects.toThrow(/permission denied/);
    await expect(comme(gerant, 'select recalculer_paiement_vente($1)', [venteCredit])).rejects.toThrow(/permission denied/);
  });

  test('un module désactivé coupe immédiatement la caisse', async () => {
    await db.query("update etablissement_modules set actif = false where etablissement_id = $1 and module_id = 'cloture'", [etab]);
    await db.query("update etablissement_modules set actif = false where etablissement_id = $1 and module_id = 'caisse'", [etab]);
    await expect(comme(caissier, 'select ouvrir_caisse($1)', [etab])).rejects.toThrow(/Permission refusée/);
    await db.query("update etablissement_modules set actif = true where etablissement_id = $1 and module_id in ('caisse', 'cloture')", [etab]);
  });

  test("un établissement suspendu reste lisible mais refuse toute écriture", async () => {
    await db.query("update etablissements set statut = 'suspendu' where id = $1", [etab]);
    expect((await comme(gerant, 'select * from articles where etablissement_id = $1', [etab])).length).toBeGreaterThan(0);
    await expect(comme(gerant, 'select ouvrir_caisse($1)', [etab])).rejects.toThrow(/suspendu/);
    await db.query("update etablissements set statut = 'actif' where id = $1", [etab]);
  });

  test("le comptable lit tout mais ne vend pas", async () => {
    expect((await comme(comptable, 'select * from ventes where etablissement_id = $1', [etab])).length).toBeGreaterThan(0);
    await expect(comme(comptable, 'select ouvrir_caisse($1)', [etab])).rejects.toThrow(/Permission refusée/);
  });

  test("toute écriture commerciale est journalisée avec son auteur", async () => {
    const lignes = (await db.query("select table_nom, acteur from journal_audit where table_nom in ('ventes', 'paiements', 'depenses', 'clotures', 'articles') and etablissement_id = $1", [etab])).rows;
    expect(new Set(lignes.map((l) => l.table_nom))).toEqual(new Set(['ventes', 'paiements', 'depenses', 'clotures', 'articles']));
    expect(lignes.every((l) => l.acteur)).toBe(true);
  });
});
