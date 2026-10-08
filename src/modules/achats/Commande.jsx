import { useState } from 'react';
import { useDonnees, useEspace } from '../../noyau/espace.jsx';
import { dateLocale, formatDate, formatDateHeure, formatQuantite, MODES_PAIEMENT } from '../../noyau/format.js';
import { Badge, Bouton, Champ, EmptyState, Erreur, MenuActions, Modale, ModaleMotif, PageHeader, Section, Squelette, StatCard } from '../../ui/composants.jsx';
import { PiecesJointes } from '../../ui/communs.jsx';
import { etatCommande, resteAPayer } from './commun.js';

function ModaleApprobation({ commande, fournisseurs, onFermer, onFait }) {
  const { api } = useEspace();
  const [fournisseur, setFournisseur] = useState(commande.fournisseur_id ?? '');
  const [erreur, setErreur] = useState('');
  const valider = async (e) => {
    e.preventDefault();
    try {
      await api.rpc('changer_statut_commande_achat', { p_commande_id: commande.id, p_statut: 'brouillon', p_fournisseur_id: fournisseur });
      onFait();
    } catch (err) {
      setErreur(err.message);
    }
  };
  return (
    <Modale titre={`Approuver ${commande.numero}`} onFermer={onFermer}>
      <form className="formulaire" onSubmit={valider}>
        <p className="texte-doux">La demande devient une commande en brouillon (numéro BC-). Le demandeur est prévenu.</p>
        <Champ libelle="Fournisseur">
          <select value={fournisseur} onChange={(e) => setFournisseur(e.target.value)} required>
            <option value="">— Choisir</option>
            {fournisseurs.map((f) => <option key={f.id} value={f.id}>{f.societe || f.nom}</option>)}
          </select>
        </Champ>
        <Erreur message={erreur} />
        <div className="actions">
          <Bouton type="button" onClick={onFermer}>Retour</Bouton>
          <Bouton type="submit" variante="principal">Approuver</Bouton>
        </div>
      </form>
    </Modale>
  );
}

