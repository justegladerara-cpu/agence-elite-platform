// Widget « Boutique en ligne » du tableau de bord : commandes à traiter et chiffre du mois (se charge seul).
import React from 'react';
import { useDonnees } from '../../noyau/espace.jsx';
import { Erreur, Section, StatCard } from '../../ui/composants.jsx';

export function SyntheseBoutique({ espace, naviguer }) {
  const { api, etablissement, montant } = espace;
  const { donnees: d, erreur } = useDonnees(() => api.rpc('tableau_de_bord_boutique', { p_etablissement_id: etablissement.id }), [etablissement.id]);
  if (erreur) return <Erreur message={erreur} />;
  if (!d) return null;
  return (
    <Section titre="Boutique en ligne" action={<button type="button" className="lien" onClick={() => naviguer('boutique')}>Voir les commandes</button>}>
      <div className="grille-stats">
        <StatCard icone="panier" libelle="Nouvelles commandes" valeur={d.nouvelles} ton={d.nouvelles ? 'attention' : undefined} />
        <StatCard icone="camion" libelle="À préparer ou livrer" valeur={d.a_preparer + d.a_livrer} />
        <StatCard icone="ventes" libelle="Ventes en ligne du mois" valeur={montant(d.chiffre_mois)} detail={`${d.commandes_mois} commande(s)`} />
        <StatCard icone="globe" libelle="Boutique" valeur={d.publiee ? 'En ligne' : 'Hors ligne'} detail={`${d.produits_publies} produit(s) publiés`} />
      </div>
    </Section>
  );
}
