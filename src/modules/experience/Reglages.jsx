import React, { useMemo, useState } from 'react';
import { useEspace } from '../../noyau/espace.jsx';
import { Bouton, Champ, Erreur, Icone } from '../../ui/composants.jsx';
import { ChampEnPlace, EnteteXp, Interrupteur, Segments, Tuile } from './communs.jsx';
import { identifiantMoyen, lireMoyens, MODES_BASE } from './moyens.js';
import { nomPoliceValide, POLICES, policesDe } from './ambiance.js';

// Paramètres en tuiles (nouvelle version The Dream). Chaque tuile ouvre une petite page ; tout s'enregistre sur place,
// sans recharger. Les réglages rares restent dans l'écran complet (« Tous les réglages »).

const RETOUR = (naviguer) => <button type="button" className="lien xp-pas-imprimer" onClick={() => naviguer('reglages')}>← Paramètres</button>;

function useEnregistrer() {
  const { enregistrerReglages, notifier } = useEspace();
  return async (moduleId, modification, message = 'Enregistré') => {
    try {
      await enregistrerReglages(moduleId, modification);
      notifier(message);
    } catch (err) {
      notifier(err.message, 'erreur');
      throw err;
    }
  };
}

export default function Reglages({ naviguer, sousRoute }) {
  if (sousRoute === 'encaissement') return <ReglagesEncaissement naviguer={naviguer} />;
  if (sousRoute === 'apparence') return <ReglagesApparence naviguer={naviguer} />;
  if (sousRoute === 'caisse') return <MaCaisse naviguer={naviguer} />;
  return <AccueilReglages naviguer={naviguer} />;
}

function AccueilReglages({ naviguer }) {
  const { reglagesFonctions, montant, peut, etablissement } = useEspace();
  const enregistrer = useEnregistrer();
  const moyens = lireMoyens(reglagesFonctions);
  const etab = reglagesFonctions.etablissement ?? {};
  const caisse = reglagesFonctions.caisse ?? {};
  const modifiable = peut('etablissement.modifier');
  const apparence = etab.apparence ?? {};
  return (
    <div className="xp-page">
      <EnteteXp surtitre={etablissement.nom} titre="Paramètres" sousTitre={modifiable ? 'Touchez une tuile. Tout se règle ici, sans recharger la page.' : 'Vous pouvez regarder ces réglages. Seul le gérant peut les changer.'} />
      <div className="xp-grille">
        <Tuile icone="billet" titre="Encaissement" valeur={`${moyens.filter((m) => m.actif).length} moyens`}
          pourquoi={moyens.filter((m) => m.actif).map((m) => m.libelle).join(' · ')}
          conseil="Ajouter, retirer ou renommer un moyen" onClick={() => naviguer('reglages/encaissement')} />
        <Tuile icone="caisse" titre="Ma caisse" valeur={{ normale: 'Soirée normale', grosse: 'Grosse soirée', happy: 'Happy hour' }[caisse.ma_caisse?.modele] ?? 'Soirée normale'}
          pourquoi={`« Qui a servi ? » : ${{ non: 'pas demandé', rappel: 'proposé', obligatoire: 'obligatoire' }[caisse.qui_a_servi ?? 'rappel']} · présence : ${caisse.presence_controle ? `toutes les ${caisse.presence_minutes ?? 40} min` : 'non'}`}
          conseil="Régler l’écran de la caissière" onClick={() => naviguer('reglages/caisse')} />
        <Tuile icone="palette" titre="Apparence" valeur={apparence.mode === 'jour' ? 'Jour (ivoire et or)' : apparence.mode === 'auto' ? 'Automatique' : 'Nuit (noir et or)'}
          pourquoi="Couleurs, polices et taille du texte sur tous les écrans." conseil="Changer" onClick={() => naviguer('reglages/apparence')} />
        <Tuile icone="cible" titre="Objectif de la soirée"
          valeur={<ChampEnPlace type="number" min={0} libelle="objectif de la soirée" desactive={!modifiable} valeur={etab.objectif_jour ?? null} format={(v) => montant(v)}
            onEnregistrer={(v) => enregistrer('etablissement', { objectif_jour: Number(v) || 0 }, 'Objectif enregistré')} />}
          pourquoi="L’anneau doré du centre de commande se remplit avec les ventes de la soirée." />
        <Tuile icone="message" titre="Boîte à suggestions" valeur={etab.suggestions_actives === false ? 'Fermée' : 'Ouverte'}
          pourquoi="Les clients donnent une note depuis le QR « Menu The Dream », sans nom ni numéro.">
          <span className="xp-reglage" style={{ padding: 0, border: 0 }}>
            <small className="texte-doux">Recevoir les avis</small>
            <Interrupteur actif={etab.suggestions_actives !== false} desactive={!modifiable} libelle="Boîte à suggestions"
              onChange={(v) => enregistrer('etablissement', { suggestions_actives: v }, v ? 'Boîte à suggestions ouverte' : 'Boîte à suggestions fermée')} />
          </span>
        </Tuile>
        <Tuile icone="qr" titre="QR et avis" pourquoi="Le QR « Menu The Dream », ses scans et les avis des clients." conseil="Ouvrir" onClick={() => naviguer('qr-et-avis')} />
        <Tuile icone="badge" titre="Serveurs et badges" pourquoi="Photos, rôles et badges des serveurs." conseil="Ouvrir" onClick={() => naviguer('mon-equipe')} />
        <Tuile icone="depot" titre="Mes espaces" pourquoi="La salle, la terrasse, le dépôt : ce qui se vend et se range où." conseil="Ouvrir" onClick={() => naviguer('mes-espaces')} />
        <Tuile icone="modules" titre="Applications" pourquoi="Allumer ou éteindre une fonction (happy hour, réserves…)." conseil="Ouvrir" onClick={() => naviguer('applications')} />
        <Tuile icone="imprimer" titre="Reçus et tickets" pourquoi="Ce qui est écrit sur le ticket, le logo, le pied de page." conseil="Ouvrir" onClick={() => naviguer('parametres')} />
        <Tuile icone="parametres" titre="Tous les réglages" pourquoi="Entreprise, caisse, clôture, stock : l’écran complet." conseil="Ouvrir" onClick={() => naviguer('parametres')} />
      </div>
    </div>
  );
}

