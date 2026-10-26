import React, { lazy, Suspense, useState } from 'react';
import { useDonnees, useEspace } from '../../noyau/espace.jsx';
import { Bouton, Champ, Chargement, Erreur, Icone, lireImageReduite, Squelette } from '../../ui/composants.jsx';
import { ImageQr, dessinerToile } from '../caisse/qrOutils.jsx';
import { EnteteXp, Interrupteur, PhotoServeur, Segments, Tuile } from './communs.jsx';

// Équipe (nouvelle version The Dream) : les serveurs (photo, rôle, téléphone, statut) avec un bouton « Modifier »
// bien visible ; les comptes de l'équipe (ancien écran Équipe) ; et un créateur de badges (couleurs, logo, QR
// personnel) à imprimer ou partager sur WhatsApp. Tout au même endroit.
const GestionEquipe = lazy(() => import('../etablissement/Equipe.jsx').then((m) => ({ default: m.GestionEquipe })));

const STATUTS = [['actif', 'Au travail'], ['conge', 'En congé'], ['parti', 'Parti']];
const COULEURS_BADGE = [
  ['nuit', 'Noir et or', { fond: '#0B0B0D', fond2: '#2A2414', accent: '#D4AF37' }],
  ['ivoire', 'Ivoire et or', { fond: '#201B10', fond2: '#3A3016', accent: '#E8C66A' }],
  ['emeraude', 'Nuit et émeraude', { fond: '#07140E', fond2: '#123524', accent: '#2FBF71' }],
  ['bordeaux', 'Nuit et rubis', { fond: '#160709', fond2: '#3A1016', accent: '#E5484D' }],
];

