// Widget « Achats » du tableau de bord : dettes fournisseurs, réceptions attendues, ruptures (se charge seul).
import React from 'react';
import { useDonnees } from '../../noyau/espace.jsx';
import { Erreur, Section, StatCard } from '../../ui/composants.jsx';

export function SyntheseAchats({ espace, naviguer }) {
  const { api, etablissement, montant } = espace;
  const { donnees: d, erreur } = useDonnees(() => api.rpc('tableau_de_bord_achats', { p_etablissement_id: etablissement.id }), [etablissement.id]);
  if (erreur) return <Erreur message={erreur} />;
  if (!d) return null;
  return (
    <Section titre="Achats" action={<button type="button" className="lien" onClick={() => naviguer('achats')}>Voir les achats</button>}>
      <div className="grille-stats">
        <StatCard icone="ventes" libelle="Dû aux fournisseurs" valeur={montant(d.du_fournisseurs)} detail={Number(d.du_en_retard) ? `dont ${montant(d.du_en_retard)} en retard` : undefined} ton={Number(d.du_en_retard) ? 'alerte' : undefined} />
        <StatCard icone="camion" libelle="À recevoir" valeur={d.a_recevoir} detail={d.en_retard_livraison ? `${d.en_retard_livraison} en retard` : undefined} />
        <StatCard icone="panier" libelle="Achats reçus ce mois" valeur={montant(d.achats_mois)} />
        <StatCard icone="alerte" libelle="Sous le minimum" valeur={d.sous_minimum} onClick={() => naviguer('achats')} ton={d.sous_minimum ? 'alerte' : undefined} />
      </div>
    </Section>
  );
}
