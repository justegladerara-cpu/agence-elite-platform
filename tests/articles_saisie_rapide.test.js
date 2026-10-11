import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { lignesDuModele, MODELES } from '../src/modules/articles/modeles.js';
import {
  articleAvecPrix, arrondirPrix, calculerPrix, cleNom, lireNombre, messageAjout, preparerLignes, traduireErreurImport, uniteConnue,
} from '../src/modules/articles/saisieRapide.js';
import { commeRole, creerBase } from './helpers/db.js';

// Saisie rapide des articles : plusieurs articles d'un coup, modèles par métier, changement de prix en lot.
describe('préparation du tableau « Ajouter plusieurs articles »', () => {
  const ligne = (extra) => ({ nom: '', prix_vente: '', cout_achat: '', unite: 'unité', categorie: '', stock_initial: '', ...extra });

  test('lignes vides ignorées, sans prix gardées de côté, doublons écartés, nombres à la française', () => {
    const r = preparerLignes([
      ligne({ nom: 'Riz', prix_vente: '1 000', unite: 'kg', categorie: 'Céréales' }),
      ligne({}),
      ligne({ nom: 'Sucre', prix_vente: '' }),
      ligne({ nom: '  riz ', prix_vente: '900' }),
      ligne({ nom: 'Savon', prix_vente: '250,5', cout_achat: '200' }),
      ligne({ nom: 'Huile', prix_vente: '-3' }),
      ligne({ nom: 'Pain fictif', prix_vente: '150' }),
    ], { nomsExistants: ['PAIN FICTIF'] });
    expect(r.aEnvoyer).toEqual([
      { nom: 'Riz', prix_vente: 1000, unite: 'kg', categorie: 'Céréales', suivi_stock: false },
      { nom: 'Savon', prix_vente: 250.5, cout_achat: 200, unite: 'unité', suivi_stock: false },
    ]);
    expect(r.positions).toEqual([0, 4]);
    expect(r.sansPrix).toEqual([2]);
    expect(r.doublons).toEqual([3, 6]);
    expect(r.invalides).toEqual([{ index: 5, motif: 'prix de vente illisible' }]);
  });

  test('stock de départ : envoyé seulement si autorisé, et active alors le suivi du stock', () => {
    const lignes = [ligne({ nom: 'Bière fictive', prix_vente: '600', stock_initial: '24' }), ligne({ nom: 'Jus fictif', prix_vente: '500', stock_initial: 'beaucoup' })];
    const avec = preparerLignes(lignes, { avecStock: true });
    expect(avec.aEnvoyer).toEqual([{ nom: 'Bière fictive', prix_vente: 600, unite: 'unité', suivi_stock: true, stock_initial: 24 }]);
    expect(avec.invalides).toEqual([{ index: 1, motif: 'stock de départ illisible' }]);
    expect(preparerLignes(lignes).aEnvoyer.map((a) => a.stock_initial)).toEqual([undefined, undefined]);
  });

  test('erreur de la base ramenée au numéro de ligne du tableau, messages au pluriel', () => {
    expect(traduireErreurImport('Ligne 2 : prix de vente manquant ou négatif', [0, 4])).toBe('Ligne 5 du tableau : prix de vente manquant ou négatif');
    expect(traduireErreurImport('Accès refusé', [0])).toBe('Accès refusé');
    expect(messageAjout(12)).toBe('12 articles ajoutés');
    expect(messageAjout(1)).toBe('1 article ajouté');
    expect(lireNombre(' 1 500 ')).toBe(1500);
    expect(lireNombre('')).toBeNull();
    expect(Number.isNaN(lireNombre('12 kg'))).toBe(true);
    expect(cleNom('Thé  VERT')).toBe(cleNom('the vert'));
  });
});

