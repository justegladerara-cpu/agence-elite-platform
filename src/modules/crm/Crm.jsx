import React, { useMemo, useState } from 'react';
import { useDonnees, useEspace } from '../../noyau/espace.jsx';
import { formatDate, formatDateHeure } from '../../noyau/format.js';
import { Badge, Bouton, DataTable, EmptyState, Erreur, Icone, PageHeader, Section, Squelette, StatCard, Tabs } from '../../ui/composants.jsx';
import { exporterCsv } from '../../ui/communs.jsx';
import { SOURCES, STATUTS_OPPORTUNITE, TYPES_ACTIVITE } from './commun.js';
import { ModaleOpportunite } from './Formulaires.jsx';
import { ListeActivites, ModalePerte, nomContact, useCrm } from './partage.jsx';
import Opportunite from './Opportunite.jsx';
import ReglagesPipeline from './Reglages.jsx';

function Pipeline({ d, recharger, naviguer, filtreMoi }) {
  const { api, montant, notifier, utilisateur, peut } = useEspace();
  const [survol, setSurvol] = useState(null);
  const [erreur, setErreur] = useState('');
  const [perte, setPerte] = useState(null);
  const colonnes = d.etapes.filter((e) => e.actif && e.nature === 'ouverte');
  const gagnee = d.etapes.find((e) => e.nature === 'gagnee' && e.actif);
  const perdue = d.etapes.find((e) => e.nature === 'perdue' && e.actif);
  const ouvertes = d.opportunites.filter((o) => o.statut === 'ouverte' && (!filtreMoi || o.responsable_id === utilisateur?.id));
  const peutBouger = (o) => peut('crm_pipeline.administrer') || (peut('crm_pipeline.gerer') && [o.responsable_id, o.cree_par].includes(utilisateur?.id));
  const deplacer = async (id, etape, motif) => {
    setErreur('');
    try {
      await api.rpc('deplacer_opportunite', { p_opportunite_id: id, p_etape_id: etape.id, p_motif: motif ?? null });
      notifier(etape.nature === 'gagnee' ? 'Bravo, opportunité gagnée' : `Déplacée vers « ${etape.nom} »`);
      recharger();
    } catch (err) {
      setErreur(err.message);
    }
  };
  const deposer = (etape) => (e) => {
    e.preventDefault();
    setSurvol(null);
    const id = e.dataTransfer.getData('text/plain');
    const o = d.opportunites.find((x) => x.id === id);
    if (!o || o.etape_id === etape.id) return;
    if (etape.nature === 'perdue') setPerte({ id, etape });
    else deplacer(id, etape);
  };
  const zone = (etape) => ({
    onDragOver: (e) => { e.preventDefault(); setSurvol(etape.id); },
    onDragLeave: () => setSurvol(null),
    onDrop: deposer(etape),
  });
  return (
    <>
      <Erreur message={erreur} />
      <div className="kanban" role="list" aria-label="Pipeline commercial">
        {colonnes.map((etape) => {
          const cartes = ouvertes.filter((o) => o.etape_id === etape.id);
          const total = cartes.reduce((t, o) => t + Number(o.montant), 0);
          return (
            <section key={etape.id} className={`kanban-colonne ${survol === etape.id ? 'survol' : ''}`} role="listitem" aria-label={etape.nom} {...zone(etape)}>
              <header>
                <strong>{etape.nom}</strong>
                <span className="texte-doux">{cartes.length} · {montant(total)}</span>
              </header>
              {cartes.map((o) => {
                const retard = d.activites.some((a) => a.opportunite_id === o.id && a.statut === 'a_faire' && new Date(a.echeance) < new Date());
                const prochaine = d.activites.find((a) => a.opportunite_id === o.id && a.statut === 'a_faire');
                return (
                  <article
                    key={o.id}
                    className="kanban-carte"
                    draggable={peutBouger(o)}
                    onDragStart={(e) => e.dataTransfer.setData('text/plain', o.id)}
                  >
                    <button type="button" className="lien kanban-titre" onClick={() => naviguer(`crm/${o.id}`)}>{o.titre}</button>
                    <span className="texte-doux">{nomContact(d.contact[o.contact_id])}</span>
                    <div className="kanban-pied">
                      <strong>{montant(o.montant)}</strong>
                      <span className="texte-doux">{d.membre[o.responsable_id]?.nom?.split(' ')[0] ?? ''}</span>
                    </div>
                    {prochaine ? (
                      <small className={retard ? 'texte-alerte' : 'texte-doux'}>
                        <Icone nom="horloge" taille={12} /> {TYPES_ACTIVITE[prochaine.type]} {formatDateHeure(prochaine.echeance)}
                      </small>
                    ) : <small className="texte-alerte">Aucune prochaine action</small>}
                    {peutBouger(o) && (
                      <select
                        className="kanban-deplacer"
                        aria-label={`Déplacer ${o.titre}`}
                        value=""
                        onChange={(e) => {
                          const cible = d.etape[e.target.value];
                          if (cible?.nature === 'perdue') setPerte({ id: o.id, etape: cible });
                          else if (cible) deplacer(o.id, cible);
                        }}
                      >
                        <option value="">Déplacer…</option>
                        {[...colonnes, gagnee, perdue].filter((x) => x && x.id !== o.etape_id).map((x) => <option key={x.id} value={x.id}>{x.nom}</option>)}
                      </select>
                    )}
                  </article>
                );
              })}
            </section>
          );
        })}
        {gagnee && (
          <section className={`kanban-colonne kanban-fin gagnee ${survol === gagnee.id ? 'survol' : ''}`} aria-label="Déposer ici : gagnée" {...zone(gagnee)}>
            <header><strong>Gagné</strong><span className="texte-doux">{d.tdb.gagnees_mois} ce mois</span></header>
            <p className="texte-doux">Déposez ici une opportunité signée.</p>
          </section>
        )}
        {perdue && (
          <section className={`kanban-colonne kanban-fin perdue ${survol === perdue.id ? 'survol' : ''}`} aria-label="Déposer ici : perdue" {...zone(perdue)}>
            <header><strong>Perdu</strong><span className="texte-doux">{d.tdb.perdues_mois} ce mois</span></header>
            <p className="texte-doux">Un motif sera demandé.</p>
          </section>
        )}
      </div>
      {perte && (
        <ModalePerte onFermer={() => setPerte(null)} onValider={(motif) => { deplacer(perte.id, perte.etape, motif); setPerte(null); }} />
      )}
    </>
  );
}

