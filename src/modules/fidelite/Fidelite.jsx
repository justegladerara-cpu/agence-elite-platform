import { trierLignes } from '../../noyau/donnees/lecture.js';
import React, { useEffect, useRef, useState } from 'react';
import { useDonnees, useEspace } from '../../noyau/espace.jsx';
import { lireParametres } from '../../noyau/routes.js';
import { formatDateHeure } from '../../noyau/format.js';
import { Badge, Bouton, Champ, DataTable, Erreur, Modale, PageHeader, Section, Squelette, StatCard } from '../../ui/composants.jsx';

const TYPES = { gain: ['Achat', 'vert'], annulation: ['Annulation', 'orange'], utilisation: ['Récompense', 'bleu'], ajustement: ['Ajustement', 'neutre'] };

// Fidélité : soldes de points des clients, historique, récompenses et ajustements.
export default function Fidelite() {
  const { api, etablissement, peut, montant } = useEspace();
  const etab = etablissement.id;
  const { donnees: d, chargement, erreur, recharger } = useDonnees(async () => {
    const [soldes, tdb, contacts, recompenses] = await Promise.all([
      api.rpc('soldes_fidelite', { p_etablissement_id: etab }),
      api.rpc('tableau_de_bord_fidelite', { p_etablissement_id: etab }),
      api.lire('contacts', { eq: { etablissement_id: etab, actif: true }, ordre: ['nom'] }).catch(() => []),
      api.lire('fidelite_recompenses', { eq: { etablissement_id: etab }, ordre: ['points'] }).then((lignes) => trierLignes(lignes, ['points', 'nom'])).catch(() => []),
    ]);
    return { soldes, tdb, recompenses, contacts: contacts.filter((c) => c.type !== 'fournisseur') };
  }, [etab]);
  const [ouvert, setOuvert] = useState(null);
  const [ajout, setAjout] = useState(false);
  const [recompense, setRecompense] = useState(false);
  // Lien ?vue=recompenses : défile jusqu’au catalogue de récompenses.
  const [vueRecompenses] = useState(() => lireParametres().get('vue') === 'recompenses');
  const catalogue = useRef(null);
  const charge = Boolean(d);
  useEffect(() => { if (vueRecompenses && charge) catalogue.current?.scrollIntoView({ block: 'start' }); }, [vueRecompenses, charge]);
  if (chargement && !d) return <div className="page"><Squelette lignes={8} /></div>;
  if (erreur) return <div className="page"><Erreur message={erreur} /></div>;
  const valeur = Number(d.tdb.valeur_point);
  return (
    <div className="page page-large">
      <PageHeader titre="Fidélité" sousTitre={`Les clients identifiés gagnent des points à chaque achat. Un point vaut ${montant(valeur)} en récompense.`}
        actions={peut('fidelite.gerer') && <><Bouton onClick={() => setRecompense(true)}>Nouvelle récompense</Bouton><Bouton icone="plus" onClick={() => setAjout(true)}>Ajouter des points</Bouton></>} />
      <div className="grille-indicateurs">
        <StatCard icone="etoile" libelle="Clients avec des points" valeur={d.tdb.clients} />
        <StatCard icone="ventes" libelle="Points en cours" valeur={Number(d.tdb.points_en_cours).toLocaleString('fr-FR')} detail={`Soit ${montant(Number(d.tdb.points_en_cours) * valeur)} de récompenses possibles`} />
        <StatCard icone="repeter" libelle="Ce mois-ci" valeur={`${d.tdb.gagnes_mois} gagnés`} detail={`${d.tdb.utilises_mois} utilisés`} />
      </div>
      <Section>
        <DataTable lignes={d.soldes} cle="contact_id" onLigne={(s) => setOuvert(s)} rechercher={(s) => `${s.nom} ${s.telephone ?? ''}`} placeholder="Nom ou téléphone du client…"
          vide={<p className="texte-doux">Aucun point pour l’instant : les points arrivent avec les ventes faites à un client identifié.</p>}
          triInitial={{ id: 'solde', sens: 'desc' }}
          colonnes={[
            { id: 'nom', libelle: 'Client', rendu: (s) => <><strong>{s.nom}</strong><br /><small className="texte-doux">{s.telephone}</small></>, tri: (s) => s.nom },
            { id: 'solde', libelle: 'Solde', classe: 'nombre', rendu: (s) => <strong>{s.solde} pts</strong>, tri: (s) => s.solde },
            { id: 'valeur', libelle: 'Valeur', classe: 'nombre', rendu: (s) => montant(s.solde * valeur) },
            { id: 'pret', libelle: '', rendu: (s) => (s.solde >= Number(d.tdb.minimum_utilisation) ? <Badge ton="vert">Récompense possible</Badge> : null) },
            { id: 'dernier', libelle: 'Dernier mouvement', rendu: (s) => formatDateHeure(s.dernier), tri: (s) => s.dernier },
          ]} />
      </Section>
      <div ref={catalogue}><Section titre="Catalogue de récompenses" sousTitre="Des avantages clairs, avec un coût en points fixe et une attribution traçable.">
        <DataTable lignes={d.recompenses} vide={<p className="texte-doux">Créez une première récompense, par exemple « Livraison offerte ».</p>} colonnes={[
          { id: 'nom', libelle: 'Récompense', rendu: (r) => <><strong>{r.nom}</strong><br /><small className="texte-doux">{r.description}</small></> },
          { id: 'points', libelle: 'Coût', classe: 'nombre', rendu: (r) => `${r.points} pts`, tri: (r) => r.points },
          { id: 'valeur', libelle: 'Valeur indicative', classe: 'nombre', rendu: (r) => r.valeur == null ? '—' : montant(r.valeur) },
          { id: 'actif', libelle: 'État', rendu: (r) => <Badge ton={r.actif ? 'vert' : 'neutre'}>{r.actif ? 'Disponible' : 'Retirée'}</Badge> },
        ]} />
      </Section></div>
      {ouvert && <FicheClient s={ouvert} tdb={d.tdb} recompenses={d.recompenses.filter((r) => r.actif)} onFermer={() => setOuvert(null)} onChange={() => { setOuvert(null); recharger(); }} />}
      {ajout && <ModaleAjustement contacts={d.contacts} onFermer={() => setAjout(false)} onFait={() => { setAjout(false); recharger(); }} />}
      {recompense && <ModaleRecompense onFermer={() => setRecompense(false)} onFait={() => { setRecompense(false); recharger(); }} />}
    </div>
  );
}