function ReglagesEncaissement({ naviguer }) {
  const { reglagesFonctions, peut } = useEspace();
  const enregistrer = useEnregistrer();
  const moyens = useMemo(() => lireMoyens(reglagesFonctions), [reglagesFonctions]);
  const [nouveau, setNouveau] = useState({ libelle: '', mode: 'mobile_money' });
  const [erreur, setErreur] = useState('');
  const modifiable = peut('etablissement.modifier');
  const sauver = (liste, message) => enregistrer('caisse', { moyens_encaissement: liste }, message);
  const changer = (id, champ, valeur) => sauver(moyens.map((m) => (m.id === id ? { ...m, [champ]: valeur } : m)), 'Moyen enregistré');
  const deplacer = (i, sens) => {
    const liste = [...moyens];
    const j = i + sens;
    if (j < 0 || j >= liste.length) return;
    [liste[i], liste[j]] = [liste[j], liste[i]];
    sauver(liste, 'Ordre enregistré').catch(() => {});
  };
  const ajouter = async (e) => {
    e.preventDefault();
    setErreur('');
    const libelle = nouveau.libelle.trim();
    if (!libelle) return setErreur('Tapez le nom du moyen (ex. : Wave, Orange Money).');
    const id = identifiantMoyen(libelle);
    if (moyens.some((m) => m.id === id)) return setErreur('Ce moyen existe déjà.');
    await sauver([...moyens, { id, libelle, mode: nouveau.mode, actif: true, reference: nouveau.mode === 'especes' ? 'non' : 'facultative' }], `${libelle} ajouté`).catch(() => {});
    setNouveau({ libelle: '', mode: 'mobile_money' });
  };
  return (
    <div className="xp-page">
      {RETOUR(naviguer)}
      <EnteteXp titre="Encaissement" sousTitre="Les moyens que la caissière voit en grandes tuiles. Pour le mobile money, elle tape les 4 derniers chiffres de la référence du SMS." />
      <div className="xp-grille large">
        {moyens.map((m, i) => (
          <div key={m.id} className={`xp-tuile ${m.actif ? '' : 'xp-reco masquee'}`}>
            <span className="xp-tuile-tete">
              <span className="xp-tuile-icone" style={{ background: `${m.couleur}33`, color: m.couleur }}><Icone nom={ICONES_MODE[m.mode] ?? 'depenses'} taille={16} /></span>
              <span className="xp-tuile-titre"><ChampEnPlace valeur={m.libelle} libelle="nom du moyen" desactive={!modifiable} onEnregistrer={(v) => (v ? changer(m.id, 'libelle', v) : Promise.resolve())} /></span>
              <Interrupteur actif={m.actif} desactive={!modifiable} libelle={`${m.libelle} visible en caisse`} onChange={(v) => changer(m.id, 'actif', v).catch(() => {})} />
            </span>
            <small className="texte-doux">Compté comme : {MODES_BASE[m.mode]}</small>
            {m.mode !== 'especes' && (
              <div className="xp-reglage-ligne">
                <span className="texte-doux">Référence</span>
                <Segments libelle={`Référence ${m.libelle}`} valeur={m.reference}
                  options={[['obligatoire', 'Obligatoire'], ['facultative', 'Facultative'], ['non', 'Aucune']]}
                  onChange={(v) => modifiable && changer(m.id, 'reference', v).catch(() => {})} />
              </div>
            )}
            <span className="xp-reco-actions">
              <button type="button" disabled={!modifiable || i === 0} onClick={() => deplacer(i, -1)}>Monter</button>
              <button type="button" disabled={!modifiable || i === moyens.length - 1} onClick={() => deplacer(i, 1)}>Descendre</button>
              <input type="color" aria-label={`Couleur ${m.libelle}`} value={m.couleur} disabled={!modifiable} onChange={(e) => changer(m.id, 'couleur', e.target.value).catch(() => {})} />
            </span>
          </div>
        ))}
      </div>
      {modifiable && (
        <form className="xp-carte formulaire" onSubmit={ajouter}>
          <h2 className="xp-section-titre">Ajouter un moyen</h2>
          <div className="grille-champs">
            <Champ libelle="Nom"><input value={nouveau.libelle} maxLength={40} onChange={(e) => setNouveau((n) => ({ ...n, libelle: e.target.value }))} placeholder="Ex. : Wave" /></Champ>
            <Champ libelle="Compté comme">
              <select value={nouveau.mode} onChange={(e) => setNouveau((n) => ({ ...n, mode: e.target.value }))}>
                {Object.entries(MODES_BASE).map(([id, l]) => <option key={id} value={id}>{l}</option>)}
              </select>
            </Champ>
          </div>
          <Erreur message={erreur} />
          <Bouton type="submit" variante="principal">Ajouter</Bouton>
        </form>
      )}
    </div>
  );
}

