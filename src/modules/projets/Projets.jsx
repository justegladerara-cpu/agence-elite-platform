import React, { useState } from 'react';
import { useDonnees, useEspace } from '../../noyau/espace.jsx';
import { dateLocale, formatDate } from '../../noyau/format.js';
import { lireParametres } from '../../noyau/routes.js';
import { Badge, Bouton, DataTable, EmptyState, Erreur, MenuActions, ModaleMotif, PageHeader, Section, Squelette, StatCard, Tabs } from '../../ui/composants.jsx';
import { exporterCsv, PiecesJointes } from '../../ui/communs.jsx';
import { COLONNES_TACHES, heures, PRIORITES, STATUTS_PROJET } from './commun.js';
import { ModaleProjet, ModaleTache, ModaleTemps } from './Formulaires.jsx';

function useProjets(deps = []) {
  const { api, etablissement } = useEspace();
  return useDonnees(async () => {
    const [projets, taches, temps, contacts, membres, tdb] = await Promise.all([
      api.lire('projets', { eq: { etablissement_id: etablissement.id }, ordre: ['cree_le', 'desc'], limite: 2000 }),
      api.lire('projet_taches', { eq: { etablissement_id: etablissement.id }, ordre: ['ordre'], limite: 5000 }),
      api.lire('projet_temps', { eq: { etablissement_id: etablissement.id }, ordre: ['date_travail', 'desc'], limite: 5000 }),
      api.lire('contacts', { eq: { etablissement_id: etablissement.id }, ordre: ['nom'] }),
      api.rpc('projets_membres', { p_etablissement_id: etablissement.id }),
      api.rpc('tableau_de_bord_projets', { p_etablissement_id: etablissement.id }),
    ]);
    return {
      projets, taches, temps, membres, tdb,
      contacts: contacts.filter((c) => c.type !== 'fournisseur'),
      contact: Object.fromEntries(contacts.map((c) => [c.id, c])),
      membre: Object.fromEntries(membres.map((m) => [m.user_id, m])),
    };
  }, [etablissement.id, ...deps]);
}

const avancement = (d, projetId) => {
  const t = d.taches.filter((x) => x.projet_id === projetId && x.statut !== 'annulee');
  return t.length ? Math.round((100 * t.filter((x) => x.statut === 'terminee').length) / t.length) : 0;
};

function Taches({ d, projetId, recharger, filtre = () => true }) {
  const { api, etablissement, peut, notifier, utilisateur } = useEspace();
  const [edition, setEdition] = useState(null);
  const [temps, setTemps] = useState(null);
  const [erreur, setErreur] = useState('');
  const aujourdhui = dateLocale();
  const taches = d.taches.filter((t) => (!projetId || t.projet_id === projetId) && t.statut !== 'annulee' && filtre(t));
  const peutBouger = (t) => peut('projets.gerer') || t.assigne_a === utilisateur?.id;
  const deplacer = async (t, statut) => {
    setErreur('');
    try {
      await api.rpc('enregistrer_tache_projet', { p_etablissement_id: etablissement.id, p: { id: t.id, statut } });
      notifier(statut === 'terminee' ? 'Tâche terminée' : 'Tâche déplacée');
      recharger();
    } catch (err) {
      setErreur(err.message);
    }
  };
  const projet = (t) => d.projets.find((p) => p.id === t.projet_id);
  return (
    <>
      <Erreur message={erreur} />
      <div className="kanban" role="list" aria-label="Tâches">
        {COLONNES_TACHES.map(([statut, libelle]) => {
          const cartes = taches.filter((t) => t.statut === statut);
          return (
            <section key={statut} className="kanban-colonne" role="listitem" aria-label={libelle}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); const t = d.taches.find((x) => x.id === e.dataTransfer.getData('text/plain')); if (t && t.statut !== statut) deplacer(t, statut); }}>
              <header><strong>{libelle}</strong><span className="texte-doux">{cartes.length}</span></header>
              {cartes.map((t) => (
                <article key={t.id} className="kanban-carte" draggable={peutBouger(t)} onDragStart={(e) => e.dataTransfer.setData('text/plain', t.id)}>
                  <button type="button" className="lien kanban-titre" onClick={() => setEdition(t)} disabled={!peutBouger(t)}>{t.titre}</button>
                  {!projetId && <span className="texte-doux">{projet(t)?.nom}</span>}
                  <div className="kanban-pied">
                    <span className="texte-doux">{d.membre[t.assigne_a]?.nom ?? 'Non assignée'}</span>
                    {t.priorite !== 'normale' && <Badge ton={PRIORITES[t.priorite][1]}>{PRIORITES[t.priorite][0]}</Badge>}
                  </div>
                  {t.echeance && <small className={t.statut !== 'terminee' && t.echeance < aujourdhui ? 'texte-alerte' : 'texte-doux'}>Échéance {formatDate(t.echeance)}</small>}
                  {peutBouger(t) && (
                    <div className="groupe-boutons">
                      <select className="kanban-deplacer" aria-label={`Déplacer ${t.titre}`} value="" onChange={(e) => e.target.value && deplacer(t, e.target.value)}>
                        <option value="">Déplacer…</option>
                        {COLONNES_TACHES.filter(([s]) => s !== t.statut).map(([s, l]) => <option key={s} value={s}>{l}</option>)}
                      </select>
                      {peut('projets.contribuer') && <button type="button" className="lien" onClick={() => setTemps(t)}>+ temps</button>}
                    </div>
                  )}
                </article>
              ))}
            </section>
          );
        })}
      </div>
      {edition && <ModaleTache projetId={edition.projet_id} tache={edition} membres={d.membres} onFermer={() => setEdition(null)} onFait={() => { setEdition(null); notifier('Tâche enregistrée'); recharger(); }} />}
      {temps && <ModaleTemps projets={d.projets} taches={d.taches} membres={d.membres} projetId={temps.projet_id} tacheId={temps.id} onFermer={() => setTemps(null)} onFait={() => { setTemps(null); notifier('Temps enregistré'); recharger(); }} />}
    </>
  );
}

