'use strict';
/**
 * Pages HTML rendues côté serveur :
 *  - même page pour la façade, chaque boutique et chaque article (la 3D se charge par-dessus) ;
 *  - le catalogue 2D (mode simple) est déjà dans la page : lisible sans JavaScript, référencé ;
 *  - balises Open Graph adaptées à chaque article (og:image en URL absolue https).
 */
const G = require('../public/js/gabarits');
const { cataloguePublic, boutiqueALaUne } = require('./catalogue');

const esc = G.esc;

function variablesTheme(theme) {
  const c = theme.couleurs;
  return [
    `--c-interface:${c.interface}`, `--c-interface-texte:${c.interfaceTexte}`, `--c-fond:${c.fondInterface}`,
    `--c-surface:${c.surface}`, `--c-texte:${c.texte}`, `--c-bouton:${c.bouton}`, `--c-bouton-texte:${c.boutonTexte}`, `--c-accent:${c.accent}`, `--c-metal:${c.metal}`,
  ].join(';');
}

/**
 * Corps commun (serveur ET aperçu statique).
 * @param racine '/' sur le serveur, '' pour l'aperçu publié
 */
function corps(cat, { slug, produit, racine = '/', fondateur = 'serveur' }) {
  const boutiques = cat.boutiques;
  const b = boutiques.find((x) => x.slug === slug) || boutiques.find((x) => x.slug === cat.boutiqueParDefaut);
  const p = produit ? cat.produits[produit] : null;

  const onglets = boutiques.map((x) => `<a class="onglet" href="${esc(racine)}shop/${esc(x.slug)}" data-boutique="${esc(x.slug)}"${slug === x.slug ? ' aria-current="page"' : ''}>` +
    `<span class="onglet-pastille" style="background:${esc(x.theme.couleurs.interface)};border-color:${esc(x.theme.couleurs.metal)}"></span>${esc(x.nomCourt)}` +
    `${cat.aLaUne === x.slug ? '<span class="badge-une">Featured</span>' : ''}</a>`).join('');

  return `
<a class="evitement" href="#catalogue">Skip to catalogue</a>
<header class="barre" id="barre">
  <a class="logo" href="${esc(racine) || './'}" data-lien="facade" aria-label="${esc(cat.site.nom)} — back to the storefront">
    <span class="logo-monogramme" aria-hidden="true">CC</span><span class="logo-nom">${esc(cat.site.nom)}</span>
  </a>
  <nav class="onglets" aria-label="The 3 stores">${onglets}</nav>
  <div class="recherche" role="search">
    <label class="sr" for="q">Search for a card</label>
    <svg class="recherche-icone" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M10 3a7 7 0 0 1 5.6 11.2l4.6 4.6-1.4 1.4-4.6-4.6A7 7 0 1 1 10 3Zm0 2a5 5 0 1 0 0 10 5 5 0 0 0 0-10Z"/></svg>
    <input id="q" type="search" placeholder="Steam, Netflix, gaming…" autocomplete="off" role="combobox" aria-expanded="false" aria-controls="suggestions" aria-autocomplete="list">
    <ul id="suggestions" class="suggestions" role="listbox" hidden></ul>
  </div>
  <button type="button" class="btn-panier" id="btn-panier" aria-label="Cart: 0 items, total €0">
    <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M7 4V3a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v1h3a1 1 0 0 1 1 1v15a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a1 1 0 0 1 1-1h3Zm2 0h6V4H9Zm-4 2v14h14V6h-2v2h-2V6H9v2H7V6H5Z"/></svg>
    <span class="panier-nb" id="panier-nb">0</span><span class="panier-total" id="panier-total">€0</span>
  </button>
  <button type="button" class="btn-son" id="btn-son" aria-pressed="false" aria-label="Turn on the store music" title="Music">
    <svg class="son-off" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M4 9h4l5-4v14l-5-4H4V9Zm12.6 3 2.7-2.7-1.4-1.4-2.7 2.7-2.7-2.7-1.4 1.4 2.7 2.7-2.7 2.7 1.4 1.4 2.7-2.7 2.7 2.7 1.4-1.4L16.6 12Z"/></svg>
    <svg class="son-on" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M4 9h4l5-4v14l-5-4H4V9Zm11.5 3a4.5 4.5 0 0 0-2-3.7v7.4a4.5 4.5 0 0 0 2-3.7Zm-2-8v2.1a7 7 0 0 1 0 11.8V20a9 9 0 0 0 0-16Z"/></svg>
  </button>
  <button type="button" class="btn-menu" id="btn-menu" aria-expanded="false" aria-controls="menu" aria-label="More options">
    <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M4 6h16v2H4zm0 5h16v2H4zm0 5h16v2H4z"/></svg>
  </button>
  <div class="menu" id="menu" hidden>
    <button type="button" data-action="mode">Switch to simple view</button>
    <button type="button" data-action="son" aria-pressed="false">Music: off</button>
    <button type="button" data-action="idee">Gift ideas</button>
    <button type="button" data-action="newsletter">Newsletter</button>
    <button type="button" data-action="aide">Customer service</button>
  </div>
</header>
<button type="button" class="ruban-promo" id="ruban-promo" hidden></button>

<main id="principal" data-fondateur="${esc(fondateur)}">
  <div class="scene" id="scene" aria-hidden="true"></div>
  <div class="hud" id="hud" hidden>
    <section class="facade-ui" id="facade-ui" hidden>
      <p class="facade-surtitre">${esc(cat.site.nom)}</p>
      <h1 class="facade-titre">${esc(cat.site.accroche)}</h1>
      <p class="facade-sous">${G.ICONES.eclair}${esc(cat.site.sousAccroche)} <span aria-hidden="true">·</span> ${G.ICONES.cadenas}${esc(cat.textes.paiementSecurise)}</p>
      <div class="facade-actions">
        <button type="button" class="btn btn-principal btn-entrer" id="btn-entrer">Enter</button>
      </div>
      <div class="facade-raccourcis" id="facade-raccourcis"></div>
    </section>
    <p class="legende-carte" id="legende" aria-live="polite" hidden></p>
    <button type="button" class="btn-reculer" id="btn-reculer" hidden><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 20 4 12l8-8 1.4 1.4L7.8 11H20v2H7.8l5.6 5.6Z"/></svg>Back</button>
    <p class="aide-nav" id="aide-nav" hidden></p>
    <div class="compte" id="compte" hidden></div>
    <nav class="stations" id="stations" aria-label="Move around the store" hidden></nav>
    <div class="chargement" id="chargement" role="progressbar" aria-label="Loading the store" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span></span></div>
  </div>

  <section class="catalogue" id="catalogue" aria-labelledby="catalogue-titre">
    <div class="catalogue-entete">
      <p class="catalogue-sur">${esc(cat.site.accroche)} · ${esc(cat.site.sousAccroche)}</p>
      <h1 id="catalogue-titre">${esc(b.nom)}</h1>
    </div>
    <div id="catalogue-rayons">${G.catalogue(b, cat, racine)}</div>
    ${G.banniereNewsletter(cat)}
    ${p ? `<article class="fiche-statique" aria-label="${esc(p.nom)}">${G.fiche(p, cat, { racine })}</article>` : ''}
  </section>
</main>

<aside class="tiroir" id="fiche" role="dialog" aria-modal="true" aria-labelledby="fiche-titre" hidden>
  <button type="button" class="tiroir-fermer" data-fermer aria-label="Close">×</button>
  <div class="tiroir-contenu" id="fiche-contenu"></div>
</aside>
<aside class="tiroir" id="panier" role="dialog" aria-modal="true" aria-labelledby="panier-titre" hidden>
  <button type="button" class="tiroir-fermer" data-fermer aria-label="Close">×</button>
  <div class="tiroir-contenu" id="panier-contenu"></div>
</aside>
<aside class="tiroir" id="aide" role="dialog" aria-modal="true" aria-labelledby="aide-titre" hidden>
  <button type="button" class="tiroir-fermer" data-fermer aria-label="Close">×</button>
  <div class="tiroir-contenu" id="aide-contenu"></div>
</aside>
<aside class="tiroir" id="idee" role="dialog" aria-modal="true" aria-labelledby="idee-titre" hidden>
  <button type="button" class="tiroir-fermer" data-fermer aria-label="Close">×</button>
  <div class="tiroir-contenu" id="idee-contenu"></div>
</aside>
<aside class="tiroir holo" id="newsletter" role="dialog" aria-modal="true" aria-labelledby="newsletter-titre" hidden>
  <button type="button" class="tiroir-fermer" data-fermer aria-label="Close">×</button>
  <div class="tiroir-contenu" id="newsletter-contenu"></div>
</aside>
<div class="voile-tiroir" id="voile-tiroir" hidden></div>
<div class="guide" id="guide" role="dialog" aria-label="Quick guide" hidden></div>
<div class="confirmation" id="confirmation" role="dialog" aria-modal="true" aria-labelledby="confirmation-titre" hidden></div>
<div class="toasts" id="toasts" aria-live="polite"></div>

<footer class="pied" id="pied">
  ${G.badgesConfiance(cat)}
  ${G.liensConfiance(cat, racine)}
  <p class="pied-pays">Cards valid in: ${esc(cat.site.zoneValidite || cat.site.paysValidite.join(', '))}. Prices in euros.</p>
</footer>
<noscript><p class="noscript">JavaScript is turned off: the 3D store and checkout are not available, but you can browse the whole catalogue above.</p></noscript>`;
}

