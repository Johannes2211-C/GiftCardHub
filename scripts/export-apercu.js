'use strict';
/**
 * Génère un APERÇU STATIQUE de la boutique (sans serveur, sans paiement) dans ./apercu/
 * Utile pour montrer le rendu (3D + mode simple) avant la mise en ligne.
 * Usage : npm run export-apercu
 */
const fs = require('fs');
const path = require('path');
const { chargerConfig, cataloguePublic } = require('../src/catalogue');
const { corps, variablesTheme } = require('../src/pages');

const racine = path.join(__dirname, '..');
const sortie = path.join(racine, 'apercu');
const config = chargerConfig();
const cat = cataloguePublic(config, { demo: true });
// Aperçu : Three.js depuis le CDN uniquement
cat.experience = { ...cat.experience, three: { local: cat.experience.three.cdn, cdn: cat.experience.three.cdn } };

fs.rmSync(sortie, { recursive: true, force: true });
fs.mkdirSync(sortie, { recursive: true });
const copier = (de, vers) => fs.cpSync(path.join(racine, de), path.join(sortie, vers), { recursive: true });
copier('public/css/style.css', 'css/style.css');
for (const f of ['app.js', 'gabarits.js', 'scene3d.js', 'enseignes.js', 'personnages.js', 'paiement.js', 'son.js']) copier(`public/js/${f}`, `js/${f}`);
copier('public/img', 'img');
fs.writeFileSync(path.join(sortie, 'catalogue-apercu.json'), JSON.stringify(cat));

const b = config.boutiques[config.boutiqueParDefaut];
const html = `<meta charset="utf-8">
<title>Gift Card Store</title>
<meta name="claude:viewport-fit-sides" content="cover">
<meta name="cc-mode" content="apercu">
<meta name="theme-color" content="${b.theme.couleurs.interface}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bodoni+Moda:ital,opsz,wght@0,6..96,500;0,6..96,700;1,6..96,500&family=Manrope:wght@400;500;600;700;800&family=Chakra+Petch:wght@500;600;700&display=swap">
<link rel="stylesheet" href="css/style.css">
<script>document.documentElement.dataset.boutique=${JSON.stringify(b.slug)};document.documentElement.setAttribute('style',${JSON.stringify(variablesTheme(b.theme))});</script>
<script src="js/gabarits.js" defer charset="utf-8"></script>
<script type="module" src="js/app.js"></script>
${corps(cat, { slug: null, racine: '', fondateur: 'apercu' })}`;
fs.writeFileSync(path.join(sortie, 'index.html'), html);
console.log('✓ Aperçu généré dans', sortie);
