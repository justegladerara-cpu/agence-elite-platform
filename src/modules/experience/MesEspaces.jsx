import React from 'react';
import { useEspace } from '../../noyau/espace.jsx';
import { TYPES_HUB } from '../../noyau/format.js';
import { nomLieu } from '../../noyau/lieux.js';
import { EnteteXp, LienAncien, Tuile } from './communs.jsx';

// « Mes espaces » (ancien « Hubs ») : la salle, la terrasse, le dépôt… ce qui se vend et se range où.
export default function MesEspaces({ naviguer }) {
  const { hubs, etablissement, hub, choisirHub, multiHub } = useEspace();
  return (
    <div className="xp-page">
      <EnteteXp surtitre={etablissement.nom} titre="Mes espaces" sousTitre="Chaque endroit du bar : où l’on vend, où l’on range. Touchez un espace pour ne voir que lui partout dans le logiciel.">
        <LienAncien page="hubs" naviguer={naviguer} texte="Créer ou modifier un espace" />
      </EnteteXp>
      <div className="xp-grille large">
        {multiHub && (
          <Tuile icone="hub" titre="Tous les espaces" valeur={hubs.length} verdict={!hub ? { ton: 'neutre', texte: 'choisi' } : undefined}
            pourquoi="Les chiffres et le stock de tout le bar ensemble." onClick={() => choisirHub(null)} />
        )}
        {hubs.map((h) => (
          <Tuile key={h.id} icone={h.capacite_caisse ? 'caisse' : 'depot'} titre={TYPES_HUB[h.type] ?? 'Espace'} valeur={nomLieu(h.nom)}
            verdict={hub?.id === h.id && multiHub ? { ton: 'neutre', texte: 'choisi' } : undefined}
            pourquoi={[h.capacite_caisse ? 'On y vend' : null, h.capacite_stock ? 'On y range du stock' : null].filter(Boolean).join(' · ') || 'Espace simple'}
            conseil={multiHub ? 'Ne voir que cet espace' : undefined}
            onClick={multiHub ? () => choisirHub(h.id) : undefined} />
        ))}
      </div>
    </div>
  );
}
