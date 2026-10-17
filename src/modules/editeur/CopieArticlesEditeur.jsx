// Super admin : copier des articles d'un client vers un autre, ou depuis la bibliothèque Agence Elite
// (migration 20261017000134, SOP 89). Photos et catégories suivent ; jamais le coût d'achat, le stock ni les ventes.
import React, { useMemo, useState } from 'react';
import { useDonnees, useEspace } from '../../noyau/espace.jsx';
import { formatDateHeure } from '../../noyau/format.js';
import { Badge, Bouton, Champ, Chargement, EmptyState, Erreur, PageHeader, Section } from '../../ui/composants.jsx';

const BIBLIOTHEQUE = 'bibliotheque';

function Vignette({ article }) {
  return article.photo
    ? <img className="copie-vignette" src={article.photo} alt="" loading="lazy" />
    : <span className="copie-vignette copie-vignette-vide" aria-hidden="true">{article.nom.slice(0, 2).toUpperCase()}</span>;
}

// Saisie des prix après une copie « prix à saisir » : les articles deviennent vendables une fois leur prix mis.
function SaisiePrix({ copieId, onFait }) {
  const { api, notifier, montant } = useEspace();
  const { donnees: articles, chargement, erreur } = useDonnees(() => api.rpc('articles_de_copie', { p_copie: copieId }), [copieId]);
  const [prix, setPrix] = useState({});
  const [enCours, setEnCours] = useState(false);
  const [erreurSaisie, setErreurSaisie] = useState('');
  if (chargement && !articles) return <Chargement />;
  const aChiffrer = (articles ?? []).filter((a) => !a.actif);
  const enregistrer = async () => {
    setEnCours(true);
    setErreurSaisie('');
    try {
      const valeurs = Object.fromEntries(Object.entries(prix).filter(([, v]) => v !== '').map(([k, v]) => [k, Number(v)]));
      const n = await api.rpc('fixer_prix_copie', { p_copie: copieId, p_prix: valeurs });
      notifier(`${n} prix enregistré(s) : ces articles sont maintenant en vente`);
      onFait();
    } catch (err) {
      setErreurSaisie(err.message);
    } finally {
      setEnCours(false);
    }
  };
  return (
    <Section titre="Mettre les prix" sousTitre="Un article sans prix reste caché en caisse. Vous pouvez aussi les mettre plus tard dans Articles.">
      <Erreur message={erreur || erreurSaisie} />
      {!aChiffrer.length ? <p className="texte-doux">Tous les prix sont mis.</p> : (
        <div className="copie-prix">
          {aChiffrer.map((a) => (
            <label key={a.id} className="copie-prix-ligne">
              <Vignette article={a} />
              <span>{a.nom}{a.variante ? ` · ${a.variante}` : ''}</span>
              <input type="number" min="0" step="any" inputMode="decimal" aria-label={`Prix de ${a.nom}`}
                value={prix[a.id] ?? ''} onChange={(e) => setPrix((p) => ({ ...p, [a.id]: e.target.value }))} placeholder={montant(0)} />
            </label>
          ))}
          <Bouton variante="principal" chargement={enCours} disabled={!Object.values(prix).some((v) => v !== '')} onClick={enregistrer}>
            Enregistrer les prix
          </Bouton>
        </div>
      )}
    </Section>
  );
}

