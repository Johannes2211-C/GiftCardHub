// =====================================================================
//  Hôtesse holographique (comptoir + portes de chaque boutique)
//
//  Même femme dans les trois boutiques ; seules la couleur de l'hologramme, la coiffure,
//  la tenue et l'ambiance changent. Module PUR : il fabrique les maillages (positions,
//  normales, teintes, drapeaux, indices) par « os » et calcule l'animation.
//  La scène 3D les affiche avec le shader hologramme ; l'outil d'aperçu les dessine
//  en WebGL : la géométrie vérifiée est exactement celle du site.
//
//  Repère : pieds au sol en (0, 0, 0), tournée vers +Z, 1,70 m. Sa main droite est côté −X.
// =====================================================================

/* ---------- petites maths ---------- */
const sgnpow = (v, e) => Math.sign(v) * Math.pow(Math.abs(v), e);
function matRot(rx = 0, ry = 0, rz = 0) { // R = Rz · Ry · Rx (ordre XYZ de Three.js)
  const cx = Math.cos(rx), sx = Math.sin(rx), cy = Math.cos(ry), sy = Math.sin(ry), cz = Math.cos(rz), sz = Math.sin(rz);
  return [cy * cz, sx * sy * cz - cx * sz, cx * sy * cz + sx * sz,
    cy * sz, sx * sy * sz + cx * cz, cx * sy * sz - sx * cz,
    -sy, sx * cy, cx * cy];
}
const appliquer3 = (m, v) => [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]];
function matVers(dir) { // rotation qui amène +Y sur dir
  const l = Math.hypot(...dir); const d = dir.map((x) => x / l);
  const y = [0, 1, 0]; const c = d[1];
  if (c > 0.99999) return [1, 0, 0, 0, 1, 0, 0, 0, 1];
  if (c < -0.99999) return [1, 0, 0, 0, -1, 0, 0, 0, -1];
  const ax = [y[1] * d[2] - y[2] * d[1], y[2] * d[0] - y[0] * d[2], y[0] * d[1] - y[1] * d[0]];
  const s = Math.hypot(...ax); const k = ax.map((x) => x / s); const t = 1 - c;
  return [t * k[0] * k[0] + c, t * k[0] * k[1] - s * k[2], t * k[0] * k[2] + s * k[1],
    t * k[0] * k[1] + s * k[2], t * k[1] * k[1] + c, t * k[1] * k[2] - s * k[0],
    t * k[0] * k[2] - s * k[1], t * k[1] * k[2] + s * k[0], t * k[2] * k[2] + c];
}
const hex = (h) => { const n = parseInt(h.slice(1), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255].map((v) => Math.pow(v, 2.2)); };
const teinte = (h, k) => { const c = hex(h); return c.map((v) => Math.min(1, v * k)); };

/* ---------- accumulateur de maillage ---------- */
// Drapeaux par sommet : [netteté (visage : effet hologramme atténué), accent (0 / 0,5 = accent 2 / 1 = accent 1)]
let DRAP = [0, 0];
const avec = (net, acc, f) => { const a = DRAP; DRAP = [net, acc]; f(); DRAP = a; };
function maillage() { return { p: [], n: [], c: [], d: [], i: [] }; }
function grille(m, rows, cols, f, col, souder = true) {
  // f(u, v) -> [pos, nor] ; u ∈ [0,1] (anneaux), v ∈ [0,1] (tour). Normale nulle → calculée.
  const base = m.p.length / 3; const c = Array.isArray(col) ? col : hex(col);
  const P = [], N = [];
  for (let r = 0; r <= rows; r++) for (let k = 0; k <= cols; k++) { const [p, n] = f(r / rows, k / cols); P.push(p); N.push(n); }
  const auto = N[0] === null;
  if (auto) for (let i = 0; i < N.length; i++) N[i] = [0, 0, 0];
  const tris = [];
  let signe = 0;
  for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) {
    const a = r * (cols + 1) + k; const b = a + cols + 1;
    tris.push([a, a + 1, b], [b, a + 1, b + 1]);
  }
  // Sens des triangles : on veut que leur normale géométrique suive la normale fournie (vers l'extérieur)
  for (const [i0, i1, i2] of tris) {
    const A = P[i0], B = P[i1], C = P[i2];
    const u = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], v = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
    const g = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    if (auto) { for (const i of [i0, i1, i2]) { N[i][0] += g[0]; N[i][1] += g[1]; N[i][2] += g[2]; } }
    else { const n = N[i0]; signe += g[0] * n[0] + g[1] * n[1] + g[2] * n[2]; }
  }
  const inverser = auto ? false : signe < 0;
  if (auto) {
    // soudure des coutures (premier et dernier sommet de chaque anneau)
    if (souder) for (let r = 0; r <= rows; r++) { const a = r * (cols + 1), b = a + cols; const s0 = N[a].map((x, j) => x + N[b][j]); N[a] = s0; N[b] = s0.slice(); }
    for (let i = 0; i < N.length; i++) { const l = Math.hypot(...N[i]) || 1; N[i] = N[i].map((x) => x / l); }
  }
  for (let i = 0; i < P.length; i++) { m.p.push(...P[i]); m.n.push(...N[i]); m.c.push(...c); m.d.push(DRAP[0], DRAP[1]); }
  for (const [i0, i1, i2] of tris) { if (inverser) m.i.push(base + i0, base + i2, base + i1); else m.i.push(base + i0, base + i1, base + i2); }
}
/** Volume « loft » : anneaux superelliptiques empilés {y, rx, rz, cz, cx} (torse, tête…). Normales lissées. */
function loft(m, anneaux, col, { e = 2.2, seg = 22, sub = 3, arc = null } = {}) {
  // interpolation douce (Catmull-Rom) entre anneaux
  const A = anneaux.map((a) => ({ cx: 0, cz: 0, ...a }));
  const pts = [];
  for (let i = 0; i < A.length - 1; i++) for (let j = 0; j < sub; j++) {
    const t = j / sub; const p0 = A[Math.max(0, i - 1)], p1 = A[i], p2 = A[i + 1], p3 = A[Math.min(A.length - 1, i + 2)];
    const cr = (k) => 0.5 * ((2 * p1[k]) + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t * t + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t * t * t);
    pts.push({ y: cr('y'), rx: Math.max(0.0005, cr('rx')), rz: Math.max(0.0005, cr('rz')), cz: cr('cz'), cx: cr('cx') });
  }
  pts.push(A[A.length - 1]);
  const k = 2 / e;
  // les sommets interpolés deviennent les anneaux réels de la grille
  grille(m, pts.length - 1, seg, (u, v) => {
    const a = pts[Math.round(u * (pts.length - 1))]; const t = arc ? arc[0] + (arc[1] - arc[0]) * v : -Math.PI + 2 * Math.PI * v;
    return [[a.cx + a.rx * sgnpow(Math.sin(t), k), a.y, a.cz + a.rz * sgnpow(Math.cos(t), k)], null];
  }, col, !arc);
}
/** Superellipsoïde (e = 2 : ellipsoïde ; plus grand : « galet » / boîte arrondie). */
function sup(m, c, r, col, { e = 2, rot = [0, 0, 0], phi = [-Math.PI / 2, Math.PI / 2], seg = [12, 18] } = {}) {
  const R = matRot(...rot); const k = 2 / e; const kn = 2 - k;
  grille(m, seg[0], seg[1], (u, v) => {
    const f = phi[0] + (phi[1] - phi[0]) * u; const t = -Math.PI + 2 * Math.PI * v;
    const cf = Math.cos(f), sf = Math.sin(f), ct = Math.cos(t), st = Math.sin(t);
    const p = [r[0] * sgnpow(cf, k) * sgnpow(st, k), r[1] * sgnpow(sf, k), r[2] * sgnpow(cf, k) * sgnpow(ct, k)];
    let n = [sgnpow(cf, kn) * sgnpow(st, kn) / r[0], sgnpow(sf, kn) / r[1], sgnpow(cf, kn) * sgnpow(ct, kn) / r[2]];
    const l = Math.hypot(...n) || 1; n = n.map((x) => x / l);
    const q = appliquer3(R, p); return [[q[0] + c[0], q[1] + c[1], q[2] + c[2]], appliquer3(R, n)];
  }, col);
}
const ell = (m, c, r, col, o = {}) => sup(m, c, r, col, { e: 2, ...o });
/** Cône arrondi (deux sphères reliées tangentiellement) de a (rayon ra) à b (rayon rb). */
function cone(m, a, b, ra, rb, col, { seg = [12, 16], ecrase = 1 } = {}) {
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]; const h = Math.hypot(...d);
  const R = matVers(d); const al = Math.asin(Math.max(-1, Math.min(1, (ra - rb) / h)));
  const n1 = Math.ceil(seg[0] / 2), n2 = seg[0] - n1;
  grille(m, seg[0], seg[1], (u, v) => {
    const s = u * seg[0]; let f, rr, cy;
    if (s <= n1) { f = -Math.PI / 2 + (al + Math.PI / 2) * (s / n1); rr = ra; cy = 0; } else { f = al + (Math.PI / 2 - al) * ((s - n1) / n2); rr = rb; cy = h; }
    const t = 2 * Math.PI * v; const cf = Math.cos(f);
    const n = [cf * Math.sin(t), Math.sin(f), cf * Math.cos(t)];
    const p = [rr * n[0], cy + rr * n[1], rr * n[2] * ecrase];
    const q = appliquer3(R, p); return [[q[0] + a[0], q[1] + a[1], q[2] + a[2]], appliquer3(R, [n[0], n[1], n[2] / ecrase])];
  }, col);
}
function tore(m, c, R0, r, col, { rot = [0, 0, 0], seg = [10, 28], arc = 2 * Math.PI, ech = [1, 1] } = {}) {
  const M = matRot(...rot);
  grille(m, seg[0], seg[1], (u, v) => {
    const a = 2 * Math.PI * u; const b = arc * v;
    const n = [Math.cos(a) * Math.cos(b), Math.sin(a), Math.cos(a) * Math.sin(b)];
    const p = [(R0 + r * Math.cos(a)) * Math.cos(b) * ech[0], r * Math.sin(a), (R0 + r * Math.cos(a)) * Math.sin(b) * ech[1]];
    const q = appliquer3(M, p); return [[q[0] + c[0], q[1] + c[1], q[2] + c[2]], appliquer3(M, n)];
  }, col);
}

