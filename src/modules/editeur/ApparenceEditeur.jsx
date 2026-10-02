// Identité affichée, côté Agence Elite : plateforme (Super Admin), client, établissement.
// Héritage : plateforme → client → établissement. Le Hub n'a pas d'identité visuelle.
// Rien ici ne change l'identité technique (ids, solution, modules).
import React, { useState } from 'react';
import { useDonnees, useEspace } from '../../noyau/espace.jsx';
import { Bouton, Champ, Erreur, Section, Squelette } from '../../ui/composants.jsx';
import { ApercuMarque, ChampsApparence } from '../../ui/Marque.jsx';

const CHAMPS_MARQUE = ['nom_logiciel', 'nom_court', 'sous_titre', 'logo_url', 'favicon_url', 'couleur_accent'];
const versValeurs = (source, champs) => Object.fromEntries(champs.map((c) => [c, source?.[c] ?? '']));
const sansVide = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== '' && v != null));

function useEnregistrer(action, apres) {
  const { notifier } = useEspace();
  const [erreur, setErreur] = useState('');
  const [chargement, setChargement] = useState(false);
  const enregistrer = async (...args) => {
    setChargement(true);
    setErreur('');
    try {
      await action(...args);
      notifier('Identité enregistrée');
      await apres?.();
    } catch (err) {
      setErreur(err.message);
    } finally {
      setChargement(false);
    }
  };
  return { erreur, setErreur, chargement, enregistrer };
}

export function IdentitePlateforme() {
  const { api, roleEditeur, recharger } = useEspace();
  const { donnees, chargement: lecture, erreur: erreurLecture } = useDonnees(() => api.rpc('editeur_catalogue'), []);
  if (lecture && !donnees) return <Squelette lignes={5} />;
  if (!donnees) return <Erreur message={erreurLecture} />;
  return <FormulairePlateforme initial={donnees.plateforme} modifiable={roleEditeur === 'super_admin'} recharger={recharger} />;
}

function FormulairePlateforme({ initial, modifiable, recharger }) {
  const { api } = useEspace();
  const [valeurs, setValeurs] = useState(() => versValeurs(initial, CHAMPS_MARQUE));
  const { erreur, setErreur, chargement, enregistrer } = useEnregistrer((v) => api.rpc('enregistrer_identite_plateforme', { p: v }), recharger);
  return (
    <form className="carte formulaire" onSubmit={(e) => { e.preventDefault(); enregistrer(valeurs); }}>
      <h2>Identité de la plateforme</h2>
      <p className="texte-doux">Utilisée partout où un client n’a pas sa propre identité : écran de connexion, espace Agence Elite, établissements sans personnalisation.</p>
      <fieldset disabled={!modifiable}>
        <ChampsApparence valeurs={valeurs} onChange={setValeurs} heritage={{ nom_logiciel: 'Agence Elite', nom_court: 'AE', couleur_accent: '#2563eb' }} onErreur={setErreur} />
      </fieldset>
      <Erreur message={erreur} />
      {modifiable ? (
        <div className="actions">
          <Bouton type="button" onClick={() => { const vide = versValeurs({}, CHAMPS_MARQUE); setValeurs(vide); enregistrer(vide); }}>Revenir à l’identité d’origine</Bouton>
          <Bouton type="submit" variante="principal" chargement={chargement}>Enregistrer</Bouton>
        </div>
      ) : <p className="texte-doux">Seul le Super Admin modifie l’identité de la plateforme.</p>}
    </form>
  );
}

const CHAMPS_CLIENT = [...CHAMPS_MARQUE, 'nom_commercial', 'adresse', 'telephone', 'email', 'rccm', 'niu', 'mentions_documents', 'pied_documents', 'adresse_connexion'];

export function ApparenceClient({ clientId, naviguer }) {
  const { api } = useEspace();
  const { donnees, chargement, erreur, recharger } = useDonnees(() => api.rpc('editeur_identite_client', { p_client_id: clientId }), [clientId]);
  if (chargement && !donnees) return <Squelette lignes={6} />;
  if (!donnees) return <Erreur message={erreur} />;
  return <FormulaireClient key={JSON.stringify(donnees.client)} clientId={clientId} donnees={donnees} recharger={recharger} naviguer={naviguer} />;
}

