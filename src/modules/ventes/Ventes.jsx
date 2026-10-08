import { useState } from 'react';
import { useDonnees, useEspace } from '../../noyau/espace.jsx';
import { dateLocale, formatDate, formatDateHeure, formatQuantite, MODES_PAIEMENT } from '../../noyau/format.js';
import { lireParametres } from '../../noyau/routes.js';
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

function ModaleRetour({ vente, lignes, retours, sessions, onFermer, onFait }) {
  const { api, montant } = useEspace();
  const dejaRetourne = Object.fromEntries(lignes.map((ligne) => [ligne.id,
    retours.flatMap((retour) => retour.lignes ?? []).filter((retour) => retour.ligne_id === ligne.id)
      .reduce((total, retour) => total + Number(retour.quantite), 0)]));
  const [quantites, setQuantites] = useState({});
  const [motif, setMotif] = useState('');
  const [mode, setMode] = useState('especes');
  const [reference, setReference] = useState('');
  const [erreur, setErreur] = useState('');
  const [chargement, setChargement] = useState(false);
  const selection = lignes.map((ligne) => ({ ligne_id: ligne.id, quantite: Number(quantites[ligne.id] ?? 0) })).filter((ligne) => ligne.quantite > 0);
  const estimation = lignes.reduce((total, ligne) => total + (Number(quantites[ligne.id] ?? 0) / Number(ligne.quantite)) * Number(ligne.total), 0)
    * (Number(vente.sous_total) > 0 ? Number(vente.total) / Number(vente.sous_total) : 1);
  const valider = async (e) => {
    e.preventDefault(); setChargement(true); setErreur('');
    try {
      const resultat = await api.rpc('enregistrer_retour_vente', {
        p_vente_id: vente.id, p_lignes: selection, p_motif: motif, p_mode: mode,
        p_session_id: mode === 'especes' ? sessions.find((session) => session.hub_id === vente.hub_id)?.id ?? null : null,
        p_reference: reference || null,
      });
      onFait(resultat);
    } catch (err) { setErreur(err.message); setChargement(false); }
  };
  return (
    <Modale titre={`Retour sur ${vente.numero}`} onFermer={onFermer} large>
      <form className="formulaire" onSubmit={valider}>
        <p className="texte-doux">Choisissez uniquement les articles réellement rapportés. Les quantités seront remises dans le stock du Hub d’origine.</p>
        <div className="tableau-conteneur">
          <table className="tableau">
            <thead><tr><th>Article</th><th className="nombre">Vendu</th><th className="nombre">Déjà retourné</th><th className="nombre">À retourner</th></tr></thead>
            <tbody>{lignes.map((ligne) => {
              const maximum = Number(ligne.quantite) - dejaRetourne[ligne.id];
              return <tr key={ligne.id}><td>{ligne.libelle}</td><td className="nombre">{formatQuantite(ligne.quantite)}</td>
                <td className="nombre">{formatQuantite(dejaRetourne[ligne.id])}</td><td className="nombre">
                  <input aria-label={`Quantité retournée pour ${ligne.libelle}`} type="number" min="0" max={maximum} step="any" disabled={maximum <= 0}
                    value={quantites[ligne.id] ?? ''} onChange={(e) => setQuantites((q) => ({ ...q, [ligne.id]: e.target.value }))} />
                </td></tr>;
            })}</tbody>
          </table>
        </div>
        <div className="grille-formulaire">
          <Champ libelle="Motif du retour"><textarea required minLength={3} maxLength={500} rows={2} value={motif} onChange={(e) => setMotif(e.target.value)} /></Champ>
          <Champ libelle="Mode de remboursement"><select value={mode} onChange={(e) => setMode(e.target.value)}>
            {Object.entries({ ...MODES_PAIEMENT, avoir: 'Avoir / échange' }).map(([id, libelle]) => <option key={id} value={id}>{libelle}</option>)}
          </select></Champ>
          {mode !== 'especes' && mode !== 'avoir' && <Champ libelle="Référence"><input value={reference} onChange={(e) => setReference(e.target.value)} maxLength={120} /></Champ>}
        </div>
        <div className="encart"><strong>Montant estimé : {montant(estimation)}</strong><br /><span className="texte-doux">Le serveur applique exactement les remises du ticket. La part non encaissée devient un avoir, sans sortie d’argent.</span></div>
        {mode === 'especes' && !sessions.some((session) => session.hub_id === vente.hub_id) && <Erreur message="Ouvrez la caisse du Hub d’origine pour rembourser en espèces." />}
        <Erreur message={erreur} />
        <div className="actions"><Bouton type="button" onClick={onFermer}>Annuler</Bouton><Bouton type="submit" variante="principal" chargement={chargement} disabled={!selection.length || !motif.trim()}>Enregistrer le retour</Bouton></div>
      </form>
    </Modale>
  );
}

