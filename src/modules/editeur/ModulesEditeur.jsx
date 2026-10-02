// Catalogue de la plateforme : Solutions, Modules, Catégories, identité de la plateforme.
// Tout se règle ici sans toucher au code. Un module, lui, se programme dans le code (SOP 02) :
// l'écran ne peut ni en créer un, ni déclarer « Disponible » un module qui n'est pas programmé (la base refuse).
import React, { useState } from 'react';
import { useDonnees, useEspace } from '../../noyau/espace.jsx';
import { ROLES, STATUTS_MODULE } from '../../noyau/format.js';
import { lireParametres } from '../../noyau/routes.js';
import { Badge, Bouton, Champ, DataTable, Erreur, Icone, Modale, NOMS_ICONES, PageHeader, Section, Squelette, Tabs } from '../../ui/composants.jsx';
import { IdentitePlateforme } from './ApparenceEditeur.jsx';

const NIVEAUX = [
  ['1. Catalogue', 'Le module existe et il est programmé (il se crée dans le code, jamais par écran).'],
  ['2. Solution', 'La solution le propose.'],
  ['3. Offre', 'Une offre commerciale l’inclut.'],
  ['4. Licence', 'La licence de l’établissement l’accorde (offre ou module vendu en plus).'],
  ['5. Activation', 'Le module est activé dans l’établissement.'],
  ['6. Permissions', 'Le rôle (ou un ajustement) donne le droit à la personne.'],
];
const STATUTS_SOLUTION = { active: ['En service', 'vert'], en_preparation: ['En développement', 'attention'], future: ['Prévue', 'neutre'], retiree: ['Retirée', 'neutre'] };
const CAPACITES = { vente: 'vente', stock: 'stock', caisse: 'caisse', transfert: 'transfert' };

function BadgeStatut({ statut, table = STATUTS_MODULE }) {
  const [texte, ton] = table[statut] ?? [statut, 'neutre'];
  return <Badge ton={ton}>{texte}</Badge>;
}

function ChoixIcone({ valeur, onChange }) {
  return (
    <span className="actions-gauche">
      <Icone nom={valeur} />
      <select value={valeur} onChange={(e) => onChange(e.target.value)}>
        {NOMS_ICONES.map((n) => <option key={n} value={n}>{n}</option>)}
      </select>
    </span>
  );
}

