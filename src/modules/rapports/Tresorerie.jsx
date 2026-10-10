import React, { useState } from 'react';
import { useDonnees, useEspace } from '../../noyau/espace.jsx';
import { formatDate } from '../../noyau/format.js';
import { Bouton, Champ, DataTable, Erreur, Section, Squelette, StatCard } from '../../ui/composants.jsx';

const SCENARIOS = [['prudent', 'Prudent'], ['central', 'Central'], ['optimiste', 'Optimiste']];
const HYPOTHESES = [
  ['recouvrement', 'Encaissé (%)', 0, 100, 'Part des sommes attendues réellement encaissée'],
  ['retard', 'Retard (jours)', 0, 180, 'Jours ajoutés aux échéances des clients'],
  ['charges', 'Dépenses courantes (%)', 0, 200, 'Par rapport à la moyenne des 90 derniers jours'],
];

// Prévision de trésorerie semaine par semaine, selon trois scénarios réglables. Lecture seule : rien n'est enregistré.
export default function Tresorerie() {
  const { api, etablissement, montant } = useEspace();
  const [solde, setSolde] = useState('0');
  const [semaines, setSemaines] = useState('12');
  const [hypotheses, setHypotheses] = useState(null);
  const [brouillon, setBrouillon] = useState(null);
  const soldeNombre = Number(String(solde).replace(/\s/g, '').replace(',', '.')) || 0;
  const { donnees: p, chargement, erreur } = useDonnees(
    () => api.rpc('prevision_tresorerie', {
      p_etablissement_id: etablissement.id, p_solde_depart: soldeNombre, p_semaines: Number(semaines), p_hypotheses: hypotheses,
    }),
    [etablissement.id, soldeNombre, semaines, JSON.stringify(hypotheses)],
  );
  const lignes = p ? p.scenarios.central.semaines.map((s, i) => ({
    id: s.debut, debut: s.debut,
    encaissements: s.encaissements, decaissements: s.decaissements,
    prudent: p.scenarios.prudent.semaines[i].solde, central: s.solde, optimiste: p.scenarios.optimiste.semaines[i].solde,
  })) : [];
  const soldeCellule = (v) => (Number(v) < 0 ? <strong className="texte-alerte">{montant(v)}</strong> : montant(v));
  const reglages = brouillon ?? (p ? Object.fromEntries(SCENARIOS.map(([k]) => [k, { ...p.scenarios[k].hypotheses }])) : null);
  return (
    <Section titre="Trésorerie prévue" sousTitre="Ce qui devrait entrer et sortir, semaine par semaine, selon trois scénarios. Une estimation, pas un engagement.">
      <div className="barre-filtres">
        <Champ libelle="Trésorerie disponible aujourd’hui" aide="Caisse, banque et Mobile Money">
          <input inputMode="decimal" value={solde} onChange={(e) => setSolde(e.target.value)} />
        </Champ>
        <Champ libelle="Horizon">
          <select value={semaines} onChange={(e) => setSemaines(e.target.value)}>
            {[4, 8, 12, 26, 52].map((n) => <option key={n} value={n}>{n} semaines</option>)}
          </select>
        </Champ>
      </div>
      <Erreur message={erreur} />
      {chargement && !p && <Squelette lignes={6} />}
      {p && (
        <>
          <div className="grille-indicateurs">
            {SCENARIOS.map(([k, l]) => {
              const s = p.scenarios[k];
              return (
                <StatCard key={k} icone="graphique" libelle={`${l} : fin de période`} valeur={montant(s.solde_final)}
                  ton={s.premiere_semaine_negative ? 'alerte' : undefined}
                  detail={s.premiere_semaine_negative ? `Négative dès la semaine du ${formatDate(s.premiere_semaine_negative)}` : `Au plus bas ${montant(s.minimum)}`} />
              );
            })}
          </div>
          <p className="texte-doux">
            Comptés : factures émises à encaisser {montant(p.sources.factures)}
            {Number(p.sources.factures_echues) > 0 ? ` (dont ${montant(p.sources.factures_echues)} déjà échues)` : ''}
            {Number(p.sources.abonnements) > 0 ? `, abonnements ${montant(p.sources.abonnements)}` : ''}
            {Number(p.sources.achats) > 0 ? `, achats à payer ${montant(p.sources.achats)}` : ''}
            , dépenses courantes {montant(p.sources.depenses_mois)} par mois en moyenne. Les ventes au comptoir à venir ne sont pas prévues.
          </p>
          <DataTable lignes={lignes} titreExport={`Trésorerie prévue ${p.debut}`} exportable
            vide={<p className="texte-doux">Rien à prévoir.</p>}
            colonnes={[
              { id: 'debut', libelle: 'Semaine du', rendu: (l) => formatDate(l.debut), tri: (l) => l.debut },
              { id: 'encaissements', libelle: 'Entrées (central)', classe: 'nombre', rendu: (l) => montant(l.encaissements), tri: (l) => Number(l.encaissements) },
              { id: 'decaissements', libelle: 'Sorties (central)', classe: 'nombre', rendu: (l) => montant(l.decaissements), tri: (l) => Number(l.decaissements) },
              ...SCENARIOS.map(([k, l]) => ({ id: k, libelle: `Solde ${l.toLowerCase()}`, classe: 'nombre', rendu: (x) => soldeCellule(x[k]), tri: (x) => Number(x[k]) })),
            ]} />
          <details>
            <summary>Régler les scénarios</summary>
            <form className="formulaire" onSubmit={(e) => { e.preventDefault(); setHypotheses(reglages); setBrouillon(null); }}>
              {SCENARIOS.map(([k, l]) => (
                <fieldset key={k} className="grille-champs">
                  <legend>{l}</legend>
                  {HYPOTHESES.map(([h, libelle, min, max, aide]) => (
                    <Champ key={h} libelle={libelle} aide={aide}>
                      <input type="number" min={min} max={max} value={reglages[k][h]}
                        onChange={(e) => setBrouillon({ ...reglages, [k]: { ...reglages[k], [h]: e.target.value === '' ? '' : Number(e.target.value) } })} />
                    </Champ>
                  ))}
                </fieldset>
              ))}
              <div className="actions">
                <Bouton type="button" onClick={() => { setHypotheses(null); setBrouillon(null); }}>Valeurs par défaut</Bouton>
                <Bouton type="submit" variante="principal">Recalculer</Bouton>
              </div>
            </form>
          </details>
        </>
      )}
    </Section>
  );
}
