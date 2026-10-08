// Cloudflare Pages : connecteur IA sur /mcp/<MCP_JETON> quand CF_API_TOKEN et MCP_JETON sont configurés.
import connecteur from '../../serveur/connecteur/index.js';

export const onRequest = ({ request, env }) => connecteur.fetch(request, env);
