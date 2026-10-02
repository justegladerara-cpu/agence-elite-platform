import React, { useState } from 'react';
import { useEspace } from '../../noyau/espace.jsx';
import { dateLocale } from '../../noyau/format.js';
import { Bouton, Champ, Erreur, Modale } from '../../ui/composants.jsx';
import { PRIORITES } from './commun.js';

export function ModaleProjet({ projet, contacts, membres, onFermer, onFait }) {
  const { api, etablissement } = useEspace();
  const [v, setV] = useState(() => ({
    nom: '', description: '', contact_id: '', responsable_id: '', statut: 'en_cours', date_debut: dateLocale(), date_fin_prevue: '',
    budget: '', heures_prevues: '', taux_horaire: '',
    ...(projet ? Object.fromEntries(Object.entries(projet).map(([k, x]) => [k, x == null ? '' : String(x)])) : {}),
  }));
  const [erreur, setErreur] = useState('');
  const changer = (c) => (e) => setV({ ...v, [c]: e.target.value });
  const valider = async (e) => {
    e.preventDefault();
    try {
      const champs = ['nom', 'description', 'contact_id', 'responsable_id', 'statut', 'date_debut', 'date_fin_prevue', 'budget', 'heures_prevues', 'taux_horaire'];
      const id = await api.rpc('enregistrer_projet', { p_etablissement_id: etablissement.id, p: { id: projet?.id, ...Object.fromEntries(champs.map((k) => [k, v[k]])) } });
      onFait(id);
    } catch (err) {
      setErreur(err.message);
    }
  };
  return (
    <Modale titre={projet ? `Modifier ${projet.numero}` : 'Nouveau projet'} onFermer={onFermer} large>
      <form className="formulaire" onSubmit={valider}>
        <Champ libelle="Nom du projet"><input value={v.nom} onChange={changer('nom')} required maxLength={160} autoFocus placeholder="Ex. Site web de l’hôtel" /></Champ>
        <div className="grille-champs">
          <Champ libelle="Client">
            <select value={v.contact_id} onChange={changer('contact_id')}>
              <option value="">— Projet interne</option>
              {contacts.map((c) => <option key={c.id} value={c.id}>{c.societe || c.nom}</option>)}
            </select>
          </Champ>
          <Champ libelle="Pilote">
            <select value={v.responsable_id} onChange={changer('responsable_id')}>
              <option value="">Moi</option>
              {membres.filter((m) => !m.moi).map((m) => <option key={m.user_id} value={m.user_id}>{m.nom}</option>)}
            </select>
          </Champ>
          <Champ libelle="Statut">
            <select value={v.statut} onChange={changer('statut')}>
              <option value="a_venir">À venir</option><option value="en_cours">En cours</option><option value="en_pause">En pause</option>
            </select>
          </Champ>
          <Champ libelle="Début"><input type="date" value={v.date_debut} onChange={changer('date_debut')} /></Champ>
          <Champ libelle="Fin prévue"><input type="date" value={v.date_fin_prevue} min={v.date_debut} onChange={changer('date_fin_prevue')} /></Champ>
          <Champ libelle="Budget"><input type="number" min="0" step="any" value={v.budget} onChange={changer('budget')} /></Champ>
          <Champ libelle="Heures prévues"><input type="number" min="0" step="any" value={v.heures_prevues} onChange={changer('heures_prevues')} /></Champ>
          <Champ libelle="Taux horaire facturé" aide="Vide : celui des paramètres."><input type="number" min="0" step="any" value={v.taux_horaire} onChange={changer('taux_horaire')} /></Champ>
        </div>
        <Champ libelle="Description"><textarea rows={3} value={v.description} onChange={changer('description')} maxLength={4000} /></Champ>
        <Erreur message={erreur} />
        <div className="actions">
          <Bouton type="button" onClick={onFermer}>Annuler</Bouton>
          <Bouton type="submit" variante="principal">Enregistrer</Bouton>
        </div>
      </form>
    </Modale>
  );
}

