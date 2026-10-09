import React, { useState } from 'react';
import { useDonnees, useEspace } from '../../noyau/espace.jsx';
import { lireParametres } from '../../noyau/routes.js';
import { formatDate, formatDateHeure, formatMontant, MODES_PAIEMENT } from '../../noyau/format.js';
import { Badge, Bouton, Champ, DataTable, EmptyState, Erreur, Modale, PageHeader, Tabs } from '../../ui/composants.jsx';

// Scolarité (Bêta) : années, classes et frais, élèves, inscriptions, paiements. Aucun barème imposé : frais par classe.
const STATUTS = { inscrit: ['Inscrit', 'vert'], abandon: ['Abandon', 'neutre'], transfere: ['Transféré', 'neutre'] };
const reste = (i) => Number(i.montant_du) - Number(i.remise) - Number(i.montant_paye);

function useEnvoi(onFait) {
  const [erreur, setErreur] = useState('');
  const [chargement, setChargement] = useState(false);
  const envoyer = async (fn, message) => {
    setChargement(true);
    setErreur('');
    try {
      const r = await fn();
      onFait(typeof message === 'function' ? message(r) : message);
    } catch (err) {
      setErreur(err.message);
      setChargement(false);
    }
  };
  return { erreur, chargement, envoyer };
}

function ModaleAnnee({ onFermer, onFait }) {
  const { api, etablissement } = useEspace();
  const an = new Date().getFullYear();
  const [f, setF] = useState({ libelle: `${an}-${an + 1}`, debut: `${an}-09-01`, fin: `${an + 1}-07-15`, active: true });
  const { erreur, chargement, envoyer } = useEnvoi(onFait);
  return (
    <Modale titre="Nouvelle année scolaire" onFermer={onFermer}>
      <form className="formulaire" onSubmit={(e) => { e.preventDefault(); envoyer(() => api.rpc('enregistrer_annee_scolaire', { p_etablissement_id: etablissement.id, p: f }), 'Année enregistrée'); }}>
        <Champ libelle="Libellé"><input value={f.libelle} onChange={(e) => setF({ ...f, libelle: e.target.value })} required maxLength={40} /></Champ>
        <div className="grille-champs">
          <Champ libelle="Début"><input type="date" value={f.debut} onChange={(e) => setF({ ...f, debut: e.target.value })} required /></Champ>
          <Champ libelle="Fin"><input type="date" value={f.fin} onChange={(e) => setF({ ...f, fin: e.target.value })} required /></Champ>
        </div>
        <label className="case"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /><span>Année en cours</span></label>
        <Erreur message={erreur} />
        <div className="actions"><Bouton type="button" onClick={onFermer}>Annuler</Bouton><Bouton type="submit" variante="principal" chargement={chargement}>Enregistrer</Bouton></div>
      </form>
    </Modale>
  );
}

function ModaleClasse({ classe, annee, onFermer, onFait }) {
  const { api, etablissement } = useEspace();
  const [f, setF] = useState({ nom: '', niveau: '', capacite: '', frais_inscription: '0', frais_scolarite: '0', ...classe, annee_id: classe?.annee_id ?? annee.id });
  const { erreur, chargement, envoyer } = useEnvoi(onFait);
  const champ = (cle) => ({ value: f[cle] ?? '', onChange: (e) => setF({ ...f, [cle]: e.target.value }) });
  return (
    <Modale titre={classe?.id ? 'Modifier la classe' : `Nouvelle classe · ${annee.libelle}`} onFermer={onFermer}>
      <form className="formulaire" onSubmit={(e) => { e.preventDefault(); envoyer(() => api.rpc('enregistrer_classe', { p_etablissement_id: etablissement.id, p: { ...f, capacite: f.capacite || null } }), 'Classe enregistrée'); }}>
        <div className="grille-champs">
          <Champ libelle="Nom"><input {...champ('nom')} required maxLength={60} placeholder="Ex. : CP A" /></Champ>
          <Champ libelle="Niveau"><input {...champ('niveau')} maxLength={60} placeholder="Ex. : CP" /></Champ>
          <Champ libelle="Places (facultatif)"><input type="number" min="1" {...champ('capacite')} /></Champ>
          <Champ libelle="Frais d’inscription"><input type="number" min="0" step="any" {...champ('frais_inscription')} /></Champ>
          <Champ libelle="Frais de scolarité (année)"><input type="number" min="0" step="any" {...champ('frais_scolarite')} /></Champ>
        </div>
        <p className="texte-doux">Changer les frais ne modifie pas les inscriptions déjà faites.</p>
        <Erreur message={erreur} />
        <div className="actions"><Bouton type="button" onClick={onFermer}>Annuler</Bouton><Bouton type="submit" variante="principal" chargement={chargement}>Enregistrer</Bouton></div>
      </form>
    </Modale>
  );
}

