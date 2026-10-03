import React, { useState } from 'react';
import { useDonnees, useEspace } from '../../noyau/espace.jsx';
import { formatDateHeure } from '../../noyau/format.js';
import { Badge, Bouton, Champ, DataTable, Erreur, Modale, PageHeader, Section, Squelette, StatCard } from '../../ui/composants.jsx';

const TYPES = { gain: ['Achat', 'vert'], annulation: ['Annulation', 'orange'], utilisation: ['Récompense', 'bleu'], ajustement: ['Ajustement', 'neutre'] };

// Fidélité : soldes de points des clients, historique, récompenses et ajustements.
export default function Fidelite() {
  const { api, etablissement, peut, montant } = useEspace();
  const etab = etablissement.id;
  const { donnees: d, chargement, erreur, recharger } = useDonnees(async () => {
    const [soldes, tdb, contacts] = await Promise.all([
      api.rpc('soldes_fidelite', { p_etablissement_id: etab }),
      api.rpc('tableau_de_bord_fidelite', { p_etablissement_id: etab }),
      api.lire('contacts', { eq: { etablissement_id: etab, actif: true }, ordre: ['nom'] }).catch(() => []),
    ]);
    return { soldes, tdb, contacts: contacts.filter((c) => c.type !== 'fournisseur') };
  }, [etab]);
  const [ouvert, setOuvert] = useState(null);
  const [ajout, setAjout] = useState(false);
  if (chargement && !d) return <div className="page"><Squelette lignes={8} /></div>;
  if (erreur) return <div className="page"><Erreur message={erreur} /></div>;
  const valeur = Number(d.tdb.valeur_point);
  return (
    <div className="page page-large">
      <PageHeader titre="Fidélité" sousTitre={`Les clients identifiés gagnent des points à chaque achat. Un point vaut ${montant(valeur)} en récompense.`}
        actions={peut('fidelite.gerer') && <Bouton icone="plus" onClick={() => setAjout(true)}>Ajouter des points</Bouton>} />
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
      {ouvert && <FicheClient s={ouvert} tdb={d.tdb} onFermer={() => setOuvert(null)} onChange={() => { setOuvert(null); recharger(); }} />}
      {ajout && <ModaleAjustement contacts={d.contacts} onFermer={() => setAjout(false)} onFait={() => { setAjout(false); recharger(); }} />}
    </div>
  );
}

function FicheClient({ s, tdb, onFermer, onChange }) {
  const { api, etablissement, peut, montant, notifier } = useEspace();
  const { donnees: mouvements } = useDonnees(() => api.lire('fidelite_mouvements', { eq: { etablissement_id: etablissement.id, contact_id: s.contact_id }, ordre: ['cree_le', 'desc'], limite: 200 }), [s.contact_id]);
  const minimum = Number(tdb.minimum_utilisation);
  const [points, setPoints] = useState(String(Math.max(minimum, 0) || ''));
  const [motif, setMotif] = useState('');
  const [erreur, setErreur] = useState('');
  const utiliser = async (e) => {
    e.preventDefault();
    setErreur('');
    try {
      await api.rpc('utiliser_points_fidelite', { p_etablissement_id: etablissement.id, p_contact_id: s.contact_id, p_points: Number(points), p_motif: motif });
      notifier(`${points} points utilisés`);
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
          <Champ libelle="Points à utiliser" aide={`Minimum ${minimum} ; ${points ? montant(Number(points) * Number(tdb.valeur_point)) : ''} de récompense`}>
            <input type="number" min={Math.max(1, minimum)} max={s.solde} step="1" required value={points} onChange={(e) => setPoints(e.target.value)} />
          </Champ>
          <Champ libelle="Récompense accordée" aide="Ex. remise de 1 000 FCFA sur le ticket V-00125, ou un savon offert.">
            <input required maxLength={300} value={motif} onChange={(e) => setMotif(e.target.value)} />
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
