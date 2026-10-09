import React, { useMemo, useState } from 'react';
import { useDonnees, useEspace } from '../../noyau/espace.jsx';
import { lireParametres } from '../../noyau/routes.js';
import { dateLocale, formatDate, formatDateHeure } from '../../noyau/format.js';
import {
  Badge, Bouton, Champ, DataTable, EmptyState, Erreur, MenuActions, Modale, ModaleMotif, PageHeader, Section, Squelette, StatCard, Tabs,
} from '../../ui/composants.jsx';
import { PiecesJointes } from '../../ui/communs.jsx';
import { dateLimitePreavis, montantAnnuel, PERIODICITES, SENS, STATUTS_CONTRAT, surveillance } from './commun.js';

// Contrats (Bêta) : contrats clients et fournisseurs, avenants définitifs, registre des engagements.
const SURVEILLANCE = { preavis: ['Préavis à envoyer', 'alerte'], fin: ['Fin proche', 'orange'], echu: ['Date de fin passée', 'rouge'] };

function ModaleContrat({ contrat, contacts, onFermer, onFait }) {
  const { api, etablissement } = useEspace();
  const [v, setV] = useState(() => ({
    sens: contrat?.sens ?? 'client', contact_id: contrat?.contact_id ?? '', objet: contrat?.objet ?? '', debut: contrat?.debut ?? dateLocale(),
    fin: contrat?.fin ?? '', montant: contrat ? String(contrat.montant) : '', periodicite: contrat?.periodicite ?? 'mensuelle',
    reconduction_tacite: contrat?.reconduction_tacite ?? false, preavis_jours: contrat ? String(contrat.preavis_jours) : '30',
    conditions: contrat?.conditions ?? '', document_vente_id: contrat?.document_vente_id ?? null, responsable_id: contrat?.responsable_id ?? null,
  }));
  const [erreur, setErreur] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const changer = (champ) => (e) => setV((x) => ({ ...x, [champ]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const choix = contacts.filter((c) => c.type === 'les_deux' || (v.sens === 'fournisseur') === (c.type === 'fournisseur'));
  const valider = async (e) => {
    e.preventDefault();
    setEnvoi(true);
    setErreur('');
    try {
      const id = await api.rpc('enregistrer_contrat', { p_etablissement_id: etablissement.id, p: { ...v, id: contrat?.id } });
      onFait(id);
    } catch (err) {
      setErreur(err.message);
      setEnvoi(false);
    }
  };
  return (
    <Modale titre={contrat ? `Modifier le contrat ${contrat.numero}` : 'Nouveau contrat'} onFermer={onFermer} large>
      <form className="formulaire" onSubmit={valider}>
        <div className="grille-champs">
          <Champ libelle="Contrat avec">
            <select value={v.sens} onChange={(e) => setV((x) => ({ ...x, sens: e.target.value, contact_id: '' }))}>
              <option value="client">Un client</option>
              <option value="fournisseur">Un fournisseur</option>
            </select>
          </Champ>
          <Champ libelle={v.sens === 'client' ? 'Client' : 'Fournisseur'}>
            <select value={v.contact_id} onChange={changer('contact_id')} required>
              <option value="">— Choisir</option>
              {choix.map((c) => <option key={c.id} value={c.id}>{c.societe ? `${c.societe} (${c.nom})` : c.nom}</option>)}
            </select>
          </Champ>
        </div>
        <Champ libelle="Objet du contrat"><input value={v.objet} onChange={changer('objet')} required maxLength={200} placeholder="Ex. : maintenance du parc informatique" /></Champ>
        <div className="grille-champs">
          <Champ libelle="Début"><input type="date" value={v.debut} onChange={changer('debut')} required /></Champ>
          <Champ libelle="Fin (vide : durée indéterminée)"><input type="date" value={v.fin} min={v.debut} onChange={changer('fin')} /></Champ>
          <Champ libelle="Montant"><input type="number" min="0" step="any" inputMode="decimal" value={v.montant} onChange={changer('montant')} required /></Champ>
          <Champ libelle="Périodicité du montant">
            <select value={v.periodicite} onChange={changer('periodicite')}>
              {Object.entries(PERIODICITES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </Champ>
          <Champ libelle="Préavis (jours)"><input type="number" min="0" max="365" value={v.preavis_jours} onChange={changer('preavis_jours')} /></Champ>
        </div>
        <label className="case"><input type="checkbox" checked={v.reconduction_tacite} onChange={changer('reconduction_tacite')} /><span>Reconduction tacite (se renouvelle sauf dénonciation avant le préavis)</span></label>
        <Champ libelle="Conditions particulières"><textarea rows={4} value={v.conditions} onChange={changer('conditions')} maxLength={4000} /></Champ>
        <Erreur message={erreur} />
        <div className="actions">
          <Bouton type="button" onClick={onFermer}>Annuler</Bouton>
          <Bouton type="submit" variante="principal" chargement={envoi}>Enregistrer le brouillon</Bouton>
        </div>
      </form>
    </Modale>
  );
}

function ModaleAvenant({ contrat, onFermer, onFait }) {
  const { api, montant } = useEspace();
  const [v, setV] = useState({ objet: '', description: '', date_effet: dateLocale(), montant: '', fin: '' });
  const [erreur, setErreur] = useState('');
  const changer = (champ) => (e) => setV((x) => ({ ...x, [champ]: e.target.value }));
  const valider = async (e) => {
    e.preventDefault();
    setErreur('');
    try {
      await api.rpc('ajouter_avenant', { p_contrat_id: contrat.id, p: v });
      onFait();
    } catch (err) {
      setErreur(err.message);
    }
  };
  return (
    <Modale titre={`Avenant au contrat ${contrat.numero}`} onFermer={onFermer}>
      <form className="formulaire" onSubmit={valider}>
        <p className="texte-doux">Un avenant est définitif : il ne se modifie ni ne se supprime. Montant actuel : {montant(contrat.montant)} ({PERIODICITES[contrat.periodicite].toLowerCase()}).</p>
        <Champ libelle="Objet de l’avenant"><input value={v.objet} onChange={changer('objet')} required maxLength={200} placeholder="Ex. : ajout de deux postes" /></Champ>
        <Champ libelle="Détail"><textarea rows={3} value={v.description} onChange={changer('description')} maxLength={4000} /></Champ>
        <div className="grille-champs">
          <Champ libelle="Date d’effet"><input type="date" value={v.date_effet} min={contrat.debut} onChange={changer('date_effet')} required /></Champ>
          <Champ libelle="Nouveau montant (vide : inchangé)"><input type="number" min="0" step="any" value={v.montant} onChange={changer('montant')} /></Champ>
          <Champ libelle="Nouvelle date de fin (vide : inchangée)"><input type="date" value={v.fin} min={contrat.debut} onChange={changer('fin')} /></Champ>
        </div>
        <Erreur message={erreur} />
        <div className="actions">
          <Bouton type="button" onClick={onFermer}>Annuler</Bouton>
          <Bouton type="submit" variante="principal">Ajouter l’avenant</Bouton>
        </div>
      </form>
    </Modale>
  );
}

function ModaleActivation({ contrat, onFermer, onFait }) {
  const { api } = useEspace();
  const [date, setDate] = useState(dateLocale());
  const [erreur, setErreur] = useState('');
  return (
    <Modale
      titre={`Activer le contrat ${contrat.numero}`}
      onFermer={onFermer}
      pied={(
        <>
          <Bouton onClick={onFermer}>Retour</Bouton>
          <Bouton variante="principal" onClick={() => api.rpc('changer_statut_contrat', { p_contrat_id: contrat.id, p_statut: 'actif', p_signe_le: date }).then(onFait, (err) => setErreur(err.message))}>Activer</Bouton>
        </>
      )}
    >
      <p>Le contrat devient définitif : il ne changera plus que par avenant.</p>
      <Champ libelle="Signé le"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Champ>
      <Erreur message={erreur} />
    </Modale>
  );
}

function FicheContrat({ id, naviguer }) {
  const { api, peut, notifier, montant } = useEspace();
  const [action, setAction] = useState(null);
  const [erreurAction, setErreurAction] = useState('');
  const { donnees, chargement, erreur, recharger } = useDonnees(async () => {
    const [k] = await api.lire('contrats', { eq: { id } });
    if (!k) throw new Error('Contrat introuvable');
    const [avenants, contacts, devis] = await Promise.all([
      api.lire('contrat_avenants', { eq: { contrat_id: id }, ordre: ['numero'] }),
      api.lire('contacts', { eq: { etablissement_id: k.etablissement_id }, colonnes: ['id', 'nom', 'societe', 'type', 'telephone'] }),
      k.document_vente_id ? api.lire('documents_vente', { eq: { id: k.document_vente_id }, colonnes: ['id', 'numero'] }).catch(() => []) : [],
    ]);
    return { k, avenants, contacts, contact: contacts.find((c) => c.id === k.contact_id), devis: devis[0] };
  }, [id]);
  if (chargement && !donnees) return <div className="page"><Squelette lignes={8} /></div>;
  if (erreur || !donnees) return <div className="page"><EmptyState titre="Contrat introuvable" texte={erreur} action={<Bouton onClick={() => naviguer('contrats')}>Retour</Bouton>} /></div>;
  const { k, avenants, contact } = donnees;
  const gerer = peut('contrats.gerer');
  const statut = (s, motif) => api.rpc('changer_statut_contrat', { p_contrat_id: k.id, p_statut: s, p_motif: motif ?? null })
    .then(() => { notifier('Contrat mis à jour'); setAction(null); recharger(); }, (err) => { setErreurAction(err.message); throw err; });
  const preavis = dateLimitePreavis(k);
  const nom = contact?.societe || contact?.nom || '—';
  return (
    <div className="page">
      <PageHeader
        titre={`Contrat ${k.numero}`}
        sousTitre={`${SENS[k.sens]} : ${nom}`}
        fil={[{ libelle: 'Contrats', href: '#/contrats' }, { libelle: k.numero }]}
        badges={<><Badge ton={STATUTS_CONTRAT[k.statut][1]}>{STATUTS_CONTRAT[k.statut][0]}</Badge>{k.version > 1 && <Badge ton="bleu">{`${k.version - 1} avenant(s)`}</Badge>}</>}
        actions={gerer && (
          <>
            {k.statut === 'brouillon' && <Bouton icone="parametres" onClick={() => setAction('modifier')}>Modifier</Bouton>}
            {k.statut === 'brouillon' && <Bouton variante="principal" onClick={() => setAction('activer')}>Activer le contrat</Bouton>}
            {['actif', 'suspendu'].includes(k.statut) && <Bouton variante="principal" icone="plus" onClick={() => setAction('avenant')}>Ajouter un avenant</Bouton>}
            {k.statut === 'suspendu' && <Bouton onClick={() => statut('actif').catch(() => {})}>Reprendre</Bouton>}
            <MenuActions actions={[
              k.statut === 'actif' && { libelle: 'Suspendre', onClick: () => setAction('suspendu') },
              ['actif', 'suspendu'].includes(k.statut) && { libelle: 'Terminer (arrivé à son terme)', onClick: () => statut('termine').catch(() => {}) },
              ['actif', 'suspendu'].includes(k.statut) && { libelle: 'Résilier', danger: true, onClick: () => setAction('resilie') },
              k.statut === 'brouillon' && { libelle: 'Annuler', danger: true, onClick: () => setAction('annule') },
            ]} />
          </>
        )}
      />
      <Erreur message={erreurAction} />
      <div className="document-disposition">
        <div className="pile">
          <Section titre="Engagement">
            <dl className="details">
              <dt>Objet</dt><dd>{k.objet}</dd>
              <dt>Montant</dt><dd>{montant(k.montant)} · {PERIODICITES[k.periodicite].toLowerCase()}</dd>
              <dt>Montant annuel</dt><dd>{montant(montantAnnuel(k))}</dd>
              <dt>Période</dt><dd>Du {formatDate(k.debut)} {k.fin ? `au ${formatDate(k.fin)}` : '(durée indéterminée)'}</dd>
              <dt>Reconduction</dt><dd>{k.reconduction_tacite ? `Tacite, préavis de ${k.preavis_jours} jour(s)` : `Non${k.preavis_jours ? ` · préavis de ${k.preavis_jours} jour(s)` : ''}`}</dd>
              {preavis && <><dt>Dénoncer avant le</dt><dd>{formatDate(preavis)}</dd></>}
              {k.signe_le && <><dt>Signé le</dt><dd>{formatDate(k.signe_le)}</dd></>}
              {k.motif && <><dt>Motif</dt><dd>{k.motif}</dd></>}
              {donnees.devis && <><dt>Devis d’origine</dt><dd><button type="button" className="lien" onClick={() => naviguer(`factures/${donnees.devis.id}`)}>{donnees.devis.numero}</button></dd></>}
              {contact?.telephone && <><dt>Téléphone</dt><dd>{contact.telephone}</dd></>}
            </dl>
            {k.conditions && <p className="feuille-notes">{k.conditions}</p>}
          </Section>
          <Section titre="Avenants">
            {!avenants.length && <p className="texte-doux">Aucun avenant.</p>}
            <div className="liste-simple">
              {avenants.map((a) => (
                <div key={a.id} className="liste-ligne">
                  <span>
                    <strong>Avenant {a.numero} · {a.objet}</strong>
                    <small className="texte-doux bloc">
                      Effet le {formatDate(a.date_effet)}
                      {Number(a.montant_avant) !== Number(a.montant_apres) && ` · montant ${montant(a.montant_avant)} → ${montant(a.montant_apres)}`}
                      {a.fin_avant !== a.fin_apres && ` · fin ${a.fin_avant ? formatDate(a.fin_avant) : 'indéterminée'} → ${a.fin_apres ? formatDate(a.fin_apres) : 'indéterminée'}`}
                    </small>
                    {a.description && <small className="bloc">{a.description}</small>}
                  </span>
                </div>
              ))}
            </div>
          </Section>
        </div>
        <div className="pile">
          <Section>
            <PiecesJointes objetType="contrat" objetId={k.id} titre="Contrat signé et annexes" peutAjouter={gerer} peutArchiver={gerer}
              categories={['Contrat signé', 'Avenant signé', 'Annexe', 'Courrier', 'Autre']} />
          </Section>
          <Section titre="Historique">
            <dl className="details">
              <dt>Créé le</dt><dd>{formatDateHeure(k.cree_le)}</dd>
              <dt>Modifié le</dt><dd>{formatDateHeure(k.modifie_le)}</dd>
            </dl>
          </Section>
        </div>
      </div>
      {action === 'modifier' && <ModaleContrat contrat={k} contacts={donnees.contacts} onFermer={() => setAction(null)} onFait={() => { setAction(null); notifier('Contrat enregistré'); recharger(); }} />}
      {action === 'activer' && <ModaleActivation contrat={k} onFermer={() => setAction(null)} onFait={() => { setAction(null); notifier('Contrat activé'); recharger(); }} />}
      {action === 'avenant' && <ModaleAvenant contrat={k} onFermer={() => setAction(null)} onFait={() => { setAction(null); notifier('Avenant ajouté'); recharger(); }} />}
      {['suspendu', 'resilie', 'annule'].includes(action) && (
        <ModaleMotif
          titre={{ suspendu: 'Suspendre le contrat', resilie: 'Résilier le contrat', annule: 'Annuler le brouillon' }[action]}
          texte="Le motif reste visible sur le contrat."
          libelleAction="Confirmer"
          onValider={(motif) => statut(action, motif)}
          onFermer={() => setAction(null)}
        />
      )}
    </div>
  );
}

function Liste({ naviguer }) {
  const { api, etablissement, peut, montant } = useEspace();
  const params = lireParametres();
  const [vue, setVue] = useState(params.get('vue') === 'registre' ? 'registre' : 'contrats');
  const [nouveau, setNouveau] = useState(false);
  const aujourdhui = dateLocale();
  const { donnees, chargement, erreur } = useDonnees(async () => {
    const [contrats, contacts, parametres] = await Promise.all([
      api.lire('contrats', { eq: { etablissement_id: etablissement.id }, ordre: ['cree_le', 'desc'], limite: 2000 }),
      api.lire('contacts', { eq: { etablissement_id: etablissement.id }, colonnes: ['id', 'nom', 'societe', 'type'] }),
      api.lire('etablissement_parametres', { eq: { etablissement_id: etablissement.id, module_id: 'contrats' } }).catch(() => []),
    ]);
    return { contrats, contacts, contact: Object.fromEntries(contacts.map((c) => [c.id, c])), alerte: Number(parametres[0]?.data?.alerte_jours ?? 60) };
  }, [etablissement.id]);
  const nomPartie = (k) => donnees.contact[k.contact_id]?.societe || donnees.contact[k.contact_id]?.nom || '—';
  const enCours = useMemo(() => (donnees?.contrats ?? []).filter((k) => ['actif', 'suspendu'].includes(k.statut)), [donnees]);
  const veille = (k) => surveillance(k, aujourdhui, donnees.alerte);
  if (chargement && !donnees) return <div className="page"><Squelette lignes={6} /></div>;
  if (erreur) return <div className="page"><Erreur message={erreur} /></div>;
  const somme = (sens) => enCours.filter((k) => k.statut === 'actif' && k.sens === sens).reduce((t, k) => t + montantAnnuel(k), 0);
  const aSurveiller = enCours.filter((k) => veille(k));
  return (
    <div className="page">
      <PageHeader
        titre="Contrats"
        sousTitre="Contrats clients et fournisseurs, avenants et échéances"
        badges={<Badge ton="bleu">Bêta</Badge>}
        actions={peut('contrats.gerer') && <Bouton variante="principal" icone="plus" onClick={() => setNouveau(true)}>Nouveau contrat</Bouton>}
      />
      <div className="grille-stats">
        <StatCard icone="document" libelle="Contrats en cours" valeur={enCours.filter((k) => k.statut === 'actif').length} />
        <StatCard icone="ventes" libelle="Engagements clients (par an)" valeur={montant(somme('client'))} />
        <StatCard icone="depot" libelle="Engagements fournisseurs (par an)" valeur={montant(somme('fournisseur'))} />
        <StatCard icone="alerte" libelle="À surveiller" valeur={aSurveiller.length} detail={`Fin ou préavis sous ${donnees.alerte} jours`} ton={aSurveiller.length ? 'alerte' : undefined} onClick={() => setVue('registre')} />
      </div>
      <Tabs onglets={[['contrats', 'Contrats', donnees.contrats.length], ['registre', 'Registre des engagements', enCours.length]]} actif={vue} onChange={setVue} />
      {vue === 'contrats' && (
        <DataTable
          exportable={false}
          key="contrats"
          colonnes={[
            { id: 'numero', libelle: 'Numéro', tri: (k) => k.numero, rendu: (k) => <strong>{k.numero}</strong> },
            { id: 'partie', libelle: 'Avec', tri: nomPartie, rendu: (k) => <>{nomPartie(k)}<small className="texte-doux bloc">{SENS[k.sens]}</small></> },
            { id: 'objet', libelle: 'Objet', tri: (k) => k.objet, rendu: (k) => k.objet },
            { id: 'montant', libelle: 'Montant', tri: (k) => Number(k.montant), rendu: (k) => <>{montant(k.montant)}<small className="texte-doux bloc">{PERIODICITES[k.periodicite]}</small></>, classe: 'nombre' },
            { id: 'fin', libelle: 'Fin', tri: (k) => k.fin ?? '9999', rendu: (k) => (k.fin ? formatDate(k.fin) : 'Indéterminée') },
            { id: 'statut', libelle: 'État', tri: (k) => k.statut, rendu: (k) => <Badge ton={STATUTS_CONTRAT[k.statut][1]}>{STATUTS_CONTRAT[k.statut][0]}</Badge> },
          ]}
          lignes={donnees.contrats}
          rechercher={(k) => `${k.numero} ${nomPartie(k)} ${k.objet}`}
          placeholder="Numéro, partie ou objet"
          filtres={[
            { id: 'statut', libelle: 'État', options: Object.entries(STATUTS_CONTRAT).map(([k, [l]]) => [k, l]), appliquer: (k, v) => k.statut === v },
            { id: 'sens', libelle: 'Avec', options: Object.entries(SENS), appliquer: (k, v) => k.sens === v },
          ]}
          triInitial={{ id: 'numero', sens: 'desc' }}
          onLigne={(k) => naviguer(`contrats/${k.id}`)}
          vide={<EmptyState titre="Aucun contrat" icone="document" texte="Un contrat se crée ici ou depuis un devis accepté." />}
        />
      )}
      {vue === 'registre' && (
        <DataTable
          key="registre"
          colonnes={[
            { id: 'numero', libelle: 'Contrat', tri: (k) => k.numero, rendu: (k) => <strong>{k.numero}</strong> },
            { id: 'partie', libelle: 'Avec', tri: nomPartie, rendu: (k) => `${nomPartie(k)} (${SENS[k.sens].toLowerCase()})` },
            { id: 'objet', libelle: 'Objet', tri: (k) => k.objet, rendu: (k) => k.objet },
            { id: 'annuel', libelle: 'Montant annuel', tri: montantAnnuel, rendu: (k) => montant(montantAnnuel(k)), classe: 'nombre' },
            { id: 'fin', libelle: 'Fin', tri: (k) => k.fin ?? '9999', rendu: (k) => (k.fin ? formatDate(k.fin) : 'Indéterminée') },
            { id: 'preavis', libelle: 'Dénoncer avant le', tri: (k) => dateLimitePreavis(k) ?? '9999', rendu: (k) => (dateLimitePreavis(k) ? formatDate(dateLimitePreavis(k)) : '—') },
            { id: 'veille', libelle: 'À surveiller', tri: (k) => veille(k) ?? '', rendu: (k) => (veille(k) ? <Badge ton={SURVEILLANCE[veille(k)][1]}>{SURVEILLANCE[veille(k)][0]}</Badge> : '—') },
          ]}
          lignes={enCours}
          rechercher={(k) => `${k.numero} ${nomPartie(k)} ${k.objet}`}
          placeholder="Numéro, partie ou objet"
          filtres={[
            { id: 'filtre', libelle: 'À surveiller', options: Object.entries(SURVEILLANCE).map(([k, [l]]) => [k, l]), appliquer: (k, v) => veille(k) === v },
            { id: 'sens', libelle: 'Avec', options: Object.entries(SENS), appliquer: (k, v) => k.sens === v },
          ]}
          triInitial={{ id: 'preavis', sens: 'asc' }}
          onLigne={(k) => naviguer(`contrats/${k.id}`)}
          vide={<EmptyState titre="Aucun contrat en cours" icone="document" />}
        />
      )}
      {nouveau && <ModaleContrat contacts={donnees.contacts} onFermer={() => setNouveau(false)} onFait={(id) => naviguer(`contrats/${id}`)} />}
    </div>
  );
}

export default function Contrats({ naviguer, sousRoute }) {
  const [id] = (sousRoute ?? '').split('/');
  if (id) return <FicheContrat key={id} id={id} naviguer={naviguer} />;
  return <Liste naviguer={naviguer} />;
}
