# Conception — Structure, direction artistique, expérience

**Principe directeur :** la 3D sert l'expérience, jamais un obstacle. En 5 secondes on comprend ce qu'on vend
(« Cartes cadeaux numériques · Livraison instantanée par e-mail »), en 3 clics on achète
(carte → Payer → PayPal / carte bancaire).

---

## 1. Structure

### Trois boutiques ouvertes, une seule architecture

| | Générale | Black Friday | Noël |
|---|---|---|---|
| Articles | 14 cartes | 8 cartes + 3 packs | 12 cartes + 4 packs |
| Sections | 5 rayons (Gaming, Apple et Google, Divertissement, Shopping, Services numériques) | Packs, Gaming, Shopping, Services numériques | Packs, Pour le gamer, Pour toute la famille, Pour elle / lui, Pour les fans de smartphone, Pour les indécis, Pour les étudiants et les pros |
| URL | `/shop/general` | `/shop/black-friday` | `/shop/christmas` |

Chaque boutique occupe **le même bâtiment** : 8 emplacements de vitrine le long des murs, un tapis central,
un comptoir au fond, deux portes vers les autres boutiques, un pupitre « Service client » à l'entrée.
Les sections remplissent les emplacements dans l'ordre (gauche, droite, en avançant). Les emplacements libres
reçoivent un décor du thème. Seuls les matières, couleurs, lumière et décor changent. Les modèles sont donc
réutilisés et la scène reste légère.

### Se déplacer librement (jamais bloqué)

| | Ordinateur | Téléphone |
|---|---|---|
| Regarder autour | glisser la souris | glisser un doigt |
| Avancer / reculer | molette, Z/S ou ↑/↓, joystick | pincer / écarter deux doigts, joystick |
| Tourner | Q/E ou ←/→, joystick | joystick |
| Aller à un endroit | cliquer au sol (un anneau indique la destination) | toucher le sol |
| Faire défiler une vitrine | glisser sur les cartes, molette horizontale | glisser sur les cartes |
| Prendre du recul | bouton « Reculer », Échap, Retour arrière, molette vers soi | bouton « Reculer », pincer |

**Vitrines :** toutes les cartes d'un rayon sont exposées en même temps (plus rien de caché). Les cartes
standard tiennent sur une rangée de présentoirs en verre ; quatre packs se répartissent sur deux étagères.
La carte survolée avance légèrement et s'éclaire ; au clavier, les flèches passent d'une carte à l'autre.
Une légende annonce le rayon et son nombre de cartes (« Gaming · 4 cartes »).

**Musique par boutique** (bouton haut-parleur dans la barre, coupée par défaut) : lounge feutré pour la
boutique générale, boucle électro rythmée pour le Black Friday, « Jingle Bells » (domaine public) aux
clochettes et grelots pour Noël. Changement en fondu au passage d'une porte.

Devant une vitrine, on n'est jamais verrouillé : il suffit de regarder ailleurs, de reculer ou de marcher.
La barre du bas sert de raccourci (rayon, comptoir, portes) et s'allume selon l'endroit où l'on regarde.
Les murs, vitrines, comptoir et décors délimitent la zone où l'on peut marcher.

### Parcours spatial

1. **Façade de rue** au crépuscule (chaque vitrine a son enseigne au-dessus, la vitrine Black Friday affiche la bannière « Vente flash » animée et un autocollant « −10 % ») : enseigne en relief, vitrine Black Friday à gauche, catalogue général au
   centre avec la porte vitrée « Ouvert », vitrine Noël à droite. Bouton **Entrer**. Toucher une vitrine fait entrer dans cette boutique.
2. **Accueil** : vue dans l'allée, toutes les vitrines visibles.
3. **Vitrines** : une station par section. Les cartes sont alignées sur une étagère en verre ; on les fait
   glisser (doigt, souris, molette, flèches) avec inertie. La carte centrale grandit, s'éclaire, un reflet
   balaie la vitre. Toucher une carte : zoom caméra, puis la fiche s'ouvre.