export function DetailVente({ venteId, onFermer, onChange }) {
  const { api, montant, peut, notifier } = useEspace();
  const { donnees, chargement, erreur, recharger } = useDonnees(async () => {
    const [[vente], lignes, paiements, retours] = await Promise.all([
      api.lire('ventes', { eq: { id: venteId } }),
      api.lire('lignes_vente', { eq: { vente_id: venteId } }),
      peut('paiements.lire') ? api.lire('paiements', { eq: { vente_id: venteId }, ordre: ['cree_le'] }) : [],
      api.rpc('historique_retours_vente', { p_vente_id: venteId }).catch(() => []),
    ]);
    const sessions = await api.lire('sessions_caisse', { eq: { etablissement_id: vente.etablissement_id, statut: 'ouverte' } });
    const contact = vente.contact_id ? (await api.lire('contacts', { eq: { id: vente.contact_id } }))[0] : null;
    return { vente, lignes, paiements, retours, sessions, contact };
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
        const { vente, lignes, paiements, retours, sessions, contact } = donnees;
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
            {retours.length > 0 && <>
              <h3>Retours et remboursements</h3>
              <div className="liste-simple">{retours.map((retour) => <div key={retour.id} className="liste-ligne">
                <span><strong>{retour.numero}</strong> · {retour.motif}<br /><small className="texte-doux">{formatDateHeure(retour.cree_le)} · {retour.lignes.length} ligne(s)</small></span>
                <strong>− {montant(retour.montant)}</strong>
                <Badge ton={retour.remboursement?.mode === 'avoir' ? 'bleu' : 'orange'}>{retour.remboursement ? (retour.remboursement.mode === 'avoir' ? 'Avoir / échange' : `Remboursé · ${MODES_PAIEMENT[retour.remboursement.mode]}`) : 'Non encaissé'}</Badge>
              </div>)}</div>
            </>}
            <div className="actions">
              {(peut('recus.lire') || peut('ventes.lire')) && <Bouton icone="imprimer" onClick={() => setAction({ type: 'recu' })}>Reçu</Bouton>}
              {vente.statut === 'validee' && reste > 0 && peut('paiements.encaisser') && (
                <Bouton variante="principal" onClick={() => setAction({ type: 'encaisser' })}>Encaisser le reste</Bouton>
              )}
              {vente.statut === 'validee' && peut('ventes.annuler') && (
                <Bouton variante="danger" onClick={() => setAction({ type: 'annuler' })}>Annuler la vente</Bouton>
              )}
              {vente.statut === 'validee' && peut('ventes.retourner') && lignes.some((ligne) => Number(ligne.quantite) > retours.flatMap((retour) => retour.lignes ?? []).filter((retour) => retour.ligne_id === ligne.id).reduce((s, retour) => s + Number(retour.quantite), 0)) && (
                <Bouton onClick={() => setAction({ type: 'retour' })}>Retour / échange</Bouton>
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
            {action?.type === 'retour' && <ModaleRetour vente={vente} lignes={lignes} retours={retours} sessions={sessions}
              onFermer={() => setAction(null)} onFait={(resultat) => apres(`${resultat.numero} enregistré · ${montant(resultat.montant_rembourse)} remboursé`)} />}
          </div>
        );
      })()}
    </Modale>
  );
}

