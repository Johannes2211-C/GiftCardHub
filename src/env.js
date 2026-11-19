'use strict';
/**
 * Nettoie les clés collées dans .env ou dans le panneau de l'hébergeur (Render, hPanel…) :
 * espaces / retours à la ligne autour, guillemets ajoutés par erreur ("…" ou '…').
 * Remplacer une clé = modifier la variable puis redémarrer (ou redéployer) : rien d'autre à toucher.
 */
const CLES = [
  'PAYPAL_CLIENT_ID', 'PAYPAL_CLIENT_SECRET', 'PAYPAL_ENV', 'PAYPAL_WEBHOOK_ID', 'PAYPAL_API_BASE',
  'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'MAIL_FROM', 'ADMIN_EMAIL', 'CONTACT_EMAIL',
  'BREVO_API_KEY', 'BREVO_LIST_ID', 'CLE_CHIFFREMENT_CODES', 'SITE_URL', 'ADMIN_USER', 'ADMIN_PASSWORD',
];

function nettoyerValeur(v) {
  let s = String(v).replace(/^﻿/, '').trim();
  for (let i = 0; i < 2; i++) {
    const m = s.match(/^(["'`])([\s\S]*)\1$/);
    if (!m) break;
    s = m[2].trim();
  }
  return s;
}

function nettoyerEnv(env = process.env) {
  for (const k of CLES) {
    if (env[k] === undefined) continue;
    const propre = nettoyerValeur(env[k]);
    if (propre === '') delete env[k]; else env[k] = propre;
  }
  if (env.PAYPAL_ENV) env.PAYPAL_ENV = env.PAYPAL_ENV.toLowerCase();
  if (env.PAYPAL_ENV && !['sandbox', 'live'].includes(env.PAYPAL_ENV)) {
    console.warn(`⚠ PAYPAL_ENV="${env.PAYPAL_ENV}" inconnu : utilise « sandbox » (tests) ou « live » (vrais paiements).`);
  }
  return env;
}

module.exports = { nettoyerEnv, nettoyerValeur };
