import { useState } from 'react';
import { useDonnees, useEspace } from '../../noyau/espace.jsx';
import { lireParametres } from '../../noyau/routes.js';
import { COULEURS_MARQUE } from '../../noyau/marque.js';
import { formatDateHeure } from '../../noyau/format.js';
import { Badge, Bouton, Champ, DataTable, EmptyState, Erreur, lireImageReduite, Modale, PageHeader, Section, Squelette, Tabs } from '../../ui/composants.jsx';
import { RenduSite } from '../../public/RenduSite.jsx';

export const lienSite = (adresse) => `${window.location.origin}${window.location.pathname}#/site/${adresse}`;

// Blocs proposés : [type, libellé, champs]. Un champ : [clé, libellé, genre] (texte, long, image, lien, nombre, case, elements).
export const BLOCS = [
  ['hero', 'Bandeau d’accueil', [['titre', 'Titre'], ['sous_titre', 'Sous-titre', 'long'], ['image', 'Image de fond', 'image'], ['bouton_texte', 'Texte du bouton'], ['bouton_lien', 'Lien du bouton', 'lien']]],
  ['texte', 'Texte', [['titre', 'Titre'], ['texte', 'Texte', 'long']]],
  ['image', 'Image', [['image', 'Image', 'image'], ['legende', 'Légende']]],
  ['galerie', 'Galerie', [['titre', 'Titre'], ['elements', 'Images', 'elements', [['image', 'Image', 'image'], ['legende', 'Légende']]]]],
  ['cta', 'Appel à l’action', [['titre', 'Titre'], ['texte', 'Texte', 'long'], ['bouton_texte', 'Texte du bouton'], ['bouton_lien', 'Lien du bouton', 'lien']]],
  ['services', 'Services', [['titre', 'Titre'], ['elements', 'Services', 'elements', [['titre', 'Nom'], ['texte', 'Description', 'long'], ['image', 'Image', 'image']]]]],
  ['produits', 'Produits de la boutique', [['titre', 'Titre'], ['nombre', 'Nombre de produits', 'nombre']]],
  ['temoignages', 'Témoignages', [['titre', 'Titre'], ['elements', 'Témoignages', 'elements', [['nom', 'Nom'], ['texte', 'Témoignage', 'long']]]]],
  ['faq', 'Questions fréquentes', [['titre', 'Titre'], ['elements', 'Questions', 'elements', [['question', 'Question'], ['reponse', 'Réponse', 'long']]]]],
  ['contact', 'Contact et formulaire', [['titre', 'Titre'], ['texte', 'Texte', 'long'], ['telephone', 'Téléphone'], ['whatsapp', 'WhatsApp'], ['email', 'E-mail'], ['adresse', 'Adresse'], ['horaires', 'Horaires'], ['formulaire', 'Formulaire de contact', 'case']]],
];
const BLOC = Object.fromEntries(BLOCS.map((b) => [b[0], b]));

