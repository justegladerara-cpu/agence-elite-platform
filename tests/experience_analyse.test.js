// @vitest-environment jsdom
// Nouvelle version The Dream : calculs du centre de commande et moyens d'encaissement (fonctions pures).
import { describe, expect, test } from 'vitest';
import {
  analyseServeur, analysesApprofondies, bornesPeriode, carteChaleur, classementCaissiers, classementServeurs, courbeDuJour,
  instantsSoirees, joursRestants, rangHeure, recommandations, recommandationsVisibles, soireeDe, texteVariation, tonVariation,
  totaux, troisSignaux,
} from '../src/modules/experience/analyse.js';
import {
  ajouterBillet, erreurLigne, lireMoyens, moyenDuPaiement, MOYENS_DEFAUT, paiementsPourVente, referencePaiement,
} from '../src/modules/experience/moyens.js';
import { ambianceDe, appliquerAmbiance } from '../src/modules/experience/ambiance.js';

const montant = (n) => `${Math.round(n)} FCFA`;

describe('périodes et soirées', () => {
  test('une vente à 2 h du matin compte dans la soirée de la veille', () => {
    expect(soireeDe('2026-10-25T01:00:00Z', 'Africa/Brazzaville', 8)).toBe('2026-10-24');
    expect(soireeDe('2026-10-25T10:00:00Z', 'Africa/Brazzaville', 8)).toBe('2026-10-25');
    expect(rangHeure(8, 8)).toBe(0);
    expect(rangHeure(2, 8)).toBe(18);
  });
  test('un jour se compare au même jour de la semaine passée, une période à la période d’avant', () => {
    expect(bornesPeriode('aujourdhui', '2026-10-25')).toMatchObject({ du: '2026-10-25', au: '2026-10-25', avantDu: '2026-10-18' });
    expect(bornesPeriode('7j', '2026-10-25')).toMatchObject({ du: '2026-10-19', avantDu: '2026-10-12', avantAu: '2026-10-18' });
    expect(bornesPeriode('mois', '2026-10-25')).toMatchObject({ du: '2026-10-01', longueur: 25 });
  });
  test('textes et tons des variations', () => {
    expect(texteVariation(0.123)).toBe('+12 %');
    expect(texteVariation(-0.5)).toBe('−50 %');
    expect(texteVariation(null)).toBe('pas de comparaison');
    expect(tonVariation(0.02)).toBe('neutre');
    expect(tonVariation(-0.2)).toBe('mauvais');
    expect(tonVariation(-0.2, true)).toBe('bon');
  });
});

const r = {
  du: '2026-10-24', au: '2026-10-25', debut_service: 8,
  heures: [['2026-10-24', 21, 4, 40000], ['2026-10-24', 23, 2, 30000], ['2026-10-25', 22, 3, 30000]],
  produits: [['2026-10-24', 'a1', 10, 50000, 20000], ['2026-10-24', 'a2', 2, 20000, 0], ['2026-10-25', 'a1', 6, 30000, 12000]],
  serveurs: [['2026-10-24', 's1', 4, 50000], ['2026-10-24', null, 2, 20000], ['2026-10-25', 's1', 3, 30000]],
  caissiers: [['2026-10-24', 'u1', 6, 70000], ['2026-10-25', 'u2', 3, 30000]],
  paiements: [['2026-10-24', 'mobile_money', 'MTN', 50000, 3], ['2026-10-24', 'especes', 'ESPECES', 20000, 3]],
  reste_du: [['2026-10-25', 10000]],
  remises: [],
  annulations: [{ id: 'v9', jour: '2026-10-24', total: 5000, vendeur: 'u1', par: 'u1' }],
  personnes: { u1: 'Bénédicte', u2: 'Ornella' },
  serveurs_liste: [{ id: 's1', prenom: 'Merveille', photo_url: null }],
  clotures: [
    { id: 'z1', caissier: 'u1', cloturee_le: '2026-10-25T03:00:00Z', ecart: -2000 },
    { id: 'z2', caissier: 'u1', cloturee_le: '2026-10-25T04:00:00Z', ecart: -1000 },
  ],
  suggestions: [],
  avis: {},
};
const articles = { a1: { id: 'a1', nom: 'Primus', suivi_stock: true, cout_achat: 2000 }, a2: { id: 'a2', nom: 'Chicha', suivi_stock: false, cout_achat: null } };

