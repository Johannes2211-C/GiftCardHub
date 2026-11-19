# Boutique Cartes Cadeaux — 3 boutiques 3D, paiement PayPal, livraison automatique par e-mail

Site Node.js (Express) de cartes cadeaux numériques : boutique **générale** (14 articles), **Black Friday** (11), **Noël** (16).
Façade de rue et intérieurs en 3D (Three.js), mode simple 2D équivalent, paiement PayPal ou carte bancaire,
code livré automatiquement par e-mail (Brevo) une fois le paiement confirmé par PayPal côté serveur.

---

## 0. Langue du site : anglais

Tout ce que voient les clients est en **anglais** : boutique 3D (enseignes, étiquettes, bannières, écrans),
page normale, fiches produit, panier, paiement, messages d'erreur, aide (FAQ, Terms & Conditions, Refund policy),
bloc de paiement intégrable et **e-mail de livraison**. Prix affichés `€50`, `€67.50` (paiement toujours en euros).

- Adresses : `/shop/general`, `/shop/black-friday`, `/shop/christmas`, `/help`. Les anciennes adresses françaises
  (`/boutique/generale`, `/boutique/noel/…`, `/aide`) redirigent automatiquement (301) vers les nouvelles.
- Zones de validité affichées sur chaque fiche et dans l'e-mail : États-Unis (California, New York, Texas, Florida,
  Illinois, Washington) et Royaume-Uni (England, Scotland, Wales, Northern Ireland) — `site.paysValidite` dans la config.
- Les textes se changent dans `config/boutique.config.js` (noms, descriptions, rayons, Terms & Conditions…).
  Les commentaires de la config, ce README, l'administration (`/admin`) et les messages du serveur restent en
  français, pour toi.
- Les identifiants d'articles (`steam`, `pack-famille`…) et les **codes en stock ne changent pas**.
- Les visuels des packs (images fournies) contiennent leur propre texte : pour une version 100 % anglaise,
  remplace ces images par des versions anglaises (même nom de fichier dans `public/img/cartes/`).

## 1. Contenu du projet

```
boutique-cartes-cadeaux/
├── server.js                    ← serveur principal : routes, PayPal, e-mail, sécurité
├── package.json
├── .env.example                 ← variables à renseigner sur l'hébergeur
├── config/
│   └── boutique.config.js       ← FICHIER UNIQUE : produits, prix, textes, couleurs, boutiques, dates
├── src/
│   ├── catalogue.js             ← lecture/validation de la config, calcul des prix
│   ├── paypal.js                ← API REST PayPal (Orders v2 + vérification des webhooks)
│   ├── mailer.js                ← envoi Brevo (API HTTP, SMTP en secours), contenu de l'e-mail de livraison
│   ├── newsletter.js            ← inscriptions newsletter, notification à CONTACT_EMAIL, désinscription, synchro Brevo
│   ├── commandes.js             ← fonctionnement automatique (réservation, capture, livraison)
│   ├── stock.js                 ← table de stock commune, attribution atomique, codes chiffrés
│   ├── db.js                    ← base SQLite intégrée à Node (aucune compilation)
│   ├── pages.js                 ← pages HTML + balises Open Graph par article
│   └── admin.js                 ← espace protégé : table de stock et commandes
├── public/
│   ├── js/app.js                ← interface (barre, recherche, fiche, panier, caisse, guide…)
│   ├── js/scene3d.js            ← scène 3D (façade, vitrines, comptoir, portes)
│   ├── js/gabarits.js           ← gabarits HTML partagés serveur / navigateur
│   ├── js/paiement.js           ← Smart Payment Buttons PayPal
│   ├── js/son.js                ← fond sonore synthétisé (coupé par défaut)
│   ├── css/style.css
│   ├── embed/                   ← BLOC DE PAIEMENT EXPRESS (bloc-paiement.js / .css / demo.html)
│   └── img/cartes/              ← vos visuels (copies à l'identique) + 3d/ (copies légères 640 px)
├── integration-wordpress/       ← codes à coller dans WordPress (boutique en cadre, bloc de paiement)
├── scripts/                     ← generer-cle, importer-stock, export-apercu
├── private/stock-initial.csv    ← vos 21 codes (CONFIDENTIEL, exclu de Git)
└── CONCEPTION.md                ← structure, direction artistique, expérience utilisateur
```

