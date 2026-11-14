// =====================================================================
//  Peintures 2D (canvas) utilisées comme textures par la scène 3D :
//  enseignes des boutiques (portes + façade), vue à travers une porte,
//  autocollant « −10 % », étiquette de prix barré, bannière vente flash.
//  Aucune dépendance à Three.js : chaque fonction renvoie un <canvas>
//  (ou peint dans un canvas donné), ce qui permet de les vérifier en image.
// =====================================================================

export const POLICES = {
  serif: '"Bodoni Moda", Didot, "Bodoni 72", Georgia, serif',
  sans: 'Manrope, "Avenir Next", "Segoe UI", sans-serif',
  tech: '"Chakra Petch", "Rajdhani", "Eurostile", Manrope, sans-serif',
};
const OR_FLASH = '#FFD23F';

const hexRgb = (h) => { const n = parseInt(String(h).replace('#', '').slice(0, 6), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const rgba = (h, a) => { const [r, g, b] = hexRgb(h); return `rgba(${r},${g},${b},${a})`; };
const melange = (h1, h2, k) => {
  const a = hexRgb(h1); const b = hexRgb(h2);
  return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * k).toString(16).padStart(2, '0')).join('');
};
const lerp = (a, b, t) => a + (b - a) * t;

export function toile(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function chemin(x, px, py, w, h, r) {
  x.beginPath(); x.moveTo(px + r, py); x.arcTo(px + w, py, px + w, py + h, r); x.arcTo(px + w, py + h, px, py + h, r);
  x.arcTo(px, py + h, px, py, r); x.arcTo(px, py, px + w, py, r); x.closePath();
}
/** Choisit la taille de police pour que le texte tienne dans maxW. */
function taillePour(x, txt, maxW, police, taille, espacement = 0) {
  let t = taille;
  for (;;) {
    x.font = police.replace('{t}', t);
    const w = x.measureText(txt).width + espacement * t * Math.max(0, txt.length - 1);
    if (w <= maxW || t <= 10) return t;
    t -= 2;
  }
}
/** Texte avec espacement des lettres (letter-spacing en fraction de la taille). */
function texteEspace(x, txt, cx, cy, espacement, t) {
  if (!espacement) { x.fillText(txt, cx, cy); return; }
  const lettres = [...txt];
  const larg = lettres.reduce((s, l) => s + x.measureText(l).width, 0) + espacement * t * (lettres.length - 1);
  let px = cx - larg / 2;
  const align = x.textAlign; x.textAlign = 'left';
  for (const l of lettres) { x.fillText(l, px, cy); px += x.measureText(l).width + espacement * t; }
  x.textAlign = align;
}
function eclairChemin(x, cx, cy, s) {
  x.beginPath();
  const p = [[0.1, -1], [-0.55, 0.12], [-0.05, 0.12], [-0.2, 1], [0.55, -0.2], [0.05, -0.2], [0.3, -1]];
  p.forEach(([u, v], i) => (i ? x.lineTo(cx + u * s, cy + v * s) : x.moveTo(cx + u * s, cy + v * s)));
  x.closePath();
}
function etoile(x, cx, cy, r1, r2, n, rot = 0) {
  x.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const a = rot + (i / (n * 2)) * Math.PI * 2 - Math.PI / 2; const r = i % 2 ? r2 : r1;
    const px = cx + Math.cos(a) * r; const py = cy + Math.sin(a) * r;
    if (i) x.lineTo(px, py); else x.moveTo(px, py);
  }
  x.closePath();
}

/** Style d'une boutique d'après son décor. */
export function genre(theme) {
  const d = theme.decor || [];
  if (d.includes('neon')) return 'neon';
  if (d.some((k) => ['guirlandes', 'sapin', 'neige'].includes(k))) return 'fete';
  return 'classique';
}

/* --------------------------------------------------------------------- */
/*  ENSEIGNE (au-dessus des portes et des vitrines de façade)             */
/* --------------------------------------------------------------------- */
/**
 * @param b      boutique { nom, nomCourt, slogan, theme }
 * @param opts   { w, h, sousTitre } — sousTitre remplace le slogan (ex. promo en cours)
 */
