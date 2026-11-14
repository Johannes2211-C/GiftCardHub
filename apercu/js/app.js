// =====================================================================
//  Interface de la boutique : barre, recherche, fiche, panier, paiement,
//  guide, idée cadeau, mode simple. Pilote la scène 3D (scene3d.js).
//  Tous les prix viennent du catalogue servi par le serveur (config).
// =====================================================================
import { son } from './son.js';
import { afficherBoutons } from './paiement.js';

const G = window.Gabarits;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const racineHTML = document.documentElement;
const meta = (n) => document.querySelector(`meta[name="${n}"]`)?.content || '';
const APERCU = meta('cc-mode') === 'apercu';
const API = meta('cc-api');
const RACINE = APERCU ? '' : '/';
const REDUIT = matchMedia('(prefers-reduced-motion: reduce)').matches;
const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]{1,64}@[A-Za-z0-9.-]{1,189}\.[A-Za-z]{2,24}$/;

const stock = {
  lire(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (_) { return d; } },
  ecrire(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) { /* stockage indisponible */ } },
};

let cat = null;
let boutique = null;           // slug de la boutique affichée
let scene = null;              // API de la scène 3D
let vue = 'facade';            // facade | interieur
let ficheCourante = null;      // { id, montant, disponible }
let derniereSource = null;     // élément qui a ouvert un tiroir (retour du focus)
let panier = stock.lire('cc-panier', { lignes: [], maj: 0 });
if (!Array.isArray(panier.lignes)) panier = { lignes: [], maj: 0 };

/* ------------------------------ Outils ------------------------------ */

const euros = (n) => G.euros(n);
const boutiqueDe = (slug) => cat.boutiques.find((b) => b.slug === slug);
const produitsDe = (slug) => boutiqueDe(slug).sections.flatMap((s) => s.produits);
const sansAccent = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const titreCourt = (t) => t.replace(/^Aisle \d+ — /, '');

function prixUnitaire(ligne) {
  const p = cat.produits[ligne.produit];
  if (!p) return null;
  if (p.type === 'carte') return G.prixCarte(p, ligne.montant);
  return p.prix;
}

function toast(texte, action) {
  const t = document.createElement('div');
  t.className = 'toast';
  const span = document.createElement('span');
  span.textContent = texte;
  t.appendChild(span);
  if (action) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = action.libelle;
    b.addEventListener('click', () => { t.remove(); action.faire(); });
    t.appendChild(b);
  }
  $('#toasts').appendChild(t);
  setTimeout(() => t.remove(), action ? 6500 : 3800);
}

/* ------------------------------ Thème ------------------------------ */

function appliquerTheme(slug) {
  const b = boutiqueDe(slug) || boutiqueDe(cat.boutiqueParDefaut);
  boutique = b.slug;
  const c = b.theme.couleurs;
  const vars = {
    '--c-interface': c.interface, '--c-interface-texte': c.interfaceTexte, '--c-fond': c.fondInterface,
    '--c-surface': c.surface, '--c-texte': c.texte, '--c-accent': c.accent, '--c-metal': c.metal,
    '--c-bouton': c.bouton, '--c-bouton-texte': c.boutonTexte,
  };
  for (const [k, v] of Object.entries(vars)) racineHTML.style.setProperty(k, v);
  racineHTML.dataset.boutique = b.slug;
  $('meta[name="theme-color"]')?.setAttribute('content', c.interface);
  $$('.onglet').forEach((o) => {
    if (o.dataset.boutique === b.slug) o.setAttribute('aria-current', 'page'); else o.removeAttribute('aria-current');
  });
  $('#catalogue-titre').textContent = b.nom;
  $('#catalogue-rayons').innerHTML = G.catalogue(b, cat, RACINE);
  brancherBandeauPromo();
  majRubanPromo(b);
  son.theme(b.theme.son);
  construireStations();
  compteARebours();
}

/* ------------------------------ Compte à rebours ------------------------------ */

let minuterieCompte = null;
function compteARebours() {
  clearInterval(minuterieCompte);
  const el = $('#compte');
  const t = boutiqueDe(boutique).theme;
  if (!(t.decor || []).includes('compteARebours') || !t.compteARebours || G.promoDeBoutique(boutiqueDe(boutique), cat)) { el.hidden = true; return; }
  const cible = new Date(t.compteARebours.cible).getTime();
  const maj = () => {
    const d = Math.max(0, cible - Date.now());
    const j = Math.floor(d / 864e5); const h = Math.floor(d / 36e5) % 24; const m = Math.floor(d / 6e4) % 60; const s = Math.floor(d / 1e3) % 60;
    const p = (n) => String(n).padStart(2, '0');
    el.innerHTML = `${G.esc(t.compteARebours.libelle)}<b>${j}d ${p(h)}h ${p(m)}m ${p(s)}s</b>`;
  };
  maj();
  el.hidden = vue !== 'interieur' || racineHTML.dataset.mode !== '3d';
  minuterieCompte = setInterval(maj, 1000);
}

/* ------------------------------ Promotions : ruban, bandeau, comptes à rebours ------------------------------ */

/** Met à jour tous les comptes à rebours [data-fin] de la page (bandeau, ruban, fiche). */
function majComptesPromo() {
  $$('[data-fin]').forEach((el) => {
    const q = G.partiesRestantes(el.dataset.fin);
    const p2 = (n) => String(n).padStart(2, '0');
    const v = { j: String(q.j), h: p2(q.h), m: p2(q.m), s: p2(q.s) };
    el.querySelectorAll('[data-u]').forEach((b) => {
      const n = v[b.dataset.u];
      if (b.textContent !== n) { b.textContent = n; if (!REDUIT) { b.classList.remove('tic'); void b.offsetWidth; b.classList.add('tic'); } }
    });
    if (Date.parse(el.dataset.fin) <= Date.now() && !el.dataset.fini) { el.dataset.fini = '1'; setTimeout(() => location.reload(), 1500); }
  });
}
setInterval(majComptesPromo, 1000);

