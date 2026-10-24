import React, { useState } from 'react';
import { useEspace } from '../../noyau/espace.jsx';
import { Icone, Tabs } from '../../ui/composants.jsx';
import { regrouper } from './regroupement.js';

const AXES = [
  ['personne', 'Par caissière'],
  ['serveur', 'Par serveur'],
  ['heure', 'Par heure'],
  ['client', 'Par client'],
];

// Ventes rangées en petits tableaux (Juste, 2026-10-24 : « pas juste des listes interminables ») : qui a vendu le
// plus, quel serveur, à quelle heure, quel client. Un clic sur une personne filtre la liste en dessous.
export function RegroupementVentes({ ventes, nomPersonne, nomClient, onPersonne, onRecherche }) {
  const { montant } = useEspace();
  const [axe, setAxe] = useState('personne');
  const groupes = regrouper(ventes, axe, { nomPersonne, nomClient });
  const max = Math.max(...groupes.map((g) => g.total), 1);
  const cliquer = (g) => {
    if (axe === 'personne' && onPersonne && g.cle) onPersonne(g.cle);
    else if ((axe === 'serveur' || axe === 'client') && g.cle) onRecherche(g.libelle);
  };
  return (
    <section className="carte ventes-groupes" aria-label="Ventes rangées">
      <div className="titre-ligne">
        <h2>Qui vend le plus ?</h2>
        <Tabs onglets={AXES} actif={axe} onChange={setAxe} />
      </div>
      {groupes.length === 0 ? <p className="texte-doux">Rien à ranger ici.</p> : (
        <ol className="ventes-groupes-liste">
          {groupes.slice(0, 12).map((g, i) => (
            <li key={g.cle ?? `vide-${i}`}>
              <button type="button" className="ventes-groupe" onClick={() => cliquer(g)} disabled={!g.cle || axe === 'heure'}>
                <span className={`ventes-groupe-rang ${i === 0 ? 'premier' : ''}`}>{i === 0 && axe !== 'heure' ? <Icone nom="etoile" taille={14} /> : i + 1}</span>
                <span className="ventes-groupe-nom">
                  <strong>{g.libelle}</strong>
                  <small>{g.nombre} vente(s) · {montant(Math.round(g.total / g.nombre))} par client</small>
                </span>
                <span className="ventes-groupe-valeur">
                  <strong>{montant(g.total)}</strong>
                  <span className="ventes-groupe-barre" aria-hidden="true"><span style={{ width: `${Math.max(3, (100 * g.total) / max)}%` }} /></span>
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
