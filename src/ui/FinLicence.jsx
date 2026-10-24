import React, { useEffect, useState } from 'react';
import { useEspace } from '../noyau/espace.jsx';
import { dateFinLisible, finLicence, tempsRestant } from '../noyau/continuite.js';
import { Bouton, Modale } from './composants.jsx';

// Format d'une clé : ELITE-XXX-XXXX-XXXX (lettres et chiffres). Saisie tolérante : minuscules, espaces, tirets oubliés.
export function formaterCode(texte) {
  const brut = String(texte ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if ('ELITE'.startsWith(brut)) return brut;
  const corps = brut.startsWith('ELITE') ? brut.slice(5) : brut;
  const morceaux = [corps.slice(0, 3), corps.slice(3, 7), corps.slice(7, 11)].filter(Boolean);
  return morceaux.length ? `ELITE-${morceaux.join('-')}` : 'ELITE';
}
export const codeComplet = (code) => /^ELITE-[A-Z0-9]{3}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code);

// Renouveler = entrer le code d'activation reçu d'Agence Elite. Réservé au responsable de l'établissement ;
// marche même licence expirée. La licence du code remplace celle en cours, l'historique reste.
export function SaisieCodeLicence({ onActive, autoFocus = false }) {
  const { api, etablissement, notifier, recharger } = useEspace();
  const [code, setCode] = useState('');
  const [erreur, setErreur] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const activer = async (e) => {
    e.preventDefault();
    if (!codeComplet(code) || envoi) return;
    setErreur('');
    setEnvoi(true);
    try {
      const r = await api.rpc('activer_cle_licence', { p_cle: code, p_etablissement_id: etablissement.id });
      setCode('');
      const jusqua = r?.echeance ? ` jusqu’au ${new Date(`${r.echeance}T12:00:00Z`).toLocaleDateString('fr-FR')}` : '';
      notifier?.(`Licence renouvelée${jusqua}`);
      onActive?.(r);
      await recharger?.();
    } catch (err) {
      setErreur(err?.message || 'Code refusé');
    } finally {
      setEnvoi(false);
    }
  };
  return (
    <form className="saisie-code-licence" onSubmit={activer} aria-label="Entrer le code de licence">
      <label htmlFor="code-licence">Code d’activation</label>
      <input
        id="code-licence"
        value={code}
        onChange={(e) => setCode(formaterCode(e.target.value))}
        placeholder="ELITE-COM-XXXX-XXXX"
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        maxLength={19}
        autoFocus={autoFocus}
      />
      {erreur && <p className="erreur" role="alert">{erreur}</p>}
      <Bouton type="submit" variante="principal" chargement={envoi} disabled={!codeComplet(code)}>Activer la licence</Bouton>
    </form>
  );
}

// Compte à rebours de fin de licence (licences.fin_a) : affiché à toute l'équipe dans les 72 dernières heures.
export const FENETRE_COMPTE_A_REBOURS = 72 * 3600000;
const RAPPEL_CAISSE = 15 * 60000;
const DUREE_RAPPEL = 10000;
const RAPPEL_GERANT = 2 * 3600000;
const CLE_FENETRE = 'ae-fin-licence-vue';

function useMaintenant(pas = 30000) {
  const [maintenant, setMaintenant] = useState(Date.now);
  useEffect(() => {
    const id = setInterval(() => setMaintenant(Date.now()), pas);
    return () => clearInterval(id);
  }, [pas]);
  return maintenant;
}

export function finProche(etablissement, maintenant = Date.now()) {
  const fin = finLicence(etablissement);
  return fin != null && maintenant < fin && fin - maintenant <= FENETRE_COMPTE_A_REBOURS ? fin : null;
}

// Bandeau permanent (non fermable) avec le temps restant, mis à jour toutes les 30 secondes.
export function BandeauFinLicence({ contactez, gerant, naviguer }) {
  const { etablissement } = useEspace();
  const maintenant = useMaintenant();
  const fin = finProche(etablissement, maintenant);
  if (!fin) return null;
  const urgent = fin - maintenant <= 12 * 3600000;
  return (
    <div className={`bandeau fin-licence ${urgent ? 'urgent' : ''}`.trim()} role="status">
      <strong>⏳ Licence : {tempsRestant(fin - maintenant)} restantes.</strong>{' '}
      Elle se termine le {dateFinLisible(fin, etablissement.fuseau || undefined)}. Ensuite : plus de vente ni de gestion du
      stock, consultation seule. {contactez} pour la renouveler.
      {gerant && <button className="lien" onClick={() => naviguer('parametres/licence')}>Mon abonnement</button>}
    </div>
  );
}

