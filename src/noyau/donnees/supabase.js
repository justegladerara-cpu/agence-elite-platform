// Mode Supabase : mêmes appels que le mode local, via l'API Supabase.
import { creerClientSupabase } from '../supabase.js';

export function creerApiSupabase(supabase) {
  const echouer = (error) => {
    if (error) throw new Error(error.message);
  };
  return {
    mode: 'supabase',
    async rpc(nom, args = {}) {
      const { data, error } = await supabase.rpc(nom, args);
      echouer(error);
      return data;
    },
    async lire(table, { eq = {}, gte = {}, lte = {}, dans = {}, ordre, limite, colonnes } = {}) {
      let requete = supabase.from(table).select(colonnes ? colonnes.join(',') : '*');
      for (const [cle, valeur] of Object.entries(eq)) requete = valeur === null ? requete.is(cle, null) : requete.eq(cle, valeur);
      for (const [cle, valeur] of Object.entries(gte)) requete = requete.gte(cle, valeur);
      for (const [cle, valeur] of Object.entries(lte)) requete = requete.lte(cle, valeur);
      for (const [cle, valeurs] of Object.entries(dans)) requete = requete.in(cle, valeurs);
      if (ordre) requete = requete.order(ordre[0], { ascending: ordre[1] !== 'desc' });
      if (limite) requete = requete.limit(limite);
      const { data, error } = await requete;
      echouer(error);
      return data;
    },
  };
}

export async function demarrerSupabase(env = import.meta.env) {
  const supabase = creerClientSupabase(env);
  if (!supabase) return null;
  const api = creerApiSupabase(supabase);
  let utilisateur = (await supabase.auth.getSession()).data.session?.user?.id ?? null;
  return {
    ...api,
    comptes: null,
    utilisateur: () => utilisateur,
    async connecterParMotDePasse(email, motDePasse) {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password: motDePasse });
      if (error) throw new Error(error.message);
      utilisateur = data.user.id;
    },
    async deconnecter() {
      await supabase.auth.signOut();
      utilisateur = null;
    },
  };
}
