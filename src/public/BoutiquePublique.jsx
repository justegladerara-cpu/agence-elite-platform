import { useEffect, useMemo, useState } from 'react';
import { appliquerMarque } from '../noyau/marque.js';
import { formatDateHeure, formatMontant } from '../noyau/format.js';
import { Badge, Bouton, Champ, Chargement, Erreur } from '../ui/composants.jsx';
import { MODES_REMISE, STATUTS_COMMANDE } from '../modules/ecommerce/commun.js';

// Boutique publique (#/commander/<adresse>) et suivi de commande (#/suivi/<identifiant>), sans compte.
// Seules les fonctions publiques de la base sont appelées : elles ne renvoient que ce qui est publié.

const clePanier = (adresse) => `ae-panier-${adresse}`;

function lirePanier(adresse) {
  try {
    const p = JSON.parse(localStorage.getItem(clePanier(adresse)) ?? '{}');
    return p && typeof p === 'object' ? p : {};
  } catch {
    return {};
  }
}

function ecrirePanier(adresse, panier) {
  try {
    localStorage.setItem(clePanier(adresse), JSON.stringify(panier));
  } catch {
    // Panier non mémorisé (navigation privée) : il reste valable pour cette visite.
  }
}

// Produits regroupés : un groupe (variantes) ou un article seul.
function regrouper(produits) {
  const groupes = [];
  const index = new Map();
  for (const p of produits) {
    const cle = p.groupe ?? `article-${p.article_id}`;
    if (!index.has(cle)) {
      index.set(cle, { cle, nom: p.groupe ?? p.nom, variantes: [] });
      groupes.push(index.get(cle));
    }
    index.get(cle).variantes.push(p);
  }
  return groupes;
}

function CarteProduit({ groupe, montant, onAjouter }) {
  const [choix, setChoix] = useState(groupe.variantes.find((v) => v.disponible)?.article_id ?? groupe.variantes[0].article_id);
  const p = groupe.variantes.find((v) => v.article_id === choix);
  return (
    <article className="produit-boutique">
      {p.photo ? <img src={p.photo} alt="" loading="lazy" /> : <div className="produit-sans-photo" aria-hidden="true">{groupe.nom.slice(0, 1)}</div>}
      <div className="produit-corps">
        <h3>{groupe.nom}</h3>
        {p.categorie && <small className="texte-doux">{p.categorie}</small>}
        {p.description && <p className="texte-doux">{p.description}</p>}
        {groupe.variantes.length > 1 || p.variante ? (
          <div className="variantes" role="radiogroup" aria-label={`Variantes de ${groupe.nom}`}>
            {groupe.variantes.map((v) => (
              <button key={v.article_id} type="button" role="radio" aria-checked={v.article_id === choix} disabled={!v.disponible}
                className={v.article_id === choix ? 'actif' : ''} onClick={() => setChoix(v.article_id)}>{v.variante ?? v.nom}</button>
            ))}
          </div>
        ) : null}
        <div className="produit-pied">
          <strong>{montant(p.prix)}</strong>
          {p.disponible
            ? <Bouton variante="principal" icone="plus" onClick={() => onAjouter(p)} aria-label={`Ajouter ${p.nom} au panier`}>Ajouter</Bouton>
            : <Badge>Épuisé</Badge>}
        </div>
      </div>
    </article>
  );
}

