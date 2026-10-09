import React, { useState } from 'react';
import { useDonnees, useEspace } from '../../noyau/espace.jsx';
import { formatDate, formatDateHeure } from '../../noyau/format.js';
import { Badge, Bouton, Champ, Erreur, MenuActions, Modale, ModaleMotif, Section, Squelette } from '../../ui/composants.jsx';

// Suivi d'un projet (lot C) : checklists, livrables versionnés, décisions, attentes du client, devis liés.
export const STATUTS_LIVRABLE = {
  en_preparation: ['En préparation', 'neutre'], soumis: ['En attente de décision', 'bleu'], valide: ['Validé', 'vert'],
  a_corriger: ['À corriger', 'orange'], abandonne: ['Abandonné', 'neutre'],
};
const STATUTS_NOTE = { proposee: ['À valider', 'bleu'], validee: ['Validée', 'vert'], refusee: ['Refusée', 'alerte'], ouverte: ['Ouverte', 'bleu'], satisfaite: ['Satisfaite', 'vert'] };

// Petit formulaire générique : quelques champs texte, un bouton.
export function ModaleSaisie({ titre, texte, champs, libelleAction = 'Enregistrer', onValider, onFermer }) {
  const [v, setV] = useState(() => Object.fromEntries(champs.map((c) => [c.cle, c.valeur ?? ''])));
  const [erreur, setErreur] = useState('');
  const [chargement, setChargement] = useState(false);
  const valider = async (e) => {
    e.preventDefault();
    setChargement(true);
    setErreur('');
    try {
      await onValider(v);
      onFermer();
    } catch (err) {
      setErreur(err.message);
      setChargement(false);
    }
  };
  return (
    <Modale titre={titre} onFermer={onFermer}>
      <form className="formulaire" onSubmit={valider}>
        {texte && <p className="texte-doux">{texte}</p>}
        {champs.map((c) => (
          <Champ key={c.cle} libelle={c.libelle} aide={c.aide}>
            {c.long
              ? <textarea rows={c.lignes ?? 3} value={v[c.cle]} onChange={(e) => setV({ ...v, [c.cle]: e.target.value })} required={c.requis} maxLength={c.max ?? 4000} />
              : <input value={v[c.cle]} onChange={(e) => setV({ ...v, [c.cle]: e.target.value })} required={c.requis} maxLength={c.max ?? 200} />}
          </Champ>
        ))}
        <Erreur message={erreur} />
        <div className="actions">
          <Bouton type="button" onClick={onFermer}>Annuler</Bouton>
          <Bouton type="submit" variante="principal" chargement={chargement}>{libelleAction}</Bouton>
        </div>
      </form>
    </Modale>
  );
}

function Checklist({ titre, genre, points, projetId, actif, recharger }) {
  const { api, peut, notifier } = useEspace();
  const [ajout, setAjout] = useState(false);
  const [erreur, setErreur] = useState('');
  const liste = points.filter((p) => p.genre === genre && p.actif);
  const faits = liste.filter((p) => p.fait).length;
  const appeler = (rpc, params, message) => api.rpc(rpc, params).then(() => { if (message) notifier(message); recharger(); }, (err) => setErreur(err.message));
  return (
    <Section
      titre={titre}
      sousTitre={liste.length ? `${faits} / ${liste.length} fait(s)` : undefined}
      action={actif && peut('projets.gerer') && <Bouton onClick={() => setAjout(true)}>Ajouter des points</Bouton>}
    >
      <Erreur message={erreur} />
      {!liste.length && <p className="texte-doux">Aucun point.</p>}
      <div className="liste-simple">
        {liste.map((p) => (
          <div key={p.id} className="liste-ligne">
            <label className="case">
              <input type="checkbox" checked={p.fait} disabled={!actif || !peut('projets.contribuer')}
                onChange={(e) => appeler('cocher_point_checklist', { p_point_id: p.id, p_fait: e.target.checked })} />
              <span>{p.libelle}{p.fait_le && <small className="texte-doux bloc">Fait le {formatDateHeure(p.fait_le)}</small>}</span>
            </label>
            {actif && peut('projets.gerer') && <MenuActions actions={[{ libelle: 'Retirer', onClick: () => appeler('retirer_point_checklist', { p_point_id: p.id }, 'Point retiré') }]} />}
          </div>
        ))}
      </div>
      {ajout && (
        <ModaleSaisie
          titre={`${titre} : ajouter des points`}
          texte="Un point par ligne. Laissez vide pour reprendre le modèle réglé dans les paramètres du module Projets."
          champs={[{ cle: 'points', libelle: 'Points', long: true, lignes: 5 }]}
          libelleAction="Ajouter"
          onValider={async ({ points: texte }) => {
            const libelles = texte.split('\n').map((x) => x.trim()).filter(Boolean);
            const n = await api.rpc('ajouter_points_checklist', { p_projet_id: projetId, p_genre: genre, p_libelles: libelles.length ? libelles : null });
            notifier(n ? `${n} point(s) ajouté(s)` : 'Aucun point nouveau (modèle vide ou déjà présent)');
            recharger();
          }}
          onFermer={() => setAjout(false)}
        />
      )}
    </Section>
  );
}

