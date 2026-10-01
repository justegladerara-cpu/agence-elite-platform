import React from 'react';
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';
import { aPermission } from '../src/noyau/permissions.js';
import { FournisseurEtablissement, SelecteurEtablissement, useEtablissement } from '../src/noyau/ContexteEtablissement.jsx';
import { creerClientSupabase } from '../src/noyau/supabase.js';
afterEach(cleanup);
test('la garde combine rôle, ajustement et module actif', () => {
  const membre = { actif: true, permissions: ['membres.lire'], permissionsAjustees: { 'membres.lire': false, 'membres.gerer': true } };
  expect(aPermission(membre, 'membres.lire', ['membres'])).toBe(false);
  expect(aPermission(membre, 'membres.gerer', ['membres'])).toBe(true);
  expect(aPermission(membre, 'membres.gerer', [])).toBe(false);
});
test('le sélecteur change le contexte actif', () => {
  const liste = [{ id: 'a', nom: 'A' }, { id: 'b', nom: 'B' }];
  function Courant() { const { etablissement } = useEtablissement(); return <output>{etablissement.nom}</output>; }
  render(<FournisseurEtablissement etablissements={liste}><SelecteurEtablissement etablissements={liste}/><Courant/></FournisseurEtablissement>);
  fireEvent.change(screen.getByLabelText('Établissement'), { target: { value: 'b' } });
  expect(screen.getByText('B', { selector: 'output' })).toBeTruthy();
});
describe('configuration Supabase locale', () => {
  test('reste désactivée sans variables', () => expect(creerClientSupabase({})).toBeNull());
  test('refuse toute URL distante', () => expect(() => creerClientSupabase({ VITE_SUPABASE_URL: 'https://projet.supabase.co', VITE_SUPABASE_ANON_KEY: 'fictive' })).toThrow(/locale/));
});