describe('modèles par métier', () => {
  test('30 à 50 articles génériques chacun, unités connues, catégories, prix vides, sans doublon', () => {
    expect(MODELES.map((m) => m.id)).toEqual(['epicerie', 'boissons', 'quincaillerie', 'vetements', 'beaute', 'parapharmacie']);
    for (const modele of MODELES) {
      expect(modele.articles.length).toBeGreaterThanOrEqual(30);
      expect(modele.articles.length).toBeLessThanOrEqual(50);
      expect(new Set(modele.articles.map((a) => cleNom(a.nom))).size).toBe(modele.articles.length);
      for (const a of modele.articles) {
        expect(uniteConnue(a.unite)).toBe(true);
        expect(a.categorie).toBeTruthy();
      }
      expect(lignesDuModele(modele.id).every((l) => l.prix_vente === '' && l.cout_achat === '')).toBe(true);
    }
    expect(lignesDuModele('inconnu')).toEqual([]);
    // Viande, riz au poids ; parapharmacie sans médicament.
    const epicerie = Object.fromEntries(MODELES[0].articles.map((a) => [a.nom, a.unite]));
    expect(epicerie.Riz).toBe('kg');
    expect(epicerie['Viande de bœuf']).toBe('kg');
    const para = MODELES.find((m) => m.id === 'parapharmacie').articles.map((a) => a.nom.toLowerCase()).join(' ');
    expect(para).not.toMatch(/paracétamol|ibuprofène|aspirine|antibiotique|sirop|comprimé|gélule|médicament/);
  });

  test('un modèle sans prix ne peut rien enregistrer : toutes les lignes restent à compléter', () => {
    const r = preparerLignes(lignesDuModele('quincaillerie'));
    expect(r.aEnvoyer).toEqual([]);
    expect(r.sansPrix.length).toBe(MODELES.find((m) => m.id === 'quincaillerie').articles.length);
  });
});

describe('calcul des nouveaux prix', () => {
  test('pourcentage ou montant, hausse ou baisse, arrondi à 5 ou 25 FCFA', () => {
    expect(calculerPrix(1000, { sens: 'augmenter', mode: 'pourcent', valeur: 10, pas: 5 })).toBe(1100);
    expect(calculerPrix(1230, { sens: 'augmenter', mode: 'pourcent', valeur: 7, pas: 5 })).toBe(1315); // 1316,1 → 1315
    expect(calculerPrix(1230, { sens: 'augmenter', mode: 'pourcent', valeur: 7, pas: 25 })).toBe(1325);
    expect(calculerPrix(1000, { sens: 'baisser', mode: 'pourcent', valeur: 15, pas: 25 })).toBe(850);
    expect(calculerPrix(500, { sens: 'augmenter', mode: 'montant', valeur: 50, pas: 25 })).toBe(550);
    expect(calculerPrix(100, { sens: 'baisser', mode: 'montant', valeur: 200, pas: 5 })).toBeNull();
    expect(calculerPrix(333, { sens: 'augmenter', mode: 'pourcent', valeur: 0.5, pas: 1 })).toBe(335);
    expect(arrondirPrix(12.4, 25)).toBe(0);
    expect(arrondirPrix(13, 25)).toBe(25);
  });
});

