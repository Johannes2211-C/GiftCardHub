/* =====================================================================
   FICHIER DE CONFIGURATION UNIQUE
   ---------------------------------------------------------------------
   Tout ce qui change d'une saison à l'autre se règle ICI, sans toucher
   au code 3D ni au serveur : couleurs, matières, produits, prix, textes,
   sections, dates de mise en avant, activation des boutiques.

   Après une modification : redémarre le serveur (npm start).
   Le serveur vérifie ce fichier au démarrage et affiche les erreurs.

   Les champs marqués  >>> À RENSEIGNER <<<  sont laissés vides exprès.
   ===================================================================== */

module.exports = {
  /* ------------------------------------------------------------------
     1. SITE
     ------------------------------------------------------------------ */
  site: {
    langue: 'en',                                // langue du site (balise <html lang>)
    nom: 'Gift Cards',                           // texte de l'enseigne sur la façade
    accroche: 'Digital gift cards',              // compris en 5 secondes
    sousAccroche: 'Instant delivery by email',
    devise: 'EUR',
    symboleDevise: '€',
    // Zones où les cartes sont utilisables (affichées sur chaque fiche produit)
    paysValidite: [
      'California', 'New York', 'Texas', 'Florida', 'Illinois', 'Washington',
      'England', 'Scotland', 'Wales', 'Northern Ireland',
    ],
    zoneValidite: 'United States (California, New York, Texas, Florida, Illinois, Washington) and United Kingdom (England, Scotland, Wales, Northern Ireland)',
    zoneCourte: 'Valid in the US & UK',

    // >>> À RENSEIGNER <<<  (affiché dans l'e-mail de livraison et la page Aide)
    // Valeurs de TEST : remplace-les par tes vraies coordonnées avant l'ouverture.
    serviceClient: {
      email: 'support@your-domain.com',
      telephone: '',
      horaires: 'Monday to Friday, 9 am to 6 pm (reply within 1 business day)',
    },

    // Zone confiance. Mets une URL (ex. 'https://monsite.com/terms') pour pointer
    // vers une page existante, ou laisse '' pour utiliser la page /help intégrée.
    liens: {
      conditions: '',
      faq: '',
      avis: '',
      support: '',
      cgv: '',
      remboursement: '',
    },

    // Contenu de la page d'aide quand aucune URL n'est donnée ci-dessus.
    // Textes conventionnels (base de travail) : complète les [CROCHETS] et fais-les relire par un juriste.
    aide: {
      cgv: `TERMS AND CONDITIONS OF SALE

1. Seller
These terms and conditions apply to every order placed on this website, operated by [COMPANY NAME], [legal form], registered under number [number], with its registered office at [address], VAT number [number], contactable at support@your-domain.com (the "Seller").

2. Products
The Seller sells digital gift cards and subscription codes (the "Codes") issued by third-party brands (Steam, PlayStation, Xbox, Nintendo, Apple, Google, Netflix, Spotify, Amazon, Fnac Darty, Zalando, Microsoft). The Seller is not the issuer of the Codes: their use is governed by each brand's own terms. Each Code can be used once, and only in the regions shown on the product page: in the United States (California, New York, Texas, Florida, Illinois, Washington) and in the United Kingdom (England, Scotland, Wales, Northern Ireland).

3. Prices
Prices are shown in euros, all taxes included. For cards with a chosen amount, the price paid equals the amount chosen, minus any promotion shown. There are no delivery charges. The price that applies is the one displayed when the order is confirmed.

4. Ordering
The Customer chooses one or more Codes, enters an email address, accepts these terms and pays. The order is final once the payment provider confirms the payment. A summary is shown on screen and the Customer receives a delivery email.

5. Payment
Payment is made online with PayPal or by debit/credit card (Visa, Mastercard) through PayPal. The Customer's account is charged when the order is placed. The Seller never has access to the Customer's card details.

6. Delivery
The Code is sent automatically by email, to the address given by the Customer, as soon as the payment is confirmed. Nothing is shipped. The Customer is responsible for entering a correct email address. If the Code has not arrived within 24 hours, the Customer checks their spam folder and then contacts customer service.

7. No right to cancel
Digital content is delivered immediately. By ticking the box before payment, the Customer asks for immediate delivery of the Code and acknowledges that they lose their right to cancel once delivery has started.

8. Looking after Codes
Once delivered, the Code is the Customer's responsibility. The Seller cannot replace a Code that has been lost, stolen, shared or used by someone else after delivery. The Seller is not responsible for how the issuing brands' platforms work.

9. Faulty Codes
If a Code turns out to be invalid or already used the first time it is redeemed, the Customer contacts customer service within 14 days of delivery, with the order number and a screenshot of the error message. After checking with the issuer, the Seller replaces the Code or refunds the order.

10. Fraud prevention
The Seller may refuse or cancel any order that presents a risk of fraud. The Customer is then refunded in full.

11. Personal data
The Customer's email address is used only to process the order, deliver the Code and provide customer service. It is kept for as long as needed for these purposes and for legal obligations. The Customer can ask to access, correct or delete their data by writing to customer service.
Newsletter: if a person signs up to the newsletter, their first name, last name, email address and (optionally) phone number are used only to send news and offers from the store, with their consent. The person can unsubscribe at any time (link in every newsletter, or by contacting customer service); their details are then no longer used for this purpose.

12. Customer service and complaints
Complaints can be sent to customer service: support@your-domain.com, Monday to Friday, 9 am to 6 pm.

13. Governing law
These terms are governed by the laws of [COUNTRY / STATE]. In the event of a dispute, an amicable solution will be sought before any legal action.`,
      remboursement: `REFUND POLICY

Delivered Codes
Delivered digital Codes cannot be returned or exchanged: by asking for immediate delivery before payment, the Customer gives up their right to cancel.

Full refund
• Order paid but not delivered (item sold out, technical error): automatic refund.
• Payment taken twice: the duplicate payment is refunded.
• Code invalid or already used the first time it is redeemed, reported within 14 days: replaced with an equivalent Code or refunded, after checking with the issuer.
• Order cancelled by the Seller (suspected fraud, obvious pricing error).

Code not received
First check your spam folder. If you still can't find the Code, write to customer service with your order number: the Code will be sent again to the address used at checkout.

How to ask
Write to support@your-domain.com with your order number (in the format CC-YYYYMMDD-XXXXXXXX), the email address you used and, for an invalid Code, a screenshot of the error message.

Timing and method
Refunds are made to the payment method used (PayPal, or card through PayPal) within 14 days of the request being accepted.`,
      avis: '', // n'ajoute ici que de vrais avis clients (aucun avis inventé)
    },
  },

  /* ------------------------------------------------------------------
     2. TEXTES COMMUNS (fiche produit, e-mail)
     ------------------------------------------------------------------ */
  textes: {
    formatNumerique: 'Digital code delivered by email. Nothing is shipped.',
    conditionsUtilisation:
      'Single-use personal code, valid only in the regions listed and on the matching platform. Refunds: see the Terms & Conditions.',
    instructionsGenerales:
      'Get your code by email. Sign in to the platform with an account from a supported region. Open the “Redeem a code” section and enter your code: the credit is added to your account.',
    livraison: 'Automatic delivery by email, right after your payment is confirmed.',
    livraisonCourte: 'Instant email delivery',
    enStock: 'In stock',
    indisponible: 'Unavailable',
    prixADefinir: 'Price coming soon',
    paiementSecurise: 'Secure payment',
    emailRemerciement: 'Thanks for your order! Enjoy your gift card.',
    emailObjet: 'Order {numero}: your code is here',
  },

  /* ------------------------------------------------------------------
     3. MONTANT LIBRE (toutes les cartes "à montant libre")
     ------------------------------------------------------------------ */
  montantLibre: { min: 20, max: 100, pas: 1, defaut: 50 },

  /* ------------------------------------------------------------------
     3 bis. PROMOTIONS — appliquées par le SERVEUR (prix payé), affichées
     partout (page normale, 3D, panier, bloc de paiement).
     remise   : en pourcentage (10 = −10 %)
     boutique : la promo vise les articles vendus dans cette boutique…
     types    : …de ces types ('pack', 'carte', 'abonnement')
                (ex. ['pack', 'carte'] pour mettre aussi les cartes à −10 %)
     produits : (optionnel) liste précise d'articles, à la place de boutique/types
     debut/fin: dates ISO ; null = sans limite. Après « fin », les prix
                normaux reviennent tout seuls.
     ------------------------------------------------------------------ */
  promotions: [
    {
      id: 'vente-flash-bf',
      libelle: 'Black Friday Flash Sale',
      accroche: 'Flash sale',    // mot court (ruban, autocollants)
      style: 'flash',            // 'flash' (néon, feu) ou 'noel' (or, neige, guirlandes)
      remise: 10,
      boutique: 'black-friday',
      types: ['pack'],
      debut: null,
      fin: '2026-11-30T23:59:59+01:00',
    },
    {
      id: 'offre-noel',
      libelle: 'Christmas Offer',
      accroche: 'Christmas Offer',
      style: 'noel',
      remise: 10,
      boutique: 'christmas',
      types: ['pack'],
      debut: null,
      fin: '2026-12-25T23:59:59+01:00',
    },
  ],

  /* ------------------------------------------------------------------
     4. PRODUITS — une seule fiche par article, stock COMMUN aux boutiques
     ------------------------------------------------------------------
     type : 'carte'      → montant libre (curseur montantLibre)
            'abonnement' → valeur fixe, prix fixe (null = à définir)
            'pack'       → valeur fixe = prix ; contenu = cartes incluses
     image : fichier dans public/img/cartes/ (copie à l'identique du
             visuel fourni ; nom d'origine indiqué en commentaire).
     Prix : null = « Prix à définir » → achat désactivé tant que vide.
     ------------------------------------------------------------------ */
  produits: {
    'steam': {
      resume: 'Games and add-ons on PC',
      nom: 'Steam', type: 'carte', pourQui: 'Gamers', contenu: 'Any amount',
      image: 'steam.png', // bf5565a8-e6dc-4aa4-9fca-5a959cdb4436.png
      description: 'Top up your Steam Wallet to buy games, add-ons and content on PC.',
      motsCles: ['pc', 'games', 'valve', 'gaming'],
    },
    'playstation-store': {
      resume: 'PlayStation games and subscriptions',
      nom: 'PlayStation Store', type: 'carte', pourQui: 'Gamers', contenu: 'Any amount',
      image: 'playstation-store.png', // MASTER-1 (1).png
      description: 'Top up your PlayStation Store wallet to buy games, add-ons and PlayStation subscriptions.',
      motsCles: ['ps5', 'ps4', 'sony', 'psn', 'games'],
    },
    'xbox': {
      resume: 'Xbox games and subscriptions',
      nom: 'Xbox', type: 'carte', pourQui: 'Gamers', contenu: 'Any amount',
      image: 'xbox.png', // xbox_gift_card_extrait.png
      description: 'Add credit to your Xbox account to buy games, add-ons and Xbox subscriptions.',
      motsCles: ['microsoft', 'game pass', 'console', 'games'],
    },
    'nintendo-eshop': {
      resume: 'Nintendo games and content',
      nom: 'Nintendo eShop', type: 'carte', pourQui: 'Gamers', contenu: 'Any amount',
      image: 'nintendo-eshop.png', // nintendo_eshop_extrait.png
      description: 'Top up your Nintendo account to buy games and content on the Nintendo eShop.',
      motsCles: ['switch', 'console', 'games'],
    },
    'apple-gift-card': {
      resume: 'App Store, Apple Music, iCloud',
      nom: 'Apple Gift Card', type: 'carte', pourQui: 'Smartphone fans', contenu: 'Any amount',
      image: 'apple-gift-card.png', // Apple Gift Card Trio Offer.png
      description: 'Add credit to your Apple Account for the App Store, Apple Music, iCloud and other Apple services.',
      motsCles: ['iphone', 'ipad', 'icloud', 'apple music'],
    },
    'app-store-itunes': {
      resume: 'Apple apps, music and movies',
      nom: 'App Store & iTunes', type: 'carte', pourQui: 'Smartphone fans', contenu: 'Any amount',
      image: 'app-store-itunes.png', // itunes_gift_card_extrait.png
      description: 'Add credit to your Apple Account to buy music, movies, TV shows and apps on iTunes and the App Store.',
      motsCles: ['apple', 'iphone', 'music'],
    },
    'google-play': {
      resume: 'Apps, games and movies on Android',
      nom: 'Google Play', type: 'carte', pourQui: 'Smartphone fans', contenu: 'Any amount',
      image: 'google-play.png', // Google Play Gift Card Packaging.png
      description: 'Add credit to your Google Play account to buy apps, games, movies and subscriptions.',
      motsCles: ['android', 'apps'],
    },
    'netflix': {
      resume: 'Shows and movies on demand',
      nom: 'Netflix', type: 'carte', pourQui: 'The whole family', contenu: 'Any amount',
      image: 'netflix.png', // 2978237422-180x180.png
      description: 'Add credit to your Netflix account to pay for your plan: shows, movies and documentaries.',
      motsCles: ['streaming', 'shows', 'movies', 'tv'],
    },
    'spotify': {
      resume: 'Ad-free music and podcasts',
      nom: 'Spotify', type: 'carte', pourQui: 'The whole family', contenu: 'Any amount',
      image: 'spotify.png', // spotify_gift_card_extrait.png
      description: 'Pay for or gift Spotify Premium: music and podcasts. Not valid for Family or Student plans.',
      motsCles: ['music', 'podcasts', 'streaming'],
    },
    'amazon': {
      resume: 'Millions of items',
      nom: 'Amazon', type: 'carte', pourQui: 'Everyone', contenu: 'Any amount',
      image: 'amazon.png', // amazon_gift_card_extrait.png
      description: 'Use your credit to shop from millions of items on Amazon.',
      motsCles: ['shopping'],
    },
    'fnac-darty': {
      resume: 'Books, tech, home appliances',
      nom: 'Fnac Darty', type: 'carte', pourQui: 'Him / Her', contenu: 'Any amount',
      image: 'fnac-darty.png', // Carte cadeau Fnac noir et or.png
      description: 'Use your credit at Fnac Darty: books, music, tech and home appliances.',
      motsCles: ['fnac', 'darty', 'books', 'culture', 'tech'],
    },
    'zalando': {
      resume: 'Fashion, shoes, accessories',
      nom: 'Zalando', type: 'carte', pourQui: 'Him / Her', contenu: 'Any amount',
      image: 'zalando.png', // Anniversaire arc-en-ciel scintillant.png
      description: 'Use your credit on Zalando: fashion, shoes and accessories.',
      motsCles: ['fashion', 'clothes', 'shoes'],
    },
    'microsoft-365-basic': {
      resume: 'Cloud storage for 1 year',
      nom: 'Microsoft 365 Basic (1 year)', type: 'abonnement', pourQui: '—',
      contenu: 'Microsoft 365 Basic licence, 1 year', valeurAffichee: '1 year',
      prix: 30,
      image: 'microsoft-365-basic.png', // microsoft_365_extrait_hd.png
      description: 'One-year Microsoft 365 Basic subscription: cloud storage and Microsoft tools.',
      motsCles: ['office', 'onedrive', 'microsoft'],
    },
    'microsoft-365-personnel': {
      resume: 'Word, Excel, PowerPoint for 1 year',
      nom: 'Microsoft 365 Personal (1 year)', type: 'abonnement', pourQui: 'Students and professionals',
      contenu: 'Microsoft 365 Personal licence, 1 year', valeurAffichee: '1 year',
      prix: 30,
      image: 'microsoft-365-personnel.png', // Carte cadeau Microsoft 365 Personal violet.png
      description: 'One-year Microsoft 365 Personal subscription for one person: Word, Excel, PowerPoint and cloud storage.',
      motsCles: ['office', 'word', 'excel', 'powerpoint', 'microsoft'],
    },

    /* ---------------- PACKS (format large) ---------------- */
    'pack-gamer-bf': {
      description: 'Everything you need for new games on PC and PlayStation.',
      nom: 'BF Gamer Pack', type: 'pack', pourQui: 'PC + PlayStation players',
      contenu: [{ produit: 'steam', montant: 50 }, { produit: 'playstation-store', montant: 25 }],
      prix: 75,
      image: 'pack-gamer-bf.png', // Pack Gamer BF _ Steam et PlayStation.png
    },
    'pack-shopping-bf': {
      description: 'Three cards to shop for anything: everyday items on Amazon, culture at Fnac, fashion on Zalando.',
      nom: 'BF Shopping Pack', type: 'pack', pourQui: 'Shopping: home, culture and fashion',
      contenu: [{ produit: 'amazon', montant: 50 }, { produit: 'fnac-darty', montant: 25 }, { produit: 'zalando', montant: 25 }],
      prix: 100,
      image: 'pack-shopping-bf.png', // Pack Shopping Black Friday Élégant.png
    },
    'pack-productivite-bf': {
      description: 'One year of Microsoft 365 for work, plus €25 on Amazon to get set up.',
      nom: 'BF Productivity Pack', type: 'pack', pourQui: 'Students and professionals',
      contenu: [{ produit: 'microsoft-365-personnel', libelle: '1 year' }, { produit: 'amazon', montant: 25 }],
      valeurAffichee: '1 year + €25',
      prix: 55, // Microsoft 365 Personal 1 an (30 €) + Amazon 25 €
      image: 'pack-productivite-bf.png', // Pack Productivité Black Friday.png
    },
    'pack-cocooning': {
      description: 'Shows on Netflix and music on Spotify, for cosy nights in.',
      nom: 'Cosy Nights Pack', type: 'pack', pourQui: 'Movie, TV and music nights',
      contenu: [{ produit: 'netflix', montant: 25 }, { produit: 'spotify', montant: 25 }],
      prix: 50,
      image: 'pack-cocooning.png', // Pack cocooning de Noël streaming.png
    },
    'pack-gamer-noel': {
      description: 'Games to download on PlayStation and Nintendo Switch.',
      nom: 'Christmas Gamer Pack', type: 'pack', pourQui: 'Console players (PlayStation + Nintendo)',
      contenu: [{ produit: 'playstation-store', montant: 50 }, { produit: 'nintendo-eshop', montant: 25 }],
      prix: 75,
      image: 'pack-gamer-noel.png', // Pack Gamer Noël PlayStation Nintendo.png
    },
    'pack-elle-lui': {
      description: 'Fashion on Zalando and culture at Fnac: an easy gift, for him or for her.',
      nom: 'Him & Her Pack', type: 'pack', pourQui: 'A fashion and culture gift, for him or for her',
      contenu: [{ produit: 'zalando', montant: 50 }, { produit: 'fnac-darty', montant: 50 }],
      prix: 100,
      image: 'pack-elle-lui.png', // Pack Noël Elle _ Lui.png
    },
    'pack-famille': {
      description: 'Four cards for the whole family: shopping, movies and shows, music and culture.',
      nom: 'Family Pack', type: 'pack', pourQui: 'The whole family: shopping, movies, music, culture',
      contenu: [{ produit: 'amazon', montant: 50 }, { produit: 'netflix', montant: 50 }, { produit: 'spotify', montant: 25 }, { produit: 'fnac-darty', montant: 25 }],
      prix: 150,
      image: 'pack-famille.png', // Noël en famille _ Pack Festif Streaming.png
    },
  },

  /* ------------------------------------------------------------------
     5. BOUTIQUES
     ------------------------------------------------------------------
     Même architecture 3D pour toutes (comptoir, vitrines, portes).
     Seuls le thème (couleurs + matières + décor) et les sections changent.

     Ajouter une boutique saisonnière (Saint-Valentin, rentrée…) :
       1. copie un bloc entier (ex. 'noel'), change la clé et le slug ;
       2. change couleurs / matières / décor ;
       3. liste les sections et produits ;
       4. actif: true.
     Matières disponibles : marbre, chene, laque, beton, acajou, sapin, velours
     Décors disponibles   : neige, guirlandes, sapin, neon, compteARebours
     ------------------------------------------------------------------ */
  boutiques: {
    'general': {
      actif: true,
      ordre: 2, // position sur la façade et dans la barre (1 = gauche)
      nom: 'General Store',
      nomCourt: 'General',
      slogan: 'Every gift card in one place', // texte de l'enseigne (portes et façade 3D)
      slug: 'general',
      // Mise en avant automatique (badge « À la une », vitrine éclairée) : null = jamais
      miseEnAvant: null,
      theme: {
        // mur/sol/plafond… = scène 3D ; interface/surface/texte = barre et panneaux
        couleurs: {
          mur: '#F7F5F0', sol: '#EFEBE3', plafond: '#FBFAF7',
          accent: '#1B2A41', metal: '#C9A24B', tapis: '#1B2A41',
          lumiere: '#FFF3E0', ambiance: '#FFFFFF', facade: '#1B2A41',
          interface: '#1B2A41', interfaceTexte: '#FFFFFF', fondInterface: '#F7F5F0', surface: '#FFFFFF', texte: '#1B2A41', bouton: '#1B2A41', boutonTexte: '#FFFFFF',
        },
        matieres: { sol: 'marbre', comptoirPlateau: 'marbre', comptoirFacade: 'chene', vitrineCadre: 'metal', verre: 'clair', etageres: 'verre' },
        decor: [],
        lumiere: { intensite: 1.0, exposition: 1.05 },
        // Vitrines : fond 'sombre' (bleu marine profond derrière les cartes, vitre moins réfléchissante)
        // pour que les couleurs des cartes ressortent sur les murs blancs. luminositeCartes : 1 = normal.
        vitrines: { fond: 'sombre', luminositeCartes: 1 },
        son: 'doux',
      },
      sections: [
        { titre: 'Aisle 1 — Gaming', produits: ['steam', 'playstation-store', 'xbox', 'nintendo-eshop'] },
        { titre: 'Aisle 2 — Apple & Google', produits: ['apple-gift-card', 'app-store-itunes', 'google-play'] },
        { titre: 'Aisle 3 — Entertainment', produits: ['netflix', 'spotify'] },
        { titre: 'Aisle 4 — Shopping', produits: ['amazon', 'fnac-darty', 'zalando'] },
        { titre: 'Aisle 5 — Digital services', produits: ['microsoft-365-basic', 'microsoft-365-personnel'] },
      ],
      // Présentoir « À ne pas manquer » au comptoir (2 à 3 produits par boutique)
      presentoir: [
        { boutique: 'black-friday', produits: ['pack-gamer-bf', 'pack-shopping-bf', 'pack-productivite-bf'] },
        { boutique: 'christmas', produits: ['pack-famille', 'pack-cocooning', 'pack-elle-lui'] },
      ],
    },

    'black-friday': {
      actif: true,
      ordre: 1,
      nom: 'Black Friday Store',
      nomCourt: 'Black Friday',
      slogan: 'Big deals · Flash sale', // texte de l'enseigne (portes et façade 3D)
      slug: 'black-friday',
      miseEnAvant: { debut: '2026-11-20', fin: '2026-12-01' },
      theme: {
        couleurs: {
          mur: '#121214', sol: '#1A1A1D', plafond: '#0B0B0C',
          accent: '#FF2D3A', metal: '#FF7A1A', tapis: '#2A0B0E',
          lumiere: '#FF5A3C', ambiance: '#5A1A1A', facade: '#0B0B0C',
          interface: '#0B0B0C', interfaceTexte: '#FFFFFF', fondInterface: '#141416', surface: '#1E1E21', texte: '#F4F1EE', bouton: '#FF2D3A', boutonTexte: '#0B0B0C',
        },
        matieres: { sol: 'beton', comptoirPlateau: 'laque', comptoirFacade: 'beton', vitrineCadre: 'noirMat', verre: 'fume', etageres: 'verre' },
        decor: ['neon', 'compteARebours'],
        compteARebours: { cible: '2026-11-30T23:59:59+01:00', libelle: 'Flash sale −10% on packs — ends in' },
        lumiere: { intensite: 0.75, exposition: 1.0 },
        son: 'pulse',
      },
      sections: [
        { titre: 'Packs', produits: ['pack-gamer-bf', 'pack-shopping-bf', 'pack-productivite-bf'] },
        { titre: 'Gaming', produits: ['steam', 'playstation-store', 'xbox', 'nintendo-eshop'] },
        { titre: 'Shopping', produits: ['amazon', 'fnac-darty', 'zalando'] },
        { titre: 'Digital services', produits: ['microsoft-365-personnel'] },
      ],
      presentoir: [
        { boutique: 'christmas', produits: ['pack-gamer-noel', 'pack-famille'] },
        { boutique: 'general', produits: ['apple-gift-card', 'google-play'] },
      ],
    },

    'christmas': {
      actif: true,
      ordre: 3,
      nom: 'Christmas Store',
      nomCourt: 'Christmas',
      slogan: 'Holiday gifts', // texte de l'enseigne (portes et façade 3D)
      slug: 'christmas',
      miseEnAvant: { debut: '2026-12-01', fin: '2026-12-26' },
      theme: {
        couleurs: {
          mur: '#5E0F16', sol: '#3A1F14', plafond: '#2B0A0E',
          accent: '#1E4D2B', metal: '#D4AF37', tapis: '#1E4D2B',
          lumiere: '#FFD9A0', ambiance: '#FFC98A', facade: '#1E4D2B',
          interface: '#1E4D2B', interfaceTexte: '#FFF8E7', fondInterface: '#FBF6EC', surface: '#FFFFFF', texte: '#2B1A12', bouton: '#1E4D2B', boutonTexte: '#FFF8E7',
        },
        matieres: { sol: 'acajou', comptoirPlateau: 'acajou', comptoirFacade: 'sapin', vitrineCadre: 'metal', verre: 'givre', etageres: 'verre' },
        decor: ['neige', 'guirlandes', 'sapin'],
        lumiere: { intensite: 0.9, exposition: 1.05 },
        son: 'clochettes',
      },
      sections: [
        { titre: 'Packs', produits: ['pack-cocooning', 'pack-gamer-noel', 'pack-elle-lui', 'pack-famille'] },
        { titre: 'For the gamer', produits: ['steam', 'playstation-store', 'xbox', 'nintendo-eshop'] },
        { titre: 'For the whole family', produits: ['netflix', 'spotify'] },
        { titre: 'For him / her', produits: ['zalando', 'fnac-darty'] },
        { titre: 'For smartphone fans', produits: ['apple-gift-card', 'google-play'] },
        { titre: 'For the undecided', produits: ['amazon'] },
        { titre: 'For students and professionals', produits: ['microsoft-365-personnel'] },
      ],
      presentoir: [
        { boutique: 'black-friday', produits: ['pack-gamer-bf', 'pack-shopping-bf'] },
        { boutique: 'general', produits: ['app-store-itunes'] },
      ],
    },
  },

  // Boutique ouverte quand on clique « Entrer » sur la façade
  boutiqueParDefaut: 'general',

  /* ------------------------------------------------------------------
     6. EXPÉRIENCE
     ------------------------------------------------------------------ */
  experience: {
    guidePremiereVisite: [
      'Drag to look around',
      'Tap the floor to walk, or use the joystick. “Back” steps you back',
      'Walk up to a display: all its cards are on show. Tap a card to choose it',
      'The doors at the back lead to the other stores: tap one to step through',
    ],
    // Case obligatoire avant le paiement : acceptation des CGV + livraison immédiate
    // (renonciation au droit de rétractation, art. L221-28 13° Code de la consommation).
    consentementCGV: true,
    // Nombre maximum d'exemplaires d'un même article (même carte, même montant) par commande.
    quantiteMax: 10,
    // Newsletter : hologramme près du comptoir (3D), bandeau en bas du catalogue (page normale).
    // Chaque inscription arrive par e-mail à emailDestination. Les inscrits sont aussi dans /admin/newsletter (export CSV) et, si BREVO_API_KEY + BREVO_LIST_ID
    // sont renseignés, ajoutés automatiquement à ta liste Brevo.
    newsletter: {
      actif: true,
      titre: 'Join the club',
      sousTitre: 'Be the first to hear about new gift cards, flash sales and holiday offers.',
      bouton: 'Subscribe',
      telephoneObligatoire: false,
      mentions: 'We only use your details to send you our news and offers. Unsubscribe at any time.',
      // Chaque inscription est envoyée à cette adresse (via le SMTP Brevo). L'inscrit ne reçoit aucun e-mail.
      // La variable d'environnement CONTACT_EMAIL, si elle est renseignée, remplace cette valeur.
      emailDestination: 'bokojohannes2@gmail.com',
    },
    assistantIdeeCadeau: true,      // « Idée cadeau » : pour qui + budget → 3 propositions
    rappelPanierApresMinutes: 30,   // rappel discret d'un panier laissé de côté
    dureeTransitionPortail: 1000,   // ms (transition entre boutiques)
    // Vignettes du catalogue, de la recherche et du panier : copies allégées (640 px, même visuel)
    // pour un chargement rapide sur mobile. La fiche produit et og:image utilisent TOUJOURS
    // le fichier d'origine. Mets false pour utiliser les originaux partout.
    vignettesLegeres: true,
    // Three.js : copie locale servie par le serveur, CDN en secours
    three: {
      local: '/vendor/three/three.module.min.js',
      cdn: 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.min.js',
    },
  },
};
