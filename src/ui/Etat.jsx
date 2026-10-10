import React, { useEffect, useState } from 'react';
import { Bouton } from './composants.jsx';

/* global __VERSION_APP__ */
const VERSION = typeof __VERSION_APP__ === 'string' ? __VERSION_APP__ : null;
const INTERVALLE_VERSION_MS = 5 * 60 * 1000;

// Hors connexion : rien n'est envoyé ; les formulaires gardés en brouillon attendent sur l'appareil.
export function BandeauConnexion() {
  const [enLigne, setEnLigne] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine !== false));
  const [retour, setRetour] = useState(false);
  useEffect(() => {
    let minuterie;
    const horsLigne = () => { setEnLigne(false); setRetour(false); };
    const enLigneDeNouveau = () => {
      setEnLigne(true);
      setRetour(true);
      clearTimeout(minuterie);
      minuterie = setTimeout(() => setRetour(false), 4000);
    };
    window.addEventListener('offline', horsLigne);
    window.addEventListener('online', enLigneDeNouveau);
    return () => { clearTimeout(minuterie); window.removeEventListener('offline', horsLigne); window.removeEventListener('online', enLigneDeNouveau); };
  }, []);
  if (!enLigne) {
    return (
      <div className="bandeau-etat alerte" role="alert">
        Hors connexion : rien ne peut être enregistré pour l’instant. Les formulaires en cours restent en brouillon sur cet appareil ; enregistrez-les au retour du réseau.
      </div>
    );
  }
  if (retour) return <div className="bandeau-etat succes" role="status">Connexion rétablie.</div>;
  return null;
}

// Nouvelle version mise en ligne : proposée, jamais imposée (un formulaire en cours ne doit pas être perdu).
export function AnnonceMiseAJour() {
  const [nouvelle, setNouvelle] = useState(false);
  useEffect(() => {
    if (!VERSION || import.meta.env.DEV || typeof fetch !== 'function') return undefined;
    let actif = true;
    const verifier = () => {
      if (document.visibilityState === 'hidden') return;
      fetch(`${import.meta.env.BASE_URL}version.json`, { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : null))
        .then((v) => { if (actif && v?.version && v.version !== VERSION) setNouvelle(true); })
        .catch(() => {});
    };
    const minuterie = setInterval(verifier, INTERVALLE_VERSION_MS);
    document.addEventListener('visibilitychange', verifier);
    return () => { actif = false; clearInterval(minuterie); document.removeEventListener('visibilitychange', verifier); };
  }, []);
  if (!nouvelle) return null;
  return (
    <div className="bandeau-etat info" role="status">
      Une nouvelle version de la plateforme est disponible. Enregistrez ce que vous êtes en train de saisir, puis
      {' '}<Bouton onClick={() => window.location.reload()}>Recharger</Bouton>
    </div>
  );
}
