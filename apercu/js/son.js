// =====================================================================
//  Musique de la boutique, générée en direct (aucun fichier audio)
//   - 'doux'       (générale)    : lounge feutré, accords de piano électrique
//   - 'pulse'      (Black Friday): boucle électro rythmée, basse, charleston
//   - 'clochettes' (Noël)        : « Jingle Bells » (J. Pierpont, 1857, domaine public)
//                                   aux clochettes, grelots de traîneau, basse douce
//  Coupée par défaut ; démarre au premier clic sur le bouton son.
// =====================================================================
let ctx = null;
let maitre = null;
let bus = null;      // mixage de la musique (fondu entre boutiques)
let echo = null;     // réverbération
let bruit = null;    // tampon de bruit (charleston, grelots, balais)
let actif = false;
let theme = 'doux';
let minuterie = null;
let prochain = 0;
let pas = 0;

const BPM = { doux: 84, pulse: 124, clochettes: 116 };
const N = { C3: 130.81, D3: 146.83, E3: 164.81, F3: 174.61, G3: 196, A3: 220, B3: 246.94, C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392, A4: 440, B4: 493.88, C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, A2: 110, F2: 87.31, G2: 98, C2: 65.41, D2: 73.42, E2: 82.41 };

function initialiser() {
  if (ctx) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  maitre = ctx.createGain(); maitre.gain.value = 0;
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 3;
  maitre.connect(comp); comp.connect(ctx.destination);
  bus = ctx.createGain(); bus.gain.value = 1; bus.connect(maitre);
  // Réverbération : réponse impulsionnelle générée (salle feutrée)
  echo = ctx.createConvolver();
  const duree = 2.2; const n = Math.floor(ctx.sampleRate * duree);
  const ir = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3); }
  echo.buffer = ir;
  const retour = ctx.createGain(); retour.gain.value = 0.28;
  echo.connect(retour); retour.connect(bus);
  bruit = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const b = bruit.getChannelData(0); for (let i = 0; i < b.length; i++) b[i] = Math.random() * 2 - 1;
}

/* ------------------------------ Instruments ------------------------------ */
function sortie(g, reverb = 0.3) {
  g.connect(bus);
  if (reverb) { const r = ctx.createGain(); r.gain.value = reverb; g.connect(r); r.connect(echo); }
}
function env(g, t, vol, attaque, duree) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + attaque);
  g.gain.exponentialRampToValueAtTime(0.0001, t + duree);
}
function cloche(f, t, vol = 0.07, duree = 1.6) {
  const g = ctx.createGain(); env(g, t, vol, 0.004, duree); sortie(g, 0.45);
  [[1, 1], [2.76, 0.45], [5.4, 0.22], [8.93, 0.08]].forEach(([m, a]) => {
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f * m;
    const ga = ctx.createGain(); ga.gain.value = a; o.connect(ga); ga.connect(g);
    o.start(t); o.stop(t + duree + 0.05);
  });
}
function rhodes(f, t, vol = 0.05, duree = 1.8) {
  const g = ctx.createGain(); env(g, t, vol, 0.01, duree); sortie(g, 0.35);
  const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
  const mod = ctx.createOscillator(); mod.frequency.value = f * 2; const mg = ctx.createGain(); mg.gain.value = f * 0.6;
  mg.gain.setValueAtTime(f * 0.6, t); mg.gain.exponentialRampToValueAtTime(f * 0.05, t + 0.6);
  mod.connect(mg); mg.connect(o.frequency);
  o.connect(g); o.start(t); mod.start(t); o.stop(t + duree + 0.05); mod.stop(t + duree + 0.05);
}
function basse(f, t, duree, vol = 0.12, type = 'triangle', coupure = 500) {
  const g = ctx.createGain(); env(g, t, vol, 0.01, duree); sortie(g, 0);
  const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = coupure; fl.connect(g);
  const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.connect(fl);
  o.start(t); o.stop(t + duree + 0.05);
}
function nappe(freqs, t, duree, vol = 0.03, coupure = 900) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.4); g.gain.exponentialRampToValueAtTime(0.0001, t + duree);
  sortie(g, 0.5);
  const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = coupure; fl.connect(g);
  freqs.forEach((f, i) => { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = i % 2 ? 7 : -7; const ga = ctx.createGain(); ga.gain.value = 1 / freqs.length; o.connect(ga); ga.connect(fl); o.start(t); o.stop(t + duree + 0.05); });
}
function souffle(t, duree, vol, type, frequence, q = 1, reverb = 0.1) {
  const s = ctx.createBufferSource(); s.buffer = bruit;
  const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = frequence; fl.Q.value = q;
  const g = ctx.createGain(); env(g, t, vol, 0.002, duree);
  s.connect(fl); fl.connect(g); sortie(g, reverb);
  s.start(t, Math.random() * 0.5); s.stop(t + duree + 0.02);
}
function grosseCaisse(t, vol = 0.5) {
  const o = ctx.createOscillator(); const g = ctx.createGain();
  o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
  env(g, t, vol, 0.002, 0.28); o.connect(g); sortie(g, 0); o.start(t); o.stop(t + 0.3);
}
function pince(f, t, vol = 0.05) { // petit synthé pincé (Black Friday)
  const g = ctx.createGain(); env(g, t, vol, 0.003, 0.22); sortie(g, 0.25);
  const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.setValueAtTime(3200, t); fl.frequency.exponentialRampToValueAtTime(600, t + 0.2); fl.connect(g);
  const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = f; o.connect(fl); o.start(t); o.stop(t + 0.25);
}

