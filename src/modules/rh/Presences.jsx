import React, { useState } from 'react';
import { useDonnees, useEspace } from '../../noyau/espace.jsx';
import { dateLocale, formatDate } from '../../noyau/format.js';
import {
  Badge, Bouton, Champ, DataTable, EmptyState, Erreur, Modale, PageHeader, Section, Squelette, StatCard, Tabs,
} from '../../ui/composants.jsx';
import { exporterCsv } from '../../ui/communs.jsx';
import {
  chargerOrganisation, decalerDate, duree, heure, JOURS, JOURS_COURTS, lundiDe, nomEmploye, TYPES_ABSENCE,
} from './commun.js';

const hhmm = (instant) => (instant ? heure(instant) : '');

// Saisie ou correction d'un pointage par un responsable (motif obligatoire pour corriger).
function ModalePointage({ ligne, jour, employes, onFermer, onFait }) {
  const { api, etablissement, hubs, multiHub } = useEspace();
  const existant = ligne?.pointage;
  const [v, setV] = useState({
    employe_id: ligne?.employe_id ?? '', jour, arrivee: hhmm(existant?.arrivee), depart: hhmm(existant?.depart), motif: '', note: '',
    hub_id: existant?.hub_id ?? ligne?.hub_id ?? '',
  });
  const [erreur, setErreur] = useState('');
  const changer = (champ) => (e) => setV((x) => ({ ...x, [champ]: e.target.value }));
  const valider = async (e) => {
    e.preventDefault();
    try {
      await api.rpc('rh_enregistrer_pointage', { p_etablissement_id: etablissement.id, p_pointage: v });
      onFait(existant ? 'Pointage corrigé' : 'Pointage enregistré');
    } catch (err) {
      setErreur(err.message);
    }
  };
  return (
    <Modale titre={existant ? `Corriger le pointage de ${ligne.nom}` : 'Saisir un pointage'} onFermer={onFermer}>
      <form className="formulaire" onSubmit={valider}>
        {!ligne && (
          <Champ libelle="Employé">
            <select value={v.employe_id} onChange={changer('employe_id')} required>
              <option value="">— Choisir</option>
              {employes.filter((x) => x.statut === 'actif').map((x) => <option key={x.id} value={x.id}>{nomEmploye(x)}</option>)}
            </select>
          </Champ>
        )}
        <div className="grille-champs">
          <Champ libelle="Jour"><input type="date" value={v.jour} onChange={changer('jour')} required disabled={Boolean(ligne)} /></Champ>
          {multiHub && (
            <Champ libelle="Hub">
              <select value={v.hub_id} onChange={changer('hub_id')}><option value="">—</option>{hubs.map((h) => <option key={h.id} value={h.id}>{h.nom}</option>)}</select>
            </Champ>
          )}
          <Champ libelle="Arrivée"><input type="time" value={v.arrivee} onChange={changer('arrivee')} required /></Champ>
          <Champ libelle="Départ"><input type="time" value={v.depart} onChange={changer('depart')} /></Champ>
        </div>
        {existant && <Champ libelle="Motif de la correction (conservé)"><input value={v.motif} onChange={changer('motif')} required maxLength={200} /></Champ>}
        <Champ libelle="Note"><input value={v.note} onChange={changer('note')} maxLength={200} /></Champ>
        <Erreur message={erreur} />
        <div className="actions">
          <Bouton type="button" onClick={onFermer}>Annuler</Bouton>
          <Bouton type="submit" variante="principal">Enregistrer</Bouton>
        </div>
      </form>
    </Modale>
  );
}

function etatPresence(l) {
  if (l.ferie) return ['Férié', 'neutre'];
  if (l.absence) return [TYPES_ABSENCE[l.absence.type], 'bleu'];
  if (l.pointage?.depart) return ['Parti', 'neutre'];
  if (l.pointage) return [l.pointage.retard_minutes > 0 ? `En retard (${l.pointage.retard_minutes} min)` : 'Présent', l.pointage.retard_minutes > 0 ? 'orange' : 'vert'];
  if (l.jour_travaille) return ['Non pointé', 'attention'];
  return ['Repos', 'neutre'];
}

