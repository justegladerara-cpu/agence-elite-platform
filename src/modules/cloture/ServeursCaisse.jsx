import React, { useState } from 'react';
import { useDonnees } from '../../noyau/espace.jsx';
import { Badge, Bouton, Erreur } from '../../ui/composants.jsx';
import { NOUVEAU_CAISSE_UNIQUE_JUSQUA, PastilleNouveau } from '../../ui/Nouveau.jsx';
import './activite-caissiers.css';

// Tableau de bord (gérant, responsable) : ventes par serveur sur la période (migration 20261013000133, jour du service
// comme pour les caissières), et gestion de la liste : désactiver un serveur parti, fusionner un doublon.
export default function ServeursCaisse({ espace, du, au }) {
  const { api, etablissement, montant, notifier } = espace;
  const { donnees, erreur, recharger } = useDonnees(
    () => api.rpc('statistiques_serveurs_caisse', { p_etablissement_id: etablissement.id, p_du: du ?? null, p_au: au ?? null }),
    [etablissement.id, du, au]
  );
  const [fusion, setFusion] = useState({});
  const [erreurAction, setErreurAction] = useState('');
  if (erreur) return <Erreur message={erreur} />;
  if (!donnees?.length) return null;
  const agir = async (rpc, params, message) => {
    setErreurAction('');
    try {
      await api.rpc(rpc, params);
      notifier(message);
      recharger();
    } catch (err) {
      setErreurAction(err.message);
    }
  };
  return (
    <section className="carte cockpit-serveurs" aria-label="Serveurs">
      <div className="titre-ligne">
        <h2>Serveurs<PastilleNouveau jusqua={NOUVEAU_CAISSE_UNIQUE_JUSQUA} /></h2>
        <small className="texte-doux">Choisis à la caisse, à chaque commande</small>
      </div>
      <Erreur message={erreurAction} />
      <div className="tableau-conteneur">
        <table className="tableau">
          <thead><tr><th>Serveur</th><th className="nombre">Ventes</th><th className="nombre">Montant</th><th>Le plus servi</th><th /></tr></thead>
          <tbody>
            {donnees.map((s) => (
              <tr key={s.id}>
                <td><strong>{s.prenom}</strong> {!s.actif && <Badge>Désactivé</Badge>}</td>
                <td className="nombre">{s.nombre_ventes}</td>
                <td className="nombre"><strong>{montant(s.total_ventes)}</strong></td>
                <td>{s.article_phare ?? <span className="texte-doux">—</span>}</td>
                <td>
                  <div className="serveurs-caisse-actions">
                    <select value={fusion[s.id] ?? ''} onChange={(e) => setFusion({ ...fusion, [s.id]: e.target.value })} aria-label={`Fusionner ${s.prenom} avec`}>
                      <option value="">Doublon de…</option>
                      {donnees.filter((x) => x.id !== s.id && x.actif).map((x) => <option key={x.id} value={x.id}>{x.prenom}</option>)}
                    </select>
                    {fusion[s.id] && (
                      <Bouton onClick={() => agir('fusionner_serveurs', { p_source_id: s.id, p_cible_id: fusion[s.id] }, `${s.prenom} fusionné`)}>Fusionner</Bouton>
                    )}
                    <Bouton onClick={() => agir('activer_serveur', { p_serveur_id: s.id, p_actif: !s.actif }, s.actif ? `${s.prenom} désactivé` : `${s.prenom} réactivé`)}>
                      {s.actif ? 'Désactiver' : 'Réactiver'}
                    </Bouton>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