/* ---------- l'hôtesse : un seul visage (style 3D animé), trois tenues ---------- */
const PEAU = '#F6D5C3';
const CHEV = '#4B4E57';
const CHEV2 = '#6E727D';
const VARIANTES = {
  general: { coiffe: null, prop: 'hanche', lumiere: '#FFF3E0' },
  'black-friday': { coiffe: null, prop: 'sac', lumiere: '#FF5A3C' },
  christmas: { coiffe: 'bonnet', prop: 'cadeau', lumiere: '#FFD9A0' },
};
export const lumiereVariante = (v) => (VARIANTES[v] || VARIANTES.general).lumiere;

/**
 * Fabrique l'hôtesse (personnage 3D façon film d'animation).
 * @param {object} o  { variante : 'general' | 'black-friday' | 'christmas', pose : 'debout' | 'comptoir' }
 */
export function construireHotesse(o = {}) {
  const v = VARIANTES[o.variante] ? o.variante : 'general';
  const pose = o.pose || 'debout';
  const sh = 0.158; const hp = 0.088; const kH = 1.24; // tête agrandie (proportions d'animation)
  const M = {}; const os = [];
  const OS = (nom, parent, pivot) => { os.push({ nom, parent, pivot }); M[nom] = maillage(); return M[nom]; };
  const hy = 1.62; const COU = [0, 1.49, 0];
  const bassin = OS('bassin', null, [0, 0.95, 0]);
  const torse = OS('torse', 'bassin', [0, 1.04, 0]);
  const tete = OS('tete', 'torse', COU);
  const bras = { G: OS('brasG', 'torse', [sh, 1.415, 0]), D: OS('brasD', 'torse', [-sh, 1.415, 0]) };
  const avb = { G: OS('avbrasG', 'brasG', [sh + 0.016, 1.135, -0.012]), D: OS('avbrasD', 'brasD', [-sh - 0.016, 1.135, -0.012]) };
  const main = { G: OS('mainG', 'avbrasG', [sh + 0.024, 0.89, 0.016]), D: OS('mainD', 'avbrasD', [-sh - 0.024, 0.89, 0.016]) };
  const fonce = (h, k = 0.82) => teinte(h, k);
  const F = { hanche: 0.156, taille: 0.114, poitrine: 0.138, epaule: 0.156, prof: 0.092 };
  const T = v === 'general'
    ? { tee: '#C9CCD3', veste: '#A9ADB6', veste2: '#8E929C', bas: '#5B5F69', chaussures: '#F4F4F6', semelle: '#C9CCD3', jambes: PEAU }
    : v === 'black-friday'
      ? { tee: '#E3263A', veste: '#23242A', veste2: '#18191D', bas: '#26272D', chaussures: '#E3263A', semelle: '#F4F4F6', jambes: null }
      : { tee: '#D41F31', veste: '#D41F31', veste2: '#B0172A', bas: '#D41F31', chaussures: '#C81E2E', semelle: '#3A1A14', jambes: '#2C2A33' };
  const FOURRURE = '#FBF8F3';

  /* ---- Jambes ---- */
  for (const sx of [1, -1]) {
    const x = sx * hp;
    if (v === 'black-friday') { // jogging noir, bande rouge
      loft(bassin, [
        { y: 0.06, rx: 0.044, rz: 0.048, cx: x * 0.97, cz: -0.004 }, { y: 0.12, rx: 0.046, rz: 0.05, cx: x * 0.97 }, { y: 0.32, rx: 0.054, rz: 0.06, cx: x * 0.975, cz: -0.01 },
        { y: 0.5, rx: 0.056, rz: 0.058, cx: x * 0.985 }, { y: 0.65, rx: 0.066, rz: 0.07, cx: x }, { y: 0.8, rx: 0.076, rz: 0.078, cx: x * 1.02 }, { y: 0.9, rx: 0.082, rz: 0.08, cx: x * 1.04 },
      ], T.bas, { seg: 18, sub: 2 });
      avec(0, 0, () => loft(bassin, [{ y: 0.14, rx: 0.006, rz: 0.006, cx: x + sx * 0.046 }, { y: 0.5, rx: 0.006, rz: 0.006, cx: x + sx * 0.055 }, { y: 0.88, rx: 0.006, rz: 0.006, cx: x + sx * 0.084 }], '#E3263A', { seg: 6, sub: 3 }));
      loft(bassin, [{ y: 0.05, rx: 0.042, rz: 0.046, cx: x * 0.97, cz: -0.004 }, { y: 0.1, rx: 0.044, rz: 0.048, cx: x * 0.97, cz: -0.004 }], T.veste2, { seg: 14, sub: 1 });
    } else {
      const coul = v === 'christmas' ? T.jambes : T.jambes; const r = 0.86;
      loft(bassin, [
        { y: 0.07, rx: 0.033 * r, rz: 0.037 * r, cx: x * 0.97, cz: -0.006 }, { y: 0.13, rx: 0.034 * r, rz: 0.039 * r, cx: x * 0.97, cz: -0.004 },
        { y: 0.3, rx: 0.044 * r, rz: 0.05 * r, cx: x * 0.975, cz: -0.012 }, { y: 0.38, rx: 0.047 * r, rz: 0.053 * r, cx: x * 0.98, cz: -0.012 },
        { y: 0.5, rx: 0.045 * r, rz: 0.047 * r, cx: x * 0.985, cz: 0.004 }, { y: 0.62, rx: 0.057 * r, rz: 0.061 * r, cx: x, cz: 0.004 },
        { y: 0.78, rx: 0.069 * r, rz: 0.072 * r, cx: x * 1.02, cz: 0.002 }, { y: 0.9, rx: 0.08, rz: 0.078, cx: x * 1.04 },
      ], coul, { seg: 16, sub: 2 });
    }
    const fx = x * 0.97; const cz = 0.042;
    if (v === 'christmas') { // bottes rouges à revers de fourrure
      loft(bassin, [{ y: 0.02, rx: 0.042, rz: 0.046, cx: fx, cz: -0.006 }, { y: 0.2, rx: 0.043, rz: 0.049, cx: fx, cz: -0.01 }, { y: 0.34, rx: 0.049, rz: 0.055, cx: fx, cz: -0.012 }], T.chaussures, { seg: 14, sub: 2 });
      tore(bassin, [fx, 0.35, -0.012], 0.05, 0.016, FOURRURE, { seg: [8, 18], ech: [1, 1.1] });
      sup(bassin, [fx, 0.042, cz], [0.043, 0.04, 0.104], T.chaussures, { e: 2.5 });
      sup(bassin, [fx, 0.01, cz - 0.004], [0.045, 0.01, 0.108], T.semelle, { e: 3 });
    } else { // baskets
      sup(bassin, [fx, 0.045, cz], [0.045, 0.04, 0.108], T.chaussures, { e: 2.6 });
      sup(bassin, [fx, 0.013, cz + 0.002], [0.048, 0.013, 0.114], T.semelle, { e: 3.2 });
      sup(bassin, [fx + sx * 0.04, 0.05, cz + 0.012], [0.005, 0.014, 0.045], v === 'general' ? '#3BB8B4' : '#FFFFFF', { e: 3 });
      tore(bassin, [fx, 0.085, -0.01], 0.038, 0.008, v === 'general' ? '#E8E9ED' : T.chaussures, { seg: [6, 16] });
    }
  }

  /* ---- Tronc ---- */
  const anBas = [{ y: 0.8, rx: F.hanche * 0.8, rz: F.prof * 0.86 }, { y: 0.88, rx: F.hanche * 0.97, rz: F.prof * 1.02 }, { y: 0.95, rx: F.hanche, rz: F.prof * 1.06 }, { y: 1.02, rx: (F.hanche + F.taille) / 2, rz: F.prof }];
  const anHaut = [
    { y: 1.02, rx: (F.hanche + F.taille) / 2, rz: F.prof }, { y: 1.1, rx: F.taille, rz: F.prof * 0.93, cz: 0.004 },
    { y: 1.2, rx: (F.taille + F.poitrine) / 2, rz: F.prof * 0.98, cz: 0.007 }, { y: 1.3, rx: F.poitrine, rz: F.prof * 1.08, cz: 0.012 },
    { y: 1.375, rx: F.epaule * 0.97, rz: F.prof * 0.98, cz: 0.004 }, { y: 1.425, rx: F.epaule, rz: F.prof * 0.84, cz: -0.004 },
    { y: 1.455, rx: F.epaule * 0.7, rz: F.prof * 0.64, cz: -0.006 }, { y: 1.475, rx: 0.052, rz: 0.048, cz: -0.004 },
  ];
  const zf = (y) => { const a = anHaut; let i = 0; while (i < a.length - 2 && a[i + 1].y < y) i++; const t = Math.max(0, Math.min(1, (y - a[i].y) / (a[i + 1].y - a[i].y))); return a[i].rz + (a[i + 1].rz - a[i].rz) * t + (a[i].cz || 0) + ((a[i + 1].cz || 0) - (a[i].cz || 0)) * t; };
  const elargi = (an, k, dz = 0) => an.map((a) => ({ ...a, rx: a.rx * k + 0.004, rz: a.rz * k + 0.004, cz: (a.cz || 0) + dz }));
  loft(bassin, anBas, v === 'general' ? T.bas : v === 'black-friday' ? T.bas : T.bas, { seg: 26 });
  loft(torse, anHaut, T.tee, { seg: 26 });
  for (const sx of [1, -1]) ell(torse, [sx * (sh - 0.014), 1.398, -0.002], [0.04, 0.046, 0.046], v === 'christmas' ? T.veste : T.veste);
  if (v === 'general') {
    // short gris foncé à revers
    for (const sx of [1, -1]) {
      loft(bassin, [{ y: 0.75, rx: 0.085, rz: 0.083, cx: sx * hp * 1.06 }, { y: 0.84, rx: 0.088, rz: 0.086, cx: sx * hp * 1.04 }, { y: 0.92, rx: 0.088, rz: 0.084, cx: sx * hp * 1.0 }], T.bas, { seg: 18, sub: 2 });
      tore(bassin, [sx * hp * 1.06, 0.752, 0], 0.08, 0.01, fonce(T.bas, 0.85), { seg: [6, 20], ech: [1.06, 1.04] });
    }
    loft(bassin, [{ y: 1.0, rx: F.taille * 1.15, rz: F.prof * 1.02 }, { y: 1.04, rx: F.taille * 1.1, rz: F.prof * 0.98 }], fonce(T.bas, 0.85), { seg: 24, sub: 1 }); // ceinture du short
    ell(bassin, [0, 1.02, zf(1.02) + 0.006], [0.007, 0.007, 0.004], '#D8DADF', { seg: [6, 8] });
  } else if (v === 'black-friday') {
    loft(bassin, [{ y: 1.0, rx: F.taille * 1.16, rz: F.prof * 1.03 }, { y: 1.045, rx: F.taille * 1.12, rz: F.prof * 0.99 }], '#E3263A', { seg: 24, sub: 1 });
  } else {
    // robe de Noël : jupe évasée, ourlet de fourrure, ceinture noire à boucle dorée, petite cape
    loft(torse, [{ y: 0.6, rx: 0.205, rz: 0.165 }, { y: 0.72, rx: 0.19, rz: 0.15 }, { y: 0.88, rx: F.hanche * 1.12, rz: F.prof * 1.25 }, { y: 0.98, rx: F.hanche * 1.03, rz: F.prof * 1.1 }, { y: 1.06, rx: F.taille * 1.04, rz: F.prof * 0.96, cz: 0.004 }], T.veste, { seg: 30, sub: 2 });
    loft(torse, [{ y: 0.565, rx: 0.212, rz: 0.17 }, { y: 0.6, rx: 0.218, rz: 0.176 }, { y: 0.635, rx: 0.207, rz: 0.167 }], FOURRURE, { seg: 30, sub: 2 });
    loft(torse, [{ y: 1.03, rx: F.taille * 1.1, rz: F.prof * 1.0, cz: 0.004 }, { y: 1.07, rx: F.taille * 1.07, rz: F.prof * 0.97, cz: 0.004 }], '#1C1C22', { seg: 24, sub: 1 });
    sup(torse, [0, 1.05, zf(1.05) + 0.006], [0.02, 0.016, 0.005], '#E8B84A', { e: 4 });
    sup(torse, [0, 1.05, zf(1.05) + 0.009], [0.011, 0.008, 0.004], '#1C1C22', { e: 4 });
    for (const y of [1.15, 1.23, 1.31]) ell(torse, [0, y, zf(y) + 0.004], [0.009, 0.009, 0.007], FOURRURE, { seg: [6, 8] });
    loft(torse, [{ y: 1.32, rx: 0.2, rz: 0.13, cz: 0.006 }, { y: 1.38, rx: 0.19, rz: 0.12, cz: 0.004 }, { y: 1.44, rx: 0.15, rz: 0.098 }, { y: 1.47, rx: 0.08, rz: 0.065 }], T.veste, { seg: 28, sub: 2 }); // cape
    loft(torse, [{ y: 1.3, rx: 0.205, rz: 0.136, cz: 0.006 }, { y: 1.33, rx: 0.208, rz: 0.139, cz: 0.006 }], FOURRURE, { seg: 28, sub: 1 });
    tore(torse, [0, 1.47, 0.0], 0.062, 0.02, FOURRURE, { rot: [0.24, 0, 0] }); // col
  }
  if (v !== 'christmas') {
    // veste ouverte devant (sweat zippé gris / bomber noir), capuche, cordons, rayures
    const an = elargi(anHaut.slice(0, 7), 1.06, 0.002);
    an.unshift({ y: 0.97, rx: F.hanche * 1.06, rz: F.prof * 1.1 });
    loft(torse, an, T.veste, { seg: 30, sub: 2, arc: [0.42, 2 * Math.PI - 0.42] });
    loft(torse, [{ y: 0.95, rx: F.hanche * 1.1, rz: F.prof * 1.14 }, { y: 0.985, rx: F.hanche * 1.08, rz: F.prof * 1.12 }], v === 'general' ? T.veste2 : '#18191D', { seg: 30, sub: 1, arc: [0.42, 2 * Math.PI - 0.42] }); // bord-côte
    for (const sx of [1, -1]) { // bords du zip
      const a = 0.42 * sx; const pts = an.map((r) => [r.cx || 0, r.y, 0]).map((p, i) => [Math.sin(a) * an[i].rx * sx * sx, an[i].y, (an[i].cz || 0) + Math.cos(a) * an[i].rz]);
      for (let i = 0; i < pts.length - 2; i++) cone(torse, [pts[i][0], pts[i][1], pts[i][2]], [pts[i + 1][0], pts[i + 1][1], pts[i + 1][2]], 0.006, 0.006, v === 'general' ? '#3A3D45' : '#FF5A1F', { seg: [4, 8] });
    }
    if (v === 'general') {
      tore(torse, [0, 1.44, -0.055], 0.085, 0.034, T.veste, { rot: [0.9, 0, 0], ech: [1, 0.85] }); // capuche
      for (const sx of [1, -1]) cone(torse, [sx * 0.04, 1.43, zf(1.43) + 0.01], [sx * 0.046, 1.26, zf(1.26) + 0.018], 0.004, 0.004, '#F2B7C2', { seg: [4, 6] }); // cordons roses
      sup(torse, [0.085, 1.33, zf(1.33) + 0.016], [0.028, 0.016, 0.004], '#2A2C33', { e: 4, rot: [0, 0.45, 0] }); // écusson
      sup(torse, [0.085, 1.33, zf(1.33) + 0.019], [0.02, 0.006, 0.003], '#E3263A', { e: 4, rot: [0, 0.45, 0] });
      tore(torse, [0, 1.462, 0.002], 0.054, 0.01, '#3A3D45', { rot: [0.24, 0, 0] }); // col du t-shirt
    } else {
      tore(torse, [0, 1.465, -0.004], 0.062, 0.016, '#18191D', { rot: [0.24, 0, 0] }); // col bord-côte
      tore(torse, [0, 1.462, 0.004], 0.054, 0.008, '#18191D', { rot: [0.24, 0, 0] });
    }
  }
  cone(torse, [0, 1.44, -0.008], [0, 1.52, 0.0], 0.037, 0.034, PEAU);

  /* ---- Bras ---- */
  for (const [c, sx] of [['G', 1], ['D', -1]]) {
    const ep = [sx * sh, 1.415, 0]; const co = [sx * (sh + 0.016), 1.135, -0.012]; const po = [sx * (sh + 0.024), 0.89, 0.016];
    const ra = v === 'christmas' ? 0.038 : 0.046; const manche = T.veste;
    loft(bras[c], [{ y: co[1] - 0.01, rx: ra * 0.8, rz: ra * 0.8, cx: co[0], cz: co[2] }, { y: (ep[1] + co[1]) / 2, rx: ra * 0.94, rz: ra * 0.96, cx: (ep[0] + co[0]) / 2, cz: -0.006 }, { y: ep[1] - 0.02, rx: ra, rz: ra * 1.05, cx: ep[0], cz: 0 }, { y: ep[1] + 0.02, rx: ra * 0.7, rz: ra * 0.8, cx: ep[0] * 0.97, cz: 0 }], manche, { seg: 14, sub: 2 });
    loft(avb[c], [{ y: po[1] + 0.03, rx: ra * 0.66, rz: ra * 0.7, cx: po[0], cz: po[2] }, { y: po[1] + 0.12, rx: ra * 0.82, rz: ra * 0.86, cx: (po[0] * 2 + co[0]) / 3, cz: (po[2] * 2 + co[2]) / 3 }, { y: co[1] - 0.04, rx: ra * 0.84, rz: ra * 0.86, cx: co[0], cz: co[2] }, { y: co[1] + 0.012, rx: ra * 0.78, rz: ra * 0.78, cx: co[0], cz: co[2] }], manche, { seg: 14, sub: 2 });
    if (v === 'christmas') {
      loft(avb[c], [{ y: po[1] + 0.01, rx: 0.034, rz: 0.036, cx: po[0], cz: po[2] }, { y: po[1] + 0.045, rx: 0.036, rz: 0.038, cx: po[0], cz: po[2] }], FOURRURE, { seg: 14, sub: 1 });
    } else {
      // rayures sur les manches (noir / blanc / rouge comme la référence ; orange et rouge pour Black Friday)
      const raies = v === 'general' ? ['#24252B', '#F4F4F6', '#E3263A', '#F4F4F6', '#24252B'] : ['#FF5A1F', '#18191D', '#E3263A'];
      raies.forEach((col, k) => { const y = 1.27 - k * 0.012; loft(bras[c], [{ y: y - 0.006, rx: ra * 0.975, rz: ra * 1.0, cx: sx * (sh + 0.009), cz: -0.007 }, { y: y + 0.006, rx: ra * 0.98, rz: ra * 1.005, cx: sx * (sh + 0.009), cz: -0.007 }], col, { seg: 14, sub: 1 }); });
      // poignets côtelés rayés
      loft(avb[c], [{ y: po[1] + 0.0, rx: 0.031, rz: 0.033, cx: po[0], cz: po[2] }, { y: po[1] + 0.04, rx: 0.033, rz: 0.035, cx: po[0], cz: po[2] }], v === 'general' ? '#24252B' : '#18191D', { seg: 14, sub: 1 });
      loft(avb[c], [{ y: po[1] + 0.016, rx: 0.0335, rz: 0.0355, cx: po[0], cz: po[2] }, { y: po[1] + 0.024, rx: 0.0335, rz: 0.0355, cx: po[0], cz: po[2] }], v === 'general' ? '#F4F4F6' : '#FF5A1F', { seg: 14, sub: 1 });
    }
    // main : paume, 4 doigts, pouce
    const mx = po[0]; const my = po[1] - 0.008; const mz = po[2] + 0.004;
    sup(main[c], [mx, my - 0.034, mz], [0.014, 0.032, 0.027], PEAU, { e: 2.6, rot: [0.05, 0, sx * 0.03] });
    for (let k = 0; k < 4; k++) {
      const fz = mz + 0.019 - k * 0.012; const lg = [0.04, 0.045, 0.042, 0.034][k];
      const a = [mx, my - 0.062, fz]; const b = [mx + sx * 0.002, my - 0.062 - lg * 0.55, fz + 0.002]; const e = [mx + sx * 0.004, my - 0.062 - lg, fz + 0.005];
      cone(main[c], a, b, 0.0056, 0.005, PEAU, { seg: [4, 8] }); cone(main[c], b, e, 0.005, 0.0042, PEAU, { seg: [4, 8] });
    }
    cone(main[c], [mx - sx * 0.006, my - 0.018, mz + 0.023], [mx - sx * 0.01, my - 0.043, mz + 0.034], 0.007, 0.0058, PEAU, { seg: [4, 8] });
    cone(main[c], [mx - sx * 0.01, my - 0.043, mz + 0.034], [mx - sx * 0.011, my - 0.062, mz + 0.038], 0.0058, 0.0046, PEAU, { seg: [4, 8] });
  }
  /* ---- Accessoires (main gauche, pose « debout ») ---- */
  const VP = VARIANTES[v];
  if (pose !== 'comptoir') {
    const mG = main.G; const hx = sh + 0.024; const hY = 0.82;
    if (VP.prop === 'sac') { // sac shopping noir, poignées orange, étiquette %
      sup(mG, [hx + 0.012, hY - 0.2, 0.02], [0.034, 0.13, 0.11], '#16171B', { e: 6, seg: [8, 16] });
      for (const dz of [-0.035, 0.035]) tore(mG, [hx + 0.012, hY - 0.07, 0.02 + dz], 0.045, 0.005, '#FF5A1F', { rot: [Math.PI / 2, 0, 0], arc: Math.PI, seg: [4, 12] });
      sup(mG, [hx + 0.047, hY - 0.19, 0.02], [0.002, 0.04, 0.04], '#FF5A1F', { e: 4 }); sup(mG, [hx + 0.0495, hY - 0.19, 0.02], [0.001, 0.016, 0.016], '#16171B', { e: 2 });
    } else if (VP.prop === 'cadeau') { // boîte cadeau turquoise, ruban rouge
      const c0 = [hx + 0.012, hY - 0.03, 0.03];
      sup(mG, c0, [0.05, 0.05, 0.05], '#2EC4C8', { e: 8, seg: [10, 16] });
      sup(mG, c0, [0.0515, 0.012, 0.0515], '#E3263A', { e: 8, seg: [6, 16] });
      sup(mG, c0, [0.012, 0.0515, 0.0515], '#E3263A', { e: 8, seg: [6, 16] });
      for (const sz of [-1, 1]) tore(mG, [c0[0], c0[1] + 0.06, c0[2] + sz * 0.014], 0.014, 0.005, '#E3263A', { rot: [Math.PI / 2, 0, 0], seg: [6, 14] });
    }
  }

  /* ---- Tête (style animation : visage doux, grands yeux) ---- */
  const anT = [
    { y: hy - 0.1, rx: 0.016, rz: 0.02, cz: 0.032 }, { y: hy - 0.088, rx: 0.034, rz: 0.038, cz: 0.027 },
    { y: hy - 0.062, rx: 0.055, rz: 0.064, cz: 0.014 }, { y: hy - 0.028, rx: 0.067, rz: 0.08, cz: 0.007 },
    { y: hy + 0.012, rx: 0.073, rz: 0.088, cz: 0.002 }, { y: hy + 0.056, rx: 0.076, rz: 0.091, cz: -0.002 },
    { y: hy + 0.096, rx: 0.068, rz: 0.081, cz: -0.006 }, { y: hy + 0.12, rx: 0.042, rz: 0.052, cz: -0.008 }, { y: hy + 0.13, rx: 0.003, rz: 0.003, cz: -0.008 },
  ];
  loft(tete, anT, PEAU, { seg: 28, e: 2.05, sub: 3 });
  const anneau = (y) => { let i = 0; while (i < anT.length - 2 && anT[i + 1].y < y) i++; const t = Math.max(0, Math.min(1, (y - anT[i].y) / (anT[i + 1].y - anT[i].y))); const L = (k) => anT[i][k] + (anT[i + 1][k] - anT[i][k]) * t; return { rx: L('rx'), rz: L('rz'), cz: L('cz') }; };
  const surf = (x, y) => { const a = anneau(y); return a.cz + a.rz * Math.sqrt(Math.max(0, 1 - (x / a.rx) ** 2)); };
  const yeY = hy + 0.002; const ex = 0.031; const er = 0.0168; const ez = surf(ex, yeY) - er * 0.74;
  // oreilles, nez, joues roses
  for (const sx of [1, -1]) ell(tete, [sx * 0.071, hy + 0.0, -0.02], [0.009, 0.019, 0.013], PEAU, { seg: [8, 10] });
  ell(tete, [0, hy - 0.03, surf(0, hy - 0.03) + 0.0022], [0.0062, 0.0048, 0.0058], PEAU, { seg: [8, 10] });
  for (const sx of [1, -1]) {
    const bx = sx * 0.047, byy = hy - 0.034;
    ell(tete, [bx, byy, surf(Math.abs(bx), byy) - 0.0012], [0.0145, 0.0085, 0.004], '#F5A9A4', { rot: [0, sx * 0.55, 0], seg: [6, 12] });
  }
  // sourcils fins (un peu cachés par la frange)
  avec(0, 0, () => { for (const sx of [1, -1]) {
    const by = yeY + 0.03; const b1 = [sx * 0.013, by + 0.001], b2 = [sx * 0.031, by + 0.0045], b3 = [sx * 0.048, by + 0.0];
    cone(tete, [b1[0], b1[1], surf(b1[0], b1[1]) + 0.0006], [b2[0], b2[1], surf(b2[0], b2[1]) + 0.0006], 0.0017, 0.0021, fonce(CHEV, 0.8), { seg: [4, 8] });
    cone(tete, [b2[0], b2[1], surf(b2[0], b2[1]) + 0.0006], [b3[0], b3[1], surf(b3[0], b3[1]) + 0.0004], 0.0021, 0.0011, fonce(CHEV, 0.8), { seg: [4, 8] });
  } });
  // yeux : globe, iris brun (deux tons), pupille, deux reflets ; cils épais avec petite virgule
  const oeil = { G: OS('oeilG', 'tete', [ex, yeY, ez]), D: OS('oeilD', 'tete', [-ex, yeY, ez]) };
  const paup = { G: OS('paupG', 'tete', [ex, yeY, ez]), D: OS('paupD', 'tete', [-ex, yeY, ez]) };
  for (const [c, sx] of [['G', 1], ['D', -1]]) {
    avec(1, 0, () => {
      ell(oeil[c], [sx * ex, yeY, ez], [er * 0.96, er * 0.86, er], '#FBFAF8', { seg: [12, 16] });
      ell(oeil[c], [sx * ex, yeY - 0.0008, ez + er * 0.86], [0.0108, 0.0112, 0.0034], '#4A2716', { seg: [10, 16] });
      ell(oeil[c], [sx * ex, yeY - 0.0016, ez + er * 0.9], [0.0084, 0.0088, 0.0032], '#8A4E2C', { seg: [10, 16] });
      ell(oeil[c], [sx * ex, yeY - 0.0008, ez + er * 0.95], [0.0046, 0.0048, 0.0022], '#140A06', { seg: [8, 12] });
      ell(oeil[c], [sx * ex + 0.0034, yeY + 0.0036, ez + er * 1.0], [0.0026, 0.0026, 0.0014], '#FFFFFF', { seg: [6, 8] });
      ell(oeil[c], [sx * ex - 0.003, yeY - 0.0042, ez + er * 0.98], [0.0012, 0.0012, 0.0008], '#FFFFFF', { seg: [4, 6] });
    });
    sup(paup[c], [sx * ex, yeY, ez], [er * 1.06, er * 0.97, er * 1.07], PEAU, { phi: [0, Math.PI / 2], seg: [6, 16] });
    // trait de cils supérieur épais + virgule extérieure, cils inférieurs fins
    const P3 = (dx, dy, k = 1.0) => { const xx = sx * (ex + dx); return [xx, yeY + dy, ez + Math.sqrt(Math.max(0, (er * 1.05) ** 2 - dx * dx - (dy * 0.9) ** 2)) * k + 0.0008]; };
    const ptsC = [P3(-0.016, 0.004), P3(-0.008, 0.0118), P3(0.002, 0.0145), P3(0.011, 0.0118), P3(0.0165, 0.006)];
    for (let i = 0; i < ptsC.length - 1; i++) cone(paup[c], ptsC[i], ptsC[i + 1], 0.0017 + i * 0.0004, 0.0021 + i * 0.0004, '#1A1110', { seg: [4, 8] });
    cone(paup[c], ptsC[4], [sx * (ex + 0.0215), yeY + 0.0105, ptsC[4][2] - 0.004], 0.0028, 0.0008, '#1A1110', { seg: [4, 8] });
    cone(tete, P3(-0.012, -0.0108, 0.96), P3(0.012, -0.0112, 0.96), 0.0007, 0.0009, fonce(PEAU, 0.7), { seg: [4, 6] });
  }
  // bouche : petit sourire rosé
  const bY = hy - 0.058;
  const bouche = OS('bouche', 'tete', [0, bY, surf(0, bY)]);
  avec(0.5, 0, () => {
    ell(bouche, [0, bY + 0.0026, surf(0, bY + 0.0026) - 0.0018], [0.0118, 0.0028, 0.0036], '#D9707A', { seg: [6, 12] });
    ell(bouche, [0, bY - 0.0032, surf(0, bY - 0.0032) - 0.0016], [0.0102, 0.004, 0.004], '#E58189', { seg: [6, 12] });
    for (const sx of [1, -1]) ell(bouche, [sx * 0.0122, bY + 0.0018, surf(0.0122, bY) - 0.0022], [0.0024, 0.0016, 0.002], '#C9626C', { seg: [4, 6] });
  });

  /* ---- Cheveux : carré gris foncé, frange balayée sur le côté ---- */
  avec(0.3, 0.1, () => {
    sup(tete, [0, hy + 0.044, -0.012], [0.083, 0.106, 0.104], CHEV, { e: 2.2, rot: [-0.5, 0, 0], phi: [-0.16, Math.PI / 2], seg: [14, 28] });
    // volume du carré (ouvert devant le visage)
    loft(tete, [
      { y: hy - 0.16, rx: 0.098, rz: 0.088, cz: -0.025 }, { y: hy - 0.14, rx: 0.104, rz: 0.094, cz: -0.022 }, { y: hy - 0.09, rx: 0.098, rz: 0.098, cz: -0.018 },
      { y: hy - 0.03, rx: 0.09, rz: 0.102, cz: -0.014 }, { y: hy + 0.03, rx: 0.088, rz: 0.104, cz: -0.012 }, { y: hy + 0.08, rx: 0.08, rz: 0.096, cz: -0.012 }, { y: hy + 0.115, rx: 0.05, rz: 0.06, cz: -0.012 },
    ], CHEV, { seg: 30, sub: 2, arc: [0.78, 2 * Math.PI - 0.78] });
    // pointes qui rebiquent légèrement
    loft(tete, [{ y: hy - 0.172, rx: 0.094, rz: 0.084, cz: -0.026 }, { y: hy - 0.158, rx: 0.103, rz: 0.092, cz: -0.025 }], CHEV2, { seg: 30, sub: 1, arc: [0.78, 2 * Math.PI - 0.78] });
    // mèches devant les oreilles qui encadrent le visage
    for (const sx of [1, -1]) {
      cone(tete, [sx * 0.064, hy + 0.07, 0.04], [sx * 0.078, hy - 0.04, 0.034], 0.02, 0.018, CHEV, { ecrase: 0.45, seg: [6, 12] });
      cone(tete, [sx * 0.078, hy - 0.04, 0.034], [sx * 0.086, hy - 0.15, 0.018], 0.018, 0.008, CHEV2, { ecrase: 0.45, seg: [6, 12] });
    }
    // frange balayée : une nappe sur le front (raie à sa droite) + pointes plus longues vers sa gauche
    const anF = [];
    for (let k = 0; k <= 5; k++) {
      const u = k / 5; const y = hy + 0.122 - u * 0.082; const a = anneau(y);
      anF.push({ y, rx: a.rx + 0.006, rz: a.rz + 0.007, cz: a.cz, cx: u * 0.008 });
    }
    loft(tete, anF.reverse(), CHEV, { seg: 22, sub: 2, arc: [-1.25, 1.25] });
    const pointes = [[-0.058, 0.012], [-0.04, 0.016], [-0.022, 0.022], [-0.004, 0.028], [0.014, 0.034], [0.032, 0.04], [0.05, 0.046], [0.064, 0.05]];
    for (const [x0, lg] of pointes) {
      const y0 = hy + 0.045; const a = [x0, y0, surf(Math.min(Math.abs(x0), 0.072), y0) + 0.006]; const xe = x0 + lg * 0.45; const ye = y0 - lg;
      cone(tete, a, [xe, ye, surf(Math.min(Math.abs(xe), 0.074), ye) + 0.005], 0.0135, 0.0035, CHEV, { ecrase: 0.32, seg: [6, 10] });
    }
  });
  if (VP.coiffe === 'bonnet') { // bonnet de Père Noël, revers de fourrure, nœud vert et étoile dorée
    tore(tete, [0, hy + 0.088, -0.012], 0.088, 0.02, FOURRURE, { rot: [-0.32, 0, 0], seg: [8, 28] });
    cone(tete, [0, hy + 0.1, -0.02], [0.03, hy + 0.2, -0.08], 0.088, 0.05, '#D41F31', { seg: [10, 20] });
    cone(tete, [0.03, hy + 0.2, -0.08], [0.1, hy + 0.17, -0.16], 0.05, 0.016, '#D41F31', { seg: [8, 16] });
    ell(tete, [0.112, hy + 0.155, -0.172], [0.028, 0.028, 0.028], FOURRURE);
    for (const sz of [-1, 1]) sup(tete, [0.072, hy + 0.11, 0.028 + sz * 0.016], [0.006, 0.014, 0.018], '#1F8A4C', { rot: [sz * 0.5, 0, 0] });
    sup(tete, [0.078, hy + 0.11, 0.028], [0.006, 0.009, 0.009], '#E8B84A', { e: 2 });
  }

  // agrandit la tête autour du cou (proportions « animation »)
  const osTete = new Set(['tete', 'oeilG', 'oeilD', 'paupG', 'paupD', 'bouche']);
  for (const b of os) if (osTete.has(b.nom) && b.nom !== 'tete') b.pivot = b.pivot.map((x, i) => COU[i] + (x - COU[i]) * kH);
  const BAISSE = -0.022; // raccourcit le cou
  for (const b of os) if (osTete.has(b.nom) && b.nom !== 'tete') b.pivot[1] += BAISSE;
  for (const [nom, m] of Object.entries(M)) if (osTete.has(nom)) for (let i = 0; i < m.p.length; i++) m.p[i] = COU[i % 3] + (m.p[i] - COU[i % 3]) * kH + (i % 3 === 1 ? BAISSE : 0);
  // échelle globale : 1,68 m
  const hautTete = COU[1] + (hy + 0.2 - COU[1]) * kH;
  const s = 1.68 / (COU[1] + (hy + 0.13 - COU[1]) * kH + BAISSE);
  const maillages = {};
  for (const b of os) b.pivot = b.pivot.map((x) => x * s);
  for (const [nom, m] of Object.entries(M)) {
    const positions = new Float32Array(m.p.map((x) => x * s));
    maillages[nom] = { positions, normales: new Float32Array(m.n), couleurs: new Float32Array(m.c), drapeaux: new Float32Array(m.d), indices: (positions.length / 3 > 65535 ? Uint32Array : Uint16Array).from(m.i) };
  }
  return { os, maillages, taille: 1.68 + 0 * hautTete, variante: v, pose, prop: pose === 'comptoir' ? null : VP.prop, queue: false, badge: v === 'black-friday' ? [-0.085 * s, 1.33 * s, (zf(1.33) + 0.02) * s] : null };
}

