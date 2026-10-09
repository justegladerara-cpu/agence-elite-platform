import React, { useState } from 'react';
import { useDonnees, useEspace } from '../../noyau/espace.jsx';
import { lireParametres } from '../../noyau/routes.js';
import { dateLocale, formatDate, formatDateHeure, formatMontant, MODES_PAIEMENT } from '../../noyau/format.js';
import { Badge, Bouton, Champ, DataTable, EmptyState, Erreur, Modale, ModaleMotif, PageHeader, Tabs } from '../../ui/composants.jsx';

// Livraisons (Bêta) : création depuis une vente, une commande en ligne ou à la main ; tournées ; avancement par le livreur.
// Le livreur ne voit que ses livraisons (règle de la base).
const STATUTS = {
  a_preparer: ['À préparer', 'neutre'], prete: ['Prête', 'bleu'], en_route: ['En route', 'orange'],
  livree: ['Livrée', 'vert'], echec: ['Échec', 'alerte'], annulee: ['Annulée', 'neutre'],
};
const SOURCES = { libre: 'Saisie libre', vente: 'Vente', boutique: 'Commande en ligne' };
const TOURNEES = { preparee: ['Préparée', 'bleu'], en_cours: ['En cours', 'orange'], terminee: ['Terminée', 'vert'] };

