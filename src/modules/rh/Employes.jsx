import React, { useMemo, useState } from 'react';
import { useDonnees, useEspace } from '../../noyau/espace.jsx';
import { dateLocale, formatDate } from '../../noyau/format.js';
import {
  Avatar, Badge, Bouton, Champ, DataTable, EmptyState, Erreur, lireImageReduite, Modale, PageHeader, Section, Squelette, StatusBadge, Tabs,
} from '../../ui/composants.jsx';
import { exporterCsv } from '../../ui/communs.jsx';
import { chargerOrganisation, nomEmploye, STATUTS_EMPLOYE, TYPES_CONTRAT } from './commun.js';
import FicheEmploye from './FicheEmploye.jsx';

export function FormulaireEmploye({ employe, organisation, onFermer, onEnregistre }) {
  const { api, etablissement, peut, hubs, multiHub } = useEspace();
  const confidentiel = peut('rh_employes.confidentiel');
  const [v, setV] = useState({
    prenom: '', nom: '', sexe: '', telephone: '', email: '', departement_id: '', poste_id: '', manager_id: '', hub_id: '',
    horaire_id: '', date_entree: dateLocale(), matricule: '', notes: '', statut: 'actif', photo: '',
    ...(employe ? Object.fromEntries(Object.entries(employe).map(([k, x]) => [k, x ?? ''])) : {}),
  });
  const [prive, setPrive] = useState(null);
  const [voirPrive, setVoirPrive] = useState(false);
  const [erreur, setErreur] = useState('');
  const [chargement, setChargement] = useState(false);
  const changer = (champ) => (e) => setV((x) => ({ ...x, [champ]: e.target.value }));
  const changerPrive = (champ) => (e) => setPrive((x) => ({ ...x, [champ]: e.target.value }));
  const ouvrirPrive = async () => {
    setVoirPrive(true);
    if (prive) return;
    const lignes = employe ? await api.lire('rh_employes_prives', { eq: { employe_id: employe.id } }) : [];
    setPrive(Object.fromEntries(Object.entries(lignes[0] ?? {}).map(([k, x]) => [k, x ?? ''])));
  };
  const enregistrer = async (e) => {
    e.preventDefault();
    setChargement(true);
    setErreur('');
    try {
      const id = await api.rpc('rh_enregistrer_employe', {
        p_etablissement_id: etablissement.id,
        p_employe: { ...v, id: employe?.id, ...(prive && voirPrive ? { prive } : {}) },
      });
      onEnregistre(id, employe ? 'Fiche mise à jour' : 'Employé ajouté');
    } catch (err) {
      setErreur(err.message);
      setChargement(false);
    }
  };
  const managers = organisation.employes.filter((x) => x.statut !== 'sorti' && x.id !== employe?.id);
  return (
    <Modale titre={employe ? `Modifier ${nomEmploye(employe)}` : 'Nouvel employé'} onFermer={onFermer} large>
      <form className="formulaire" onSubmit={enregistrer}>
        <div className="article-photo">
          <Avatar nom={`${v.prenom} ${v.nom}`} image={v.photo || undefined} taille="grand" />
          <label className="bouton secondaire">
            <input type="file" accept="image/*" hidden onChange={async (e) => {
              const fichier = e.target.files?.[0];
              if (!fichier) return;
              try {
                const image = await lireImageReduite(fichier, 320);
                setV((x) => ({ ...x, photo: image }));
              } catch (err) {
                setErreur(err.message);
              }
            }} />
            Photo
          </label>
        </div>
        <div className="grille-champs">
          <Champ libelle="Prénom"><input value={v.prenom} onChange={changer('prenom')} required autoFocus maxLength={60} /></Champ>
          <Champ libelle="Nom"><input value={v.nom} onChange={changer('nom')} required maxLength={60} /></Champ>
          <Champ libelle="Téléphone"><input type="tel" value={v.telephone} onChange={changer('telephone')} maxLength={30} /></Champ>
          <Champ libelle="E-mail"><input type="email" value={v.email} onChange={changer('email')} maxLength={120} /></Champ>
          <Champ libelle="Sexe">
            <select value={v.sexe} onChange={changer('sexe')}><option value="">—</option><option value="F">Femme</option><option value="M">Homme</option></select>
          </Champ>
          <Champ libelle="Date d’entrée"><input type="date" value={v.date_entree} onChange={changer('date_entree')} required /></Champ>
          <Champ libelle="Département">
            <select value={v.departement_id} onChange={changer('departement_id')}>
              <option value="">—</option>
              {organisation.departements.filter((d) => d.actif || d.id === v.departement_id).map((d) => <option key={d.id} value={d.id}>{d.nom}</option>)}
            </select>
          </Champ>
          <Champ libelle="Poste">
            <select value={v.poste_id} onChange={changer('poste_id')}>
              <option value="">—</option>
              {organisation.postes.filter((p) => p.actif || p.id === v.poste_id).map((p) => <option key={p.id} value={p.id}>{p.intitule}</option>)}
            </select>
          </Champ>
          <Champ libelle="Manager">
            <select value={v.manager_id} onChange={changer('manager_id')}>
              <option value="">—</option>
              {managers.map((m) => <option key={m.id} value={m.id}>{nomEmploye(m)}</option>)}
            </select>
          </Champ>
          <Champ libelle="Horaire type">
            <select value={v.horaire_id} onChange={changer('horaire_id')}>
              <option value="">—</option>
              {organisation.horaires.filter((h) => h.actif || h.id === v.horaire_id).map((h) => <option key={h.id} value={h.id}>{h.nom}</option>)}
            </select>
          </Champ>
          {multiHub && (
            <Champ libelle="Lieu de travail (Hub)">
              <select value={v.hub_id} onChange={changer('hub_id')}>
                <option value="">—</option>
                {hubs.map((h) => <option key={h.id} value={h.id}>{h.nom}</option>)}
              </select>
            </Champ>
          )}
          <Champ libelle="Matricule" aide={employe ? undefined : 'Laissez vide : attribué automatiquement'}>
            <input value={v.matricule} onChange={changer('matricule')} maxLength={20} />
          </Champ>
          {employe && employe.statut !== 'sorti' && (
            <Champ libelle="Statut">
              <select value={v.statut} onChange={changer('statut')}><option value="actif">Actif</option><option value="suspendu">Suspendu</option></select>
            </Champ>
          )}
        </div>
        <Champ libelle="Notes internes"><textarea rows={2} value={v.notes} onChange={changer('notes')} maxLength={2000} /></Champ>
        {confidentiel && !voirPrive && <Bouton type="button" icone="cle" onClick={ouvrirPrive}>Données personnelles (confidentiel)</Bouton>}
        {confidentiel && voirPrive && prive && (
          <fieldset className="encart">
            <legend>Données personnelles (accès confidentiel)</legend>
            <div className="grille-champs">
              <Champ libelle="Date de naissance"><input type="date" value={prive.date_naissance ?? ''} onChange={changerPrive('date_naissance')} /></Champ>
              <Champ libelle="Lieu de naissance"><input value={prive.lieu_naissance ?? ''} onChange={changerPrive('lieu_naissance')} maxLength={80} /></Champ>
              <Champ libelle="Nationalité"><input value={prive.nationalite ?? ''} onChange={changerPrive('nationalite')} maxLength={60} /></Champ>
              <Champ libelle="Situation familiale"><input value={prive.situation_familiale ?? ''} onChange={changerPrive('situation_familiale')} maxLength={40} /></Champ>
              <Champ libelle="Enfants"><input type="number" min="0" max="30" value={prive.enfants ?? ''} onChange={changerPrive('enfants')} /></Champ>
              <Champ libelle="Pièce d’identité (n°)"><input value={prive.piece_identite ?? ''} onChange={changerPrive('piece_identite')} maxLength={60} /></Champ>
              <Champ libelle="N° sécurité sociale"><input value={prive.numero_securite_sociale ?? ''} onChange={changerPrive('numero_securite_sociale')} maxLength={40} /></Champ>
              <Champ libelle="Adresse"><input value={prive.adresse ?? ''} onChange={changerPrive('adresse')} maxLength={200} /></Champ>
              <Champ libelle="Contact d’urgence"><input value={prive.contact_urgence_nom ?? ''} onChange={changerPrive('contact_urgence_nom')} maxLength={80} /></Champ>
              <Champ libelle="Téléphone d’urgence"><input value={prive.contact_urgence_telephone ?? ''} onChange={changerPrive('contact_urgence_telephone')} maxLength={30} /></Champ>
              <Champ libelle="Salaire versé par">
                <select value={prive.mode_paiement_salaire ?? ''} onChange={changerPrive('mode_paiement_salaire')}>
                  <option value="">—</option><option value="especes">Espèces</option><option value="mobile_money">Mobile Money</option>
                  <option value="virement">Virement</option><option value="cheque">Chèque</option>
                </select>
              </Champ>
              <Champ libelle="N° de compte ou de téléphone"><input value={prive.coordonnees_paiement ?? ''} onChange={changerPrive('coordonnees_paiement')} maxLength={80} /></Champ>
            </div>
          </fieldset>
        )}
        <Erreur message={erreur} />
        <div className="actions">
          <Bouton type="button" onClick={onFermer}>Annuler</Bouton>
          <Bouton type="submit" variante="principal" chargement={chargement}>Enregistrer</Bouton>
        </div>
      </form>
    </Modale>
  );
}

