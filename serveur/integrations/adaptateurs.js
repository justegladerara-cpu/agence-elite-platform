// Adaptateurs : un par fournisseur, même contrat. Le reste de la plateforme ne connaît que ce contrat.
//   tester({ mode, config, secret, f }) → { ok, message, reference? }
//   verifierWebhook({ secret, corps, entetes }) → { ok, raison?, evenement?, type? }
import { verifierSignature } from './signature.js';

const simulation = {
  // Bac à sable interne : aucun appel réseau. Il prouve la chaîne complète (chiffrement, test, journal, webhook).
  async tester({ mode, secret }) {
    if (mode !== 'test') return { ok: false, message: 'Le bac à sable ne fonctionne qu’en mode test' };
    if (String(secret ?? '').length < 8) return { ok: false, message: 'Clé fictive trop courte (8 caractères au moins)' };
    return { ok: true, message: 'Connexion de test réussie', reference: `sim_${Date.now()}` };
  },
  async verifierWebhook({ secret, corps, entetes }) {
    const v = await verifierSignature(secret, corps, entetes.get('x-ae-signature'));
    if (!v.ok) return v;
    let charge;
    try {
      charge = JSON.parse(corps);
    } catch {
      return { ok: false, raison: 'Corps illisible' };
    }
    if (!charge?.id) return { ok: false, raison: 'Identifiant d’événement manquant' };
    return { ok: true, evenement: String(charge.id), type: String(charge.type ?? 'evenement') };
  },
};

export const ADAPTATEURS = { simulation };
