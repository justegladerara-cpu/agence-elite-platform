import React, { useState } from 'react';
import { useDonnees, useEspace } from '../../noyau/espace.jsx';
import { Badge, Bouton, Erreur, PageHeader, Section, Squelette } from '../../ui/composants.jsx';

// Étapes du pipeline : nom, ordre, probabilité ; ajout et désactivation (administrateur du CRM).
export default function ReglagesPipeline({ naviguer }) {
  const { api, etablissement, notifier } = useEspace();
  const [erreur, setErreur] = useState('');
  const [nouvelle, setNouvelle] = useState({ nom: '', probabilite: '50' });
  const { donnees: etapes, recharger } = useDonnees(async () => {
    await api.rpc('crm_initialiser', { p_etablissement_id: etablissement.id }).catch(() => null);
    return api.lire('crm_etapes', { eq: { etablissement_id: etablissement.id }, ordre: ['ordre'] });
  }, [etablissement.id]);
  const enregistrer = async (p, message) => {
    setErreur('');
    try {
      await api.rpc('enregistrer_etape_crm', { p_etablissement_id: etablissement.id, p });
      notifier(message);
      recharger();
    } catch (err) {
      setErreur(err.message);
    }
  };
  if (!etapes) return <div className="page"><Squelette lignes={6} /></div>;
  const actives = etapes.filter((e) => e.actif);
  const echanger = (i, j) => {
    const a = actives[i];
    const b = actives[j];
    if (!a || !b) return;
    Promise.all([
      api.rpc('enregistrer_etape_crm', { p_etablissement_id: etablissement.id, p: { id: a.id, ordre: b.ordre } }),
      api.rpc('enregistrer_etape_crm', { p_etablissement_id: etablissement.id, p: { id: b.id, ordre: a.ordre } }),
    ]).then(recharger).catch((err) => setErreur(err.message));
  };
  return (
    <div className="page">
      <PageHeader titre="Étapes du pipeline" sousTitre="Adaptez le parcours de vente à votre métier" fil={[{ libelle: 'Prospects et opportunités', href: '#/crm' }, { libelle: 'Étapes' }]} />
      <Erreur message={erreur} />
      <Section>
        <div className="tableau-conteneur">
          <table className="tableau">
            <thead><tr><th>Étape</th><th className="nombre">Probabilité</th><th>Nature</th><th /></tr></thead>
            <tbody>
              {etapes.map((e) => {
                const i = actives.indexOf(e);
                return (
                  <tr key={e.id} className={e.actif ? '' : 'inactif'}>
                    <td>
                      <input defaultValue={e.nom} maxLength={40} aria-label={`Nom de l’étape ${e.nom}`}
                        onBlur={(ev) => ev.target.value.trim() && ev.target.value !== e.nom && enregistrer({ id: e.id, nom: ev.target.value }, 'Étape renommée')} />
                    </td>
                    <td className="nombre">
                      {e.nature === 'ouverte' ? (
                        <input type="number" min="0" max="100" defaultValue={e.probabilite} aria-label={`Probabilité ${e.nom}`}
                          onBlur={(ev) => Number(ev.target.value) !== e.probabilite && enregistrer({ id: e.id, probabilite: Number(ev.target.value) }, 'Probabilité mise à jour')} />
                      ) : `${e.probabilite} %`}
                    </td>
                    <td>{e.nature === 'ouverte' ? <Badge>En cours</Badge> : <Badge ton={e.nature === 'gagnee' ? 'vert' : 'neutre'}>{e.nature === 'gagnee' ? 'Clôture gagnée' : 'Clôture perdue'}</Badge>}</td>
                    <td>
                      <div className="groupe-boutons">
                        {e.actif && <button type="button" className="icone-bouton" aria-label="Monter" disabled={i <= 0} onClick={() => echanger(i, i - 1)}>↑</button>}
                        {e.actif && <button type="button" className="icone-bouton" aria-label="Descendre" disabled={i >= actives.length - 1} onClick={() => echanger(i, i + 1)}>↓</button>}
                        {e.nature === 'ouverte' && (
                          <Bouton onClick={() => enregistrer({ id: e.id, actif: !e.actif }, e.actif ? 'Étape désactivée' : 'Étape réactivée')}>{e.actif ? 'Désactiver' : 'Réactiver'}</Bouton>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <form className="barre-outils" onSubmit={(ev) => { ev.preventDefault(); enregistrer({ nom: nouvelle.nom, probabilite: Number(nouvelle.probabilite), ordre: Math.max(0, ...actives.filter((x) => x.nature === 'ouverte').map((x) => x.ordre)) + 1 }, 'Étape ajoutée'); setNouvelle({ nom: '', probabilite: '50' }); }}>
          <input value={nouvelle.nom} onChange={(ev) => setNouvelle({ ...nouvelle, nom: ev.target.value })} placeholder="Nouvelle étape (ex. Démo faite)" maxLength={40} required aria-label="Nom de la nouvelle étape" />
          <input type="number" min="0" max="100" value={nouvelle.probabilite} onChange={(ev) => setNouvelle({ ...nouvelle, probabilite: ev.target.value })} aria-label="Probabilité de la nouvelle étape" />
          <Bouton type="submit" icone="plus">Ajouter</Bouton>
        </form>
      </Section>
      <Bouton onClick={() => naviguer('crm')}>Retour au pipeline</Bouton>
    </div>
  );
}
