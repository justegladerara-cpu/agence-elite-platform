// Choix du moteur : Supabase si une instance locale est configurée, sinon base locale du navigateur.
export async function demarrerDonnees() {
  if (import.meta.env.VITE_SUPABASE_URL) {
    const { demarrerSupabase } = await import('./supabase.js');
    return demarrerSupabase();
  }
  const { demarrerLocal } = await import('./local.js');
  return demarrerLocal();
}
