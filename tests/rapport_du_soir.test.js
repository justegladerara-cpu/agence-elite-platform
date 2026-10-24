import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { commeRole, creerBase } from './helpers/db.js';
import {
  dateEnLettres, dateRapportParDefaut, ecartEnMots, lienRapportWhatsApp, texteRapportDuSoir,
} from '../src/modules/cloture/rapportDuSoir.js';

// Rapport du soir envoyé au patron sur WhatsApp (migration 20261017000137, fonction rapport_du_soir).
// Données fictives uniquement.
let db;
let gerant;
let awa;
let binta;
let comptable;
let etranger;
let etab;
let biere;
let coca;

const utilisateur = async (email, nom) => {
  const id = (await db.query('insert into auth.users(email) values($1) returning id', [email])).rows[0].id;
  if (nom) await db.query('update profils set nom_complet = $2 where id = $1', [id, nom]);
  return id;
};
const comme = (user, sql, params = []) => commeRole(db, 'authenticated', user, async (tx) => (await tx.query(sql, params)).rows);
const valeur = async (user, sql, params = []) => Object.values((await comme(user, sql, params))[0])[0];
const vendre = (user, session, lignes, paiements, remise = 0) => valeur(user, 'select enregistrer_vente($1, $2, $3::jsonb, $4::jsonb, null, $5)', [
  etab, session, JSON.stringify(lignes), JSON.stringify(paiements), remise,
]);
const veilleDe = (jour) => new Date(new Date(`${jour}T12:00:00Z`).getTime() - 86400000).toISOString().slice(0, 10);
const rapport = (user, date = null) => valeur(user, 'select rapport_du_soir($1, $2::date)', [etab, date]);

beforeAll(async () => {
  db = await creerBase();
  const admin = await utilisateur('admin@rapport-soir.test');
  gerant = await utilisateur('gerant@rapport-soir.test', 'Gérant Test');
  awa = await utilisateur('awa@rapport-soir.test', 'Awa Test');
  binta = await utilisateur('binta@rapport-soir.test', 'Binta Test');
  comptable = await utilisateur('compta@rapport-soir.test', 'Compta Test');
  etranger = await utilisateur('etranger@rapport-soir.test', 'Autre Test');
  await db.query("insert into plateforme_admins(user_id, role) values($1, 'super_admin')", [admin]);
  const client = await valeur(admin, "select creer_client('Rapport Soir Démo')");
  etab = await valeur(admin, "select creer_etablissement($1, 'commerce', 'Bar Rapport Démo')", [client]);
  const autreEtab = await valeur(admin, "select creer_etablissement($1, 'commerce', 'Autre Bar Démo')", [client]);
  await db.query(
    "insert into etablissement_membres(etablissement_id, user_id, role_id) values ($1, $2, 'gerant'), ($1, $3, 'employe'), ($1, $4, 'employe'), ($1, $5, 'comptable'), ($6, $7, 'gerant')",
    [etab, gerant, awa, binta, comptable, autreEtab, etranger],
  );
  biere = await valeur(gerant, 'select enregistrer_article($1, $2::jsonb)', [etab, JSON.stringify({ nom: 'Bière fictive', prix_vente: 500, suivi_stock: false })]);
  coca = await valeur(gerant, 'select enregistrer_article($1, $2::jsonb)', [etab, JSON.stringify({ nom: 'Soda fictif', prix_vente: 1000, suivi_stock: false })]);

  // Awa : 2 ventes gardées + 1 vente annulée, puis son ticket Z avec 200 FCFA manquants.
  const caisseAwa = await valeur(awa, 'select ouvrir_caisse($1, null, 0)', [etab]);
  await vendre(awa, caisseAwa, [{ article_id: biere, quantite: 2 }, { article_id: coca, quantite: 1 }], [{ mode: 'especes', montant: 2000 }]);
  await vendre(awa, caisseAwa, [{ article_id: coca, quantite: 1 }], [{ mode: 'mobile_money', montant: 800 }], 200);
  const annulee = await vendre(awa, caisseAwa, [{ article_id: biere, quantite: 1 }], [{ mode: 'especes', montant: 500 }]);
  await comme(gerant, "select annuler_vente($1, 'Erreur de saisie')", [annulee.vente_id]);
  await valeur(awa, 'select cloturer_caisse($1, 1800)', [caisseAwa]);

  // Binta : 1 vente, sa caisse reste ouverte.
  const caisseBinta = await valeur(binta, 'select ouvrir_caisse($1, null, 0)', [etab]);
  await vendre(binta, caisseBinta, [{ article_id: biere, quantite: 3 }], [{ mode: 'especes', montant: 1500 }]);

  // Une dépense du jour.
  await valeur(gerant, 'select enregistrer_depense($1, $2::jsonb)', [etab, JSON.stringify({ libelle: 'Glace', montant: 300, mode: 'especes' })]);
});

