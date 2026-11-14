'use strict';
/**
 * Importe des codes dans la table de stock depuis un fichier CSV (séparateur ;).
 *   produit;valeur;code
 *   steam;50;XXXX-XXXX-XXXX        (valeur en euros, vide = à renseigner)
 * Usage : npm run importer-stock -- private/stock-initial.csv
 * Les doublons sont ignorés : relancer l'import ne crée pas de doublon.
 */
require('dotenv').config();
require('../src/env').nettoyerEnv();
const fs = require('fs');
const path = require('path');
const { chargerConfig } = require('../src/catalogue');
const { ouvrirBase } = require('../src/db');
const stock = require('../src/stock');

const fichier = process.argv[2];
if (!fichier) { console.error('Indique le fichier : npm run importer-stock -- private/stock-initial.csv'); process.exit(1); }

const config = chargerConfig();
const db = ouvrirBase(process.env.DB_PATH || path.join(__dirname, '..', 'data', 'boutique.sqlite'));
const r = stock.importerCsv(db, config, fs.readFileSync(fichier, 'utf8'));
console.log(`✓ ${r.ajoutes} code(s) importé(s), ${r.doublons} doublon(s) ignoré(s).`);
if (r.erreurs.length) { console.error('Lignes ignorées :\n - ' + r.erreurs.join('\n - ')); process.exitCode = 1; }