4. **Comptoir** : un lieu de passage entre les portes, avec le présentoir « À ne pas manquer » (2 à 3 produits
   de chacune des autres boutiques) et le panier matérialisé (les cartes ajoutées s'empilent sur un plateau,
   un panneau lumineux affiche le nombre d'articles). Le comptoir n'est **pas cliquable** : un clic ou un
   défilement maladroit ne peut jamais ouvrir le paiement. On paie uniquement par le bouton panier de la barre
   du haut (ou « Acheter » dans une fiche).
5. **Portes** : de vrais portails, habillés aux couleurs de la boutique cible. Au-dessus, une enseigne lumineuse
   qui dit où l'on va (« BOUTIQUE · BLACK FRIDAY » en néon rouge avec éclairs, « Boutique de Noël » en lettres d'or
   avec ampoules et houx, « Boutique · Générale » en laiton rétroéclairé, avec le slogan dessous). À travers la porte
   vitrée, on voit l'allée de la boutique voisine (vitrines lumineuses, plafond, sol) ; un bandeau dépoli porte son nom,
   la lumière de la boutique se répand au sol avec son nom peint. Néons doubles pour le Black Friday, guirlande
   d'ampoules et couronne pour Noël, appliques en laiton pour la générale. Transition d'une seconde : la porte
   s'ouvre, la caméra la franchit, la couleur de la nouvelle boutique envahit l'écran, l'ambiance change.

Une barre de stations en bas (« Gaming », « Comptoir », « Porte Noël »…) permet tout ce déplacement en un toucher.

## 2. Direction artistique

**Concept :** une vraie boutique haut de gamme au crépuscule. L'interface est une fine couche de verre posée
sur la scène, aux couleurs de la boutique où l'on se trouve.

**Typographie :** *Bodoni Moda* (enseigne, noms de boutique, nom du produit, prix), un didone de vitrine de
luxe utilisé avec retenue. *Manrope* pour tout le reste : lisible en petit, chiffres alignés pour les prix.

| | Générale | Black Friday | Noël |
|---|---|---|---|
| Murs | blanc cassé `#F7F5F0` | noir `#121214`, béton | rouge profond `#5E0F16`, papier rayé |
| Sol | marbre blanc veiné | béton sombre | parquet acajou |
| Comptoir | plateau marbre, façade chêne clair, liseré laiton, LED | plateau laqué noir, façade béton, néon rouge | plateau acajou, façade vert sapin, liseré or |
| Vitrines | verre clair peu réfléchissant, cadre laiton fin, fond bleu marine profond derrière les cartes | verre fumé, cadre noir mat | verre clair, cadre doré, givre aux coins |
| Accent | bleu marine `#1B2A41`, laiton `#C9A24B` | rouge `#FF2D3A`, orange `#FF7A1A` | vert sapin `#1E4D2B`, or `#D4AF37` |
| Décor | plantes, suspensions | néons au plafond, enseigne néon, compte à rebours | neige légère, guirlandes qui scintillent, sapins |
| Son | nappe douce | pulsation grave | clochettes |

