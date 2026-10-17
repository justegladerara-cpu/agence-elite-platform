import React, { useEffect, useMemo, useState } from 'react';
import { useDonnees, useEspace } from '../../noyau/espace.jsx';
import { formatDateHeure, formatQuantite, MODES_PAIEMENT } from '../../noyau/format.js';
import { Badge, Bouton, Champ, Chargement, Erreur, Icone, Modale, Recherche, Vide } from '../../ui/composants.jsx';
import { ModaleRecu } from '../recus/Recu.jsx';
import {
  arrondirQuantite, classerFavoris, compterVente, enregistrerFavoris, estVenteAuPoids, FRACTIONS, lireFavoris, MIN_FAVORIS_AUTO,
  quantitePourMontant,
} from './poids.js';
import { lireCoupures, ModaleZ, SessionOuverte } from '../cloture/Clotures.jsx';
import { estArticleTechnique } from '../restaurant/vip.js';
import { mesCaisses } from './mesCaisses.js';
import { EVENEMENT_CAISSE_FERMEE } from './verrouCaisse.js';
import { attenteFacture, totalFactures } from './facturesEnCours.js';
import { nomsServeurs } from './serviPar.js';
import { ChoixServeur, listeServeurs, lireServeurChoisi, retenirServeurChoisi } from './ChoixServeur.jsx';
import './caisse.css';
import { BandeauNouveau, NOUVEAU_CAISSE_UNIQUE_JUSQUA, NOUVEAU_LOT3_JUSQUA, NOUVEAU_PRESENCE_JUSQUA, PastilleNouveau } from '../../ui/Nouveau.jsx';
import { ListeCommandesQr } from './CommandesQr.jsx';
import { happyHourEnCours, texteBandeau } from './happyHour.js';
import {
  ajouterAuPanier, annulerOffert, changerQuantiteLigne, cleLigne, fusionnerLignes, lignesPourVente, noteOfferts, offertsPourVente, offrirLigne,
  RAISONS_OFFERT, remiseLigne, texteRaison, totauxPanier,
} from './offerts.js';
import { alerteStock } from '../stock/preparerCommande.js';

// Devises sans centimes : la remise du happy hour s'arrondit au franc.
const decimalesDevise = (devise) => (['XAF', 'XOF', 'GNF', 'CDF'].includes(devise) ? 0 : 2);

// Stock, prix et commandes des tables relus en arrière-plan : la caisse voit la marchandise reçue, les ventes des autres
// caisses et les nouvelles commandes des QR codes sans recharger la page.
const RAFRAICHIR_CAISSE_MS = 30000;

// « Complément minimum » (tables VIP) : ligne de montant ajoutée en salle, jamais une tuile de la caisse.
const sansArticleTechnique = (articles) => articles.filter((a) => !estArticleTechnique(a));

// Puce « Favoris » : valeur spéciale du filtre de catégorie.
const FAVORIS = '__favoris__';

const COULEURS = ['#1F6FEB', '#0E9F6E', '#C2410C', '#7C3AED', '#B91C1C', '#0F766E', '#A16207', '#BE185D'];

function couleurDe(texte) {
  let somme = 0;
  for (const c of texte) somme += c.charCodeAt(0);
  return COULEURS[somme % COULEURS.length];
}

function initiales(nom) {
  return nom.split(/\s+/).filter(Boolean).slice(0, 2).map((m) => m[0].toUpperCase()).join('');
}

export function VignetteArticle({ article, taille = 'normale' }) {
  if (article.photo) return <img className={`vignette ${taille}`} src={article.photo} alt="" />;
  return <span className={`vignette ${taille}`} style={{ background: couleurDe(article.nom) }}>{initiales(article.nom)}</span>;
}

// Une seule caisse ouverte à la fois (migration 20261013100133) : la caisse d'une autre personne est encore ouverte.
// Elle tire son ticket Z ; sinon un responsable ferme la caisse oubliée (en comptant, ou « espèces à compter »).
function CaisseOccupee({ occupee, coupures, onFermee }) {
  const { peut, notifier } = useEspace();
  const [fermer, setFermer] = useState(false);
  return (
    <div className="caisse-occupee" role="status">
      <strong>La caisse de {occupee.caissier} est encore ouverte</strong>
      <span>Depuis le {formatDateHeure(occupee.ouverte_le)}. Elle doit d’abord tirer son ticket Z : une seule caisse ouverte à la fois.</span>
      {peut('cloture.cloturer') && (
        <Bouton type="button" variante="principal" onClick={() => setFermer(true)}>Fermer la caisse de {occupee.caissier}</Bouton>
      )}
      {fermer && (
        <Modale titre={`Fermer la caisse de ${occupee.caissier}`} onFermer={() => setFermer(false)}>
          <SessionOuverte
            session={{ id: occupee.session_id, ouverte_par: null }}
            coupures={coupures}
            onCloturee={(z) => { setFermer(false); notifier(`Caisse fermée : ${z.numero}`); onFermee(z); }}
          />
        </Modale>
      )}
    </div>
  );
}

function OuvertureCaisse({ pointsDeVente, onOuvrir, fermees = 0, occupees = [], coupures = [], onFermee }) {
  const { hubs, multiHub } = useEspace();
  const [fond, setFond] = useState('');
  const [pdv, setPdv] = useState(pointsDeVente[0]?.id ?? '');
  const [erreur, setErreur] = useState('');
  const [chargement, setChargement] = useState(false);
  const valider = async (e) => {
    e.preventDefault();
    setChargement(true);
    setErreur('');
    try {
      await onOuvrir(pdv || null, Number(fond || 0));
    } catch (err) {
      setErreur(err.message);
      setChargement(false);
    }
  };
  if (!pointsDeVente.length) {
    return (
      <div className="ouverture-caisse">
        <Vide titre="Aucune caisse ici" texte={multiHub ? 'Ce Hub n’a pas de caisse. Choisissez un autre Hub en haut de l’écran.' : 'Demandez à votre responsable de créer une caisse.'} />
      </div>
    );
  }
  const nomHub = (p) => (multiHub ? ` · ${hubs.find((h) => h.id === p.hub_id)?.nom ?? ''}` : '');
  const occupee = occupees.find((o) => o.point_de_vente_id === (pdv || pointsDeVente[0]?.id));
  return (
    <div className="ouverture-caisse">
      {occupee && <CaisseOccupee occupee={occupee} coupures={coupures} onFermee={onFermee} />}
      <form className="carte formulaire" onSubmit={valider}>
        <h2>Ouvrir la caisse</h2>
        {fermees > 0 && (
          <p className="encart" role="status">La caisse précédente a été fermée automatiquement (fin de journée). Ses espèces se comptent dans Clôture de caisse.</p>
        )}
        <p className="texte-doux">Comptez les espèces présentes dans le tiroir avant la première vente.</p>
        {pointsDeVente.length === 1 && multiHub && <p><strong>{pointsDeVente[0].nom}</strong>{nomHub(pointsDeVente[0])}</p>}
        {pointsDeVente.length > 1 && (
          <Champ libelle="Caisse">
            <select value={pdv} onChange={(e) => setPdv(e.target.value)}>
              {pointsDeVente.map((p) => <option key={p.id} value={p.id}>{p.nom}{nomHub(p)}</option>)}
            </select>
          </Champ>
        )}
        <Champ libelle="Fond de caisse (espèces)">
          <input type="number" min="0" step="any" inputMode="decimal" value={fond} onChange={(e) => setFond(e.target.value)} placeholder="0" autoFocus />
        </Champ>
        <Erreur message={erreur} />
        <Bouton type="submit" variante="principal" chargement={chargement}>Ouvrir la caisse</Bouton>
      </form>
    </div>
  );
}