export default function CopieArticlesEditeur() {
  const { api, notifier, montant, roleEditeur } = useEspace();
  const { donnees: vue, chargement, erreur } = useDonnees(() => api.rpc('editeur_vue'), []);
  const [source, setSource] = useState('');
  const [cible, setCible] = useState('');
  const [coches, setCoches] = useState(new Set());
  const [recherche, setRecherche] = useState('');
  const [categorie, setCategorie] = useState('');
  const [modePrix, setModePrix] = useState('identique');
  const [pourcentage, setPourcentage] = useState('10');
  const [apercu, setApercu] = useState(null);
  const [fait, setFait] = useState(null);
  const [enCours, setEnCours] = useState(false);
  const [erreurAction, setErreurAction] = useState('');
  const [rafraichir, setRafraichir] = useState(0);

  const etablissements = useMemo(() => (vue?.clients ?? [])
    .filter((c) => c.statut !== 'archive')
    .flatMap((c) => (c.etablissements ?? []).map((e) => ({ id: e.id, nom: e.nom, client: c.nom }))), [vue]);
  const idSource = source === BIBLIOTHEQUE ? null : source || undefined;
  const { donnees: articles, chargement: chargementArticles, erreur: erreurArticles } = useDonnees(
    () => (source ? api.rpc('articles_a_copier', { p_source: idSource }) : Promise.resolve([])),
    [source, rafraichir],
  );
  const { donnees: historique } = useDonnees(() => api.lire('copies_articles', { ordre: ['fait_le'] }), [rafraichir]);

  if (roleEditeur !== 'super_admin') return <EmptyState titre="Réservé au super administrateur" />;
  if (chargement && !vue) return <Chargement />;

  const categories = [...new Set((articles ?? []).map((a) => a.categorie ?? 'Sans catégorie'))];
  const visibles = (articles ?? [])
    .filter((a) => !categorie || (a.categorie ?? 'Sans catégorie') === categorie)
    .filter((a) => !recherche || `${a.nom} ${a.variante ?? ''}`.toLowerCase().includes(recherche.toLowerCase()));
  const toutCoche = visibles.length > 0 && visibles.every((a) => coches.has(a.id));
  const basculer = (id) => setCoches((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const basculerTout = () => setCoches((s) => {
    const n = new Set(s);
    visibles.forEach((a) => (toutCoche ? n.delete(a.id) : n.add(a.id)));
    return n;
  });
  const nomEtab = (id) => (id ? etablissements.find((e) => e.id === id)?.nom ?? 'Établissement' : 'Bibliothèque Agence Elite');
  const mode = source === BIBLIOTHEQUE ? 'a_saisir' : modePrix;
  const parametres = (simulation) => ({
    p_source: idSource, p_cible: cible, p_ids: [...coches], p_mode_prix: mode, p_pourcentage: Number(pourcentage || 0), p_simulation: simulation,
  });
  const agir = async (fn) => {
    setEnCours(true);
    setErreurAction('');
    try { await fn(); } catch (err) { setErreurAction(err.message); } finally { setEnCours(false); }
  };
  const voirApercu = () => agir(async () => setApercu(await api.rpc('copier_articles', parametres(true))));
  const copier = () => agir(async () => {
    const r = await api.rpc('copier_articles', parametres(false));
    notifier(`${r.articles_crees} article(s) copié(s) vers ${r.cible}`);
    setFait(r);
    setApercu(null);
    setCoches(new Set());
    setRafraichir((x) => x + 1);
  });
  const ranger = () => agir(async () => {
    const n = await api.rpc('ajouter_a_bibliotheque', { p_articles: [...coches] });
    notifier(`${n} article(s) ajouté(s) à la bibliothèque`);
  });
  const annuler = (id) => agir(async () => {
    const n = await api.rpc('annuler_copie_articles', { p_copie: id });
    notifier(`Copie annulée : ${n} article(s) désactivé(s)`);
    setRafraichir((x) => x + 1);
  });

  return (
    <div className="page">
      <PageHeader titre="Copier des articles" sousTitre="D’un client à un autre, ou depuis votre bibliothèque. Photos et catégories suivent ; jamais le coût d’achat, le stock ni les ventes." />
      <Erreur message={erreur || erreurAction} />
      {fait?.copie_id && fait.mode_prix === 'a_saisir' && <SaisiePrix copieId={fait.copie_id} onFait={() => setFait(null)} />}
      <Section titre="1. D’où ?">
        <Champ libelle="Copier depuis">
          <select value={source} onChange={(e) => { setSource(e.target.value); setCoches(new Set()); setApercu(null); setCategorie(''); }}>
            <option value="">Choisir…</option>
            <option value={BIBLIOTHEQUE}>Bibliothèque Agence Elite</option>
            {etablissements.map((e) => <option key={e.id} value={e.id}>{e.client} · {e.nom}</option>)}
          </select>
        </Champ>
      </Section>
      {source && (
        <Section titre="2. Quels articles ?" sousTitre={`${coches.size} coché(s)`}>
          <Erreur message={erreurArticles} />
          <div className="copie-filtres">
            <input type="search" placeholder="Rechercher un article" aria-label="Rechercher un article" value={recherche} onChange={(e) => setRecherche(e.target.value)} />
            <select aria-label="Catégorie" value={categorie} onChange={(e) => setCategorie(e.target.value)}>
              <option value="">Toutes les catégories</option>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <Bouton onClick={basculerTout} disabled={!visibles.length}>{toutCoche ? 'Tout décocher' : `Tout cocher (${visibles.length})`}</Bouton>
            {source !== BIBLIOTHEQUE && (
              <Bouton icone="plus" onClick={ranger} disabled={!coches.size || enCours}>Ranger dans la bibliothèque</Bouton>
            )}
          </div>
          {chargementArticles && !articles ? <Chargement /> : !visibles.length ? <p className="texte-doux">Aucun article.</p> : (
            <div className="copie-grille">
              {visibles.map((a) => (
                <label key={a.id} className={`copie-carte ${coches.has(a.id) ? 'cochee' : ''}`}>
                  <input type="checkbox" checked={coches.has(a.id)} onChange={() => basculer(a.id)} aria-label={`${a.nom}${a.variante ? ` ${a.variante}` : ''}`} />
                  <Vignette article={a} />
                  <span className="copie-nom">{a.nom}{a.variante ? <small className="bloc texte-doux">{a.variante}</small> : null}</span>
                  <small className="texte-doux">{a.categorie ?? 'Sans catégorie'}{a.prix_vente != null ? ` · ${montant(a.prix_vente)}` : ''}</small>
                </label>
              ))}
            </div>
          )}
        </Section>
      )}
      {source && coches.size > 0 && (
        <Section titre="3. Vers où, et à quel prix ?">
          <Champ libelle="Copier vers">
            <select value={cible} onChange={(e) => { setCible(e.target.value); setApercu(null); }}>
              <option value="">Choisir…</option>
              {etablissements.filter((e) => e.id !== source).map((e) => <option key={e.id} value={e.id}>{e.client} · {e.nom}</option>)}
            </select>
          </Champ>
          {source === BIBLIOTHEQUE ? <p className="texte-doux">Depuis la bibliothèque, les prix sont toujours à saisir.</p> : (
            <fieldset className="copie-prix-choix">
              <legend>Prix</legend>
              <label className="case"><input type="radio" checked={modePrix === 'identique'} onChange={() => setModePrix('identique')} /> Les mêmes prix</label>
              <label className="case">
                <input type="radio" checked={modePrix === 'pourcentage'} onChange={() => setModePrix('pourcentage')} /> Changer tous les prix de
                <input type="number" className="copie-pourcentage" value={pourcentage} onChange={(e) => setPourcentage(e.target.value)} aria-label="Pourcentage" disabled={modePrix !== 'pourcentage'} /> %
              </label>
              <label className="case"><input type="radio" checked={modePrix === 'a_saisir'} onChange={() => setModePrix('a_saisir')} /> Je mets les prix après (articles cachés en caisse d’ici là)</label>
            </fieldset>
          )}
          <div className="actions-gauche">
            <Bouton chargement={enCours} disabled={!cible} onClick={voirApercu}>Voir l’aperçu</Bouton>
            {apercu && <Bouton variante="principal" chargement={enCours} disabled={!apercu.articles_crees} onClick={copier}>Copier {apercu.articles_crees} article(s)</Bouton>}
          </div>
          {apercu && (
            <div className="bandeau info" role="status">
              <strong>Aperçu, rien n’est encore copié :</strong> {apercu.articles_crees} nouveau(x), {apercu.articles_deja_presents} déjà
              présent(s) chez {apercu.cible} (ignorés), {apercu.categories_creees} catégorie(s) créée(s).
            </div>
          )}
        </Section>
      )}
      {historique?.length > 0 && (
        <Section titre="Copies faites" sousTitre="Annuler désactive les articles copiés ; rien n’est effacé.">
          <div className="liste-simple">
            {[...historique].reverse().slice(0, 20).map((c) => (
              <div key={c.id} className="liste-ligne">
                <span>{formatDateHeure(c.fait_le)}</span>
                <span>{nomEtab(c.source_etablissement_id)} → {nomEtab(c.cible_etablissement_id)}</span>
                <span>{c.articles_crees.length} article(s)</span>
                {c.annulee_le ? <Badge>annulée</Badge> : <button className="lien danger" onClick={() => annuler(c.id)} disabled={enCours}>Annuler</button>}
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}
