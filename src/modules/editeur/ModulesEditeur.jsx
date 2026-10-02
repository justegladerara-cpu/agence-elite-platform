import React, { useState } from 'react';
import { useDonnees, useEspace } from '../../noyau/espace.jsx';
import { ROLES } from '../../noyau/format.js';
import { Badge, Bouton, Champ, DataTable, Erreur, Modale, PageHeader, Section, StatusBadge } from '../../ui/composants.jsx';

const NIVEAUX = [
  ['1. Catalogue', 'Le module existe dans la plateforme (il se crée dans le code, jamais par écran).'],
  ['2. Solution', 'La solution le propose (Commerce, Hôtel, Restaurant).'],
  ['3. Offre', 'Une offre commerciale l’inclut.'],
  ['4. Licence', 'La licence de l’établissement l’accorde (offre ou module vendu en plus).'],
  ['5. Activation', 'Le module est activé dans l’établissement.'],
  ['6. Permissions', 'Le rôle (ou un ajustement) donne le droit à la personne.'],
];

function FicheModule({ module, onFermer, onEnregistre }) {
  const { api, roleEditeur } = useEspace();
  const superAdmin = roleEditeur === 'super_admin';
  const [valeurs, setValeurs] = useState({ nom: module.nom, description: module.description ?? '', categorie: module.categorie ?? '', version: module.version ?? '', statut: module.statut });
  const [erreur, setErreur] = useState('');
  const [chargement, setChargement] = useState(false);
  const changer = (c) => (e) => setValeurs((v) => ({ ...v, [c]: e.target.value }));
  const enregistrer = async (e) => {
    e.preventDefault();
    setChargement(true);
    setErreur('');
    try {
      await api.rpc('enregistrer_module', { p_module_id: module.id, p_module: valeurs });
      onEnregistre();
    } catch (err) {
      setErreur(err.message);
      setChargement(false);
    }
  };
  const proposer = async (solution, propose) => {
    setErreur('');
    try {
      await api.rpc('definir_proposition_module', { p_solution_id: solution, p_module_id: module.id, p_propose: propose, p_par_defaut: propose });
      onEnregistre(false);
    } catch (err) {
      setErreur(err.message);
    }
  };
  return (
    <Modale titre={`${module.nom} · ${module.id}`} onFermer={onFermer} large>
      <div className="pile">
        <dl className="details">
          <dt>Nature</dt><dd>{module.nature === 'socle' ? 'Socle (toujours présent)' : 'Métier'}</dd>
          <dt>Dépend de</dt><dd>{module.depend_de.join(', ') || '—'}</dd>
          <dt>Requis par</dt><dd>{module.requis_par.join(', ') || '—'}</dd>
          <dt>Solutions</dt><dd>{module.solutions.map((s) => s.nom).join(', ') || '—'}</dd>
          <dt>Offres</dt><dd>{module.offres.map((o) => o.nom).join(', ') || (module.nature === 'socle' ? 'toutes (socle)' : '—')}</dd>
          <dt>Établissements</dt><dd>{module.etablissements_actifs} actif(s), dont {module.etablissements_accordes} accordé(s) en plus de l’offre</dd>
          <dt>Utilisateurs</dt><dd>{module.utilisateurs} personne(s) ont au moins un droit sur ce module</dd>
        </dl>
        <Section titre="Permissions et rôles">
          <div className="liste-simple">
            {module.permissions.map((p) => (
              <div key={p.id} className="liste-ligne">
                <span><strong>{p.description || p.id}</strong><small className="texte-doux bloc">{p.id}</small></span>
                <span className="texte-doux">{p.roles.map((r) => ROLES[r] ?? r).join(', ') || 'aucun rôle'}</span>
              </div>
            ))}
          </div>
        </Section>
        {superAdmin ? (
          <form className="formulaire" onSubmit={enregistrer}>
            <h2>Fiche du module</h2>
            <div className="grille-champs">
              <Champ libelle="Nom affiché"><input value={valeurs.nom} onChange={changer('nom')} required /></Champ>
              <Champ libelle="Catégorie"><input value={valeurs.categorie} onChange={changer('categorie')} /></Champ>
              <Champ libelle="Version"><input value={valeurs.version} onChange={changer('version')} /></Champ>
              <Champ libelle="Statut">
                <select value={valeurs.statut} onChange={changer('statut')}>
                  <option value="actif">Actif</option><option value="en_preparation">En préparation</option><option value="futur">Futur</option><option value="retire">Retiré</option>
                </select>
              </Champ>
            </div>
            <Champ libelle="Description"><textarea rows={2} value={valeurs.description} onChange={changer('description')} /></Champ>
            {module.nature !== 'socle' && (
              <div className="actions-gauche">
                {['commerce', 'restaurant', 'hotel'].map((s) => {
                  const propose = module.solutions.some((x) => x.id === s);
                  return <Bouton key={s} type="button" onClick={() => proposer(s, !propose)}>{propose ? `Retirer de ${s}` : `Proposer dans ${s}`}</Bouton>;
                })}
              </div>
            )}
            <Erreur message={erreur} />
            <div className="actions"><Bouton type="button" onClick={onFermer}>Fermer</Bouton><Bouton type="submit" variante="principal" chargement={chargement}>Enregistrer</Bouton></div>
          </form>
        ) : <p className="texte-doux">Consultation : seule la direction (Super Admin) modifie le catalogue.</p>}
      </div>
    </Modale>
  );
}

