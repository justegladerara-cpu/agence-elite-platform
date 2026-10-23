// Page mobile d'un QR code, telle que la voit le client qui scanne (et l'aperçu du constructeur).
// Blocs : en-tête, texte, boutons, menu, inscription (envoyer_inscription_qr, sans compte).
import React, { useState } from 'react';
import { formatMontant } from '../noyau/format.js';
import { lienBouton } from '../modules/caisse/pageQr.js';
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
      <label>Votre nom<input value={v.nom} onChange={changer('nom')} maxLength={80} required autoComplete="name" /></label>
      <label>Votre numéro (WhatsApp)<input value={v.telephone} onChange={changer('telephone')} type="tel" inputMode="tel" maxLength={25} required placeholder="+242 06 …" autoComplete="tel" /></label>
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

export function PageQr({ page, reponse, origine, onInscrire, apercu = false, nom }) {
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
        if (b.type === 'menu') {
          const categories = page.menu ?? [];
          return (
            <section key={cle} id="page-qr-menu" className="page-qr-bloc page-qr-menu">
              {b.titre && <h2>{b.titre}</h2>}
              {!categories.length && <p className="page-qr-doux">{apercu ? 'Vos articles « visibles sur le menu » s’afficheront ici.' : 'Le menu arrive bientôt.'}</p>}
              {categories.map((c) => (
                <div key={c.nom} className="page-qr-categorie">
                  <h3>{c.nom}</h3>
                  <ul>
                    {c.articles.map((a) => (
                      <li key={a.nom}><span>{a.nom}</span><strong>{formatMontant(a.prix, devise)}</strong></li>
                    ))}
                  </ul>
                </div>
              ))}
            </section>
          );
        }
        if (b.type === 'formulaire') return <Formulaire key={cle} bloc={b} onEnvoyer={onInscrire} apercu={apercu} />;
        return null;
      })}
    </div>
  );
}