function FormulaireDepartement({ departement, organisation, onFermer, onEnregistre }) {
  const { api, etablissement } = useEspace();
  const [v, setV] = useState({ nom: '', code: '', parent_id: '', responsable_id: '', description: '', actif: true, ...(departement ?? {}) });
  const [erreur, setErreur] = useState('');
  const enregistrer = async (e) => {
    e.preventDefault();
    try {
      await api.rpc('rh_enregistrer_departement', { p_etablissement_id: etablissement.id, p_departement: v });
      onEnregistre();
    } catch (err) {
      setErreur(err.message);
    }
  };
  return (
    <Modale titre={departement ? 'Modifier le département' : 'Nouveau département'} onFermer={onFermer}>
      <form className="formulaire" onSubmit={enregistrer}>
        <div className="grille-champs">
          <Champ libelle="Nom"><input value={v.nom} onChange={(e) => setV({ ...v, nom: e.target.value })} required autoFocus maxLength={80} /></Champ>
          <Champ libelle="Code (facultatif)"><input value={v.code ?? ''} onChange={(e) => setV({ ...v, code: e.target.value.toUpperCase() })} maxLength={12} pattern="[A-Za-z0-9-]*" /></Champ>
          <Champ libelle="Rattaché à">
            <select value={v.parent_id ?? ''} onChange={(e) => setV({ ...v, parent_id: e.target.value })}>
              <option value="">— (premier niveau)</option>
              {organisation.departements.filter((d) => d.id !== departement?.id).map((d) => <option key={d.id} value={d.id}>{d.nom}</option>)}
            </select>
          </Champ>
          <Champ libelle="Responsable">
            <select value={v.responsable_id ?? ''} onChange={(e) => setV({ ...v, responsable_id: e.target.value })}>
              <option value="">—</option>
              {organisation.employes.filter((x) => x.statut !== 'sorti').map((x) => <option key={x.id} value={x.id}>{nomEmploye(x)}</option>)}
            </select>
          </Champ>
        </div>
        <Champ libelle="Description"><textarea rows={2} value={v.description ?? ''} onChange={(e) => setV({ ...v, description: e.target.value })} maxLength={300} /></Champ>
        {departement && <label className="case"><input type="checkbox" checked={v.actif} onChange={(e) => setV({ ...v, actif: e.target.checked })} /> Département actif</label>}
        <Erreur message={erreur} />
        <div className="actions">
          <Bouton type="button" onClick={onFermer}>Annuler</Bouton>
          <Bouton type="submit" variante="principal">Enregistrer</Bouton>
        </div>
      </form>
    </Modale>
  );
}

