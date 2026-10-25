import React, { useState } from 'react';
import { useDonnees, useEspace } from '../../noyau/espace.jsx';
import { Bouton, Chargement, Erreur, lireImageReduite } from '../../ui/composants.jsx';
import { ImageQr } from '../caisse/qrOutils.jsx';
import { ChampEnPlace, EnteteXp, PhotoServeur, Segments } from './communs.jsx';

// Équipe et badges (nouvelle version The Dream) : une carte par serveur (photo, rôle, téléphone, statut), tout se
// modifie sur place. Badges à imprimer : photo, prénom, rôle et le QR de la boîte à suggestions.
const STATUTS = [['actif', 'Au travail'], ['conge', 'En congé'], ['parti', 'Parti']];

export default function Equipe() {
  const { api, etablissement, peut, notifier } = useEspace();
  const etab = etablissement.id;
  const [vue, setVue] = useState('equipe');
  const [ajout, setAjout] = useState('');
  const modifiable = peut('etablissement.modifier');
  const { donnees, chargement, erreur, recharger } = useDonnees(async () => {
    const [serveurs, qr] = await Promise.all([
      api.lire('serveurs_caisse', { eq: { etablissement_id: etab, actif: true }, ordre: ['prenom'] }),
      api.lire('qr_codes', { eq: { etablissement_id: etab, actif: true }, ordre: ['cree_le'] }).catch(() => []),
    ]);
    const menu = qr.find((q) => /menu/i.test(q.nom)) ?? qr[0] ?? null;
    return { serveurs: serveurs.filter((s) => !s.fusionne_dans), jeton: menu?.jeton ?? null };
  }, [etab]);
  const [locaux, setLocaux] = useState({});
  const fiche = async (s, p, message = 'Fiche enregistrée') => {
    try {
      const r = await api.rpc('modifier_fiche_serveur', { p_serveur_id: s.id, p });
      setLocaux((l) => ({ ...l, [s.id]: r }));
      notifier(message);
    } catch (err) {
      notifier(err.message, 'erreur');
      throw err;
    }
  };
  const photo = async (s, fichier) => {
    if (!fichier) return;
    try {
      const image = await lireImageReduite(fichier, 320);
      await fiche(s, { photo_url: image }, `Photo de ${s.prenom} enregistrée`);
    } catch {
      // message déjà affiché
    }
  };
  const imprimer = () => {
    document.body.classList.add('impression-badges');
    const fin = () => { document.body.classList.remove('impression-badges'); window.removeEventListener('afterprint', fin); };
    window.addEventListener('afterprint', fin);
    window.print();
  };
  const creer = async (e) => {
    e.preventDefault();
    if (!ajout.trim()) return;
    try {
      await api.rpc('enregistrer_serveur', { p_etablissement_id: etab, p_prenom: ajout.trim() });
      notifier(`${ajout.trim()} ajouté à l’équipe`);
      setAjout('');
      recharger();
    } catch (err) {
      notifier(err.message, 'erreur');
    }
  };
  if (chargement && !donnees) return <Chargement />;
  if (erreur) return <Erreur message={erreur} />;
  const serveurs = donnees.serveurs.map((s) => ({ ...s, ...(locaux[s.id] ?? {}) }));
  const lienAvis = donnees.jeton ? `${window.location.origin}${window.location.pathname}#/avis/${donnees.jeton}` : null;
  const auTravail = serveurs.filter((s) => (s.statut ?? 'actif') === 'actif');

  return (
    <div className="xp-page">
      <EnteteXp surtitre={etablissement.nom} titre="Serveurs et badges" sousTitre={`${auTravail.length} au travail · ${serveurs.length - auTravail.length} en congé ou partis. Touchez un nom, un rôle ou une photo pour le changer.`}>
        <Segments libelle="Vue" valeur={vue} onChange={setVue} options={[['equipe', 'L’équipe'], ['badges', 'Badges à imprimer']]} />
        {vue === 'badges' && <Bouton icone="imprimer" onClick={imprimer}>Imprimer</Bouton>}
      </EnteteXp>

      {vue === 'equipe' && (
        <>
          <div className="xp-grille">
            {serveurs.map((s) => (
              <div key={s.id} className={`xp-tuile ${s.statut === 'parti' ? 'xp-reco masquee' : ''}`}>
                <span className="xp-tuile-tete" style={{ gap: 14 }}>
                  <label className="xp-photo-change" title={modifiable ? 'Changer la photo' : undefined}>
                    <PhotoServeur prenom={s.prenom} photo={s.photo_url} taille={64} />
                    {modifiable && <input type="file" accept="image/*" capture="user" className="sr-only" onChange={(e) => photo(s, e.target.files?.[0])} />}
                  </label>
                  <span className="xp-ligne-texte">
                    <strong><ChampEnPlace valeur={s.prenom} libelle="prénom" desactive={!modifiable} onEnregistrer={(v) => fiche(s, { prenom: v })} /></strong>
                    <small><ChampEnPlace valeur={s.role ?? 'Serveur'} libelle="rôle" desactive={!modifiable} onEnregistrer={(v) => fiche(s, { role: v })} /></small>
                    <small><ChampEnPlace valeur={s.telephone ?? ''} libelle="téléphone" desactive={!modifiable} format={(v) => v || 'Ajouter un téléphone'} onEnregistrer={(v) => fiche(s, { telephone: v })} /></small>
                  </span>
                </span>
                <Segments libelle={`Statut de ${s.prenom}`} valeur={s.statut ?? 'actif'} options={STATUTS}
                  onChange={(v) => modifiable && fiche(s, { statut: v }, `${s.prenom} : ${STATUTS.find((x) => x[0] === v)[1].toLowerCase()}`).catch(() => {})} />
              </div>
            ))}
          </div>
          {modifiable && (
            <form className="xp-carte" onSubmit={creer} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <strong>Nouveau serveur</strong>
              <input value={ajout} maxLength={40} onChange={(e) => setAjout(e.target.value)} placeholder="Prénom" style={{ flex: '1 1 180px' }} aria-label="Prénom du nouveau serveur" />
              <Bouton type="submit" variante="principal">Ajouter</Bouton>
            </form>
          )}
        </>
      )}

      {vue === 'badges' && (
        <div className="xp-badges zone-badges">
          {auTravail.map((s) => (
            <div key={s.id} className="xp-badge">
              <span className="xp-badge-marque">{etablissement.identite?.nom_commercial ?? etablissement.nom}</span>
              <PhotoServeur prenom={s.prenom} photo={s.photo_url} taille={110} />
              <div>
                <p className="xp-badge-nom">{s.prenom}</p>
                <span className="xp-badge-role">{s.role ?? 'Serveur'}</span>
              </div>
              {lienAvis
                ? <div className="xp-badge-qr"><ImageQr texte={lienAvis} libelle={`avis ${s.prenom}`} /></div>
                : <small>Créez le QR « Menu The Dream » pour ajouter le QR d’avis.</small>}
              <small style={{ color: '#A39E93', fontSize: 10 }}>Votre avis en 10 secondes</small>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
