// Cloudflare Pages : /api/webhooks/<fournisseur>/<connexion> (événements signés, voir serveur/integrations/webhook.js).
import { traiterWebhook } from '../../../../serveur/integrations/webhook.js';

export const onRequest = ({ request, env, params }) => traiterWebhook(request, env, params);
