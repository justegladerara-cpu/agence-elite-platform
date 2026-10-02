// Choix du moteur : Supabase si une instance locale est configurée, sinon base locale du navigateur.
// Une seule instance par onglet (React peut appeler le démarrage deux fois en développement).
let demarrage = null;

export function demarrerDonnees() {
  demarrage ??= (async () => {
    if (import.meta.env.VITE_SUPABASE_URL) {
      const { demarrerSupabase } = await import('./supabase.js');
      return demarrerSupabase();
    }
    const { demarrerLocal } = await import('./local.js');
    return demarrerLocal();
  })();
  return demarrage;
}
