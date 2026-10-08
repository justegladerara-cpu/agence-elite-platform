import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useDonnees, useEspace } from '../../noyau/espace.jsx';
import { formatDateHeure, formatMontant, formatQuantite, MODES_PAIEMENT } from '../../noyau/format.js';
import { Bouton, Chargement, Erreur, Modale } from '../../ui/composants.jsx';

// Ticket de caisse 80 mm. Le même rendu sert à l'écran et à l'impression.
// En-tête : informations de l'établissement, sinon celles de sa société (recu.documents, calculé par la base).
// Les mentions obligatoires (numéro, date, lignes, total, paiements, NIU/RCCM connus) ne sont jamais retirables.
export function Ticket({ recu }) {
  const { vente, etablissement, lignes, paiements } = recu;
  const doc = recu.documents ?? {};
  const propre = recu.identite ?? {};
  const identite = {
    nom_commercial: propre.nom_commercial ?? doc.nom_commercial,
    adresse: propre.adresse ?? doc.adresse,
    telephone: propre.telephone ?? doc.telephone,
    rccm: propre.rccm ?? doc.rccm,
    niu: propre.niu ?? doc.niu,
    mentions_recu: propre.mentions_recu ?? doc.mentions,
    pied: propre.pied_documents ?? doc.pied,
  };
  const logo = recu.logo ?? doc.logo_url;
  const devise = etablissement.devise;
  const m = (n) => formatMontant(n, devise);
  const valides = paiements.filter((p) => p.statut === 'valide');
  return (
    <div className="ticket">
      {logo && <img className="ticket-logo" src={logo} alt="" />}
      <strong className="ticket-nom">{identite.nom_commercial ?? etablissement.nom}</strong>
      {identite.adresse && <div>{identite.adresse}</div>}
      {identite.telephone && <div>Tél. {identite.telephone}</div>}
      {(identite.rccm || identite.niu) && (
        <div className="ticket-petit">
          {identite.rccm && <>RCCM {identite.rccm}</>}
          {identite.rccm && identite.niu && ' · '}
          {identite.niu && <>NIU {identite.niu}</>}
        </div>
      )}
      <div className="ticket-sep" />
      <div className="ticket-ligne"><span>Reçu</span><strong>{vente.numero}</strong></div>
      <div className="ticket-ligne"><span>Date</span><span>{formatDateHeure(vente.cree_le)}</span></div>
      {recu.point_de_vente && <div className="ticket-ligne"><span>Caisse</span><span>{recu.point_de_vente}</span></div>}
      {recu.vendeur && <div className="ticket-ligne"><span>Vendeur</span><span>{recu.vendeur}</span></div>}
      {recu.contact && <div className="ticket-ligne"><span>Contact</span><span>{recu.contact.nom}</span></div>}
      {vente.statut === 'annulee' && <div className="ticket-annule">VENTE ANNULÉE — {vente.motif_annulation}</div>}
      <div className="ticket-sep" />
      {lignes.map((l, i) => (
        <div key={i} className="ticket-article">
          <div>{l.libelle}</div>
          <div className="ticket-ligne">
            <span>{formatQuantite(l.quantite)} × {m(l.prix_unitaire)}{l.remise > 0 && ` − ${m(l.remise)}`}</span>
            <span>{m(l.total)}</span>
          </div>
        </div>
      ))}
      <div className="ticket-sep" />
      {vente.remise > 0 && <div className="ticket-ligne"><span>Remise</span><span>− {m(vente.remise)}</span></div>}
      <div className="ticket-ligne ticket-total"><span>TOTAL</span><span>{m(vente.total)}</span></div>
      {valides.map((p, i) => (
        <div key={i} className="ticket-ligne"><span>{MODES_PAIEMENT[p.mode]}{p.reference ? ` (${p.reference})` : ''}</span><span>{m(p.montant)}</span></div>
      ))}
      {vente.total - vente.montant_paye > 0 && vente.statut === 'validee' && (
        <div className="ticket-ligne ticket-total"><span>Reste dû</span><span>{m(vente.total - vente.montant_paye)}</span></div>
      )}
      <div className="ticket-sep" />
      <div className="ticket-pied">{identite.mentions_recu ?? 'Merci de votre visite.'}</div>
      {identite.pied && <div className="ticket-petit">{identite.pied}</div>}
    </div>
  );
}

function ZoneImpression({ children }) {
  return createPortal(<div className="zone-impression">{children}</div>, document.body);
}

export function imprimer() {
  setTimeout(() => window.print(), 50);
}

export function ModaleRecu({ venteId, onFermer, monnaie, piedSupplementaire }) {
  const { api, devise } = useEspace();
  const { donnees: recu, chargement, erreur } = useDonnees(() => api.rpc('recu_vente', { p_vente_id: venteId }), [venteId]);
  useEffect(() => {
    document.body.classList.add('impression-ticket');
    return () => document.body.classList.remove('impression-ticket');
  }, []);
  return (
    <Modale
      titre={recu ? `Reçu ${recu.vente.numero}` : 'Reçu'}
      onFermer={onFermer}
      pied={(
        <>
          {piedSupplementaire}
          <Bouton icone="imprimer" variante="principal" onClick={imprimer} disabled={!recu}>Imprimer</Bouton>
        </>
      )}
    >
      {monnaie > 0 && <div className="monnaie">Monnaie à rendre : <strong>{formatMontant(monnaie, devise)}</strong></div>}
      {chargement && <Chargement />}
      <Erreur message={erreur} />
      {recu && (
        <>
          <div className="ticket-apercu"><Ticket recu={recu} /></div>
          <ZoneImpression><Ticket recu={recu} /></ZoneImpression>
        </>
      )}
    </Modale>
  );
}