function FicheModule({ module, catalogue, onFermer, onEnregistre }) {
  const { api, roleEditeur } = useEspace();
  const superAdmin = roleEditeur === 'super_admin';
  const [valeurs, setValeurs] = useState({
    nom: module.nom, description: module.description ?? '', categorie: module.categorie ?? '', version: module.version ?? '',
    statut: module.statut, icone: module.icone ?? 'modules', documentation: module.documentation ?? '',
  });
  const [erreur, setErreur] = useState('');
  const [chargement, setChargement] = useState(false);
  const changer = (c) => (e) => setValeurs((v) => ({ ...v, [c]: e.target.value }));
  const nomModule = (id) => catalogue.modules.find((m) => m.id === id)?.nom ?? id;
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
          <dt>Programmé</dt><dd>{module.programme ? 'Oui : écrans, droits et tests existent' : 'Non : déclaré au catalogue seulement (aucun écran, aucun droit)'}</dd>
          <dt>Nature</dt><dd>{module.nature === 'socle' ? 'Socle (toujours présent)' : module.nature === 'transversal' ? 'Transversal (utile à plusieurs solutions)' : 'Métier'}</dd>
          <dt>Dépend de</dt><dd>{module.depend_de.map(nomModule).join(', ') || '—'}</dd>
          <dt>Requis par</dt><dd>{module.requis_par.map(nomModule).join(', ') || '—'}</dd>
          <dt>Solutions</dt><dd>{module.solutions.map((s) => s.nom).join(', ') || '—'}</dd>
          <dt>Offres</dt><dd>{module.offres.map((o) => o.nom).join(', ') || (module.nature === 'socle' ? 'toutes (socle)' : '—')}</dd>
          <dt>Capacités Hub</dt><dd>{module.capacites_hub?.map((c) => CAPACITES[c] ?? c).join(', ') || '—'}</dd>
          <dt>Réglages</dt><dd>{module.parametres?.map((p) => `${p.libelle ?? p.cle} (${p.type})`).join(', ') || '—'}</dd>
          <dt>Établissements</dt><dd>{module.etablissements_actifs} actif(s), dont {module.etablissements_accordes} accordé(s) en plus de l’offre</dd>
          <dt>Utilisateurs</dt><dd>{module.utilisateurs} personne(s) ont au moins un droit sur ce module</dd>
          <dt>Documentation</dt><dd>{module.documentation || '—'}</dd>
        </dl>
        {module.permissions.length > 0 && (
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
        )}
        {superAdmin ? (
          <form className="formulaire" onSubmit={enregistrer}>
            <h2>Fiche du module</h2>
            <div className="grille-champs">
              <Champ libelle="Nom affiché"><input value={valeurs.nom} onChange={changer('nom')} required /></Champ>
              <Champ libelle="Catégorie">
                <select value={valeurs.categorie} onChange={changer('categorie')}>
                  {catalogue.categories.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
                </select>
              </Champ>
              <Champ libelle="Version"><input value={valeurs.version} onChange={changer('version')} /></Champ>
              <Champ libelle="Statut" aide={module.programme ? undefined : 'Disponible et Bêta exigent un module programmé.'}>
                <select value={valeurs.statut} onChange={changer('statut')}>
                  {Object.entries(STATUTS_MODULE).map(([id, [l]]) => (
                    <option key={id} value={id} disabled={!module.programme && ['actif', 'beta'].includes(id)}>{l}</option>
                  ))}
                </select>
              </Champ>
              <Champ libelle="Icône"><ChoixIcone valeur={valeurs.icone} onChange={(icone) => setValeurs((v) => ({ ...v, icone }))} /></Champ>
            </div>
            <Champ libelle="Description"><textarea rows={2} value={valeurs.description} onChange={changer('description')} /></Champ>
            <Champ libelle="Documentation" aide="Chemin de la procédure ou courte note."><input value={valeurs.documentation} onChange={changer('documentation')} /></Champ>
            {module.nature !== 'socle' && (
              <Champ libelle="Proposé par les solutions">
                <div className="actions-gauche">
                  {catalogue.solutions.filter((s) => s.statut !== 'retiree').map((s) => {
                    const propose = module.solutions.some((x) => x.id === s.id);
                    return (
                      <label key={s.id} className="case">
                        <input type="checkbox" checked={propose} onChange={() => proposer(s.id, !propose)} /> {s.nom}
                      </label>
                    );
                  })}
                </div>
              </Champ>
            )}
            <Erreur message={erreur} />
            <div className="actions"><Bouton type="button" onClick={onFermer}>Fermer</Bouton><Bouton type="submit" variante="principal" chargement={chargement}>Enregistrer</Bouton></div>
          </form>
        ) : <p className="texte-doux">Consultation : seule la direction (Super Admin) modifie le catalogue.</p>}
      </div>
    </Modale>
  );
}