afterAll(async () => db.close());

describe('rapport_du_soir : les chiffres de la journée', () => {
  test('ventes, tickets, encaissements, top articles, remises, annulations, dépenses, écart, caissières, caisses ouvertes', async () => {
    const r = await rapport(gerant);
    expect(r.etablissement).toBe('Bar Rapport Démo');
    expect(r.devise).toBe('XAF');
    expect(Number(r.total_ventes)).toBe(4300);
    expect(r.nombre_tickets).toBe(3);
    expect(Number(r.total_remises)).toBe(200);
    expect(Number(r.credit)).toBe(0);
    expect(r.encaissements.map((e) => [e.mode, Number(e.montant)])).toEqual([['especes', 3500], ['mobile_money', 800]]);
    expect(r.top_articles.map((a) => [a.libelle, Number(a.quantite), Number(a.total)])).toEqual([
      ['Bière fictive', 5, 2500], ['Soda fictif', 2, 2000],
    ]);
    expect(r.annulations.nombre).toBe(1);
    expect(Number(r.annulations.montant)).toBe(500);
    expect(r.depenses.nombre).toBe(1);
    expect(Number(r.depenses.montant)).toBe(300);
    expect(r.clotures.nombre).toBe(1);
    expect(Number(r.clotures.ecart)).toBe(-200);
    expect(r.clotures.a_compter).toBe(0);
    expect(r.clotures.liste[0].caissier).toBe('Awa Test');
    expect(r.caissiers.map((c) => [c.nom, c.nombre_ventes, Number(c.total_ventes)])).toEqual([
      ['Awa Test', 2, 2800], ['Binta Test', 1, 1500],
    ]);
    expect(r.caisses_ouvertes).toBe(1);
    expect(r.whatsapp_patron).toBe('');
  });

  test('top 5 au plus ; un autre jour ne mélange pas les chiffres', async () => {
    const r = await rapport(gerant);
    expect(r.top_articles.length).toBeLessThanOrEqual(5);
    const hier = await rapport(gerant, veilleDe(r.date));
    expect(Number(hier.total_ventes)).toBe(0);
    expect(hier.nombre_tickets).toBe(0);
    expect(hier.top_articles).toEqual([]);
    expect(hier.clotures.nombre).toBe(0);
    // La caisse de Binta, ouverte aujourd'hui, ne compte pas pour hier.
    expect(hier.caisses_ouvertes).toBe(0);
  });

  test('une vente déplacée à la veille compte pour la veille', async () => {
    const r = await rapport(gerant);
    const veille = veilleDe(r.date);
    const vente = (await db.query("select id from ventes where etablissement_id = $1 and statut = 'validee' and total = 1500", [etab])).rows[0].id;
    await db.transaction(async (tx) => {
      await tx.query("set local session_replication_role = 'replica'");
      await tx.query("update ventes set cree_le = cree_le - interval '1 day' where id = $1", [vente]);
      await tx.query("update paiements set cree_le = cree_le - interval '1 day' where vente_id = $1", [vente]);
    });
    const hier = await rapport(gerant, veille);
    expect(Number(hier.total_ventes)).toBe(1500);
    expect(hier.caissiers.map((c) => c.nom)).toEqual(['Binta Test']);
    expect(Number((await rapport(gerant)).total_ventes)).toBe(2800);
    await db.transaction(async (tx) => {
      await tx.query("set local session_replication_role = 'replica'");
      await tx.query("update ventes set cree_le = cree_le + interval '1 day' where id = $1", [vente]);
      await tx.query("update paiements set cree_le = cree_le + interval '1 day' where vente_id = $1", [vente]);
    });
  });
});

describe('rapport_du_soir : qui peut le lire', () => {
  test('gérant et comptable oui ; caissière, autre établissement et visiteur non', async () => {
    expect(Number((await rapport(comptable)).total_ventes)).toBe(4300);
    await expect(rapport(awa)).rejects.toThrow(/réservé au gérant/);
    await expect(rapport(etranger)).rejects.toThrow(/réservé au gérant/);
    await expect(commeRole(db, 'anon', null, (tx) => tx.query('select rapport_du_soir($1)', [etab]))).rejects.toThrow(/permission denied/);
  });

  test('fonction en lecture seule, security definer, search_path vide', async () => {
    const f = (await db.query("select prosecdef, provolatile, proconfig from pg_proc where proname = 'rapport_du_soir'")).rows[0];
    expect(f.prosecdef).toBe(true);
    expect(f.provolatile).toBe('s');
    expect(f.proconfig).toEqual(['search_path=""']);
  });
});

