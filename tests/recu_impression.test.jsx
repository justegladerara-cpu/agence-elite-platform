// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { preparerPageTicket } from '../src/modules/recus/Recu.jsx';

// Impression du ticket : feuille à la taille du rouleau, sans marge (pas de date ni de titre du navigateur).
describe('preparerPageTicket', () => {
  it('pose une feuille 80 mm sans marge et la remplace à chaque impression', () => {
    document.body.innerHTML = '<div class="zone-impression"><div class="ticket ticket-80">Reçu</div></div>';
    const r = preparerPageTicket();
    expect(r.largeur).toBe(80);
    preparerPageTicket();
    const styles = document.querySelectorAll('#page-ticket');
    expect(styles).toHaveLength(1);
    expect(styles[0].textContent).toMatch(/size: 80mm \d+mm; margin: 0;/);
    expect(document.querySelector('.zone-impression').getAttribute('style')).toBeNull();
  });

  it('suit le rouleau 58 mm et ne fait rien sans ticket', () => {
    document.body.innerHTML = '<div class="zone-impression"><div class="ticket ticket-58">Reçu</div></div>';
    expect(preparerPageTicket().largeur).toBe(58);
    document.body.innerHTML = '';
    expect(preparerPageTicket()).toBeNull();
    expect(document.getElementById('page-ticket')).toBeNull();
  });
});

describe('insecables', async () => {
  const { insecables } = await import('../src/modules/recus/Recu.jsx');
  it('colle la ponctuation haute au mot précédent', () => {
    expect(insecables('Démonstration : fictif !')).toBe('Démonstration\u00a0: fictif\u00a0!');
    expect(insecables(null)).toBe('');
  });
});
