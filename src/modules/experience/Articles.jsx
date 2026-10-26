import React, { lazy, Suspense, useMemo, useRef, useState } from 'react';
import { useDonnees, useEspace } from '../../noyau/espace.jsx';
import { formatQuantite } from '../../noyau/format.js';
import { Bouton, Chargement, Erreur, Icone, lireImageReduite, Recherche, Squelette } from '../../ui/composants.jsx';
import { FormulaireArticle, ImportArticles } from '../articles/Articles.jsx';
import { ajouterJours, soireeDe } from './analyse.js';
import { ChampEnPlace, EnteteXp, MiniCourbe, Segments, Tuile } from './communs.jsx';

// Articles (nouvelle version The Dream) : une seule page. Les cartes montrent la photo, les prix modifiables sur
// place, le stock, ce qui s'est vendu sur 4 semaines et sa petite courbe. Créer, importer, changer les prix et
// ranger les catégories se font ici même, plus aucun « écran complet ».
const Categories = lazy(() => import('../articles/Categories.jsx'));
const AjoutMultiple = lazy(() => import('../articles/AjoutMultiple.jsx'));
const ChangerPrix = lazy(() => import('../articles/ChangerPrix.jsx'));

const JOURS_SUIVIS = 28;

export default function Articles() {
  const { api, etablissement, peut, notifier, montant, reglagesFonctions } = useEspace();
  const etab = etablissement.id;
  const modifiable = peut('articles.gerer');
  const debut = Number(reglagesFonctions?.cloture?.debut_service ?? 8) || 8;
  const [vue, setVue] = useState('vente');
  const [filtre, setFiltre] = useState('tout');
  const [categorie, setCategorie] = useState('');
  const [texte, setTexte] = useState('');
  const [depot, setDepot] = useState(null);
  const [locaux, setLocaux] = useState({});
  const [modale, setModale] = useState(null);
  const listeRef = useRef(null);
  const { donnees, chargement, erreur, recharger } = useDonnees(async () => {
    const aujourdhui = soireeDe(new Date(), etablissement.fuseau || 'Africa/Brazzaville', debut);
    const [articles, categories, stock, pilotage] = await Promise.all([
      api.lire('articles', { eq: { etablissement_id: etab }, ordre: ['nom'] }),
      api.lire('categories_articles', { eq: { etablissement_id: etab }, ordre: ['nom'] }),
      peut('stock.lire') ? api.lire('stock_articles', { eq: { etablissement_id: etab } }).catch(() => []) : [],
      peut('cloture.cloturer')
        ? api.rpc('pilotage_bar', { p_etablissement_id: etab, p_du: ajouterJours(aujourdhui, -(JOURS_SUIVIS - 1)), p_au: aujourdhui }).catch(() => null)
        : null,
    ]);
    // Ventes par article : quantité, chiffre et une courbe jour par jour (4 semaines).
    const ventes = {};
    const soirees = [];
    for (let i = JOURS_SUIVIS - 1; i >= 0; i -= 1) soirees.push(ajouterJours(aujourdhui, -i));
    const rang = Object.fromEntries(soirees.map((j, i) => [j, i]));
    (pilotage?.produits ?? []).forEach(([jour, id, qte, total]) => {
      const x = (ventes[id] ??= { qte: 0, ca: 0, courbe: new Array(JOURS_SUIVIS).fill(0) });
      x.qte += Number(qte) || 0;
      x.ca += Number(total) || 0;
      if (rang[jour] != null) x.courbe[rang[jour]] += Number(total) || 0;
    });
    const triees = [...categories].sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0) || a.nom.localeCompare(b.nom, 'fr'));
    return { articles, categories: triees, stock: Object.fromEntries(stock.map((s) => [s.article_id, Number(s.quantite)])), ventes };
  }, [etab]);
  const articles = useMemo(() => (donnees?.articles ?? []).map((a) => ({ ...a, ...(locaux[a.id] ?? {}) })), [donnees, locaux]);

  const modifier = async (a, changement, message, annulation) => {
    const suivant = { ...a, ...changement };
    try {
      await api.rpc('enregistrer_article', { p_etablissement_id: etab, p_article: suivant });
      setLocaux((l) => ({ ...l, [a.id]: { ...(l[a.id] ?? {}), ...changement } }));
      // « Annuler » : on remet exactement la valeur d'avant, sans recharger la page.
      notifier(message, 'succes', annulation === false ? undefined : {
        action: {
          libelle: 'Annuler',
          faire: () => modifier(a, Object.fromEntries(Object.keys(changement).map((k) => [k, a[k] ?? null])), `${a.nom} : modification annulée`, false).catch(() => {}),
        },
      });
    } catch (err) {
      notifier(err.message, 'erreur');
      throw err;
    }
  };
  const photo = async (a, fichier) => {
    if (!fichier || !fichier.type?.startsWith('image/')) return;
    try {
      const image = await lireImageReduite(fichier, 600);
      await modifier(a, { photo: image }, `Photo de ${a.nom} enregistrée`);
    } catch {
      // message déjà affiché
    }
  };
  const fait = (message) => {
    setModale(null);
    notifier(message);
    recharger();
  };

  if (chargement && !donnees) return <Chargement />;
  if (erreur) return <Erreur message={erreur} />;
  const enVente = articles.filter((a) => a.actif);
  const ouvertes = donnees.categories.filter((c) => !c.archivee_le);
  const base = vue === 'archives' ? articles.filter((a) => !a.actif) : enVente;
  const sansPhoto = base.filter((a) => !a.photo);
  const sansCout = base.filter((a) => !(Number(a.cout_achat) > 0));
  const jamaisVendus = base.filter((a) => !(donnees.ventes[a.id]?.qte > 0));
  const t = texte.trim().toLowerCase();
  const visibles = base.filter((a) => (filtre === 'tout'
    || (filtre === 'photo' ? !a.photo : filtre === 'cout' ? !(Number(a.cout_achat) > 0) : filtre === 'dort' ? !(donnees.ventes[a.id]?.qte > 0) : true))
    && (!categorie || a.categorie_id === categorie) && (!t || `${a.nom} ${a.reference ?? ''}`.toLowerCase().includes(t)))
    .sort((a, b) => (donnees.ventes[b.id]?.ca ?? 0) - (donnees.ventes[a.id]?.ca ?? 0) || a.nom.localeCompare(b.nom, 'fr'));
  const margeMoyenne = (() => {
    const avec = base.filter((a) => Number(a.cout_achat) > 0 && Number(a.prix_vente) > 0);
    if (!avec.length) return null;
    return avec.reduce((s, a) => s + (a.prix_vente - a.cout_achat) / a.prix_vente, 0) / avec.length;
  })();
  const versListe = (f) => {
    setFiltre(f);
    listeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const maxCourbe = Math.max(1, ...visibles.map((a) => donnees.ventes[a.id]?.ca ?? 0));

  return (
    <div className="xp-page">
      <EnteteXp surtitre={etablissement.nom} titre="Articles"
        sousTitre="Touchez un prix pour le changer, glissez une photo sur une carte, ou touchez « Modifier » pour tout changer.">
        <Segments libelle="Vue" valeur={vue} onChange={(v) => { setVue(v); setFiltre('tout'); }}
          options={[['vente', 'En vente'], ['archives', 'Archivés'], ['categories', 'Catégories']]} />
        {modifiable && <Bouton icone="plus" variante="principal" onClick={() => setModale({ type: 'article' })}>Nouvel article</Bouton>}
        {modifiable && <Bouton onClick={() => setModale({ type: 'plusieurs' })}>Ajouter plusieurs</Bouton>}
        {modifiable && <Bouton onClick={() => setModale({ type: 'import' })}>Importer</Bouton>}
        {modifiable && <Bouton onClick={() => setModale({ type: 'prix' })}>Changer les prix</Bouton>}
      </EnteteXp>

      {vue === 'categories' ? (
        <Suspense fallback={<Squelette lignes={6} />}>
          <div className="page-integree">
            <Categories categories={donnees.categories} articles={donnees.articles} onChange={recharger} />
          </div>
        </Suspense>
      ) : (
        <>
          <div className="xp-grille">
            <Tuile icone="articles" titre={vue === 'archives' ? 'Articles archivés' : 'Articles en vente'} valeur={base.length}
              onClick={() => versListe('tout')} pourquoi={`${ouvertes.length} catégories`} conseil="Voir la liste" />
            <Tuile icone="photo" titre="Sans photo" valeur={sansPhoto.length} onClick={() => versListe(filtre === 'photo' ? 'tout' : 'photo')}
              verdict={{ ton: sansPhoto.length ? 'vigilance' : 'bon', texte: sansPhoto.length ? 'à compléter' : 'complet' }}
              pourquoi="Une photo aide la caissière à trouver vite le bon article." conseil={sansPhoto.length ? 'Voir ceux sans photo' : undefined} />
            <Tuile icone="billet" titre="Sans prix d’achat" valeur={sansCout.length} onClick={() => versListe(filtre === 'cout' ? 'tout' : 'cout')}
              verdict={{ ton: sansCout.length ? 'vigilance' : 'bon', texte: sansCout.length ? 'marge inconnue' : 'complet' }}
              pourquoi="Sans prix d’achat, le logiciel ne sait pas ce que l’article vous rapporte." conseil={sansCout.length ? 'Les compléter' : undefined} />
            <Tuile icone="graphique" titre="Marge moyenne" valeur={margeMoyenne == null ? '—' : `${Math.round(margeMoyenne * 100)} %`}
              verdict={margeMoyenne == null ? undefined : { ton: margeMoyenne >= 0.5 ? 'bon' : margeMoyenne >= 0.3 ? 'vigilance' : 'mauvais', texte: margeMoyenne >= 0.5 ? 'bonne' : margeMoyenne >= 0.3 ? 'moyenne' : 'faible' }}
              pourquoi="Sur les articles qui ont un prix d’achat." />
            <Tuile icone="horloge" titre="Qui ne se vendent pas" valeur={jamaisVendus.length} onClick={() => versListe(filtre === 'dort' ? 'tout' : 'dort')}
              verdict={{ ton: jamaisVendus.length ? 'vigilance' : 'bon', texte: jamaisVendus.length ? '4 semaines sans vente' : 'tout tourne' }}
              pourquoi="Ils occupent de la place et de l’argent." conseil={jamaisVendus.length ? 'Voir lesquels' : undefined} />
          </div>

          <div className="xp-entete" style={{ alignItems: 'center' }} ref={listeRef}>
            <Segments libelle="Catégorie" valeur={categorie} onChange={setCategorie} options={[['', 'Toutes'], ...ouvertes.map((c) => [c.id, c.nom])]} />
            <div style={{ minWidth: 220, flex: '0 1 320px' }}><Recherche valeur={texte} onChange={setTexte} placeholder="Chercher un article" /></div>
          </div>

          <div className="xp-produits">
            {visibles.map((a) => {
              const marge = Number(a.cout_achat) > 0 && Number(a.prix_vente) > 0 ? (a.prix_vente - a.cout_achat) / a.prix_vente : null;
              const v = donnees.ventes[a.id];
              const stock = donnees.stock[a.id];
              return (
                <div key={a.id} className={`xp-produit ${depot === a.id ? 'depot' : ''}`}
                  onDragOver={(e) => { if (modifiable) { e.preventDefault(); setDepot(a.id); } }}
                  onDragLeave={() => setDepot(null)}
                  onDrop={(e) => { e.preventDefault(); setDepot(null); if (modifiable) photo(a, e.dataTransfer.files?.[0]); }}>
                  <div className="xp-produit-photo">
                    {a.photo ? <img src={a.photo} alt="" loading="lazy" /> : (
                      <span className="sans-photo"><Icone nom="plus" taille={22} />{modifiable ? 'Glissez une photo ici ou touchez' : 'Pas de photo'}</span>
                    )}
                    {modifiable && (
                      <label aria-label={`Photo de ${a.nom}`}>
                        <input type="file" accept="image/*" onChange={(e) => photo(a, e.target.files?.[0])} />
                      </label>
                    )}
                  </div>
                  <div className="xp-produit-corps">
                    <strong>{a.nom}{a.variante ? <small className="texte-doux"> · {a.variante}</small> : null}</strong>
                    <span className="xp-produit-prix">
                      <span>Vente</span>
                      <span className="prix"><ChampEnPlace type="number" min={0} valeur={Number(a.prix_vente)} format={(x) => montant(x)} libelle={`prix de ${a.nom}`} desactive={!modifiable}
                        onEnregistrer={(x) => (x > 0 ? modifier(a, { prix_vente: x }, `${a.nom} : ${montant(x)}`) : Promise.resolve())} /></span>
                    </span>
                    <span className="xp-produit-prix">
                      <span>Achat</span>
                      <ChampEnPlace type="number" min={0} valeur={a.cout_achat == null ? null : Number(a.cout_achat)} format={(x) => montant(x)} libelle={`prix d'achat de ${a.nom}`} desactive={!modifiable}
                        onEnregistrer={(x) => modifier(a, { cout_achat: x == null || x === '' ? null : x }, `Prix d’achat de ${a.nom} enregistré`)} />
                    </span>
                    {marge != null && (
                      <span className={`xp-marge xp-verdict ${marge >= 0.5 ? 'bon' : marge >= 0.3 ? 'vigilance' : 'mauvais'}`}>
                        rapporte {montant(a.prix_vente - a.cout_achat)} ({Math.round(marge * 100)} %)
                      </span>
                    )}
                    <span className="xp-produit-mesures">
                      <span>
                        <small className="texte-doux">Vendu (4 semaines)</small>
                        <strong>{v?.qte ? `${formatQuantite(v.qte, a.unite)}` : '—'}</strong>
                        {v?.ca > 0 && <small className="texte-doux">{montant(v.ca)}</small>}
                      </span>
                      <span>
                        <small className="texte-doux">En stock</small>
                        <strong className={a.suivi_stock && stock != null && stock <= Number(a.stock_minimum || 0) ? 'texte-alerte' : ''}>
                          {!a.suivi_stock ? 'sans suivi' : stock == null ? '—' : formatQuantite(stock, a.unite)}
                        </strong>
                      </span>
                    </span>
                    {v?.ca > 0 && <MiniCourbe points={v.courbe} libelle={`ventes de ${a.nom} sur 4 semaines`} couleur={v.ca === maxCourbe ? 'var(--vert)' : 'var(--accent)'} />}
                    {modifiable && (
                      <span className="xp-produit-actions">
                        <Bouton icone="parametres" onClick={() => setModale({ type: 'article', article: a })}>Modifier</Bouton>
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {!visibles.length && <p className="texte-doux">Aucun article ne correspond.</p>}
        </>
      )}

      {modale?.type === 'article' && (
        <FormulaireArticle article={modale.article} categories={ouvertes} onFermer={() => setModale(null)}
          onPlusieurs={() => setModale({ type: 'plusieurs' })} onEnregistre={fait} />
      )}
      {modale?.type === 'plusieurs' && (
        <Suspense fallback={null}>
          <AjoutMultiple articles={donnees.articles} categories={ouvertes} onFermer={() => setModale(null)}
            onAjoutes={(message, fermer) => { if (fermer) setModale(null); notifier(message); recharger(); }} />
        </Suspense>
      )}
      {modale?.type === 'prix' && (
        <Suspense fallback={null}>
          <ChangerPrix articles={donnees.articles} categories={ouvertes} selection={[]} onFermer={() => { setModale(null); recharger(); }}
            onTermine={fait} />
        </Suspense>
      )}
      {modale?.type === 'import' && <ImportArticles onFermer={() => setModale(null)} onImporte={fait} />}
    </div>
  );
}
