import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useDonnees, useEspace } from '../../noyau/espace.jsx';
import { formatDateHeure, formatMontant, formatQuantite, MODES_PAIEMENT } from '../../noyau/format.js';
import { Bouton, Chargement, Erreur, Modale } from '../../ui/composants.jsx';
import { lienRecuWhatsApp } from './whatsapp.js';
import { BLOCS_TICKET, blocsADessiner, blocVisible, CLE_MODELE_TICKET, lienQr, lireModele } from './modeleTicket.js';
import { ImageQr } from '../caisse/qrOutils.jsx';
import './recu.css';

// Ticket de caisse 80 mm (ou 58 mm). Le même rendu sert à l'écran et à l'impression.
// En-tête : informations de l'établissement, sinon celles de sa société (recu.documents, calculé par la base).
// modele : Paramètres › Ticket de caisse (modeleTicket.js). Sans modèle, le ticket est celui d'avant.
// Les mentions obligatoires (numéro, date, lignes, total, paiements, NIU/RCCM connus) ne sont jamais retirables.
export function Ticket({ recu, modele: modeleBrut = null }) {
  const modele = lireModele(modeleBrut);
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
  const { infos, textes } = modele;
  const avecInfos = blocVisible(modele, 'infos');
  const bandeaux = (
    <>
      {recu.horsLigne && <div className="ticket-annule">HORS LIGNE : vente gardée sur l’appareil, son numéro est donné à l’envoi</div>}
      {vente.statut === 'annulee' && <div className="ticket-annule">VENTE ANNULÉE — {vente.motif_annulation}</div>}
    </>
  );
  const lienDuQr = lienQr(textes.qr_lien);
  const blocs = {
    logo: () => logo && <img className={`ticket-logo logo-${modele.taille_logo}`} src={logo} alt="" />,
    nom: () => <strong className="ticket-nom">{identite.nom_commercial ?? etablissement.nom}</strong>,
    adresse: () => identite.adresse && <div>{identite.adresse}</div>,
    telephone: () => identite.telephone && <div>Tél. {identite.telephone}</div>,
    legal: () => (identite.rccm || identite.niu) && (
      <div className="ticket-petit">
        {identite.rccm && <>RCCM {identite.rccm}</>}
        {identite.rccm && identite.niu && ' · '}
        {identite.niu && <>NIU {identite.niu}</>}
      </div>
    ),
    message_haut: () => textes.message_haut.trim() && <div className="ticket-message">{textes.message_haut}</div>,
    numero: () => (
      <>
        <div className="ticket-ligne"><span>Reçu</span><strong>{vente.numero}</strong></div>
        <div className="ticket-ligne"><span>Date</span><span>{formatDateHeure(vente.cree_le)}</span></div>
        {!avecInfos && bandeaux}
      </>
    ),
    infos: () => (
      <>
        {infos.caisse && recu.point_de_vente && <div className="ticket-ligne"><span>Caisse</span><span>{recu.point_de_vente}</span></div>}
        {infos.vendeur && recu.vendeur && <div className="ticket-ligne"><span>Vendeur</span><span>{recu.vendeur}</span></div>}
        {infos.servi_par && vente.servi_par && <div className="ticket-ligne"><span>Servi par</span><span>{vente.servi_par}</span></div>}
        {infos.client && recu.contact && <div className="ticket-ligne"><span>Contact</span><span>{recu.contact.nom}</span></div>}
        {bandeaux}
      </>
    ),
    articles: () => (
      <>
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
      </>
    ),
    message_bas: () => <div className="ticket-pied">{textes.message_bas.trim() || (identite.mentions_recu ?? 'Merci de votre visite.')}</div>,
    pied: () => identite.pied && <div className="ticket-petit">{identite.pied}</div>,
    qr: () => lienDuQr && (
      <div className="ticket-qr">
        {textes.qr_texte.trim() && <div className="ticket-petit">{textes.qr_texte}</div>}
        <ImageQr texte={lienDuQr} libelle={textes.qr_texte || 'du ticket'} />
      </div>
    ),
  };
  // Un bloc vide (pas d'adresse, pas de QR…) ne compte pas : le trait n'est tiré qu'entre deux blocs écrits.
  const rendus = blocsADessiner(modele).map(({ id }) => ({ id, contenu: blocs[id]() })).filter((b) => b.contenu);
  return (
    <div className={`ticket ticket-${modele.largeur}${modele.taille_texte === 'grand' ? ' ticket-grand' : ''}`}>
      {rendus.map(({ id, contenu }, i) => (
        <React.Fragment key={id}>
          {i > 0 && BLOCS_TICKET[rendus[i - 1].id].groupe !== BLOCS_TICKET[id].groupe && <div className="ticket-sep" />}
          {contenu}
        </React.Fragment>
      ))}
    </div>
  );
}

