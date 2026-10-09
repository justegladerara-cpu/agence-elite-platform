import React, { useMemo, useState } from 'react';
import { useDonnees, useEspace } from '../../noyau/espace.jsx';
import { dateLocale, formatDate, formatDateHeure } from '../../noyau/format.js';
import { lireParametres } from '../../noyau/routes.js';
import {
  Badge, Bouton, Champ, DataTable, EmptyState, Erreur, MenuActions, Modale, ModaleMotif, PageHeader, Section, Squelette, Tabs,
} from '../../ui/composants.jsx';
import { exporterCsv } from '../../ui/communs.jsx';
import {
  chargerOrganisation, decalerDate, JOURS_COURTS, lundiDe, nomEmploye, STATUTS_ABSENCE, TYPES_ABSENCE,
} from './commun.js';

// Demande d'absence : pour soi (espace employé) ou saisie pour autrui par un valideur.
export function FormulaireAbsence({ employes = [], pourAutrui, onFermer, onEnregistre }) {
  const { api, etablissement } = useEspace();
  const [v, setV] = useState({
    employe_id: employes.length === 1 ? employes[0].id : '', type: 'conge_paye', debut: dateLocale(1), fin: dateLocale(1),
    demi_journee_debut: false, demi_journee_fin: false, motif: '', approuver: Boolean(pourAutrui),
  });
  const [erreur, setErreur] = useState('');
  const [chargement, setChargement] = useState(false);
  const changer = (champ) => (e) => setV((x) => ({ ...x, [champ]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const enregistrer = async (e) => {
    e.preventDefault();
    setChargement(true);
    setErreur('');
    try {
      const donnees = { ...v };
      if (!pourAutrui) {
        delete donnees.employe_id;
        delete donnees.approuver;
      }
      await api.rpc('rh_demander_absence', { p_etablissement_id: etablissement.id, p_absence: donnees });
      onEnregistre();
    } catch (err) {
      setErreur(err.message);
      setChargement(false);
    }
  };
  return (
    <Modale titre={pourAutrui ? 'Saisir une absence' : 'Demander une absence'} onFermer={onFermer}>
      <form className="formulaire" onSubmit={enregistrer}>
        {pourAutrui && employes.length > 1 && (
          <Champ libelle="Employé">
            <select value={v.employe_id} onChange={changer('employe_id')} required>
              <option value="">— Choisir</option>
              {employes.filter((x) => x.statut !== 'sorti').map((x) => <option key={x.id} value={x.id}>{nomEmploye(x)}</option>)}
            </select>
          </Champ>
        )}
        <Champ libelle="Type">
          <select value={v.type} onChange={changer('type')}>{Object.entries(TYPES_ABSENCE).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        </Champ>
        <div className="grille-champs">
          <Champ libelle="Du"><input type="date" value={v.debut} onChange={(e) => setV((x) => ({ ...x, debut: e.target.value, fin: x.fin < e.target.value ? e.target.value : x.fin }))} required /></Champ>
          <Champ libelle="Au (inclus)"><input type="date" value={v.fin} min={v.debut} onChange={changer('fin')} required /></Champ>
        </div>
        <div className="ligne-cases">
          <label className="case"><input type="checkbox" checked={v.demi_journee_debut} onChange={changer('demi_journee_debut')} /> Commence l’après-midi</label>
          <label className="case"><input type="checkbox" checked={v.demi_journee_fin} onChange={changer('demi_journee_fin')} /> Finit à midi</label>
        </div>
        <Champ libelle="Motif" aide="Facultatif pour un congé payé.">
          <textarea rows={2} value={v.motif} onChange={changer('motif')} maxLength={500} />
        </Champ>
        {pourAutrui && <label className="case"><input type="checkbox" checked={v.approuver} onChange={changer('approuver')} /> Approuver directement</label>}
        <p className="texte-doux">Les jours sont comptés sur les jours travaillés, hors jours fériés.</p>
        <Erreur message={erreur} />
        <div className="actions">
          <Bouton type="button" onClick={onFermer}>Annuler</Bouton>
          <Bouton type="submit" variante="principal" chargement={chargement}>{pourAutrui ? 'Enregistrer' : 'Envoyer la demande'}</Bouton>
        </div>
      </form>
    </Modale>
  );
}

// Décision sur une demande : approbation (commentaire facultatif) ou refus (commentaire obligatoire).
export function ModaleDecision({ absence, nom, onFermer, onFait }) {
  const { api } = useEspace();
  const [commentaire, setCommentaire] = useState('');
  const [erreur, setErreur] = useState('');
  const decider = async (decision) => {
    try {
      await api.rpc('rh_decider_absence', { p_absence_id: absence.id, p_decision: decision, p_commentaire: commentaire || null });
      onFait(decision === 'approuvee' ? 'Absence approuvée' : 'Demande refusée');
    } catch (err) {
      setErreur(err.message);
    }
  };
  return (
    <Modale
      titre={`Demande de ${nom}`}
      onFermer={onFermer}
      pied={(
        <>
          <Bouton variante="danger" disabled={!commentaire.trim()} onClick={() => decider('refusee')}>Refuser</Bouton>
          <Bouton variante="principal" onClick={() => decider('approuvee')}>Approuver</Bouton>
        </>
      )}
    >
      <dl className="details">
        <dt>Type</dt><dd>{TYPES_ABSENCE[absence.type]}</dd>
        <dt>Période</dt><dd>{formatDate(absence.debut)} → {formatDate(absence.fin)} ({absence.jours} j)</dd>
        {absence.motif && <><dt>Motif</dt><dd>{absence.motif}</dd></>}
        <dt>Demandée le</dt><dd>{formatDateHeure(absence.demandee_le)}</dd>
      </dl>
      <Champ libelle="Commentaire" aide="Obligatoire pour refuser.">
        <textarea rows={2} value={commentaire} onChange={(e) => setCommentaire(e.target.value)} maxLength={500} />
      </Champ>
      <Erreur message={erreur} />
    </Modale>
  );
}

function Calendrier({ absences, employes, feries }) {
  const [debut, setDebut] = useState(lundiDe(dateLocale()));
  const jours = Array.from({ length: 14 }, (_, i) => decalerDate(debut, i));
  const visibles = employes.filter((e) => e.statut !== 'sorti');
  const absenceDe = (employeId, jour) => absences.find((a) => a.employe_id === employeId && ['approuvee', 'demandee'].includes(a.statut) && a.debut <= jour && a.fin >= jour);
  const ferie = (jour) => feries.find((f) => f.jour === jour && f.actif);
  return (
    <Section
      titre={`Du ${formatDate(jours[0])} au ${formatDate(jours[13])}`}
      action={(
        <div className="groupe-boutons">
          <Bouton onClick={() => setDebut(decalerDate(debut, -14))} aria-label="Période précédente">‹</Bouton>
          <Bouton onClick={() => setDebut(lundiDe(dateLocale()))}>Aujourd’hui</Bouton>
          <Bouton onClick={() => setDebut(decalerDate(debut, 14))} aria-label="Période suivante">›</Bouton>
        </div>
      )}
    >
      {!visibles.length && <p className="texte-doux">Aucun employé.</p>}
      {visibles.length > 0 && (
        <div className="tableau-conteneur">
          <table className="planning">
            <thead>
              <tr>
                <th scope="col">Employé</th>
                {jours.map((j) => {
                  const d = new Date(`${j}T12:00:00`);
                  return <th key={j} scope="col" className={ferie(j) ? 'ferie' : ''} title={ferie(j)?.libelle}>{JOURS_COURTS[((d.getDay() + 6) % 7) + 1]}<br />{d.getDate()}</th>;
                })}
              </tr>
            </thead>
            <tbody>
              {visibles.map((e) => (
                <tr key={e.id}>
                  <th scope="row">{nomEmploye(e)}</th>
                  {jours.map((j) => {
                    const a = absenceDe(e.id, j);
                    return (
                      <td key={j} className={`${ferie(j) ? 'ferie' : ''} ${a ? `absence ${a.statut}` : ''}`} title={a ? `${TYPES_ABSENCE[a.type]} · ${STATUTS_ABSENCE[a.statut][0]}` : undefined}>
                        {a ? (a.statut === 'demandee' ? '?' : '•') : ''}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="legende"><span className="pastille absence approuvee" /> Absence approuvée <span className="pastille absence demandee" /> En attente <span className="pastille ferie" /> Jour férié</p>
    </Section>
  );
}

function ModaleAjustement({ employe, annee, onFermer, onFait }) {
  const { api, etablissement } = useEspace();
  const [v, setV] = useState({ jours: '', motif: '' });
  const [erreur, setErreur] = useState('');
  const valider = async (e) => {
    e.preventDefault();
    try {
      await api.rpc('rh_ajuster_solde', {
        p_etablissement_id: etablissement.id, p_employe_id: employe.employe_id, p_annee: annee, p_jours: Number(v.jours), p_motif: v.motif,
      });
      onFait();
    } catch (err) {
      setErreur(err.message);
    }
  };
  return (
    <Modale titre={`Ajuster le solde de ${employe.nom}`} onFermer={onFermer}>
      <form className="formulaire" onSubmit={valider}>
        <Champ libelle="Jours (positif pour ajouter, négatif pour retirer)"><input type="number" step="0.5" value={v.jours} onChange={(e) => setV({ ...v, jours: e.target.value })} required /></Champ>
        <Champ libelle="Motif (conservé)"><input value={v.motif} onChange={(e) => setV({ ...v, motif: e.target.value })} required maxLength={200} placeholder="Report de l’an passé, reprise d’ancienneté…" /></Champ>
        <Erreur message={erreur} />
        <div className="actions">
          <Bouton type="button" onClick={onFermer}>Annuler</Bouton>
          <Bouton type="submit" variante="principal" disabled={!v.jours || Number(v.jours) === 0 || !v.motif.trim()}>Enregistrer</Bouton>
        </div>
      </form>
    </Modale>
  );
}

function ModaleFerie({ ferie, onFermer, onFait }) {
  const { api, etablissement } = useEspace();
  const [v, setV] = useState({ jour: ferie?.jour ?? '', libelle: ferie?.libelle ?? '', actif: ferie?.actif ?? true });
  const [erreur, setErreur] = useState('');
  const valider = async (e) => {
    e.preventDefault();
    try {
      await api.rpc('rh_enregistrer_jour_ferie', { p_etablissement_id: etablissement.id, p_jour: v.jour, p_libelle: v.libelle, p_actif: v.actif });
      onFait();
    } catch (err) {
      setErreur(err.message);
    }
  };
  return (
    <Modale titre={ferie ? 'Modifier le jour férié' : 'Ajouter un jour férié'} onFermer={onFermer}>
      <form className="formulaire" onSubmit={valider}>
        <Champ libelle="Date"><input type="date" value={v.jour} onChange={(e) => setV({ ...v, jour: e.target.value })} required disabled={Boolean(ferie)} /></Champ>
        <Champ libelle="Libellé"><input value={v.libelle} onChange={(e) => setV({ ...v, libelle: e.target.value })} required maxLength={80} placeholder="Fête de l’indépendance" /></Champ>
        <label className="case"><input type="checkbox" checked={v.actif} onChange={(e) => setV({ ...v, actif: e.target.checked })} /> Chômé (non décompté des congés)</label>
        <Erreur message={erreur} />
        <div className="actions">
          <Bouton type="button" onClick={onFermer}>Annuler</Bouton>
          <Bouton type="submit" variante="principal">Enregistrer</Bouton>
        </div>
      </form>
    </Modale>
  );
}

export default function Conges({ naviguer }) {
  const { api, etablissement, peut, notifier } = useEspace();
  const valideur = peut('rh_conges.valider');
  // #/conges?statut=… (tableau de bord) : la liste filtrée « Toutes les absences ».
  const [onglet, setOnglet] = useState(() => (lireParametres().get('statut') || !valideur ? 'toutes' : 'a_traiter'));
  const [annee, setAnnee] = useState(new Date().getFullYear());
  const [action, setAction] = useState(null);
  const { donnees, chargement, erreur, recharger } = useDonnees(async () => {
    const [organisation, absences, feries, soldes] = await Promise.all([
      chargerOrganisation(api, etablissement.id),
      api.lire('rh_absences', { eq: { etablissement_id: etablissement.id }, ordre: ['debut', 'desc'], limite: 1000 }),
      api.lire('rh_jours_feries', { eq: { etablissement_id: etablissement.id }, ordre: ['jour'] }),
      api.rpc('rh_soldes_conges', { p_etablissement_id: etablissement.id, p_annee: annee }),
    ]);
    return { ...organisation, absences, feries, soldes };
  }, [etablissement.id, annee]);
  const enAttente = useMemo(() => (donnees?.absences ?? []).filter((a) => a.statut === 'demandee').sort((a, b) => a.debut.localeCompare(b.debut)), [donnees]);
  const apres = (message) => {
    setAction(null);
    notifier(message);
    recharger();
  };
  const nom = (a) => nomEmploye(donnees?.employe[a.employe_id]);
  const onglets = [
    ...(valideur ? [['a_traiter', 'À traiter', enAttente.length]] : []),
    ['calendrier', 'Calendrier'], ['toutes', 'Toutes les absences'], ['soldes', 'Soldes'], ['feries', 'Jours fériés'],
  ];
  const actionsAbsence = (a) => [
    a.statut === 'demandee' && valideur && { libelle: 'Décider', onClick: () => setAction({ type: 'decision', absence: a }) },
    ['demandee', 'approuvee'].includes(a.statut) && valideur && { libelle: 'Annuler', danger: true, onClick: () => setAction({ type: 'annuler', absence: a }) },
  ];
  return (
    <div className="page">
      <PageHeader
        titre="Congés et absences"
        sousTitre="Demandes, validations, calendrier et soldes"
        actions={valideur && donnees && <Bouton variante="principal" icone="plus" onClick={() => setAction({ type: 'saisie' })}>Saisir une absence</Bouton>}
      />
      <Tabs onglets={onglets} actif={onglet} onChange={setOnglet} />
      {chargement && !donnees && <Squelette lignes={6} />}
      <Erreur message={erreur} />
      {donnees && onglet === 'a_traiter' && (
        <Section>
          {!enAttente.length && <EmptyState titre="Rien à traiter" texte="Aucune demande en attente." icone="valise" />}
          <div className="liste-simple">
            {enAttente.map((a) => (
              <div key={a.id} className="liste-ligne">
                <span>
                  <strong>{nom(a)}</strong> · {TYPES_ABSENCE[a.type]}
                  <small className="texte-doux bloc">{formatDate(a.debut)} → {formatDate(a.fin)} · {a.jours} j{a.motif ? ` · ${a.motif}` : ''}</small>
                </span>
                <Bouton variante="principal" onClick={() => setAction({ type: 'decision', absence: a })}>Décider</Bouton>
              </div>
            ))}
          </div>
        </Section>
      )}
      {donnees && onglet === 'calendrier' && <Calendrier absences={donnees.absences} employes={donnees.employes} feries={donnees.feries} />}
      {donnees && onglet === 'toutes' && (
        <DataTable exportable={false}
          colonnes={[
            { id: 'employe', libelle: 'Employé', tri: nom, rendu: (a) => <button type="button" className="lien" onClick={(e) => { e.stopPropagation(); naviguer(`employes/${a.employe_id}`); }}>{nom(a)}</button> },
            { id: 'type', libelle: 'Type', tri: (a) => a.type, rendu: (a) => TYPES_ABSENCE[a.type] },
            { id: 'debut', libelle: 'Du', tri: (a) => a.debut, rendu: (a) => formatDate(a.debut) },
            { id: 'fin', libelle: 'Au', tri: (a) => a.fin, rendu: (a) => formatDate(a.fin) },
            { id: 'jours', libelle: 'Jours', tri: (a) => Number(a.jours), rendu: (a) => a.jours, classe: 'nombre' },
            { id: 'statut', libelle: 'Statut', tri: (a) => a.statut, rendu: (a) => <Badge ton={STATUTS_ABSENCE[a.statut][1]}>{STATUTS_ABSENCE[a.statut][0]}</Badge> },
            { id: 'actions', libelle: '', rendu: (a) => <MenuActions actions={actionsAbsence(a)} /> },
          ]}
          lignes={donnees.absences}
          rechercher={(a) => `${nom(a)} ${TYPES_ABSENCE[a.type]} ${a.motif ?? ''}`}
          filtres={[
            { id: 'statut', libelle: 'Statut', options: Object.entries(STATUTS_ABSENCE).map(([k, [l]]) => [k, l]), appliquer: (a, v) => a.statut === v },
            { id: 'type', libelle: 'Type', options: Object.entries(TYPES_ABSENCE), appliquer: (a, v) => a.type === v },
          ]}
          triInitial={{ id: 'debut', sens: 'desc' }}
          actions={(
            <Bouton icone="telecharger" onClick={() => exporterCsv('absences.csv', [
              { libelle: 'Employé', valeur: nom }, { libelle: 'Type', valeur: (a) => TYPES_ABSENCE[a.type] }, { libelle: 'Du', valeur: (a) => a.debut },
              { libelle: 'Au', valeur: (a) => a.fin }, { libelle: 'Jours', valeur: (a) => String(a.jours).replace('.', ',') },
              { libelle: 'Statut', valeur: (a) => STATUTS_ABSENCE[a.statut][0] }, { libelle: 'Motif', valeur: (a) => a.motif },
            ], donnees.absences)}>Exporter</Bouton>
          )}
          vide={<EmptyState titre="Aucune absence" icone="valise" />}
        />
      )}
      {donnees && onglet === 'soldes' && (
        <Section
          titre={`Soldes de congés payés ${annee}`}
          sousTitre="Droit au prorata de la présence dans l’année, plus les ajustements, moins les congés approuvés"
          action={(
            <select value={annee} onChange={(e) => setAnnee(Number(e.target.value))} aria-label="Année">
              {[annee - 1, annee, annee + 1].map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          )}
        >
          <DataTable exportable={false}
            colonnes={[
              { id: 'nom', libelle: 'Employé', tri: (s) => s.nom, rendu: (s) => <strong>{s.nom}</strong> },
              { id: 'droit', libelle: 'Acquis', tri: (s) => Number(s.droit), rendu: (s) => s.droit, classe: 'nombre' },
              { id: 'ajustements', libelle: 'Ajustements', rendu: (s) => (Number(s.ajustements) ? s.ajustements : '—'), classe: 'nombre' },
              { id: 'pris', libelle: 'Pris', tri: (s) => Number(s.pris), rendu: (s) => s.pris, classe: 'nombre' },
              { id: 'attente', libelle: 'En attente', rendu: (s) => (Number(s.en_attente) ? s.en_attente : '—'), classe: 'nombre' },
              { id: 'solde', libelle: 'Solde', tri: (s) => Number(s.solde), rendu: (s) => <strong className={Number(s.solde) < 0 ? 'texte-alerte' : ''}>{s.solde}</strong>, classe: 'nombre' },
              ...(valideur ? [{ id: 'ajuster', libelle: '', rendu: (s) => <button type="button" className="lien" onClick={(e) => { e.stopPropagation(); setAction({ type: 'ajuster', employe: s }); }}>Ajuster</button> }] : []),
            ]}
            cle="employe_id"
            lignes={donnees.soldes}
            rechercher={(s) => s.nom}
            triInitial={{ id: 'nom', sens: 'asc' }}
            actions={(
              <Bouton icone="telecharger" onClick={() => exporterCsv(`soldes-conges-${annee}.csv`, [
                { libelle: 'Matricule', valeur: (s) => s.matricule }, { libelle: 'Employé', valeur: (s) => s.nom },
                ...['droit', 'ajustements', 'pris', 'en_attente', 'solde'].map((k) => ({ libelle: k, valeur: (s) => String(s[k]).replace('.', ',') })),
              ], donnees.soldes)}>Exporter</Bouton>
            )}
            vide={<EmptyState titre="Aucun employé" icone="utilisateur" />}
          />
        </Section>
      )}
      {donnees && onglet === 'feries' && (
        <Section titre="Jours fériés" sousTitre="Non décomptés des congés" action={peut('rh_conges.valider') && <Bouton icone="plus" onClick={() => setAction({ type: 'ferie' })}>Ajouter</Bouton>}>
          {!donnees.feries.length && <p className="texte-doux">Aucun jour férié enregistré.</p>}
          <div className="liste-simple">
            {donnees.feries.map((f) => (
              <div key={f.id} className={`liste-ligne ${f.actif ? '' : 'barre'}`}>
                <span><strong>{formatDate(f.jour)}</strong> · {f.libelle}</span>
                {!f.actif && <Badge>non chômé</Badge>}
                {valideur && <button type="button" className="lien" onClick={() => setAction({ type: 'ferie', ferie: f })}>Modifier</button>}
              </div>
            ))}
          </div>
        </Section>
      )}
      {action?.type === 'saisie' && (
        <FormulaireAbsence employes={donnees.employes} pourAutrui onFermer={() => setAction(null)} onEnregistre={() => apres('Absence enregistrée')} />
      )}
      {action?.type === 'decision' && <ModaleDecision absence={action.absence} nom={nom(action.absence)} onFermer={() => setAction(null)} onFait={apres} />}
      {action?.type === 'annuler' && (
        <ModaleMotif
          titre="Annuler l’absence"
          texte="L’absence reste dans l’historique avec le motif d’annulation."
          libelleAction="Annuler l’absence"
          onValider={(motif) => api.rpc('rh_annuler_absence', { p_absence_id: action.absence.id, p_motif: motif }).then(() => apres('Absence annulée'))}
          onFermer={() => setAction(null)}
        />
      )}
      {action?.type === 'ajuster' && <ModaleAjustement employe={action.employe} annee={annee} onFermer={() => setAction(null)} onFait={() => apres('Solde ajusté')} />}
      {action?.type === 'ferie' && <ModaleFerie ferie={action.ferie} onFermer={() => setAction(null)} onFait={() => apres('Jour férié enregistré')} />}
    </div>
  );
}
