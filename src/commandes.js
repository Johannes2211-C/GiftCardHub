'use strict';
/**
 * Fonctionnement automatique (section C) :
 *  1. le client choisit ses cartes      → creerCommande()
 *  2. il renseigne son e-mail
 *  3. il paie (PayPal ou carte bancaire via PayPal)
 *  4. le serveur vérifie AUPRÈS DE PAYPAL que le paiement est réellement confirmé
 *     (réponse de capture serveur-à-serveur + webhook signé), jamais sur la
 *     simple redirection du navigateur              → capturer() / traiterWebhook()
 *  5-7. un code disponible est réservé AVANT d'encaisser, associé à la
 *     transaction, puis marqué VENDU une fois le paiement confirmé :
 *     on n'encaisse jamais sans avoir un code à livrer.
 *  8. l'e-mail de livraison part automatiquement.
 */
const crypto = require('crypto');
const { prixLigne } = require('./catalogue');
const stock = require('./stock');
const { ErreurPayPal } = require('./paypal');

const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]{1,64}@[A-Za-z0-9.-]{1,189}\.[A-Za-z]{2,24}$/;

class ErreurClient extends Error {
  constructor(message, status = 400, extra = {}) { super(message); this.status = status; Object.assign(this, extra); }
}

function nouveauNumero() {
  const d = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const alea = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `CC-${d}-${alea}`;
}

const quantiteMax = (config) => {
  const q = Number(config.experience && config.experience.quantiteMax);
  return Number.isInteger(q) && q >= 1 ? Math.min(q, 50) : 10;
};