describe('totaux et classements', () => {
  test('chiffre, tickets, panier et marge connue seulement là où il y a un prix d’achat', () => {
    const t = totaux(r);
    expect(t.ca).toBe(100000);
    expect(t.ventes).toBe(9);
    expect(t.marge).toBe(80000 - 32000);
    expect(t.partCouverte).toBeCloseTo(0.8);
    expect(t.annulations).toBe(1);
    expect(t.resteDu).toBe(10000);
    expect(t.soirees).toBe(2);
  });
  test('serveurs, caissières et écarts répétés', () => {
    const s = classementServeurs(r);
    expect(s[0]).toMatchObject({ prenom: 'Merveille', ca: 80000, nb: 7, soirees: 2 });
    expect(s[1].prenom).toBe('Sans serveur noté');
    const c = classementCaissiers(r);
    expect(c.find((x) => x.id === 'u1')).toMatchObject({ nom: 'Bénédicte', ecartsNegatifs: 2, ecartTotal: -3000, annulations: 1 });
  });
  test('carte de chaleur : moyenne par jour de semaine et heure', () => {
    const ch = carteChaleur(r, 8);
    expect(ch.colonnes).toEqual([13, 14, 15]);
    expect(ch.meilleur.heure).toBe(21);
  });
  test('jours de stock restants', () => {
    expect(joursRestants(10, 20, 4)).toBe(2);
    expect(joursRestants(10, 0, 4)).toBeNull();
  });
});

describe('recommandations', () => {
  test('rupture, écart répété, prix d’achat manquant ; les plus graves d’abord', () => {
    const liste = recommandations({ r, avant: null, articles, stock: { a1: 3 }, montant, objectif: 0, courbe: null, du: r.du, au: r.au });
    const cles = liste.map((x) => x.cle);
    expect(cles).toContain('rupture-a1');
    expect(cles).toContain('ecart-u1');
    expect(cles).toContain('prix-achat-manquants');
    expect(liste[0].ton).toBe('mauvais');
    expect(troisSignaux(liste)).toHaveLength(3);
  });
  test('« Pas pour moi » cache 30 jours, sauf si la situation change beaucoup', () => {
    const liste = [{ cle: 'x', ton: 'mauvais', valeurDepart: 10 }, { cle: 'y', ton: 'bon' }];
    const quand = new Date().toISOString();
    expect(recommandationsVisibles(liste, { x: { avis: 'pas_pour_moi', quand, valeur: 10 } })[0].masquee).toBe(true);
    expect(recommandationsVisibles(liste, { x: { avis: 'pas_pour_moi', quand, valeur: 2 } })[0].masquee).toBe(false);
    expect(recommandationsVisibles(liste, { x: { avis: 'pas_pour_moi', quand: '2026-01-01T00:00:00Z', valeur: 10 } }, Date.parse('2026-10-25'))[0].masquee).toBe(false);
  });
  test('la soirée en cours se compare aux mêmes jours de la semaine', () => {
    const hist = { heures: [['2026-10-18', 21, 2, 20000], ['2026-10-11', 21, 2, 40000], ['2026-10-17', 21, 9, 90000]] };
    const jour = { heures: [['2026-10-25', 21, 3, 45000]] };
    const c = courbeDuJour(hist, jour, '2026-10-25', '2026-10-25T21:30:00Z', 'Africa/Brazzaville', 8);
    expect(c.comparaisons).toBe(2);
    expect(c.habituelle[23]).toBe(30000);
    expect(c.actuel).toBe(45000);
  });
});

describe('moyens d’encaissement', () => {
  test('réglage absent ou abîmé : les moyens par défaut', () => {
    expect(lireMoyens({}).map((m) => m.id)).toEqual(MOYENS_DEFAUT.map((m) => m.id));
    expect(lireMoyens({ caisse: { moyens_encaissement: 'n’importe quoi' } })).toHaveLength(MOYENS_DEFAUT.length);
    const libres = lireMoyens({ caisse: { moyens_encaissement: [{ libelle: 'Wave', mode: 'inconnu' }, { id: 'wave', libelle: 'Wave 2' }] } });
    expect(libres.map((m) => m.id)).toEqual(['wave', 'wave-2']);
    expect(libres[0].mode).toBe('mobile_money');
  });
  test('la référence porte l’opérateur et se relit', () => {
    const mtn = MOYENS_DEFAUT[0];
    expect(referencePaiement(mtn, { chiffres: '4821', numero: '06 123' })).toBe('MTN · 4821 · 06 123');
    expect(moyenDuPaiement({ mode: 'mobile_money', reference: 'AIRTEL · 1111' }).id).toBe('airtel');
    expect(moyenDuPaiement({ mode: 'especes', reference: null }).id).toBe('especes');
    expect(erreurLigne({ montant: '5000', chiffres: '12' }, mtn)).toMatch(/4 derniers chiffres/);
    expect(erreurLigne({ montant: '5000', chiffres: '1234' }, mtn)).toBe('');
  });
  test('paiement mixte et billets', () => {
    const p = paiementsPourVente([{ moyen: 'mtn', montant: '10000', chiffres: '4821' }, { moyen: 'especes', montant: '6000' }], MOYENS_DEFAUT);
    expect(p).toEqual([{ mode: 'mobile_money', montant: 10000, reference: 'MTN · 4821' }, { mode: 'especes', montant: 6000, reference: '' }]);
    expect(ajouterBillet(0, 5000, 7500)).toBe(5000);
    expect(ajouterBillet(5000, 5000, 7500)).toBe(10000);
    expect(ajouterBillet(10000, 500, 7500)).toBe(500);
  });
});

