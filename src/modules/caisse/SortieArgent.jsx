// « Sortie d'argent » depuis la caisse (demande de Juste, 2026-10-23) : de l'argent pris dans le tiroir pour payer le
// carburant, le loyer, l'électricité, un technicien… Enregistré comme dépense en espèces de CETTE caisse (fonction
// sortie_de_caisse, migration 20261023200156) : il est retiré des espèces attendues au ticket Z.
import React, { useState } from 'react';
import { useEspace } from '../../noyau/espace.jsx';
import { Bouton, Champ, Erreur, Modale } from '../../ui/composants.jsx';
import { libelleDepense, motifParId, MOTIFS_DEPENSE } from '../depenses/motifs.js';
import '../depenses/depenses.css';

export function ModaleSortieArgent({ session, onFermer, onFait }) {
  const { api, etablissement, montant: formatMontant } = useEspace();
  const [valeurs, setValeurs] = useState({ montant: '', motif: '', libelle: '' });
  const [erreur, setErreur] = useState('');
  const [chargement, setChargement] = useState(false);
  const changer = (champ) => (e) => setValeurs((v) => ({ ...v, [champ]: e.target.value }));
  const enregistrer = async (e) => {
    e.preventDefault();
    const libelle = libelleDepense(valeurs);
    if (!libelle) return setErreur('Touchez pour quoi l’argent est sorti (Carburant, Loyer…) ou écrivez-le.');
    if (!(Number(valeurs.montant) > 0)) return setErreur('Écrivez combien d’argent est sorti.');
    setChargement(true);
    setErreur('');
    try {
      await api.rpc('sortie_de_caisse', {
        p_etablissement_id: etablissement.id, p_session_id: session.id, p_montant: Number(valeurs.montant),
        p_libelle: libelle, p_categorie: motifParId(valeurs.motif)?.categorie ?? null,
      });
      onFait(`Sortie d’argent enregistrée : ${formatMontant(Number(valeurs.montant))} (${libelle})`);
    } catch (err) {
      setErreur(err.message);
      setChargement(false);
    }
  };
  return (
    <Modale titre="Sortie d’argent de la caisse" onFermer={onFermer}>
      <form className="formulaire depense-rapide" onSubmit={enregistrer}>
        <p className="texte-doux">L’argent est pris dans le tiroir. Il sera enlevé des espèces attendues au ticket Z.</p>
        <Champ libelle="Combien ?">
          <input className="depense-montant" type="number" min="0" step="any" inputMode="decimal" value={valeurs.montant} onChange={changer('montant')} required autoFocus placeholder="0" />
        </Champ>
        <fieldset className="depense-motifs">
          <legend>C’est pour quoi ?</legend>
          <div className="depense-motifs-liste">
            {MOTIFS_DEPENSE.map((m) => (
              <button key={m.id} type="button" className={valeurs.motif === m.id ? 'actif' : ''} aria-pressed={valeurs.motif === m.id} onClick={() => setValeurs((v) => ({ ...v, motif: m.id }))}>
                {m.libelle}
              </button>
            ))}
          </div>
        </fieldset>
        <Champ libelle={valeurs.motif === 'autre' ? 'Écrivez pour quoi' : 'Détail (facultatif)'}>
          <input value={valeurs.libelle} onChange={changer('libelle')} placeholder="Ex. : technicien du frigo, carburant du groupe" />
        </Champ>
        <Erreur message={erreur} />
        <div className="actions-formulaire">
          <Bouton type="button" onClick={onFermer}>Annuler</Bouton>
          <Bouton type="submit" variante="principal" chargement={chargement}>Enregistrer la sortie</Bouton>
        </div>
      </form>
    </Modale>
  );
}