// Paramètres reconnus dans l'adresse (ouverts depuis le tableau de bord) :
// du, au, paiement=impaye, statut=annulee, origine, vendeur, q, vue=retours ; #/ventes/<id> ouvre une vente.
export default function Ventes({ sousRoute }) {
  const { api, etablissement, montant, hubs, hub, multiHub } = useEspace();
  const etab = etablissement.id;
  const hubFiltre = multiHub ? hub?.id ?? null : null;
  const nomHub = (id) => hubs.find((h) => h.id === id)?.nom ?? '—';
  const p = lireParametres();
  const plage = p.get('du') && p.get('au') ? { du: p.get('du'), au: p.get('au') } : null;
  const [vue, setVue] = useState(p.get('vue') === 'retours' ? 'retours' : 'ventes');
  const [periode, setPeriode] = useState(plage ? 'plage' : (p.get('paiement') ? 'tout' : 'jour'));
  const [filtre, setFiltre] = useState(p.get('paiement') ? 'credit' : p.get('statut') === 'annulee' ? 'annulees' : 'toutes');
  const [recherche, setRecherche] = useState(p.get('q') ?? '');
  const [origine, setOrigine] = useState(p.get('origine') ?? '');
  const [vendeur, setVendeur] = useState(p.get('vendeur') ?? '');
  const [ouverte, setOuverte] = useState((sousRoute ?? '').split('/')[0] || null);
  const bornes = () => {
    if (periode === 'plage') return { gte: new Date(`${plage.du}T00:00:00`).toISOString(), lte: new Date(`${plage.au}T23:59:59.999`).toISOString() };
    const debut = debutPeriode(periode);
    return { gte: debut, lte: null };
  };
  const { donnees, chargement, erreur, recharger } = useDonnees(async () => {
    const { gte, lte } = bornes();
    const [ventes, contacts, retours] = await Promise.all([
      api.lire('ventes', {
        eq: { etablissement_id: etab, ...(hubFiltre ? { hub_id: hubFiltre } : {}), ...(origine ? { origine } : {}), ...(vendeur ? { vendeur } : {}) },
        gte: gte ? { cree_le: gte } : {}, lte: lte ? { cree_le: lte } : {}, ordre: ['cree_le', 'desc'], limite: 1000,
      }),
      api.lire('contacts', { eq: { etablissement_id: etab }, colonnes: ['id', 'nom'] }).catch(() => []),
      vue === 'retours'
        ? Promise.all([
          api.lire('retours_vente', { eq: { etablissement_id: etab, ...(hubFiltre ? { hub_id: hubFiltre } : {}) }, gte: gte ? { cree_le: gte } : {}, lte: lte ? { cree_le: lte } : {}, ordre: ['cree_le', 'desc'], limite: 500 }),
          api.lire('remboursements_vente', { eq: { etablissement_id: etab } }).catch(() => []),
        ]).then(([r, remb]) => r.map((x) => ({ ...x, remboursement: remb.find((m) => m.retour_id === x.id) ?? null })))
        : Promise.resolve([]),
    ]);
    return { ventes, retours, contacts: Object.fromEntries(contacts.map((c) => [c.id, c.nom])) };
  }, [etab, periode, hubFiltre, origine, vendeur, vue]);

  const texte = recherche.trim().toLowerCase();
  const ventes = (donnees?.ventes ?? []).filter((v) => {
    if (filtre === 'credit' && !(v.statut === 'validee' && v.montant_paye < v.total)) return false;
    if (filtre === 'annulees' && v.statut !== 'annulee') return false;
    if (!texte) return true;
    return v.numero.toLowerCase().includes(texte) || (donnees.contacts[v.contact_id] ?? '').toLowerCase().includes(texte);
  });
  const validees = ventes.filter((v) => v.statut === 'validee');
  const total = validees.reduce((s, v) => s + v.total, 0);
  const numeroVente = Object.fromEntries((donnees?.ventes ?? []).map((v) => [v.id, v.numero]));
  const retours = (donnees?.retours ?? []).filter((r) => !texte || `${r.numero} ${r.motif} ${numeroVente[r.vente_id] ?? ''}`.toLowerCase().includes(texte));
  const ongletsPeriode = plage ? [...PERIODES, ['plage', `${formatDate(plage.du)} → ${formatDate(plage.au)}`]] : PERIODES;
  const filtresActifs = [origine && `Origine : ${ORIGINES[origine] ?? origine}`, vendeur && 'Un vendeur'].filter(Boolean);

  return (
    <div className="page">
      <EnTete
        titre="Ventes"
        sousTitre={vue === 'retours'
          ? `${retours.length} retour(s) · ${montant(retours.reduce((s, r) => s + Number(r.montant), 0))}`
          : `${multiHub ? `${hub ? hub.nom : 'Tous les Hubs'} · ` : ''}${validees.length} vente(s) validée(s) · ${montant(total)}`}
      />
      <Onglets onglets={[['ventes', 'Ventes'], ['retours', 'Retours et remboursements']]} actif={vue} onChange={setVue} />
      <div className="filtres">
        <Onglets onglets={ongletsPeriode} actif={periode} onChange={setPeriode} />
        {vue === 'ventes' && <Onglets onglets={[['toutes', 'Toutes'], ['credit', 'À encaisser'], ['annulees', 'Annulées']]} actif={filtre} onChange={setFiltre} />}
        <Recherche valeur={recherche} onChange={setRecherche} placeholder={vue === 'retours' ? 'Numéro ou motif' : 'Numéro ou contact'} />
        {filtresActifs.length > 0 && (
          <Bouton icone="fermer" onClick={() => { setOrigine(''); setVendeur(''); }}>{filtresActifs.join(' · ')}</Bouton>
        )}
      </div>
      {chargement && !donnees && <Chargement />}
      <Erreur message={erreur} />
      {vue === 'retours' && donnees && !retours.length && <Vide titre="Aucun retour" texte="Aucun retour sur cette période." />}
      {vue === 'retours' && retours.length > 0 && (
        <div className="tableau-conteneur">
          <table className="tableau cliquable">
            <thead><tr><th>N°</th><th>Date</th><th>Vente</th><th>Motif</th><th className="nombre">Montant</th><th>Remboursement</th></tr></thead>
            <tbody>
              {retours.map((r) => (
                <tr key={r.id} onClick={() => setOuverte(r.vente_id)}>
                  <td><strong>{r.numero}</strong></td>
                  <td>{formatDateHeure(r.cree_le)}</td>
                  <td>{numeroVente[r.vente_id] ?? '—'}</td>
                  <td>{r.motif}</td>
                  <td className="nombre">{montant(r.montant)}</td>
                  <td>{r.remboursement ? (r.remboursement.mode === 'avoir' ? <Badge ton="bleu">Avoir / échange</Badge> : <Badge ton="orange">{MODES_PAIEMENT[r.remboursement.mode] ?? r.remboursement.mode}</Badge>) : <Badge>Non encaissé</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {vue === 'ventes' && donnees && !ventes.length && <Vide titre="Aucune vente" texte="Aucune vente ne correspond à ces filtres." />}
      {vue === 'ventes' && ventes.length > 0 && (
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
