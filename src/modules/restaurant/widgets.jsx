// Widget « Restaurant » du tableau de bord : tables, cuisine, couverts et chiffre du jour (se charge seul).
import React from 'react';
import { useDonnees } from '../../noyau/espace.jsx';
import { Erreur, Section, StatCard } from '../../ui/composants.jsx';

export function SyntheseRestaurant({ espace, naviguer }) {
  const { api, etablissement, montant } = espace;
  const { donnees: d, erreur } = useDonnees(() => api.rpc('tableau_de_bord_restaurant', { p_etablissement_id: etablissement.id }), [etablissement.id]);
  if (erreur) return <Erreur message={erreur} />;
  if (!d) return null;
  return (
    <Section titre="Restaurant" action={<button type="button" className="lien" onClick={() => naviguer('salle')}>Voir la salle</button>}>
      <div className="grille-stats">
        <StatCard icone="table" libelle="Tables occupées" valeur={`${d.tables_occupees} / ${d.tables}`} />
        <StatCard icone="cuisine" libelle="En cuisine" valeur={d.en_cuisine} detail={d.prets ? `${d.prets} prêt(s) à servir` : undefined} ton={d.prets ? 'attention' : undefined} />
        <StatCard icone="membres" libelle="Couverts du jour" valeur={d.couverts_jour} />
        <StatCard icone="ventes" libelle="Chiffre du jour" valeur={montant(d.chiffre_jour)} detail={`${d.tickets_jour} addition(s)`} />
      </div>
    </Section>
  );
}