/** Section de la boutique qui contient les articles en promo (pour y emmener le visiteur). */
function sectionPromo(b) {
  return Math.max(0, b.sections.findIndex((s) => s.produits.some((id) => cat.produits[id]?.promo)));
}
function allerAuxPromos() {
  const b = boutiqueDe(boutique);
  const i = sectionPromo(b);
  if (scene && racineHTML.dataset.mode === '3d') {
    if (vue !== 'interieur') allerBoutique(b.slug).then(() => scene.allerStation(`v${i}`));
    else scene.allerStation(`v${i}`);
  } else {
    document.getElementById(`rayon-${i}`)?.scrollIntoView({ behavior: REDUIT ? 'auto' : 'smooth', block: 'start' });
  }
}
function brancherBandeauPromo() {
  $$('[data-flash-cta]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); allerAuxPromos(); }));
}
/** Ruban « vente flash » sous la barre du haut (3D et page normale). */
function majRubanPromo(b) {
  const el = $('#ruban-promo');
  if (!el) return;
  const pr = G.promoDeBoutique(b, cat);
  racineHTML.classList.toggle('a-ruban', Boolean(pr));
  el.hidden = !pr;
  if (!pr) { el.innerHTML = ''; return; }
  el.dataset.style = pr.style || 'flash';
  const txt = `<span class="ruban-eclair">${G.iconePromo(pr)}</span><b>${G.esc(G.accroche(pr))}</b><span class="ruban-remise">−${pr.remise}%</span><span class="ruban-cible">${G.esc(G.ciblePromo(pr))}</span>`;
  el.innerHTML = `<span class="ruban-fixe">${txt}${pr.fin ? `<span class="ruban-fin">Ends in ${G.compteHTML(pr.fin, 'ruban-compte')}</span>` : ''}<span class="ruban-voir">Shop <span aria-hidden="true">→</span></span></span>`;
  el.setAttribute('aria-label', `${pr.libelle}: −${pr.remise}% ${G.ciblePromo(pr)}. See the deals`);
}

/* ------------------------------ Panier ------------------------------ */

function sauverPanier() {
  panier.maj = Date.now();
  stock.ecrire('cc-panier', panier);
  majBadgePanier();
  if (scene) scene.majPanier(panier.lignes);
}

function totalPanier() {
  return panier.lignes.reduce((s, l) => s + (prixUnitaire(l) || 0) * l.quantite, 0);
}

function majBadgePanier() {
  const n = panier.lignes.reduce((s, l) => s + l.quantite, 0);
  const t = totalPanier();
  $('#panier-nb').textContent = n;
  $('#panier-total').textContent = euros(t);
  $('#btn-panier').setAttribute('aria-label', `Cart: ${n} item${n !== 1 ? 's' : ''}, total ${euros(t)}`);
}

const QMAX = () => Math.max(1, Number(cat.experience && cat.experience.quantiteMax) || 10);
const ligneDe = (id, montant) => {
  const p = cat.produits[id];
  const m = p && p.type === 'carte' ? montant : null;
  return panier.lignes.find((x) => x.produit === id && x.montant === m);
};

/** Ajoute `quantite` exemplaires (même carte, même montant). Renvoie le nombre réellement ajouté. */
function ajouterAuPanier(id, montant, source, quantite = 1) {
  const p = cat.produits[id];
  if (!p || !G.achetable(p)) return 0;
  const m = p.type === 'carte' ? montant : null;
  const max = QMAX();
  const l = ligneDe(id, m);
  const deja = l ? l.quantite : 0;
  const ajout = Math.min(Math.max(1, Math.floor(quantite)), max - deja);
  if (ajout <= 0) { toast(`${max} maximum per item: you already have ${deja} in your cart.`); return 0; }
  if (l) l.quantite += ajout;
  else panier.lignes.push({ produit: id, montant: m, quantite: ajout });
  if (ajout < quantite) toast(`${max} maximum per item: ${ajout} added.`);
  sauverPanier();
  envolerVersPanier(source, p, ajout);
  son.ajout();
  // Petite fête : confettis aux couleurs de la boutique, au point de départ puis à l'arrivée dans le panier
  const rs = source && source.getBoundingClientRect ? source.getBoundingClientRect() : null;
  if (rs && rs.width) confettis(rs.left + rs.width / 2, rs.top + rs.height / 2, { n: 18 });
  setTimeout(() => { const rb = $('#btn-panier').getBoundingClientRect(); confettis(rb.left + rb.width / 2, rb.top + rb.height / 2, { n: 14, force: 0.55 }); }, REDUIT ? 0 : 760);
  const b = $('#btn-panier');
  b.classList.remove('pulse'); void b.offsetWidth; b.classList.add('pulse');
  return ajout;
}

/** Confettis aux couleurs de la boutique (éclairs pour le Black Friday, flocons et étoiles pour Noël). */
function confettis(x, y, { n = 24, force = 1, palette = null } = {}) {
  if (REDUIT || !Number.isFinite(x) || !Number.isFinite(y)) return;
  const d = boutiqueDe(boutique)?.theme?.decor || [];
  const style = palette || (d.includes('neon') ? 'flash' : d.some((k) => ['neige', 'sapin', 'guirlandes'].includes(k)) ? 'noel' : 'classique');
  const couleurs = { flash: ['#FF2D3A', '#FF7A1A', '#FFD23F', '#FFFFFF'], noel: ['#FFFFFF', '#D4AF37', '#C8283A', '#2E7A45'], classique: ['#C9A24B', '#1B2A41', '#F5DB98', '#E9E4D8'], holo: ['#5FE3FF', '#B8F4FF', '#FFFFFF', '#38E1FF'] }[style];
  const glyphes = { flash: ['⚡', '✦'], noel: ['❄', '★', '❄'], classique: ['✦'], holo: ['✦', '◆', '✉'] }[style];
  const zone = document.createElement('div');
  zone.className = 'confettis'; zone.setAttribute('aria-hidden', 'true');
  document.body.appendChild(zone);
  for (let i = 0; i < n; i++) {
    const e = document.createElement('i');
    const coul = couleurs[i % couleurs.length];
    if (i % 3 === 0) { e.className = 'glyphe'; e.textContent = glyphes[i % glyphes.length]; e.style.color = coul; }
    else { e.style.background = coul; if (i % 2) e.style.borderRadius = '50%'; }
    e.style.left = `${x}px`; e.style.top = `${y}px`;
    zone.appendChild(e);
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4;
    const v = (90 + Math.random() * 170) * force;
    const dx = Math.cos(a) * v; const dy = Math.sin(a) * v; const rot = (Math.random() - 0.5) * 720;
    e.animate([
      { transform: 'translate(-50%, -50%) rotate(0deg) scale(.4)', opacity: 1 },
      { transform: `translate(${dx}px, ${dy}px) rotate(${rot / 2}deg) scale(1)`, opacity: 1, offset: 0.45 },
      { transform: `translate(${dx * 1.25}px, ${dy + 180 * force}px) rotate(${rot}deg) scale(.7)`, opacity: 0 },
    ], { duration: 1000 + Math.random() * 700, easing: 'cubic-bezier(.15,.7,.3,1)', fill: 'forwards' });
  }
  setTimeout(() => zone.remove(), 1900);
}

function envolerVersPanier(source, p, n = 1) {
  if (REDUIT || !source) return;
  for (let k = 1; k < Math.min(n, 4); k += 1) setTimeout(() => envolerVersPanier(source, p, 1), k * 90);
  const r = source.getBoundingClientRect();
  const cible = $('#btn-panier').getBoundingClientRect();
  const img = document.createElement('img');
  img.src = RACINE + G.vignette(p, cat);
  img.alt = '';
  img.className = 'carte-volante';
  img.style.left = `${r.left + r.width / 2 - 45}px`;
  img.style.top = `${r.top + r.height / 2 - 28}px`;
  document.body.appendChild(img);
  requestAnimationFrame(() => {
    img.style.transform = `translate(${cible.left + cible.width / 2 - (r.left + r.width / 2)}px, ${cible.top + cible.height / 2 - (r.top + r.height / 2)}px) scale(.2) rotate(-12deg)`;
    img.style.opacity = '0.2';
  });
  setTimeout(() => img.remove(), 800);
}

/* ------------------------------ Tiroirs ------------------------------ */

function ouvrirTiroir(id) {
  $$('.tiroir').forEach((t) => { if (t.id !== id) t.hidden = true; });
  derniereSource = document.activeElement;
  const t = $(`#${id}`);
  t.hidden = false;
  $('#voile-tiroir').hidden = false;
  setTimeout(() => (t.querySelector('h2') || t.querySelector('button'))?.focus?.({ preventScroll: true }), 30);
  t.querySelector('h2')?.setAttribute('tabindex', '-1');
}

function fermerTiroirs() {
  const ouverte = $$('.tiroir').some((t) => !t.hidden);
  $$('.tiroir').forEach((t) => { t.hidden = true; });
  $('#voile-tiroir').hidden = true;
  if (ficheCourante) {
    ficheCourante = null;
    if (scene) scene.fermerProduit();
    majURL(boutique, null, true);
  }
  if (ouverte && derniereSource && document.contains(derniereSource)) derniereSource.focus({ preventScroll: true });
}

// Piège à focus simple dans le tiroir ouvert
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (!$('#guide').hidden) { fermerGuide(); return; }
    if (!$('#suggestions').hidden) { fermerSuggestions(); return; }
    if (!$('#menu').hidden) { basculerMenu(false); return; }
    if ($$('.tiroir').some((t) => !t.hidden)) { fermerTiroirs(); return; }
    if (scene && racineHTML.dataset.mode === '3d' && vue === 'interieur' && !e.target.closest('input')) { scene.reculer(); return; }
  }
  if (e.key !== 'Tab') return;
  const t = $$('.tiroir').find((x) => !x.hidden);
  if (!t) return;
  const f = $$('button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"]), iframe', t).filter((x) => x.offsetParent !== null);
  if (!f.length) return;
  if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
  else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
});

/* ------------------------------ Fiche produit ------------------------------ */

let minuterieDispo = null;
/** Le serveur répond seulement oui / non : jamais le nombre de codes en stock. */
async function verifierDisponibilite(id, montant, quantite = 1) {
  const p = cat.produits[id];
  if (APERCU) return true;
  if (p.type !== 'carte' && quantite <= 1) return p.disponible;
  try {
    const q = new URLSearchParams({ produit: id, quantite: String(quantite) });
    if (p.type === 'carte') q.set('montant', String(montant));
    const r = await fetch(`${API}/api/disponibilite?${q}`);
    const j = await r.json();
    return Boolean(j.disponible);
  } catch (_) { return p.disponible; }
}