export function peindreEnseigne(b, { w = 1024, h = 300, sousTitre = null } = {}) {
  const [c, x] = toile(w, h);
  const t = b.theme; const col = t.couleurs; const g = genre(t);
  const S = POLICES.sans; const SE = POLICES.serif;
  const nom = b.nomCourt || b.nom;
  const slogan = sousTitre || b.slogan || '';
  const m = Math.round(h * 0.05); // marge du cadre
  // Format bandeau (façade) : pas de petit titre, nom plus grand
  const large = w / h > 5;
  const fN = large ? 1.35 : 1; const fS = large ? 1.3 : 1;
  const yN = (v) => (large ? v - 0.08 : v); const yS = (v) => (large ? 0.8 : v);
  x.textAlign = 'center'; x.textBaseline = 'middle';

  if (g === 'neon') {
    // Caisson noir brossé, néon rouge, liseré orange
    const fond = x.createLinearGradient(0, 0, 0, h); fond.addColorStop(0, '#16161A'); fond.addColorStop(1, '#09090B');
    chemin(x, 2, 2, w - 4, h - 4, h * 0.08); x.fillStyle = fond; x.fill();
    x.save(); x.clip();
    for (let y = 0; y < h; y += 3) { x.fillStyle = `rgba(255,255,255,${0.012 + ((y * 7) % 11) / 900})`; x.fillRect(0, y, w, 1); }
    const halo = x.createRadialGradient(w / 2, h * 0.45, 0, w / 2, h * 0.45, w * 0.5);
    halo.addColorStop(0, rgba(col.accent, 0.28)); halo.addColorStop(1, rgba(col.accent, 0)); x.fillStyle = halo; x.fillRect(0, 0, w, h);
    x.restore();
    x.lineWidth = m * 0.5; x.strokeStyle = '#2B2B30'; chemin(x, m * 0.4, m * 0.4, w - m * 0.8, h - m * 0.8, h * 0.07); x.stroke();
    for (const [bx, by] of [[m * 1.6, m * 1.6], [w - m * 1.6, m * 1.6], [m * 1.6, h - m * 1.6], [w - m * 1.6, h - m * 1.6]]) {
      x.beginPath(); x.arc(bx, by, m * 0.45, 0, Math.PI * 2); x.fillStyle = '#3A3A40'; x.fill();
    }
    // Petit titre
    const tPetit = Math.round(h * 0.1);
    x.font = `800 ${tPetit}px ${S}`; x.fillStyle = col.metal; x.shadowColor = col.metal; x.shadowBlur = 10;
    if (!large) texteEspace(x, 'STORE', w / 2, h * 0.2, 0.42, tPetit); x.shadowBlur = 0;
    // Nom en tubes néon
    const txt = nom.toUpperCase();
    const tN = taillePour(x, txt, w * (large ? 0.6 : 0.78), `900 {t}px ${S}`, Math.round(h * 0.36 * fN), 0.04);
    x.font = `900 ${tN}px ${S}`; x.lineJoin = 'round';
    const yNe = h * yN(0.5);
    for (const [lw, coul, flou, a] of [[tN * 0.2, col.accent, 46, 0.35], [tN * 0.11, col.accent, 22, 0.9], [tN * 0.045, '#FFE3DF', 6, 1]]) {
      x.globalAlpha = a; x.shadowColor = col.accent; x.shadowBlur = flou; x.lineWidth = lw; x.strokeStyle = coul;
      x.strokeText(txt, w / 2, yNe);
    }
    x.globalAlpha = 1; x.shadowBlur = 0;
    // Éclairs jaunes
    const larg = x.measureText(txt).width;
    for (const sx of [-1, 1]) {
      eclairChemin(x, w / 2 + sx * (larg / 2 + tN * 0.55), yNe, tN * 0.42);
      x.shadowColor = OR_FLASH; x.shadowBlur = 24; x.fillStyle = OR_FLASH; x.fill(); x.shadowBlur = 0;
    }
    // Tube orange + slogan
    x.lineCap = 'round'; x.lineWidth = h * 0.022; x.strokeStyle = col.metal; x.shadowColor = col.metal; x.shadowBlur = 18;
    const yTube = large ? 0.66 : 0.72;
    x.beginPath(); x.moveTo(w * (large ? 0.3 : 0.24), h * yTube); x.lineTo(w * (large ? 0.7 : 0.76), h * yTube); x.stroke(); x.shadowBlur = 0;
    if (slogan) {
      const tS = taillePour(x, slogan.toUpperCase(), w * 0.8, `800 {t}px ${S}`, Math.round(h * 0.095 * fS), 0.16);
      x.font = `800 ${tS}px ${S}`; x.fillStyle = '#FFFFFF';
      texteEspace(x, slogan.toUpperCase(), w / 2, h * yS(0.84), 0.16, tS);
    }
  } else if (g === 'fete') {
    // Panneau vert sapin, double cadre doré, ampoules, houx
    const vert = melange(col.accent || '#1E4D2B', '#000000', 0.25);
    const fond = x.createLinearGradient(0, 0, 0, h); fond.addColorStop(0, melange(vert, '#2E7A45', 0.35)); fond.addColorStop(1, melange(vert, '#000000', 0.35));
    chemin(x, 2, 2, w - 4, h - 4, h * 0.1); x.fillStyle = fond; x.fill();
    x.save(); x.clip();
    const halo = x.createRadialGradient(w / 2, h * 0.5, 0, w / 2, h * 0.5, w * 0.45);
    halo.addColorStop(0, 'rgba(255,220,140,.22)'); halo.addColorStop(1, 'rgba(255,220,140,0)'); x.fillStyle = halo; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) { const px = (i * 157) % w; const py = (i * 97) % h; x.fillStyle = `rgba(255,255,255,${0.08 + (i % 5) * 0.03})`; x.beginPath(); x.arc(px, py, 1 + (i % 3), 0, Math.PI * 2); x.fill(); }
    x.restore();
    const or = x.createLinearGradient(0, 0, w, h); or.addColorStop(0, '#B8892C'); or.addColorStop(0.35, '#FFE6A3'); or.addColorStop(0.6, '#D4AF37'); or.addColorStop(1, '#8C6416');
    x.lineWidth = m * 0.55; x.strokeStyle = or; chemin(x, m * 0.4, m * 0.4, w - m * 0.8, h - m * 0.8, h * 0.09); x.stroke();
    x.lineWidth = 2; chemin(x, m * 1.15, m * 1.15, w - m * 2.3, h - m * 2.3, h * 0.07); x.stroke();
    // Ampoules sur le cadre
    const pas = Math.max(26, h * 0.12); const r = h * 0.022;
    const bord = []; const x0 = m * 0.4; const y0 = m * 0.4; const x1 = w - m * 0.4; const y1 = h - m * 0.4;
    for (let px = x0 + pas; px < x1 - pas / 2; px += pas) bord.push([px, y0], [px, y1]);
    for (let py = y0 + pas; py < y1 - pas / 2; py += pas) bord.push([x0, py], [x1, py]);
    bord.forEach(([px, py], i) => {
      x.beginPath(); x.arc(px, py, r, 0, Math.PI * 2);
      x.fillStyle = i % 2 ? '#FFF4D6' : '#FFD27A'; x.shadowColor = '#FFD27A'; x.shadowBlur = 12; x.fill();
    });
    x.shadowBlur = 0;
    // Houx dans les coins hauts
    const houx = (hx, hy, s, sens) => {
      for (const a of [-0.5, 0.3, 1.1]) {
        x.save(); x.translate(hx, hy); x.rotate(a * sens); x.beginPath(); x.ellipse(s * 0.75, 0, s * 0.75, s * 0.3, 0, 0, Math.PI * 2);
        x.fillStyle = '#1F6B33'; x.fill(); x.strokeStyle = '#0E3A1B'; x.lineWidth = 2; x.stroke(); x.restore();
      }
      for (const [bx, by] of [[0, 0], [s * 0.28, s * 0.18], [-s * 0.05, s * 0.32]]) { x.beginPath(); x.arc(hx + bx * sens, hy + by, s * 0.17, 0, Math.PI * 2); x.fillStyle = '#D21F2B'; x.fill(); x.fillStyle = 'rgba(255,255,255,.5)'; x.beginPath(); x.arc(hx + bx * sens - s * 0.05, hy + by - s * 0.05, s * 0.05, 0, Math.PI * 2); x.fill(); }
    };
    houx(m * 3.2, m * 3, h * 0.13, 1); houx(w - m * 3.2, m * 3, h * 0.13, -1);
    const tPetit = Math.round(h * 0.09);
    x.font = `700 ${tPetit}px ${S}`; x.fillStyle = '#F3DFA2';
    if (!large) texteEspace(x, 'STORE', w / 2, h * 0.22, 0.42, tPetit);
    const tN = taillePour(x, nom, w * 0.7, `italic 600 {t}px ${SE}`, Math.round(h * 0.46 * (large ? 1.25 : 1)));
    x.font = `italic 600 ${tN}px ${SE}`;
    const orTxt = x.createLinearGradient(0, h * 0.32, 0, h * 0.72); orTxt.addColorStop(0, '#FFF4C9'); orTxt.addColorStop(0.5, '#F0C85A'); orTxt.addColorStop(1, '#B98B2E');
    x.shadowColor = 'rgba(255,214,120,.9)'; x.shadowBlur = 28; x.fillStyle = orTxt; x.fillText(nom, w / 2, h * yN(0.52)); x.shadowBlur = 0;
    x.fillText(nom, w / 2, h * yN(0.52));
    if (slogan) {
      const tS = taillePour(x, slogan, w * 0.72, `italic 500 {t}px ${SE}`, Math.round(h * 0.11 * fS));
      x.font = `italic 500 ${tS}px ${SE}`; x.fillStyle = '#FBEFD2'; x.fillText(slogan, w / 2, h * yS(0.81));
    }
  } else {
    // Classique : caisson bleu nuit, cadre laiton, lettres rétroéclairées
    const nuit = col.accent || '#1B2A41';
    const fond = x.createLinearGradient(0, 0, 0, h); fond.addColorStop(0, melange(nuit, '#3A5175', 0.35)); fond.addColorStop(1, melange(nuit, '#000000', 0.4));
    chemin(x, 2, 2, w - 4, h - 4, h * 0.06); x.fillStyle = fond; x.fill();
    x.save(); x.clip();
    const halo = x.createRadialGradient(w / 2, h * 0.5, 0, w / 2, h * 0.5, w * 0.42);
    halo.addColorStop(0, 'rgba(255,236,200,.22)'); halo.addColorStop(1, 'rgba(255,236,200,0)'); x.fillStyle = halo; x.fillRect(0, 0, w, h);
    for (let px = m * 2; px < w; px += Math.max(14, h * 0.05)) { x.fillStyle = 'rgba(255,255,255,.025)'; x.fillRect(px, 0, 2, h); }
    x.restore();
    const laiton = x.createLinearGradient(0, 0, 0, h); laiton.addColorStop(0, '#F5DB98'); laiton.addColorStop(0.45, col.metal || '#C9A24B'); laiton.addColorStop(1, '#7A5A1E');
    x.lineWidth = m * 0.6; x.strokeStyle = laiton; chemin(x, m * 0.4, m * 0.4, w - m * 0.8, h - m * 0.8, h * 0.05); x.stroke();
    x.lineWidth = 1.5; x.strokeStyle = 'rgba(245,219,152,.55)'; chemin(x, m * 1.2, m * 1.2, w - m * 2.4, h - m * 2.4, h * 0.04); x.stroke();
    const tPetit = Math.round(h * 0.085);
    x.font = `700 ${tPetit}px ${S}`; x.fillStyle = '#EADFC8';
    if (!large) {
      texteEspace(x, 'STORE', w / 2, h * 0.22, 0.45, tPetit);
      x.fillStyle = laiton;
      for (const sx of [-1, 1]) x.fillRect(w / 2 + sx * tPetit * 3.6 - (sx < 0 ? tPetit * 3 : 0), h * 0.22 - 1, tPetit * 3, 2);
    }
    const tN = taillePour(x, nom, w * 0.74, `500 {t}px ${SE}`, Math.round(h * 0.42 * (large ? 1.3 : 1)));
    x.font = `500 ${tN}px ${SE}`;
    x.shadowColor = 'rgba(255,238,200,.95)'; x.shadowBlur = 30; x.fillStyle = 'rgba(255,238,200,.55)'; x.fillText(nom, w / 2, h * yN(0.53));
    x.shadowBlur = 0; const lt = x.createLinearGradient(0, h * 0.35, 0, h * 0.7); lt.addColorStop(0, '#FFF3D1'); lt.addColorStop(0.55, '#E2BE6A'); lt.addColorStop(1, '#A57C2C');
    x.fillStyle = lt; x.fillText(nom, w / 2, h * yN(0.53));
    if (slogan) {
      const tS = taillePour(x, slogan, w * 0.74, `600 {t}px ${S}`, Math.round(h * 0.088 * fS), 0.08);
      x.font = `600 ${tS}px ${S}`; x.fillStyle = 'rgba(234,223,200,.85)';
      texteEspace(x, slogan, w / 2, h * yS(0.81), 0.08, tS);
    }
  }
  return c;
}

