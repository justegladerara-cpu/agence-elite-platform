import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { creerBase } from './helpers/db.js';
import {
  accueilDejaVu, caisseLaPlusRecente, compteARebours, delaiReponse, delaiVerrouillage, etatPresence, heureOuverture,
  noterAccueilVu, oublierAccueil, prenomCaisse, resteAvantDeconnexion,
} from '../src/modules/caisse/verrouCaisse.js';

// « Tu continues ? » à la connexion et « Tu es toujours là ? » après le délai sans activité (migration 20261012000130).
const MIN = 60000;

describe('réglages', () => {
  test('15 min sans activité puis 5 min pour répondre par défaut ; 0 = jamais / déconnexion directe', () => {
    expect(delaiVerrouillage(null)).toBe(15);
    expect(delaiReponse(null)).toBe(5);
    expect(delaiReponse({ delai_reponse_presence: '' })).toBe(5);
    expect(delaiReponse({ delai_reponse_presence: 15 })).toBe(15);
    expect(delaiReponse({ delai_reponse_presence: 0 })).toBe(0);
    expect(delaiReponse({ delai_reponse_presence: 'abc' })).toBe(0);
  });
});

describe('états : actif, question, déconnexion', () => {
  const t0 = 1_000_000;
  test('actif avant le délai, question pendant le temps de réponse, puis déconnexion', () => {
    expect(etatPresence(t0, t0 + 14.9 * MIN, 15, 5)).toBe('actif');
    expect(etatPresence(t0, t0 + 15 * MIN, 15, 5)).toBe('question');
    expect(etatPresence(t0, t0 + 19.9 * MIN, 15, 5)).toBe('question');
    expect(etatPresence(t0, t0 + 20 * MIN, 15, 5)).toBe('deconnecter');
  });
  test('verrouillage désactivé : toujours actif ; temps de réponse 0 : déconnexion sans question', () => {
    expect(etatPresence(t0, t0 + 999 * MIN, 0, 5)).toBe('actif');
    expect(etatPresence(t0, t0 + 15 * MIN, 15, 0)).toBe('deconnecter');
  });
  test('onglet endormi longtemps : déconnexion directe au réveil', () => {
    expect(etatPresence(t0, t0 + 3 * 60 * MIN, 15, 15)).toBe('deconnecter');
  });
});

describe('compte à rebours', () => {
  const t0 = 1_000_000;
  test('calculé depuis la dernière activité, pas en décrémentant un compteur', () => {
    expect(resteAvantDeconnexion(t0, t0 + 15 * MIN, 15, 15)).toBe(15 * MIN);
    expect(compteARebours(resteAvantDeconnexion(t0, t0 + 15 * MIN + 1000, 15, 15))).toBe('14:59');
    // 7 minutes en arrière-plan sans aucun tic : le compte est quand même juste.
    expect(compteARebours(resteAvantDeconnexion(t0, t0 + 22 * MIN, 15, 15))).toBe('8:00');
    expect(resteAvantDeconnexion(t0, t0 + 99 * MIN, 15, 15)).toBe(0);
  });
  test('format minutes:secondes, arrondi à la seconde supérieure', () => {
    expect(compteARebours(5 * MIN)).toBe('5:00');
    expect(compteARebours(4 * MIN + 59_001)).toBe('5:00');
    expect(compteARebours(1)).toBe('0:01');
    expect(compteARebours(0)).toBe('0:00');
    expect(compteARebours(-5)).toBe('0:00');
  });
});

describe('textes du pop-up', () => {
  test('prénom : premier mot du nom, sinon début de l’e-mail', () => {
    expect(prenomCaisse({ nom: 'Awa Mabiala', email: 'a@x.test' })).toBe('Awa');
    expect(prenomCaisse({ nom: '  ', email: 'binta.k@x.test' })).toBe('binta.k');
    expect(prenomCaisse(null)).toBe('');
  });
  test('heure d’ouverture : aujourd’hui, hier ou date', () => {
    const maintenant = new Date(2026, 9, 12, 20, 0);
    expect(heureOuverture(new Date(2026, 9, 12, 18, 5).toISOString(), maintenant)).toBe('18 h 05');
    expect(heureOuverture(new Date(2026, 9, 11, 23, 40).toISOString(), maintenant)).toBe('hier à 23 h 40');
    expect(heureOuverture(new Date(2026, 9, 9, 8, 0).toISOString(), maintenant)).toBe('le 09/10 à 8 h 00');
  });
  test('plusieurs caisses ouvertes : la plus récente', () => {
    expect(caisseLaPlusRecente([{ id: 'a', ouverte_le: '2026-10-11T08:00:00Z' }, { id: 'b', ouverte_le: '2026-10-12T08:00:00Z' }]).id).toBe('b');
    expect(caisseLaPlusRecente([])).toBeNull();
  });
});

describe('une seule fois par connexion', () => {
  test('noté pour ce compte, oublié à la déconnexion', () => {
    const m = new Map();
    const stockage = { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) };
    expect(accueilDejaVu(stockage, 'u1')).toBe(false);
    noterAccueilVu(stockage, 'u1');
    expect(accueilDejaVu(stockage, 'u1')).toBe(true);
    expect(accueilDejaVu(stockage, 'u2')).toBe(false);
    oublierAccueil(stockage);
    expect(accueilDejaVu(stockage, 'u1')).toBe(false);
    expect(accueilDejaVu(null, 'u1')).toBe(false);
  });
});

describe('réglage en base', () => {
  let db;
  beforeAll(async () => { db = await creerBase(); });
  afterAll(async () => db.close());
  test('« delai_reponse_presence » déclaré dans le module Clôture, 5 minutes par défaut', async () => {
    const schema = (await db.query("select parametres_schema from modules where id = 'cloture'")).rows[0].parametres_schema;
    expect(schema.find((d) => d.cle === 'delai_reponse_presence').defaut).toBe(5);
    expect(schema.filter((d) => d.cle === 'delai_reponse_presence')).toHaveLength(1);
  });
});
