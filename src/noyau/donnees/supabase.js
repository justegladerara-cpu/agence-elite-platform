// Mode Supabase : mêmes appels que le mode local, via l'API Supabase.
import { creerClientSupabase } from '../supabase.js';
import { verifierOrdre } from './lecture.js';

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
      const tri = verifierOrdre(ordre);
      let requete = supabase.from(table).select(colonnes ? colonnes.join(',') : '*');
      for (const [cle, valeur] of Object.entries(eq)) requete = valeur === null ? requete.is(cle, null) : requete.eq(cle, valeur);
      for (const [cle, valeur] of Object.entries(gte)) requete = requete.gte(cle, valeur);
      for (const [cle, valeur] of Object.entries(lte)) requete = requete.lte(cle, valeur);
      for (const [cle, valeurs] of Object.entries(dans)) requete = requete.in(cle, valeurs);
      if (tri) requete = requete.order(tri[0], { ascending: tri[1] !== 'desc' });
      if (limite) requete = requete.limit(limite);
      const { data, error } = await requete;
      echouer(error);
      return data;
    },
  };
}

export async function demarrerSupabase(env = import.meta.env) {
  // Retour d'un lien « mot de passe oublié » (#…type=recovery) ou lien expiré (#error=…) : lu avant que
  // Supabase n'ouvre la session de récupération, puis retiré de l'adresse.
  const ancre = typeof window === 'undefined' ? '' : window.location.hash;
  const recuperation = /(^|[#&])type=recovery(&|$)/.test(ancre);
  const lienInvalide = /(^|[#&])error(_code)?=/.test(ancre);
  const supabase = creerClientSupabase(env);
  if (!supabase) return null;
  const api = creerApiSupabase(supabase);
  let utilisateur = (await supabase.auth.getSession()).data.session?.user?.id ?? null;
  if ((recuperation || lienInvalide) && typeof window !== 'undefined') window.history.replaceState(null, '', window.location.pathname + window.location.search);
  let deconnexionVolontaire = false;
  const finsDeSession = new Set();
  // Session terminée sans action de l'utilisateur (jeton expiré ou révoqué) : l'écran « Session expirée » s'affiche.
  supabase.auth.onAuthStateChange((evenement, session) => {
    if (evenement === 'SIGNED_OUT' && utilisateur && !deconnexionVolontaire) {
      utilisateur = null;
      finsDeSession.forEach((f) => f());
    }
    if (session?.user?.id) utilisateur = session.user.id;
  });
  return {
    ...api,
    comptes: null,
    recuperation: recuperation && Boolean(utilisateur),
    lienInvalide,
    utilisateur: () => utilisateur,
    surFinDeSession(f) {
      finsDeSession.add(f);
      return () => finsDeSession.delete(f);
    },
    // Lien envoyé par Supabase Auth. L'adresse de retour est toujours celle de l'application (jamais réglable)
    // et Supabase la vérifie avec sa liste d'adresses autorisées. Même réponse que le compte existe ou non.
    async demanderReinitialisation(email) {
      const adresse = String(email ?? '').trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(adresse)) throw new Error('Adresse e-mail invalide');
      const { error } = await supabase.auth.resetPasswordForEmail(adresse, { redirectTo: `${window.location.origin}${window.location.pathname}` });
      if (error) throw new Error(/rate|limit|seconds/i.test(error.message) ? 'Trop de demandes : réessayez dans quelques minutes' : 'Envoi impossible pour le moment : réessayez plus tard');
    },
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
      deconnexionVolontaire = true;
      try {
        await supabase.auth.signOut();
      } finally {
        deconnexionVolontaire = false;
        utilisateur = null;
      }
    },
  };
}