function FormulairePoste({ poste, organisation, onFermer, onEnregistre }) {
  const { api, etablissement } = useEspace();
  const [v, setV] = useState({ intitule: '', departement_id: '', description: '', actif: true, ...(poste ?? {}) });
  const [erreur, setErreur] = useState('');
  const enregistrer = async (e) => {
    e.preventDefault();
    try {
      await api.rpc('rh_enregistrer_poste', { p_etablissement_id: etablissement.id, p_poste: v });
      onEnregistre();
    } catch (err) {
      setErreur(err.message);
    }
  };
  return (
    <Modale titre={poste ? 'Modifier le poste' : 'Nouveau poste'} onFermer={onFermer}>
      <form className="formulaire" onSubmit={enregistrer}>
        <Champ libelle="Intitulé"><input value={v.intitule} onChange={(e) => setV({ ...v, intitule: e.target.value })} required autoFocus maxLength={80} /></Champ>
        <Champ libelle="Département">
          <select value={v.departement_id ?? ''} onChange={(e) => setV({ ...v, departement_id: e.target.value })}>
            <option value="">—</option>
            {organisation.departements.map((d) => <option key={d.id} value={d.id}>{d.nom}</option>)}
          </select>
        </Champ>
        <Champ libelle="Missions (facultatif)"><textarea rows={3} value={v.description ?? ''} onChange={(e) => setV({ ...v, description: e.target.value })} maxLength={600} /></Champ>
        {poste && <label className="case"><input type="checkbox" checked={v.actif} onChange={(e) => setV({ ...v, actif: e.target.checked })} /> Poste actif</label>}
        <Erreur message={erreur} />
        <div className="actions">
          <Bouton type="button" onClick={onFermer}>Annuler</Bouton>
          <Bouton type="submit" variante="principal">Enregistrer</Bouton>
        </div>
      </form>
    </Modale>
  );
}

