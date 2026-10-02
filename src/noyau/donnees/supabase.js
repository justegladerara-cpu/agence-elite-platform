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
    // « identifiant » : un identifiant de connexion ou une adresse e-mail.
    // Supabase Auth reste l'autorité : l'identifiant est seulement traduit en adresse, côté base,
    // après vérification du mot de passe (réponse identique si l'identifiant n'existe pas).
    async connecterParMotDePasse(identifiant, motDePasse) {
      let email = String(identifiant ?? '').trim();
      if (!email.includes('@')) {
        const { data: resolution, error: erreurResolution } = await supabase.rpc('resoudre_connexion', { p_identifiant: email, p_mot_de_passe: motDePasse });
        if (erreurResolution) throw new Error('Connexion impossible pour le moment');
        if (!resolution?.ok) throw new Error(resolution?.message ?? 'Identifiant ou mot de passe incorrect');
        email = resolution.email;
      }
      const { data, error } = await supabase.auth.signInWithPassword({ email, password: motDePasse });
      if (error) throw new Error(/invalid login credentials/i.test(error.message) ? 'Identifiant ou mot de passe incorrect' : error.message);
      utilisateur = data.user.id;
    },
    async changerMotDePasse(nouveau) {
      const { error } = await supabase.auth.updateUser({ password: nouveau });
      if (error) {
        if (/same_password|different from the old/i.test(error.code ?? error.message)) throw new Error('Choisissez un mot de passe différent de l’ancien');
        if (/weak|short|characters/i.test(error.message)) throw new Error('Mot de passe trop court ou trop simple (8 caractères au moins)');
        if (/Database error/i.test(error.message)) throw new Error('Mot de passe refusé : trop simple, ou mot de passe temporaire expiré');
        throw new Error(error.message);
      }
    },
    async creerCompte(email, motDePasse, nom) {
      const { data, error } = await supabase.auth.signUp({ email, password: motDePasse, options: { data: { nom } } });
      if (error) throw new Error(error.message);
      utilisateur = data.session?.user?.id ?? null;
      return Boolean(data.session);
    },
    async deconnecter() {
      await supabase.auth.signOut();
      utilisateur = null;
    },
  };
}