function Aujourdhui({ organisation, gerer }) {
  const { api, etablissement, hub, multiHub, notifier } = useEspace();
  const [jour, setJour] = useState(dateLocale());
  const [action, setAction] = useState(null);
  const { donnees, chargement, erreur, recharger } = useDonnees(
    () => api.rpc('rh_presences_du_jour', { p_etablissement_id: etablissement.id, p_jour: jour, p_hub_id: multiHub && hub ? hub.id : null }),
    [etablissement.id, jour, hub?.id],
  );
  const lignes = donnees ?? [];
  const attendus = lignes.filter((l) => l.jour_travaille && !l.absence && !l.ferie);
  const presents = lignes.filter((l) => l.pointage);
  const retards = lignes.filter((l) => l.pointage?.retard_minutes > 0);
  const manquants = attendus.filter((l) => !l.pointage);
  return (
    <>
      <div className="barre-outils">
        <Champ libelle="Jour"><input type="date" value={jour} onChange={(e) => setJour(e.target.value || dateLocale())} /></Champ>
        {gerer && <Bouton icone="plus" onClick={() => setAction({})}>Saisir un pointage</Bouton>}
      </div>
      <div className="grille-indicateurs">
        <StatCard icone="utilisateur" libelle="Attendus" valeur={attendus.length} />
        <StatCard icone="horloge" libelle="Présents" valeur={presents.length} ton="positif" />
        <StatCard icone="horloge" libelle="Retards" valeur={retards.length} ton={retards.length ? 'attention' : undefined} />
        <StatCard icone="alerte" libelle="Non pointés" valeur={manquants.length} ton={manquants.length ? 'alerte' : undefined} />
      </div>
      {chargement && !donnees && <Squelette />}
      <Erreur message={erreur} />
      {donnees && (
        <DataTable
          colonnes={[
            { id: 'nom', libelle: 'Employé', tri: (l) => l.nom, rendu: (l) => <span><strong>{l.nom}</strong><small className="texte-doux bloc">{l.poste ?? l.departement ?? ''}</small></span> },
            { id: 'prevu', libelle: 'Prévu', rendu: (l) => (l.prevu ? l.prevu.slice(0, 5) : '—') },
            { id: 'arrivee', libelle: 'Arrivée', tri: (l) => l.pointage?.arrivee ?? '', rendu: (l) => heure(l.pointage?.arrivee) },
            { id: 'depart', libelle: 'Départ', rendu: (l) => heure(l.pointage?.depart) },
            { id: 'duree', libelle: 'Durée', rendu: (l) => duree(l.pointage?.arrivee, l.pointage?.depart) },
            { id: 'etat', libelle: 'État', tri: (l) => etatPresence(l)[0], rendu: (l) => <><Badge ton={etatPresence(l)[1]}>{etatPresence(l)[0]}</Badge>{l.pointage?.corrige && <Badge>corrigé</Badge>}</> },
            ...(gerer ? [{ id: 'action', libelle: '', rendu: (l) => (!l.absence && <button type="button" className="lien" onClick={(e) => { e.stopPropagation(); setAction({ ligne: l }); }}>{l.pointage ? 'Corriger' : 'Saisir'}</button>) }] : []),
          ]}
          cle="employe_id"
          lignes={lignes}
          rechercher={(l) => l.nom}
          filtres={[{ id: 'etat', libelle: 'État', options: [['manquant', 'Non pointés'], ['retard', 'En retard'], ['absence', 'Absents']],
            appliquer: (l, v) => (v === 'manquant' ? l.jour_travaille && !l.absence && !l.ferie && !l.pointage : v === 'retard' ? l.pointage?.retard_minutes > 0 : Boolean(l.absence)) }]}
          triInitial={{ id: 'nom', sens: 'asc' }}
          vide={<EmptyState titre="Aucun employé actif" icone="utilisateur" />}
        />
      )}
      {action && (
        <ModalePointage ligne={action.ligne} jour={jour} employes={organisation.employes} onFermer={() => setAction(null)}
          onFait={(m) => { setAction(null); notifier(m); recharger(); }} />
      )}
    </>
  );
}

