import { describe, expect, test } from 'vitest';
import { envoyerAvecReprise, estErreurReseau } from '../src/noyau/envoi.js';
import { ajusterZone, rectangleSortie, ZONE_ENTIERE } from '../src/ui/Recadrage.jsx';

// Lot G2 : recadrage d'une photo (calculs de la zone) et envoi qui reprend après une coupure de réseau.
const coupure = () => new TypeError('Failed to fetch');
const rapide = { delais: [0] };

describe('recadrage', () => {
  test('les coins se déplacent sans sortir de la photo ni inverser la zone', () => {
    expect(ajusterZone(ZONE_ENTIERE, 'hg', 0.1, 0.2)).toEqual({ x: 0.1, y: 0.2, l: 0.9, h: 0.8 });
    expect(ajusterZone(ZONE_ENTIERE, 'hg', -0.5, -0.5)).toEqual(ZONE_ENTIERE);
    const z = ajusterZone(ZONE_ENTIERE, 'bd', -0.99, -0.99);
    expect(z.l).toBeCloseTo(0.08);
    expect(z.h).toBeCloseTo(0.08);
    const d = ajusterZone({ x: 0.2, y: 0.2, l: 0.5, h: 0.5 }, 'hd', 0.1, -0.1);
    expect(d.x).toBeCloseTo(0.2);
    expect(d.y).toBeCloseTo(0.1);
    expect(d.l).toBeCloseTo(0.6);
    expect(d.h).toBeCloseTo(0.6);
  });

  test('la zone entière se déplace dans la photo sans changer de taille', () => {
    const z = ajusterZone({ x: 0.2, y: 0.2, l: 0.5, h: 0.5 }, 'centre', 0.9, -0.9);
    expect(z).toEqual({ x: 0.5, y: 0, l: 0.5, h: 0.5 });
  });

  test('l’image gardée est réduite : son plus grand côté ne dépasse pas la taille demandée', () => {
    expect(rectangleSortie({ x: 0.25, y: 0.5, l: 0.5, h: 0.5 }, 4000, 3000, 1000)).toEqual({ sx: 1000, sy: 1500, sl: 2000, sh: 1500, l: 1000, h: 750 });
    expect(rectangleSortie(ZONE_ENTIERE, 800, 600, 1000)).toMatchObject({ l: 800, h: 600 });
  });
});

describe('envoi avec reprise', () => {
  test('reconnaît une coupure de réseau, pas une erreur de la base', () => {
    expect(estErreurReseau(coupure())).toBe(true);
    expect(estErreurReseau(new Error('TypeError: NetworkError when attempting to fetch resource.'))).toBe(true);
    expect(estErreurReseau(new Error('Fichier trop lourd : 3 Mo au plus'))).toBe(false);
  });

  test('renvoie tout seul après une coupure et prévient de chaque nouvel essai', async () => {
    let appels = 0;
    const essais = [];
    const r = await envoyerAvecReprise(async () => {
      appels += 1;
      if (appels < 3) throw coupure();
      return 'ok';
    }, { ...rapide, surAttente: (e, t) => essais.push(`${e}/${t}`) });
    expect(r).toBe('ok');
    expect(appels).toBe(3);
    expect(essais).toEqual(['2/4', '3/4']);
  });

  test('pas de doublon : si le serveur a déjà reçu l’envoi, on ne le renvoie pas', async () => {
    let appels = 0;
    const r = await envoyerAvecReprise(async () => { appels += 1; throw coupure(); }, { ...rapide, dejaRecu: async () => true });
    expect(r).toEqual({ dejaRecu: true });
    expect(appels).toBe(1);
  });

  test('une erreur de la base n’est jamais renvoyée ; après 4 essais on abandonne avec un message clair', async () => {
    let appels = 0;
    await expect(envoyerAvecReprise(async () => { appels += 1; throw new Error('Type de fichier refusé'); }, rapide)).rejects.toThrow('Type de fichier refusé');
    expect(appels).toBe(1);
    appels = 0;
    await expect(envoyerAvecReprise(async () => { appels += 1; throw coupure(); }, rapide)).rejects.toThrow(/Connexion perdue/);
    expect(appels).toBe(4);
  });

  test('annulable pendant l’attente', async () => {
    const controle = new AbortController();
    const envoi = envoyerAvecReprise(async () => { throw coupure(); }, { delais: [60000], signal: controle.signal });
    controle.abort();
    await expect(envoi).rejects.toThrow('Envoi annulé');
  });
});
