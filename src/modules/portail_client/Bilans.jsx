import React, { useState } from 'react';
import { useDonnees, useEspace } from '../../noyau/espace.jsx';
import { formatDate, formatDateHeure } from '../../noyau/format.js';
import { Badge, Bouton, Champ, Erreur, Modale, Squelette } from '../../ui/composants.jsx';
import ChiffresBilan from '../../ui/ChiffresBilan.jsx';

// Bilans de collaboration d'un client : brouillon chiffré par la base, synthèse et prochaines actions écrites par
// l'équipe, publication dans l'espace du client (accusé de lecture), retrait. Un bilan publié ne se modifie plus.
export const STATUTS_BILAN = { brouillon: ['Brouillon', 'orange'], publie: ['Publié', 'vert'], retire: ['Retiré', 'neutre'] };
const jourIso = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

export default function Bilans({ contact, proposition }) {
  const { api, etablissement, peut, notifier } = useEspace();
  const gerer = peut('portail_client.gerer');
  const [edition, setEdition] = useState(null);
  const [erreur, setErreur] = useState('');
  const { donnees: bilans, recharger } = useDonnees(
    () => api.lire('bilans_client', { eq: { etablissement_id: etablissement.id, contact_id: contact.id }, ordre: ['au', 'desc'] }),
    [etablissement.id, contact.id],
  );
  const agir = async (fn, message) => {
    setErreur('');
    try {
      await fn();
      notifier(message);
      recharger();
    } catch (err) {
      setErreur(err.message);
    }
  };
  if (!bilans) return <Squelette lignes={3} />;
  const nouveau = () => {
    const au = new Date();
    const du = new Date(au);
    du.setMonth(du.getMonth() - 3);
    setEdition({ du: proposition?.du ?? jourIso(du), au: proposition?.au ?? jourIso(au) });
  };
  return (
    <div className="pile">
      <p className="texte-doux">Un bilan chiffré de la période (factures, paiements, projets, assistance, rendez-vous), avec votre synthèse et les prochaines actions. Publié, il apparaît dans l’espace du client.</p>
      {gerer && <div><Bouton variante="principal" icone="plus" onClick={nouveau}>Préparer un bilan</Bouton></div>}
      <Erreur message={erreur} />
      {!bilans.length && <p className="texte-doux">Aucun bilan pour ce client.</p>}
      {bilans.map((b) => {
        const [libelle, ton] = STATUTS_BILAN[b.statut];
        return (
          <section key={b.id} className="carte pile">
            <h3>{b.numero} · {b.titre} <Badge ton={ton}>{libelle}</Badge></h3>
            <p className="texte-doux">
              Du {formatDate(b.du)} au {formatDate(b.au)}
              {b.publie_le ? ` · publié le ${formatDateHeure(b.publie_le)}` : ''}
              {b.statut === 'publie' ? (b.vu_le ? ` · lu par le client le ${formatDateHeure(b.vu_le)}` : ' · pas encore lu') : ''}
            </p>
            <ChiffresBilan chiffres={b.chiffres} />
            {b.synthese && <><h4>Synthèse</h4><p className="texte-multiligne">{b.synthese}</p></>}
            {b.prochaines_actions && <><h4>Prochaines actions</h4><p className="texte-multiligne">{b.prochaines_actions}</p></>}
            {gerer && (
              <div className="groupe-boutons">
                {b.statut === 'brouillon' && <Bouton onClick={() => setEdition(b)}>Modifier</Bouton>}
                {b.statut === 'brouillon' && <Bouton variante="principal" onClick={() => agir(() => api.rpc('publier_bilan_client', { p_bilan_id: b.id }), 'Bilan publié dans l’espace du client')}>Publier au client</Bouton>}
                {b.statut === 'publie' && <Bouton onClick={() => agir(() => api.rpc('publier_bilan_client', { p_bilan_id: b.id, p_publier: false }), 'Bilan retiré de l’espace du client')}>Retirer</Bouton>}
              </div>
            )}
          </section>
        );
      })}
      {edition && <ModaleBilan bilan={edition} contact={contact} onFermer={() => setEdition(null)} onFait={() => { setEdition(null); notifier('Bilan enregistré (brouillon)'); recharger(); }} />}
    </div>
  );
}

function ModaleBilan({ bilan, contact, onFermer, onFait }) {
  const { api, etablissement } = useEspace();
  const [v, setV] = useState({ du: bilan.du, au: bilan.au, titre: bilan.titre ?? '', synthese: bilan.synthese ?? '', prochaines_actions: bilan.prochaines_actions ?? '' });
  const [erreur, setErreur] = useState('');
  const changer = (c) => (e) => setV({ ...v, [c]: e.target.value });
  const valider = async (e) => {
    e.preventDefault();
    setErreur('');
    try {
      await api.rpc('enregistrer_bilan_client', { p_etablissement_id: etablissement.id, p: { ...v, id: bilan.id, contact_id: contact.id } });
      onFait();
    } catch (err) {
      setErreur(err.message);
    }
  };
  return (
    <Modale titre={bilan.id ? `Modifier ${bilan.numero}` : 'Préparer un bilan'} onFermer={onFermer} large>
      <form className="formulaire" onSubmit={valider}>
        <div className="deux-colonnes">
          <Champ libelle="Du"><input type="date" value={v.du} onChange={changer('du')} required /></Champ>
          <Champ libelle="Au"><input type="date" value={v.au} onChange={changer('au')} required /></Champ>
        </div>
        <Champ libelle="Titre (facultatif)"><input value={v.titre} onChange={changer('titre')} maxLength={160} placeholder="Bilan du … au …" /></Champ>
        <Champ libelle="Synthèse : ce que la collaboration a apporté"><textarea rows={4} value={v.synthese} onChange={changer('synthese')} maxLength={4000} /></Champ>
        <Champ libelle="Prochaines actions proposées"><textarea rows={4} value={v.prochaines_actions} onChange={changer('prochaines_actions')} maxLength={4000} /></Champ>
        <p className="texte-doux">Les chiffres sont recalculés à chaque enregistrement, puis une dernière fois à la publication.</p>
        <Erreur message={erreur} />
        <div className="actions">
          <Bouton type="button" onClick={onFermer}>Annuler</Bouton>
          <Bouton type="submit" variante="principal">Enregistrer le brouillon</Bouton>
        </div>
      </form>
    </Modale>
  );
}