/* --------------------------------------------------------------------- */
/*  VUE À TRAVERS UNE PORTE : un aperçu de la boutique voisine            */
/* --------------------------------------------------------------------- */
export function peindreVue(theme, w = 512, h = 1024) {
  const [c, x] = toile(w, h);
  const col = theme.couleurs; const g = genre(theme);
  const fx0 = w * 0.38; const fx1 = w * 0.62; const fy0 = h * 0.33; const fy1 = h * 0.5; // mur du fond
  const poly = (pts, fill) => { x.beginPath(); pts.forEach(([px, py], i) => (i ? x.lineTo(px, py) : x.moveTo(px, py))); x.closePath(); x.fillStyle = fill; x.fill(); };
  const murG = (t, f) => [lerp(0, fx0, t), lerp(lerp(0, fy0, t), lerp(h, fy1, t), f)];
  const murD = (t, f) => [lerp(w, fx1, t), lerp(lerp(0, fy0, t), lerp(h, fy1, t), f)];
  // Plafond, murs, sol
  const plafond = x.createLinearGradient(0, 0, 0, fy0); plafond.addColorStop(0, melange(col.plafond, '#000000', 0.2)); plafond.addColorStop(1, melange(col.plafond, col.lumiere, 0.25));
  poly([[0, 0], [w, 0], [fx1, fy0], [fx0, fy0]], plafond);
  const mur = x.createLinearGradient(0, 0, fx0, 0); mur.addColorStop(0, melange(col.mur, '#000000', 0.25)); mur.addColorStop(1, melange(col.mur, col.lumiere, 0.3));
  poly([[0, 0], [fx0, fy0], [fx0, fy1], [0, h]], mur);
  const mur2 = x.createLinearGradient(w, 0, fx1, 0); mur2.addColorStop(0, melange(col.mur, '#000000', 0.25)); mur2.addColorStop(1, melange(col.mur, col.lumiere, 0.3));
  poly([[w, 0], [fx1, fy0], [fx1, fy1], [w, h]], mur2);
  const sol = x.createLinearGradient(0, h, 0, fy1); sol.addColorStop(0, melange(col.sol, '#000000', 0.2)); sol.addColorStop(1, melange(col.sol, col.lumiere, 0.35));
  poly([[0, h], [w, h], [fx1, fy1], [fx0, fy1]], sol);
  // Tapis central
  poly([[w * 0.36, h], [w * 0.64, h], [w * 0.515, fy1], [w * 0.485, fy1]], rgba(col.tapis || col.accent, 0.75));
  // Mur du fond : écran lumineux
  const fond = x.createLinearGradient(0, fy0, 0, fy1); fond.addColorStop(0, melange(col.mur, col.lumiere, 0.4)); fond.addColorStop(1, melange(col.mur, '#000000', 0.2));
  x.fillStyle = fond; x.fillRect(fx0, fy0, fx1 - fx0, fy1 - fy0);
  x.fillStyle = rgba(g === 'neon' ? col.accent : col.lumiere, 0.85); x.shadowColor = x.fillStyle; x.shadowBlur = 20;
  x.fillRect(fx0 + (fx1 - fx0) * 0.18, fy0 + (fy1 - fy0) * 0.22, (fx1 - fx0) * 0.64, (fy1 - fy0) * 0.25); x.shadowBlur = 0;
  // Vitrines lumineuses sur les deux murs
  const vitrines = [[0.02, 0.3], [0.38, 0.58], [0.66, 0.8]];
  for (const cote of [murG, murD]) {
    vitrines.forEach(([t1, t2], i) => {
      const a = cote(t1, 0.3); const b = cote(t2, 0.3); const cc = cote(t2, 0.72); const d = cote(t1, 0.72);
      const gr = x.createLinearGradient(a[0], a[1], d[0], d[1]);
      gr.addColorStop(0, rgba(col.lumiere, 0.95)); gr.addColorStop(0.5, rgba(melange(col.accent, col.lumiere, 0.4), 0.9)); gr.addColorStop(1, rgba(col.accent, 0.85));
      poly([a, b, cc, d], gr);
      // Cartes dans la vitrine (petits rectangles colorés)
      const teintes = ['#E8E8E8', '#1B6AD6', '#E50914', '#1DB954', '#FF9900', '#7B2FF7'];
      for (let k = 0; k < 3; k++) {
        const u1 = lerp(t1, t2, 0.12 + k * 0.29); const u2 = lerp(t1, t2, 0.32 + k * 0.29);
        const p1 = cote(u1, 0.42); const p2 = cote(u2, 0.42); const p3 = cote(u2, 0.58); const p4 = cote(u1, 0.58);
        poly([p1, p2, p3, p4], teintes[(i * 3 + k + (cote === murD ? 2 : 0)) % teintes.length]);
      }
      x.strokeStyle = g === 'neon' ? col.accent : (col.metal || '#C9A24B'); x.lineWidth = Math.max(1.5, 5 * (1 - t1));
      x.beginPath(); x.moveTo(...a); x.lineTo(...b); x.lineTo(...cc); x.lineTo(...d); x.closePath(); x.stroke();
      // Reflet au sol
      const s1 = cote(t1, 1.0); const s2 = cote(t2, 1.0);
      poly([s1, s2, [lerp(s2[0], w / 2, 0.15), s2[1]], [lerp(s1[0], w / 2, 0.25), s1[1]]], rgba(col.lumiere, 0.12));
    });
  }
  // Lignes lumineuses du plafond (fuyantes)
  x.lineCap = 'round';
  for (const u of [0.25, 0.5, 0.75]) {
    x.strokeStyle = rgba(g === 'neon' ? col.accent : '#FFFFFF', 0.9); x.shadowColor = g === 'neon' ? col.accent : col.lumiere; x.shadowBlur = 16; x.lineWidth = 5;
    x.beginPath(); x.moveTo(lerp(w * 0.08, w * 0.92, u), 0); x.lineTo(lerp(fx0, fx1, u), fy0); x.stroke();
  }
  x.shadowBlur = 0;
  // Détails du thème
  if (g === 'fete') {
    for (const cote of [murG, murD]) for (let k = 0; k <= 22; k++) {
      const t = k / 22; const [px, py] = cote(t, 0.06 + 0.04 * Math.sin(t * Math.PI * 5));
      x.beginPath(); x.arc(px, py, Math.max(1.5, 6 * (1 - t)), 0, Math.PI * 2); x.fillStyle = k % 2 ? '#FFE2A8' : '#FFFFFF'; x.shadowColor = '#FFD27A'; x.shadowBlur = 10; x.fill();
    }
    x.shadowBlur = 0;
    for (let i = 0; i < 160; i++) { x.fillStyle = 'rgba(255,255,255,.7)'; x.beginPath(); x.arc((i * 173) % w, (i * 389) % h, 1 + (i % 3) * 0.8, 0, Math.PI * 2); x.fill(); }
  } else if (g === 'neon') {
    x.strokeStyle = col.accent; x.shadowColor = col.accent; x.shadowBlur = 18; x.lineWidth = 4;
    for (const [a, b] of [[[0, 0], [fx0, fy0]], [[w, 0], [fx1, fy0]], [[0, h], [fx0, fy1]], [[w, h], [fx1, fy1]]]) { x.beginPath(); x.moveTo(...a); x.lineTo(...b); x.stroke(); }
    x.shadowBlur = 0;
  }
  // Thème très clair (murs blancs) : on atténue pour ne pas éblouir
  const [mr, mg, mb] = hexRgb(col.mur);
  if ((0.2126 * mr + 0.7152 * mg + 0.0722 * mb) / 255 > 0.7) { x.fillStyle = 'rgba(20,24,34,.22)'; x.fillRect(0, 0, w, h); }
  // Profondeur : brume lumineuse au fond + vignettage
  const brume = x.createRadialGradient(w / 2, (fy0 + fy1) / 2, 0, w / 2, (fy0 + fy1) / 2, h * 0.45);
  brume.addColorStop(0, rgba(col.lumiere, 0.35)); brume.addColorStop(1, rgba(col.lumiere, 0));
  x.fillStyle = brume; x.fillRect(0, 0, w, h);
  const vig = x.createRadialGradient(w / 2, h * 0.45, h * 0.2, w / 2, h * 0.45, h * 0.75);
  vig.addColorStop(0, 'rgba(0,0,0,0)'); vig.addColorStop(1, 'rgba(0,0,0,.45)'); x.fillStyle = vig; x.fillRect(0, 0, w, h);
  return c;
}