function ModaleLivraison({ contacts, ventes, commandes, livreurs, onFermer, onFait }) {
  const { api, etablissement, hub } = useEspace();
  const [f, setF] = useState({ source: 'libre', source_id: '', contact_id: '', destinataire: '', telephone: '', adresse: '', instructions: '',
    date_prevue: dateLocale(), creneau: '', montant_a_encaisser: '', livreur_id: '' });
  const [erreur, setErreur] = useState('');
  const [chargement, setChargement] = useState(false);
  const champ = (cle) => ({ value: f[cle], onChange: (e) => setF({ ...f, [cle]: e.target.value }) });
  const contact = contacts.find((c) => c.id === f.contact_id);
  const valider = async (e) => {
    e.preventDefault();
    setChargement(true);
    setErreur('');
    try {
      const p = Object.fromEntries(Object.entries(f).filter(([, v]) => v !== ''));
      if (p.montant_a_encaisser) p.montant_a_encaisser = Number(p.montant_a_encaisser);
      const r = await api.rpc('creer_livraison', { p_etablissement_id: etablissement.id, p: { ...p, hub_id: hub?.id } });
      onFait(`Livraison ${r.numero} créée`);
    } catch (err) {
      setErreur(err.message);
      setChargement(false);
    }
  };
  return (
    <Modale titre="Nouvelle livraison" onFermer={onFermer} large>
      <form className="formulaire" onSubmit={valider}>
        <Champ libelle="Origine">
          <select value={f.source} onChange={(e) => setF({ ...f, source: e.target.value, source_id: '' })}>
            {Object.entries(SOURCES).filter(([k]) => k !== 'boutique' || commandes.length).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </Champ>
        {f.source === 'vente' && (
          <Champ libelle="Vente" aide="Client, Hub et reste à payer sont repris de la vente.">
            <select {...champ('source_id')} required>
              <option value="">Choisir…</option>
              {ventes.map((v) => <option key={v.id} value={v.id}>{v.numero} · {formatMontant(v.total)} · {formatDateHeure(v.cree_le)}</option>)}
            </select>
          </Champ>
        )}
        {f.source === 'boutique' && (
          <Champ libelle="Commande en ligne" aide="Nom, téléphone et adresse sont repris de la commande.">
            <select {...champ('source_id')} required>
              <option value="">Choisir…</option>
              {commandes.map((c) => <option key={c.id} value={c.id}>{c.numero} · {c.nom_client}</option>)}
            </select>
          </Champ>
        )}
        {f.source !== 'boutique' && (
          <Champ libelle="Client (facultatif)">
            <select {...champ('contact_id')}>
              <option value="">Aucun : saisir le destinataire</option>
              {contacts.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
            </select>
          </Champ>
        )}
        <div className="grille-champs">
          <Champ libelle="Destinataire"><input {...champ('destinataire')} maxLength={120} placeholder={contact?.nom ?? (f.source === 'boutique' ? 'Repris de la commande' : '')} /></Champ>
          <Champ libelle="Téléphone"><input {...champ('telephone')} maxLength={40} inputMode="tel" placeholder={contact?.telephone ?? ''} /></Champ>
        </div>
        <Champ libelle="Adresse"><input {...champ('adresse')} maxLength={500} placeholder={contact?.adresse ?? (f.source === 'boutique' ? 'Reprise de la commande' : 'Quartier, rue, repère')} /></Champ>
        <Champ libelle="Instructions (facultatif)"><input {...champ('instructions')} maxLength={500} placeholder="Ex. : appeler en arrivant" /></Champ>
        <div className="grille-champs">
          <Champ libelle="Date"><input type="date" {...champ('date_prevue')} required /></Champ>
          <Champ libelle="Créneau (facultatif)"><input {...champ('creneau')} maxLength={40} placeholder="Ex. : 14 h – 16 h" /></Champ>
          <Champ libelle="À encaisser à la livraison" aide={f.source === 'vente' ? 'Vide : reste à payer de la vente' : undefined}><input type="number" min="0" step="any" {...champ('montant_a_encaisser')} /></Champ>
          <Champ libelle="Livreur (facultatif)">
            <select {...champ('livreur_id')}><option value="">Plus tard</option>{livreurs.map((l) => <option key={l.id} value={l.id}>{l.nom}</option>)}</select>
          </Champ>
        </div>
        <Erreur message={erreur} />
        <div className="actions">
          <Bouton type="button" onClick={onFermer}>Annuler</Bouton>
          <Bouton type="submit" variante="principal" chargement={chargement}>Créer la livraison</Bouton>
        </div>
      </form>
    </Modale>
  );
}

function ModaleTournee({ livraisons, livreurs, onFermer, onFait }) {
  const { api, etablissement, hub } = useEspace();
  const [livreur, setLivreur] = useState('');
  const [date, setDate] = useState(dateLocale());
  const [choisies, setChoisies] = useState([]);
  const [erreur, setErreur] = useState('');
  const [chargement, setChargement] = useState(false);
  const valider = async (e) => {
    e.preventDefault();
    setChargement(true);
    setErreur('');
    try {
      const r = await api.rpc('creer_tournee', { p_etablissement_id: etablissement.id, p: { livreur_id: livreur, date_tournee: date, livraisons: choisies, hub_id: hub?.id } });
      onFait(`Tournée ${r.numero} : ${r.livraisons} livraison(s)`);
    } catch (err) {
      setErreur(err.message);
      setChargement(false);
    }
  };
  return (
    <Modale titre="Nouvelle tournée" onFermer={onFermer}>
      <form className="formulaire" onSubmit={valider}>
        <div className="grille-champs">
          <Champ libelle="Livreur">
            <select value={livreur} onChange={(e) => setLivreur(e.target.value)} required>
              <option value="">Choisir…</option>{livreurs.map((l) => <option key={l.id} value={l.id}>{l.nom}</option>)}
            </select>
          </Champ>
          <Champ libelle="Date"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Champ>
        </div>
        <fieldset className="choix-objets">
          <legend>Livraisons à confier</legend>
          {livraisons.length === 0 && <p className="texte-doux">Aucune livraison à préparer.</p>}
          {livraisons.map((l) => (
            <label key={l.id} className="case">
              <input type="checkbox" checked={choisies.includes(l.id)} onChange={() => setChoisies((x) => (x.includes(l.id) ? x.filter((i) => i !== l.id) : [...x, l.id]))} />
              <span>{l.numero} · {l.destinataire} · {l.adresse} · {formatDate(l.date_prevue)}</span>
            </label>
          ))}
        </fieldset>
        <Erreur message={erreur} />
        <div className="actions">
          <Bouton type="button" onClick={onFermer}>Annuler</Bouton>
          <Bouton type="submit" variante="principal" chargement={chargement} disabled={!livreur || !choisies.length}>Créer la tournée</Bouton>
        </div>
      </form>
    </Modale>
  );
}

function ModaleDetail({ livraison: l, nomLivreur, livreurs, peutGerer, peutLivrer, moi, onFermer, onFait, onAnnuler }) {
  const { api } = useEspace();
  const [vue, setVue] = useState(null);
  const [recuPar, setRecuPar] = useState('');
  const [montant, setMontant] = useState(String(Number(l.montant_a_encaisser) || ''));
  const [mode, setMode] = useState('especes');
  const [motif, setMotif] = useState('');
  const [date, setDate] = useState(l.date_prevue);
  const [livreur, setLivreur] = useState(l.livreur_id ?? '');
  const [erreur, setErreur] = useState('');
  const [chargement, setChargement] = useState(false);
  const agir = async (fn, message) => {
    setChargement(true);
    setErreur('');
    try {
      await fn();
      onFait(message);
    } catch (err) {
      setErreur(err.message);
      setChargement(false);
    }
  };
  const avancer = (statut, p = {}, message) => agir(() => api.rpc('avancer_livraison', { p_livraison_id: l.id, p_statut: statut, p }), message);
  const mienne = peutGerer || l.livreur_id === moi || !l.livreur_id;
  const actions = [];
  if (peutLivrer && mienne) {
    if (['a_preparer', 'echec'].includes(l.statut)) actions.push(<Bouton key="prete" onClick={() => avancer('prete', {}, 'Livraison prête')} chargement={chargement}>Prête</Bouton>);
    if (['a_preparer', 'prete'].includes(l.statut)) actions.push(<Bouton key="route" variante="principal" onClick={() => avancer('en_route', {}, 'En route')} chargement={chargement}>Partir</Bouton>);
    if (l.statut === 'en_route') {
      actions.push(<Bouton key="echec" variante="danger" onClick={() => setVue('echec')}>Échec</Bouton>);
      actions.push(<Bouton key="livree" variante="principal" onClick={() => setVue('livree')}>Livrée</Bouton>);
    }
  }
  if (peutGerer && ['a_preparer', 'prete', 'echec'].includes(l.statut)) actions.unshift(<Bouton key="replanifier" onClick={() => setVue('replanifier')}>Replanifier</Bouton>);
  if (peutGerer && ['a_preparer', 'prete', 'echec'].includes(l.statut)) actions.unshift(<Bouton key="annuler" variante="danger" onClick={onAnnuler}>Annuler</Bouton>);
  return (
    <Modale titre={`Livraison ${l.numero}`} onFermer={onFermer} pied={actions.length > 0 && <>{actions}</>}>
      <div className="pile">
        <p><Badge ton={STATUTS[l.statut][1]}>{STATUTS[l.statut][0]}</Badge> {formatDate(l.date_prevue)}{l.creneau && ` · ${l.creneau}`}</p>
        <dl className="details">
          <dt>Destinataire</dt><dd>{l.destinataire}{l.telephone && <> · <a href={`tel:${l.telephone.replace(/\s/g, '')}`}>{l.telephone}</a></>}</dd>
          <dt>Adresse</dt><dd>{l.adresse}</dd>
          {l.instructions && <><dt>Instructions</dt><dd>{l.instructions}</dd></>}
          {l.source !== 'libre' && <><dt>Origine</dt><dd>{SOURCES[l.source] ?? 'Facture'} {l.source_numero}</dd></>}
          <dt>Livreur</dt><dd>{l.livreur_id ? nomLivreur(l.livreur_id) : 'Pas encore choisi'}</dd>
          {Number(l.montant_a_encaisser) > 0 && <><dt>À encaisser</dt><dd>{formatMontant(l.montant_a_encaisser)}{l.statut === 'livree' && ` · encaissé ${formatMontant(l.montant_encaisse)}${l.mode_encaissement ? ` (${MODES_PAIEMENT[l.mode_encaissement]})` : ''}`}</dd></>}
          {l.statut === 'livree' && <><dt>Livrée</dt><dd>{formatDateHeure(l.livree_le)}{l.recu_par && ` · reçue par ${l.recu_par}`}</dd></>}
          {l.motif && <><dt>Motif</dt><dd>{l.motif}</dd></>}
        </dl>
        {vue === 'livree' && (
          <form className="formulaire" onSubmit={(e) => { e.preventDefault(); avancer('livree', { recu_par: recuPar, montant_encaisse: Number(montant || 0), mode }, `${l.numero} livrée`); }}>
            <Champ libelle="Reçue par"><input value={recuPar} onChange={(e) => setRecuPar(e.target.value)} maxLength={120} /></Champ>
            {Number(l.montant_a_encaisser) > 0 && (
              <div className="grille-champs">
                <Champ libelle="Montant encaissé"><input type="number" min="0" step="any" value={montant} onChange={(e) => setMontant(e.target.value)} /></Champ>
                <Champ libelle="Mode"><select value={mode} onChange={(e) => setMode(e.target.value)}>{Object.entries(MODES_PAIEMENT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Champ>
              </div>
            )}
            <div className="actions"><Bouton type="submit" variante="principal" chargement={chargement}>Confirmer la livraison</Bouton></div>
          </form>
        )}
        {vue === 'echec' && (
          <form className="formulaire" onSubmit={(e) => { e.preventDefault(); avancer('echec', { motif }, `${l.numero} : échec noté`); }}>
            <Champ libelle="Motif"><input value={motif} onChange={(e) => setMotif(e.target.value)} maxLength={300} required placeholder="Absent, adresse introuvable…" /></Champ>
            <div className="actions"><Bouton type="submit" variante="danger" chargement={chargement}>Noter l’échec</Bouton></div>
          </form>
        )}
        {vue === 'replanifier' && (
          <form className="formulaire" onSubmit={(e) => { e.preventDefault(); agir(() => api.rpc('replanifier_livraison', { p_livraison_id: l.id, p: { date_prevue: date, livreur_id: livreur || null } }), 'Livraison replanifiée'); }}>
            <div className="grille-champs">
              <Champ libelle="Nouvelle date"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Champ>
              <Champ libelle="Livreur"><select value={livreur} onChange={(e) => setLivreur(e.target.value)}><option value="">Plus tard</option>{livreurs.map((x) => <option key={x.id} value={x.id}>{x.nom}</option>)}</select></Champ>
            </div>
            <div className="actions"><Bouton type="submit" variante="principal" chargement={chargement}>Replanifier</Bouton></div>
          </form>
        )}
        <Erreur message={erreur} />
      </div>
    </Modale>
  );
}

export default function Livraisons() {
  const { api, etablissement, hub, peut, notifier, utilisateur } = useEspace();
  const etab = etablissement.id;
  const peutGerer = peut('livraisons.gerer');
  const peutLivrer = peut('livraisons.livrer');
  const [onglet, setOnglet] = useState('livraisons');
  const { donnees, chargement, erreur, recharger } = useDonnees(async () => {
    const [livraisons, tournees, livreurs] = await Promise.all([
      api.lire('liv_livraisons', { eq: { etablissement_id: etab }, ordre: ['date_prevue', 'desc'], limite: 500 }),
      api.lire('liv_tournees', { eq: { etablissement_id: etab }, ordre: ['date_tournee', 'desc'], limite: 200 }),
      api.rpc('livreurs_etablissement', { p_etablissement_id: etab }),
    ]);
    const [contacts, ventes, commandes] = peutGerer ? await Promise.all([
      api.lire('contacts', { eq: { etablissement_id: etab }, ordre: ['nom'], colonnes: ['id', 'nom', 'telephone', 'adresse', 'type'] }),
      api.lire('ventes', { eq: { etablissement_id: etab, statut: 'validee' }, ordre: ['cree_le', 'desc'], limite: 50, colonnes: ['id', 'numero', 'total', 'cree_le'] }).catch(() => []),
      api.lire('boutique_commandes', { eq: { etablissement_id: etab, mode_livraison: 'livraison' }, dans: { statut: ['nouvelle', 'confirmee', 'preparee', 'expediee'] },
        ordre: ['cree_le', 'desc'], limite: 50, colonnes: ['id', 'numero', 'nom_client'] }).catch(() => []),
    ]) : [[], [], []];
    const filtre = (x) => !hub || x.hub_id === hub.id;
    return { livraisons: livraisons.filter(filtre), tournees: tournees.filter(filtre), livreurs, contacts: contacts.filter((c) => c.type !== 'fournisseur'), ventes, commandes };
  }, [etab, hub?.id]);
  const nomLivreur = (id) => donnees?.livreurs.find((l) => l.id === id)?.nom ?? 'Livreur';
  const [nouvelle, setNouvelle] = useState(() => peutGerer && lireParametres().get('nouveau') === '1');
  const [tournee, setTournee] = useState(false);
  const [detail, setDetail] = useState(null);
  const [annulation, setAnnulation] = useState(null);
  const fait = (m) => { setNouvelle(false); setTournee(false); setDetail(null); notifier(m); recharger(); };
  const aujourdhui = dateLocale();
  const aPreparer = (donnees?.livraisons ?? []).filter((l) => ['a_preparer', 'prete'].includes(l.statut) && !(l.tournee_id && donnees.tournees.find((t) => t.id === l.tournee_id && t.statut !== 'terminee')));

  return (
    <div className="page">
      <PageHeader
        titre="Livraisons"
        sousTitre={peutGerer ? 'Livraisons à domicile, tournées et livreurs.' : 'Les livraisons qui vous sont confiées.'}
        badges={<Badge ton="bleu">Bêta</Badge>}
        actions={peutGerer && (onglet === 'livraisons'
          ? <Bouton variante="principal" icone="plus" disabled={!donnees} onClick={() => setNouvelle(true)}>Nouvelle livraison</Bouton>
          : <Bouton variante="principal" icone="plus" disabled={!donnees} onClick={() => setTournee(true)}>Nouvelle tournée</Bouton>)}
      />
      <Tabs onglets={[['livraisons', 'Livraisons'], ['tournees', 'Tournées']]} actif={onglet} onChange={setOnglet} />
      <Erreur message={erreur} />
      {onglet === 'livraisons' ? (
        <DataTable
          chargement={chargement}
          lignes={donnees?.livraisons}
          onLigne={setDetail}
          titreExport="livraisons"
          rechercher={(l) => `${l.numero} ${l.destinataire} ${l.adresse} ${l.telephone ?? ''} ${l.source_numero ?? ''}`}
          placeholder="Numéro, destinataire, adresse"
          filtres={[{ id: 'statut', libelle: 'État', options: Object.entries(STATUTS).map(([k, [v]]) => [k, v]), appliquer: (l, v) => l.statut === v }]}
          vide={<EmptyState icone="camion" titre="Aucune livraison" texte={peutGerer ? 'Créez une livraison depuis une vente, une commande en ligne ou à la main.' : 'Rien ne vous est confié pour l’instant.'} />}
          colonnes={[
            { id: 'numero', libelle: 'Numéro', rendu: (l) => <strong>{l.numero}</strong> },
            { id: 'date_prevue', libelle: 'Date', tri: (l) => l.date_prevue, rendu: (l) => (
              <span className={['a_preparer', 'prete', 'en_route'].includes(l.statut) && l.date_prevue < aujourdhui ? 'texte-alerte' : undefined}>{formatDate(l.date_prevue)}{l.creneau ? ` · ${l.creneau}` : ''}</span>) },
            { id: 'destinataire', libelle: 'Destinataire', rendu: (l) => l.destinataire },
            { id: 'adresse', libelle: 'Adresse', rendu: (l) => l.adresse },
            { id: 'livreur', libelle: 'Livreur', rendu: (l) => (l.livreur_id ? nomLivreur(l.livreur_id) : '—') },
            { id: 'montant', libelle: 'À encaisser', classe: 'nombre', tri: (l) => Number(l.montant_a_encaisser), rendu: (l) => (Number(l.montant_a_encaisser) ? formatMontant(l.montant_a_encaisser) : '—') },
            { id: 'statut', libelle: 'État', rendu: (l) => <Badge ton={STATUTS[l.statut][1]}>{STATUTS[l.statut][0]}</Badge> },
          ]}
        />
      ) : (
        <DataTable
          chargement={chargement}
          lignes={donnees?.tournees}
          titreExport="tournees"
          rechercher={(t) => `${t.numero} ${nomLivreur(t.livreur_id)}`}
          vide={<EmptyState icone="camion" titre="Aucune tournée" texte="Une tournée confie plusieurs livraisons à un livreur pour une journée." />}
          colonnes={[
            { id: 'numero', libelle: 'Numéro', rendu: (t) => <strong>{t.numero}</strong> },
            { id: 'date_tournee', libelle: 'Date', tri: (t) => t.date_tournee, rendu: (t) => formatDate(t.date_tournee) },
            { id: 'livreur', libelle: 'Livreur', rendu: (t) => nomLivreur(t.livreur_id) },
            { id: 'nombre', libelle: 'Livraisons', classe: 'nombre', rendu: (t) => donnees.livraisons.filter((l) => l.tournee_id === t.id).length },
            { id: 'statut', libelle: 'État', rendu: (t) => <Badge ton={TOURNEES[t.statut][1]}>{TOURNEES[t.statut][0]}</Badge> },
          ]}
        />
      )}
      {nouvelle && donnees && (
        <ModaleLivraison contacts={donnees.contacts} ventes={donnees.ventes} commandes={donnees.commandes} livreurs={donnees.livreurs} onFermer={() => setNouvelle(false)} onFait={fait} />
      )}
      {tournee && donnees && <ModaleTournee livraisons={aPreparer} livreurs={donnees.livreurs} onFermer={() => setTournee(false)} onFait={fait} />}
      {detail && (
        <ModaleDetail
          livraison={detail}
          nomLivreur={nomLivreur}
          livreurs={donnees?.livreurs ?? []}
          peutGerer={peutGerer}
          peutLivrer={peutLivrer}
          moi={utilisateur?.id}
          onFermer={() => setDetail(null)}
          onFait={fait}
          onAnnuler={() => { setAnnulation(detail); setDetail(null); }}
        />
      )}
      {annulation && (
        <ModaleMotif
          titre={`Annuler ${annulation.numero}`}
          texte="La livraison reste visible, marquée annulée."
          libelleAction="Annuler la livraison"
          onValider={async (motif) => {
            await api.rpc('annuler_livraison', { p_livraison_id: annulation.id, p_motif: motif });
            notifier('Livraison annulée');
            recharger();
          }}
          onFermer={() => setAnnulation(null)}
        />
      )}
    </div>
  );
}