// Rappel toutes les 15 minutes : petite carte qui ne prend pas le clic (l'encaissement n'est jamais gêné).
export function RappelFinLicence() {
  const { etablissement } = useEspace();
  const maintenant = useMaintenant(RAPPEL_CAISSE);
  const [visible, setVisible] = useState(false);
  const fin = finProche(etablissement, maintenant);
  useEffect(() => {
    if (!fin) return undefined;
    setVisible(true);
    const id = setTimeout(() => setVisible(false), DUREE_RAPPEL);
    return () => clearTimeout(id);
  }, [fin, maintenant]);
  if (!fin || !visible) return null;
  return (
    <div className="rappel-fin-licence" role="status" aria-live="polite">
      La licence se termine le {dateFinLisible(fin, etablissement.fuseau || undefined)}. Prévenez votre responsable.
    </div>
  );
}

function derniereFenetre(id) {
  try {
    return Number(sessionStorage.getItem(`${CLE_FENETRE}-${id}`)) || 0;
  } catch {
    return 0;
  }
}

function noterFenetre(id) {
  try {
    sessionStorage.setItem(`${CLE_FENETRE}-${id}`, String(Date.now()));
  } catch {
    // Non mémorisé : la fenêtre reviendra au prochain affichage.
  }
}

// Responsable : fenêtre à la connexion, puis au plus toutes les 2 heures.
export function FenetreFinLicence({ contactez, naviguer }) {
  const { etablissement, aLaPermission } = useEspace();
  const maintenant = useMaintenant(60000);
  const [ouverte, setOuverte] = useState(false);
  const fin = finProche(etablissement, maintenant);
  const gerant = Boolean(aLaPermission?.('etablissement.modifier'));
  useEffect(() => {
    if (fin && gerant && maintenant - derniereFenetre(etablissement.id) >= RAPPEL_GERANT) setOuverte(true);
  }, [fin, gerant, maintenant, etablissement?.id]);
  if (!ouverte || !fin) return null;
  const fermer = () => {
    noterFenetre(etablissement.id);
    setOuverte(false);
  };
  return (
    <Modale
      titre="Votre licence se termine bientôt"
      onFermer={fermer}
      pied={(
        <>
          <Bouton variante="secondaire" onClick={fermer}>Plus tard</Bouton>
          <Bouton variante="principal" onClick={() => { fermer(); naviguer('parametres/licence'); }}>Demander le renouvellement</Bouton>
        </>
      )}
    >
      <p><strong>Temps restant : {tempsRestant(fin - maintenant)}.</strong></p>
      <p>La licence de {etablissement.nom} se termine le {dateFinLisible(fin, etablissement.fuseau || undefined)}.</p>
      <p>
        À cette heure-là, tous les comptes seront déconnectés : plus de vente, plus d’ouverture de caisse, plus de gestion
        du stock. Vos données restent intactes et consultables.
      </p>
      <p>Avant la fin : tirez le ticket Z et réglez les additions ouvertes. {contactez} pour renouveler.</p>
      <p><strong>Déjà payé ?</strong> Entrez le code de licence reçu d’Agence Elite :</p>
      <SaisieCodeLicence onActive={fermer} />
    </Modale>
  );
}

// Après l'heure de fin : grand message plein écran, permanent (impossible à fermer), pour tous les comptes de
// l'établissement. Il disparaît seulement quand une licence payée est enregistrée.
export function EcranLicenceExpiree() {
  const { etablissement, deconnecter, aLaPermission } = useEspace();
  const responsable = Boolean(aLaPermission?.('etablissement.modifier'));
  const [saisie, setSaisie] = useState(false);
  if (finLicence(etablissement) == null) return null;
  return (
    <div className="ecran-licence-expiree" role="alertdialog" aria-modal="true" aria-labelledby="titre-licence-expiree">
      <div className="ecran-licence-expiree-carte">
        <div className="ecran-licence-expiree-icone" aria-hidden="true">⛔</div>
        <h1 id="titre-licence-expiree">Licence expirée</h1>
        <p className="ecran-licence-expiree-date">Contactez l’administrateur.</p>
        {responsable && (
          saisie ? (
            <div className="ecran-licence-expiree-code">
              <p>Entrez le code reçu d’Agence Elite : la licence est renouvelée tout de suite.</p>
              <SaisieCodeLicence autoFocus />
            </div>
          ) : (
            <div className="ecran-licence-expiree-actions">
              <Bouton variante="principal" onClick={() => setSaisie(true)}>Renouveler · entrer le code de licence</Bouton>
            </div>
          )
        )}
        {deconnecter && (
          <div className="ecran-licence-expiree-actions">
            <button type="button" className="lien" onClick={() => deconnecter()}>Se déconnecter</button>
          </div>
        )}
      </div>
    </div>
  );
}