/* ------------------------------ Partitions ------------------------------ */
// Jingle Bells : [note, durée en temps] — refrain complet (16 mesures)
const A = [['E5', 1], ['E5', 1], ['E5', 2], ['E5', 1], ['E5', 1], ['E5', 2], ['E5', 1], ['G5', 1], ['C5', 1.5], ['D5', 0.5], ['E5', 4]];
const B1 = [['F5', 1], ['F5', 1], ['F5', 1.5], ['F5', 0.5], ['F5', 1], ['E5', 1], ['E5', 1], ['E5', 0.5], ['E5', 0.5], ['E5', 1], ['D5', 1], ['D5', 1], ['E5', 1], ['D5', 2], ['G5', 2]];
const B2 = [['F5', 1], ['F5', 1], ['F5', 1.5], ['F5', 0.5], ['F5', 1], ['E5', 1], ['E5', 1], ['E5', 0.5], ['E5', 0.5], ['G5', 1], ['G5', 1], ['F5', 1], ['D5', 1], ['C5', 4]];
const MELODIE_NOEL = (() => { const out = new Map(); let pos = 0; for (const [n, d] of [...A, ...B1, ...A, ...B2]) { out.set(Math.round(pos * 4), [N[n], d]); pos += d; } return out; })();
const ACCORDS_NOEL = ['C', 'C', 'C', 'C', 'F', 'C', 'D', 'G', 'C', 'C', 'C', 'C', 'F', 'C', 'G', 'C'];
const ACC = {
  C: { b: N.C3, n: [N.C4, N.E4, N.G4] }, F: { b: N.F2 * 2, n: [N.F3, N.A3, N.C4] }, D: { b: N.D3, n: [N.D4, N.F4 * 1.0595, N.A4] }, G: { b: N.G2 * 2, n: [N.G3, N.B3, N.D4] },
};
const BF = [{ b: N.A2, n: [N.A3, N.C4, N.E4] }, { b: N.F2, n: [N.F3, N.A3, N.C4] }, { b: N.C3, n: [N.C4, N.E4, N.G4] }, { b: N.G2, n: [N.G3, N.B3, N.D4] }];
const DOUX = [
  { b: N.F2, n: [N.F3, N.A3, N.C4, N.E4] }, { b: N.E2, n: [N.E3, N.G3, N.B3, N.D4] },
  { b: N.D2, n: [N.D3, N.F3, N.A3, N.C4] }, { b: N.C2, n: [N.C3, N.E3, N.G3, N.B3] },
];