export function ModaleTache({ projetId, tache, membres, onFermer, onFait }) {
  const { api, etablissement, peut } = useEspace();
  const [v, setV] = useState(() => ({
    titre: tache?.titre ?? '', description: tache?.description ?? '', priorite: tache?.priorite ?? 'normale',
    assigne_a: tache?.assigne_a ?? '', echeance: tache?.echeance ?? '', estimation_heures: tache?.estimation_heures ?? '',
  }));
  const [erreur, setErreur] = useState('');
  const changer = (c) => (e) => setV({ ...v, [c]: e.target.value });
  const gerer = peut('projets.gerer');
  const valider = async (e) => {
    e.preventDefault();
    try {
      const p = { ...v, id: tache?.id, projet_id: projetId };
      if (!gerer) delete p.assigne_a;
      await api.rpc('enregistrer_tache_projet', { p_etablissement_id: etablissement.id, p: { ...p, assigne_a: gerer ? v.assigne_a || null : undefined } });
      onFait();
    } catch (err) {
      setErreur(err.message);
    }
  };
  return (
    <Modale titre={tache ? 'Modifier la tâche' : 'Nouvelle tâche'} onFermer={onFermer}>
      <form className="formulaire" onSubmit={valider}>
        <Champ libelle="Tâche"><input value={v.titre} onChange={changer('titre')} required maxLength={200} autoFocus /></Champ>
        <div className="grille-champs">
          {gerer && (
            <Champ libelle="Assignée à">
              <select value={v.assigne_a} onChange={changer('assigne_a')}>
                <option value="">Personne</option>
                {membres.map((m) => <option key={m.user_id} value={m.user_id}>{m.nom}</option>)}
              </select>
            </Champ>
          )}
          <Champ libelle="Priorité">
            <select value={v.priorite} onChange={changer('priorite')}>
              {Object.entries(PRIORITES).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </Champ>
          <Champ libelle="Échéance"><input type="date" value={v.echeance} onChange={changer('echeance')} /></Champ>
          <Champ libelle="Estimation (heures)"><input type="number" min="0" step="any" value={v.estimation_heures} onChange={changer('estimation_heures')} /></Champ>
        </div>
        <Champ libelle="Détails"><textarea rows={3} value={v.description} onChange={changer('description')} maxLength={4000} /></Champ>
        <Erreur message={erreur} />
        <div className="actions">
          <Bouton type="button" onClick={onFermer}>Annuler</Bouton>
          <Bouton type="submit" variante="principal">Enregistrer</Bouton>
        </div>
      </form>
    </Modale>
  );
}

export function ModaleTemps({ projets, taches, membres, projetId, tacheId, onFermer, onFait }) {
  const { api, etablissement, peut } = useEspace();
  const [v, setV] = useState({ projet_id: projetId ?? '', tache_id: tacheId ?? '', user_id: '', date_travail: dateLocale(), heures: '1', minutes: '0', description: '', facturable: true });
  const [erreur, setErreur] = useState('');
  const changer = (c) => (e) => setV({ ...v, [c]: e.target.type === 'checkbox' ? e.target.checked : e.target.value, ...(c === 'projet_id' ? { tache_id: '' } : {}) });
  const valider = async (e) => {
    e.preventDefault();
    try {
      await api.rpc('saisir_temps_projet', {
        p_etablissement_id: etablissement.id,
        p: {
          projet_id: v.projet_id, tache_id: v.tache_id || null, user_id: v.user_id || null, date_travail: v.date_travail,
          minutes: Math.round((Number(v.heures) || 0) * 60 + (Number(v.minutes) || 0)), description: v.description, facturable: v.facturable,
        },
      });
      onFait();
    } catch (err) {
      setErreur(err.message);
    }
  };
  const tachesProjet = taches.filter((t) => t.projet_id === v.projet_id && t.statut !== 'annulee');
  return (
    <Modale titre="Saisir du temps" onFermer={onFermer}>
      <form className="formulaire" onSubmit={valider}>
        {!projetId && (
          <Champ libelle="Projet">
            <select value={v.projet_id} onChange={changer('projet_id')} required>
              <option value="">— Choisir</option>
              {projets.filter((p) => p.statut !== 'annule').map((p) => <option key={p.id} value={p.id}>{p.numero} · {p.nom}</option>)}
            </select>
          </Champ>
        )}
        <div className="grille-champs">
          <Champ libelle="Tâche">
            <select value={v.tache_id} onChange={changer('tache_id')}>
              <option value="">— Sans tâche</option>
              {tachesProjet.map((t) => <option key={t.id} value={t.id}>{t.titre}</option>)}
            </select>
          </Champ>
          <Champ libelle="Jour"><input type="date" value={v.date_travail} max={dateLocale()} onChange={changer('date_travail')} required /></Champ>
          <Champ libelle="Heures"><input type="number" min="0" max="24" step="1" value={v.heures} onChange={changer('heures')} /></Champ>
          <Champ libelle="Minutes"><input type="number" min="0" max="59" step="5" value={v.minutes} onChange={changer('minutes')} /></Champ>
          {peut('projets.gerer') && membres.length > 1 && (
            <Champ libelle="Pour">
              <select value={v.user_id} onChange={changer('user_id')}>
                <option value="">Moi</option>
                {membres.filter((m) => !m.moi).map((m) => <option key={m.user_id} value={m.user_id}>{m.nom}</option>)}
              </select>
            </Champ>
          )}
        </div>
        <Champ libelle="Ce qui a été fait"><input value={v.description} onChange={changer('description')} maxLength={500} /></Champ>
        <label className="case"><input type="checkbox" checked={v.facturable} onChange={changer('facturable')} /> Facturable au client</label>
        <Erreur message={erreur} />
        <div className="actions">
          <Bouton type="button" onClick={onFermer}>Annuler</Bouton>
          <Bouton type="submit" variante="principal" icone="horloge">Enregistrer</Bouton>
        </div>
      </form>
    </Modale>
  );
}