function OngletModules({ catalogue, recharger }) {
  const { notifier } = useEspace();
  const [choisi, setChoisi] = useState(null);
  const modules = catalogue.modules;
  const nomCategorie = (id) => catalogue.categories.find((c) => c.id === id)?.nom ?? id;
  const module = modules.find((m) => m.id === choisi);
  return (
    <div className="pile">
      <Section titre="Les six niveaux d’accès" sousTitre="Un écran n’apparaît que si les six niveaux sont réunis. La base le vérifie à chaque opération.">
        <ol className="niveaux">
          {NIVEAUX.map(([t, d]) => <li key={t}><strong>{t}</strong><span className="texte-doux">{d}</span></li>)}
        </ol>
      </Section>
      <DataTable
        lignes={modules}
        rechercher={(m) => `${m.nom} ${m.id} ${nomCategorie(m.categorie)}`}
        placeholder="Module"
        triInitial={{ id: 'ordre', sens: 'asc' }}
        onLigne={(m) => setChoisi(m.id)}
        parPage={50}
        filtres={[
          { id: 'categorie', libelle: 'Catégorie', options: catalogue.categories.filter((c) => modules.some((m) => m.categorie === c.id)).map((c) => [c.id, c.nom]), appliquer: (m, v) => m.categorie === v },
          { id: 'statut', libelle: 'Statut', options: Object.entries(STATUTS_MODULE).map(([id, [l]]) => [id, l]), appliquer: (m, v) => m.statut === v },
        ]}
        colonnes={[
          { id: 'ordre', libelle: 'Module', tri: (m) => m.ordre, rendu: (m) => <span className="cellule-personne"><Icone nom={m.icone} /><span><strong>{m.nom}</strong><small className="texte-doux bloc">{m.id} · v{m.version}</small></span></span> },
          { id: 'categorie', libelle: 'Catégorie', tri: (m) => nomCategorie(m.categorie), rendu: (m) => nomCategorie(m.categorie) },
          { id: 'solutions', libelle: 'Solutions', rendu: (m) => m.solutions.map((s) => s.nom).join(', ') || '—' },
          { id: 'dependances', libelle: 'Dépend de', rendu: (m) => m.depend_de.length || '—' },
          { id: 'actifs', libelle: 'Établissements', classe: 'nombre', tri: (m) => m.etablissements_actifs, rendu: (m) => m.etablissements_actifs },
          { id: 'statut', libelle: 'Statut', tri: (m) => m.statut, rendu: (m) => <>{m.nature === 'socle' && <Badge>Socle</Badge>} <BadgeStatut statut={m.statut} /></> },
        ]}
      />
      {module && (
        <FicheModule
          key={module.modifie_le + module.solutions.length}
          module={module}
          catalogue={catalogue}
          onFermer={() => setChoisi(null)}
          onEnregistre={(fermer = true) => { if (fermer) setChoisi(null); notifier('Catalogue mis à jour'); recharger(); }}
        />
      )}
    </div>
  );
}

function FicheSolution({ solution, catalogue, onFermer, onEnregistre }) {
  const { api, roleEditeur } = useEspace();
  const nouvelle = !solution;
  const [valeurs, setValeurs] = useState({
    id: solution?.id ?? '', nom: solution?.nom ?? '', description: solution?.description ?? '', statut: solution?.statut ?? 'future',
    icone: solution?.icone ?? 'modules', ordre: solution?.ordre ?? 99,
  });
  const [erreur, setErreur] = useState('');
  const changer = (c) => (e) => setValeurs((v) => ({ ...v, [c]: e.target.value }));
  const superAdmin = roleEditeur === 'super_admin';
  const proposes = new Set((solution?.modules ?? []).map((m) => m.id));
  const enregistrer = async (e) => {
    e.preventDefault();
    setErreur('');
    try {
      await api.rpc('enregistrer_solution', { p: { ...valeurs, ordre: Number(valeurs.ordre) || 99 } });
      onEnregistre();
    } catch (err) {
      setErreur(err.message);
    }
  };
  const proposer = async (moduleId, propose) => {
    setErreur('');
    try {
      await api.rpc('definir_proposition_module', { p_solution_id: solution.id, p_module_id: moduleId, p_propose: propose, p_par_defaut: propose });
      onEnregistre(false);
    } catch (err) {
      setErreur(err.message);
    }
  };
  return (
    <Modale titre={nouvelle ? 'Nouvelle solution' : `${solution.nom} · ${solution.id}`} onFermer={onFermer} large>
      <form className="formulaire" onSubmit={enregistrer}>
        <p className="texte-doux">Une solution est une configuration de modules : la créer ne crée aucun écran. Elle ne peut être « En service » qu’avec au moins un module métier disponible.</p>
        <fieldset disabled={!superAdmin}>
          <div className="grille-champs">
            <Champ libelle="Identifiant technique" aide="Minuscules, chiffres, _ ; ne change jamais."><input value={valeurs.id} onChange={changer('id')} required disabled={!nouvelle} /></Champ>
            <Champ libelle="Nom affiché"><input value={valeurs.nom} onChange={changer('nom')} required /></Champ>
            <Champ libelle="Statut">
              <select value={valeurs.statut} onChange={changer('statut')}>
                {Object.entries(STATUTS_SOLUTION).map(([id, [l]]) => <option key={id} value={id}>{l}</option>)}
              </select>
            </Champ>
            <Champ libelle="Ordre"><input type="number" value={valeurs.ordre} onChange={changer('ordre')} /></Champ>
            <Champ libelle="Icône"><ChoixIcone valeur={valeurs.icone} onChange={(icone) => setValeurs((v) => ({ ...v, icone }))} /></Champ>
          </div>
          <Champ libelle="Description"><textarea rows={2} value={valeurs.description} onChange={changer('description')} /></Champ>
        </fieldset>
        {!nouvelle && (
          <Champ libelle="Modules proposés" aide="Les modules communs (articles, stock, ventes…) sont réutilisés, jamais dupliqués.">
            <div className="grille-cases">
              {catalogue.modules.filter((m) => m.nature !== 'socle' && m.statut !== 'retire').map((m) => (
                <label key={m.id} className="case">
                  <input type="checkbox" disabled={!superAdmin} checked={proposes.has(m.id)} onChange={() => proposer(m.id, !proposes.has(m.id))} />
                  {m.nom} <BadgeStatut statut={m.statut} />
                </label>
              ))}
            </div>
          </Champ>
        )}
        <Erreur message={erreur} />
        <div className="actions"><Bouton type="button" onClick={onFermer}>Fermer</Bouton>{superAdmin && <Bouton type="submit" variante="principal">Enregistrer</Bouton>}</div>
      </form>
    </Modale>
  );
}