function ModaleInscription({ eleves, classes, contacts, inscrits, peutRemise, onFermer, onFait }) {
  const { api, etablissement } = useEspace();
  const [eleveId, setEleveId] = useState('');
  const [nouveau, setNouveau] = useState({ nom: '', prenom: '', date_naissance: '', responsable_id: '' });
  const [classe, setClasse] = useState(classes[0]?.id ?? '');
  const [remise, setRemise] = useState('');
  const [motif, setMotif] = useState('');
  const { erreur, chargement, envoyer } = useEnvoi(onFait);
  const k = classes.find((c) => c.id === classe);
  const libres = eleves.filter((e) => e.actif && !inscrits.has(e.id));
  const valider = (e) => {
    e.preventDefault();
    envoyer(async () => {
      const id = eleveId || await api.rpc('enregistrer_eleve', { p_etablissement_id: etablissement.id, p: { ...nouveau, responsable_id: nouveau.responsable_id || null, date_naissance: nouveau.date_naissance || null } });
      await api.rpc('inscrire_eleve', { p_etablissement_id: etablissement.id, p: { eleve_id: id, classe_id: classe, remise: Number(remise || 0), motif_remise: motif } });
    }, 'Élève inscrit');
  };
  return (
    <Modale titre="Inscrire un élève" onFermer={onFermer} large>
      <form className="formulaire" onSubmit={valider}>
        <Champ libelle="Élève">
          <select value={eleveId} onChange={(e) => setEleveId(e.target.value)}>
            <option value="">Nouvel élève</option>
            {libres.map((x) => <option key={x.id} value={x.id}>{x.nom} {x.prenom ?? ''} ({x.matricule})</option>)}
          </select>
        </Champ>
        {!eleveId && (
          <div className="grille-champs">
            <Champ libelle="Nom"><input value={nouveau.nom} onChange={(e) => setNouveau({ ...nouveau, nom: e.target.value })} required maxLength={80} /></Champ>
            <Champ libelle="Prénom"><input value={nouveau.prenom} onChange={(e) => setNouveau({ ...nouveau, prenom: e.target.value })} maxLength={80} /></Champ>
            <Champ libelle="Date de naissance"><input type="date" value={nouveau.date_naissance} onChange={(e) => setNouveau({ ...nouveau, date_naissance: e.target.value })} /></Champ>
            <Champ libelle="Parent ou responsable">
              <select value={nouveau.responsable_id} onChange={(e) => setNouveau({ ...nouveau, responsable_id: e.target.value })}>
                <option value="">Aucun (à ajouter dans Contacts)</option>
                {contacts.map((c) => <option key={c.id} value={c.id}>{c.nom}{c.telephone ? ` · ${c.telephone}` : ''}</option>)}
              </select>
            </Champ>
          </div>
        )}
        <Champ libelle="Classe" aide={k ? `Frais : ${formatMontant(Number(k.frais_inscription) + Number(k.frais_scolarite))}` : undefined}>
          <select value={classe} onChange={(e) => setClasse(e.target.value)} required>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.nom}{c.capacite ? ` (${c.inscrits}/${c.capacite})` : ''}</option>)}
          </select>
        </Champ>
        {peutRemise && (
          <div className="grille-champs">
            <Champ libelle="Remise (facultatif)"><input type="number" min="0" step="any" value={remise} onChange={(e) => setRemise(e.target.value)} /></Champ>
            {Number(remise) > 0 && <Champ libelle="Motif de la remise"><input value={motif} onChange={(e) => setMotif(e.target.value)} required maxLength={200} placeholder="Ex. : fratrie" /></Champ>}
          </div>
        )}
        <Erreur message={erreur} />
        <div className="actions"><Bouton type="button" onClick={onFermer}>Annuler</Bouton><Bouton type="submit" variante="principal" chargement={chargement} disabled={!classe}>Inscrire</Bouton></div>
      </form>
    </Modale>
  );
}

