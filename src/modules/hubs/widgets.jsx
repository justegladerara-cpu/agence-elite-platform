// Widget du tableau de bord déclaré par le socle Établissement : la répartition par Hub.
import React from 'react';
import { Badge, Icone, Section } from '../../ui/composants.jsx';

export function ParHub({ tdb, espace }) {
  const { montant, choisirHub } = espace;
  return (
    <Section titre="Par Hub" sousTitre="Cliquez sur un Hub pour filtrer tout l’établissement sur ce lieu.">
      <div className="tableau-conteneur">
        <table className="tableau">
          <thead><tr><th>Hub</th><th className="nombre">Chiffre d’affaires</th><th className="nombre">Ventes</th><th className="nombre">Encaissé</th><th className="nombre">Valeur du stock</th><th>Caisse</th></tr></thead>
          <tbody>
            {tdb.par_hub.map((h) => (
              <tr key={h.hub_id} className="cliquable" tabIndex={0} onClick={() => choisirHub(h.hub_id)} onKeyDown={(e) => e.key === 'Enter' && choisirHub(h.hub_id)}>
                <td><span className="cellule-personne"><Icone nom={h.type === 'depot' ? 'depot' : 'hub'} /><strong>{h.nom}</strong>{h.articles_sous_minimum > 0 && <Badge ton="attention">{h.articles_sous_minimum} sous le seuil</Badge>}</span></td>
                <td className="nombre"><strong>{montant(h.chiffre_affaires)}</strong></td>
                <td className="nombre">{h.nombre_ventes}</td>
                <td className="nombre">{montant(h.encaissements)}</td>
                <td className="nombre">{montant(h.valeur_stock)}</td>
                <td>{h.caisses_ouvertes ? <Badge ton="vert">{h.caisses_ouvertes} ouverte(s)</Badge> : <span className="texte-doux">fermée</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}
