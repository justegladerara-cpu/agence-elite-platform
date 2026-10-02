import React, { useState } from 'react';
import { useDonnees, useEspace } from '../../noyau/espace.jsx';
import { ROLES } from '../../noyau/format.js';
import { Badge, Bouton, Champ, Chargement, EnTete, Erreur, lireImageReduite } from '../../ui/composants.jsx';

function Identite() {
  const { api, etablissement, peut, notifier, recharger } = useEspace();
  const [valeurs, setValeurs] = useState(() => ({
    nom_commercial: '', adresse: '', telephone: '', email: '', rccm: '', niu: '', mentions_recu: '', couleur_principale: '', logo_url: '',
    ...Object.fromEntries(Object.entries(etablissement.identite ?? {}).map(([k, v]) => [k, v ?? ''])),
  }));
  const [erreur, setErreur] = useState('');
  const [chargement, setChargement] = useState(false);
  const modifiable = peut('etablissement.modifier');
  const changer = (champ) => (e) => setValeurs((v) => ({ ...v, [champ]: e.target.value }));
  const enregistrer = async (e) => {
    e.preventDefault();
    setChargement(true);
    setErreur('');
    try {
      await api.rpc('enregistrer_identite', { p_etablissement_id: etablissement.id, p_identite: valeurs });
      notifier('Identité enregistrée');
      await recharger();
    } catch (err) {
      setErreur(err.message);
    } finally {
      setChargement(false);
    }
  };
  return (
    <form className="carte formulaire" onSubmit={enregistrer}>
      <h2>Identité sur les reçus</h2>
      <fieldset disabled={!modifiable}>
        <div className="article-photo">
          {valeurs.logo_url ? <img className="vignette grande" src={valeurs.logo_url} alt="Logo" /> : <span className="vignette grande vide-logo">Logo</span>}
          {modifiable && (
            <div>
              <label className="bouton secondaire">
                <input
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={async (e) => {
                    const fichier = e.target.files?.[0];
                    if (!fichier) return;
                    try {
                      const logo = await lireImageReduite(fichier, 300);
                      setValeurs((v) => ({ ...v, logo_url: logo }));
                    } catch (err) {
                      setErreur(err.message);
                    }
                  }}
                />
                Choisir un logo
              </label>
              {valeurs.logo_url && <button type="button" className="lien" onClick={() => setValeurs((v) => ({ ...v, logo_url: '' }))}>Retirer</button>}
            </div>
          )}
        </div>
        <div className="grille-champs">
          <Champ libelle="Nom commercial" className="large"><input value={valeurs.nom_commercial} onChange={changer('nom_commercial')} /></Champ>
          <Champ libelle="Adresse" className="large"><input value={valeurs.adresse} onChange={changer('adresse')} /></Champ>
          <Champ libelle="Téléphone"><input value={valeurs.telephone} onChange={changer('telephone')} /></Champ>
          <Champ libelle="E-mail"><input type="email" value={valeurs.email} onChange={changer('email')} /></Champ>
          <Champ libelle="RCCM"><input value={valeurs.rccm} onChange={changer('rccm')} /></Champ>
          <Champ libelle="NIU"><input value={valeurs.niu} onChange={changer('niu')} /></Champ>
        </div>
        <Champ libelle="Message en bas du reçu"><textarea rows={2} value={valeurs.mentions_recu} onChange={changer('mentions_recu')} /></Champ>
      </fieldset>
      <Erreur message={erreur} />
      {modifiable && <div className="actions"><Bouton type="submit" variante="principal" chargement={chargement}>Enregistrer</Bouton></div>}
    </form>
  );
}