**Rendu « réaliste, chic, numérique » :** sol poli qui reflète la vraie salle (capture de la boutique), halo
lumineux autour des rubans LED, néons, écran et guirlandes, brume très légère pour la profondeur, murs cannelés
lavés de lumière par une corniche LED, caissons lumineux derrière les cartes, cartes brillantes avec ombre portée,
étiquettes de prix en verre fumé, titres de rayons en lettres lumineuses flottantes, écran numérique animé au fond
(compte à rebours sur l'écran du Black Friday), panneau holographique du panier au-dessus du comptoir, sapins faits
de points de lumière pour Noël, colonnes de verre lumineuses pour la boutique générale, trottoir mouillé et
lampadaires sur la façade.

**Lumière précalculée :** sols, murs et plafond sont peints une fois par boutique avec leurs flaques de lumière
sous les spots, les « coups de lumière » au mur au-dessus des vitrines et les ombres de contact sous les
meubles. Ces surfaces ne coûtent aucun calcul d'éclairage. Seuls les meubles et le métal réagissent à la lumière
(et aux reflets sur les appareils qui le supportent).

**Cartes :** de simples plans texturés (vos visuels, sans retouche), coins arrondis, étiquette de prix
sous chaque carte. Les cartes standard sont au format carte bancaire ; les packs, en format large.

## 3. Expérience utilisateur

- **Barre toujours visible** : les 3 boutiques, la recherche, le panier avec son total. On peut tout faire
  depuis la barre sans jamais explorer.
- **Mini-guide** en 3 étapes à la première entrée (« Glisse pour voir les cartes », « Touche une carte pour la
  choisir », « Passe au comptoir pour payer »), ignorable en un geste, jamais répété.
- **Fiche produit**, toujours dans le même ordre : nom, visuel, description (ou contenu + pour qui pour un pack),
  valeurs disponibles (pastilles 20 / 25 / 50 / 75 / 100 € + curseur et saisie libre de 20 à 100 € pour les cartes,
  valeur fixe sinon), quantité (1 à `experience.quantiteMax`, 10 par défaut), prix de vente et total, pays de validité,
  format numérique, conditions d'utilisation, instructions générales, disponibilité, livraison. Boutons
  « Acheter · total » et « Ajouter au panier » toujours accessibles en bas, avec le récapitulatif
  (« 3 × Steam · 25 € », « Déjà dans ton panier : 1 »).
  Sur ordinateur, la fiche est une grande fenêtre en deux colonnes : la carte reste visible à gauche, posée sur un
  socle lumineux ; elle s'incline sous la souris, un reflet la balaie et son montant s'affiche dans un badge.
  Sur téléphone, c'est une feuille qui monte du bas. Le stock est vérifié pour la quantité demandée (réponse
  oui / non, jamais le nombre de codes) : s'il n'y en a pas assez, un message invite à réduire la quantité. Mentions « Livraison instantanée
  par e-mail », « Paiement sécurisé » et liens FAQ, Avis, Support, CGV, Remboursement, Conditions d'utilisation.
- **Caisse sur un seul écran** : lignes du panier, total, e-mail (« Ton code sera envoyé à … »),
  bouton PayPal et bouton Carte bancaire.
- **Confirmation animée** : la carte descend et se pose sur un plateau doré avec une coche. Elle affiche le numéro
  de commande, la date, le récapitulatif et le montant payé, ainsi que l'adresse e-mail d'envoi. Le code n'apparaît
  **jamais à l'écran** : il n'est envoyé que par e-mail.
- **Recherche instantanée** par marque, catégorie, destinataire, avec suggestions et clavier.
- **Idée cadeau** : « Pour qui ? » (catégories réelles du catalogue) + budget → 3 propositions.
- **Rappel du panier** laissé de côté (après 30 minutes), panier unique conservé entre boutiques et visites.
- **Mise en avant par période** : badge « À la une » et vitrine de façade mise en valeur selon les dates de la config.
- **Mode simple** toujours accessible (menu) : catalogue 2D équivalent, chargé dans la page même sans JavaScript
  et activé automatiquement si l'appareil ne gère pas la 3D.
- **Messages d'erreur qui expliquent quoi faire** : « Il manque le @ dans ton adresse e-mail »,
  « Choisis un montant entre 20 € et 100 € », « Ton moyen de paiement a été refusé : choisis-en un autre ».

## 4. Fluidité et qualité adaptative

- Courbes d'animation douces (accélération / décélération), souffle de caméra discret, parallaxe à la souris.
- « Réduire les animations » respecté : transitions instantanées, aucune animation décorative.
- Qualité selon l'appareil (mémoire, cœurs, écran tactile), puis selon les images par seconde mesurées
  (objectif 60 sur ordinateur, 30 sur téléphone) : résolution, neige et reflets baissent sans que le visiteur le remarque.
- Chargement progressif : la façade s'affiche tout de suite, les textures (copies légères des visuels) arrivent
  en arrière-plan avec une fine barre de progression dorée.
- Son coupé par défaut, activable en un clic (menu).

## 5. Accessibilité

Navigation clavier (flèches dans les vitrines, Entrée pour choisir, Page haut/bas entre les stations, Échap
pour fermer), focus visible, tiroirs en `dialog` avec piège à focus, contrastes vérifiés par boutique,
textes de 16 px minimum sur mobile pour les champs, mode simple lisible par lecteur d'écran.

## 6. Vente flash (Black Friday)

Remise de 10 % sur les packs du Black Friday, appliquée par le serveur et visible partout :