function Journal({ organisation }) {
  const { api, etablissement } = useEspace();
  const [periode, setPeriode] = useState({ du: dateLocale(-30), au: dateLocale() });
  const { donnees, chargement, erreur } = useDonnees(
    () => api.lire('rh_pointages', { eq: { etablissement_id: etablissement.id }, gte: { jour: periode.du }, lte: { jour: periode.au }, ordre: ['jour', 'desc'], limite: 2000 }),
    [etablissement.id, periode.du, periode.au],
  );
  const nom = (p) => nomEmploye(organisation.employe[p.employe_id]);
  const minutes = (p) => (p.depart ? Math.round((new Date(p.depart) - new Date(p.arrivee)) / 60000) : 0);
  return (
    <>
      <div className="barre-outils">
        <Champ libelle="Du"><input type="date" value={periode.du} onChange={(e) => setPeriode({ ...periode, du: e.target.value })} /></Champ>
        <Champ libelle="Au"><input type="date" value={periode.au} onChange={(e) => setPeriode({ ...periode, au: e.target.value })} /></Champ>
      </div>
      {chargement && !donnees && <Squelette />}
      <Erreur message={erreur} />
      {donnees && (
        <DataTable exportable={false}
          colonnes={[
            { id: 'jour', libelle: 'Jour', tri: (p) => p.jour, rendu: (p) => formatDate(p.jour) },
            { id: 'employe', libelle: 'Employé', tri: nom, rendu: nom },
            { id: 'arrivee', libelle: 'Arrivée', rendu: (p) => heure(p.arrivee) },
            { id: 'depart', libelle: 'Départ', rendu: (p) => heure(p.depart) },
            { id: 'duree', libelle: 'Durée', tri: minutes, rendu: (p) => duree(p.arrivee, p.depart) },
            { id: 'retard', libelle: 'Retard', tri: (p) => p.retard_minutes, rendu: (p) => (p.retard_minutes > 0 ? <Badge ton="orange">{p.retard_minutes} min</Badge> : '—') },
            { id: 'source', libelle: 'Source', rendu: (p) => <>{p.source === 'manager' ? 'Responsable' : 'Employé'}{p.corrige && <Badge>corrigé</Badge>}</> },
          ]}
          lignes={donnees}
          rechercher={nom}
          filtres={[{ id: 'employe', libelle: 'Employé', options: organisation.employes.map((e) => [e.id, nomEmploye(e)]), appliquer: (p, v) => p.employe_id === v }]}
          triInitial={{ id: 'jour', sens: 'desc' }}
          actions={(
            <Bouton icone="telecharger" onClick={() => exporterCsv(`pointages-${periode.du}-${periode.au}.csv`, [
              { libelle: 'Jour', valeur: (p) => p.jour }, { libelle: 'Matricule', valeur: (p) => organisation.employe[p.employe_id]?.matricule },
              { libelle: 'Employé', valeur: nom }, { libelle: 'Arrivée', valeur: (p) => heure(p.arrivee) }, { libelle: 'Départ', valeur: (p) => (p.depart ? heure(p.depart) : '') },
              { libelle: 'Minutes', valeur: minutes }, { libelle: 'Retard (min)', valeur: (p) => p.retard_minutes },
              { libelle: 'Corrigé', valeur: (p) => (p.corrige ? `oui : ${p.motif_correction}` : '') },
            ], donnees)}>Exporter</Bouton>
          )}
          vide={<EmptyState titre="Aucun pointage sur la période" icone="horloge" />}
        />
      )}
    </>
  );
}

function ModaleCreneau({ creneau, employe, jour, onFermer, onFait }) {
  const { api, etablissement, hubs, multiHub } = useEspace();
  const [v, setV] = useState({
    id: creneau?.id, employe_id: employe.id, jour: creneau?.jour ?? jour, debut: creneau?.debut?.slice(0, 5) ?? '08:00', fin: creneau?.fin?.slice(0, 5) ?? '17:00',
    hub_id: creneau?.hub_id ?? employe.hub_id ?? '', note: creneau?.note ?? '',
  });
  const [erreur, setErreur] = useState('');
  const changer = (champ) => (e) => setV((x) => ({ ...x, [champ]: e.target.value }));
  const enregistrer = async (statut) => {
    try {
      await api.rpc('rh_enregistrer_creneau', { p_etablissement_id: etablissement.id, p_creneau: { ...v, statut } });
      onFait(statut === 'annule' ? 'Créneau retiré' : 'Créneau enregistré');
    } catch (err) {
      setErreur(err.message);
    }
  };
  return (
    <Modale
      titre={`${nomEmploye(employe)} · ${formatDate(v.jour)}`}
      onFermer={onFermer}
      pied={(
        <>
          {creneau && <Bouton variante="danger" onClick={() => enregistrer('annule')}>Retirer</Bouton>}
          <Bouton variante="principal" onClick={() => enregistrer('prevu')}>Enregistrer</Bouton>
        </>
      )}
    >
      <div className="grille-champs">
        <Champ libelle="Début"><input type="time" value={v.debut} onChange={changer('debut')} required /></Champ>
        <Champ libelle="Fin"><input type="time" value={v.fin} onChange={changer('fin')} required /></Champ>
        {multiHub && (
          <Champ libelle="Hub">
            <select value={v.hub_id} onChange={changer('hub_id')}><option value="">—</option>{hubs.map((h) => <option key={h.id} value={h.id}>{h.nom}</option>)}</select>
          </Champ>
        )}
      </div>
      <Champ libelle="Note"><input value={v.note} onChange={changer('note')} maxLength={200} /></Champ>
      <p className="texte-doux">Un créneau remplace l’horaire type ce jour-là. Fin avant début = service de nuit.</p>
      <Erreur message={erreur} />
    </Modale>
  );
}