function tete({ titre, description, siteUrl, chemin, image, type, cat }) {
  const url = siteUrl + chemin;
  const img = image.startsWith('http') ? image : siteUrl + '/' + image.replace(/^\/+/, '');
  return `
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(titre)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(url)}">
<meta property="og:type" content="${esc(type)}">
<meta property="og:site_name" content="${esc(cat.site.nom)}">
<meta property="og:locale" content="en_US">
<meta property="og:title" content="${esc(titre)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:image" content="${esc(encodeURI(img))}">
<meta property="og:url" content="${esc(url)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#1B2A41">
<link rel="icon" href="/img/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bodoni+Moda:ital,opsz,wght@0,6..96,500;0,6..96,700;1,6..96,500&family=Manrope:wght@400;500;600;700;800&family=Chakra+Petch:wght@500;600;700&display=swap">
<link rel="stylesheet" href="/css/style.css">
<script src="/js/gabarits.js" defer charset="utf-8"></script>
<script type="module" src="/js/app.js"></script>`;
}

/** Données structurées schema.org (Product + Offer + BreadcrumbList) pour les moteurs de recherche. */
function jsonLdProduit(p, cat, config, siteUrl, b, chemin) {
  const url = siteUrl + chemin;
  const img = siteUrl + '/' + String(p.image).replace(/^\/+/, '');
  const m = cat.montantLibre;
  const dispo = p.disponible && G.achetable(p) ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock';
  const vendeur = { '@type': 'Organization', name: config.site.nom };
  const offre = p.type === 'carte'
    ? { '@type': 'AggregateOffer', priceCurrency: 'EUR', lowPrice: G.prixCarte(p, m.min).toFixed(2), highPrice: G.prixCarte(p, m.max).toFixed(2), offerCount: Math.floor((m.max - m.min) / m.pas) + 1, availability: dispo, url, seller: vendeur }
    : p.prix != null ? { '@type': 'Offer', priceCurrency: 'EUR', price: Number(p.prix).toFixed(2), availability: dispo, url, seller: vendeur, itemCondition: 'https://schema.org/NewCondition',
      ...(p.promo && p.promo.fin ? { priceValidUntil: String(p.promo.fin).slice(0, 10) } : {}) } : null;
  const ou = G.rayonDe(p, cat, b.slug);
  const produit = {
    '@context': 'https://schema.org', '@type': 'Product', name: G.titreProduit(p), description: G.pointsCles(p, cat).join(' '), image: [img], sku: p.id, url,
    brand: { '@type': 'Brand', name: p.type === 'pack' ? config.site.nom : p.nom }, category: p.type === 'pack' ? 'Gift card bundles' : 'Gift cards',
    ...(offre ? { offers: offre } : {}),
  };
  const ariane = {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: config.site.nom, item: siteUrl + '/' },
      { '@type': 'ListItem', position: 2, name: b.nom, item: `${siteUrl}/shop/${b.slug}` },
      { '@type': 'ListItem', position: 3, name: G.titreProduit(p), item: url },
    ],
  };
  const js = (o) => JSON.stringify(o).replace(/</g, '\\u003c');
  return `\n<script type="application/ld+json">${js(produit)}</script>\n<script type="application/ld+json">${js(ariane)}</script>`;
}