function FicheClient({ s, tdb, recompenses, onFermer, onChange }) {
  const { api, etablissement, peut, montant, notifier } = useEspace();
  const { donnees: mouvements } = useDonnees(() => api.lire('fidelite_mouvements', { eq: { etablissement_id: etablissement.id, contact_id: s.contact_id }, ordre: ['cree_le', 'desc'], limite: 200 }), [s.contact_id]);
  const minimum = Number(tdb.minimum_utilisation);
  const [points, setPoints] = useState(String(Math.max(minimum, 0) || ''));
  const [motif, setMotif] = useState('');
  const [recompense, setRecompense] = useState('');
  const [erreur, setErreur] = useState('');
  const utiliser = async (e) => {
    e.preventDefault();
    setErreur('');
    try {
      if (recompense) {
        const choisie = recompenses.find((r) => r.id === recompense);
        await api.rpc('attribuer_recompense_fidelite', { p_recompense_id: recompense, p_contact_id: s.contact_id, p_vente_id: null, p_note: motif || null });
        notifier(`${choisie.nom} attribuée`);
      } else {
        await api.rpc('utiliser_points_fidelite', { p_etablissement_id: etablissement.id, p_contact_id: s.contact_id, p_points: Number(points), p_motif: motif });
        notifier(`${points} points utilisés`);
      }
      onChange();
    } catch (err) {
      setErreur(err.message);
    }
  };
  return (
    <Modale titre={`${s.nom} · ${s.solde} points`} onFermer={onFermer}>
      <p className="texte-doux">Valeur : {montant(s.solde * Number(tdb.valeur_point))}. Gagnés : {s.gagnes ?? 0}, utilisés : {s.utilises}.</p>
      {peut('fidelite.utiliser') && s.solde > 0 && (
        <form onSubmit={utiliser} className="pile">
          <Erreur message={erreur} />
          {recompenses.length > 0 && <Champ libelle="Récompense du catalogue"><select value={recompense} onChange={(e) => { setRecompense(e.target.value); const r = recompenses.find((x) => x.id === e.target.value); if (r) setPoints(String(r.points)); }}><option value="">Utilisation libre</option>{recompenses.filter((r) => r.points <= s.solde).map((r) => <option key={r.id} value={r.id}>{r.nom} · {r.points} pts</option>)}</select></Champ>}
          <Champ libelle="Points à utiliser" aide={`Minimum ${minimum} ; ${points ? montant(Number(points) * Number(tdb.valeur_point)) : ''} de récompense`}>
            <input type="number" min={Math.max(1, minimum)} max={s.solde} step="1" required value={points} onChange={(e) => setPoints(e.target.value)} />
          </Champ>
          <Champ libelle="Récompense accordée" aide="Ex. remise de 1 000 FCFA sur le ticket V-00125, ou un savon offert.">
            <input required={!recompense} maxLength={300} value={motif} onChange={(e) => setMotif(e.target.value)} />
          </Champ>
          <Bouton type="submit" variante="principal">Utiliser les points</Bouton>
        </form>
      )}
      <h3>Historique</h3>
      <DataTable lignes={mouvements ?? []} parPage={10} vide={<p className="texte-doux">Aucun mouvement.</p>}
        colonnes={[
          { id: 'date', libelle: 'Date', rendu: (m) => formatDateHeure(m.cree_le) },
          { id: 'type', libelle: 'Type', rendu: (m) => <Badge ton={TYPES[m.type][1]}>{TYPES[m.type][0]}</Badge> },
          { id: 'motif', libelle: 'Détail', rendu: (m) => m.motif },
          { id: 'points', libelle: 'Points', classe: 'nombre', rendu: (m) => `${m.points > 0 ? '+' : ''}${m.points}` },
        ]} />
    </Modale>
  );
}