function ModaleDossier({ inscription: i, eleve, classe, paiements, nomContact, peutEncaisser, peutGerer, onFermer, onFait, onTerminer }) {
  const { api } = useEspace();
  const du = reste(i);
  const [montant, setMontant] = useState(du > 0 ? String(du) : '');
  const [mode, setMode] = useState('especes');
  const [ref, setRef] = useState('');
  const { erreur, chargement, envoyer } = useEnvoi(onFait);
  return (
    <Modale titre={`${eleve?.nom ?? ''} ${eleve?.prenom ?? ''}`} onFermer={onFermer}
      pied={peutGerer && i.statut === 'inscrit' && <Bouton variante="danger" onClick={onTerminer}>Fin d’inscription</Bouton>}>
      <div className="pile">
        <p><Badge ton={STATUTS[i.statut][1]}>{STATUTS[i.statut][0]}</Badge> {classe?.nom} · matricule {eleve?.matricule}</p>
        <dl className="details">
          {eleve?.responsable_id && <><dt>Responsable</dt><dd>{nomContact(eleve.responsable_id)}</dd></>}
          <dt>Frais</dt><dd>{formatMontant(i.montant_du)}{Number(i.remise) > 0 && ` − remise ${formatMontant(i.remise)} (${i.motif_remise})`}</dd>
          <dt>Payé</dt><dd>{formatMontant(i.montant_paye)}{du > 0 ? ` · reste ${formatMontant(du)}` : ' · soldé'}</dd>
          {i.motif_fin && <><dt>Fin</dt><dd>{formatDate(i.termine_le)} · {i.motif_fin}</dd></>}
        </dl>
        {paiements.length > 0 && (
          <div className="liste-simple">
            {paiements.map((p) => <div key={p.id} className="liste-ligne"><span>{p.numero} · {formatDate(p.cree_le)} · {MODES_PAIEMENT[p.mode]}</span><strong>{formatMontant(p.montant)}</strong></div>)}
          </div>
        )}
        {peutEncaisser && du > 0 && (
          <form className="formulaire" onSubmit={(e) => { e.preventDefault(); envoyer(() => api.rpc('encaisser_scolarite', { p_inscription_id: i.id, p_montant: Number(montant), p_mode: mode, p_reference: ref || null }), (r) => `Reçu ${r.numero} : reste ${formatMontant(r.reste)}`); }}>
            <div className="grille-champs">
              <Champ libelle="Montant"><input type="number" min="0" step="any" value={montant} onChange={(e) => setMontant(e.target.value)} required /></Champ>
              <Champ libelle="Mode"><select value={mode} onChange={(e) => setMode(e.target.value)}>{Object.entries(MODES_PAIEMENT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Champ>
              <Champ libelle="Référence (facultatif)"><input value={ref} onChange={(e) => setRef(e.target.value)} maxLength={100} /></Champ>
            </div>
            <div className="actions"><Bouton type="submit" variante="principal" chargement={chargement}>Encaisser</Bouton></div>
          </form>
        )}
        <Erreur message={erreur} />
      </div>
    </Modale>
  );
}

function ModaleFin({ inscription, nom, onFermer, onFait }) {
  const { api } = useEspace();
  const [statut, setStatut] = useState('abandon');
  const [motif, setMotif] = useState('');
  const { erreur, chargement, envoyer } = useEnvoi(onFait);
  return (
    <Modale titre={`Fin d’inscription : ${nom}`} onFermer={onFermer}>
      <form className="formulaire" onSubmit={(e) => { e.preventDefault(); envoyer(() => api.rpc('terminer_inscription', { p_inscription_id: inscription.id, p_statut: statut, p_motif: motif }), 'Inscription terminée'); }}>
        <Champ libelle="Raison">
          <select value={statut} onChange={(e) => setStatut(e.target.value)}><option value="abandon">Abandon</option><option value="transfere">Transfert vers une autre école</option></select>
        </Champ>
        <Champ libelle="Motif"><input value={motif} onChange={(e) => setMotif(e.target.value)} required maxLength={300} /></Champ>
        <p className="texte-doux">L’élève quitte la classe et libère sa place. Ses paiements restent visibles.</p>
        <Erreur message={erreur} />
        <div className="actions"><Bouton type="button" onClick={onFermer}>Annuler</Bouton><Bouton type="submit" variante="danger" chargement={chargement}>Confirmer le départ</Bouton></div>
      </form>
    </Modale>
  );
}

export default function Scolaire() {
  const { api, etablissement, peut, notifier } = useEspace();
  const etab = etablissement.id;
  const vueInitiale = lireParametres().get('vue');
  const [onglet, setOnglet] = useState(['classes', 'paiements'].includes(vueInitiale) ? vueInitiale : 'eleves');
  const { donnees, chargement, erreur, recharger } = useDonnees(async () => {
    const [annees, classes, eleves, inscriptions, paiements, contacts] = await Promise.all([
      api.lire('sco_annees', { eq: { etablissement_id: etab }, ordre: ['debut', 'desc'] }),
      api.lire('sco_classes', { eq: { etablissement_id: etab }, ordre: ['nom'] }),
      api.lire('sco_eleves', { eq: { etablissement_id: etab }, ordre: ['nom'] }),
      api.lire('sco_inscriptions', { eq: { etablissement_id: etab } }),
      api.lire('sco_paiements', { eq: { etablissement_id: etab }, ordre: ['cree_le', 'desc'], limite: 1000 }),
      api.lire('contacts', { eq: { etablissement_id: etab }, ordre: ['nom'], colonnes: ['id', 'nom', 'telephone', 'type'] }),
    ]);
    return { annees, classes, eleves, inscriptions, paiements, contacts: contacts.filter((c) => c.type !== 'fournisseur') };
  }, [etab]);
  const annee = donnees?.annees.find((a) => a.active) ?? donnees?.annees[0];
  const inscriptions = (donnees?.inscriptions ?? []).filter((i) => i.annee_id === annee?.id);
  const classes = (donnees?.classes ?? []).filter((c) => c.annee_id === annee?.id)
    .map((c) => ({ ...c, inscrits: inscriptions.filter((i) => i.classe_id === c.id && i.statut === 'inscrit').length }));
  const eleve = (id) => donnees?.eleves.find((e) => e.id === id);
  const classe = (id) => donnees?.classes.find((c) => c.id === id);
  const nomContact = (id) => donnees?.contacts.find((c) => c.id === id)?.nom ?? '—';
  const nomEleve = (id) => `${eleve(id)?.nom ?? ''} ${eleve(id)?.prenom ?? ''}`.trim();
  const peutGerer = peut('scolaire.gerer');
  const peutInscrire = peut('scolaire.inscrire');
  const peutEncaisser = peut('scolaire.encaisser');
  const [modale, setModale] = useState(null);
  const [fin, setFin] = useState(null);
  const fait = (m) => { setModale(null); notifier(m); recharger(); };
  const inscritsIds = new Set(inscriptions.map((i) => i.eleve_id));

  const action = onglet === 'eleves'
    ? peutInscrire && classes.length > 0 && <Bouton variante="principal" icone="plus" onClick={() => setModale({ type: 'inscription' })}>Inscrire un élève</Bouton>
    : onglet === 'classes' && peutGerer && (
      <>
        <Bouton icone="plus" onClick={() => setModale({ type: 'annee' })}>Nouvelle année</Bouton>
        {annee && <Bouton variante="principal" icone="plus" onClick={() => setModale({ type: 'classe' })}>Nouvelle classe</Bouton>}
      </>
    );

  return (
    <div className="page">
      <PageHeader titre="Scolarité" sousTitre={annee ? `Année ${annee.libelle}${annee.active ? '' : ' (pas encore active)'}` : 'Commencez par créer l’année scolaire (onglet Classes).'}
        badges={<Badge ton="bleu">Bêta</Badge>} actions={action} />
      <Tabs onglets={[['eleves', 'Élèves'], ['classes', 'Classes'], ['paiements', 'Paiements']]} actif={onglet} onChange={setOnglet} />
      <Erreur message={erreur} />
      {onglet === 'eleves' && (
        <DataTable
          chargement={chargement}
          lignes={inscriptions}
          onLigne={(i) => setModale({ type: 'dossier', inscription: i })}
          titreExport="eleves"
          rechercher={(i) => `${nomEleve(i.eleve_id)} ${eleve(i.eleve_id)?.matricule ?? ''} ${classe(i.classe_id)?.nom ?? ''}`}
          placeholder="Nom, matricule, classe"
          filtres={[
            { id: 'classe', libelle: 'Classe', options: classes.map((c) => [c.id, c.nom]), appliquer: (i, v) => i.classe_id === v },
            { id: 'paiement', libelle: 'Paiement', options: [['impaye', 'Reste à payer'], ['solde', 'Soldé']], appliquer: (i, v) => (v === 'impaye' ? reste(i) > 0 : reste(i) <= 0) },
            { id: 'statut', libelle: 'État', options: Object.entries(STATUTS).map(([k, [l]]) => [k, l]), appliquer: (i, v) => i.statut === v },
          ]}
          vide={<EmptyState icone="membres" titre="Aucun élève inscrit" texte={classes.length ? 'Inscrivez un premier élève.' : 'Créez d’abord l’année et les classes (onglet Classes).'} />}
          colonnes={[
            { id: 'matricule', libelle: 'Matricule', rendu: (i) => eleve(i.eleve_id)?.matricule },
            { id: 'nom', libelle: 'Élève', tri: (i) => nomEleve(i.eleve_id), rendu: (i) => <strong>{nomEleve(i.eleve_id)}</strong> },
            { id: 'classe', libelle: 'Classe', rendu: (i) => classe(i.classe_id)?.nom },
            { id: 'responsable', libelle: 'Responsable', rendu: (i) => (eleve(i.eleve_id)?.responsable_id ? nomContact(eleve(i.eleve_id).responsable_id) : '—') },
            { id: 'paye', libelle: 'Payé', classe: 'nombre', tri: (i) => Number(i.montant_paye), rendu: (i) => formatMontant(i.montant_paye) },
            { id: 'reste', libelle: 'Reste', classe: 'nombre', tri: (i) => reste(i), rendu: (i) => <span className={reste(i) > 0 ? 'texte-alerte' : undefined}>{formatMontant(reste(i))}</span> },
            { id: 'statut', libelle: 'État', rendu: (i) => <Badge ton={STATUTS[i.statut][1]}>{STATUTS[i.statut][0]}</Badge> },
          ]}
        />
      )}
      {onglet === 'classes' && (
        <DataTable
          chargement={chargement}
          lignes={classes}
          onLigne={peutGerer ? (c) => setModale({ type: 'classe', classe: c }) : undefined}
          titreExport="classes"
          vide={<EmptyState icone="membres" titre="Aucune classe" texte={annee ? 'Ajoutez les classes de l’année.' : 'Créez l’année scolaire.'} />}
          colonnes={[
            { id: 'nom', libelle: 'Classe', rendu: (c) => <strong>{c.nom}</strong> },
            { id: 'niveau', libelle: 'Niveau', rendu: (c) => c.niveau ?? '—' },
            { id: 'inscrits', libelle: 'Élèves', classe: 'nombre', tri: (c) => c.inscrits, rendu: (c) => (c.capacite ? `${c.inscrits} / ${c.capacite}` : c.inscrits) },
            { id: 'frais', libelle: 'Frais', classe: 'nombre', tri: (c) => Number(c.frais_inscription) + Number(c.frais_scolarite), rendu: (c) => formatMontant(Number(c.frais_inscription) + Number(c.frais_scolarite)) },
          ]}
        />
      )}
      {onglet === 'paiements' && (
        <DataTable
          chargement={chargement}
          lignes={donnees?.paiements}
          titreExport="paiements-scolarite"
          rechercher={(p) => { const i = donnees.inscriptions.find((x) => x.id === p.inscription_id); return `${p.numero} ${i ? nomEleve(i.eleve_id) : ''} ${p.reference ?? ''}`; }}
          placeholder="Reçu, élève, référence"
          vide={<EmptyState icone="membres" titre="Aucun paiement" />}
          colonnes={[
            { id: 'numero', libelle: 'Reçu', rendu: (p) => <strong>{p.numero}</strong> },
            { id: 'cree_le', libelle: 'Date', tri: (p) => p.cree_le, rendu: (p) => formatDateHeure(p.cree_le) },
            { id: 'eleve', libelle: 'Élève', rendu: (p) => { const i = donnees.inscriptions.find((x) => x.id === p.inscription_id); return i ? nomEleve(i.eleve_id) : '—'; } },
            { id: 'mode', libelle: 'Mode', rendu: (p) => MODES_PAIEMENT[p.mode] },
            { id: 'montant', libelle: 'Montant', classe: 'nombre', tri: (p) => Number(p.montant), rendu: (p) => formatMontant(p.montant) },
          ]}
        />
      )}
      {modale?.type === 'annee' && <ModaleAnnee onFermer={() => setModale(null)} onFait={fait} />}
      {modale?.type === 'classe' && annee && <ModaleClasse classe={modale.classe} annee={annee} onFermer={() => setModale(null)} onFait={fait} />}
      {modale?.type === 'inscription' && (
        <ModaleInscription eleves={donnees.eleves} classes={classes.filter((c) => c.actif)} contacts={donnees.contacts} inscrits={inscritsIds}
          peutRemise={peutGerer} onFermer={() => setModale(null)} onFait={fait} />
      )}
      {modale?.type === 'dossier' && (
        <ModaleDossier
          inscription={modale.inscription}
          eleve={eleve(modale.inscription.eleve_id)}
          classe={classe(modale.inscription.classe_id)}
          paiements={donnees.paiements.filter((p) => p.inscription_id === modale.inscription.id)}
          nomContact={nomContact}
          peutEncaisser={peutEncaisser}
          peutGerer={peutGerer}
          onFermer={() => setModale(null)}
          onFait={fait}
          onTerminer={() => { setFin(modale.inscription); setModale(null); }}
        />
      )}
      {fin && <ModaleFin inscription={fin} nom={nomEleve(fin.eleve_id)} onFermer={() => setFin(null)} onFait={(m) => { setFin(null); notifier(m); recharger(); }} />}
    </div>
  );
}
