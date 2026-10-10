import React from 'react';
import { formatMontant } from '../noyau/format.js';

// Chiffres d'un bilan de collaboration (calculés par la base pour les modules actifs), lus par l'équipe et le client.
export function lignesBilan(c) {
  const devise = c?.devise;
  const lignes = [];
  if (c?.facturation) {
    const f = c.facturation;
    lignes.push(['Factures émises', `${f.factures} · ${formatMontant(f.facture, devise)}`]);
    if (Number(f.avoirs) > 0) lignes.push(['Avoirs', formatMontant(f.avoirs, devise)]);
    lignes.push(['Paiements reçus', formatMontant(f.encaisse, devise)]);
    lignes.push(['Reste à payer aujourd’hui', formatMontant(f.reste_du, devise)]);
    if (f.devis_acceptes > 0) lignes.push(['Devis acceptés', String(f.devis_acceptes)]);
  }
  if (c?.projets) {
    lignes.push(['Projets terminés', String(c.projets.termines)]);
    if (c.projets.en_cours > 0) lignes.push(['Projets en cours', String(c.projets.en_cours)]);
    if (c.projets.livrables_valides > 0) lignes.push(['Livrables validés', String(c.projets.livrables_valides)]);
  }
  if (c?.support && (c.support.ouverts > 0 || c.support.resolus > 0)) {
    lignes.push(['Demandes d’assistance', `${c.support.ouverts} ouvertes · ${c.support.resolus} résolues`]);
    if (c.support.delai_moyen_heures != null) lignes.push(['Délai moyen de résolution', `${Number(c.support.delai_moyen_heures).toLocaleString('fr-FR')} h`]);
  }
  if (c?.agenda && c.agenda.rendez_vous > 0) lignes.push(['Rendez-vous tenus', String(c.agenda.rendez_vous)]);
  if (c?.echanges && c.echanges.messages > 0) lignes.push(['Messages échangés', String(c.echanges.messages)]);
  return lignes;
}

export default function ChiffresBilan({ chiffres }) {
  const lignes = lignesBilan(chiffres);
  if (!lignes.length) return <p className="texte-doux">Aucune activité chiffrée sur la période.</p>;
  return (
    <dl className="details">
      {lignes.map(([l, v]) => <div key={l}><dt>{l}</dt><dd>{v}</dd></div>)}
    </dl>
  );
}
