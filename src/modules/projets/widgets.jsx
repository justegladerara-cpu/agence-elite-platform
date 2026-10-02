// Widget « Projets » du tableau de bord : projets en cours, tâches, temps à facturer (se charge seul).
import React from 'react';
import { useDonnees } from '../../noyau/espace.jsx';
import { Erreur, Section, StatCard } from '../../ui/composants.jsx';

export function SyntheseProjets({ espace, naviguer }) {
  const { api, etablissement } = espace;
  const { donnees: d, erreur } = useDonnees(() => api.rpc('tableau_de_bord_projets', { p_etablissement_id: etablissement.id }), [etablissement.id]);
  if (erreur) return <Erreur message={erreur} />;
  if (!d) return null;
  return (
    <Section titre="Projets" action={<button type="button" className="lien" onClick={() => naviguer('projets')}>Voir les projets</button>}>
      <div className="grille-stats">
        <StatCard icone="dossier" libelle="En cours" valeur={d.en_cours} detail={d.en_retard ? `${d.en_retard} en retard` : undefined} ton={d.en_retard ? 'alerte' : undefined} />
        <StatCard icone="taches" libelle="Tâches ouvertes" valeur={d.taches_ouvertes} detail={d.taches_retard ? `${d.taches_retard} en retard` : undefined} />
        <StatCard icone="horloge" libelle="Heures cette semaine" valeur={`${d.heures_semaine} h`} />
        <StatCard icone="facture" libelle="À facturer" valeur={`${d.heures_a_facturer} h`} />
      </div>
    </Section>
  );
}
