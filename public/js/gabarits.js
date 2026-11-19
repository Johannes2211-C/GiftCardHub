/* Gabarits HTML partagés : utilisés par le serveur (pages + référencement)
   ET par le navigateur (fiche produit, mode simple). Une seule source. */
(function (racine, fabrique) {
  if (typeof module === 'object' && module.exports) module.exports = fabrique();
  else racine.Gabarits = fabrique();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  // Racine des chemins : '/' sur le serveur, '' (chemins relatifs) dans l'aperçu publié.
  // Attention : '' est une valeur valide, d'où le test sur null et non un simple « || ».
  var rac = function (r) { return r == null ? '/' : r; };

  function euros(n) {
    var v = Number(n);
    return '€' + (Number.isInteger(v) ? String(v) : v.toFixed(2));
  }

  /** Texte de prix affiché partout (carte en vitrine, tuile, fiche). */
  function prixTexte(p, cat) {
    if (p.type === 'carte') return euros(cat.montantLibre.min) + ' to ' + euros(cat.montantLibre.max);
    if (p.prix == null) return cat.textes.prixADefinir;
    return euros(p.prix);
  }

  function achetable(p) { return p.type === 'carte' || p.prix != null; }

  /* ----------------------------- Promotions ----------------------------- */
  /** Prix payé pour une carte de `montant` € (remise appliquée s'il y a une promo). */
  function prixCarte(p, montant) {
    if (!p.promo || montant == null) return montant;
    return Math.round(montant * (100 - p.promo.remise)) / 100;
  }
  /** Promotion qui concerne une boutique (bandeau, ruban). */
  function promoDeBoutique(b, cat) {
    return (cat.promotions || []).filter(function (pr) { return pr.boutique === b.slug; })[0] || null;
  }
  function ciblePromo(pr) {
    var t = pr.types || [];
    if (!t.length) return 'on the whole store';
    var noms = { pack: 'packs', carte: 'cards', abonnement: 'subscriptions' };
    var l = t.map(function (x) { return noms[x] || x; });
    return 'on ' + (l.length === 1 ? 'all ' + l[0] : l.slice(0, -1).join(', ') + ' and ' + l[l.length - 1]);
  }
  function partiesRestantes(fin) {
    var d = Math.max(0, Date.parse(fin) - Date.now());
    return { j: Math.floor(d / 864e5), h: Math.floor(d / 36e5) % 24, m: Math.floor(d / 6e4) % 60, s: Math.floor(d / 1e3) % 60 };
  }
  function dateFin(fin) {
    try {
      return new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris', timeZoneName: 'short' })
        .format(new Date(fin)).replace(' at ', ', ');
    } catch (e) { return String(fin).slice(0, 10); }
  }
  var p2 = function (n) { return (n < 10 ? '0' : '') + n; };
  /** Compte à rebours (mis à jour chaque seconde par app.js via [data-fin]). */
  function compteHTML(fin, classe, court) {
    var q = partiesRestantes(fin);
    var u = court ? [['j', q.j, 'd'], ['h', p2(q.h), 'h'], ['m', p2(q.m), 'm'], ['s', p2(q.s), 's']]
      : [['j', q.j, 'days'], ['h', p2(q.h), 'hours'], ['m', p2(q.m), 'min'], ['s', p2(q.s), 'sec']];
    return '<div class="' + (classe || 'flash-compte') + '" data-fin="' + esc(fin) + '" role="timer" aria-label="Offer ends in ' + q.j + ' days ' + q.h + ' hours">' +
      u.map(function (x) { return '<span><b data-u="' + x[0] + '">' + x[1] + '</b><i>' + x[2] + '</i></span>'; }).join('') + '</div>';
  }
  /** Prix en HTML : prix barré + prix promo quand il y a une remise. */
  function prixHTML(p, cat) {
    if (p.promo && p.prixAvant != null) return '<s>' + esc(euros(p.prixAvant)) + '</s> <b>' + esc(euros(p.prix)) + '</b>';
    if (p.promo && p.type === 'carte') return esc(prixTexte(p, cat)) + ' <b class="remise-txt">−' + p.promo.remise + '%</b>';
    return esc(prixTexte(p, cat));
  }
  var ECLAIR_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z"/></svg>';
  var FLOCON_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M11 1h2v4.6l2.3-2.3 1.4 1.4L13 8.4V11h2.6l3.7-3.7 1.4 1.4-2.3 2.3H23v2h-4.6l2.3 2.3-1.4 1.4-3.7-3.7H13v2.6l3.7 3.7-1.4 1.4-2.3-2.3V23h-2v-4.6l-2.3 2.3-1.4-1.4 3.7-3.7V13H8.4l-3.7 3.7-1.4-1.4L5.6 13H1v-2h4.6L3.3 8.7l1.4-1.4L8.4 11H11V8.4L7.3 4.7l1.4-1.4L11 5.6V1Z"/></svg>';
  /** Icône et mot court selon le style de la promo (« flash » ou « noel »). */
  var iconePromo = function (pr) { return pr && pr.style === 'noel' ? FLOCON_SVG : ECLAIR_SVG; };
  var accroche = function (pr) { return (pr && (pr.accroche || pr.libelle)) || 'Promo'; };
  /** Grand bandeau « Vente flash » en tête de la boutique (page normale). */
  function bandeauPromo(b, cat) {
    var pr = promoDeBoutique(b, cat);
    if (!pr) return '';
    var ruban = [];
    var noel = pr.style === 'noel'; var sep = noel ? '❄' : '✦';
    for (var i = 0; i < 8; i++) ruban.push('<span>' + esc(noel && i % 2 ? 'Merry Christmas' : accroche(pr)) + '</span><i>' + sep + '</i><span>−' + pr.remise + '% ' + esc(ciblePromo(pr).replace('on all ', 'on ')) + '</span><i>' + sep + '</i>');
    var etincelles = '';
    for (var k = 0; k < (noel ? 26 : 14); k++) etincelles += '<i style="--x:' + ((k * 37) % 100) + '%;--d:' + (2.4 + (k % 5) * 0.55).toFixed(2) + 's;--r:' + ((k * 0.43) % 3).toFixed(2) + 's"></i>';
    var guirlande = '';
    if (noel) for (var q = 0; q < 24; q++) guirlande += '<i style="--k:' + q + '"></i>';
    return '<section class="flash flash-' + esc(pr.style || 'flash') + '" aria-label="' + esc(pr.libelle) + '">' +
      (noel ? '<div class="flash-guirlande" aria-hidden="true">' + guirlande + '</div><div class="flash-noeud" aria-hidden="true"></div>' : '') +
      '<div class="flash-fond" aria-hidden="true"><span class="flash-grille"></span><span class="flash-faisceau"></span><span class="flash-faisceau f2"></span><span class="flash-etincelles">' + etincelles + '</span></div>' +
      '<div class="flash-contenu">' +
        '<p class="flash-sur">' + iconePromo(pr) + esc(pr.libelle) + '</p>' +
        '<p class="flash-remise" data-texte="−' + pr.remise + '%"><b>−' + pr.remise + '</b><span>%</span></p>' +
        '<p class="flash-cible">' + esc(ciblePromo(pr)) + '</p>' +
        (pr.fin ? '<div class="flash-fin"><p>Offer ends in</p>' + compteHTML(pr.fin) + '<p class="flash-date">Until ' + esc(dateFin(pr.fin)) + '</p></div>' : '') +
        '<a class="flash-cta" href="#rayon-' + Math.max(0, b.sections.findIndex(function (sx) { return sx.produits.some(function (id) { return cat.produits[id] && cat.produits[id].promo; }); })) + '" data-flash-cta>' + (pr.types && pr.types.length === 1 && pr.types[0] === 'pack' ? 'Shop the pack deals' : 'See the deals') + ' <span aria-hidden="true">→</span></a>' +
      '</div>' +
      '<div class="flash-ruban" aria-hidden="true"><div>' + ruban.join('') + ruban.join('') + '</div></div>' +
      '</section>';
  }

  var svg = function (d, t) { return '<svg viewBox="0 0 24 24" aria-hidden="true" width="' + (t || 18) + '" height="' + (t || 18) + '"><path fill="currentColor" d="' + d + '"/></svg>'; };
  var ICONES = {
    cadenas: svg('M12 2a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V7a5 5 0 0 0-5-5Zm-3 8V7a3 3 0 0 1 6 0v3H9Zm3 4a2 2 0 0 1 1 3.73V19h-2v-1.27A2 2 0 0 1 12 14Z'),
    eclair: svg('M13 2 4 14h6l-1 8 9-12h-6l1-8Z'),
    enveloppe: svg('M3 5h18a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm9 7.2L4.2 7H4v.4l8 5.4 8-5.4V7h-.2L12 12.2Z'),
    globe: svg('M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm6.9 6h-3a15.7 15.7 0 0 0-1.4-3.6A8 8 0 0 1 18.9 8ZM12 4.1c.8 1.1 1.5 2.4 1.9 3.9h-3.8c.4-1.5 1.1-2.8 1.9-3.9ZM4.3 14a8 8 0 0 1 0-4h3.4a16.5 16.5 0 0 0 0 4H4.3Zm.8 2h3a15.7 15.7 0 0 0 1.4 3.6A8 8 0 0 1 5.1 16Zm3-8h-3a8 8 0 0 1 4.4-3.6A15.7 15.7 0 0 0 8.1 8ZM12 19.9c-.8-1.1-1.5-2.4-1.9-3.9h3.8c-.4 1.5-1.1 2.8-1.9 3.9ZM14.3 14H9.7a14.6 14.6 0 0 1 0-4h4.6a14.6 14.6 0 0 1 0 4Zm.2 5.6c.6-1.1 1.1-2.3 1.4-3.6h3a8 8 0 0 1-4.4 3.6Zm1.8-5.6a16.5 16.5 0 0 0 0-4h3.4a8 8 0 0 1 0 4h-3.4Z'),
    code: svg('M3 6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6Zm2 0v3h14V6H5Zm0 5v7h14v-7H5Zm2 2h6v2H7v-2Z'),
    regle: svg('M6 2h9l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm8 1.5V8h4.5L14 3.5ZM8 12v2h8v-2H8Zm0 4v2h5v-2H8Z'),
    etapes: svg('M4 4h4v4H4V4Zm6 1h10v2H10V5ZM4 10h4v4H4v-4Zm6 1h10v2H10v-2ZM4 16h4v4H4v-4Zm6 1h10v2H10v-2Z'),
    stock: svg('M12 2 3 7v10l9 5 9-5V7l-9-5Zm0 2.3L18.5 8 12 11.7 5.5 8 12 4.3ZM5 9.7l6 3.5v6.6l-6-3.4V9.7Zm8 10.1v-6.6l6-3.5v6.7l-6 3.4Z'),
    camion: svg('M3 6h11v3h3.5L21 12.5V17h-2a2.5 2.5 0 0 1-5 0H9a2.5 2.5 0 0 1-5 0H3V6Zm13 5v1.5h3.2L17.7 11H16ZM6.5 16.3a.8.8 0 1 0 0 1.6.8.8 0 0 0 0-1.6Zm10 0a.8.8 0 1 0 0 1.6.8.8 0 0 0 0-1.6Z'),
  };

  /** Zones de validité, groupées par pays (États-Unis / Royaume-Uni). */
  function zonesHTML(cat) {
    var l = cat.site.paysValidite || [];
    var us = ['California', 'New York', 'Texas', 'Florida', 'Illinois', 'Washington'];
    var uk = ['England', 'Scotland', 'Wales', 'Northern Ireland'];
    var a = l.filter(function (x) { return us.indexOf(x) >= 0; }); var b = l.filter(function (x) { return uk.indexOf(x) >= 0; });
    var autres = l.filter(function (x) { return us.indexOf(x) < 0 && uk.indexOf(x) < 0; });
    var g = [];
    if (a.length) g.push('<span class="zone"><b>United States</b> ' + esc(a.join(', ')) + '</span>');
    if (b.length) g.push('<span class="zone"><b>United Kingdom</b> ' + esc(b.join(', ')) + '</span>');
    if (autres.length) g.push('<span class="zone">' + esc(autres.join(', ')) + '</span>');
    return g.join('');
  }

  /** Liens de la zone confiance. */
  function liensConfiance(cat, racine) {
    var L = cat.site.liens || {};
    var items = [
      ['conditions', 'Terms of use'], ['faq', 'FAQ'], ['avis', 'Reviews'],
      ['support', 'Support'], ['cgv', 'Terms & Conditions'], ['remboursement', 'Refund policy'],
    ];
    return '<ul class="liens-confiance">' + items.map(function (it) {
      var url = L[it[0]];
      var href = url ? esc(url) : esc(rac(racine) + 'help#' + it[0]);
      var ext = url ? ' target="_blank" rel="noopener"' : '';
      return '<li><a href="' + href + '" data-aide="' + it[0] + '"' + ext + '>' + it[1] + '</a></li>';
    }).join('') + '</ul>';
  }

  function badgesConfiance(cat) {
    return '<p class="badges-confiance">' +
      '<span>' + ICONES.eclair + esc(cat.textes.livraisonCourte) + '</span>' +
      '<span>' + ICONES.cadenas + esc(cat.textes.paiementSecurise) + '</span></p>';
  }

  /** Vignette légère (même visuel, 640 px) pour les listes ; l'original reste pour la fiche. */
  function vignette(p, cat) { return cat.experience && cat.experience.vignettesLegeres === false ? p.image : p.texture; }

  /** Tuile produit du mode simple (lien = fonctionne aussi sans JavaScript). */
  function tuile(p, cat, slug, racine) {
    var r = rac(racine);
    var dispo = achetable(p) && p.disponible;
    return '<li class="tuile' + (p.type === 'pack' ? ' tuile-pack' : '') + (p.promo ? ' tuile-promo promo-' + esc(p.promo.style || 'flash') : '') + '">' +
      '<a href="' + esc(r + 'shop/' + slug + '/' + p.id) + '" data-produit="' + esc(p.id) + '">' +
      '<span class="tuile-visuel"><img src="' + esc(r + vignette(p, cat)) + '" alt="" loading="lazy" decoding="async">' +
      (p.promo ? '<span class="tuile-remise" aria-label="' + p.promo.remise + '% off">−' + p.promo.remise + '%</span><span class="tuile-flash">' + iconePromo(p.promo) + esc(accroche(p.promo)) + '</span>' : '') + '</span>' +
      '<span class="tuile-nom">' + esc(p.nom) + '</span>' +
      (p.type === 'pack' ? '<span class="tuile-contenu">' + esc(p.contenuTexte) + '</span>' : p.resume ? '<span class="tuile-contenu">' + esc(p.resume) + '</span>' : '') +
      '<span class="tuile-prix">' + prixHTML(p, cat) + '</span>' +
      '<span class="tuile-etat ' + (dispo ? 'ok' : 'non') + '">' + esc(dispo ? cat.textes.enStock : cat.textes.indisponible) + '</span>' +
      '</a></li>';
  }

  function catalogue(boutique, cat, racine) {
    return bandeauPromo(boutique, cat) + boutique.sections.map(function (s, i) {
      return '<section class="rayon" aria-labelledby="rayon-' + i + '">' +
        '<h2 id="rayon-' + i + '" class="rayon-titre">' + esc(s.titre) + '</h2>' +
        '<ul class="grille">' + s.produits.map(function (id) { return tuile(cat.produits[id], cat, boutique.slug, racine); }).join('') + '</ul>' +
        '</section>';
    }).join('');
  }

  /**
   * Fiche produit — section A, dans l'ordre exact :
   * 1 Nom · 2 Image · 3 Description · 4 Valeurs · 5 Prix · 6 Pays · 7 Format ·
   * 8 Conditions · 9 Instructions · 10 Disponibilité · 11 Livraison
   * (+ quantité, total et actions d'achat)
   */
  /* ------------------------------ Fiche produit (page « grande enseigne ») ------------------------------ */
  /** Titre complet et descriptif (référencement + lisibilité). */
  function titreProduit(p) {
    if (p.type === 'carte') return /gift card/i.test(p.nom) ? p.nom : p.nom + ' Gift Card';
    return p.nom;
  }
  function genreProduit(p) { return p.type === 'pack' ? 'Gift card bundle' : p.type === 'abonnement' ? 'Digital subscription' : 'Digital gift card'; }
  /** Rayon et boutique de l'article (fil d'Ariane). */
  function rayonDe(p, cat, slug) {
    var bs = cat.boutiques || [];
    var ordre = slug ? bs.filter(function (b) { return b.slug === slug; }).concat(bs.filter(function (b) { return b.slug !== slug; })) : bs;
    for (var i = 0; i < ordre.length; i++) {
      for (var j = 0; j < ordre[i].sections.length; j++) {
        var s = ordre[i].sections[j];
        if (s.produits.indexOf(p.id) >= 0) return { boutique: ordre[i], rayon: s.titre.replace(/^Aisle \d+ — /, '') };
      }
    }
    return null;
  }
  /** Ligne « ce que contient le pack » en texte : « Steam €50 + PlayStation Store €25 ». */
  function contenuCourt(p, cat) {
    return (p.contenu || []).map(function (c) { var inc = cat.produits[c.produit]; return (inc ? inc.nom : c.produit) + (c.montant ? ' ' + euros(c.montant) : ''); }).join(' + ');
  }
  /** Points clés « About this item ». */
  function pointsCles(p, cat) {
    var m = cat.montantLibre; var t = cat.textes;
    var zone = cat.site.zoneValidite || cat.site.paysValidite.join(', ');
    var l = [];
    if (p.type === 'pack') {
      l.push(p.description);
      l.push('Includes ' + p.contenu.length + ' digital codes: ' + p.contenu.map(function (c) { var inc = cat.produits[c.produit]; return inc.nom + (c.montant ? ' (' + euros(c.montant) + ')' : ''); }).join(', ') + '.');
      var valeur = p.prixAvant != null ? p.prixAvant : p.prix;
      if (valeur != null) l.push('Total value ' + euros(valeur) + (p.promo ? ', yours for ' + euros(p.prix) + ' with the ' + p.promo.libelle + ' (−' + p.promo.remise + '%).' : '.'));
      l.push('Each code arrives in the same email and can be redeemed separately, so you can keep one and give another.');
    } else if (p.type === 'carte') {
      l.push(p.description);
      l.push('Choose any value from ' + euros(m.min) + ' to ' + euros(m.max) + ': the full amount is credited to the account.');
      l.push('Credit can be spent in several purchases and is added to the existing account balance.');
    } else {
      l.push(p.description);
      if (p.valeurAffichee) l.push('Value: ' + p.valeurAffichee + '.');
    }
    l.push('Digital code delivered by email within minutes of payment. Nothing is shipped.');
    l.push('Valid for accounts in ' + zone.replace(/\.$/, '') + '.');
    l.push('Single-use personal code. Please check that the recipient’s account is registered in a supported region.');
    return l.filter(Boolean);
  }
  /** Étapes d'utilisation (à partir du texte d'instructions de la configuration). */
  function etapesUtilisation(texte) {
    return String(texte || '').split(/(?<=\.)\s+/).map(function (s) { return s.trim(); }).filter(Boolean);
  }

  function fiche(p, cat, opts) {
    opts = opts || {};
    var r = rac(opts.racine);
    var m = cat.montantLibre;
    var carte = p.type === 'carte';
    var montant = opts.montant || m.defaut;
    var dispo = opts.disponible != null ? opts.disponible : p.disponible;
    var vendable = achetable(p);
    var pu = carte ? prixCarte(p, montant) : p.prix;
    var qMax = (cat.experience && cat.experience.quantiteMax) || 10;
    var titre = titreProduit(p);
    var style = p.promo ? (p.promo.style || 'flash') : '';
    var ou = rayonDe(p, cat, opts.boutique);
    var ok = vendable && dispo;
    var h = [];

    // ---------- Colonne image (galerie) ----------
    var vignettes = '';
    if (p.type === 'pack') {
      vignettes = '<div class="pp-vignettes" role="group" aria-label="Product images">' +
        '<button type="button" class="actif" data-image="' + esc(r + p.image) + '" aria-label="' + esc(titre) + '" aria-pressed="true"><img src="' + esc(r + vignette(p, cat)) + '" alt="" loading="lazy"></button>' +
        p.contenu.map(function (c) { var inc = cat.produits[c.produit]; return '<button type="button" data-image="' + esc(r + inc.image) + '" aria-label="' + esc(inc.nom) + '" aria-pressed="false"><img src="' + esc(r + vignette(inc, cat)) + '" alt="" loading="lazy"></button>'; }).join('') +
        '</div>';
    }
    h.push('<figure class="fp-scene pp-galerie' + (p.type === 'pack' ? ' fp-large' : '') + '">' +
      '<div class="pp-image"><div class="fp-carte"><img id="pp-image-principale" src="' + esc(r + p.image) + '" alt="' + esc(titre + (p.type === 'pack' ? ' — ' + contenuCourt(p, cat) : ' — digital code')) + '" decoding="async"><span class="fp-eclat" aria-hidden="true"></span></div>' +
      (p.promo ? '<span class="pp-pastille-remise promo-' + esc(style) + '">−' + p.promo.remise + '%</span>' : '') +
      '<span class="fp-badge" id="fp-badge"' + (pu == null ? ' hidden' : '') + '>' + (pu == null ? '' : esc(euros(carte ? montant : (p.prixAvant != null ? p.prixAvant : p.prix)))) + '</span></div>' +
      vignettes +
      '<figcaption class="pp-legende">' + ICONES.enveloppe + '<span>Digital product · delivered by email</span></figcaption>' +
      '</figure>');

    // ---------- En-tête ----------
    h.push('<header class="pp-tete">' +
      (ou ? '<nav class="pp-ariane" aria-label="Breadcrumb"><ol><li>' + esc(ou.boutique.nomCourt || ou.boutique.nom) + '</li><li>' + esc(ou.rayon) + '</li></ol></nav>' : '') +
      '<h2 class="fiche-nom" id="fiche-titre">' + esc(titre) + '</h2>' +
      '<p class="pp-sous-titre">' + (p.type === 'pack'
        ? esc(contenuCourt(p, cat))
        : (p.type === 'carte' ? 'Brand: <b>' + esc(p.nom) + '</b> · ' : '') + esc(genreProduit(p))) + '</p>' +
      '<ul class="pp-puces"><li>' + ICONES.eclair + 'Instant email delivery</li><li>' + ICONES.cadenas + 'Secure checkout</li><li>' + ICONES.enveloppe + 'Digital code · no shipping</li></ul>' +
      '</header>');

    // ---------- Bloc d'achat ----------
    var prix = pu != null ? euros(pu) : cat.textes.prixADefinir;
    var avant = p.promo ? (carte ? montant : p.prixAvant) : null;
    var a = [];
    if (p.promo) {
      a.push('<div class="pp-offre promo-' + esc(style) + '"><span class="pp-offre-nom">' + iconePromo(p.promo) + esc(p.promo.libelle) + '</span>' +
        (p.promo.fin ? '<span class="pp-offre-fin">Ends in ' + compteHTML(p.promo.fin, 'pp-compte', true) + '</span>' : '') + '</div>');
    }
    a.push('<div class="pp-prix' + (p.promo ? ' a-promo promo-' + esc(style) : '') + '">' +
      (p.promo ? '<span class="pp-remise">−' + p.promo.remise + '%</span>' : '') +
      '<span class="pp-montant"><span class="sr">Price</span><b id="fiche-prix">' + esc(prix) + '</b></span>' +
      '<div class="fp-total" id="fp-total-bloc" hidden><span>Total</span> <b id="fp-total"></b></div></div>');
    if (avant != null) a.push('<p class="pp-avant">Was: <s class="fp-avant" id="fiche-prix-avant">' + esc(euros(avant)) + '</s>' + (!carte && p.prixAvant != null ? ' · <span class="pp-eco">You save ' + esc(euros(p.prixAvant - p.prix)) + '</span>' : '') + '</p>');
    a.push('<p class="pp-frais">No fees at checkout · Pay with PayPal or card</p>');
    a.push('<p class="pp-dispo"><span id="fiche-dispo" class="etat ' + (ok ? 'ok' : 'non') + '">' + esc(ok ? cat.textes.enStock : cat.textes.indisponible) + '</span>' +
      '<span class="pp-livraison">' + ICONES.eclair + 'Delivered by email in minutes</span></p>');

    // Valeur
    if (carte) {
      var rapides = [20, 25, 50, 75, 100].filter(function (v) { return v >= m.min && v <= m.max && Math.round(v * 100) % Math.round(m.pas * 100) === 0; });
      a.push('<section class="pp-option fp-montant" aria-labelledby="pp-lib-valeur"><div class="pp-option-tete"><h3 id="pp-lib-valeur">Value</h3><span>' + euros(m.min) + ' – ' + euros(m.max) + '</span></div>' +
        '<div class="fp-pastilles" role="group" aria-label="Popular values">' + rapides.map(function (v) {
          return '<button type="button" data-montant="' + v + '" aria-pressed="' + (v === montant) + '">' + euros(v) + '</button>';
        }).join('') + '</div>' +
        '<div class="fp-exact"><label for="montant-saisie">Other amount</label>' +
          '<input type="range" class="fp-curseur" id="montant-curseur" min="' + m.min + '" max="' + m.max + '" step="' + m.pas + '" value="' + montant + '" aria-label="Amount slider">' +
          '<span class="montant-saisie"><span>€</span><input type="number" id="montant-saisie" inputmode="numeric" min="' + m.min + '" max="' + m.max + '" step="' + m.pas + '" value="' + montant + '"></span>' +
        '</div><p class="erreur-champ" id="montant-erreur" hidden></p></section>');
    } else {
      var base = p.prixAvant != null ? p.prixAvant : p.prix;
      var fixe = p.valeurAffichee || (base != null ? euros(base) : '');
      a.push('<section class="pp-option pp-ligne"><h3>Value</h3><p>' + esc(fixe) + ' <span>fixed value</span></p></section>');
    }
    a.push('<section class="pp-option pp-ligne fp-quantite"><h3>Quantity</h3>' +
      '<div class="fp-stepper"><button type="button" id="quantite-moins" aria-label="Remove one" disabled>−</button>' +
      '<output id="quantite-val" aria-live="polite">1</output>' +
      '<button type="button" id="quantite-plus" aria-label="Add one"' + (qMax <= 1 ? ' disabled' : '') + '>+</button></div></section>');
    var off = !ok;
    a.push('<div class="fiche-actions">' +
      '<p class="fp-recap" id="fp-recap" aria-live="polite"></p>' +
      '<p class="fp-alerte" id="fp-alerte" hidden></p>' +
      '<div class="fp-boutons">' +
      '<button type="button" class="btn btn-principal" id="btn-ajouter"' + (off ? ' disabled' : '') + '><span>Add to cart</span></button>' +
      '<button type="button" class="btn btn-secondaire" id="btn-acheter"' + (off ? ' disabled' : '') + '>Buy now · <span id="btn-acheter-prix">' + esc(vendable ? prix : '—') + '</span></button>' +
      '</div></div>');
    a.push('<ul class="pp-garanties">' +
      '<li>' + ICONES.cadenas + '<span><b>' + esc(cat.textes.paiementSecurise) + '</b> via PayPal</span></li>' +
      '<li>' + ICONES.eclair + '<span><b>Instant delivery</b> to your inbox</span></li>' +
      '<li>' + ICONES.globe + '<span><b>' + esc(cat.site.zoneCourte || 'Valid in the US & UK') + '</b></span></li></ul>');
    h.push('<div class="pp-achat">' + a.join('') + '</div>');

    // ---------- Contenu détaillé ----------
    h.push('<section class="pp-section"><h3>About this item</h3><ul class="pp-points">' + pointsCles(p, cat).map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></section>');
    if (p.type === 'pack') {
      h.push('<section class="pp-section fp-pack"><h3>What\'s in the pack</h3><ul class="pack-contenu">' + p.contenu.map(function (c) {
        var inc = cat.produits[c.produit];
        var val = c.montant ? euros(c.montant) : (c.libelle || '');
        return '<li><img src="' + esc(r + vignette(inc, cat)) + '" alt="" loading="lazy"><span><b>' + esc(inc.nom) + '</b><small>' + esc(inc.resume || genreProduit(inc)) + '</small></span>' +
          (val && inc.nom.indexOf(c.libelle || '§') === -1 ? '<em>' + esc(val) + '</em>' : '') + '</li>';
      }).join('') + '</ul><p class="pour-qui"><span>Ideal for</span> ' + esc(p.pourQui) + '</p></section>');
    }
    var rangee = function (lib, val) { return '<tr><th scope="row">' + lib + '</th><td>' + val + '</td></tr>'; };
    var valeurTxt = carte ? 'Any amount from ' + euros(m.min) + ' to ' + euros(m.max) : esc(p.valeurAffichee || (p.prixAvant != null ? euros(p.prixAvant) : p.prix != null ? euros(p.prix) : '—'));
    h.push('<section class="pp-section"><h3>Product details</h3><table class="pp-specs"><tbody>' +
      rangee('Brand', esc(p.type === 'pack' ? p.contenu.map(function (c) { return cat.produits[c.produit].nom; }).join(', ') : p.nom)) +
      rangee('Product type', esc(genreProduit(p))) +
      rangee('Value', valeurTxt) +
      (p.pourQui && p.pourQui !== '—' ? rangee('Ideal for', esc(p.pourQui)) : '') +
      rangee('Where it works', '<span class="zones">' + zonesHTML(cat) + '</span>') +
      rangee('Digital format', esc(cat.textes.formatNumerique)) +
      rangee('Terms of use', esc(cat.textes.conditionsUtilisation)) +
      rangee('Availability', '<span class="etat ' + (ok ? 'ok' : 'non') + '">' + esc(ok ? cat.textes.enStock : cat.textes.indisponible) + '</span>') +
      rangee('Delivery method and time', esc(cat.textes.livraison)) +
      '</tbody></table></section>');
    h.push('<section class="pp-section"><h3>How to redeem</h3><ol class="pp-etapes">' + etapesUtilisation(cat.textes.instructionsGenerales).map(function (e) { return '<li>' + esc(e) + '</li>'; }).join('') + '</ol></section>');
    h.push(liensConfiance(cat, r));
    return '<div class="fp pp' + (p.promo ? ' pp-promo-' + esc(style) : '') + '">' + h.join('') + '</div>';
  }


  /* ------------------------------ Newsletter (hologramme) ------------------------------ */
  /** Emblème « réacteur » : anneaux concentriques qui tournent (CSS) autour d'une enveloppe. */
  function holoEmbleme(classe) {
    var seg = '';
    for (var i = 0; i < 12; i++) {
      seg += '<path d="M60 31 L63.5 31.5 L62.4 39 L57.6 39 L56.5 31.5 Z" transform="rotate(' + (i * 30) + ' 60 60)"/>';
    }
    return '<svg class="holo-embleme ' + (classe || '') + '" viewBox="0 0 120 120" aria-hidden="true" focusable="false">' +
      '<circle class="he-fond" cx="60" cy="60" r="40"/>' +
      '<g class="he-a he-a1"><circle cx="60" cy="60" r="56" pathLength="100" stroke-dasharray="18 4 6 4 26 4 10 4 20 4"/></g>' +
      '<g class="he-a he-a2"><circle cx="60" cy="60" r="48" pathLength="100" stroke-dasharray="30 8 12 8 34 8"/></g>' +
      '<g class="he-a he-a3"><circle cx="60" cy="60" r="43" pathLength="100" stroke-dasharray="1 2"/></g>' +
      '<g class="he-seg">' + seg + '</g>' +
      '<circle class="he-coeur" cx="60" cy="60" r="19"/>' +
      '<g class="he-env"><rect x="49" y="52.5" width="22" height="15" rx="2"/><path d="M50 54 L60 61 L70 54"/></g>' +
      '</svg>';
  }

  /** Formulaire d'inscription holographique (tiroir #newsletter). */
  function formNewsletter(nl) {
    nl = nl || {};
    var champ = function (n, nom, lib, type, auto, extra) {
      return '<label class="holo-champ"><span class="holo-etiquette"><b>0' + n + '</b>' + lib + '</span>' +
        '<span class="holo-saisie"><input name="' + nom + '" type="' + type + '" autocomplete="' + auto + '"' + (extra || '') + '><i class="holo-trait" aria-hidden="true"></i></span></label>';
    };
    var opt = nl.telephoneObligatoire ? '' : ' <em>optional</em>';
    return '<div class="holo-cadre">' +
      '<span class="holo-coin hc1" aria-hidden="true"></span><span class="holo-coin hc2" aria-hidden="true"></span><span class="holo-coin hc3" aria-hidden="true"></span><span class="holo-coin hc4" aria-hidden="true"></span>' +
      '<span class="holo-balayage" aria-hidden="true"></span>' +
      '<div class="holo-hud" aria-hidden="true"><span>SYS://CLUB.LINK</span><span class="holo-vu"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span><span class="holo-live"><i></i>Online</span></div>' +
      '<div class="holo-vue" id="holo-vue-form">' +
      '<header class="holo-entete">' + holoEmbleme() +
      '<p class="holo-sur">Newsletter</p>' +
      '<h2 id="newsletter-titre" class="holo-titre">' + esc(nl.titre || 'Join the club') + '</h2>' +
      (nl.sousTitre ? '<p class="holo-sous">' + esc(nl.sousTitre) + '</p>' : '') +
      '</header>' +
      '<form class="holo-form" id="holo-form" novalidate>' +
      '<div class="holo-ligne">' +
      champ(1, 'prenom', 'First name', 'text', 'given-name', ' required maxlength="60" autocapitalize="words"') +
      champ(2, 'nom', 'Last name', 'text', 'family-name', ' required maxlength="60" autocapitalize="words"') +
      '</div>' +
      champ(3, 'email', 'Email', 'email', 'email', ' required maxlength="254" inputmode="email" spellcheck="false" autocapitalize="off"') +
      champ(4, 'telephone', 'Phone' + opt, 'tel', 'tel', (nl.telephoneObligatoire ? ' required' : '') + ' maxlength="20" inputmode="tel"') +
      '<div class="holo-piege" aria-hidden="true"><label>Website <input name="site" type="text" tabindex="-1" autocomplete="off"></label></div>' +
      '<label class="holo-accord"><input type="checkbox" name="consentement" required><span class="holo-case" aria-hidden="true"></span>' +
      '<span>I agree to receive news and offers from ' + esc(nl.nomSite || 'the store') + ' by email.</span></label>' +
      '<p class="holo-erreur" id="holo-erreur" role="alert" hidden></p>' +
      '<button type="submit" class="holo-bouton" id="holo-envoyer"><span class="hb-texte">' + esc(nl.bouton || 'Subscribe') + '</span><span class="hb-chevrons" aria-hidden="true">›››</span><span class="hb-charge" aria-hidden="true"></span></button>' +
      (nl.mentions ? '<p class="holo-mentions">' + esc(nl.mentions) + '</p>' : '') +
      '</form></div>' +
      '<div class="holo-vue holo-succes" id="holo-succes" hidden tabindex="-1">' +
      '<svg class="holo-ok" viewBox="0 0 120 120" aria-hidden="true" focusable="false"><circle class="ho-a1" cx="60" cy="60" r="52" pathLength="100"/><circle class="ho-a2" cx="60" cy="60" r="42" pathLength="100"/><path class="ho-coche" d="M40 61 L54 75 L82 46" pathLength="100"/></svg>' +
      '<p class="holo-sur">Access granted</p>' +
      '<h2 class="holo-titre">Welcome aboard<span id="holo-prenom"></span>!</h2>' +
      '<p class="holo-sous" id="holo-message">You’re on the list. Thanks — we’ll be in touch with our next offers.</p>' +
      '<button type="button" class="holo-bouton holo-bouton-sec" id="holo-retour"><span class="hb-texte">Back to the store</span></button>' +
      '</div></div>';
  }

  /** Bandeau holographique du mode simple (ouvre le formulaire). */
  function banniereNewsletter(cat) {
    var nl = cat && cat.experience && cat.experience.newsletter;
    if (!nl || !nl.actif) return '';
    return '<section class="holo-banniere" aria-labelledby="holo-banniere-titre">' +
      '<span class="holo-balayage" aria-hidden="true"></span>' + holoEmbleme('holo-embleme-petit') +
      '<div class="hbn-texte"><p class="holo-sur">Newsletter · Members first</p>' +
      '<h2 id="holo-banniere-titre">' + esc(nl.titre || 'Join the club') + '</h2>' +
      (nl.sousTitre ? '<p>' + esc(nl.sousTitre) + '</p>' : '') + '</div>' +
      '<button type="button" class="holo-bouton" data-newsletter="simple"><span class="hb-texte">' + esc(nl.bouton || 'Subscribe') + '</span><span class="hb-chevrons" aria-hidden="true">›››</span></button>' +
      '</section>';
  }

  /** FAQ construite uniquement à partir des textes de la configuration. */
  function faq(cat) {
    var t = cat.textes;
    var q = [
      ['How do I get my card?', t.livraison + ' ' + t.formatNumerique],
      ['Where does my card work?', (cat.site.zoneValidite || cat.site.paysValidite.join(', ')) + '.'],
      ['How do I use my code?', t.instructionsGenerales],
      ['How can I pay?', 'With PayPal or by debit/credit card (Visa, Mastercard) through PayPal, all on one screen.'],
      ['Can I get a refund?', t.conditionsUtilisation],
    ];
    return q.map(function (x) { return '<details><summary>' + esc(x[0]) + '</summary><p>' + esc(x[1]) + '</p></details>'; }).join('');
  }

  return { iconePromo: iconePromo, accroche: accroche, prixCarte: prixCarte, promoDeBoutique: promoDeBoutique, ciblePromo: ciblePromo, partiesRestantes: partiesRestantes, dateFin: dateFin, compteHTML: compteHTML, prixHTML: prixHTML, bandeauPromo: bandeauPromo, esc: esc, euros: euros, rac: rac, vignette: vignette, prixTexte: prixTexte, achetable: achetable, tuile: tuile, catalogue: catalogue, fiche: fiche, faq: faq, titreProduit: titreProduit, rayonDe: rayonDe, contenuCourt: contenuCourt, pointsCles: pointsCles, etapesUtilisation: etapesUtilisation, holoEmbleme: holoEmbleme, formNewsletter: formNewsletter, banniereNewsletter: banniereNewsletter, liensConfiance: liensConfiance, badgesConfiance: badgesConfiance, ICONES: ICONES };
}));
