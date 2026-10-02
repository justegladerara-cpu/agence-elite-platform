// Widget du tableau de bord déclaré par le module Paiements.
import React from 'react';
import { MODES_PAIEMENT } from '../../noyau/format.js';
import { StatCard } from '../../ui/composants.jsx';
import { compact } from '../tableau_de_bord/GraphiqueVentes.jsx';

export function Encaisse({ tdb, espace }) {
  return (
    <StatCard icone="caisse" libelle="Encaissé" valeur={espace.montant(tdb.encaissements)} detail={Object.entries(tdb.encaissements_par_mode).map(([m, v]) => `${MODES_PAIEMENT[m]} ${compact(v)}`).join(' · ') || '—'} />
  );
}
