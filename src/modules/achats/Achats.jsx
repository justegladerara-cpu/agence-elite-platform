import React, { useMemo, useState } from 'react';
import { useDonnees, useEspace } from '../../noyau/espace.jsx';
import { lireParametres } from '../../noyau/routes.js';
import { dateLocale, formatDate, formatQuantite } from '../../noyau/format.js';
import { Badge, Bouton, DataTable, EmptyState, Erreur, PageHeader, Section, Squelette, StatCard, Tabs } from '../../ui/composants.jsx';
import { exporterCsv } from '../../ui/communs.jsx';
import CommandeAchat from './Commande.jsx';
import EditeurCommande from './Editeur.jsx';
import { etatCommande, resteAPayer } from './commun.js';

const ONGLETS = [['en_cours', 'En cours'], ['demandes', 'Demandes'], ['a_payer', 'À payer'], ['toutes', 'Toutes'], ['reappro', 'Réapprovisionnement']];
// Onglet ouvert par un lien profond : ?onglet=…, ?vue=paiements (dettes fournisseurs) ou l'onglet qui contient ?etat=….
function ongletInitial(p) {
  const o = p.get('onglet');
  if (ONGLETS.some(([k]) => k === o)) return o;
  if (p.get('vue') === 'paiements') return 'a_payer';
  const etat = p.get('etat');
  if (etat === 'Demande') return 'demandes';
  if (etat && !['Brouillon', 'Envoyée', 'Livraison en retard', 'Reçue en partie'].includes(etat)) return 'toutes';
  return 'en_cours';
}
const FILTRES = {
  en_cours: (c) => ['brouillon', 'envoyee', 'partielle'].includes(c.statut),
  demandes: (c) => c.statut === 'demande',
  a_payer: (c) => c.statut !== 'annulee' && resteAPayer(c) > 0,
  toutes: () => true,
};

function Reapprovisionnement({ suggestions, naviguer }) {
  const { montant, peut } = useEspace();
  const parHub = useMemo(() => suggestions.reduce((m, s) => ({ ...m, [s.hub_id]: [...(m[s.hub_id] ?? []), s] }), {}), [suggestions]);
  if (!suggestions.length) return <EmptyState icone="coche" titre="Aucun article sous son stock minimum" texte="Fixez un stock minimum sur les fiches articles pour recevoir des suggestions." />;
  const commander = (liste) => naviguer(peut('achats.gerer') ? 'achats/nouveau' : 'achats/nouvelle-demande', {
    hub_id: liste[0].hub_id,
    lignes: liste.map((s) => ({ article_id: s.article_id, quantite: Math.max(1, Number(s.minimum) * 2 - Number(s.stock) - Number(s.en_commande)) })),
  });
  return Object.values(parHub).map((liste) => (
    <Section
      key={liste[0].hub_id}
      titre={liste[0].hub}
      action={(peut('achats.gerer') || peut('achats.demander')) && (
        <Bouton icone="panier" onClick={() => commander(liste)}>{peut('achats.gerer') ? 'Préparer la commande' : 'Faire une demande'}</Bouton>
      )}
    >
      <div className="liste-simple">
        {liste.map((s) => (
          <div key={s.article_id} className="liste-ligne">
            <span><strong>{s.nom}</strong>{s.reference ? ` · ${s.reference}` : ''}
              <small className="texte-doux bloc">Stock {formatQuantite(s.stock)} pour un minimum de {formatQuantite(s.minimum)}{Number(s.en_commande) > 0 ? ` · ${formatQuantite(s.en_commande)} déjà en commande` : ''}</small>
            </span>
            {s.cout != null && <span className="texte-doux">{montant(s.cout)} / unité</span>}
          </div>
        ))}
      </div>
    </Section>
  ));
}

