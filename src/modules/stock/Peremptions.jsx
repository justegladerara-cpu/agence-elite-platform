import React, { useState } from 'react';
import { useDonnees, useEspace } from '../../noyau/espace.jsx';
import { dateLocale, formatDate, formatQuantite } from '../../noyau/format.js';
import { Badge, Bouton, Champ, EmptyState, Erreur, Section, Squelette } from '../../ui/composants.jsx';
import { etatPeremption, valeurPerte } from './pertes.js';
import './stock.css';

const PERIODES = [[7, '7 prochains jours'], [30, '30 prochains jours'], [365, 'Toute l’année']];

// « Dates de péremption » : noter ce qui va périmer, voir ce qui périme bientôt (et ce qui est déjà périmé), régler.
export default function Peremptions({ articles, hubsStock, hubInitial, ajuster, onStockChange }) {
  const { api, etablissement, notifier, montant } = useEspace();
  const [jours, setJours] = useState(7);
  const [v, setV] = useState({ article_id: '', quantite: '', date: '', hub_id: hubInitial ?? hubsStock[0]?.id ?? '' });
  const [erreur, setErreur] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [enCours, setEnCours] = useState(null);
  const { donnees, chargement, erreur: erreurListe, recharger } = useDonnees(
    () => api.rpc('peremptions_proches', { p_etablissement_id: etablissement.id, p_jours: jours }),
    [etablissement.id, jours]
  );
  const liste = (donnees ?? []).filter((p) => !hubInitial || p.hub_id === hubInitial);

  const noter = async (e) => {
    e.preventDefault();
    setEnvoi(true);
    setErreur('');
    try {
      const q = Number(String(v.quantite).replace(',', '.'));
      if (!(q > 0)) throw new Error('Indiquez une quantité supérieure à 0');
      await api.rpc('noter_peremption', {
        p_etablissement_id: etablissement.id, p_hub_id: v.hub_id || null, p_article_id: v.article_id, p_quantite: q, p_date: v.date, p_note: null,
      });
      notifier('Date de péremption notée');
      setV((x) => ({ ...x, article_id: '', quantite: '', date: '' }));
      recharger();
    } catch (err) {
      setErreur(err.message);
    } finally {
      setEnvoi(false);
    }
  };

  const regler = async (p, retirer) => {
    setEnCours(p.id);
    setErreur('');
    try {
      const r = await api.rpc('traiter_peremption', { p_id: p.id, p_retirer_du_stock: retirer });
      const retire = Number(r?.retire ?? 0);
      const perte = valeurPerte(retire, p.cout_achat);
      notifier(retirer
        ? (retire > 0 ? `${p.article} : ${formatQuantite(retire, p.unite)} retiré(s) du stock (périmé)${perte != null ? ` · perte ${montant(perte)}` : ''}` : `${p.article} : plus rien en stock, c’est réglé`)
        : `${p.article} : c’est réglé`);
      recharger();
      if (retirer) onStockChange?.();
    } catch (err) {
      setErreur(err.message);
    } finally {
      setEnCours(null);
    }
  };

  return (
    <div className="peremptions">
      {ajuster && (
        <Section titre="Noter une date de péremption">
          <form className="formulaire" onSubmit={noter}>
            <div className="grille-champs">
              <Champ libelle="Article">
                <select value={v.article_id} onChange={(e) => setV({ ...v, article_id: e.target.value })} required>
                  <option value="">— Choisir un article</option>
                  {articles.map((a) => <option key={a.id} value={a.id}>{a.nom}{a.reference ? ` · ${a.reference}` : ''}</option>)}
                </select>
              </Champ>
              <Champ libelle="Quantité">
                <input inputMode="decimal" value={v.quantite} onChange={(e) => setV({ ...v, quantite: e.target.value })} required />
              </Champ>
              <Champ libelle="Périme le">
                <input type="date" value={v.date} min={dateLocale(-365)} onChange={(e) => setV({ ...v, date: e.target.value })} required />
              </Champ>
              {hubsStock.length > 1 && !hubInitial && (
                <Champ libelle="Où">
                  <select value={v.hub_id} onChange={(e) => setV({ ...v, hub_id: e.target.value })}>
                    {hubsStock.map((h) => <option key={h.id} value={h.id}>{h.nom}</option>)}
                  </select>
                </Champ>
              )}
            </div>
            <div className="actions">
              <Bouton type="submit" variante="principal" icone="plus" chargement={envoi}>Noter</Bouton>
            </div>
          </form>
        </Section>
      )}
      <Erreur message={erreur || erreurListe} />
      <div className="puces puces-retour" role="group" aria-label="Période">
        {PERIODES.map(([n, l]) => <button key={n} type="button" className={jours === n ? 'actif' : ''} onClick={() => setJours(n)}>{l}</button>)}
      </div>
      {chargement && !donnees && <Squelette />}
      {donnees && !liste.length && (
        <EmptyState icone="coche" titre="Rien ne périme bientôt" texte="Notez la date de péremption des produits frais à la réception : ils apparaissent ici quelques jours avant." />
      )}
      {liste.length > 0 && (
        <div className="liste-simple">
          {liste.map((p) => {
            const etat = etatPeremption(p.jours);
            return (
              <div key={p.id} className="liste-ligne ligne-peremption">
                <span>
                  <strong>{p.article}</strong> · {formatQuantite(p.quantite, p.unite)} <Badge ton={etat.ton}>{etat.libelle}</Badge>
                  <small className="texte-doux bloc">Périme le {formatDate(p.date_peremption)}{hubsStock.length > 1 ? ` · ${p.hub}` : ''}{p.note ? ` · ${p.note}` : ''}</small>
                </span>
                {ajuster && (
                  <span className="actions-ligne">
                    <Bouton chargement={enCours === p.id} onClick={() => regler(p, true)}>Retirer du stock (périmé)</Bouton>
                    <Bouton disabled={enCours === p.id} onClick={() => regler(p, false)}>C’est réglé</Bouton>
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
