import { describe, expect, test } from 'vitest';
import { aFaire, boutonsAccessibles, chercherIntention, GROS_BOUTONS, lienWhatsapp, texteBilanDuJour } from '../src/modules/accueil/accueil.js';
import { filtrerModeSimple } from '../src/noyau/modeSimple.js';
import { AIDES } from '../src/noyau/aides.js';
import { PAGES } from '../src/modules/index.js';

const pages = (...ids) => ids.map((id) => ({ id, libelle: id, groupe: 'Vente', icone: 'plus' }));

describe('Accueil en gros boutons', () => {
  test('chaque gros bouton mène à un écran déclaré', () => {
    const ids = new Set(PAGES.map((p) => p.id));
    for (const b of GROS_BOUTONS) expect(ids.has(b.route.split(/[/?]/)[0]), b.id).toBe(true);
  });

  test('un caissier ne voit que ce qu’il peut faire', () => {
    const peut = (p) => ['caisse.utiliser', 'tableau_de_bord.lire'].includes(p);
    const ids = boutonsAccessibles(pages('caisse', 'tableau-de-bord', 'stock'), peut).map((b) => b.id);
    expect(ids).toEqual(['vendre', 'chiffres']);
  });

  test('le gérant voit « J’ai reçu », « Je compte », « J’ai payé une dépense »', () => {
    const ids = boutonsAccessibles(pages('stock', 'depenses', 'clotures'), () => true).map((b) => b.id);
    expect(ids).toEqual(['recu', 'compter', 'perte', 'depense', 'fermer']);
  });

  test('barre « Je veux… » : mots simples, sans accents', () => {
    const boutons = boutonsAccessibles(pages('stock', 'depenses', 'caisse'), () => true);
    expect(chercherIntention('depense', { boutons })[0].route).toBe('depenses?nouveau=1');
    expect(chercherIntention('arrivage', { boutons })[0].route).toBe('stock?vue=reception');
    expect(chercherIntention('', { boutons })).toEqual([]);
  });

  test('« À faire aujourd’hui » liste les vrais points à régler', () => {
    const liste = aFaire({
      tdb: { stock_bas: [{ nom: 'Riz' }, { nom: 'Huile' }], creances: 5000 },
      caissesAnciennes: 1, facturesEnRetard: 2, peremptions: [{ id: 'x' }], devise: 'XAF',
    });
    expect(liste.map((l) => l.id)).toEqual(['caisse', 'stock', 'peremption', 'creances', 'factures']);
    expect(liste[1].texte).toContain('Riz, Huile');
    expect(aFaire({ tdb: { stock_bas: [], creances: 0 } })).toEqual([]);
  });

  test('bilan du jour WhatsApp : ventes, dépenses, bénéfice estimé, à commander', () => {
    const texte = texteBilanDuJour({
      nom: 'Épicerie Test', date: '11/10/2026', devise: 'XAF',
      tdb: { chiffre_affaires: 50000, nombre_ventes: 12, encaissements: 45000, depenses: 5000, marge_brute: 15000, top_articles: [{ libelle: 'Poulet' }], stock_bas: [{ nom: 'Riz' }] },
    });
    expect(texte).toContain('Épicerie Test');
    expect(texte).toContain('12 vente(s)');
    expect(texte).toMatch(/Bénéfice estimé : 10[\s  ]000/);
    expect(texte).toContain('À commander : Riz');
    expect(lienWhatsapp('a b', '+242 06 00')).toBe('https://wa.me/2420600?text=a%20b');
    expect(lienWhatsapp('x')).toBe('https://wa.me/?text=x');
  });
});

describe('Mode simple et bulles d’aide', () => {
  test('le mode simple garde l’essentiel, jamais un menu vide', () => {
    const menu = pages('accueil', 'caisse', 'rh', 'stock', 'comptabilite');
    expect(filtrerModeSimple(menu, true).map((p) => p.id)).toEqual(['accueil', 'caisse', 'stock']);
    expect(filtrerModeSimple(menu, false)).toHaveLength(5);
    expect(filtrerModeSimple(pages('rh'), true).map((p) => p.id)).toEqual(['rh']);
  });

  test('chaque bulle d’aide correspond à un écran déclaré', () => {
    const ids = new Set(PAGES.map((p) => p.id));
    const inconnues = Object.keys(AIDES).filter((id) => !ids.has(id) && !['qui-me-doit', 'a-qui-je-dois'].includes(id));
    expect(inconnues).toEqual([]);
  });
});