function Liste({ naviguer }) {
  const { api, etablissement, peut, montant, hubs, multiHub } = useEspace();
  const [onglet, setOnglet] = useState(() => ongletInitial(lireParametres()));
  const aujourdhui = dateLocale();
  const { donnees, chargement, erreur } = useDonnees(async () => {
    const [commandes, contacts, tdb, suggestions] = await Promise.all([
      api.lire('commandes_achat', { eq: { etablissement_id: etablissement.id }, ordre: ['cree_le', 'desc'], limite: 2000 }),
      api.lire('contacts', { eq: { etablissement_id: etablissement.id }, colonnes: ['id', 'nom', 'societe'] }),
      peut('achats.lire') ? api.rpc('tableau_de_bord_achats', { p_etablissement_id: etablissement.id }) : null,
      peut('achats.lire') ? api.rpc('suggestions_achat', { p_etablissement_id: etablissement.id }) : [],
    ]);
    return { commandes, tdb, suggestions, contact: Object.fromEntries(contacts.map((c) => [c.id, c])) };
  }, [etablissement.id]);
  const lignes = useMemo(() => (onglet === 'reappro' ? [] : (donnees?.commandes ?? []).filter(FILTRES[onglet])), [donnees, onglet]);
  const fournisseur = (c) => donnees.contact[c.fournisseur_id]?.societe || donnees.contact[c.fournisseur_id]?.nom || '—';
  const hubNom = (c) => hubs.find((h) => h.id === c.hub_id)?.nom ?? '—';
  const etat = (c) => etatCommande(c, aujourdhui);
  const nouvelle = peut('achats.gerer') ? 'achats/nouveau' : 'achats/nouvelle-demande';
  return (
    <div className="page">
      <PageHeader
        titre="Achats"
        sousTitre="Demandes, commandes fournisseurs, réceptions en stock et paiements"
        actions={(
          <>
            <Bouton icone="echeance" onClick={() => naviguer('a-qui-je-dois')}>À qui je dois ?</Bouton>
            {peut('achats.demander') && peut('achats.gerer') &&<Bouton icone="plus" onClick={() => naviguer('achats/nouvelle-demande')}>Demande d’achat</Bouton>}
            {(peut('achats.gerer') || peut('achats.demander')) && (
              <Bouton variante="principal" icone="plus" onClick={() => naviguer(nouvelle)}>{peut('achats.gerer') ? 'Nouvelle commande' : 'Demande d’achat'}</Bouton>
            )}
          </>
        )}
      />
      {chargement && !donnees && <Squelette lignes={6} />}
      <Erreur message={erreur} />
      {donnees && (
        <>
          {donnees.tdb && (
            <div className="grille-stats">
              <StatCard icone="ventes" libelle="Dû aux fournisseurs" valeur={montant(donnees.tdb.du_fournisseurs)} detail={Number(donnees.tdb.du_en_retard) ? `dont ${montant(donnees.tdb.du_en_retard)} en retard` : undefined} ton={Number(donnees.tdb.du_en_retard) ? 'alerte' : undefined} onClick={() => setOnglet('a_payer')} />
              <StatCard icone="camion" libelle="À recevoir" valeur={donnees.tdb.a_recevoir} detail={donnees.tdb.en_retard_livraison ? `${donnees.tdb.en_retard_livraison} en retard` : 'commande(s) envoyée(s)'} onClick={() => setOnglet('en_cours')} />
              <StatCard icone="document" libelle="Demandes à traiter" valeur={donnees.tdb.demandes} onClick={() => setOnglet('demandes')} />
              <StatCard icone="alerte" libelle="Sous le minimum" valeur={donnees.tdb.sous_minimum} detail="article(s) par Hub" onClick={() => setOnglet('reappro')} ton={donnees.tdb.sous_minimum ? 'alerte' : undefined} />
            </div>
          )}
          <Tabs
            onglets={ONGLETS.map(([k, l]) => [k, l, k === 'reappro' ? donnees.suggestions.length : donnees.commandes.filter(FILTRES[k]).length])}
            actif={onglet}
            onChange={setOnglet}
          />
          {onglet === 'reappro' ? <Reapprovisionnement suggestions={donnees.suggestions} naviguer={naviguer} /> : (
            <DataTable exportable={false}
              key={onglet}
              colonnes={[
                { id: 'numero', libelle: 'Numéro', tri: (c) => c.numero, rendu: (c) => <strong>{c.numero}</strong> },
                { id: 'fournisseur', libelle: 'Fournisseur', tri: fournisseur, rendu: fournisseur },
                ...(multiHub ? [{ id: 'hub', libelle: 'Hub', tri: hubNom, rendu: hubNom }] : []),
                { id: 'date', libelle: 'Date', tri: (c) => c.date_commande, rendu: (c) => formatDate(c.date_commande) },
                { id: 'total', libelle: 'Total', tri: (c) => Number(c.total), rendu: (c) => montant(c.total), classe: 'nombre' },
                { id: 'reste', libelle: 'Reste dû', tri: resteAPayer, rendu: (c) => (resteAPayer(c) > 0 ? montant(resteAPayer(c)) : '—'), classe: 'nombre' },
                ...(onglet === 'a_payer' ? [{
                  id: 'echeance', libelle: 'À payer avant le', tri: (c) => c.echeance ?? '9999-12-31',
                  rendu: (c) => (c.echeance ? <span className={c.echeance < aujourdhui ? 'texte-alerte' : ''}>{formatDate(c.echeance)}</span> : '—'),
                }] : []),
                { id: 'etat', libelle: 'État', tri: (c) => etat(c)[0], rendu: (c) => <Badge ton={etat(c)[1]}>{etat(c)[0]}</Badge> },
              ]}
              lignes={lignes}
              rechercher={(c) => `${c.numero} ${fournisseur(c)} ${c.reference_fournisseur ?? ''}`}
              placeholder="Numéro, fournisseur ou référence"
              filtres={[{ id: 'etat', libelle: 'État', options: [...new Set(lignes.map((c) => etat(c)[0]))].map((x) => [x, x]), appliquer: (c, v) => etat(c)[0] === v }]}
              triInitial={{ id: 'date', sens: 'desc' }}
              onLigne={(c) => naviguer(`achats/${c.id}`)}
              actions={(
                <Bouton icone="telecharger" onClick={() => exporterCsv('achats.csv', [
                  { libelle: 'Numéro', valeur: (c) => c.numero }, { libelle: 'Fournisseur', valeur: fournisseur }, { libelle: 'Hub', valeur: hubNom },
                  { libelle: 'Date', valeur: (c) => c.date_commande }, { libelle: 'Échéance', valeur: (c) => c.echeance },
                  { libelle: 'Total', valeur: (c) => String(c.total).replace('.', ',') }, { libelle: 'Reçu', valeur: (c) => String(c.montant_recu).replace('.', ',') },
                  { libelle: 'Payé', valeur: (c) => String(c.montant_paye).replace('.', ',') }, { libelle: 'État', valeur: (c) => etat(c)[0] },
                ], lignes)}>Exporter</Bouton>
              )}
              vide={<EmptyState icone="panier" titre="Rien ici" texte={onglet === 'demandes' ? 'Les demandes d’achat de l’équipe apparaissent ici pour approbation.' : undefined} />}
            />
          )}
        </>
      )}
    </div>
  );
}