function Livrables({ projet, livrables, versions, actif, recharger }) {
  const { api, etablissement, peut, notifier } = useEspace();
  const [action, setAction] = useState(null);
  const [ouvert, setOuvert] = useState(null);
  return (
    <Section titre="Livrables" action={actif && peut('projets.contribuer') && <Bouton icone="plus" onClick={() => setAction({ type: 'nouveau' })}>Livrable</Bouton>}>
      {!livrables.length && <p className="texte-doux">Aucun livrable. Un livrable se soumet au client, qui le valide ou demande une correction.</p>}
      <div className="liste-simple">
        {livrables.map((l) => (
          <div key={l.id}>
            <div className="liste-ligne">
              <span>
                <button type="button" className="lien" onClick={() => setOuvert(ouvert === l.id ? null : l.id)}><strong>{l.titre}</strong></button>
                <small className="texte-doux bloc">{l.version ? `Version ${l.version}` : 'Pas encore soumis'}{l.description ? ` · ${l.description}` : ''}</small>
              </span>
              <span className="groupe-boutons">
                <Badge ton={STATUTS_LIVRABLE[l.statut][1]}>{STATUTS_LIVRABLE[l.statut][0]}</Badge>
                {actif && peut('projets.contribuer') && ['en_preparation', 'a_corriger'].includes(l.statut) && (
                  <Bouton onClick={() => setAction({ type: 'soumettre', l })}>Soumettre</Bouton>
                )}
                {actif && peut('projets.gerer') && l.statut === 'soumis' && <Bouton variante="principal" onClick={() => setAction({ type: 'valider', l })}>Valider</Bouton>}
                <MenuActions actions={[
                  actif && peut('projets.gerer') && l.statut === 'soumis' && { libelle: 'Demander une correction', onClick: () => setAction({ type: 'corriger', l }) },
                  actif && peut('projets.gerer') && !['valide', 'abandonne'].includes(l.statut) && { libelle: 'Abandonner', danger: true, onClick: () => api.rpc('abandonner_livrable', { p_livrable_id: l.id }).then(() => { notifier('Livrable abandonné'); recharger(); }) },
                ]} />
              </span>
            </div>
            {ouvert === l.id && (
              <ol className="liste-simple">
                {versions.filter((v) => v.livrable_id === l.id).map((v) => (
                  <li key={v.id} className="texte-doux">
                    V{v.version} soumise le {formatDateHeure(v.soumis_le)}{v.note ? ` : ${v.note}` : ''}
                    {v.decision && ` · ${v.decision === 'valide' ? 'validée' : 'à corriger'}${v.decide_par_nom ? ` par ${v.decide_par_nom}` : ''} le ${formatDateHeure(v.decide_le)}${v.decision_note ? ` : ${v.decision_note}` : ''}`}
                  </li>
                ))}
              </ol>
            )}
          </div>
        ))}
      </div>
      {action?.type === 'nouveau' && (
        <ModaleSaisie titre="Nouveau livrable" champs={[{ cle: 'titre', libelle: 'Livrable', requis: true }, { cle: 'description', libelle: 'Description', long: true, max: 2000 }]}
          onValider={async (v) => { await api.rpc('enregistrer_livrable', { p_etablissement_id: etablissement.id, p: { ...v, projet_id: projet.id } }); notifier('Livrable ajouté'); recharger(); }}
          onFermer={() => setAction(null)} />
      )}
      {action?.type === 'soumettre' && (
        <ModaleSaisie titre={`Soumettre « ${action.l.titre} » (V${action.l.version + 1})`} champs={[{ cle: 'note', libelle: 'Note pour le client (facultatif)', long: true, max: 2000 }]}
          libelleAction="Soumettre"
          onValider={async ({ note }) => { await api.rpc('soumettre_livrable', { p_livrable_id: action.l.id, p_note: note || null }); notifier('Livrable soumis'); recharger(); }}
          onFermer={() => setAction(null)} />
      )}
      {action?.type === 'valider' && (
        <ModaleSaisie titre={`Valider « ${action.l.titre} » (V${action.l.version})`} champs={[{ cle: 'par', libelle: 'Validé par (nom, côté client)', max: 120 }]}
          libelleAction="Valider"
          onValider={async ({ par }) => { await api.rpc('decider_livrable', { p_livrable_id: action.l.id, p_decision: 'valide', p_note: null, p_par_nom: par || null }); notifier('Livrable validé'); recharger(); }}
          onFermer={() => setAction(null)} />
      )}
      {action?.type === 'corriger' && (
        <ModaleMotif titre={`Correction de « ${action.l.titre} »`} texte="Une tâche de correction est créée pour le pilote du projet." libelleAction="Demander la correction"
          onValider={async (note) => { await api.rpc('decider_livrable', { p_livrable_id: action.l.id, p_decision: 'a_corriger', p_note: note }); notifier('Correction demandée'); recharger(); }}
          onFermer={() => setAction(null)} />
      )}
    </Section>
  );
}

