// Page mobile d'un QR code, telle que la voit le client qui scanne (et l'aperçu du constructeur).
// Blocs : en-tête, texte, boutons, menu, inscription (envoyer_inscription_qr, sans compte).
import React, { useEffect, useState } from 'react';
import { formatMontant } from '../noyau/format.js';
import { chercherMenu, lienBouton, liensReseaux, pictoRayon, rayonsMenu } from '../modules/caisse/pageQr.js';
import './page-qr.css';

function Formulaire({ bloc, onEnvoyer, apercu }) {
  const [v, setV] = useState({ nom: '', telephone: '', email: '', anniversaire: '', message: '', site: '' });
  const [merci, setMerci] = useState('');
  const [erreur, setErreur] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const changer = (cle) => (e) => setV((x) => ({ ...x, [cle]: e.target.value }));
  const envoyer = async (e) => {
    e.preventDefault();
    if (apercu) return;
    setEnvoi(true);
    setErreur('');
    try {
      const r = await onEnvoyer(v);
      setMerci(r?.merci ?? 'Merci !');
    } catch (err) {
      setErreur(err.message);
    } finally {
      setEnvoi(false);
    }
  };
  if (merci) return <section className="page-qr-bloc page-qr-merci" role="status">{merci}</section>;
  return (
    <form className="page-qr-bloc page-qr-formulaire" onSubmit={envoyer}>
      {bloc.titre && <h2>{bloc.titre}</h2>}
      {bloc.texte && <p>{bloc.texte}</p>}
      <label>Votre nom et prénom<input value={v.nom} onChange={changer('nom')} maxLength={80} required autoComplete="name" /></label>
      <label>Votre numéro WhatsApp<input value={v.telephone} onChange={changer('telephone')} type="tel" inputMode="tel" maxLength={25} required placeholder="+242 06 …" autoComplete="tel" /></label>
      {bloc.email && <label>Votre e-mail (facultatif)<input value={v.email} onChange={changer('email')} type="email" maxLength={254} autoComplete="email" /></label>}
      {bloc.anniversaire && <label>Votre anniversaire (facultatif)<input value={v.anniversaire} onChange={changer('anniversaire')} type="date" /></label>}
      {bloc.message && <label>Un mot pour nous (facultatif)<textarea value={v.message} onChange={changer('message')} maxLength={500} rows={3} /></label>}
      {/* Piège à robots : invisible pour une personne. */}
      <input className="page-qr-piege" tabIndex={-1} aria-hidden="true" autoComplete="off" value={v.site} onChange={changer('site')} />
      {erreur && <p className="page-qr-erreur" role="alert">{erreur}</p>}
      <button type="submit" className="page-qr-bouton" disabled={envoi || apercu}>{bloc.bouton || 'Envoyer'}</button>
    </form>
  );
}

// Couleur douce et stable d'une carte sans photo, d'après le nom du rayon.
function teinte(nom) {
  let h = 0;
  for (const c of String(nom ?? '')) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `linear-gradient(135deg, hsl(${h} 70% 92%), hsl(${(h + 40) % 360} 75% 84%))`;
}

function ImageCarte({ photo, nom, className }) {
  if (photo) return <img className={className} src={photo} alt="" loading="lazy" />;
  return <span className={`${className} sans-photo`} style={{ background: teinte(nom) }} aria-hidden="true">{pictoRayon(nom)}</span>;
}

function FicheArticle({ a, photo, devise }) {
  return (
    <li className="page-qr-article">
      {(photo || a.photo) ? <img className="page-qr-article-photo" src={photo || a.photo} alt="" loading="lazy" /> : null}
      <span className="page-qr-article-texte">
        <strong>{a.nom}</strong>
        {a.description && <small>{a.description}</small>}
      </span>
      <strong className="page-qr-article-prix">{formatMontant(a.prix, devise)}</strong>
    </li>
  );
}

