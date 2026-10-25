import React, { useMemo, useState } from 'react';
import { useDonnees, useEspace } from '../../noyau/espace.jsx';
import { Chargement, Erreur, Icone, lireImageReduite, Recherche } from '../../ui/composants.jsx';
import { ChampEnPlace, EnteteXp, LienAncien, Segments, Tuile } from './communs.jsx';

// Articles en tuiles (nouvelle version The Dream) : photo à glisser-déposer (ou toucher pour prendre une photo),
// prix de vente et prix d'achat modifiables sur place, marge calculée tout de suite.
export default function Articles({ naviguer }) {
  const { api, etablissement, peut, notifier, montant } = useEspace();
  const etab = etablissement.id;
  const modifiable = peut('articles.gerer');
  const [filtre, setFiltre] = useState('tout');
  const [categorie, setCategorie] = useState('');
  const [texte, setTexte] = useState('');
  const [depot, setDepot] = useState(null);
  const [locaux, setLocaux] = useState({});
  const { donnees, chargement, erreur } = useDonnees(async () => {
    const [articles, categories] = await Promise.all([
      api.lire('articles', { eq: { etablissement_id: etab, actif: true }, ordre: ['nom'] }),
      api.lire('categories_articles', { eq: { etablissement_id: etab, actif: true }, ordre: ['nom'] }),
    ]);
    return { articles, categories };
  }, [etab]);
  const articles = useMemo(() => (donnees?.articles ?? []).map((a) => ({ ...a, ...(locaux[a.id] ?? {}) })), [donnees, locaux]);

  const modifier = async (a, changement, message) => {
    const suivant = { ...a, ...changement };
    try {
      await api.rpc('enregistrer_article', { p_etablissement_id: etab, p_article: suivant });
      setLocaux((l) => ({ ...l, [a.id]: { ...(l[a.id] ?? {}), ...changement } }));
      notifier(message);
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

  if (chargement && !donnees) return <Chargement />;
  if (erreur) return <Erreur message={erreur} />;
  const sansPhoto = articles.filter((a) => !a.photo);
  const sansCout = articles.filter((a) => !(Number(a.cout_achat) > 0));
  const t = texte.trim().toLowerCase();
  const visibles = articles.filter((a) => (filtre !== 'photo' || !a.photo) && (filtre !== 'cout' || !(Number(a.cout_achat) > 0))
    && (!categorie || a.categorie_id === categorie) && (!t || a.nom.toLowerCase().includes(t)));
  const margeMoyenne = (() => {
    const avec = articles.filter((a) => Number(a.cout_achat) > 0 && Number(a.prix_vente) > 0);
    if (!avec.length) return null;
    return avec.reduce((s, a) => s + (a.prix_vente - a.cout_achat) / a.prix_vente, 0) / avec.length;
  })();

  return (
    <div className="xp-page">
      <EnteteXp surtitre={etablissement.nom} titre="Articles" sousTitre="Touchez un prix pour le changer. Glissez une photo sur un article (ou touchez le cadre pour en prendre une).">
        <LienAncien page="articles" naviguer={naviguer} texte="Créer, importer, catégories : écran complet" />
      </EnteteXp>
      <div className="xp-grille">
        <Tuile icone="articles" titre="Articles en vente" valeur={articles.length} onClick={() => setFiltre('tout')}
          pourquoi={`${donnees.categories.length} catégories`} />
        <Tuile icone="photo" titre="Sans photo" valeur={sansPhoto.length} onClick={() => setFiltre(filtre === 'photo' ? 'tout' : 'photo')}
          verdict={{ ton: sansPhoto.length ? 'vigilance' : 'bon', texte: sansPhoto.length ? 'à compléter' : 'complet' }}
          pourquoi="Une photo aide la caissière à trouver vite le bon article." conseil={sansPhoto.length ? 'Voir ceux sans photo' : undefined} />
        <Tuile icone="billet" titre="Sans prix d’achat" valeur={sansCout.length} onClick={() => setFiltre(filtre === 'cout' ? 'tout' : 'cout')}
          verdict={{ ton: sansCout.length ? 'vigilance' : 'bon', texte: sansCout.length ? 'marge inconnue' : 'complet' }}
          pourquoi="Sans prix d’achat, le logiciel ne sait pas ce que l’article vous rapporte." conseil={sansCout.length ? 'Les compléter' : undefined} />
        <Tuile icone="graphique" titre="Marge moyenne" valeur={margeMoyenne == null ? '—' : `${Math.round(margeMoyenne * 100)} %`}
          verdict={margeMoyenne == null ? undefined : { ton: margeMoyenne >= 0.5 ? 'bon' : margeMoyenne >= 0.3 ? 'vigilance' : 'mauvais', texte: margeMoyenne >= 0.5 ? 'bonne' : margeMoyenne >= 0.3 ? 'moyenne' : 'faible' }}
          pourquoi="Sur les articles qui ont un prix d’achat." />
      </div>
      <div className="xp-entete" style={{ alignItems: 'center' }}>
        <Segments libelle="Catégorie" valeur={categorie} onChange={setCategorie} options={[['', 'Toutes'], ...donnees.categories.map((c) => [c.id, c.nom])]} />
        <div style={{ minWidth: 220, flex: '0 1 320px' }}><Recherche valeur={texte} onChange={setTexte} placeholder="Chercher un article" /></div>
      </div>
      <div className="xp-produits">
        {visibles.map((a) => {
          const marge = Number(a.cout_achat) > 0 && Number(a.prix_vente) > 0 ? (a.prix_vente - a.cout_achat) / a.prix_vente : null;
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
                <strong>{a.nom}</strong>
                <span className="xp-produit-prix">
                  <span>Vente</span>
                  <span className="prix"><ChampEnPlace type="number" min={0} valeur={Number(a.prix_vente)} format={(v) => montant(v)} libelle={`prix de ${a.nom}`} desactive={!modifiable}
                    onEnregistrer={(v) => (v > 0 ? modifier(a, { prix_vente: v }, `${a.nom} : ${montant(v)}`) : Promise.resolve())} /></span>
                </span>
                <span className="xp-produit-prix">
                  <span>Achat</span>
                  <ChampEnPlace type="number" min={0} valeur={a.cout_achat == null ? null : Number(a.cout_achat)} format={(v) => montant(v)} libelle={`prix d'achat de ${a.nom}`} desactive={!modifiable}
                    onEnregistrer={(v) => modifier(a, { cout_achat: v == null || v === '' ? null : v }, `Prix d’achat de ${a.nom} enregistré`)} />
                </span>
                {marge != null && (
                  <span className={`xp-marge xp-verdict ${marge >= 0.5 ? 'bon' : marge >= 0.3 ? 'vigilance' : 'mauvais'}`}>
                    rapporte {montant(a.prix_vente - a.cout_achat)} ({Math.round(marge * 100)} %)
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {!visibles.length && <p className="texte-doux">Aucun article ne correspond.</p>}
    </div>
  );
}
