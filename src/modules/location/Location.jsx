import React, { useMemo, useState } from 'react';
import { useDonnees, useEspace } from '../../noyau/espace.jsx';
import { lireParametres } from '../../noyau/routes.js';
import { dateLocale, formatDate, formatMontant, MODES_PAIEMENT } from '../../noyau/format.js';
import { Badge, Bouton, Champ, DataTable, EmptyState, Erreur, Modale, ModaleMotif, PageHeader, Tabs } from '../../ui/composants.jsx';

// Location (Bêta) : parc d'objets et contrats. La base refuse un objet déjà loué sur les mêmes dates.
const STATUTS = { reserve: ['Réservé', 'bleu'], en_cours: ['En cours', 'orange'], rendu: ['Rendu', 'vert'], annule: ['Annulé', 'neutre'] };
const ETATS = { disponible: ['Disponible', 'vert'], maintenance: ['En maintenance', 'orange'], hors_service: ['Hors service', 'neutre'] };
const CAUTIONS = { aucune: 'Sans caution', a_recevoir: 'À recevoir', recue: 'Reçue', rendue: 'Rendue', retenue: 'Retenue en partie' };

function ModaleObjet({ objet, hubs, onFermer, onFait }) {
  const { api, etablissement } = useEspace();
  const [f, setF] = useState({ nom: '', reference: '', categorie: '', tarif_jour: '', caution: '0', etat: 'disponible', hub_id: '', note: '', ...objet });
  const [erreur, setErreur] = useState('');
  const [chargement, setChargement] = useState(false);
  const champ = (cle) => ({ value: f[cle] ?? '', onChange: (e) => setF({ ...f, [cle]: e.target.value }) });
  const valider = async (e) => {
    e.preventDefault();
    setChargement(true);
    setErreur('');
    try {
      await api.rpc('enregistrer_objet_location', { p_etablissement_id: etablissement.id, p: { ...f, tarif_jour: Number(f.tarif_jour), caution: Number(f.caution || 0), hub_id: f.hub_id || null } });
      onFait(objet?.id ? 'Objet modifié' : 'Objet ajouté au parc');
    } catch (err) {
      setErreur(err.message);
      setChargement(false);
    }
  };
  return (
    <Modale titre={objet?.id ? 'Modifier l’objet' : 'Nouvel objet'} onFermer={onFermer}>
      <form className="formulaire" onSubmit={valider}>
        <Champ libelle="Nom"><input {...champ('nom')} required maxLength={120} /></Champ>
        <div className="grille-champs">
          <Champ libelle="Référence"><input {...champ('reference')} maxLength={60} /></Champ>
          <Champ libelle="Catégorie"><input {...champ('categorie')} maxLength={60} placeholder="Ex. : Événementiel" /></Champ>
          <Champ libelle="Tarif par jour"><input type="number" min="0" step="any" inputMode="decimal" {...champ('tarif_jour')} required /></Champ>
          <Champ libelle="Caution"><input type="number" min="0" step="any" inputMode="decimal" {...champ('caution')} /></Champ>
        </div>
        {objet?.id && (
          <Champ libelle="État">
            <select {...champ('etat')}>{Object.entries(ETATS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</select>
          </Champ>
        )}
        {hubs.length > 1 && (
          <Champ libelle="Lieu de rangement">
            <select {...champ('hub_id')}><option value="">Aucun en particulier</option>{hubs.map((h) => <option key={h.id} value={h.id}>{h.nom}</option>)}</select>
          </Champ>
        )}
        <Champ libelle="Note (facultatif)"><input {...champ('note')} maxLength={500} /></Champ>
        <Erreur message={erreur} />
        <div className="actions">
          <Bouton type="button" onClick={onFermer}>Annuler</Bouton>
          <Bouton type="submit" variante="principal" chargement={chargement}>Enregistrer</Bouton>
        </div>
      </form>
    </Modale>
  );
}

function ModaleContrat({ objets, contacts, onFermer, onFait }) {
  const { api, etablissement, hub } = useEspace();
  const [contact, setContact] = useState('');
  const [debut, setDebut] = useState(dateLocale());
  const [fin, setFin] = useState(dateLocale(1));
  const [choisis, setChoisis] = useState([]);
  const [note, setNote] = useState('');
  const [erreur, setErreur] = useState('');
  const [chargement, setChargement] = useState(false);
  const disponibles = objets.filter((o) => o.etat === 'disponible');
  const jours = Math.max(1, Math.round((new Date(fin) - new Date(debut)) / 86400000) || 0);
  const selection = disponibles.filter((o) => choisis.includes(o.id));
  const estimation = selection.reduce((s, o) => s + Number(o.tarif_jour), 0) * jours;
  const caution = selection.reduce((s, o) => s + Number(o.caution), 0);
  const basculer = (id) => setChoisis((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]));
  const valider = async (e) => {
    e.preventDefault();
    setChargement(true);
    setErreur('');
    try {
      const r = await api.rpc('creer_contrat_location', {
        p_etablissement_id: etablissement.id, p: { contact_id: contact, objets: choisis, debut, fin_prevue: fin, hub_id: hub?.id ?? null, note },
      });
      onFait(`Contrat ${r.numero} créé : ${formatMontant(r.montant_prevu)}`);
    } catch (err) {
      setErreur(err.message);
      setChargement(false);
    }
  };
  return (
    <Modale titre="Nouvelle location" onFermer={onFermer} large>
      <form className="formulaire" onSubmit={valider}>
        <Champ libelle="Client">
          <select value={contact} onChange={(e) => setContact(e.target.value)} required>
            <option value="">Choisir un client…</option>
            {contacts.map((c) => <option key={c.id} value={c.id}>{c.nom}{c.telephone ? ` · ${c.telephone}` : ''}</option>)}
          </select>
        </Champ>
        <div className="grille-champs">
          <Champ libelle="Du"><input type="date" value={debut} onChange={(e) => setDebut(e.target.value)} required /></Champ>
          <Champ libelle="Au" aide={`${jours} jour(s) facturé(s)`}><input type="date" value={fin} min={debut} onChange={(e) => setFin(e.target.value)} required /></Champ>
        </div>
        <fieldset className="choix-objets">
          <legend>Objets</legend>
          {disponibles.length === 0 && <p className="texte-doux">Aucun objet disponible : ajoutez-en dans l’onglet Parc.</p>}
          {disponibles.map((o) => (
            <label key={o.id} className="case">
              <input type="checkbox" checked={choisis.includes(o.id)} onChange={() => basculer(o.id)} />
              <span>{o.nom}{o.reference ? ` (${o.reference})` : ''} · {formatMontant(o.tarif_jour)} / jour</span>
            </label>
          ))}
        </fieldset>
        <p><strong>Estimation : {formatMontant(estimation)}</strong>{caution > 0 && <> · caution {formatMontant(caution)}</>}</p>
        <Champ libelle="Note (facultatif)"><input value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} /></Champ>
        <p className="texte-doux">La base vérifie qu’aucun objet n’est déjà loué sur ces dates.</p>
        <Erreur message={erreur} />
        <div className="actions">
          <Bouton type="button" onClick={onFermer}>Annuler</Bouton>
          <Bouton type="submit" variante="principal" chargement={chargement} disabled={!contact || !choisis.length}>Créer la location</Bouton>
        </div>
      </form>
    </Modale>
  );
}