## 2. Lancer en local

Prérequis : **Node.js 22.13 ou plus récent** (la base SQLite est intégrée à Node, rien à compiler).

```bash
npm install
cp .env.example .env              # puis remplis les valeurs
npm run generer-cle               # copie le résultat dans CLE_CHIFFREMENT_CODES
npm run importer-stock -- private/stock-initial.csv
npm start                         # http://localhost:3000
```

Au démarrage, le serveur vérifie la configuration et affiche : `Articles : Générale 14 / Black Friday 11 / Noël 16`.

## 3. PayPal (paiement PayPal + carte bancaire)

1. Sur <https://developer.paypal.com> → **Apps & Credentials** → crée une application.
2. Copie **Client ID** → `PAYPAL_CLIENT_ID` et **Secret** → `PAYPAL_CLIENT_SECRET`.
3. **Mode réel par défaut** : en production (`NODE_ENV=production`), le site encaisse de vrais paiements
   (`PAYPAL_ENV=live`). Utilise les clés de l'onglet **Live** de ton application PayPal : les clés sandbox
   ne fonctionnent pas en live. `PAYPAL_ENV=sandbox` sert uniquement à faire des essais avec de faux comptes.
4. Dans la même application, ajoute un **Webhook** :
   URL `https://www.ton-domaine.fr/api/paypal/webhook`, événements `PAYMENT.CAPTURE.COMPLETED`,
   `PAYMENT.CAPTURE.DENIED`, `PAYMENT.CAPTURE.REFUNDED`, `PAYMENT.CAPTURE.REVERSED`.
   Copie son identifiant dans `PAYPAL_WEBHOOK_ID`.

Le bouton « Carte de débit ou de crédit » (Visa, Mastercard) apparaît sous le bouton PayPal : l'acheteur
n'a pas besoin de compte PayPal, et l'argent arrive sur ton compte PayPal.

**Comment le paiement est confirmé :** le navigateur ne fait que déclencher. Le serveur crée la commande
PayPal avec un total **recalculé depuis la configuration**, réserve un code, capture le paiement auprès de
PayPal (serveur à serveur) et vérifie statut, montant et devise. Le webhook signé sert de deuxième
confirmation (paiement « en attente », coupure réseau…). Sans confirmation, aucun code n'est attribué.

## 4. E-mail de livraison (Brevo)

1. <https://app.brevo.com> → **SMTP & API** → onglet **Clés API** → « Générer une nouvelle clé » (commence par
   `xkeysib-`) → `BREVO_API_KEY=…`. Les e-mails partent par l'API HTTP de Brevo (marche sur Render gratuit).
2. **Expéditeurs, domaines et IP dédiées → Expéditeurs** : ajoute et valide l'adresse de `MAIL_FROM`
   (idéalement une adresse de ton domaine, authentifié avec DKIM/DMARC, pour éviter les courriers indésirables).