// Nouveau client en deux secondes : un numéro de téléphone suffit (le nom est facultatif).
// enregistrer_contact vérifie contacts.gerer dans la base ; le bouton n'est montré qu'à qui a ce droit.
export function ClientRapide({ onCree }) {
  const { api, etablissement } = useEspace();
  const [ouvert, setOuvert] = useState(false);
  const [telephone, setTelephone] = useState('');
  const [nom, setNom] = useState('');
  const [erreur, setErreur] = useState('');
  const [enCours, setEnCours] = useState(false);
  if (!ouvert) {
    return <Bouton icone="plus" className="bouton secondaire client-rapide-ouvrir" onClick={() => setOuvert(true)}>Nouveau client</Bouton>;
  }
  const creer = async () => {
    const tel = telephone.trim();
    if (tel.replace(/\D/g, '').length < 6) {
      setErreur('Tapez le numéro de téléphone du client.');
      return;
    }
    setEnCours(true);
    setErreur('');
    try {
      const contact = { type: 'client', nom: nom.trim() || tel, telephone: tel };
      const id = await api.rpc('enregistrer_contact', { p_etablissement_id: etablissement.id, p_contact: contact });
      onCree({ id, ...contact });
      setOuvert(false);
      setTelephone('');
      setNom('');
    } catch (err) {
      setErreur(err.message);
    } finally {
      setEnCours(false);
    }
  };
  return (
    <div className="client-rapide">
      <strong>Nouveau client</strong>
      <Champ libelle="Téléphone">
        <input type="tel" inputMode="tel" value={telephone} onChange={(e) => setTelephone(e.target.value)} placeholder="06 123 45 67" autoFocus />
      </Champ>
      <Champ libelle="Nom (facultatif)" aide="Sans nom, le numéro sert de nom.">
        <input value={nom} maxLength={120} onChange={(e) => setNom(e.target.value)} />
      </Champ>
      <Erreur message={erreur} />
      <div className="actions">
        <Bouton onClick={() => setOuvert(false)} disabled={enCours}>Annuler</Bouton>
        <Bouton variante="principal" onClick={creer} chargement={enCours}>Créer et choisir</Bouton>
      </div>
    </div>
  );
}