function JournalTemps({ d, lignes, recharger }) {
  const { api, utilisateur, peut, notifier } = useEspace();
  const [annuler, setAnnuler] = useState(null);
  const tache = (t) => d.taches.find((x) => x.id === t.tache_id)?.titre ?? '—';
  const projet = (t) => d.projets.find((x) => x.id === t.projet_id);
  return (
    <>
      <DataTable exportable={false}
        colonnes={[
          { id: 'date', libelle: 'Jour', tri: (t) => t.date_travail, rendu: (t) => formatDate(t.date_travail) },
          { id: 'qui', libelle: 'Qui', tri: (t) => d.membre[t.user_id]?.nom ?? '', rendu: (t) => d.membre[t.user_id]?.nom ?? '—' },
          { id: 'projet', libelle: 'Projet', tri: (t) => projet(t)?.nom ?? '', rendu: (t) => projet(t)?.nom ?? '—' },
          { id: 'tache', libelle: 'Tâche', tri: tache, rendu: tache },
          { id: 'duree', libelle: 'Durée', tri: (t) => t.minutes, rendu: (t) => heures(t.minutes), classe: 'nombre' },
          { id: 'etat', libelle: 'État', tri: (t) => t.statut, rendu: (t) => (t.statut === 'annule' ? <Badge>annulé</Badge> : t.document_vente_id ? <Badge ton="vert">facturé</Badge> : t.facturable ? <Badge ton="bleu">à facturer</Badge> : <Badge>interne</Badge>) },
          { id: 'actions', libelle: '', rendu: (t) => t.statut === 'valide' && !t.document_vente_id && (peut('projets.gerer') || [t.user_id, t.saisi_par].includes(utilisateur?.id)) && (
            <MenuActions actions={[{ libelle: 'Annuler', danger: true, onClick: () => setAnnuler(t) }]} />
          ) },
        ]}
        lignes={lignes}
        rechercher={(t) => `${t.description ?? ''} ${tache(t)} ${projet(t)?.nom ?? ''}`}
        placeholder="Description, tâche, projet"
        filtres={[{ id: 'qui', libelle: 'Qui', options: d.membres.map((m) => [m.user_id, m.nom]), appliquer: (t, v) => t.user_id === v }]}
        triInitial={{ id: 'date', sens: 'desc' }}
        actions={(
          <Bouton icone="telecharger" onClick={() => exporterCsv('temps.csv', [
            { libelle: 'Jour', valeur: (t) => t.date_travail }, { libelle: 'Qui', valeur: (t) => d.membre[t.user_id]?.nom },
            { libelle: 'Projet', valeur: (t) => projet(t)?.nom }, { libelle: 'Tâche', valeur: tache },
            { libelle: 'Minutes', valeur: (t) => t.minutes }, { libelle: 'Description', valeur: (t) => t.description },
            { libelle: 'Facturable', valeur: (t) => (t.facturable ? 'oui' : 'non') }, { libelle: 'État', valeur: (t) => t.statut },
          ], lignes)}>Exporter</Bouton>
        )}
        vide={<EmptyState icone="horloge" titre="Aucun temps saisi" />}
      />
      {annuler && (
        <ModaleMotif titre="Annuler ce temps" libelleAction="Annuler le temps" onFermer={() => setAnnuler(null)}
          onValider={async (motif) => { await api.rpc('annuler_temps_projet', { p_temps_id: annuler.id, p_motif: motif }); notifier('Temps annulé'); recharger(); }} />
      )}
    </>
  );
}