function Journal({ projet, notes, actif, recharger }) {
  const { api, peut, notifier } = useEspace();
  const [action, setAction] = useState(null);
  const bloc = (genre, titre, vide) => {
    const liste = notes.filter((n) => n.genre === genre);
    return (
      <Section titre={titre} action={actif && peut('projets.contribuer') && genre !== 'compte_rendu' && <Bouton icone="plus" onClick={() => setAction({ type: 'noter', genre })}>{genre === 'decision' ? 'Décision' : 'Attente'}</Bouton>}>
        {!liste.length && <p className="texte-doux">{vide}</p>}
        <div className="liste-simple">
          {liste.map((n) => (
            <div key={n.id} className="liste-ligne">
              <span>{n.texte}<small className="texte-doux bloc">{formatDateHeure(n.cree_le)}{n.statue_le ? ` · ${STATUTS_NOTE[n.statut][0].toLowerCase()}${n.statue_par_nom ? ` par ${n.statue_par_nom}` : ''} le ${formatDateHeure(n.statue_le)}` : ''}</small></span>
              <span className="groupe-boutons">
                {n.statut && <Badge ton={STATUTS_NOTE[n.statut][1]}>{STATUTS_NOTE[n.statut][0]}</Badge>}
                {peut('projets.gerer') && n.statut === 'proposee' && (
                  <MenuActions actions={[
                    { libelle: 'Validée', onClick: () => setAction({ type: 'statuer', n, statut: 'validee' }) },
                    { libelle: 'Refusée', onClick: () => setAction({ type: 'statuer', n, statut: 'refusee' }) },
                  ]} />
                )}
                {peut('projets.gerer') && n.statut === 'ouverte' && (
                  <Bouton onClick={() => api.rpc('statuer_note_projet', { p_note_id: n.id, p_statut: 'satisfaite' }).then(() => { notifier('Attente satisfaite'); recharger(); })}>Satisfaite</Bouton>
                )}
              </span>
            </div>
          ))}
        </div>
      </Section>
    );
  };
  return (
    <>
      {bloc('decision', 'Décisions', 'Aucune décision notée. Notez ce qui doit être validé par le client.')}
      {bloc('attente', 'Attentes du client', 'Aucune attente notée.')}
      {notes.some((n) => n.genre === 'compte_rendu') && bloc('compte_rendu', 'Compte rendu de fin', '')}
      {action?.type === 'noter' && (
        <ModaleSaisie titre={action.genre === 'decision' ? 'Décision à valider' : 'Attente du client'} champs={[{ cle: 'texte', libelle: action.genre === 'decision' ? 'Décision' : 'Attente', long: true, requis: true }]}
          onValider={async ({ texte }) => { await api.rpc('noter_projet', { p_projet_id: projet.id, p_genre: action.genre, p_texte: texte }); notifier('Note ajoutée'); recharger(); }}
          onFermer={() => setAction(null)} />
      )}
      {action?.type === 'statuer' && (
        <ModaleSaisie titre={action.statut === 'validee' ? 'Décision validée' : 'Décision refusée'} champs={[{ cle: 'par', libelle: 'Par (nom, côté client si besoin)', max: 120 }]}
          libelleAction="Confirmer"
          onValider={async ({ par }) => { await api.rpc('statuer_note_projet', { p_note_id: action.n.id, p_statut: action.statut, p_par_nom: par || null }); notifier('Décision notée'); recharger(); }}
          onFermer={() => setAction(null)} />
      )}
    </>
  );
}

