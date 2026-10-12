import React, { useEffect, useMemo, useState } from 'react';
import { appliquerMarque } from '../noyau/marque.js';
import { formatMontant } from '../noyau/format.js';
import { Badge, Bouton, Champ, Chargement, Erreur } from '../ui/composants.jsx';

// Menu d'une table (#/menu/<jeton>), ouvert en scannant le QR code, sans compte. Consultation d'abord ; commande si
// l'établissement l'a ouverte. Seules les fonctions publiques de la base sont appelées (menu_public, commander_par_qr,
// suivi_commande_qr) : elles ne renvoient que ce que le gérant a publié.

const clePanier = (jeton) => `ae-menu-${jeton}`;
const cleSuivi = (jeton) => `ae-menu-suivi-${jeton}`;
const lire = (cle, defaut) => {
  try {
    const v = JSON.parse(localStorage.getItem(cle) ?? 'null');
    return v ?? defaut;
  } catch {
    return defaut;
  }
};
const ecrire = (cle, valeur) => {
  try {
    if (valeur == null) localStorage.removeItem(cle);
    else localStorage.setItem(cle, JSON.stringify(valeur));
  } catch {
    // Navigation privée : le panier vaut pour cette visite.
  }
};

const STATUTS = {
  nouvelle: ['Envoyée : un serveur arrive pour la confirmer', 'orange'],
  acceptee: ['Acceptée : elle est en préparation', 'vert'],
  refusee: ['Refusée', 'rouge'],
};

function Suivi({ donnees, jeton, id, montant, onNouvelle }) {
  const [suivi, setSuivi] = useState(null);
  const [erreur, setErreur] = useState('');
  useEffect(() => {
    let actif = true;
    const lireSuivi = () => donnees.rpc('suivi_commande_qr', { p_jeton: jeton, p_commande_id: id })
      .then((s) => actif && setSuivi(s))
      .catch((e) => actif && setErreur(e.message));
    lireSuivi();
    const t = setInterval(lireSuivi, 10000);
    return () => {
      actif = false;
      clearInterval(t);
    };
  }, [donnees, jeton, id]);
  if (erreur && !suivi) return <Erreur message={erreur} />;
  if (!suivi) return <Chargement texte="Suivi de votre commande…" />;
  const [libelle, ton] = STATUTS[suivi.statut] ?? [suivi.statut, 'neutre'];
  return (
    <div className="carte menu-suivi" role="status">
      <h2>Commande {suivi.numero}</h2>
      <p><Badge ton={ton}>{libelle}</Badge>{suivi.motif_refus ? ` · ${suivi.motif_refus}` : ''}</p>
      <ul>{suivi.lignes.map((l) => <li key={l.article_id}>{l.quantite} × {l.nom}{l.note ? ` (${l.note})` : ''}</li>)}</ul>
      <p>Total : <strong>{montant(suivi.total)}</strong> · à régler à la caisse ou au serveur.</p>
      <Bouton onClick={onNouvelle}>Commander autre chose</Bouton>
    </div>
  );
}

