import React, { useState } from 'react';
import { useDonnees, useEspace } from '../../noyau/espace.jsx';
import { formatDateHeure } from '../../noyau/format.js';
import { INTEGRATIONS, LIBELLES_STATUT_INTEGRATION } from '../../noyau/integrations.js';
import { Badge, Bouton, Champ, Chargement, Erreur, Modale } from '../../ui/composants.jsx';

// Paramètres › Connexions (gérant, droit etablissement.integrations). Les clés partent au serveur, qui les chiffre :
// après saisie, seul l'aperçu « ••••abcd » reste visible. Voir docs/INTEGRATIONS.md.
function FormulaireConnexion({ definition, connexion, onFermer, onFait }) {
  const { api, etablissement } = useEspace();
  const [mode, setMode] = useState(connexion?.mode ?? 'test');
  const [config, setConfig] = useState(() => Object.fromEntries((definition.champs ?? []).map((c) => [c.cle, connexion?.config?.[c.cle] ?? ''])));
  const [secret, setSecret] = useState('');
  const [erreur, setErreur] = useState('');
  const [enCours, setEnCours] = useState(false);
  const [resultat, setResultat] = useState(null);
  const valider = async (e) => {
    e.preventDefault();
    setEnCours(true);
    setErreur('');
    try {
      const r = await api.serveur('/api/integrations', {
        methode: 'POST',
        corps: { action: 'connecter', etablissement_id: etablissement.id, fournisseur: definition.id, mode, config, secret: secret || undefined, nouveau_secret_webhook: !connexion },
      });
      setSecret('');
      if (r.webhook_secret) setResultat(r);
      else onFait();
    } catch (err) {
      setErreur(err.message);
    } finally {
      setEnCours(false);
    }
  };
  if (resultat) {
    return (
      <Modale titre="Connexion enregistrée" onFermer={onFait}>
        <p>Pour recevoir les événements du fournisseur, recopiez chez lui cette adresse et ce secret.</p>
        <p className="bandeau attention">Le secret ne sera plus jamais affiché. Notez-le maintenant.</p>
        <dl className="details">
          <dt>Adresse</dt><dd><code>{resultat.webhook_url}</code></dd>
          <dt>Secret</dt><dd><code>{resultat.webhook_secret}</code></dd>
        </dl>
        <div className="actions"><Bouton variante="principal" onClick={onFait}>C’est noté</Bouton></div>
      </Modale>
    );
  }
  return (
    <Modale titre={`Connecter : ${definition.nom}`} onFermer={onFermer}>
      <form className="formulaire" onSubmit={valider}>
        <Champ libelle="Mode">
          <select value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="test">Test (aucun vrai paiement ni message)</option>
            <option value="reel">Réel</option>
          </select>
        </Champ>
        {(definition.champs ?? []).map((c) => (
          <Champ key={c.cle} libelle={c.libelle}>
            <input value={config[c.cle]} maxLength={200} onChange={(e) => setConfig({ ...config, [c.cle]: e.target.value })} />
          </Champ>
        ))}
        <Champ libelle={definition.secret?.libelle ?? 'Clé secrète'} aide={connexion?.secret_apercu ? `Clé enregistrée : ${connexion.secret_apercu}. Laissez vide pour la garder.` : 'Chiffrée par le serveur ; elle ne sera plus jamais affichée.'}>
          <input type="password" autoComplete="off" value={secret} onChange={(e) => setSecret(e.target.value)} required={!connexion?.secret_apercu} />
        </Champ>
        <Erreur message={erreur} />
        <div className="actions">
          <Bouton type="button" onClick={onFermer}>Annuler</Bouton>
          <Bouton type="submit" variante="principal" chargement={enCours}>Enregistrer</Bouton>
        </div>
      </form>
    </Modale>
  );
}

