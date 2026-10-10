// Licence limitée à un nombre d'ordinateurs (Elite Partners) : chaque appareil garde un identifiant aléatoire ;
// la base l'enregistre tant qu'il reste une place, sinon l'établissement ne s'ouvre pas sur cet appareil.
import React, { useEffect, useState } from 'react';
import { useEspace } from '../noyau/espace.jsx';
import { Bouton, EmptyState } from './composants.jsx';

const CLE_APPAREIL = 'ae-appareil';

export function identifiantAppareil(stockage = globalThis.localStorage) {
  try {
    let id = stockage.getItem(CLE_APPAREIL);
    if (!id || !/^[A-Za-z0-9_-]{16,64}$/.test(id)) {
      const octets = new Uint8Array(18);
      globalThis.crypto.getRandomValues(octets);
      id = Array.from(octets, (o) => o.toString(16).padStart(2, '0')).join('');
      stockage.setItem(CLE_APPAREIL, id);
    }
    return id;
  } catch {
    return null;
  }
}

function nomAppareil() {
  const ua = globalThis.navigator?.userAgent ?? '';
  const systeme = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iPhone/iPad' : /Mac/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : 'Appareil';
  const navigateur = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : '';
  return [systeme, navigateur].filter(Boolean).join(' · ');
}

export function GardeAppareil({ children }) {
  const { api, etablissement } = useEspace();
  const [etat, setEtat] = useState(null);
  const exempte = !etablissement || ['dirigeant', 'support'].includes(etablissement.role);
  useEffect(() => {
    if (exempte) return undefined;
    const appareil = identifiantAppareil();
    if (!appareil) return undefined;
    let actif = true;
    // Hors ligne ou base pas encore à jour : on n'empêche jamais de travailler pour une erreur technique.
    api.rpc('verifier_appareil', { p_etablissement_id: etablissement.id, p_appareil: appareil, p_nom: nomAppareil() })
      .then((r) => actif && setEtat(r))
      .catch(() => {});
    return () => { actif = false; };
  }, [api, etablissement?.id, exempte]);
  if (!exempte && etat && etat.autorise === false) {
    return (
      <div className="page">
        <EmptyState
          icone="cle"
          titre="Cet ordinateur n’est pas autorisé"
          texte={`La licence de ${etablissement.nom} s’utilise sur ${etat.limite} ordinateur(s), déjà enregistré(s). Demandez à votre partenaire Elite Partners ou à Agence Elite de libérer une place, puis réessayez.`}
          action={<Bouton onClick={() => window.location.reload()}>Réessayer</Bouton>}
        />
      </div>
    );
  }
  return children;
}
