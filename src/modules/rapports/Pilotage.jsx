import React, { useState } from 'react';
import { useDonnees, useEspace } from '../../noyau/espace.jsx';
import { formatDate } from '../../noyau/format.js';
import { Badge, Champ, DataTable, Erreur, Onglets, PageHeader, Section, Squelette, StatCard } from '../../ui/composants.jsx';
import { SOURCES } from '../crm/commun.js';
import { bornes, libellePrevision, PERIODES, RAISONS_RISQUE, totauxPrevision } from './commun.js';

const nombre = (n) => (n == null ? '—' : Number(n).toLocaleString('fr-FR'));
const canal = (c) => (c === 'non_renseigne' ? 'Origine non renseignée' : SOURCES[c] ?? c);

// Pilotage : rentabilité par client et par canal, prévision pondérée, opportunités sans prochaine action, charge par
// personne, engagements à risque. Chaque onglet n'apparaît que si le module correspondant est actif et lisible.
export default function Pilotage({ naviguer }) {
  const { api, etablissement, montant } = useEspace();
  const [periode, setPeriode] = useState('30');
  const [libre, setLibre] = useState(() => bornes('30'));
  const [du, au] = bornes(periode, libre[0], libre[1]);
  const [onglet, setOnglet] = useState('clients');
  const { donnees: r, chargement, erreur } = useDonnees(
    () => api.rpc('rapport_pilotage', { p_etablissement_id: etablissement.id, p_du: du, p_au: au }),
    [etablissement.id, du, au],
  );
  const onglets = r ? [
    ['clients', 'Rentabilité client'], ['canaux', 'Par canal'],
    r.prevision && ['prevision', 'Prévision'], r.sans_action && ['sans_action', `Sans prochaine action (${r.sans_action.length})`],
    r.charge && ['charge', 'Charge par personne'], r.engagements && ['engagements', `Engagements à risque (${r.engagements.length})`],
  ].filter(Boolean) : [];
  const actif = onglets.some(([id]) => id === onglet) ? onglet : 'clients';
  const prev = totauxPrevision(r?.prevision ?? []);
  const impayes = (r?.clients ?? []).reduce((s, c) => s + Number(c.reste_du_echu ?? 0), 0);
  return (
    <div className="page page-large">
      <PageHeader titre="Pilotage" sousTitre="Ce qui rapporte, ce qui arrive et ce qui risque de se perdre : clients, canaux, pipeline, équipe, engagements." />
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
      </div>
      {erreur && <Erreur message={erreur} />}
      {chargement && !r && <Squelette lignes={8} />}
      {r && (
        <>
          <div className="grille-indicateurs">
            <StatCard icone="clients" libelle="Clients qui ont acheté" valeur={r.clients.filter((c) => Number(c.chiffre) > 0).length}
              detail={`${montant(r.clients.reduce((s, c) => s + Number(c.chiffre), 0))} sur la période`} onClick={() => setOnglet('clients')} />
            {r.prevision && <StatCard icone="cible" libelle="Prévision pondérée" valeur={montant(prev.a_venir)} detail={`Pipeline ouvert ${montant(prev.montant)}`} onClick={() => setOnglet('prevision')} />}
            {r.clients[0]?.reste_du_echu != null && <StatCard icone="echeance" libelle="Reste dû échu" valeur={montant(impayes)} ton={impayes > 0 ? 'attention' : undefined} detail="Factures échues non soldées, aujourd’hui" />}
            {r.engagements && <StatCard icone="alerte" libelle="Engagements à risque" valeur={r.engagements.length} ton={r.engagements.length ? 'attention' : undefined} onClick={() => setOnglet('engagements')} />}
          </div>
          <Onglets onglets={onglets} actif={actif} onChange={setOnglet} />
          {actif === 'clients' && (
            <Section titre="Rentabilité par client" sousTitre="Ventes validées de la période. Marge = prix moins coût d’achat, sur les lignes dont le coût est connu.">
              <DataTable lignes={r.clients} cle="contact_id" titreExport={`Rentabilité client ${du} ${au}`} rechercher={(c) => c.nom}
                triInitial={{ id: 'chiffre', sens: 'desc' }} vide={<p className="texte-doux">Aucune vente à un client identifié sur la période.</p>}
                colonnes={[
                  { id: 'nom', libelle: 'Client', rendu: (c) => c.nom, tri: (c) => c.nom },
                  { id: 'source', libelle: 'Origine', rendu: (c) => canal(c.source ?? 'non_renseigne'), tri: (c) => canal(c.source ?? 'non_renseigne') },
                  { id: 'ventes', libelle: 'Ventes', classe: 'nombre', rendu: (c) => c.ventes, tri: (c) => c.ventes },
                  { id: 'chiffre', libelle: 'Chiffre d’affaires', classe: 'nombre', rendu: (c) => montant(c.chiffre), tri: (c) => Number(c.chiffre) },
                  { id: 'marge', libelle: 'Marge connue', classe: 'nombre', rendu: (c) => (c.marge == null ? <span className="texte-doux">coût inconnu</span> : montant(c.marge)), tri: (c) => Number(c.marge ?? -Infinity), exporter: (c) => c.marge ?? '' },
                  ...(r.clients[0]?.heures != null ? [
                    { id: 'heures', libelle: 'Heures passées', classe: 'nombre', rendu: (c) => nombre(c.heures), tri: (c) => Number(c.heures) },
                    { id: 'par_heure', libelle: 'Chiffre par heure', classe: 'nombre', rendu: (c) => (c.chiffre_par_heure == null ? '—' : montant(c.chiffre_par_heure)), tri: (c) => Number(c.chiffre_par_heure ?? -Infinity), exporter: (c) => c.chiffre_par_heure ?? '' },
                  ] : []),
                  ...(r.clients[0]?.reste_du_echu != null ? [
                    { id: 'reste', libelle: 'Reste dû échu', classe: 'nombre', rendu: (c) => (Number(c.reste_du_echu) > 0 ? <strong className="texte-alerte">{montant(c.reste_du_echu)}</strong> : '—'), tri: (c) => Number(c.reste_du_echu) },
                  ] : []),
                ]} />
              <p className="texte-doux">Le coût du temps passé n’est pas compté : seules les heures saisies sur les projets du client sont montrées.</p>
            </Section>
          )}
          {actif === 'canaux' && (
            <Section titre="Par canal d’acquisition" sousTitre="Origine renseignée sur la fiche du contact (ou sur l’opportunité).">
              <DataTable lignes={r.canaux} cle="canal" titreExport={`Canaux ${du} ${au}`} triInitial={{ id: 'chiffre', sens: 'desc' }}
                vide={<p className="texte-doux">Rien sur la période.</p>}
                colonnes={[
                  { id: 'canal', libelle: 'Canal', rendu: (c) => canal(c.canal), tri: (c) => canal(c.canal) },
                  { id: 'nouveaux', libelle: 'Nouveaux contacts', classe: 'nombre', rendu: (c) => c.nouveaux, tri: (c) => c.nouveaux },
                  { id: 'clients', libelle: 'Clients qui ont acheté', classe: 'nombre', rendu: (c) => c.clients, tri: (c) => c.clients },
                  { id: 'chiffre', libelle: 'Chiffre d’affaires', classe: 'nombre', rendu: (c) => montant(c.chiffre), tri: (c) => Number(c.chiffre) },
                  ...(r.prevision ? [
                    { id: 'opportunites', libelle: 'Opportunités créées', classe: 'nombre', rendu: (c) => c.opportunites, tri: (c) => c.opportunites },
                    { id: 'gagnees', libelle: 'Gagnées / perdues', classe: 'nombre', rendu: (c) => `${c.gagnees} / ${c.perdues}`, exporter: (c) => `${c.gagnees}/${c.perdues}` },
                    { id: 'taux', libelle: 'Conversion', classe: 'nombre', rendu: (c) => (c.taux_conversion == null ? '—' : `${String(c.taux_conversion).replace('.', ',')} %`), tri: (c) => Number(c.taux_conversion ?? -1), exporter: (c) => c.taux_conversion ?? '' },
                    { id: 'montant_gagne', libelle: 'Montant gagné', classe: 'nombre', rendu: (c) => montant(c.montant_gagne), tri: (c) => Number(c.montant_gagne) },
                  ] : []),
                ]} />
              <p className="texte-doux">Conversion = gagnées ÷ (gagnées + perdues), parmi les opportunités clôturées sur la période.</p>
            </Section>
          )}
          {actif === 'prevision' && (
            <Section titre="Prévision pondérée" sousTitre="Opportunités ouvertes, par mois de signature prévue. Pondéré = montant × probabilité de l’étape.">
              <DataTable lignes={r.prevision} cle="cle" titreExport="Prévision pondérée" vide={<p className="texte-doux">Aucune opportunité ouverte.</p>}
                colonnes={[
                  { id: 'cle', libelle: 'Signature prévue', rendu: (l) => (l.cle === 'depassee' ? <Badge ton="alerte">{libellePrevision(l.cle)}</Badge> : libellePrevision(l.cle)), exporter: (l) => libellePrevision(l.cle) },
                  { id: 'nombre', libelle: 'Opportunités', classe: 'nombre', rendu: (l) => l.nombre, tri: (l) => l.nombre },
                  { id: 'montant', libelle: 'Montant', classe: 'nombre', rendu: (l) => montant(l.montant), tri: (l) => Number(l.montant) },
                  { id: 'pondere', libelle: 'Pondéré', classe: 'nombre', rendu: (l) => montant(l.pondere), tri: (l) => Number(l.pondere) },
                ]} />
            </Section>
          )}
          {actif === 'sans_action' && (
            <Section titre="Opportunités sans prochaine action" sousTitre="Ouvertes, sans aucune activité à faire : à relancer ou à clôturer.">
              <DataTable lignes={r.sans_action} titreExport="Opportunités sans prochaine action" rechercher={(o) => `${o.numero} ${o.titre} ${o.contact} ${o.responsable}`}
                onLigne={(o) => naviguer(`crm/${o.id}`)} vide={<p className="texte-doux">Chaque opportunité ouverte a une prochaine action.</p>}
                colonnes={[
                  { id: 'titre', libelle: 'Opportunité', rendu: (o) => `${o.numero} · ${o.titre}`, tri: (o) => o.numero },
                  { id: 'contact', libelle: 'Contact', rendu: (o) => o.contact, tri: (o) => o.contact },
                  { id: 'responsable', libelle: 'Responsable', rendu: (o) => o.responsable, tri: (o) => o.responsable },
                  { id: 'montant', libelle: 'Montant', classe: 'nombre', rendu: (o) => montant(o.montant), tri: (o) => Number(o.montant) },
                  { id: 'jours', libelle: 'Dernière activité', classe: 'nombre', rendu: (o) => (o.jours === 0 ? 'aujourd’hui' : `il y a ${o.jours} j`), tri: (o) => o.jours },
                ]} />
            </Section>
          )}
          {actif === 'charge' && (
            <Section titre="Charge par personne" sousTitre="Tâches de projet ouvertes et relances commerciales à faire ; heures saisies sur la période.">
              <DataTable lignes={r.charge} cle="user_id" titreExport={`Charge par personne ${du} ${au}`} triInitial={{ id: 'retards', sens: 'desc' }}
                vide={<p className="texte-doux">Personne n’a de tâche ouverte ni de relance à faire.</p>}
                colonnes={[
                  { id: 'nom', libelle: 'Personne', rendu: (c) => c.nom, tri: (c) => c.nom },
                  { id: 'taches', libelle: 'Tâches ouvertes', classe: 'nombre', rendu: (c) => c.taches, tri: (c) => c.taches },
                  { id: 'heures_estimees', libelle: 'Heures estimées', classe: 'nombre', rendu: (c) => nombre(c.heures_estimees), tri: (c) => Number(c.heures_estimees) },
                  { id: 'heures_saisies', libelle: 'Heures saisies', classe: 'nombre', rendu: (c) => nombre(c.heures_saisies), tri: (c) => Number(c.heures_saisies) },
                  { id: 'relances', libelle: 'Relances à faire', classe: 'nombre', rendu: (c) => c.relances, tri: (c) => c.relances },
                  { id: 'retards', libelle: 'En retard', classe: 'nombre', rendu: (c) => (c.retards ? <strong className="texte-alerte">{c.retards}</strong> : 0), tri: (c) => c.retards },
                ]} />
            </Section>
          )}
          {actif === 'engagements' && (
            <Section titre="Engagements à risque" sousTitre="Contrats clients actifs et abonnements en cours qui demandent une action.">
              <DataTable lignes={r.engagements} titreExport="Engagements à risque" rechercher={(e) => `${e.numero} ${e.libelle} ${e.contact}`}
                onLigne={(e) => naviguer(e.nature === 'contrat' ? `contrats/${e.id}` : 'abonnements')}
                vide={<p className="texte-doux">Aucun engagement à risque.</p>}
                colonnes={[
                  { id: 'numero', libelle: 'Engagement', rendu: (e) => `${e.nature === 'contrat' ? 'Contrat' : 'Abonnement'} ${e.numero} · ${e.libelle}`, tri: (e) => e.numero },
                  { id: 'contact', libelle: 'Client', rendu: (e) => e.contact, tri: (e) => e.contact },
                  { id: 'raisons', libelle: 'Pourquoi', rendu: (e) => <span style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>{e.raisons.map((x) => <Badge key={x} ton={x === 'impaye' || x === 'fin_depassee' ? 'alerte' : 'attention'}>{RAISONS_RISQUE[x] ?? x}</Badge>)}</span>, exporter: (e) => e.raisons.map((x) => RAISONS_RISQUE[x] ?? x).join(', ') },
                  { id: 'fin', libelle: 'Fin', rendu: (e) => (e.fin ? formatDate(e.fin) : '—'), tri: (e) => e.fin ?? '9999' },
                  { id: 'montant', libelle: 'Montant', classe: 'nombre', rendu: (e) => montant(e.montant), tri: (e) => Number(e.montant) },
                  { id: 'reste', libelle: 'Reste dû échu', classe: 'nombre', rendu: (e) => (Number(e.reste_du_echu) > 0 ? montant(e.reste_du_echu) : '—'), tri: (e) => Number(e.reste_du_echu) },
                ]} />
            </Section>
          )}
        </>
      )}
    </div>
  );
}
