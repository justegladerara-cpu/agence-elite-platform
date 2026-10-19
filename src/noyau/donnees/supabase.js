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
    // Jeton de session de la personne connectée, pour les sites clients rattachés (voir noyau/sites.js).
    async jeton() {
      return (await supabase.auth.getSession()).data.session?.access_token ?? null;
    },
    // Fonctions serveur de la plateforme (Cloudflare Pages, dossier functions/) appelées avec le jeton de session.
    async serveur(chemin, { methode = 'GET', corps } = {}) {
      const jeton = (await supabase.auth.getSession()).data.session?.access_token;
      if (!jeton) throw new Error('Session expirée : reconnectez-vous');
      const rep = await fetch(chemin, {
        method: methode,
        headers: { authorization: `Bearer ${jeton}`, 'content-type': 'application/json' },
        body: corps === undefined ? undefined : JSON.stringify(corps),
      });
      const donnees = await rep.json().catch(() => null);
      if (!rep.ok || !donnees) throw new Error(donnees?.erreur ?? 'Service indisponible pour le moment');
      return donnees;
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
    // Double authentification (TOTP, Supabase Auth MFA) des comptes de l'équipe Agence Elite.
    // La base exige le niveau aal2 (voir migration 20261019000142) ; ces appels ne font que l'obtenir.
    mfa: {
      async facteurs() {
        const { data, error } = await supabase.auth.mfa.listFactors();
        if (error) throw new Error('Lecture de la double authentification impossible pour le moment');
        return (data?.totp ?? []).filter((f) => f.status === 'verified');
      },
      async enroler() {
        // Un enrôlement abandonné (non vérifié) bloquerait le suivant : il est retiré d'abord.
        const { data: liste } = await supabase.auth.mfa.listFactors();
        for (const f of (liste?.all ?? []).filter((x) => x.factor_type === 'totp' && x.status !== 'verified')) {
          await supabase.auth.mfa.unenroll({ factorId: f.id });
        }
        const jour = new Date().toISOString().slice(0, 10);
        const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: `Téléphone ${jour} ${Math.random().toString(36).slice(2, 6)}` });
        if (error) throw new Error(/rate|limit/i.test(error.message) ? 'Trop de demandes : réessayez dans quelques minutes' : 'Activation impossible pour le moment');
        return { id: data.id, qr: data.totp?.qr_code ?? '', secret: data.totp?.secret ?? '' };
      },
      // Vérifie le code à 6 chiffres : Supabase renouvelle alors la session au niveau aal2.
      async verifier(factorId, code) {
        const propre = String(code ?? '').replace(/\s/g, '');
        if (!/^\d{6}$/.test(propre)) throw new Error('Le code contient 6 chiffres');
        const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: propre });
        if (error) throw new Error(/rate|limit|too many/i.test(error.message) ? 'Trop d’essais : patientez quelques minutes' : 'Code incorrect ou expiré : réessayez avec le code affiché maintenant');
      },
      async niveau() {
        const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        return data?.currentLevel ?? null;
      },
      // Ferme les sessions ouvertes sur les autres appareils (celle-ci reste ouverte).
      async fermerAutresSessions() {
        const { error } = await supabase.auth.signOut({ scope: 'others' });
        if (error) throw new Error('Fermeture des autres sessions impossible pour le moment');
      },
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
