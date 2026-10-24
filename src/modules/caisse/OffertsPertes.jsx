import React, { useState } from 'react';
import { useDonnees, useEspace } from '../../noyau/espace.jsx';
import { dateLocale, formatDate, formatDateHeure, formatQuantite } from '../../noyau/format.js';
import { Bouton, Champ, EmptyState, Erreur, PageHeader, Section, Squelette, StatCard } from '../../ui/composants.jsx';
import { exporterCsv } from '../../ui/communs.jsx';
import { BandeauNouveau, NOUVEAU_LOT3_JUSQUA } from '../../ui/Nouveau.jsx';
import './caisse.css';

const PERIODES = [['Aujourd’hui', 0], ['7 jours', 6], ['30 jours', 29]];

// Ventes mises sur le compte de la maison entre deux dates (jour de l'opération), avec le numéro de la vente.
export async function lireCompteMaison(api, etablissementId, du, au) {
  const lignes = await api.lire('ventes_compte_maison', {
    eq: { etablissement_id: etablissementId }, gte: { cree_le: new Date(`${du}T00:00:00`).toISOString() },
    lte: { cree_le: new Date(`${au}T23:59:59.999`).toISOString() }, ordre: ['cree_le', 'desc'],
  }).catch(() => []);
  const actives = (lignes ?? []).filter((m) => !m.annule_le);
  if (!actives.length) return [];
  const ventes = await api.lire('ventes', { eq: { etablissement_id: etablissementId }, dans: { id: actives.map((m) => m.vente_id) }, colonnes: ['id', 'numero'] }).catch(() => []);
  const numero = Object.fromEntries((ventes ?? []).map((v) => [v.id, v.numero]));
  return actives.map((m) => ({ ...m, numero: numero[m.vente_id] ?? '—' }));
}

