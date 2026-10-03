import React, { useState } from 'react';
import { useDonnees, useEspace } from '../../noyau/espace.jsx';
import { dateLocale, formatDateHeure, formatQuantite, MODES_PAIEMENT } from '../../noyau/format.js';
import { Badge, Bouton, Champ, Chargement, EnTete, Erreur, Modale, ModaleMotif, Onglets, Recherche, Vide } from '../../ui/composants.jsx';
import { ModaleRecu } from '../recus/Recu.jsx';

const PERIODES = [['jour', 'Aujourd’hui'], ['semaine', '7 jours'], ['mois', '30 jours'], ['tout', 'Tout']];
const DEBUTS = { jour: 0, semaine: -6, mois: -29 };

const ORIGINES = { caisse: 'Caisse', facture: 'Facture', boutique: 'Boutique en ligne', restaurant: 'Restaurant', hotel: 'Hôtel', abonnement: 'Abonnement' };

export function BadgePaiement({ vente }) {
  if (vente.statut === 'annulee') return <Badge ton="rouge">Annulée</Badge>;
  if (vente.statut_paiement === 'payee') return <Badge ton="vert">Payée</Badge>;
  if (vente.statut_paiement === 'partielle') return <Badge ton="orange">Partielle</Badge>;
  return <Badge ton="orange">À crédit</Badge>;
}

function debutPeriode(periode) {
  if (periode === 'tout') return null;
  const debut = new Date(`${dateLocale(DEBUTS[periode])}T00:00:00`);
  return debut.toISOString();
}

function ModaleEncaissement({ vente, sessions, onFermer, onFait }) {
  const { api, montant } = useEspace();
  const reste = vente.total - vente.montant_paye;
  const [mode, setMode] = useState('especes');
  const [valeur, setValeur] = useState(String(reste));
  const [reference, setReference] = useState('');
  const [erreur, setErreur] = useState('');
  const [chargement, setChargement] = useState(false);
  const valider = async (e) => {
    e.preventDefault();
    setChargement(true);
    setErreur('');
    try {
      await api.rpc('encaisser_paiement', {
        p_vente_id: vente.id, p_montant: Number(valeur), p_mode: mode, p_session_id: sessions[0]?.id ?? null, p_reference: reference || null,
      });
      onFait();
    } catch (err) {
      setErreur(err.message);
      setChargement(false);
    }
  };
  return (
    <Modale titre={`Encaisser sur ${vente.numero}`} onFermer={onFermer}>
      <form className="formulaire" onSubmit={valider}>
        <p className="texte-doux">Reste dû : <strong>{montant(reste)}</strong></p>
        <Champ libelle="Mode">
          <select value={mode} onChange={(e) => setMode(e.target.value)}>
            {Object.entries(MODES_PAIEMENT).map(([id, libelle]) => <option key={id} value={id}>{libelle}</option>)}
          </select>
        </Champ>
        <Champ libelle="Montant">
          <input type="number" min="0" step="any" max={reste} value={valeur} onChange={(e) => setValeur(e.target.value)} required />
        </Champ>
        {mode !== 'especes' && (
          <Champ libelle="Référence (facultatif)"><input value={reference} onChange={(e) => setReference(e.target.value)} /></Champ>
        )}
        {mode === 'especes' && !sessions.length && <Erreur message="Ouvrez une caisse pour encaisser des espèces." />}
        <Erreur message={erreur} />
        <div className="actions">
          <Bouton type="button" onClick={onFermer}>Annuler</Bouton>
          <Bouton type="submit" variante="principal" chargement={chargement}>Encaisser</Bouton>
        </div>
      </form>
    </Modale>
  );
}