function ModaleDetail({ contrat, nomContact, objetsContrat, paiements, peutLouer, peutGerer, onFermer, onFait, onAnnuler }) {
  const { api } = useEspace();
  const [vue, setVue] = useState(null);
  const [caution, setCaution] = useState('rendue');
  const [retenue, setRetenue] = useState('');
  const [etat, setEtat] = useState('');
  const [maintenance, setMaintenance] = useState([]);
  const [dateRetour, setDateRetour] = useState(dateLocale());
  const reste = Number(contrat.montant_final ?? contrat.montant_prevu) - Number(contrat.montant_paye);
  const [montant, setMontant] = useState(String(reste > 0 ? reste : ''));
  const [mode, setMode] = useState('especes');
  const [erreur, setErreur] = useState('');
  const [chargement, setChargement] = useState(false);
  const agir = async (fn, message) => {
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
  const actions = [];
  if (peutLouer && contrat.statut === 'reserve') {
    actions.push(<Bouton key="remettre" variante="principal" chargement={chargement} onClick={() => agir(() => api.rpc('remettre_contrat_location', { p_contrat_id: contrat.id, p_caution_recue: Number(contrat.caution_montant) > 0 }), 'Objets remis au client')}>Remettre au client</Bouton>);
  }
  if (peutLouer && contrat.statut === 'en_cours' && vue !== 'retour') actions.push(<Bouton key="retour" variante="principal" onClick={() => setVue('retour')}>Enregistrer le retour</Bouton>);
  if (peutLouer && contrat.statut !== 'annule' && reste > 0 && vue !== 'paiement') actions.push(<Bouton key="payer" onClick={() => setVue('paiement')}>Encaisser</Bouton>);
  if (peutGerer && contrat.statut === 'reserve' && Number(contrat.montant_paye) === 0) actions.unshift(<Bouton key="annuler" variante="danger" onClick={onAnnuler}>Annuler</Bouton>);
  return (
    <Modale titre={`Location ${contrat.numero}`} onFermer={onFermer} pied={actions.length > 0 && <>{actions}</>}>
      <div className="pile">
        <p><Badge ton={STATUTS[contrat.statut][1]}>{STATUTS[contrat.statut][0]}</Badge> {nomContact(contrat.contact_id)} · du {formatDate(contrat.debut)} au {formatDate(contrat.fin_prevue)}</p>
        <div className="liste-simple">
          {objetsContrat.map((o) => <div key={o.id} className="liste-ligne"><span>{o.nom}</span><strong>{formatMontant(o.tarif_jour)} / jour</strong></div>)}
        </div>
        <dl className="details">
          <dt>Montant</dt><dd>{formatMontant(contrat.montant_final ?? contrat.montant_prevu)}{contrat.montant_final == null && ' (prévu)'}</dd>
          <dt>Payé</dt><dd>{formatMontant(contrat.montant_paye)}{reste > 0 && <> · reste {formatMontant(reste)}</>}</dd>
          {Number(contrat.caution_montant) > 0 && <><dt>Caution</dt><dd>{formatMontant(contrat.caution_montant)} · {CAUTIONS[contrat.caution_statut]}{Number(contrat.caution_retenue) > 0 && ` (${formatMontant(contrat.caution_retenue)} retenus)`}</dd></>}
          {contrat.rendu_le && <><dt>Rendu le</dt><dd>{formatDate(contrat.rendu_le)}{contrat.etat_retour && ` · ${contrat.etat_retour}`}</dd></>}
          {contrat.statut === 'annule' && <><dt>Motif</dt><dd>{contrat.motif_annulation}</dd></>}
        </dl>
        {paiements.length > 0 && (
          <div className="liste-simple">
            {paiements.map((p) => <div key={p.id} className="liste-ligne"><span>{formatDate(p.cree_le)} · {MODES_PAIEMENT[p.mode]}</span><strong>{formatMontant(p.montant)}</strong></div>)}
          </div>
        )}
        {vue === 'retour' && (
          <form className="formulaire" onSubmit={(e) => { e.preventDefault(); agir(() => api.rpc('retourner_contrat_location', { p_contrat_id: contrat.id, p: {
            date_retour: dateRetour, caution, caution_retenue: caution === 'retenue' ? Number(retenue) : 0, etat_retour: etat, objets_maintenance: maintenance,
          } }), (r) => `${r.numero} rendu : ${formatMontant(r.montant_final)}, reste ${formatMontant(r.reste_a_payer)}`); }}>
            <Champ libelle="Date de retour"><input type="date" value={dateRetour} min={contrat.debut} onChange={(e) => setDateRetour(e.target.value)} /></Champ>
            {contrat.caution_statut === 'recue' && (
              <div className="grille-champs">
                <Champ libelle="Caution">
                  <select value={caution} onChange={(e) => setCaution(e.target.value)}><option value="rendue">Rendue en entier</option><option value="retenue">Retenue en partie</option></select>
                </Champ>
                {caution === 'retenue' && <Champ libelle="Montant retenu"><input type="number" min="0" step="any" value={retenue} onChange={(e) => setRetenue(e.target.value)} required /></Champ>}
              </div>
            )}
            <Champ libelle={caution === 'retenue' ? 'État au retour (obligatoire)' : 'État au retour'}><input value={etat} maxLength={500} onChange={(e) => setEtat(e.target.value)} required={caution === 'retenue'} /></Champ>
            {objetsContrat.map((o) => (
              <label key={o.id} className="case">
                <input type="checkbox" checked={maintenance.includes(o.id)} onChange={() => setMaintenance((l) => (l.includes(o.id) ? l.filter((x) => x !== o.id) : [...l, o.id]))} />
                <span>{o.nom} : à réparer (passe en maintenance)</span>
              </label>
            ))}
            <div className="actions"><Bouton type="submit" variante="principal" chargement={chargement}>Valider le retour</Bouton></div>
          </form>
        )}
        {vue === 'paiement' && (
          <form className="formulaire" onSubmit={(e) => { e.preventDefault(); agir(() => api.rpc('encaisser_contrat_location', { p_contrat_id: contrat.id, p_montant: Number(montant), p_mode: mode }), 'Paiement enregistré'); }}>
            <div className="grille-champs">
              <Champ libelle="Montant"><input type="number" min="0" step="any" value={montant} onChange={(e) => setMontant(e.target.value)} required /></Champ>
              <Champ libelle="Mode"><select value={mode} onChange={(e) => setMode(e.target.value)}>{Object.entries(MODES_PAIEMENT).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Champ>
            </div>
            <div className="actions"><Bouton type="submit" variante="principal" chargement={chargement}>Encaisser</Bouton></div>
          </form>
        )}
        <Erreur message={erreur} />
      </div>
    </Modale>
  );
}

export default function Location() {
  const { api, etablissement, hubs, hub, peut, notifier } = useEspace();
  const etab = etablissement.id;
  const [onglet, setOnglet] = useState(() => (lireParametres().get('vue') === 'parc' ? 'parc' : 'contrats'));
  const { donnees, chargement, erreur, recharger } = useDonnees(async () => {
    const [contrats, lignes, objets, paiements, contacts] = await Promise.all([
      api.lire('loc_contrats', { eq: { etablissement_id: etab }, ordre: ['debut', 'desc'], limite: 500 }),
      api.lire('loc_lignes', { eq: { etablissement_id: etab } }),
      api.lire('loc_objets', { eq: { etablissement_id: etab }, ordre: ['nom'] }),
      api.lire('loc_paiements', { eq: { etablissement_id: etab }, ordre: ['cree_le'] }),
      api.lire('contacts', { eq: { etablissement_id: etab }, ordre: ['nom'], colonnes: ['id', 'nom', 'telephone', 'type'] }),
    ]);
    return { contrats: contrats.filter((c) => !hub || c.hub_id === hub.id), lignes, objets, paiements, contacts: contacts.filter((c) => c.type !== 'fournisseur') };
  }, [etab, hub?.id]);
  const nomContact = (id) => donnees?.contacts.find((c) => c.id === id)?.nom ?? 'Client';
  const objetsDe = useMemo(() => (id) => (donnees?.lignes ?? []).filter((l) => l.contrat_id === id)
    .map((l) => ({ ...(donnees.objets.find((o) => o.id === l.objet_id) ?? { nom: 'Objet' }), id: l.objet_id, tarif_jour: l.tarif_jour })), [donnees]);
  const peutLouer = peut('location.louer');
  const peutGerer = peut('location.gerer');
  const [objet, setObjet] = useState(null);
  const [nouveau, setNouveau] = useState(false);
  const [detail, setDetail] = useState(null);
  const [annulation, setAnnulation] = useState(null);
  const fait = (m) => { setObjet(null); setNouveau(false); setDetail(null); notifier(m); recharger(); };
  const aujourdhui = dateLocale();

  return (
    <div className="page">
      <PageHeader
        titre="Location"
        sousTitre="Votre parc d’objets, les réservations, les remises, les retours et les cautions."
        badges={<Badge ton="bleu">Bêta</Badge>}
        actions={onglet === 'contrats'
          ? peutLouer && <Bouton variante="principal" icone="plus" disabled={!donnees} onClick={() => setNouveau(true)}>Nouvelle location</Bouton>
          : peutGerer && <Bouton variante="principal" icone="plus" onClick={() => setObjet({})}>Nouvel objet</Bouton>}
      />
      <Tabs onglets={[['contrats', 'Locations'], ['parc', 'Parc']]} actif={onglet} onChange={setOnglet} />
      <Erreur message={erreur} />
      {onglet === 'contrats' ? (
        <DataTable
          chargement={chargement}
          lignes={donnees?.contrats}
          onLigne={setDetail}
          titreExport="locations"
          rechercher={(c) => `${c.numero} ${nomContact(c.contact_id)} ${objetsDe(c.id).map((o) => o.nom).join(' ')}`}
          placeholder="Numéro, client, objet"
          filtres={[{ id: 'statut', libelle: 'État', options: Object.entries(STATUTS).map(([k, [l]]) => [k, l]), appliquer: (c, v) => c.statut === v }]}
          vide={<EmptyState icone="cle" titre="Aucune location" texte="Ajoutez vos objets dans l’onglet Parc, puis créez une location." />}
          colonnes={[
            { id: 'numero', libelle: 'Numéro', rendu: (c) => <strong>{c.numero}</strong> },
            { id: 'client', libelle: 'Client', rendu: (c) => nomContact(c.contact_id) },
            { id: 'objets', libelle: 'Objets', rendu: (c) => objetsDe(c.id).map((o) => o.nom).join(', ') },
            { id: 'debut', libelle: 'Du', tri: (c) => c.debut, rendu: (c) => formatDate(c.debut) },
            { id: 'fin_prevue', libelle: 'Au', tri: (c) => c.fin_prevue, rendu: (c) => (
              <span className={c.statut === 'en_cours' && c.fin_prevue < aujourdhui ? 'texte-alerte' : undefined}>{formatDate(c.fin_prevue)}</span>) },
            { id: 'montant', libelle: 'Montant', classe: 'nombre', tri: (c) => Number(c.montant_final ?? c.montant_prevu), rendu: (c) => formatMontant(c.montant_final ?? c.montant_prevu) },
            { id: 'statut', libelle: 'État', rendu: (c) => <Badge ton={STATUTS[c.statut][1]}>{STATUTS[c.statut][0]}</Badge> },
          ]}
        />
      ) : (
        <DataTable
          chargement={chargement}
          lignes={donnees?.objets}
          onLigne={peutGerer ? setObjet : undefined}
          titreExport="parc-location"
          rechercher={(o) => `${o.nom} ${o.reference ?? ''} ${o.categorie ?? ''}`}
          placeholder="Nom, référence, catégorie"
          filtres={[{ id: 'etat', libelle: 'État', options: Object.entries(ETATS).map(([k, [l]]) => [k, l]), appliquer: (o, v) => o.etat === v }]}
          vide={<EmptyState icone="cle" titre="Parc vide" texte="Ajoutez les objets que vous louez : tente, sono, véhicule, matériel…" />}
          colonnes={[
            { id: 'nom', libelle: 'Objet', rendu: (o) => <strong>{o.nom}</strong> },
            { id: 'reference', libelle: 'Référence', rendu: (o) => o.reference ?? '—' },
            { id: 'categorie', libelle: 'Catégorie', rendu: (o) => o.categorie ?? '—' },
            { id: 'tarif_jour', libelle: 'Par jour', classe: 'nombre', tri: (o) => Number(o.tarif_jour), rendu: (o) => formatMontant(o.tarif_jour) },
            { id: 'caution', libelle: 'Caution', classe: 'nombre', tri: (o) => Number(o.caution), rendu: (o) => formatMontant(o.caution) },
            { id: 'etat', libelle: 'État', rendu: (o) => <Badge ton={ETATS[o.etat][1]}>{ETATS[o.etat][0]}</Badge> },
          ]}
        />
      )}
      {objet && <ModaleObjet objet={objet.id ? objet : null} hubs={hubs} onFermer={() => setObjet(null)} onFait={fait} />}
      {nouveau && donnees && <ModaleContrat objets={donnees.objets} contacts={donnees.contacts} onFermer={() => setNouveau(false)} onFait={fait} />}
      {detail && (
        <ModaleDetail
          contrat={detail}
          nomContact={nomContact}
          objetsContrat={objetsDe(detail.id)}
          paiements={(donnees?.paiements ?? []).filter((p) => p.contrat_id === detail.id)}
          peutLouer={peutLouer}
          peutGerer={peutGerer}
          onFermer={() => setDetail(null)}
          onFait={fait}
          onAnnuler={() => { setAnnulation(detail); setDetail(null); }}
        />
      )}
      {annulation && (
        <ModaleMotif
          titre={`Annuler ${annulation.numero}`}
          texte="Les objets redeviennent disponibles sur ces dates. Le contrat reste visible, marqué annulé."
          libelleAction="Annuler la location"
          onValider={async (motif) => {
            await api.rpc('annuler_contrat_location', { p_contrat_id: annulation.id, p_motif: motif });
            notifier('Location annulée');
            recharger();
          }}
          onFermer={() => setAnnulation(null)}
        />
      )}
    </div>
  );
}
