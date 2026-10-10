import React, { useState } from 'react';
import { useDonnees, useEspace } from '../../noyau/espace.jsx';
import { Badge, Bouton, Champ, Erreur, Modale, Section, Squelette } from '../../ui/composants.jsx';

// Propositions adaptées au besoin : modèles de proposition (lignes de devis types et mots du besoin), classés pour une
// opportunité selon les mots retrouvés, le budget du client et les ventes déjà gagnées avec chaque modèle.
export const BUDGETS_MODELE = { dans_budget: ['Dans le budget', 'vert'], au_dessus: ['Au-dessus du budget', 'orange'], en_dessous: ['Bien en dessous du budget', 'neutre'] };

// Raisons lisibles d'un modèle proposé.
export function raisonsModele(m) {
  const raisons = [];
  if (m.mots_trouves?.length) raisons.push(`besoin : ${m.mots_trouves.join(', ')}`);
  if (m.budget) raisons.push(BUDGETS_MODELE[m.budget][0].toLowerCase());
  if (m.utilisations > 0) raisons.push(`${m.gagnees} vente${m.gagnees > 1 ? 's' : ''} gagnée${m.gagnees > 1 ? 's' : ''} sur ${m.utilisations}`);
  return raisons;
}

export function PropositionsAdaptees({ opportunite, naviguer }) {
  const { api, montant, notifier } = useEspace();
  const [erreur, setErreur] = useState('');
  const [tout, setTout] = useState(false);
  const { donnees: modeles } = useDonnees(() => api.rpc('propositions_adaptees', { p_opportunite_id: opportunite.id }), [opportunite.id]);
  if (!modeles) return <Squelette lignes={2} />;
  if (!modeles.length) return null;
  const adaptes = modeles.filter((m) => m.adapte);
  const visibles = tout || !adaptes.length ? modeles : adaptes;
  const creer = async (m) => {
    setErreur('');
    try {
      const id = await api.rpc('creer_devis_depuis_modele', { p_opportunite_id: opportunite.id, p_modele_id: m.id });
      notifier(`Devis créé depuis « ${m.nom} »`);
      naviguer(`factures/${id}/modifier`);
    } catch (err) {
      setErreur(err.message);
    }
  };
  return (
    <Section titre="Propositions adaptées">
      {!adaptes.length && <p className="texte-doux">Aucun modèle ne correspond encore au besoin écrit : précisez-le dans les notes ou la qualification.</p>}
      <div className="liste-simple">
        {visibles.map((m) => (
          <div key={m.id} className="liste-ligne">
            <span>
              <strong>{m.nom}</strong> {m.budget && <Badge ton={BUDGETS_MODELE[m.budget][1]}>{BUDGETS_MODELE[m.budget][0]}</Badge>}
              <small className="texte-doux bloc">{montant(m.montant)} hors options{raisonsModele(m).length ? ` · ${raisonsModele(m).join(' · ')}` : ''}</small>
            </span>
            <Bouton onClick={() => creer(m)}>Créer le devis</Bouton>
          </div>
        ))}
      </div>
      {adaptes.length > 0 && adaptes.length < modeles.length && (
        <Bouton onClick={() => setTout(!tout)}>{tout ? 'Seulement les modèles adaptés' : `Voir les ${modeles.length} modèles`}</Bouton>
      )}
      <Erreur message={erreur} />
    </Section>
  );
}

const LIGNE_VIDE = { libelle: '', quantite: '1', prix_unitaire: '', optionnelle: false };