function FormulaireClient({ clientId, donnees, recharger, naviguer }) {
  const { api, recharger: rechargerContexte } = useEspace();
  const [valeurs, setValeurs] = useState(() => versValeurs(donnees.client, CHAMPS_CLIENT));
  const [personnalisation, setPersonnalisation] = useState(Boolean(donnees.client?.personnalisation_client));
  const { erreur, setErreur, chargement, enregistrer } = useEnregistrer(
    (v) => api.rpc('enregistrer_identite_client', { p_client_id: clientId, p: { ...v, personnalisation_client: personnalisation } }),
    async () => { await recharger(); await rechargerContexte(); },
  );
  const changer = (c) => (e) => setValeurs((v) => ({ ...v, [c]: e.target.value }));
  const p = donnees.plateforme;
  const lienConnexion = valeurs.adresse_connexion ? `${window.location.origin}${window.location.pathname}#/connexion/${valeurs.adresse_connexion}` : '';
  return (
    <div className="pile">
      <form className="pile" onSubmit={(e) => { e.preventDefault(); enregistrer(valeurs); }}>
        <Section titre="Apparence du logiciel" sousTitre="Ce que voient tous les établissements de ce client. Vide = identité de la plateforme.">
          <ChampsApparence valeurs={valeurs} onChange={setValeurs} heritage={versValeurs(p, CHAMPS_MARQUE)} onErreur={setErreur} />
          <label className="case">
            <input type="checkbox" checked={personnalisation} onChange={(e) => setPersonnalisation(e.target.checked)} />
            Le client peut régler lui-même l’apparence de ses établissements (Paramètres › Apparence)
          </label>
        </Section>
        <Section titre="Écran de connexion personnalisé" sousTitre="Facultatif. Seuls le nom, le logo et la couleur sont visibles avant connexion.">
          <Champ libelle="Adresse de connexion" aide="3 à 40 caractères : minuscules, chiffres, tirets.">
            <input value={valeurs.adresse_connexion} onChange={(e) => setValeurs((v) => ({ ...v, adresse_connexion: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }))} placeholder="ex. kangourou" />
          </Champ>
          {lienConnexion && <p className="texte-doux">Lien à transmettre : <code>{lienConnexion}</code></p>}
        </Section>
        <Section titre="Société (documents)" sousTitre="Reprises sur les reçus des établissements qui n’ont pas leurs propres informations.">
          <div className="grille-champs">
            <Champ libelle="Nom commercial" className="large"><input value={valeurs.nom_commercial} onChange={changer('nom_commercial')} maxLength={80} /></Champ>
            <Champ libelle="Adresse" className="large"><input value={valeurs.adresse} onChange={changer('adresse')} /></Champ>
            <Champ libelle="Téléphone"><input value={valeurs.telephone} onChange={changer('telephone')} /></Champ>
            <Champ libelle="E-mail"><input type="email" value={valeurs.email} onChange={changer('email')} /></Champ>
            <Champ libelle="RCCM"><input value={valeurs.rccm} onChange={changer('rccm')} /></Champ>
            <Champ libelle="NIU"><input value={valeurs.niu} onChange={changer('niu')} /></Champ>
          </div>
          <Champ libelle="Message en bas des reçus"><textarea rows={2} maxLength={300} value={valeurs.mentions_documents} onChange={changer('mentions_documents')} /></Champ>
          <Champ libelle="Pied de document"><textarea rows={2} maxLength={300} value={valeurs.pied_documents} onChange={changer('pied_documents')} /></Champ>
        </Section>
        <Erreur message={erreur} />
        <div className="actions">
          <Bouton type="button" onClick={() => { const vide = versValeurs({}, CHAMPS_MARQUE); setValeurs((v) => ({ ...v, ...vide })); enregistrer({ ...valeurs, ...vide }); }}>Apparence par défaut</Bouton>
          <Bouton type="submit" variante="principal" chargement={chargement}>Enregistrer</Bouton>
        </div>
      </form>
      <Section titre="Établissements" sousTitre="Identité effective de chacun (après héritage).">
        <div className="liste-simple">
          {donnees.etablissements.map((e) => (
            <div key={e.id} className="liste-ligne">
              <ApercuMarque marque={e.effective} />
              <span><strong>{e.nom}</strong><small className="texte-doux bloc">{sansVide(e.surcharge ?? {}) && Object.keys(sansVide(e.surcharge ?? {})).length ? 'Personnalisé pour cet établissement' : 'Hérite du client'}</small></span>
              <button type="button" className="lien" onClick={() => naviguer(`editeur/etablissements/${e.id}`)}>Ouvrir</button>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

const CHAMPS_ETAB = ['nom_logiciel', 'nom_court', 'sous_titre', 'favicon_url', 'couleur_accent'];

export function ApparenceEtablissement({ clientId, etablissementId }) {
  const { api } = useEspace();
  const { donnees, chargement, erreur, recharger } = useDonnees(() => api.rpc('editeur_identite_client', { p_client_id: clientId }), [clientId]);
  if (chargement && !donnees) return <Squelette lignes={5} />;
  const etab = donnees?.etablissements.find((e) => e.id === etablissementId);
  if (!etab) return <Erreur message={erreur || 'Établissement introuvable'} />;
  const heritage = { ...versValeurs(donnees.plateforme, CHAMPS_MARQUE), ...sansVide(versValeurs(donnees.client, CHAMPS_MARQUE)) };
  return <FormulaireEtablissement key={JSON.stringify(etab.surcharge)} etab={etab} heritage={heritage} recharger={recharger} />;
}

function FormulaireEtablissement({ etab, heritage, recharger }) {
  const { api, recharger: rechargerContexte } = useEspace();
  const [valeurs, setValeurs] = useState(() => versValeurs(etab.surcharge, CHAMPS_ETAB));
  const { erreur, setErreur, chargement, enregistrer } = useEnregistrer(
    (v) => api.rpc('enregistrer_apparence_etablissement', { p_etablissement_id: etab.id, p: v }),
    async () => { await recharger(); await rechargerContexte(); },
  );
  return (
    <form className="carte formulaire" onSubmit={(e) => { e.preventDefault(); enregistrer(valeurs); }}>
      <h2>Apparence de l’établissement</h2>
      <p className="texte-doux">À utiliser seulement si cet établissement doit se distinguer des autres du même client. Vide = identité du client. Le logo et les informations des reçus se règlent dans ses Paramètres.</p>
      <ChampsApparence valeurs={valeurs} onChange={setValeurs} heritage={heritage} logo={false} onErreur={setErreur} />
      <Erreur message={erreur} />
      <div className="actions">
        <Bouton type="button" onClick={() => { const vide = versValeurs({}, CHAMPS_ETAB); setValeurs(vide); enregistrer(vide); }}>Hériter du client</Bouton>
        <Bouton type="submit" variante="principal" chargement={chargement}>Enregistrer</Bouton>
      </div>
    </form>
  );
}
