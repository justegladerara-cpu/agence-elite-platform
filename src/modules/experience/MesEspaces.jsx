import React, { useState } from 'react';
import { useEspace } from '../../noyau/espace.jsx';
import { TYPES_HUB } from '../../noyau/format.js';
import { nomLieu } from '../../noyau/lieux.js';
import { Bouton } from '../../ui/composants.jsx';
import { ModaleCaisse, ModaleHub } from '../hubs/GestionHubs.jsx';
import { EnteteXp, Tuile } from './communs.jsx';

// « Mes espaces » (nouvelle version The Dream) : chaque endroit du bar (salle, terrasse, dépôt). Un toucher ouvre
// l'espace pour le modifier (nom, type, capacités, caisses) ; pas d'écran séparé. On peut aussi n'afficher qu'un
// espace dans tout le logiciel.
export default function MesEspaces() {
  const { hubs, etablissement, hub, choisirHub, multiHub, peut, recharger, notifier } = useEspace();
  const gerer = peut('etablissement.gerer_hubs') && etablissement.ecriture;
  const [modale, setModale] = useState(null);
  const fait = (message) => {
    setModale(null);
    notifier(message);
    recharger();
  };
  return (
    <div className="xp-page">
      <EnteteXp surtitre={etablissement.nom} titre="Mes espaces"
        sousTitre="Chaque endroit du bar : où l’on vend, où l’on range. Touchez un espace pour le modifier ; touchez « Ne voir que lui » pour filtrer tout le logiciel.">
        {gerer && <Bouton icone="plus" variante="principal" onClick={() => setModale({ type: 'hub' })}>Nouvel espace</Bouton>}
      </EnteteXp>
      <div className="xp-grille large">
        {multiHub && (
          <Tuile icone="hub" titre="Tous les espaces" valeur={hubs.length} verdict={!hub ? { ton: 'neutre', texte: 'choisi' } : undefined}
            pourquoi="Les chiffres et le stock de tout le bar ensemble." onClick={() => choisirHub(null)} />
        )}
        {hubs.map((h) => (
          <div key={h.id} className="xp-tuile">
            <span className="xp-tuile-tete">
              <span className="xp-tuile-titre">{TYPES_HUB[h.type] ?? 'Espace'}{h.principal ? ' · principal' : ''}</span>
              {hub?.id === h.id && multiHub && <span className="xp-verdict neutre">choisi</span>}
            </span>
            <span className="xp-tuile-valeur" style={{ fontSize: 22 }}>{nomLieu(h.nom)}</span>
            <span className="xp-tuile-pourquoi">
              {[h.capacite_caisse ? 'On y vend' : null, h.capacite_stock ? 'On y range du stock' : null].filter(Boolean).join(' · ') || 'Espace simple'}
              {h.code ? ` · ${h.code}` : ''}
            </span>
            <span className="xp-produit-actions">
              {gerer && <Bouton icone="parametres" onClick={() => setModale({ type: 'hub', hub: h })}>Modifier</Bouton>}
              {gerer && h.capacite_caisse && <Bouton onClick={() => setModale({ type: 'caisse', hub: h })}>Ajouter une caisse</Bouton>}
              {multiHub && <Bouton onClick={() => choisirHub(h.id)}>Ne voir que lui</Bouton>}
            </span>
          </div>
        ))}
      </div>
      {modale?.type === 'hub' && (
        <ModaleHub etablissementId={etablissement.id} hub={modale.hub} onFermer={() => setModale(null)}
          onEnregistre={() => fait(modale.hub ? 'Espace enregistré' : 'Espace créé')} />
      )}
      {modale?.type === 'caisse' && (
        <ModaleCaisse etablissementId={etablissement.id} hub={modale.hub} onFermer={() => setModale(null)} onEnregistre={() => fait('Caisse enregistrée')} />
      )}
    </div>
  );
}
