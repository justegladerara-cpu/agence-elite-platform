import React, { useState } from 'react';
import { useDonnees, useEspace } from '../../noyau/espace.jsx';
import { dateLocale, formatDate, formatDateHeure, formatQuantite, MODES_PAIEMENT } from '../../noyau/format.js';
import { lireParametres } from '../../noyau/routes.js';
import { Badge, Bouton, Champ, Chargement, EnTete, Erreur, Modale, ModaleMotif, Onglets, Recherche, StatCard, Vide } from '../../ui/composants.jsx';
import { nomLieu } from '../../noyau/lieux.js';
import { RegroupementVentes } from './Regroupement.jsx';
import './ventes.css';
import { ModaleRecu } from '../recus/Recu.jsx';
import { exporterCsv } from '../../ui/communs.jsx';
import { mesCaisses } from '../caisse/mesCaisses.js';
import { libelleRaison } from '../caisse/offerts.js';

const PERIODES = [['jour', 'Aujourd’hui'], ['semaine', '7 jours'], ['mois', '30 jours'], ['tout', 'Tout']];
const DEBUTS = { jour: 0, semaine: -6, mois: -29 };

const ORIGINES = { caisse: 'Caisse', facture: 'Facture', boutique: 'Boutique en ligne', restaurant: 'Restaurant', hotel: 'Hôtel', abonnement: 'Abonnement' };

export function BadgePaiement({ vente }) {
  if (vente.statut === 'annulee') return <Badge ton="rouge">Annulée</Badge>;
  if (vente.statut_paiement === 'payee') return <Badge ton="vert">Payée</Badge>;
  if (vente.statut_paiement === 'partielle') return <Badge ton="orange">Payée en partie</Badge>;
  return <Badge ton="orange">Pas encore payée</Badge>;
}

function debutPeriode(periode) {
  if (periode === 'tout') return null;
  const debut = new Date(`${dateLocale(DEBUTS[periode])}T00:00:00`);
  return debut.toISOString();
}

// « Sur le compte de la maison » (migration 20261024040000) : une vente à crédit consommée par des proches du patron.
// Plus de paiement attendu, aucun argent encaissé ; elle compte comme un offert dans les rapports.
export const POUR_QUI_MAISON = ['Amis du patron', 'Famille du patron', 'Le patron', 'Personnel', 'Invités de la maison'];

export function ModaleCompteMaison({ vente, onFermer, onFait }) {
  const { api, montant } = useEspace();
  const reste = Number(vente.total) - Number(vente.montant_paye);
  const [pourQui, setPourQui] = useState(POUR_QUI_MAISON[0]);
  const [autre, setAutre] = useState('');
  const [note, setNote] = useState('');
  const [erreur, setErreur] = useState('');
  const [chargement, setChargement] = useState(false);
  const qui = pourQui === 'autre' ? autre.trim() : pourQui;
  const valider = async (e) => {
    e.preventDefault();
    setChargement(true);
    setErreur('');
    try {
      await api.rpc('mettre_sur_compte_maison', { p_vente_id: vente.id, p_pour_qui: qui, p_note: note || null });
      onFait();
    } catch (err) {
      setErreur(err.message);
      setChargement(false);
    }
  };
  return (
    <Modale titre={`${vente.numero} : sur le compte de la maison`} onFermer={onFermer}>
      <form className="formulaire" onSubmit={valider}>
        <p><strong>{montant(reste)}</strong> ne seront plus attendus. Aucun argent n’entre dans la caisse : c’est un cadeau de la maison.</p>
        <Champ libelle="Qui a consommé ?">
          <select value={pourQui} onChange={(e) => setPourQui(e.target.value)}>
            {POUR_QUI_MAISON.map((x) => <option key={x} value={x}>{x}</option>)}
            <option value="autre">Autre (écrire)</option>
          </select>
        </Champ>
        {pourQui === 'autre' && <Champ libelle="Écrire le nom"><input value={autre} onChange={(e) => setAutre(e.target.value)} maxLength={80} required autoFocus /></Champ>}
        <Champ libelle="Petit mot (facultatif)"><input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="Ex. : anniversaire de M. Destin" /></Champ>
        <p className="texte-doux">Vous pourrez revenir en arrière depuis le détail de la vente.</p>
        <Erreur message={erreur} />
        <div className="actions">
          <Bouton type="button" onClick={onFermer}>Retour</Bouton>
          <Bouton type="submit" variante="principal" chargement={chargement} disabled={!qui}>Mettre sur le compte de la maison</Bouton>
        </div>
      </form>
    </Modale>
  );
}