function creerServiceCommandes({ db, config: getConfig, paypal, mailer, journal = console }) {
  const cfg = () => (typeof getConfig === 'function' ? getConfig() : getConfig);
  const lire = (numero) => db.prepare('SELECT * FROM commandes WHERE numero = ?').get(numero);
  const parOrder = (orderId) => db.prepare('SELECT * FROM commandes WHERE paypal_order_id = ?').get(orderId);
  const statut = (numero, s, erreur = null) =>
    db.prepare('UPDATE commandes SET statut = ?, erreur = COALESCE(?, erreur) WHERE numero = ?').run(s, erreur, numero);

  /** Valide le panier reçu du navigateur et recalcule TOUS les prix depuis la configuration. */
  function validerPanier(email, lignesBrutes) {
    const config = cfg();
    if (typeof email !== 'string' || !EMAIL_RE.test(email.trim())) {
      throw new ErreurClient("Check your email address: it should look like name@example.com. That's where your code will be sent.");
    }
    if (!Array.isArray(lignesBrutes) || lignesBrutes.length === 0) throw new ErreurClient('Your cart is empty.');
    if (lignesBrutes.length > 20) throw new ErreurClient('Too many different items in your cart (20 maximum).');

    const lignes = [];
    for (const l of lignesBrutes) {
      const produit = String(l && l.produit || '');
      const quantite = Number(l && l.quantite || 1);
      const qMax = quantiteMax(config);
      if (!Number.isInteger(quantite) || quantite < 1 || quantite > qMax) throw new ErreurClient(`Quantity must be between 1 and ${qMax} per item.`);
      const p = config.produits[produit];
      if (!p) throw new ErreurClient('An item in your cart no longer exists. Remove it and try again.');
      const prix = prixLigne(config, produit, l.montant);
      if (!prix.ok) throw new ErreurClient(prix.message);
      lignes.push({ produit, quantite, prixCents: prix.prixCents, valeurCents: prix.valeurCents, libelleValeur: prix.libelleValeur, ...(prix.remise ? { remise: prix.remise } : {}) });
    }
    // Disponibilité (agrégée par produit + valeur)
    const besoin = new Map();
    for (const l of lignes) {
      const k = `${l.produit}|${config.produits[l.produit].type === 'carte' ? l.valeurCents : ''}`;
      besoin.set(k, (besoin.get(k) || { ...l, quantite: 0 }));
      besoin.get(k).quantite += l.quantite;
    }
    for (const b of besoin.values()) {
      if (b.quantite > quantiteMax(config)) throw new ErreurClient(`Quantity must be between 1 and ${quantiteMax(config)} per item.`);
      if (!stock.estDisponible(db, config, b.produit, b.valeurCents, b.quantite)) {
        throw new ErreurClient(`${config.produits[b.produit].nom} (${b.libelleValeur}) is unavailable right now. Choose another amount or another item.`, 409, { produit: b.produit });
      }
    }
    const totalCents = lignes.reduce((s, l) => s + l.prixCents * l.quantite, 0);
    return { email: email.trim(), lignes, totalCents };
  }

  async function creerCommande(email, lignesBrutes, consentement) {
    const config = cfg();
    const exige = config.experience && config.experience.consentementCGV;
    if (exige && consentement !== true) {
      throw new ErreurClient('Tick the box “I accept the Terms and immediate delivery” to get your code right away.');
    }
    const { email: e, lignes, totalCents } = validerPanier(email, lignesBrutes);
    const numero = nouveauNumero();
    db.prepare("INSERT INTO commandes (numero, email, lignes, total_cents, devise, consentement_le) VALUES (?, ?, ?, ?, ?, CASE WHEN ? THEN datetime('now') END)")
      .run(numero, e, JSON.stringify(lignes), totalCents, config.site.devise, exige ? 1 : 0);

    const articles = lignes.map((l) => {
      const p = config.produits[l.produit];
      return { nom: p.type === 'carte' ? `${p.nom} — ${l.libelleValeur}` : p.nom, quantite: l.quantite, prixCents: l.prixCents };
    });
    const order = await paypal.creerCommande({ numero, devise: config.site.devise, totalCents, articles, marque: config.site.nom });
    db.prepare('UPDATE commandes SET paypal_order_id = ? WHERE numero = ?').run(order.id, numero);
    return { orderId: order.id, numero };
  }

  /** Vérifie qu'une capture PayPal correspond EXACTEMENT à la commande. */
  function captureConforme(commande, capture) {
    return capture
      && capture.status === 'COMPLETED'
      && capture.amount
      && capture.amount.currency_code === commande.devise
      && Math.round(Number(capture.amount.value) * 100) === commande.total_cents
      && (capture.custom_id === undefined || capture.custom_id === commande.numero);
  }

  /** Marque les codes VENDUS puis envoie l'e-mail. Idempotent. */
  async function finaliser(numero, captureId) {
    const config = cfg();
    let commande = lire(numero);
    if (!commande) return null;
    if (commande.statut === 'livree') return commande;

    if (commande.statut !== 'payee') {
      const lignes = JSON.parse(commande.lignes);
      const attendus = lignes.reduce((s, l) => s + l.quantite, 0);
      // Si les réservations ont expiré entre-temps (cas rare : webhook tardif), on retente une attribution.
      if (stock.nbReserves(db, numero) < attendus) {
        stock.liberer(db, numero);
        try {
          stock.reserver(db, config, numero, lignes);
        } catch (e) {
          if (e.code !== 'STOCK') throw e;
          db.prepare("UPDATE commandes SET statut = 'a_rembourser', payee_le = datetime('now'), paypal_capture_id = ?, erreur = 'Stock épuisé après paiement' WHERE numero = ?")
            .run(String(captureId), numero);
          journal.error(`[commande ${numero}] payée mais stock épuisé : REMBOURSEMENT À FAIRE`);
          await mailer.envoyerAlerte(`Remboursement à faire : ${numero}`, `La commande ${numero} a été payée (capture ${captureId}) mais aucun code n'était disponible. Rembourse-la depuis ton compte PayPal.`).catch(() => {});
          return lire(numero);
        }
      }
      db.exec('BEGIN IMMEDIATE');
      try {
        stock.confirmerVente(db, numero);
        db.prepare("UPDATE commandes SET statut = 'payee', payee_le = datetime('now'), paypal_capture_id = ?, erreur = NULL WHERE numero = ?").run(captureId, numero);
        db.exec('COMMIT');
      } catch (e) { db.exec('ROLLBACK'); throw e; }
    }
    return envoyerEmail(numero);
  }

  const envoisEnCours = new Set(); // évite deux e-mails identiques (capture et webhook qui arrivent en même temps)
  async function envoyerEmail(numero) {
    const config = cfg();
    const commande = lire(numero);
    if (!commande || !['payee', 'livree'].includes(commande.statut)) return commande;
    if (envoisEnCours.has(numero)) return commande;
    envoisEnCours.add(numero);
    try {
      const codes = stock.codesVendus(db, numero);
      const attendus = JSON.parse(commande.lignes).reduce((s, l) => s + l.quantite, 0);
      if (codes.length < attendus) {
        // Ne jamais envoyer un e-mail avec un code manquant (« — ») : on prévient le propriétaire.
        db.prepare('UPDATE commandes SET erreur = ?, essais_email = essais_email + 1 WHERE numero = ?').run(`Codes manquants : ${codes.length}/${attendus}. E-mail non envoyé.`, numero);
        journal.error(`[commande ${numero}] ${codes.length}/${attendus} code(s) : e-mail NON envoyé, à traiter à la main`);
        if (commande.essais_email === 0) await mailer.envoyerAlerte(`Codes manquants : ${numero}`, `La commande ${numero} est payée mais seulement ${codes.length} code(s) sur ${attendus} sont attribués. L'e-mail de livraison n'a pas été envoyé. Vérifie le stock dans /admin puis renvoie l'e-mail depuis /admin/commandes.`).catch(() => {});
        return lire(numero);
      }
      await mailer.envoyerLivraison(config, commande, codes);
      db.prepare("UPDATE commandes SET statut = 'livree', email_envoye_le = datetime('now'), erreur = NULL, essais_email = essais_email + 1 WHERE numero = ?").run(numero);
      journal.info(`[commande ${numero}] e-mail de livraison envoyé`);
    } catch (e) {
      db.prepare('UPDATE commandes SET erreur = ?, essais_email = essais_email + 1 WHERE numero = ?').run(`E-mail : ${e.message}`.slice(0, 500), numero);
      const dernier = commande.essais_email + 1 >= 10;
      journal.error(`[commande ${numero}] échec e-mail : ${e.message} (${dernier ? 'ABANDON après 10 essais : renvoie-le depuis /admin/commandes' : 'nouvel essai automatique'})`);
      if (dernier) await mailer.envoyerAlerte(`E-mail de livraison non parti : ${numero}`, `La commande ${numero} est payée mais l'e-mail de livraison a échoué 10 fois (${e.message}). Corrige la configuration e-mail puis renvoie-le depuis /admin/commandes.`).catch(() => {});
    } finally { envoisEnCours.delete(numero); }
    return lire(numero);
  }

  /**
   * Appelé par le navigateur après validation dans la fenêtre PayPal.
   * Le navigateur ne fait que DÉCLENCHER : c'est la réponse de PayPal au serveur qui fait foi.
   */
  async function capturer(orderId) {
    const config = cfg();
    const commande = parOrder(orderId);
    if (!commande) throw new ErreurClient('Order not found.', 404);
    if (['payee', 'livree'].includes(commande.statut)) return resume(lire(commande.numero));
    if (commande.statut === 'en_attente') return resume(commande);
    if (commande.statut !== 'creee') throw new ErreurClient('This order can no longer be paid. Please start your purchase again.', 409);

    // 1. Réserver les codes AVANT d'encaisser (tout ou rien).
    const lignes = JSON.parse(commande.lignes);
    try {
      if (stock.nbReserves(db, commande.numero) === 0) stock.reserver(db, config, commande.numero, lignes);
    } catch (e) {
      if (e.code !== 'STOCK') throw e;
      statut(commande.numero, 'annulee', 'Stock épuisé avant paiement');
      throw new ErreurClient(`${e.message} You have not been charged.`, 409, { produit: e.produit });
    }

    // 2. Encaisser auprès de PayPal (serveur → PayPal).
    let resultat;
    try {
      resultat = await paypal.capturer(orderId, commande.numero);
    } catch (e) {
      if (e instanceof ErreurPayPal && e.issue === 'INSTRUMENT_DECLINED') {
        stock.liberer(db, commande.numero);
        throw new ErreurClient('Your payment method was declined. Choose another one or try again.', 402, { relancer: true });
      }
      if (e instanceof ErreurPayPal && e.issue === 'ORDER_ALREADY_CAPTURED') {
        resultat = await paypal.lireCommande(orderId);
      } else if (e instanceof ErreurPayPal && e.status >= 400 && e.status < 500) {
        // Refus net de PayPal (4xx) : rien n'a été encaissé, on peut le dire au client.
        stock.liberer(db, commande.numero);
        journal.error(`[commande ${commande.numero}] capture refusée : ${e.message} ${e.debugId || ''}`);
        throw new ErreurClient("The payment could not be confirmed. You have not been charged. Please try again in a moment.", 502);
      } else {
        // Délai dépassé, coupure réseau ou erreur 5xx : PayPal a PEUT-ÊTRE encaissé.
        // On ne libère pas les codes et on n'affirme pas « non débité » : on demande l'état réel à PayPal.
        journal.error(`[commande ${commande.numero}] capture incertaine : ${e.message} ${e.debugId || ''}`);
        let etat = null;
        try { etat = await paypal.lireCommande(orderId); } catch (_) { /* PayPal toujours injoignable */ }
        if (etat?.purchase_units?.[0]?.payments?.captures?.[0]) {
          resultat = etat; // le paiement est bien passé : suite normale
        } else {
          // Toujours inconnu : codes gardés réservés, la tâche de fond (ou le webhook) tranchera.
          statut(commande.numero, 'en_attente', 'Capture incertaine : vérification automatique auprès de PayPal');
          return resume(lire(commande.numero));
        }
      }
    }

    const capture = resultat?.purchase_units?.[0]?.payments?.captures?.[0];
    if (capture && capture.status === 'PENDING') {
      // Paiement en cours de vérification chez PayPal : les codes restent réservés,
      // le webhook PAYMENT.CAPTURE.COMPLETED déclenchera la livraison.
      statut(commande.numero, 'en_attente');
      return resume(lire(commande.numero));
    }
    if (!captureConforme(commande, capture)) {
      stock.liberer(db, commande.numero);
      statut(commande.numero, 'annulee');
      journal.error(`[commande ${commande.numero}] capture non conforme`, capture && capture.status);
      throw new ErreurClient("The payment was not confirmed. No code has been assigned.", 402);
    }
    return resume(await finaliser(commande.numero, capture.id));
  }

  /**
   * Commande « en attente » : demande à PayPal où en est le paiement et tranche.
   * Fonctionne même sans webhook (PAYPAL_WEBHOOK_ID absent).
   */
  async function reconcilier(commande) {
    if (!commande || commande.statut !== 'en_attente' || !commande.paypal_order_id) return;
    const numero = commande.numero;
    const etat = await paypal.lireCommande(commande.paypal_order_id);
    let capture = etat?.purchase_units?.[0]?.payments?.captures?.[0];
    if (!capture) {
      // Pas encore encaissée. Après 30 min sans capture, on rend les codes au stock.
      const vieux = db.prepare("SELECT cree_le < datetime('now', '-30 minutes') AS v FROM commandes WHERE numero = ?").get(numero).v;
      if (vieux) { stock.liberer(db, numero); statut(numero, 'annulee', 'Paiement jamais encaissé par PayPal'); journal.info(`[commande ${numero}] jamais encaissée : annulée, codes libérés`); return; }
      if (etat?.status !== 'APPROVED') return;
      // Le client a validé le paiement mais notre demande d'encaissement n'est jamais arrivée : on la rejoue
      // (même PayPal-Request-Id : PayPal ne peut pas encaisser deux fois).
      try {
        capture = (await paypal.capturer(commande.paypal_order_id, numero))?.purchase_units?.[0]?.payments?.captures?.[0];
      } catch (e) {
        if (e instanceof ErreurPayPal && e.status >= 400 && e.status < 500 && e.issue !== 'ORDER_ALREADY_CAPTURED') {
          stock.liberer(db, numero); statut(numero, 'annulee', `Encaissement refusé par PayPal : ${e.issue || e.message}`.slice(0, 300));
        }
        return; // sinon : nouvel essai au prochain passage
      }
      if (!capture) return;
    }
    if (capture.status === 'PENDING') return; // PayPal vérifie encore
    if (captureConforme(commande, capture)) {
      journal.info(`[commande ${numero}] paiement confirmé par PayPal (vérification automatique)`);
      await finaliser(numero, capture.id);
    } else if (['DECLINED', 'FAILED'].includes(capture.status)) {
      stock.liberer(db, numero); statut(numero, 'annulee', `Paiement ${capture.status} chez PayPal`);
    } else {
      journal.error(`[commande ${numero}] capture non conforme (${capture.status}) : à vérifier dans PayPal`);
      db.prepare('UPDATE commandes SET erreur = ? WHERE numero = ?').run(`Capture PayPal non conforme (${capture.status}) : à vérifier`, numero);
    }
  }

  /** Webhook PayPal signé (deuxième confirmation, et filet de sécurité). */
  async function traiterWebhook(evenement) {
    // L'événement n'est noté « vu » qu'APRÈS un traitement réussi : si le traitement échoue,
    // le renvoi de PayPal est retraité au lieu d'être écarté comme doublon (finaliser est idempotent).
    if (db.prepare('SELECT 1 AS vu FROM evenements_paypal WHERE id = ?').get(evenement.id)) return 'doublon';
    const resultat = await appliquerEvenement(evenement);
    db.prepare('INSERT OR IGNORE INTO evenements_paypal (id, type) VALUES (?, ?)').run(evenement.id, evenement.event_type);
    return resultat;
  }

  async function appliquerEvenement(evenement) {
    const r = evenement.resource || {};
    const numero = r.custom_id || r.invoice_id;
    const commande = numero ? lire(numero) : null;
    if (!commande) return 'ignore';

    switch (evenement.event_type) {
      case 'PAYMENT.CAPTURE.COMPLETED':
        if (!captureConforme(commande, r)) { journal.error(`[webhook] montant non conforme pour ${numero}`); return 'non_conforme'; }
        await finaliser(numero, r.id);
        return 'livre';
      case 'PAYMENT.CAPTURE.DENIED':
      case 'PAYMENT.CAPTURE.DECLINED':
        if (!['payee', 'livree'].includes(commande.statut)) { stock.liberer(db, numero); statut(numero, 'annulee'); }
        return 'annule';
      case 'PAYMENT.CAPTURE.REFUNDED':
      case 'PAYMENT.CAPTURE.REVERSED':
        journal.warn(`[webhook] ${evenement.event_type} pour ${numero}`);
        db.prepare('UPDATE commandes SET erreur = ? WHERE numero = ?').run(`PayPal : ${evenement.event_type}`, numero);
        return 'note';
      default:
        return 'ignore';
    }
  }

  /** Ce que voit le navigateur après paiement : JAMAIS de code. */
  function resume(c) {
    return {
      numero: c.numero,
      statut: c.statut, // payee | livree | en_attente | a_rembourser
      email: c.email,
      totalCents: c.total_cents,
      devise: c.devise,
      lignes: JSON.parse(c.lignes).map((l) => ({ produit: l.produit, quantite: l.quantite, libelleValeur: l.libelleValeur, prixCents: l.prixCents })),
    };
  }

  /** Tâches de fond : libérer les réservations abandonnées, retenter les e-mails échoués. */
  function demarrerTachesDeFond() {
    const t1 = setInterval(() => {
      try {
        const n = stock.libererReservationsExpirees(db, 15);
        if (n) journal.info(`[stock] ${n} réservation(s) expirée(s) libérée(s)`);
        db.prepare("UPDATE commandes SET statut = 'annulee' WHERE statut = 'creee' AND cree_le < datetime('now', '-1 day')").run();
      } catch (e) { journal.error('[stock] nettoyage :', e.message); }
    }, 60_000);
    const t2 = setInterval(async () => {
      const a = db.prepare("SELECT numero FROM commandes WHERE statut = 'payee' AND essais_email < 10").all();
      for (const { numero } of a) await envoyerEmail(numero).catch(() => {});
    }, 5 * 60_000);
    // Paiements « en attente » (vérification PayPal en cours, ou capture incertaine) : on interroge
    // PayPal toutes les 2 minutes pour livrer ou annuler, sans dépendre du webhook.
    let enCours = false;
    const t3 = setInterval(async () => {
      if (enCours || !paypal.configure()) return;
      enCours = true;
      try {
        const a = db.prepare("SELECT * FROM commandes WHERE statut = 'en_attente' AND cree_le > datetime('now', '-30 days')").all();
        for (const c of a) await reconcilier(c).catch((e) => journal.error(`[commande ${c.numero}] vérification PayPal : ${e.message}`));
      } catch (e) { journal.error('[paypal] vérification des paiements en attente :', e.message); } finally { enCours = false; }
    }, 2 * 60_000);
    t1.unref(); t2.unref(); t3.unref();
    return () => { clearInterval(t1); clearInterval(t2); clearInterval(t3); };
  }

  return { validerPanier, creerCommande, capturer, traiterWebhook, envoyerEmail, finaliser, reconcilier, demarrerTachesDeFond, lire };
}

module.exports = { creerServiceCommandes, ErreurClient, EMAIL_RE };