function Tableau({ colonnes, lignes, vide }) {
  if (!lignes.length) return <p className="texte-doux">{vide}</p>;
  return (
    <div className="tableau-conteneur">
      <table className="tableau">
        <thead><tr>{colonnes.map((c) => <th key={c.libelle} className={c.nombre ? 'nombre' : undefined}>{c.libelle}</th>)}</tr></thead>
        <tbody>
          {lignes.map((l, i) => (
            // eslint-disable-next-line react/no-array-index-key
            <tr key={i}>{colonnes.map((c) => <td key={c.libelle} className={c.nombre ? 'nombre' : undefined}>{c.rendu(l)}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// « Offerts et pertes » : ce que la maison a donné, remis ou perdu sur une période, et les ventes mises sur le compte
// de la maison (migration 20261024040000). Données : rapport_offerts_pertes (migration 20261017000135) ; les ventes
// annulées ne comptent pas. Les pourboires ne sont plus montrés : c'est l'argent des serveurs (Juste, 2026-10-24).
// integre : affiché dans « Ticket Z et rapports » (pas de grand titre).
export default function OffertsPertes({ integre = false }) {
  const { api, etablissement, montant } = useEspace();
  const [du, setDu] = useState(() => dateLocale());
  const [au, setAu] = useState(() => dateLocale());
  const { donnees, chargement, erreur } = useDonnees(async () => {
    const [rapport, maison] = await Promise.all([
      api.rpc('rapport_offerts_pertes', { p_etablissement_id: etablissement.id, p_du: du, p_au: au }),
      lireCompteMaison(api, etablissement.id, du, au),
    ]);
    return { ...rapport, maison };
  }, [etablissement.id, du, au]);
  const raison = (o) => (o.precision ? (o.raison === 'Autre' ? o.precision : `${o.raison} : ${o.precision}`) : o.raison);
  const r = donnees;
  return (
    <div className="page">
      {!integre && <PageHeader titre="Offerts et pertes" sousTitre="Ce qui a été offert, mis sur le compte de la maison, remisé ou perdu" />}
      {!integre && (
        <BandeauNouveau jusqua={NOUVEAU_LOT3_JUSQUA}>
          Chaque offert garde sa raison et la personne qui l’a offert. Les pertes viennent de Stock › « J’ai perdu / cassé / périmé ».
        </BandeauNouveau>
      )}
      <Section>
        <div className="puces" role="group" aria-label="Période">
          {PERIODES.map(([libelle, jours]) => (
            <button key={libelle} type="button" className={du === dateLocale(-jours) && au === dateLocale() ? 'actif' : ''}
              onClick={() => { setDu(dateLocale(-jours)); setAu(dateLocale()); }}>{libelle}</button>
          ))}
        </div>
        <div className="grille-champs">
          <Champ libelle="Du"><input type="date" value={du} max={au} onChange={(e) => e.target.value && setDu(e.target.value)} /></Champ>
          <Champ libelle="Au"><input type="date" value={au} min={du} onChange={(e) => e.target.value && setAu(e.target.value)} /></Champ>
        </div>
      </Section>
      {chargement && !r && <Squelette lignes={6} />}
      <Erreur message={erreur} />
      {r && (
        <>
          <div className="grille-stats">
            <StatCard icone="etoile" libelle="Offerts" valeur={montant(r.totaux.offerts)} detail={`${r.offerts.length} ligne(s), au prix de vente`} />
            <StatCard icone="ventes" libelle="Remises" valeur={montant(r.totaux.remises)} detail={`${r.remises.length} remise(s), happy hour compris`} />
            <StatCard icone="alerte" libelle="Pertes" valeur={montant(r.totaux.pertes)} detail={`${r.pertes.length} retrait(s), au prix d’achat`} ton={r.pertes.length ? 'alerte' : undefined} />
            <StatCard icone="etoile" libelle="Compte de la maison" valeur={montant(r.maison.reduce((t, m) => t + Number(m.montant), 0))} detail={`${r.maison.length} vente(s) sans paiement attendu`} />
          </div>
          {!r.offerts.length && !r.remises.length && !r.pertes.length && !r.maison.length && (
            <EmptyState icone="coche" titre="Rien sur cette période" texte="Aucun offert, aucune remise, aucune perte." />
          )}
          {r.maison.length > 0 && (
            <Section titre="Mis sur le compte de la maison" sousTitre="Ventes à crédit offertes par le patron : aucun paiement n’est attendu">
              <Tableau
                vide=""
                lignes={r.maison}
                colonnes={[
                  { libelle: 'Quand', rendu: (m) => formatDateHeure(m.cree_le) },
                  { libelle: 'Vente', rendu: (m) => <strong>{m.numero}</strong> },
                  { libelle: 'Pour qui', rendu: (m) => <>{m.pour_qui}{m.note && <small className="texte-doux bloc">{m.note}</small>}</> },
                  { libelle: 'Montant', nombre: true, rendu: (m) => montant(m.montant) },
                ]}
              />
            </Section>
          )}
          <Section titre="Offerts" sousTitre="Qui a offert quoi, pourquoi, et combien cela vaut au prix de vente"
            action={r.offerts.length > 0 && (
              <Bouton icone="telecharger" onClick={() => exporterCsv(`offerts-${du}-${au}.csv`, [
                { libelle: 'Date', valeur: (o) => formatDateHeure(o.quand) }, { libelle: 'Vente', valeur: (o) => o.vente },
                { libelle: 'Article', valeur: (o) => o.article }, { libelle: 'Quantité', valeur: (o) => String(o.quantite).replace('.', ',') },
                { libelle: 'Valeur', valeur: (o) => String(o.valeur).replace('.', ',') }, { libelle: 'Raison', valeur: raison },
                { libelle: 'Offert par', valeur: (o) => o.par },
              ], r.offerts)}>Exporter</Bouton>
            )}>
            <Tableau
              vide="Aucun offert sur la période."
              lignes={r.offerts}
              colonnes={[
                { libelle: 'Quand', rendu: (o) => formatDateHeure(o.quand) },
                { libelle: 'Article', rendu: (o) => <><strong>{o.article}</strong> × {formatQuantite(o.quantite)}<small className="texte-doux bloc">{o.vente}</small></> },
                { libelle: 'Raison', rendu: raison },
                { libelle: 'Offert par', rendu: (o) => o.par },
                { libelle: 'Valeur', nombre: true, rendu: (o) => montant(o.valeur) },
              ]}
            />
          </Section>
          <Section titre="Remises" sousTitre="Lignes vendues moins cher (happy hour compris) et remises sur le ticket">
            <Tableau
              vide="Aucune remise sur la période."
              lignes={r.remises}
              colonnes={[
                { libelle: 'Quand', rendu: (x) => formatDateHeure(x.quand) },
                { libelle: 'Article', rendu: (x) => <><strong>{x.article}</strong>{x.quantite != null ? ` × ${formatQuantite(x.quantite)}` : ''}<small className="texte-doux bloc">{x.vente}</small></> },
                { libelle: 'Vendu par', rendu: (x) => x.par },
                { libelle: 'Remise', nombre: true, rendu: (x) => montant(x.valeur) },
              ]}
            />
          </Section>
          <Section titre="Pertes" sousTitre="Stock retiré : perdu, cassé, périmé…">
            <Tableau
              vide="Aucune perte sur la période."
              lignes={r.pertes}
              colonnes={[
                { libelle: 'Quand', rendu: (x) => formatDateHeure(x.quand) },
                { libelle: 'Article', rendu: (x) => <><strong>{x.article}</strong> × {formatQuantite(x.quantite)}</> },
                { libelle: 'Raison', rendu: (x) => x.motif || '—' },
                { libelle: 'Par', rendu: (x) => x.par },
                { libelle: 'Valeur', nombre: true, rendu: (x) => (x.valeur == null ? 'Coût inconnu' : montant(x.valeur)) },
              ]}
            />
          </Section>
        </>
      )}
    </div>
  );
}