- **Page normale** : grand bandeau en tête de boutique (« −10 % » géant aux couleurs du feu avec effet glitch,
  compte à rebours jours / heures / min / sec, sol quadrillé qui défile, faisceaux, étincelles, ruban jaune
  « VENTE FLASH » qui défile), tuiles des packs avec bordure lumineuse tournante, autocollant « −10 % » et prix barré.
- **3D** : vitrine des packs entourée d'ampoules en chenillard, bannière « VENTE FLASH » animée (bandes jaunes et noires,
  compte à rebours), deux projecteurs qui balaient, étincelles qui montent, halo rouge au sol qui respire,
  autocollant « −10 % » sur chaque pack, étiquettes au prix barré.
- **Partout** : ruban sous la barre du haut (touche « Voir » → emmène à la vitrine des packs), fiche avec bloc
  « Vente flash » et compte à rebours, panier avec remise, e-mail avec « (−10 %) ».

## 7. Offre de Noël et petites fêtes

- **Offre de Noël** (−10 % sur les packs de Noël) : même logique que la vente flash, mise en scène différente.
  Page normale : bandeau velours rouge à cadre doré, guirlande d'ampoules qui scintille, neige qui tombe, ruban
  cadeau doré avec son nœud, « −10 % » en lettres d'or italiques, compte à rebours dans des boules vertes,
  ruban satin « Joyeux Noël » qui défile. Tuiles : bordure or-rouge-vert, boule de sapin « −10 % » qui se balance.
  3D : bannière de Noël animée (guirlande, neige, lettres d'or), guirlande multicolore qui scintille autour de la
  vitrine des packs, lumière chaude qui balaie, poussière dorée qui tombe, boules « −10 % » sur chaque pack.
- **Confettis** aux couleurs de la boutique quand on ajoute au panier (éclairs pour le Black Friday, flocons et
  étoiles pour Noël, or et bleu nuit pour la générale) et grande pluie de confettis quand la commande est réussie.

## 8. Cartes en vitrine : éclat et vie

- **Couleurs franches** : luminosité des cartes remise à 100 %, reflet gris de la salle presque supprimé sur la carte
  (elle garde un léger brillant), vitre devant les cartes bien plus transparente (le verre fumé du Black Friday
  ne voile plus les visuels).
- **Halo de marque** : derrière chaque carte, une lueur à sa couleur dominante (bleu Steam, vert Xbox, rouge Netflix,
  orange Amazon…), calculée automatiquement à partir du visuel. Elle respire doucement et s'intensifie au survol.
- **Reflet premium** : une bande de lumière en biais traverse chaque carte toutes les ~7 secondes (décalée d'une carte
  à l'autre), toutes les 2,6 secondes sur la carte survolée. Désactivé si « Réduire les animations » est actif.

## 9. Newsletter holographique

- **Dans la boutique 3D**, à gauche du comptoir : un projecteur sur pied (anneaux lumineux) projette un faisceau
  conique et un **panneau holographique** cyan, façon interface de film de super-héros. Le panneau se tourne vers le
  visiteur, flotte légèrement, scintille, a parfois un petit « glitch », et des particules montent dans le faisceau.
  À l'écran : emblème à anneaux qui tournent, « JOIN THE CLUB », des champs qui se remplissent tout seuls (démo),
  curseur qui clignote, bouton « TAP TO SUBSCRIBE » qui pulse, ligne de balayage. Après inscription, il affiche
  « YOU'RE ON THE LIST ✓ » (mémorisé sur l'appareil).
- **Envoi** : chaque inscription part par e-mail (SMTP Brevo) vers l'adresse du propriétaire (`CONTACT_EMAIL`,
  par défaut bokojohannes2@gmail.com). Le visiteur ne reçoit rien ; son seul e-mail est la livraison après paiement.
- **Le formulaire** s'ouvre au centre de l'écran avec une apparition « matérialisation » (une ligne de lumière qui
  se déplie, scintillement) : verre sombre translucide, grille hexagonale, trame, ligne de balayage, équerres
  d'angle lumineuses, police technique (Chakra Petch), champs numérotés 01–04 qui s'illuminent au focus.
  Erreur : champ en rouge + petite secousse. Succès : anneau et coche qui se dessinent, « ACCESS GRANTED »,
  confettis cyan.
