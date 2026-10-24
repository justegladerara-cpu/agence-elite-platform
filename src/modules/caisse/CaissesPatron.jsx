import React from 'react';
import { useDonnees, useEspace } from '../../noyau/espace.jsx';
import { dateLocale, formatDateHeure } from '../../noyau/format.js';
import { Bouton, Icone } from '../../ui/composants.jsx';
import { dureeEnMots, minutesDepuis } from '../tableau_de_bord/zoom.js';

// Le patron voit toutes les caisses ouvertes : qui travaille, depuis quand, combien est entré, la dernière vente.
// « Entrer dans sa caisse » le fait vendre sur la caisse de cette personne (ses ventes portent le nom du patron).
// Demande de Juste, 2026-10-24. Lecture seule : caisse_occupee + activite_caissiers.
export function CaissesPatron({ occupees, onVendre }) {
  const { api, etablissement, montant } = useEspace();
  const jour = dateLocale(0);
  const { donnees: activite } = useDonnees(
    () => api.rpc('activite_caissiers', { p_etablissement_id: etablissement.id, p_du: jour, p_au: jour }).catch(() => []),
    [etablissement.id, jour]
  );
  if (!occupees?.length) return null;
  const parNom = Object.fromEntries((activite ?? []).filter((x) => x.en_caisse).map((x) => [x.nom, x]));
  const maintenant = Date.now();
  return (
    <section className="carte caisses-patron" aria-label="Caisses ouvertes">
      <div className="titre-ligne">
        <h2>Qui travaille en ce moment</h2>
        <span className="onglet-compteur">{occupees.length}</span>
      </div>
      <div className="caisses-patron-liste">
        {occupees.map((o) => {
          const act = parNom[o.caissier];
          const calme = minutesDepuis(act?.derniere_vente, maintenant);
          return (
            <article key={o.session_id} className="caisses-patron-caisse">
              <header><span className="caisses-patron-pastille" aria-hidden="true" /><strong>{o.caissier}</strong></header>
              <dl>
                <div><dt>Caisse ouverte</dt><dd>{formatDateHeure(o.ouverte_le)}</dd></div>
                <div><dt>Depuis</dt><dd>{dureeEnMots(minutesDepuis(o.ouverte_le, maintenant))}</dd></div>
                {act && <div><dt>Encaissé</dt><dd>{montant(act.caisse_en_cours ?? 0)} · {act.nombre_en_cours ?? 0} vente(s)</dd></div>}
                {act && <div><dt>Dernière vente</dt><dd>{act.derniere_vente ? `il y a ${dureeEnMots(calme)}` : 'aucune'}</dd></div>}
              </dl>
              {onVendre && (
                <Bouton type="button" variante="principal" icone="caisse" onClick={() => onVendre(o)}>Entrer dans sa caisse</Bouton>
              )}
            </article>
          );
        })}
      </div>
      <p className="texte-doux caisses-patron-note"><Icone nom="utilisateur" taille={14} /> Dans sa caisse, chaque vente que vous faites porte votre nom. Sa caisse reste à elle : c’est elle qui tire son ticket Z.</p>
    </section>
  );
}
