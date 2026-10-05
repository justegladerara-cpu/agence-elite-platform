# Catalogue The Dream Lounge Bar Restaurant

Relu le 2026-10-05 sur les **6 photos originales du menu** envoyées par le propriétaire (boissons ×2, plats africains ×2,
volailles/viandes/grillades/poissons, omelettes/sandwichs/pâtes/dimanche). Ordre de priorité appliqué : photo lisible →
transcription du propriétaire → ancien CSV. Chaque prix a été relu sur une photo agrandie, en suivant les pointillés de
la ligne jusqu'au prix (les photos sont prises de biais : le prix est plus haut que le nom).

Devise : XAF (FCFA). Fichier : `catalogue.csv` (séparateur `;`).

## Chiffres de contrôle (vérifiés par `tests/import_csv_catalogue.test.js`)

| Élément | Nombre |
|---|---|
| Lignes du fichier | 228 |
| Articles vendables (lignes `actif=oui`) | 218 |
| Produits distincts vendables (une variante = un article) | 208 |
| Lignes de variante | 20 (9 vins × `Tarif 1`/`Tarif 2`, bière locale × `Sur la terrasse`/`Dans le VIP`) |
| Lignes à confirmer (sans prix, jamais créées) | 10 |
| Catégories créées par un import dans un établissement vide | 29 (30 dans le fichier ; « Boissons traditionnelles » n'a que des lignes à confirmer) |
| Poste Bar / Cuisine | 114 / 104 |
| Stock initial, recette, consommation matière | aucun (`suivi_stock=non` partout) |

## Organisation

Boissons (poste Bar) : Softs, jus & énergisants · Bières · Cocktails sans alcool · Cocktails alcoolisés · Champagnes ·
Bordeaux · Grands crus · Autres vins · Vins blancs · Vins moelleux · Vins rosés · Whisky & spiritueux · Boissons chaudes ·
Boissons traditionnelles.
Cuisine (poste Cuisine) : Planches · Grillades signature · Volailles · Viandes · Poissons braisés · Fruits de mer ·
Sauces arachide · Mwambé · Bouillons · Viandes de chasse · Légumes · Omelettes · Sandwichs · Pâtes · Spécial dimanche ·
Accompagnements.

Regroupements (moins de catégories, prise de commande plus rapide) : bières importées + locales ; cafés + chocolats + thés
= « Boissons chaudes » ; bouillons sauvages + bouillons de poisson = « Bouillons » ; « Jus de fruits » (Happy Day) dans
les softs ; « Spécial » (Vin Baron de Luze + fruits) dans « Autres vins ». Tout se réorganise ensuite dans
Articles › Catégories sans réimport.

Désignations rendues distinctes (aucune fusion d'offres différentes) : `Tequila (softs)` / `Tequila (bière)`,
`Mojito (sans alcool)` 5 000 / `Mojito` 6 500, `Chambre d’Amour moelleux` / `Chambre d’Amour rosé`,
`Bouillon poisson Bar` 3 000 / `Poisson Bar` (braisé) 3 500, `Bouillon poisson Capitaine` / `Poisson Capitaine`,
`Bikini` (sauce arachide) / `Mwambé bikini`. « Sur la terrasse » et « Dans le VIP » sont deux tarifs de la
**bière locale** selon l'espace : un article `Bière locale` à deux variantes.

Poste des boissons chaudes : **Bar** par défaut (l'ancien CSV disait Cuisine ; aucune des deux n'est confirmée).
Modifiable dans Salle › Tables et postes.

## Divergences corrigées par rapport à l'ancien CSV (2026-10-03)

| Référence | Article | Ancien | Photo |
|---|---|---|---|
| DREAM-056 | Château Petit Bois | 25 000 | **15 000** |
| DREAM-081 | Absolu Vodka | 20 000 | **30 000** |
| DREAM-082 | Cointreau | 30 000 | **20 000** |
| DREAM-083 | Jägermeister | 20 000 | **30 000** |
| DREAM-085 | Baileys | 30 000 | **25 000** |
| DREAM-087 | Saint James Rhum Blanc | 25 000 | **40 000** |
| DREAM-088 | Jameson Black Barrel | 40 000 | **25 000** |
| DREAM-089 | Martini Rosso | 25 000 | **35 000** |
| DREAM-090 | Glenfiddich | 35 000 | **45 000** |
| DREAM-091 | Chivas 18 ans | 45 000 | **30 000** |
| DREAM-092 | Hendrick’s Gin | 30 000 | **60 000** |
| DREAM-093 | Chivas XV | 60 000 | **25 000** |
| DREAM-094 | Prosecco | 25 000 | **45 000** |
| DREAM-095 | Johnnie Walker Gold Label | 45 000 | **25 000** |
| DREAM-096 | Jameson | 25 000 | **35 000** |
| DREAM-097 | Glenfiddich 12 ans | 35 000 | **25 000** |
| DREAM-080 | Camino Real Tequila Blanco | 25 000 | **à confirmer** (voir plus bas) |
| DREAM-100 | J&B Rare | 25 000 | **à confirmer** : aucun prix en face |
| DREAM-175 | Saucisse niçoise sauce blanche | 4 000 | **exclue** : son prix est barré au marqueur |
| DREAM-176 | Brochette Royal Mix | 3 000 | **4 000** |
| DREAM-226 | Côte sautée façon Dream Resto | absente | **3 000** (prix lisible, non barré) |
| DREAM-227 | Dream délice | absent | **3 000** (prix lisible) |
| DREAM-136 | Aile de poulet en sauce arachide | « fumé » | le mot « fumé » est rayé sur le menu |
| DREAM-215 | Bouillon de ngulu | 3 500 | **à confirmer** : prix touché par le marqueur |
| DREAM-221 | Chikwangue (mayaka) | 500 | **à confirmer** : désignation raturée |

L'ancienne liste des spiritueux était décalée d'une ligne : le premier prix de la colonne n'a pas de désignation et
« J&B Rare » n'a pas de prix. **Divergences avec la transcription du propriétaire** (photo retenue, lisible) :
Côte sautée façon Dream Resto (transcription : exclue → photo : 3 000, c'est la Saucisse niçoise qui est barrée),
Brochette Royal Mix (3 000 → 4 000), Dream délice (non confirmé → 3 000 lisible), Saucisse niçoise (4 000 → barrée).

## Produits exclus car volontairement barrés sur le menu

Viandes de chasse : Ngoumba, Ngoki, Gazelle, Pangolin, Sibissi. Planches : la planche dont le nom est noirci
(« Ailes de poulet grillé, viande sautée, saucisse… »), Planche Duo 2 personnes. Sauces arachide : Gazelle à la sauce
arachide, Ngumba. Mwambé : gazelle, Ngumba. Bouillons : Bouillon de gazelle (page « plats africains »), Bouillon de
ngoumba. Fruits de mer : Poulpe grillé/sauté/en sauce, Seiche, Huîtres. Volailles : Escalope de poulet (ligne noircie).
Viandes : Saucisse niçoise sauce blanche. Omelettes : Omelette nature, dernière omelette (nom noirci). Sandwichs : la
ligne au nom noirci (« pain garni de fromage et jambon poulet »), Mini burger. Pâtes : Spaghetti simple, Spaghetti
délice, Spaghetti sauce rouge Niger. Spécial dimanche : Maboké de ngulu.

Aucun de ces produits n'est dans le fichier, sous aucune forme (vérifié par test).

## À confirmer avec le client (dans le fichier, `actif=non`, jamais créés)

| Article | Motif |
|---|---|
| Camino Real Tequila Blanco | photo : 20 000 sur sa ligne ; transcription : 25 000 |
| J&B Rare | aucun prix imprimé |
| Sodabi, Vin de palme spécial Sud, Tcham spécial Nord | aucun prix imprimé |
| Mwambé mokalu | prix partiellement recouvert par le marqueur (« 3 0… ») : retiré ou non ? |
| Ngulu à la braise, Bouillon de ngulu | prix touché par le marqueur : retiré ou non ? |
| Chikwangue (mayaka) | nom raturé, prix 500 lisible : retiré ou renommé ? |
| Frites de pomme de terre | 1 000 (deux pages) et 1 500 (une page) |

Également à confirmer, sans bloquer : libellés métier des doubles tarifs de vins (`Tarif 1` / `Tarif 2`), marques
couvertes par « Bière locale », poste des boissons chaudes, et la revue de conformité locale des viandes de chasse
encore à la carte (Antilope rouge, Tortue, Mwambé tortue, Mwambé Ngoki, Bouillon de gazelle du dimanche) — aucune
hypothèse juridique n'est faite ici.

Les planches gardent leur description (2 ou 3 accompagnements au choix) ; aucun composant n'est déduit du stock.

## Application protégée (voir SOP 59)

1. Migrations `20261003000017` et `20261005000001` appliquées (SOP 12) ; sans elles l'écran affiche « l'import n'est pas
   encore activé sur ce serveur ».
2. Actions › **Vérifier un établissement** (`recherche=dream`, `identifiant=patrondream`) : relever client,
   établissement, Hub(s), modules, rôle et droits `articles.gerer`.
3. Se connecter comme `patrondream`, vérifier le nom de l'établissement actif, Articles › Importer › `catalogue.csv`.
4. Le dry-run doit annoncer, pour un catalogue vide : 218 créations, 10 à confirmer, 20 variantes, 29 catégories à créer,
   aucun avertissement, et nommer **The Dream Lounge Bar Restaurant** comme destination. Sinon, ne pas confirmer.
5. Cocher la confirmation de l'établissement, Importer, puis relancer la vérification et comparer les volumes des autres
   établissements (inchangés).

Ne jamais charger ce fichier depuis Patrondemo ou un autre établissement.
