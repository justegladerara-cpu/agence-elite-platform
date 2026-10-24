import React from 'react';
import { nomUtilisateur, useEspace } from '../../noyau/espace.jsx';
import { Bouton, Modale } from '../../ui/composants.jsx';
import { dureeEnMots } from '../tableau_de_bord/zoom.js';

// « Est-ce toujours toi ? » (Juste, 2026-10-24) : site ouvert 24 h sur 24, une caissière part vers 3 h sans
// se déconnecter, la suivante vendrait sur son compte. Avant d'encaisser, si la dernière vente de la caisse est
// ancienne (Paramètres › Caisse « verifier_caissiere_minutes », 45 min par défaut, 0 = jamais), on demande.
export const VERIFIER_PAR_DEFAUT_MIN = 45;

export function minutesVerification(reglages) {
  const m = Number(reglages?.caisse?.verifier_caissiere_minutes);
  return Number.isFinite(m) && m >= 0 ? m : VERIFIER_PAR_DEFAUT_MIN;
}

// derniere : date ISO (ou nombre) de la dernière vente ou de la dernière réponse « Oui, c'est moi ».
export function toujoursToiNecessaire(derniere, minutes, maintenant = Date.now()) {
  if (!minutes || !derniere) return false;
  const t = typeof derniere === 'number' ? derniere : new Date(derniere).getTime();
  return Number.isFinite(t) && maintenant - t >= minutes * 60000;
}

export function ModaleToujoursToi({ depuisMinutes, onOui, onFermer }) {
  const { utilisateur, deconnecter } = useEspace();
  const nom = nomUtilisateur(utilisateur);
  const prenom = String(nom ?? '').split(' ')[0];
  return (
    <Modale titre={`Est-ce toujours toi${prenom ? `, ${prenom}` : ''} ?`} onFermer={onFermer}>
      <div className="presence-caisse">
        <p className="presence-question">Aucune vente depuis {dureeEnMots(depuisMinutes)}. Cette caisse est au nom de <strong>{nom}</strong>.</p>
        <div className="presence-actions">
          <Bouton variante="principal grand" onClick={onOui}>Oui, c’est moi</Bouton>
          {deconnecter && <Bouton variante="secondaire grand" onClick={() => deconnecter('autre')}>Ce n’est pas moi</Bouton>}
        </div>
        <p className="texte-doux">« Ce n’est pas moi » déconnecte ce compte. La caisse reste ouverte ; l’autre personne se connecte avec son propre compte.</p>
      </div>
    </Modale>
  );
}
