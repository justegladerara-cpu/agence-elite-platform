import React, { useState } from 'react';
import { useDonnees, useEspace } from '../../noyau/espace.jsx';
import { Badge, Bouton, Champ, Erreur, Modale, PageHeader, Section, Squelette } from '../../ui/composants.jsx';
import { GROUPES_CRITERE, TYPES_CRITERE } from './commun.js';

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
      <PageHeader titre="Étapes et questions" sousTitre="Adaptez le parcours de vente et la qualification à votre métier" fil={[{ libelle: 'Prospects et opportunités', href: '#/crm' }, { libelle: 'Étapes' }]} />
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
      <QuestionsQualification />
      <p className="texte-doux">Les motifs de perte et le modèle de compte rendu d’appel se règlent dans Paramètres, module « Prospects et opportunités ».</p>
      <Bouton onClick={() => naviguer('crm')}>Retour au pipeline</Bouton>
    </div>
  );
}

// Questions de qualification (pondérées, score) et d'audit : oui/non, choix, nombre ou texte ; une question peut
// n'apparaître que selon la réponse à une autre. Rien ne se supprime : une question se désactive.
function QuestionsQualification() {
  const { api, etablissement, notifier } = useEspace();
  const [erreur, setErreur] = useState('');
  const [edition, setEdition] = useState(null);
  const { donnees: criteres, recharger } = useDonnees(
    () => api.lire('crm_criteres', { eq: { etablissement_id: etablissement.id }, ordre: ['ordre'] }),
    [etablissement.id],
  );
  const appeler = async (rpc, params, message) => {
    setErreur('');
    try {
      await api.rpc(rpc, { p_etablissement_id: etablissement.id, ...params });
      notifier(message);
      setEdition(null);
      recharger();
    } catch (err) {
      setErreur(err.message);
    }
  };
  if (!criteres) return <Squelette lignes={4} />;
  const libelle = Object.fromEntries(criteres.map((k) => [k.id, k.libelle]));
  return (
    <Section titre="Questions de qualification et d’audit" action={<Bouton icone="plus" onClick={() => setEdition({})}>Ajouter une question</Bouton>}>
      <Erreur message={erreur} />
      {!criteres.length && (
        <>
          <p className="texte-doux">Aucune question. Partez de questions simples (besoin, budget, décideur, délai, audit), puis adaptez-les.</p>
          <Bouton variante="principal" onClick={() => appeler('crm_criteres_initialiser', {}, 'Questions de départ ajoutées')}>Ajouter les questions de départ</Bouton>
        </>
      )}
      {criteres.length > 0 && (
        <div className="tableau-conteneur">
          <table className="tableau">
            <thead><tr><th>Question</th><th>Partie</th><th>Réponse</th><th className="nombre">Poids</th><th /></tr></thead>
            <tbody>
              {criteres.map((k) => (
                <tr key={k.id} className={k.actif ? '' : 'inactif'}>
                  <td>
                    <strong>{k.libelle}</strong>
                    {k.depend_de && <small className="texte-doux bloc">Seulement si « {libelle[k.depend_de]} » = {k.depend_valeur}</small>}
                  </td>
                  <td>{GROUPES_CRITERE[k.groupe]}</td>
                  <td>{TYPES_CRITERE[k.type]}{k.type === 'choix' ? ` : ${k.choix.join(', ')}` : ''}</td>
                  <td className="nombre">{k.groupe === 'qualification' ? k.poids : '—'}</td>
                  <td>
                    <div className="groupe-boutons">
                      <Bouton onClick={() => setEdition(k)}>Modifier</Bouton>
                      <Bouton onClick={() => appeler('enregistrer_critere_crm', { p: { id: k.id, actif: !k.actif } }, k.actif ? 'Question désactivée' : 'Question réactivée')}>
                        {k.actif ? 'Désactiver' : 'Réactiver'}
                      </Bouton>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {criteres.some((k) => k.actif && k.groupe === 'qualification') && (
        <p className="texte-doux">
          Score = poids des questions « oui » (ou répondues pour les autres types) sur le total des questions visibles.{' '}
          <Badge>{criteres.filter((k) => k.actif && k.groupe === 'qualification').reduce((t, k) => t + k.poids, 0)} points au total</Badge>
        </p>
      )}
      {edition && (
        <ModaleCritere
          critere={edition.id ? edition : null}
          parents={criteres.filter((k) => k.actif && !k.depend_de && ['oui_non', 'choix'].includes(k.type) && k.id !== edition.id)}
          onFermer={() => setEdition(null)}
          onValider={(p) => appeler('enregistrer_critere_crm', { p }, edition.id ? 'Question modifiée' : 'Question ajoutée')}
          erreur={erreur}
        />
      )}
    </Section>
  );
}

function ModaleCritere({ critere, parents, onFermer, onValider, erreur }) {
  const [v, setV] = useState({
    libelle: critere?.libelle ?? '', aide: critere?.aide ?? '', groupe: critere?.groupe ?? 'qualification', type: critere?.type ?? 'oui_non',
    choix: (critere?.choix ?? []).join('\n'), poids: String(critere?.poids ?? 25), depend_de: critere?.depend_de ?? '', depend_valeur: critere?.depend_valeur ?? '',
  });
  const changer = (c) => (e) => setV({ ...v, [c]: e.target.value });
  const parent = parents.find((k) => k.id === v.depend_de);
  const valeursParent = parent ? (parent.type === 'oui_non' ? ['oui', 'non'] : parent.choix) : [];
  const valider = (e) => {
    e.preventDefault();
    onValider({
      id: critere?.id, libelle: v.libelle, aide: v.aide, groupe: v.groupe, type: v.type,
      choix: v.choix.split('\n').map((x) => x.trim()).filter(Boolean),
      poids: v.groupe === 'qualification' ? Number(v.poids) || 0 : 0,
      depend_de: v.depend_de || null, depend_valeur: v.depend_de ? v.depend_valeur || null : null,
    });
  };
  return (
    <Modale titre={critere ? 'Modifier la question' : 'Nouvelle question'} onFermer={onFermer}>
      <form className="formulaire" onSubmit={valider}>
        <Champ libelle="Question"><input value={v.libelle} onChange={changer('libelle')} required maxLength={200} autoFocus placeholder="Ex. Le budget est-il validé ?" /></Champ>
        <Champ libelle="Aide (facultatif)"><input value={v.aide} onChange={changer('aide')} maxLength={500} /></Champ>
        <div className="grille-champs">
          <Champ libelle="Partie">
            <select value={v.groupe} onChange={changer('groupe')}>
              {Object.entries(GROUPES_CRITERE).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </Champ>
          <Champ libelle="Type de réponse">
            <select value={v.type} onChange={changer('type')}>
              {Object.entries(TYPES_CRITERE).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </Champ>
          {v.groupe === 'qualification' && (
            <Champ libelle="Poids dans le score" aide="0 : la question ne compte pas dans le score"><input type="number" min="0" max="100" value={v.poids} onChange={changer('poids')} /></Champ>
          )}
        </div>
        {v.type === 'choix' && (
          <Champ libelle="Réponses possibles (une par ligne)"><textarea rows={4} value={v.choix} onChange={changer('choix')} required /></Champ>
        )}
        {parents.length > 0 && (
          <div className="grille-champs">
            <Champ libelle="Poser seulement si">
              <select value={v.depend_de} onChange={(e) => setV({ ...v, depend_de: e.target.value, depend_valeur: '' })}>
                <option value="">— Toujours poser</option>
                {parents.map((k) => <option key={k.id} value={k.id}>{k.libelle}</option>)}
              </select>
            </Champ>
            {v.depend_de && (
              <Champ libelle="a pour réponse">
                <select value={v.depend_valeur} onChange={changer('depend_valeur')} required>
                  <option value="">— Choisir</option>
                  {valeursParent.map((x) => <option key={x} value={x}>{x}</option>)}
                </select>
              </Champ>
            )}
          </div>
        )}
        <Erreur message={erreur} />
        <div className="actions">
          <Bouton type="button" onClick={onFermer}>Annuler</Bouton>
          <Bouton type="submit" variante="principal">Enregistrer</Bouton>
        </div>
      </form>
    </Modale>
  );
}
