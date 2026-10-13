import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useEspace } from '../../noyau/espace.jsx';
import { formatDateHeure, formatQuantite } from '../../noyau/format.js';
import { Bouton, Champ, Erreur, Modale } from '../../ui/composants.jsx';
import { BandeauNouveau, NOUVEAU_HORS_LIGNE_JUSQUA } from '../../ui/Nouveau.jsx';
import { imprimer, Ticket, ZoneImpression } from '../recus/Recu.jsx';
import {
  envoyerFile, EVENEMENT_FILE_HORS_LIGNE, lireFile, reessayer, retirerVente, ventesAVerifier, ventesEnAttente,
} from './horsLigne.js';
import './caisse.css';

// Caisse sans internet : écrans et envoi automatique. La logique (file, contrôles, copie) est dans horsLigne.js.

// File de l'appareil pour cet établissement, relue à chaque changement (cet onglet ou un autre).
export function useFileHorsLigne(etab) {
  const [liste, setListe] = useState(() => lireFile(etab));
  useEffect(() => {
    const relire = () => setListe(lireFile(etab));
    relire();
    window.addEventListener(EVENEMENT_FILE_HORS_LIGNE, relire);
    window.addEventListener('storage', relire);
    return () => {
      window.removeEventListener(EVENEMENT_FILE_HORS_LIGNE, relire);
      window.removeEventListener('storage', relire);
    };
  }, [etab]);
  return liste;
}

export function useEnLigne() {
  const [enLigne, setEnLigne] = useState(() => typeof navigator === 'undefined' || navigator.onLine !== false);
  useEffect(() => {
    const changer = () => setEnLigne(navigator.onLine !== false);
    window.addEventListener('online', changer);
    window.addEventListener('offline', changer);
    return () => {
      window.removeEventListener('online', changer);
      window.removeEventListener('offline', changer);
    };
  }, []);
  return enLigne;
}

// Un seul envoi à la fois par établissement dans cet onglet (les autres onglets sont couverts par la clé de la vente).
const envoisEnCours = new Map();

// Envoi automatique : à l'ouverture, au retour de la connexion, puis toutes les 5 s tant qu'il reste des ventes
// (en respectant l'attente entre deux essais).
export function useEnvoiHorsLigne({ etab, liste, enLigne, apresEnvoi }) {
  const { api, utilisateur, notifier } = useEspace();
  const [envoi, setEnvoi] = useState(false);
  const rappel = useRef(apresEnvoi);
  rappel.current = apresEnvoi;
  const envoyer = useCallback(async ({ forcer = false } = {}) => {
    if (envoisEnCours.has(etab)) return envoisEnCours.get(etab);
    const promesse = (async () => {
      setEnvoi(true);
      try {
        const bilan = await envoyerFile({
          etab, api, utilisateurId: utilisateur?.id, forcer,
          surEnvoyee: (_vente, resultat) => (resultat?.avertissements ?? []).forEach((a) => notifier(a, 'erreur')),
        });
        if (bilan.envoyees) {
          notifier(`${bilan.envoyees} vente(s) faite(s) sans internet envoyée(s)`);
          rappel.current?.();
        }
        if (bilan.aVerifier) notifier(`${bilan.aVerifier} vente(s) refusée(s) : à vérifier par un responsable`, 'erreur');
        return bilan;
      } finally {
        envoisEnCours.delete(etab);
        setEnvoi(false);
      }
    })();
    envoisEnCours.set(etab, promesse);
    return promesse;
  }, [api, etab, notifier, utilisateur?.id]);
  const aEnvoyer = liste.some((v) => v.statut === 'en_attente' && (!v.utilisateur_id || v.utilisateur_id === utilisateur?.id));
  useEffect(() => {
    if (!enLigne || !aEnvoyer) return undefined;
    envoyer().catch(() => {});
    const t = setInterval(() => envoyer().catch(() => {}), 5000);
    return () => clearInterval(t);
  }, [enLigne, aEnvoyer, envoyer]);
  return { envoi, envoyer };
}

// Bandeau toujours visible en haut de la caisse quand il n'y a pas d'internet ou qu'une vente attend.
export function BandeauHorsLigne({ enLigne, enAttente, aVerifier, envoi, onEnvoyer, onVoir }) {
  return (
    <>
      <BandeauNouveau jusqua={NOUVEAU_HORS_LIGNE_JUSQUA}>
        Caisse sans internet : si la connexion coupe, continuez à vendre. Les ventes restent sur l’appareil et partent
        toutes seules au retour d’internet.
      </BandeauNouveau>
      {(!enLigne || enAttente > 0) && (
        <div className={`bandeau ${enLigne ? 'info' : 'attention'} bandeau-hors-ligne`} role="status">
          <strong>
            {enLigne ? 'Connexion revenue' : 'Pas d’internet'} : {enAttente} vente(s) en attente d’envoi
          </strong>
          {!enLigne && <span> · continuez à vendre, elles partiront au retour d’internet.</span>}
          {enLigne && enAttente > 0 && (
            <Bouton onClick={() => onEnvoyer({ forcer: true })} chargement={envoi}>Envoyer maintenant</Bouton>
          )}
        </div>
      )}
      {aVerifier > 0 && (
        <div className="bandeau attention bandeau-hors-ligne" role="alert">
          <strong>{aVerifier} vente(s) faite(s) sans internet à vérifier</strong>
          <Bouton onClick={onVoir}>Voir</Bouton>
        </div>
      )}
    </>
  );
}

