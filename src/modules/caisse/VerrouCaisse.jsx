import React, { useEffect, useRef, useState } from 'react';
import { useEspace } from '../../noyau/espace.jsx';
import { Bouton, Modale } from '../../ui/composants.jsx';
import { mesCaisses } from './mesCaisses.js';
import { delaiVerrouillage, etatVerrou, PREAVIS_MS } from './verrouCaisse.js';

const EVENEMENTS = ['pointerdown', 'keydown', 'touchstart', 'wheel'];

// Monté dans toute l'application : si la personne a SA caisse ouverte et ne touche plus l'écran pendant le délai
// réglé (Paramètres › Clôture), on prévient une minute avant puis on la déconnecte. La caisse reste ouverte.
export default function VerrouCaisse() {
  const { api, etablissement, utilisateur, peut, deconnecter } = useEspace();
  const actif = Boolean(etablissement && peut('caisse.utiliser') && deconnecter);
  const [delai, setDelai] = useState(0);
  const [preavis, setPreavis] = useState(false);
  const derniere = useRef(Date.now());

  useEffect(() => {
    if (!actif) return undefined;
    let annule = false;
    api.lire('etablissement_parametres', { eq: { etablissement_id: etablissement.id, module_id: 'cloture' } })
      .then((lignes) => { if (!annule) setDelai(delaiVerrouillage(lignes?.[0]?.data)); })
      .catch(() => { if (!annule) setDelai(delaiVerrouillage(null)); });
    return () => { annule = true; };
  }, [actif, api, etablissement?.id]);

  useEffect(() => {
    if (!actif || !delai) return undefined;
    derniere.current = Date.now();
    const bouger = () => {
      derniere.current = Date.now();
      setPreavis(false);
    };
    EVENEMENTS.forEach((e) => window.addEventListener(e, bouger, { passive: true }));
    let verification = false;
    const minuterie = setInterval(async () => {
      const etat = etatVerrou(derniere.current, Date.now(), delai);
      if (etat === 'actif' || verification) return;
      // Seulement si la personne a une caisse ouverte avec son compte.
      verification = true;
      try {
        const sessions = await api.lire('sessions_caisse', { eq: { etablissement_id: etablissement.id, statut: 'ouverte' } });
        if (!mesCaisses(sessions, utilisateur).length) {
          derniere.current = Date.now();
          return;
        }
        if (etatVerrou(derniere.current, Date.now(), delai) === 'verrouiller') deconnecter('verrouillee');
        else setPreavis(true);
      } catch {
        /* réseau coupé : on réessaie au prochain tour */
      } finally {
        verification = false;
      }
    }, 5000);
    return () => {
      clearInterval(minuterie);
      EVENEMENTS.forEach((e) => window.removeEventListener(e, bouger));
    };
  }, [actif, delai, api, etablissement?.id, utilisateur, deconnecter]);

  if (!preavis) return null;
  return (
    <Modale titre="Caisse bientôt verrouillée" onFermer={() => setPreavis(false)}>
      <p>
        Personne n’a touché la caisse depuis {delai} minute{delai > 1 ? 's' : ''} moins {PREAVIS_MS / 60000}.
        Sans action, elle se verrouille et le compte se déconnecte dans moins d’une minute.
      </p>
      <p className="texte-doux">Votre caisse reste ouverte : vous la retrouvez en vous reconnectant.</p>
      <div className="actions">
        <Bouton variante="principal" onClick={() => setPreavis(false)}>Je suis là, continuer</Bouton>
      </div>
    </Modale>
  );
}
