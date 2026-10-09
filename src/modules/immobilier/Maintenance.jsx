import React, { useState } from 'react';
import { useDonnees, useEspace } from '../../noyau/espace.jsx';
import { dateLocale, formatDate } from '../../noyau/format.js';
import { Badge, Bouton, Champ, DataTable, Erreur, Modale, ModaleMotif, PageHeader, Section, Squelette, Tabs } from '../../ui/composants.jsx';
import { A_CHARGE, PRIORITES, STATUTS_INCIDENT } from './commun.js';

// Maintenance : incidents et travaux sur les biens (prestataire, devis, coût, à la charge de qui).
// Les travaux résolus à la charge du propriétaire sont déduits de son prochain reversement.
export default function Maintenance() {
  const { api, etablissement, peut, notifier, montant } = useEspace();
  const etab = etablissement.id;
  const { donnees: d, chargement, erreur, recharger } = useDonnees(async () => {
    const [incidents, biens, baux] = await Promise.all([
      api.lire('immo_incidents', { eq: { etablissement_id: etab }, ordre: ['cree_le', 'desc'] }),
      api.lire('immo_biens', { eq: { etablissement_id: etab }, ordre: ['nom'] }),
      api.lire('immo_baux', { eq: { etablissement_id: etab, statut: 'actif' } }).catch(() => []),
    ]);
    return { incidents, biens, baux, bien: Object.fromEntries(biens.map((b) => [b.id, b])) };
  }, [etab]);
  const [onglet, setOnglet] = useState('ouverts');
  const [modale, setModale] = useState(null);
  const [erreurAction, setErreurAction] = useState('');
  if (chargement && !d) return <div className="page"><Squelette lignes={8} /></div>;
  if (erreur) return <div className="page"><Erreur message={erreur} /></div>;
  const gerer = peut('immo_maintenance.gerer');
  const changer = async (i, statut, p = {}) => {
    setErreurAction('');
    try {
      await api.rpc('changer_statut_incident_immo', { p_incident_id: i.id, p_statut: statut, p });
      setModale(null);
      notifier(`« ${i.titre} » : ${STATUTS_INCIDENT[statut][0].toLowerCase()}`);
      recharger();
    } catch (err) {
      setErreurAction(err.message);
    }
  };
  const ouverts = d.incidents.filter((i) => ['ouvert', 'en_cours'].includes(i.statut));
  const lignes = onglet === 'ouverts' ? ouverts : d.incidents;
  return (
    <div className="page page-large">
      <PageHeader titre="Maintenance" sousTitre="Incidents et travaux sur les biens gérés."
        actions={gerer && <Bouton variante="principal" icone="plus" disabled={!d.biens.length} onClick={() => setModale({ incident: {} })}>Incident</Bouton>} />
      <Tabs actif={onglet} onChange={setOnglet} onglets={[['ouverts', 'À traiter', ouverts.length], ['tous', 'Historique', d.incidents.length]]} />
      <Erreur message={erreurAction} />
      <Section>
        <DataTable lignes={lignes} onLigne={gerer ? (i) => setModale({ incident: i }) : undefined}
          rechercher={(i) => `${i.titre} ${d.bien[i.bien_id]?.nom ?? ''} ${i.prestataire ?? ''}`}
          filtres={[{ id: 'priorite', libelle: 'Priorité', options: Object.entries(PRIORITES).map(([k, [l]]) => [k, l]), appliquer: (i, v) => i.priorite === v }]}
          vide={<p className="texte-doux">{onglet === 'ouverts' ? 'Aucun incident à traiter.' : 'Aucun incident.'}</p>}
          colonnes={[
            { id: 'titre', libelle: 'Incident', rendu: (i) => <strong>{i.titre}</strong> },
            { id: 'bien', libelle: 'Bien', rendu: (i) => d.bien[i.bien_id]?.nom },
            { id: 'date', libelle: 'Déclaré le', rendu: (i) => formatDate(i.cree_le), tri: (i) => i.cree_le },
            { id: 'priorite', libelle: 'Priorité', rendu: (i) => <Badge ton={PRIORITES[i.priorite][1]}>{PRIORITES[i.priorite][0]}</Badge> },
            { id: 'charge', libelle: 'À la charge de', rendu: (i) => A_CHARGE[i.a_charge_de] },
            { id: 'cout', libelle: 'Devis / coût', classe: 'nombre', rendu: (i) => (i.cout != null ? montant(i.cout) : i.devis != null ? `${montant(i.devis)} (devis)` : '—') },
            { id: 'statut', libelle: 'État', rendu: (i) => <Badge ton={STATUTS_INCIDENT[i.statut][1]}>{STATUTS_INCIDENT[i.statut][0]}</Badge> },
            ...(gerer ? [{
              id: 'action', libelle: '',
              rendu: (i) => (
                <span className="groupe-boutons" onClick={(e) => e.stopPropagation()} role="presentation">
                  {i.statut === 'ouvert' && <Bouton onClick={() => changer(i, 'en_cours')}>Commencer</Bouton>}
                  {['ouvert', 'en_cours'].includes(i.statut) && <Bouton variante="principal" onClick={() => setModale({ resoudre: i })}>Résolu</Bouton>}
                  {['ouvert', 'en_cours'].includes(i.statut) && <button type="button" className="lien" onClick={() => setModale({ annuler: i })}>Annuler</button>}
                </span>
              ),
            }] : []),
          ]} />
      </Section>
      {modale?.incident && (
        <ModaleIncident incident={modale.incident} biens={d.biens.filter((b) => b.actif)} baux={d.baux}
          onFermer={() => setModale(null)} onFait={() => { setModale(null); notifier('Incident enregistré'); recharger(); }} />
      )}
      {modale?.resoudre && <ModaleResolution incident={modale.resoudre} onFermer={() => setModale(null)} onValider={(p) => changer(modale.resoudre, 'resolu', p)} />}
      {modale?.annuler && (
        <ModaleMotif titre={`Annuler « ${modale.annuler.titre} »`} texte="Ex. doublon, signalement sans suite." libelleAction="Annuler l’incident"
          onFermer={() => setModale(null)} onValider={(motif) => changer(modale.annuler, 'annule', { motif })} />
      )}
    </div>
  );
}

