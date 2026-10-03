// Widget « Agenda » du tableau de bord : rendez-vous du jour, de la semaine, à confirmer, à clôturer.
import React from 'react';
import { useDonnees } from '../../noyau/espace.jsx';
import { Erreur, Section, StatCard } from '../../ui/composants.jsx';

export function SyntheseAgenda({ espace, naviguer }) {
  const { api, etablissement } = espace;
  const { donnees: d, erreur } = useDonnees(() => api.rpc('tableau_de_bord_agenda', { p_etablissement_id: etablissement.id }), [etablissement.id]);
  if (erreur) return <Erreur message={erreur} />;
  if (!d) return null;
  return (
    <Section titre="Agenda" action={<button type="button" className="lien" onClick={() => naviguer('agenda')}>Ouvrir l’agenda</button>}>
      <div className="grille-stats">
        <StatCard icone="calendrier" libelle="Rendez-vous aujourd’hui" valeur={d.aujourd_hui} detail={d.mes_rendez_vous ? `${d.mes_rendez_vous} pour moi` : undefined} />
        <StatCard icone="echeance" libelle="7 prochains jours" valeur={d.semaine} />
        <StatCard icone="message" libelle="À confirmer" valeur={d.a_confirmer} ton={d.a_confirmer ? 'attention' : undefined} />
        <StatCard icone="coche" libelle="À clôturer" valeur={d.a_cloturer} ton={d.a_cloturer ? 'attention' : undefined} detail="Passés, ni honorés ni annulés" />
      </div>
    </Section>
  );
}
