// Widget « Commercial » du tableau de bord : pipeline, signatures du mois, relances en retard (se charge seul).
import React from 'react';
import { useDonnees } from '../../noyau/espace.jsx';
import { Erreur, Section, StatCard } from '../../ui/composants.jsx';

export function SyntheseCrm({ espace, naviguer }) {
  const { api, etablissement, montant } = espace;
  const { donnees: d, erreur } = useDonnees(() => api.rpc('tableau_de_bord_crm', { p_etablissement_id: etablissement.id }), [etablissement.id]);
  if (erreur) return <Erreur message={erreur} />;
  if (!d) return null;
  return (
    <Section titre="Commercial" action={<button type="button" className="lien" onClick={() => naviguer('crm')}>Ouvrir le pipeline</button>}>
      <div className="grille-stats">
        <StatCard icone="cible" libelle="Pipeline en cours" valeur={montant(d.valeur_pipeline)} detail={`${d.ouvertes} opportunité(s)`} onClick={() => naviguer('crm')} />
        <StatCard icone="graphique" libelle="Pondéré" valeur={montant(d.valeur_ponderee)} />
        <StatCard icone="etoile" libelle="Gagné ce mois" valeur={montant(d.gagne_mois)} detail={`${d.gagnees_mois} signature(s)`} />
        <StatCard icone="horloge" libelle="Relances en retard" valeur={d.activites_retard} ton={d.activites_retard ? 'alerte' : undefined} onClick={() => naviguer('crm')} />
      </div>
    </Section>
  );
}