function majEtatFiche() {
  const f = ficheCourante;
  if (!f) return;
  const p = cat.produits[f.id];
  const vendable = G.achetable(p) && f.disponible;
  const ok = vendable && !f.erreur;
  const d = $('#fiche-dispo');
  if (d) {
    d.className = `etat ${vendable ? 'ok' : 'non'}`;
    d.textContent = vendable ? cat.textes.enStock
      : f.quantite > 1 && f.disponibleUn ? 'Available in a smaller quantity'
      : p.type === 'carte' && f.montantsDispo && f.montantsDispo.length ? 'Sold out for this amount' : cat.textes.indisponible;
  }
  const alerte = $('#fp-alerte');
  if (alerte) {
    const autres = (f.montantsDispo || []).filter((v) => v !== f.montant);
    const msg = vendable || !G.achetable(p) || f.erreur ? ''
      : f.quantite > 1 && f.disponibleUn
        ? `Not enough ${p.type === 'pack' ? 'packs' : 'cards'} available for this quantity: lower the quantity${p.type === 'carte' ? ' or choose another amount' : ''}.`
        : p.type === 'carte' && autres.length ? `This amount is sold out. Available in ${autres.map(euros).join(', ')}.` : '';
    alerte.hidden = !msg; alerte.textContent = msg;
  }
  // Quantité, total et récapitulatif
  const pu = p.type === 'carte' ? G.prixCarte(p, f.montant) : p.prix;
  const max = QMAX();
  const qv = $('#quantite-val');
  if (qv) qv.textContent = f.quantite;
  const moins = $('#quantite-moins'); const plus = $('#quantite-plus');
  if (moins) moins.disabled = f.quantite <= 1;
  if (plus) plus.disabled = f.quantite >= max;
  const total = pu != null && !f.erreur ? pu * f.quantite : null;
  const tb = $('#fp-total-bloc');
  if (tb) { tb.hidden = f.quantite <= 1 || total == null; $('#fp-total').textContent = total == null ? '' : euros(total); }
  const bp = $('#btn-acheter-prix');
  if (bp && G.achetable(p)) bp.textContent = total == null ? '—' : euros(total);
  const badge = $('#fp-badge');
  if (badge && pu != null && !f.erreur) { badge.hidden = false; badge.textContent = euros(p.type === 'carte' ? f.montant : (p.prixAvant ?? p.prix)); }
  const recap = $('#fp-recap');
  if (recap) {
    const l = ligneDe(f.id, f.montant);
    const quoi = p.type === 'carte' && !f.erreur ? `${p.nom} · ${euros(f.montant)}` : p.nom;
    recap.innerHTML = `<span>${f.quantite > 1 ? `${f.quantite} × ` : ''}${G.esc(quoi)}</span>` +
      (l ? `<span class="fp-deja">Already in your cart: ${l.quantite}</span>` : '');
  }
  $$('.fp-pastilles [data-montant]').forEach((b) => b.setAttribute('aria-pressed', String(!f.erreur && Number(b.dataset.montant) === f.montant)));
  $('#btn-ajouter').disabled = !ok;
  $('#btn-acheter').disabled = !ok;
}

/** Vérifie le stock pour le montant + la quantité choisis (plus ce qui est déjà au panier). */
function planifierVerification(delai = 250) {
  const f = ficheCourante;
  if (!f || f.erreur) return;
  const { id, montant, quantite } = f;
  const l = ligneDe(id, montant);
  const total = quantite + (l ? l.quantite : 0);
  clearTimeout(minuterieDispo);
  minuterieDispo = setTimeout(async () => {
    const ok = await verifierDisponibilite(id, montant, Math.min(total, QMAX()));
    const okUn = ok || total <= 1 ? ok : await verifierDisponibilite(id, montant, 1);
    const g = ficheCourante;
    if (g && g.id === id && g.montant === montant && g.quantite === quantite) { g.disponible = ok; g.disponibleUn = okUn; majEtatFiche(); }
  }, delai);
}

/** Pastilles de montant : marque celles qui sont épuisées et, si le montant proposé
 *  n'est pas disponible, sélectionne un montant disponible (sauf si le client a déjà choisi). */
async function marquerMontants(id, appliquer) {
  const boutons = $$('.fp-pastilles [data-montant]');
  if (!boutons.length) return;
  const res = await Promise.all(boutons.map((b) => verifierDisponibilite(id, Number(b.dataset.montant), 1)));
  const f = ficheCourante;
  if (!f || f.id !== id) return;
  const dispos = [];
  boutons.forEach((b, k) => {
    b.classList.toggle('epuise', !res[k]);
    if (res[k]) { dispos.push(Number(b.dataset.montant)); b.removeAttribute('title'); } else b.title = 'Sold out for this amount';
  });
  f.montantsDispo = dispos;
  if (!f.touche && dispos.length && !dispos.includes(f.montant)) {
    appliquer(dispos.includes(cat.montantLibre.defaut) ? cat.montantLibre.defaut : dispos[0], 'auto');
  }
  majEtatFiche();
}

/** Carte qui s'incline sous le doigt / la souris, avec un reflet qui suit. */
function animerCarteFiche() {
  const scene = $('.fp-scene');
  const carte = $('.fp-carte');
  if (!scene || !carte || REDUIT) return;
  let raf = 0;
  const poser = (x, y) => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      carte.style.setProperty('--rx', `${(-y * 4).toFixed(2)}deg`);
      carte.style.setProperty('--ry', `${(x * 6).toFixed(2)}deg`);
      carte.style.setProperty('--mx', `${((x + 1) * 50).toFixed(1)}%`);
      carte.style.setProperty('--my', `${((y + 1) * 50).toFixed(1)}%`);
    });
  };
  scene.addEventListener('pointermove', (e) => {
    const r = scene.getBoundingClientRect();
    poser(Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width) * 2 - 1)), Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height) * 2 - 1)));
    carte.classList.add('suit');
  });
  scene.addEventListener('pointerleave', () => { carte.classList.remove('suit'); poser(0, 0); });
}

function ouvrirFiche(id) {
  const p = cat.produits[id];
  if (!p) return;
  const precedent = stock.lire('cc-montants', {})[id];
  const montant = p.type === 'carte' ? (precedent || cat.montantLibre.defaut) : null;
  ficheCourante = { id, montant, quantite: 1, disponible: APERCU ? true : p.disponible, disponibleUn: true, erreur: false };
  const c = $('#fiche-contenu');
  c.innerHTML = G.fiche(p, cat, { racine: RACINE, montant: montant || undefined, disponible: ficheCourante.disponible, boutique });
  $$('.pp-vignettes button', c).forEach((b) => b.addEventListener('click', () => {
    const img = $('#pp-image-principale');
    $$('.pp-vignettes button', c).forEach((x) => { x.classList.toggle('actif', x === b); x.setAttribute('aria-pressed', String(x === b)); });
    img.classList.add('change');
    setTimeout(() => { img.src = b.dataset.image; img.classList.remove('change'); }, REDUIT ? 0 : 140);
  }));
  c.scrollTop = 0;
  $('#fiche').scrollTop = 0;
  animerCarteFiche();

  if (p.type === 'carte') {
    const curseur = $('#montant-curseur');
    const saisie = $('#montant-saisie');
    const err = $('#montant-erreur');
    const { min, max, pas } = cat.montantLibre;
    const appliquer = (v, depuis) => {
      const n = Number(v);
      const valide = Number.isFinite(n) && n >= min && n <= max && Math.round(n * 100) % Math.round(pas * 100) === 0;
      ficheCourante.erreur = !valide;
      if (depuis !== 'init' && depuis !== 'auto') ficheCourante.touche = true;
      err.hidden = valide;
      if (!valide) { err.textContent = `Choose an amount between €${min} and €${max}${pas !== 1 ? ` (in steps of €${pas})` : ''}.`; majEtatFiche(); return; }
      ficheCourante.montant = n;
      if (depuis !== 'curseur') curseur.value = n;
      if (depuis !== 'saisie') saisie.value = n;
      curseur.style.setProperty('--rempli', `${((n - min) / (max - min)) * 100}%`);
      $('#fiche-prix').textContent = euros(G.prixCarte(p, n));
      if ($('#fiche-prix-avant')) $('#fiche-prix-avant').textContent = euros(n);
      if (depuis === 'pastille') { const b = $('#fp-badge'); b.classList.remove('saute'); void b.offsetWidth; b.classList.add('saute'); }
      majEtatFiche();
      planifierVerification();
    };
    curseur.addEventListener('input', () => appliquer(curseur.value, 'curseur'));
    saisie.addEventListener('input', () => appliquer(saisie.value, 'saisie'));
    saisie.addEventListener('blur', () => { if (ficheCourante?.erreur) { saisie.value = Math.min(max, Math.max(min, Math.round(Number(saisie.value) || min))); appliquer(saisie.value, 'blur'); } });
    $$('.fp-pastilles [data-montant]').forEach((b) => b.addEventListener('click', () => { son.clic(); appliquer(Number(b.dataset.montant), 'pastille'); }));
    appliquer(montant, 'init');
    if (!APERCU) marquerMontants(id, appliquer);
  } else {
    majEtatFiche();
    planifierVerification(0);
  }

  const changerQuantite = (d) => {
    const q = Math.max(1, Math.min(QMAX(), ficheCourante.quantite + d));
    if (q === ficheCourante.quantite) return;
    ficheCourante.quantite = q;
    son.clic();
    const o = $('#quantite-val'); o.classList.remove('saute'); void o.offsetWidth; o.classList.add('saute');
    majEtatFiche();
    planifierVerification();
  };
  $('#quantite-moins').addEventListener('click', () => changerQuantite(-1));
  $('#quantite-plus').addEventListener('click', () => changerQuantite(1));

  const memoriser = () => {
    if (p.type !== 'carte') return;
    const m = stock.lire('cc-montants', {});
    m[id] = ficheCourante.montant;
    stock.ecrire('cc-montants', m);
  };
  const ajouter = (e) => {
    const f = ficheCourante;
    const n = ajouterAuPanier(id, f.montant, $('.fp-carte img') || e.currentTarget, f.quantite);
    if (n) memoriser();
    return n;
  };
  $('#btn-ajouter').addEventListener('click', (e) => {
    const n = ajouter(e);
    if (!n) return;
    const b = e.currentTarget;
    b.classList.add('ajoute');
    b.querySelector('span').textContent = n > 1 ? `${n} added ✓` : 'Added ✓';
    setTimeout(() => { if (b.isConnected) { b.classList.remove('ajoute'); b.querySelector('span').textContent = 'Add to cart'; } }, 1600);
    toast(`Added: ${n > 1 ? `${n} × ` : ''}${p.nom}${p.type === 'carte' ? ` ${euros(ficheCourante.montant)}` : ''}`, { libelle: 'Checkout', faire: ouvrirPanier });
    ficheCourante.quantite = 1;
    majEtatFiche();
    planifierVerification();
  });
  $('#btn-acheter').addEventListener('click', (e) => {
    if (ajouter(e)) ouvrirPanier();
  });
  c.querySelectorAll('[data-aide]').forEach((a) => a.addEventListener('click', interceptAide));
  ouvrirTiroir('fiche');
  majURL(boutique, id);
}