// serveurs : liste de noms pour « Servi par » (facultatif) ; sans elle, le champ n'apparaît pas. serviParInitial : serveur
// déjà choisi à la commande.
// avecPourboire : champ « Pourboire » facultatif (information seulement : le total de la vente ne change pas).
export function ModalePaiement({ total, contacts, contactId, onContact, onContactCree, onValider, onFermer, libelleRetour = 'Retour au panier', serveurs, serviParInitial = '', avecPourboire = false }) {
  const { montant, devise, peut } = useEspace();
  // Clients créés dans cette fenêtre : visibles tout de suite, avant le rechargement des données.
  const [nouveaux, setNouveaux] = useState([]);
  const tousContacts = [...contacts, ...nouveaux.filter((n) => !contacts.some((c) => c.id === n.id))];
  const [paiements, setPaiements] = useState([{ mode: 'especes', montant: String(total), reference: '' }]);
  const [serviPar, setServiPar] = useState(serviParInitial);
  const [pourboire, setPourboire] = useState({ ouvert: false, montant: '', mode: 'especes' });
  const [erreur, setErreur] = useState('');
  const [chargement, setChargement] = useState(false);
  const verse = paiements.reduce((s, p) => s + Number(p.montant || 0), 0);
  const monnaie = Math.max(verse - total, 0);
  const reste = Math.max(total - verse, 0);
  const modifier = (i, champ, valeur) => setPaiements((liste) => liste.map((p, j) => (j === i ? { ...p, [champ]: valeur } : p)));
  const ajouter = (mode) => setPaiements((liste) => [...liste, { mode, montant: String(reste || ''), reference: '' }]);
  const billets = devise === 'XAF' ? [1000, 2000, 5000, 10000] : [5, 10, 20, 50];
  const valider = async () => {
    setChargement(true);
    setErreur('');
    try {
      const montantPourboire = Number(String(pourboire.montant).replace(',', '.'));
      if (pourboire.montant !== '' && !(montantPourboire > 0)) throw new Error('Montant du pourboire invalide');
      await onValider(paiements.filter((p) => Number(p.montant) > 0).map((p) => ({ ...p, montant: Number(p.montant) })), {
        serviPar: serviPar.trim(),
        pourboire: avecPourboire && montantPourboire > 0 ? { montant: montantPourboire, mode: pourboire.mode } : null,
      });
    } catch (err) {
      setErreur(err.message);
      setChargement(false);
    }
  };
  return (
    <Modale
      titre="Encaissement"
      onFermer={onFermer}
      pied={(
        <>
          <Bouton onClick={onFermer}>{libelleRetour}</Bouton>
          <Bouton variante="principal" className="bouton principal bouton-valider-vente" onClick={valider} chargement={chargement}>Valider la vente</Bouton>
        </>
      )}
    >
      <div className="paiement-total">
        <span>À payer</span>
        <strong>{montant(total)}</strong>
      </div>
      {paiements.length === 1 && (
        <div className="modes-paiement" role="group" aria-label="Mode de paiement">
          {Object.entries(MODES_PAIEMENT).map(([id, libelle]) => (
            <button key={id} type="button" className={paiements[0].mode === id ? 'actif' : ''} aria-pressed={paiements[0].mode === id} onClick={() => modifier(0, 'mode', id)}>
              {libelle}
            </button>
          ))}
        </div>
      )}
      <div className="paiements-liste">
        {paiements.map((p, i) => (
          <div key={i} className={`paiement-ligne ${paiements.length === 1 ? 'seul' : ''}`}>
            <select value={p.mode} onChange={(e) => modifier(i, 'mode', e.target.value)} aria-label="Mode de paiement">
              {Object.entries(MODES_PAIEMENT).map(([id, libelle]) => <option key={id} value={id}>{libelle}</option>)}
            </select>
            <input type="number" min="0" step="any" inputMode="decimal" value={p.montant} onChange={(e) => modifier(i, 'montant', e.target.value)} aria-label="Montant" />
            {p.mode !== 'especes' && (
              <input value={p.reference} onChange={(e) => modifier(i, 'reference', e.target.value)} placeholder="Référence" aria-label="Référence" />
            )}
            {paiements.length > 1 && (
              <button className="icone-bouton" onClick={() => setPaiements((l) => l.filter((_, j) => j !== i))} aria-label="Retirer"><Icone nom="fermer" /></button>
            )}
          </div>
        ))}
      </div>
      {paiements[0]?.mode === 'especes' && paiements.length === 1 && (
        <div className="billets">
          {billets.map((b) => (
            <button key={b} type="button" onClick={() => modifier(0, 'montant', String(Number(paiements[0].montant || 0) >= total ? b : Number(paiements[0].montant || 0) + b))}>
              + {montant(b)}
            </button>
          ))}
          <button type="button" onClick={() => modifier(0, 'montant', String(total))}>Compte juste</button>
        </div>
      )}
      <details className="modes-rapides-plus" open={paiements.length > 1}>
        <summary>Payer avec deux moyens (ex. espèces + mobile money)</summary>
        <div className="modes-rapides">
          {Object.entries(MODES_PAIEMENT).map(([id, libelle]) => (
            <button key={id} type="button" onClick={() => ajouter(id)}>+ {libelle}</button>
          ))}
        </div>
      </details>
      {serveurs && (
        <Champ libelle={<>Servi par (facultatif)<PastilleNouveau /></>}>
          <input list="liste-serveurs" value={serviPar} maxLength={60} onChange={(e) => setServiPar(e.target.value)} placeholder="Nom du serveur" />
          <datalist id="liste-serveurs">{serveurs.map((n) => <option key={n} value={n} />)}</datalist>
          {serveurs.length > 0 && (
            <div className="puces serveurs-rapides">
              {serveurs.slice(0, 8).map((n) => (
                <button key={n} type="button" className={serviPar === n ? 'actif' : ''} onClick={() => setServiPar(serviPar === n ? '' : n)}>{n}</button>
              ))}
            </div>
          )}
        </Champ>
      )}
      {avecPourboire && (pourboire.ouvert ? (
        <fieldset className="pourboire">
          <legend>Pourboire (facultatif)<PastilleNouveau jusqua={NOUVEAU_LOT3_JUSQUA} /></legend>
          <Champ libelle="Montant du pourboire" aide="Pour le serveur : le total de la vente et le ticket Z ne changent pas.">
            <input type="number" min="0" step="any" inputMode="decimal" value={pourboire.montant}
              onChange={(e) => setPourboire((b) => ({ ...b, montant: e.target.value }))} placeholder="0" />
          </Champ>
          <div className="puces" role="group" aria-label="Pourboire reçu en">
            {[['especes', 'Espèces'], ['mobile_money', 'Mobile Money']].map(([id, libelle]) => (
              <button key={id} type="button" className={pourboire.mode === id ? 'actif' : ''} aria-pressed={pourboire.mode === id}
                onClick={() => setPourboire((b) => ({ ...b, mode: id }))}>{libelle}</button>
            ))}
          </div>
        </fieldset>
      ) : (
        <button type="button" className="lien pourboire-ouvrir" onClick={() => setPourboire((b) => ({ ...b, ouvert: true }))}>+ Pourboire</button>
      ))}
      <div className="paiement-resume">
        <div><span>Versé</span><strong>{montant(verse)}</strong></div>
        {monnaie > 0 && <div className="vert"><span>Monnaie à rendre</span><strong>{montant(monnaie)}</strong></div>}
        {reste > 0 && <div className="orange"><span>Il paiera plus tard (reste dû)</span><strong>{montant(reste)}</strong></div>}
      </div>
      {reste > 0 && (
        <>
          <Champ libelle="Qui paiera plus tard ?" aide="Obligatoire : choisissez le client qui doit le reste.">
            <select value={contactId ?? ''} onChange={(e) => onContact(e.target.value || null)}>
              <option value="">— Choisir —</option>
              {tousContacts.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
            </select>
          </Champ>
          {peut('contacts.gerer') && (
            <ClientRapide
              onCree={(contact) => {
                setNouveaux((liste) => [...liste, contact]);
                onContact(contact.id);
                onContactCree?.(contact);
              }}
            />
          )}
        </>
      )}
      <Erreur message={erreur} />
    </Modale>
  );
}

// Lignes offertes (bouton « Offrir », raison obligatoire) et happy hour (remise automatique) : voir offerts.js.
// serveur : bloc « Serveur » affiché en haut du panier (choix au début de la commande).
function Panier({ lignes, articles, options, onQuantite, onRetirer, onOffrir, onAnnulerOffert, onVider, remise, onRemise, contacts, contactId, onContact, onEncaisser, onAttente, serveur }) {
  const { montant } = useEspace();
  const totaux = totauxPanier(lignes, articles, options);
  const total = Math.max(totaux.sousTotal - Number(remise || 0), 0);
  return (
    <aside className="panier">
      <div className="panier-tete">
        <h2><Icone nom="panier" /> Panier</h2>
        {lignes.length > 0 && <button className="lien" onClick={onVider}>Vider</button>}
      </div>
      {serveur}
      <div className="panier-lignes">
        {lignes.length === 0 && <Vide titre="Panier vide" texte="Touchez un article pour l’ajouter." />}
        {lignes.map((l) => {
          const a = articles[l.article_id];
          const cle = cleLigne(l);
          const brut = a.prix_vente * l.quantite;
          const reduction = remiseLigne(l, a, options);
          return (
            <div key={cle} className={`panier-ligne ${l.offert ? 'offerte' : ''}`}>
              <div className="panier-libelle">
                <strong>{a.nom}</strong>
                <small>
                  {estVenteAuPoids(a.unite) && <span className="panier-poids">{formatQuantite(l.quantite, a.unite)} × </span>}
                  {montant(a.prix_vente)}{a.unite !== 'unité' ? ` / ${a.unite}` : ''}
                </small>
                {l.offert && (
                  <small className="panier-offert">
                    <Badge ton="vert">Offert</Badge> {texteRaison(l.offert)}
                    <button type="button" className="lien" onClick={() => onAnnulerOffert(cle)}>Ne plus offrir</button>
                  </small>
                )}
                {!l.offert && reduction > 0 && <small className="panier-happy">Happy hour : -{montant(reduction)}</small>}
              </div>
              <div className="quantite">
                <button onClick={() => onQuantite(cle, l.quantite - 1)} aria-label="Moins"><Icone nom="moins" taille={14} /></button>
                <input type="number" min="0" step="any" value={l.quantite} onChange={(e) => onQuantite(cle, Number(e.target.value))} aria-label={`Quantité ${a.nom}${l.offert ? ' offert' : ''}`} />
                <button onClick={() => onQuantite(cle, l.quantite + 1)} aria-label="Plus"><Icone nom="plus" taille={14} /></button>
              </div>
              <span className="panier-montant">
                {reduction > 0 && <s className="texte-doux">{montant(brut)}</s>}
                <strong>{montant(brut - reduction)}</strong>
              </span>
              <span className="panier-actions-ligne">
                {onOffrir && !l.offert && Number(a.prix_vente) > 0 && (
                  <button type="button" className="bouton-offrir" onClick={() => onOffrir(l)} aria-label={`Offrir ${a.nom}`}>Offrir</button>
                )}
                <button className="icone-bouton" onClick={() => onRetirer(cle)} aria-label={`Retirer ${a.nom}${l.offert ? ' offert' : ''}`}><Icone nom="fermer" taille={14} /></button>
              </span>
            </div>
          );
        })}
      </div>
      <div className="panier-pied">
        {/* Client et remise : repliés pour laisser le bouton Encaisser toujours visible sur tablette. */}
        <details className="panier-options" open={Boolean(contactId) || Number(remise) > 0 ? true : undefined}>
          <summary>
            Client et remise
            <small>{[contacts.find((c) => c.id === contactId)?.nom ?? 'Client de passage', Number(remise) > 0 ? `remise ${montant(Number(remise))}` : null].filter(Boolean).join(' · ')}</small>
          </summary>
          <Champ libelle="Contact (facultatif)">
            <select value={contactId ?? ''} onChange={(e) => onContact(e.target.value || null)}>
              <option value="">Client de passage</option>
              {contacts.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
            </select>
          </Champ>
          <div className="panier-totaux">
            <div><span>Sous-total</span><span>{montant(totaux.brut)}</span></div>
            {totaux.happyHour > 0 && <div className="vert"><span>Happy hour</span><span>-{montant(totaux.happyHour)}</span></div>}
            {totaux.offerts > 0 && <div className="vert"><span>Offerts</span><span>-{montant(totaux.offerts)}</span></div>}
            <div className="remise">
              <span>Remise</span>
              <input type="number" min="0" step="any" value={remise} onChange={(e) => onRemise(e.target.value)} placeholder="0" aria-label="Remise" />
            </div>
          </div>
        </details>
        <div className="panier-total"><span>Total</span><strong>{montant(total)}</strong></div>
        <div className="panier-actions">
          {onAttente && lignes.length > 0 && <Bouton icone="horloge" onClick={onAttente}>Facture en cours</Bouton>}
          <Bouton variante="principal grand" className="bouton principal grand bouton-encaisser" disabled={!lignes.length} onClick={() => onEncaisser(total)}>
            Encaisser {lignes.length > 0 && montant(total)}
          </Bouton>
        </div>
      </div>
    </aside>
  );
}

// « Offrir » : la raison est obligatoire (« Autre » demande une précision) ; quantité à offrir si la ligne en a plusieurs.
export function ModaleOffrir({ ligne, article, onValider, onFermer }) {
  const { montant } = useEspace();
  const [raison, setRaison] = useState('');
  const [precision, setPrecision] = useState('');
  const [quantite, setQuantite] = useState(String(ligne.quantite));
  const [erreur, setErreur] = useState('');
  const q = Math.min(Number(String(quantite).replace(',', '.')) || 0, ligne.quantite);
  const valider = (e) => {
    e.preventDefault();
    if (!raison) return setErreur('Choisissez la raison.');
    if (raison === 'Autre' && !precision.trim()) return setErreur('Précisez la raison.');
    if (!(q > 0)) return setErreur('Indiquez combien offrir.');
    return onValider(q, { raison, precision });
  };
  return (
    <Modale titre="Offrir" onFermer={onFermer}>
      <form className="formulaire" onSubmit={valider}>
        <p><strong>{article.nom}</strong> · {formatQuantite(q, article.unite)} offert(s) = {montant(article.prix_vente * q)}</p>
        {ligne.quantite > 1 && (
          <Champ libelle="Combien offrir ?" aide={`Le reste (${formatQuantite(Math.max(ligne.quantite - q, 0))}) reste payant.`}>
            <input type="number" min="0" max={ligne.quantite} step="any" inputMode="decimal" value={quantite} onChange={(e) => setQuantite(e.target.value)} />
          </Champ>
        )}
        <div className="puces puces-raisons" role="group" aria-label="Raison de l’offert">
          {RAISONS_OFFERT.map((r) => (
            <button key={r} type="button" className={raison === r ? 'actif' : ''} aria-pressed={raison === r} onClick={() => { setRaison(r); setErreur(''); }}>{r}</button>
          ))}
        </div>
        <Champ libelle={raison === 'Autre' ? 'Précisez la raison' : 'Précision (facultatif)'}>
          <input value={precision} maxLength={120} onChange={(e) => setPrecision(e.target.value)} placeholder="Ex. anniversaire, plat refroidi" />
        </Champ>
        <Erreur message={erreur} />
        <div className="actions">
          <Bouton type="button" onClick={onFermer}>Annuler</Bouton>
          <Bouton type="submit" variante="principal">Offrir</Bouton>
        </div>
      </form>
    </Modale>
  );
}

// « Combien ? » : article vendu au poids (kg, litre, mètre…). Gros boutons, autre poids, ou « pour un montant ».
export function ModaleCombien({ article, onValider, onFermer }) {
  const { montant } = useEspace();
  const [autre, setAutre] = useState('');
  const [somme, setSomme] = useState('');
  const unite = article.unite;
  const parMontant = quantitePourMontant(somme, article.prix_vente);
  const autrePoids = arrondirQuantite(autre);
  const quantite = parMontant > 0 ? parMontant : autrePoids;
  const valider = (e) => {
    e.preventDefault();
    if (quantite > 0) onValider(quantite);
  };
  return (
    <Modale titre="Combien ?" onFermer={onFermer}>
      <div className="combien">
        <p className="combien-article"><strong>{article.nom}</strong> · {montant(article.prix_vente)} / {unite}</p>
        <div className="combien-boutons">
          {FRACTIONS.map((f) => (
            <button key={f.valeur} type="button" onClick={() => onValider(f.valeur)}>
              <strong>{f.libelle} {unite}</strong>
              <small>{montant(article.prix_vente * f.valeur)}</small>
            </button>
          ))}
        </div>
        <form className="formulaire" onSubmit={valider}>
          <Champ libelle={`Autre poids (en ${unite})`}>
            <input type="number" min="0" step="any" inputMode="decimal" value={autre}
              onChange={(e) => { setAutre(e.target.value); setSomme(''); }} placeholder="Ex. 1,5" />
          </Champ>
          <Champ libelle="Pour un montant" aide="Le client veut pour une somme précise : la quantité se calcule toute seule.">
            <input type="number" min="0" step="any" inputMode="decimal" value={somme}
              onChange={(e) => { setSomme(e.target.value); setAutre(''); }} placeholder="Ex. 500" />
          </Champ>
          {quantite > 0 && (
            <p className="combien-resultat" role="status">
              = <strong>{formatQuantite(quantite, unite)}</strong> · {montant(article.prix_vente * quantite)}
            </p>
          )}
          <div className="actions">
            <Bouton type="button" onClick={onFermer}>Annuler</Bouton>
            <Bouton type="submit" variante="principal" disabled={!(quantite > 0)}>Ajouter au panier</Bouton>
          </div>
        </form>
      </div>
    </Modale>
  );
}

function ModaleMiseEnAttente({ onValider, onFermer }) {
  const [libelle, setLibelle] = useState('');
  const [erreur, setErreur] = useState('');
  const [enCours, setEnCours] = useState(false);
  const valider = async (e) => {
    e.preventDefault();
    setEnCours(true);
    setErreur('');
    try {
      await onValider(libelle.trim());
    } catch (err) {
      setErreur(err.message);
      setEnCours(false);
    }
  };
  return (
    <Modale titre="Nouvelle facture en cours" onFermer={onFermer}>
      <form className="formulaire" onSubmit={valider}>
        <Champ libelle="Nom de la facture (client ou table)" aide="Ex. « Table 4 », « M. Mavoungou ». Le client continue de consommer ; le stock ne bouge pas tant que la facture n’est pas encaissée.">
          <input value={libelle} maxLength={60} onChange={(e) => setLibelle(e.target.value)} autoFocus />
        </Champ>
        <Erreur message={erreur} />
        <div className="actions">
          <Bouton type="button" onClick={onFermer}>Annuler</Bouton>
          <Bouton type="submit" variante="principal" chargement={enCours}>Garder en facture en cours</Bouton>
        </div>
      </form>
    </Modale>
  );
}

function ModaleAttentes({ attentes, panierOccupe, maintenant, onAction, onFermer }) {
  const { montant } = useEspace();
  const [erreur, setErreur] = useState('');
  const agir = async (a, action) => {
    setErreur('');
    try {
      await onAction(a, action);
    } catch (err) {
      setErreur(err.message);
    }
  };
  return (
    <Modale titre={`Factures en cours · ${montant(totalFactures(attentes))}`} onFermer={onFermer}>
      {panierOccupe && <p className="bandeau attention">Le panier n’est pas vide : encaissez-le ou gardez-le en facture en cours avant d’en reprendre une autre.</p>}
      <Erreur message={erreur} />
      <ul className="liste-attentes">
        {attentes.map((a) => {
          const attente = attenteFacture(a.cree_le, maintenant);
          return (
            <li key={a.id} className={`facture-${attente.ton}`}>
              <span>
                <strong>{a.libelle}</strong>
                <small className="texte-doux bloc">{attente.minutes < 1 ? 'ouverte à l’instant' : `ouverte il y a ${attente.texte}`} · {a.lignes.length} ligne(s) · {montant(a.total_estime)}{a.transmise ? ' · reçue de la caisse précédente' : ''}</small>
              </span>
              <span className="actions-ligne">
                <Bouton variante="principal" disabled={panierOccupe} onClick={() => agir(a, 'reprendre')}>Reprendre</Bouton>
                <button type="button" className="lien danger" onClick={() => agir(a, 'abandonner')}>Abandonner</button>
              </span>
            </li>
          );
        })}
      </ul>
    </Modale>
  );
}

// Bande toujours visible en haut de la caisse : une carte par facture en cours (nom, montant, temps, couleur).
function BandeFactures({ attentes, maintenant, panierOccupe, onReprendre, onToutVoir }) {
  const { montant } = useEspace();
  if (!attentes?.length) return null;
  return (
    <div className="bande-factures" role="region" aria-label="Factures en cours">
      <button type="button" className="bande-factures-tete" onClick={onToutVoir}>
        <strong>{attentes.length} facture{attentes.length > 1 ? 's' : ''} en cours</strong>
        <span>{montant(totalFactures(attentes))}</span>
      </button>
      <div className="bande-factures-cartes">
        {attentes.map((a) => {
          const attente = attenteFacture(a.cree_le, maintenant);
          return (
            <button key={a.id} type="button" className={`carte-facture facture-${attente.ton}`}
              title={panierOccupe ? 'Encaissez ou gardez d’abord le panier en cours' : 'Reprendre cette facture'}
              onClick={() => (panierOccupe ? onToutVoir() : onReprendre(a))}>
              <strong>{a.libelle}</strong>
              <span className="carte-facture-montant">{montant(a.total_estime)}</span>
              <small>{attente.texte}{a.transmise ? ' · caisse précédente' : ''}</small>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function Caisse({ naviguer }) {
  const { api, etablissement, montant, notifier, peut, hubs, hub, multiHub, utilisateur, devise } = useEspace();
  const etab = etablissement.id;
  // Caisses visibles : celles des Hubs autorisés, ou du seul Hub choisi.
  const hubsCaisse = (multiHub && hub ? [hub] : hubs).filter((h) => h.capacite_caisse).map((h) => h.id);
  const { donnees: donneesChargees, chargement, erreur, recharger } = useDonnees(async () => {
    // Fin de journée (Paramètres › Clôture, minuit par défaut) : la caisse de la veille est fermée avant d'afficher la caisse.
    const fermees = await api.rpc('fermer_caisses_du_jour', { p_etablissement_id: etab }).catch(() => 0);
    const [articles, stock, categories, contacts, sessions, pointsDeVente, attentes, reglagesCloture, reglagesCaisse, commandesQr, happyHours, serveurs, occupees] = await Promise.all([
      api.lire('articles', { eq: { etablissement_id: etab, actif: true }, ordre: ['nom'] }).then(sansArticleTechnique),
      api.lire('stock_hubs', { eq: { etablissement_id: etab } }),
      api.lire('categories_articles', { eq: { etablissement_id: etab, actif: true }, ordre: ['nom'] }),
      api.lire('contacts', { eq: { etablissement_id: etab, actif: true }, ordre: ['nom'] }),
      api.lire('sessions_caisse', { eq: { etablissement_id: etab, statut: 'ouverte' } }),
      api.lire('points_de_vente', { eq: { etablissement_id: etab, actif: true }, ordre: ['cree_le'] }),
      // Ventes en attente (migration 20261010000102) : sans la table, la fonction est simplement masquée.
      api.lire('ventes_en_attente', { eq: { etablissement_id: etab, statut: 'en_attente' }, ordre: ['cree_le'] }).catch(() => null),
      // Coupures pour compter le tiroir à la fermeture de caisse.
      api.lire('etablissement_parametres', { eq: { etablissement_id: etab, module_id: 'cloture' } }).catch(() => []),
      // Réglages caisse : noms proposés pour « Servi par ».
      api.lire('etablissement_parametres', { eq: { etablissement_id: etab, module_id: 'caisse' } }).catch(() => []),
      // Commandes envoyées depuis les QR codes des tables, pas encore prises.
      api.lire('commandes_qr', { eq: { etablissement_id: etab, statut: 'nouvelle' } }).catch(() => []),
      // Happy hours (migration 20261017000135) : sans la table, aucune remise automatique.
      api.lire('happy_hours', { eq: { etablissement_id: etab, actif: true } }).catch(() => []),
      // Serveurs enregistrés (migration 20261013100133) et caisse occupée par une autre personne.
      api.lire('serveurs_caisse', { eq: { etablissement_id: etab, actif: true }, ordre: ['prenom'] }).catch(() => []),
      api.rpc('caisse_occupee', { p_etablissement_id: etab }).catch(() => []),
    ]);
    const caisses = pointsDeVente.filter((p) => hubsCaisse.includes(p.hub_id));
    return {
      articles, stock, happyHours: happyHours ?? [], commandesQr: (commandesQr ?? []).length, contacts: contacts.filter((c) => c.type !== 'fournisseur'),
      // Ordre choisi dans Articles › Catégories, puis alphabétique.
      categories: [...categories].sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0) || a.nom.localeCompare(b.nom, 'fr')),
      // Seules les caisses ouvertes avec MON compte : personne ne vend sur la caisse d'une autre personne.
      sessions: mesCaisses(sessions, utilisateur).filter((x) => caisses.some((p) => p.id === x.point_de_vente_id)), pointsDeVente: caisses, attentes, fermees, coupures: lireCoupures(reglagesCloture[0]?.data?.coupures), serveursReglage: reglagesCaisse[0]?.data?.serveurs ?? '',
      // Caisses ouvertes (toutes personnes) : une facture en cours d'une caisse fermée passe à la caissière suivante.
      ouvertes: (sessions ?? []).map((x) => x.id),
      serveurs: serveurs ?? [],
      occupees: (occupees ?? []).filter((o) => !o.mienne),
    };
  }, [etab, hubsCaisse.join(), utilisateur?.id]);
  // Synchronisation stock ↔ caisse : relecture légère (stock, articles, commandes des tables) toutes les 30 s et au
  // retour sur l'onglet ; remise à zéro à chaque rechargement complet.
  const [frais, setFrais] = useState(null);
  useEffect(() => setFrais(null), [donneesChargees]);
  useEffect(() => {
    if (!donneesChargees) return undefined;
    let actif = true;
    const relire = async () => {
      if (document.visibilityState === 'hidden') return;
      try {
        const [articles, stock, commandesQr, happyHours] = await Promise.all([
          api.lire('articles', { eq: { etablissement_id: etab, actif: true }, ordre: ['nom'] }).then(sansArticleTechnique),
          api.lire('stock_hubs', { eq: { etablissement_id: etab } }),
          api.lire('commandes_qr', { eq: { etablissement_id: etab, statut: 'nouvelle' } }).catch(() => []),
          api.lire('happy_hours', { eq: { etablissement_id: etab, actif: true } }).catch(() => []),
        ]);
        if (actif) setFrais({ articles, stock, commandesQr: commandesQr.length, happyHours });
      } catch {
        // Réseau coupé un instant : on garde ce qui est affiché.
      }
    };
    const t = setInterval(relire, RAFRAICHIR_CAISSE_MS);
    window.addEventListener('focus', relire);
    return () => {
      actif = false;
      clearInterval(t);
      window.removeEventListener('focus', relire);
    };
  }, [api, etab, donneesChargees]);
  const donnees = useMemo(() => (donneesChargees && frais ? { ...donneesChargees, ...frais } : donneesChargees), [donneesChargees, frais]);
  const [commandesTables, setCommandesTables] = useState(false);
  const [pdvChoisi, setPdvChoisi] = useState(null);
  const [lignes, setLignes] = useState([]);
  const [remise, setRemise] = useState('');
  const [contactId, setContactId] = useState(null);
  const [recherche, setRecherche] = useState('');
  // null = choix automatique : « Favoris » s'il y en a assez, sinon « Tout ».
  const [categorie, setCategorie] = useState(null);
  const [combien, setCombien] = useState(null);
  // Ligne à offrir (fenêtre « Offrir » : raison obligatoire).
  const [aOffrir, setAOffrir] = useState(null);
  // Favoris : quantités vendues par article, retenues sur cet appareil pour cet établissement.
  const [compteurs, setCompteurs] = useState(() => lireFavoris(etab));
  useEffect(() => {
    setCompteurs(lireFavoris(etab));
    setCategorie(null);
  }, [etab]);
  const compterFavoris = (lignesVendues, sens) => {
    const suivant = compterVente(lireFavoris(etab), lignesVendues, sens);
    enregistrerFavoris(etab, suivant);
    setCompteurs(suivant);
  };
  const [paiement, setPaiement] = useState(null);
  // Serveur choisi au début de la commande ; le dernier choix reste sur cette tablette.
  const [serveur, setServeurEtat] = useState(() => lireServeurChoisi(etab));
  const setServeur = (prenom) => {
    setServeurEtat(prenom);
    retenirServeurChoisi(etab, prenom);
  };
  useEffect(() => setServeurEtat(lireServeurChoisi(etab)), [etab]);
  const [recu, setRecu] = useState(null);
  const [panierMobile, setPanierMobile] = useState(false);
  const [miseEnAttente, setMiseEnAttente] = useState(false);
  const [listeAttente, setListeAttente] = useState(false);
  // Horloge pour le temps d'attente des factures en cours (rafraîchi chaque minute).
  const [maintenant, setMaintenant] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setMaintenant(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);
  // Caisse fermée depuis le pop-up « Tu continues ? » / « Tu es toujours là ? » : on recharge.
  useEffect(() => {
    window.addEventListener(EVENEMENT_CAISSE_FERMEE, recharger);
    return () => window.removeEventListener(EVENEMENT_CAISSE_FERMEE, recharger);
  }, [recharger]);
  // Fermeture de caisse depuis la caisse : comptage, puis MON ticket Z.
  const [fermeture, setFermeture] = useState(false);
  const [ticketZ, setTicketZ] = useState(null);

  const parId = useMemo(() => Object.fromEntries((donnees?.articles ?? []).map((a) => [a.id, a])), [donnees]);
  const session = donnees?.sessions.find((s) => s.point_de_vente_id === pdvChoisi) ?? donnees?.sessions[0];
  // Le stock affiché est celui du Hub de la caisse ouverte (c'est lui que la vente débitera).
  const stockParId = useMemo(
    () => Object.fromEntries((donnees?.stock ?? []).filter((s) => s.hub_id === session?.hub_id).map((s) => [s.article_id, Number(s.quantite)])),
    [donnees, session?.hub_id]
  );

  if (chargement && !donnees) return <Chargement />;
  if (erreur) return <Erreur message={erreur} />;
  // Ticket Z qui vient d'être édité : il reste affiché même si la caisse est maintenant fermée.
  const modaleTicketZ = ticketZ && <ModaleZ key={ticketZ.id} z={ticketZ} deconnexion onFermer={() => setTicketZ(null)} />;
  if (!session) {
    return (
      <>
        <OuvertureCaisse
          pointsDeVente={donnees.pointsDeVente}
          fermees={donnees.fermees}
          occupees={donnees.occupees}
          coupures={donnees.coupures ?? []}
          onFermee={(z) => { setTicketZ(z); recharger(); }}
          onOuvrir={async (pdv, fond) => {
            await api.rpc('ouvrir_caisse', { p_etablissement_id: etab, p_point_de_vente_id: pdv, p_fond_initial: fond });
            notifier('Caisse ouverte');
            recharger();
          }}
        />
        {modaleTicketZ}
      </>
    );
  }

  const texte = recherche.trim().toLowerCase();
  const favoris = classerFavoris(compteurs, donnees.articles.map((a) => a.id));
  const filtre = categorie === FAVORIS && !favoris.length ? '' : categorie ?? (favoris.length >= MIN_FAVORIS_AUTO ? FAVORIS : '');
  // Une recherche tapée cherche toujours dans tout le catalogue, même depuis « Favoris ».
  const visibles = filtre === FAVORIS && !texte
    ? favoris.map((id) => parId[id])
    : donnees.articles.filter((a) => (!filtre || filtre === FAVORIS || a.categorie_id === filtre)
      && (!texte || a.nom.toLowerCase().includes(texte) || (a.reference ?? '').toLowerCase().includes(texte) || (a.code_barres ?? '') === texte));
  const pdvNom = donnees.pointsDeVente.find((p) => p.id === session.point_de_vente_id)?.nom;
  const nombreArticles = lignes.reduce((s, l) => s + l.quantite, 0);
  // Happy hour : évalué à l'heure de l'appareil, rafraîchie chaque minute (« maintenant »).
  const optionsRemise = { creneaux: donnees.happyHours ?? [], date: new Date(maintenant), decimales: decimalesDevise(devise) };
  const happyHour = happyHourEnCours(donnees.happyHours ?? [], new Date(maintenant));
  // Total de la barre du bas (téléphone, tablette debout) : mêmes remises que le panier (happy hour, offerts).
  const totalPanier = Math.max(totauxPanier(lignes.filter((l) => parId[l.article_id]), parId, optionsRemise).sousTotal - Number(remise || 0), 0);
  // Le serveur choisi reste affiché même avant la relecture de la liste (prénom tout juste créé).
  const serveursListe = listeServeurs(donnees.serveurs, [...nomsServeurs(donnees.serveursReglage), serveur].filter(Boolean));

  const ajouter = (article, quantite = 1) => {
    setLignes((liste) => ajouterAuPanier(liste, article.id, arrondirQuantite(quantite)));
  };
  // Article au poids : on demande « Combien ? » ; article à l'unité : une touche = un de plus.
  const toucher = (article) => {
    if (estVenteAuPoids(article.unite)) setCombien(article);
    else ajouter(article);
  };
  // cle : article_id, ou article_id + « :offert » pour la ligne offerte du même article.
  const changerQuantite = (cle, quantite) => setLignes((liste) => changerQuantiteLigne(liste, cle, quantite));
  const vider = () => {
    setLignes([]);
    setRemise('');
    setContactId(null);
  };

  const validerVente = async (paiements, { serviPar, pourboire } = {}) => {
    let resultat;
    const offerts = offertsPourVente(lignes);
    const note = noteOfferts(lignes, parId);
    try {
      resultat = await api.rpc('enregistrer_vente', {
        p_etablissement_id: etab,
        p_session_id: session.id,
        // Remise par ligne : offert (prix complet) ou happy hour.
        p_lignes: lignesPourVente(lignes, parId, { ...optionsRemise, date: new Date() }),
        p_paiements: paiements,
        p_contact_id: contactId,
        p_remise: Number(remise || 0),
        ...(note ? { p_note: note } : {}),
      });
    } catch (err) {
      // Heure de fin de journée passée : la caisse se ferme, le panier reste pour la caisse du jour.
      if (/Journée de caisse terminée|déjà clôturée/.test(err.message)) {
        setPaiement(null);
        recharger();
      }
      throw err;
    }
    // Servi par : la vente est déjà enregistrée ; un échec ici ne la remet pas en cause. Un prénom nouveau rejoint la
    // liste des serveurs (pour toutes les tablettes) et reste choisi pour la commande suivante.
    if (serviPar) {
      setServeur(serviPar);
      await api.rpc('indiquer_serveur_vente', { p_vente_id: resultat.vente_id, p_nom: serviPar })
        .catch((err) => notifier(`Serveur non enregistré : ${err.message}`, 'erreur'));
    }
    // Raison des offerts (aussi écrite dans la note de la vente) et pourboire : la vente reste valable si l'un échoue.
    if (offerts.length) {
      await api.rpc('enregistrer_offerts_vente', { p_vente_id: resultat.vente_id, p_offerts: offerts })
        .catch((err) => notifier(`Raison de l’offert non enregistrée : ${err.message}`, 'erreur'));
    }
    if (pourboire) {
      await api.rpc('enregistrer_pourboire', { p_vente_id: resultat.vente_id, p_montant: pourboire.montant, p_mode: pourboire.mode, p_serveur: serviPar || null })
        .then(() => notifier(`Pourboire de ${montant(pourboire.montant)} enregistré`))
        .catch((err) => notifier(`Pourboire non enregistré : ${err.message}`, 'erreur'));
    }
    const lignesVendues = lignes;
    compterFavoris(lignesVendues, 1);
    setPaiement(null);
    setPanierMobile(false);
    vider();
    setRecu({ ...resultat, lignesVendues });
    notifier(`Vente ${resultat.numero} enregistrée`);
    recharger();
  };

  // Les factures en cours sur MA caisse, et celles d'une caisse déjà fermée (ticket Z tiré) : elles passent à la
  // caissière suivante, qui les encaisse sur SA caisse.
  const attentes = donnees.attentes
    ?.filter((a) => a.session_caisse_id === session.id || !donnees.ouvertes.includes(a.session_caisse_id))
    .map((a) => (a.session_caisse_id === session.id ? a : { ...a, transmise: true })) ?? null;
  const prenomServeur = (id) => donnees.serveurs.find((x) => x.id === id)?.prenom ?? '';
  const mettreEnAttente = async (libelle) => {
    // Sans nom, la facture s'appelle « Facture 1 », « Facture 2 »…
    const nom = libelle || `Facture ${(attentes?.length ?? 0) + 1}`;
    const id = await api.rpc('mettre_vente_en_attente', {
      p_session_id: session.id, p_lignes: lignes, p_libelle: nom, p_contact_id: contactId, p_remise: Number(remise || 0),
    });
    // Le serveur suit la facture jusqu'à l'encaissement.
    if (serveur) {
      await api.rpc('enregistrer_serveur', { p_etablissement_id: etab, p_prenom: serveur })
        .then((s) => api.rpc('indiquer_serveur_attente', { p_attente_id: id, p_serveur_id: s.id }))
        .catch((err) => notifier(`Serveur non noté sur la facture : ${err.message}`, 'erreur'));
    }
    setMiseEnAttente(false);
    setPanierMobile(false);
    vider();
    notifier(`Facture en cours : « ${nom} »`);
    recharger();
  };
  const terminerAttente = async (attente, action) => {
    const r = await api.rpc('terminer_vente_en_attente', { p_id: attente.id, p_action: action });
    if (action === 'reprendre') {
      // Un article archivé entre-temps n'est pas repris ; le prix est celui du moment de la vente.
      // Les offerts ne sont pas gardés dans une facture en cours : on les refait à l'encaissement.
      setLignes(fusionnerLignes(r.lignes.filter((l) => parId[l.article_id]).map((l) => ({ article_id: l.article_id, quantite: Number(l.quantite) }))));
      setRemise(Number(r.remise) ? String(r.remise) : '');
      setContactId(r.contact_id ?? null);
      if (attente.serveur_id && prenomServeur(attente.serveur_id)) setServeur(prenomServeur(attente.serveur_id));
      notifier(`Facture « ${r.libelle} » reprise`);
    } else notifier(`Facture « ${r.libelle} » abandonnée`);
    setListeAttente(false);
    recharger();
  };

  const recherchePrecise = (e) => {
    if (e.key !== 'Enter') return;
    const exact = donnees.articles.find((a) => a.code_barres === recherche.trim() || a.reference === recherche.trim());
    if (exact) {
      toucher(exact);
      setRecherche('');
    }
  };

  return (
    <div className="caisse">
      <section className="caisse-catalogue">
        <div className="caisse-barre">
          <div className="caisse-session">
            <Badge ton="vert">Caisse ouverte</Badge>
            <span>{pdvNom}{multiHub ? ` · ${hubs.find((h) => h.id === session.hub_id)?.nom ?? ''}` : ''} · depuis {formatDateHeure(session.ouverte_le)}</span>
            {donnees.sessions.length > 1 && (
              <select value={session.point_de_vente_id} onChange={(e) => setPdvChoisi(e.target.value)} aria-label="Caisse">
                {donnees.sessions.map((s) => <option key={s.id} value={s.point_de_vente_id}>{donnees.pointsDeVente.find((p) => p.id === s.point_de_vente_id)?.nom}</option>)}
              </select>
            )}
          </div>
          {attentes?.length > 0 && (
            <Bouton icone="horloge" onClick={() => setListeAttente(true)}>
              Factures en cours <span className="pastille-compte" aria-label={`${attentes.length} facture(s)`}>{attentes.length}</span>
            </Bouton>
          )}
          {donnees.commandesQr > 0 && (
            <Bouton icone="table" onClick={() => setCommandesTables(true)}>
              Commandes des tables <span className="pastille-compte" aria-label={`${donnees.commandesQr} commande(s)`}>{donnees.commandesQr}</span>
            </Bouton>
          )}
          <Bouton icone="cloture" variante="principal" onClick={() => setFermeture(true)}>Fermeture de caisse</Bouton>
        </div>
        <BandeauNouveau jusqua={NOUVEAU_CAISSE_UNIQUE_JUSQUA}>
          Une seule caisse ouverte à la fois : la suivante ouvre après ton ticket Z. Choisis le serveur en haut du panier
          (« + Nouveau serveur » une seule fois). Sur tablette, le bouton Encaisser reste toujours en bas de l’écran.
        </BandeauNouveau>
        <BandeauNouveau jusqua={NOUVEAU_PRESENCE_JUSQUA}>
          À la connexion, « Tu continues ? » si ta caisse est encore ouverte. Sans activité, « Tu es toujours là ? » avec un compte
          à rebours avant la déconnexion (la caisse reste ouverte).
        </BandeauNouveau>
        {happyHour && <p className="bandeau-happy-hour" role="status">{texteBandeau(happyHour)}</p>}
        <BandeauNouveau jusqua={NOUVEAU_LOT3_JUSQUA}>
          Happy hour automatique, bouton « Offrir » avec la raison, pourboire à l’encaissement et « Plus que N » quand le stock
          atteint son minimum.
        </BandeauNouveau>
        <BandeFactures
          attentes={attentes}
          maintenant={maintenant}
          panierOccupe={lignes.length > 0}
          onReprendre={(a) => terminerAttente(a, 'reprendre').catch((err) => notifier(err.message, 'erreur'))}
          onToutVoir={() => setListeAttente(true)}
        />
        <div onKeyDown={recherchePrecise}>
          <Recherche valeur={recherche} onChange={setRecherche} placeholder="Nom, référence ou code-barres" />
        </div>
        <div className="puces">
          {favoris.length > 0 && (
            <button className={filtre === FAVORIS ? 'actif' : ''} onClick={() => setCategorie(FAVORIS)}>★ Favoris</button>
          )}
          <button className={!filtre ? 'actif' : ''} onClick={() => setCategorie('')}>Tout</button>
          {donnees.categories.map((c) => (
            <button key={c.id} className={filtre === c.id ? 'actif' : ''} onClick={() => setCategorie(c.id)}>{c.nom}</button>
          ))}
        </div>
        {donnees.articles.length === 0 && (
          <Vide titre="Aucun article" texte="Créez vos articles avant de vendre." action={peut('articles.gerer') && <Bouton onClick={() => naviguer('articles')}>Créer un article</Bouton>} />
        )}
        <div className="grille-articles">
          {visibles.map((a) => {
            const quantite = stockParId[a.id] ?? 0;
            const dansPanier = lignes.filter((l) => l.article_id === a.id).reduce((t, l) => t + l.quantite, 0);
            const epuise = a.suivi_stock && quantite - dansPanier <= 0;
            const alerte = a.suivi_stock && !epuise ? alerteStock(quantite - dansPanier, a.stock_minimum) : null;
            return (
              <button key={a.id} className={`tuile-article ${epuise ? 'epuise' : ''}`} onClick={() => toucher(a)}>
                <VignetteArticle article={a} />
                <span className="tuile-nom">{a.nom}</span>
                <strong className="tuile-prix">{montant(a.prix_vente)}</strong>
                {a.suivi_stock && (alerte
                  ? <span className="tuile-stock bas tuile-alerte">{alerte}</span>
                  : <span className={`tuile-stock ${quantite <= a.stock_minimum ? 'bas' : ''}`}>{formatQuantite(quantite - dansPanier, a.unite)} en stock</span>
                )}
                {dansPanier > 0 && <span className="tuile-compte">{formatQuantite(dansPanier, estVenteAuPoids(a.unite) ? a.unite : undefined)}</span>}
              </button>
            );
          })}
        </div>
      </section>
      <div className={`panier-conteneur ${panierMobile ? 'ouvert' : ''}`}>
        <Panier
          lignes={lignes.filter((l) => parId[l.article_id])}
          articles={parId}
          options={optionsRemise}
          onQuantite={changerQuantite}
          onRetirer={(cle) => changerQuantite(cle, 0)}
          onOffrir={peut('caisse.remise_libre') ? setAOffrir : null}
          onAnnulerOffert={(cle) => setLignes((liste) => annulerOffert(liste, cle))}
          onVider={vider}
          remise={remise}
          onRemise={setRemise}
          contacts={donnees.contacts}
          contactId={contactId}
          onContact={setContactId}
          onEncaisser={(total) => setPaiement({ total })}
          onAttente={attentes ? () => setMiseEnAttente(true) : null}
          serveur={<ChoixServeur serveurs={serveursListe} valeur={serveur} onChange={setServeur} onCree={() => recharger()} compact />}
        />
        <button className="panier-fermer-mobile" onClick={() => setPanierMobile(false)}>Continuer les achats</button>
      </div>
      {/* Tablette debout et téléphone : barre toujours visible en bas, on encaisse sans ouvrir le panier. */}
      <div className="barre-encaisser">
        <button type="button" className="barre-encaisser-panier" onClick={() => setPanierMobile(true)}>
          <Icone nom="panier" />
          <span>{formatQuantite(nombreArticles)} article(s){serveur ? ` · ${serveur}` : ''}</span>
          <small>voir le panier</small>
        </button>
        <button type="button" className="barre-encaisser-bouton" disabled={!lignes.length} onClick={() => setPaiement({ total: totalPanier })}>
          Encaisser {lignes.length > 0 && montant(totalPanier)}
        </button>
      </div>
      {miseEnAttente && <ModaleMiseEnAttente onValider={mettreEnAttente} onFermer={() => setMiseEnAttente(false)} />}
      {fermeture && (
        <Modale titre="Fermeture de caisse" onFermer={() => setFermeture(false)}>
          <SessionOuverte
            session={session}
            coupures={donnees.coupures ?? []}
            attentes={attentes?.filter((a) => !a.transmise).length ?? 0}
            onCloturee={(z) => {
              setFermeture(false);
              notifier(`Caisse fermée : ${z.numero}`);
              setTicketZ(z);
              recharger();
            }}
          />
        </Modale>
      )}
      {modaleTicketZ}
      {commandesTables && (
        <Modale titre="Commandes des tables" onFermer={() => { setCommandesTables(false); recharger(); }} large>
          <ListeCommandesQr session={session} onPris={() => recharger()} />
        </Modale>
      )}
      {listeAttente && attentes && (
        <ModaleAttentes attentes={attentes} panierOccupe={lignes.length > 0} maintenant={maintenant} onAction={terminerAttente} onFermer={() => setListeAttente(false)} />
      )}
      {paiement && (
        <ModalePaiement
          total={paiement.total}
          contacts={donnees.contacts}
          contactId={contactId}
          onContact={setContactId}
          onContactCree={() => recharger()}
          onValider={validerVente}
          onFermer={() => setPaiement(null)}
          serveurs={serveursListe}
          serviParInitial={serveur}
          avecPourboire
        />
      )}
      {recu && (
        <ModaleRecu
          venteId={recu.vente_id}
          monnaie={recu.monnaie}
          onFermer={() => setRecu(null)}
          piedSupplementaire={<Bouton onClick={() => setRecu(null)}>Nouvelle vente</Bouton>}
          annulerRapide={peut('ventes.annuler') ? async () => {
            await api.rpc('annuler_vente', { p_vente_id: recu.vente_id, p_motif: 'Erreur de saisie, annulée juste après la vente' });
            compterFavoris(recu.lignesVendues, -1);
            notifier(`Vente ${recu.numero} annulée`);
            setRecu(null);
            recharger();
          } : null}
        />
      )}
      {aOffrir && parId[aOffrir.article_id] && (
        <ModaleOffrir
          ligne={aOffrir}
          article={parId[aOffrir.article_id]}
          onValider={(quantite, raison) => {
            setLignes((liste) => offrirLigne(liste, cleLigne(aOffrir), quantite, raison));
            setAOffrir(null);
          }}
          onFermer={() => setAOffrir(null)}
        />
      )}
      {combien && (
        <ModaleCombien
          article={combien}
          onValider={(quantite) => { ajouter(combien, quantite); setCombien(null); }}
          onFermer={() => setCombien(null)}
        />
      )}
    </div>
  );
}
