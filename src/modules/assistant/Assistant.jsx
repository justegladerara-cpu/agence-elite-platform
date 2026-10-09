import React from 'react';
import { useDonnees, useEspace } from '../../noyau/espace.jsx';
import { formatDate } from '../../noyau/format.js';
import { Bouton, Erreur, PageHeader, Squelette } from '../../ui/composants.jsx';
import { ASurveiller } from '../tableau_de_bord/cockpit.jsx';

// Assistant (Bêta) : toutes les alertes calculées par la base, au même endroit. Aucune IA générative :
// chaque ligne vient d'un calcul sur les données réelles de l'établissement (fonction assistant_alertes).
export default function Assistant({ naviguer }) {
  const { api, etablissement } = useEspace();
  const { donnees, chargement, erreur, recharger } = useDonnees(
    () => api.rpc('assistant_alertes', { p_etablissement_id: etablissement.id }),
    [etablissement.id],
  );
  const alertes = (donnees?.alertes ?? []).map((a) => ({ ...a, module: a.domaine_titre }));
  return (
    <div className="pile">
      <PageHeader
        titre="Assistant"
        sousTitre={donnees ? `Ce qui mérite votre attention, du ${formatDate(donnees.du)} au ${formatDate(donnees.au)}.` : 'Ce qui mérite votre attention.'}
        actions={<Bouton icone="repeter" onClick={recharger} chargement={chargement}>Actualiser</Bouton>}
      />
      <Erreur message={erreur} />
      {chargement && !donnees ? <Squelette /> : (
        <ASurveiller titre="À regarder" elements={alertes} naviguer={naviguer} avecModule />
      )}
      {donnees?.ignores?.length > 0 && (
        <p className="texte-doux">Non analysé pour l’instant : {donnees.ignores.join(', ')}.</p>
      )}
      <p className="texte-doux">
        Bêta. Les alertes sont calculées à partir de vos données, sans intelligence artificielle. Les seuils se règlent dans
        Paramètres › Applications › Assistant.
      </p>
    </div>
  );
}