- Même identité « hologramme » dans les trois boutiques (elle tranche volontairement avec chaque décor).
- Accessibilité : vrais champs de formulaire étiquetés, autocomplétion (prénom, nom, e-mail, téléphone), clavier
  et Échap, focus piégé dans la fenêtre, animations coupées si « Réduire les animations » est actif.

## 10. Fiches produits « grande enseigne »

- Mise en page inspirée des grands sites marchands : galerie à gauche (avec vignettes des cartes incluses pour les
  packs, cliquables), et à droite fil d'Ariane, titre descriptif (« Steam Gift Card »), marque, puis un **bloc d'achat
  encadré** : prix en grand (remise en rouge, « Was: €75 · You save €7.50 », compte à rebours de l'offre sur une
  ligne), disponibilité, valeur (montants rapides + autre montant), quantité, « Add to cart » / « Buy now », garanties.
- En dessous : **About this item** (points clés rédigés automatiquement), **What's in the pack**, tableau
  **Product details** (marque, type, valeur, pays, format, conditions, disponibilité, livraison) et
  **How to redeem** en étapes numérotées.
- Typographie unique et sobre (Manrope), plus de titres en italique décoratif ni de petites capitales partout.
- Référencement : titre de page descriptif (« Steam Gift Card (€20–€100) – Digital Code by Email »), méta-description
  rédigée, et données structurées schema.org **Product + Offer** (prix, devise, disponibilité, fin de l'offre) et
  **BreadcrumbList**, lues par Google pour les résultats enrichis.

## 11. Portes vers les autres boutiques

Indices discrets, sans rien ajouter à l'écran en permanence : panneau « ENTER ››› » sur la vitre de chaque porte
(il respire doucement), légende en bas quand on regarde une porte (« Leads to the Christmas store · Tap the door to
go in »), 4e étape du mini-guide de première visite, rappel dans l'aide de navigation, et flèche → sur les boutons
de porte de la barre du bas.

## 12. Hôtesse 3D (style film d'animation) — comptoir + portes

- **Une seule jeune femme, le même visage partout**, d'après l'image de référence fournie : grands yeux marron
  (iris deux tons, pupille, deux reflets), cils épais avec petite virgule, joues roses, petit sourire, carré gris
  foncé mi-long avec frange balayée sur le côté, silhouette fine (1,68 m, tête légèrement agrandie comme dans les
  films d'animation), mains à 5 doigts.
- **Où** : au comptoir de chaque boutique (mains sur le comptoir, elle montre le présentoir de temps en temps) et à
  côté de chaque porte, dans la tenue de la boutique où mène la porte.
- **Tenues** :
  | Boutique générale | Black Friday | Christmas |
  |---|---|---|
  | sweat zippé gris ouvert à manches rayées noir/blanc/rouge, t-shirt gris, short gris foncé, baskets blanches — main sur la hanche | bomber noir à rayures orange/rouge, t-shirt rouge, jogging noir à bande rouge, baskets rouges, sac shopping, badge de la remise **réelle** | robe rouge à fourrure blanche (longueur genou), petite cape, ceinture noire à boucle dorée, collants, bottes rouges, bonnet avec nœud vert et étoile, boîte cadeau |
- **Rendu** : shader « dessin animé » partagé (`SHADER_TOON`) : couleurs franches, ombrage doux en deux tons, reflets
  sur les yeux et les lèvres, liseré lumineux à la couleur de l'éclairage de la boutique. Indépendant des lumières :
  elle reste lisible dans la boutique claire, la noire et la rouge.
- **Animations** : respiration, transfert du poids, clignements irréguliers, regard (yeux + tête) qui suit le
  visiteur dans ±30°, salut de la main + sourire quand on approche, geste de présentation au comptoir,
  transitions adoucies. Figée si « Réduire les animations » est actif.
- **Technique** : fabriquée par le code (`public/js/personnages.js`), aucun fichier à télécharger (≈ 24 000 triangles).
- **Newsletter** : zones de clic ajustées au panneau (toujours face au visiteur) et au projecteur, cliquables de près comme de loin. Si le panneau passe devant la porte Black Friday, le clic va à ce que le doigt vise le plus au centre : cœur du panneau = formulaire, reste de la porte = changement de boutique.