/* --------------------------------------------------------------------- */
/*  PROMO : autocollant, étiquette de prix barré, bannière animée         */
/* --------------------------------------------------------------------- */
export function peindreAutocollant(remise, { w = 256, legende = 'FLASH SALE', accent = '#FF2D3A', metal = '#FF7A1A', style = 'flash' } = {}) {
  if (style === 'noel') return peindreBoule(remise, w);
  const [c, x] = toile(w, w);
  const cx = w / 2; const r = w * 0.47;
  x.save(); x.shadowColor = 'rgba(0,0,0,.45)'; x.shadowBlur = w * 0.05; x.shadowOffsetY = w * 0.02;
  etoile(x, cx, cx, r, r * 0.84, 18, 0.1);
  const gr = x.createRadialGradient(cx * 0.8, cx * 0.7, 0, cx, cx, r); gr.addColorStop(0, '#FFF6C2'); gr.addColorStop(0.45, OR_FLASH); gr.addColorStop(1, metal);
  x.fillStyle = gr; x.fill(); x.restore();
  etoile(x, cx, cx, r, r * 0.84, 18, 0.1); x.lineWidth = w * 0.018; x.strokeStyle = melange(accent, '#000000', 0.3); x.stroke();
  x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#0B0B0C';
  const txt = `−${remise}%`;
  const t = taillePour(x, txt, w * 0.66, `900 {t}px ${POLICES.sans}`, Math.round(w * 0.3));
  x.font = `900 ${t}px ${POLICES.sans}`; x.fillText(txt, cx, cx - w * 0.04);
  if (legende) { x.font = `900 ${Math.round(w * 0.075)}px ${POLICES.sans}`; x.fillStyle = melange(accent, '#000000', 0.2); texteEspace(x, legende, cx, cx + w * 0.2, 0.12, w * 0.075); }
  return c;
}