// Site web : pages (brouillon, aperçu, publication), messages du formulaire, réglages.
export default function SiteWeb({ naviguer, sousRoute }) {
  const { api, etablissement, peut } = useEspace();
  const etab = etablissement.id;
  const { donnees: d, chargement, erreur, recharger } = useDonnees(async () => {
    const [sites, pages, messages] = await Promise.all([
      api.lire('sites', { eq: { etablissement_id: etab } }),
      api.lire('site_pages', { eq: { etablissement_id: etab }, ordre: ['ordre'] }),
      api.lire('site_messages', { eq: { etablissement_id: etab }, ordre: ['cree_le', 'desc'], limite: 500 }),
    ]);
    return { site: sites[0] ?? null, pages, messages };
  }, [etab]);
  const [premier, second] = (sousRoute ?? '').split('/');
  // Lien ?vue=messages|reglages (?statut=… filtre les messages) ou #/siteweb/messages.
  const [onglet, setOnglet] = useState(() => {
    const p = lireParametres();
    if (premier === 'messages' || p.get('vue') === 'messages' || p.get('statut')) return 'messages';
    return p.get('vue') === 'reglages' ? 'reglages' : 'pages';
  });
  const [nouvellePage, setNouvellePage] = useState(null);
  if (chargement && !d) return <div className="page"><Squelette lignes={8} /></div>;
  if (erreur) return <div className="page"><Erreur message={erreur} /></div>;
  if (premier === 'page' && second) {
    const page = d.pages.find((p) => p.id === second);
    if (page) return <EditeurPage site={d.site} page={page} pages={d.pages} onRetour={() => naviguer('siteweb')} onChange={recharger} />;
  }
  const publier = peut('site_web.publier');
  const actives = d.pages.filter((p) => !p.archivee);
  return (
    <div className="page page-large">
      <PageHeader titre="Site web" sousTitre="Pages construites par blocs, publiées quand elles sont prêtes."
        badges={d.site && <Badge ton={d.site.publie ? 'vert' : 'neutre'}>{d.site.publie ? 'En ligne' : 'Hors ligne'}</Badge>}
        actions={(
          <>
            {d.site?.publie && <a className="bouton secondaire" href={lienSite(d.site.adresse)} target="_blank" rel="noreferrer">Voir le site</a>}
            {d.site && peut('site_web.modifier') && onglet === 'pages' && <Bouton variante="principal" icone="plus" onClick={() => setNouvellePage({})}>Page</Bouton>}
          </>
        )} />
      {!d.site && (
        <EmptyState icone="globe" titre="Site pas encore créé"
          texte={publier ? 'Choisissez son adresse et sa couleur, puis créez la page d’accueil.' : 'Le gérant doit d’abord régler le site.'}
          action={publier && <Bouton variante="principal" onClick={() => setOnglet('reglages')}>Régler le site</Bouton>} />
      )}
      <Tabs actif={onglet} onChange={setOnglet} onglets={[
        ['pages', 'Pages', actives.length],
        ['messages', 'Messages', d.messages.filter((m) => m.statut === 'nouveau').length],
        ...(publier ? [['reglages', 'Réglages']] : []),
      ]} />
      {onglet === 'pages' && (
        <Section>
          <DataTable lignes={d.pages} onLigne={(p) => naviguer(`siteweb/page/${p.id}`)}
            vide={<p className="texte-doux">Aucune page. Commencez par l’accueil.</p>}
            colonnes={[
              { id: 'titre', libelle: 'Page', rendu: (p) => <><strong>{p.titre}</strong>{p.accueil && <> <Badge ton="bleu">Accueil</Badge></>}</> },
              { id: 'slug', libelle: 'Adresse', rendu: (p) => (p.accueil ? '/' : `/${p.slug}`) },
              { id: 'menu', libelle: 'Menu', rendu: (p) => (p.dans_menu ? 'Oui' : 'Non') },
              { id: 'etat', libelle: 'État', rendu: (p) => <EtatPage page={p} /> },
              { id: 'publiee_le', libelle: 'Publiée le', rendu: (p) => (p.publiee_le ? formatDateHeure(p.publiee_le) : '—') },
            ]} />
        </Section>
      )}
      {onglet === 'messages' && <Messages messages={d.messages} pages={d.pages} onChange={recharger} />}
      {onglet === 'reglages' && publier && <Reglages site={d.site} pages={d.pages} onFait={recharger} />}
      {nouvellePage && <ModalePage page={nouvellePage} onFermer={() => setNouvellePage(null)} onFait={(id) => { setNouvellePage(null); recharger(); naviguer(`siteweb/page/${id}`); }} />}
    </div>
  );
}

function EtatPage({ page }) {
  if (page.archivee) return <Badge>Archivée</Badge>;
  if (!page.publiee) return <Badge ton="orange">Brouillon</Badge>;
  if (JSON.stringify(page.brouillon) !== JSON.stringify(page.publie)) return <Badge ton="orange">Modifiée, non publiée</Badge>;
  return <Badge ton="vert">Publiée</Badge>;
}