/* ---------- animation ---------- */
const doux = (x) => { const s = Math.max(0, Math.min(1, x)); return s * s * (3 - 2 * s); };
const borne = (x, a) => Math.max(-a, Math.min(a, x));

/** Rotations (et échelles) de chaque os à l'instant t.
 *  etat : { regard, regardYeux, salut, presente, cligne, sourire, phase } (voir avancer()) */
export function animer(perso, t, etat = {}) {
  const ph = etat.phase || 0; const r = {};
  // plusieurs sinus de périodes non multiples : la boucle ne se répète jamais exactement
  const resp = Math.sin(t * 1.45 + ph) * 0.8 + Math.sin(t * 0.61 + ph * 1.3) * 0.2;
  const poids = Math.sin(t * 0.33 + ph * 1.7) * 0.75 + Math.sin(t * 0.17 + ph) * 0.25;
  const micro = (a, b) => Math.sin(t * a + ph * b) * 0.6 + Math.sin(t * a * 2.37 + ph) * 0.4;
  const e = doux(etat.salut || 0); const p = doux(etat.presente || 0);
  r.bassin = [0, Math.sin(t * 0.21 + ph) * 0.015, poids * 0.011];
  r.torse = [resp * 0.01, poids * 0.02 + micro(0.23, 1) * 0.02, -poids * 0.02, 1 + resp * 0.004, 1 + resp * 0.003, 1 + resp * 0.012];
  const regard = borne(etat.regard || 0, 0.52);
  r.tete = [-0.03 + micro(0.53, 2) * 0.025 + e * 0.04, regard + micro(0.19, 1) * 0.05 - p * 0.38, micro(0.41, 3) * 0.025 - poids * 0.012 + e * 0.05];
  const yeux = borne(etat.regardYeux || 0, 0.32);
  r.oeilG = [0, yeux - p * 0.2, 0]; r.oeilD = [0, yeux - p * 0.2, 0];
  const lid = -1.0 + 2.4 * Math.max(0, Math.min(1, etat.cligne || 0));
  r.paupG = [lid, 0, 0]; r.paupD = [lid, 0, 0];
  const so = doux(etat.sourire || 0);
  r.bouche = [0, 0, 0, 1 + so * 0.1, 1 + so * 0.08, 1];
  if (perso.queue) r.queue = [Math.sin(t * 1.3 + ph) * 0.05 - micro(0.53, 2) * 0.12, 0, Math.sin(t * 0.9 + ph) * 0.07 + poids * 0.05];
  const epaule = resp * 0.012;
  if (perso.pose === 'comptoir') {
    const k = micro(0.8, 1) * 0.025;
    r.brasG = [-0.42 + epaule, -0.12, 0.06]; r.avbrasG = [-1.05 + k, -0.42, 0]; r.mainG = [0.1, 0, 0];
    r.brasD = [-0.42 + epaule, 0.12, -0.06]; r.avbrasD = [-1.05 - k, 0.42, 0]; r.mainD = [0.1, 0, 0];
  } else {
    const sw = resp * 0.018;
    r.brasD = [sw + 0.02, 0, -0.075 + sw - epaule]; r.avbrasD = [-0.16, 0, 0]; r.mainD = [0, -0.15, 0];
    if (perso.prop === 'hanche') { r.brasG = [0.12, 0.3, 0.62 + epaule]; r.avbrasG = [-0.35, 0.2, -1.75]; r.mainG = [0, 0.3, -0.35]; }
    else if (perso.prop === 'cadeau') { r.brasG = [-0.3 + sw, -0.12, 0.06 + epaule]; r.avbrasG = [-1.25, -0.55, 0.05]; r.mainG = [0, -0.4, 0]; }
    else { r.brasG = [sw + 0.03, 0, 0.11 - sw + epaule]; r.avbrasG = [-0.1, 0, 0]; r.mainG = [0, 0.1, 0]; }
  }
  if (e > 0) { // salut de la main droite
    const b = r.brasD; const a = r.avbrasD;
    r.brasD = [b[0] * (1 - e) - 0.4 * e, b[1] * (1 - e) + 0.2 * e, b[2] * (1 - e) - 1.8 * e];
    r.avbrasD = [a[0] * (1 - e) - 0.25 * e, a[1] * (1 - e), -1.15 * e + Math.sin(t * 7.5) * 0.3 * e];
    r.mainD = [0, -0.15 * (1 - e) - 1.2 * e, Math.sin(t * 7.5 + 0.6) * 0.12 * e];
  }
  if (p > 0) { // présente le produit (main droite, paume vers le haut)
    const b = r.brasD; const a = r.avbrasD;
    r.brasD = [b[0] * (1 - p) - 0.62 * p, b[1] * (1 - p) + 0.35 * p, b[2] * (1 - p) - 0.42 * p];
    r.avbrasD = [a[0] * (1 - p) - 0.55 * p, a[1] * (1 - p) + 0.25 * p, -0.1 * p];
    r.mainD = [0.25 * p, -1.3 * p, 0.2 * p];
  }
  return r;
}

