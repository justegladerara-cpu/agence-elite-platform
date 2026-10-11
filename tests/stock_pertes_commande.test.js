import { describe, expect, test } from 'vitest';
import { etatPeremption, lireVueStock, RAISONS_RETRAIT, valeurPerte } from '../src/modules/stock/pertes.js';
import { derniersFournisseurs, grouperParFournisseur, lienCommandeWhatsApp, quantiteSuggeree, texteCommandeWhatsApp } from '../src/modules/achats/commandeWhatsApp.js';
import { hausseCoutAchat } from '../src/modules/achats/commun.js';

// Règles pures : pertes, dates de péremption, liens profonds du Stock, commande WhatsApp, hausse du prix d'achat.
describe('pertes et péremptions', () => {
  test('badge : périmé, aujourd’hui, demain, dans N jours', () => {
    expect(etatPeremption(-2)).toEqual({ libelle: 'Périmé', ton: 'rouge' });
    expect(etatPeremption(0).libelle).toBe('Périme aujourd’hui');
    expect(etatPeremption(1).libelle).toBe('Demain');
    expect(etatPeremption(5)).toEqual({ libelle: 'Dans 5 jours', ton: 'bleu' });
  });

  test('valeur de la perte au prix d’achat, seulement si le coût est connu', () => {
    expect(valeurPerte(3, 250)).toBe(750);
    expect(valeurPerte('1.5', '1000')).toBe(1500);
    expect(valeurPerte(3, null)).toBeNull();
    expect(valeurPerte(3, 0)).toBeNull();
    expect(valeurPerte('', 100)).toBeNull();
  });

  test('raisons proposées et liens profonds ?vue=', () => {
    expect(RAISONS_RETRAIT).toEqual(['Cassé', 'Périmé', 'Perdu', 'Volé', 'Consommé']);
    expect(lireVueStock('reception')).toEqual({ onglet: 'niveaux', action: 'reception' });
    expect(lireVueStock('perte')).toEqual({ onglet: 'niveaux', action: 'choix_perte' });
    expect(lireVueStock('inventaire')).toEqual({ onglet: 'inventaires', action: 'comptage' });
    expect(lireVueStock('peremptions')).toEqual({ onglet: 'peremptions', action: null });
    expect(lireVueStock('nimporte')).toEqual({ onglet: 'niveaux', action: null });
    expect(lireVueStock(null)).toEqual({ onglet: 'niveaux', action: null });
  });
});

describe('je dois commander : WhatsApp au fournisseur', () => {
  const suggestions = [
    { article_id: 'a', nom: 'Riz 5 kg', minimum: 10, stock: 4, en_commande: 0 },
    { article_id: 'b', nom: 'Huile 1 L', reference: 'HUI-1', minimum: 6, stock: 5, en_commande: 6 },
    { article_id: 'c', nom: 'Sucre', minimum: 2, stock: 0, en_commande: 0 },
  ];

  test('quantité proposée : double du minimum moins stock et commandes, 1 au moins', () => {
    expect(suggestions.map(quantiteSuggeree)).toEqual([16, 1, 4]);
  });

  test('dernier fournisseur par article, sans les demandes ni les commandes annulées', () => {
    const commandes = [
      { id: 'c1', fournisseur_id: 'f1', statut: 'recue', date_commande: '2026-09-01' },
      { id: 'c2', fournisseur_id: 'f2', statut: 'recue', date_commande: '2026-10-01' },
      { id: 'c3', fournisseur_id: 'f3', statut: 'annulee', date_commande: '2026-10-05' },
      { id: 'c4', fournisseur_id: null, statut: 'demande', date_commande: '2026-10-06' },
    ];
    const lignes = [
      { article_id: 'a', commande_id: 'c1' }, { article_id: 'a', commande_id: 'c2' }, { article_id: 'a', commande_id: 'c3' },
      { article_id: 'b', commande_id: 'c1' }, { article_id: 'c', commande_id: 'c4' },
    ];
    const de = derniersFournisseurs(lignes, commandes);
    expect(de).toEqual({ a: 'f2', b: 'f1' });
    const groupes = grouperParFournisseur(suggestions, de);
    expect(groupes.map((g) => [g.fournisseur_id, g.liste.map((s) => s.article_id)])).toEqual([['f2', ['a']], ['f1', ['b']], [null, ['c']]]);
  });

  test('texte poli avec les articles et quantités ; lien wa.me encodé', () => {
    const texte = texteCommandeWhatsApp({
      fournisseur: 'Grossiste Démo', etablissement: 'Commerce Démo', hub: null,
      lignes: [{ nom: 'Riz 5 kg', quantite: 16 }, { nom: 'Huile 1 L', reference: 'HUI-1', quantite: 1.5, unite: 'L' }],
    });
    expect(texte).toBe([
      'Bonjour Grossiste Démo,', '', 'Nous souhaitons vous commander :', '- Riz 5 kg : 16', '- Huile 1 L (HUI-1) : 1,5 L', '',
      'Merci de nous confirmer la disponibilité, le prix et la date de livraison.', 'Bonne journée,', 'Commerce Démo',
    ].join('\n'));
    expect(texteCommandeWhatsApp({ lignes: [{ nom: 'Sucre', quantite: 4 }], hub: 'Dépôt' })).toMatch(/^Bonjour,\n\nNous souhaitons vous commander pour Dépôt :\n- Sucre : 4/);
    expect(lienCommandeWhatsApp('+242 06 000 00 00', 'a b')).toBe('https://wa.me/242060000000?text=a%20b');
    expect(lienCommandeWhatsApp('00242 06 000 00 00', 'x')).toBe('https://wa.me/242060000000?text=x');
    expect(lienCommandeWhatsApp(null, 'x')).toBe('https://wa.me/?text=x');
  });
});

describe('prix d’achat en hausse à la réception', () => {
  test('marge actuelle → nouvelle marge, seulement si le coût augmente', () => {
    expect(hausseCoutAchat(1000, 600, '700')).toEqual({ margeAvant: 40, margeApres: 30 });
    expect(hausseCoutAchat(1500, 1000, '1100,5')).toEqual({ margeAvant: 33.3, margeApres: 26.6 });
    expect(hausseCoutAchat(1000, 600, '600')).toBeNull();
    expect(hausseCoutAchat(1000, 600, '500')).toBeNull();
    expect(hausseCoutAchat(1000, null, '700')).toBeNull();
    expect(hausseCoutAchat(0, 600, '700')).toBeNull();
    expect(hausseCoutAchat(1000, 600, '')).toBeNull();
  });
});