function ReglagesCaisse() {
  const { api, etablissement, peut, notifier } = useEspace();
  const etab = etablissement.id;
  const { donnees, chargement, erreur, recharger } = useDonnees(async () => {
    const [points, parametres] = await Promise.all([
      api.lire('points_de_vente', { eq: { etablissement_id: etab }, ordre: ['cree_le'] }),
      api.lire('etablissement_parametres', { eq: { etablissement_id: etab, module_id: 'caisse' } }),
    ]);
    return { points, caisse: parametres[0]?.data ?? {} };
  }, [etab]);
  const [nom, setNom] = useState('');
  const [erreurAction, setErreurAction] = useState('');
  const modifiable = peut('etablissement.modifier');
  const agir = async (action, message) => {
    setErreurAction('');
    try {
      await action();
      notifier(message);
      recharger();
    } catch (err) {
      setErreurAction(err.message);
    }
  };
  if (chargement && !donnees) return <Chargement />;
  return (
    <div className="carte">
      <h2>Caisses</h2>
      <Erreur message={erreur || erreurAction} />
      <div className="liste-simple">
        {donnees?.points.map((p) => (
          <div key={p.id} className="liste-ligne">
            <span>{p.nom}</span>
            {p.actif ? <Badge ton="vert">Active</Badge> : <Badge>Inactive</Badge>}
            {modifiable && (
              <button
                className="lien"
                onClick={() => agir(() => api.rpc('enregistrer_point_de_vente', { p_etablissement_id: etab, p_nom: p.nom, p_id: p.id, p_actif: !p.actif }), 'Caisse mise à jour')}
              >
                {p.actif ? 'Désactiver' : 'Réactiver'}
              </button>
            )}
          </div>
        ))}
      </div>
      {modifiable && (
        <form
          className="ligne-formulaire"
          onSubmit={(e) => {
            e.preventDefault();
            agir(() => api.rpc('enregistrer_point_de_vente', { p_etablissement_id: etab, p_nom: nom }), 'Caisse ajoutée').then(() => setNom(''));
          }}
        >
          <input value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Nom d’une nouvelle caisse" required />
          <Bouton type="submit">Ajouter</Bouton>
        </form>
      )}
      {modifiable && donnees && (
        <label className="case">
          <input
            type="checkbox"
            checked={Boolean(donnees.caisse.stock_negatif)}
            onChange={(e) => agir(
              () => api.rpc('enregistrer_parametres_module', { p_etablissement_id: etab, p_module_id: 'caisse', p_data: { ...donnees.caisse, stock_negatif: e.target.checked } }),
              'Réglage enregistré'
            )}
          />
          Autoriser la vente quand le stock affiché est à zéro (le stock devient négatif)
        </label>
      )}
    </div>
  );
}

function Equipe() {
  const { api, etablissement } = useEspace();
  const { donnees, chargement, erreur } = useDonnees(async () => {
    const membres = await api.lire('etablissement_membres', { eq: { etablissement_id: etablissement.id } });
    const profils = await api.lire('profils', { dans: { id: membres.map((m) => m.user_id) } });
    const noms = Object.fromEntries(profils.map((p) => [p.id, p.nom_complet]));
    return membres.map((m) => ({ ...m, nom: noms[m.user_id] ?? 'Utilisateur' }));
  }, [etablissement.id]);
  return (
    <div className="carte">
      <h2>Équipe</h2>
      {chargement && !donnees && <Chargement />}
      <Erreur message={erreur} />
      <div className="liste-simple">
        {donnees?.map((m) => (
          <div key={m.user_id} className="liste-ligne">
            <span>{m.nom}</span>
            <Badge ton="bleu">{ROLES[m.role_id]}</Badge>
            {!m.actif && <Badge>Inactif</Badge>}
          </div>
        ))}
      </div>
      <p className="texte-doux">Pour ajouter une personne, demandez une invitation à Agence Elite.</p>
    </div>
  );
}

export default function Parametres() {
  const { etablissement, peut, moduleActif } = useEspace();
  return (
    <div className="page">
      <EnTete titre="Paramètres" sousTitre={`${etablissement.nom} · ${etablissement.client}`} />
      <div className="deux-colonnes">
        <Identite key={etablissement.id} />
        <div className="pile">
          {moduleActif('caisse') && <ReglagesCaisse />}
          {peut('membres.lire') && <Equipe />}
        </div>
      </div>
    </div>
  );
}