3. **Paramètres → Sécurité → IP autorisées** : désactive le blocage des IP inconnues.
4. `ADMIN_EMAIL` reçoit les alertes (ex. paiement reçu alors que le stock venait de s'épuiser).

Si Brevo est momentanément indisponible, le code reste attribué au client : l'envoi est retenté
automatiquement toutes les 5 minutes, et un bouton « Renvoyer l'e-mail » existe dans `/admin/commandes`.

## 4 ter. Newsletter (formulaire holographique près du comptoir)

Les visiteurs s'inscrivent avec **prénom, nom, e-mail** et **téléphone (facultatif)**, en cochant la case de
consentement. Trois points d'entrée : l'hologramme à gauche du comptoir dans la boutique 3D (clic dessus, ou bouton
**Newsletter** de la barre du bas), l'entrée **Newsletter** du menu, et le bandeau « Join the club » en mode simple.

- **Où vont les inscrits ?** Dans la base (table `abonnes`). Page **`/admin/newsletter`** : liste, nombre d'abonnés
  actifs, et bouton **Exporter en CSV** (ouvrable dans Excel / Google Sheets, importable dans Brevo).
- **Chaque inscription t'est envoyée par e-mail** à **bokojohannes2@gmail.com**, par Brevo comme les
  livraisons : prénom, nom, e-mail, téléphone, origine (3D / mode simple) et date. Bouton **Répondre** = écrire
  directement à la personne. Pour changer d'adresse : variable **`CONTACT_EMAIL`** (prioritaire) ou
  `experience.newsletter.emailDestination` dans la config. Le serveur affiche l'adresse utilisée au démarrage.
- **Le client ne reçoit AUCUN e-mail en s'inscrivant.** Son seul e-mail est celui de la livraison, après paiement
  (code + informations de la carte). Le lien de désinscription `/newsletter/unsubscribe` (jeton signé) reste
  disponible si tu l'ajoutes à tes futures newsletters ; les campagnes envoyées depuis Brevo ont le leur.
- **Synchronisation Brevo automatique (facultatif)** : renseigne `BREVO_API_KEY` (Brevo → SMTP & API → onglet
  **API Keys**, différente de la clé SMTP) et `BREVO_LIST_ID` (Brevo → Contacts → Lists, le numéro de ta liste).
  Chaque inscrit est alors ajouté à cette liste (prénom, nom, et téléphone s'il commence par +). Sans ces variables,
  rien n'est envoyé à Brevo : tu exportes simplement le CSV quand tu veux.
- **Textes** (titre, sous-titre, bouton, mentions, adresse de destination, téléphone obligatoire ou non) :
  `experience.newsletter` dans `config/boutique.config.js`. `actif: false` retire le formulaire partout.
- **Protection** : champ piège anti-robots, limite de 20 envois / 15 min par adresse IP, données nettoyées,
  consentement horodaté. La clause « Newsletter » est ajoutée à l'article 11 des CGV.

### E-mails : qui envoie, qui reçoit (Brevo)

| Variable | Rôle | Exemple |
|---|---|---|
| `BREVO_API_KEY` | Clé **API** Brevo (`xkeysib-…`) : envoie **tous** les e-mails par l'API HTTP | `xkeysib-…` |
| `MAIL_FROM` | **Expéditeur** : ce que le client voit dans « De : » quand il reçoit son code | `Gift Cards <bokojohannes2@gmail.com>` |
| `CONTACT_EMAIL` | **Destinataire** des formulaires (newsletter / contact) | `bokojohannes2@gmail.com` |
| `ADMIN_EMAIL` | Reçoit les alertes (remboursement à faire…) | `bokojohannes2@gmail.com` |

- **Render gratuit bloque les ports SMTP (25, 465, 587)** depuis septembre 2025 : c'est pour ça que le site
  envoie par l'API HTTP de Brevo dès que `BREVO_API_KEY` est renseignée. Le SMTP ne sert plus qu'en secours.
- `MAIL_FROM` doit être **validée dans Brevo** (Expéditeurs, domaines et IP dédiées → Expéditeurs → Ajouter →
  clic sur le lien reçu). Si elle ne l'est pas, le serveur prend un expéditeur validé du compte et le signale.
- Une adresse Gmail marche comme expéditeur pour démarrer, mais Brevo peut remplacer l'adresse affichée et les
  e-mails arrivent plus souvent en spam. Pour vendre sérieusement : une adresse sur ton propre domaine
  (ex. `orders@ta-boutique.com`) avec le domaine **authentifié** dans Brevo (DKIM + DMARC).
- Brevo → Paramètres → Sécurité → **IP autorisées** : désactive le blocage des IP inconnues, sinon Brevo refuse
  les envois venant de Render (dont les IP changent).
- Au démarrage, les journaux Render affichent par exemple
  `✓ E-mail (API HTTP Brevo) : API Brevo OK · expéditeur … autorisé`, ou l'erreur exacte en français. Chaque envoi
  est journalisé (`[e-mail] ✓ accepté par Brevo …` ou `[e-mail] ✗ ÉCHEC …` avec la raison). `/admin/diagnostic`
  envoie un e-mail de test.

### Remplacer ses clés (PayPal, Brevo) sans rien casser

Les clés ne sont **jamais** dans le code : uniquement dans `.env` (en local) ou dans le panneau de l'hébergeur.
Pour en changer : remplace la valeur, enregistre, puis **redémarre / redéploie**. C'est tout.

- Les espaces, retours à la ligne et guillemets collés par erreur autour d'une clé sont retirés automatiquement.
- PayPal : `PAYPAL_CLIENT_ID` et `PAYPAL_CLIENT_SECRET` doivent venir **du même mode** que `PAYPAL_ENV`
  (`sandbox` = clés « Sandbox » pour tester, `live` = clés « Live » pour les vrais paiements).
- Brevo : `BREVO_API_KEY` = la **clé API** (`xkeysib-…`, pas la clé SMTP `xsmtpsib-…`), `MAIL_FROM` = un expéditeur
  **validé** dans Brevo.
- Vérification : **`/admin/diagnostic`** dit si PayPal accepte les clés et si Brevo répond, et envoie un e-mail de
  test. Les mêmes vérifications s'affichent dans les journaux à chaque démarrage (✓ / ✗).

## 4 quater. Visuels des cartes en anglais

Les visuels qui contenaient du texte français (packs, Fnac, Microsoft 365 Personal) ont été réécrits en anglais en
gardant leur design. Les originaux français sont conservés dans `ressources/visuels-originaux-fr/`.
Pour modifier un texte : change-le dans `ressources/traduire_visuels.py` puis lance
`python3 ressources/traduire_visuels.py` (nécessite Python, OpenCV et Playwright) : le script régénère les images
de `public/img/cartes/` et les textures 3D (`public/img/cartes/3d/*.webp`).
Si tu remplaces un visuel par une nouvelle image déjà en anglais, pense aussi à régénérer sa texture 3D
(même nom en `.webp`, 640 px de côté maximum).

## 4 bis. Vérifier que tout fonctionne avant d'ouvrir

- **Au démarrage**, le serveur teste lui-même PayPal et Brevo et l'écrit dans les journaux (Render : onglet Logs) :
  `✓ PayPal : Identifiants acceptés (mode RÉEL)` et `✓ E-mail : Connexion à smtp-relay.brevo.com réussie`.
  Une ligne `✗` ou `⚠` indique précisément quoi corriger (clé refusée, mauvais mode, expéditeur manquant,
  base de données non persistante sur Render…).
- **`/admin/diagnostic`** : le même contrôle à la demande, le mode PayPal (RÉEL ou TEST), le webhook, le nombre
  de codes en stock, et un bouton **« Envoyer un e-mail de test »**.
- **Premier achat réel** : achète une carte toi-même (par exemple 20 €), vérifie l'e-mail reçu, puis rembourse-toi
  depuis ton compte PayPal (Activité → la transaction → Rembourser).

## 5. Le stock de codes

- **Table de stock** (`/admin`, identifiant `ADMIN_USER` / `ADMIN_PASSWORD`) : Produit, Valeur, Code,
  Statut (disponible / réservé quelques secondes pendant le paiement / vendu), ID de transaction, Date de vente.
- Le stock est **commun aux 3 boutiques** : Steam vendu en boutique Noël sort du même stock que Steam en boutique générale.
- **Cartes à montant libre** : un code n'est vendu que s'il a une **valeur** et qu'elle correspond exactement
  au montant choisi au curseur (ex. un code Steam de 50 € pour un achat de 50 €). Les 21 codes initiaux ont
  une **valeur de test de 50 €** pour les cartes (dans `private/stock-initial.csv`) : remplace-la par la vraie
  valeur de chaque code, dans le fichier avant import ou dans `/admin`. Un code sans valeur n'est jamais vendu.
- **Packs et abonnements** : valeur fixe, le code est attribué au produit.
- Les codes sont **chiffrés** dans la base. Garde `CLE_CHIFFREMENT_CODES` en lieu sûr : sans elle, les codes en stock sont illisibles.
- Ajout en masse : formulaire de `/admin` ou `npm run importer-stock -- mon-fichier.csv`
  (format `produit;valeur;code`, les doublons sont ignorés).

## 6. Le fichier de configuration (`config/boutique.config.js`)

Tout ce qui change se règle ici, sans toucher au code 3D : couleurs et matières de chaque boutique, produits,
prix des packs, textes de la fiche et de l'e-mail, sections, présentoir « À ne pas manquer », dates de mise
en avant (`miseEnAvant`), activation (`actif`), compte à rebours du Black Friday.

- **Prix** : Microsoft 365 Basic et Microsoft 365 Personnel sont à **30 €**. Le Pack Productivité BF est à
  **55 €** (Microsoft 365 Personnel 30 € + Amazon 25 €), comme les autres packs dont le prix est la somme du contenu.
- **CGV, politique de remboursement, service client** : textes conventionnels déjà en place dans `site.aide`
  et `site.serviceClient`. Complète les passages entre [CROCHETS] (société, RCS, médiateur), remplace
  l'adresse de test `support@ton-domaine.fr`, et fais relire les textes par un juriste.
- **Case de consentement** (`experience.consentementCGV`) : avant de payer, le client coche « J'accepte les CGV
  et la livraison immédiate ». C'est ce qui permet d'exclure le droit de rétractation pour un code numérique
  (art. L221-28 13° du Code de la consommation). Le serveur refuse la commande sans cette case et enregistre la date d'accord.
- **Plusieurs exemplaires** (`experience.quantiteMax`, 10 par défaut) : dans la fiche, le client choisit le montant
  puis la quantité (ex. 3 × Steam 25 € = 75 €). Le serveur vérifie qu'il reste assez de codes pour cette quantité
  avant d'ouvrir le paiement, réserve un code par exemplaire, et l'e-mail de livraison contient tous les codes.
- **Promotions** (`promotions`) : la vente flash du Black Friday fait **−10 % sur les 3 packs BF** (67,50 €, 90 €,
  49,50 €) jusqu'au **lundi 30 novembre 2026 à 23 h 59**. Le serveur applique la remise au paiement (PayPal reçoit le
  prix réduit) ; le site l'affiche partout : bandeau « Vente flash » avec compte à rebours, ruban sous la barre du
  haut (3D et page normale), prix barrés, autocollants « −10 % », vitrine animée en 3D, e-mail (« Prix payé … (−10 %) »).
  **Offre de Noël** : −10 % sur les 4 packs de Noël (Cocooning 45 €, Gamer Noël 67,50 €, Elle / Lui 90 €,
  Famille 135 €) jusqu'au **vendredi 25 décembre 2026 à 23 h 59**, avec sa propre mise en scène (`style: 'noel'` :
  or, neige, guirlande, boules de sapin « −10 % »).
  Après la date de fin, les prix normaux reviennent tout seuls. Pour changer : `remise`, `fin`, ou `types: ['pack', 'carte']`
  pour mettre aussi les cartes en promo. Pour arrêter : `actif: false` ou supprime le bloc.
