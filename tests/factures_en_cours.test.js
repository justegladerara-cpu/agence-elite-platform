import { describe, expect, test } from 'vitest';
import { attenteFacture, totalFactures } from '../src/modules/caisse/facturesEnCours.js';

const il_y_a = (minutes) => new Date(Date.now() - minutes * 60000).toISOString();

describe('factures en cours', () => {
  test('la couleur suit le temps d’attente : vert, orange après 1 h, rouge après 3 h', () => {
    expect(attenteFacture(il_y_a(0)).texte).toBe('à l’instant');
    expect(attenteFacture(il_y_a(25))).toMatchObject({ texte: '25 min', ton: 'vert' });
    expect(attenteFacture(il_y_a(65))).toMatchObject({ texte: '1 h 05', ton: 'orange' });
    expect(attenteFacture(il_y_a(200))).toMatchObject({ texte: '3 h 20', ton: 'rouge' });
  });

  test('le total additionne les montants des factures', () => {
    expect(totalFactures([{ total_estime: '1500' }, { total_estime: 2500 }, {}])).toBe(4000);
  });
});