function DevisLies({ projet, naviguer }) {
  const { api, peut, moduleActif, montant, notifier } = useEspace();
  const [demande, setDemande] = useState(false);
  const voir = moduleActif('facturation') && peut('facturation.lire');
  const { donnees: devis } = useDonnees(() => (voir ? api.lire('documents_vente', { eq: { projet_id: projet.id }, ordre: ['cree_le'] }).catch(() => []) : Promise.resolve([])), [projet.id, voir]);
  if (!voir) return null;
  const peutDemander = projet.contact_id && peut('projets.gerer') && peut('facturation.gerer') && !['termine', 'annule'].includes(projet.statut);
  return (
    <Section titre="Demandes supplémentaires" action={peutDemander && <Bouton icone="plus" onClick={() => setDemande(true)}>Demande chiffrée</Bouton>}>
      {!devis?.length && <p className="texte-doux">{projet.contact_id ? 'Aucune. Une demande hors périmètre se chiffre par un devis lié au projet.' : 'Choisissez un client pour le projet afin de chiffrer une demande.'}</p>}
      <div className="liste-simple">
        {(devis ?? []).map((d) => (
          <div key={d.id} className="liste-ligne">
            <button type="button" className="lien" onClick={() => naviguer(`factures/${d.id}`)}>{d.numero} · {d.objet}</button>
            <span>{montant(d.total_ttc)}</span>
          </div>
        ))}
      </div>
      {demande && (
        <ModaleSaisie titre="Demande supplémentaire" texte="Un devis brouillon est créé pour le client du projet ; chiffrez-le ensuite dans l’éditeur."
          champs={[{ cle: 'objet', libelle: 'Demande', requis: true }, { cle: 'detail', libelle: 'Détail', long: true, max: 1000 }]}
          libelleAction="Créer le devis"
          onValider={async ({ objet, detail }) => {
            const id = await api.rpc('demande_supplementaire_projet', { p_projet_id: projet.id, p_objet: objet, p_detail: detail || null });
            notifier('Devis créé');
            naviguer(`factures/${id}/modifier`);
          }}
          onFermer={() => setDemande(false)} />
      )}
    </Section>
  );
}

export default function Suivi({ projet, naviguer, onChange }) {
  const { api } = useEspace();
  const { donnees: d, erreur, recharger } = useDonnees(async () => {
    const [points, livrables, notes] = await Promise.all([
      api.lire('projet_checklist', { eq: { projet_id: projet.id }, ordre: ['ordre'] }),
      api.lire('projet_livrables', { eq: { projet_id: projet.id }, ordre: ['cree_le'] }),
      api.lire('projet_journal', { eq: { projet_id: projet.id }, ordre: ['cree_le', 'desc'] }),
    ]);
    const versions = livrables.length
      ? await api.lire('projet_livrable_versions', { dans: { livrable_id: livrables.map((l) => l.id) }, ordre: ['version'] })
      : [];
    return { points, livrables, notes, versions };
  }, [projet.id]);
  const toutRecharger = () => { recharger(); onChange?.(); };
  if (erreur) return <Erreur message={erreur} />;
  if (!d) return <Squelette lignes={6} />;
  const actif = !['termine', 'annule'].includes(projet.statut);
  return (
    <div className="deux-colonnes">
      <div className="pile">
        <Checklist titre="Checklist de démarrage" genre="demarrage" points={d.points} projetId={projet.id} actif={actif} recharger={toutRecharger} />
        <Livrables projet={projet} livrables={d.livrables} versions={d.versions} actif={actif} recharger={toutRecharger} />
        <Checklist titre="Checklist qualité" genre="qualite" points={d.points} projetId={projet.id} actif={actif} recharger={toutRecharger} />
      </div>
      <div className="pile">
        <Journal projet={projet} notes={d.notes} actif={actif} recharger={toutRecharger} />
        <DevisLies projet={projet} naviguer={naviguer} />
      </div>
    </div>
  );
}
