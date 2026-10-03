// Widget « Support » du tableau de bord : tickets ouverts, en retard, urgents, non assignés.
import React from 'react';
import { useDonnees } from '../../noyau/espace.jsx';
import { Erreur, Section, StatCard } from '../../ui/composants.jsx';

export function SyntheseSupport({ espace, naviguer }) {
  const { api, etablissement } = espace;
  const { donnees: d, erreur } = useDonnees(() => api.rpc('tableau_de_bord_support', { p_etablissement_id: etablissement.id }), [etablissement.id]);
  if (erreur) return <Erreur message={erreur} />;
  if (!d) return null;
  return (
    <Section titre="Support" action={<button type="button" className="lien" onClick={() => naviguer('support')}>Voir les tickets</button>}>
      <div className="grille-stats">
        <StatCard icone="message" libelle="Tickets ouverts" valeur={d.ouverts} detail={d.mes_tickets ? `${d.mes_tickets} pour moi` : undefined} />
        <StatCard icone="alerte" libelle="En retard" valeur={d.en_retard} ton={d.en_retard ? 'attention' : undefined} detail="Échéance de réponse dépassée" />
        <StatCard icone="alerte" libelle="Urgents" valeur={d.urgents} ton={d.urgents ? 'attention' : undefined} />
        <StatCard icone="coche" libelle="Résolus ce mois" valeur={d.resolus_mois} detail={d.delai_moyen_heures != null ? `${d.delai_moyen_heures} h en moyenne` : undefined} />
      </div>
    </Section>
  );
}
