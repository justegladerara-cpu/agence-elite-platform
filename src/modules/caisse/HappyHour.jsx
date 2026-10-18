import React, { useState } from 'react';
import { useDonnees, useEspace } from '../../noyau/espace.jsx';
import { Badge, Bouton, Champ, EmptyState, Erreur, Modale, PageHeader, Section, Squelette } from '../../ui/composants.jsx';
import { BandeauNouveau, NOUVEAU_LOT3_JUSQUA } from '../../ui/Nouveau.jsx';
import { creneauActif, erreurCreneau, heureCourte, JOURS, texteBandeau, texteJours } from './happyHour.js';
import './caisse.css';

const VIDE = { nom: 'Happy hour', jours: [1, 2, 3, 4, 5, 6, 7], debut: '18:00', fin: '20:00', pourcentage: '20', categories: [], actif: true };

// Créer ou modifier un créneau : nom, jours (gros boutons), heures, pourcentage, catégories (aucune = tout le catalogue).
function FormulaireCreneau({ creneau, categories, onFermer, onFait }) {
  const { api, etablissement } = useEspace();
  const [c, setC] = useState(() => (creneau
    ? { ...creneau, debut: heureCourte(creneau.debut), fin: heureCourte(creneau.fin), pourcentage: String(Number(creneau.pourcentage)) }
    : VIDE));
  const [erreur, setErreur] = useState('');
  const [chargement, setChargement] = useState(false);
  const changer = (champ, valeur) => setC((x) => ({ ...x, [champ]: valeur }));
  const basculer = (champ, id) => setC((x) => ({ ...x, [champ]: x[champ].includes(id) ? x[champ].filter((v) => v !== id) : [...x[champ], id] }));
  const valider = async (e) => {
    e.preventDefault();
    const message = erreurCreneau(c);
    if (message) return setErreur(message);
    setChargement(true);
    setErreur('');
    try {
      await api.rpc('enregistrer_happy_hour', {
        p_etablissement_id: etablissement.id,
        p: {
          ...(c.id ? { id: c.id } : {}), nom: c.nom.trim(), jours: c.jours, debut: c.debut, fin: c.fin,
          pourcentage: Number(String(c.pourcentage).replace(',', '.')), categories: c.categories, actif: c.actif,
        },
      });
      onFait(c.id ? 'Happy hour modifié' : 'Happy hour créé');
    } catch (err) {
      setErreur(err.message);
      setChargement(false);
    }
    return undefined;
  };
  const passeMinuit = c.debut && c.fin && c.fin < c.debut;
  return (
    <Modale titre={creneau ? 'Modifier le happy hour' : 'Nouveau happy hour'} onFermer={onFermer}>
      <form className="formulaire" onSubmit={valider}>
        <Champ libelle="Nom">
          <input value={c.nom} maxLength={40} onChange={(e) => changer('nom', e.target.value)} />
        </Champ>
        <div>
          <span className="champ-libelle">Jours</span>
          <div className="puces puces-raisons" role="group" aria-label="Jours">
            {JOURS.map((j) => (
              <button key={j.id} type="button" className={c.jours.includes(j.id) ? 'actif' : ''} aria-pressed={c.jours.includes(j.id)}
                onClick={() => basculer('jours', j.id)} title={j.nom}>{j.court}</button>
            ))}
          </div>
        </div>
        <div className="grille-champs">
          <Champ libelle="De"><input type="time" value={c.debut} onChange={(e) => changer('debut', e.target.value)} aria-label="Heure de début" /></Champ>
          <Champ libelle="À"><input type="time" value={c.fin} onChange={(e) => changer('fin', e.target.value)} aria-label="Heure de fin" /></Champ>
          <Champ libelle="Réduction (%)">
            <input type="number" min="1" max="100" step="any" inputMode="decimal" value={c.pourcentage} onChange={(e) => changer('pourcentage', e.target.value)} />
          </Champ>
        </div>
        {passeMinuit && <p className="texte-doux">Le créneau passe minuit : il finit le lendemain à {c.fin}.</p>}
        {categories.length > 0 && (
          <div>
            <span className="champ-libelle">Catégories concernées</span>
            <p className="texte-doux">Aucune catégorie choisie = tous les articles.</p>
            <div className="puces" role="group" aria-label="Catégories concernées">
              {categories.map((k) => (
                <button key={k.id} type="button" className={c.categories.includes(k.id) ? 'actif' : ''} aria-pressed={c.categories.includes(k.id)}
                  onClick={() => basculer('categories', k.id)}>{k.nom}</button>
              ))}
            </div>
          </div>
        )}
        <label className="case">
          <input type="checkbox" checked={c.actif} onChange={(e) => changer('actif', e.target.checked)} /> Actif
        </label>
        <Erreur message={erreur} />
        <div className="actions">
          <Bouton type="button" onClick={onFermer}>Annuler</Bouton>
          <Bouton type="submit" variante="principal" chargement={chargement}>Enregistrer</Bouton>
        </div>
      </form>
    </Modale>
  );
}

