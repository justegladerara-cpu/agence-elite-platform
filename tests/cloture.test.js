import { readFile } from 'node:fs/promises';
import { describe, expect, test } from 'vitest';
describe('clôture reproductible du Lot 1', () => {
  test('la configuration Supabase reste locale et sans secret', async () => {
    const config = await readFile('supabase/config.toml', 'utf8');
    expect(config).toContain('project_id = "agence-elite-platform"');
    expect(config).not.toMatch(/service_role_key\s*=|anon_key\s*=|eyJ[a-zA-Z0-9_-]{20,}/);
  });
  test('la CI reconstruit réellement la base locale', async () => {
    const workflow = await readFile('.github/workflows/ci.yml', 'utf8');
    expect(workflow).toContain('npx supabase db reset --local');
    expect(workflow).toContain('npm test');
    expect(workflow).toContain('npm run build');
  });
});