/** Ouvre un produit depuis n'importe où (recherche, présentoir, mode simple…). */
async function ouvrirProduit(id, slug) {
  const cible = slug || (produitsDe(boutique).includes(id) ? boutique : cat.boutiques.find((b) => produitsDe(b.slug).includes(id))?.slug);
  if (!cible) return;
  if (cible !== boutique || vue !== 'interieur') await allerBoutique(cible);
  if (scene && racineHTML.dataset.mode === '3d') await scene.ouvrirProduit(id);
  ouvrirFiche(id);
}

/* ------------------------------ Caisse (panier + paiement) ------------------------------ */

function ouvrirPanier() {
  rendrePanier();
  ouvrirTiroir('panier');
}

function rendrePanier(message) {
  const c = $('#panier-contenu');
  if (!panier.lignes.length) {
    c.innerHTML = `<h2 id="panier-titre">Your cart</h2><div class="panier-vide"><p>Your cart is empty.</p>
      <button type="button" class="btn btn-principal" data-fermer>Choose a card</button></div>${G.badgesConfiance(cat)}`;
    c.querySelector('[data-fermer]').addEventListener('click', fermerTiroirs);
    return;
  }
  const email = stock.lire('cc-email', '');
  const lignes = panier.lignes.map((l, i) => {
    const p = cat.produits[l.produit];
    if (!p) return '';
    const pu = prixUnitaire(l);
    const detail = p.type === 'carte' ? `${euros(l.montant)} card` : p.type === 'pack' ? p.contenuTexte : (p.valeurAffichee || '');
    return `<li class="ligne" data-i="${i}"><img src="${G.esc(RACINE + G.vignette(p, cat))}" alt="">
      <div><div class="ligne-nom">${G.esc(p.nom)}</div><div class="ligne-detail">${G.esc(detail)}</div>
      <div class="quantite" role="group" aria-label="Quantity ${G.esc(p.nom)}"><button type="button" data-q="-1" aria-label="Remove one">−</button><span>${l.quantite}</span><button type="button" data-q="1" aria-label="Add one">+</button></div></div>
      <div class="ligne-droite">${p.promo && pu != null ? `<span class="ligne-remise">−${p.promo.remise}%</span><s class="ligne-avant">${euros((p.type === 'carte' ? l.montant : p.prixAvant) * l.quantite)}</s>` : ''}<span class="ligne-prix">${pu == null ? G.esc(cat.textes.prixADefinir) : euros(pu * l.quantite)}</span>
      <button type="button" class="btn-lien" data-retirer>Remove</button></div></li>`;
  }).join('');
  const total = totalPanier();
  c.innerHTML = `<h2 id="panier-titre">Your cart · Checkout</h2>
    ${message ? `<p class="alerte" role="alert">${G.esc(message)}</p>` : ''}
    <ul class="lignes">${lignes}</ul>
    <div class="total"><span>Total</span><b>${euros(total)}</b></div>
    <div class="champ"><label for="email">Your email (to receive your code)</label>
      <input id="email" type="email" inputmode="email" autocomplete="email" placeholder="name@example.com" value="${G.esc(email)}" aria-describedby="email-aide">
    </div>
    <p class="envoi-a" id="email-aide"></p>
    ${cat.experience.consentementCGV ? `<label class="consentement"><input type="checkbox" id="consentement"> <span>I accept the <a href="${G.esc(RACINE)}help#cgv" data-aide="cgv">Terms &amp; Conditions</a> and ask for my code to be delivered by email right away: I understand I lose my right to cancel.</span></label>` : ''}
    <div class="paiement-boutons" id="paiement-boutons"><div class="paiement-attente">Loading secure payment…</div></div>
    ${G.badgesConfiance(cat)}
    <p style="font-size:.78rem;margin:0 0 8px;color:var(--c-doux)">${G.esc(cat.textes.livraison)}</p>
    ${G.liensConfiance(cat, RACINE)}`;

  c.querySelectorAll('.ligne').forEach((li) => {
    const i = Number(li.dataset.i);
    li.querySelectorAll('[data-q]').forEach((b) => b.addEventListener('click', () => {
      const l = panier.lignes[i];
      const avant = l.quantite;
      l.quantite = Math.max(0, Math.min(QMAX(), l.quantite + Number(b.dataset.q)));
      if (l.quantite === avant && Number(b.dataset.q) > 0) toast(`${QMAX()} exemplaires maximum par article.`);
      if (!l.quantite) panier.lignes.splice(i, 1);
      sauverPanier(); rendrePanier();
    }));
    li.querySelector('[data-retirer]').addEventListener('click', () => { panier.lignes.splice(i, 1); sauverPanier(); rendrePanier(); });
  });
  c.querySelectorAll('[data-aide]').forEach((a) => a.addEventListener('click', interceptAide));

  const champ = $('#email');
  const aide = $('#email-aide');
  const majAide = () => {
    const v = champ.value.trim();
    aide.innerHTML = v && EMAIL_RE.test(v) ? `Your code will be sent to <b>${G.esc(v)}</b>` : 'Your code arrives by email right after payment.';
  };
  champ.addEventListener('input', () => { champ.removeAttribute('aria-invalid'); majAide(); stock.ecrire('cc-email', champ.value.trim()); });
  majAide();

  const zone = $('#paiement-boutons');
  const valider = () => {
    const v = champ.value.trim();
    if (!v) return erreurEmail("Enter your email: that's where your code will be sent.");
    if (!v.includes('@')) return erreurEmail('Your email address is missing the “@”.');
    if (!EMAIL_RE.test(v)) return erreurEmail('Check your email address: it should look like name@example.com.');
    if (panier.lignes.some((l) => prixUnitaire(l) == null)) { rendrePanier('An item has no price yet: remove it to check out.'); return false; }
    const cc = $('#consentement');
    if (cc && !cc.checked) {
      aide.innerHTML = '<span style="color:var(--c-non);font-weight:700">Tick the box to accept the Terms and get your code right away.</span>';
      cc.focus();
      return false;
    }
    return true;
  };
  function erreurEmail(t) {
    champ.setAttribute('aria-invalid', 'true');
    aide.innerHTML = `<span style="color:var(--c-non);font-weight:700">${G.esc(t)}</span>`;
    champ.focus();
    return false;
  }

  if (APERCU) {
    zone.innerHTML = '<div class="paiement-attente">Preview without a server: PayPal checkout turns on once the site is installed with your keys.</div>';
    return;
  }
  if (!cat.paypal.clientId) {
    zone.innerHTML = '<div class="paiement-attente">Payment not set up yet (PAYPAL_CLIENT_ID missing on the server).</div>';
    return;
  }
  afficherBoutons(zone, {
    api: API, clientId: cat.paypal.clientId, devise: cat.paypal.devise,
    valider,
    donnees: () => ({
      email: champ.value.trim(),
      consentement: Boolean($('#consentement')?.checked),
      lignes: panier.lignes.map((l) => ({ produit: l.produit, montant: l.montant, quantite: l.quantite })),
    }),
    succes: (resume) => confirmer(resume),
    erreur: (message) => {
      const a = document.createElement('p');
      a.className = 'alerte'; a.setAttribute('role', 'alert'); a.textContent = message;
      c.querySelector('.alerte')?.remove();
      c.querySelector('h2').after(a);
      rafraichirDisponibilites();
    },
    annule: () => toast('Payment cancelled. Your cart has been kept.'),
  }).catch((e) => { zone.innerHTML = `<div class="paiement-attente">${G.esc(e.message)}</div>`; });
}