// Reçu d'une vente gardée sur l'appareil : même ticket, marqué « HORS LIGNE », imprimable.
export function ModaleRecuHorsLigne({ ticket, monnaie, onFermer, piedSupplementaire }) {
  const { etablissement, montant } = useEspace();
  useEffect(() => {
    document.body.classList.add('impression-ticket');
    return () => document.body.classList.remove('impression-ticket');
  }, []);
  const recu = {
    horsLigne: true,
    etablissement: { nom: etablissement.nom, devise: etablissement.devise },
    identite: ticket.identite,
    point_de_vente: ticket.point_de_vente,
    vendeur: ticket.vendeur,
    contact: ticket.contact,
    lignes: ticket.lignes,
    paiements: ticket.paiements,
    vente: {
      numero: 'Hors ligne', cree_le: ticket.cree_le, servi_par: ticket.servi_par || null, statut: 'validee',
      remise: ticket.remise, total: ticket.total, montant_paye: ticket.paye,
    },
  };
  return (
    <Modale
      titre="Reçu hors ligne"
      onFermer={onFermer}
      pied={(
        <>
          {piedSupplementaire}
          <Bouton icone="imprimer" variante="principal" onClick={imprimer}>Imprimer</Bouton>
        </>
      )}
    >
      <p className="bandeau attention" role="status">Pas d’internet : la vente est gardée sur cet appareil. Elle partira toute seule au retour de la connexion.</p>
      {monnaie > 0 && <div className="monnaie">Monnaie à rendre : <strong>{montant(monnaie)}</strong></div>}
      <div className="ticket-apercu"><Ticket recu={recu} /></div>
      <ZoneImpression><Ticket recu={recu} /></ZoneImpression>
    </Modale>
  );
}

function LigneAVerifier({ vente, peutRetirer, onReessayer, onRetirer }) {
  const { montant } = useEspace();
  const [retrait, setRetrait] = useState(false);
  const [motif, setMotif] = useState('');
  const [erreur, setErreur] = useState('');
  const t = vente.ticket ?? {};
  return (
    <li className="carte vente-a-verifier">
      <div className="titre-ligne">
        <strong>{formatDateHeure(vente.cree_le)} · {montant(t.total ?? 0)}</strong>
        {t.vendeur && <span className="texte-doux">par {t.vendeur}</span>}
      </div>
      <div>{(t.lignes ?? []).map((l) => `${formatQuantite(l.quantite)} × ${l.libelle}`).join(', ')}</div>
      <p className="texte-alerte">Refusée : {vente.message}</p>
      <div className="actions">
        <Bouton onClick={onReessayer}>Réessayer</Bouton>
        {peutRetirer && !retrait && <Bouton variante="danger" onClick={() => setRetrait(true)}>Retirer de la liste</Bouton>}
      </div>
      {retrait && (
        <div className="formulaire">
          <Champ libelle="Pourquoi retirer cette vente ?" aide="Exemple : déjà saisie dans « Ventes d’un jour passé ». Une trace reste sur l’appareil.">
            <input value={motif} onChange={(e) => setMotif(e.target.value)} maxLength={200} />
          </Champ>
          <Erreur message={erreur} />
          <div className="actions">
            <Bouton onClick={() => setRetrait(false)}>Garder</Bouton>
            <Bouton variante="danger" onClick={() => { try { onRetirer(motif); } catch (err) { setErreur(err.message); } }}>Oui, retirer</Bouton>
          </div>
        </div>
      )}
    </li>
  );
}

// Ventes refusées par la base : visibles par la personne qui les a faites et par un responsable sur cet appareil.
export function ModaleVentesAVerifier({ etab, liste, onFermer }) {
  const { peut, utilisateur, notifier } = useEspace();
  const responsable = peut('cloture.cloturer');
  const visibles = ventesAVerifier(liste).filter((v) => responsable || !v.utilisateur_id || v.utilisateur_id === utilisateur?.id);
  return (
    <Modale titre="Ventes sans internet à vérifier" onFermer={onFermer} large>
      <p className="texte-doux">
        Ces ventes ont été faites sans internet puis refusées par la plateforme (stock, droit, caisse fermée…). Corrigez
        la cause puis « Réessayer », ou un responsable les retire après les avoir saisies autrement.
      </p>
      {!visibles.length && <p>Aucune vente à vérifier.</p>}
      <ul className="liste-a-verifier">
        {visibles.map((v) => (
          <LigneAVerifier
            key={v.cle}
            vente={v}
            peutRetirer={responsable}
            onReessayer={() => { reessayer(etab, v.cle); notifier('La vente repart dès que possible'); }}
            onRetirer={(motif) => { retirerVente(etab, v.cle, { par: utilisateur?.id, motif }); notifier('Vente retirée de la liste'); }}
          />
        ))}
      </ul>
    </Modale>
  );
}

// Clôture de caisse : rappel des ventes de cet appareil pas encore envoyées, et liste « à vérifier ».
export function EncartHorsLigne() {
  const { etablissement, peut, utilisateur } = useEspace();
  const etab = etablissement.id;
  const liste = useFileHorsLigne(etab);
  const enLigne = useEnLigne();
  const { envoi, envoyer } = useEnvoiHorsLigne({ etab, liste, enLigne });
  const [voir, setVoir] = useState(false);
  const miennes = (v) => peut('cloture.cloturer') || !v.utilisateur_id || v.utilisateur_id === utilisateur?.id;
  const enAttente = ventesEnAttente(liste).filter(miennes).length;
  const aVerifier = ventesAVerifier(liste).filter(miennes).length;
  if (!enAttente && !aVerifier && enLigne) return null;
  return (
    <>
      <BandeauHorsLigne enLigne={enLigne} enAttente={enAttente} aVerifier={aVerifier} envoi={envoi} onEnvoyer={envoyer} onVoir={() => setVoir(true)} />
      {voir && <ModaleVentesAVerifier etab={etab} liste={liste} onFermer={() => setVoir(false)} />}
    </>
  );
}
