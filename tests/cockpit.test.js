import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { listerComptesDemo, semerDemo } from '../src/noyau/donnees/demo.js';
import { creerApiLocale } from '../src/noyau/donnees/moteurLocal.js';
import { bornesPeriode, variation } from '../src/modules/tableau_de_bord/domaines.js';
import { creerBaseLocale } from './helpers/locale.js';

// Tableaux de bord (cockpit_*) : forme commune, droits, Hub, isolation, modules coupés, périodes.
let db;
let api;
let utilisateur = null;
let comptes;
let etabs;
const auj = new Date().toISOString().slice(0, 10);
const il_y_a = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
const comme = (email) => { utilisateur = comptes[email]; };
const appel = (domaine, etab, du = il_y_a(29), au = auj, filtres = {}) =>
  api.rpc(`cockpit_${domaine}`, { p_etablissement_id: etabs[etab], p_du: du, p_au: au, p_filtres: filtres });
const kpi = (r, cle) => r.kpis.find((k) => k.cle === cle);

beforeAll(async () => {
  db = await creerBaseLocale();
  await semerDemo(db);
  api = creerApiLocale(db, () => utilisateur);
  comptes = Object.fromEntries((await listerComptesDemo(db)).map((c) => [c.email, c.id]));
  etabs = Object.fromEntries((await db.query('select nom, id from public.etablissements')).rows.map((r) => [r.nom, r.id]));
}, 120000);

afterAll(async () => db.close());

describe('cockpit : forme et contenu', () => {
  test('chaque domaine renvoie la même forme, avec des données réelles', async () => {
    comme('gerante@demo.agence-elite.fr');
    const domaines = (await api.rpc('cockpit_domaines', { p_etablissement_id: etabs['Commerce Démo'] })).map((d) => d.id);
    expect(domaines).toEqual(expect.arrayContaining(['commerce', 'facturation', 'tresorerie', 'crm', 'achats', 'rh', 'projets', 'agenda', 'support', 'abonnements', 'fidelite']));
    for (const d of domaines) {
      const r = await appel(d, 'Commerce Démo');
      for (const cle of ['kpis', 'attention', 'graphiques', 'listes', 'activite']) expect(Array.isArray(r[cle]), `${d}.${cle}`).toBe(true);
      expect(r.kpis.length, d).toBeGreaterThan(0);
      for (const k of r.kpis) {
        expect(typeof k.libelle).toBe('string');
        expect(['montant', 'nombre', 'pourcent', 'heures']).toContain(k.format);
      }
      // « À surveiller » : jamais d'alerte vide.
      for (const a of r.attention) {
        expect(a.nombre, `${d}.${a.cle}`).toBeGreaterThan(0);
        expect(['critique', 'alerte', 'info']).toContain(a.niveau);
      }
    }
  });

  test('facturé et encaissé sont deux indicateurs distincts', async () => {
    comme('gerante@demo.agence-elite.fr');
    const r = await appel('facturation', 'Commerce Démo');
    expect(kpi(r, 'facture').libelle).toBe('Facturé');
    expect(kpi(r, 'encaisse').libelle).toBe('Encaissé sur factures');
    expect(kpi(r, 'facture').valeur).not.toBe(kpi(r, 'encaisse').valeur);
    expect(kpi(r, 'reste').route).toBe('factures?onglet=facture');
  });

  test('vue globale : modules autorisés seulement, alertes triées par gravité', async () => {
    comme('gerante@demo.agence-elite.fr');
    const g = await appel('etablissement', 'Commerce Démo');
    expect(g.erreurs).toEqual([]);
    expect(g.domaines.map((d) => d.id)).toContain('commerce');
    expect(g.domaines.map((d) => d.id)).not.toContain('hotel');
    const rangs = g.attention.map((a) => ({ critique: 0, alerte: 1, info: 2 }[a.niveau]));
    expect(rangs).toEqual([...rangs].sort((a, b) => a - b));
    expect(g.attention.every((a) => a.module && a.domaine)).toBe(true);
    expect(g.activite.length).toBeLessThanOrEqual(12);
  });

  test('un hôtel ne montre pas de tableau Commerce sans ventes de caisse', async () => {
    comme('hotel@demo.agence-elite.fr');
    const g = await appel('etablissement', 'Hôtel Démo');
    expect(g.domaines.map((d) => d.id)).toContain('hotel');
    expect(g.domaines.map((d) => d.id)).not.toContain('commerce');
    const h = await appel('hotel', 'Hôtel Démo');
    expect(kpi(h, 'occupation').format).toBe('pourcent');
    expect(kpi(h, 'occupation').valeur).toBeGreaterThanOrEqual(0);
    expect(kpi(h, 'occupation').valeur).toBeLessThanOrEqual(100);
  });
});