function FicheProjet({ projetId, naviguer }) {
  const { api, peut, notifier, montant, moduleActif } = useEspace();
  const { donnees: d, chargement, erreur, recharger } = useProjets([projetId]);
  const { donnees: s, recharger: rechargerSynthese } = useDonnees(() => api.rpc('synthese_projet', { p_projet_id: projetId }), [projetId]);
  const [onglet, setOnglet] = useState(() => (['temps', 'infos'].includes(lireParametres().get('vue')) ? lireParametres().get('vue') : 'taches'));
  const [action, setAction] = useState(null);
  const [erreurAction, setErreurAction] = useState('');
  const toutRecharger = () => { recharger(); rechargerSynthese(); };
  if (chargement && !d) return <div className="page"><Squelette lignes={8} /></div>;
  if (erreur) return <div className="page"><Erreur message={erreur} /></div>;
  const p = d.projets.find((x) => x.id === projetId);
  if (!p) return <div className="page"><EmptyState titre="Projet introuvable" action={<Bouton onClick={() => naviguer('projets')}>Retour</Bouton>} /></div>;
  const gerer = peut('projets.gerer');
  const actif = !['termine', 'annule'].includes(p.statut);
  const executer = async (rpc, params, message, apres) => {
    setErreurAction('');
    try {
      const r = await api.rpc(rpc, params);
      notifier(message);
      if (apres) apres(r);
      else toutRecharger();
    } catch (err) {
      setErreurAction(err.message);
    }
  };
  return (
    <div className="page page-large">
      <PageHeader
        titre={p.nom}
        sousTitre={[p.numero, d.contact[p.contact_id] && (d.contact[p.contact_id].societe || d.contact[p.contact_id].nom), d.membre[p.responsable_id]?.nom && `piloté par ${d.membre[p.responsable_id].nom}`].filter(Boolean).join(' · ')}
        fil={[{ libelle: 'Projets', href: '#/projets' }, { libelle: p.numero }]}
        badges={<Badge ton={STATUTS_PROJET[p.statut][1]}>{STATUTS_PROJET[p.statut][0]}</Badge>}
        actions={(
          <>
            {actif && peut('projets.contribuer') && <Bouton icone="horloge" onClick={() => setAction('temps')}>Saisir du temps</Bouton>}
            {actif && peut('projets.contribuer') && <Bouton variante="principal" icone="plus" onClick={() => setAction('tache')}>Tâche</Bouton>}
            {gerer && (
              <MenuActions actions={[
                actif && { libelle: 'Modifier', icone: 'parametres', onClick: () => setAction('modifier') },
                moduleActif('facturation') && peut('facturation.gerer') && s && Number(s.heures_facturables_a_facturer) > 0 && {
                  libelle: `Facturer ${s.heures_facturables_a_facturer} h`, icone: 'facture',
                  onClick: () => executer('facturer_temps_projet', { p_projet_id: p.id }, 'Facture brouillon créée', (id) => naviguer(`factures/${id}/modifier`)),
                },
                actif && { libelle: 'Terminer le projet', icone: 'coche', onClick: () => executer('changer_statut_projet', { p_projet_id: p.id, p_statut: 'termine' }, 'Projet terminé') },
                !actif && { libelle: 'Rouvrir', onClick: () => executer('changer_statut_projet', { p_projet_id: p.id, p_statut: 'en_cours' }, 'Projet rouvert') },
                actif && { libelle: 'Annuler le projet', danger: true, onClick: () => setAction('annuler') },
              ]} />
            )}
          </>
        )}
      />
      <Erreur message={erreurAction} />
      {p.statut === 'annule' && <p className="encart">Annulé : {p.motif_annulation}</p>}
      {s && (
        <div className="grille-stats">
          <StatCard icone="coche" libelle="Avancement" valeur={`${s.avancement} %`} detail={`${s.taches_terminees} / ${s.taches} tâche(s)${s.taches_retard ? ` · ${s.taches_retard} en retard` : ''}`} ton={s.taches_retard ? 'alerte' : undefined} />
          <StatCard icone="horloge" libelle="Temps passé" valeur={`${s.heures} h`} detail={p.heures_prevues ? `sur ${p.heures_prevues} h prévues` : s.heures_estimees ? `${s.heures_estimees} h estimées` : undefined} ton={p.heures_prevues && Number(s.heures) > Number(p.heures_prevues) ? 'alerte' : undefined} />
          <StatCard icone="facture" libelle="À facturer" valeur={`${s.heures_facturables_a_facturer} h`} detail={`${s.heures_facturees} h déjà facturées`} />
          <StatCard icone="calendrier" libelle="Fin prévue" valeur={p.date_fin_prevue ? formatDate(p.date_fin_prevue) : '—'} detail={p.budget ? `budget ${montant(p.budget)}` : undefined} />
        </div>
      )}
      <Tabs onglets={[['taches', 'Tâches'], ['temps', 'Temps'], ['infos', 'Informations']]} actif={onglet} onChange={setOnglet} />
      {onglet === 'taches' && <Taches d={d} projetId={p.id} recharger={toutRecharger} />}
      {onglet === 'temps' && <JournalTemps d={d} lignes={d.temps.filter((t) => t.projet_id === p.id)} recharger={toutRecharger} />}
      {onglet === 'infos' && (
        <div className="deux-colonnes">
          <Section titre="Projet">
            <dl className="details">
              <div><dt>Début</dt><dd>{p.date_debut ? formatDate(p.date_debut) : '—'}</dd></div>
              <div><dt>Taux horaire</dt><dd>{p.taux_horaire ? montant(p.taux_horaire) : 'paramètres'}</dd></div>
              {s?.par_personne?.map((x) => <div key={x.user_id}><dt>{x.nom}</dt><dd>{x.heures} h</dd></div>)}
            </dl>
            {p.description && <p className="texte-doux">{p.description}</p>}
            {s?.factures?.length > 0 && peut('facturation.lire') && (
              <div className="groupe-boutons">{s.factures.map((f) => <Bouton key={f} icone="facture" onClick={() => naviguer(`factures/${f}`)}>Facture</Bouton>)}</div>
            )}
          </Section>
          <PiecesJointes objetType="projet" objetId={p.id} titre="Documents du projet" peutAjouter={peut('projets.contribuer')} peutArchiver={gerer} />
        </div>
      )}
      {action === 'tache' && <ModaleTache projetId={p.id} membres={d.membres} onFermer={() => setAction(null)} onFait={() => { setAction(null); notifier('Tâche ajoutée'); toutRecharger(); }} />}
      {action === 'temps' && <ModaleTemps projets={d.projets} taches={d.taches} membres={d.membres} projetId={p.id} onFermer={() => setAction(null)} onFait={() => { setAction(null); notifier('Temps enregistré'); toutRecharger(); }} />}
      {action === 'modifier' && <ModaleProjet projet={p} contacts={d.contacts} membres={d.membres} onFermer={() => setAction(null)} onFait={() => { setAction(null); notifier('Projet modifié'); toutRecharger(); }} />}
      {action === 'annuler' && (
        <ModaleMotif titre={`Annuler ${p.numero}`} libelleAction="Annuler le projet" onFermer={() => setAction(null)}
          onValider={async (motif) => { await api.rpc('changer_statut_projet', { p_projet_id: p.id, p_statut: 'annule', p_motif: motif }); notifier('Projet annulé'); toutRecharger(); }} />
      )}
    </div>
  );
}

