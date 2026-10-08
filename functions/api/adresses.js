// Cloudflare Pages : /api/adresses (super admin uniquement, voir serveur/adresses.js).
import { traiterAdresses } from '../../serveur/adresses.js';

export const onRequest = ({ request, env }) => traiterAdresses(request, env);
