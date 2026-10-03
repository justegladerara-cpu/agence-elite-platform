// Widget « Hôtel » du tableau de bord : occupation, arrivées, départs, entretien (se charge seul).
import React from 'react';
import { useDonnees } from '../../noyau/espace.jsx';
import { Erreur, Section, StatCard } from '../../ui/composants.jsx';

export function SyntheseHotel({ espace, naviguer }) {
  const { api, etablissement } = espace;
  const { donnees: d, erreur } = useDonnees(() => api.rpc('tableau_de_bord_hotel', { p_etablissement_id: etablissement.id }), [etablissement.id]);
  if (erreur) return <Erreur message={erreur} />;
  if (!d) return null;
  return (
    <Section titre="Hôtel" action={<button type="button" className="lien" onClick={() => naviguer('hotel')}>Voir la réception</button>}>
      <div className="grille-stats">
        <StatCard icone="lit" libelle="Occupation" valeur={`${d.taux_occupation} %`} detail={`${d.occupees} / ${d.chambres} chambres`} />
        <StatCard icone="echeance" libelle="Arrivées attendues" valeur={d.arrivees_jour} />
        <StatCard icone="sortie" libelle="Départs du jour" valeur={d.departs_jour} ton={d.departs_jour ? 'attention' : undefined} />
        <StatCard icone="coche" libelle="Chambres à nettoyer" valeur={d.a_nettoyer} detail={d.hors_service ? `${d.hors_service} hors service` : undefined} ton={d.a_nettoyer ? 'attention' : undefined} />
      </div>
    </Section>
  );
}