- **Enseignes** (`slogan` de chaque boutique) : texte affiché sous le nom sur les enseignes des portes et de la façade.
- **Ajouter une boutique saisonnière** (Saint-Valentin, rentrée…) : copie un bloc entier de `boutiques`,
  change la clé, le `slug`, les couleurs, les matières, le décor et les sections. La façade, les portes,
  la barre et le mode simple s'adaptent seuls.
- Après modification : redémarre le serveur. Une erreur de configuration est signalée clairement au démarrage.

## 7. Mise en ligne

### Render
1. Pousse le projet sur GitHub (le dossier `private/`, `stock-initial.csv` et `.env` sont exclus : tes codes ne
   vont **jamais** sur GitHub).
2. **New → Web Service**, Build `npm install`, Start `npm start`.
3. **Environment → Environment Variables** : ajoute les variables de `.env.example` (`NODE_ENV=production`,
   `SITE_URL=https://…`, clés PayPal, Brevo, `CLE_CHIFFREMENT_CODES`…). Puis **Save, rebuild and deploy**.
4. **Le stock (tes codes)** : **Environment → Secret Files → Add Secret File**,
   nom `stock-initial.csv`, contenu = celui de ton fichier `private/stock-initial.csv`. Enregistre et redéploie.
   Au démarrage, si la base est vide, le serveur charge ce fichier tout seul. Les journaux affichent
   « ✓ Stock chargé … » puis « Stock : N code(s) disponible(s) ».
   **Sans stock, tous les articles affichent « Indisponible » et le bouton PayPal reste grisé.**
   Le fichier peut aussi venir d'Excel (virgules, guillemets, « 50 € ») : il est lu quand même. Autre solution :
   coller les lignes dans une variable d'environnement `STOCK_CODES`. Si rien n'est chargé, les journaux disent
   pourquoi (fichier introuvable, ligne invalide, produit inconnu…).
   L'offre gratuite de Render n'a pas de Shell : la commande `npm run importer-stock` n'y est pas utilisable.
   Les Secret Files la remplacent.
