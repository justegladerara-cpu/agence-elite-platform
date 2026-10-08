import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useDonnees, useEspace } from '../../noyau/espace.jsx';
import { dateLocale, formatDate, formatDateHeure, formatMontant, formatQuantite, MODES_PAIEMENT } from '../../noyau/format.js';
import {
  Badge, Bouton, Champ, EmptyState, Erreur, MenuActions, Modale, ModaleMotif, PageHeader, Section, Squelette,
} from '../../ui/composants.jsx';
import { PiecesJointes } from '../../ui/communs.jsx';
import { etatDocument, TYPES_DOCUMENT } from './commun.js';

// Rendu A4 d'un devis, d'une facture ou d'un avoir : le même à l'écran et à l'impression.
export function FeuilleDocument({ complet }) {
  const { document: d, lignes, contact, identite, devise, parametres, vente, origine } = complet;
  const doc = identite?.documents ?? {};
  const m = (n) => formatMontant(n, devise);
  const avecTva = lignes.some((l) => Number(l.taux_tva) > 0);
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
              <td>{l.libelle}{l.description && <div className="feuille-petit">{l.description}</div>}</td>
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

export default function DocumentVente({ documentId, naviguer }) {
  const { api, peut, notifier } = useEspace();
  const [action, setAction] = useState(null);
  const [erreurAction, setErreurAction] = useState('');
  const { donnees: c, chargement, erreur, recharger } = useDonnees(() => api.rpc('document_vente_complet', { p_document_id: documentId }), [documentId]);
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
              gerer && d.type !== 'avoir' && { libelle: 'Dupliquer', onClick: () => executer('dupliquer_document_vente', { p_document_id: d.id }, 'Copie créée', (id) => naviguer(`factures/${id}/modifier`)) },
              d.statut !== 'emise' && gerer && !['annule', 'converti', 'refuse'].includes(d.statut) && d.type !== 'avoir' && { libelle: 'Annuler', danger: true, onClick: () => setAction('annuler') },
              d.statut === 'emise' && d.type === 'facture' && peut('facturation.annuler') && { libelle: 'Annuler par un avoir', danger: true, onClick: () => setAction('annuler') },
            ]} />
          </>
        )}
      />
      <Erreur message={erreurAction} />
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
