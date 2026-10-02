// Modèle de page : copier dans src/modules/<module>/<Page>.jsx puis déclarer dans src/modules/index.js.
import React from 'react';
import { useDonnees, useEspace } from '../../noyau/espace.jsx';
import { Bouton, DataTable, EmptyState, Erreur, PageHeader, Squelette } from '../../ui/composants.jsx';

export default function PageExemple() {
  const { api, etablissement, hub, peut } = useEspace();
  const { donnees, chargement, erreur, recharger } = useDonnees(() => {
    let q = api.from('exemple').select('*').eq('etablissement_id', etablissement.id).order('cree_le', { ascending: false });
    if (hub) q = q.eq('hub_id', hub.id); // filtre Hub seulement si un Hub est choisi
    return q;
  }, [etablissement.id, hub?.id]);

  return (
    <div className="page">
      <PageHeader
        fil={[{ libelle: etablissement.nom }, { libelle: 'Exemple' }]}
        titre="Exemple"
        actions={peut('exemple.gerer') && <Bouton variante="principal" icone="plus">Nouveau</Bouton>}
      />
      <Erreur message={erreur} />
      {chargement && !donnees ? <Squelette lignes={5} />
        : !donnees?.length ? <EmptyState titre="Rien pour l’instant" texte="Les éléments apparaîtront ici." />
        : <DataTable lignes={donnees} colonnes={[{ id: 'libelle', libelle: 'Libellé' }]} />}
      <Bouton onClick={recharger}>Actualiser</Bouton>
    </div>
  );
}
