import { useState } from 'react';
import { useDonnees, useEspace } from '../../noyau/espace.jsx';
import { formatDate } from '../../noyau/format.js';
import { Badge, Bouton, Chargement, EnTete, Erreur } from '../../ui/composants.jsx';

const LIENS = {
  gerant: 'equipe',
  identite: 'parametres',
  logo: 'parametres',
  caisses: 'parametres',
  equipe: 'equipe',
  articles: 'articles',
  stock: 'stock',
  premiere_vente: 'caisse',
};

export function ListeMiseEnService({ etat, naviguer }) {
  return (
    <ol className="etapes">
      {etat.etapes.map((e) => (
        <li key={e.id} className={e.fait ? 'faite' : ''}>
          <span className="etape-puce" aria-hidden="true">{e.fait ? '✓' : ''}</span>
          <span className="etape-libelle">{e.libelle}</span>
          {!e.fait && naviguer && LIENS[e.id] && <button className="lien" onClick={() => naviguer(LIENS[e.id])}>Faire</button>}
          {!e.fait && e.id === 'licence' && <span className="texte-doux">à voir avec Agence Elite</span>}
        </li>
      ))}
    </ol>
  );
}

export default function MiseEnService({ naviguer }) {
  const { api, etablissement, peut, notifier, recharger: rechargerContexte } = useEspace();
  const { donnees: etat, chargement, erreur, recharger } = useDonnees(
    () => api.rpc('etat_mise_en_service', { p_etablissement_id: etablissement.id }),
    [etablissement.id]
  );
  const [erreurAction, setErreurAction] = useState('');
  const [envoi, setEnvoi] = useState(false);
  return (
    <div className="page">
      <EnTete titre="Mise en service" sousTitre="Les étapes pour démarrer avec Solution Commerce" />
      {chargement && !etat && <Chargement />}
      <Erreur message={erreur || erreurAction} />
      {etat && (
        <section className="carte">
          <div className="titre-ligne">
            <h2>{etat.faites} étape(s) sur {etat.total}</h2>
            {etat.mis_en_service_le
              ? <Badge ton="vert">En service depuis le {formatDate(etat.mis_en_service_le)}</Badge>
              : <Badge ton="attention">Pas encore en service</Badge>}
          </div>
          <div className="barre-progression" aria-hidden="true"><span style={{ width: `${(etat.faites / etat.total) * 100}%` }} /></div>
          <ListeMiseEnService etat={etat} naviguer={naviguer} />
          {!etat.mis_en_service_le && peut('etablissement.modifier') && (
            <div className="actions">
              <Bouton
                variante="principal"
                chargement={envoi}
                onClick={async () => {
                  setEnvoi(true);
                  setErreurAction('');
                  try {
                    await api.rpc('mettre_en_service', { p_etablissement_id: etablissement.id });
                    notifier('Établissement mis en service');
                    recharger();
                    rechargerContexte();
                  } catch (err) {
                    setErreurAction(err.message);
                  } finally {
                    setEnvoi(false);
                  }
                }}
              >
                Déclarer la mise en service
              </Bouton>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
