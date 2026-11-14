'use strict';
// Génère une clé de chiffrement pour CLE_CHIFFREMENT_CODES (à copier dans .env / ton hébergeur).
// ⚠ Garde-la précieusement : sans elle, les codes déjà en stock sont illisibles.
console.log(require('crypto').randomBytes(32).toString('hex'));