// Organigramme : arbre des managers (chaque employé sous son manager).
function Organigramme({ organisation, naviguer }) {
  const actifs = organisation.employes.filter((e) => e.statut !== 'sorti');
  const enfants = {};
  for (const e of actifs) (enfants[e.manager_id ?? 'racine'] ??= []).push(e);
  const noeud = (e, profondeur = 0) => (
    <li key={e.id}>
      <button type="button" className="organigramme-carte" onClick={() => naviguer(`employes/${e.id}`)}>
        <Avatar nom={nomEmploye(e)} image={e.photo || undefined} taille="petit" />
        <span>
          <strong>{nomEmploye(e)}</strong>
          <small className="texte-doux bloc">{organisation.poste[e.poste_id]?.intitule ?? organisation.departement[e.departement_id]?.nom ?? '—'}</small>
        </span>
      </button>
      {enfants[e.id]?.length > 0 && profondeur < 12 && <ul>{enfants[e.id].map((x) => noeud(x, profondeur + 1))}</ul>}
    </li>
  );
  const racines = actifs.filter((e) => !e.manager_id || !actifs.some((x) => x.id === e.manager_id));
  if (!racines.length) return <EmptyState titre="Aucun employé" icone="organigramme" />;
  return <ul className="organigramme">{racines.map((e) => noeud(e))}</ul>;
}