function Planning({ organisation, gerer }) {
  const { api, etablissement, notifier } = useEspace();
  const [debut, setDebut] = useState(lundiDe(dateLocale()));
  const [action, setAction] = useState(null);
  const jours = Array.from({ length: 7 }, (_, i) => decalerDate(debut, i));
  const { donnees, erreur, recharger } = useDonnees(
    () => api.lire('rh_creneaux', { eq: { etablissement_id: etablissement.id, statut: 'prevu' }, gte: { jour: jours[0] }, lte: { jour: jours[6] } }),
    [etablissement.id, debut],
  );
  const employes = organisation.employes.filter((e) => e.statut === 'actif');
  const horaireDu = (e, jour) => {
    const iso = ((new Date(`${jour}T12:00:00`).getDay() + 6) % 7) + 1;
    return organisation.horaire[e.horaire_id]?.jours.find((j) => j.jour === iso);
  };
  return (
    <Section
      titre={`Semaine du ${formatDate(jours[0])}`}
      sousTitre="Horaire type en gris, créneaux planifiés en couleur"
      action={(
        <div className="groupe-boutons">
          <Bouton onClick={() => setDebut(decalerDate(debut, -7))} aria-label="Semaine précédente">‹</Bouton>
          <Bouton onClick={() => setDebut(lundiDe(dateLocale()))}>Cette semaine</Bouton>
          <Bouton onClick={() => setDebut(decalerDate(debut, 7))} aria-label="Semaine suivante">›</Bouton>
        </div>
      )}
    >
      <Erreur message={erreur} />
      {!employes.length && <p className="texte-doux">Aucun employé actif.</p>}
      {employes.length > 0 && (
        <div className="tableau-conteneur">
          <table className="planning planning-large">
            <thead>
              <tr><th scope="col">Employé</th>{jours.map((j, i) => <th key={j} scope="col">{JOURS_COURTS[i + 1]} {new Date(`${j}T12:00:00`).getDate()}</th>)}</tr>
            </thead>
            <tbody>
              {employes.map((e) => (
                <tr key={e.id}>
                  <th scope="row">{nomEmploye(e)}</th>
                  {jours.map((j) => {
                    const c = donnees?.find((x) => x.employe_id === e.id && x.jour === j);
                    const h = horaireDu(e, j);
                    const contenu = c ? `${c.debut.slice(0, 5)}–${c.fin.slice(0, 5)}` : h ? `${h.debut}–${h.fin}` : '';
                    return (
                      <td key={j} className={c ? 'creneau' : h ? 'creneau-type' : ''}>
                        {gerer ? (
                          <button type="button" className="cellule-planning" onClick={() => setAction({ employe: e, jour: j, creneau: c })} aria-label={`Planifier ${nomEmploye(e)} le ${formatDate(j)}`}>
                            {contenu || '+'}
                          </button>
                        ) : contenu}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {action && (
        <ModaleCreneau {...action} onFermer={() => setAction(null)} onFait={(m) => { setAction(null); notifier(m); recharger(); }} />
      )}
    </Section>
  );
}

function FormulaireHoraire({ horaire, onFermer, onFait }) {
  const { api, etablissement } = useEspace();
  const [nom, setNom] = useState(horaire?.nom ?? '');
  const [actif, setActif] = useState(horaire?.actif ?? true);
  const [jours, setJours] = useState(() => Object.fromEntries(JOURS.map(([n]) => {
    const j = horaire?.jours.find((x) => x.jour === n);
    return [n, j ? { ...j, actif: true } : { jour: n, debut: '08:00', fin: '17:00', pause: 60, actif: !horaire && n <= 5 }];
  })));
  const [erreur, setErreur] = useState('');
  const changer = (n, champ, valeur) => setJours((x) => ({ ...x, [n]: { ...x[n], [champ]: valeur } }));
  const valider = async (e) => {
    e.preventDefault();
    try {
      await api.rpc('rh_enregistrer_horaire', {
        p_etablissement_id: etablissement.id,
        p_horaire: {
          id: horaire?.id, nom, actif,
          jours: Object.values(jours).filter((j) => j.actif).map(({ jour, debut, fin, pause }) => ({ jour, debut, fin, pause: String(pause || 0) })),
        },
      });
      onFait();
    } catch (err) {
      setErreur(err.message);
    }
  };
  return (
    <Modale titre={horaire ? `Modifier ${horaire.nom}` : 'Nouvel horaire type'} onFermer={onFermer} large>
      <form className="formulaire" onSubmit={valider}>
        <Champ libelle="Nom"><input value={nom} onChange={(e) => setNom(e.target.value)} required maxLength={60} placeholder="Journée continue, Équipe du matin…" /></Champ>
        <div className="tableau-conteneur">
          <table className="tableau compact">
            <thead><tr><th>Jour</th><th>Travaillé</th><th>Début</th><th>Fin</th><th>Pause (min)</th></tr></thead>
            <tbody>
              {JOURS.map(([n, libelle]) => (
                <tr key={n}>
                  <td>{libelle}</td>
                  <td><input type="checkbox" checked={jours[n].actif} onChange={(e) => changer(n, 'actif', e.target.checked)} aria-label={`${libelle} travaillé`} /></td>
                  <td><input type="time" value={jours[n].debut} disabled={!jours[n].actif} onChange={(e) => changer(n, 'debut', e.target.value)} aria-label={`Début ${libelle}`} /></td>
                  <td><input type="time" value={jours[n].fin} disabled={!jours[n].actif} onChange={(e) => changer(n, 'fin', e.target.value)} aria-label={`Fin ${libelle}`} /></td>
                  <td><input type="number" min="0" max="480" value={jours[n].pause} disabled={!jours[n].actif} onChange={(e) => changer(n, 'pause', e.target.value)} aria-label={`Pause ${libelle}`} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {horaire && <label className="case"><input type="checkbox" checked={actif} onChange={(e) => setActif(e.target.checked)} /> Horaire actif</label>}
        <Erreur message={erreur} />
        <div className="actions">
          <Bouton type="button" onClick={onFermer}>Annuler</Bouton>
          <Bouton type="submit" variante="principal">Enregistrer</Bouton>
        </div>
      </form>
    </Modale>
  );
}

function Horaires({ organisation, gerer, onChange }) {
  const { notifier } = useEspace();
  const [edition, setEdition] = useState(null);
  return (
    <Section titre="Horaires types" sousTitre="Servent à calculer les retards et les jours de congé" action={gerer && <Bouton icone="plus" onClick={() => setEdition({})}>Nouvel horaire</Bouton>}>
      {!organisation.horaires.length && <EmptyState titre="Aucun horaire" texte="Créez un horaire type puis affectez-le aux employés depuis leur fiche." icone="horloge" />}
      <div className="liste-simple">
        {organisation.horaires.map((h) => (
          <div key={h.id} className={`liste-ligne ${h.actif ? '' : 'barre'}`}>
            <span>
              <strong>{h.nom}</strong>
              <small className="texte-doux bloc">{h.jours.map((j) => `${JOURS_COURTS[j.jour]} ${j.debut}–${j.fin}`).join(' · ') || 'Aucun jour'}</small>
            </span>
            <Badge>{organisation.employes.filter((e) => e.horaire_id === h.id && e.statut !== 'sorti').length} pers.</Badge>
            {gerer && <button type="button" className="lien" onClick={() => setEdition({ horaire: h })}>Modifier</button>}
          </div>
        ))}
      </div>
      {edition && <FormulaireHoraire horaire={edition.horaire} onFermer={() => setEdition(null)} onFait={() => { setEdition(null); notifier('Horaire enregistré'); onChange(); }} />}
    </Section>
  );
}

export default function Presences() {
  const { api, etablissement, peut } = useEspace();
  const [onglet, setOnglet] = useState('jour');
  const gerer = peut('rh_presences.gerer');
  const { donnees, chargement, erreur, recharger } = useDonnees(() => chargerOrganisation(api, etablissement.id), [etablissement.id]);
  return (
    <div className="page">
      <PageHeader titre="Présences" sousTitre="Pointages, retards, planning et horaires" />
      <Tabs onglets={[['jour', 'Aujourd’hui'], ['journal', 'Journal'], ['planning', 'Planning'], ['horaires', 'Horaires types']]} actif={onglet} onChange={setOnglet} />
      {chargement && !donnees && <Squelette />}
      <Erreur message={erreur} />
      {donnees && onglet === 'jour' && <Aujourdhui organisation={donnees} gerer={gerer} />}
      {donnees && onglet === 'journal' && <Journal organisation={donnees} />}
      {donnees && onglet === 'planning' && <Planning organisation={donnees} gerer={gerer} />}
      {donnees && onglet === 'horaires' && <Horaires organisation={donnees} gerer={gerer} onChange={recharger} />}
    </div>
  );
}