/** Boule de sapin rouge à attache dorée, « −10% » et « Noël ». */
function peindreBoule(remise, w) {
  const [c, x] = toile(w, w);
  const cx = w / 2; const cy = w * 0.56; const r = w * 0.4;
  // Fil + attache
  x.strokeStyle = '#E8C25A'; x.lineWidth = w * 0.012; x.beginPath(); x.moveTo(cx, 0); x.lineTo(cx, cy - r - w * 0.06); x.stroke();
  const at = x.createLinearGradient(cx - w * 0.07, 0, cx + w * 0.07, 0); at.addColorStop(0, '#8C6416'); at.addColorStop(0.5, '#F5DB98'); at.addColorStop(1, '#8C6416');
  chemin(x, cx - w * 0.07, cy - r - w * 0.08, w * 0.14, w * 0.09, w * 0.02); x.fillStyle = at; x.fill();
  // Boule
  x.save(); x.shadowColor = 'rgba(0,0,0,.45)'; x.shadowBlur = w * 0.05; x.shadowOffsetY = w * 0.02;
  const g = x.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.05, cx, cy, r);
  g.addColorStop(0, '#FF9AA4'); g.addColorStop(0.3, '#D42A3C'); g.addColorStop(0.7, '#A3172A'); g.addColorStop(1, '#5E0F16');
  x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fillStyle = g; x.fill(); x.restore();
  x.lineWidth = w * 0.022; x.strokeStyle = '#D4AF37'; x.beginPath(); x.arc(cx, cy, r - w * 0.012, 0, Math.PI * 2); x.stroke();
  // Frise dorée
  x.lineWidth = w * 0.01; x.strokeStyle = 'rgba(245,219,152,.85)';
  for (const dy of [-0.74, 0.74]) { x.beginPath(); x.ellipse(cx, cy + dy * r, r * Math.sqrt(1 - dy * dy) * 0.98, r * 0.1, 0, 0, Math.PI * 2); x.stroke(); }
  // Reflet
  x.fillStyle = 'rgba(255,255,255,.35)'; x.beginPath(); x.ellipse(cx - r * 0.42, cy - r * 0.45, r * 0.2, r * 0.11, -0.6, 0, Math.PI * 2); x.fill();
  // Textes
  x.textAlign = 'center'; x.textBaseline = 'middle';
  const txt = `−${remise}%`;
  const t = taillePour(x, txt, r * 1.5, `900 {t}px ${POLICES.sans}`, Math.round(w * 0.24));
  x.font = `900 ${t}px ${POLICES.sans}`; x.fillStyle = '#FFE6A3'; x.shadowColor = 'rgba(94,15,22,.9)'; x.shadowBlur = 6; x.fillText(txt, cx, cy - w * 0.02); x.shadowBlur = 0;
  x.font = `italic 600 ${Math.round(w * 0.085)}px ${POLICES.serif}`; x.fillStyle = '#FFF8E7'; x.fillText('Xmas', cx, cy + r * 0.42);
  return c;
}

export function peindreEtiquettePromo(avant, apres, remise, { accent = '#FF2D3A', metal = '#FF7A1A', style = 'flash' } = {}) {
  if (style === 'noel') { accent = '#C8283A'; metal = '#D4AF37'; }
  const OR = style === 'noel' ? '#FFE6A3' : OR_FLASH;
  const [c, x] = toile(512, 120);
  chemin(x, 6, 10, 500, 100, 22); x.fillStyle = style === 'noel' ? 'rgba(52,8,14,.9)' : 'rgba(14,6,8,.86)'; x.fill();
  const bord = x.createLinearGradient(0, 0, 512, 0); bord.addColorStop(0, accent); bord.addColorStop(1, metal);
  x.lineWidth = 3.5; x.strokeStyle = bord; x.shadowColor = accent; x.shadowBlur = 14; x.stroke(); x.shadowBlur = 0;
  x.textBaseline = 'middle';
  // Pastille −10 %
  chemin(x, 20, 30, 96, 60, 12); x.fillStyle = OR; x.fill();
  x.fillStyle = '#0B0B0C'; x.textAlign = 'center'; x.font = `900 ${taillePour(x, `−${remise}%`, 84, `900 {t}px ${POLICES.sans}`, 34)}px ${POLICES.sans}`; x.fillText(`−${remise}%`, 68, 61);
  // Ancien prix barré
  x.textAlign = 'left'; x.font = `700 34px ${POLICES.sans}`; x.fillStyle = '#A9A3A3';
  const wa = x.measureText(avant).width; x.fillText(avant, 132, 62);
  x.strokeStyle = accent; x.lineWidth = 4; x.beginPath(); x.moveTo(126, 66); x.lineTo(138 + wa, 56); x.stroke();
  // Nouveau prix
  x.textAlign = 'right';
  const t = taillePour(x, apres, 488 - (150 + wa), `900 {t}px ${POLICES.sans}`, 52);
  x.font = `900 ${t}px ${POLICES.sans}`; x.fillStyle = OR; x.shadowColor = metal; x.shadowBlur = 12; x.fillText(apres, 490, 62); x.shadowBlur = 0;
  return c;
}

/** Bannière animée « VENTE FLASH » (à repeindre ~10 fois par seconde). */
export function peindreBanniere(x, w, h, temps, { remise, cible = 'ON PACKS', fin = null, accent = '#FF2D3A', metal = '#FF7A1A', style = 'flash', accroche = 'Christmas Offer' }) {
  x.clearRect(0, 0, w, h);
  if (style === 'noel') { peindreBanniereNoel(x, w, h, temps, { remise, cible, fin, accroche }); return; }
  const fond = x.createLinearGradient(0, 0, w, 0);
  fond.addColorStop(0, '#120203'); fond.addColorStop(0.5, melange(accent, '#000000', 0.55)); fond.addColorStop(1, '#120203');
  chemin(x, 2, 2, w - 4, h - 4, h * 0.12); x.fillStyle = fond; x.fill();
  x.save(); x.clip();
  // Bandes « attention » qui défilent en haut et en bas
  const bh = h * 0.12; const pas = bh * 2;
  for (const y of [0, h - bh]) {
    x.fillStyle = OR_FLASH; x.fillRect(0, y, w, bh); x.fillStyle = '#0B0B0C';
    const dec = (temps * 120) % pas;
    for (let px = -pas * 2 + dec; px < w + pas; px += pas) { x.beginPath(); x.moveTo(px, y + bh); x.lineTo(px + bh, y); x.lineTo(px + bh * 2, y); x.lineTo(px + bh, y + bh); x.closePath(); x.fill(); }
  }
  // Balayage lumineux
  const bx = ((temps * 0.45) % 1) * (w + 400) - 200;
  const gb = x.createLinearGradient(bx - 140, 0, bx + 140, 0); gb.addColorStop(0, 'rgba(255,255,255,0)'); gb.addColorStop(0.5, 'rgba(255,255,255,.16)'); gb.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = gb; x.fillRect(0, 0, w, h);
  x.restore();
  // Texte principal (pulsation + scintillement façon néon)
  const pulse = 0.75 + 0.25 * Math.sin(temps * 6);
  const clignote = Math.sin(temps * 1.7) > 0.96 ? 0.45 : 1;
  x.textAlign = 'center'; x.textBaseline = 'middle';
  const ligne = `FLASH SALE  −${remise}%  ${cible.toUpperCase()}`;
  const yT = fin ? h * 0.42 : h * 0.5;
  const t = taillePour(x, ligne, w * 0.78, `900 {t}px ${POLICES.sans}`, Math.round(h * (fin ? 0.3 : 0.36)));
  x.font = `900 ${t}px ${POLICES.sans}`;
  x.globalAlpha = clignote; x.shadowColor = accent; x.shadowBlur = 30 * pulse; x.fillStyle = '#FFFFFF'; x.fillText(ligne, w / 2, yT);
  x.shadowBlur = 0; x.globalAlpha = 1;
  const larg = x.measureText(ligne).width;
  for (const sx of [-1, 1]) { eclairChemin(x, w / 2 + sx * (larg / 2 + t * 0.7), yT, t * 0.5); x.fillStyle = OR_FLASH; x.shadowColor = OR_FLASH; x.shadowBlur = 20 * pulse; x.fill(); x.shadowBlur = 0; }
  if (fin) {
    const d = Math.max(0, Date.parse(fin) - Date.now());
    const j = Math.floor(d / 864e5); const hh = Math.floor(d / 36e5) % 24; const mm = Math.floor(d / 6e4) % 60; const ss = Math.floor(d / 1e3) % 60;
    const p2 = (n) => String(n).padStart(2, '0');
    x.font = `800 ${Math.round(h * 0.15)}px ${POLICES.sans}`; x.fillStyle = OR_FLASH;
    x.fillText(`ENDS IN  ${j}D  ${p2(hh)}:${p2(mm)}:${p2(ss)}`, w / 2, h * 0.7);
  }
}