export function MenuPublic({ donnees, jeton }) {
  const [menu, setMenu] = useState(null);
  const [erreur, setErreur] = useState('');
  const [categorie, setCategorie] = useState('');
  const [recherche, setRecherche] = useState('');
  const [panier, setPanier] = useState(() => lire(clePanier(jeton), {}));
  const [notes, setNotes] = useState({});
  const [ouvrirPanier, setOuvrirPanier] = useState(false);
  const [nom, setNom] = useState('');
  const [note, setNote] = useState('');
  const [couverts, setCouverts] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [erreurEnvoi, setErreurEnvoi] = useState('');
  const [suiviId, setSuiviId] = useState(() => lire(cleSuivi(jeton), null));

  const charger = () => donnees.rpc('menu_public', { p_jeton: jeton })
    .then((m) => {
      setMenu(m);
      setErreur('');
      appliquerMarque({ nom_logiciel: m.etablissement, logo_url: m.logo, couleur_accent: m.couleur }, m.titre || 'Menu');
    })
    .catch((e) => setErreur(e.message));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { charger(); }, [donnees, jeton]);
  useEffect(() => ecrire(clePanier(jeton), panier), [jeton, panier]);

  const montant = (n) => formatMontant(n, menu?.devise ?? 'XAF');
  const articles = useMemo(() => Object.fromEntries((menu?.categories ?? []).flatMap((c) => c.articles).map((a) => [a.id, a])), [menu]);
  const lignes = Object.entries(panier).filter(([id, q]) => articles[id]?.disponible && q > 0).map(([id, q]) => ({ ...articles[id], quantite: q }));
  const total = lignes.reduce((s, l) => s + Number(l.prix) * l.quantite, 0);
  const nombre = lignes.reduce((s, l) => s + l.quantite, 0);
  const changer = (id, delta) => setPanier((p) => ({ ...p, [id]: Math.max(0, Math.min(50, (p[id] ?? 0) + delta)) }));

  if (erreur && !menu) {
    return (
      <div className="ecran-centre">
        <div className="connexion-carte">
          <h1>Menu indisponible</h1>
          <p className="texte-doux">{erreur}. Demandez la carte au serveur.</p>
        </div>
      </div>
    );
  }
  if (!menu) return <div className="ecran-centre"><Chargement texte="Ouverture du menu…" /></div>;

  const t = recherche.trim().toLowerCase();
  const categories = menu.categories
    .filter((c) => !categorie || c.nom === categorie)
    .map((c) => ({ ...c, articles: c.articles.filter((a) => !t || `${a.nom} ${a.variante ?? ''} ${a.description ?? ''}`.toLowerCase().includes(t)) }))
    .filter((c) => c.articles.length);

  const envoyer = async (e) => {
    e.preventDefault();
    setEnvoi(true);
    setErreurEnvoi('');
    try {
      const r = await donnees.rpc('commander_par_qr', {
        p_jeton: jeton,
        p: { lignes: lignes.map((l) => ({ article_id: l.id, quantite: l.quantite, note: notes[l.id] || null })), nom: nom || null, note: note || null, couverts: couverts || null },
      });
      setPanier({});
      setNotes({});
      setOuvrirPanier(false);
      setSuiviId(r.id);
      ecrire(cleSuivi(jeton), r.id);
    } catch (err) {
      setErreurEnvoi(err.message);
      charger();
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <div className="menu-public">
      <header className="menu-tete">
        {menu.logo && <img src={menu.logo} alt="" className="boutique-logo" />}
        <div>
          <h1>{menu.titre || menu.etablissement}</h1>
          <p className="texte-doux">{menu.titre ? `${menu.etablissement} · ` : ''}{menu.emplacement}</p>
          {menu.message && <p className="menu-message">{menu.message}</p>}
        </div>
      </header>
      {suiviId && (
        <Suivi donnees={donnees} jeton={jeton} id={suiviId} montant={montant}
          onNouvelle={() => { setSuiviId(null); ecrire(cleSuivi(jeton), null); }} />
      )}
      <div className="menu-outils">
        <input type="search" aria-label="Chercher dans le menu" placeholder="Chercher un plat, une boisson…" value={recherche} onChange={(e) => setRecherche(e.target.value)} />
        <div className="puces" role="tablist" aria-label="Catégories">
          <button type="button" className={!categorie ? 'actif' : ''} onClick={() => setCategorie('')}>Tout</button>
          {menu.categories.map((c) => <button key={c.nom} type="button" className={categorie === c.nom ? 'actif' : ''} onClick={() => setCategorie(c.nom)}>{c.nom}</button>)}
        </div>
      </div>
      {!categories.length && <p className="texte-doux">Rien ne correspond.</p>}
      {categories.map((c) => (
        <section key={c.nom} className="menu-categorie">
          <h2>{c.nom}</h2>
          <ul className="menu-articles">
            {c.articles.map((a) => (
              <li key={a.id} className={a.disponible ? '' : 'epuise'}>
                {a.photo && <img src={a.photo} alt="" loading="lazy" />}
                <div className="menu-article-texte">
                  <strong>{a.nom}{a.variante ? ` — ${a.variante}` : ''}</strong>
                  {a.description && <small className="texte-doux">{a.description}</small>}
                </div>
                <div className="menu-article-prix">
                  <strong>{montant(a.prix)}</strong>
                  {!a.disponible && <Badge>épuisé</Badge>}
                  {a.disponible && menu.commande && (
                    panier[a.id] ? (
                      <span className="quantite">
                        <button type="button" className="icone-bouton" onClick={() => changer(a.id, -1)} aria-label={`Retirer un ${a.nom}`}>−</button>
                        <strong>{panier[a.id]}</strong>
                        <button type="button" className="icone-bouton" onClick={() => changer(a.id, 1)} aria-label={`Ajouter un ${a.nom}`}>+</button>
                      </span>
                    ) : <Bouton variante="principal" onClick={() => changer(a.id, 1)} aria-label={`Ajouter ${a.nom}`}>Ajouter</Bouton>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {!menu.commande && <p className="texte-doux menu-pied">Pour commander, appelez un serveur.</p>}
      {menu.commande && nombre > 0 && !ouvrirPanier && (
        <div className="menu-barre-panier">
          <Bouton variante="principal" onClick={() => setOuvrirPanier(true)}>Voir ma commande · {nombre} · {montant(total)}</Bouton>
        </div>
      )}
      {menu.commande && ouvrirPanier && (
        <form className="carte menu-panier formulaire" onSubmit={envoyer}>
          <h2>Ma commande · {menu.emplacement}</h2>
          <ul className="lignes-panier">
            {lignes.map((l) => (
              <li key={l.id}>
                <span>{l.nom}{l.variante ? ` — ${l.variante}` : ''}
                  <input className="menu-precision" aria-label={`Précision pour ${l.nom}`} placeholder="Précision (ex. bien cuit)" maxLength={100}
                    value={notes[l.id] ?? ''} onChange={(e) => setNotes((n) => ({ ...n, [l.id]: e.target.value }))} />
                </span>
                <span className="quantite">
                  <button type="button" className="icone-bouton" onClick={() => changer(l.id, -1)} aria-label={`Retirer un ${l.nom}`}>−</button>
                  <strong>{l.quantite}</strong>
                  <button type="button" className="icone-bouton" onClick={() => changer(l.id, 1)} aria-label={`Ajouter un ${l.nom}`}>+</button>
                </span>
                <strong>{montant(Number(l.prix) * l.quantite)}</strong>
              </li>
            ))}
          </ul>
          <div className="grille-champs">
            <Champ libelle="Votre prénom (facultatif)"><input value={nom} maxLength={60} onChange={(e) => setNom(e.target.value)} autoComplete="given-name" /></Champ>
            {menu.salle && <Champ libelle="Nombre de personnes (facultatif)"><input inputMode="numeric" value={couverts} onChange={(e) => setCouverts(e.target.value.replace(/\D/g, '').slice(0, 2))} /></Champ>}
          </div>
          <Champ libelle="Un mot pour le serveur (facultatif)"><input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} /></Champ>
          <p>Total : <strong>{montant(total)}</strong> · vous réglez à la caisse ou au serveur.</p>
          <Erreur message={erreurEnvoi} />
          <div className="actions">
            <Bouton type="button" onClick={() => setOuvrirPanier(false)}>Continuer à choisir</Bouton>
            <Bouton type="submit" variante="principal" chargement={envoi} disabled={!lignes.length}>Envoyer la commande</Bouton>
          </div>
        </form>
      )}
    </div>
  );
}