export default function ModulesEditeur() {
  const { api, notifier } = useEspace();
  const { donnees: modules, chargement, erreur, recharger } = useDonnees(() => api.rpc('editeur_modules'), []);
  const [choisi, setChoisi] = useState(null);
  const categories = [...new Set((modules ?? []).map((m) => m.categorie).filter(Boolean))];
  return (
    <div className="page">
      <PageHeader
        fil={[{ libelle: 'Agence Elite', href: '#/editeur' }, { libelle: 'Centre des modules' }]}
        titre="Centre des modules"
        sousTitre="Ce que contient la plateforme, et qui y a accès. Aucun code ne se modifie ici."
      />
      <Section titre="Les six niveaux d’accès" sousTitre="Un écran n’apparaît que si les six niveaux sont réunis. La base le vérifie à chaque opération.">
        <ol className="niveaux">
          {NIVEAUX.map(([t, d]) => <li key={t}><strong>{t}</strong><span className="texte-doux">{d}</span></li>)}
        </ol>
      </Section>
      <Erreur message={erreur} />
      <DataTable
        chargement={chargement}
        lignes={modules}
        rechercher={(m) => `${m.nom} ${m.id} ${m.categorie ?? ''}`}
        placeholder="Module"
        triInitial={{ id: 'ordre', sens: 'asc' }}
        onLigne={(m) => setChoisi(m.id)}
        parPage={50}
        filtres={[
          { id: 'categorie', libelle: 'Catégorie', options: categories.map((c) => [c, c]), appliquer: (m, v) => m.categorie === v },
          { id: 'nature', libelle: 'Nature', options: [['socle', 'Socle'], ['metier', 'Métier']], appliquer: (m, v) => m.nature === v },
        ]}
        colonnes={[
          { id: 'ordre', libelle: 'Module', tri: (m) => m.ordre, rendu: (m) => <><strong>{m.nom}</strong><small className="texte-doux bloc">{m.id} · v{m.version}</small></> },
          { id: 'categorie', libelle: 'Catégorie', tri: (m) => m.categorie, rendu: (m) => m.categorie ?? '—' },
          { id: 'solutions', libelle: 'Solutions', rendu: (m) => m.solutions.map((s) => s.nom).join(', ') || '—' },
          { id: 'offres', libelle: 'Offres', classe: 'nombre', tri: (m) => m.offres.length, rendu: (m) => (m.nature === 'socle' ? 'toutes' : m.offres.length) },
          { id: 'actifs', libelle: 'Établissements', classe: 'nombre', tri: (m) => m.etablissements_actifs, rendu: (m) => m.etablissements_actifs },
          { id: 'permissions', libelle: 'Droits', classe: 'nombre', tri: (m) => m.permissions.length, rendu: (m) => m.permissions.length },
          { id: 'statut', libelle: 'Statut', tri: (m) => m.statut, rendu: (m) => <>{m.nature === 'socle' && <Badge>Socle</Badge>} <StatusBadge statut={m.statut} /></> },
        ]}
      />
      {choisi && modules?.some((m) => m.id === choisi) && (
        <FicheModule
          key={modules.find((m) => m.id === choisi).modifie_le}
          module={modules.find((m) => m.id === choisi)}
          onFermer={() => setChoisi(null)}
          onEnregistre={(fermer = true) => { if (fermer) setChoisi(null); notifier('Module mis à jour'); recharger(); }}
        />
      )}
    </div>
  );
}