/** Bannière de Noël : velours rouge, cadre doré, guirlande qui scintille, neige, lettres d'or. */
function peindreBanniereNoel(x, w, h, temps, { remise, cible, fin, accroche }) {
  const fond = x.createLinearGradient(0, 0, 0, h); fond.addColorStop(0, '#8E1B24'); fond.addColorStop(0.55, '#6A111B'); fond.addColorStop(1, '#3E0910');
  chemin(x, 2, 2, w - 4, h - 4, h * 0.14); x.fillStyle = fond; x.fill();
  x.save(); x.clip();
  const lu = x.createRadialGradient(w / 2, h * 0.45, 0, w / 2, h * 0.45, w * 0.45); lu.addColorStop(0, 'rgba(255,214,140,.25)'); lu.addColorStop(1, 'rgba(255,214,140,0)');
  x.fillStyle = lu; x.fillRect(0, 0, w, h);
  // Neige qui tombe
  for (let i = 0; i < 60; i++) {
    const px = ((i * 137.5) % w) + Math.sin(temps * 0.8 + i) * 8; const py = (((i * 53) % h) + temps * (14 + (i % 5) * 6)) % h;
    x.fillStyle = `rgba(255,255,255,${0.35 + (i % 4) * 0.15})`; x.beginPath(); x.arc(px, py, 1.2 + (i % 3), 0, Math.PI * 2); x.fill();
  }
  x.restore();
  // Cadre doré
  const or = x.createLinearGradient(0, 0, w, h); or.addColorStop(0, '#B8892C'); or.addColorStop(0.4, '#FFE6A3'); or.addColorStop(0.7, '#D4AF37'); or.addColorStop(1, '#8C6416');
  x.lineWidth = 6; x.strokeStyle = or; chemin(x, 5, 5, w - 10, h - 10, h * 0.12); x.stroke();
  // Guirlande d'ampoules le long du haut et du bas
  const n = 30;
  for (const yy of [16, h - 16]) for (let k = 0; k < n; k++) {
    const px = 24 + (k / (n - 1)) * (w - 48); const on = (Math.floor(temps * 3) + k) % 3 !== 0;
    const coul = ['#FF4D5E', '#FFD27A', '#5BE08A', '#FFFFFF'][k % 4];
    x.beginPath(); x.arc(px, yy, 4.2, 0, Math.PI * 2); x.fillStyle = on ? coul : 'rgba(255,255,255,.25)'; x.shadowColor = coul; x.shadowBlur = on ? 12 : 0; x.fill();
  }
  x.shadowBlur = 0;
  // Textes : accroche en lettres d'or + remise
  x.textAlign = 'center'; x.textBaseline = 'middle';
  const pulse = 0.7 + 0.3 * Math.sin(temps * 2.5);
  const ligne = `${accroche}  ·  −${remise}% ${cible}`;
  const yT = fin ? h * 0.43 : h * 0.5;
  const t = taillePour(x, ligne, w * 0.84, `italic 600 {t}px ${POLICES.serif}`, Math.round(h * 0.3));
  x.font = `italic 600 ${t}px ${POLICES.serif}`;
  const lt = x.createLinearGradient(0, yT - t / 2, 0, yT + t / 2); lt.addColorStop(0, '#FFFBEA'); lt.addColorStop(0.5, '#F0C85A'); lt.addColorStop(1, '#B98B2E');
  x.shadowColor = 'rgba(255,214,120,.9)'; x.shadowBlur = 18 * pulse; x.fillStyle = lt; x.fillText(ligne, w / 2, yT); x.shadowBlur = 0;
  const larg = x.measureText(ligne).width;
  for (const sx of [-1, 1]) { x.font = `${Math.round(t * 0.8)}px ${POLICES.sans}`; x.fillStyle = '#FFFFFF'; x.fillText('❄', w / 2 + sx * (larg / 2 + t * 0.6), yT); }
  if (fin) {
    const d = Math.max(0, Date.parse(fin) - Date.now());
    const j = Math.floor(d / 864e5); const hh = Math.floor(d / 36e5) % 24; const mm = Math.floor(d / 6e4) % 60; const ss = Math.floor(d / 1e3) % 60;
    const p2 = (v) => String(v).padStart(2, '0');
    x.font = `700 ${Math.round(h * 0.13)}px ${POLICES.sans}`; x.fillStyle = '#FBEFD2';
    texteEspace(x, `OFFER ENDS IN  ${j}D  ${p2(hh)}:${p2(mm)}:${p2(ss)}`, w / 2, h * 0.72, 0.06, Math.round(h * 0.13));
  }
}

/** Faisceau de projecteur (dégradé vertical, transparent sur les bords). */
export function peindreFaisceau() {
  const [c, x] = toile(64, 512);
  const v = x.createLinearGradient(0, 512, 0, 0); v.addColorStop(0, 'rgba(255,255,255,1)'); v.addColorStop(0.6, 'rgba(255,255,255,.35)'); v.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = v; x.fillRect(0, 0, 64, 512);
  x.globalCompositeOperation = 'destination-in';
  const hz = x.createLinearGradient(0, 0, 64, 0); hz.addColorStop(0, 'rgba(0,0,0,0)'); hz.addColorStop(0.5, 'rgba(0,0,0,1)'); hz.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = hz; x.fillRect(0, 0, 64, 512);
  return c;
}

/** Inscription au sol devant une porte (« NOËL » + chevrons). */
export function peindreSol(b) {
  const [c, x] = toile(512, 256);
  const col = b.theme.couleurs; const g = genre(b.theme);
  const teinte = g === 'neon' ? col.accent : (col.metal || '#C9A24B');
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.strokeStyle = rgba(teinte, 0.8); x.lineWidth = 5; x.lineCap = 'round'; x.lineJoin = 'round';
  for (const [y, a] of [[40, 0.35], [78, 0.6]]) { x.globalAlpha = a; x.beginPath(); x.moveTo(206, y + 26); x.lineTo(256, y); x.lineTo(306, y + 26); x.stroke(); }
  x.globalAlpha = 1;
  const nom = (b.nomCourt || b.nom).toUpperCase();
  const t = taillePour(x, nom, 420, `800 {t}px ${POLICES.sans}`, 64, 0.2);
  x.font = `800 ${t}px ${POLICES.sans}`; x.fillStyle = rgba(teinte, 0.85); x.shadowColor = teinte; x.shadowBlur = 14;
  texteEspace(x, nom, 256, 176, 0.2, t);
  return c;
}