async function rafraichirDisponibilites() {
  if (APERCU) return;
  try {
    const r = await fetch(`${API}/api/catalogue`);
    if (!r.ok) return;
    const j = await r.json();
    for (const [id, p] of Object.entries(j.produits)) if (cat.produits[id]) cat.produits[id].disponible = p.disponible;
  } catch (_) { /* hors ligne */ }
}

function confirmer(resume) {
  const premiere = resume.lignes[0] && cat.produits[resume.lignes[0].produit];
  panier = { lignes: [], maj: Date.now() };
  sauverPanier();
  fermerTiroirs();
  son.succes();
  const enAttente = resume.statut === 'en_attente';
  const aRembourser = resume.statut === 'a_rembourser';
  const titre = enAttente ? 'Payment being checked' : aRembourser ? 'Payment received' : 'All done!';
  const texte = enAttente
    ? `PayPal is checking your payment. Your code will be sent automatically to ${resume.email} as soon as it's confirmed.`
    : aRembourser
      ? 'This item has just sold out. Your order will be refunded: customer service will contact you.'
      : `Your code has been sent to ${resume.email}. Remember to check your spam folder.`;
  const el = $('#confirmation');
  el.innerHTML = `<div class="remise">
    <div class="remise-scene" aria-hidden="true">${premiere ? `<div class="remise-carte"><img src="${G.esc(RACINE + premiere.image)}" alt=""></div>` : ''}<div class="remise-ruban"></div></div>
    <h2 id="confirmation-titre">${G.esc(titre)}</h2>
    <p>${G.esc(texte)}</p>
    <div class="recap">
      <div><span>Order</span><b>${G.esc(resume.numero)}</b></div>
      <div><span>Date</span><b>${new Date().toLocaleDateString('en-GB', { dateStyle: 'long' })}</b></div>
      ${resume.lignes.map((l) => `<div><span>${l.quantite} × ${G.esc(cat.produits[l.produit]?.nom || l.produit)} (${G.esc(l.libelleValeur)})</span><b>${euros((l.prixCents * l.quantite) / 100)}</b></div>`).join('')}
      <div><span>Amount paid</span><b>${euros(resume.totalCents / 100)}</b></div>
    </div>
    <button type="button" class="btn btn-principal" id="btn-continuer">Keep shopping</button>
  </div>`;
  el.hidden = false;
  if (!enAttente && !aRembourser) {
    confettis(innerWidth / 2, innerHeight * 0.32, { n: 70, force: 1.6 });
    setTimeout(() => { confettis(innerWidth * 0.2, innerHeight * 0.5, { n: 36, force: 1.2 }); confettis(innerWidth * 0.8, innerHeight * 0.5, { n: 36, force: 1.2 }); }, 350);
  }
  $('#btn-continuer').focus();
  $('#btn-continuer').addEventListener('click', () => { el.hidden = true; });
}

/* ------------------------------ Aide & idée cadeau ------------------------------ */

function interceptAide(e) {
  const a = e.currentTarget;
  if (a.target === '_blank') return; // URL externe configurée
  e.preventDefault();
  ouvrirAide(a.dataset.aide);
}

function ouvrirAide(section) {
  const s = cat.site;
  const sc = s.serviceClient || {};
  const contact = [sc.email, sc.telephone, sc.horaires].filter(Boolean).map(G.esc).join('<br>');
  const lien = (cle, titre) => (s.liens[cle] ? `<p><a href="${G.esc(s.liens[cle])}" target="_blank" rel="noopener">${titre}</a></p>` : '');
  const texte = (t) => (t ? `<p style="white-space:pre-line">${G.esc(t)}</p>` : '<p style="color:var(--c-doux)">Coming soon.</p>');
  $('#aide-contenu').innerHTML = `<h2 id="aide-titre">Customer service</h2>
    <section class="aide-section" id="aide-faq"><h3>FAQ</h3>${G.faq(cat)}</section>
    <section class="aide-section" id="aide-support"><h3>Support</h3>${contact ? `<p>${contact}</p>` : '<p style="color:var(--c-doux)">Contact details coming soon.</p>'}${lien('support', 'Contact support')}</section>
    <section class="aide-section" id="aide-conditions"><h3>Terms of use</h3><p>${G.esc(cat.textes.conditionsUtilisation)}</p>${lien('conditions', 'Read the full terms')}</section>
    <section class="aide-section" id="aide-avis"><h3>Reviews</h3>${texte(s.aide?.avis)}${lien('avis', 'See reviews')}</section>
    <section class="aide-section" id="aide-cgv"><h3>Terms &amp; Conditions</h3>${texte(s.aide?.cgv)}${lien('cgv', 'Read the Terms &amp; Conditions')}</section>
    <section class="aide-section" id="aide-remboursement"><h3>Refund policy</h3>${texte(s.aide?.remboursement)}${lien('remboursement', 'Read the refund policy')}</section>`;
  ouvrirTiroir('aide');
  if (section) $(`#aide-${section}`)?.scrollIntoView({ block: 'start', behavior: REDUIT ? 'auto' : 'smooth' });
}