// Une icône par façon de compter le paiement.
const ICONES_MODE = { mobile_money: 'telephone', especes: 'billet', carte: 'carte', virement: 'transfert', cheque: 'document' };

const ROLES_POLICE = [
  ['titre', 'Titres', 'Les grands titres des pages et des fenêtres.'],
  ['texte', 'Textes', 'Tout le reste : menus, boutons, explications.'],
  ['chiffres', 'Chiffres', 'Les montants, les totaux, la monnaie à rendre.'],
];

function ReglagesApparence({ naviguer }) {
  const { reglagesFonctions, peut, etablissement } = useEspace();
  const enregistrer = useEnregistrer();
  const apparence = reglagesFonctions.etablissement?.apparence ?? {};
  const mode = apparence.mode ?? 'nuit';
  const modifiable = peut('etablissement.modifier');
  const polices = policesDe(apparence);
  const [autre, setAutre] = useState({});
  const sauver = (m, message = 'Apparence enregistrée') => enregistrer('etablissement', { apparence: { ...apparence, theme: 'dream', ...m } }, message).catch(() => {});
  const choisirPolice = (role, nom, libelle) => {
    if (!nomPoliceValide(nom)) return;
    sauver({ polices: { ...polices, [role]: nom.trim() } }, `Police des ${libelle.toLowerCase()} : ${nom.trim()}`);
  };
  return (
    <div className="xp-page">
      {RETOUR(naviguer)}
      <EnteteXp titre="Apparence" sousTitre="Couleurs, polices et taille du texte. Le changement se voit tout de suite, sur tous les appareils du bar." />

      <section className="xp-section">
        <h2 className="xp-section-titre">Couleurs</h2>
        <div className="xp-modeles">
          {[['nuit', 'Nuit', 'Noir et or : pour le bar, le soir.'], ['jour', 'Jour', 'Ivoire et or : pour le bureau, en journée.'], ['auto', 'Automatique', 'Nuit dès 18 h, jour le matin.']].map(([id, titre, texte]) => (
            <button key={id} type="button" className={`xp-modele ${mode === id ? 'actif' : ''}`} disabled={!modifiable} onClick={() => sauver({ mode: id })}>
              <strong>{titre}</strong>
              <small>{texte}</small>
            </button>
          ))}
        </div>
      </section>

      <section className="xp-section">
        <h2 className="xp-section-titre">Polices</h2>
        <div className="xp-deux">
          <div className="xp-carte xp-polices">
            {ROLES_POLICE.map(([role, libelle, aide]) => {
              const liste = POLICES[role].includes(polices[role]) ? POLICES[role] : [polices[role], ...POLICES[role]];
              return (
                <div key={role} className="xp-police-choix">
                  <Champ libelle={libelle} aide={aide}>
                    <select value={polices[role]} disabled={!modifiable} onChange={(e) => choisirPolice(role, e.target.value, libelle)}
                      style={{ fontFamily: polices[role] === 'Système' ? undefined : `'${polices[role]}'` }}>
                      {liste.map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </Champ>
                  {modifiable && (
                    <form style={{ display: 'flex', gap: 8 }} onSubmit={(e) => { e.preventDefault(); choisirPolice(role, autre[role] ?? '', libelle); setAutre((a) => ({ ...a, [role]: '' })); }}>
                      <input value={autre[role] ?? ''} maxLength={40} placeholder="Autre police Google Fonts" aria-label={`Autre police pour les ${libelle.toLowerCase()}`}
                        onChange={(e) => setAutre((a) => ({ ...a, [role]: e.target.value }))} />
                      <Bouton type="submit" disabled={!nomPoliceValide(autre[role] ?? '')}>OK</Bouton>
                    </form>
                  )}
                </div>
              );
            })}
            <div className="xp-police-choix">
              <Champ libelle="Taille du texte" aide="Plus grand = plus facile à lire de loin.">
                <Segments libelle="Taille du texte" valeur={apparence.taille_texte ?? 'normal'} options={[['normal', 'Normale'], ['grand', 'Grande'], ['tres-grand', 'Très grande']]}
                  onChange={(v) => modifiable && sauver({ taille_texte: v }, 'Taille du texte enregistrée')} />
              </Champ>
            </div>
            {modifiable && (
              <div><Bouton onClick={() => sauver({ polices: {}, taille_texte: 'normal' }, 'Polices d’origine remises')}>Remettre les polices d’origine</Bouton></div>
            )}
          </div>
          <div className="xp-carte xp-apercu-polices" aria-label="Aperçu">
            <span className="xp-surtitre">Aperçu</span>
            <p className="apercu-titre" style={{ fontFamily: 'var(--police-titre)' }}>{etablissement.identite?.nom_commercial ?? etablissement.nom}</p>
            <p className="apercu-texte">Bonsoir ! Touchez une tuile pour ajouter un article, puis « Encaisser ».</p>
            <span className="apercu-chiffre" style={{ fontFamily: 'var(--police-chiffres)' }}>125 500 FCFA</span>
          </div>
        </div>
      </section>
    </div>
  );
}

// « Ma caisse » : ce que la caissière voit, réglé par le gérant (aperçu en direct).
const MODELES = [
  ['normale', 'Soirée normale', 'Toutes les catégories, les favoris en premier.'],
  ['grosse', 'Grosse soirée', 'Bouteilles et chichas en grand, la recherche cachée : on va vite.'],
  ['happy', 'Happy hour', 'Bières et cocktails d’abord, le reste ensuite.'],
];

function MaCaisse({ naviguer }) {
  const { reglagesFonctions, peut } = useEspace();
  const enregistrer = useEnregistrer();
  const caisse = reglagesFonctions.caisse ?? {};
  const ma = caisse.ma_caisse ?? {};
  const modifiable = peut('etablissement.modifier');
  const modele = ma.modele ?? 'normale';
  const tuileTaille = ma.taille ?? 'normale';
  const sauverMa = (m, message = 'Ma caisse enregistrée') => enregistrer('caisse', { ma_caisse: { ...ma, ...m } }, message).catch(() => {});
  return (
    <div className="xp-page">
      {RETOUR(naviguer)}
      <EnteteXp titre="Ma caisse" sousTitre="Ce que voit la caissière. L’aperçu change en direct ; la caisse le prend à sa prochaine vente." />
      <div className="xp-deux">
        <div className="xp-section">
          <h2 className="xp-section-titre">Modèle de soirée</h2>
          <div className="xp-modeles">
            {MODELES.map(([id, titre, texte]) => (
              <button key={id} type="button" className={`xp-modele ${modele === id ? 'actif' : ''}`} disabled={!modifiable} onClick={() => sauverMa({ modele: id }, `${titre} choisi`)}>
                <strong>{titre}</strong><small>{texte}</small>
              </button>
            ))}
          </div>
          <div className="xp-carte">
            <div className="xp-reglage">
              <span className="xp-reglage-texte"><strong>Taille des tuiles</strong><small>Plus grandes = plus faciles à toucher, moins d’articles à l’écran.</small></span>
              <Segments libelle="Taille" valeur={tuileTaille} options={[['petite', 'Petites'], ['normale', 'Normales'], ['grande', 'Grandes']]} onChange={(v) => modifiable && sauverMa({ taille: v })} />
            </div>
            <div className="xp-reglage">
              <span className="xp-reglage-texte"><strong>Prix d’achat après l’impression</strong><small>Au tout premier ticket d’un article sans prix d’achat, la caisse le demande au gérant.</small></span>
              <Interrupteur actif={ma.demander_prix_achat !== false} desactive={!modifiable} libelle="Demander le prix d'achat" onChange={(v) => sauverMa({ demander_prix_achat: v })} />
            </div>
            <div className="xp-reglage">
              <span className="xp-reglage-texte"><strong>« Qui a servi ? »</strong><small>Les photos des serveurs à l’encaissement.</small></span>
              <Segments libelle="Qui a servi" valeur={caisse.qui_a_servi ?? 'rappel'} options={[['non', 'Non'], ['rappel', 'Proposé'], ['obligatoire', 'Obligatoire']]}
                onChange={(v) => modifiable && enregistrer('caisse', { qui_a_servi: v }).catch(() => {})} />
            </div>
            <div className="xp-reglage">
              <span className="xp-reglage-texte"><strong>Contrôle de présence</strong><small>Un bip demande à la caissière de toucher « Je suis là ». Le temps de réponse est gardé.</small></span>
              <Interrupteur actif={caisse.presence_controle === true} desactive={!modifiable} libelle="Contrôle de présence"
                onChange={(v) => enregistrer('caisse', { presence_controle: v }, v ? 'Contrôle de présence allumé' : 'Contrôle de présence éteint').catch(() => {})} />
            </div>
            {caisse.presence_controle && (
              <div className="xp-reglage">
                <span className="xp-reglage-texte"><strong>Toutes les</strong><small>minutes</small></span>
                <ChampEnPlace type="number" min={10} valeur={caisse.presence_minutes ?? 40} desactive={!modifiable} libelle="minutes entre deux contrôles"
                  onEnregistrer={(v) => enregistrer('caisse', { presence_minutes: Math.max(10, Math.min(240, Number(v) || 40)) })} />
              </div>
            )}
          </div>
        </div>
        <div className="xp-section">
          <h2 className="xp-section-titre">Aperçu</h2>
          <div className="xp-apercu-caisse" style={{ gridTemplateColumns: `repeat(${tuileTaille === 'grande' ? 2 : tuileTaille === 'petite' ? 4 : 3}, 1fr)` }}>
            {(modele === 'grosse' ? ['Moët', 'Black Label', 'Chicha', 'Primus', 'Beaufort', 'Cocktail'] : modele === 'happy' ? ['Primus', 'Ngok', 'Beaufort', 'Mojito', 'Anakin', 'Brochettes'] : ['Primus', 'Beaufort', 'Anakin', 'Moët', 'Brochettes', 'Chicha'])
              .map((n, i) => (
                <div key={n} className={`tuile ${modele === 'grosse' && i < 2 ? 'grande' : ''}`}><strong>{n}</strong><span className="texte-doux">tuile</span></div>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}