function ListeOpportunites({ d, naviguer }) {
  const { montant } = useEspace();
  const etat = (o) => (o.statut === 'ouverte' ? [d.etape[o.etape_id]?.nom ?? '—', 'bleu'] : STATUTS_OPPORTUNITE[o.statut]);
  const contact = (o) => nomContact(d.contact[o.contact_id]);
  const responsable = (o) => d.membre[o.responsable_id]?.nom ?? '—';
  return (
    <DataTable
      colonnes={[
        { id: 'numero', libelle: 'N°', tri: (o) => o.numero, rendu: (o) => <strong>{o.numero}</strong> },
        { id: 'titre', libelle: 'Opportunité', tri: (o) => o.titre, rendu: (o) => o.titre },
        { id: 'contact', libelle: 'Prospect / client', tri: contact, rendu: contact },
        { id: 'montant', libelle: 'Montant', tri: (o) => Number(o.montant), rendu: (o) => montant(o.montant), classe: 'nombre' },
        { id: 'proba', libelle: 'Probabilité', tri: (o) => o.probabilite, rendu: (o) => `${o.probabilite} %`, classe: 'nombre' },
        { id: 'cloture', libelle: 'Signature prévue', tri: (o) => o.cloture_prevue ?? '', rendu: (o) => (o.cloture_prevue ? formatDate(o.cloture_prevue) : '—') },
        { id: 'responsable', libelle: 'Suivie par', tri: responsable, rendu: responsable },
        { id: 'etat', libelle: 'État', tri: (o) => etat(o)[0], rendu: (o) => <Badge ton={etat(o)[1]}>{etat(o)[0]}</Badge> },
      ]}
      lignes={d.opportunites}
      rechercher={(o) => `${o.numero} ${o.titre} ${contact(o)}`}
      placeholder="Numéro, titre ou prospect"
      filtres={[
        { id: 'statut', libelle: 'Statut', options: Object.entries(STATUTS_OPPORTUNITE).map(([k, [l]]) => [k, l]), appliquer: (o, v) => o.statut === v },
        { id: 'responsable', libelle: 'Suivie par', options: d.equipe.map((m) => [m.user_id, m.nom]), appliquer: (o, v) => o.responsable_id === v },
        { id: 'source', libelle: 'Origine', options: Object.entries(SOURCES), appliquer: (o, v) => o.source === v },
      ]}
      triInitial={{ id: 'numero', sens: 'desc' }}
      onLigne={(o) => naviguer(`crm/${o.id}`)}
      actions={(
        <Bouton icone="telecharger" onClick={() => exporterCsv('opportunites.csv', [
          { libelle: 'Numéro', valeur: (o) => o.numero }, { libelle: 'Titre', valeur: (o) => o.titre }, { libelle: 'Contact', valeur: contact },
          { libelle: 'Montant', valeur: (o) => String(o.montant).replace('.', ',') }, { libelle: 'Probabilité', valeur: (o) => o.probabilite },
          { libelle: 'Étape', valeur: (o) => d.etape[o.etape_id]?.nom }, { libelle: 'Statut', valeur: (o) => o.statut },
          { libelle: 'Origine', valeur: (o) => SOURCES[o.source] ?? '' }, { libelle: 'Suivie par', valeur: responsable },
          { libelle: 'Motif de perte', valeur: (o) => o.motif_perte ?? '' },
        ], d.opportunites)}>Exporter</Bouton>
      )}
      vide={<EmptyState icone="cible" titre="Aucune opportunité" />}
    />
  );
}