function ouvrirIdee() {
  const ids = produitsDe(boutique);
  const publics = [...new Set(ids.map((id) => cat.produits[id].pourQui).filter((x) => x && x !== '—'))];
  const prixMax = Math.max(cat.montantLibre.max, ...ids.map((id) => cat.produits[id].prix || 0));
  let choix = publics[0];
  let budget = Math.min(50, prixMax);
  const c = $('#idee-contenu');
  c.innerHTML = `<h2 id="idee-titre">Gift ideas</h2>
    <h3>Who is it for?</h3><div class="puces" id="idee-qui">${publics.map((p) => `<button type="button" aria-pressed="${p === choix}">${G.esc(p)}</button>`).join('')}</div>
    <h3>Budget <span id="idee-budget-val" style="text-transform:none;letter-spacing:0;color:var(--c-texte)">${euros(budget)}</span></h3>
    <div class="curseur" style="margin-bottom:16px"><input type="range" id="idee-budget" min="${cat.montantLibre.min}" max="${prixMax}" step="5" value="${budget}" aria-label="Budget"></div>
    <ul class="propositions" id="idee-resultats"></ul>`;
  const rendre = () => {
    const ok = (id) => { const p = cat.produits[id]; return G.achetable(p) && (p.type === 'carte' ? cat.montantLibre.min <= budget : p.prix <= budget); };
    let res = ids.filter((id) => cat.produits[id].pourQui === choix && ok(id));
    if (res.length < 3) res = res.concat(ids.filter((id) => !res.includes(id) && ok(id)));
    res = res.slice(0, 3);
    $('#idee-resultats').innerHTML = res.length ? res.map((id) => {
      const p = cat.produits[id];
      const m = p.type === 'carte' ? Math.min(budget, cat.montantLibre.max) : null;
      return `<li><button type="button" data-id="${id}" data-m="${m || ''}"><img src="${G.esc(RACINE + G.vignette(p, cat))}" alt=""><span><b>${G.esc(p.nom)}</b><small>${p.type === 'carte' ? `${euros(m)} card` : euros(p.prix)} · ${G.esc(p.pourQui)}</small></span></button></li>`;
    }).join('') : '<li style="color:var(--c-doux)">No cards in this budget here. Try raising it a little.</li>';
    $$('#idee-resultats button').forEach((b) => b.addEventListener('click', () => {
      if (b.dataset.m) { const m = stock.lire('cc-montants', {}); m[b.dataset.id] = Number(b.dataset.m); stock.ecrire('cc-montants', m); }
      ouvrirProduit(b.dataset.id, boutique);
    }));
  };
  $$('#idee-qui button').forEach((b) => b.addEventListener('click', () => {
    choix = b.textContent;
    $$('#idee-qui button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    rendre();
  }));
  $('#idee-budget').addEventListener('input', (e) => { budget = Number(e.target.value); $('#idee-budget-val').textContent = euros(budget); rendre(); });
  rendre();
  ouvrirTiroir('idee');
}


/* ------------------------------ Newsletter (formulaire holographique) ------------------------------ */

const TEL_RE = /^\+?[0-9 ().-]{6,20}$/;
function ouvrirNewsletter(source = racineHTML.dataset.mode === '3d' ? '3d' : 'simple') {
  const nl = cat.experience.newsletter;
  if (!nl || !nl.actif) return;
  const c = $('#newsletter-contenu');
  c.innerHTML = G.formNewsletter({ ...nl, nomSite: cat.site.nom });
  const f = $('#holo-form');
  const err = $('#holo-erreur');
  const brouillon = stock.lire('cc-newsletter-brouillon', {});
  ['prenom', 'nom', 'email', 'telephone'].forEach((k) => { if (brouillon[k]) f.elements[k].value = brouillon[k]; });
  f.addEventListener('input', (e) => {
    e.target.closest('.holo-champ')?.classList.remove('invalide');
    if (!err.hidden) err.hidden = true;
    const d = {}; ['prenom', 'nom', 'email', 'telephone'].forEach((k) => { d[k] = f.elements[k].value.slice(0, 254); });
    stock.ecrire('cc-newsletter-brouillon', d);
  });
  const erreur = (msg, champ) => {
    err.textContent = msg; err.hidden = false;
    if (champ) { const el = f.elements[champ]; el.closest('.holo-champ')?.classList.add('invalide'); el.focus(); }
    const cadre = c.querySelector('.holo-cadre'); cadre.classList.remove('secousse'); void cadre.offsetWidth; cadre.classList.add('secousse');
  };
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = {
      prenom: f.elements.prenom.value.trim(), nom: f.elements.nom.value.trim(), email: f.elements.email.value.trim(),
      telephone: f.elements.telephone.value.trim(), site: f.elements.site.value, consentement: f.elements.consentement.checked, source,
    };
    if (!d.prenom) return erreur('Enter your first name.', 'prenom');
    if (!d.nom) return erreur('Enter your last name.', 'nom');
    if (!EMAIL_RE.test(d.email)) return erreur('Check your email address: it should look like name@example.com.', 'email');
    if (nl.telephoneObligatoire && !d.telephone) return erreur('Enter your phone number.', 'telephone');
    if (d.telephone && !TEL_RE.test(d.telephone)) return erreur('Check your phone number (digits, spaces and + only).', 'telephone');
    if (!d.consentement) { $('.holo-accord').classList.add('invalide'); return erreur('Tick the box to agree to receive our emails.'); }
    const btn = $('#holo-envoyer');
    btn.disabled = true; btn.classList.add('envoi'); btn.querySelector('.hb-texte').textContent = 'Transmitting…';
    try {
      let res = { ok: true, deja: false, prenom: d.prenom };
      if (APERCU) await new Promise((ok) => setTimeout(ok, 1100)); // aperçu publié : pas de serveur, succès simulé
      else {
        const r = await fetch(`${API}/api/newsletter`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d) });
        res = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(res.erreur || 'Something went wrong. Please try again in a moment.');
      }
      succesNewsletter(res.prenom || d.prenom, res.deja);
    } catch (ex) {
      btn.disabled = false; btn.classList.remove('envoi'); btn.querySelector('.hb-texte').textContent = nl.bouton || 'Subscribe';
      erreur(ex && ex.message && !/fetch|network/i.test(ex.message) ? ex.message : 'Connection lost. Check your internet and try again.');
    }
  });
  ouvrirTiroir('newsletter');
  scene?.holo({ flash: true });
}

function succesNewsletter(prenom, deja) {
  stock.ecrire('cc-abonne', true);
  stock.ecrire('cc-newsletter-brouillon', {});
  const cadre = $('#newsletter .holo-cadre');
  cadre.classList.add('valide');
  $('#holo-vue-form').hidden = true;
  const s = $('#holo-succes');
  $('#holo-prenom').textContent = prenom ? `, ${prenom}` : '';
  if (deja) $('#holo-message').textContent = 'You were already on the list: your details are up to date.';
  s.hidden = false; s.focus({ preventScroll: true });
  $('#holo-retour').addEventListener('click', fermerTiroirs);
  scene?.holo({ abonne: true, flash: true });
  majBannieresNewsletter();
  son.clic();
  const r = $('.holo-ok', s).getBoundingClientRect();
  setTimeout(() => confettis(r.left + r.width / 2, r.top + r.height / 2, { n: 30, palette: 'holo' }), REDUIT ? 0 : 380);
}

function majBannieresNewsletter() {
  if (!stock.lire('cc-abonne', false)) return;
  $$('.holo-banniere').forEach((b) => {
    b.classList.add('abonne');
    const bt = $('[data-newsletter]', b); if (bt) bt.querySelector('.hb-texte').textContent = 'You’re in ✓';
  });
}

/* ------------------------------ Recherche ------------------------------ */

let index = [];
function construireIndex() {
  index = [];
  for (const b of cat.boutiques) {
    b.sections.forEach((s, si) => {
      index.push({ type: 'rayon', slug: b.slug, section: si, nom: titreCourt(s.titre), cle: sansAccent(`${s.titre} ${b.nomCourt}`), info: b.nomCourt });
    });
  }
  for (const [id, p] of Object.entries(cat.produits)) {
    const ou = cat.boutiques.filter((b) => produitsDe(b.slug).includes(id));
    if (!ou.length) continue;
    const rayons = ou.flatMap((b) => b.sections.filter((s) => s.produits.includes(id)).map((s) => s.titre));
    index.push({
      type: 'produit', id, nom: p.nom, image: G.vignette(p, cat), boutiques: ou.map((b) => b.slug),
      cle: sansAccent([p.nom, p.pourQui, ...(p.motsCles || []), ...rayons, p.type === 'pack' ? `pack ${p.contenuTexte}` : ''].join(' ')),
      info: `${G.prixTexte(p, cat)} · ${ou.map((b) => b.nomCourt).join(', ')}`,
    });
  }
}

let selection = -1;
function fermerSuggestions() { $('#suggestions').hidden = true; $('#q').setAttribute('aria-expanded', 'false'); selection = -1; }
function rechercher(q) {
  const ul = $('#suggestions');
  const n = sansAccent(q.trim());
  if (!n) { fermerSuggestions(); return; }
  const mots = n.split(/\s+/);
  const res = index
    .map((x) => {
      if (!mots.every((m) => x.cle.includes(m))) return { x, score: 0 };
      const nom = sansAccent(x.nom);
      return {
        x,
        score: 1 + (mots.every((m) => nom.includes(m)) ? 1.5 : 0) + (nom.startsWith(mots[0]) ? 1 : 0)
          + (x.type === 'produit' ? 0.5 : 0) + (x.boutiques?.includes(boutique) || x.slug === boutique ? 0.3 : 0),
      };
    })
    .filter((r) => r.score > 0).sort((a, b) => b.score - a.score).slice(0, 7).map((r) => r.x);
  ul.innerHTML = res.length ? res.map((r, i) => `<li role="option" id="sug-${i}" data-i="${i}" aria-selected="false">
      ${r.image ? `<img src="${G.esc(RACINE + r.image)}" alt="">` : '<span style="width:44px;text-align:center" aria-hidden="true">▤</span>'}
      <span><span class="s-nom">${G.esc(r.nom)}</span><span class="s-info">${r.type === 'rayon' ? `Display · ${G.esc(r.info)}` : G.esc(r.info)}</span></span></li>`).join('')
    : `<li class="s-vide" role="option" aria-disabled="true">No cards for “${G.esc(q)}”. Try a brand: Steam, Netflix, Amazon…</li>`;
  ul.hidden = false;
  $('#q').setAttribute('aria-expanded', 'true');
  selection = -1;
  ul.onclick = (e) => { const li = e.target.closest('li[data-i]'); if (li) choisir(res[Number(li.dataset.i)]); };
  ul.dataset.n = res.length;
  ul._res = res;
}
async function choisir(r) {
  fermerSuggestions();
  $('#q').value = '';
  $('#q').blur();
  if (r.type === 'rayon') {
    if (r.slug !== boutique || vue !== 'interieur') await allerBoutique(r.slug);
    if (scene && racineHTML.dataset.mode === '3d') scene.allerStation(`v${r.section}`);
    else $(`#rayon-${r.section}`)?.scrollIntoView({ behavior: REDUIT ? 'auto' : 'smooth' });
  } else {
    await ouvrirProduit(r.id, r.boutiques.includes(boutique) ? boutique : r.boutiques[0]);
  }
}

/* ------------------------------ Stations (barre basse 3D) ------------------------------ */

