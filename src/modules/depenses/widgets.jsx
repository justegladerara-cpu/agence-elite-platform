// Widgets du tableau de bord déclarés par le module Dépenses.
import React from 'react';
import { StatCard } from '../../ui/composants.jsx';

export function TotalDepenses({ tdb, espace, naviguer }) {
  return <StatCard icone="depenses" libelle="Dépenses" valeur={espace.montant(tdb.depenses)} onClick={() => naviguer('depenses')} />;
}

export function Resultat({ tdb, espace }) {
  const resultat = tdb.marge_brute - tdb.depenses;
  return <StatCard icone="activite" libelle="Résultat estimé" valeur={espace.montant(resultat)} detail={`Marge brute ${espace.montant(tdb.marge_brute)} − dépenses`} ton={resultat < 0 ? 'alerte' : 'positif'} />;
}
