import React, { useEffect, useState } from 'react';
import { useDonnees, useEspace } from '../../noyau/espace.jsx';
import { formatQuantite } from '../../noyau/format.js';
import { Badge, Bouton, EmptyState, Erreur, PageHeader, Squelette, Tabs } from '../../ui/composants.jsx';
import { minutesDepuis } from './commun.js';

// Écran cuisine et bar : un bon par commande, les plats envoyés puis en préparation, puis prêts.
// Rafraîchi toutes les 15 secondes (et à chaque action).
export default function Cuisine({ naviguer }) {
  const { api, etablissement, peut, notifier, hubs, hub, multiHub } = useEspace();
  const etab = etablissement.id;
  const [poste, setPoste] = useState('cuisine');
  const [maintenant, setMaintenant] = useState(Date.now());
  const [erreurAction, setErreurAction] = useState('');
  const hubsVisibles = (multiHub && hub ? [hub] : hubs).map((h) => h.id);
  const { donnees: d, chargement, erreur, recharger } = useDonnees(async () => {
    const [lignes, commandes, tables] = await Promise.all([
      api.lire('rest_lignes', { eq: { etablissement_id: etab }, dans: { statut: ['envoyee', 'en_preparation', 'prete'] }, ordre: ['envoyee_le'] }),
      api.lire('rest_commandes', { eq: { etablissement_id: etab, statut: 'ouverte' } }),
      api.lire('rest_tables', { eq: { etablissement_id: etab } }),
    ]);
    return {
      lignes, commandes: Object.fromEntries(commandes.filter((c) => hubsVisibles.includes(c.hub_id)).map((c) => [c.id, c])),
      table: Object.fromEntries(tables.map((t) => [t.id, t])),
    };
  }, [etab, hubsVisibles.join()]);
  useEffect(() => {
    const minuteur = setInterval(() => { setMaintenant(Date.now()); recharger(); }, 15000);
    return () => clearInterval(minuteur);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (chargement && !d) return <div className="page"><Squelette lignes={8} /></div>;
  if (erreur) return <div className="page"><Erreur message={erreur} /></div>;
  const lignes = d.lignes.filter((l) => d.commandes[l.commande_id] && (poste === 'tout' || l.poste === poste));
  const aFaire = lignes.filter((l) => l.statut !== 'prete');
  const bons = [...new Set(aFaire.map((l) => l.commande_id))];
  const prets = lignes.filter((l) => l.statut === 'prete');
  const preparer = peut('restaurant_cuisine.preparer');
  const avancer = async (l, statut) => {
    setErreurAction('');
    try {
      await api.rpc('avancer_ligne_restaurant', { p_ligne_id: l.id, p_statut: statut });
      if (statut === 'prete') notifier(`${l.libelle} prêt`);
      recharger();
    } catch (err) {
      setErreurAction(err.message);
    }
  };
  const compte = (p) => d.lignes.filter((l) => d.commandes[l.commande_id] && l.statut !== 'prete' && (p === 'tout' || l.poste === p)).length;
  return (
    <div className="page page-large">
      <PageHeader titre="Écran cuisine" sousTitre="Les bons arrivent dans l’ordre d’envoi. « Prêt » prévient le serveur."
        actions={peut('restaurant_salle.lire') && <Bouton icone="table" onClick={() => naviguer('salle')}>Salle</Bouton>} />
      <Tabs actif={poste} onChange={setPoste} onglets={[['cuisine', 'Cuisine', compte('cuisine')], ['bar', 'Bar', compte('bar')], ['tout', 'Tout', compte('tout')]]} />
      <Erreur message={erreurAction} />
      {!bons.length && <EmptyState icone="cuisine" titre="Rien en attente" texte="Les plats envoyés par la salle apparaissent ici." />}
      <div className="bons-cuisine">
        {bons.map((id) => {
          const c = d.commandes[id];
          const siennes = aFaire.filter((l) => l.commande_id === id);
          const attente = minutesDepuis(siennes[0]?.envoyee_le, maintenant);
          return (
            <article key={id} className={`bon-cuisine ${attente >= 20 ? 'retard' : attente >= 10 ? 'attention' : ''}`}>
              <header>
                <strong>{c.table_id ? `Table ${d.table[c.table_id]?.nom ?? ''}` : `À emporter${c.nom_client ? ` · ${c.nom_client}` : ''}`}</strong>
                <span>{c.numero} · {attente} min</span>
              </header>
              <ul>
                {siennes.map((l) => (
                  <li key={l.id} className={l.statut}>
                    <span>
                      <strong>{formatQuantite(l.quantite)} × {l.libelle}</strong>
                      {l.note && <small className="bloc">{l.note}</small>}
                    </span>
                    {preparer ? (
                      l.statut === 'envoyee'
                        ? <Bouton onClick={() => avancer(l, 'en_preparation')}>Commencer</Bouton>
                        : <Bouton variante="principal" onClick={() => avancer(l, 'prete')}>Prêt</Bouton>
                    ) : <Badge ton={l.statut === 'envoyee' ? 'bleu' : 'orange'}>{l.statut === 'envoyee' ? 'Envoyé' : 'En préparation'}</Badge>}
                  </li>
                ))}
              </ul>
            </article>
          );
        })}
      </div>
      {prets.length > 0 && (
        <section className="section">
          <h2>Prêts à servir</h2>
          <div className="liste-simple">
            {prets.map((l) => {
              const c = d.commandes[l.commande_id];
              return (
                <div key={l.id} className="liste-ligne">
                  <span>{formatQuantite(l.quantite)} × {l.libelle}</span>
                  <span className="texte-doux">{c.table_id ? `Table ${d.table[c.table_id]?.nom ?? ''}` : c.numero} · prêt depuis {minutesDepuis(l.prete_le, maintenant)} min</span>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
