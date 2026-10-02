// Widgets du tableau de bord déclarés par le module Ventes (source : tableau_de_bord_hub).
import React from 'react';
import { formatQuantite } from '../../noyau/format.js';
import { EmptyState, Section, StatCard } from '../../ui/composants.jsx';
import GraphiqueVentes from '../tableau_de_bord/GraphiqueVentes.jsx';

function joursEntre(du, au) {
  const jours = [];
  const courant = new Date(`${du}T12:00:00`);
  const fin = new Date(`${au}T12:00:00`);
  while (courant <= fin) {
    jours.push(courant.toISOString().slice(0, 10));
    courant.setDate(courant.getDate() + 1);
  }
  return jours;
}

export function ChiffreAffaires({ tdb, espace, naviguer }) {
  const { montant, peut } = espace;
  return (
    <StatCard icone="ventes" libelle="Chiffre d’affaires" valeur={montant(tdb.chiffre_affaires)} detail={`${tdb.nombre_ventes} vente(s) · panier moyen ${montant(tdb.panier_moyen)}`} ton="fort" onClick={peut('ventes.lire') ? () => naviguer('ventes') : undefined} />
  );
}

export function Credits({ tdb, espace, naviguer }) {
  const { montant, peut } = espace;
  return <StatCard icone="contacts" libelle="À encaisser (crédits)" valeur={montant(tdb.creances)} ton={tdb.creances > 0 ? 'attention' : ''} onClick={peut('ventes.lire') ? () => naviguer('ventes') : undefined} />;
}

export function VentesParJour({ tdb, espace, du, au }) {
  const parJour = Object.fromEntries(tdb.ventes_par_jour.map((v) => [v.jour, v]));
  const series = joursEntre(du, au).map((jour) => ({ jour, total: parJour[jour]?.total ?? 0, nombre: parJour[jour]?.nombre ?? 0 }));
  return (
    <Section titre="Ventes par jour">
      <GraphiqueVentes series={series} montant={espace.montant} />
    </Section>
  );
}

export function MeilleuresVentes({ tdb, espace }) {
  return (
    <Section titre="Meilleures ventes">
      {!tdb.top_articles.length && <EmptyState titre="Pas encore de vente sur la période" />}
      <div className="liste-simple">
        {tdb.top_articles.map((a, i) => (
          <div key={a.libelle} className="liste-ligne">
            <span className="rang">{i + 1}</span>
            <span>{a.libelle}</span>
            <span className="texte-doux">{formatQuantite(a.quantite)}</span>
            <strong>{espace.montant(a.total)}</strong>
          </div>
        ))}
      </div>
    </Section>
  );
}
