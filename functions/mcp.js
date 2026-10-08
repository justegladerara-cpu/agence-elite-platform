// Cloudflare Pages : connecteur IA « Domaines Agence Elite » sur /mcp (lecture seule sans secrets).
import connecteur from '../serveur/connecteur/index.js';

export const onRequest = ({ request, env }) => connecteur.fetch(request, env);
