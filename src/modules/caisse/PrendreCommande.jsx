// « Prendre une commande » : l'écran du serveur sur sa tablette (demande de Juste, 2026-10-23). Le serveur a son compte,
// sans caisse à lui. Il touche les articles, écrit la table, et envoie : la commande arrive dans « Factures en cours » de
// la caisse ouverte, avec son prénom (fonction envoyer_commande_caisse, migration 20261023200158). La caissière encaisse.
import React, { useEffect, useMemo, useState } from 'react';
import { useDonnees, useEspace } from '../../noyau/espace.jsx';
import { formatDateHeure, formatQuantite } from '../../noyau/format.js';
import { Badge, Bouton, Champ, Erreur, PageHeader, Recherche, Squelette, Vide } from '../../ui/composants.jsx';
import { estArticleTechnique } from '../restaurant/vip.js';
import { VignetteArticle } from './Caisse.jsx';
import { ajouterArticle, changerQuantite, lignesAEnvoyer, totalCommande } from './prendreCommande.js';
import './caisse.css';

const RAFRAICHIR_MS = 15000;
const STATUTS = { en_attente: ['À la caisse', 'orange'], reprise: ['Prise par la caisse', 'vert'], abandonnee: ['Annulée', 'neutre'] };

export default function PrendreCommande() {
  const { api, etablissement, montant, notifier } = useEspace();
  const etab = etablissement.id;
  const [version, setVersion] = useState(0);
  const { donnees, chargement, erreur } = useDonnees(async () => {
    const [articles, categories] = await Promise.all([
      api.lire('articles', { eq: { etablissement_id: etab, actif: true }, ordre: ['nom'] }),
      api.lire('categories_articles', { eq: { etablissement_id: etab, actif: true }, ordre: ['nom'] }).catch(() => []),
    ]);
    return {
      articles: articles.filter((a) => !estArticleTechnique(a) && Number(a.prix_vente) > 0 && a.disponible !== false),
      categories: [...categories].sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0) || a.nom.localeCompare(b.nom, 'fr')),
    };
  }, [etab]);
  // Caisses ouvertes et mes commandes : relues toutes les 15 secondes.
  const { donnees: suivi } = useDonnees(async () => {
    const [caisses, envoyees] = await Promise.all([
      api.rpc('caisses_pour_commande', { p_etablissement_id: etab }),
      api.rpc('mes_commandes_envoyees', { p_etablissement_id: etab }).catch(() => []),
    ]);
    return { caisses: caisses ?? [], envoyees: envoyees ?? [] };
  }, [etab, version]);
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState !== 'hidden') setVersion((v) => v + 1); }, RAFRAICHIR_MS);
    return () => clearInterval(t);
  }, []);

  const [lignes, setLignes] = useState([]);
  const [table, setTable] = useState('');
  const [recherche, setRecherche] = useState('');
  const [categorie, setCategorie] = useState('');
  const [caisseChoisie, setCaisseChoisie] = useState(null);
  const [envoi, setEnvoi] = useState(false);
  const [erreurEnvoi, setErreurEnvoi] = useState('');

  const parId = useMemo(() => Object.fromEntries((donnees?.articles ?? []).map((a) => [a.id, a])), [donnees]);
  if (chargement && !donnees) return <Squelette />;
  if (erreur) return <Erreur message={erreur} />;

  const caisses = suivi?.caisses ?? [];
  const caisse = caisses.length === 1 ? caisses[0] : caisses.find((c) => c.session_id === caisseChoisie) ?? null;
  const mot = recherche.trim().toLowerCase();
  const visibles = donnees.articles.filter((a) => (!categorie || a.categorie_id === categorie) && (!mot || a.nom.toLowerCase().includes(mot)));
  const total = totalCommande(lignes, parId);

  const envoyer = async () => {
    setEnvoi(true);
    setErreurEnvoi('');
    try {
      const r = await api.rpc('envoyer_commande_caisse', {
        p_etablissement_id: etab, p_lignes: lignesAEnvoyer(lignes), p_libelle: table.trim() || null, p_session_id: caisse?.session_id ?? null,
      });
      notifier(`Commande envoyée à la caisse de ${r.caissier} : ${r.libelle}`);
      setLignes([]);
      setTable('');
      setVersion((v) => v + 1);
    } catch (err) {
      setErreurEnvoi(err.message);
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <div className="prendre-commande">
      <PageHeader
        titre="Prendre une commande"
        sousTitre={caisse ? `La commande part à la caisse de ${caisse.caissier}.` : 'Touchez les articles, écrivez la table, puis envoyez à la caisse.'}
      />
      {suivi && caisses.length === 0 && (
        <p className="encart rouge" role="status">Aucune caisse n’est ouverte. Demandez à la caissière d’ouvrir la caisse, puis envoyez.</p>
      )}
      {caisses.length > 1 && (
        <div className="puces" role="group" aria-label="Caisse">
          {caisses.map((c) => (
            <button type="button" key={c.session_id} className={caisse?.session_id === c.session_id ? 'actif' : ''} aria-pressed={caisse?.session_id === c.session_id} onClick={() => setCaisseChoisie(c.session_id)}>
              Caisse de {c.caissier}{c.point_de_vente ? ` (${c.point_de_vente})` : ''}
            </button>
          ))}
        </div>
      )}
      <div className="prendre-commande-grille">
        <section aria-label="Articles">
          <Recherche valeur={recherche} onChange={setRecherche} placeholder="Chercher un article" />
          {donnees.categories.length > 0 && (
            <div className="puces caisse-categories" role="group" aria-label="Catégories">
              <button type="button" className={!categorie ? 'actif' : ''} aria-pressed={!categorie} onClick={() => setCategorie('')}>Tout</button>
              {donnees.categories.map((c) => (
                <button type="button" key={c.id} className={categorie === c.id ? 'actif' : ''} aria-pressed={categorie === c.id} onClick={() => setCategorie(c.id)}>{c.nom}</button>
              ))}
            </div>
          )}
          {donnees.articles.length === 0 && <Vide titre="Aucun article" texte="Le patron doit d’abord créer les articles." />}
          <div className="grille-articles">
            {visibles.map((a) => {
              const n = lignes.find((l) => l.article_id === a.id)?.quantite ?? 0;
              return (
                <button key={a.id} type="button" className="tuile-article" onClick={() => setLignes((ls) => ajouterArticle(ls, a.id))}>
                  <VignetteArticle article={a} />
                  <span className="tuile-nom">{a.nom}</span>
                  <strong className="tuile-prix">{montant(a.prix_vente)}</strong>
                  {n > 0 && <span className="tuile-compte">{formatQuantite(n)}</span>}
                </button>
              );
            })}
          </div>
        </section>
        <aside className="carte commande-serveur" aria-label="Ma commande">
          <h2>Ma commande</h2>
          <Champ libelle="Table ou nom du client">
            <input value={table} onChange={(e) => setTable(e.target.value)} maxLength={40} placeholder="Ex. : Table 5" />
          </Champ>
          {lignes.length === 0 ? <p className="texte-doux">Touchez un article pour l’ajouter.</p> : (
            <ul className="commande-serveur-lignes">
              {lignes.map((l) => (
                <li key={l.article_id}>
                  <span>{parId[l.article_id]?.nom ?? 'Article'}</span>
                  <span className="commande-serveur-quantite">
                    <button type="button" aria-label={`Un de moins : ${parId[l.article_id]?.nom}`} onClick={() => setLignes((ls) => changerQuantite(ls, l.article_id, -1))}>−</button>
                    <strong>{formatQuantite(l.quantite)}</strong>
                    <button type="button" aria-label={`Un de plus : ${parId[l.article_id]?.nom}`} onClick={() => setLignes((ls) => changerQuantite(ls, l.article_id, 1))}>+</button>
                  </span>
                  <span>{montant(Number(parId[l.article_id]?.prix_vente ?? 0) * l.quantite)}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="commande-serveur-total"><span>Total</span><strong>{montant(total)}</strong></p>
          {erreurEnvoi && <Erreur message={erreurEnvoi} />}
          <Bouton variante="principal" icone="caisse" onClick={envoyer} chargement={envoi} disabled={!lignes.length || !caisse}>
            Envoyer à la caisse
          </Bouton>
          {lignes.length > 0 && <Bouton variante="discret" onClick={() => setLignes([])}>Tout enlever</Bouton>}
        </aside>
      </div>
      <section className="carte" aria-label="Mes commandes envoyées">
        <h2>Mes commandes envoyées (24 h)</h2>
        {!(suivi?.envoyees ?? []).length ? <p className="texte-doux">Aucune commande envoyée pour le moment.</p> : (
          <ul className="liste-simple">
            {suivi.envoyees.map((c) => {
              const [texte, ton] = STATUTS[c.statut] ?? [c.statut, 'neutre'];
              return (
                <li key={c.id}>
                  <strong>{c.libelle}</strong> <Badge ton={ton}>{texte}</Badge>
                  <span className="texte-doux bloc">
                    {(c.articles ?? []).map((a) => `${formatQuantite(a.quantite)} ${a.nom}`).join(', ')} · {montant(c.total)} · {formatDateHeure(c.cree_le)} · caisse de {c.caissier}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