export function DetailVente({ venteId, onFermer, onChange }) {
  const { api, montant, peut, notifier } = useEspace();
  const { donnees, chargement, erreur, recharger } = useDonnees(async () => {
    const [[vente], lignes, paiements] = await Promise.all([
      api.lire('ventes', { eq: { id: venteId } }),
      api.lire('lignes_vente', { eq: { vente_id: venteId } }),
      peut('paiements.lire') ? api.lire('paiements', { eq: { vente_id: venteId }, ordre: ['cree_le'] }) : [],
    ]);
    const sessions = await api.lire('sessions_caisse', { eq: { etablissement_id: vente.etablissement_id, statut: 'ouverte' } });
    const contact = vente.contact_id ? (await api.lire('contacts', { eq: { id: vente.contact_id } }))[0] : null;
    return { vente, lignes, paiements, sessions, contact };
  }, [venteId]);
  const [action, setAction] = useState(null);

  const apres = (message) => {
    setAction(null);
    notifier(message);
    recharger();
    onChange?.();
  };

  if (action?.type === 'recu') return <ModaleRecu venteId={venteId} onFermer={() => setAction(null)} />;

  return (
    <Modale titre={donnees ? `Vente ${donnees.vente.numero}` : 'Vente'} onFermer={onFermer} large>
      {chargement && !donnees && <Chargement />}
      <Erreur message={erreur} />
      {donnees && (() => {
        const { vente, lignes, paiements, sessions, contact } = donnees;
        const reste = vente.total - vente.montant_paye;
        return (
          <div className="detail">
            <div className="detail-tete">
              <div>
                <BadgePaiement vente={vente} />
                <p className="texte-doux">{formatDateHeure(vente.cree_le)}{contact ? ` · ${contact.nom}` : ' · Client de passage'}</p>
              </div>
              <div className="detail-total">
                <span>Total</span>
                <strong>{montant(vente.total)}</strong>
              </div>
            </div>
            {vente.statut === 'annulee' && (
              <div className="encart rouge">Annulée le {formatDateHeure(vente.annulee_le)} : {vente.motif_annulation}</div>
            )}
            <table className="tableau">
              <thead><tr><th>Article</th><th className="nombre">Qté</th><th className="nombre">Prix</th><th className="nombre">Total</th></tr></thead>
              <tbody>
                {lignes.map((l) => (
                  <tr key={l.id}>
                    <td>{l.libelle}</td>
                    <td className="nombre">{formatQuantite(l.quantite)}</td>
                    <td className="nombre">{montant(l.prix_unitaire)}</td>
                    <td className="nombre">{montant(l.total)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                {vente.remise > 0 && <tr><td colSpan={3}>Remise</td><td className="nombre">− {montant(vente.remise)}</td></tr>}
                <tr><td colSpan={3}><strong>Total</strong></td><td className="nombre"><strong>{montant(vente.total)}</strong></td></tr>
                <tr><td colSpan={3}>Payé</td><td className="nombre">{montant(vente.montant_paye)}</td></tr>
                {reste > 0 && vente.statut === 'validee' && <tr className="orange"><td colSpan={3}>Reste dû</td><td className="nombre">{montant(reste)}</td></tr>}
              </tfoot>
            </table>
            {paiements.length > 0 && (
              <>
                <h3>Paiements</h3>
                <div className="liste-simple">
                  {paiements.map((p) => (
                    <div key={p.id} className={`liste-ligne ${p.statut === 'annule' ? 'barre' : ''}`}>
                      <span>{MODES_PAIEMENT[p.mode]}{p.reference ? ` · ${p.reference}` : ''}</span>
                      <span className="texte-doux">{formatDateHeure(p.cree_le)}</span>
                      <strong>{montant(p.montant)}</strong>
                      {p.statut === 'annule'
                        ? <Badge ton="rouge" >Annulé</Badge>
                        : vente.statut === 'validee' && peut('paiements.encaisser') && (
                          <button className="lien danger" onClick={() => setAction({ type: 'annuler-paiement', paiement: p })}>Annuler</button>
                        )}
                    </div>
                  ))}
                </div>
              </>
            )}
            <div className="actions">
              {(peut('recus.lire') || peut('ventes.lire')) && <Bouton icone="imprimer" onClick={() => setAction({ type: 'recu' })}>Reçu</Bouton>}
              {vente.statut === 'validee' && reste > 0 && peut('paiements.encaisser') && (
                <Bouton variante="principal" onClick={() => setAction({ type: 'encaisser' })}>Encaisser le reste</Bouton>
              )}
              {vente.statut === 'validee' && peut('ventes.annuler') && (
                <Bouton variante="danger" onClick={() => setAction({ type: 'annuler' })}>Annuler la vente</Bouton>
              )}
            </div>
            {action?.type === 'encaisser' && (
              <ModaleEncaissement vente={vente} sessions={sessions} onFermer={() => setAction(null)} onFait={() => apres('Paiement enregistré')} />
            )}
            {action?.type === 'annuler' && (
              <ModaleMotif
                titre={`Annuler ${vente.numero}`}
                texte="Le stock sera remis en rayon et les paiements annulés. La vente reste visible avec son motif."
                libelleAction="Annuler la vente"
                onValider={(motif) => api.rpc('annuler_vente', { p_vente_id: vente.id, p_motif: motif }).then(() => apres('Vente annulée'))}
                onFermer={() => setAction(null)}
              />
            )}
            {action?.type === 'annuler-paiement' && (
              <ModaleMotif
                titre="Annuler ce paiement"
                texte={`${MODES_PAIEMENT[action.paiement.mode]} de ${montant(action.paiement.montant)}. Le reste dû sera recalculé.`}
                libelleAction="Annuler le paiement"
                onValider={(motif) => api.rpc('annuler_paiement', { p_paiement_id: action.paiement.id, p_motif: motif }).then(() => apres('Paiement annulé'))}
                onFermer={() => setAction(null)}
              />
            )}
          </div>
        );
      })()}
    </Modale>
  );
}

export default function Ventes() {
  const { api, etablissement, montant, hubs, hub, multiHub } = useEspace();
  const etab = etablissement.id;
  const hubFiltre = multiHub ? hub?.id ?? null : null;
  const nomHub = (id) => hubs.find((h) => h.id === id)?.nom ?? '—';
  const [periode, setPeriode] = useState('jour');
  const [filtre, setFiltre] = useState('toutes');
  const [recherche, setRecherche] = useState('');
  const [ouverte, setOuverte] = useState(null);
  const { donnees, chargement, erreur, recharger } = useDonnees(async () => {
    const debut = debutPeriode(periode);
    const [ventes, contacts] = await Promise.all([
      api.lire('ventes', { eq: { etablissement_id: etab, ...(hubFiltre ? { hub_id: hubFiltre } : {}) }, gte: debut ? { cree_le: debut } : {}, ordre: ['cree_le', 'desc'], limite: 500 }),
      api.lire('contacts', { eq: { etablissement_id: etab } }).catch(() => []),
    ]);
    return { ventes, contacts: Object.fromEntries(contacts.map((c) => [c.id, c.nom])) };
  }, [etab, periode, hubFiltre]);

  const texte = recherche.trim().toLowerCase();
  const ventes = (donnees?.ventes ?? []).filter((v) => {
    if (filtre === 'credit' && !(v.statut === 'validee' && v.montant_paye < v.total)) return false;
    if (filtre === 'annulees' && v.statut !== 'annulee') return false;
    if (!texte) return true;
    return v.numero.toLowerCase().includes(texte) || (donnees.contacts[v.contact_id] ?? '').toLowerCase().includes(texte);
  });
  const validees = ventes.filter((v) => v.statut === 'validee');
  const total = validees.reduce((s, v) => s + v.total, 0);

  return (
    <div className="page">
      <EnTete titre="Ventes" sousTitre={`${multiHub ? `${hub ? hub.nom : 'Tous les Hubs'} · ` : ''}${validees.length} vente(s) validée(s) · ${montant(total)}`} />
      <div className="filtres">
        <Onglets onglets={PERIODES} actif={periode} onChange={setPeriode} />
        <Onglets onglets={[['toutes', 'Toutes'], ['credit', 'À encaisser'], ['annulees', 'Annulées']]} actif={filtre} onChange={setFiltre} />
        <Recherche valeur={recherche} onChange={setRecherche} placeholder="Numéro ou contact" />
      </div>
      {chargement && !donnees && <Chargement />}
      <Erreur message={erreur} />
      {donnees && !ventes.length && <Vide titre="Aucune vente" texte="Aucune vente ne correspond à ces filtres." />}
      {ventes.length > 0 && (
        <div className="tableau-conteneur">
          <table className="tableau cliquable">
            <thead>
              <tr><th>N°</th><th>Date</th>{multiHub && <th>Hub</th>}<th>Contact</th><th className="nombre">Total</th><th className="nombre">Reste</th><th>État</th></tr>
            </thead>
            <tbody>
              {ventes.map((v) => (
                <tr key={v.id} onClick={() => setOuverte(v.id)}>
                  <td><strong>{v.numero}</strong>{v.origine && v.origine !== 'caisse' && <><br /><small className="texte-doux">{ORIGINES[v.origine] ?? v.origine}</small></>}</td>
                  <td>{formatDateHeure(v.cree_le)}</td>
                  {multiHub && <td>{nomHub(v.hub_id)}</td>}
                  <td>{donnees.contacts[v.contact_id] ?? '—'}</td>
                  <td className="nombre">{montant(v.total)}</td>
                  <td className="nombre">{v.statut === 'validee' && v.total > v.montant_paye ? montant(v.total - v.montant_paye) : '—'}</td>
                  <td><BadgePaiement vente={v} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {ouverte && <DetailVente venteId={ouverte} onFermer={() => setOuverte(null)} onChange={recharger} />}
    </div>
  );
}
