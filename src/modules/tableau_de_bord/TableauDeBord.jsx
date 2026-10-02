import React, { useState } from 'react';
import { useDonnees, useEspace } from '../../noyau/espace.jsx';
import { dateLocale } from '../../noyau/format.js';
import { Bouton, EmptyState, Erreur, PageHeader, Squelette, Tabs } from '../../ui/composants.jsx';
import { widgetsAccessibles } from '../index.js';

const PERIODES = [['jour', 'Aujourd’hui'], ['semaine', '7 jours'], ['mois', '30 jours']];
const JOURS = { jour: 0, semaine: 6, mois: 29 };

// Le tableau de bord n'affiche que les widgets déclarés par les modules actifs et autorisés
// (voir les manifestes, docs/SOP/37_AJOUTER_UN_WIDGET.md). Source commune : tableau_de_bord_hub.
export default function TableauDeBord({ naviguer }) {
  const espace = useEspace();
  const { api, etablissement, peut, moduleActif, hub, multiHub } = espace;
  const [periode, setPeriode] = useState('jour');
  const du = dateLocale(-JOURS[periode]);
  const au = dateLocale();
  const hubFiltre = multiHub ? hub?.id ?? null : null;
  const { donnees: tdb, chargement, erreur } = useDonnees(
    () => api.rpc('tableau_de_bord_hub', { p_etablissement_id: etablissement.id, p_hub_id: hubFiltre, p_du: du, p_au: au }),
    [etablissement.id, hubFiltre, du, au]
  );

  const contexte = { tdb, periode, du, au };
  const rendre = (zone) => (tdb ? widgetsAccessibles(espace, zone, contexte) : []).map((w) => {
    const Widget = w.composant;
    return <Widget key={w.id} {...contexte} espace={espace} naviguer={naviguer} />;
  });
  const indicateurs = rendre('indicateur');
  const sections = rendre('section');
  const colonnes = rendre('colonne');

  const portee = multiHub ? (hub ? hub.nom : 'Tous les Hubs') : (etablissement.marque?.documents?.nom_commercial ?? etablissement.nom);
  return (
    <div className="page">
      <PageHeader
        titre="Tableau de bord"
        sousTitre={portee}
        actions={moduleActif('caisse') && peut('caisse.utiliser') && (!hub || hub.capacite_caisse) && <Bouton variante="principal" icone="caisse" onClick={() => naviguer('caisse')}>Ouvrir la caisse</Bouton>}
      />
      <Tabs onglets={PERIODES} actif={periode} onChange={setPeriode} />
      {chargement && !tdb && <Squelette lignes={6} />}
      <Erreur message={erreur} />
      {tdb && (
        <>
          {indicateurs.length > 0 && <div className="grille-stats">{indicateurs}</div>}
          {sections}
          {colonnes.length > 0 && <div className="deux-colonnes">{colonnes}</div>}
          {!indicateurs.length && !sections.length && !colonnes.length && (
            <EmptyState titre="Aucun indicateur pour vos applications" texte="Les indicateurs apparaissent avec les applications activées et vos droits." />
          )}
        </>
      )}
    </div>
  );
}
