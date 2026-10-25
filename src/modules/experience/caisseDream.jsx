import React, { useState } from 'react';
import { useEspace } from '../../noyau/espace.jsx';
import { Bouton, Erreur, Modale } from '../../ui/composants.jsx';

// Modèle de soirée choisi dans « Ma caisse » : l'ordre des tuiles change, rien d'autre.
const RANG_HAPPY = /bi[eè]re|cocktail|happy/i;
export function ordonnerPourModele(articles, modele, categories = []) {
  if (modele === 'grosse') return [...articles].sort((a, b) => Number(b.prix_vente) - Number(a.prix_vente));
  if (modele === 'happy') {
    const prioritaires = new Set(categories.filter((c) => RANG_HAPPY.test(c.nom)).map((c) => c.id));
    return [...articles].sort((a, b) => Number(prioritaires.has(b.categorie_id)) - Number(prioritaires.has(a.categorie_id)));
  }
  return articles;
}

// Juste après la vente : le gérant tape le prix d'achat des articles qui n'en ont pas (pour calculer la marge).
export function ModalePrixAchat({ articles, onFermer }) {
  const { api, etablissement, montant, notifier } = useEspace();
  const [valeurs, setValeurs] = useState({});
  const [erreur, setErreur] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const enregistrer = async () => {
    setEnvoi(true);
    setErreur('');
    try {
      let n = 0;
      for (const a of articles) {
        const v = Number(String(valeurs[a.id] ?? '').replace(',', '.'));
        if (!(v > 0)) continue;
        await api.rpc('enregistrer_article', { p_etablissement_id: etablissement.id, p_article: { ...a, cout_achat: v } });
        n += 1;
      }
      if (n) notifier(`${n} prix d’achat enregistré${n > 1 ? 's' : ''} : la marge est maintenant calculée`);
      onFermer();
    } catch (err) {
      setErreur(err.message);
      setEnvoi(false);
    }
  };
  return (
    <Modale titre="Prix d’achat manquant" onFermer={onFermer} pied={(
      <>
        <Bouton onClick={onFermer}>Plus tard</Bouton>
        <Bouton variante="principal" onClick={enregistrer} chargement={envoi}>Enregistrer</Bouton>
      </>
    )}>
      <p className="texte-doux">Le ticket est parti. Pour savoir ce que ces articles vous rapportent, tapez combien vous les achetez (prix d’une unité).</p>
      <div className="xp-liste">
        {articles.map((a) => (
          <label key={a.id} className="xp-ligne">
            <span className="xp-ligne-texte"><strong>{a.nom}</strong><small>vendu {montant(a.prix_vente)}</small></span>
            <input type="number" min="0" step="any" inputMode="decimal" style={{ width: 130 }} placeholder="Prix d’achat"
              value={valeurs[a.id] ?? ''} onChange={(e) => setValeurs((v) => ({ ...v, [a.id]: e.target.value }))} />
          </label>
        ))}
      </div>
      <Erreur message={erreur} />
    </Modale>
  );
}
