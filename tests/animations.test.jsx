// @vitest-environment jsdom
import React from 'react';
import { render } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { ChiffreAnime, lireNombre, texteIntermediaire } from '../src/ui/animations.jsx';

// Chiffres animés des tableaux de bord : le texte final reste exactement celui reçu.
describe('animations des chiffres', () => {
  test('lit le nombre d’un texte formaté', () => {
    expect(lireNombre('12 500 FCFA')).toMatchObject({ valeur: 12500, decimales: 0, avant: '', apres: ' FCFA' });
    expect(lireNombre('87 %')).toMatchObject({ valeur: 87, apres: ' %' });
    expect(lireNombre('3,5 h')).toMatchObject({ valeur: 3.5, decimales: 1 });
    expect(lireNombre('€ 1 234,50')).toMatchObject({ valeur: 1234.5, decimales: 2, avant: '€ ' });
    expect(lireNombre('—')).toBeNull();
    expect(lireNombre(null)).toBeNull();
  });

  test('valeurs intermédiaires dans le même format, puis la valeur exacte', () => {
    const n = lireNombre('12 500 FCFA');
    expect(texteIntermediaire(n, 0)).toBe('0 FCFA');
    expect(texteIntermediaire(n, 0.5)).toBe('6 250 FCFA');
    expect(texteIntermediaire(n, 1)).toBeNull();
  });

  test('sans animation possible, affiche directement la valeur', () => {
    const { container } = render(<ChiffreAnime valeur="12 500 FCFA" />);
    expect(container.textContent).toBe('12 500 FCFA');
    const autre = render(<ChiffreAnime valeur={<em>x</em>} />);
    expect(autre.container.innerHTML).toBe('<em>x</em>');
  });
});