// Modèle du ticket de l'établissement ouvert. Gardé sur l'appareil : sans internet, le ticket garde sa forme.
export function useModeleTicket() {
  const { api, etablissement } = useEspace();
  const cle = `elite.modele_ticket.${etablissement?.id}`;
  const [modele, setModele] = useState(() => {
    try {
      return localStorage.getItem(cle);
    } catch {
      return null;
    }
  });
  useEffect(() => {
    if (!etablissement?.id) return undefined;
    let actif = true;
    api.lire('etablissement_parametres', { eq: { etablissement_id: etablissement.id, module_id: 'caisse' } })
      .then((r) => {
        const texte = r?.[0]?.data?.[CLE_MODELE_TICKET] ?? null;
        if (!actif) return;
        setModele(texte);
        try {
          if (texte) localStorage.setItem(cle, texte);
          else localStorage.removeItem(cle);
        } catch {
          // Stockage indisponible : le modèle est simplement relu la prochaine fois.
        }
      })
      .catch(() => {});
    return () => {
      actif = false;
    };
  }, [api, etablissement?.id, cle]);
  return modele;
}

export function ZoneImpression({ children }) {
  return createPortal(<div className="zone-impression">{children}</div>, document.body);
}

export function imprimer() {
  setTimeout(() => window.print(), 50);
}

// « Oups, annuler » : juste après la vente, pendant ce délai, une erreur de saisie s'annule en deux touches.
export const DELAI_ANNULATION_RAPIDE = 15000;

export function AnnulationRapide({ onAnnuler }) {
  const [visible, setVisible] = useState(true);
  const [confirmer, setConfirmer] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setVisible(false), DELAI_ANNULATION_RAPIDE);
    return () => clearTimeout(t);
  }, []);
  if (!visible && !enCours) return null;
  const annuler = async () => {
    setEnCours(true);
    setErreur('');
    try {
      await onAnnuler();
    } catch (err) {
      setErreur(err.message);
      setEnCours(false);
    }
  };
  return (
    <div className="annulation-rapide">
      {!confirmer ? (
        <Bouton variante="danger" onClick={() => setConfirmer(true)}>Oups, annuler cette vente</Bouton>
      ) : (
        <>
          <p><strong>Annuler cette vente ?</strong> Le stock revient et l’argent n’est pas compté.</p>
          <div className="actions">
            <Bouton onClick={() => setConfirmer(false)} disabled={enCours}>Non, garder</Bouton>
            <Bouton variante="danger" onClick={annuler} chargement={enCours}>Oui, annuler la vente</Bouton>
          </div>
        </>
      )}
      <Erreur message={erreur} />
    </div>
  );
}

// annulerRapide : fourni par la caisse seulement si la personne a le droit ventes.annuler (la base le vérifie aussi).
export function ModaleRecu({ venteId, onFermer, monnaie, piedSupplementaire, annulerRapide }) {
  const { api, devise } = useEspace();
  const { donnees: recu, chargement, erreur } = useDonnees(() => api.rpc('recu_vente', { p_vente_id: venteId }), [venteId]);
  const modele = useModeleTicket();
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
          {recu && (
            <a className="bouton secondaire bouton-whatsapp" href={lienRecuWhatsApp(recu)} target="_blank" rel="noopener noreferrer">
              <span>Envoyer sur WhatsApp</span>
            </a>
          )}
          <Bouton icone="imprimer" variante="principal" onClick={imprimer} disabled={!recu}>Imprimer</Bouton>
        </>
      )}
    >
      {monnaie > 0 && <div className="monnaie">Monnaie à rendre : <strong>{formatMontant(monnaie, devise)}</strong></div>}
      {annulerRapide && recu?.vente.statut === 'validee' && <AnnulationRapide onAnnuler={annulerRapide} />}
      {chargement && <Chargement />}
      <Erreur message={erreur} />
      {recu && (
        <>
          <div className="ticket-apercu"><Ticket recu={recu} modele={modele} /></div>
          <ZoneImpression><Ticket recu={recu} modele={modele} /></ZoneImpression>
        </>
      )}
    </Modale>
  );
}
