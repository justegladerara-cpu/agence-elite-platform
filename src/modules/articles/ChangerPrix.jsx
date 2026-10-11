import React, { useState } from 'react';
import { useEspace } from '../../noyau/espace.jsx';
import { Bouton, Champ, Erreur, Modale } from '../../ui/composants.jsx';
import { articleAvecPrix, calculerPrix, lireNombre } from './saisieRapide.js';
import './articles.css';

// « Changer les prix » : plusieurs articles d'un coup (cochés, ou une catégorie), en % ou en FCFA, avec arrondi.
// modifier_articles_lot n'accepte pas le prix : chaque article est réenregistré par enregistrer_article (même droit
// articles.gerer), en recopiant tous ses champs à l'identique sauf le prix. Un article à la fois : en cas d'échec,
// ceux déjà faits restent faits et la liste de ceux qui restent est affichée.
export default function ChangerPrix({ articles, categories, selection, onFermer, onTermine }) {
  const { api, etablissement, montant } = useEspace();
  const [portee, setPortee] = useState(selection.length ? '__selection' : '');
  const [sens, setSens] = useState('augmenter');
  const [mode, setMode] = useState('pourcent');
  const [valeur, setValeur] = useState('');
  const [pas, setPas] = useState('5');
  const [erreur, setErreur] = useState('');
  const [chargement, setChargement] = useState(false);
  const [faits, setFaits] = useState(new Set());

  const enVente = articles.filter((a) => a.actif);
  const concernes = portee === '__selection' ? articles.filter((a) => selection.includes(a.id))
    : portee === '__tous' ? enVente
      : portee === '__sans' ? enVente.filter((a) => !a.categorie_id)
        : portee ? enVente.filter((a) => a.categorie_id === portee) : [];
  const v = lireNombre(valeur);
  const valide = v !== null && !Number.isNaN(v) && v > 0;
  const apercu = valide ? concernes.map((a) => ({ article: a, ancien: Number(a.prix_vente), nouveau: calculerPrix(a.prix_vente, { sens, mode, valeur: v, pas: Number(pas) }) })) : [];
  const aChanger = apercu.filter((x) => x.nouveau !== null && x.nouveau !== x.ancien && !faits.has(x.article.id));
  const impossibles = apercu.filter((x) => x.nouveau === null);

  const appliquer = async () => {
    setChargement(true);
    setErreur('');
    const reussis = new Set(faits);
    try {
      for (const x of aChanger) {
        await api.rpc('enregistrer_article', { p_etablissement_id: etablissement.id, p_article: articleAvecPrix(x.article, x.nouveau) });
        reussis.add(x.article.id);
      }
      onTermine(`${reussis.size} prix changé${reussis.size > 1 ? 's' : ''}`);
    } catch (err) {
      setFaits(reussis);
      setErreur(`${err.message}. ${reussis.size - faits.size} prix déjà changé(s) ; ${aChanger.length - (reussis.size - faits.size)} restant(s) : réessayez.`);
      setChargement(false);
    }
  };

  return (
    <Modale titre="Changer les prix" onFermer={onFermer} large>
      <div className="formulaire changer-prix">
        <div className="grille-champs">
          <Champ libelle="Quels articles ?">
            <select value={portee} onChange={(e) => setPortee(e.target.value)}>
              <option value="">Choisir…</option>
              {selection.length > 0 && <option value="__selection">Les {selection.length} article(s) cochés</option>}
              {categories.map((c) => <option key={c.id} value={c.id}>Catégorie : {c.nom}</option>)}
              <option value="__sans">Articles sans catégorie</option>
              <option value="__tous">Tous les articles en vente</option>
            </select>
          </Champ>
          <Champ libelle="Changement">
            <select value={`${sens}-${mode}`} onChange={(e) => { const [s, m] = e.target.value.split('-'); setSens(s); setMode(m); }}>
              <option value="augmenter-pourcent">Augmenter de … %</option>
              <option value="baisser-pourcent">Baisser de … %</option>
              <option value="augmenter-montant">Augmenter de … FCFA</option>
              <option value="baisser-montant">Baisser de … FCFA</option>
            </select>
          </Champ>
          <Champ libelle={mode === 'pourcent' ? 'Combien (%)' : 'Combien (FCFA)'}>
            <input inputMode="decimal" value={valeur} onChange={(e) => setValeur(e.target.value)} placeholder={mode === 'pourcent' ? 'ex. : 10' : 'ex. : 100'} />
          </Champ>
          <Champ libelle="Arrondir à">
            <select value={pas} onChange={(e) => setPas(e.target.value)}>
              <option value="5">5 FCFA près</option>
              <option value="25">25 FCFA près</option>
              <option value="1">Sans arrondi</option>
            </select>
          </Champ>
        </div>
        {portee && !concernes.length && <p className="texte-doux">Aucun article en vente ici.</p>}
        {apercu.length > 0 && (
          <div className="tableau-conteneur apercu-prix">
            <table className="tableau">
              <thead><tr><th>Article</th><th className="nombre">Prix actuel</th><th className="nombre">Nouveau prix</th></tr></thead>
              <tbody>
                {apercu.map((x) => (
                  <tr key={x.article.id} className={faits.has(x.article.id) ? 'fait' : ''}>
                    <td>{x.article.nom}{x.article.variante && <span className="texte-doux"> — {x.article.variante}</span>}</td>
                    <td className="nombre">{montant(x.ancien)}</td>
                    <td className="nombre">
                      {x.nouveau === null ? <span className="texte-alerte">Impossible (prix négatif)</span>
                        : <strong>{montant(x.nouveau)}</strong>}
                      {faits.has(x.article.id) && <small className="texte-doux"> · fait</small>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {apercu.length > 0 && (
          <p aria-live="polite">
            <strong>{aChanger.length} prix à changer</strong>
            {impossibles.length > 0 && ` · ${impossibles.length} laissé(s) tel(s) quel(s) (le prix deviendrait négatif)`}
          </p>
        )}
        <Erreur message={erreur} />
        <div className="actions">
          <Bouton type="button" onClick={onFermer}>Annuler</Bouton>
          <Bouton type="button" variante="principal" chargement={chargement} disabled={!aChanger.length} onClick={appliquer}>
            Appliquer les nouveaux prix
          </Bouton>
        </div>
      </div>
    </Modale>
  );
}