describe('numéro WhatsApp du patron (réglage du module Clôture)', () => {
  test('enregistré par le gérant, rendu par le rapport ; valeur invalide refusée ; caissière refusée', async () => {
    const schema = (await db.query("select parametres_schema from modules where id = 'cloture'")).rows[0].parametres_schema;
    expect(schema.find((d) => d.cle === 'whatsapp_patron').defaut).toBe('');
    await comme(gerant, "select enregistrer_parametres_module($1, 'cloture', '{\"whatsapp_patron\": \"06 123 45 67\"}'::jsonb)", [etab]);
    expect((await rapport(gerant)).whatsapp_patron).toBe('06 123 45 67');
    await comme(gerant, "select enregistrer_parametres_module($1, 'cloture', '{\"whatsapp_patron\": \"+242 06 123 45 67\"}'::jsonb)", [etab]);
    await expect(comme(gerant, "select enregistrer_parametres_module($1, 'cloture', '{\"whatsapp_patron\": \"appelez-moi\"}'::jsonb)", [etab]))
      .rejects.toThrow(/Valeur invalide/);
    await expect(comme(awa, "select enregistrer_parametres_module($1, 'cloture', '{\"whatsapp_patron\": \"06 000 00 00\"}'::jsonb)", [etab]))
      .rejects.toThrow(/Permission refusée/);
    // Vide : WhatsApp demandera à qui envoyer.
    await comme(gerant, "select enregistrer_parametres_module($1, 'cloture', '{\"whatsapp_patron\": \"\"}'::jsonb)", [etab]);
    expect((await rapport(gerant)).whatsapp_patron).toBe('');
  });
});

// ---------------------------------------------------------------------------
// Texte envoyé sur WhatsApp (fonctions pures)
// ---------------------------------------------------------------------------
const EXEMPLE = {
  date: '2026-10-12', etablissement: 'Bar Démo', devise: 'XAF', whatsapp_patron: '06 123 45 67',
  total_ventes: 125000, nombre_tickets: 42, total_remises: 2000, credit: 5000,
  encaissements: [{ mode: 'especes', montant: 80000 }, { mode: 'mobile_money', montant: 40000 }],
  top_articles: [
    { libelle: 'Bière 65 cl', quantite: 60, total: 60000 }, { libelle: 'Soda', quantite: 20, total: 20000 },
    { libelle: 'Eau', quantite: 10, total: 5000 }, { libelle: 'Brochette', quantite: 8, total: 8000 },
    { libelle: 'Frites', quantite: 5, total: 5000 }, { libelle: 'En trop', quantite: 1, total: 100 },
  ],
  annulations: { nombre: 2, montant: 7000 }, retours: { nombre: 0, montant: 0 }, depenses: { nombre: 3, montant: 15000 },
  clotures: { nombre: 2, ecart: -200, a_compter: 0, liste: [] },
  caissiers: [{ nom: 'Awa', nombre_ventes: 30, total_ventes: 90000 }, { nom: 'Binta', nombre_ventes: 1, total_ventes: 35000 }],
  caisses_ouvertes: 1,
};

