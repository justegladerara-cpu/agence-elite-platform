import { readdir } from 'node:fs/promises';
import { expect, test } from 'vitest';

// Supabase identifie une migration par son numéro : deux fichiers au même numéro font échouer la reconstruction.
test('chaque migration a un numéro unique', async () => {
  const numeros = (await readdir('supabase/migrations')).filter((f) => f.endsWith('.sql')).map((f) => f.split('_')[0]);
  expect(numeros.filter((n, i) => numeros.indexOf(n) !== i)).toEqual([]);
});