/** Petit panneau « ENTER › » collé sur la vitre des portes (sobre : verre dépoli, flèches). */
export function peindreIndicePorte({ texte = 'ENTER', accent = '#C9A24B' } = {}) {
  const [c, x] = toile(384, 96);
  chemin(x, 4, 8, 376, 80, 40);
  x.fillStyle = 'rgba(10,12,18,.62)'; x.fill();
  x.lineWidth = 3; x.strokeStyle = rgba(accent, 0.9); x.stroke();
  x.textBaseline = 'middle'; x.textAlign = 'center';
  x.font = `800 38px ${POLICES.sans}`; x.fillStyle = '#FFFFFF';
  texteEspace(x, texte, 160, 49, 0.18, 38);
  x.strokeStyle = accent; x.lineWidth = 6; x.lineCap = 'round'; x.lineJoin = 'round';
  [0, 1, 2].forEach((i) => { x.globalAlpha = 0.45 + i * 0.27; const px = 272 + i * 26; x.beginPath(); x.moveTo(px, 33); x.lineTo(px + 14, 48); x.lineTo(px, 63); x.stroke(); });
  x.globalAlpha = 1;
  return c;
}

// Couches fixes de l'hologramme, peintes une seule fois (l'hologramme est redessiné ~15 fois/s)
const cacheHolo = new Map();
function grilleHolo(w, h, C) {
  const cle = `g${w}x${h}${C}`;
  if (!cacheHolo.has(cle)) {
    const [c, x] = toile(w, h); const r6 = 18 * (w / 512);
    x.strokeStyle = rgba(C, 0.07); x.lineWidth = 1;
    for (let row = 0, yy = 0; yy < h + r6; row++, yy += r6 * 1.5) {
      for (let xx = (row % 2) * r6 * 0.866; xx < w + r6; xx += r6 * 1.732) {
        x.beginPath();
        for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + (i * Math.PI) / 3; const px = xx + Math.cos(a) * r6 * 0.92; const py = yy + Math.sin(a) * r6 * 0.92; if (i) x.lineTo(px, py); else x.moveTo(px, py); }
        x.closePath(); x.stroke();
      }
    }
    cacheHolo.set(cle, c);
  }
  return cacheHolo.get(cle);
}
function trameHolo(w, h) {
  const cle = `t${w}x${h}`;
  if (!cacheHolo.has(cle)) {
    const [c, x] = toile(w, h); const k = w / 512;
    x.fillStyle = 'rgba(0,0,0,.18)';
    for (let yy = 0; yy < h; yy += 4 * k) x.fillRect(0, yy, w, 1.4 * k);
    cacheHolo.set(cle, c);
  }
  return cacheHolo.get(cle);
}

/** Hologramme « newsletter » du comptoir (style interface de super-héros) :
 *  fond de verre sombre, anneaux qui tournent, champs qui se remplissent tout seuls,
 *  curseur qui clignote, bouton qui pulse et ligne de balayage. Peint à l'instant t (s). */
