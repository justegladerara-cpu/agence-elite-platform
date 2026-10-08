import { useState } from 'react';
import { useEspace } from '../../noyau/espace.jsx';
import { Bouton, Champ, Erreur, Modale } from '../../ui/composants.jsx';
import { dateHeureLocale, SOURCES, TYPES_ACTIVITE, versIso } from './commun.js';

// Nouvelle opportunité (ou modification), avec création rapide d'un prospect.
export function ModaleOpportunite({ opportunite, contacts, etapes, equipe, onFermer, onFait }) {
  const { api, etablissement, peut } = useEspace();
  const [v, setV] = useState(() => ({
    titre: opportunite?.titre ?? '', contact_id: opportunite?.contact_id ?? '', etape_id: opportunite?.etape_id ?? '',
    montant: opportunite ? String(opportunite.montant) : '', cloture_prevue: opportunite?.cloture_prevue ?? '',
    source: opportunite?.source ?? '', responsable_id: opportunite?.responsable_id ?? '', notes: opportunite?.notes ?? '',
  }));
  const [nouveau, setNouveau] = useState({ actif: !contacts.length, nom: '', societe: '', telephone: '' });
  const [erreur, setErreur] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const changer = (c) => (e) => setV({ ...v, [c]: e.target.value });
  const valider = async (e) => {
    e.preventDefault();
    setEnvoi(true);
    setErreur('');
    try {
      let contact = v.contact_id;
      if (nouveau.actif) {
        contact = await api.rpc('enregistrer_contact', {
          p_etablissement_id: etablissement.id,
          p_contact: { nom: nouveau.nom, societe: nouveau.societe, telephone: nouveau.telephone, type: 'prospect', source: v.source || null },
        });
      }
      const id = await api.rpc('enregistrer_opportunite', {
        p_etablissement_id: etablissement.id,
        p: { ...v, id: opportunite?.id, contact_id: contact, montant: v.montant || 0, responsable_id: v.responsable_id || null, etape_id: v.etape_id || null },
      });
      onFait(id);
    } catch (err) {
      setErreur(err.message);
      setEnvoi(false);
    }
  };
  return (
    <Modale titre={opportunite ? `Modifier ${opportunite.numero}` : 'Nouvelle opportunité'} onFermer={onFermer} large>
      <form className="formulaire" onSubmit={valider}>
        <Champ libelle="Titre"><input value={v.titre} onChange={changer('titre')} required maxLength={160} placeholder="Ex. Logiciel de caisse pour la pharmacie" autoFocus /></Champ>
        {nouveau.actif ? (
          <div className="grille-champs">
            <Champ libelle="Nom du prospect"><input value={nouveau.nom} onChange={(e) => setNouveau({ ...nouveau, nom: e.target.value })} required /></Champ>
            <Champ libelle="Société"><input value={nouveau.societe} onChange={(e) => setNouveau({ ...nouveau, societe: e.target.value })} /></Champ>
            <Champ libelle="Téléphone"><input type="tel" value={nouveau.telephone} onChange={(e) => setNouveau({ ...nouveau, telephone: e.target.value })} /></Champ>
            {contacts.length > 0 && <button type="button" className="lien" onClick={() => setNouveau({ ...nouveau, actif: false })}>Choisir un contact existant</button>}
          </div>
        ) : (
          <Champ libelle="Prospect ou client">
            <select value={v.contact_id} onChange={changer('contact_id')} required>
              <option value="">— Choisir</option>
              {contacts.map((c) => <option key={c.id} value={c.id}>{c.societe ? `${c.societe} (${c.nom})` : c.nom}</option>)}
            </select>
            {peut('contacts.gerer') && <button type="button" className="lien" onClick={() => setNouveau({ ...nouveau, actif: true })}>+ Nouveau prospect</button>}
          </Champ>
        )}
        <div className="grille-champs">
          <Champ libelle="Montant estimé"><input type="number" min="0" step="any" inputMode="decimal" value={v.montant} onChange={changer('montant')} /></Champ>
          <Champ libelle="Étape">
            <select value={v.etape_id} onChange={changer('etape_id')}>
              {!opportunite && <option value="">Première étape</option>}
              {etapes.filter((e) => e.nature === 'ouverte' && e.actif).map((e) => <option key={e.id} value={e.id}>{e.nom} ({e.probabilite} %)</option>)}
            </select>
          </Champ>
          <Champ libelle="Signature prévue"><input type="date" value={v.cloture_prevue} onChange={changer('cloture_prevue')} /></Champ>
          <Champ libelle="Origine">
            <select value={v.source} onChange={changer('source')}>
              <option value="">— Non précisée</option>
              {Object.entries(SOURCES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </Champ>
          {peut('crm_pipeline.administrer') && equipe.length > 1 && (
            <Champ libelle="Suivie par">
              <select value={v.responsable_id} onChange={changer('responsable_id')}>
                <option value="">Moi</option>
                {equipe.filter((m) => !m.moi).map((m) => <option key={m.user_id} value={m.user_id}>{m.nom}</option>)}
              </select>
            </Champ>
          )}
        </div>
        <Champ libelle="Notes"><textarea rows={3} value={v.notes} onChange={changer('notes')} maxLength={4000} placeholder="Besoin, budget, décideur, concurrents…" /></Champ>
        <Erreur message={erreur} />
        <div className="actions">
          <Bouton type="button" onClick={onFermer}>Annuler</Bouton>
          <Bouton type="submit" variante="principal" chargement={envoi}>Enregistrer</Bouton>
        </div>
      </form>
    </Modale>
  );
}

// Planifier une activité (ou noter ce qui vient d'être fait).
export function ModaleActivite({ opportuniteId, contactId, equipe, onFermer, onFait, initiale }) {
  const { api, etablissement, peut } = useEspace();
  const demain = new Date();
  demain.setDate(demain.getDate() + 1);
  demain.setHours(9, 0, 0, 0);
  const [v, setV] = useState({ type: 'appel', sujet: '', details: '', echeance: dateHeureLocale(demain), assigne_a: '', faite: false, ...initiale });
  const [erreur, setErreur] = useState('');
  const changer = (c) => (e) => setV({ ...v, [c]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const valider = async (e) => {
    e.preventDefault();
    try {
      await api.rpc('enregistrer_activite_crm', {
        p_etablissement_id: etablissement.id,
        p: { ...v, opportunite_id: opportuniteId ?? null, contact_id: contactId ?? null, echeance: v.faite ? null : versIso(v.echeance), assigne_a: v.assigne_a || null },
      });
      onFait();
    } catch (err) {
      setErreur(err.message);
    }
  };
  const note = v.type === 'note' || v.faite;
  return (
    <Modale titre={v.type === 'note' ? 'Ajouter une note' : 'Planifier une activité'} onFermer={onFermer}>
      <form className="formulaire" onSubmit={valider}>
        <div className="grille-champs">
          <Champ libelle="Type">
            <select value={v.type} onChange={changer('type')}>
              {Object.entries(TYPES_ACTIVITE).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </Champ>
          {!note && <Champ libelle="Quand"><input type="datetime-local" value={v.echeance} onChange={changer('echeance')} required /></Champ>}
        </div>
        <Champ libelle="Sujet"><input value={v.sujet} onChange={changer('sujet')} required maxLength={200} placeholder="Ex. Rappeler pour fixer la démo" autoFocus /></Champ>
        <Champ libelle="Détails"><textarea rows={3} value={v.details} onChange={changer('details')} maxLength={4000} /></Champ>
        {v.type !== 'note' && (
          <label className="case"><input type="checkbox" checked={v.faite} onChange={changer('faite')} /> Déjà fait (je note ce qui s’est passé)</label>
        )}
        {!note && peut('crm_pipeline.administrer') && equipe.length > 1 && (
          <Champ libelle="Assignée à">
            <select value={v.assigne_a} onChange={changer('assigne_a')}>
              <option value="">Moi</option>
              {equipe.filter((m) => !m.moi).map((m) => <option key={m.user_id} value={m.user_id}>{m.nom}</option>)}
            </select>
          </Champ>
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

// Terminer une activité avec son résultat, et proposer la relance suivante.
export function ModaleTerminer({ activite, onFermer, onFait }) {
  const { api } = useEspace();
  const [resultat, setResultat] = useState('');
  const [relancer, setRelancer] = useState(activite.opportunite_id != null);
  const [erreur, setErreur] = useState('');
  const valider = async (e) => {
    e.preventDefault();
    try {
      await api.rpc('terminer_activite_crm', { p_activite_id: activite.id, p_resultat: resultat || null, p_annuler: false });
      onFait(relancer);
    } catch (err) {
      setErreur(err.message);
    }
  };
  return (
    <Modale titre={`Terminé : ${activite.sujet}`} onFermer={onFermer}>
      <form className="formulaire" onSubmit={valider}>
        <Champ libelle="Résultat"><textarea rows={3} value={resultat} onChange={(e) => setResultat(e.target.value)} maxLength={1000} placeholder="Ce qui a été dit, la prochaine étape…" autoFocus /></Champ>
        <label className="case"><input type="checkbox" checked={relancer} onChange={(e) => setRelancer(e.target.checked)} /> Planifier la relance suivante</label>
        <Erreur message={erreur} />
        <div className="actions">
          <Bouton type="button" onClick={onFermer}>Annuler</Bouton>
          <Bouton type="submit" variante="principal" icone="coche">Marquer comme fait</Bouton>
        </div>
      </form>
    </Modale>
  );
}