function OngletSolutions({ catalogue, recharger }) {
  const { roleEditeur, notifier } = useEspace();
  const [choisie, setChoisie] = useState(null);
  return (
    <div className="pile">
      {roleEditeur === 'super_admin' && <div className="actions-gauche"><Bouton variante="principal" icone="plus" onClick={() => setChoisie('nouvelle')}>Nouvelle solution</Bouton></div>}
      <DataTable
        lignes={catalogue.solutions}
        rechercher={(s) => `${s.nom} ${s.id}`}
        placeholder="Solution"
        onLigne={(s) => setChoisie(s.id)}
        colonnes={[
          { id: 'nom', libelle: 'Solution', rendu: (s) => <span className="cellule-personne"><Icone nom={s.icone} /><span><strong>{s.nom}</strong><small className="texte-doux bloc">{s.id}</small></span></span> },
          { id: 'modules', libelle: 'Modules', classe: 'nombre', rendu: (s) => s.modules.length },
          { id: 'offres', libelle: 'Offres', classe: 'nombre', rendu: (s) => s.offres },
          { id: 'etablissements', libelle: 'Établissements', classe: 'nombre', rendu: (s) => s.etablissements },
          { id: 'statut', libelle: 'Statut', rendu: (s) => <BadgeStatut statut={s.statut} table={STATUTS_SOLUTION} /> },
        ]}
      />
      {choisie && (
        <FicheSolution
          key={choisie + JSON.stringify(catalogue.solutions.find((s) => s.id === choisie)?.modules ?? [])}
          solution={catalogue.solutions.find((s) => s.id === choisie)}
          catalogue={catalogue}
          onFermer={() => setChoisie(null)}
          onEnregistre={(fermer = true) => { if (fermer) setChoisie(null); notifier('Solution enregistrée'); recharger(); }}
        />
      )}
    </div>
  );
}