export function peindreHolo(x, w, h, t, { titre = 'JOIN THE CLUB', sousTitre = 'NEWSLETTER', bouton = 'TAP TO SUBSCRIBE', couleur = '#5FE3FF', abonne = false } = {}) {
  const T = POLICES.tech; const C = couleur; const k = w / 512;
  x.clearRect(0, 0, w, h);
  x.save();
  x.lineJoin = 'round'; x.lineCap = 'round';
  // Verre sombre + grille hexagonale très légère
  const m = 10 * k;
  chemin(x, m, m, w - 2 * m, h - 2 * m, 22 * k);
  const fond = x.createLinearGradient(0, 0, 0, h); fond.addColorStop(0, 'rgba(4,34,52,.82)'); fond.addColorStop(1, 'rgba(2,14,26,.72)');
  x.fillStyle = fond; x.fill();
  x.save(); x.clip();
  x.drawImage(grilleHolo(w, h, C), 0, 0);
  // Ligne de balayage
  const sy = ((t * 0.32) % 1.15) * h - 0.08 * h;
  const sg = x.createLinearGradient(0, sy - 60 * k, 0, sy + 6 * k); sg.addColorStop(0, rgba(C, 0)); sg.addColorStop(0.9, rgba(C, 0.22)); sg.addColorStop(1, rgba('#FFFFFF', 0.55));
  x.fillStyle = sg; x.fillRect(0, sy - 60 * k, w, 66 * k);
  x.drawImage(trameHolo(w, h), 0, 0);
  x.restore();
  // Cadre lumineux + équerres d'angle
  x.shadowColor = C; x.shadowBlur = 14 * k;
  x.strokeStyle = rgba(C, 0.55); x.lineWidth = 2 * k; chemin(x, m, m, w - 2 * m, h - 2 * m, 22 * k); x.stroke();
  x.strokeStyle = '#E8FDFF'; x.lineWidth = 4.5 * k;
  const e = 46 * k; const q = m + 4 * k;
  for (const [ax, ay, sx, sy2] of [[q, q, 1, 1], [w - q, q, -1, 1], [q, h - q, 1, -1], [w - q, h - q, -1, -1]]) {
    x.beginPath(); x.moveTo(ax, ay + sy2 * e); x.lineTo(ax, ay); x.lineTo(ax + sx * e, ay); x.stroke();
  }
  x.shadowBlur = 0;
  // Ligne d'état
  x.textBaseline = 'middle'; x.textAlign = 'left';
  x.font = `600 ${15 * k}px ${T}`; x.fillStyle = rgba(C, 0.85);
  x.fillText('SYS://CLUB.LINK', 34 * k, 40 * k);
  x.textAlign = 'right';
  const vif = Math.sin(t * 5) > -0.2;
  x.fillText('ONLINE', w - 52 * k, 40 * k);
  x.fillStyle = vif ? '#7CFFB2' : 'rgba(124,255,178,.25)'; x.shadowColor = '#7CFFB2'; x.shadowBlur = vif ? 10 * k : 0;
  x.beginPath(); x.arc(w - 38 * k, 40 * k, 5 * k, 0, Math.PI * 2); x.fill(); x.shadowBlur = 0;
  // Vu-mètre
  for (let i = 0; i < 14; i++) {
    const hb = (0.25 + 0.75 * Math.abs(Math.sin(t * 3.1 + i * 0.9) * Math.cos(t * 1.7 + i * 0.4))) * 14 * k;
    x.fillStyle = rgba(C, 0.25 + 0.5 * (hb / (14 * k)));
    x.fillRect(196 * k + i * 8 * k, 47 * k - hb, 4.5 * k, hb);
  }
  // Emblème : anneaux concentriques qui tournent
  const cx = w / 2; const cy = 140 * k;
  x.shadowColor = C;
  const arcs = [[74, 0.9, 3, [0.0, 1.1, 1.6, 2.5, 3.3, 4.6, 5.0, 5.9]], [60, -1.4, 6, [0.3, 2.2, 3.4, 5.6]], [46, 2.2, 2, [0.0, 0.8, 1.5, 2.3, 3.1, 3.9, 4.7, 5.5]]];
  for (const [r, v, lw, seg] of arcs) {
    x.strokeStyle = rgba(C, 0.9); x.lineWidth = lw * k; x.shadowBlur = 10 * k;
    for (let i = 0; i < seg.length; i += 2) { x.beginPath(); x.arc(cx, cy, r * k, seg[i] + t * v, seg[i + 1] + t * v); x.stroke(); }
  }
  // Graduations
  x.shadowBlur = 0; x.strokeStyle = rgba(C, 0.45); x.lineWidth = 1.5 * k;
  for (let i = 0; i < 48; i++) { const a = (i / 48) * Math.PI * 2 - t * 0.3; const r1 = 84 * k; const r2 = (i % 4 ? 88 : 94) * k; x.beginPath(); x.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); x.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2); x.stroke(); }
  // Cœur lumineux + enveloppe
  const pulse = 0.75 + 0.25 * Math.sin(t * 2.4);
  const cg = x.createRadialGradient(cx, cy, 0, cx, cy, 36 * k); cg.addColorStop(0, `rgba(255,255,255,${0.95 * pulse})`); cg.addColorStop(0.45, rgba(C, 0.55 * pulse)); cg.addColorStop(1, rgba(C, 0));
  x.fillStyle = cg; x.beginPath(); x.arc(cx, cy, 36 * k, 0, Math.PI * 2); x.fill();
  x.strokeStyle = '#03202B'; x.lineWidth = 3 * k; x.fillStyle = 'rgba(232,253,255,.95)';
  chemin(x, cx - 17 * k, cy - 12 * k, 34 * k, 24 * k, 3 * k); x.fill(); x.stroke();
  x.beginPath(); x.moveTo(cx - 15 * k, cy - 9 * k); x.lineTo(cx, cy + 2 * k); x.lineTo(cx + 15 * k, cy - 9 * k); x.stroke();
  // Titres
  x.textAlign = 'center';
  x.fillStyle = rgba(C, 0.9); x.font = `600 ${15 * k}px ${T}`;
  texteEspace(x, sousTitre.toUpperCase(), cx, 248 * k, 0.32, 15 * k);
  const tt = taillePour(x, titre.toUpperCase(), w - 90 * k, `700 {t}px ${T}`, Math.round(44 * k), 0.08);
  x.font = `700 ${tt}px ${T}`; x.fillStyle = '#F2FEFF'; x.shadowColor = C; x.shadowBlur = 16 * k;
  texteEspace(x, titre.toUpperCase(), cx, 288 * k, 0.08, tt); x.shadowBlur = 0;
  // Champs qui se remplissent tout seuls (démonstration)
  const champs = [['FIRST NAME', 'Alex', 40, 330, 206], ['LAST NAME', 'Morgan', 266, 330, 206], ['EMAIL', 'alex@mail.com', 40, 404, 432]];
  const cycle = 7.5; const u = (t % cycle) / cycle;
  champs.forEach(([lib, val, fx, fy, fw], i) => {
    const debut = 0.08 + i * 0.22; const p = Math.max(0, Math.min(1, (u - debut) / 0.17));
    const actif = (u >= debut && u < debut + 0.22) || (i === 2 && u >= debut);
    x.textAlign = 'left'; x.font = `600 ${12 * k}px ${T}`; x.fillStyle = rgba(C, 0.75);
    x.fillText(`0${i + 1} · ${lib}`, fx * k, fy * k);
    x.fillStyle = actif ? rgba(C, 0.16) : 'rgba(95,227,255,.06)';
    x.strokeStyle = actif ? rgba(C, 0.95) : rgba(C, 0.4); x.lineWidth = (actif ? 2.2 : 1.5) * k;
    if (actif) { x.shadowColor = C; x.shadowBlur = 10 * k; }
    chemin(x, fx * k, (fy + 12) * k, fw * k, 42 * k, 8 * k); x.fill(); x.stroke(); x.shadowBlur = 0;
    const txt = abonne ? '' : val.slice(0, Math.round(val.length * p));
    x.font = `500 ${19 * k}px ${T}`; x.fillStyle = '#E8FDFF';
    x.fillText(txt, (fx + 14) * k, (fy + 34) * k);
    if (actif && !abonne && Math.sin(t * 9) > 0) { const cxT = (fx + 15) * k + x.measureText(txt).width; x.fillRect(cxT, (fy + 22) * k, 2.4 * k, 22 * k); }
  });
  // Bouton qui pulse
  const by = 488 * k; const bw = 432 * k; const bh = 64 * k; const bx = (w - bw) / 2;
  const pb = 0.5 + 0.5 * Math.sin(t * 3.2);
  x.shadowColor = C; x.shadowBlur = (12 + 16 * pb) * k;
  const bg = x.createLinearGradient(bx, 0, bx + bw, 0); bg.addColorStop(0, rgba(C, 0.55 + 0.3 * pb)); bg.addColorStop(1, rgba('#9AF0FF', 0.55 + 0.3 * pb));
  x.fillStyle = bg; chemin(x, bx, by, bw, bh, bh / 2); x.fill(); x.shadowBlur = 0;
  // reflet qui traverse le bouton
  x.save(); chemin(x, bx, by, bw, bh, bh / 2); x.clip();
  const rx = bx - 120 * k + ((t * 0.45) % 1) * (bw + 240 * k);
  const rg = x.createLinearGradient(rx - 50 * k, 0, rx + 50 * k, 0); rg.addColorStop(0, 'rgba(255,255,255,0)'); rg.addColorStop(0.5, 'rgba(255,255,255,.55)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = rg; x.fillRect(rx - 50 * k, by, 100 * k, bh); x.restore();
  x.textAlign = 'center'; x.fillStyle = '#03202B';
  const lb = abonne ? 'YOU’RE ON THE LIST ✓' : `${bouton.toUpperCase()}  ›››`;
  const tb = taillePour(x, lb, bw - 40 * k, `700 {t}px ${T}`, Math.round(24 * k), 0.12);
  x.font = `700 ${tb}px ${T}`; texteEspace(x, lb, w / 2, by + bh / 2 + 1 * k, 0.12, tb);
  // Pied
  x.font = `500 ${12.5 * k}px ${T}`; x.fillStyle = rgba(C, 0.7);
  texteEspace(x, 'NEW CARDS · FLASH SALES · HOLIDAY OFFERS', w / 2, 584 * k, 0.12, 12.5 * k);
  x.fillStyle = rgba(C, 0.45);
  texteEspace(x, 'ONE-CLICK UNSUBSCRIBE', w / 2, 610 * k, 0.2, 11 * k);
  // Petites barres de données en bas
  for (let i = 0; i < 24; i++) { x.fillStyle = rgba(C, (i + Math.floor(t * 6)) % 7 === 0 ? 0.9 : 0.22); x.fillRect(w / 2 - 120 * k + i * 10 * k, 636 * k, 6 * k, 3 * k); }
  x.restore();
}

/* ---------- Hôtesse : badge de la boutique ---------- */
/** Badge de la boutique sur la veste (Black Friday). */
export function peindreBadgeHolo(txt, couleur = '#FFC94A') {
  const [c, x] = toile(220, 120);
  chemin(x, 6, 6, 208, 108, 18); x.fillStyle = rgba(couleur, 0.9); x.fill();
  x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = `800 62px ${POLICES.sans}`; x.fillStyle = '#1A1206'; x.fillText(txt, 110, 64);
  return c;
}