export default function Employes({ naviguer, sousRoute }) {
  const { api, etablissement, peut, notifier, hubs, multiHub } = useEspace();
  const etab = etablissement.id;
  const [onglet, setOnglet] = useState('annuaire');
  const [edition, setEdition] = useState(null);
  const [departement, setDepartement] = useState(null);
  const [poste, setPoste] = useState(null);
  const confidentiel = peut('rh_employes.confidentiel');
  const { donnees, chargement, erreur, recharger } = useDonnees(async () => {
    const organisation = await chargerOrganisation(api, etab);
    const contrats = confidentiel ? await api.lire('rh_contrats', { eq: { etablissement_id: etab, statut: 'actif' } }) : [];
    return { ...organisation, contrats, contratDe: Object.fromEntries(contrats.map((c) => [c.employe_id, c])) };
  }, [etab, confidentiel]);
  const [ficheId] = (sousRoute ?? '').split('/');
  const nomsHub = useMemo(() => Object.fromEntries(hubs.map((h) => [h.id, h.nom])), [hubs]);

  if (ficheId && donnees) {
    return <FicheEmploye employeId={ficheId} organisation={donnees} naviguer={naviguer} onChange={recharger} />;
  }

  const colonnes = [
    { id: 'nom', libelle: 'Employé', tri: (e) => `${e.nom} ${e.prenom}`, rendu: (e) => (
      <span className="cellule-personne">
        <Avatar nom={nomEmploye(e)} image={e.photo || undefined} taille="petit" />
        <span><strong>{nomEmploye(e)}</strong><small className="texte-doux bloc">{e.matricule}</small></span>
      </span>
    ) },
    { id: 'poste', libelle: 'Poste', tri: (e) => donnees.poste[e.poste_id]?.intitule ?? '', rendu: (e) => donnees.poste[e.poste_id]?.intitule ?? '—' },
    { id: 'departement', libelle: 'Département', tri: (e) => donnees.departement[e.departement_id]?.nom ?? '', rendu: (e) => donnees.departement[e.departement_id]?.nom ?? '—' },
    ...(multiHub ? [{ id: 'hub', libelle: 'Hub', rendu: (e) => nomsHub[e.hub_id] ?? '—' }] : []),
    { id: 'telephone', libelle: 'Téléphone', rendu: (e) => e.telephone ?? '—' },
    ...(confidentiel ? [{ id: 'contrat', libelle: 'Contrat', rendu: (e) => (donnees.contratDe[e.id] ? TYPES_CONTRAT[donnees.contratDe[e.id].type] : <span className="texte-faible">aucun</span>) }] : []),
    { id: 'statut', libelle: 'Statut', tri: (e) => e.statut, rendu: (e) => <StatusBadge statut={e.statut} libelle={STATUTS_EMPLOYE[e.statut]?.[0]} /> },
  ];
  const onglets = [['annuaire', 'Annuaire', donnees?.employes.filter((e) => e.statut !== 'sorti').length], ['organigramme', 'Organigramme'], ['organisation', 'Départements et postes'],
    ...(confidentiel ? [['contrats', 'Contrats en cours', donnees?.contrats.length]] : [])];
  return (
    <div className="page">
      <PageHeader
        titre="Employés"
        sousTitre="Annuaire, organisation et contrats"
        actions={(
          <>
            {donnees && confidentiel && (
              <Bouton icone="telecharger" onClick={() => exporterCsv('employes.csv', [
                { libelle: 'Matricule', valeur: (e) => e.matricule }, { libelle: 'Prénom', valeur: (e) => e.prenom }, { libelle: 'Nom', valeur: (e) => e.nom },
                { libelle: 'Poste', valeur: (e) => donnees.poste[e.poste_id]?.intitule }, { libelle: 'Département', valeur: (e) => donnees.departement[e.departement_id]?.nom },
                { libelle: 'Entrée', valeur: (e) => e.date_entree }, { libelle: 'Statut', valeur: (e) => e.statut },
                { libelle: 'Contrat', valeur: (e) => TYPES_CONTRAT[donnees.contratDe[e.id]?.type] ?? '' },
                { libelle: 'Salaire de base', valeur: (e) => donnees.contratDe[e.id]?.salaire_base ?? '' },
              ], donnees.employes)}>Exporter</Bouton>
            )}
            {peut('rh_employes.gerer') && <Bouton variante="principal" icone="plus" onClick={() => setEdition({})}>Nouvel employé</Bouton>}
          </>
        )}
      />
      <Tabs onglets={onglets} actif={onglet} onChange={setOnglet} />
      {chargement && !donnees && <Squelette lignes={6} />}
      <Erreur message={erreur} />
      {donnees && onglet === 'annuaire' && (
        <DataTable
          colonnes={colonnes}
          lignes={donnees.employes}
          rechercher={(e) => `${e.prenom} ${e.nom} ${e.matricule} ${e.telephone ?? ''}`}
          placeholder="Nom, matricule ou téléphone"
          filtres={[
            { id: 'statut', libelle: 'Statut', options: Object.entries(STATUTS_EMPLOYE).map(([k, [l]]) => [k, l]), appliquer: (e, v) => e.statut === v },
            { id: 'departement', libelle: 'Département', options: donnees.departements.map((d) => [d.id, d.nom]), appliquer: (e, v) => e.departement_id === v },
          ]}
          triInitial={{ id: 'nom', sens: 'asc' }}
          onLigne={(e) => naviguer(`employes/${e.id}`)}
          vide={<EmptyState titre="Aucun employé" texte="Ajoutez vos employés pour suivre présences, congés et contrats." icone="utilisateur"
            action={peut('rh_employes.gerer') && <Bouton variante="principal" icone="plus" onClick={() => setEdition({})}>Nouvel employé</Bouton>} />}
        />
      )}
      {donnees && onglet === 'organigramme' && (
        <Section titre="Organigramme" sousTitre="Chaque personne apparaît sous son manager">
          <div className="organigramme-conteneur"><Organigramme organisation={donnees} naviguer={naviguer} /></div>
        </Section>
      )}
      {donnees && onglet === 'organisation' && (
        <div className="deux-colonnes">
          <Section titre="Départements" action={peut('rh_employes.gerer') && <Bouton icone="plus" onClick={() => setDepartement({})}>Ajouter</Bouton>}>
            {!donnees.departements.length && <p className="texte-doux">Aucun département.</p>}
            <div className="liste-simple">
              {donnees.departements.map((d) => (
                <div key={d.id} className={`liste-ligne ${d.actif ? '' : 'barre'}`}>
                  <span>
                    <strong>{d.nom}</strong>{d.code && <small className="texte-doux"> · {d.code}</small>}
                    <small className="texte-doux bloc">
                      {[d.parent_id && `dans ${donnees.departement[d.parent_id]?.nom}`, d.responsable_id && `resp. ${nomEmploye(donnees.employe[d.responsable_id])}`].filter(Boolean).join(' · ') || '—'}
                    </small>
                  </span>
                  <Badge>{donnees.employes.filter((e) => e.departement_id === d.id && e.statut !== 'sorti').length}</Badge>
                  {peut('rh_employes.gerer') && <button type="button" className="lien" onClick={() => setDepartement({ departement: d })}>Modifier</button>}
                </div>
              ))}
            </div>
          </Section>
          <Section titre="Postes" action={peut('rh_employes.gerer') && <Bouton icone="plus" onClick={() => setPoste({})}>Ajouter</Bouton>}>
            {!donnees.postes.length && <p className="texte-doux">Aucun poste.</p>}
            <div className="liste-simple">
              {donnees.postes.map((p) => (
                <div key={p.id} className={`liste-ligne ${p.actif ? '' : 'barre'}`}>
                  <span><strong>{p.intitule}</strong><small className="texte-doux bloc">{donnees.departement[p.departement_id]?.nom ?? '—'}</small></span>
                  <Badge>{donnees.employes.filter((e) => e.poste_id === p.id && e.statut !== 'sorti').length}</Badge>
                  {peut('rh_employes.gerer') && <button type="button" className="lien" onClick={() => setPoste({ poste: p })}>Modifier</button>}
                </div>
              ))}
            </div>
          </Section>
        </div>
      )}
      {donnees && onglet === 'contrats' && (
        <DataTable
          colonnes={[
            { id: 'numero', libelle: 'Contrat', tri: (c) => c.numero, rendu: (c) => <strong>{c.numero}</strong> },
            { id: 'employe', libelle: 'Employé', tri: (c) => nomEmploye(donnees.employe[c.employe_id]), rendu: (c) => nomEmploye(donnees.employe[c.employe_id]) },
            { id: 'type', libelle: 'Type', rendu: (c) => TYPES_CONTRAT[c.type] },
            { id: 'debut', libelle: 'Début', tri: (c) => c.debut, rendu: (c) => formatDate(c.debut) },
            { id: 'fin', libelle: 'Fin', tri: (c) => c.fin ?? '9999', rendu: (c) => (c.fin ? formatDate(c.fin) : '—') },
            { id: 'essai', libelle: 'Fin d’essai', rendu: (c) => (c.fin_periode_essai ? formatDate(c.fin_periode_essai) : '—') },
          ]}
          lignes={donnees.contrats}
          triInitial={{ id: 'fin', sens: 'asc' }}
          onLigne={(c) => naviguer(`employes/${c.employe_id}`)}
          vide={<EmptyState titre="Aucun contrat en cours" icone="document" />}
        />
      )}
      {edition && donnees && (
        <FormulaireEmploye
          employe={edition.employe}
          organisation={donnees}
          onFermer={() => setEdition(null)}
          onEnregistre={(id, message) => {
            setEdition(null);
            notifier(message);
            recharger();
            naviguer(`employes/${id}`);
          }}
        />
      )}
      {departement && donnees && (
        <FormulaireDepartement departement={departement.departement} organisation={donnees} onFermer={() => setDepartement(null)}
          onEnregistre={() => { setDepartement(null); notifier('Département enregistré'); recharger(); }} />
      )}
      {poste && donnees && (
        <FormulairePoste poste={poste.poste} organisation={donnees} onFermer={() => setPoste(null)}
          onEnregistre={() => { setPoste(null); notifier('Poste enregistré'); recharger(); }} />
      )}
    </div>
  );
}
