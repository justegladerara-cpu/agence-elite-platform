import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { commeRole, creerBase } from './helpers/db.js';

// Site web : blocs contrôlés (aucun code fourni par le client), brouillon et publication, navigation, SEO,
// formulaire de contact, produits de la boutique, accès anonyme limité aux fonctions publiques.
let db;
let sa;
let gerant;
let commercial;
let employe;
let autreGerant;
let etab;
let autreEtab;
let accueil;
let services;

const utilisateur = async (email) => (await db.query('insert into auth.users(email) values($1) returning id', [email])).rows[0].id;
const comme = (user, sql, params = []) => commeRole(db, 'authenticated', user, async (tx) => (await tx.query(sql, params)).rows);
const valeur = async (user, sql, params = []) => Object.values((await comme(user, sql, params))[0])[0];
const anonyme = async (sql, params = []) => Object.values((await commeRole(db, 'anon', null, async (tx) => (await tx.query(sql, params)).rows))[0])[0];
const json = (v) => JSON.stringify(v);
const blocs = (page, liste) => valeur(commercial, 'select enregistrer_blocs_page_site($1, $2::jsonb)', [page, json(liste)]);

beforeAll(async () => {
  db = await creerBase();
  sa = await utilisateur('sa@sw.test');
  gerant = await utilisateur('gerant@sw.test');
  commercial = await utilisateur('commercial@sw.test');
  employe = await utilisateur('employe@sw.test');
  autreGerant = await utilisateur('autre@sw.test');
  await db.query("insert into plateforme_admins(user_id, role) values($1, 'super_admin')", [sa]);
  const c1 = await valeur(sa, "select creer_client('Salon Prestige')");
  const c2 = await valeur(sa, "select creer_client('Concurrent')");
  etab = await valeur(sa, "select creer_etablissement($1, 'ecommerce', 'Salon Prestige')", [c1]);
  autreEtab = await valeur(sa, "select creer_etablissement($1, 'commerce', 'Autre')", [c2]);
  await db.query(
    `insert into etablissement_membres(etablissement_id, user_id, role_id) values
     ($1, $2, 'gerant'), ($1, $3, 'commercial'), ($1, $4, 'employe'), ($5, $6, 'gerant')`,
    [etab, gerant, commercial, employe, autreEtab, autreGerant]
  );
});

afterAll(async () => db.close());

describe('activation', () => {
  test('module supplémentaire accordé par Agence Elite (aucune offre modifiée)', async () => {
    expect((await db.query("select statut from modules where id = 'site_web'")).rows[0].statut).toBe('actif');
    expect((await db.query("select count(*)::int n from offres where 'site_web' = any(modules)")).rows[0].n).toBe(0);
    await expect(comme(gerant, 'select enregistrer_site($1, $2::jsonb)', [etab, json({ adresse: 'salon-prestige', titre: 'Salon' })])).rejects.toThrow(/Permission refusée/);
    await comme(sa, "select accorder_module($1, 'site_web', true, 'Site vitrine vendu')", [etab]);
    await comme(sa, "select definir_module_etablissement($1, 'site_web', true)", [etab]);
    expect((await db.query("select actif from etablissement_modules where etablissement_id = $1 and module_id = 'site_web'", [etab])).rows[0].actif).toBe(true);
  });
});

