// Widget « Abonnements » du tableau de bord : abonnés actifs, revenu mensuel récurrent, périodes à facturer, impayés.
import React from 'react';
import { useDonnees } from '../../noyau/espace.jsx';
import { Erreur, Section, StatCard } from '../../ui/composants.jsx';

export function SyntheseAbonnements({ espace, naviguer }) {
  const { api, etablissement, montant } = espace;
  const { donnees: d, erreur } = useDonnees(() => api.rpc('tableau_de_bord_abonnements', { p_etablissement_id: etablissement.id }), [etablissement.id]);
  if (erreur) return <Erreur message={erreur} />;
  if (!d) return null;
  return (
    <Section titre="Abonnements" action={<button type="button" className="lien" onClick={() => naviguer('abonnements')}>Voir les abonnés</button>}>
      <div className="grille-stats">
        <StatCard icone="repeter" libelle="Abonnés actifs" valeur={d.actifs} detail={d.suspendus ? `${d.suspendus} suspendu(s)` : undefined} />
        <StatCard icone="ventes" libelle="Revenu mensuel récurrent" valeur={montant(d.revenu_mensuel)} />
        <StatCard icone="facture" libelle="À facturer" valeur={d.a_facturer} ton={d.a_facturer ? 'attention' : undefined} />
        <StatCard icone="alerte" libelle="Factures impayées" valeur={d.impayes} ton={d.impayes ? 'attention' : undefined} />
      </div>
    </Section>
  );
}