const texte = (x) => (x == null ? '' : String(x));

function ModaleIncident({ incident: i, biens, baux, onFermer, onFait }) {
  const { api, etablissement } = useEspace();
  const [v, setV] = useState({
    bien_id: i.bien_id ?? biens.find((b) => b.type !== 'immeuble')?.id ?? biens[0]?.id ?? '', titre: texte(i.titre), description: texte(i.description),
    priorite: i.priorite ?? 'normale', prestataire: texte(i.prestataire), devis: texte(i.devis), a_charge_de: i.a_charge_de ?? 'proprietaire',
  });
  const [erreur, setErreur] = useState('');
  const changer = (c) => (e) => setV({ ...v, [c]: e.target.value });
  const valider = async (e) => {
    e.preventDefault();
    try {
      const bail = baux.find((b) => b.bien_id === v.bien_id);
      await api.rpc('enregistrer_incident_immo', { p_etablissement_id: etablissement.id, p: { id: i.id, bail_id: i.bail_id ?? bail?.id ?? null, ...v } });
      onFait();
    } catch (err) {
      setErreur(err.message);
    }
  };
  const fige = i.id && !['ouvert', 'en_cours'].includes(i.statut);
  return (
    <Modale titre={i.id ? i.titre : 'Nouvel incident'} onFermer={onFermer}>
      <form className="formulaire" onSubmit={valider}>
        <fieldset disabled={fige} className="sans-bordure">
          <div className="grille-champs">
            <Champ libelle="Bien">
              <select value={v.bien_id} onChange={changer('bien_id')}>{biens.map((b) => <option key={b.id} value={b.id}>{b.nom}</option>)}</select>
            </Champ>
            <Champ libelle="Titre"><input value={v.titre} onChange={changer('titre')} required maxLength={160} autoFocus placeholder="Fuite d’eau salle de bain" /></Champ>
            <Champ libelle="Priorité">
              <select value={v.priorite} onChange={changer('priorite')}>{Object.entries(PRIORITES).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</select>
            </Champ>
            <Champ libelle="À la charge de">
              <select value={v.a_charge_de} onChange={changer('a_charge_de')}>{Object.entries(A_CHARGE).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
            </Champ>
            <Champ libelle="Prestataire"><input value={v.prestataire} onChange={changer('prestataire')} maxLength={160} /></Champ>
            <Champ libelle="Devis"><input type="number" min="0" step="any" value={v.devis} onChange={changer('devis')} /></Champ>
          </div>
          <Champ libelle="Description"><textarea rows={3} value={v.description} onChange={changer('description')} maxLength={4000} /></Champ>
        </fieldset>
        {fige && <p className="texte-doux">Incident {STATUTS_INCIDENT[i.statut][0].toLowerCase()}{i.resolu_le ? ` le ${formatDate(i.resolu_le)}` : ''} : il n’est plus modifiable.</p>}
        <Erreur message={erreur} />
        <div className="actions">
          <Bouton type="button" onClick={onFermer}>{fige ? 'Fermer' : 'Annuler'}</Bouton>
          {!fige && <Bouton type="submit" variante="principal">Enregistrer</Bouton>}
        </div>
      </form>
    </Modale>
  );
}

function ModaleResolution({ incident: i, onFermer, onValider }) {
  const [v, setV] = useState({ cout: texte(i.devis), prestataire: texte(i.prestataire), date: dateLocale() });
  return (
    <Modale titre={`Résolu : ${i.titre}`} onFermer={onFermer}>
      <form className="formulaire" onSubmit={(e) => { e.preventDefault(); onValider(v); }}>
        <div className="grille-champs">
          <Champ libelle="Coût final"><input type="number" min="0" step="any" value={v.cout} onChange={(e) => setV({ ...v, cout: e.target.value })} autoFocus /></Champ>
          <Champ libelle="Prestataire"><input value={v.prestataire} onChange={(e) => setV({ ...v, prestataire: e.target.value })} maxLength={160} /></Champ>
          <Champ libelle="Date"><input type="date" value={v.date} onChange={(e) => setV({ ...v, date: e.target.value })} /></Champ>
        </div>
        {i.a_charge_de === 'proprietaire' && <p className="texte-doux">Ce coût sera déduit du prochain reversement au propriétaire.</p>}
        <div className="actions">
          <Bouton type="button" onClick={onFermer}>Annuler</Bouton>
          <Bouton type="submit" variante="principal">Marquer résolu</Bouton>
        </div>
      </form>
    </Modale>
  );
}