function pageBoutique({ config, siteUrl, disponibilites }, { slug, produit, chemin }) {
  const cat = cataloguePublic(config, { disponibilites, paypalClientId: process.env.PAYPAL_CLIENT_ID || '' });
  const b = slug ? config.boutiques[slug] : config.boutiques[config.boutiqueParDefaut];
  const p = produit ? cat.produits[produit] : null;

  let titre; let description; let image; let type = 'website';
  let donnees = '';
  if (p) {
    const nomComplet = G.titreProduit(p);
    const m = cat.montantLibre;
    titre = p.type === 'carte' ? `${nomComplet} (€${m.min}–€${m.max}) – Digital Code by Email | ${config.site.nom}`
      : p.type === 'pack' ? `${nomComplet}: ${G.contenuCourt(p, cat)}${p.promo ? ` – ${p.promo.remise}% Off` : ''} | ${config.site.nom}`
      : `${nomComplet} – Digital Code by Email | ${config.site.nom}`;
    description = `${p.description} ${p.type === 'carte' ? `Any value from €${m.min} to €${m.max}.` : `${G.prixTexte(p, cat).replace(/ /g, ' ')}.`} Instant email delivery, secure PayPal checkout. ${config.site.zoneCourte || ''}.`.replace(/\s+/g, ' ').replace(/\.\./g, '.').slice(0, 300);
    image = p.image; type = 'product';
    donnees = jsonLdProduit(p, cat, config, siteUrl, b, chemin);
  } else if (slug) {
    titre = `${b.nom} — ${config.site.nom}`;
    description = `${config.site.accroche}: ${b.sections.map((s) => s.titre.replace(/^Aisle \d+ — /, '')).join(', ')}. ${config.textes.livraisonCourte}.`;
    image = cat.produits[b.sections[0].produits[0]].image;
  } else {
    titre = `${config.site.nom} — ${config.site.accroche}`;
    description = `${config.site.accroche}: Steam, PlayStation, Netflix, Amazon, Spotify and more. ${config.textes.livraisonCourte}, secure payment.`;
    image = cat.produits[config.boutiques[config.boutiqueParDefaut].sections[0].produits[0]].image;
  }

  const etat = { slug: slug || null, produit: produit || null };
  return `<!doctype html>
<html lang="${esc(config.site.langue || 'en')}" data-boutique="${esc(b.slug)}" data-vue="${slug ? 'interieur' : 'facade'}" style="${esc(variablesTheme(b.theme))}">
<head>${tete({ titre, description, siteUrl, chemin, image, type, cat })}
<meta name="cc-etat" content="${esc(JSON.stringify(etat))}">${donnees}
</head>
<body>${corps(cat, { slug: b.slug, produit, racine: '/' })}</body>
</html>`;
}