// Réglages du CRM : modèles de proposition (administrateur du CRM). Rien ne se supprime : un modèle se retire.
export function ModelesProposition() {
  const { api, etablissement, notifier, montant } = useEspace();
  const [edition, setEdition] = useState(null);
  const [erreur, setErreur] = useState('');
  const { donnees: modeles, recharger } = useDonnees(
    () => api.lire('crm_modeles_proposition', { eq: { etablissement_id: etablissement.id }, ordre: ['nom'] }),
    [etablissement.id],
  );
  const retirer = async (m) => {
    setErreur('');
    try {
      await api.rpc('activer_modele_proposition', { p_modele_id: m.id, p_actif: !m.actif });
      notifier(m.actif ? 'Modèle retiré' : 'Modèle réactivé');
      recharger();
    } catch (err) {
      setErreur(err.message);
    }
  };
  if (!modeles) return <Squelette lignes={3} />;
  const total = (m) => m.lignes.filter((l) => !l.optionnelle).reduce((s, l) => s + Number(l.quantite ?? 1) * Number(l.prix_unitaire ?? 0), 0);
  return (
    <Section titre="Modèles de proposition" action={<Bouton icone="plus" onClick={() => setEdition({})}>Nouveau modèle</Bouton>}>
      <p className="texte-doux">Un modèle = des lignes de devis types et les mots qui décrivent le besoin. Sur chaque opportunité, les modèles qui correspondent au besoin et au budget sont proposés en premier.</p>
      <Erreur message={erreur} />
      {!modeles.length && <p className="texte-doux">Aucun modèle pour l’instant.</p>}
      {modeles.length > 0 && (
        <div className="tableau-conteneur">
          <table className="tableau">
            <thead><tr><th>Modèle</th><th>Mots du besoin</th><th className="nombre">Montant hors options</th><th /></tr></thead>
            <tbody>
              {modeles.map((m) => (
                <tr key={m.id} className={m.actif ? '' : 'inactif'}>
                  <td><strong>{m.nom}</strong><small className="texte-doux bloc">{m.lignes.length} ligne{m.lignes.length > 1 ? 's' : ''}{m.actif ? '' : ' · retiré'}</small></td>
                  <td>{m.mots_cles.join(', ') || '—'}</td>
                  <td className="nombre">{montant(total(m))}</td>
                  <td>
                    <div className="groupe-boutons">
                      <Bouton onClick={() => setEdition(m)}>Modifier</Bouton>
                      <Bouton onClick={() => retirer(m)}>{m.actif ? 'Retirer' : 'Réactiver'}</Bouton>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {edition && <ModaleModele modele={edition} onFermer={() => setEdition(null)} onFait={() => { setEdition(null); recharger(); }} />}
    </Section>
  );
}

function ModaleModele({ modele, onFermer, onFait }) {
  const { api, etablissement, notifier } = useEspace();
  const [f, setF] = useState(() => ({
    nom: modele.nom ?? '', description: modele.description ?? '', mots_cles: (modele.mots_cles ?? []).join(', '),
    lignes: (modele.lignes ?? [LIGNE_VIDE]).map((l) => ({ ...LIGNE_VIDE, ...l, quantite: String(l.quantite ?? 1), prix_unitaire: String(l.prix_unitaire ?? '') })),
  }));
  const [erreur, setErreur] = useState('');
  const changer = (i, champ, v) => setF({ ...f, lignes: f.lignes.map((l, j) => (j === i ? { ...l, [champ]: v } : l)) });
  const enregistrer = async (e) => {
    e.preventDefault();
    setErreur('');
    try {
      await api.rpc('enregistrer_modele_proposition', { p_etablissement_id: etablissement.id, p: {
        id: modele.id, nom: f.nom, description: f.description, mots_cles: f.mots_cles,
        lignes: f.lignes.filter((l) => l.libelle.trim() || l.article_id).map((l) => ({ ...l, quantite: Number(l.quantite), prix_unitaire: l.prix_unitaire === '' ? null : Number(l.prix_unitaire) })),
      } });
      notifier(modele.id ? 'Modèle modifié' : 'Modèle créé');
      onFait();
    } catch (err) {
      setErreur(err.message);
    }
  };
  return (
    <Modale titre={modele.id ? `Modifier « ${modele.nom} »` : 'Nouveau modèle de proposition'} onFermer={onFermer} large>
      <form className="formulaire" onSubmit={enregistrer}>
        <Champ libelle="Nom du modèle"><input value={f.nom} onChange={(e) => setF({ ...f, nom: e.target.value })} maxLength={120} required /></Champ>
        <Champ libelle="Mots du besoin (séparés par des virgules)" aide="Retrouvés dans le titre, les notes et les réponses de qualification de l’opportunité.">
          <input value={f.mots_cles} onChange={(e) => setF({ ...f, mots_cles: e.target.value })} placeholder="ex. site, vitrine, référencement" />
        </Champ>
        <Champ libelle="Description (facultatif)"><textarea rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} maxLength={1000} /></Champ>
        <div className="tableau-conteneur">
          <table className="tableau">
            <thead><tr><th>Désignation</th><th className="nombre">Quantité</th><th className="nombre">Prix unitaire</th><th>Option</th><th /></tr></thead>
            <tbody>
              {f.lignes.map((l, i) => (
                <tr key={i}>
                  <td><input value={l.libelle} onChange={(e) => changer(i, 'libelle', e.target.value)} maxLength={200} aria-label={`Désignation ligne ${i + 1}`} /></td>
                  <td className="nombre"><input type="number" min="0" step="any" value={l.quantite} onChange={(e) => changer(i, 'quantite', e.target.value)} aria-label={`Quantité ligne ${i + 1}`} /></td>
                  <td className="nombre"><input type="number" min="0" step="any" value={l.prix_unitaire} onChange={(e) => changer(i, 'prix_unitaire', e.target.value)} aria-label={`Prix ligne ${i + 1}`} /></td>
                  <td><input type="checkbox" checked={!!l.optionnelle} onChange={(e) => changer(i, 'optionnelle', e.target.checked)} aria-label={`Ligne ${i + 1} en option`} /></td>
                  <td>{f.lignes.length > 1 && <Bouton type="button" onClick={() => setF({ ...f, lignes: f.lignes.filter((_, j) => j !== i) })}>Retirer</Bouton>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Bouton type="button" icone="plus" onClick={() => setF({ ...f, lignes: [...f.lignes, LIGNE_VIDE] })}>Ajouter une ligne</Bouton>
        <Erreur message={erreur} />
        <div className="actions">
          <Bouton type="button" onClick={onFermer}>Annuler</Bouton>
          <Bouton type="submit" variante="principal">Enregistrer</Bouton>
        </div>
      </form>
    </Modale>
  );
}