/** Comportement : clignements irréguliers, regard, salut, présentation, scintillement.
 *  ctx : { vers (angle du visiteur dans le repère du perso), dist, face (le visiteur la regarde), role } */
export function creerEtat(graine = 1) {
  let g = graine * 9301 + 49297;
  const alea = () => { g = (g * 9301 + 49297) % 233280; return g / 233280; };
  return { alea, phase: alea() * 6.28, cligne: 0, finCligne: 0, prochainClignement: 1 + alea() * 3, double: false,
    regard: 0, regardYeux: 0, salut: 0, salutFin: 0, prochainSalut: 2, presente: 0, presenteFin: 0, prochainePresentation: 6 + alea() * 4,
    sourire: 0.55, flicker: 1, finFlicker: 0, prochainFlicker: 5 + alea() * 3, vu: false };
}
export function avancer(e, dt, t, ctx) {
  const k = (v) => Math.min(1, dt * v);
  // clignement (3 à 5 s, jamais régulier, parfois double)
  if (t >= e.prochainClignement) { e.finCligne = t + 0.17; e.prochainClignement = t + (e.double ? 0.32 : 3 + e.alea() * 2.2); e.double = !e.double && e.alea() < 0.18; }
  const dc = e.finCligne - t; e.cligne = dc > 0 ? (dc > 0.09 ? (0.17 - dc) / 0.08 : dc / 0.09) : 0;
  // regard : suit le visiteur (±30°), sinon regarde autour
  const suit = ctx.dist < 11 && Math.abs(ctx.vers) < 1.3;
  const cible = suit ? ctx.vers : Math.sin(t * 0.17 + e.phase) * 0.35;
  e.regardYeux += (borne(cible - e.regard, 0.3) - e.regardYeux) * k(8);
  e.regard += (borne(cible, 0.52) - e.regard) * k(2.4);
  // accueil : salut + sourire quand on s'approche en la regardant
  const proche = ctx.dist < (ctx.role === 'comptoir' ? 7.5 : 9.5) && ctx.dist > 1.5 && suit && ctx.face;
  if (proche && t > e.prochainSalut && e.presente < 0.05) { e.salutFin = t + 2.3; e.prochainSalut = t + (ctx.role === 'comptoir' ? 24 : 11) + e.alea() * 5; }
  // présentation du produit (vendeuse) quand le visiteur est devant le comptoir
  if (ctx.role === 'comptoir' && suit && ctx.dist < 9 && t > e.prochainePresentation && t > e.salutFin + 1) { e.presenteFin = t + 2.6; e.prochainePresentation = t + 13 + e.alea() * 6; }
  e.salut += ((t < e.salutFin ? 1 : 0) - e.salut) * k(3.2);
  e.presente += ((t < e.presenteFin ? 1 : 0) - e.presente) * k(2.6);
  e.sourire += ((t < e.salutFin + 1.5 || proche ? 1 : 0.55) - e.sourire) * k(2.5);
  // scintillement très léger toutes les 5 à 8 s
  if (t >= e.prochainFlicker) { e.finFlicker = t + 0.14; e.prochainFlicker = t + 5 + e.alea() * 3; }
  e.flicker = t < e.finFlicker ? 0.78 + 0.22 * Math.abs(Math.sin(t * 90)) : 1;
  return e;
}