function jouerPas(i, t) {
  const temps = 60 / BPM[theme] / 4; // durée d'une double croche
  if (theme === 'clochettes') {
    const k = i % 256; const mesure = Math.floor(k / 16);
    const m = MELODIE_NOEL.get(k);
    if (m) { cloche(m[0], t, 0.065, Math.min(2.2, m[1] * 0.9)); cloche(m[0] / 2, t, 0.02, 1); }
    const a = ACC[ACCORDS_NOEL[mesure]];
    if (k % 16 === 0) { basse(a.b, t, temps * 7, 0.09); nappe(a.n, t, temps * 16, 0.018, 1100); }
    if (k % 16 === 8) basse(a.b * 1.5, t, temps * 7, 0.07);
    if (k % 2 === 0) souffle(t, 0.06, k % 4 === 0 ? 0.05 : 0.03, 'bandpass', 7500, 2, 0.15); // grelots
  } else if (theme === 'pulse') {
    const k = i % 64; const a = BF[Math.floor(k / 16)];
    if (k % 4 === 0) grosseCaisse(t, 0.42);
    if (k % 16 === 4 || k % 16 === 12) souffle(t, 0.12, 0.12, 'bandpass', 1600, 0.8, 0.2); // clap
    souffle(t, k % 4 === 2 ? 0.08 : 0.03, k % 4 === 2 ? 0.07 : 0.025, 'highpass', 8000, 0.7, 0);
    if (k % 4 === 2) basse(a.b * (k % 8 === 6 ? 2 : 1), t, temps * 1.6, 0.13, 'sawtooth', 380);
    if ([0, 3, 6, 10, 12].includes(k % 16)) pince(a.n[(k / 2) % 3 | 0] * 2, t, 0.035);
    if (k % 16 === 0) nappe(a.n, t, temps * 15, 0.02, 1400);
  } else {
    const k = i % 64; const a = DOUX[Math.floor(k / 16)]; const j = k % 16;
    if (j === 0) { a.n.forEach((f, x) => rhodes(f, t + x * 0.012, 0.035, 2.4)); basse(a.b, t, temps * 7, 0.1, 'sine', 300); }
    if (j === 8) basse(a.b * 1.5, t, temps * 7, 0.07, 'sine', 300);
    if ([6, 10, 12, 14].includes(j)) rhodes(a.n[[6, 10, 12, 14].indexOf(j)] * 2, t, 0.022, 1.4);
    if (j === 4 || j === 12) souffle(t, 0.18, 0.025, 'lowpass', 2500, 0.5, 0.2); // balais
  }
}

function planifier() {
  if (!ctx) return;
  while (prochain < ctx.currentTime + 0.18) {
    jouerPas(pas, prochain);
    prochain += 60 / BPM[theme] / 4;
    pas++;
  }
}
function demarrer() {
  arreter();
  prochain = ctx.currentTime + 0.12; pas = 0;
  bus.gain.cancelScheduledValues(ctx.currentTime);
  bus.gain.setValueAtTime(0.0001, ctx.currentTime); bus.gain.exponentialRampToValueAtTime(1, ctx.currentTime + 1.2);
  minuterie = setInterval(planifier, 30);
}
function arreter() { if (minuterie) { clearInterval(minuterie); minuterie = null; } }

export const son = {
  get actif() { return actif; },
  async basculer() {
    initialiser();
    if (!ctx) return false;
    actif = !actif;
    if (ctx.state === 'suspended') await ctx.resume();
    maitre.gain.setTargetAtTime(actif ? 0.55 : 0, ctx.currentTime, 0.2);
    if (actif) demarrer(); else setTimeout(() => { if (!actif) arreter(); }, 600);
    return actif;
  },
  theme(nom) {
    const nouveau = BPM[nom] ? nom : 'doux';
    if (nouveau === theme) return;
    theme = nouveau;
    if (actif && ctx) { bus.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.15); setTimeout(() => { if (actif) demarrer(); }, 450); }
  },
  clic() { if (actif && ctx) cloche(1568, ctx.currentTime, 0.012, 0.4); },
  ajout() { if (actif && ctx) { const t = ctx.currentTime; cloche(1046.5, t, 0.035, 0.8); cloche(1568, t + 0.09, 0.03, 0.8); } },
  succes() { if (actif && ctx) { const t = ctx.currentTime; [523.3, 659.3, 784, 1046.5].forEach((f, i) => cloche(f, t + i * 0.12, 0.05, 1.4)); } },
  passage() { if (actif && ctx) souffle(ctx.currentTime, 0.9, 0.06, 'bandpass', 900, 0.4, 0.6); },
};