describe('ambiance', () => {
  test('noir et or seulement quand la nouvelle version est allumée', () => {
    expect(ambianceDe({})).toBeNull();
    expect(ambianceDe({ etablissement: { nouvelle_version: true } })).toMatchObject({ theme: 'dream', mode: 'nuit' });
    const racine = document.createElement('div');
    appliquerAmbiance({ theme: 'dream', mode: 'jour' }, racine);
    expect(racine.dataset.ambiance).toBe('dream');
    expect(racine.style.getPropertyValue('--fond')).toBe('#FAF7F0');
    appliquerAmbiance(null, racine);
    expect(racine.dataset.ambiance).toBeUndefined();
    expect(racine.style.getPropertyValue('--fond')).toBe('');
  });
});

describe('polices au choix (Apparence)', () => {
  test('nom de police : lettres, chiffres et espaces seulement', async () => {
    const { nomPoliceValide, policesDe, lienPolice, pilePolice } = await import('../src/modules/experience/ambiance.js');
    expect(nomPoliceValide('Roboto Slab')).toBe(true);
    expect(nomPoliceValide('Inter&family=x')).toBe(false);
    expect(nomPoliceValide('')).toBe(false);
    expect(policesDe({ polices: { titre: 'Cinzel', texte: '<script>' } })).toEqual({ titre: 'Cinzel', texte: 'Inter', chiffres: 'Inter' });
    expect(lienPolice('Bebas Neue', true)).toBe('https://fonts.googleapis.com/css2?family=Bebas+Neue&display=swap');
    expect(lienPolice('Système')).toBeNull();
    expect(pilePolice('Système', 'texte')).toMatch(/^system-ui/);
  });

  test('ambiance : polices et taille du texte posées sur la page', async () => {
    const { ambianceDe, appliquerAmbiance } = await import('../src/modules/experience/ambiance.js');
    const racine = document.createElement('div');
    const a = ambianceDe({ etablissement: { nouvelle_version: true, apparence: { polices: { titre: 'Cinzel' }, taille_texte: 'grand' } } });
    appliquerAmbiance(a, racine);
    expect(racine.style.getPropertyValue('--police-titre')).toContain('Cinzel');
    expect(racine.style.getPropertyValue('--texte-base')).toBe('16px');
    appliquerAmbiance(null, racine);
    expect(racine.style.getPropertyValue('--police-titre')).toBe('');
    expect(racine.style.getPropertyValue('--texte-base')).toBe('');
  });
});

describe('fiche serveur et analyses approfondies (The Dream, vues uniques)', () => {
  test('instantsSoirees couvre du début de service au lendemain', () => {
    const { de, a } = instantsSoirees('2026-10-25', '2026-10-25', 'Africa/Brazzaville', 8);
    expect(de).toBe('2026-10-25T07:00:00.000Z');
    expect(a).toBe('2026-10-26T07:00:00.000Z');
  });
  test('analyseServeur résume ventes, articles et annulations', () => {
    const ventes = [
      { id: 'v1', statut: 'validee', total: 12000, cree_le: '2026-10-25T20:00:00Z' },
      { id: 'v2', statut: 'validee', total: 8000, cree_le: '2026-10-25T21:00:00Z' },
      { id: 'v3', statut: 'annulee', total: 5000, cree_le: '2026-10-25T22:00:00Z' },
    ];
    const lignes = [
      { vente_id: 'v1', article_id: 'a1', libelle: 'Primus', quantite: 6, total: 12000, cout_unitaire: 1000 },
      { vente_id: 'v2', article_id: 'a1', libelle: 'Primus', quantite: 4, total: 8000, cout_unitaire: 1000 },
    ];
    const f = analyseServeur({ ventes, lignes, equipe: { ca: 40000, ventes: 5 }, fuseau: 'Africa/Brazzaville', debut: 8 });
    expect(f.ca).toBe(20000);
    expect(f.ventes).toBe(2);
    expect(f.annulees).toBe(1);
    expect(f.articles[0]).toMatchObject({ nom: 'Primus', qte: 10 });
    expect(f.partEquipe).toBeCloseTo(0.5, 2);
    expect(f.analyses.length).toBeGreaterThan(0);
  });
  test('analysesApprofondies tire des phrases des chiffres', () => {
    const a = analysesApprofondies({
      r: { heures: [['2026-10-25', 8, 3, 20000]] },
      t: { ca: 20000, ventes: 3, marge: 12000, tauxMarge: 0.6, partCouverte: 1, annulations: 0, montantAnnule: 0, resteDu: 0, soirees: 1 },
      produits: [{ id: 'a1', nom: 'Primus', qte: 10, ca: 20000, marge: 12000 }],
      serveurs: [], moyens: [{ cle: 'especes', montant: 20000, part: 1 }], montant, debut: 8, du: '2026-10-25', au: '2026-10-25',
    });
    expect(Array.isArray(a)).toBe(true);
    expect(a.some((x) => /espèces/i.test(x.texte))).toBe(true);
  });
});