function Messages({ messages, pages, onChange }) {
  const { api, peut, notifier } = useEspace();
  const [erreur, setErreur] = useState('');
  const titrePage = Object.fromEntries(pages.map((p) => [p.id, p.titre]));
  const traiter = async (m) => {
    setErreur('');
    try {
      await api.rpc('traiter_message_site', { p_message_id: m.id });
      notifier('Message traité');
      onChange();
    } catch (err) {
      setErreur(err.message);
    }
  };
  return (
    <Section sousTitre="Messages envoyés par le formulaire de contact du site. Rappelez le visiteur, puis marquez le message traité.">
      <Erreur message={erreur} />
      <DataTable lignes={messages} rechercher={(m) => `${m.nom} ${m.telephone ?? ''} ${m.email ?? ''} ${m.message}`}
        filtres={[{ id: 'statut', libelle: 'État', options: [['nouveau', 'Nouveaux'], ['traite', 'Traités']], appliquer: (m, v) => m.statut === v }]}
        vide={<p className="texte-doux">Aucun message pour l’instant.</p>}
        colonnes={[
          { id: 'date', libelle: 'Reçu', rendu: (m) => formatDateHeure(m.cree_le), tri: (m) => m.cree_le },
          { id: 'nom', libelle: 'Visiteur', rendu: (m) => <><strong>{m.nom}</strong><br /><small className="texte-doux">{[m.telephone, m.email].filter(Boolean).join(' · ')}</small></> },
          { id: 'message', libelle: 'Message', rendu: (m) => <span className="texte-multiligne">{m.message}</span> },
          { id: 'page', libelle: 'Page', rendu: (m) => titrePage[m.page_id] ?? '—' },
          { id: 'statut', libelle: 'État', rendu: (m) => (m.statut === 'traite' ? <Badge ton="vert">Traité</Badge>
            : peut('site_web.modifier') ? <Bouton onClick={() => traiter(m)}>Marquer traité</Bouton> : <Badge ton="orange">Nouveau</Badge>) },
        ]} />
    </Section>
  );
}