function OngletCategories({ catalogue, recharger }) {
  const { api, roleEditeur, notifier } = useEspace();
  const [valeurs, setValeurs] = useState({ id: '', nom: '', description: '', icone: 'modules', ordre: 999 });
  const [erreur, setErreur] = useState('');
  const superAdmin = roleEditeur === 'super_admin';
  const enregistrer = async (e) => {
    e.preventDefault();
    setErreur('');
    try {
      await api.rpc('enregistrer_categorie_module', { p: { ...valeurs, ordre: Number(valeurs.ordre) || 999 } });
      notifier('Catégorie enregistrée');
      setValeurs({ id: '', nom: '', description: '', icone: 'modules', ordre: 999 });
      recharger();
    } catch (err) {
      setErreur(err.message);
    }
  };
  return (
    <div className="deux-colonnes">
      <Section titre="Catégories">
        <div className="liste-simple">
          {catalogue.categories.map((c) => (
            <button type="button" key={c.id} className="liste-ligne cliquable" disabled={!superAdmin} onClick={() => setValeurs({ ...c, description: c.description ?? '' })}>
              <Icone nom={c.icone} />
              <span><strong>{c.nom}</strong><small className="texte-doux bloc">{c.description}</small></span>
              <span className="texte-doux">{catalogue.modules.filter((m) => m.categorie === c.id).length} module(s)</span>
            </button>
          ))}
        </div>
      </Section>
      {superAdmin && (
        <form className="carte formulaire" onSubmit={enregistrer}>
          <h2>{catalogue.categories.some((c) => c.id === valeurs.id) ? 'Modifier la catégorie' : 'Nouvelle catégorie'}</h2>
          <div className="grille-champs">
            <Champ libelle="Identifiant"><input value={valeurs.id} onChange={(e) => setValeurs((v) => ({ ...v, id: e.target.value }))} required /></Champ>
            <Champ libelle="Nom"><input value={valeurs.nom} onChange={(e) => setValeurs((v) => ({ ...v, nom: e.target.value }))} required /></Champ>
            <Champ libelle="Ordre"><input type="number" value={valeurs.ordre} onChange={(e) => setValeurs((v) => ({ ...v, ordre: e.target.value }))} /></Champ>
            <Champ libelle="Icône"><ChoixIcone valeur={valeurs.icone} onChange={(icone) => setValeurs((v) => ({ ...v, icone }))} /></Champ>
          </div>
          <Champ libelle="Description"><input value={valeurs.description} onChange={(e) => setValeurs((v) => ({ ...v, description: e.target.value }))} /></Champ>
          <Erreur message={erreur} />
          <div className="actions"><Bouton type="submit" variante="principal">Enregistrer</Bouton></div>
        </form>
      )}
    </div>
  );
}

export default function ModulesEditeur() {
  const { api } = useEspace();
  const { donnees: catalogue, chargement, erreur, recharger } = useDonnees(() => api.rpc('editeur_catalogue'), []);
  const demande = lireParametres().get('onglet');
  const [onglet, setOnglet] = useState(['modules', 'solutions', 'categories', 'identite'].includes(demande) ? demande : 'modules');
  const compte = (statuts) => catalogue?.modules.filter((m) => statuts.includes(m.statut)).length ?? 0;
  return (
    <div className="page">
      <PageHeader
        fil={[{ libelle: 'Agence Elite', href: '#/editeur' }, { libelle: 'Catalogue' }]}
        titre="Catalogue"
        sousTitre={catalogue ? `${compte(['actif'])} module(s) disponible(s), ${compte(['beta'])} en bêta, ${compte(['en_preparation', 'futur'])} prévu(s) ou en développement. Aucun code ne se modifie ici.` : 'Solutions, modules et catégories.'}
      />
      <Tabs
        onglets={[['modules', 'Modules', catalogue?.modules.length], ['solutions', 'Solutions', catalogue?.solutions.length], ['categories', 'Catégories'], ['identite', 'Identité de la plateforme']]}
        actif={onglet}
        onChange={setOnglet}
      />
      <Erreur message={erreur} />
      {chargement && !catalogue && <Squelette lignes={8} />}
      {catalogue && onglet === 'modules' && <OngletModules catalogue={catalogue} recharger={recharger} />}
      {catalogue && onglet === 'solutions' && <OngletSolutions catalogue={catalogue} recharger={recharger} />}
      {catalogue && onglet === 'categories' && <OngletCategories catalogue={catalogue} recharger={recharger} />}
      {onglet === 'identite' && <IdentitePlateforme />}
    </div>
  );
}