export function ModaleEncaissement({ vente, sessions, onFermer, onFait, onMaison }) {
  const { api, montant, peut } = useEspace();
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
        {onMaison && peut('cloture.cloturer') && (
          <p className="texte-doux">Personne ne paiera (amis du patron, famille…) ? <button type="button" className="lien" onClick={onMaison}>Mettre sur le compte de la maison</button></p>
        )}
        <div className="actions">
          <Bouton type="button" onClick={onFermer}>Retour</Bouton>
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
        <p className="texte-doux">Choisissez uniquement les articles réellement rapportés. Les quantités seront remises dans le stock du lieu d’origine.</p>
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
        {mode === 'especes' && !sessions.some((session) => session.hub_id === vente.hub_id) && <Erreur message="Ouvrez la caisse du lieu d’origine pour rembourser en espèces." />}
        <Erreur message={erreur} />
        <div className="actions"><Bouton type="button" onClick={onFermer}>Annuler</Bouton><Bouton type="submit" variante="principal" chargement={chargement} disabled={!selection.length || !motif.trim()}>Enregistrer le retour</Bouton></div>
      </form>
    </Modale>
  );
}

// Qui, où, quand : caisse, personne qui a encaissé (le patron sur la caisse d'une caissière est nommé), ticket Z,
// serveur, offerts et pourboire.
function InfosVente({ vente, infos }) {
  const { montant, multiHub, nouvelleVersion } = useEspace();
  const lignes = [
    ['Encaissée par', infos.caissier ? `${infos.caissier}${infos.vendu_par_autre ? ` (le patron, sur la caisse de ${infos.caisse_tenue_par})` : ''}` : null],
    ['Servi par', vente.servi_par],
    ['Caisse', [infos.point_de_vente, multiHub ? nomLieu(infos.hub) : null].filter(Boolean).join(' · ') || null],
    ['Caisse ouverte le', infos.caisse_ouverte_le ? formatDateHeure(infos.caisse_ouverte_le) : null],
    ['Ticket Z', infos.ticket_z ? `${infos.ticket_z.numero} (caisse fermée le ${formatDateHeure(infos.ticket_z.cloturee_le)})` : (vente.session_caisse_id ? 'Caisse encore ouverte' : null)],
    // Plus aucun pourboire dans la nouvelle version (The Dream, 2026-10-25).
    ['Pourboire', infos.pourboire && !nouvelleVersion ? `${montant(infos.pourboire.montant)} · ${MODES_PAIEMENT[infos.pourboire.mode] ?? infos.pourboire.mode}${infos.pourboire.serveur ? ` · ${infos.pourboire.serveur}` : ''}` : null],
  ].filter(([, v]) => v);
  return (
    <>
      <dl className="infos-vente">
        {lignes.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
      </dl>
      {infos.compte_maison && (
        <div className="encart vert">
          <strong>Sur le compte de la maison : {montant(infos.compte_maison.montant)}</strong>
          <span className="bloc">Pour : {infos.compte_maison.pour_qui}{infos.compte_maison.note ? ` · ${infos.compte_maison.note}` : ''}</span>
          <small className="texte-doux bloc">Décidé par {infos.compte_maison.par} le {formatDateHeure(infos.compte_maison.le)} · aucun paiement attendu</small>
        </div>
      )}
      {infos.offerts?.length > 0 && (
        <div className="encart">
          <strong>Offert</strong>
          <ul className="liste-offerts">
            {infos.offerts.map((o, i) => <li key={i}>{formatQuantite(o.quantite)} × {o.libelle} ({montant(o.valeur)}) : {libelleRaison(o.raison)}{o.precision ? `, ${o.precision}` : ''}</li>)}
          </ul>
        </div>
      )}
    </>
  );
}

export function DetailVente({ venteId, onFermer, onChange }) {
  const { api, montant, peut, notifier, utilisateur } = useEspace();
  const patron = peut('etablissement.modifier') && peut('cloture.cloturer');
  const { donnees, chargement, erreur, recharger } = useDonnees(async () => {
    const [[vente], lignes, paiements, retours] = await Promise.all([
      api.lire('ventes', { eq: { id: venteId } }),
      api.lire('lignes_vente', { eq: { vente_id: venteId } }),
      peut('paiements.lire') ? api.lire('paiements', { eq: { vente_id: venteId }, ordre: ['cree_le'] }) : [],
      api.rpc('historique_retours_vente', { p_vente_id: venteId }).catch(() => []),
    ]);
    const sessions = mesCaisses(await api.lire('sessions_caisse', { eq: { etablissement_id: vente.etablissement_id, statut: 'ouverte' } }), utilisateur);
    const contact = vente.contact_id ? (await api.lire('contacts', { eq: { id: vente.contact_id } }))[0] : null;
    // Qui a encaissé, quelle caisse, quel ticket Z, offerts, pourboire, essai (migration 20261023200157).
    const infos = await api.rpc('infos_vente', { p_vente_id: venteId }).catch(() => null);
    return { vente, lignes, paiements, retours, sessions, contact, infos };
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
        const { vente, lignes, paiements, retours, sessions, contact, infos } = donnees;
        const reste = vente.total - vente.montant_paye;
        return (
          <div className="detail">
            <div className="detail-tete">
              <div>
                <BadgePaiement vente={vente} />
                <p className="texte-doux">{formatDateHeure(vente.cree_le)}{contact ? ` · ${contact.nom}` : ' · Client de passage'}{vente.servi_par ? ` · servi par ${vente.servi_par}` : ''}</p>
              </div>
              <div className="detail-total">
                <span>Total</span>
                <strong>{montant(vente.total)}</strong>
              </div>
            </div>
            {infos?.essai && (
              <div className="encart">{infos.essai.efface_le
                ? `Vente d’essai effacée des écrans le ${formatDateHeure(infos.essai.efface_le)} : elle ne compte nulle part.`
                : `Vente d’essai (marquée par ${infos.essai.marque_par} le ${formatDateHeure(infos.essai.marque_le)}) : elle est rangée dans l’onglet « Essais ».`}</div>
            )}
            {vente.statut === 'annulee' && (
              <div className="encart rouge">Annulée le {formatDateHeure(vente.annulee_le)}{infos?.annulee_par ? ` par ${infos.annulee_par}` : ''} : {vente.motif_annulation}</div>
            )}
            {infos && <InfosVente vente={vente} infos={infos} />}
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
              {vente.statut === 'validee' && reste > 0 && peut('cloture.cloturer') && !infos?.compte_maison && (
                <Bouton icone="etoile" onClick={() => setAction({ type: 'maison' })}>Sur le compte de la maison</Bouton>
              )}
              {infos?.compte_maison && peut('cloture.cloturer') && (
                <Bouton onClick={() => api.rpc('retirer_du_compte_maison', { p_vente_id: vente.id }).then(() => apres('Retirée du compte de la maison : le reste est de nouveau à payer')).catch((err) => notifier(err.message, 'erreur'))}>Retirer du compte de la maison</Bouton>
              )}
              {infos?.essai && patron && (infos.essai.efface_le
                ? <Bouton onClick={() => api.rpc('effacer_vente_essai', { p_vente_id: vente.id, p_effacer: false }).then(() => apres('Essai remis dans l’onglet « Essais »')).catch((err) => notifier(err.message, 'erreur'))}>Remettre cet essai</Bouton>
                : <Bouton variante="danger" icone="fermer" onClick={() => setAction({ type: 'effacer' })}>Effacer cet essai</Bouton>)}
              {vente.statut === 'validee' && peut('ventes.annuler') && (
                <Bouton variante="danger" onClick={() => setAction({ type: 'annuler' })}>Annuler la vente</Bouton>
              )}
              {peut('ventes.annuler') && peut('cloture.cloturer') && !infos?.essai?.efface_le && (infos?.essai
                ? <Bouton onClick={() => api.rpc('marquer_vente_essai', { p_vente_id: vente.id, p_essai: false }).then(() => apres('Ce n’est plus une vente d’essai')).catch((err) => notifier(err.message, 'erreur'))}>Ce n’est pas un essai</Bouton>
                : infos && <Bouton onClick={() => setAction({ type: 'essai' })}>C’était un essai</Bouton>)}
              {vente.statut === 'validee' && peut('ventes.retourner') && lignes.some((ligne) => Number(ligne.quantite) > retours.flatMap((retour) => retour.lignes ?? []).filter((retour) => retour.ligne_id === ligne.id).reduce((s, retour) => s + Number(retour.quantite), 0)) && (
                <Bouton onClick={() => setAction({ type: 'retour' })}>Retour / échange</Bouton>
              )}
            </div>
            {action?.type === 'encaisser' && (
              <ModaleEncaissement vente={vente} sessions={sessions} onFermer={() => setAction(null)} onFait={() => apres('Paiement enregistré')}
                onMaison={() => setAction({ type: 'maison' })} />
            )}
            {action?.type === 'maison' && (
              <ModaleCompteMaison vente={vente} onFermer={() => setAction(null)} onFait={() => apres('Mise sur le compte de la maison : plus rien à payer')} />
            )}
            {action?.type === 'effacer' && (
              <Modale titre={`Effacer l’essai ${vente.numero} ?`} onFermer={() => setAction(null)}>
                <p>Cette vente d’essai disparaît de toutes les listes et de tous les chiffres.</p>
                <p className="texte-doux">Par sécurité, elle reste gardée à part : vous pouvez la remettre plus tard (Ventes › Essais › « Voir les essais effacés »).</p>
                <div className="actions">
                  <Bouton onClick={() => setAction(null)}>Retour</Bouton>
                  <Bouton variante="danger" onClick={() => api.rpc('effacer_vente_essai', { p_vente_id: vente.id, p_effacer: true }).then(() => { apres('Essai effacé'); onFermer?.(); }).catch((err) => notifier(err.message, 'erreur'))}>Oui, effacer</Bouton>
                </div>
              </Modale>
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
            {action?.type === 'essai' && (
              <Modale titre={`${vente.numero} : vente d’essai ?`} onFermer={() => setAction(null)}>
                <p>{vente.statut === 'validee'
                  ? 'La vente sera annulée (le stock revient, les paiements sont annulés), puis cachée de la liste des ventes. Un ticket Z déjà tiré garde ses chiffres.'
                  : 'La vente sera cachée de la liste des ventes.'}</p>
                <p className="texte-doux">Rien n’est effacé : l’onglet « Essais » de la liste des ventes la garde.</p>
                <div className="actions">
                  <Bouton onClick={() => setAction(null)}>Retour</Bouton>
                  <Bouton variante="principal" onClick={() => api.rpc('marquer_vente_essai', { p_vente_id: vente.id, p_essai: true }).then(() => apres('Vente marquée comme essai')).catch((err) => notifier(err.message, 'erreur'))}>Oui, c’était un essai</Bouton>
                </div>
              </Modale>
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
// integre : la page est affichée à l'intérieur du Centre des ventes (nouvelle version) : pas de deuxième en-tête.
export default function Ventes({ sousRoute, integre = false, vueInitiale, filtreInitial }) {
  const { api, etablissement, montant, hubs, hub, multiHub, peut, utilisateur } = useEspace();
  const etab = etablissement.id;
  // Une personne qui tient une caisse suit d'abord SES ventes ; le responsable voit tout le monde par défaut.
  const responsable = peut('cloture.cloturer') || !peut('caisse.utiliser');
  const patron = peut('etablissement.modifier') && peut('cloture.cloturer');
  const hubFiltre = multiHub ? hub?.id ?? null : null;
  const nomHub = (id) => nomLieu(hubs.find((h) => h.id === id)?.nom) ?? '—';
  const p = lireParametres();
  const plage = p.get('du') && p.get('au') ? { du: p.get('du'), au: p.get('au') } : null;
  const [vue, setVue] = useState(vueInitiale ?? (p.get('vue') === 'retours' ? 'retours' : 'ventes'));
  const [periode, setPeriode] = useState(plage ? 'plage' : (p.get('paiement') ? 'tout' : 'jour'));
  const [filtre, setFiltre] = useState(filtreInitial ?? (p.get('paiement') ? 'credit' : p.get('statut') === 'annulee' ? 'annulees' : 'toutes'));
  const [recherche, setRecherche] = useState(p.get('q') ?? '');
  const [origine, setOrigine] = useState(p.get('origine') ?? '');
  const [vendeur, setVendeur] = useState(p.get('vendeur') ?? (responsable ? '' : utilisateur?.id ?? ''));
  const [voirEffaces, setVoirEffaces] = useState(false);
  const [selection, setSelection] = useState([]);
  const [ouverte, setOuverte] = useState((sousRoute ?? '').split('/')[0] || null);
  const bornes = () => {
    if (periode === 'plage') return { gte: new Date(`${plage.du}T00:00:00`).toISOString(), lte: new Date(`${plage.au}T23:59:59.999`).toISOString() };
    const debut = debutPeriode(periode);
    return { gte: debut, lte: null };
  };
  // Le patron choisit la personne dont il suit les ventes (caissières, serveurs qui encaissent).
  const { donnees: options } = useDonnees(
    () => (responsable ? api.rpc('cockpit_options', { p_etablissement_id: etab }).catch(() => null) : Promise.resolve(null)),
    [etab, responsable],
  );
  const personnes = options?.collaborateurs ?? [];
  const { donnees, chargement, erreur, recharger } = useDonnees(async () => {
    const { gte, lte } = bornes();
    const [ventes, contacts, retours, essais, maison] = await Promise.all([
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
      // Ventes d'essai (migration 20261023200157) : cachées de la liste sauf l'onglet « Essais » ; effacées
      // (migration 20261024040000) : cachées partout, sauf « Voir les essais effacés » pour le patron.
      api.lire('ventes_essais', { eq: { etablissement_id: etab } }).catch(() => []),
      api.lire('ventes_compte_maison', { eq: { etablissement_id: etab } }).catch(() => []),
    ]);
    return {
      ventes, retours,
      essais: new Set(essais.filter((e) => !e.efface_le).map((e) => e.vente_id)),
      effaces: new Set(essais.filter((e) => e.efface_le).map((e) => e.vente_id)),
      maison: new Set((maison ?? []).filter((m) => !m.annule_le).map((m) => m.vente_id)),
      contacts: Object.fromEntries(contacts.map((c) => [c.id, c.nom])),
    };
  }, [etab, periode, hubFiltre, origine, vendeur, vue]);

  const texte = recherche.trim().toLowerCase();
  const nomPersonne = (id) => personnes.find((x) => x.id === id)?.nom ?? (id === utilisateur?.id ? 'Moi' : null);
  const ventes = (donnees?.ventes ?? []).filter((v) => {
    if (filtre === 'essais' && voirEffaces) return donnees.effaces.has(v.id);
    if (donnees.effaces.has(v.id)) return false;
    if (donnees.essais.has(v.id) !== (filtre === 'essais')) return false;
    if (filtre === 'credit' && !(v.statut === 'validee' && v.montant_paye < v.total)) return false;
    if (filtre === 'annulees' && v.statut !== 'annulee') return false;
    if (!texte) return true;
    return v.numero.toLowerCase().includes(texte) || (donnees.contacts[v.contact_id] ?? '').toLowerCase().includes(texte)
      || (v.servi_par ?? '').toLowerCase().includes(texte);
  });
  const validees = ventes.filter((v) => v.statut === 'validee');
  const total = validees.reduce((s, v) => s + Number(v.total), 0);
  const attente = validees.reduce((s, v) => s + Math.max(0, Number(v.total) - Number(v.montant_paye)), 0);
  const numeroVente = Object.fromEntries((donnees?.ventes ?? []).map((v) => [v.id, v.numero]));
  const retours = (donnees?.retours ?? []).filter((r) => !texte || `${r.numero} ${r.motif} ${numeroVente[r.vente_id] ?? ''}`.toLowerCase().includes(texte));
  const ongletsPeriode = plage ? [...PERIODES, ['plage', `${formatDate(plage.du)} → ${formatDate(plage.au)}`]] : PERIODES;
  const filtresActifs = [origine && `Origine : ${ORIGINES[origine] ?? origine}`].filter(Boolean);
  // Sélection multiple : total, export et impression des ventes cochées.
  const choisies = ventes.filter((v) => selection.includes(v.id));
  const toutesCochees = ventes.length > 0 && ventes.every((v) => selection.includes(v.id));
  const cocher = (id, oui) => setSelection((liste) => (oui ? [...new Set([...liste, id])] : liste.filter((x) => x !== id)));
  const nbEssais = donnees ? [...donnees.essais].filter((id) => donnees.ventes.some((v) => v.id === id)).length : 0;
  const nbEffaces = donnees ? [...donnees.effaces].filter((id) => donnees.ventes.some((v) => v.id === id)).length : 0;
  const colonnesExport = [
    { libelle: 'Numéro', valeur: (v) => v.numero },
    { libelle: 'Date', valeur: (v) => formatDateHeure(v.cree_le) },
    ...(multiHub ? [{ libelle: 'Lieu', valeur: (v) => nomHub(v.hub_id) }] : []),
    { libelle: 'Origine', valeur: (v) => ORIGINES[v.origine] ?? v.origine ?? '' },
    { libelle: 'Client', valeur: (v) => donnees.contacts[v.contact_id] ?? '' },
    { libelle: 'Servi par', valeur: (v) => v.servi_par ?? '' },
    { libelle: 'Sous-total', valeur: (v) => v.sous_total },
    { libelle: 'Remise', valeur: (v) => v.remise },
    { libelle: 'Total', valeur: (v) => v.total },
    { libelle: 'Payé', valeur: (v) => v.montant_paye },
    { libelle: 'État', valeur: (v) => (v.statut === 'annulee' ? 'Annulée' : donnees.maison.has(v.id) ? 'Compte de la maison' : v.montant_paye >= v.total ? 'Payée' : 'En attente de paiement') },
  ];
  const choixPersonne = vendeur === utilisateur?.id ? 'moi' : vendeur || 'tous';

  return (
    <div className={integre ? 'page-integree' : 'page'}>
      {!integre && (
      <EnTete
        titre="Ventes"
        sousTitre={vue === 'retours'
          ? `${retours.length} retour(s) · ${montant(retours.reduce((s, r) => s + Number(r.montant), 0))}`
          : `${multiHub ? `${hub ? nomLieu(hub.nom) : 'Tous les lieux'} · ` : ''}${vendeur ? `${nomPersonne(vendeur) ?? 'Une personne'} · ` : ''}${validees.length} vente(s) · ${montant(total)}`}
      >
        {vue === 'ventes' && ventes.length > 0 && (
          <Bouton icone="telecharger" onClick={() => exporterCsv(`ventes-${dateLocale()}.csv`, colonnesExport, ventes)}>
            Exporter
          </Bouton>
        )}
      </EnTete>
      )}
      <Onglets onglets={[['ventes', 'Ventes'], ['retours', 'Retours et remboursements']]} actif={vue} onChange={setVue} />
      <div className="filtres">
        <Onglets onglets={ongletsPeriode} actif={periode} onChange={setPeriode} />
        {vue === 'ventes' && <Onglets onglets={[['toutes', 'Toutes'], ['credit', 'En attente de paiement'], ['annulees', 'Annulées'], ...(nbEssais || nbEffaces ? [['essais', `Essais (${nbEssais})`]] : [])]} actif={filtre} onChange={(x) => { setFiltre(x); setVoirEffaces(false); }} />}
        {vue === 'ventes' && utilisateur?.id && (responsable && personnes.length > 1 ? (
          <label className="filtre-personne">
            <span className="lecteur-ecran">Ventes de</span>
            <select aria-label="Ventes de" value={choixPersonne} onChange={(e) => { const x = e.target.value; setVendeur(x === 'tous' ? '' : x === 'moi' ? utilisateur.id : x); setSelection([]); }}>
              <option value="tous">Tout le monde</option>
              <option value="moi">Mes ventes</option>
              {personnes.filter((x) => x.id !== utilisateur.id).map((x) => <option key={x.id} value={x.id}>{x.nom}</option>)}
            </select>
          </label>
        ) : (
          <Onglets onglets={[['moi', 'Mes ventes'], ['tous', 'Tout le monde']]} actif={vendeur === utilisateur.id ? 'moi' : 'tous'}
            onChange={(x) => { setVendeur(x === 'moi' ? utilisateur.id : ''); setSelection([]); }} />
        ))}
        <Recherche valeur={recherche} onChange={setRecherche} placeholder={vue === 'retours' ? 'Numéro ou motif' : 'Numéro, client ou serveur'} />
        {filtresActifs.length > 0 && (
          <Bouton icone="fermer" onClick={() => setOrigine('')}>{filtresActifs.join(' · ')}</Bouton>
        )}
      </div>
      {chargement && !donnees && <Chargement />}
      <Erreur message={erreur} />
      {vue === 'ventes' && donnees && filtre !== 'essais' && validees.length > 0 && (
        <div className="grille-stats ventes-chiffres">
          <StatCard icone="ventes" libelle="Total vendu" valeur={montant(total)} detail={`${validees.length} vente(s)`} />
          <StatCard icone="panier" libelle="Dépense moyenne par client" valeur={montant(Math.round(total / validees.length))} />
          <StatCard icone="horloge" libelle="En attente de paiement" valeur={montant(attente)} ton={attente > 0 ? 'attention' : undefined}
            detail={attente > 0 ? `${validees.filter((v) => v.montant_paye < v.total).length} vente(s)` : 'Tout est payé'} onClick={attente > 0 ? () => setFiltre('credit') : undefined} />
          <StatCard icone="fermer" libelle="Annulées" valeur={String(ventes.filter((v) => v.statut === 'annulee').length)} onClick={() => setFiltre('annulees')} />
        </div>
      )}
      {vue === 'ventes' && donnees && filtre !== 'essais' && validees.length > 1 && (
        <RegroupementVentes ventes={validees} nomPersonne={nomPersonne} nomClient={(id) => donnees.contacts[id]}
          onPersonne={responsable ? (id) => { setVendeur(id); setSelection([]); } : null} onRecherche={setRecherche} />
      )}
      {vue === 'ventes' && filtre === 'essais' && patron && nbEffaces > 0 && (
        <p className="texte-doux">
          <button type="button" className="lien" onClick={() => setVoirEffaces(!voirEffaces)}>{voirEffaces ? 'Revenir aux essais' : `Voir les essais effacés (${nbEffaces})`}</button>
        </p>
      )}
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
      {vue === 'ventes' && donnees && !ventes.length && <Vide titre="Aucune vente" texte={filtre === 'essais' ? 'Aucune vente d’essai.' : 'Aucune vente ne correspond à ces filtres.'} />}
      {vue === 'ventes' && choisies.length > 0 && (
        <div className="barre-selection" role="region" aria-label="Ventes sélectionnées">
          <strong>{choisies.length} vente(s) sélectionnée(s) · {montant(choisies.filter((v) => v.statut === 'validee').reduce((t, v) => t + Number(v.total), 0))}</strong>
          <span className="texte-doux">dont en attente {montant(choisies.filter((v) => v.statut === 'validee').reduce((t, v) => t + Math.max(0, v.total - v.montant_paye), 0))}</span>
          <Bouton icone="telecharger" onClick={() => exporterCsv(`ventes-selection-${dateLocale()}.csv`, colonnesExport, choisies)}>Exporter la sélection</Bouton>
          <Bouton onClick={() => setSelection([])}>Tout décocher</Bouton>
        </div>
      )}
      {vue === 'ventes' && ventes.length > 0 && (
        <div className="tableau-conteneur">
          <table className="tableau cliquable">
            <thead>
              <tr>
                <th className="cellule-case">
                  <input type="checkbox" aria-label="Sélectionner toutes les ventes affichées" checked={toutesCochees}
                    onChange={(e) => setSelection(e.target.checked ? ventes.map((v) => v.id) : [])} />
                </th>
                <th>N°</th><th>Date</th>{multiHub && <th>Lieu</th>}<th>Client</th><th className="nombre">Total</th><th className="nombre">Reste</th><th>État</th></tr>
            </thead>
            <tbody>
              {ventes.map((v) => (
                <tr key={v.id} onClick={() => setOuverte(v.id)}>
                  <td className="cellule-case" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" aria-label={`Sélectionner ${v.numero}`} checked={selection.includes(v.id)} onChange={(e) => cocher(v.id, e.target.checked)} />
                  </td>
                  <td><strong className="ventes-numero">{v.numero}</strong>{v.origine && v.origine !== 'caisse' && <><br /><small className="texte-doux">{ORIGINES[v.origine] ?? v.origine}</small></>}</td>
                  <td>{formatDateHeure(v.cree_le)}</td>
                  {multiHub && <td>{nomHub(v.hub_id)}</td>}
                  <td>{donnees.contacts[v.contact_id] ?? '—'}{v.servi_par && <><br /><small className="texte-doux">servi par {v.servi_par}</small></>}</td>
                  <td className="nombre">{montant(v.total)}</td>
                  <td className="nombre">{v.statut === 'validee' && v.total > v.montant_paye ? montant(v.total - v.montant_paye) : '—'}</td>
                  <td>{donnees.maison.has(v.id) ? <Badge ton="vert">Maison</Badge> : <BadgePaiement vente={v} />}{(donnees.essais.has(v.id) || donnees.effaces.has(v.id)) && <> <Badge>{donnees.effaces.has(v.id) ? 'Effacé' : 'Essai'}</Badge></>}</td>
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