function Reglages({ site, pages, onFait }) {
  const { api, etablissement, notifier } = useEspace();
  const s = site ?? {};
  const [v, setV] = useState({
    adresse: s.adresse ?? '', titre: s.titre ?? etablissement.nom ?? '', description: s.description ?? '', publie: s.publie ?? false,
    couleur: s.couleur ?? COULEURS_MARQUE[0][0], theme: s.theme ?? 'clair', pied_de_page: s.pied_de_page ?? '',
  });
  const [erreur, setErreur] = useState('');
  const changer = (c) => (e) => setV({ ...v, [c]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const accueilPublie = pages.some((p) => p.accueil && p.publiee);
  const valider = async (e) => {
    e.preventDefault();
    setErreur('');
    try {
      await api.rpc('enregistrer_site', { p_etablissement_id: etablissement.id, p: v });
      notifier('Site enregistré');
      onFait();
    } catch (err) {
      setErreur(err.message);
    }
  };
  return (
    <Section>
      <form className="formulaire" onSubmit={valider}>
        <div className="grille-champs">
          <Champ libelle="Nom du site"><input value={v.titre} onChange={changer('titre')} required maxLength={120} /></Champ>
          <Champ libelle="Adresse du site" aide={v.adresse ? lienSite(v.adresse.toLowerCase()) : 'Ex. salon-prestige'}>
            <input value={v.adresse} onChange={changer('adresse')} required pattern="[a-zA-Z0-9][a-zA-Z0-9\-]{2,39}" maxLength={40} />
          </Champ>
          <Champ libelle="Couleur">
            <select value={v.couleur} onChange={changer('couleur')}>{COULEURS_MARQUE.map(([c, l]) => <option key={c} value={c}>{l}</option>)}</select>
          </Champ>
          <Champ libelle="Thème">
            <select value={v.theme} onChange={changer('theme')}><option value="clair">Clair</option><option value="sombre">Sombre</option></select>
          </Champ>
        </div>
        <Champ libelle="Description (moteurs de recherche)" aide="Une phrase : activité et ville."><input value={v.description} onChange={changer('description')} maxLength={300} /></Champ>
        <Champ libelle="Pied de page"><input value={v.pied_de_page} onChange={changer('pied_de_page')} maxLength={500} placeholder={`© ${new Date().getFullYear()} ${v.titre}`} /></Champ>
        <label className="case"><input type="checkbox" checked={v.publie} onChange={changer('publie')} disabled={!accueilPublie && !v.publie} /> Site en ligne (visible par tous)</label>
        {!accueilPublie && <p className="texte-doux">Publiez d’abord la page d’accueil pour mettre le site en ligne.</p>}
        <p className="texte-doux">Nom de domaine propre (ex. www.mon-salon.com) : sur demande à Agence Elite.</p>
        <Erreur message={erreur} />
        <div className="actions"><Bouton type="submit" variante="principal">Enregistrer</Bouton></div>
      </form>
    </Section>
  );
}

function ModalePage({ page, onFermer, onFait }) {
  const { api, etablissement } = useEspace();
  const [v, setV] = useState({
    slug: page.slug ?? '', titre: page.titre ?? '', description_seo: page.description_seo ?? '', ordre: String(page.ordre ?? 0),
    dans_menu: page.dans_menu ?? true, accueil: page.accueil ?? false, archivee: page.archivee ?? false,
  });
  const [erreur, setErreur] = useState('');
  const changer = (c) => (e) => setV({ ...v, [c]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const valider = async (e) => {
    e.preventDefault();
    try {
      const id = await api.rpc('enregistrer_page_site', { p_etablissement_id: etablissement.id, p: { id: page.id, ...v } });
      onFait(id);
    } catch (err) {
      setErreur(err.message);
    }
  };
  return (
    <Modale titre={page.id ? `Page ${page.titre}` : 'Nouvelle page'} onFermer={onFermer}>
      <form className="formulaire" onSubmit={valider}>
        <div className="grille-champs">
          <Champ libelle="Titre (menu et onglet)"><input value={v.titre} onChange={changer('titre')} required maxLength={80} autoFocus /></Champ>
          <Champ libelle="Adresse de la page" aide="Ex. services, contact"><input value={v.slug} onChange={changer('slug')} required pattern="[a-zA-Z0-9][a-zA-Z0-9\-]{0,39}" maxLength={40} /></Champ>
          <Champ libelle="Ordre dans le menu"><input type="number" value={v.ordre} onChange={changer('ordre')} /></Champ>
        </div>
        <Champ libelle="Description (moteurs de recherche)"><input value={v.description_seo} onChange={changer('description_seo')} maxLength={300} /></Champ>
        <label className="case"><input type="checkbox" checked={v.dans_menu} onChange={changer('dans_menu')} /> Dans le menu</label>
        <label className="case"><input type="checkbox" checked={v.accueil} onChange={changer('accueil')} /> Page d’accueil</label>
        {page.id && !page.accueil && <label className="case"><input type="checkbox" checked={v.archivee} onChange={changer('archivee')} /> Archivée (retirée du site, rien n’est effacé)</label>}
        <Erreur message={erreur} />
        <div className="actions">
          <Bouton type="button" onClick={onFermer}>Annuler</Bouton>
          <Bouton type="submit" variante="principal">Enregistrer</Bouton>
        </div>
      </form>
    </Modale>
  );
}

function ChampImage({ libelle, valeur, onChange }) {
  const [erreur, setErreur] = useState('');
  return (
    <Champ libelle={libelle}>
      <span className="champ-image-site">
        {valeur && <img src={valeur} alt="" />}
        <input type="file" accept="image/png,image/jpeg,image/webp" aria-label={`${libelle} : importer`}
          onChange={async (e) => {
            setErreur('');
            const fichier = e.target.files?.[0];
            if (!fichier) return;
            try {
              onChange(await lireImageReduite(fichier, 1400));
            } catch (err) {
              setErreur(err.message);
            }
          }} />
        <input value={valeur?.startsWith('data:') ? '' : valeur ?? ''} placeholder="ou adresse https://…" aria-label={`${libelle} : adresse`} onChange={(e) => onChange(e.target.value)} />
        {valeur && <button type="button" className="lien" onClick={() => onChange('')}>Retirer l’image</button>}
        {erreur && <small className="texte-erreur">{erreur}</small>}
      </span>
    </Champ>
  );
}

function ChampBloc({ champ, valeur, onChange }) {
  const [cle, libelle, genre, sousChamps] = champ;
  if (genre === 'long') return <Champ libelle={libelle}><textarea rows={3} value={valeur ?? ''} onChange={(e) => onChange(e.target.value)} /></Champ>;
  if (genre === 'image') return <ChampImage libelle={libelle} valeur={valeur} onChange={onChange} />;
  if (genre === 'nombre') return <Champ libelle={libelle}><input type="number" min="1" max="12" value={valeur ?? 6} onChange={(e) => onChange(e.target.value)} /></Champ>;
  if (genre === 'case') return <label className="case"><input type="checkbox" checked={valeur !== false} onChange={(e) => onChange(e.target.checked)} /> {libelle}</label>;
  if (genre === 'lien') {
    return <Champ libelle={libelle} aide="/page du site, /boutique, https://…, tel:+242…"><input value={valeur ?? ''} onChange={(e) => onChange(e.target.value)} maxLength={500} /></Champ>;
  }
  if (genre === 'elements') {
    const liste = valeur ?? [];
    const maj = (i, c, x) => onChange(liste.map((e, j) => (j === i ? { ...e, [c]: x } : e)));
    return (
      <fieldset className="site-elements">
        <legend>{libelle}</legend>
        {liste.map((e, i) => (
          <div key={i} className="site-element">
            {sousChamps.map((sc) => <ChampBloc key={sc[0]} champ={sc} valeur={e[sc[0]]} onChange={(x) => maj(i, sc[0], x)} />)}
            <button type="button" className="lien" onClick={() => onChange(liste.filter((_, j) => j !== i))}>Retirer</button>
          </div>
        ))}
        <Bouton type="button" icone="plus" onClick={() => onChange([...liste, {}])}>Ajouter</Bouton>
      </fieldset>
    );
  }
  return <Champ libelle={libelle}><input value={valeur ?? ''} onChange={(e) => onChange(e.target.value)} maxLength={cle === 'email' ? 160 : 300} /></Champ>;
}

function EditeurPage({ site, page, pages, onRetour, onChange }) {
  const { api, peut, notifier } = useEspace();
  const [blocs, setBlocs] = useState(() => page.brouillon ?? []);
  const [modifie, setModifie] = useState(false);
  const [ouvert, setOuvert] = useState(null);
  const [apercu, setApercu] = useState(false);
  const [reglages, setReglages] = useState(false);
  const [erreur, setErreur] = useState('');
  const [travail, setTravail] = useState(false);
  const modifier = peut('site_web.modifier') && !page.archivee;
  const changer = (liste) => {
    setBlocs(liste);
    setModifie(true);
  };
  const deplacer = (i, sens) => {
    const liste = [...blocs];
    [liste[i], liste[i + sens]] = [liste[i + sens], liste[i]];
    changer(liste);
    setOuvert(null);
  };
  const enregistrer = async () => {
    setErreur('');
    setTravail(true);
    try {
      const propres = await api.rpc('enregistrer_blocs_page_site', { p_page_id: page.id, p_blocs: blocs });
      setBlocs(propres);
      setModifie(false);
      notifier('Brouillon enregistré');
      onChange();
      return true;
    } catch (err) {
      setErreur(err.message);
      return false;
    } finally {
      setTravail(false);
    }
  };
  const publier = async (oui) => {
    if (oui && modifie && !(await enregistrer())) return;
    setErreur('');
    try {
      await api.rpc('publier_page_site', { p_page_id: page.id, p_publier: oui });
      notifier(oui ? 'Page publiée' : 'Page retirée du site');
      onChange();
    } catch (err) {
      setErreur(err.message);
    }
  };
  const menu = pages.filter((p) => !p.archivee && p.dans_menu).map((p) => ({ slug: p.slug, titre: p.titre, accueil: p.accueil }));
  return (
    <div className="page page-large">
      <PageHeader titre={page.titre} sousTitre={page.accueil ? 'Page d’accueil' : `/${page.slug}`}
        badges={<EtatPage page={page} />}
        actions={(
          <>
            <Bouton onClick={onRetour}>Retour</Bouton>
            <Bouton icone="oeil" onClick={() => setApercu(true)}>Aperçu</Bouton>
            {modifier && <Bouton onClick={() => setReglages(true)}>Propriétés</Bouton>}
            {modifier && <Bouton onClick={enregistrer} disabled={!modifie} chargement={travail}>Enregistrer le brouillon</Bouton>}
            {peut('site_web.publier') && !page.archivee && <Bouton variante="principal" onClick={() => publier(true)}>Publier</Bouton>}
          </>
        )} />
      <Erreur message={erreur} />
      {modifie && <p className="encart">Modifications non enregistrées.</p>}
      <Section>
        {!blocs.length && <p className="texte-doux">Page vide : ajoutez un bloc ci-dessous.</p>}
        <ol className="liste-blocs-site">
          {blocs.map((b, i) => {
            const def = BLOC[b.type];
            return (
              <li key={i} className="bloc-site-edition">
                <div className="bloc-site-tete">
                  <button type="button" className="lien" onClick={() => setOuvert(ouvert === i ? null : i)} aria-expanded={ouvert === i}>
                    <strong>{def?.[1] ?? b.type}</strong> {b.titre ? <span className="texte-doux">· {b.titre}</span> : null}
                  </button>
                  {modifier && (
                    <span className="groupe-boutons">
                      <button type="button" className="icone-bouton" disabled={i === 0} onClick={() => deplacer(i, -1)} aria-label="Monter">↑</button>
                      <button type="button" className="icone-bouton" disabled={i === blocs.length - 1} onClick={() => deplacer(i, 1)} aria-label="Descendre">↓</button>
                      <button type="button" className="lien" onClick={() => { changer(blocs.filter((_, j) => j !== i)); setOuvert(null); }}>Retirer</button>
                    </span>
                  )}
                </div>
                {ouvert === i && def && (
                  <fieldset className="formulaire" disabled={!modifier}>
                    {def[2].map((champ) => (
                      <ChampBloc key={champ[0]} champ={champ} valeur={b[champ[0]]}
                        onChange={(x) => changer(blocs.map((y, j) => (j === i ? { ...y, [champ[0]]: x } : y)))} />
                    ))}
                  </fieldset>
                )}
              </li>
            );
          })}
        </ol>
        {modifier && blocs.length < 30 && (
          <div className="ajout-bloc-site">
            <span className="texte-doux">Ajouter :</span>
            {BLOCS.map(([type, libelle]) => (
              <Bouton key={type} onClick={() => { changer([...blocs, { type, ...(type === 'contact' ? { formulaire: true } : {}) }]); setOuvert(blocs.length); }}>{libelle}</Bouton>
            ))}
          </div>
        )}
        {peut('site_web.publier') && page.publiee && !page.accueil && (
          <p><button type="button" className="lien" onClick={() => publier(false)}>Retirer la page du site</button></p>
        )}
      </Section>
      {apercu && (
        <Modale titre="Aperçu du brouillon" onFermer={() => setApercu(false)} large>
          <div className="apercu-site">
            <RenduSite apercu donnees={api} site={{ ...(site ?? {}), adresse: site?.adresse ?? 'apercu', titre: site?.titre ?? 'Mon site', menu, page: { ...page, blocs } }} />
          </div>
        </Modale>
      )}
      {reglages && <ModalePage page={page} onFermer={() => setReglages(false)} onFait={() => { setReglages(false); onChange(); }} />}
    </div>
  );
}
