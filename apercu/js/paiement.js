// Paiement PayPal (Smart Payment Buttons) : PayPal + carte bancaire (Visa, Mastercard).
// Le navigateur ne fixe JAMAIS le prix : il envoie le panier, le serveur calcule
// le total depuis la configuration, crée la commande PayPal et la capture.

let chargement = null;

export function chargerSDK(clientId, devise = 'EUR') {
  if (window.paypal && window.paypal.Buttons) return Promise.resolve(window.paypal);
  if (chargement) return chargement;
  chargement = new Promise((ok, ko) => {
    const s = document.createElement('script');
    const p = new URLSearchParams({
      'client-id': clientId,
      currency: devise,
      intent: 'capture',
      components: 'buttons',
      'enable-funding': 'card',
      locale: 'en_US',
    });
    s.src = `https://www.paypal.com/sdk/js?${p}`;
    s.async = true;
    s.dataset.namespace = 'paypal';
    s.onload = () => (window.paypal ? ok(window.paypal) : ko(new Error('PayPal SDK unavailable')));
    s.onerror = () => { chargement = null; ko(new Error("Couldn't load PayPal. Check your connection and try again.")); };
    document.head.appendChild(s);
  });
  return chargement;
}

async function lireJSON(r) {
  try { return await r.json(); } catch (_) { return {}; }
}

/**
 * Affiche les boutons PayPal / Carte bancaire.
 * @param {HTMLElement} conteneur
 * @param {{api:string, valider:()=>boolean, donnees:()=>{email:string, lignes:Array},
 *          succes:(resume)=>void, erreur:(message, produit?)=>void, annule:()=>void}} o
 */
export async function afficherBoutons(conteneur, o) {
  const paypal = await chargerSDK(o.clientId, o.devise);
  conteneur.innerHTML = '';
  // L'erreur levée dans createOrder peut perdre ses propriétés en passant par le SDK : on la garde ici.
  let derniere = null;
  const boutons = paypal.Buttons({
    style: { layout: 'vertical', shape: 'pill', label: 'pay', height: 48, tagline: false },

    // Vérifie l'e-mail AVANT d'ouvrir la fenêtre de paiement
    onClick(_data, actions) {
      return o.valider() ? actions.resolve() : actions.reject();
    },

    // 1. Le serveur crée la commande (montant calculé côté serveur)
    async createOrder() {
      derniere = null;
      const r = await fetch(`${o.api}/api/commandes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(o.donnees()),
      });
      const j = await lireJSON(r);
      if (!r.ok) {
        const e = new Error(j.erreur || "Couldn't prepare the payment.");
        e.produit = j.produit;
        e.affichable = true;
        derniere = e;
        throw e;
      }
      return j.id;
    },

    // 2. Le serveur capture le paiement auprès de PayPal puis livre le code par e-mail
    async onApprove(data, actions) {
      const r = await fetch(`${o.api}/api/commandes/${encodeURIComponent(data.orderID)}/capture`, { method: 'POST' });
      const j = await lireJSON(r);
      if (!r.ok) {
        if (j.relancer) { o.erreur(j.erreur); return actions.restart(); }
        o.erreur(j.erreur || 'The payment was not confirmed. You have not been charged.', j.produit);
        return undefined;
      }
      o.succes(j);
      return undefined;
    },

    onCancel() { o.annule && o.annule(); },

    onError(err) {
      const e = derniere || err;
      o.erreur(e && e.affichable ? e.message : 'Something went wrong with the payment. Please try again in a moment.', e && e.produit);
    },
  });

  if (!boutons.isEligible()) throw new Error('Payment is not available in this browser.');
  await boutons.render(conteneur);
  return boutons;
}