function Prospects({ d, naviguer }) {
  const prospects = d.contacts.filter((c) => c.type === 'prospect');
  const ouvertes = (c) => d.opportunites.filter((o) => o.contact_id === c.id && o.statut === 'ouverte').length;
  return (
    <DataTable
      colonnes={[
        { id: 'nom', libelle: 'Prospect', tri: nomContact, rendu: (c) => <strong>{nomContact(c)}</strong> },
        { id: 'contact', libelle: 'Contact', tri: (c) => c.nom, rendu: (c) => [c.societe && c.nom, c.telephone].filter(Boolean).join(' · ') || '—' },
        { id: 'source', libelle: 'Origine', tri: (c) => c.source ?? '', rendu: (c) => SOURCES[c.source] ?? '—' },
        { id: 'responsable', libelle: 'Suivi par', tri: (c) => d.membre[c.responsable_id]?.nom ?? '', rendu: (c) => d.membre[c.responsable_id]?.nom ?? '—' },
        { id: 'opps', libelle: 'Opportunités en cours', tri: ouvertes, rendu: ouvertes, classe: 'nombre' },
        { id: 'cree', libelle: 'Ajouté le', tri: (c) => c.cree_le, rendu: (c) => formatDate(c.cree_le) },
      ]}
      lignes={prospects}
      rechercher={(c) => `${c.nom} ${c.societe ?? ''} ${c.telephone ?? ''}`}
      placeholder="Nom, société, téléphone"
      filtres={[{ id: 'source', libelle: 'Origine', options: Object.entries(SOURCES), appliquer: (c, v) => c.source === v }]}
      triInitial={{ id: 'cree', sens: 'desc' }}
      onLigne={(c) => naviguer(`contacts/${c.id}`)}
      vide={<EmptyState icone="contacts" titre="Aucun prospect" texte="Un prospect devient client dès qu’une opportunité est gagnée." />}
    />
  );
}

const ONGLETS = [['pipeline', 'Pipeline'], ['liste', 'Opportunités'], ['activites', 'Activités'], ['prospects', 'Prospects']];

