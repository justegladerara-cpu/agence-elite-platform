import React, { useState } from 'react';
import { useDonnees, useEspace } from '../../noyau/espace.jsx';
import { formatQuantite } from '../../noyau/format.js';
import { Badge, Bouton, Champ, Chargement, EnTete, Erreur, lireImageReduite, Modale, Onglets, Recherche, Vide } from '../../ui/composants.jsx';
import { VignetteArticle } from '../caisse/Caisse.jsx';
import { lireCsvArticles, MODELE_CSV } from './importCsv.js';

const VIDE = {
  nom: '', reference: '', code_barres: '', categorie_id: '', prix_vente: '', cout_achat: '', unite: 'unité',
  suivi_stock: true, stock_minimum: '0', stock_initial: '', description: '', photo: '', actif: true,
};

function FormulaireArticle({ article, categories, onFermer, onEnregistre }) {
  const { api, etablissement, peut } = useEspace();
  const [valeurs, setValeurs] = useState(() => (article
    ? { ...VIDE, ...Object.fromEntries(Object.entries(article).map(([k, v]) => [k, v ?? ''])) }
    : VIDE));
  const [nouvelleCategorie, setNouvelleCategorie] = useState('');
  const [erreur, setErreur] = useState('');
  const [chargement, setChargement] = useState(false);
  const changer = (champ) => (e) => setValeurs((v) => ({ ...v, [champ]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  const choisirPhoto = async (e) => {
    const fichier = e.target.files?.[0];
    if (!fichier) return;
    try {
      const photo = await lireImageReduite(fichier);
      setValeurs((v) => ({ ...v, photo }));
    } catch (err) {
      setErreur(err.message);
    }
  };

  const enregistrer = async (e) => {
    e.preventDefault();
    setChargement(true);
    setErreur('');
    try {
      let categorie = valeurs.categorie_id;
      if (categorie === '__nouvelle') {
        categorie = await api.rpc('enregistrer_categorie', { p_etablissement_id: etablissement.id, p_nom: nouvelleCategorie });
      }
      const donnees = {
        ...valeurs,
        id: article?.id,
        categorie_id: categorie || null,
        prix_vente: Number(valeurs.prix_vente),
        cout_achat: valeurs.cout_achat === '' ? null : Number(valeurs.cout_achat),
        stock_minimum: Number(valeurs.stock_minimum || 0),
        stock_initial: article ? undefined : Number(valeurs.stock_initial || 0),
      };
      await api.rpc('enregistrer_article', { p_etablissement_id: etablissement.id, p_article: donnees });
      onEnregistre(article ? 'Article modifié' : 'Article créé');
    } catch (err) {
      setErreur(err.message);
      setChargement(false);
    }
  };

  return (
    <Modale titre={article ? 'Modifier l’article' : 'Nouvel article'} onFermer={onFermer} large>
      <form className="formulaire" onSubmit={enregistrer}>
        <div className="article-photo">
          <VignetteArticle article={{ nom: valeurs.nom || '?', photo: valeurs.photo }} taille="grande" />
          <div>
            <label className="bouton secondaire">
              <input type="file" accept="image/*" capture="environment" onChange={choisirPhoto} hidden />
              Prendre ou choisir une photo
            </label>
            {valeurs.photo && <button type="button" className="lien" onClick={() => setValeurs((v) => ({ ...v, photo: '' }))}>Retirer la photo</button>}
          </div>
        </div>
        <div className="grille-champs">
          <Champ libelle="Nom de l’article" className="large"><input value={valeurs.nom} onChange={changer('nom')} required autoFocus /></Champ>
          <Champ libelle="Prix de vente"><input type="number" min="0" step="any" inputMode="decimal" value={valeurs.prix_vente} onChange={changer('prix_vente')} required /></Champ>
          <Champ libelle="Coût d’achat" aide="Sert au calcul de la marge."><input type="number" min="0" step="any" inputMode="decimal" value={valeurs.cout_achat} onChange={changer('cout_achat')} /></Champ>
          <Champ libelle="Catégorie">
            <select value={valeurs.categorie_id} onChange={changer('categorie_id')}>
              <option value="">Sans catégorie</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
              <option value="__nouvelle">+ Nouvelle catégorie…</option>
            </select>
          </Champ>
          {valeurs.categorie_id === '__nouvelle' && (
            <Champ libelle="Nom de la catégorie"><input value={nouvelleCategorie} onChange={(e) => setNouvelleCategorie(e.target.value)} required /></Champ>
          )}
          <Champ libelle="Unité"><input value={valeurs.unite} onChange={changer('unite')} placeholder="unité, m, kg, L…" /></Champ>
          <Champ libelle="Référence"><input value={valeurs.reference} onChange={changer('reference')} /></Champ>
          <Champ libelle="Code-barres"><input value={valeurs.code_barres} onChange={changer('code_barres')} inputMode="numeric" /></Champ>
        </div>
        <label className="case">
          <input type="checkbox" checked={valeurs.suivi_stock} onChange={changer('suivi_stock')} />
          Suivre le stock de cet article (décocher pour un service)
        </label>
        {valeurs.suivi_stock && (
          <div className="grille-champs">
            <Champ libelle="Alerte stock bas à"><input type="number" min="0" step="any" value={valeurs.stock_minimum} onChange={changer('stock_minimum')} /></Champ>
            {!article && peut('stock.ajuster') && (
              <Champ libelle="Stock initial" aide="Crée une entrée de stock tracée."><input type="number" min="0" step="any" value={valeurs.stock_initial} onChange={changer('stock_initial')} /></Champ>
            )}
          </div>
        )}
        <Champ libelle="Description (facultatif)"><textarea rows={2} value={valeurs.description} onChange={changer('description')} /></Champ>
        {article && (
          <label className="case">
            <input type="checkbox" checked={valeurs.actif} onChange={changer('actif')} />
            Article en vente (décocher pour l’archiver sans perdre son historique)
          </label>
        )}
        <Erreur message={erreur} />
        <div className="actions">
          <Bouton type="button" onClick={onFermer}>Annuler</Bouton>
          <Bouton type="submit" variante="principal" chargement={chargement}>Enregistrer</Bouton>
        </div>
      </form>
    </Modale>
  );
}

function ImportArticles({ onFermer, onImporte }) {
  const { api, etablissement, peut } = useEspace();
  const [lignes, setLignes] = useState(null);
  const [nomFichier, setNomFichier] = useState('');
  const [erreur, setErreur] = useState('');
  const [chargement, setChargement] = useState(false);
  const modele = `data:text/csv;charset=utf-8,${encodeURIComponent(MODELE_CSV)}`;
  const avecStock = lignes?.some((l) => l.stock_initial > 0);
  return (
    <Modale titre="Importer des articles" onFermer={onFermer}>
      <div className="formulaire">
        <p className="texte-doux">
          Préparez un tableau (Excel, Google Sheets) avec au moins les colonnes <strong>nom</strong> et <strong>prix_vente</strong>,
          puis enregistrez-le au format CSV. Un article dont la référence existe déjà est mis à jour.
        </p>
        <a className="lien" href={modele} download="modele-articles.csv">Télécharger le modèle</a>
        <label className="bouton secondaire">
          <input
            type="file"
            accept=".csv,text/csv"
            hidden
            onChange={async (e) => {
              const fichier = e.target.files?.[0];
              if (!fichier) return;
              setErreur('');
              setNomFichier(fichier.name);
              try {
                setLignes(lireCsvArticles(await fichier.text()));
              } catch (err) {
                setLignes(null);
                setErreur(err.message);
              }
            }}
          />
          Choisir le fichier CSV
        </label>
        {lignes && (
          <p>
            <strong>{lignes.length}</strong> article(s) lus dans {nomFichier}.
            {avecStock && !peut('stock.ajuster') && ' Vous n’avez pas le droit de saisir du stock : retirez la colonne stock_initial.'}
          </p>
        )}
        {lignes && (
          <div className="tableau-conteneur apercu-import">
            <table className="tableau">
              <thead><tr><th>Nom</th><th className="nombre">Prix</th><th>Catégorie</th><th>Réf.</th><th className="nombre">Stock</th></tr></thead>
              <tbody>
                {lignes.slice(0, 8).map((l, i) => (
                  <tr key={i}><td>{l.nom}</td><td className="nombre">{l.prix_vente}</td><td>{l.categorie}</td><td>{l.reference}</td><td className="nombre">{l.stock_initial}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Erreur message={erreur} />
        <div className="actions">
          <Bouton type="button" onClick={onFermer}>Annuler</Bouton>
          <Bouton
            variante="principal"
            disabled={!lignes?.length}
            chargement={chargement}
            onClick={async () => {
              setChargement(true);
              setErreur('');
              try {
                const resultat = await api.rpc('importer_articles', { p_etablissement_id: etablissement.id, p_lignes: lignes });
                onImporte(`${resultat.crees} article(s) créé(s), ${resultat.mis_a_jour} mis à jour`);
              } catch (err) {
                setErreur(`${err.message}. Rien n’a été importé : corrigez le fichier puis réessayez.`);
                setChargement(false);
              }
            }}
          >
            Importer
          </Bouton>
        </div>
      </div>
    </Modale>
  );
}

export default function Articles() {
  const { api, etablissement, montant, peut, notifier } = useEspace();
  const etab = etablissement.id;
  const [recherche, setRecherche] = useState('');
  const [vue, setVue] = useState('actifs');
  const [edition, setEdition] = useState(null);
  const [importer, setImporter] = useState(false);
  const { donnees, chargement, erreur, recharger } = useDonnees(async () => {
    const [articles, categories, stock] = await Promise.all([
      api.lire('articles', { eq: { etablissement_id: etab }, ordre: ['nom'] }),
      api.lire('categories_articles', { eq: { etablissement_id: etab, actif: true }, ordre: ['nom'] }),
      peut('stock.lire') ? api.lire('stock_articles', { eq: { etablissement_id: etab } }) : [],
    ]);
    return { articles, categories, stock: Object.fromEntries(stock.map((s) => [s.article_id, s.quantite])) };
  }, [etab]);

  const texte = recherche.trim().toLowerCase();
  const categories = Object.fromEntries((donnees?.categories ?? []).map((c) => [c.id, c.nom]));
  const articles = (donnees?.articles ?? []).filter((a) => (vue === 'actifs' ? a.actif : !a.actif)
    && (!texte || a.nom.toLowerCase().includes(texte) || (a.reference ?? '').toLowerCase().includes(texte)));

  return (
    <div className="page">
      <EnTete titre="Articles" sousTitre={`${donnees?.articles.filter((a) => a.actif).length ?? 0} article(s) en vente`}>
        {peut('articles.gerer') && <Bouton onClick={() => setImporter(true)}>Importer</Bouton>}
        {peut('articles.gerer') && <Bouton variante="principal" icone="plus" onClick={() => setEdition({})}>Nouvel article</Bouton>}
      </EnTete>
      {importer && (
        <ImportArticles
          onFermer={() => setImporter(false)}
          onImporte={(message) => {
            setImporter(false);
            notifier(message);
            recharger();
          }}
        />
      )}
      <div className="filtres">
        <Onglets onglets={[['actifs', 'En vente'], ['archives', 'Archivés']]} actif={vue} onChange={setVue} />
        <Recherche valeur={recherche} onChange={setRecherche} placeholder="Nom ou référence" />
      </div>
      {chargement && !donnees && <Chargement />}
      <Erreur message={erreur} />
      {donnees && !articles.length && (
        <Vide titre="Aucun article" texte={vue === 'actifs' ? 'Créez votre premier article pour commencer à vendre.' : 'Aucun article archivé.'} />
      )}
      {articles.length > 0 && (
        <div className="tableau-conteneur">
          <table className={`tableau ${peut('articles.gerer') ? 'cliquable' : ''}`}>
            <thead>
              <tr><th /><th>Article</th><th>Catégorie</th><th className="nombre">Prix</th><th className="nombre">Coût</th><th className="nombre">Stock</th></tr>
            </thead>
            <tbody>
              {articles.map((a) => {
                const quantite = donnees.stock[a.id];
                return (
                  <tr key={a.id} onClick={() => peut('articles.gerer') && setEdition({ article: a })}>
                    <td className="cellule-vignette"><VignetteArticle article={a} taille="petite" /></td>
                    <td><strong>{a.nom}</strong>{a.reference && <small className="texte-doux bloc">{a.reference}</small>}</td>
                    <td>{categories[a.categorie_id] ?? '—'}</td>
                    <td className="nombre">{montant(a.prix_vente)}</td>
                    <td className="nombre">{a.cout_achat != null ? montant(a.cout_achat) : '—'}</td>
                    <td className="nombre">
                      {!a.suivi_stock && <Badge>Service</Badge>}
                      {a.suivi_stock && quantite != null && (
                        <span className={quantite <= a.stock_minimum ? 'texte-alerte' : ''}>{formatQuantite(quantite, a.unite)}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {edition && donnees && (
        <FormulaireArticle
          article={edition.article}
          categories={donnees.categories}
          onFermer={() => setEdition(null)}
          onEnregistre={(message) => {
            setEdition(null);
            notifier(message);
            recharger();
          }}
        />
      )}
    </div>
  );
}
