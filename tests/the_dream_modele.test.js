import { describe, expect, it } from 'vitest';
import { avecZoom, articlesAStock, clientsQuiReviennent, contenuPanier, dureeEnMots, partsArgent, routeZoom, trancheFrequente, tranchesPaniers, ZOOM_PAR_ALERTE } from '../src/modules/tableau_de_bord/zoom.js';
import { regrouper } from '../src/modules/ventes/regroupement.js';
import { minutesVerification, toujoursToiNecessaire } from '../src/modules/caisse/ToujoursToi.jsx';
import { ajouter, liensReseaux, nouveauBloc } from '../src/modules/caisse/pageQr.js';
import { nomLieu } from '../src/noyau/lieux.js';

describe('pages d’analyse du tableau de bord', () => {
  it('une carte connue ouvre sa page, les autres gardent leur lien', () => {
    expect(avecZoom({ cle: 'chiffre_affaires', route: 'ventes' }, '2026-10-24', '2026-10-24').route).toBe('tableau-de-bord/zoom/chiffre?du=2026-10-24&au=2026-10-24');
    expect(avecZoom({ cle: 'marge_brute', route: 'ventes' }, '2026-10-24').route).toBe('ventes');
    expect(avecZoom({ cle: 'ruptures', route: 'stock?etat=epuise' }, null, null, ZOOM_PAR_ALERTE).route).toBe('tableau-de-bord/zoom/ruptures');
    expect(routeZoom('paniers', '2026-10-01', '2026-10-07')).toBe('tableau-de-bord/zoom/paniers?du=2026-10-01&au=2026-10-07');
  });
  it('range les paniers par tranche de prix', () => {
    const t = tranchesPaniers([{ total: 1500 }, { total: 6000 }, { total: 7000 }, { total: 60000 }]);
    expect(t.find((x) => x.de === 5000).nombre).toBe(2);
    expect(trancheFrequente(t).libelle).toBe('5 000 à 10 000');
  });
  it('trouve les clients qui reviennent', () => {
    const v = [{ contact_id: 'a', total: 1000, cree_le: '2026-10-01T20:00' }, { contact_id: 'a', total: 3000, cree_le: '2026-10-02T20:00' }, { contact_id: 'b', total: 500, cree_le: '2026-10-01' }, { total: 900 }];
    expect(clientsQuiReviennent(v, () => 'Destin')).toEqual([{ id: 'a', nom: 'Destin', visites: 2, total: 4000, jours: 2 }]);
  });
  it('écrit le contenu d’un panier en une ligne', () => {
    expect(contenuPanier([{ quantite: 2, libelle: 'Primus' }, { quantite: 1, libelle: 'Ngok' }])).toBe('2 × Primus, 1 × Ngok');
    expect(contenuPanier([1, 2, 3, 4, 5].map((i) => ({ quantite: 1, libelle: `A${i}` })))).toBe('1 × A1, 1 × A2, 1 × A3 et 2 autre(s)');
  });
  it('explique vendu / reçu / pas payé / maison', () => {
    const p = partsArgent({ vendu: 10000, encaisse: 7000, attente: 2000, maison: 1000 });
    expect(p.map((x) => x.part)).toEqual([70, 20, 10]);
  });
  it('dit les durées en mots simples', () => {
    expect(dureeEnMots(45)).toBe('45 min');
    expect(dureeEnMots(125)).toBe('2 h 05');
    expect(dureeEnMots(180)).toBe('3 h');
  });
  it('trouve les articles épuisés et sous le minimum (articles suivis seulement)', () => {
    const articles = [{ id: 1, nom: 'Primus', suivi_stock: true, stock_minimum: 10 }, { id: 2, nom: 'Ngok', suivi_stock: true, stock_minimum: 10 }, { id: 3, nom: 'Plat', suivi_stock: false }];
    const stock = [{ article_id: 1, quantite: 0 }, { article_id: 2, quantite: 4 }, { article_id: 3, quantite: 0 }];
    expect(articlesAStock(articles, stock, 'ruptures').map((a) => a.id)).toEqual([1]);
    expect(articlesAStock(articles, stock, 'bas').map((a) => a.id)).toEqual([2]);
  });
});

describe('ventes rangées', () => {
  const ventes = [
    { vendeur: 'u1', servi_par: 'Grâce', total: 5000, cree_le: '2026-10-23T22:10:00' },
    { vendeur: 'u1', servi_par: 'Grâce', total: 3000, cree_le: '2026-10-23T23:10:00' },
    { vendeur: 'u2', servi_par: 'Mira', total: 9000, cree_le: '2026-10-24T02:10:00' },
  ];
  it('par caissière, du plus gros au plus petit', () => {
    expect(regrouper(ventes, 'personne', { nomPersonne: (id) => ({ u1: 'Prisca', u2: 'Junior' })[id] }).map((g) => [g.libelle, g.total])).toEqual([['Prisca', 8000], ['Junior', 9000]].sort((a, b) => b[1] - a[1]));
  });
  it('par serveur', () => {
    expect(regrouper(ventes, 'serveur')[0]).toMatchObject({ libelle: 'Mira', total: 9000 });
  });
  it('par heure, dans l’ordre de la soirée (la nuit après le soir)', () => {
    expect(regrouper(ventes, 'heure').map((g) => g.cle)).toEqual(['22', '23', '2']);
  });
});

describe('« Est-ce toujours toi ? »', () => {
  const maintenant = new Date('2026-10-24T03:00:00').getTime();
  it('demande après 45 minutes sans vente par défaut', () => {
    expect(minutesVerification({})).toBe(45);
    expect(toujoursToiNecessaire('2026-10-24T02:00:00', 45, maintenant)).toBe(true);
    expect(toujoursToiNecessaire('2026-10-24T02:30:00', 45, maintenant)).toBe(false);
  });
  it('0 = ne jamais demander', () => {
    expect(minutesVerification({ caisse: { verifier_caissiere_minutes: 0 } })).toBe(0);
    expect(toujoursToiNecessaire('2026-10-23T02:00:00', 0, maintenant)).toBe(false);
  });
});

describe('page mobile du QR code : réseaux et Wi-Fi', () => {
  it('ajoute les nouveaux blocs', () => {
    expect(ajouter([], 'wifi')[0]).toMatchObject({ type: 'wifi', reseau: '' });
    expect(nouveauBloc('reseaux').type).toBe('reseaux');
  });
  it('ne montre que les réseaux bien remplis', () => {
    const l = liensReseaux({ instagram: 'https://instagram.com/thedream', facebook: 'facebook.com/x', whatsapp: '+242 06 909 46 11' });
    expect(l.map((x) => x.cle)).toEqual(['instagram', 'whatsapp']);
    expect(l[1].lien).toContain('242069094611');
  });
});

describe('mots simples', () => {
  it('« Hub principal » devient « Lieu principal »', () => {
    expect(nomLieu('Hub principal')).toBe('Lieu principal');
    expect(nomLieu('Terrasse')).toBe('Terrasse');
  });
});