function Accueil({ naviguer }) {
  const { peut, montant, utilisateur, notifier } = useEspace();
  const { donnees: d, chargement, erreur, recharger } = useProjets();
  // #/projets?vue=taches|temps&statut=…&nouveau=1 (tableau de bord).
  const [onglet, setOnglet] = useState(() => ({ taches: 'mes_taches', mes_taches: 'mes_taches', temps: 'temps' })[lireParametres().get('vue')] ?? 'projets');
  const [action, setAction] = useState(() => (lireParametres().get('nouveau') === '1' && peut('projets.gerer') ? 'projet' : null));
  return (
    <div className="page page-large">
      <PageHeader
        titre="Projets"
        sousTitre="Projets clients, tâches et temps passé"
        actions={(
          <>
            {peut('projets.contribuer') && <Bouton icone="horloge" onClick={() => setAction('temps')}>Saisir du temps</Bouton>}
            {peut('projets.gerer') && <Bouton variante="principal" icone="plus" onClick={() => setAction('projet')}>Nouveau projet</Bouton>}
          </>
        )}
      />
      {chargement && !d && <Squelette lignes={6} />}
      <Erreur message={erreur} />
      {d && (
        <>
          <div className="grille-stats">
            <StatCard icone="dossier" libelle="Projets en cours" valeur={d.tdb.en_cours} detail={d.tdb.en_retard ? `${d.tdb.en_retard} en retard` : undefined} ton={d.tdb.en_retard ? 'alerte' : undefined} onClick={() => setOnglet('projets')} />
            <StatCard icone="taches" libelle="Mes tâches" valeur={d.tdb.mes_taches} detail={d.tdb.mes_taches_retard ? `${d.tdb.mes_taches_retard} en retard` : `${d.tdb.taches_ouvertes} ouvertes au total`} ton={d.tdb.mes_taches_retard ? 'alerte' : undefined} onClick={() => setOnglet('mes_taches')} />
            <StatCard icone="horloge" libelle="Mon temps cette semaine" valeur={`${d.tdb.mes_heures_semaine} h`} detail={`${d.tdb.heures_semaine} h pour l’équipe`} onClick={() => setOnglet('temps')} />
            <StatCard icone="facture" libelle="Temps à facturer" valeur={`${d.tdb.heures_a_facturer} h`} />
          </div>
          <Tabs onglets={[['projets', 'Projets'], ['mes_taches', 'Mes tâches'], ['temps', 'Temps']]} actif={onglet} onChange={setOnglet} />
          {onglet === 'projets' && (
            <DataTable
              colonnes={[
                { id: 'numero', libelle: 'N°', tri: (p) => p.numero, rendu: (p) => <strong>{p.numero}</strong> },
                { id: 'nom', libelle: 'Projet', tri: (p) => p.nom, rendu: (p) => p.nom },
                { id: 'client', libelle: 'Client', tri: (p) => d.contact[p.contact_id]?.nom ?? '', rendu: (p) => (d.contact[p.contact_id] ? d.contact[p.contact_id].societe || d.contact[p.contact_id].nom : 'Interne') },
                { id: 'pilote', libelle: 'Pilote', tri: (p) => d.membre[p.responsable_id]?.nom ?? '', rendu: (p) => d.membre[p.responsable_id]?.nom ?? '—' },
                { id: 'avancement', libelle: 'Avancement', tri: (p) => avancement(d, p.id), rendu: (p) => <span className="barre-progression" title={`${avancement(d, p.id)} %`}><span style={{ width: `${avancement(d, p.id)}%` }} /></span> },
                { id: 'fin', libelle: 'Fin prévue', tri: (p) => p.date_fin_prevue ?? '', rendu: (p) => (p.date_fin_prevue ? formatDate(p.date_fin_prevue) : '—') },
                { id: 'budget', libelle: 'Budget', tri: (p) => Number(p.budget ?? 0), rendu: (p) => (p.budget ? montant(p.budget) : '—'), classe: 'nombre' },
                { id: 'statut', libelle: 'Statut', tri: (p) => p.statut, rendu: (p) => <Badge ton={STATUTS_PROJET[p.statut][1]}>{STATUTS_PROJET[p.statut][0]}</Badge> },
              ]}
              lignes={d.projets}
              rechercher={(p) => `${p.numero} ${p.nom} ${d.contact[p.contact_id]?.nom ?? ''}`}
              placeholder="Numéro, projet, client"
              filtres={[{ id: 'statut', libelle: 'Statut', options: Object.entries(STATUTS_PROJET).map(([k, [l]]) => [k, l]), appliquer: (p, v) => p.statut === v }]}
              triInitial={{ id: 'numero', sens: 'desc' }}
              onLigne={(p) => naviguer(`projets/${p.id}`)}
              vide={<EmptyState icone="dossier" titre="Aucun projet" texte="Un projet regroupe les tâches, le temps passé et la facture d’une mission client." />}
            />
          )}
          {onglet === 'mes_taches' && <Taches d={d} recharger={recharger} filtre={(t) => t.assigne_a === utilisateur?.id} />}
          {onglet === 'temps' && <JournalTemps d={d} lignes={d.temps} recharger={recharger} />}
          {action === 'projet' && <ModaleProjet contacts={d.contacts} membres={d.membres} onFermer={() => setAction(null)} onFait={(id) => naviguer(`projets/${id}`)} />}
          {action === 'temps' && <ModaleTemps projets={d.projets} taches={d.taches} membres={d.membres} onFermer={() => setAction(null)} onFait={() => { setAction(null); notifier('Temps enregistré'); recharger(); }} />}
        </>
      )}
    </div>
  );
}

export default function Projets({ naviguer, sousRoute }) {
  const [premier] = (sousRoute ?? '').split('/');
  if (premier) return <FicheProjet key={premier} projetId={premier} naviguer={naviguer} />;
  return <Accueil naviguer={naviguer} />;
}