function ModaleReception({ commande, lignes, onFermer, onFait }) {
  const { api, montant } = useEspace();
  const restantes = lignes.filter((l) => Number(l.quantite_recue) < Number(l.quantite));
  const [q, setQ] = useState(() => Object.fromEntries(restantes.map((l) => [l.id, { quantite: String(Number(l.quantite) - Number(l.quantite_recue)), cout: String(l.cout_unitaire) }])));
  const [bl, setBl] = useState('');
  const [notes, setNotes] = useState('');
  const [erreur, setErreur] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const total = restantes.reduce((t, l) => t + (Number(q[l.id].quantite) || 0) * (Number(q[l.id].cout) || 0), 0);
  const valider = async (e) => {
    e.preventDefault();
    setEnvoi(true);
    setErreur('');
    try {
      await api.rpc('receptionner_commande_achat', {
        p_commande_id: commande.id,
        p_lignes: restantes.map((l) => ({ ligne_id: l.id, quantite: q[l.id].quantite || 0, cout_unitaire: q[l.id].cout })),
        p_bon_livraison: bl || null, p_notes: notes || null,
      });
      onFait();
    } catch (err) {
      setErreur(err.message);
      setEnvoi(false);
    }
  };
  return (
    <Modale titre={`Réceptionner ${commande.numero}`} onFermer={onFermer} large>
      <form className="formulaire" onSubmit={valider}>
        <p className="texte-doux">Comptez ce qui est réellement arrivé. Une réception est définitive : une erreur se corrige ensuite par un ajustement de stock.</p>
        <div className="tableau-conteneur">
          <table className="tableau">
            <thead><tr><th>Article</th><th className="nombre">Commandé</th><th className="nombre">Déjà reçu</th><th className="nombre">Reçu maintenant</th><th className="nombre">Coût unitaire</th></tr></thead>
            <tbody>
              {restantes.map((l) => (
                <tr key={l.id}>
                  <td>{l.libelle}</td>
                  <td className="nombre">{formatQuantite(l.quantite)}</td>
                  <td className="nombre">{formatQuantite(l.quantite_recue)}</td>
                  <td className="nombre">
                    <input type="number" min="0" max={Number(l.quantite) - Number(l.quantite_recue)} step="any" inputMode="decimal" value={q[l.id].quantite}
                      onChange={(e) => setQ({ ...q, [l.id]: { ...q[l.id], quantite: e.target.value } })} aria-label={`Quantité reçue ${l.libelle}`} />
                  </td>
                  <td className="nombre">
                    <input type="number" min="0" step="any" inputMode="decimal" value={q[l.id].cout}
                      onChange={(e) => setQ({ ...q, [l.id]: { ...q[l.id], cout: e.target.value } })} aria-label={`Coût ${l.libelle}`} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="grille-champs">
          <Champ libelle="N° du bon de livraison"><input value={bl} onChange={(e) => setBl(e.target.value)} maxLength={60} /></Champ>
          <Champ libelle="Remarque (manquants, casse…)"><input value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} /></Champ>
        </div>
        <p>Valeur reçue : <strong>{montant(Math.round(total * 100) / 100)}</strong></p>
        <Erreur message={erreur} />
        <div className="actions">
          <Bouton type="button" onClick={onFermer}>Retour</Bouton>
          <Bouton type="submit" variante="principal" icone="depot" chargement={envoi}>Valider la réception</Bouton>
        </div>
      </form>
    </Modale>
  );
}

function ModalePaiement({ commande, onFermer, onFait }) {
  const { api, montant } = useEspace();
  const plafond = Math.max(Number(commande.total), Number(commande.montant_recu)) - Number(commande.montant_paye);
  const [v, setV] = useState({ montant: String(resteAPayer(commande) || plafond), mode: 'virement', reference: '', date: dateLocale() });
  const [erreur, setErreur] = useState('');
  const valider = async (e) => {
    e.preventDefault();
    try {
      await api.rpc('payer_fournisseur', { p_commande_id: commande.id, p_montant: Number(v.montant), p_mode: v.mode, p_reference: v.reference || null, p_date: v.date });
      onFait();
    } catch (err) {
      setErreur(err.message);
    }
  };
  return (
    <Modale titre={`Payer ${commande.numero}`} onFermer={onFermer}>
      <form className="formulaire" onSubmit={valider}>
        <p className="texte-doux">Dû sur la marchandise reçue : <strong>{montant(resteAPayer(commande))}</strong>. Un acompte est possible jusqu’à {montant(plafond)}.</p>
        <div className="grille-champs">
          <Champ libelle="Montant"><input type="number" min="0" step="any" inputMode="decimal" value={v.montant} onChange={(e) => setV({ ...v, montant: e.target.value })} required /></Champ>
          <Champ libelle="Mode">
            <select value={v.mode} onChange={(e) => setV({ ...v, mode: e.target.value })}>
              {Object.entries(MODES_PAIEMENT).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </Champ>
          <Champ libelle="Date"><input type="date" value={v.date} onChange={(e) => setV({ ...v, date: e.target.value })} required /></Champ>
          <Champ libelle="Référence"><input value={v.reference} onChange={(e) => setV({ ...v, reference: e.target.value })} maxLength={80} /></Champ>
        </div>
        <Erreur message={erreur} />
        <div className="actions">
          <Bouton type="button" onClick={onFermer}>Annuler</Bouton>
          <Bouton type="submit" variante="principal">Enregistrer le paiement</Bouton>
        </div>
      </form>
    </Modale>
  );
}

export default function CommandeAchat({ commandeId, naviguer }) {
  const { api, etablissement, peut, notifier, montant, hubs, utilisateur } = useEspace();
  const [action, setAction] = useState(null);
  const [erreurAction, setErreurAction] = useState('');
  const { donnees, chargement, erreur, recharger } = useDonnees(async () => {
    const [commande] = await api.lire('commandes_achat', { eq: { id: commandeId } });
    if (!commande) throw new Error('Commande introuvable ou hors de vos Hubs');
    const [lignes, receptions, paiements, fournisseurs] = await Promise.all([
      api.lire('lignes_commande_achat', { eq: { commande_id: commandeId }, ordre: ['ordre'] }),
      api.lire('receptions_achat', { eq: { commande_id: commandeId }, ordre: ['recue_le', 'desc'] }).catch(() => []),
      api.lire('paiements_fournisseur', { eq: { commande_id: commandeId }, ordre: ['cree_le', 'desc'] }).catch(() => []),
      api.lire('contacts', { eq: { etablissement_id: etablissement.id }, dans: { type: ['fournisseur', 'les_deux'] }, ordre: ['nom'] }),
    ]);
    return { commande, lignes, receptions, paiements, fournisseurs };
  }, [commandeId]);
  if (chargement && !donnees) return <div className="page"><Squelette lignes={8} /></div>;
  if (erreur || !donnees) {
    return <div className="page"><EmptyState titre="Commande introuvable" texte={erreur} action={<Bouton onClick={() => naviguer('achats')}>Retour</Bouton>} /></div>;
  }
  const { commande: c, lignes, receptions, paiements, fournisseurs } = donnees;
  const fournisseur = fournisseurs.find((f) => f.id === c.fournisseur_id);
  const hubNom = hubs.find((h) => h.id === c.hub_id)?.nom;
  const gerer = peut('achats.gerer');
  const estDemandeur = c.demande_par === utilisateur?.id;
  const etat = etatCommande(c, dateLocale());
  const executer = async (rpc, params, message) => {
    setErreurAction('');
    try {
      await api.rpc(rpc, params);
      notifier(message);
      recharger();
    } catch (err) {
      setErreurAction(err.message);
    }
  };
  const fait = (message) => () => { setAction(null); notifier(message); recharger(); };
  const modifiable = (c.statut === 'brouillon' && gerer) || (c.statut === 'demande' && (gerer || (estDemandeur && peut('achats.demander'))));
  const annulable = ['demande', 'brouillon', 'envoyee'].includes(c.statut) && Number(c.montant_recu) === 0 && Number(c.montant_paye) === 0
    && (gerer || (c.statut === 'demande' && estDemandeur));
  return (
    <div className="page">
      <PageHeader
        titre={`${c.statut === 'demande' ? 'Demande' : 'Commande'} ${c.numero}`}
        sousTitre={[fournisseur?.societe || fournisseur?.nom, hubNom && `livraison ${hubNom}`].filter(Boolean).join(' · ') || undefined}
        fil={[{ libelle: 'Achats', href: '#/achats' }, { libelle: c.numero }]}
        badges={<Badge ton={etat[1]}>{etat[0]}</Badge>}
        actions={(
          <>
            {modifiable && <Bouton icone="parametres" onClick={() => naviguer(`achats/${c.id}/modifier`)}>Modifier</Bouton>}
            {gerer && c.statut === 'demande' && <Bouton variante="principal" icone="coche" onClick={() => setAction('approuver')}>Approuver</Bouton>}
            {gerer && c.statut === 'brouillon' && (
              <Bouton variante="principal" onClick={() => executer('changer_statut_commande_achat', { p_commande_id: c.id, p_statut: 'envoyee' }, 'Commande marquée envoyée au fournisseur')}>Marquer envoyée</Bouton>
            )}
            {peut('achats.recevoir') && ['envoyee', 'partielle'].includes(c.statut) && (
              <Bouton variante="principal" icone="depot" onClick={() => setAction('recevoir')}>Réceptionner</Bouton>
            )}
            {gerer && ['envoyee', 'partielle', 'recue'].includes(c.statut) && Math.max(Number(c.total), Number(c.montant_recu)) > Number(c.montant_paye) && (
              <Bouton icone="ventes" onClick={() => setAction('payer')}>Payer</Bouton>
            )}
            <MenuActions actions={[
              gerer && c.statut === 'envoyee' && Number(c.montant_recu) === 0 && { libelle: 'Repasser en brouillon', onClick: () => executer('changer_statut_commande_achat', { p_commande_id: c.id, p_statut: 'brouillon' }, 'Commande repassée en brouillon') },
              annulable && { libelle: c.statut === 'demande' && !estDemandeur ? 'Refuser la demande' : 'Annuler', danger: true, onClick: () => setAction('annuler') },
            ]} />
          </>
        )}
      />
      <Erreur message={erreurAction} />
      {c.statut === 'annulee' && <p className="encart">Annulée le {formatDateHeure(c.annulee_le)} : {c.motif_annulation}</p>}
      <div className="grille-stats">
        <StatCard icone="panier" libelle="Commandé" valeur={montant(c.total)} />
        <StatCard icone="depot" libelle="Reçu" valeur={montant(c.montant_recu)} />
        <StatCard icone="ventes" libelle="Payé" valeur={montant(c.montant_paye)} />
        <StatCard icone="echeance" libelle="Reste dû" valeur={montant(resteAPayer(c))} detail={c.echeance ? `échéance ${formatDate(c.echeance)}` : undefined} />
      </div>
      <Section titre="Articles">
        <div className="tableau-conteneur">
          <table className="tableau">
            <thead><tr><th>Article</th><th className="nombre">Commandé</th><th className="nombre">Reçu</th><th className="nombre">Coût unitaire</th><th className="nombre">Total</th></tr></thead>
            <tbody>
              {lignes.map((l) => (
                <tr key={l.id}>
                  <td>{l.libelle}</td>
                  <td className="nombre">{formatQuantite(l.quantite)}</td>
                  <td className="nombre">{Number(l.quantite_recue) >= Number(l.quantite) ? <Badge ton="vert">{formatQuantite(l.quantite_recue)}</Badge> : formatQuantite(l.quantite_recue)}</td>
                  <td className="nombre">{montant(l.cout_unitaire)}</td>
                  <td className="nombre">{montant(l.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <dl className="details">
          <div><dt>Date</dt><dd>{formatDate(c.date_commande)}</dd></div>
          {c.livraison_prevue && <div><dt>Livraison prévue</dt><dd>{formatDate(c.livraison_prevue)}</dd></div>}
          {c.reference_fournisseur && <div><dt>Réf. fournisseur</dt><dd>{c.reference_fournisseur}</dd></div>}
          {c.notes && <div><dt>Notes</dt><dd>{c.notes}</dd></div>}
        </dl>
      </Section>
      <div className="deux-colonnes">
        <Section titre="Réceptions">
          {!receptions.length && <p className="texte-doux">Rien reçu pour l’instant.</p>}
          <div className="liste-simple">
            {receptions.map((r) => (
              <div key={r.id} className="liste-ligne">
                <span><strong>{r.numero}</strong>{r.bon_livraison ? ` · BL ${r.bon_livraison}` : ''}<small className="texte-doux bloc">{formatDateHeure(r.recue_le)}{r.notes ? ` · ${r.notes}` : ''}</small></span>
                <strong>{montant(r.montant)}</strong>
              </div>
            ))}
          </div>
        </Section>
        <Section titre="Paiements fournisseur">
          {!paiements.length && <p className="texte-doux">Aucun paiement.</p>}
          <div className="liste-simple">
            {paiements.map((p) => (
              <div key={p.id} className={`liste-ligne ${p.statut === 'annule' ? 'barre' : ''}`}>
                <span><strong>{montant(p.montant)}</strong> · {MODES_PAIEMENT[p.mode]}<small className="texte-doux bloc">{formatDate(p.date_paiement)}{p.reference ? ` · ${p.reference}` : ''}{p.motif_annulation ? ` · annulé : ${p.motif_annulation}` : ''}</small></span>
                {p.statut === 'annule' ? <Badge>annulé</Badge> : gerer && (
                  <MenuActions actions={[{ libelle: 'Annuler ce paiement', danger: true, onClick: () => setAction({ paiement: p.id }) }]} />
                )}
              </div>
            ))}
          </div>
        </Section>
      </div>
      <PiecesJointes objetType="commande_achat" objetId={c.id} titre="Pièces jointes (proforma, bon de livraison, facture fournisseur)" peutAjouter={gerer} peutArchiver={gerer} />
      {action === 'approuver' && <ModaleApprobation commande={c} fournisseurs={fournisseurs.filter((f) => f.actif)} onFermer={() => setAction(null)} onFait={fait('Demande approuvée')} />}
      {action === 'recevoir' && <ModaleReception commande={c} lignes={lignes} onFermer={() => setAction(null)} onFait={fait('Réception enregistrée, stock mis à jour')} />}
      {action === 'payer' && <ModalePaiement commande={c} onFermer={() => setAction(null)} onFait={fait('Paiement fournisseur enregistré')} />}
      {action === 'annuler' && (
        <ModaleMotif titre={`Annuler ${c.numero}`} libelleAction="Annuler la commande" onFermer={() => setAction(null)}
          onValider={async (motif) => { await api.rpc('annuler_commande_achat', { p_commande_id: c.id, p_motif: motif }); notifier('Commande annulée'); recharger(); }} />
      )}
      {action?.paiement && (
        <ModaleMotif titre="Annuler le paiement" libelleAction="Annuler le paiement" onFermer={() => setAction(null)}
          onValider={async (motif) => { await api.rpc('annuler_paiement_fournisseur', { p_paiement_id: action.paiement, p_motif: motif }); notifier('Paiement annulé'); recharger(); }} />
      )}
    </div>
  );
}
