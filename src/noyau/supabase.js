import { createClient } from '@supabase/supabase-js';

// Instance locale par défaut. Une instance hébergée exige un accord explicite
// dans la configuration du déploiement : VITE_AUTORISER_SUPABASE_DISTANT=oui.
export function creerClientSupabase(env = import.meta.env) {
  const url = env.VITE_SUPABASE_URL;
  const cle = env.VITE_SUPABASE_ANON_KEY;
  if (!url || !cle) return null;
  const locale = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/.test(url);
  const distanteAutorisee = env.VITE_AUTORISER_SUPABASE_DISTANT === 'oui' && /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(url);
  if (!locale && !distanteAutorisee) {
    throw new Error('Instance Supabase non autorisée : locale uniquement, sauf déploiement configuré (voir docs/PRODUCTION.md)');
  }
  return createClient(url, cle, { auth: { persistSession: true, autoRefreshToken: true } });
}