// Réglages des happy hours : la caisse applique la réduction toute seule pendant le créneau.
export default function HappyHour() {
  const { api, etablissement, notifier, peut } = useEspace();
  const etab = etablissement.id;
  const { donnees, chargement, erreur, recharger } = useDonnees(async () => {
    const [creneaux, categories] = await Promise.all([
      api.lire('happy_hours', { eq: { etablissement_id: etab }, ordre: ['cree_le'] }),
      api.lire('categories_articles', { eq: { etablissement_id: etab, actif: true }, ordre: ['nom'] }),
    ]);
    return { creneaux, categories };
  }, [etab]);
  const [edition, setEdition] = useState(null);
  const [erreurAction, setErreurAction] = useState('');
  if (chargement && !donnees) return <Squelette lignes={5} />;
  if (erreur) return <Erreur message={erreur} />;
  const nomCategorie = (id) => donnees.categories.find((k) => k.id === id)?.nom ?? 'Catégorie archivée';
  const basculer = async (c) => {
    setErreurAction('');
    try {
      await api.rpc('enregistrer_happy_hour', { p_etablissement_id: etab, p: { id: c.id, actif: !c.actif } });
      notifier(c.actif ? `« ${c.nom} » désactivé` : `« ${c.nom} » réactivé`);
      recharger();
    } catch (err) {
      setErreurAction(err.message);
    }
  };
  const gerer = peut('caisse.happy_hour');
  return (
    <div className="page">
      <PageHeader
        titre="Happy hour"
        sousTitre="Prix réduits selon l’heure : la caisse applique la réduction toute seule"
        actions={gerer && <Bouton variante="principal" icone="plus" onClick={() => setEdition('nouveau')}>Nouveau happy hour</Bouton>}
      />
      <BandeauNouveau jusqua={NOUVEAU_LOT3_JUSQUA}>
        Réglez vos happy hours : pendant le créneau, la caisse affiche « Happy hour : -X % jusqu’à HH:MM » et baisse le prix des
        articles concernés. Un créneau peut passer minuit (ex. 22:00 à 02:00).
      </BandeauNouveau>
      <Erreur message={erreurAction} />
      <Section titre="Créneaux">
        {!donnees.creneaux.length && (
          <EmptyState icone="horloge" titre="Aucun happy hour" texte="Ex. tous les jours de 18:00 à 20:00, -20 % sur les boissons."
            action={gerer && <Bouton variante="principal" onClick={() => setEdition('nouveau')}>Créer un happy hour</Bouton>} />
        )}
        <div className="liste-simple">
          {donnees.creneaux.map((c) => (
            <div key={c.id} className="liste-ligne">
              <span>
                <strong>{c.nom}</strong>{' '}
                {!c.actif && <Badge>Désactivé</Badge>}
                {c.actif && creneauActif(c) && <Badge ton="vert">En cours</Badge>}
                <small className="texte-doux bloc">
                  -{String(Number(c.pourcentage)).replace('.', ',')} % · {texteJours(c.jours)} · de {heureCourte(c.debut)} à {heureCourte(c.fin)}
                  {' · '}{c.categories?.length ? c.categories.map(nomCategorie).join(', ') : 'tous les articles'}
                </small>
                {c.actif && creneauActif(c) && <small className="bloc">{texteBandeau(c)}</small>}
              </span>
              {gerer && (
                <span className="actions-ligne">
                  <Bouton onClick={() => setEdition(c)}>Modifier</Bouton>
                  <Bouton onClick={() => basculer(c)}>{c.actif ? 'Désactiver' : 'Réactiver'}</Bouton>
                </span>
              )}
            </div>
          ))}
        </div>
      </Section>
      {edition && (
        <FormulaireCreneau
          creneau={edition === 'nouveau' ? null : edition}
          categories={donnees.categories}
          onFermer={() => setEdition(null)}
          onFait={(message) => { setEdition(null); notifier(message); recharger(); }}
        />
      )}
    </div>
  );
}
