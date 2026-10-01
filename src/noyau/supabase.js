import { createClient } from '@supabase/supabase-js';

export function creerClientSupabase(env = import.meta.env) {
  const url = env.VITE_SUPABASE_URL;
  const cle = env.VITE_SUPABASE_ANON_KEY;
  if (!url || !cle) return null;
  if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/.test(url)) {
    throw new Error('Seule une instance Supabase locale est autorisée pour le Lot 1');
  }
  return createClient(url, cle);
}
