// Paramètres › Ticket de caisse : le patron construit son ticket de vente (demande de Juste, 2026-10-23).
// Blocs à montrer ou cacher, ordre, messages, QR code, taille du logo et du texte, largeur du papier ; aperçu en direct.
// Enregistré dans les réglages du module caisse (clé modele_ticket, migration 20261023200159).
import React, { useEffect, useMemo, useState } from 'react';
import { nomUtilisateur, useDonnees, useEspace } from '../../noyau/espace.jsx';
import { Bouton, Champ, Chargement, Erreur } from '../../ui/composants.jsx';
import { imprimer, Ticket, ZoneImpression } from './Recu.jsx';
import {
  basculerBloc, BLOCS_TICKET, blocVisible, CLE_MODELE_TICKET, deplacerBloc, ecrireModele, INFOS_TICKET, lienQr, lireModele, MODELE_PAR_DEFAUT,
} from './modeleTicket.js';

const TAILLES_LOGO = [['petit', 'Petit'], ['moyen', 'Moyen'], ['grand', 'Grand']];
const TAILLES_TEXTE = [['normal', 'Normal'], ['grand', 'Grand (plus lisible)']];
const LARGEURS = [['80', 'Papier 80 mm'], ['58', 'Papier 58 mm']];

// Vente fictive pour l'aperçu : rien n'est enregistré.
function venteExemple(etablissement, utilisateur) {
  return {
    vente: { numero: 'V-000123', cree_le: new Date().toISOString(), statut: 'validee', remise: 0, total: 3500, montant_paye: 3500, servi_par: 'Agnès' },
    etablissement: { nom: etablissement.nom, devise: etablissement.devise },
    lignes: [
      { libelle: 'Bière 65 cl', quantite: 2, prix_unitaire: 1000, remise: 0, total: 2000 },
      { libelle: 'Brochettes', quantite: 1, prix_unitaire: 1500, remise: 0, total: 1500 },
    ],
    paiements: [{ statut: 'valide', mode: 'especes', montant: 3500 }],
    point_de_vente: 'Caisse principale',
    vendeur: nomUtilisateur(utilisateur) || 'Mireille',
    contact: { nom: 'Client fidèle' },
    identite: etablissement.identite ?? {},
    documents: etablissement.marque?.documents ?? {},
    logo: etablissement.identite?.logo_url || etablissement.marque?.documents?.logo_url || null,
  };
}

function Puces({ libelle, choix, valeur, onChange, desactive }) {
  return (
    <div className="champ">
      <span className="champ-libelle">{libelle}</span>
      <div className="puces" role="group" aria-label={libelle}>
        {choix.map(([id, texte]) => (
          <button type="button" key={id} className={valeur === id ? 'actif' : ''} aria-pressed={valeur === id} disabled={desactive} onClick={() => onChange(id)}>{texte}</button>
        ))}
      </div>
    </div>
  );
}