describe('cockpit : droits, Hub et isolation', () => {
  test('sans permission de tableau de bord, la vue globale est refusée', async () => {
    comme('serveur@demo.agence-elite.fr');
    await expect(appel('etablissement', 'Restaurant Démo')).rejects.toThrow(/tableau_de_bord.lire/);
  });

  test('un caissier ne lit pas le CRM ni la facturation', async () => {
    comme('caisse-marche@demo.agence-elite.fr');
    await expect(appel('crm', 'Commerce Démo')).rejects.toThrow(/Permission refusée/);
    await expect(appel('facturation', 'Commerce Démo')).rejects.toThrow(/Permission refusée/);
    const domaines = (await api.rpc('cockpit_domaines', { p_etablissement_id: etabs['Commerce Démo'] })).map((d) => d.id);
    expect(domaines).not.toContain('crm');
  });

  test('un caissier de Hub ne voit que son Hub, et ne peut pas en demander un autre', async () => {
    comme('gerante@demo.agence-elite.fr');
    const hubs = Object.fromEntries((await api.lire('hubs', { eq: { etablissement_id: etabs['Commerce Démo'] } })).map((h) => [h.nom, h.id]));
    const marche = await appel('commerce', 'Commerce Démo', il_y_a(29), auj, { hub_id: hubs['Boutique Marché Total'] });
    const tout = await appel('commerce', 'Commerce Démo');
    expect(kpi(tout, 'chiffre_affaires').valeur).toBeGreaterThan(kpi(marche, 'chiffre_affaires').valeur);
    comme('caisse-marche@demo.agence-elite.fr');
    const caissier = await appel('commerce', 'Commerce Démo');
    expect(kpi(caissier, 'chiffre_affaires').valeur).toBe(kpi(marche, 'chiffre_affaires').valeur);
    await expect(appel('commerce', 'Commerce Démo', il_y_a(29), auj, { hub_id: hubs['Magasin principal'] })).rejects.toThrow(/Accès refusé à ce Hub/);
  });

  test('aucun accès à un autre établissement', async () => {
    comme('gerante@demo.agence-elite.fr');
    await expect(appel('hotel', 'Hôtel Démo')).rejects.toThrow(/Permission refusée/);
    await expect(appel('etablissement', 'Hôtel Démo')).rejects.toThrow(/Permission refusée/);
    expect(await api.rpc('cockpit_domaines', { p_etablissement_id: etabs['Hôtel Démo'] })).toEqual([]);
  });

  test('sans connexion, rien', async () => {
    utilisateur = null;
    await expect(appel('commerce', 'Commerce Démo')).rejects.toThrow();
  });

  test('un module désactivé disparaît du tableau de bord', async () => {
    await db.query("update public.etablissement_modules set actif = false where etablissement_id = $1 and module_id = 'support_tickets'", [etabs['Commerce Démo']]);
    try {
      comme('gerante@demo.agence-elite.fr');
      const domaines = (await api.rpc('cockpit_domaines', { p_etablissement_id: etabs['Commerce Démo'] })).map((d) => d.id);
      expect(domaines).not.toContain('support');
      const g = await appel('etablissement', 'Commerce Démo');
      expect(g.domaines.map((d) => d.id)).not.toContain('support');
      expect(g.attention.some((a) => a.domaine === 'support')).toBe(false);
    } finally {
      await db.query("update public.etablissement_modules set actif = true where etablissement_id = $1 and module_id = 'support_tickets'", [etabs['Commerce Démo']]);
    }
  });
});

