-- Ticket de vente réglable (demande de Juste, 2026-10-23) : Paramètres › Ticket de caisse.
-- Le modèle (blocs, ordre, messages, QR code, tailles, largeur du papier) est un texte JSON dans les réglages du module
-- caisse, clé « modele_ticket ». Sans modèle, le ticket reste celui d'avant. Additif : une clé de réglage.
update public.modules set parametres_schema = parametres_schema || '[
  {"cle": "modele_ticket", "libelle": "Modèle du ticket de vente (Paramètres › Ticket de caisse)", "type": "texte", "motif": "^\\{.*\\}$"}
]'::jsonb
where id = 'caisse' and not parametres_schema @> '[{"cle": "modele_ticket"}]'::jsonb;

notify pgrst, 'reload schema';
