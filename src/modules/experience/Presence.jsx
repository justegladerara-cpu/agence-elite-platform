import React, { useEffect, useRef, useState } from 'react';
import { useEspace } from '../../noyau/espace.jsx';
import { Bouton } from '../../ui/composants.jsx';
import { bipPresence } from './effets.js';

// Présence en caisse (nouvelle version The Dream, réglage Ma caisse › Contrôle de présence).
// Toutes les N minutes : bip + « Tu es là ? ». La caissière touche « Je suis là » : le temps de réponse est gardé.
// Sans réponse en 2 minutes : « manquée ». « Je m'absente » met la caisse en pause, avec la raison.
const DELAI_REPONSE_S = 120;
const RAISONS = ['Toilettes', 'Réserve', 'Pause', 'Appel du patron'];

export function usePresence(actif) {
  const { api, etablissement, reglagesFonctions } = useEspace();
  const minutes = Math.max(10, Number(reglagesFonctions?.caisse?.presence_minutes) || 40);
  const allume = actif && reglagesFonctions?.caisse?.presence_controle === true;
  const [demande, setDemande] = useState(null);
  const [absence, setAbsence] = useState(null);
  const noter = (evenement, extra = {}) => api.rpc('noter_presence_caisse', {
    p_etablissement_id: etablissement.id, p_evenement: evenement, p_delai: extra.delai ?? null, p_motif: extra.motif ?? null,
  }).catch(() => {});
  useEffect(() => {
    if (!allume || absence || demande) return undefined;
    const t = setTimeout(() => {
      bipPresence();
      setDemande({ depuis: Date.now() });
    }, minutes * 60000);
    return () => clearTimeout(t);
  }, [allume, absence, minutes, demande]);
  return {
    allume,
    demande,
    absence,
    repondre: () => {
      const delai = Math.round((Date.now() - demande.depuis) / 1000);
      noter('presente', { delai });
      setDemande(null);
    },
    manquee: () => {
      noter('manquee', { delai: DELAI_REPONSE_S });
      setDemande(null);
    },
    partir: (motif) => {
      noter('absence_debut', { motif });
      setDemande(null);
      setAbsence({ motif, depuis: Date.now() });
    },
    revenir: () => {
      noter('absence_fin', { delai: Math.round((Date.now() - absence.depuis) / 1000), motif: absence.motif });
      setAbsence(null);
    },
  };
}

function Chrono({ depuis, limite, onFin }) {
  const [reste, setReste] = useState(limite);
  const fin = useRef(onFin);
  fin.current = onFin;
  useEffect(() => {
    const t = setInterval(() => {
      const r = limite - Math.floor((Date.now() - depuis) / 1000);
      setReste(Math.max(0, r));
      if (r <= 0) {
        clearInterval(t);
        fin.current();
      }
      // Rappel sonore toutes les 30 secondes tant que personne ne répond.
      if (r > 0 && r % 30 === 0) bipPresence();
    }, 1000);
    return () => clearInterval(t);
  }, [depuis, limite]);
  return <span className="xp-presence-chrono">{Math.floor(reste / 60)}:{String(reste % 60).padStart(2, '0')}</span>;
}

export function EcransPresence({ presence, prenom }) {
  const [choixRaison, setChoixRaison] = useState(false);
  if (presence.absence) {
    return (
      <div className="xp-presence" role="dialog" aria-modal="true" aria-label="Caisse en pause">
        <div className="xp-presence-carte">
          <h2>Caisse en pause</h2>
          <p className="texte-doux">{prenom ? `${prenom} est en pause` : 'En pause'} : {presence.absence.motif}. Depuis {new Date(presence.absence.depuis).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}.</p>
          <Bouton variante="principal" onClick={presence.revenir}>Je suis de retour</Bouton>
        </div>
      </div>
    );
  }
  if (!presence.demande) return null;
  return (
    <div className="xp-presence" role="alertdialog" aria-modal="true" aria-label="Contrôle de présence">
      <div className="xp-presence-carte">
        <h2>{prenom ? `${prenom}, tu es là ?` : 'Tu es là ?'}</h2>
        <Chrono depuis={presence.demande.depuis} limite={DELAI_REPONSE_S} onFin={presence.manquee} />
        <Bouton variante="principal" onClick={presence.repondre}>Je suis là</Bouton>
        {!choixRaison
          ? <button type="button" className="lien" onClick={() => setChoixRaison(true)}>Je m’absente</button>
          : (
            <div className="puces" role="group" aria-label="Raison">
              {RAISONS.map((r) => <button key={r} type="button" onClick={() => presence.partir(r)}>{r}</button>)}
            </div>
          )}
      </div>
    </div>
  );
}

export function BoutonAbsence({ presence }) {
  const [ouvert, setOuvert] = useState(false);
  if (!presence.allume) return null;
  return (
    <span className="xp-bouton-absence">
      <Bouton icone="pause" onClick={() => setOuvert((o) => !o)}>Je m’absente</Bouton>
      {ouvert && (
        <span className="puces" role="group" aria-label="Raison">
          {RAISONS.map((r) => <button key={r} type="button" onClick={() => { setOuvert(false); presence.partir(r); }}>{r}</button>)}
        </span>
      )}
    </span>
  );
}
