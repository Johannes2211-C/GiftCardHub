/* =====================================================================
   Bloc de paiement express — cartes cadeaux
   PayPal Smart Payment Buttons : bouton PayPal + « Carte de débit ou de
   crédit » (Visa, Mastercard). Tous les paiements arrivent sur TON compte
   PayPal (celui du Client ID configuré sur le serveur).

   Insertion (WordPress : bloc « HTML personnalisé ») :
     <div class="ccp" data-api="https://www.ton-domaine.fr" data-produit="steam"></div>
     <link rel="stylesheet" href="https://www.ton-domaine.fr/embed/bloc-paiement.css">
     <script src="https://www.ton-domaine.fr/embed/bloc-paiement.js" defer></script>

   Attributs :
     data-api      adresse de ton serveur (obligatoire hors du site lui-même)
     data-produit  identifiant de l'article (voir config/boutique.config.js)
     data-montant  montant proposé par défaut pour une carte (facultatif)

   Sécurité : le bloc n'envoie que l'article, le montant voulu et l'e-mail.
   Le serveur recalcule le prix depuis sa configuration, crée et capture
   la commande PayPal, puis envoie le code par e-mail. Aucun code ici.
   ===================================================================== */
(function () {
  'use strict';
  var EMAIL_RE = /^[^\s@<>()[\]\\,;:"]{1,64}@[A-Za-z0-9.-]{1,189}\.[A-Za-z]{2,24}$/;
  var sdk = null;
  var CADENAS = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M12 2a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V7a5 5 0 0 0-5-5Zm-3 8V7a3 3 0 0 1 6 0v3H9Z"/></svg>';

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function euros(n) { var v = Number(n); return '€' + (Number.isInteger(v) ? String(v) : v.toFixed(2)); }

  function chargerSDK(clientId, devise) {
    if (window.paypal && window.paypal.Buttons) return Promise.resolve(window.paypal);
    if (sdk) return sdk;
    sdk = new Promise(function (ok, ko) {
      var s = document.createElement('script');
      s.src = 'https://www.paypal.com/sdk/js?' + new URLSearchParams({
        'client-id': clientId, currency: devise || 'EUR', intent: 'capture',
        components: 'buttons', 'enable-funding': 'card', locale: 'en_US',
      });
      s.async = true;
      s.onload = function () { ok(window.paypal); };
      s.onerror = function () { sdk = null; ko(new Error('PayPal is not responding. Check your connection and try again.')); };
      document.head.appendChild(s);
    });
    return sdk;
  }

  function init(el) {
    var api = (el.getAttribute('data-api') || '').replace(/\/+$/, '');
    var id = el.getAttribute('data-produit');
    el.innerHTML = '<div class="ccp-carte ccp-attente">Loading…</div>';
    fetch(api + '/api/catalogue')
      .then(function (r) { if (!r.ok) throw new Error(); return r.json(); })
      .then(function (cat) { rendre(el, cat, api, id); })
      .catch(function () { el.innerHTML = '<div class="ccp-carte"><p class="ccp-alerte">Payment is temporarily unavailable. Please try again in a few minutes.</p></div>'; });
  }

  function rendre(el, cat, api, id) {
    var p = cat.produits[id];
    if (!p) { el.innerHTML = '<div class="ccp-carte"><p class="ccp-alerte">Item not found: check data-produit.</p></div>'; return; }
    var m = cat.montantLibre;
    var carte = p.type === 'carte';
    var montant = carte ? Math.min(m.max, Math.max(m.min, Number(el.getAttribute('data-montant')) || m.defaut)) : null;
    var quantite = 1;
    var dispo = p.disponible && (carte || p.prix != null);
    var puces = [m.min, m.defaut, m.max].filter(function (v, i, a) { return a.indexOf(v) === i; });

    el.innerHTML =
      '<form class="ccp-carte" novalidate>' +
        '<div class="ccp-tete"><img src="' + esc(api + '/' + p.texture) + '" alt="" loading="lazy">' +
          '<div><p class="ccp-nom">' + esc(p.nom) + '</p><p class="ccp-sous">' + esc(cat.textes.livraisonCourte) + '</p></div></div>' +
        (carte
          ? '<div class="ccp-bloc"><div class="ccp-ligne"><label for="ccp-m-' + id + '">Amount</label><output class="ccp-montant-val">' + euros(montant) + '</output></div>' +
            '<input class="ccp-curseur" id="ccp-m-' + id + '" type="range" min="' + m.min + '" max="' + m.max + '" step="' + m.pas + '" value="' + montant + '">' +
            '<div class="ccp-puces">' + puces.map(function (v) { return '<button type="button" data-v="' + v + '">' + euros(v) + '</button>'; }).join('') + '</div></div>'
          : '<div class="ccp-bloc ccp-ligne"><span>' + (p.type === 'pack' ? esc(p.contenuTexte) : 'Fixed value: ' + esc(p.valeurAffichee || euros(p.prix))) + '</span></div>') +
        '<div class="ccp-bloc ccp-ligne"><span>Quantity</span><span class="ccp-qte"><button type="button" data-q="-1" aria-label="Less">−</button><b>1</b><button type="button" data-q="1" aria-label="More">+</button></span></div>' +
        '<label class="ccp-champ"><span>Your email (your code will be sent here)</span><input type="email" inputmode="email" autocomplete="email" placeholder="name@example.com" required></label>' +
        '<p class="ccp-info" aria-live="polite"></p>' +
        (cat.experience && cat.experience.consentementCGV ? '<label class="ccp-consent"><input type="checkbox"><span>I accept the <a href="' + esc((cat.site.liens && cat.site.liens.cgv) || api + '/help#cgv') + '" target="_blank" rel="noopener">Terms &amp; Conditions</a> and immediate delivery of my code: I understand I lose my right to cancel.</span></label>' : '') +
        '<div class="ccp-total"><span>Total' + (p.promo ? ' <em class="ccp-promo">−' + p.promo.remise + '% · ' + esc(p.promo.libelle) + '</em>' : '') + '</span><b></b></div>' +
        '<button type="submit" class="ccp-payer"></button>' +
        '<div class="ccp-moyens" hidden><p class="ccp-choix">Choose how to pay</p><div class="ccp-boutons"></div><button type="button" class="ccp-retour">Change my order</button></div>' +
        '<p class="ccp-confiance">' + CADENAS + ' Secure payment PayPal · Visa · Mastercard</p>' +
      '</form>';

    var f = el.querySelector('form');
    var champ = f.querySelector('input[type=email]');
    var info = f.querySelector('.ccp-info');
    var payer = f.querySelector('.ccp-payer');
    var moyens = f.querySelector('.ccp-moyens');
    var zone = f.querySelector('.ccp-boutons');
    var minuterie = null;

    function prixUnitaire() { return carte ? (p.promo ? Math.round(montant * (100 - p.promo.remise)) / 100 : montant) : p.prix; }
    function total() { return (prixUnitaire() || 0) * quantite; }
    function maj() {
      f.querySelector('.ccp-total b').textContent = prixUnitaire() == null ? cat.textes.prixADefinir : euros(total());
      if (carte) f.querySelector('.ccp-montant-val').textContent = euros(montant);
      f.querySelector('.ccp-qte b').textContent = quantite;
      payer.disabled = !dispo || prixUnitaire() == null;
      payer.textContent = !dispo ? 'Unavailable' + (carte ? ' for this amount' : '') : 'Pay ' + euros(total());
    }
    function verifierStock() {
      if (!carte) return;
      clearTimeout(minuterie);
      minuterie = setTimeout(function () {
        fetch(api + '/api/disponibilite?produit=' + encodeURIComponent(id) + '&montant=' + montant)
          .then(function (r) { return r.json(); })
          .then(function (j) { dispo = Boolean(j.disponible); maj(); })
          .catch(function () {});
      }, 250);
    }
    function message(t, erreur) { info.textContent = t; info.className = 'ccp-info' + (erreur ? ' ccp-erreur' : ''); }
    function emailValide() {
      var v = champ.value.trim();
      if (!v) { message("Enter your email: that's where your code will be sent.", true); champ.focus(); return false; }
      if (v.indexOf('@') < 0) { message('Your email address is missing the “@”.', true); champ.focus(); return false; }
      if (!EMAIL_RE.test(v)) { message('Check your address: it should look like name@example.com.', true); champ.focus(); return false; }
      var cc = f.querySelector('.ccp-consent input');
      if (cc && !cc.checked) { message('Tick the box to accept the Terms and get your code right away.', true); cc.focus(); return false; }
      message('Your code will be sent to ' + v + '.'); return true;
    }

    if (carte) {
      var curseur = f.querySelector('.ccp-curseur');
      curseur.addEventListener('input', function () { montant = Number(curseur.value); maj(); verifierStock(); });
      f.querySelectorAll('.ccp-puces button').forEach(function (b) {
        b.addEventListener('click', function () { montant = Number(b.getAttribute('data-v')); curseur.value = montant; maj(); verifierStock(); });
      });
      verifierStock();
    }
    f.querySelectorAll('[data-q]').forEach(function (b) {
      b.addEventListener('click', function () { quantite = Math.max(1, Math.min((cat.experience && cat.experience.quantiteMax) || 10, quantite + Number(b.getAttribute('data-q')))); maj(); });
    });
    champ.addEventListener('input', function () { if (info.classList.contains('ccp-erreur')) message(''); });
    f.querySelector('.ccp-retour').addEventListener('click', function () { moyens.hidden = true; payer.hidden = false; f.querySelectorAll('.ccp-bloc button, .ccp-curseur, input').forEach(function (x) { x.disabled = false; }); });

    // Bouton principal : vérifie l'e-mail puis affiche PayPal + Carte bancaire (SDK officiel)
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!emailValide()) return;
      if (!cat.paypal.clientId) { message('Payment not set up on the server yet (PAYPAL_CLIENT_ID).', true); return; }
      payer.hidden = true; moyens.hidden = false;
      f.querySelectorAll('.ccp-bloc button, .ccp-curseur, input').forEach(function (x) { x.disabled = true; });
      if (zone.childElementCount) return;
      zone.innerHTML = '<p class="ccp-attente">Loading secure payment…</p>';
      chargerSDK(cat.paypal.clientId, cat.paypal.devise).then(function (paypal) {
        zone.innerHTML = '';
        var derniere = null;
        return paypal.Buttons({
          style: { layout: 'vertical', shape: 'pill', label: 'pay', height: 48, tagline: false },
          createOrder: function () {
            derniere = null;
            return fetch(api + '/api/commandes', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ consentement: Boolean(f.querySelector('.ccp-consent input') && f.querySelector('.ccp-consent input').checked) || !(cat.experience && cat.experience.consentementCGV), email: champ.value.trim(), lignes: [{ produit: id, montant: montant, quantite: quantite }] }),
            }).then(function (r) { return r.json().then(function (j) { if (!r.ok) { derniere = j.erreur; throw new Error(j.erreur); } return j.id; }); });
          },
          onApprove: function (data, actions) {
            return fetch(api + '/api/commandes/' + encodeURIComponent(data.orderID) + '/capture', { method: 'POST' })
              .then(function (r) { return r.json().then(function (j) { return { r: r, j: j }; }); })
              .then(function (x) {
                if (!x.r.ok) { message(x.j.erreur || 'The payment was not confirmed. You have not been charged.', true); if (x.j.relancer) return actions.restart(); return undefined; }
                confirmer(x.j);
                return undefined;
              });
          },
          onCancel: function () { message('Payment cancelled. You can try again whenever you like.'); },
          onError: function () { message(derniere || 'Something went wrong with the payment. Please try again in a moment.', true); },
        }).render(zone);
      }).catch(function (err) { zone.innerHTML = ''; message(err.message, true); });
    });

    function confirmer(r) {
      el.innerHTML = '<div class="ccp-carte ccp-ok" role="status"><div class="ccp-coche" aria-hidden="true">✓</div>' +
        '<p class="ccp-nom">' + (r.statut === 'en_attente' ? 'Payment being checked' : 'All done!') + '</p>' +
        '<p>' + (r.statut === 'en_attente' ? 'Your code will be sent automatically to ' + esc(r.email) + ' as soon as PayPal confirms the payment.' : 'Your code has been sent to <b>' + esc(r.email) + '</b>. Remember to check your spam folder.') + '</p>' +
        '<p class="ccp-sous">Order ' + esc(r.numero) + ' · ' + euros(r.totalCents / 100) + '</p></div>';
    }
    maj();
  }

  function demarrer() { document.querySelectorAll('.ccp[data-produit]').forEach(init); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrer); else demarrer();
})();
