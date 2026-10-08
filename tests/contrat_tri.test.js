import { describe, expect, test, vi } from 'vitest';
import { construireLecture } from '../src/noyau/donnees/moteurLocal.js';
import { creerApiSupabase } from '../src/noyau/donnees/supabase.js';
import * as restaurant from '../src/modules/restaurant/commun.js';

function clientFictif() {
  const requete = { select: vi.fn(() => requete), order: vi.fn(() => requete), then: (ok) => ok({ data: [], error: null }) };
  return { from: vi.fn(() => requete), requete };
}

describe('tri identique en local et Supabase', () => {
  test.each([['nom'], ['nom', 'asc'], ['nom', 'desc']].map((ordre) => [ordre]))('tri valide %j', async (ordre) => {
    const client = clientFictif();
    await creerApiSupabase(client).lire('articles', { ordre });
    expect(client.requete.order).toHaveBeenCalledWith('nom', { ascending: ordre[1] !== 'desc' });
    expect(construireLecture('articles', { ordre }).sql).toContain(`order by nom ${ordre[1] === 'desc' ? 'desc' : 'asc'}`);
  });
  test.each([['zone', 'ordre', 'nom'], ['nom', 'prix'], '-nom', ['-nom'], [], ['nom', 'DESC']].map((ordre) => [ordre]))('format invalide refusé avant requête : %j', async (ordre) => {
    const client = clientFictif();
    await expect(creerApiSupabase(client).lire('articles', { ordre })).rejects.toThrow();
    expect(client.from).not.toHaveBeenCalled();
    expect(() => construireLecture('articles', { ordre })).toThrow();
  });
  test('le plan de salle trie zone, ordre et nom sans dépendre de l’ordre des lignes SQL', () => {
    const tables = [{ id: 'c', zone: 'Terrasse', ordre: 1, nom: 'T1' }, { id: 'b', zone: 'Salle', ordre: 2, nom: 'T2' }, { id: 'a', zone: 'Salle', ordre: 1, nom: 'T1' }];
    expect(restaurant.trierTables(tables).map((t) => t.id)).toEqual(['a', 'b', 'c']);
    expect(tables.map((t) => t.id)).toEqual(['c', 'b', 'a']);
  });
});