describe('dans la base (importer_articles, enregistrer_article)', () => {
  let db;
  let gerant;
  let vendeur;
  let etab;
  const utilisateur = async (email) => (await db.query('insert into auth.users(email) values($1) returning id', [email])).rows[0].id;
  const comme = (u, sql, params = []) => commeRole(db, 'authenticated', u, async (tx) => (await tx.query(sql, params)).rows);
  const valeur = async (u, sql, params = []) => Object.values((await comme(u, sql, params))[0])[0];
  const json = (v) => JSON.stringify(v);

  beforeAll(async () => {
    db = await creerBase();
    const sa = await utilisateur('sa@saisie.test');
    gerant = await utilisateur('gerant@saisie.test');
    vendeur = await utilisateur('vendeur@saisie.test');
    await db.query("insert into plateforme_admins(user_id, role) values($1, 'super_admin')", [sa]);
    const client = await valeur(sa, "select creer_client('Client Saisie')");
    etab = await valeur(sa, "select creer_etablissement($1, 'commerce', 'Boutique Saisie')", [client]);
    await db.query("insert into etablissement_membres(etablissement_id, user_id, role_id) values ($1, $2, 'gerant'), ($1, $3, 'employe')", [etab, gerant, vendeur]);
  });

  afterAll(async () => db.close());

  test('plusieurs articles en une fois : catégories créées, stock de départ tracé, sans stock = sans suivi', async () => {
    const r = preparerLignes([
      { nom: 'Riz fictif', prix_vente: '800', cout_achat: '650', unite: 'kg', categorie: 'Céréales', stock_initial: '50' },
      { nom: 'Savon fictif', prix_vente: '300', unite: 'unité', categorie: '', stock_initial: '' },
      { nom: 'Sans prix', prix_vente: '' },
    ], { avecStock: true });
    const resultat = await valeur(gerant, 'select importer_articles($1, $2::jsonb)', [etab, json(r.aEnvoyer)]);
    expect(resultat).toEqual({ crees: 2, mis_a_jour: 0 });
    const lignes = (await db.query(`select a.nom, a.unite, a.suivi_stock, a.cout_achat::float cout_achat, c.nom categorie,
      (select coalesce(sum(quantite), 0)::float from mouvements_stock m where m.article_id = a.id) stock
      from articles a left join categories_articles c on c.id = a.categorie_id where a.etablissement_id = $1 order by a.nom`, [etab])).rows;
    expect(lignes).toEqual([
      { nom: 'Riz fictif', unite: 'kg', suivi_stock: true, cout_achat: 650, categorie: 'Céréales', stock: 50 },
      { nom: 'Savon fictif', unite: 'unité', suivi_stock: false, cout_achat: null, categorie: null, stock: 0 },
    ]);
  });

  test('un employé sans droit de gestion ne peut rien ajouter', async () => {
    await expect(valeur(vendeur, 'select importer_articles($1, $2::jsonb)', [etab, json([{ nom: 'Interdit', prix_vente: 1 }])])).rejects.toThrow();
  });

  test('changement de prix : seul le prix bouge, tout le reste de l’article est conservé', async () => {
    const photo = 'data:image/jpeg;base64,AAAA';
    const id = await valeur(gerant, 'select enregistrer_article($1, $2::jsonb)', [etab, json({
      nom: 'Lait fictif', prix_vente: 1230, cout_achat: 900, unite: 'boîte', reference: 'LF-1', code_barres: '123',
      description: 'Boîte de 400 g', suivi_stock: false, stock_minimum: 3, photo,
    })]);
    await valeur(gerant, 'select regler_lot_article($1, 24, $2)', [id, 'carton']);
    const avant = (await db.query('select * from articles where id = $1', [id])).rows[0];
    const nouveau = calculerPrix(avant.prix_vente, { sens: 'augmenter', mode: 'pourcent', valeur: 7, pas: 25 });
    await valeur(gerant, 'select enregistrer_article($1, $2::jsonb)', [etab, json(articleAvecPrix(avant, nouveau))]);
    const apres = (await db.query('select * from articles where id = $1', [id])).rows[0];
    expect(Number(apres.prix_vente)).toBe(1325);
    for (const champ of ['nom', 'reference', 'code_barres', 'description', 'categorie_id', 'cout_achat', 'unite', 'suivi_stock', 'stock_minimum', 'photo', 'actif', 'disponible', 'epuise', 'unites_par_lot', 'nom_lot', 'variante']) {
      expect(apres[champ]).toEqual(avant[champ]);
    }
    await expect(valeur(vendeur, 'select enregistrer_article($1, $2::jsonb)', [etab, json(articleAvecPrix(avant, 1))])).rejects.toThrow();
  });
});