5. **Offre gratuite = test seulement.** Sans disque persistant, la base repart de zéro à chaque mise en veille
   (15 min sans visite), redémarrage ou mise à jour. Le stock est rechargé depuis le Secret File, donc un code
   déjà vendu redevient disponible, et l'historique des commandes est perdu.
   **Pour vendre en réel** : passe le service en offre payante (Starter), ajoute un disque
   (**Disks** → mount path `/var/data`) et la variable `DB_PATH=/var/data/boutique.sqlite`. Le stock est alors
   chargé une seule fois, puis les ventes sont conservées.
   Pour ajouter des codes ensuite : `/admin` → « Ajouter des codes » (ou ajoute-les au Secret File et mets
   `STOCK_IMPORT=toujours` le temps d'un redémarrage : les codes déjà présents ou vendus sont ignorés).

### hPanel (Hostinger, offre avec Node.js)
1. **Sites web → Node.js** : crée l'application, version **22** ou plus, fichier d'entrée `server.js`.
2. Envoie les fichiers (Gestionnaire de fichiers ou Git), puis **npm install** depuis le panneau.
3. Renseigne les **variables d'environnement** de `.env.example`.
4. Le disque est persistant : `DB_PATH=./data/boutique.sqlite` convient.

## 8. WordPress

- **Boutique 3D dans une page** : `integration-wordpress/boutique-3d-iframe.html` (bloc « HTML personnalisé »).
  Ajoute l'adresse du site WordPress dans `FRAME_ANCESTORS`.
- **Bloc de paiement express** (un article, montant, e-mail, PayPal + carte) :
  `integration-wordpress/bloc-paiement-express.html`. Ajoute l'adresse WordPress dans `ALLOWED_ORIGINS`.
  Démonstration : `https://ton-domaine.fr/embed/demo.html`.

## 9. Sécurité mise en place

- Aucun code dans les pages, l'URL, le panier, le catalogue ni la page de confirmation : **uniquement dans l'e-mail**.
- Prix toujours recalculés côté serveur ; montant, devise et référence vérifiés à la capture et dans le webhook.
- Webhooks PayPal vérifiés par signature ; rejouer un événement ne livre jamais deux fois.
- Attribution atomique (deux paiements simultanés ne reçoivent jamais le même code — testé).
- On n'encaisse jamais sans code : le code est réservé **avant** la capture, libéré si le paiement échoue.
- Codes chiffrés au repos (AES-256-GCM) ; doublons détectés par empreinte.
- En-têtes de sécurité (CSP, frame-ancestors), CORS limité, limitation du débit, corps de requête limités,
  HTML échappé partout, admin protégé (mot de passe + jeton anti-CSRF), aucune clé dans le code.

## 10. À renseigner avant d'ouvrir

- [ ] Coordonnées réelles du service client (`site.serviceClient`, actuellement des valeurs de test)
- [ ] Passages [CROCHETS] des CGV (société, RCS, médiateur) et relecture juridique
- [ ] Prix du Pack Productivité BF
- [ ] Vraie valeur de chaque code du stock (les cartes sont à 50 € pour les tests)
- [ ] Clés PayPal **live**, webhook, Brevo, `MAIL_FROM` validé, `SITE_URL` en https
- [ ] (Facultatif) `BREVO_API_KEY` + `BREVO_LIST_ID` pour envoyer les inscrits newsletter dans une liste Brevo
- [ ] Un achat réel de petit montant en `live`, puis remboursement depuis PayPal
- [ ] Essai de la boutique 3D sur un téléphone d'entrée de gamme et sur ordinateur

## 11. Aperçu sans serveur

`npm run export-apercu` génère `apercu/` : la boutique (3D + mode simple) avec le catalogue, sans paiement.
Dans l'aperçu, le formulaire newsletter simule l'inscription (rien n'est enregistré : il n'y a pas de serveur).
Utile pour montrer le rendu avant la mise en ligne.