export function ConstructeurTicket() {
  const { api, etablissement, utilisateur, peut, notifier } = useEspace();
  const etab = etablissement.id;
  const modifiable = peut('etablissement.modifier');
  const { donnees, chargement, erreur, recharger } = useDonnees(async () => {
    const [p] = await api.lire('etablissement_parametres', { eq: { etablissement_id: etab, module_id: 'caisse' } });
    return p?.data ?? {};
  }, [etab]);
  const [modele, setModele] = useState(null);
  const [envoi, setEnvoi] = useState(false);
  const [erreurEnvoi, setErreurEnvoi] = useState('');
  useEffect(() => {
    if (donnees) setModele(lireModele(donnees[CLE_MODELE_TICKET]));
  }, [donnees]);
  const exemple = useMemo(() => venteExemple(etablissement, utilisateur), [etablissement, utilisateur]);
  useEffect(() => {
    document.body.classList.add('impression-ticket');
    return () => document.body.classList.remove('impression-ticket');
  }, []);
  if (chargement && !donnees) return <Chargement />;
  if (erreur) return <Erreur message={erreur} />;
  if (!modele) return <Chargement />;

  const changerTexte = (cle) => (e) => setModele((m) => ({ ...m, textes: { ...m.textes, [cle]: e.target.value } }));
  const enregistrer = async (nouveau) => {
    setEnvoi(true);
    setErreurEnvoi('');
    try {
      const data = { ...donnees };
      if (nouveau) data[CLE_MODELE_TICKET] = ecrireModele(nouveau);
      else delete data[CLE_MODELE_TICKET];
      await api.rpc('enregistrer_parametres_module', { p_etablissement_id: etab, p_module_id: 'caisse', p_data: data });
      notifier(nouveau ? 'Ticket enregistré : les prochains reçus l’utilisent' : 'Ticket d’origine remis');
      recharger();
    } catch (err) {
      setErreurEnvoi(err.message);
    } finally {
      setEnvoi(false);
    }
  };
  const qrInvalide = blocVisible(modele, 'qr') && modele.textes.qr_lien.trim() && !lienQr(modele.textes.qr_lien);

  return (
    <div className="constructeur-ticket">
      <section className="carte pile" aria-label="Construire le ticket">
        <div>
          <h2>Le ticket de vente</h2>
          <p className="texte-doux">Choisissez ce qui s’imprime et dans quel ordre. Le numéro, la date, les articles, le total et le paiement sont toujours imprimés.</p>
        </div>
        <ol className="blocs-ticket">
          {modele.blocs.map((id, i) => {
            const bloc = BLOCS_TICKET[id];
            const visible = blocVisible(modele, id);
            return (
              <li key={id} className={`bloc-ticket${visible ? '' : ' cache'}`}>
                <div className="bloc-ticket-tete">
                  <strong>{bloc.libelle}</strong>
                  <span className="bloc-ticket-actions">
                    <button type="button" aria-label={`Monter : ${bloc.libelle}`} disabled={!modifiable || i === 0} onClick={() => setModele((m) => deplacerBloc(m, id, -1))}>↑</button>
                    <button type="button" aria-label={`Descendre : ${bloc.libelle}`} disabled={!modifiable || i === modele.blocs.length - 1} onClick={() => setModele((m) => deplacerBloc(m, id, 1))}>↓</button>
                    {bloc.fixe ? <span className="texte-doux petit">Toujours imprimé</span> : (
                      <button type="button" role="switch" aria-checked={visible} aria-label={`Imprimer : ${bloc.libelle}`} className={`interrupteur${visible ? ' actif' : ''}`} disabled={!modifiable}
                        onClick={() => setModele((m) => basculerBloc(m, id))}><span /></button>
                    )}
                  </span>
                </div>
                {visible && id === 'message_haut' && (
                  <Champ libelle="Message en haut du ticket"><textarea rows={2} maxLength={300} value={modele.textes.message_haut} onChange={changerTexte('message_haut')} placeholder="Ex. : Bienvenue ! Ouvert 24 h/24" disabled={!modifiable} /></Champ>
                )}
                {visible && id === 'message_bas' && (
                  <Champ libelle="Message en bas du ticket" aide="Vide : le message de Paramètres › Documents, sinon « Merci de votre visite. »"><textarea rows={2} maxLength={300} value={modele.textes.message_bas} onChange={changerTexte('message_bas')} placeholder="Ex. : Merci et à bientôt !" disabled={!modifiable} /></Champ>
                )}
                {visible && id === 'logo' && <Puces libelle="Taille du logo" choix={TAILLES_LOGO} valeur={modele.taille_logo} desactive={!modifiable} onChange={(v) => setModele((m) => ({ ...m, taille_logo: v }))} />}
                {visible && id === 'infos' && (
                  <div className="cases-infos" role="group" aria-label="Lignes à imprimer">
                    {INFOS_TICKET.map(([cle, texte]) => (
                      <label key={cle} className="case">
                        <input type="checkbox" checked={modele.infos[cle]} disabled={!modifiable} onChange={(e) => setModele((m) => ({ ...m, infos: { ...m.infos, [cle]: e.target.checked } }))} />
                        {texte}
                      </label>
                    ))}
                  </div>
                )}
                {visible && id === 'qr' && (
                  <>
                    <Champ libelle="Lien du QR code" aide="Un lien (https://…) ou un numéro WhatsApp" erreur={qrInvalide ? 'Ce lien ne marche pas : commencez par https:// ou écrivez un numéro.' : ''}>
                      <input value={modele.textes.qr_lien} maxLength={300} onChange={changerTexte('qr_lien')} placeholder="https://instagram.com/… ou +242 06 …" disabled={!modifiable} />
                    </Champ>
                    <Champ libelle="Texte au-dessus du QR code"><input value={modele.textes.qr_texte} maxLength={80} onChange={changerTexte('qr_texte')} placeholder="Ex. : Suivez-nous sur Instagram" disabled={!modifiable} /></Champ>
                  </>
                )}
              </li>
            );
          })}
        </ol>
        <Puces libelle="Taille du texte" choix={TAILLES_TEXTE} valeur={modele.taille_texte} desactive={!modifiable} onChange={(v) => setModele((m) => ({ ...m, taille_texte: v }))} />
        <Puces libelle="Largeur du papier" choix={LARGEURS} valeur={modele.largeur} desactive={!modifiable} onChange={(v) => setModele((m) => ({ ...m, largeur: v }))} />
        {erreurEnvoi && <Erreur message={erreurEnvoi} />}
        {modifiable ? (
          <div className="actions">
            <Bouton variante="principal" onClick={() => enregistrer(modele)} chargement={envoi} disabled={Boolean(qrInvalide)}>Enregistrer le ticket</Bouton>
            <Bouton onClick={imprimer}>Imprimer un essai</Bouton>
            <Bouton variante="discret" onClick={() => { setModele(lireModele(MODELE_PAR_DEFAUT)); enregistrer(null); }} disabled={envoi}>Remettre le ticket d’origine</Bouton>
          </div>
        ) : <p className="texte-doux">Seul le patron peut changer le ticket.</p>}
      </section>
      <section className="carte" aria-label="Aperçu du ticket">
        <h2>Aperçu</h2>
        <p className="texte-doux">Vente d’exemple, rien n’est enregistré.</p>
        <div className="ticket-apercu"><Ticket recu={exemple} modele={modele} /></div>
        <ZoneImpression><Ticket recu={exemple} modele={modele} /></ZoneImpression>
      </section>
    </div>
  );
}