function pageAide({ config, siteUrl, disponibilites }) {
  const cat = cataloguePublic(config, { disponibilites });
  const A = config.site.aide || {};
  const sc = config.site.serviceClient;
  const contact = [sc.email, sc.telephone, sc.horaires].filter(Boolean).map(esc).join('<br>');
  const bloc = (id, titre, html) => `<section id="${id}" class="aide-bloc"><h2>${titre}</h2>${html}</section>`;
  const aRenseigner = '<p class="a-renseigner">Coming soon.</p>';
  const b = config.boutiques[config.boutiqueParDefaut];
  return `<!doctype html><html lang="${esc(config.site.langue || 'en')}" data-boutique="${esc(b.slug)}" style="${esc(variablesTheme(b.theme))}"><head>
${tete({ titre: `Help and customer service — ${config.site.nom}`, description: 'FAQ, support, Terms & Conditions and refund policy.', siteUrl, chemin: '/help', image: cat.produits[b.sections[0].produits[0]].image, type: 'website', cat }).replace('<script type="module" src="/js/app.js"></script>', '')}
</head><body class="page-aide"><main class="aide-page">
<p><a href="/">← Back to the store</a></p>
<h1>Help and customer service</h1>
${bloc('faq', 'FAQ', G.faq(cat))}
${bloc('support', 'Support', contact ? `<p>${contact}</p>` : aRenseigner)}
${bloc('conditions', 'Terms of use', `<p>${esc(config.textes.conditionsUtilisation)}</p><p>${esc(config.textes.instructionsGenerales)}</p>`)}
${bloc('avis', 'Customer reviews', A.avis ? `<p>${esc(A.avis)}</p>` : '<p>No reviews published yet.</p>')}
${bloc('cgv', 'Terms & Conditions of sale', A.cgv ? `<div class="texte-long">${esc(A.cgv)}</div>` : aRenseigner)}
${bloc('remboursement', 'Refund policy', A.remboursement ? `<div class="texte-long">${esc(A.remboursement)}</div>` : aRenseigner)}
</main></body></html>`;
}

function page404({ config }) {
  return `<!doctype html><html lang="${esc(config.site.langue || 'en')}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Page not found — ${esc(config.site.nom)}</title><link rel="stylesheet" href="/css/style.css"></head>
<body class="page-aide"><main class="aide-page"><h1>This page doesn't exist</h1><p><a href="/">Back to the store</a></p></main></body></html>`;
}

/** Petite page de message (désinscription…). */
function pageSimple({ config }, { titre, texte }) {
  return `<!doctype html><html lang="${esc(config.site.langue || 'en')}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>${esc(titre)} — ${esc(config.site.nom)}</title><link rel="stylesheet" href="/css/style.css"></head>
<body class="page-aide"><main class="aide-page"><h1>${esc(titre)}</h1><p>${esc(texte)}</p><p><a href="/">Back to the store</a></p></main></body></html>`;
}

module.exports = {
  pageSimple, pageBoutique, pageAide, page404, corps, variablesTheme, boutiqueALaUne };