function Accueil({ naviguer }) {
  const { montant, peut, utilisateur } = useEspace();
  const [onglet, setOnglet] = useState('pipeline');
  const [nouvelle, setNouvelle] = useState(false);
  const [filtreMoi, setFiltreMoi] = useState(false);
  const { donnees: d, chargement, erreur, recharger } = useCrm();
  const aFaire = useMemo(() => (d ? d.activites.filter((a) => a.statut === 'a_faire' && a.assigne_a === utilisateur?.id).length : 0), [d, utilisateur]);
  return (
    <div className="page page-large">
      <PageHeader
        titre="Prospects et opportunités"
        sousTitre="Du premier contact à la signature"
        actions={(
          <>
            {peut('crm_pipeline.administrer') && <Bouton icone="parametres" onClick={() => naviguer('crm/reglages')}>Étapes</Bouton>}
            {peut('crm_pipeline.gerer') && <Bouton variante="principal" icone="plus" onClick={() => setNouvelle(true)}>Nouvelle opportunité</Bouton>}
          </>
        )}
      />
      {chargement && !d && <Squelette lignes={6} />}
      <Erreur message={erreur} />
      {d && (
        <>
          <div className="grille-stats">
            <StatCard icone="cible" libelle="Pipeline en cours" valeur={montant(d.tdb.valeur_pipeline)} detail={`${d.tdb.ouvertes} opportunité(s) · pondéré ${montant(d.tdb.valeur_ponderee)}`} onClick={() => setOnglet('pipeline')} />
            <StatCard icone="etoile" libelle="Gagné ce mois" valeur={montant(d.tdb.gagne_mois)} detail={d.tdb.taux_conversion != null ? `${d.tdb.taux_conversion} % de conversion` : `${d.tdb.gagnees_mois} signée(s)`} />
            <StatCard icone="horloge" libelle="Activités en retard" valeur={d.tdb.activites_retard} detail={`${d.tdb.activites_jour} aujourd’hui · ${aFaire} pour moi`} ton={d.tdb.activites_retard ? 'alerte' : undefined} onClick={() => setOnglet('activites')} />
            <StatCard icone="contacts" libelle="Prospects" valeur={d.tdb.prospects} detail={d.tdb.sans_activite ? `${d.tdb.sans_activite} opportunité(s) à relancer` : undefined} onClick={() => setOnglet('prospects')} />
          </div>
          <Tabs onglets={ONGLETS.map(([k, l]) => [k, l, k === 'activites' ? d.activites.filter((a) => a.statut === 'a_faire').length : undefined])} actif={onglet} onChange={setOnglet} />
          {onglet === 'pipeline' && (
            <>
              {d.equipe.length > 1 && (
                <label className="case compacte"><input type="checkbox" checked={filtreMoi} onChange={(e) => setFiltreMoi(e.target.checked)} /> Seulement les miennes</label>
              )}
              {d.opportunites.some((o) => o.statut === 'ouverte')
                ? <Pipeline d={d} recharger={recharger} naviguer={naviguer} filtreMoi={filtreMoi} />
                : <EmptyState icone="cible" titre="Aucune opportunité en cours" texte="Ajoutez votre premier prospect : il avancera d’étape en étape jusqu’à la signature." action={peut('crm_pipeline.gerer') && <Bouton variante="principal" icone="plus" onClick={() => setNouvelle(true)}>Nouvelle opportunité</Bouton>} />}
            </>
          )}
          {onglet === 'liste' && <ListeOpportunites d={d} naviguer={naviguer} />}
          {onglet === 'activites' && <Section><ListeActivites d={d} recharger={recharger} naviguer={naviguer} /></Section>}
          {onglet === 'prospects' && <Prospects d={d} naviguer={naviguer} />}
          {nouvelle && (
            <ModaleOpportunite contacts={d.contacts} etapes={d.etapes} equipe={d.equipe} onFermer={() => setNouvelle(false)} onFait={(id) => naviguer(`crm/${id}`)} />
          )}
        </>
      )}
    </div>
  );
}

export default function Crm({ naviguer, sousRoute }) {
  const [premier, second] = (sousRoute ?? '').split('/');
  if (premier === 'reglages') return <ReglagesPipeline naviguer={naviguer} />;
  if (premier === 'contact' && second) return <Opportunite key={second} contactId={second} naviguer={naviguer} />;
  if (premier) return <Opportunite key={premier} opportuniteId={premier} naviguer={naviguer} />;
  return <Accueil naviguer={naviguer} />;
}