export function BoutiquePublique({ donnees, adresse }) {
  const [boutique, setBoutique] = useState(null);
  const [erreur, setErreur] = useState('');
  const [panier, setPanier] = useState(() => lirePanier(adresse));
  const [etape, setEtape] = useState('catalogue');
  const [confirmation, setConfirmation] = useState(null);
  useEffect(() => {
    donnees.rpc('boutique_publique', { p_adresse: adresse })
      .then((b) => {
        setBoutique(b);
        appliquerMarque({ nom_logiciel: b.titre, logo_url: b.logo, couleur_accent: b.couleur }, 'Boutique');
      })
      .catch((e) => setErreur(e.message));
  }, [donnees, adresse]);
  useEffect(() => ecrirePanier(adresse, panier), [adresse, panier]);
  const montant = (n) => formatMontant(n, boutique?.devise ?? 'XAF');
  const produit = useMemo(() => Object.fromEntries((boutique?.produits ?? []).map((p) => [p.article_id, p])), [boutique]);
  const lignes = Object.entries(panier).filter(([id, q]) => produit[id] && q > 0).map(([id, q]) => ({ ...produit[id], quantite: q }));
  const sousTotal = lignes.reduce((s, l) => s + Number(l.prix) * l.quantite, 0);
  const nombre = lignes.reduce((s, l) => s + l.quantite, 0);
  const changer = (id, delta) => setPanier((p) => ({ ...p, [id]: Math.max(0, Math.min(100, (p[id] ?? 0) + delta)) }));

  if (erreur && !boutique) {
    return <div className="ecran-centre"><div className="connexion-carte"><h1>Boutique indisponible</h1><p className="texte-doux">{erreur}</p></div></div>;
  }
  if (!boutique) return <div className="ecran-centre"><Chargement texte="Ouverture de la boutique…" /></div>;
  if (confirmation) {
    return (
      <div className="boutique-publique">
        <div className="boutique-confirmation carte">
          <h1>Merci, commande {confirmation.numero} reçue</h1>
          <p>Total : <strong>{montant(confirmation.total)}</strong>. {boutique.titre} vous appelle pour confirmer.</p>
          {boutique.paiement_instructions && <p className="encart">{boutique.paiement_instructions}</p>}
          <p>Suivez votre commande avec ce lien (gardez-le) :</p>
          <p><a href={`#/suivi/${confirmation.suivi}`}>{`${window.location.origin}${window.location.pathname}#/suivi/${confirmation.suivi}`}</a></p>
          <Bouton onClick={() => setConfirmation(null)}>Retour à la boutique</Bouton>
        </div>
      </div>
    );
  }
  return (
    <div className="boutique-publique">
      <header className="boutique-tete">
        {boutique.logo && <img src={boutique.logo} alt="" className="boutique-logo" />}
        <div>
          <h1>{boutique.titre}</h1>
          {boutique.presentation && <p className="texte-doux">{boutique.presentation}</p>}
          <p className="boutique-infos">
            {boutique.livraison && <span>Livraison {Number(boutique.frais_livraison) ? montant(boutique.frais_livraison) : 'offerte'}{boutique.zone_livraison ? ` · ${boutique.zone_livraison}` : ''}</span>}
            {boutique.retrait && <span>Retrait{boutique.adresse_retrait ? ` : ${boutique.adresse_retrait}` : ' sur place'}</span>}
            {boutique.telephone && <span>Tél. {boutique.telephone}</span>}
          </p>
        </div>
        <Bouton variante="principal" icone="panier" onClick={() => setEtape(etape === 'panier' ? 'catalogue' : 'panier')} aria-label={`Panier : ${nombre} article(s)`}>
          {nombre ? `${nombre} · ${montant(sousTotal)}` : 'Panier'}
        </Bouton>
      </header>
      {etape === 'catalogue' && (
        boutique.produits.length
          ? <div className="grille-produits">{regrouper(boutique.produits).map((g) => <CarteProduit key={g.cle} groupe={g} montant={montant} onAjouter={(p) => changer(p.article_id, 1)} />)}</div>
          : <p className="texte-doux">La boutique prépare ses produits. Revenez bientôt.</p>
      )}
      {etape === 'panier' && (
        <Commande donnees={donnees} adresse={adresse} boutique={boutique} lignes={lignes} sousTotal={sousTotal} montant={montant} changer={changer}
          onRetour={() => setEtape('catalogue')}
          onCommande={(r) => { setPanier({}); setEtape('catalogue'); setConfirmation(r); }} />
      )}
    </div>
  );
}

