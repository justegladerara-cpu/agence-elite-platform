import React, { useEffect, useState } from 'react';
import { useEspace } from '../noyau/espace.jsx';
import { dateFinLisible, finLicence, tempsRestant } from '../noyau/continuite.js';
import { Bouton, Modale } from './composants.jsx';

// Compte à rebours de fin de licence (licences.fin_a) : affiché à toute l'équipe dans les 72 dernières heures.
export const FENETRE_COMPTE_A_REBOURS = 72 * 3600000;
const RAPPEL_CAISSE = 15 * 60000;
const DUREE_RAPPEL = 10000;
const RAPPEL_GERANT = 2 * 3600000;
const CLE_FENETRE = 'ae-fin-licence-vue';

function useMaintenant(pas = 30000) {
  const [maintenant, setMaintenant] = useState(Date.now);
  useEffect(() => {
    const id = setInterval(() => setMaintenant(Date.now()), pas);
    return () => clearInterval(id);
  }, [pas]);
  return maintenant;
}

export function finProche(etablissement, maintenant = Date.now()) {
  const fin = finLicence(etablissement);
  return fin != null && maintenant < fin && fin - maintenant <= FENETRE_COMPTE_A_REBOURS ? fin : null;
}

// Bandeau permanent (non fermable) avec le temps restant, mis à jour toutes les 30 secondes.
export function BandeauFinLicence({ contactez, gerant, naviguer }) {
  const { etablissement } = useEspace();
  const maintenant = useMaintenant();
  const fin = finProche(etablissement, maintenant);
  if (!fin) return null;
  const urgent = fin - maintenant <= 12 * 3600000;
  return (
    <div className={`bandeau fin-licence ${urgent ? 'urgent' : ''}`.trim()} role="status">
      <strong>⏳ Licence : {tempsRestant(fin - maintenant)} restantes.</strong>{' '}
      Elle se termine le {dateFinLisible(fin, etablissement.fuseau || undefined)}. Ensuite : plus de vente ni de gestion du
      stock, consultation seule. {contactez} pour la renouveler.
      {gerant && <button className="lien" onClick={() => naviguer('parametres/licence')}>Mon abonnement</button>}
    </div>
  );
}

// Rappel toutes les 15 minutes : petite carte qui ne prend pas le clic (l'encaissement n'est jamais gêné).
export function RappelFinLicence() {
  const { etablissement } = useEspace();
  const maintenant = useMaintenant(RAPPEL_CAISSE);
  const [visible, setVisible] = useState(false);
  const fin = finProche(etablissement, maintenant);
  useEffect(() => {
    if (!fin) return undefined;
    setVisible(true);
    const id = setTimeout(() => setVisible(false), DUREE_RAPPEL);
    return () => clearTimeout(id);
  }, [fin, maintenant]);
  if (!fin || !visible) return null;
  return (
    <div className="rappel-fin-licence" role="status" aria-live="polite">
      La licence se termine le {dateFinLisible(fin, etablissement.fuseau || undefined)}. Prévenez votre responsable.
    </div>
  );
}

function derniereFenetre(id) {
  try {
    return Number(sessionStorage.getItem(`${CLE_FENETRE}-${id}`)) || 0;
  } catch {
    return 0;
  }
}

function noterFenetre(id) {
  try {
    sessionStorage.setItem(`${CLE_FENETRE}-${id}`, String(Date.now()));
  } catch {
    // Non mémorisé : la fenêtre reviendra au prochain affichage.
  }
}

// Responsable : fenêtre à la connexion, puis au plus toutes les 2 heures.
export function FenetreFinLicence({ contactez, naviguer }) {
  const { etablissement, aLaPermission } = useEspace();
  const maintenant = useMaintenant(60000);
  const [ouverte, setOuverte] = useState(false);
  const fin = finProche(etablissement, maintenant);
  const gerant = Boolean(aLaPermission?.('etablissement.modifier'));
  useEffect(() => {
    if (fin && gerant && maintenant - derniereFenetre(etablissement.id) >= RAPPEL_GERANT) setOuverte(true);
  }, [fin, gerant, maintenant, etablissement?.id]);
  if (!ouverte || !fin) return null;
  const fermer = () => {
    noterFenetre(etablissement.id);
    setOuverte(false);
  };
  return (
    <Modale
      titre="Votre licence se termine bientôt"
      onFermer={fermer}
      pied={(
        <>
          <Bouton variante="secondaire" onClick={fermer}>Plus tard</Bouton>
          <Bouton variante="principal" onClick={() => { fermer(); naviguer('parametres/licence'); }}>Demander le renouvellement</Bouton>
        </>
      )}
    >
      <p><strong>Temps restant : {tempsRestant(fin - maintenant)}.</strong></p>
      <p>La licence de {etablissement.nom} se termine le {dateFinLisible(fin, etablissement.fuseau || undefined)}.</p>
      <p>
        À cette heure-là, tous les comptes seront déconnectés : plus de vente, plus d’ouverture de caisse, plus de gestion
        du stock. Vos données restent intactes et consultables.
      </p>
      <p>Avant la fin : tirez le ticket Z et réglez les additions ouvertes. {contactez} pour renouveler.</p>
    </Modale>
  );
}