/** Matrices (colonne d'abord, 16 valeurs) de chaque os dans le repère du personnage. */
export function matricesOs(perso, rotations) {
  const out = {}; const parNom = {};
  for (const b of perso.os) parNom[b.nom] = b;
  const calc = (nom) => {
    if (out[nom]) return out[nom];
    const b = parNom[nom]; const [x, y, z] = b.pivot; const q = rotations[nom] || [0, 0, 0];
    const R0 = matRot(q[0], q[1], q[2]); const sx = q[3] ?? 1, sy = q[4] ?? 1, sz = q[5] ?? 1;
    const R = [R0[0] * sx, R0[1] * sy, R0[2] * sz, R0[3] * sx, R0[4] * sy, R0[5] * sz, R0[6] * sx, R0[7] * sy, R0[8] * sz];
    const tx = x - (R[0] * x + R[1] * y + R[2] * z), ty = y - (R[3] * x + R[4] * y + R[5] * z), tz = z - (R[6] * x + R[7] * y + R[8] * z);
    const L = [R[0], R[3], R[6], 0, R[1], R[4], R[7], 0, R[2], R[5], R[8], 0, tx, ty, tz, 1];
    out[nom] = b.parent ? mul4(calc(b.parent), L) : L;
    return out[nom];
  };
  for (const b of perso.os) calc(b.nom);
  return out;
}
function mul4(a, b) {
  const o = new Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
  return o;
}