function construireStations() {
  const nav = $('#stations');
  const b = boutiqueDe(boutique);
  const autres = cat.boutiques.filter((x) => x.slug !== boutique);
  nav.innerHTML = b.sections.map((s, i) => `<button type="button" data-station="v${i}">${G.esc(titreCourt(s.titre))}</button>`).join('') +
    '<button type="button" data-station="comptoir">Counter</button>' +
    (cat.experience.newsletter?.actif ? '<button type="button" class="station-holo" data-station="newsletter">Newsletter</button>' : '') +
    autres.map((x) => `<button type="button" class="porte" data-porte="${x.slug}" style="--porte-couleur:${x.theme.couleurs.interface};--porte-metal:${x.theme.couleurs.metal}">${G.esc(x.nomCourt)} door</button>`).join('') +
    '<button type="button" data-station="service">Customer service</button>';
  nav.querySelectorAll('[data-station]').forEach((btn) => btn.addEventListener('click', () => {
    son.clic();
    if (btn.dataset.station === 'service') { ouvrirAide(); return; }
    if (btn.dataset.station === 'newsletter') { Promise.resolve(scene?.allerStation('newsletter')).then(() => ouvrirNewsletter('3d')); return; }
    scene?.allerStation(btn.dataset.station);
  }));
  nav.querySelectorAll('[data-porte]').forEach((btn) => btn.addEventListener('click', () => allerBoutique(btn.dataset.porte)));
}

function marquerStation(id) {
  $$('#stations button').forEach((b) => b.setAttribute('aria-current', String(b.dataset.station === id)));
  const actif = $(`#stations [data-station="${id}"]`);
  actif?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: REDUIT ? 'auto' : 'smooth' });
}

/* ------------------------------ Navigation ------------------------------ */

function majURL(slug, produit, remplacer) {
  if (APERCU) return;
  const url = slug ? `/shop/${slug}${produit ? `/${produit}` : ''}` : '/';
  if (location.pathname === url) return;
  history[remplacer ? 'replaceState' : 'pushState']({ slug, produit }, '', url + location.search);
}

/** Va dans une boutique (portail 3D si on est déjà dedans, sinon entrée depuis la façade). */
async function allerBoutique(slug) {
  if (!boutiqueDe(slug)) return;
  fermerTiroirs();
  if (racineHTML.dataset.mode === '3d' && scene) {
    if (vue === 'interieur' && slug !== boutique) await scene.changerBoutique(slug); // appelle onBoutique au milieu
    else if (vue !== 'interieur') { appliquerTheme(slug); await scene.entrer(slug); }
  } else {
    appliquerTheme(slug);
    vue = 'interieur';
    window.scrollTo({ top: 0, behavior: REDUIT ? 'auto' : 'smooth' });
  }
  majURL(slug, null);
}

async function allerFacade() {
  fermerTiroirs();
  if (racineHTML.dataset.mode === '3d' && scene) await scene.allerFacade();
  majURL(null, null);
}

/* ------------------------------ Mode 3D / simple ------------------------------ */

function webglDisponible() {
  try {
    const c = document.createElement('canvas');
    return Boolean(c.getContext('webgl2') || c.getContext('webgl'));
  } catch (_) { return false; }
}

function majBoutonMode() {
  const b = $('#menu [data-action="mode"]');
  b.textContent = racineHTML.dataset.mode === '3d' ? 'Switch to simple view' : 'See the store in 3D';
}

async function passerEnSimple(message) {
  racineHTML.dataset.mode = 'simple';
  stock.ecrire('cc-mode', 'simple');
  scene?.pause(true);
  if (!boutique) appliquerTheme(cat.boutiqueParDefaut);
  majBoutonMode();
  if (message) toast(message);
}

async function passerEn3D() {
  racineHTML.dataset.mode = '3d';
  stock.ecrire('cc-mode', '3d');
  majBoutonMode();
  if (scene) { scene.pause(false); return; }
  await demarrer3D();
}

async function demarrer3D() {
  $('#hud').hidden = false;
  const barre = $('#chargement');
  try {
    const t = cat.experience.three;
    let THREE;
    try { THREE = await import(t.local); } catch (_) { THREE = await import(t.cdn); }
    const { creerScene } = await import('./scene3d.js');
    scene = await creerScene(THREE, {
      conteneur: $('#scene'),
      catalogue: cat,
      boutique,
      racine: RACINE,
      reduit: REDUIT,
      panier: panier.lignes,
      rappels: {
        progression(p) { barre.querySelector('span').style.width = `${Math.round(p * 100)}%`; barre.setAttribute('aria-valuenow', String(Math.round(p * 100))); if (p >= 1) barre.classList.add('fini'); },
        station(s) {
          vue = s.type === 'facade' ? 'facade' : 'interieur';
          racineHTML.dataset.vue = vue;
          $('#facade-ui').hidden = vue !== 'facade';
          $('#stations').hidden = vue !== 'interieur';
          $('#legende').hidden = s.type !== 'vitrine' && s.type !== 'newsletter';
          if (s.type === 'porte') { $('#legende').innerHTML = `<b>${G.esc(s.nom || '')} door</b> · Leads to the ${G.esc(s.nom || '')} store · Tap the door to go in`; $('#legende').hidden = false; }
          if (s.type === 'newsletter') $('#legende').innerHTML = `<b>${G.esc(cat.experience.newsletter?.titre || 'Join the club')}</b> · Tap the hologram to sign up for the newsletter`;
          $('#btn-reculer').hidden = !(s.type === 'vitrine' || s.type === 'comptoir' || s.type === 'newsletter');
          compteARebours();
          marquerStation(s.id);
          if (vue === 'interieur') { montrerGuide(); aideNavigation(); }
          else $('#aide-nav').hidden = true;
        },
        centre(id) {
          const l = $('#legende');
          if (!id) { l.hidden = true; return; }
          const p = cat.produits[id];
          l.innerHTML = `<b>${G.esc(p.nom)}</b> · ${G.prixHTML(p, cat)}${p.promo ? ` <span class="legende-promo">−${p.promo.remise}%</span>` : ''} · Tap to see details`;
          l.hidden = false;
        },
        rayon({ titre, nombre }) {
          const l = $('#legende');
          const b = boutiqueDe(boutique); const sec = b && b.sections.find((x) => x.titre === titre);
          const pr = sec && sec.produits.map((id) => cat.produits[id]?.promo).find(Boolean);
          l.innerHTML = `<b>${G.esc(titreCourt(titre))}</b> · ${nombre} card${nombre > 1 ? 's' : ''}${pr ? ` · <span class="legende-promo">${G.esc(G.accroche(pr))} −${pr.remise}%</span>` : ''} · Tap a card to take a look`;
          l.hidden = false;
        },
        ouvrirFiche: (id) => ouvrirFiche(id),
        porte: (slug) => allerBoutique(slug),
        presentoir: (slug, id) => ouvrirProduit(id, slug),
        panier: () => ouvrirPanier(),
        service: () => ouvrirAide(),
        newsletter: () => ouvrirNewsletter('3d'),
        entrer: (slug) => allerBoutique(slug || cat.boutiqueParDefaut),
        boutique: (slug) => appliquerTheme(slug),
        clic: () => son.clic(),
        passage: () => son.passage(),
      },
    });
    if (stock.lire('cc-abonne', false)) scene.holo({ abonne: true });
    if (etatInitial.slug) {
      await scene.entrer(etatInitial.slug, { instant: true });
      if (etatInitial.produit) await ouvrirProduit(etatInitial.produit, etatInitial.slug);
    } else {
      scene.allerFacade({ instant: true });
    }
  } catch (e) {
    console.warn('3D indisponible, passage en mode simple :', e && e.message);
    $('#hud').hidden = true;
    passerEnSimple("3D couldn't start on this device: here's the catalogue in simple view.");
    if (etatInitial.produit) ouvrirFiche(etatInitial.produit);
  }
}

/* ------------------------------ Aide à la navigation ------------------------------ */

let aideMontree = 0;
function aideNavigation() {
  if (aideMontree >= 2 || !$('#guide').hidden) return;
  aideMontree++;
  const el = $('#aide-nav');
  el.innerHTML = matchMedia('(pointer: coarse)').matches
    ? '<span>Drag to look around</span><span>Joystick or pinch to move</span><span>Tap the floor to go there</span><span class="aide-portes">The doors at the back lead to the other stores</span>'
    : '<span>Drag to look around</span><span>Scroll wheel, W/S or arrow keys to move</span><span>Click the floor to go there</span><span class="aide-portes">The doors at the back lead to the other stores</span>';
  el.hidden = false;
  clearTimeout(aideNavigation.m);
  aideNavigation.m = setTimeout(() => { el.hidden = true; }, 7000);
}

/* ------------------------------ Guide de première visite ------------------------------ */

