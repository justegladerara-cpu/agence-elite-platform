import React, { useEffect, useState } from 'react';
import { formatDateHeure } from '../noyau/format.js';
import { tailleLisible } from '../ui/communs.jsx';
import { Chargement } from '../ui/composants.jsx';

// Page publique d'un lien de partage (#/partage/<jeton>) : le document s'ouvre sans compte jusqu'à l'expiration.
export function PartagePublic({ donnees, jeton }) {
  const [doc, setDoc] = useState(null);
  const [erreur, setErreur] = useState('');
  useEffect(() => {
    donnees.rpc('ouvrir_lien_partage', { p_jeton: jeton }).then(setDoc).catch(() => setErreur('Ce lien n’existe pas ou a expiré. Demandez un nouveau lien à la personne qui vous l’a envoyé.'));
  }, [donnees, jeton]);
  if (erreur) return <div className="ecran-centre"><div className="connexion-carte"><h1>Document partagé</h1><p className="texte-doux">{erreur}</p></div></div>;
  if (!doc) return <div className="ecran-centre"><Chargement /></div>;
  return (
    <div className="ecran-centre">
      <div className="connexion-carte">
        <p className="texte-doux">Envoyé par {doc.emetteur}</p>
        <h1>{doc.nom}</h1>
        <p className="texte-doux">{tailleLisible(doc.taille)} · lien valable jusqu’au {formatDateHeure(doc.expire_le)}</p>
        {doc.type_mime?.startsWith('image/') && <img src={doc.contenu} alt={doc.nom} className="justificatif" />}
        <a className="bouton principal" href={doc.contenu} download={doc.nom}>Télécharger le document</a>
      </div>
    </div>
  );
}