// Le pré-remplissage (suggestions → commande) passe par l'état de navigation en mémoire.
let preRemplissage = null;

export default function Achats({ naviguer, sousRoute }) {
  const { peut } = useEspace();
  // ?nouveau=1 : nouvelle commande (ou demande sans droit de gestion) ; ?nouveau=demande : demande d'achat.
  const [nouveau] = useState(() => {
    const n = lireParametres().get('nouveau');
    if (n === 'demande') return peut('achats.demander') ? 'nouvelle-demande' : null;
    if (n === '1') return peut('achats.gerer') ? 'nouveau' : peut('achats.demander') ? 'nouvelle-demande' : null;
    return null;
  });
  const [premier, second] = (sousRoute || nouveau || '').split('/');
  const aller = (route, prefill) => {
    preRemplissage = prefill ?? null;
    naviguer(route);
  };
  if (premier === 'nouveau' || premier === 'nouvelle-demande') {
    const prefill = preRemplissage;
    preRemplissage = null;
    return <EditeurCommande key={premier} demande={premier === 'nouvelle-demande'} prefill={prefill} naviguer={naviguer} />;
  }
  if (premier && second === 'modifier') return <EditeurCommande commandeId={premier} naviguer={naviguer} />;
  if (premier) return <CommandeAchat key={premier} commandeId={premier} naviguer={naviguer} />;
  return <Liste naviguer={aller} />;
}