describe('cockpit : périodes et comparaisons', () => {
  test('période sans données : zéros, aucune comparaison inventée', async () => {
    comme('gerante@demo.agence-elite.fr');
    const r = await appel('commerce', 'Commerce Démo', '2020-01-01', '2020-01-31');
    expect(kpi(r, 'chiffre_affaires').valeur).toBe(0);
    expect(r.periode.comparable).toBe(false);
    expect(r.kpis.every((k) => k.precedent === undefined)).toBe(true);
    expect(r.activite).toEqual([]);
  });

  test('périodes invalides refusées', async () => {
    comme('gerante@demo.agence-elite.fr');
    await expect(appel('commerce', 'Commerce Démo', auj, il_y_a(3))).rejects.toThrow(/Période invalide/);
    await expect(appel('commerce', 'Commerce Démo', '2020-01-01', auj)).rejects.toThrow(/trop longue/);
    await expect(appel('commerce', 'Commerce Démo', il_y_a(3), auj, { hub_id: 'pas-un-uuid' })).rejects.toThrow(/Filtres invalides/);
  });

  test('comparaison seulement si la période précédente est complète et suffisante', async () => {
    const r = (await db.query(`select public.cockpit_comparable(5, date '2026-01-01', date '2026-02-01') a,
      public.cockpit_comparable(2, date '2026-01-01', date '2026-02-01') b, public.cockpit_comparable(5, date '2026-02-15', date '2026-02-01') c`)).rows[0];
    expect(r).toEqual({ a: true, b: false, c: false });
    expect(variation({ cle: 'chiffre_affaires', valeur: 120, precedent: 100 })).toEqual({ pourcent: 20, favorable: true });
    expect(variation({ cle: 'remboursements', valeur: 120, precedent: 100 })).toEqual({ pourcent: 20, favorable: false });
    expect(variation({ cle: 'chiffre_affaires', valeur: 120 })).toBeNull();
    expect(variation({ cle: 'chiffre_affaires', valeur: 120, precedent: 0 })).toBeNull();
  });

  test('bornes des périodes proposées', () => {
    const maintenant = new Date(2026, 9, 3, 10);
    expect(bornesPeriode('jour', {}, maintenant)).toEqual({ du: '2026-10-03', au: '2026-10-03' });
    expect(bornesPeriode('hier', {}, maintenant)).toEqual({ du: '2026-10-02', au: '2026-10-02' });
    expect(bornesPeriode('7j', {}, maintenant)).toEqual({ du: '2026-09-27', au: '2026-10-03' });
    expect(bornesPeriode('mois', {}, maintenant)).toEqual({ du: '2026-10-01', au: '2026-10-03' });
    expect(bornesPeriode('annee', {}, maintenant)).toEqual({ du: '2026-01-01', au: '2026-10-03' });
    expect(bornesPeriode('perso', { du: '2026-09-10', au: '2026-09-01' }, maintenant)).toEqual({ du: '2026-09-01', au: '2026-09-10' });
  });

  test('volume : 1 500 ventes sur un an restent rapides', async () => {
    const etab = etabs['Commerce Démo'];
    await db.query(`insert into public.ventes (etablissement_id, numero, statut, sous_total, remise, total, montant_paye, statut_paiement, hub_id, cree_le, origine, vendeur)
      select $1, 'VOL-' || g, 'validee', 1000 + g, 0, 1000 + g, 1000 + g, 'payee',
             (select id from public.hubs where etablissement_id = $1 and principal), now() - (g % 360) * interval '1 day', 'caisse', $2
      from generate_series(1, 1500) g`, [etab, comptes['gerante@demo.agence-elite.fr']]);
    comme('gerante@demo.agence-elite.fr');
    const debut = Date.now();
    const r = await appel('commerce', 'Commerce Démo', il_y_a(364), auj);
    const g = await appel('etablissement', 'Commerce Démo', il_y_a(364), auj);
    // Seuil large : la suite complète tourne en parallèle sur PGlite (≈0,2 s seul).
    expect(Date.now() - debut).toBeLessThan(60000);
    expect(kpi(r, 'tickets').valeur).toBeGreaterThanOrEqual(1500);
    expect(r.graphiques[0].titre).toBe('Chiffre d’affaires par mois');
    expect(g.tendance.points.length).toBeGreaterThanOrEqual(12);
    // Données sur toute l'année : la comparaison 30 jours est permise.
    const m = await appel('commerce', 'Commerce Démo');
    expect(m.periode.comparable).toBe(true);
    expect(kpi(m, 'chiffre_affaires').precedent).toBeGreaterThan(0);
  }, 300000);
});

