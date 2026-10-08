import { useEffect, useState } from 'react';
import { appliquerMarque } from '../noyau/marque.js';
import { formatMontant } from '../noyau/format.js';
import { Bouton, Champ, Chargement, Erreur } from '../ui/composants.jsx';

// Rendu d'un site construit par blocs. Tout le contenu est affiché comme du texte (jamais interprété comme HTML) ;
// la base a déjà filtré types, champs, liens et images. Sert au site public et à l'aperçu du brouillon.

// Lien d'un bloc → adresse réelle : page du site (/slug), boutique (/boutique), https, tel:, mailto:.
export function resoudreLien(lien, site) {
  if (!lien) return null;
  if (lien === '/') return `#/site/${site.adresse}`;
  if (lien === '/boutique') return site.boutique ? `#/commander/${site.boutique.adresse}` : null;
  if (lien.startsWith('/')) return `#/site/${site.adresse}${lien}`;
  if (/^(https:\/\/|tel:|mailto:)/.test(lien)) return lien;
  return null;
}

function LienBouton({ lien, texte, site, variante = 'principal' }) {
  const href = resoudreLien(lien, site);
  if (!texte || !href) return null;
  const externe = href.startsWith('https://');
  return <a className={`bouton ${variante}`} href={href} {...(externe ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>{texte}</a>;
}

function Paragraphes({ texte }) {
  if (!texte) return null;
  return texte.split(/\n{2,}/).map((p, i) => <p key={i}>{p}</p>);
}

function FormulaireContact({ site, pageId, donnees, apercu }) {
  const [v, setV] = useState({ nom: '', telephone: '', email: '', message: '' });
  const [etat, setEtat] = useState('');
  const [erreur, setErreur] = useState('');
  const champ = (c) => (e) => setV({ ...v, [c]: e.target.value });
  const envoyer = async (e) => {
    e.preventDefault();
    setErreur('');
    if (apercu) {
      setErreur('Aperçu : le formulaire fonctionne une fois la page publiée.');
      return;
    }
    setEtat('envoi');
    try {
      await donnees.rpc('envoyer_message_site', { p_adresse: site.adresse, p: { ...v, page_id: pageId } });
      setEtat('envoye');
    } catch (err) {
      setErreur(err.message);
      setEtat('');
    }
  };
  if (etat === 'envoye') return <p className="encart">Merci, votre message est envoyé. Nous vous recontactons rapidement.</p>;
  return (
    <form className="formulaire site-formulaire" onSubmit={envoyer}>
      <div className="grille-champs">
        <Champ libelle="Votre nom"><input value={v.nom} onChange={champ('nom')} required maxLength={120} autoComplete="name" /></Champ>
        <Champ libelle="Téléphone"><input type="tel" value={v.telephone} onChange={champ('telephone')} maxLength={40} autoComplete="tel" /></Champ>
        <Champ libelle="E-mail"><input type="email" value={v.email} onChange={champ('email')} maxLength={160} autoComplete="email" /></Champ>
      </div>
      <Champ libelle="Message"><textarea rows={4} value={v.message} onChange={champ('message')} required maxLength={2000} /></Champ>
      <Erreur message={erreur} />
      <div><Bouton type="submit" variante="principal" chargement={etat === 'envoi'}>Envoyer</Bouton></div>
    </form>
  );
}

function Bloc({ b, site, pageId, donnees, apercu }) {
  switch (b.type) {
    case 'hero':
      return (
        <section className={`site-hero${b.image ? ' avec-image' : ''}`} style={b.image ? { backgroundImage: `url("${encodeURI(b.image)}")` } : undefined}>
          <div className="site-hero-contenu">
            {b.titre && <h1>{b.titre}</h1>}
            {b.sous_titre && <p>{b.sous_titre}</p>}
            <LienBouton lien={b.bouton_lien} texte={b.bouton_texte} site={site} />
          </div>
        </section>
      );
    case 'texte':
      return <section className="site-section site-texte">{b.titre && <h2>{b.titre}</h2>}<Paragraphes texte={b.texte} /></section>;
    case 'image':
      return b.image ? <figure className="site-section site-image"><img src={b.image} alt={b.legende ?? ''} loading="lazy" />{b.legende && <figcaption>{b.legende}</figcaption>}</figure> : null;
    case 'galerie':
      return (
        <section className="site-section">
          {b.titre && <h2>{b.titre}</h2>}
          <div className="site-galerie">{(b.elements ?? []).filter((e) => e.image).map((e, i) => <figure key={i}><img src={e.image} alt={e.legende ?? ''} loading="lazy" />{e.legende && <figcaption>{e.legende}</figcaption>}</figure>)}</div>
        </section>
      );
    case 'cta':
      return (
        <section className="site-section site-cta">
          {b.titre && <h2>{b.titre}</h2>}
          <Paragraphes texte={b.texte} />
          <LienBouton lien={b.bouton_lien} texte={b.bouton_texte} site={site} />
        </section>
      );
    case 'services':
      return (
        <section className="site-section">
          {b.titre && <h2>{b.titre}</h2>}
          <div className="site-cartes">{(b.elements ?? []).map((e, i) => (
            <article key={i} className="site-carte">{e.image && <img src={e.image} alt="" loading="lazy" />}{e.titre && <h3>{e.titre}</h3>}<Paragraphes texte={e.texte} /></article>
          ))}</div>
        </section>
      );
    case 'produits': {
      const liste = (site.boutique?.liste ?? []).slice(0, b.nombre ?? 6);
      if (!liste.length) return apercu ? <section className="site-section texte-doux">Produits de la boutique en ligne (affichés quand la boutique est publiée).</section> : null;
      return (
        <section className="site-section">
          {b.titre && <h2>{b.titre}</h2>}
          <div className="site-cartes">{liste.map((p) => (
            <article key={p.article_id} className="site-carte">
              {p.photo && <img src={p.photo} alt="" loading="lazy" />}
              <h3>{p.groupe ? `${p.groupe} · ${p.variante}` : p.nom}</h3>
              <p><strong>{formatMontant(p.prix)}</strong></p>
            </article>
          ))}</div>
          <LienBouton lien="/boutique" texte="Voir la boutique" site={site} variante="secondaire" />
        </section>
      );
    }
    case 'temoignages':
      return (
        <section className="site-section">
          {b.titre && <h2>{b.titre}</h2>}
          <div className="site-cartes">{(b.elements ?? []).map((e, i) => <blockquote key={i} className="site-carte"><Paragraphes texte={e.texte} />{e.nom && <footer>— {e.nom}</footer>}</blockquote>)}</div>
        </section>
      );
    case 'faq':
      return (
        <section className="site-section">
          {b.titre && <h2>{b.titre}</h2>}
          {(b.elements ?? []).map((e, i) => <details key={i} className="site-faq"><summary>{e.question}</summary><Paragraphes texte={e.reponse} /></details>)}
        </section>
      );
    case 'contact':
      return (
        <section className="site-section site-contact">
          {b.titre && <h2>{b.titre}</h2>}
          <Paragraphes texte={b.texte} />
          <ul className="site-coordonnees">
            {b.telephone && <li>Téléphone : {b.telephone}</li>}
            {b.whatsapp && <li>WhatsApp : {b.whatsapp}</li>}
            {b.email && <li>E-mail : {b.email}</li>}
            {b.adresse && <li>Adresse : {b.adresse}</li>}
            {b.horaires && <li>Horaires : {b.horaires}</li>}
          </ul>
          {b.formulaire !== false && <FormulaireContact site={site} pageId={pageId} donnees={donnees} apercu={apercu} />}
        </section>
      );
    default:
      return null;
  }
}

// site : { adresse, titre, logo, couleur, theme, pied_de_page, menu, page: { id, slug, titre, blocs }, boutique }
export function RenduSite({ site, donnees, apercu }) {
  const pageCourante = site.page;
  return (
    <div className={`site-public theme-${site.theme ?? 'clair'}`}>
      <header className="site-entete">
        <a className="site-marque" href={apercu ? undefined : `#/site/${site.adresse}`}>
          {site.logo && <img src={site.logo} alt="" />}
          <strong>{site.titre}</strong>
        </a>
        {site.menu?.length > 1 && (
          <nav aria-label="Menu du site">
            {site.menu.map((m) => (
              <a key={m.slug} href={apercu ? undefined : `#/site/${site.adresse}${m.accueil ? '' : `/${m.slug}`}`}
                aria-current={m.slug === pageCourante.slug ? 'page' : undefined}>{m.titre}</a>
            ))}
            {site.boutique && <a href={`#/commander/${site.boutique.adresse}`}>Boutique</a>}
          </nav>
        )}
      </header>
      <main>
        {(pageCourante.blocs ?? []).map((b, i) => <Bloc key={i} b={b} site={site} pageId={pageCourante.id} donnees={donnees} apercu={apercu} />)}
      </main>
      <footer className="site-pied">
        <span>{site.pied_de_page ?? `© ${new Date().getFullYear()} ${site.titre}`}</span>
      </footer>
    </div>
  );
}

// Route publique #/site/<adresse>[/<page>].
export function SitePublic({ donnees, adresse, slug }) {
  const [site, setSite] = useState(null);
  const [erreur, setErreur] = useState('');
  useEffect(() => {
    setSite(null);
    setErreur('');
    donnees.rpc('site_public', { p_adresse: adresse, p_slug: slug ?? null })
      .then((s) => {
        setSite(s);
        appliquerMarque({ nom_logiciel: s.titre, logo_url: s.logo, couleur_accent: s.couleur }, s.page.accueil ? null : s.page.titre);
        const meta = document.querySelector('meta[name="description"]') ?? document.head.appendChild(Object.assign(document.createElement('meta'), { name: 'description' }));
        meta.setAttribute('content', s.page.description_seo ?? s.description ?? '');
        window.scrollTo?.(0, 0);
      })
      .catch((e) => setErreur(e.message));
  }, [donnees, adresse, slug]);
  if (erreur) return <div className="ecran-centre"><div className="connexion-carte"><h1>Page introuvable</h1><p className="texte-doux">{erreur}</p></div></div>;
  if (!site) return <div className="ecran-centre"><Chargement /></div>;
  return <RenduSite site={site} donnees={donnees} />;
}
