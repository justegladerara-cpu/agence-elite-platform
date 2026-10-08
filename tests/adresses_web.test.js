// Adresses web des clients (super admin) et connecteur IA servis par les fonctions Cloudflare Pages.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SUPABASE_CLE_PUBLIQUE, SUPABASE_URL } from '../serveur/config.js';
import { traiterAdresses } from '../serveur/adresses.js';
import connecteur from '../serveur/connecteur/index.js';
import { suggererSousDomaine } from '../src/modules/editeur/AdressesEditeur.jsx';

const ENV = { CF_API_TOKEN: 'jeton-cf' };

// Fausse base (est_super_admin) + fausse API Cloudflare + faux DNS public.
function faux({ superAdmin = true } = {}) {
  const domaines = [{ name: 'saas.agence-elite.fr', status: 'active' }];
  const f = async (url, init = {}) => {
    const u = new URL(url);
    if (u.pathname === '/rest/v1/rpc/est_super_admin') {
      expect(init.headers.apikey).toBe(SUPABASE_CLE_PUBLIQUE);
      return Response.json(init.headers.authorization === 'Bearer session' && superAdmin);
    }
    if (u.hostname === 'cloudflare-dns.com')
      return Response.json({ Status: 0, Answer: [{ name: `${u.searchParams.get('name')}.`, type: 5, TTL: 300, data: 'agence-elite-saas.pages.dev.' }] });
    expect(init.headers.authorization).toBe('Bearer jeton-cf');
    if (u.pathname === '/client/v4/accounts') return Response.json({ success: true, result: [{ id: 'compte' }] });
    expect(u.pathname).toBe('/client/v4/accounts/compte/pages/projects/agence-elite-saas/domains');
    if (init.method === 'POST') {
      const d = { name: JSON.parse(init.body).name, status: 'pending' };
      domaines.push(d);
      return Response.json({ success: true, result: d });
    }
    return Response.json({ success: true, result: domaines });
  };
  return { f, domaines };
}
const requete = (methode, corps, jeton = 'session') =>
  new Request('https://saas.agence-elite.fr/api/adresses', {
    method: methode,
    headers: jeton ? { authorization: `Bearer ${jeton}` } : {},
    body: corps ? JSON.stringify(corps) : undefined,
  });

describe('adresses web', () => {
  it('la configuration serveur reprend celle de .env.production', () => {
    const env = readFileSync(new URL('../.env.production', import.meta.url), 'utf8');
    expect(env).toContain(`VITE_SUPABASE_URL=${SUPABASE_URL}`);
    expect(env).toContain(`VITE_SUPABASE_ANON_KEY=${SUPABASE_CLE_PUBLIQUE}`);
  });

  it('refuse sans session, hors super admin, et sans secret Cloudflare', async () => {
    expect((await traiterAdresses(requete('GET', null, null), ENV, faux().f)).status).toBe(403);
    expect((await traiterAdresses(requete('GET'), ENV, faux({ superAdmin: false }).f)).status).toBe(403);
    expect((await traiterAdresses(requete('GET'), {}, faux().f)).status).toBe(503);
    expect((await traiterAdresses(requete('DELETE'), ENV, faux().f)).status).toBe(405);
  });

  it('liste et crée thedream.agence-elite.fr', async () => {
    const { f, domaines } = faux();
    const liste = await (await traiterAdresses(requete('GET'), ENV, f)).json();
    expect(liste.adresses).toHaveLength(1);
    const rep = await traiterAdresses(requete('POST', { sous_domaine: 'thedream' }), ENV, f);
    expect(rep.status).toBe(201);
    const cree = await rep.json();
    expect(cree.adresse).toBe('https://thedream.agence-elite.fr');
    expect(cree.dns).toBe('OK');
    expect(domaines.map((d) => d.name)).toContain('thedream.agence-elite.fr');
  });

  it('refuse les noms réservés ou invalides', async () => {
    for (const nom of ['crm', 'saas', 'a b', '']) {
      const rep = await traiterAdresses(requete('POST', { sous_domaine: nom }), ENV, faux().f);
      expect(rep.status).toBe(400);
    }
  });

  it('propose un nom à partir de celui de l’établissement', () => {
    expect(suggererSousDomaine('The Dream Lounge Bar Restaurant')).toBe('the-dream-lounge-bar-restaurant');
    expect(suggererSousDomaine('Hôtel 2i')).toBe('hotel-2i');
  });

  it('connecteur IA : lecture seule sans secrets, protégé par jeton avec', async () => {
    const corps = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
    const sans = await connecteur.fetch(new Request('https://saas.agence-elite.fr/mcp', { method: 'POST', body: corps }), {});
    expect((await sans.json()).result.tools).toHaveLength(4);
    const env = { ...ENV, MCP_JETON: 'x'.repeat(30) };
    expect((await connecteur.fetch(new Request('https://saas.agence-elite.fr/mcp', { method: 'POST', body: corps }), env)).status).toBe(404);
    const avec = await connecteur.fetch(new Request(`https://saas.agence-elite.fr/mcp/${'x'.repeat(30)}`, { method: 'POST', body: corps }), env);
    expect((await avec.json()).result.tools).toHaveLength(6);
  });
});
