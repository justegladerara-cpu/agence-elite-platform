import React, { useState } from 'react';
import { useDonnees, useEspace } from '../../noyau/espace.jsx';
import { Bouton, Champ, DataTable, Erreur, GraphiqueBarres, PageHeader, Section, Squelette, StatCard } from '../../ui/composants.jsx';
import { exporterCsv } from '../../ui/communs.jsx';
import { bornes, PERIODES } from './commun.js';

const AXES = [
  ['jour', 'Par jour'], ['semaine', 'Par semaine'], ['mois', 'Par mois'], ['article', 'Par article'], ['categorie', 'Par catégorie'],
  ['vendeur', 'Par vendeur'], ['client', 'Par client'], ['hub', 'Par Hub'], ['origine', 'Par origine'], ['mode', 'Par mode d’encaissement'],
];
const ORIGINES = { caisse: 'Caisse', facture: 'Facture', boutique: 'Boutique en ligne', restaurant: 'Restaurant', hotel: 'Hôtel', abonnement: 'Abonnement' };
const MODES = { especes: 'Espèces', mobile_money: 'Mobile Money', carte: 'Carte', virement: 'Virement', cheque: 'Chèque' };

// Rapports : analyse des ventes validées sur une période, selon un axe ; comparaison à la période précédente ; export CSV.
export default function Rapports() {
  const { api, etablissement, montant, hubs, multiHub } = useEspace();
  const etab = etablissement.id;
  const [periode, setPeriode] = useState('30');
  const [libre, setLibre] = useState(() => bornes('30'));
  const [axe, setAxe] = useState('jour');
  const [hub, setHub] = useState('');
  const [du, au] = bornes(periode, libre[0], libre[1]);
  const { donnees: r, chargement, erreur } = useDonnees(
    () => api.rpc('rapport_ventes', { p_etablissement_id: etab, p_du: du, p_au: au, p_axe: axe, p_hub_id: hub || null }),
    [etab, du, au, axe, hub],
  );
  const libelle = (l) => (axe === 'origine' ? ORIGINES[l.libelle] ?? l.libelle : axe === 'mode' ? MODES[l.libelle] ?? l.libelle : l.libelle);
  const parArticle = axe === 'article' || axe === 'categorie';
  const t = r?.totaux;
  const tauxMarge = t && Number(t.chiffre_cout_connu) > 0 ? Math.round((Number(t.marge) * 1000) / Number(t.chiffre_cout_connu)) / 10 : null;
  const colonnes = [
    { id: 'libelle', libelle: AXES.find(([id]) => id === axe)[1].replace('Par ', '').replace(/^./, (c) => c.toUpperCase()), rendu: (l) => libelle(l), tri: (l) => (['jour', 'semaine', 'mois'].includes(axe) ? l.cle : libelle(l)) },
    { id: 'nombre', libelle: axe === 'mode' ? 'Paiements' : 'Ventes', classe: 'nombre', rendu: (l) => l.nombre, tri: (l) => l.nombre },
    ...(parArticle ? [{ id: 'quantite', libelle: 'Quantité', classe: 'nombre', rendu: (l) => Number(l.quantite).toLocaleString('fr-FR'), tri: (l) => Number(l.quantite) }] : []),
    { id: 'chiffre', libelle: axe === 'mode' ? 'Encaissé' : 'Chiffre d’affaires', classe: 'nombre', rendu: (l) => montant(l.chiffre), tri: (l) => Number(l.chiffre) },
    ...(parArticle ? [{ id: 'marge', libelle: 'Marge', classe: 'nombre', rendu: (l) => (l.marge == null ? 'coût inconnu' : montant(l.marge)), tri: (l) => Number(l.marge ?? -Infinity) }] : []),
  ];
  const exporter = () => exporterCsv(`rapport-${axe}-${du}-${au}.csv`, [
    { libelle: colonnes[0].libelle, valeur: (l) => libelle(l) },
    { libelle: colonnes[1].libelle, valeur: (l) => l.nombre },
    ...(parArticle ? [{ libelle: 'Quantité', valeur: (l) => String(l.quantite).replace('.', ',') }] : []),
    { libelle: 'Montant', valeur: (l) => String(l.chiffre).replace('.', ',') },
    ...(parArticle ? [{ libelle: 'Marge', valeur: (l) => (l.marge == null ? '' : String(l.marge).replace('.', ',')) }] : []),
  ], r.lignes);
  return (
    <div className="page page-large">
      <PageHeader titre="Rapports" sousTitre="Ventes validées de la période : par jour, article, vendeur, client, Hub, origine ou mode d’encaissement."
        actions={r?.lignes.length > 0 && <Bouton icone="telecharger" onClick={exporter}>Exporter (CSV)</Bouton>} />
      <div className="barre-filtres">
        <select aria-label="Période" value={periode} onChange={(e) => { if (e.target.value === 'libre') setLibre([du, au]); setPeriode(e.target.value); }}>
          {PERIODES.map(([id, l]) => <option key={id} value={id}>{l}</option>)}
        </select>
        {periode === 'libre' && (
          <>
            <Champ libelle="Du"><input type="date" value={libre[0]} max={libre[1]} onChange={(e) => e.target.value && setLibre([e.target.value, libre[1]])} /></Champ>
            <Champ libelle="Au"><input type="date" value={libre[1]} min={libre[0]} onChange={(e) => e.target.value && setLibre([libre[0], e.target.value])} /></Champ>
          </>
        )}
        <select aria-label="Analyse" value={axe} onChange={(e) => setAxe(e.target.value)}>
          {AXES.filter(([id]) => id !== 'hub' || multiHub).map(([id, l]) => <option key={id} value={id}>{l}</option>)}
        </select>
        {multiHub && (
          <select aria-label="Hub" value={hub} onChange={(e) => setHub(e.target.value)}>
            <option value="">Tous les Hubs</option>
            {hubs.map((h) => <option key={h.id} value={h.id}>{h.nom}</option>)}
          </select>
        )}
      </div>
      {erreur && <Erreur message={erreur} />}
      {chargement && !r && <Squelette lignes={8} />}
      {r && (
        <>
          <div className="grille-indicateurs">
            <StatCard icone="ventes" libelle="Chiffre d’affaires" valeur={montant(t.chiffre)}
              detail={t.evolution == null ? 'Pas de ventes la période précédente' : `${t.evolution > 0 ? '+' : ''}${String(t.evolution).replace('.', ',')} % vs période précédente`}
              ton={t.evolution == null ? undefined : t.evolution >= 0 ? 'fort' : 'attention'} />
            <StatCard icone="panier" libelle="Ventes" valeur={t.nombre} detail={`Panier moyen ${montant(t.panier_moyen)}`} />
            <StatCard icone="graphique" libelle="Marge brute" valeur={montant(t.marge)}
              detail={tauxMarge == null ? 'Coûts d’achat non renseignés' : `${String(tauxMarge).replace('.', ',')} % sur les articles au coût connu`} />
          </div>
          <Section titre={AXES.find(([id]) => id === axe)[1]}>
            {['jour', 'semaine', 'mois'].includes(axe) && r.lignes.length > 1 && (
              <GraphiqueBarres libelle="Chiffre d’affaires par période" donnees={r.lignes.slice(-31).map((l) => ({ libelle: l.libelle.replace('Semaine du ', '').slice(0, 5), titre: l.libelle, valeur: Number(l.chiffre) }))} />
            )}
            <DataTable exportable={false} lignes={r.lignes} cle="cle" rechercher={(l) => libelle(l)}
              triInitial={['jour', 'semaine', 'mois'].includes(axe) ? { id: 'libelle', sens: 'asc' } : { id: 'chiffre', sens: 'desc' }}
              vide={<p className="texte-doux">Aucune vente sur la période.</p>} colonnes={colonnes} />
            {parArticle && <p className="texte-doux">Montants des lignes, avant remise globale du ticket. Marge = prix de vente moins coût d’achat enregistré au moment de la vente.</p>}
          </Section>
        </>
      )}
    </div>
  );
}