/** Variante de l'hôtesse selon le décor de la boutique. */
export function varianteDe(genre) { return genre === 'neon' ? 'black-friday' : genre === 'fete' ? 'christmas' : 'general'; }

/* ---------- shader « film d'animation » (partagé par le site et l'outil d'aperçu) ----------
   Couleurs franches, ombrage doux en deux tons (lumière enveloppante), léger reflet sur les yeux et
   les lèvres, liseré lumineux aux couleurs de la boutique : le personnage reste lisible dans toutes les
   ambiances (boutique claire, sombre ou rouge), indépendamment des lumières de la scène. */
export const SHADER_TOON = {
  vertex: `
attribute vec3 teinte;
attribute vec2 drapeau;
varying vec3 vT; varying vec2 vD; varying vec3 vN; varying vec3 vV;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vN = normalize(mat3(modelMatrix) * normal); vT = teinte; vD = drapeau; vV = cameraPosition - w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`,
  fragment: `
uniform vec3 uRim; uniform float uExpo;
varying vec3 vT; varying vec2 vD; varying vec3 vN; varying vec3 vV;
void main() {
  vec3 N = normalize(vN); vec3 V = normalize(vV);
  if (dot(N, V) < 0.0) N = -N;
  vec3 L = normalize(vec3(0.35, 0.8, 0.55));
  float d = dot(N, L);
  float w = clamp((d + 0.45) / 1.45, 0.0, 1.0);
  float ton = mix(w, smoothstep(0.38, 0.5, w), 0.45);
  vec3 ombre = vT * vec3(0.56, 0.5, 0.6);
  vec3 col = mix(ombre, vT * 1.08, ton);
  col += vT * 0.12 * max(N.y, 0.0);
  float rim = pow(1.0 - max(dot(N, V), 0.0), 3.0);
  col += (uRim * 0.35 + vT * 0.25) * rim * 0.55;
  float sp = pow(max(dot(N, normalize(L + V)), 0.0), 60.0) * vD.x;
  col += vec3(sp) * 0.6;
  gl_FragColor = vec4(col * uExpo, 1.0);
}`,
};