describe('Super Admin : pilotage de la plateforme', () => {
  test('usage, modules et essais pour l’équipe éditeur ; refusé aux clients', async () => {
    comme('editeur@demo.local');
    const p = await api.rpc('editeur_pilotage');
    expect(p.encaissements_suivis).toBe(false);
    expect(p.usage.etablissements_actifs_7j).toBeGreaterThan(0);
    expect(p.modules.length).toBeGreaterThan(0);
    expect(p.modules.every((m) => m.etablissements > 0)).toBe(true);
    expect(Array.isArray(p.essais) && Array.isArray(p.inactifs)).toBe(true);
    comme('gerante@demo.agence-elite.fr');
    await expect(api.rpc('editeur_pilotage')).rejects.toThrow(/réservée/);
  });
});

// Audit The Dream (2026-10-21) : un bar de nuit, des services qui passent minuit.
describe('cockpit commerce : jour d’exploitation, comparaison juste, statistiques du bar', () => {
  let etab;
  let gerante;
  let tz;
  const local = (texte) => `(timestamp '${texte}' at time zone '${tz}')`;
  const vente = async (numero, quand, total, session = null, extra = {}) => {
    await db.query(`insert into public.ventes (etablissement_id, numero, statut, sous_total, remise, total, montant_paye, statut_paiement, hub_id, cree_le, origine, vendeur, session_caisse_id, servi_par)
      values ($1, $2, 'validee', $3, 0, $3, $4, $5, (select id from public.hubs where etablissement_id = $1 and principal), ${local(quand)}, 'caisse', $6, $7, $8)`,
    [etab, numero, total, extra.paye ?? total, (extra.paye ?? total) < total ? 'partielle' : 'payee', gerante, session, extra.serveur ?? null]);
  };

  beforeAll(async () => {
    etab = etabs['Commerce Démo'];
    gerante = comptes['gerante@demo.agence-elite.fr'];
    tz = (await db.query('select fuseau from public.etablissements where id = $1', [etab])).rows[0].fuseau;
    const pdv = (await db.query('select id, hub_id from public.points_de_vente where etablissement_id = $1 order by nom limit 1', [etab])).rows[0];
    // Service du vendredi 14/03/2025 : ouvert à 20 h, fermé le samedi à 6 h, une vente à 1 h 30 ; une vente sans caisse le samedi.
    const s = (await db.query(`insert into public.sessions_caisse (etablissement_id, point_de_vente_id, hub_id, statut, fond_initial, ouverte_par, ouverte_le, cloturee_le)
      values ($1, $2, $3, 'cloturee', 0, $4, ${local('2025-03-14 20:00')}, ${local('2025-03-15 06:00')}) returning id`, [etab, pdv.id, pdv.hub_id, gerante])).rows[0].id;
    await vente('NUIT-1', '2025-03-14 22:00', 10000, s, { serveur: 'Kevin' });
    await vente('NUIT-2', '2025-03-15 01:30', 5000, s, { serveur: 'Kevin', paye: 2000 });
    await vente('JOUR-1', '2025-03-15 14:00', 7000);
    // Vendredi précédent (07/03), sans caisse : 3 ventes pour une comparaison permise.
    for (const [i, h] of ['21:00', '23:00', '23:30'].entries()) await vente(`AVANT-${i}`, `2025-03-07 ${h}`, 4000);
  });

  test('une vente après minuit compte pour le jour d’ouverture de la caisse (TD-001)', async () => {
    comme('gerante@demo.agence-elite.fr');
    const vendredi = await appel('commerce', 'Commerce Démo', '2025-03-14', '2025-03-14');
    expect(kpi(vendredi, 'chiffre_affaires').valeur).toBe(15000);
    expect(kpi(await appel('commerce', 'Commerce Démo', '2025-03-15', '2025-03-15'), 'chiffre_affaires').valeur).toBe(7000);
    // Même total que le tableau des caissières pour ce jour.
    const caissieres = await api.rpc('activite_caissiers', { p_etablissement_id: etab, p_du: '2025-03-14', p_au: '2025-03-14' });
    expect(caissieres.reduce((s, p) => s + Number(p.total_ventes), 0)).toBe(15000);
  });

  test('un jour se compare au même jour de la semaine d’avant (TD-011)', async () => {
    comme('gerante@demo.agence-elite.fr');
    const r = await appel('commerce', 'Commerce Démo', '2025-03-14', '2025-03-14');
    expect(r.periode.du_precedent).toBe('2025-03-07');
    expect(kpi(r, 'chiffre_affaires').precedent).toBe(12000);
    expect(kpi(r, 'chiffre_affaires').comparaison).toBe('vs même jour, semaine d’avant');
    expect(variation(kpi(r, 'chiffre_affaires'))).toEqual({ pourcent: 25, favorable: true });
  });

  test('heures de pointe dans l’ordre de la nuit, serveurs, ardoises et reste « toutes dates »', async () => {
    comme('gerante@demo.agence-elite.fr');
    const r = await appel('commerce', 'Commerce Démo', '2025-03-14', '2025-03-14');
    const heures = r.graphiques.find((g) => g.cle === 'ventes_heure');
    expect(heures.points.map((p) => p.libelle)).toEqual(['22 h', '23 h', '0 h', '1 h']);
    expect(heures.points.map((p) => p.valeur)).toEqual([10000, 0, 0, 5000]);
    const serveurs = r.listes.find((l) => l.cle === 'par_serveur');
    expect(serveurs.lignes[0]).toMatchObject({ libelle: 'Kevin', valeur: 15000 });
    expect(serveurs.lignes[0].detail).toMatch(/2 vente\(s\) · panier 7 500 FCFA/);
    expect(kpi(r, 'credits').libelle).toBe('Reste à encaisser (toutes dates)');
    expect(r.listes.find((l) => l.cle === 'ardoises').lignes.some((l) => l.libelle === 'Plus de 7 jours')).toBe(true);
    expect(r.periode.regle_jour).toMatch(/jour où la caisse a été ouverte/);
  });

  test('sur 7 jours : grille jour × heure ; sans prix d’achat, pas de marge inventée (TD-015)', async () => {
    comme('gerante@demo.agence-elite.fr');
    const r = await appel('commerce', 'Commerce Démo', '2025-03-10', '2025-03-16');
    const grille = r.graphiques.find((g) => g.cle === 'jour_heure');
    expect(grille.type).toBe('grille');
    expect(grille.points.find((p) => p.ligne === 4 && p.colonne === '1 h').valeur).toBe(5000);
    // Ces ventes n'ont aucune ligne d'article : ni marge, ni alerte.
    expect(kpi(r, 'marge_brute')).toBeUndefined();
  });

  test('montants lisibles dans les textes (TD-002)', async () => {
    const r = (await db.query(`select public.cockpit_montant_texte(-78500, 'XAF') a, public.cockpit_montant_texte(1250000, 'EUR') b, public.cockpit_montant_texte(0, null) c`)).rows[0];
    expect(r).toEqual({ a: '-78 500 FCFA', b: '1 250 000 EUR', c: '0 FCFA' });
  });
});
