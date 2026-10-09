import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useDonnees, useEspace } from '../../noyau/espace.jsx';
import { dateLocale, formatDate, formatDateHeure, formatMontant, formatQuantite, MODES_PAIEMENT } from '../../noyau/format.js';
import {
  Badge, Bouton, Champ, EmptyState, Erreur, MenuActions, Modale, ModaleMotif, PageHeader, Section, Squelette,
} from '../../ui/composants.jsx';
import { PiecesJointes } from '../../ui/communs.jsx';
import { etatDocument, etatEcheances, ligneComptee, repartirEcheances, tauxRemise, TYPES_DOCUMENT, vrai } from './commun.js';

// Rendu A4 d'un devis, d'une facture ou d'un avoir : le même à l'écran et à l'impression.
export function FeuilleDocument({ complet }) {
  const { document: d, lignes: toutes, contact, identite, devise, parametres, vente, origine } = complet;
  const lignes = toutes.filter(ligneComptee);
  const options = toutes.filter((l) => !ligneComptee(l));
  const echeances = complet.echeances ?? [];
  const doc = identite?.documents ?? {};
  const m = (n) => formatMontant(n, devise);
  const avecTva = toutes.some((l) => Number(l.taux_tva) > 0);
  const titre = d.type === 'facture' && d.statut === 'brouillon' ? 'Facture (brouillon)' : TYPES_DOCUMENT[d.type];
  return (
    <article className="feuille-a4">
      <header className="feuille-tete">
        <div>
          {doc.logo_url && <img className="feuille-logo" src={doc.logo_url} alt="" />}
          <strong className="feuille-emetteur">{doc.nom_commercial}</strong>
          {doc.adresse && <div>{doc.adresse}</div>}
          {doc.telephone && <div>Tél. {doc.telephone}</div>}
          {doc.email && <div>{doc.email}</div>}
          {(doc.rccm || doc.niu) && <div className="feuille-petit">{[doc.rccm && `RCCM ${doc.rccm}`, doc.niu && `NIU ${doc.niu}`].filter(Boolean).join(' · ')}</div>}
        </div>
        <div className="feuille-titre">
          <h1>{titre}</h1>
          {d.numero && <div className="feuille-numero">{d.numero}</div>}
          <div>Date : {formatDate(d.date_document)}</div>
          {d.echeance && d.type !== 'avoir' && <div>{d.type === 'devis' ? 'Valable jusqu’au' : 'Échéance'} : {formatDate(d.echeance)}</div>}
          {origine && <div className="feuille-petit">{origine.type === 'devis' ? 'Selon devis' : 'Sur facture'} {origine.numero}</div>}
        </div>
      </header>
      <section className="feuille-client">
        <span className="feuille-petit">{d.type === 'devis' ? 'Destinataire' : 'Facturé à'}</span>
        <strong>{contact.societe || contact.nom}</strong>
        {contact.societe && <div>{contact.nom}</div>}
        {contact.adresse && <div>{contact.adresse}</div>}
        {contact.telephone && <div>{contact.telephone}</div>}
        {contact.identifiant_fiscal && <div className="feuille-petit">NIU {contact.identifiant_fiscal}</div>}
      </section>
      {d.objet && <p className="feuille-objet"><strong>Objet :</strong> {d.objet}</p>}
      {d.statut === 'annule' && <p className="feuille-annule">ANNULÉ — {d.motif_annulation}</p>}
      <table className="feuille-lignes">
        <thead>
          <tr>
            <th>Désignation</th><th className="nombre">Qté</th><th className="nombre">Prix unitaire</th><th className="nombre">Remise</th>
            {avecTva && <th className="nombre">TVA</th>}
            <th className="nombre">Total HT</th>
          </tr>
        </thead>
        <tbody>
          {lignes.map((l) => (
            <tr key={l.id}>
              <td>{l.libelle}{vrai(l.optionnelle) && <span className="feuille-petit"> (option retenue)</span>}{l.description && <div className="feuille-petit">{l.description}</div>}</td>
              <td className="nombre">{formatQuantite(l.quantite, l.unite)}</td>
              <td className="nombre">{m(l.prix_unitaire)}</td>
              <td className="nombre">{Number(l.remise) ? m(l.remise) : ''}</td>
              {avecTva && <td className="nombre">{Number(l.taux_tva) ? `${Number(l.taux_tva)} %` : ''}</td>}
              <td className="nombre">{m(l.total_ht)}</td>
            </tr>
          ))}
          {options.length > 0 && (
            <tr><td colSpan={avecTva ? 6 : 5} className="feuille-petit"><strong>Options proposées, non comprises dans le total</strong></td></tr>
          )}
          {options.map((l) => (
            <tr key={l.id} className="feuille-option">
              <td>{l.libelle} <span className="feuille-petit">(option)</span>{l.description && <div className="feuille-petit">{l.description}</div>}</td>
              <td className="nombre">{formatQuantite(l.quantite, l.unite)}</td>
              <td className="nombre">{m(l.prix_unitaire)}</td>
              <td className="nombre">{Number(l.remise) ? m(l.remise) : ''}</td>
              {avecTva && <td className="nombre">{Number(l.taux_tva) ? `${Number(l.taux_tva)} %` : ''}</td>}
              <td className="nombre">{m(l.total_ht)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="feuille-totaux">
        {avecTva && <div><span>Total HT</span><span>{m(d.total_ht)}</span></div>}
        {avecTva && <div><span>TVA</span><span>{m(d.total_tva)}</span></div>}
        <div className="feuille-total"><span>{avecTva ? 'Total TTC' : 'Total'}</span><span>{m(d.total_ttc)}</span></div>
        {vente && d.type === 'facture' && Number(vente.montant_paye) > 0 && (
          <>
            <div><span>Déjà payé</span><span>{m(vente.montant_paye)}</span></div>
            <div className="feuille-total"><span>Reste à payer</span><span>{m(vente.total - vente.montant_paye)}</span></div>
          </>
        )}
      </div>
      {echeances.length > 0 && d.type !== 'avoir' && (
        <table className="feuille-lignes">
          <thead><tr><th>Échéancier</th><th>Date</th><th className="nombre">Montant</th></tr></thead>
          <tbody>
            {echeances.map((e) => <tr key={e.id}><td>{e.libelle || `Échéance ${e.ordre}`}</td><td>{formatDate(e.date_echeance)}</td><td className="nombre">{m(e.montant)}</td></tr>)}
          </tbody>
        </table>
      )}
      {d.notes && <p className="feuille-notes">{d.notes}</p>}
      {(d.conditions || parametres?.conditions_paiement) && d.type !== 'avoir' && (
        <p className="feuille-petit"><strong>Conditions :</strong> {d.conditions || parametres.conditions_paiement}</p>
      )}
      <footer className="feuille-pied">
        {parametres?.mentions && <div>{parametres.mentions}</div>}
        {doc.pied && <div>{doc.pied}</div>}
      </footer>
    </article>
  );
}

function ZoneImpression({ children }) {
  useEffect(() => {
    document.body.classList.add('impression-a4');
    return () => document.body.classList.remove('impression-a4');
  }, []);
  return createPortal(<div className="zone-impression">{children}</div>, document.body);
}

function ModalePaiement({ complet, onFermer, onFait }) {
  const { api, etablissement, montant } = useEspace();
  const reste = complet.vente.total - complet.vente.montant_paye;
  const [v, setV] = useState({ montant: String(reste), mode: 'virement', reference: '' });
  const [erreur, setErreur] = useState('');
  const { donnees: sessions } = useDonnees(() => api.lire('sessions_caisse', { eq: { etablissement_id: etablissement.id, statut: 'ouverte' } }).catch(() => []), [etablissement.id]);
  const valider = async (e) => {
    e.preventDefault();
    try {
      await api.rpc('encaisser_facture', {
        p_document_id: complet.document.id, p_montant: Number(v.montant), p_mode: v.mode, p_reference: v.reference || null,
        p_session_id: v.mode === 'especes' ? sessions?.[0]?.id ?? null : null,
      });
      onFait();
    } catch (err) {
      setErreur(err.message);
    }
  };
  return (
    <Modale titre={`Encaisser ${complet.document.numero}`} onFermer={onFermer}>
      <form className="formulaire" onSubmit={valider}>
        <p className="texte-doux">Reste dû : <strong>{montant(reste)}</strong></p>
        <div className="grille-champs">
          <Champ libelle="Montant"><input type="number" min="0" step="any" inputMode="decimal" value={v.montant} onChange={(e) => setV({ ...v, montant: e.target.value })} required /></Champ>
          <Champ libelle="Mode">
            <select value={v.mode} onChange={(e) => setV({ ...v, mode: e.target.value })}>
              {Object.entries(MODES_PAIEMENT).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </Champ>
        </div>
        {v.mode === 'especes' && !sessions?.length && <p className="encart">Les espèces passent par une caisse ouverte : ouvrez la caisse d’abord.</p>}
        <Champ libelle="Référence (n° de virement, transaction…)"><input value={v.reference} onChange={(e) => setV({ ...v, reference: e.target.value })} maxLength={80} /></Champ>
        <Erreur message={erreur} />
        <div className="actions">
          <Bouton type="button" onClick={onFermer}>Annuler</Bouton>
          <Bouton type="submit" variante="principal">Enregistrer le paiement</Bouton>
        </div>
      </form>
    </Modale>
  );
}

function ModaleEcheancier({ complet, onFermer, onFait }) {
  const { api, montant } = useEspace();
  const d = complet.document;
  const [lignes, setLignes] = useState(() => (complet.echeances.length
    ? complet.echeances.map((e) => ({ date_echeance: e.date_echeance, montant: String(e.montant), libelle: e.libelle ?? '' }))
    : repartirEcheances(d.total_ttc, 2, d.date_document)));
  const [nombre, setNombre] = useState(String(lignes.length));
  const [erreur, setErreur] = useState('');
  const somme = Math.round(lignes.reduce((t, l) => t + (Number(l.montant) || 0), 0) * 100) / 100;
  const changer = (i, champ, valeur) => setLignes((x) => x.map((l, k) => (k === i ? { ...l, [champ]: valeur } : l)));
  const valider = async (vider) => {
    setErreur('');
    try {
      await api.rpc('definir_echeancier', { p_document_id: d.id, p_echeances: vider ? [] : lignes.map((l) => ({ ...l, montant: Number(l.montant) })) });
      onFait(vider ? 'Échéancier retiré' : 'Échéancier enregistré');
    } catch (err) {
      setErreur(err.message);
    }
  };
  return (
    <Modale titre="Échéancier" onFermer={onFermer} large>
      <form className="formulaire" onSubmit={(e) => { e.preventDefault(); valider(false); }}>
        <p className="texte-doux">Informatif : imprimé sur le document. Les paiements s’enregistrent sur la facture émise ; un acompte se note comme première échéance.</p>
        <div className="grille-champs">
          <Champ libelle="Répartir en">
            <select value={nombre} onChange={(e) => { setNombre(e.target.value); setLignes(repartirEcheances(d.total_ttc, Number(e.target.value), d.date_document)); }}>
              {Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1} échéance{i ? 's' : ''} mensuelle{i ? 's' : ''}</option>)}
            </select>
          </Champ>
        </div>
        <div className="tableau-conteneur">
          <table className="tableau">
            <thead><tr><th>Libellé</th><th>Date</th><th className="nombre">Montant</th><th /></tr></thead>
            <tbody>
              {lignes.map((l, i) => (
                <tr key={i}>
                  <td><input value={l.libelle} onChange={(e) => changer(i, 'libelle', e.target.value)} maxLength={80} aria-label={`Libellé échéance ${i + 1}`} placeholder={`Échéance ${i + 1}`} /></td>
                  <td><input type="date" value={l.date_echeance} min={d.date_document} onChange={(e) => changer(i, 'date_echeance', e.target.value)} required aria-label={`Date échéance ${i + 1}`} /></td>
                  <td className="nombre"><input type="number" min="0" step="any" value={l.montant} onChange={(e) => changer(i, 'montant', e.target.value)} required aria-label={`Montant échéance ${i + 1}`} /></td>
                  <td><button type="button" className="icone-bouton" onClick={() => setLignes((x) => x.filter((_, k) => k !== i))} disabled={lignes.length === 1} aria-label={`Retirer l’échéance ${i + 1}`}>×</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Bouton type="button" icone="plus" onClick={() => setLignes((x) => [...x, { date_echeance: x[x.length - 1]?.date_echeance ?? d.date_document, montant: '', libelle: '' }])}>Ajouter une échéance</Bouton>
        <p className={somme === Number(d.total_ttc) ? 'texte-doux' : 'encart'}>Total des échéances : {montant(somme)} sur {montant(d.total_ttc)}</p>
        <Erreur message={erreur} />
        <div className="actions">
          {complet.echeances.length > 0 && <Bouton type="button" onClick={() => valider(true)}>Retirer l’échéancier</Bouton>}
          <Bouton type="button" onClick={onFermer}>Annuler</Bouton>
          <Bouton type="submit" variante="principal">Enregistrer l’échéancier</Bouton>
        </div>
      </form>
    </Modale>
  );
}

// Comparateur : versions d'une même offre côte à côte, ligne par ligne.
function ModaleComparaison({ versions, devise, onFermer }) {
  const { api } = useEspace();
  const { donnees: lignes, erreur } = useDonnees(() => api.lire('lignes_document_vente', { dans: { document_id: versions.map((v) => v.id) }, ordre: ['ordre'] }), [versions.map((v) => v.id).join()]);
  const m = (n) => formatMontant(n, devise);
  const libelles = [...new Set((lignes ?? []).map((l) => l.libelle))];
  const cellule = (v, libelle) => {
    const l = (lignes ?? []).filter((x) => x.document_id === v.id && x.libelle === libelle);
    if (!l.length) return '—';
    return l.map((x) => `${m(x.total_ht)}${vrai(x.optionnelle) ? (vrai(x.retenue) ? ' (option retenue)' : ' (option)') : ''}`).join(' + ');
  };
  return (
    <Modale titre="Comparer les versions" onFermer={onFermer} large>
      <Erreur message={erreur} />
      {!lignes ? <Squelette lignes={4} /> : (
        <div className="tableau-conteneur">
          <table className="tableau">
            <thead><tr><th>Ligne</th>{versions.map((v) => <th key={v.id} className="nombre">{v.numero} (V{v.version})</th>)}</tr></thead>
            <tbody>
              {libelles.map((libelle) => <tr key={libelle}><td>{libelle}</td>{versions.map((v) => <td key={v.id} className="nombre">{cellule(v, libelle)}</td>)}</tr>)}
              <tr><td><strong>Total</strong></td>{versions.map((v) => <td key={v.id} className="nombre"><strong>{m(v.total_ttc)}</strong></td>)}</tr>
              <tr><td>Remise globale</td>{versions.map((v) => <td key={v.id} className="nombre">{tauxRemise(lignes.filter((l) => l.document_id === v.id))} %</td>)}</tr>
              <tr><td>Validité</td>{versions.map((v) => <td key={v.id} className="nombre">{v.echeance ? formatDate(v.echeance) : '—'}</td>)}</tr>
              <tr><td>État</td>{versions.map((v) => <td key={v.id} className="nombre">{etatDocument(v, null, dateLocale())[0]}</td>)}</tr>
            </tbody>
          </table>
        </div>
      )}
    </Modale>
  );
}

export default function DocumentVente({ documentId, naviguer }) {
  const { api, peut, notifier, moduleActif } = useEspace();
  const [action, setAction] = useState(null);
  const [erreurAction, setErreurAction] = useState('');
  const { donnees: c, chargement, erreur, recharger } = useDonnees(async () => {
    const complet = await api.rpc('document_vente_complet', { p_document_id: documentId });
    const doc = complet.document;
    const racine = doc.version_de ?? doc.id;
    const [echeances, suivantes, premiere, parametres, contrats] = await Promise.all([
      api.lire('echeances_document', { eq: { document_id: doc.id }, ordre: ['ordre'] }).catch(() => []),
      doc.type === 'devis' ? api.lire('documents_vente', { eq: { etablissement_id: doc.etablissement_id, version_de: racine } }).catch(() => []) : [],
      doc.type === 'devis' && doc.version_de ? api.lire('documents_vente', { eq: { id: racine } }).catch(() => []) : [],
      api.lire('etablissement_parametres', { eq: { etablissement_id: doc.etablissement_id, module_id: 'facturation' } }).catch(() => []),
      doc.type === 'devis' && moduleActif('contrats') ? api.lire('contrats', { eq: { document_vente_id: doc.id } }).catch(() => []) : [],
    ]);
    const versions = doc.type === 'devis' ? [...(doc.version_de ? premiere : [doc]), ...suivantes].sort((a, b) => a.version - b.version) : [];
    return { ...complet, echeances, versions, contrats, seuilRemise: Number(parametres[0]?.data?.remise_max_sans_validation ?? 0) };
  }, [documentId]);
  if (chargement && !c) return <div className="page"><Squelette lignes={8} /></div>;
  if (erreur || !c) {
    return (
      <div className="page">
        <EmptyState titre="Document introuvable" texte={erreur} action={<Bouton onClick={() => naviguer('factures')}>Retour</Bouton>} />
      </div>
    );
  }
  const d = c.document;
  const gerer = peut('facturation.gerer');
  const modifiable = gerer && (d.statut === 'brouillon' || (d.type === 'devis' && d.statut === 'envoye'));
  const executer = async (rpc, params, message, apres) => {
    setErreurAction('');
    try {
      const r = await api.rpc(rpc, params);
      notifier(message);
      if (apres) apres(r);
      else recharger();
    } catch (err) {
      setErreurAction(err.message);
    }
  };
  const etat = etatDocument(d, c.vente, dateLocale());
  const taux = tauxRemise(c.lignes);
  const remiseAValider = c.seuilRemise > 0 && taux > c.seuilRemise && taux > Number(d.remise_validee_pct ?? -1)
    && ['brouillon', 'envoye', 'accepte'].includes(d.statut) && d.type !== 'avoir';
  const derniereVersion = !c.versions.length || c.versions[c.versions.length - 1].id === d.id;
  const options = c.lignes.filter((l) => vrai(l.optionnelle));
  const echeancierModifiable = gerer && ((d.type === 'devis' && ['brouillon', 'envoye', 'accepte'].includes(d.statut)) || (d.type === 'facture' && ['brouillon', 'emise'].includes(d.statut)));
  const echeances = d.type === 'facture' && d.statut === 'emise' && c.vente
    ? etatEcheances(c.echeances, c.vente.montant_paye, dateLocale())
    : c.echeances.map((e) => ({ ...e, etat: null }));
  const reste = c.vente ? c.vente.total - c.vente.montant_paye : 0;
  const nom = d.numero ?? 'Brouillon';
  return (
    <div className="page">
      <PageHeader
        titre={`${TYPES_DOCUMENT[d.type]} ${nom}`}
        sousTitre={c.contact.societe || c.contact.nom}
        fil={[{ libelle: 'Devis et factures', href: '#/factures' }, { libelle: `${TYPES_DOCUMENT[d.type]} ${nom}` }]}
        badges={<Badge ton={etat[1]}>{etat[0]}</Badge>}
        actions={(
          <>
            {modifiable && <Bouton icone="parametres" onClick={() => naviguer(`factures/${d.id}/modifier`)}>Modifier</Bouton>}
            {gerer && d.type === 'devis' && d.statut === 'brouillon' && (
              <Bouton variante="principal" onClick={() => executer('changer_statut_devis', { p_document_id: d.id, p_statut: 'envoye' }, 'Devis marqué envoyé')}>Marquer envoyé</Bouton>
            )}
            {gerer && d.type === 'devis' && ['envoye', 'accepte'].includes(d.statut) && (
              <Bouton variante="principal" icone="facture" onClick={() => executer('convertir_devis', { p_document_id: d.id }, 'Facture créée depuis le devis', (id) => naviguer(`factures/${id}`))}>Facturer</Bouton>
            )}
            {remiseAValider && peut('facturation.valider_remises') && (
              <Bouton onClick={() => executer('valider_remise_document', { p_document_id: d.id }, `Remise de ${taux} % validée`)}>Valider la remise</Bouton>
            )}
            {gerer && d.type === 'facture' && d.statut === 'brouillon' && (
              <Bouton variante="principal" onClick={() => setAction('emettre')}>Émettre la facture</Bouton>
            )}
            {gerer && d.type === 'facture' && d.statut === 'emise' && reste > 0 && c.vente?.statut === 'validee' && (
              <Bouton variante="principal" icone="ventes" onClick={() => setAction('paiement')}>Encaisser</Bouton>
            )}
            <Bouton icone="imprimer" onClick={() => setTimeout(() => window.print(), 50)}>Imprimer / PDF</Bouton>
            <MenuActions actions={[
              gerer && d.type === 'devis' && d.statut === 'envoye' && { libelle: 'Accepté par le client', onClick: () => executer('changer_statut_devis', { p_document_id: d.id, p_statut: 'accepte' }, 'Devis accepté') },
              gerer && d.type === 'devis' && d.statut === 'envoye' && { libelle: 'Refusé par le client', onClick: () => executer('changer_statut_devis', { p_document_id: d.id, p_statut: 'refuse' }, 'Devis refusé') },
              gerer && d.type === 'devis' && derniereVersion && ['brouillon', 'envoye', 'accepte', 'refuse'].includes(d.statut) && { libelle: 'Nouvelle version', onClick: () => executer('nouvelle_version_devis', { p_document_id: d.id }, 'Nouvelle version créée', (id) => naviguer(`factures/${id}/modifier`)) },
              d.type === 'devis' && ['accepte', 'converti'].includes(d.statut) && moduleActif('contrats') && peut('contrats.gerer') && !c.contrats.some((k) => k.statut !== 'annule')
                && { libelle: 'Créer le contrat', onClick: () => executer('contrat_depuis_devis', { p_document_id: d.id }, 'Contrat créé', (id) => naviguer(`contrats/${id}`)) },
              gerer && d.type !== 'avoir' && { libelle: 'Dupliquer', onClick: () => executer('dupliquer_document_vente', { p_document_id: d.id }, 'Copie créée', (id) => naviguer(`factures/${id}/modifier`)) },
              d.statut !== 'emise' && gerer && !['annule', 'converti', 'refuse'].includes(d.statut) && d.type !== 'avoir' && { libelle: 'Annuler', danger: true, onClick: () => setAction('annuler') },
              d.statut === 'emise' && d.type === 'facture' && peut('facturation.annuler') && { libelle: 'Annuler par un avoir', danger: true, onClick: () => setAction('annuler') },
            ]} />
          </>
        )}
      />
      <Erreur message={erreurAction} />
      {remiseAValider && (
        <p className="encart">Remise de {taux} % au-delà du seuil de {c.seuilRemise} % : un responsable doit la valider avant l’envoi, l’accord ou l’émission.</p>
      )}
      <div className="document-disposition">
        <div className="feuille-conteneur"><FeuilleDocument complet={c} /></div>
        <div className="pile">
          {c.vente && d.type === 'facture' && (
            <Section titre="Paiements" sousTitre={reste > 0 && c.vente.statut === 'validee' ? `Reste dû ${formatMontant(reste, c.devise)}` : undefined}>
              {!c.paiements.length && <p className="texte-doux">Aucun paiement.</p>}
              <div className="liste-simple">
                {c.paiements.map((p) => (
                  <div key={p.id} className={`liste-ligne ${p.statut === 'annule' ? 'barre' : ''}`}>
                    <span><strong>{formatMontant(p.montant, c.devise)}</strong> · {MODES_PAIEMENT[p.mode]}<small className="texte-doux bloc">{formatDateHeure(p.cree_le)}{p.reference ? ` · ${p.reference}` : ''}</small></span>
                    {p.statut === 'annule' && <Badge>annulé</Badge>}
                  </div>
                ))}
              </div>
            </Section>
          )}
          {options.length > 0 && (
            <Section titre="Options" sousTitre="Cochées : comprises dans le total">
              <div className="liste-simple">
                {options.map((l) => (
                  <label key={l.id} className="case">
                    <input type="checkbox" checked={vrai(l.retenue)} disabled={!gerer || !['brouillon', 'envoye'].includes(d.statut)}
                      onChange={(e) => executer('retenir_option_devis', { p_ligne_id: l.id, p_retenue: e.target.checked }, e.target.checked ? 'Option retenue' : 'Option retirée')} />
                    <span>{l.libelle} · {formatMontant(l.total_ttc, c.devise)}</span>
                  </label>
                ))}
              </div>
            </Section>
          )}
          {(echeances.length > 0 || echeancierModifiable) && d.type !== 'avoir' && (
            <Section titre="Échéancier" action={echeancierModifiable && <Bouton onClick={() => setAction('echeancier')}>{echeances.length ? 'Modifier' : 'Définir'}</Bouton>}>
              {!echeances.length && <p className="texte-doux">Aucun échéancier : paiement en une fois.</p>}
              <div className="liste-simple">
                {echeances.map((e) => (
                  <div key={e.id} className="liste-ligne">
                    <span><strong>{formatMontant(e.montant, c.devise)}</strong> · {formatDate(e.date_echeance)}<small className="texte-doux bloc">{e.libelle || `Échéance ${e.ordre}`}</small></span>
                    {e.etat && <Badge ton={e.etat[1]}>{e.etat[0]}</Badge>}
                  </div>
                ))}
              </div>
            </Section>
          )}
          {c.versions.length > 1 && (
            <Section titre="Versions" action={<Bouton onClick={() => setAction('comparer')}>Comparer</Bouton>}>
              <div className="liste-simple">
                {c.versions.map((x) => (
                  <div key={x.id} className="liste-ligne">
                    {x.id === d.id ? <strong>V{x.version} · {x.numero} (affichée)</strong>
                      : <button type="button" className="lien" onClick={() => naviguer(`factures/${x.id}`)}>V{x.version} · {x.numero}</button>}
                    <Badge ton={etatDocument(x, null, dateLocale())[1]}>{etatDocument(x, null, dateLocale())[0]}</Badge>
                  </div>
                ))}
              </div>
            </Section>
          )}
          {c.contrats.length > 0 && (
            <Section titre="Contrat">
              <div className="liste-simple">
                {c.contrats.map((k) => (
                  <div key={k.id} className="liste-ligne"><button type="button" className="lien" onClick={() => naviguer(`contrats/${k.id}`)}>Contrat {k.numero}</button></div>
                ))}
              </div>
            </Section>
          )}
          {(c.origine || c.derives.length > 0) && (
            <Section titre="Documents liés">
              <div className="liste-simple">
                {[...(c.origine ? [c.origine] : []), ...c.derives].map((x) => (
                  <div key={x.id} className="liste-ligne">
                    <button type="button" className="lien" onClick={() => naviguer(`factures/${x.id}`)}>{TYPES_DOCUMENT[x.type]} {x.numero ?? '(brouillon)'}</button>
                  </div>
                ))}
              </div>
            </Section>
          )}
          <Section>
            <PiecesJointes objetType="document_vente" objetId={d.id} titre="Pièces jointes" peutAjouter={gerer} peutArchiver={gerer}
              categories={['Bon de commande', 'Bon de livraison', 'Preuve de paiement', 'Échange client', 'Autre']} />
          </Section>
          <Section titre="Historique">
            <dl className="details">
              <dt>Créé le</dt><dd>{formatDateHeure(d.cree_le)}</dd>
              {d.emis_le && <><dt>Émis le</dt><dd>{formatDateHeure(d.emis_le)}</dd></>}
              {d.annule_le && <><dt>Annulé le</dt><dd>{formatDateHeure(d.annule_le)} — {d.motif_annulation}</dd></>}
              <dt>Hub</dt><dd>{c.hub?.nom}</dd>
            </dl>
          </Section>
        </div>
      </div>
      <ZoneImpression><FeuilleDocument complet={c} /></ZoneImpression>
      {action === 'echeancier' && <ModaleEcheancier complet={c} onFermer={() => setAction(null)} onFait={(m) => { setAction(null); notifier(m); recharger(); }} />}
      {action === 'comparer' && <ModaleComparaison versions={c.versions} devise={c.devise} onFermer={() => setAction(null)} />}
      {action === 'paiement' && <ModalePaiement complet={c} onFermer={() => setAction(null)} onFait={() => { setAction(null); notifier('Paiement enregistré'); recharger(); }} />}
      {action === 'emettre' && (
        <Modale
          titre="Émettre la facture"
          onFermer={() => setAction(null)}
          pied={(
            <>
              <Bouton onClick={() => setAction(null)}>Retour</Bouton>
              <Bouton variante="principal" onClick={() => { setAction(null); executer('emettre_facture', { p_document_id: d.id }, 'Facture émise'); }}>Émettre</Bouton>
            </>
          )}
        >
          <p>La facture reçoit son numéro définitif, compte dans le chiffre d’affaires et sort les articles du stock du Hub « {c.hub?.nom} ».</p>
          <p className="texte-doux">Elle ne pourra plus être modifiée ; une erreur se corrige par un avoir.</p>
        </Modale>
      )}
      {action === 'annuler' && (
        <ModaleMotif
          titre={d.statut === 'emise' ? 'Annuler la facture par un avoir' : `Annuler ce ${TYPES_DOCUMENT[d.type].toLowerCase()}`}
          texte={d.statut === 'emise' ? 'Un avoir du même montant est émis ; le stock revient dans le Hub. Les paiements doivent être annulés avant.' : 'Le document reste consultable avec le motif.'}
          libelleAction="Confirmer l’annulation"
          onValider={(motif) => api.rpc('annuler_document_vente', { p_document_id: d.id, p_motif: motif }).then((avoir) => {
            notifier(avoir ? 'Avoir émis' : 'Document annulé');
            if (avoir) naviguer(`factures/${avoir}`);
            else recharger();
          })}
          onFermer={() => setAction(null)}
        />
      )}
    </div>
  );
}
