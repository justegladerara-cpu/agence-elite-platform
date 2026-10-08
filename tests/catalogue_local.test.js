import { expect, test } from 'vitest';
import { verifierUrlLocale } from './helpers/catalogue.js';

test('le catalogue CI accepte uniquement Supabase PostgreSQL local', () => {
  for (const hote of ['127.0.0.1', 'localhost', '[::1]']) {
    const adresse = `postgresql://${hote}:54322/postgres`;
    expect(verifierUrlLocale(adresse)).toBe(adresse);
  }
});

test('une erreur de configuration ne permet pas de joindre une base distante', () => {
  for (const adresse of [
    'postgresql://base-distante.exemple.test:54322/postgres',
    'https://localhost:54322/postgres',
    'postgresql://localhost:5432/postgres',
    'postgresql://localhost:54322/autre',
    'postgresql://localhost:54322/postgres?host=base-distante.exemple.test',
  ]) expect(() => verifierUrlLocale(adresse)).toThrow(/uniquement/);
});

test('une adresse malformée n’est jamais recopiée dans le message d’erreur', () => {
  expect(() => verifierUrlLocale('adresse-invalide')).toThrow('Adresse PostgreSQL locale invalide.');
});
