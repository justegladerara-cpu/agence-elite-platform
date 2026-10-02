import React, { useState } from 'react';
import { nomUtilisateur, useDonnees, useEspace } from '../../noyau/espace.jsx';
import { dateLocale, formatDate } from '../../noyau/format.js';
import {
  Avatar, Badge, Bouton, Champ, EmptyState, Erreur, MenuActions, Modale, ModaleMotif, PageHeader, Section, Squelette, StatusBadge, Tabs,
} from '../../ui/composants.jsx';
import { PiecesJointes } from '../../ui/communs.jsx';
import {
  CATEGORIES_DOCUMENTS_RH, duree, heure, nomEmploye, PERIODICITES, STATUTS_ABSENCE, STATUTS_EMPLOYE, TYPES_ABSENCE, TYPES_CONTRAT,
} from './commun.js';
import { FormulaireEmploye } from './Employes.jsx';
import { FormulaireAbsence } from './Conges.jsx';

function FormulaireContrat({ employe, contrat, organisation, remplacer, onFermer, onEnregistre }) {
  const { api, etablissement, devise } = useEspace();
  const [v, setV] = useState({
    type: 'cdi', poste_id: employe.poste_id ?? '', intitule: '', debut: dateLocale(), fin: '', fin_periode_essai: '', salaire_base: '',
    periodicite: 'mensuel', heures_hebdo: '', notes: '',
    ...(contrat ? Object.fromEntries(Object.entries(contrat).map(([k, x]) => [k, x ?? ''])) : {}),
  });
  const [erreur, setErreur] = useState('');
  const [chargement, setChargement] = useState(false);
  const changer = (champ) => (e) => setV((x) => ({ ...x, [champ]: e.target.value }));
  const enregistrer = async (e) => {
    e.preventDefault();
    setChargement(true);
    setErreur('');
    try {
      await api.rpc('rh_enregistrer_contrat', {
        p_etablissement_id: etablissement.id,
        p_contrat: { ...v, id: contrat?.id, employe_id: employe.id, remplacer: Boolean(remplacer) },
      });
      onEnregistre(contrat ? 'Contrat mis à jour (avenant)' : 'Contrat enregistré');
    } catch (err) {
      setErreur(err.message);
      setChargement(false);
    }
  };
  return (
    <Modale titre={contrat ? `Avenant au contrat ${contrat.numero}` : remplacer ? 'Nouveau contrat (remplace le contrat en cours)' : 'Nouveau contrat'} onFermer={onFermer} large>
      <form className="formulaire" onSubmit={enregistrer}>
        {remplacer && <p className="encart">Le contrat en cours sera terminé la veille du début du nouveau contrat.</p>}
        <div className="grille-champs">
          <Champ libelle="Type">
            <select value={v.type} onChange={changer('type')}>{Object.entries(TYPES_CONTRAT).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          </Champ>
          <Champ libelle="Poste">
            <select value={v.poste_id} onChange={changer('poste_id')}>
              <option value="">—</option>
              {organisation.postes.filter((p) => p.actif || p.id === v.poste_id).map((p) => <option key={p.id} value={p.id}>{p.intitule}</option>)}
            </select>
          </Champ>
          <Champ libelle="Début"><input type="date" value={v.debut} onChange={changer('debut')} required disabled={Boolean(contrat)} /></Champ>
          <Champ libelle={v.type === 'cdd' ? 'Fin (obligatoire)' : 'Fin (facultatif)'}><input type="date" value={v.fin} onChange={changer('fin')} required={v.type === 'cdd'} /></Champ>
          <Champ libelle="Fin de période d’essai"><input type="date" value={v.fin_periode_essai} onChange={changer('fin_periode_essai')} /></Champ>
          <Champ libelle="Heures par semaine"><input type="number" min="0" max="84" step="0.5" value={v.heures_hebdo} onChange={changer('heures_hebdo')} /></Champ>
          <Champ libelle={`Salaire de base (${devise})`} aide="Référence pour une paie future ; aucun bulletin n’est calculé ici.">
            <input type="number" min="0" step="any" inputMode="decimal" value={v.salaire_base} onChange={changer('salaire_base')} />
          </Champ>
          <Champ libelle="Périodicité">
            <select value={v.periodicite} onChange={changer('periodicite')}>{Object.entries(PERIODICITES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          </Champ>
        </div>
        <Champ libelle="Intitulé (si différent du poste)"><input value={v.intitule} onChange={changer('intitule')} maxLength={80} /></Champ>
        <Champ libelle="Notes"><textarea rows={2} value={v.notes} onChange={changer('notes')} maxLength={1000} /></Champ>
        <Erreur message={erreur} />
        <div className="actions">
          <Bouton type="button" onClick={onFermer}>Annuler</Bouton>
          <Bouton type="submit" variante="principal" chargement={chargement}>Enregistrer</Bouton>
        </div>
      </form>
    </Modale>
  );
}

function ModaleFinContrat({ contrat, onFermer, onFait }) {
  const { api } = useEspace();
  const [v, setV] = useState({ date: contrat.fin ?? dateLocale(), motif: '', rupture: false });
  const [erreur, setErreur] = useState('');
  const valider = async (e) => {
    e.preventDefault();
    try {
      await api.rpc('rh_terminer_contrat', { p_contrat_id: contrat.id, p_date: v.date, p_motif: v.motif, p_rupture: v.rupture });
      onFait();
    } catch (err) {
      setErreur(err.message);
    }
  };
  return (
    <Modale titre={`Terminer le contrat ${contrat.numero}`} onFermer={onFermer}>
      <form className="formulaire" onSubmit={valider}>
        <Champ libelle="Dernier jour"><input type="date" value={v.date} onChange={(e) => setV({ ...v, date: e.target.value })} required /></Champ>
        <Champ libelle="Motif (conservé)"><textarea rows={2} value={v.motif} onChange={(e) => setV({ ...v, motif: e.target.value })} required /></Champ>
        <label className="case"><input type="checkbox" checked={v.rupture} onChange={(e) => setV({ ...v, rupture: e.target.checked })} /> Rupture anticipée</label>
        <Erreur message={erreur} />
        <div className="actions">
          <Bouton type="button" onClick={onFermer}>Retour</Bouton>
          <Bouton type="submit" variante="danger" disabled={!v.motif.trim()}>Terminer le contrat</Bouton>
        </div>
      </form>
    </Modale>
  );
}

function ModaleCompte({ employe, onFermer, onFait }) {
  const { api, etablissement } = useEspace();
  const { donnees, erreur: erreurChargement } = useDonnees(() => api.rpc('equipe_etablissement', { p_etablissement_id: etablissement.id }), [etablissement.id]);
  const [choix, setChoix] = useState(employe.user_id ?? '');
  const [erreur, setErreur] = useState('');
  const valider = async () => {
    try {
      await api.rpc('rh_lier_compte', { p_etablissement_id: etablissement.id, p_employe_id: employe.id, p_user_id: choix || null });
      onFait();
    } catch (err) {
      setErreur(err.message);
    }
  };
  return (
    <Modale titre="Compte de connexion" onFermer={onFermer} pied={<><Bouton onClick={onFermer}>Annuler</Bouton><Bouton variante="principal" onClick={valider}>Enregistrer</Bouton></>}>
      <p className="texte-doux">Le compte lié ouvre à l’employé son espace : pointage, congés, documents. Créez d’abord le compte dans Équipe si besoin.</p>
      <Erreur message={erreurChargement || erreur} />
      {donnees && (
        <Champ libelle="Membre de l’équipe">
          <select value={choix} onChange={(e) => setChoix(e.target.value)}>
            <option value="">— Aucun compte lié</option>
            {donnees.membres.filter((m) => m.actif).map((m) => <option key={m.user_id} value={m.user_id}>{nomUtilisateur(m, m.email)}</option>)}
          </select>
        </Champ>
      )}
    </Modale>
  );
}

export default function FicheEmploye({ employeId, organisation, naviguer, onChange }) {
  const { api, etablissement, peut, moduleActif, montant, notifier, hubs } = useEspace();
  const [onglet, setOnglet] = useState('profil');
  const [action, setAction] = useState(null);
  const employe = organisation.employe[employeId];
  const confidentiel = peut('rh_employes.confidentiel');
  const voirPresences = moduleActif('rh_presences') && peut('rh_presences.lire');
  const voirConges = moduleActif('rh_conges') && peut('rh_conges.lire');
  const { donnees, chargement, erreur, recharger } = useDonnees(async () => {
    if (!employe) return null;
    const [prive, contrats, pointages, absences, soldes] = await Promise.all([
      confidentiel ? api.lire('rh_employes_prives', { eq: { employe_id: employeId } }) : [],
      confidentiel ? api.lire('rh_contrats', { eq: { employe_id: employeId }, ordre: ['debut', 'desc'] }) : [],
      voirPresences ? api.lire('rh_pointages', { eq: { employe_id: employeId }, ordre: ['jour', 'desc'], limite: 40 }) : [],
      voirConges ? api.lire('rh_absences', { eq: { employe_id: employeId }, ordre: ['debut', 'desc'], limite: 60 }) : [],
      voirConges ? api.rpc('rh_soldes_conges', { p_etablissement_id: etablissement.id, p_annee: new Date().getFullYear() }) : [],
    ]);
    return { prive: prive[0], contrats, pointages, absences, solde: soldes.find((s) => s.employe_id === employeId) };
  }, [employeId, confidentiel, voirPresences, voirConges]);

  if (!employe) {
    return (
      <div className="page">
        <EmptyState titre="Employé introuvable" texte="Il n’existe pas ou vous n’avez pas le droit de le voir." action={<Bouton onClick={() => naviguer('employes')}>Retour à l’annuaire</Bouton>} />
      </div>
    );
  }
  const actuel = donnees?.contrats.find((c) => c.statut === 'actif');
  const apres = (message) => {
    setAction(null);
    notifier(message);
    recharger();
    onChange();
  };
  const gerer = peut('rh_employes.gerer') && employe.statut !== 'sorti';
  const onglets = [['profil', 'Profil'], ...(confidentiel ? [['contrats', 'Contrats', donnees?.contrats.length]] : []), ['documents', 'Documents'],
    ...(voirPresences ? [['presences', 'Présences']] : []), ...(voirConges ? [['absences', 'Absences', donnees?.absences.length]] : [])];
  const infos = [
    ['Matricule', employe.matricule], ['Poste', organisation.poste[employe.poste_id]?.intitule], ['Département', organisation.departement[employe.departement_id]?.nom],
    ['Manager', nomEmploye(organisation.employe[employe.manager_id])], ['Entrée', formatDate(employe.date_entree)],
    ['Sortie', employe.date_sortie && `${formatDate(employe.date_sortie)} (${employe.motif_sortie})`], ['Téléphone', employe.telephone], ['E-mail', employe.email],
    ['Horaire', organisation.horaire[employe.horaire_id]?.nom], ['Hub', hubs.find((h) => h.id === employe.hub_id)?.nom],
    ['Compte lié', employe.user_id ? 'Oui (espace employé)' : 'Non'],
  ];
  return (
    <div className="page">
      <PageHeader
        titre={nomEmploye(employe)}
        sousTitre={organisation.poste[employe.poste_id]?.intitule ?? 'Employé'}
        fil={[{ libelle: 'Employés', href: '#/employes' }, { libelle: nomEmploye(employe) }]}
        badges={<StatusBadge statut={employe.statut} libelle={STATUTS_EMPLOYE[employe.statut]?.[0]} />}
        actions={(
          <>
            {gerer && <Bouton icone="parametres" onClick={() => setAction({ type: 'modifier' })}>Modifier</Bouton>}
            {gerer && confidentiel && <Bouton variante="principal" icone="plus" onClick={() => setAction({ type: 'contrat', remplacer: Boolean(actuel) })}>Nouveau contrat</Bouton>}
            <MenuActions actions={[
              gerer && peut('membres.lire') && { libelle: 'Compte de connexion', icone: 'cle', onClick: () => setAction({ type: 'compte' }) },
              voirConges && peut('rh_conges.valider') && employe.statut !== 'sorti' && { libelle: 'Saisir une absence', icone: 'valise', onClick: () => setAction({ type: 'absence' }) },
              gerer && { libelle: 'Sortie des effectifs', icone: 'sortie', danger: true, onClick: () => setAction({ type: 'sortie' }) },
            ]} />
          </>
        )}
      />
      <Tabs onglets={onglets} actif={onglet} onChange={setOnglet} />
      {chargement && !donnees && <Squelette />}
      <Erreur message={erreur} />
      {onglet === 'profil' && (
        <div className="deux-colonnes">
          <Section>
            <div className="fiche-identite">
              <Avatar nom={nomEmploye(employe)} image={employe.photo || undefined} taille="grand" />
              <div>
                <strong>{nomEmploye(employe)}</strong>
                {employe.notes && <p className="texte-doux">{employe.notes}</p>}
              </div>
            </div>
            <dl className="details">
              {infos.filter(([, x]) => x).map(([l, x]) => <React.Fragment key={l}><dt>{l}</dt><dd>{x}</dd></React.Fragment>)}
            </dl>
          </Section>
          <div className="pile">
            {confidentiel && (
              <Section titre="Contrat en cours">
                {!actuel && <p className="texte-doux">Aucun contrat en cours.</p>}
                {actuel && (
                  <dl className="details">
                    <dt>Numéro</dt><dd>{actuel.numero}</dd>
                    <dt>Type</dt><dd>{TYPES_CONTRAT[actuel.type]}</dd>
                    <dt>Période</dt><dd>{formatDate(actuel.debut)}{actuel.fin ? ` → ${formatDate(actuel.fin)}` : ''}</dd>
                    {actuel.salaire_base != null && <><dt>Salaire de base</dt><dd>{montant(actuel.salaire_base)} {PERIODICITES[actuel.periodicite]}</dd></>}
                  </dl>
                )}
              </Section>
            )}
            {confidentiel && donnees?.prive && (
              <Section titre="Données personnelles" sousTitre="Visible avec le droit confidentiel">
                <dl className="details">
                  {[['Naissance', donnees.prive.date_naissance && `${formatDate(donnees.prive.date_naissance)}${donnees.prive.lieu_naissance ? ` à ${donnees.prive.lieu_naissance}` : ''}`],
                    ['Nationalité', donnees.prive.nationalite], ['Adresse', donnees.prive.adresse], ['Situation', donnees.prive.situation_familiale],
                    ['Enfants', donnees.prive.enfants], ['Pièce d’identité', donnees.prive.piece_identite], ['Sécurité sociale', donnees.prive.numero_securite_sociale],
                    ['Urgence', [donnees.prive.contact_urgence_nom, donnees.prive.contact_urgence_telephone].filter(Boolean).join(' · ')]]
                    .filter(([, x]) => x !== null && x !== undefined && x !== '')
                    .map(([l, x]) => <React.Fragment key={l}><dt>{l}</dt><dd>{x}</dd></React.Fragment>)}
                </dl>
              </Section>
            )}
            {voirConges && donnees?.solde && (
              <Section titre={`Congés ${donnees.solde.annee}`}>
                <div className="chiffres-cles">
                  <span><strong>{donnees.solde.solde}</strong> j restants</span>
                  <span>{donnees.solde.droit} j acquis</span>
                  <span>{donnees.solde.pris} j pris</span>
                  {donnees.solde.en_attente > 0 && <span>{donnees.solde.en_attente} j en attente</span>}
                </div>
              </Section>
            )}
          </div>
        </div>
      )}
      {onglet === 'contrats' && donnees && (
        <Section>
          {!donnees.contrats.length && <EmptyState titre="Aucun contrat" icone="document" />}
          <div className="liste-simple">
            {donnees.contrats.map((c) => (
              <div key={c.id} className="liste-ligne">
                <span>
                  <strong>{c.numero} · {TYPES_CONTRAT[c.type]}</strong>{c.intitule && ` · ${c.intitule}`}
                  <small className="texte-doux bloc">
                    {formatDate(c.debut)}{c.fin ? ` → ${formatDate(c.fin)}` : ''}{c.salaire_base != null ? ` · ${montant(c.salaire_base)} ${PERIODICITES[c.periodicite]}` : ''}
                    {c.motif_fin ? ` · ${c.motif_fin}` : ''}
                  </small>
                </span>
                <StatusBadge statut={c.statut === 'actif' ? 'actif' : 'terminee'} libelle={c.statut === 'actif' ? 'En cours' : c.statut === 'rompu' ? 'Rompu' : 'Terminé'} />
                {c.statut === 'actif' && gerer && (
                  <MenuActions actions={[
                    { libelle: 'Avenant (modifier)', onClick: () => setAction({ type: 'contrat', contrat: c }) },
                    { libelle: 'Terminer', danger: true, onClick: () => setAction({ type: 'fin', contrat: c }) },
                  ]} />
                )}
              </div>
            ))}
          </div>
        </Section>
      )}
      {onglet === 'documents' && (
        <Section>
          {confidentiel ? (
            <PiecesJointes objetType="rh_employe" objetId={employe.id} titre="Dossier de l’employé" categories={CATEGORIES_DOCUMENTS_RH}
              peutAjouter={peut('rh_employes.gerer')} peutArchiver={peut('rh_employes.gerer')} confidentialite />
          ) : <p className="texte-doux">Le dossier est réservé aux personnes ayant le droit « confidentiel ».</p>}
        </Section>
      )}
      {onglet === 'presences' && donnees && (
        <Section titre="40 derniers pointages">
          {!donnees.pointages.length && <p className="texte-doux">Aucun pointage.</p>}
          {donnees.pointages.length > 0 && (
            <div className="tableau-conteneur">
              <table className="tableau">
                <thead><tr><th>Jour</th><th>Arrivée</th><th>Départ</th><th>Durée</th><th>Retard</th></tr></thead>
                <tbody>
                  {donnees.pointages.map((p) => (
                    <tr key={p.id}>
                      <td>{formatDate(p.jour)}</td><td>{heure(p.arrivee)}</td><td>{heure(p.depart)}</td><td>{duree(p.arrivee, p.depart)}</td>
                      <td>{p.retard_minutes > 0 ? <Badge ton="orange">{p.retard_minutes} min</Badge> : '—'}{p.corrige && <Badge>corrigé</Badge>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      )}
      {onglet === 'absences' && donnees && (
        <Section>
          {!donnees.absences.length && <p className="texte-doux">Aucune absence.</p>}
          <div className="liste-simple">
            {donnees.absences.map((a) => (
              <div key={a.id} className="liste-ligne">
                <span>
                  <strong>{TYPES_ABSENCE[a.type]}</strong> · {formatDate(a.debut)} → {formatDate(a.fin)} · {a.jours} j
                  {a.motif && <small className="texte-doux bloc">{a.motif}</small>}
                </span>
                <Badge ton={STATUTS_ABSENCE[a.statut][1]}>{STATUTS_ABSENCE[a.statut][0]}</Badge>
              </div>
            ))}
          </div>
        </Section>
      )}
      {action?.type === 'modifier' && (
        <FormulaireEmploye employe={employe} organisation={organisation} onFermer={() => setAction(null)} onEnregistre={(id, m) => apres(m)} />
      )}
      {action?.type === 'contrat' && (
        <FormulaireContrat employe={employe} contrat={action.contrat} remplacer={action.remplacer} organisation={organisation}
          onFermer={() => setAction(null)} onEnregistre={apres} />
      )}
      {action?.type === 'fin' && <ModaleFinContrat contrat={action.contrat} onFermer={() => setAction(null)} onFait={() => apres('Contrat terminé')} />}
      {action?.type === 'compte' && <ModaleCompte employe={employe} onFermer={() => setAction(null)} onFait={() => apres('Compte mis à jour')} />}
      {action?.type === 'absence' && (
        <FormulaireAbsence employes={[employe]} pourAutrui onFermer={() => setAction(null)} onEnregistre={() => apres('Absence enregistrée')} />
      )}
      {action?.type === 'sortie' && (
        <ModaleMotif
          titre={`Sortie de ${nomEmploye(employe)}`}
          texte="La fiche, les contrats, les présences et les documents sont conservés. Le contrat en cours est terminé aujourd’hui."
          libelleAction="Confirmer la sortie"
          onValider={(motif) => api.rpc('rh_sortie_employe', { p_employe_id: employe.id, p_date: dateLocale(), p_motif: motif }).then(() => apres('Sortie enregistrée'))}
          onFermer={() => setAction(null)}
        />
      )}
    </div>
  );
}