// Bloc « menu » (Juste, 2026-10-24) : en cartes par rayon (par défaut) ou en liste comme avant. Toucher une carte
// montre ses articles ; leurs photos arrivent à ce moment-là (chargerPhotos), pour que la page s'ouvre vite.
function MenuPage({ bloc, menu, devise, apercu, chargerPhotos }) {
  const rayons = rayonsMenu(menu, bloc);
  const [ouvert, setOuvert] = useState(null);
  const [texte, setTexte] = useState('');
  const [photos, setPhotos] = useState({});
  const rayon = rayons.find((r) => r.id === ouvert) ?? null;
  useEffect(() => {
    if (!rayon || !chargerPhotos || photos[rayon.id] || !rayon.articles.some((a) => a.a_photo && !a.photo)) return;
    let actif = true;
    chargerPhotos(rayon.id).then((p) => { if (actif) setPhotos((x) => ({ ...x, [rayon.id]: p ?? {} })); }).catch(() => {});
    return () => { actif = false; };
  }, [rayon?.id]);
  const ouvrir = (id) => {
    setOuvert(id);
    setTexte('');
    if (!apercu) document.getElementById('page-qr-menu')?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  };
  const vide = !rayons.length && <p className="page-qr-doux">{apercu ? 'Vos articles « visibles sur le menu » s’afficheront ici.' : 'Le menu arrive bientôt.'}</p>;
  if (bloc.affichage === 'liste') {
    return (
      <section id="page-qr-menu" className="page-qr-bloc page-qr-menu">
        {bloc.titre && <h2>{bloc.titre}</h2>}
        {vide}
        {rayons.map((c) => (
          <div key={c.id} className="page-qr-categorie">
            <h3>{c.titre}</h3>
            <ul>{c.articles.map((a) => <li key={a.id ?? a.nom}><span>{a.nom}</span><strong>{formatMontant(a.prix, devise)}</strong></li>)}</ul>
          </div>
        ))}
      </section>
    );
  }
  const trouves = chercherMenu(rayons, texte);
  return (
    <section id="page-qr-menu" className="page-qr-bloc page-qr-menu page-qr-menu-cartes">
      {rayon ? (
        <>
          <button type="button" className="page-qr-retour" onClick={() => setOuvert(null)}>← Retour au menu</button>
          <header className="page-qr-rayon-tete">
            <ImageCarte photo={rayon.photo} nom={rayon.nom} className="page-qr-rayon-image" />
            <div>
              <h2>{rayon.titre}</h2>
              <p className="page-qr-doux">{rayon.articles.length} choix{rayon.description ? ` · ${rayon.description}` : ''}</p>
            </div>
          </header>
          <ul className="page-qr-articles">
            {rayon.articles.map((a) => <FicheArticle key={a.id ?? a.nom} a={a} photo={photos[rayon.id]?.[a.id]} devise={devise} />)}
          </ul>
        </>
      ) : (
        <>
          {bloc.titre && <h2>{bloc.titre}</h2>}
          {vide}
          {bloc.recherche !== false && rayons.length > 0 && (
            <input className="page-qr-recherche" type="search" value={texte} onChange={(e) => setTexte(e.target.value)}
              placeholder="Chercher une boisson, un plat…" aria-label="Chercher dans le menu" />
          )}
          {texte.trim() ? (
            trouves.length ? (
              <ul className="page-qr-articles">{trouves.map((a) => <FicheArticle key={`${a.rayon}-${a.id ?? a.nom}`} a={a} photo={photos[a.rayon]?.[a.id]} devise={devise} />)}</ul>
            ) : <p className="page-qr-doux">Rien trouvé pour « {texte.trim()} ».</p>
          ) : (
            <div className="page-qr-cartes">
              {rayons.map((r) => (
                <button key={r.id} type="button" className="page-qr-carte" onClick={() => ouvrir(r.id)}>
                  <ImageCarte photo={r.photo} nom={r.nom} className="page-qr-carte-image" />
                  <span className="page-qr-carte-texte">
                    <strong>{r.titre}</strong>
                    <small>{r.articles.length} choix · Voir</small>
                  </span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}

export function PageQr({ page, reponse, origine, onInscrire, apercu = false, nom, chargerPhotos }) {
  const couleur = page.couleur || '#1F6FEB';
  const devise = page.devise ?? 'XAF';
  return (
    <div className={`page-qr${apercu ? ' apercu' : ''}`} style={{ '--page-qr-couleur': couleur }}>
      {(page.blocs ?? []).map((b, i) => {
        const cle = `${b.type}-${i}`;
        if (b.type === 'entete') {
          return (
            <header key={cle} className="page-qr-bloc page-qr-entete">
              {b.logo && page.logo && <img src={page.logo} alt="" />}
              <h1>{b.titre || nom}</h1>
              {b.texte && <p>{b.texte}</p>}
            </header>
          );
        }
        if (b.type === 'texte') {
          return (
            <section key={cle} className="page-qr-bloc">
              {b.titre && <h2>{b.titre}</h2>}
              {b.texte && <p className="page-qr-texte">{b.texte}</p>}
            </section>
          );
        }
        if (b.type === 'bouton') {
          const lien = lienBouton(b, reponse, origine);
          if (!lien && !apercu) return null;
          const externe = lien && !lien.startsWith('#');
          return (
            <a key={cle} className="page-qr-bouton" href={apercu ? undefined : lien ?? undefined}
              target={externe && /^https?:/.test(lien) ? '_blank' : undefined} rel={externe ? 'noopener noreferrer' : undefined}
              onClick={(e) => {
                if (apercu) e.preventDefault();
                if (lien === '#page-qr-menu') {
                  e.preventDefault();
                  document.getElementById('page-qr-menu')?.scrollIntoView({ behavior: 'smooth' });
                }
              }}>
              {b.libelle}
            </a>
          );
        }
        if (b.type === 'menu') return <MenuPage key={cle} bloc={b} menu={page.menu} devise={devise} apercu={apercu} chargerPhotos={chargerPhotos} />;
        if (b.type === 'formulaire') return <Formulaire key={cle} bloc={b} onEnvoyer={onInscrire} apercu={apercu} />;
        if (b.type === 'reseaux') {
          const liens = liensReseaux(b);
          if (!liens.length && !apercu) return null;
          return (
            <section key={cle} className="page-qr-bloc page-qr-reseaux">
              {b.titre && <h2>{b.titre}</h2>}
              {!liens.length && <p className="page-qr-doux">Ajoutez vos réseaux : ils s’afficheront ici.</p>}
              <div className="page-qr-reseaux-liens">
                {liens.map((l) => (
                  <a key={l.cle} className={`page-qr-reseau ${l.cle}`} href={apercu ? undefined : l.lien} target="_blank" rel="noopener noreferrer"
                    onClick={apercu ? (e) => e.preventDefault() : undefined}>{l.nom}</a>
                ))}
              </div>
            </section>
          );
        }
        if (b.type === 'wifi') {
          if (!b.reseau && !apercu) return null;
          return (
            <section key={cle} className="page-qr-bloc page-qr-wifi">
              <h2>{b.titre || 'Wi-Fi'}</h2>
              <p>Nom du Wi-Fi : <strong>{b.reseau || '…'}</strong></p>
              <p>Mot de passe : <strong className="page-qr-code">{b.mot_de_passe || (b.reseau ? 'aucun (Wi-Fi ouvert)' : '…')}</strong></p>
              {b.mot_de_passe && !apercu && navigator.clipboard && (
                <button type="button" className="page-qr-bouton secondaire" onClick={() => navigator.clipboard.writeText(b.mot_de_passe)}>Copier le mot de passe</button>
              )}
            </section>
          );
        }
        return null;
      })}
    </div>
  );
}