function montrerGuide() {
  if (stock.lire('cc-guide-vu', false) || !$('#guide').hidden || racineHTML.dataset.mode !== '3d') return;
  const etapes = cat.experience.guidePremiereVisite || [];
  if (!etapes.length) return;
  let i = 0;
  const g = $('#guide');
  const rendre = () => {
    g.dataset.etape = String(i);
    g.innerHTML = `<div class="guide-carte"><p class="guide-etape">Step ${i + 1} of ${etapes.length}</p>
      <div class="guide-geste" aria-hidden="true"></div>
      <p class="guide-texte">${G.esc(etapes[i])}</p>
      <div class="guide-pied"><button type="button" class="btn-lien" id="guide-passer">Skip</button>
      <span class="guide-points">${etapes.map((_, k) => `<i class="${k === i ? 'actif' : ''}"></i>`).join('')}</span>
      <button type="button" class="btn btn-principal" id="guide-suivant" style="min-height:42px">${i < etapes.length - 1 ? 'Next' : "Let's go"}</button></div></div>`;
    $('#guide-passer').onclick = fermerGuide;
    $('#guide-suivant').onclick = () => { if (++i >= etapes.length) fermerGuide(); else rendre(); };
    $('#guide-suivant').focus();
  };
  g.onclick = (e) => { if (e.target === g) fermerGuide(); };
  g.hidden = false;
  rendre();
}
function fermerGuide() { $('#guide').hidden = true; stock.ecrire('cc-guide-vu', true); if (vue === 'interieur') aideNavigation(); }

/* ------------------------------ Menu ------------------------------ */

function basculerMenu(ouvrir) {
  const m = $('#menu');
  const o = ouvrir ?? m.hidden;
  m.hidden = !o;
  $('#btn-menu').setAttribute('aria-expanded', String(o));
}

/* ------------------------------ Musique ------------------------------ */

async function basculerSon() {
  const on = await son.basculer();
  const m = $('#menu [data-action="son"]');
  m.textContent = on ? 'Music: on' : 'Music: off';
  m.setAttribute('aria-pressed', String(on));
  const b = $('#btn-son');
  b.setAttribute('aria-pressed', String(on));
  b.setAttribute('aria-label', on ? 'Turn off the music' : 'Turn on the store music');
  if (on) toast(`Music: ${boutiqueDe(boutique).nomCourt}`);
}

/* ------------------------------ Démarrage ------------------------------ */

const etatInitial = (() => { try { return JSON.parse(meta('cc-etat') || '{}'); } catch (_) { return {}; } })();

async function chargerCatalogue() {
  if (!APERCU) {
    const r = await fetch(`${API}/api/catalogue`);
    if (!r.ok) throw new Error('catalogue');
    return r.json();
  }
  const r = await fetch('catalogue-apercu.json');
  return r.json();
}

async function demarrer() {
  try { cat = await chargerCatalogue(); } catch (_) {
    toast("The catalogue couldn't load. Check your connection and reload the page.");
    return;
  }
  racineHTML.style.setProperty('--nb-boutiques', String(cat.boutiques.length));
  $('.fiche-statique')?.remove();
  racineHTML.lang = cat.site.langue || 'en';
  $('#ruban-promo')?.addEventListener('click', allerAuxPromos);
  appliquerTheme(etatInitial.slug || racineHTML.dataset.boutique || cat.boutiqueParDefaut);
  // Panier : retire ce qui n'existe plus dans la configuration
  panier.lignes = panier.lignes.filter((l) => cat.produits[l.produit]);
  const ancien = panier.maj && Date.now() - panier.maj > (cat.experience.rappelPanierApresMinutes || 30) * 60e3;
  majBadgePanier();
  construireIndex();

  // Barre
  $$('.onglet').forEach((o) => o.addEventListener('click', (e) => { e.preventDefault(); son.clic(); allerBoutique(o.dataset.boutique); }));
  $('.logo').addEventListener('click', (e) => { e.preventDefault(); if (racineHTML.dataset.mode === '3d') allerFacade(); else window.scrollTo({ top: 0 }); });
  $('#btn-panier').addEventListener('click', ouvrirPanier);
  $('#btn-son').addEventListener('click', basculerSon);
  $('#btn-menu').addEventListener('click', (e) => { e.stopPropagation(); basculerMenu(); });
  document.addEventListener('click', (e) => {
    if (!$('#menu').hidden && !e.target.closest('#menu')) basculerMenu(false);
    if (!$('#suggestions').hidden && !e.target.closest('.recherche')) fermerSuggestions();
  });
  $('#menu').addEventListener('click', async (e) => {
    const a = e.target.closest('[data-action]')?.dataset.action;
    if (!a) return;
    basculerMenu(false);
    if (a === 'mode') { if (racineHTML.dataset.mode === '3d') passerEnSimple(); else passerEn3D(); }
    if (a === 'son') basculerSon();
    if (a === 'idee') ouvrirIdee();
    if (a === 'aide') ouvrirAide();
    if (a === 'newsletter') ouvrirNewsletter();
  });
  if (!cat.experience.assistantIdeeCadeau) $('#menu [data-action="idee"]').remove();
  if (!cat.experience.newsletter?.actif) $('#menu [data-action="newsletter"]')?.remove();
  document.addEventListener('click', (e) => { const b = e.target.closest('[data-newsletter]'); if (b) { e.preventDefault(); ouvrirNewsletter(b.dataset.newsletter || 'simple'); } });
  majBannieresNewsletter();

  // Recherche
  const q = $('#q');
  q.addEventListener('input', () => rechercher(q.value));
  q.addEventListener('focus', () => { if (q.value) rechercher(q.value); });
  q.addEventListener('keydown', (e) => {
    const ul = $('#suggestions');
    const n = Number(ul.dataset.n || 0);
    if (ul.hidden || !n) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      selection = (selection + (e.key === 'ArrowDown' ? 1 : -1) + n) % n;
      $$('li[data-i]', ul).forEach((li, i) => li.setAttribute('aria-selected', String(i === selection)));
      q.setAttribute('aria-activedescendant', `sug-${selection}`);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choisir(ul._res[Math.max(0, selection)]);
    }
  });

  // Tiroirs
  $$('.tiroir [data-fermer]').forEach((b) => b.addEventListener('click', fermerTiroirs));
  $('#voile-tiroir').addEventListener('click', fermerTiroirs);

  // Mode simple : tuiles et liens d'aide
  $('#catalogue').addEventListener('click', (e) => {
    const a = e.target.closest('a[data-produit]');
    if (!a) return;
    e.preventDefault();
    ouvrirFiche(a.dataset.produit);
  });
  $$('#pied [data-aide]').forEach((a) => a.addEventListener('click', interceptAide));

  // Façade
  $('#btn-reculer').addEventListener('click', () => { son.clic(); scene?.reculer(); });
  $('#btn-entrer').addEventListener('click', () => { son.clic(); allerBoutique(cat.boutiqueParDefaut); });
  $('#facade-raccourcis').innerHTML = cat.boutiques.filter((b) => b.slug !== cat.boutiqueParDefaut)
    .map((b) => `<button type="button" data-boutique="${b.slug}">${b.ordre < boutiqueDe(cat.boutiqueParDefaut).ordre ? '← ' : ''}${G.esc(b.nomCourt)}${b.ordre > boutiqueDe(cat.boutiqueParDefaut).ordre ? ' →' : ''}${cat.aLaUne === b.slug ? ' · Featured' : ''}</button>`).join('');
  $$('#facade-raccourcis button').forEach((b) => b.addEventListener('click', () => allerBoutique(b.dataset.boutique)));

  window.addEventListener('popstate', (e) => {
    const s = e.state || {};
    if (!s.slug) { allerFacade(); return; }
    if (s.slug !== boutique) allerBoutique(s.slug).then(() => s.produit && ouvrirProduit(s.produit, s.slug));
    else if (s.produit) ouvrirProduit(s.produit, s.slug);
    else fermerTiroirs();
  });
  document.addEventListener('visibilitychange', () => scene?.pause(document.hidden || racineHTML.dataset.mode !== '3d'));

  // Choix du mode d'affichage
  const voulu = new URLSearchParams(location.search).get('mode') || stock.lire('cc-mode', '3d');
  if (voulu === 'simple' || !webglDisponible()) {
    await passerEnSimple(voulu !== 'simple' ? "Your device doesn't support 3D: here's the catalogue in simple view." : null);
    vue = 'interieur';
    if (etatInitial.produit) ouvrirFiche(etatInitial.produit);
  } else {
    racineHTML.dataset.mode = '3d';
    majBoutonMode();
    await demarrer3D();
  }

  if (ancien && panier.lignes.length) {
    const n = panier.lignes.reduce((s, l) => s + l.quantite, 0);
    toast(`Your cart is waiting: ${n} item${n > 1 ? 's' : ''} · ${euros(totalPanier())}`, { libelle: 'View', faire: ouvrirPanier });
  }
}

demarrer();
