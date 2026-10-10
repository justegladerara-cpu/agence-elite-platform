// Envoi de fichier qui reprend tout seul après une coupure de réseau (lot G2).
// Un fichier part en un seul appel (3 Mo au plus) : « reprendre » veut dire renvoyer le même fichier dès que le réseau
// revient, sans que la personne ait à le rechoisir. Avant chaque nouvel essai, dejaRecu() vérifie que le serveur n'a
// pas déjà reçu l'envoi précédent (réponse perdue en route) : jamais de doublon.

export function estErreurReseau(err) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  return /failed to fetch|networkerror|network request failed|load failed|fetch failed|err_internet|err_network/i.test(String(err?.message ?? err ?? ''));
}

const pause = (ms, signal) => new Promise((resoudre, rejeter) => {
  if (signal?.aborted) {
    rejeter(new Error('Envoi annulé'));
    return;
  }
  const t = setTimeout(resoudre, ms);
  signal?.addEventListener('abort', () => { clearTimeout(t); rejeter(new Error('Envoi annulé')); }, { once: true });
});

// Attend le retour du réseau (événement « online ») ; sans navigateur ou déjà en ligne : tout de suite.
export function attendreReseau(signal) {
  if (typeof window === 'undefined' || typeof navigator === 'undefined' || navigator.onLine !== false) return Promise.resolve();
  if (signal?.aborted) return Promise.reject(new Error('Envoi annulé'));
  return new Promise((resoudre, rejeter) => {
    const fin = () => { window.removeEventListener('online', fin); resoudre(); };
    window.addEventListener('online', fin);
    signal?.addEventListener('abort', () => { window.removeEventListener('online', fin); rejeter(new Error('Envoi annulé')); }, { once: true });
  });
}

// envoyer : () => Promise ; dejaRecu : () => Promise<boolean> ; surAttente(essai, total) : pour l'affichage.
export async function envoyerAvecReprise(envoyer, { dejaRecu, essais = 4, delais = [2000, 5000, 10000], surAttente, signal } = {}) {
  for (let essai = 1; ; essai += 1) {
    if (signal?.aborted) throw new Error('Envoi annulé');
    try {
      return await envoyer();
    } catch (err) {
      if (!estErreurReseau(err)) throw err;
      if (essai >= essais) {
        throw new Error('Connexion perdue : l’envoi n’a pas abouti. Le fichier reste choisi : réessayez quand le réseau revient.');
      }
      surAttente?.(essai + 1, essais);
      await attendreReseau(signal);
      await pause(delais[Math.min(essai - 1, delais.length - 1)], signal);
      if (dejaRecu) {
        try {
          if (await dejaRecu()) return { dejaRecu: true };
        } catch {
          // Vérification impossible (toujours hors ligne) : on retente l'envoi, la boucle s'en chargera.
        }
      }
    }
  }
}
