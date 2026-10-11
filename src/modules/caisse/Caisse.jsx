import React, { useEffect, useMemo, useState } from 'react';
import { useDonnees, useEspace } from '../../noyau/espace.jsx';
import { formatDateHeure, formatQuantite, MODES_PAIEMENT } from '../../noyau/format.js';
import { Badge, Bouton, Champ, Chargement, Erreur, Icone, Modale, Recherche, Vide } from '../../ui/composants.jsx';
import { ModaleRecu } from '../recus/Recu.jsx';
import {
  arrondirQuantite, classerFavoris, compterVente, enregistrerFavoris, estVenteAuPoids, FRACTIONS, lireFavoris, MIN_FAVORIS_AUTO,
  quantitePourMontant,
} from './poids.js';
import './caisse.css';

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

function OuvertureCaisse({ pointsDeVente, onOuvrir, fermees = 0 }) {
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
  return (
    <div className="ouverture-caisse">
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

export function ModalePaiement({ total, contacts, contactId, onContact, onContactCree, onValider, onFermer, libelleRetour = 'Retour au panier' }) {
  const { montant, devise, peut } = useEspace();
  // Clients créés dans cette fenêtre : visibles tout de suite, avant le rechargement des données.
  const [nouveaux, setNouveaux] = useState([]);
  const tousContacts = [...contacts, ...nouveaux.filter((n) => !contacts.some((c) => c.id === n.id))];
  const [paiements, setPaiements] = useState([{ mode: 'especes', montant: String(total), reference: '' }]);
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
      await onValider(paiements.filter((p) => Number(p.montant) > 0).map((p) => ({ ...p, montant: Number(p.montant) })));
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
          <Bouton variante="principal" onClick={valider} chargement={chargement}>Valider la vente</Bouton>
        </>
      )}
    >
      <div className="paiement-total">
        <span>À payer</span>
        <strong>{montant(total)}</strong>
      </div>
      <div className="paiements-liste">
        {paiements.map((p, i) => (
          <div key={i} className="paiement-ligne">
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
      <div className="modes-rapides">
        {Object.entries(MODES_PAIEMENT).map(([id, libelle]) => (
          <button key={id} type="button" onClick={() => ajouter(id)}>+ {libelle}</button>
        ))}
      </div>
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

function Panier({ lignes, articles, onQuantite, onRetirer, onVider, remise, onRemise, contacts, contactId, onContact, onEncaisser, onAttente }) {
  const { montant } = useEspace();
  const sousTotal = lignes.reduce((s, l) => s + articles[l.article_id].prix_vente * l.quantite, 0);
  const total = Math.max(sousTotal - Number(remise || 0), 0);
  return (
    <aside className="panier">
      <div className="panier-tete">
        <h2><Icone nom="panier" /> Panier</h2>
        {lignes.length > 0 && <button className="lien" onClick={onVider}>Vider</button>}
      </div>
      <div className="panier-lignes">
        {lignes.length === 0 && <Vide titre="Panier vide" texte="Touchez un article pour l’ajouter." />}
        {lignes.map((l) => {
          const a = articles[l.article_id];
          return (
            <div key={l.article_id} className="panier-ligne">
              <div className="panier-libelle">
                <strong>{a.nom}</strong>
                <small>
                  {estVenteAuPoids(a.unite) && <span className="panier-poids">{formatQuantite(l.quantite, a.unite)} × </span>}
                  {montant(a.prix_vente)}{a.unite !== 'unité' ? ` / ${a.unite}` : ''}
                </small>
              </div>
              <div className="quantite">
                <button onClick={() => onQuantite(l.article_id, l.quantite - 1)} aria-label="Moins"><Icone nom="moins" taille={14} /></button>
                <input type="number" min="0" step="any" value={l.quantite} onChange={(e) => onQuantite(l.article_id, Number(e.target.value))} aria-label={`Quantité ${a.nom}`} />
                <button onClick={() => onQuantite(l.article_id, l.quantite + 1)} aria-label="Plus"><Icone nom="plus" taille={14} /></button>
              </div>
              <strong className="panier-montant">{montant(a.prix_vente * l.quantite)}</strong>
              <button className="icone-bouton" onClick={() => onRetirer(l.article_id)} aria-label={`Retirer ${a.nom}`}><Icone nom="fermer" taille={14} /></button>
            </div>
          );
        })}
      </div>
      <div className="panier-pied">
        <Champ libelle="Contact (facultatif)">
          <select value={contactId ?? ''} onChange={(e) => onContact(e.target.value || null)}>
            <option value="">Client de passage</option>
            {contacts.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
          </select>
        </Champ>
        <div className="panier-totaux">
          <div><span>Sous-total</span><span>{montant(sousTotal)}</span></div>
          <div className="remise">
            <span>Remise</span>
            <input type="number" min="0" step="any" value={remise} onChange={(e) => onRemise(e.target.value)} placeholder="0" aria-label="Remise" />
          </div>
          <div className="panier-total"><span>Total</span><strong>{montant(total)}</strong></div>
        </div>
        {onAttente && lignes.length > 0 && <Bouton icone="horloge" onClick={onAttente}>Mettre en attente</Bouton>}
        <Bouton variante="principal grand" disabled={!lignes.length} onClick={() => onEncaisser(total)}>
          Encaisser {lignes.length > 0 && montant(total)}
        </Bouton>
      </div>
    </aside>
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
    <Modale titre="Mettre la vente en attente" onFermer={onFermer}>
      <form className="formulaire" onSubmit={valider}>
        <Champ libelle="Nom pour la retrouver (facultatif)" aide="Ex. « Monsieur en bleu », « Table 4 ». Le stock ne bouge pas tant que la vente n’est pas encaissée.">
          <input value={libelle} maxLength={60} onChange={(e) => setLibelle(e.target.value)} autoFocus />
        </Champ>
        <Erreur message={erreur} />
        <div className="actions">
          <Bouton type="button" onClick={onFermer}>Annuler</Bouton>
          <Bouton type="submit" variante="principal" chargement={enCours}>Mettre en attente</Bouton>
        </div>
      </form>
    </Modale>
  );
}

function ModaleAttentes({ attentes, panierOccupe, onAction, onFermer }) {
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
    <Modale titre="Ventes en attente" onFermer={onFermer}>
      {panierOccupe && <p className="bandeau attention">Le panier en cours n’est pas vide : encaissez-le ou mettez-le en attente avant d’en reprendre un autre.</p>}
      <Erreur message={erreur} />
      <ul className="liste-attentes">
        {attentes.map((a) => (
          <li key={a.id}>
            <span>
              <strong>{a.libelle}</strong>
              <small className="texte-doux bloc">{formatDateHeure(a.cree_le)} · {a.lignes.length} ligne(s) · environ {montant(a.total_estime)}</small>
            </span>
            <span className="actions-ligne">
              <Bouton variante="principal" disabled={panierOccupe} onClick={() => agir(a, 'reprendre')}>Reprendre</Bouton>
              <button type="button" className="lien danger" onClick={() => agir(a, 'abandonner')}>Abandonner</button>
            </span>
          </li>
        ))}
      </ul>
    </Modale>
  );
}

export default function Caisse({ naviguer }) {
  const { api, etablissement, montant, notifier, peut, hubs, hub, multiHub } = useEspace();
  const etab = etablissement.id;
  // Caisses visibles : celles des Hubs autorisés, ou du seul Hub choisi.
  const hubsCaisse = (multiHub && hub ? [hub] : hubs).filter((h) => h.capacite_caisse).map((h) => h.id);
  const { donnees, chargement, erreur, recharger } = useDonnees(async () => {
    // Fin de journée (Paramètres › Clôture, minuit par défaut) : la caisse de la veille est fermée avant d'afficher la caisse.
    const fermees = await api.rpc('fermer_caisses_du_jour', { p_etablissement_id: etab }).catch(() => 0);
    const [articles, stock, categories, contacts, sessions, pointsDeVente, attentes] = await Promise.all([
      api.lire('articles', { eq: { etablissement_id: etab, actif: true }, ordre: ['nom'] }),
      api.lire('stock_hubs', { eq: { etablissement_id: etab } }),
      api.lire('categories_articles', { eq: { etablissement_id: etab, actif: true }, ordre: ['nom'] }),
      api.lire('contacts', { eq: { etablissement_id: etab, actif: true }, ordre: ['nom'] }),
      api.lire('sessions_caisse', { eq: { etablissement_id: etab, statut: 'ouverte' } }),
      api.lire('points_de_vente', { eq: { etablissement_id: etab, actif: true }, ordre: ['cree_le'] }),
      // Ventes en attente (migration 20261010000102) : sans la table, la fonction est simplement masquée.
      api.lire('ventes_en_attente', { eq: { etablissement_id: etab, statut: 'en_attente' }, ordre: ['cree_le'] }).catch(() => null),
    ]);
    const caisses = pointsDeVente.filter((p) => hubsCaisse.includes(p.hub_id));
    return {
      articles, stock, contacts: contacts.filter((c) => c.type !== 'fournisseur'),
      // Ordre choisi dans Articles › Catégories, puis alphabétique.
      categories: [...categories].sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0) || a.nom.localeCompare(b.nom, 'fr')),
      sessions: sessions.filter((x) => caisses.some((p) => p.id === x.point_de_vente_id)), pointsDeVente: caisses, attentes, fermees,
    };
  }, [etab, hubsCaisse.join()]);
  const [pdvChoisi, setPdvChoisi] = useState(null);
  const [lignes, setLignes] = useState([]);
  const [remise, setRemise] = useState('');
  const [contactId, setContactId] = useState(null);
  const [recherche, setRecherche] = useState('');
  // null = choix automatique : « Favoris » s'il y en a assez, sinon « Tout ».
  const [categorie, setCategorie] = useState(null);
  const [combien, setCombien] = useState(null);
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
  const [recu, setRecu] = useState(null);
  const [panierMobile, setPanierMobile] = useState(false);
  const [miseEnAttente, setMiseEnAttente] = useState(false);
  const [listeAttente, setListeAttente] = useState(false);

  const parId = useMemo(() => Object.fromEntries((donnees?.articles ?? []).map((a) => [a.id, a])), [donnees]);
  const session = donnees?.sessions.find((s) => s.point_de_vente_id === pdvChoisi) ?? donnees?.sessions[0];
  // Le stock affiché est celui du Hub de la caisse ouverte (c'est lui que la vente débitera).
  const stockParId = useMemo(
    () => Object.fromEntries((donnees?.stock ?? []).filter((s) => s.hub_id === session?.hub_id).map((s) => [s.article_id, Number(s.quantite)])),
    [donnees, session?.hub_id]
  );

  if (chargement && !donnees) return <Chargement />;
  if (erreur) return <Erreur message={erreur} />;
  if (!session) {
    return (
      <OuvertureCaisse
        pointsDeVente={donnees.pointsDeVente}
        fermees={donnees.fermees}
        onOuvrir={async (pdv, fond) => {
          await api.rpc('ouvrir_caisse', { p_etablissement_id: etab, p_point_de_vente_id: pdv, p_fond_initial: fond });
          notifier('Caisse ouverte');
          recharger();
        }}
      />
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

  const ajouter = (article, quantite = 1) => {
    setLignes((liste) => {
      const existante = liste.find((l) => l.article_id === article.id);
      if (existante) return liste.map((l) => (l.article_id === article.id ? { ...l, quantite: arrondirQuantite(l.quantite + quantite) } : l));
      return [...liste, { article_id: article.id, quantite }];
    });
  };
  // Article au poids : on demande « Combien ? » ; article à l'unité : une touche = un de plus.
  const toucher = (article) => {
    if (estVenteAuPoids(article.unite)) setCombien(article);
    else ajouter(article);
  };
  const changerQuantite = (id, quantite) => {
    setLignes((liste) => (quantite > 0 ? liste.map((l) => (l.article_id === id ? { ...l, quantite } : l)) : liste.filter((l) => l.article_id !== id)));
  };
  const vider = () => {
    setLignes([]);
    setRemise('');
    setContactId(null);
  };

  const validerVente = async (paiements) => {
    let resultat;
    try {
      resultat = await api.rpc('enregistrer_vente', {
        p_etablissement_id: etab,
        p_session_id: session.id,
        p_lignes: lignes,
        p_paiements: paiements,
        p_contact_id: contactId,
        p_remise: Number(remise || 0),
      });
    } catch (err) {
      // Heure de fin de journée passée : la caisse se ferme, le panier reste pour la caisse du jour.
      if (/Journée de caisse terminée|déjà clôturée/.test(err.message)) {
        setPaiement(null);
        recharger();
      }
      throw err;
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

  // Les ventes en attente du Hub de la caisse : un panier mis de côté se reprend sur n'importe quelle caisse du Hub.
  const attentes = donnees.attentes?.filter((a) => a.hub_id === session.hub_id) ?? null;
  const mettreEnAttente = async (libelle) => {
    await api.rpc('mettre_vente_en_attente', {
      p_session_id: session.id, p_lignes: lignes, p_libelle: libelle || null, p_contact_id: contactId, p_remise: Number(remise || 0),
    });
    setMiseEnAttente(false);
    setPanierMobile(false);
    vider();
    notifier('Vente mise en attente');
    recharger();
  };
  const terminerAttente = async (attente, action) => {
    const r = await api.rpc('terminer_vente_en_attente', { p_id: attente.id, p_action: action });
    if (action === 'reprendre') {
      // Un article archivé entre-temps n'est pas repris ; le prix est celui du moment de la vente.
      setLignes(r.lignes.filter((l) => parId[l.article_id]).map((l) => ({ article_id: l.article_id, quantite: Number(l.quantite) })));
      setRemise(Number(r.remise) ? String(r.remise) : '');
      setContactId(r.contact_id ?? null);
      notifier(`« ${r.libelle} » reprise`);
    } else notifier(`« ${r.libelle} » abandonnée`);
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
          {attentes?.length > 0 && <Bouton icone="horloge" onClick={() => setListeAttente(true)}>En attente ({attentes.length})</Bouton>}
          {peut('cloture.cloturer') && <Bouton icone="cloture" onClick={() => naviguer('clotures')}>Clôturer</Bouton>}
        </div>
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
            const dansPanier = lignes.find((l) => l.article_id === a.id)?.quantite ?? 0;
            const epuise = a.suivi_stock && quantite - dansPanier <= 0;
            return (
              <button key={a.id} className={`tuile-article ${epuise ? 'epuise' : ''}`} onClick={() => toucher(a)}>
                <VignetteArticle article={a} />
                <span className="tuile-nom">{a.nom}</span>
                <strong className="tuile-prix">{montant(a.prix_vente)}</strong>
                {a.suivi_stock && (
                  <span className={`tuile-stock ${quantite <= a.stock_minimum ? 'bas' : ''}`}>{formatQuantite(quantite - dansPanier, a.unite)} en stock</span>
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
          onQuantite={changerQuantite}
          onRetirer={(id) => changerQuantite(id, 0)}
          onVider={vider}
          remise={remise}
          onRemise={setRemise}
          contacts={donnees.contacts}
          contactId={contactId}
          onContact={setContactId}
          onEncaisser={(total) => setPaiement({ total })}
          onAttente={attentes ? () => setMiseEnAttente(true) : null}
        />
        <button className="panier-fermer-mobile" onClick={() => setPanierMobile(false)}>Continuer les achats</button>
      </div>
      <button className="panier-mobile" onClick={() => setPanierMobile(true)}>
        <Icone nom="panier" /> {formatQuantite(nombreArticles)} article(s) · voir le panier
      </button>
      {miseEnAttente && <ModaleMiseEnAttente onValider={mettreEnAttente} onFermer={() => setMiseEnAttente(false)} />}
      {listeAttente && attentes && (
        <ModaleAttentes attentes={attentes} panierOccupe={lignes.length > 0} onAction={terminerAttente} onFermer={() => setListeAttente(false)} />
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
