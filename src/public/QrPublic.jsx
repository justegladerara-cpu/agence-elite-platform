import React, { useEffect, useRef, useState } from 'react';
import { destinationQr, identifiantVisiteur, texteVcard, typeAppareil } from '../noyau/qrContenus.js';
import { Chargement } from '../ui/composants.jsx';
import { PageQr } from './PageQr.jsx';

// Page d'un QR code suivi (#/q/<jeton>), ouverte en scannant, sans compte. La base compte le scan (ouvrir_qr_code :
// QR code actif et dans ses dates seulement, aucune donnée personnelle) puis le client part vers la destination :
// lien, avis, WhatsApp, appel, SMS, e-mail ou menu. Fiche contact : le fichier .vcf est proposé au téléchargement.

function FicheContact({ r }) {
  const c = r.contenu ?? {};
  const [adresse] = useState(() => URL.createObjectURL(new Blob([texteVcard(c)], { type: 'text/vcard' })));
  const nom = [c.prenom, c.nom].filter(Boolean).join(' ') || c.societe || r.nom;
  const lien = useRef(null);
  useEffect(() => {
    lien.current?.click();
  }, []);
  return (
    <div className="ecran-centre">
      <div className="connexion-carte">
        <h1>{nom}</h1>
        {c.societe && nom !== c.societe && <p className="texte-doux">{c.societe}</p>}
        <a ref={lien} className="bouton principal" href={adresse} download={`${String(nom).replace(/[^\p{L}\p{N}]+/gu, '-')}.vcf`}>
          <span>Enregistrer le contact</span>
        </a>
      </div>
    </div>
  );
}

export function QrPublic({ donnees, jeton }) {
  const [reponse, setReponse] = useState(null);
  const [destination, setDestination] = useState(null);
  const [erreur, setErreur] = useState('');
  const fait = useRef(false);
  useEffect(() => {
    if (fait.current) return;
    fait.current = true;
    const appareil = typeAppareil(navigator.userAgent, navigator.maxTouchPoints ?? 0);
    donnees.rpc('ouvrir_qr_code', { p_jeton: jeton, p_appareil: appareil, p_visiteur: identifiantVisiteur() })
      .then(async (r) => {
        setReponse(r);
        // Page mobile allumée (migration 20261023200160) : le client la voit, ses boutons mènent à la destination.
        if (r.page || r.type === 'vcard') return;
        const cible = destinationQr(r, `${window.location.origin}${window.location.pathname}`);
        if (!cible) throw new Error('Ce QR code n’a pas de destination');
        setDestination(cible);
        // Démonstration (base dans le navigateur) : le scan est écrit avant de quitter la page.
        await donnees.attendreEcriture?.().catch(() => {});
        window.location.replace(cible);
      })
      .catch((e) => setErreur(e.message));
  }, [donnees, jeton]);
  if (erreur) {
    return (
      <div className="ecran-centre">
        <div className="connexion-carte" role="alert">
          <h1>QR code indisponible</h1>
          <p className="texte-doux">{erreur.replace(/\.?$/, '.')}</p>
        </div>
      </div>
    );
  }
  if (reponse?.page) {
    return (
      <PageQr page={reponse.page} reponse={reponse} nom={reponse.etablissement} origine={`${window.location.origin}${window.location.pathname}`}
        onInscrire={async (v) => {
          const r = await donnees.rpc('envoyer_inscription_qr', { p_jeton: jeton, p: v, p_appareil: typeAppareil(navigator.userAgent, navigator.maxTouchPoints ?? 0) });
          await donnees.attendreEcriture?.().catch(() => {});
          return r;
        }} />
    );
  }
  if (reponse?.type === 'vcard') return <FicheContact r={reponse} />;
  return (
    <div className="ecran-centre">
      <div className="connexion-carte">
        <Chargement texte="Ouverture…" />
        {destination && <p><a className="lien" href={destination}>Si rien ne s’ouvre, touchez ici</a></p>}
      </div>
    </div>
  );
}
