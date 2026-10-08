import { useMemo, useState } from 'react';
import { useDonnees, useEspace } from '../../noyau/espace.jsx';
import { lireParametres } from '../../noyau/routes.js';
import { dateLocale, formatDate } from '../../noyau/format.js';
import { Badge, Bouton, DataTable, EmptyState, Erreur, Icone, PageHeader, Squelette, StatCard, Tabs } from '../../ui/composants.jsx';
import { exporterCsv } from '../../ui/communs.jsx';
import { etatDocument, TYPES_DOCUMENT } from './commun.js';
import DocumentVente from './Document.jsx';
import EditeurDocument from './Editeur.jsx';

const ONGLETS = [['facture', 'Factures'], ['devis', 'Devis'], ['avoir', 'Avoirs']];

function Liste({ naviguer }) {
  const { api, etablissement, peut, montant } = useEspace();
  // Liens profonds : ?onglet=facture|devis|avoir, ?du=…&au=… (dates ISO, bornes incluses).
  const [onglet, setOnglet] = useState(() => {
    const p = lireParametres();
    const o = p.get('onglet');
    if (ONGLETS.some(([k]) => k === o)) return o;
    return ['Envoyé', 'Accepté', 'Expiré', 'Refusé', 'Facturé'].includes(p.get('etat')) ? 'devis' : 'facture';
  });
  const [periode, setPeriode] = useState(() => {
    const p = lireParametres();
    const du = p.get('du') || null;
    const au = p.get('au') || null;
    return du || au ? { du, au } : null;
  });
  const aujourdhui = dateLocale();
  const { donnees, chargement, erreur } = useDonnees(async () => {
    const [documents, contacts, ventes, tdb] = await Promise.all([
      api.lire('documents_vente', { eq: { etablissement_id: etablissement.id }, ordre: ['cree_le', 'desc'], limite: 2000 }),
      api.lire('contacts', { eq: { etablissement_id: etablissement.id }, colonnes: ['id', 'nom', 'societe'] }),
      api.lire('ventes', { eq: { etablissement_id: etablissement.id, origine: 'facture' }, colonnes: ['id', 'total', 'montant_paye', 'statut_paiement', 'statut'] }).catch(() => []),
      api.rpc('tableau_de_bord_facturation', { p_etablissement_id: etablissement.id }),
    ]);
    return {
      documents, tdb,
      contact: Object.fromEntries(contacts.map((c) => [c.id, c])),
      vente: Object.fromEntries(ventes.map((v) => [v.id, v])),
    };
  }, [etablissement.id]);
  const lignes = useMemo(() => (donnees?.documents ?? []).filter((d) => d.type === onglet
    && (!periode || ((!periode.du || d.date_document >= periode.du) && (!periode.au || d.date_document <= periode.au)))), [donnees, onglet, periode]);
  const nomClient = (d) => donnees.contact[d.contact_id]?.societe || donnees.contact[d.contact_id]?.nom || '—';
  const etat = (d) => etatDocument(d, donnees.vente[d.vente_id], aujourdhui);
  const reste = (d) => {
    const v = donnees.vente[d.vente_id];
    return v && v.statut === 'validee' ? v.total - v.montant_paye : 0;
  };
  return (
    <div className="page">
      <PageHeader
        titre="Devis et factures"
        sousTitre="Du devis au paiement, avec avoirs tracés"
        actions={peut('facturation.gerer') && (
          <>
            <Bouton icone="plus" onClick={() => naviguer('factures/nouveau-devis')}>Nouveau devis</Bouton>
            <Bouton variante="principal" icone="plus" onClick={() => naviguer('factures/nouvelle-facture')}>Nouvelle facture</Bouton>
          </>
        )}
      />
      {chargement && !donnees && <Squelette lignes={6} />}
      <Erreur message={erreur} />
      {donnees && (
        <>
          <div className="grille-stats">
            <StatCard icone="ventes" libelle="À encaisser" valeur={montant(donnees.tdb.a_encaisser)} detail={`${donnees.tdb.factures_ouvertes} facture(s) ouverte(s)`} />
            <StatCard icone="alerte" libelle="En retard" valeur={montant(donnees.tdb.en_retard)} detail={`${donnees.tdb.nb_en_retard} facture(s)`} ton={donnees.tdb.nb_en_retard ? 'alerte' : undefined} />
            <StatCard icone="facture" libelle="Facturé ce mois" valeur={montant(donnees.tdb.facture_mois)} />
            <StatCard icone="document" libelle="Devis en cours" valeur={donnees.tdb.devis_ouverts} detail={donnees.tdb.taux_conversion != null ? `${donnees.tdb.taux_conversion} % acceptés` : undefined} />
          </div>
          <Tabs onglets={ONGLETS.map(([k, l]) => [k, l, donnees.documents.filter((d) => d.type === k).length])} actif={onglet} onChange={setOnglet} />
          {periode && (
            <div>
              <button type="button" className="puce-filtre" onClick={() => setPeriode(null)} aria-label="Retirer le filtre de période">
                {periode.du && periode.au ? `Du ${formatDate(periode.du)} au ${formatDate(periode.au)}` : periode.du ? `Depuis le ${formatDate(periode.du)}` : `Jusqu’au ${formatDate(periode.au)}`}
                <Icone nom="fermer" taille={14} />
              </button>
            </div>
          )}
          <DataTable
            key={onglet}
            colonnes={[
              { id: 'numero', libelle: 'Numéro', tri: (d) => d.numero ?? '', rendu: (d) => <strong>{d.numero ?? <span className="texte-faible">Brouillon</span>}</strong> },
              { id: 'client', libelle: 'Client', tri: nomClient, rendu: nomClient },
              { id: 'date', libelle: 'Date', tri: (d) => d.date_document, rendu: (d) => formatDate(d.date_document) },
              ...(onglet !== 'avoir' ? [{ id: 'echeance', libelle: onglet === 'devis' ? 'Validité' : 'Échéance', tri: (d) => d.echeance ?? '', rendu: (d) => (d.echeance ? formatDate(d.echeance) : '—') }] : []),
              { id: 'total', libelle: 'Total', tri: (d) => Number(d.total_ttc), rendu: (d) => montant(d.total_ttc), classe: 'nombre' },
              ...(onglet === 'facture' ? [{ id: 'reste', libelle: 'Reste dû', tri: reste, rendu: (d) => (reste(d) > 0 ? montant(reste(d)) : '—'), classe: 'nombre' }] : []),
              { id: 'etat', libelle: 'État', tri: (d) => etat(d)[0], rendu: (d) => <Badge ton={etat(d)[1]}>{etat(d)[0]}</Badge> },
            ]}
            lignes={lignes}
            rechercher={(d) => `${d.numero ?? ''} ${nomClient(d)} ${d.objet ?? ''}`}
            placeholder="Numéro, client ou objet"
            filtres={[{ id: 'etat', libelle: 'État', options: [...new Set(lignes.map((d) => etat(d)[0]))].map((x) => [x, x]), appliquer: (d, v) => etat(d)[0] === v }]}
            triInitial={{ id: 'date', sens: 'desc' }}
            onLigne={(d) => naviguer(`factures/${d.id}`)}
            actions={(
              <Bouton icone="telecharger" onClick={() => exporterCsv(`${onglet}s.csv`, [
                { libelle: 'Numéro', valeur: (d) => d.numero ?? 'brouillon' }, { libelle: 'Client', valeur: nomClient },
                { libelle: 'Date', valeur: (d) => d.date_document }, { libelle: 'Échéance', valeur: (d) => d.echeance },
                { libelle: 'Total HT', valeur: (d) => String(d.total_ht).replace('.', ',') }, { libelle: 'TVA', valeur: (d) => String(d.total_tva).replace('.', ',') },
                { libelle: 'Total TTC', valeur: (d) => String(d.total_ttc).replace('.', ',') }, { libelle: 'Reste dû', valeur: (d) => String(reste(d)).replace('.', ',') },
                { libelle: 'État', valeur: (d) => etat(d)[0] },
              ], lignes)}>Exporter</Bouton>
            )}
            vide={(
              <EmptyState
                titre={`Aucun ${TYPES_DOCUMENT[onglet].toLowerCase()}`}
                icone="facture"
                texte={onglet === 'avoir' ? 'Un avoir naît de l’annulation d’une facture émise.' : undefined}
                action={peut('facturation.gerer') && onglet !== 'avoir' && (
                  <Bouton variante="principal" icone="plus" onClick={() => naviguer(onglet === 'devis' ? 'factures/nouveau-devis' : 'factures/nouvelle-facture')}>
                    {onglet === 'devis' ? 'Nouveau devis' : 'Nouvelle facture'}
                  </Bouton>
                )}
              />
            )}
          />
        </>
      )}
    </div>
  );
}

export default function Factures({ naviguer, sousRoute }) {
  const [premier, second] = (sousRoute ?? '').split('/');
  if (premier === 'nouveau-devis') return <EditeurDocument type="devis" naviguer={naviguer} />;
  if (premier === 'nouvelle-facture') return <EditeurDocument type="facture" naviguer={naviguer} />;
  if (premier && second === 'modifier') return <EditeurDocument documentId={premier} naviguer={naviguer} />;
  if (premier) return <DocumentVente key={premier} documentId={premier} naviguer={naviguer} />;
  return <Liste naviguer={naviguer} />;
}