export default function Equipe() {
  const { api, etablissement, peut, notifier, enregistrerReglages, reglagesFonctions } = useEspace();
  const etab = etablissement.id;
  const [vue, setVue] = useState('serveurs');
  const [ajout, setAjout] = useState('');
  const [edition, setEdition] = useState(null);
  const modifiable = peut('etablissement.modifier');
  const peutComptes = peut('membres.lire');
  const apparence = reglagesFonctions.etablissement?.apparence ?? {};
  const badge = { couleur: 'nuit', logo: true, devise: 'Votre avis en 10 secondes', ...(apparence.badge ?? {}) };
  const { donnees, chargement, erreur, recharger } = useDonnees(async () => {
    const [serveurs, qr] = await Promise.all([
      api.lire('serveurs_caisse', { eq: { etablissement_id: etab, actif: true }, ordre: ['prenom'] }),
      api.lire('qr_codes', { eq: { etablissement_id: etab, actif: true }, ordre: ['cree_le'] }).catch(() => []),
    ]);
    const menu = qr.find((q) => /menu/i.test(q.nom)) ?? qr[0] ?? null;
    return { serveurs: serveurs.filter((s) => !s.fusionne_dans), jeton: menu?.jeton ?? null };
  }, [etab]);
  const [locaux, setLocaux] = useState({});

  const enregistrerBadge = async (changement) => {
    try {
      await enregistrerReglages('etablissement', { apparence: { ...apparence, badge: { ...badge, ...changement } } });
      notifier('Badge enregistré');
    } catch (err) {
      notifier(err.message, 'erreur');
    }
  };
  const fiche = async (s, p, message = 'Fiche enregistrée') => {
    const r = await api.rpc('modifier_fiche_serveur', { p_serveur_id: s.id, p });
    setLocaux((l) => ({ ...l, [s.id]: r }));
    notifier(message);
    return r;
  };
  const photo = async (s, fichier) => {
    if (!fichier) return;
    try {
      const image = await lireImageReduite(fichier, 320);
      const r = await fiche(s, { photo_url: image }, `Photo de ${s.prenom} enregistrée`);
      setEdition((e) => (e && e.id === s.id ? { ...e, photo_url: r.photo_url } : e));
    } catch (err) {
      notifier(err.message, 'erreur');
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
  const origine = `${window.location.origin}${window.location.pathname}`;
  const lienAvis = donnees.jeton ? `${origine}#/avis/${donnees.jeton}` : null;
  const auTravail = serveurs.filter((s) => (s.statut ?? 'actif') === 'actif');
  const theme = (COULEURS_BADGE.find(([id]) => id === badge.couleur) ?? COULEURS_BADGE[0])[2];
  const marque = etablissement.identite?.nom_commercial ?? etablissement.nom;
  const logoMarque = badge.logo ? (etablissement.identite?.logo_url ?? etablissement.marque?.logo_url ?? null) : null;

  const partager = async (s) => {
    try {
      const toile = await dessinerBadge({ serveur: s, marque, theme, logo: logoMarque, lienAvis, devise: badge.devise });
      const blob = await new Promise((r) => toile.toBlob(r, 'image/png'));
      const fichier = new File([blob], `badge-${s.prenom}.png`, { type: 'image/png' });
      if (navigator.canShare?.({ files: [fichier] })) {
        await navigator.share({ files: [fichier], title: `Badge ${s.prenom}` });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `badge-${s.prenom}.png`;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
        window.open('https://wa.me/', '_blank', 'noopener');
        notifier('Badge enregistré : joignez-le dans WhatsApp');
      }
    } catch (err) {
      notifier(err.message || 'Partage impossible', 'erreur');
    }
  };

  return (
    <div className="xp-page">
      <EnteteXp surtitre={etablissement.nom} titre="Équipe"
        sousTitre={`${auTravail.length} au travail · ${serveurs.length - auTravail.length} en congé ou partis.`}>
        <Segments libelle="Vue" valeur={vue} onChange={setVue}
          options={[['serveurs', 'Les serveurs'], ...(peutComptes ? [['comptes', 'Comptes et accès']] : []), ['badges', 'Badges']]} />
        {vue === 'badges' && <Bouton icone="imprimer" onClick={imprimer}>Imprimer tout</Bouton>}
      </EnteteXp>

      {vue === 'serveurs' && (
        <>
          <div className="xp-grille">
            {serveurs.map((s) => {
              const enEdition = edition?.id === s.id;
              return (
                <div key={s.id} className={`xp-tuile ${s.statut === 'parti' ? 'xp-reco masquee' : ''}`}>
                  <span className="xp-tuile-tete" style={{ gap: 14 }}>
                    <label className="xp-photo-change" title={enEdition ? 'Changer la photo' : undefined}>
                      <PhotoServeur prenom={s.prenom} photo={s.photo_url} taille={64} />
                      {enEdition && <input type="file" accept="image/*" capture="user" className="sr-only" onChange={(e) => photo(s, e.target.files?.[0])} />}
                    </label>
                    <span className="xp-ligne-texte">
                      <strong>{s.prenom}</strong>
                      <small className="texte-doux">{s.role ?? 'Serveur'}{s.telephone ? ` · ${s.telephone}` : ''}</small>
                      <small className={`xp-verdict ${s.statut === 'parti' ? 'mauvais' : s.statut === 'conge' ? 'vigilance' : 'bon'}`} style={{ alignSelf: 'flex-start' }}>
                        {STATUTS.find((x) => x[0] === (s.statut ?? 'actif'))[1]}
                      </small>
                    </span>
                  </span>
                  {enEdition ? (
                    <FormServeur serveur={edition} onChange={(champ, v) => setEdition((e) => ({ ...e, [champ]: v }))}
                      onEnregistrer={async () => {
                        try {
                          await fiche(s, { prenom: edition.prenom.trim() || s.prenom, role: edition.role, telephone: edition.telephone, statut: edition.statut }, `${s.prenom} enregistré`);
                          setEdition(null);
                        } catch (err) { notifier(err.message, 'erreur'); }
                      }}
                      onAnnuler={() => setEdition(null)} />
                  ) : modifiable ? (
                    <span className="xp-produit-actions">
                      <Bouton icone="parametres" onClick={() => setEdition({ id: s.id, prenom: s.prenom, role: s.role ?? 'Serveur', telephone: s.telephone ?? '', statut: s.statut ?? 'actif', photo_url: s.photo_url })}>Modifier</Bouton>
                    </span>
                  ) : null}
                </div>
              );
            })}
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

      {vue === 'comptes' && peutComptes && (
        <Suspense fallback={<Squelette lignes={6} />}>
          <div className="page-integree">
            <GestionEquipe etablissementId={etab} nomEtablissement={marque} modulesActifs={etablissement.modules}
              peutGerer={peut('membres.gerer')} roleActuel={etablissement.role} hubs={(etablissement.hubs ?? []).filter((h) => h.actif)} />
          </div>
        </Suspense>
      )}

      {vue === 'badges' && (
        <>
          <section className="xp-carte xp-section">
            <h2 className="xp-section-titre">Créateur de badge</h2>
            <div className="xp-badge-reglages">
              <Champ libelle="Couleurs">
                <Segments libelle="Couleurs du badge" valeur={badge.couleur} onChange={(v) => enregistrerBadge({ couleur: v })}
                  options={COULEURS_BADGE.map(([id, nom]) => [id, nom])} />
              </Champ>
              <label className="xp-reglage">
                <span>Logo du bar sur le badge</span>
                <Interrupteur actif={badge.logo} libelle="Logo sur le badge" onChange={(v) => enregistrerBadge({ logo: v })} />
              </label>
              <Champ libelle="Petite phrase sous le QR">
                <input value={badge.devise} maxLength={40} onChange={(e) => enregistrerBadge({ devise: e.target.value })} aria-label="Phrase du badge" />
              </Champ>
            </div>
            {!lienAvis && <p className="texte-doux">Créez le QR « Menu The Dream » (page QR et avis) pour ajouter le QR d’avis sur les badges.</p>}
          </section>
          <div className="xp-badges zone-badges">
            {auTravail.map((s) => (
              <div key={s.id} className="xp-badge-carte">
                <div className="xp-badge" style={{ '--badge-fond': theme.fond, '--badge-fond2': theme.fond2, '--badge-accent': theme.accent }}>
                  <span className="xp-badge-marque">{badge.logo && logoMarque ? <img src={logoMarque} alt="" className="xp-badge-logo" /> : marque}</span>
                  <PhotoServeur prenom={s.prenom} photo={s.photo_url} taille={110} />
                  <div>
                    <p className="xp-badge-nom">{s.prenom}</p>
                    <span className="xp-badge-role">{s.role ?? 'Serveur'}</span>
                  </div>
                  {lienAvis
                    ? <div className="xp-badge-qr"><ImageQr texte={lienAvis} libelle={`avis ${s.prenom}`} /></div>
                    : <small>QR d’avis à créer</small>}
                  <small className="xp-badge-devise">{badge.devise}</small>
                </div>
                <Bouton icone="message" className="bouton secondaire xp-pas-imprimer" onClick={() => partager(s)}>Partager sur WhatsApp</Bouton>
              </div>
            ))}
            {!auTravail.length && <p className="texte-doux">Aucun serveur au travail. Ajoutez-en dans « Les serveurs ».</p>}
          </div>
        </>
      )}
    </div>
  );
}

function FormServeur({ serveur, onChange, onEnregistrer, onAnnuler }) {
  return (
    <div className="xp-form-serveur">
      <Champ libelle="Prénom"><input value={serveur.prenom} maxLength={40} onChange={(e) => onChange('prenom', e.target.value)} /></Champ>
      <Champ libelle="Rôle"><input value={serveur.role} maxLength={40} onChange={(e) => onChange('role', e.target.value)} placeholder="Serveur, barman…" /></Champ>
      <Champ libelle="Téléphone"><input value={serveur.telephone} maxLength={30} onChange={(e) => onChange('telephone', e.target.value)} inputMode="tel" /></Champ>
      <Champ libelle="Statut"><Segments libelle="Statut" valeur={serveur.statut} options={STATUTS} onChange={(v) => onChange('statut', v)} /></Champ>
      <div className="actions">
        <Bouton type="button" onClick={onAnnuler}>Annuler</Bouton>
        <Bouton type="button" variante="principal" icone="coche" onClick={onEnregistrer}>Enregistrer</Bouton>
      </div>
    </div>
  );
}

// Dessine un badge en PNG (fond, photo ronde, nom, rôle, QR d'avis, phrase) : partageable sur WhatsApp, hors ligne.
async function dessinerBadge({ serveur, marque, theme, logo, lienAvis, devise }) {
  const L = 720;
  const H = 1120;
  const toile = document.createElement('canvas');
  toile.width = L; toile.height = H;
  const ctx = toile.getContext('2d');
  const grad = ctx.createRadialGradient(L / 2, -60, 60, L / 2, 120, H);
  grad.addColorStop(0, theme.fond2);
  grad.addColorStop(0.62, theme.fond);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, L, H);
  ctx.strokeStyle = theme.accent;
  ctx.lineWidth = 3;
  ctx.globalAlpha = 0.5;
  ctx.strokeRect(26, 26, L - 52, H - 52);
  ctx.globalAlpha = 1;
  const chargerImage = (src) => new Promise((res) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
  // Marque ou logo
  if (logo) {
    const img = await chargerImage(logo);
    if (img) {
      const w = 220; const h = (img.height / img.width) * w;
      ctx.drawImage(img, (L - w) / 2, 70, w, Math.min(h, 120));
    }
  } else {
    ctx.fillStyle = theme.accent;
    ctx.font = '600 44px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText(marque, L / 2, 130, L - 120);
  }
  // Photo ronde ou initiales
  const r = 150; const cx = L / 2; const cy = 380;
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.closePath(); ctx.clip();
  const photo = serveur.photo_url ? await chargerImage(serveur.photo_url) : null;
  if (photo) {
    const rapport = Math.max((r * 2) / photo.width, (r * 2) / photo.height);
    const w = photo.width * rapport; const h = photo.height * rapport;
    ctx.drawImage(photo, cx - w / 2, cy - h / 2, w, h);
  } else {
    ctx.fillStyle = theme.fond2;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    ctx.fillStyle = theme.accent;
    ctx.font = '700 120px Georgia, serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText((serveur.prenom || '?').slice(0, 1).toUpperCase(), cx, cy + 6);
    ctx.textBaseline = 'alphabetic';
  }
  ctx.restore();
  ctx.lineWidth = 6; ctx.strokeStyle = theme.accent;
  ctx.beginPath(); ctx.arc(cx, cy, r + 4, 0, Math.PI * 2); ctx.stroke();
  // Nom et rôle
  ctx.fillStyle = '#F5F1E6';
  ctx.font = '700 64px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.fillText(serveur.prenom || '', L / 2, 640, L - 120);
  ctx.fillStyle = theme.accent;
  ctx.font = '600 28px Arial, sans-serif';
  ctx.fillText((serveur.role ?? 'Serveur').toUpperCase(), L / 2, 686, L - 120);
  // QR d'avis
  if (lienAvis) {
    const qr = await dessinerToile(lienAvis, { largeur: 300, fondBlanc: true });
    const q = 300; const qx = (L - q) / 2; const qy = 740;
    ctx.fillStyle = '#fff';
    ctx.fillRect(qx - 14, qy - 14, q + 28, q + 28);
    ctx.drawImage(qr, qx, qy, q, q);
  }
  if (devise) {
    ctx.fillStyle = 'rgba(245,241,230,0.8)';
    ctx.font = '400 24px Arial, sans-serif';
    ctx.fillText(devise, L / 2, 1090, L - 100);
  }
  return toile;
}