describe('texte du rapport du soir', () => {
  test('montants en FCFA avec séparateur de milliers, toutes les rubriques', () => {
    const t = texteRapportDuSoir(EXEMPLE);
    expect(t.split('\n')[0]).toBe('*Rapport du soir · Bar Démo*');
    expect(t).toMatch(/12 octobre 2026/);
    expect(t).toContain('*Ventes : 125 000 FCFA*');
    expect(t).toContain('Tickets : 42');
    expect(t).toContain('- Espèces : 80 000 FCFA');
    expect(t).toContain('- Mobile Money : 40 000 FCFA');
    expect(t).toContain('Crédit accordé (reste à payer) : 5 000 FCFA');
    expect(t).toContain('1. Bière 65 cl : 60 · 60 000 FCFA');
    expect(t).toContain('5. Frites : 5 · 5 000 FCFA');
    expect(t).not.toContain('En trop');
    expect(t).toContain('Remises : 2 000 FCFA');
    expect(t).toContain('Annulations : 2 (7 000 FCFA)');
    expect(t).not.toContain('Retours');
    expect(t).toContain('Dépenses : 15 000 FCFA (3 dépenses)');
    expect(t).toContain('Écart de caisse : manque 200 FCFA (2 tickets Z)');
    expect(t).toContain('- Awa : 30 ventes · 90 000 FCFA');
    expect(t).toContain('- Binta : 1 vente · 35 000 FCFA');
    expect(t).toContain('Attention : 1 caisse encore ouverte');
  });

  test('journée vide : pas d’erreur, des zéros lisibles', () => {
    const t = texteRapportDuSoir({ date: '2026-10-12', devise: 'XAF' });
    expect(t).toContain('*Ventes : 0 FCFA*');
    expect(t).toContain('Annulations : 0');
    expect(t).toContain('Écart de caisse : aucun ticket Z ce jour');
    expect(t).toContain('Toutes les caisses sont fermées');
  });

  test('écart en mots, date en lettres, date proposée par défaut', () => {
    expect(ecartEnMots(-200, 'XAF')).toBe('manque 200 FCFA');
    expect(ecartEnMots(1500, 'XAF')).toBe('1 500 FCFA en trop');
    expect(ecartEnMots(0, 'XAF')).toBe('aucun écart');
    expect(dateEnLettres('2026-10-12')).toMatch(/^lundi 12 octobre 2026$/);
    expect(dateRapportParDefaut(new Date(2026, 9, 13, 21, 30))).toBe('2026-10-13');
    // Avant 6 h : la soirée de la veille (un bar qui ferme à 2 h).
    expect(dateRapportParDefaut(new Date(2026, 9, 13, 2, 0))).toBe('2026-10-12');
    expect(dateRapportParDefaut(new Date(2026, 9, 1, 1, 0))).toBe('2026-09-30');
  });

  test('lien WhatsApp : numéro du patron complété (Congo), texte encodé ; sans numéro WhatsApp demande à qui', () => {
    const lien = lienRapportWhatsApp(EXEMPLE);
    expect(lien.startsWith('https://wa.me/242061234567?text=')).toBe(true);
    expect(decodeURIComponent(lien.split('?text=')[1])).toBe(texteRapportDuSoir(EXEMPLE));
    expect(lienRapportWhatsApp(EXEMPLE, '').startsWith('https://wa.me/?text=')).toBe(true);
    expect(lienRapportWhatsApp({ ...EXEMPLE, whatsapp_patron: '+225 07 00 00 00 00' }).startsWith('https://wa.me/2250700000000?text=')).toBe(true);
  });
});

describe('journée détaillée (2026-10-24)', () => {
  test('le texte WhatsApp reprend l’heure forte, la plus grosse vente et les conseils', async () => {
    const { texteRapportDuSoir } = await import('../src/modules/cloture/rapportDuSoir.js');
    const t = texteRapportDuSoir({ devise: 'XAF', total_ventes: 1000, nombre_tickets: 1, heure_forte: { heure: 21, montant: 900 }, plus_grosse_vente: { montant: 600, heure: '21:51' }, conseils: ['Commandez vite Primus.'] });
    expect(t).toContain('Heure la plus forte : 21 h');
    expect(t).toContain('Plus grosse vente :');
    expect(t).toContain('à 21:51');
    expect(t).toContain('*Conseils*\n- Commandez vite Primus.');
    expect(texteRapportDuSoir({ total_ventes: 0 })).not.toContain('Conseils');
  });

  test('conseils tirés des chiffres, jamais sans ventes', async () => {
    const { conseils } = await import('../src/modules/tableau_de_bord/analyses.js');
    const m = (x) => `${x} F`;
    expect(conseils(null, m)).toEqual([]);
    expect(conseils({ kpis: [{ valeur: 0 }] }, m)).toEqual([]);
    const c = conseils({
      kpis: [{ valeur: 5000 }], ruptures: [{ libelle: 'Primus' }], meilleureHeure: { heure: 21 }, creux: { de: 14, a: 17, part: 4 },
      top: [{ libelle: 'Primus', chiffre: 3000 }], paires: [{ a: 'Primus', b: 'Brochette' }], equipe: [{ nom: 'Mireille', chiffre: 4000 }, { nom: 'Paul', chiffre: 1000 }],
    }, m);
    expect(c).toHaveLength(5);
    expect(c[0]).toMatch(/Commandez vite Primus/);
    expect(c[1]).toMatch(/21 h/);
  });
});
