// Cloudflare Pages : /api/integrations (Paramètres › Connexions, voir serveur/integrations/index.js).
import { traiterIntegrations } from '../../serveur/integrations/index.js';

export const onRequest = ({ request, env }) => traiterIntegrations(request, env);