function ModaleRecompense({ onFermer, onFait }) {
  const { api, etablissement } = useEspace(); const [v, setV] = useState({ nom: '', description: '', points: '', valeur: '' }); const [erreur, setErreur] = useState('');
  const valider = async (e) => { e.preventDefault(); try { await api.rpc('enregistrer_recompense_fidelite', { p_etablissement_id: etablissement.id, p: v }); onFait(); } catch (err) { setErreur(err.message); } };
  return <Modale titre="Nouvelle récompense" onFermer={onFermer}><form className="formulaire" onSubmit={valider}>
    <Champ libelle="Nom"><input required maxLength={120} value={v.nom} onChange={(e) => setV({ ...v, nom: e.target.value })} autoFocus /></Champ>
    <Champ libelle="Description"><textarea maxLength={500} value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} /></Champ>
    <div className="grille-formulaire"><Champ libelle="Points"><input type="number" min="1" required value={v.points} onChange={(e) => setV({ ...v, points: e.target.value })} /></Champ><Champ libelle="Valeur indicative"><input type="number" min="0" step="any" value={v.valeur} onChange={(e) => setV({ ...v, valeur: e.target.value })} /></Champ></div>
    <Erreur message={erreur} /><div className="actions"><Bouton type="button" onClick={onFermer}>Annuler</Bouton><Bouton type="submit" variante="principal">Créer</Bouton></div>
  </form></Modale>;
}

function ModaleAjustement({ contacts, onFermer, onFait }) {
  const { api, etablissement, notifier } = useEspace();
  const [v, setV] = useState({ contact: '', points: '', motif: '' });
  const [erreur, setErreur] = useState('');
  const valider = async (e) => {
    e.preventDefault();
    setErreur('');
    try {
      await api.rpc('ajuster_points_fidelite', { p_etablissement_id: etablissement.id, p_contact_id: v.contact, p_points: Number(v.points), p_motif: v.motif });
      notifier('Points ajustés');
      onFait();
    } catch (err) {
      setErreur(err.message);
    }
  };
  return (
    <Modale titre="Ajouter ou retirer des points" onFermer={onFermer}>
      <form onSubmit={valider} className="pile">
        <Erreur message={erreur} />
        <Champ libelle="Client">
          <select required value={v.contact} onChange={(e) => setV({ ...v, contact: e.target.value })}>
            <option value="">Choisir…</option>
            {contacts.map((c) => <option key={c.id} value={c.id}>{c.nom}{c.telephone ? ` · ${c.telephone}` : ''}</option>)}
          </select>
        </Champ>
        <Champ libelle="Points" aide="Négatif pour retirer (le solde ne devient jamais négatif).">
          <input type="number" step="1" required value={v.points} onChange={(e) => setV({ ...v, points: e.target.value })} />
        </Champ>
        <Champ libelle="Motif"><input required maxLength={300} value={v.motif} onChange={(e) => setV({ ...v, motif: e.target.value })} placeholder="Ex. reprise de la carte papier" /></Champ>
        <Bouton type="submit" variante="principal">Enregistrer</Bouton>
      </form>
    </Modale>
  );
}
