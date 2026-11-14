'use strict';
/**
 * Client minimal de l'API REST officielle PayPal (Orders v2 + Webhooks).
 * Aucune clé dans le code : PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET viennent de process.env.
 * PAYPAL_ENV = 'sandbox' (tests) ou 'live' (production).
 */

const BASES = {
  sandbox: 'https://api-m.sandbox.paypal.com',
  live: 'https://api-m.paypal.com',
};

class ErreurPayPal extends Error {
  constructor(message, { status, details, debugId } = {}) {
    super(message);
    this.status = status;
    this.details = details || [];
    this.debugId = debugId;
  }
  /** Ex. 'INSTRUMENT_DECLINED' : la carte a été refusée, l'acheteur peut réessayer. */
  get issue() { return this.details[0] && this.details[0].issue; }
}

function creerClientPayPal({
  clientId = process.env.PAYPAL_CLIENT_ID,
  secret = process.env.PAYPAL_CLIENT_SECRET,
  // Production = vrais paiements par défaut. PAYPAL_ENV=sandbox uniquement pour des essais.
  env = process.env.PAYPAL_ENV || (process.env.NODE_ENV === 'production' ? 'live' : 'sandbox'),
  base = process.env.PAYPAL_API_BASE || BASES[env] || BASES.sandbox,
  webhookId = process.env.PAYPAL_WEBHOOK_ID,
} = {}) {
  let jeton = null;
  let expire = 0;

  function configure() { return Boolean(clientId && secret); }

  async function accessToken() {
    if (jeton && Date.now() < expire - 60_000) return jeton;
    if (!configure()) throw new ErreurPayPal('PayPal non configuré : renseigne PAYPAL_CLIENT_ID et PAYPAL_CLIENT_SECRET.');
    const res = await fetch(`${base}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${clientId}:${secret}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
      signal: AbortSignal.timeout(15_000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new ErreurPayPal('Authentification PayPal refusée.', { status: res.status });
    jeton = data.access_token;
    expire = Date.now() + data.expires_in * 1000;
    return jeton;
  }

  async function appel(chemin, { method = 'GET', body, requestId, corpsBrut } = {}) {
    const headers = { Authorization: `Bearer ${await accessToken()}`, 'Content-Type': 'application/json' };
    if (requestId) headers['PayPal-Request-Id'] = requestId; // idempotence : rejouer = même résultat
    const res = await fetch(base + chemin, {
      method,
      headers,
      body: corpsBrut !== undefined ? corpsBrut : body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30_000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new ErreurPayPal(data.message || `Erreur PayPal ${res.status}`, {
        status: res.status, details: data.details, debugId: data.debug_id,
      });
    }
    return data;
  }

  /** Crée la commande PayPal. Montants calculés côté serveur, jamais reçus du navigateur. */
  function creerCommande({ numero, devise, totalCents, articles, marque }) {
    const v = (c) => (c / 100).toFixed(2);
    return appel('/v2/checkout/orders', {
      method: 'POST',
      requestId: `creer-${numero}`,
      body: {
        intent: 'CAPTURE',
        purchase_units: [{
          reference_id: numero,
          custom_id: numero,
          invoice_id: numero,
          description: 'Cartes cadeaux numériques',
          amount: {
            currency_code: devise,
            value: v(totalCents),
            breakdown: { item_total: { currency_code: devise, value: v(totalCents) } },
          },
          items: articles.map((a) => ({
            name: a.nom.slice(0, 127),
            quantity: String(a.quantite),
            unit_amount: { currency_code: devise, value: v(a.prixCents) },
            category: 'DIGITAL_GOODS',
          })),
        }],
        application_context: {
          brand_name: (marque || '').slice(0, 127) || undefined,
          locale: 'en-US',
          shipping_preference: 'NO_SHIPPING', // produit numérique : pas d'adresse
          user_action: 'PAY_NOW',
        },
      },
    });
  }

  const lireCommande = (orderId) => appel(`/v2/checkout/orders/${encodeURIComponent(orderId)}`);

  const capturer = (orderId, numero) =>
    appel(`/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
      method: 'POST', requestId: `capturer-${numero}`, corpsBrut: '{}',
    });

  /**
   * Vérifie la signature d'un webhook auprès de PayPal.
   * Le corps BRUT reçu est réinjecté tel quel (pas de re-sérialisation).
   */
  async function verifierWebhook(headers, corpsBrut) {
    if (!webhookId) throw new ErreurPayPal('PAYPAL_WEBHOOK_ID manquant : webhooks refusés.');
    const h = (n) => headers[n] || '';
    const enTete = JSON.stringify({
      auth_algo: h('paypal-auth-algo'),
      cert_url: h('paypal-cert-url'),
      transmission_id: h('paypal-transmission-id'),
      transmission_sig: h('paypal-transmission-sig'),
      transmission_time: h('paypal-transmission-time'),
      webhook_id: webhookId,
    });
    const corps = enTete.slice(0, -1) + ',"webhook_event":' + corpsBrut + '}';
    const r = await appel('/v1/notifications/verify-webhook-signature', { method: 'POST', corpsBrut: corps });
    return r.verification_status === 'SUCCESS';
  }

  /** Diagnostic : les identifiants sont-ils acceptés par PayPal (dans le bon mode) ? */
  async function verifier() {
    if (!configure()) return { ok: false, message: 'PAYPAL_CLIENT_ID ou PAYPAL_CLIENT_SECRET manquant.' };
    try {
      jeton = null;
      await accessToken();
      return { ok: true, message: `Identifiants acceptés (mode ${env === 'live' ? 'RÉEL' : 'TEST sandbox'}).` };
    } catch (e) {
      return { ok: false, message: `Identifiants refusés par PayPal en mode ${env}. Vérifie que les clés correspondent au mode (les clés sandbox ne marchent pas en live, et inversement).` };
    }
  }

  return { configure, creerCommande, lireCommande, capturer, verifierWebhook, verifier, env, webhookConfigure: () => Boolean(webhookId) };
}

module.exports = { creerClientPayPal, ErreurPayPal };