export function Connexions() {
  const { api, etablissement, notifier } = useEspace();
  const enLigne = typeof api.serveur === 'function';
  const { donnees, chargement, erreur, recharger } = useDonnees(async () => {
    const [connexions, journal] = await Promise.all([
      api.lire('integrations_connexions', { eq: { etablissement_id: etablissement.id } }).catch(() => null),
      api.lire('integrations_journal', { eq: { etablissement_id: etablissement.id }, ordre: ['cree_le', 'desc'], limite: 20 }).catch(() => []),
    ]);
    return { connexions, journal };
  }, [etablissement.id]);
  const [formulaire, setFormulaire] = useState(null);
  const [erreurAction, setErreurAction] = useState('');
  const [enTest, setEnTest] = useState(null);

  if (chargement && !donnees) return <Chargement />;
  if (donnees && donnees.connexions === null) {
    return <div className="carte"><h2>Connexions</h2><p className="texte-doux">Les connexions aux services externes arrivent bientôt sur cet espace.</p></div>;
  }
  const parFournisseur = Object.fromEntries((donnees?.connexions ?? []).map((c) => [c.fournisseur, c]));
  const action = async (corps, message) => {
    setErreurAction('');
    try {
      const r = await api.serveur('/api/integrations', { methode: 'POST', corps });
      notifier(corps.action === 'tester' ? (r.ok ? `Test réussi : ${r.message}` : `Test échoué : ${r.message}`) : message);
      recharger();
    } catch (err) {
      setErreurAction(err.message);
      recharger();
    } finally {
      setEnTest(null);
    }
  };
  return (
    <div className="pile">
      <div className="carte">
        <h2>Connexions aux services externes</h2>
        <p className="texte-doux">
          Paiement, messages, agenda, comptabilité : chaque service passe par une connexion propre à cet établissement. Les clés sont
          chiffrées et ne sont plus jamais affichées après saisie. Une connexion se désactive en un clic.
        </p>
        {!enLigne && <p className="bandeau attention">Démonstration locale : les connexions se règlent sur le site en ligne.</p>}
        <Erreur message={erreur || erreurAction} />
      </div>
      <div className="grille-integrations">
        {INTEGRATIONS.map((def) => {
          const c = parFournisseur[def.id];
          const [libelleStatut, ton] = LIBELLES_STATUT_INTEGRATION[def.statut];
          return (
            <div key={def.id} className="carte integration">
              <div className="titre-ligne">
                <div><h3>{def.nom}</h3><small className="texte-doux">{def.famille}</small></div>
                <Badge ton={ton}>{libelleStatut}</Badge>
              </div>
              <p>{def.description}</p>
              {def.statut === 'prevu' && <p className="texte-doux">Bloqué : {def.bloque}.</p>}
              {c && (
                <p>
                  <Badge ton={c.actif ? 'vert' : 'neutre'}>{c.actif ? `Connectée (${c.mode === 'test' ? 'test' : 'réel'})` : 'Désactivée'}</Badge>
                  {c.secret_apercu && <small className="texte-doux"> · clé {c.secret_apercu}</small>}
                </p>
              )}
              {def.statut === 'disponible_test' && enLigne && (
                <div className="actions-gauche">
                  <Bouton onClick={() => setFormulaire({ def, c })}>{c ? 'Modifier' : 'Connecter'}</Bouton>
                  {c?.actif && <Bouton chargement={enTest === c.id} onClick={() => { setEnTest(c.id); action({ action: 'tester', connexion_id: c.id }); }}>Tester</Bouton>}
                  {c?.actif && <button type="button" className="lien danger" onClick={() => action({ action: 'desactiver', connexion_id: c.id }, `${def.nom} désactivée`)}>Désactiver</button>}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {donnees?.journal.length > 0 && (
        <div className="carte">
          <h2>Derniers échanges</h2>
          <div className="tableau-conteneur">
            <table className="tableau">
              <thead><tr><th>Date</th><th>Service</th><th>Sens</th><th>Opération</th><th>Résultat</th></tr></thead>
              <tbody>
                {donnees.journal.map((j) => (
                  <tr key={j.id}>
                    <td>{formatDateHeure(j.cree_le)}</td>
                    <td>{INTEGRATIONS.find((i) => i.id === donnees.connexions.find((c) => c.id === j.connexion_id)?.fournisseur)?.nom ?? '—'}</td>
                    <td>{j.sens === 'entrant' ? 'Reçu' : 'Envoyé'}</td>
                    <td>{j.operation}</td>
                    <td><Badge ton={j.statut === 'ok' ? 'vert' : j.statut === 'doublon' ? 'neutre' : 'alerte'}>{j.statut}</Badge>{j.erreur && <small className="texte-doux bloc">{j.erreur}</small>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {formulaire && (
        <FormulaireConnexion
          definition={formulaire.def}
          connexion={formulaire.c}
          onFermer={() => setFormulaire(null)}
          onFait={() => { setFormulaire(null); notifier('Connexion enregistrée'); recharger(); }}
        />
      )}
    </div>
  );
}