describe('construction', () => {
  test('réglages : adresse unique, couleur de la palette, pas de mise en ligne sans accueil publié', async () => {
    await expect(comme(commercial, 'select enregistrer_site($1, $2::jsonb)', [etab, json({ adresse: 'salon-prestige', titre: 'Salon' })])).rejects.toThrow(/Permission refusée/);
    await expect(comme(gerant, 'select enregistrer_site($1, $2::jsonb)', [etab, json({ adresse: 'salon-prestige', titre: 'Salon', couleur: '#123456' })])).rejects.toThrow(/palette/);
    await expect(comme(gerant, 'select enregistrer_site($1, $2::jsonb)', [etab, json({ adresse: 'salon-prestige', titre: 'Salon', publie: true })])).rejects.toThrow(/accueil/);
    await comme(gerant, 'select enregistrer_site($1, $2::jsonb)', [etab, json({ adresse: 'Salon-Prestige', titre: 'Salon Prestige', couleur: '#7c3aed', description: 'Coiffure et beauté à Pointe-Noire' })]);
  });

  test('pages : la première est l’accueil ; adresses uniques ; « boutique » réservé', async () => {
    accueil = await valeur(commercial, 'select enregistrer_page_site($1, $2::jsonb)', [etab, json({ slug: 'accueil', titre: 'Accueil', description_seo: 'Salon de coiffure' })]);
    services = await valeur(commercial, 'select enregistrer_page_site($1, $2::jsonb)', [etab, json({ slug: 'services', titre: 'Nos services', ordre: 1 })]);
    expect((await db.query('select accueil from site_pages where id = $1', [accueil])).rows[0].accueil).toBe(true);
    await expect(comme(commercial, 'select enregistrer_page_site($1, $2::jsonb)', [etab, json({ slug: 'services', titre: 'X' })])).rejects.toThrow(/existe déjà/);
    await expect(comme(commercial, 'select enregistrer_page_site($1, $2::jsonb)', [etab, json({ slug: 'boutique', titre: 'X' })])).rejects.toThrow(/réservé/);
    await expect(comme(commercial, 'select enregistrer_page_site($1, $2::jsonb)', [etab, json({ slug: '../admin', titre: 'X' })])).rejects.toThrow(/invalide/);
    await expect(comme(employe, 'select enregistrer_page_site($1, $2::jsonb)', [etab, json({ slug: 'x', titre: 'X' })])).rejects.toThrow(/Permission refusée/);
    await expect(comme(commercial, 'select enregistrer_page_site($1, $2::jsonb)', [etab, json({ id: accueil, slug: 'accueil', titre: 'Accueil', archivee: true })])).rejects.toThrow(/ne s'archive pas/);
  });

  test('blocs : seuls les types et champs connus restent ; aucun code ni lien dangereux', async () => {
    const propres = await blocs(accueil, [
      { type: 'hero', titre: 'Bienvenue <script>alert(1)</script>', sous_titre: 'Coiffure', bouton_texte: 'Nos services', bouton_lien: '/services', onclick: 'alert(1)', style: 'x' },
      { type: 'texte', titre: 'Qui sommes-nous', texte: 'Depuis 2015.' },
      { type: 'services', titre: 'Prestations', elements: [{ titre: 'Tresses', texte: 'Dès 5 000', html: '<b>x</b>' }] },
      { type: 'faq', elements: [{ question: 'Horaires ?', reponse: '9 h - 19 h' }] },
      { type: 'contact', titre: 'Nous écrire', telephone: '+242 06 555 44 33', formulaire: true },
    ]);
    expect(propres[0]).toEqual({ type: 'hero', titre: 'Bienvenue <script>alert(1)</script>', sous_titre: 'Coiffure', bouton_texte: 'Nos services', bouton_lien: '/services' });
    expect(propres[2].elements).toEqual([{ titre: 'Tresses', texte: 'Dès 5 000' }]);
    for (const lien of ['javascript:alert(1)', 'data:text/html,<script>', 'http://site.test', ' JAVASCRIPT:alert(1)', 'https://x.test" onmouseover="a']) {
      await expect(blocs(accueil, [{ type: 'cta', titre: 'X', bouton_lien: lien }])).rejects.toThrow(/Lien refusé/);
    }
    await expect(blocs(accueil, [{ type: 'image', image: 'data:image/svg+xml;base64,PHN2Zz4=' }])).rejects.toThrow(/Image refusée/);
    await expect(blocs(accueil, [{ type: 'html', contenu: '<iframe>' }])).rejects.toThrow(/Type de bloc inconnu/);
    await expect(blocs(accueil, 'pas une liste')).rejects.toThrow(/mal formés/);
    await expect(blocs(accueil, Array.from({ length: 31 }, () => ({ type: 'texte', texte: 'x' })))).rejects.toThrow(/30 blocs/);
    await expect(blocs(accueil, [{ type: 'galerie', elements: Array.from({ length: 13 }, () => ({ image: 'https://img.test/a.jpg' })) }])).rejects.toThrow(/Trop d'éléments/);
    await expect(comme(autreGerant, 'select enregistrer_blocs_page_site($1, $2::jsonb)', [accueil, '[]'])).rejects.toThrow(/Permission refusée/);
    // Le dernier essai valide reste le brouillon.
    expect((await db.query('select jsonb_array_length(brouillon) n from site_pages where id = $1', [accueil])).rows[0].n).toBe(5);
  });

  test('publication : le commercial prépare, le gérant publie ; le brouillon ne sort pas avant', async () => {
    await expect(comme(commercial, 'select publier_page_site($1)', [accueil])).rejects.toThrow(/Permission refusée/);
    await expect(comme(gerant, 'select publier_page_site($1)', [services])).rejects.toThrow(/vide/);
    await comme(gerant, 'select publier_page_site($1)', [accueil]);
    await comme(gerant, 'select enregistrer_site($1, $2::jsonb)', [etab, json({ adresse: 'salon-prestige', titre: 'Salon Prestige', couleur: '#7c3aed', publie: true })]);
    await blocs(accueil, [{ type: 'texte', texte: 'Brouillon secret' }]);
    const site = await anonyme("select site_public('salon-prestige', null)");
    expect(site).toMatchObject({ titre: 'Salon Prestige', couleur: '#7c3aed', page: { slug: 'accueil', description_seo: 'Salon de coiffure' } });
    expect(site.page.blocs).toHaveLength(5);
    expect(JSON.stringify(site)).not.toContain('Brouillon secret');
    expect(site.menu.map((m) => m.slug)).toEqual(['accueil']);
    await expect(anonyme("select site_public('salon-prestige', 'services')")).rejects.toThrow(/Page introuvable/);
    await expect(comme(gerant, 'select publier_page_site($1, false)', [accueil])).rejects.toThrow(/hors ligne/);
  });
});

describe('visiteurs', () => {
  test('formulaire de contact : contrôles, anti-abus, notification ; traitement', async () => {
    const envoyer = (p) => anonyme("select envoyer_message_site('salon-prestige', $1::jsonb)", [json(p)]);
    await expect(envoyer({ nom: 'A', message: 'Bonjour' })).rejects.toThrow(/téléphone ou un e-mail/);
    await expect(envoyer({ nom: 'A', email: 'pas-un-email', message: 'Bonjour' })).rejects.toThrow(/e-mail valide/);
    await expect(envoyer({ nom: '', telephone: '+242 06 111 11 11', message: 'Bonjour' })).rejects.toThrow(/nom/);
    for (let i = 0; i < 3; i += 1) await envoyer({ nom: 'Mme Okemba', telephone: '+242 06 111 11 11', message: `Rendez-vous samedi ? ${i}`, page_id: accueil });
    await expect(envoyer({ nom: 'Mme Okemba', telephone: '242061111111', message: 'Encore' })).rejects.toThrow(/déjà reçu/);
    const messages = await comme(commercial, 'select id, page_id, statut from site_messages order by cree_le');
    expect(messages).toHaveLength(3);
    expect(messages[0]).toMatchObject({ page_id: accueil, statut: 'nouveau' });
    expect((await comme(commercial, "select lien from notifications where type = 'site.message'")).length).toBe(3);
    expect(await comme(autreGerant, 'select id from site_messages')).toEqual([]);
    await expect(comme(employe, 'select traiter_message_site($1)', [messages[0].id])).rejects.toThrow(/Permission refusée/);
    await comme(commercial, 'select traiter_message_site($1)', [messages[0].id]);
    await expect(comme(commercial, 'select traiter_message_site($1)', [messages[0].id])).rejects.toThrow(/déjà traité/);
    await expect(db.query('delete from site_messages where id = $1', [messages[0].id])).rejects.toThrow();
  });

  test('bloc produits : les produits de la boutique en ligne publiée, rien d’autre', async () => {
    const hub = (await db.query('select id from hubs where etablissement_id = $1 and principal', [etab])).rows[0].id;
    const soin = await valeur(gerant, 'select enregistrer_article($1, $2::jsonb)', [etab, json({ nom: 'Soin capillaire', prix_vente: 9000, cout_achat: 4000 })]);
    await comme(gerant, "select ajuster_stock_hub($1, $2, 'entree', 3, 'Réception', 4000)", [hub, soin]);
    await comme(gerant, 'select publier_article_boutique($1, $2::jsonb)', [soin, '{}']);
    await comme(gerant, 'select enregistrer_boutique($1, $2::jsonb)', [etab, json({ adresse: 'prestige-shop', titre: 'Boutique Prestige', publiee: true })]);
    await blocs(services, [{ type: 'produits', titre: 'À emporter', nombre: 50 }]);
    await comme(gerant, 'select publier_page_site($1)', [services]);
    const page = await anonyme("select site_public('salon-prestige', 'services')");
    expect(page.page.blocs[0]).toEqual({ type: 'produits', titre: 'À emporter', nombre: 12 });
    expect(page.boutique.adresse).toBe('prestige-shop');
    expect(page.boutique.liste.map((p) => p.nom)).toEqual(['Soin capillaire']);
    expect(JSON.stringify(page)).not.toContain('4000');
    expect(page.menu.map((m) => m.slug)).toEqual(['accueil', 'services']);
  });

  test('anonyme : aucune table, aucune fonction interne ; site hors ligne ou module retiré = introuvable', async () => {
    for (const table of ['sites', 'site_pages', 'site_messages']) {
      expect((await commeRole(db, 'anon', null, (tx) => tx.query(`select * from ${table}`))).rows).toEqual([]);
    }
    await expect(anonyme("select blocs_site_valides('[]'::jsonb)")).rejects.toThrow(/permission denied/);
    await expect(anonyme('select publier_page_site($1)', [accueil])).rejects.toThrow(/permission denied/);
    await db.query("update etablissement_modules set actif = false where etablissement_id = $1 and module_id = 'site_web'", [etab]);
    await expect(anonyme("select site_public('salon-prestige', null)")).rejects.toThrow(/hors ligne/);
    await db.query("update etablissement_modules set actif = true where etablissement_id = $1 and module_id = 'site_web'", [etab]);
    expect((await anonyme("select site_public('salon-prestige', null)")).titre).toBe('Salon Prestige');
  });
});