function Commande({ donnees, adresse, boutique, lignes, sousTotal, montant, changer, onRetour, onCommande }) {
  const [v, setV] = useState({
    nom_client: '', telephone: '', email: '', mode_livraison: boutique.livraison ? 'livraison' : 'retrait', adresse_livraison: '', note: '', code_promo: '',
  });
  const [remise, setRemise] = useState(null);
  const [erreur, setErreur] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const champ = (c) => (e) => setV({ ...v, [c]: e.target.value });
  const frais = v.mode_livraison === 'livraison' ? Number(boutique.frais_livraison) : 0;
  const montantRemise = remise?.code === v.code_promo.trim().toUpperCase() ? Number(remise.remise) : 0;
  const verifier = async () => {
    setErreur('');
    try {
      setRemise(await donnees.rpc('verifier_coupon_boutique', { p_adresse: adresse, p_code: v.code_promo, p_sous_total: sousTotal }));
    } catch (err) {
      setRemise(null);
      setErreur(err.message);
    }
  };
  const commander = async (e) => {
    e.preventDefault();
    setEnvoi(true);
    setErreur('');
    try {
      const r = await donnees.rpc('commander_boutique', {
        p_adresse: adresse, p: { ...v, lignes: lignes.map((l) => ({ article_id: l.article_id, quantite: l.quantite })) },
      });
      onCommande(r);
    } catch (err) {
      setErreur(err.message);
      setEnvoi(false);
    }
  };
  if (!lignes.length) {
    return <div className="carte boutique-panier"><p>Votre panier est vide.</p><Bouton onClick={onRetour}>Voir les produits</Bouton></div>;
  }
  return (
    <form className="carte boutique-panier formulaire" onSubmit={commander}>
      <h2>Votre panier</h2>
      <ul className="lignes-panier">
        {lignes.map((l) => (
          <li key={l.article_id}>
            <span>{l.groupe ? `${l.groupe} · ${l.variante}` : l.nom}<small className="texte-doux"> {montant(l.prix)}</small></span>
            <span className="quantite">
              <button type="button" className="icone-bouton" onClick={() => changer(l.article_id, -1)} aria-label={`Retirer un ${l.nom}`}>−</button>
              <strong>{l.quantite}</strong>
              <button type="button" className="icone-bouton" onClick={() => changer(l.article_id, 1)} aria-label={`Ajouter un ${l.nom}`}>+</button>
            </span>
            <strong>{montant(Number(l.prix) * l.quantite)}</strong>
          </li>
        ))}
      </ul>
      <div className="grille-champs">
        <Champ libelle="Votre nom"><input value={v.nom_client} onChange={champ('nom_client')} required maxLength={120} autoComplete="name" /></Champ>
        <Champ libelle="Téléphone"><input type="tel" value={v.telephone} onChange={champ('telephone')} required maxLength={40} autoComplete="tel" /></Champ>
        <Champ libelle="E-mail (facultatif)"><input type="email" value={v.email} onChange={champ('email')} maxLength={160} autoComplete="email" /></Champ>
        <Champ libelle="Remise">
          <select value={v.mode_livraison} onChange={champ('mode_livraison')}>
            {boutique.livraison && <option value="livraison">{MODES_REMISE.livraison}</option>}
            {boutique.retrait && <option value="retrait">{MODES_REMISE.retrait}</option>}
          </select>
        </Champ>
      </div>
      {v.mode_livraison === 'livraison'
        ? <Champ libelle="Adresse de livraison"><textarea rows={2} value={v.adresse_livraison} onChange={champ('adresse_livraison')} required maxLength={500} autoComplete="street-address" /></Champ>
        : boutique.adresse_retrait && <p className="texte-doux">À retirer : {boutique.adresse_retrait}</p>}
      <Champ libelle="Note (facultatif)"><input value={v.note} onChange={champ('note')} maxLength={1000} /></Champ>
      <div className="code-promo">
        <Champ libelle="Code promo"><input value={v.code_promo} onChange={champ('code_promo')} maxLength={20} /></Champ>
        <Bouton type="button" onClick={verifier} disabled={!v.code_promo.trim()}>Appliquer</Bouton>
      </div>
      <dl className="totaux-panier">
        <dt>Sous-total</dt><dd>{montant(sousTotal)}</dd>
        {montantRemise > 0 && <><dt>Code {remise.code}</dt><dd>− {montant(montantRemise)}</dd></>}
        {frais > 0 && <><dt>Livraison</dt><dd>{montant(frais)}</dd></>}
        <dt>Total</dt><dd><strong>{montant(sousTotal - montantRemise + frais)}</strong></dd>
      </dl>
      {Number(boutique.minimum_commande) > sousTotal && <p className="encart">Commande minimum : {montant(boutique.minimum_commande)}</p>}
      {boutique.paiement_instructions && <p className="texte-doux">Paiement : {boutique.paiement_instructions}</p>}
      <Erreur message={erreur} />
      <div className="actions">
        <Bouton type="button" onClick={onRetour}>Continuer mes achats</Bouton>
        <Bouton type="submit" variante="principal" chargement={envoi}>Commander</Bouton>
      </div>
    </form>
  );
}

export function SuiviCommande({ donnees, suivi }) {
  const [c, setC] = useState(null);
  const [erreur, setErreur] = useState('');
  useEffect(() => {
    donnees.rpc('suivi_commande_boutique', { p_suivi: suivi }).then(setC).catch((e) => setErreur(e.message.includes('uuid') ? 'Commande introuvable' : e.message));
  }, [donnees, suivi]);
  if (erreur) return <div className="ecran-centre"><div className="connexion-carte"><h1>Suivi de commande</h1><p className="texte-doux">{erreur}</p></div></div>;
  if (!c) return <div className="ecran-centre"><Chargement /></div>;
  const [libelle, ton] = STATUTS_COMMANDE[c.statut];
  return (
    <div className="boutique-publique">
      <div className="carte boutique-confirmation">
        <p className="texte-doux">{c.boutique}</p>
        <h1>Commande {c.numero}</h1>
        <p><Badge ton={ton}>{libelle}</Badge> · {MODES_REMISE[c.mode_livraison]} · passée le {formatDateHeure(c.cree_le)}</p>
        <ul className="lignes-panier">
          {(c.lignes ?? []).map((l) => <li key={l.libelle}><span>{l.libelle}</span><span>× {Number(l.quantite)}</span><strong>{formatMontant(l.total)}</strong></li>)}
        </ul>
        <p>Total : <strong>{formatMontant(c.total)}</strong></p>
      </div>
    </div>
  );
}
