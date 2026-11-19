// =====================================================================
//  Scène 3D de la boutique (Three.js r170)
//
//  NAVIGATION LIBRE (jamais bloqué) :
//   - glisser (souris ou doigt)              → regarder autour
//   - molette / pincer / joystick / ZQSD     → avancer, reculer, tourner
//   - toucher le sol                         → y aller ; toucher une vitrine → s'en approcher
//   - toutes les cartes d'un rayon sont visibles ; survol = mise en valeur, toucher = fiche
//   - « Reculer » (bouton, Retour arrière)   → prendre du recul
//  RENDU : même architecture pour toutes les boutiques, lumière précalculée
//  (sol, murs, plafond peints), sol brillant qui reflète la vraie salle,
//  halo lumineux (bloom) sur LED, néons et écrans, brume légère.
//  QUALITÉ ADAPTATIVE : réglages par appareil, puis selon les FPS mesurés.
// =====================================================================

import * as E from './enseignes.js';
import * as PERS from './personnages.js';

export async function creerScene(THREE, o) {
  const { conteneur, catalogue: cat, reduit } = o;
  const RACINE = o.racine ?? '/';
  const rappels = new Proxy(o.rappels || {}, { get: (t, k) => (typeof t[k] === 'function' ? t[k] : () => {}) });

  /* ------------------------- Architecture commune ------------------------- */
  const L = 14; const P = 22; const H = 4.2; const ZF = -P;
  const OEIL = 1.62;
  const SLOTS = [];
  for (const z of [-4.2, -8.2, -12.2, -16.2]) SLOTS.push({ cote: -1, z }, { cote: 1, z });
  const COMPTOIR_Z = -18.8;
  const LIGNES_LED = [-3.2, 0, 3.2];
  const SERIF = '"Bodoni Moda", Didot, "Bodoni 72", Georgia, serif';
  const SANS = 'Manrope, "Avenir Next", "Segoe UI", sans-serif';

  /* ------------------------------ Qualité ------------------------------ */
  const tactile = matchMedia('(pointer: coarse)').matches;
  const mem = navigator.deviceMemory || 4;
  const coeurs = navigator.hardwareConcurrency || 4;
  let niveau = mem <= 2 || coeurs <= 2 ? 0 : tactile ? 1 : 2;
  const REGLAGES = [
    { ratio: 1, neige: 0, post: false, env: false, msaa: 0 },
    { ratio: 1.5, neige: 180, post: true, env: true, msaa: 0 },
    { ratio: 2, neige: 420, post: true, env: true, msaa: 4 },
  ];
  const STD = niveau >= 1;
  const cibleFPS = tactile ? 30 : 60;

  /* ------------------------------ Rendu ------------------------------ */
  const renderer = new THREE.WebGLRenderer({ antialias: !REGLAGES[niveau].post, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, REGLAGES[niveau].ratio));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping ?? THREE.ACESFilmicToneMapping;
  conteneur.appendChild(renderer.domElement);
  const ANISO = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const pmrem = new THREE.PMREMGenerator(renderer);

  const voile = document.createElement('div');
  voile.style.cssText = 'position:absolute;inset:0;pointer-events:none;opacity:0;z-index:1;background:#000';
  conteneur.appendChild(voile);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(52, 1, 0.05, 160);
  const groupeFacade = new THREE.Group();
  const groupeInterieur = new THREE.Group();
  scene.add(groupeFacade, groupeInterieur);

  const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1.2);
  const soleil = new THREE.DirectionalLight(0xffffff, 1.0);
  scene.add(hemi, soleil, soleil.target);

  /* ------------------------------ Outils ------------------------------ */
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const EASE = {
    inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    out: (t) => 1 - Math.pow(1 - t, 3),
    in: (t) => t * t * t,
  };
  const hexRgb = (h) => { const n = parseInt(String(h).replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const rgba = (h, a) => { const [r, g, b] = hexRgb(h); return `rgba(${r},${g},${b},${a})`; };
  const melange = (h1, h2, k) => {
    const a = hexRgb(h1); const b = hexRgb(h2);
    return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * k).toString(16).padStart(2, '0')).join('');
  };
  const luminance = (h) => { const [r, g, b] = hexRgb(h); return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; };
  const lumineux = (h, k) => new THREE.Color(h).multiplyScalar(k); // > 1 : déclenche le halo
  function alea(graine) {
    let a = graine >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const hachage = (s) => { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
  const angleDiff = (a, b) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };

  function toile(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
  function chemin(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
  }
  function texteAjuste(ctx, txt, x, y, maxW, police, taille) {
    let t = taille;
    do { ctx.font = police.replace('{t}', t); if (ctx.measureText(txt).width <= maxW) break; t -= 2; } while (t > 10);
    ctx.fillText(txt, x, y);
    return t;
  }

  let poubelle = [];
  const garder = (x) => { poubelle.push(x); return x; };
  function texDe(c, couleur = true, jetable = true) {
    const t = new THREE.CanvasTexture(c);
    if (couleur) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = ANISO;
    return jetable ? garder(t) : t;
  }
  function matStd(p = {}, jetable = true) {
    let m;
    if (STD) m = new THREE.MeshStandardMaterial(p);
    else { const { metalness, roughness, envMapIntensity, ...r } = p; m = new THREE.MeshLambertMaterial(r); }
    return jetable ? garder(m) : m;
  }
  function matBasic(p = {}, jetable = true) {
    const m = new THREE.MeshBasicMaterial({ toneMapped: false, ...p });
    return jetable ? garder(m) : m;
  }
  const matInvisible = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false });
  const GEO = {
    plan: new THREE.PlaneGeometry(1, 1), boite: new THREE.BoxGeometry(1, 1, 1),
    sphere: new THREE.SphereGeometry(1, 16, 12), cylindre: new THREE.CylinderGeometry(1, 1, 1, 24),
  };
  function boite(w, h, d, mat, x, y, z, parent) { const m = new THREE.Mesh(GEO.boite, mat); m.scale.set(w, h, d); m.position.set(x, y, z); if (parent) parent.add(m); return m; }
  function plan(w, h, mat, x, y, z, parent) { const m = new THREE.Mesh(GEO.plan, mat); m.scale.set(w, h, 1); m.position.set(x, y, z); if (parent) parent.add(m); return m; }
  function cylindre(r, h, mat, x, y, z, parent) { const m = new THREE.Mesh(GEO.cylindre, mat); m.scale.set(r, h, r); m.position.set(x, y, z); if (parent) parent.add(m); return m; }
  function cliquable(m, cible) { m.userData.cible = cible; return m; }

  function degrade(couleurs, vertical = true, jetable = true) {
    const [c, x] = toile(vertical ? 4 : 256, vertical ? 256 : 4);
    const g = vertical ? x.createLinearGradient(0, 0, 0, 256) : x.createLinearGradient(0, 0, 256, 0);
    couleurs.forEach((col, i) => g.addColorStop(i / (couleurs.length - 1), col));
    x.fillStyle = g; x.fillRect(0, 0, c.width, c.height);
    return texDe(c, true, jetable);
  }
  const TEX_HALO = (() => {
    const [c, x] = toile(128, 128);
    const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,.4)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    return texDe(c, false, false);
  })();
  const TEX_OMBRE = (() => {
    const [c, x] = toile(128, 128);
    const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(0,0,0,.55)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    return texDe(c, false, false);
  })();
  const matHalo = (couleur, opacite = 0.6, jetable = true) => matBasic({ map: TEX_HALO, color: couleur, transparent: true, opacity: opacite, blending: THREE.AdditiveBlending, depthWrite: false }, jetable);
  function ombreAuSol(r, x, z, parent, opacite = 0.7) {
    const m = plan(r * 2, r * 2, matBasic({ map: TEX_OMBRE, transparent: true, opacity: opacite, depthWrite: false }), x, 0.008, z, parent);
    m.rotation.x = -Math.PI / 2; return m;
  }

  /* ===================================================================== */
  /*  Halo lumineux (bloom) — post-traitement maison, cœur de Three.js       */
  /* ===================================================================== */
  let post = null;
  // Rendu en couleurs étendues (HDR) si l'appareil le permet, sinon 8 bits (halo un peu moins fort)
  const ext = renderer.extensions;
  const HDR = Boolean(ext && (ext.has('EXT_color_buffer_float') || ext.has('EXT_color_buffer_half_float')));
  const TYPE_RT = HDR ? THREE.HalfFloatType : THREE.UnsignedByteType;
  function creerPost() {
    const VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
    const mat = (frag, uniforms, toneMapped = false) => new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false, toneMapped });
    const seuil = mat(`uniform sampler2D tDiffuse; uniform float seuil; varying vec2 vUv;
      void main(){ vec3 c = texture2D(tDiffuse, vUv).rgb; float l = max(c.r, max(c.g, c.b));
      gl_FragColor = vec4(c * smoothstep(seuil, seuil + 0.8, l), 1.0); }`, { tDiffuse: { value: null }, seuil: { value: HDR ? 1.0 : 0.82 } });
    const flou = mat(`uniform sampler2D tDiffuse; uniform vec2 dir; varying vec2 vUv;
      void main(){ vec3 s = texture2D(tDiffuse, vUv).rgb * 0.227027;
      s += (texture2D(tDiffuse, vUv + dir * 1.3846153846).rgb + texture2D(tDiffuse, vUv - dir * 1.3846153846).rgb) * 0.3162162162;
      s += (texture2D(tDiffuse, vUv + dir * 3.2307692308).rgb + texture2D(tDiffuse, vUv - dir * 3.2307692308).rgb) * 0.0702702703;
      gl_FragColor = vec4(s, 1.0); }`, { tDiffuse: { value: null }, dir: { value: new THREE.Vector2() } });
    // Composition finale « cinéma » : halo + légère aberration chromatique sur les bords,
    // vignettage, contraste filmique doux et grain très fin (cine = 0 : rendu d'origine).
    const compo = mat(`uniform sampler2D tScene; uniform sampler2D t0; uniform sampler2D t1; uniform sampler2D t2; uniform sampler2D t3; uniform float force; uniform float cine; uniform float temps; varying vec2 vUv;
      float bruit(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      void main(){
      vec2 d = vUv - 0.5; float r2 = dot(d, d);
      vec2 ca = d * r2 * 0.014 * cine;
      vec3 c = vec3(texture2D(tScene, vUv + ca).r, texture2D(tScene, vUv).g, texture2D(tScene, vUv - ca).b);
      vec3 b = texture2D(t0, vUv).rgb * 0.30 + texture2D(t1, vUv).rgb * 0.30 + texture2D(t2, vUv).rgb * 0.25 + texture2D(t3, vUv).rgb * 0.25;
      vec3 col = c + b * force;
      col *= 1.0 - cine * 0.5 * smoothstep(0.1, 0.6, r2);
      gl_FragColor = vec4(col, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      vec3 g = clamp(gl_FragColor.rgb, 0.0, 1.0);
      g = mix(g, g * g * (3.0 - 2.0 * g), 0.2 * cine);
      g += (bruit(vUv * 913.0 + fract(temps) * 37.0) - 0.5) * 0.028 * cine;
      gl_FragColor = vec4(g, 1.0);
      }`, { tScene: { value: null }, t0: { value: null }, t1: { value: null }, t2: { value: null }, t3: { value: null }, force: { value: 0.9 }, cine: { value: reduit ? 0.6 : 1 }, temps: { value: 0 } }, true);
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), seuil);
    quad.frustumCulled = false;
    const sceneQuad = new THREE.Scene(); sceneQuad.add(quad);
    const camQuad = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const sansProfondeur = { type: TYPE_RT, depthBuffer: false };
    return {
      actif: true,
      rtScene: null, seuilRT: null, niveaux: [],
      taille(w, h) {
        const pr = renderer.getPixelRatio(); const W = Math.max(2, Math.round(w * pr)); const Hh = Math.max(2, Math.round(h * pr));
        if (this.rtScene) { this.rtScene.dispose(); this.seuilRT.dispose(); this.niveaux.forEach((n) => { n.a.dispose(); n.b.dispose(); }); }
        this.rtScene = new THREE.WebGLRenderTarget(W, Hh, { type: TYPE_RT, samples: REGLAGES[niveau].msaa });
        this.seuilRT = new THREE.WebGLRenderTarget(Math.max(2, W >> 1), Math.max(2, Hh >> 1), sansProfondeur);
        this.niveaux = [1, 2, 3, 4].map((k) => {
          const w2 = Math.max(2, W >> k); const h2 = Math.max(2, Hh >> k);
          return { a: new THREE.WebGLRenderTarget(w2, h2, sansProfondeur), b: new THREE.WebGLRenderTarget(w2, h2, sansProfondeur), w: w2, h: h2 };
        });
      },
      passe(m, cible) { quad.material = m; renderer.setRenderTarget(cible); renderer.render(sceneQuad, camQuad); },
      rendre(sc, cam) {
        renderer.setRenderTarget(this.rtScene);
        renderer.render(sc, cam);
        seuil.uniforms.tDiffuse.value = this.rtScene.texture;
        this.passe(seuil, this.seuilRT);
        let source = this.seuilRT.texture;
        for (const n of this.niveaux) {
          flou.uniforms.tDiffuse.value = source; flou.uniforms.dir.value.set(1 / n.w, 0); this.passe(flou, n.b);
          flou.uniforms.tDiffuse.value = n.b.texture; flou.uniforms.dir.value.set(0, 1 / n.h); this.passe(flou, n.a);
          source = n.a.texture;
        }
        compo.uniforms.tScene.value = this.rtScene.texture;
        compo.uniforms.temps.value = reduit ? 0 : (performance.now() / 1000) % 1;
        this.niveaux.forEach((n, i) => { compo.uniforms[`t${i}`].value = n.a.texture; });
        this.passe(compo, null);
      },
      force(v) { compo.uniforms.force.value = v; },
    };
  }
  if (REGLAGES[niveau].post) {
    try { post = creerPost(); } catch (e) { post = null; }
    if (renderer.debug) renderer.debug.onShaderError = () => { console.warn('Glow disabled: shader rejected by this device.'); if (post) post.actif = false; };
  }

  /* ===================================================================== */
  /*  Sol miroir — vrais reflets de la salle (et de la façade) sur le sol   */
  /*  Une caméra « sous le sol » filme la scène à l'envers ; le sol ajoute   */
  /*  cette image, floutée, selon l'angle du regard (effet Fresnel).         */
  /*  Réservé aux appareils puissants ; coupé en premier si les FPS chutent. */
  /* ===================================================================== */
  let miroir = null;
  if (niveau >= 2 && !reduit) {
    try {
      const rt = new THREE.WebGLRenderTarget(512, 512, { type: TYPE_RT });
      const cam = new THREE.PerspectiveCamera();
      const communs = { uMiroirTex: { value: rt.texture }, uMiroirMat: { value: new THREE.Matrix4() } };
      const forces = [];
      const regard = V(0, 0, 0); const haut = V(0, 1, 0); const rot = new THREE.Matrix4();
      miroir = {
        actif: true,
        taille(w, h) { const pr = renderer.getPixelRatio() * 0.5; rt.setSize(Math.max(2, Math.round(w * pr)), Math.max(2, Math.round(h * pr))); },
        /** Rend un matériau de sol réfléchissant. Renvoie l'uniforme « force » (réglable par thème). */
        appliquer(mat, force) {
          const u = { value: force, base: force }; forces.push(u);
          mat.onBeforeCompile = (sh) => {
            sh.uniforms.uMiroirTex = communs.uMiroirTex; sh.uniforms.uMiroirMat = communs.uMiroirMat; sh.uniforms.uMiroirForce = u;
            sh.vertexShader = sh.vertexShader
              .replace('#include <common>', '#include <common>\nuniform mat4 uMiroirMat; varying vec4 vMiroirUv;')
              .replace('#include <project_vertex>', '#include <project_vertex>\nvMiroirUv = uMiroirMat * modelMatrix * vec4(transformed, 1.0);');
            sh.fragmentShader = sh.fragmentShader
              .replace('#include <common>', '#include <common>\nuniform sampler2D uMiroirTex; uniform float uMiroirForce; varying vec4 vMiroirUv;')
              .replace('#include <opaque_fragment>', `
                if (uMiroirForce > 0.0 && vMiroirUv.w > 0.0) {
                  vec2 mu = vMiroirUv.xy / vMiroirUv.w;
                  float fl = 0.0035 + 0.01 * roughnessFactor;
                  vec3 rf = texture2D(uMiroirTex, mu).rgb * 0.32
                    + (texture2D(uMiroirTex, mu + vec2(fl, 0.0)).rgb + texture2D(uMiroirTex, mu - vec2(fl, 0.0)).rgb
                    + texture2D(uMiroirTex, mu + vec2(0.0, fl * 1.6)).rgb + texture2D(uMiroirTex, mu - vec2(0.0, fl * 1.6)).rgb) * 0.17;
                  float fr = pow(1.0 - clamp(abs(dot(normalize(vViewPosition), normal)), 0.0, 1.0), 2.5);
                  outgoingLight += rf * uMiroirForce * (0.22 + 0.78 * fr);
                }
                #include <opaque_fragment>`);
          };
          mat.customProgramCacheKey = () => 'miroir';
          mat.needsUpdate = true;
          return u;
        },
        couper() { this.actif = false; forces.forEach((u) => { u.value = 0; }); },
        rendre() {
          camera.updateMatrixWorld();
          rot.extractRotation(camera.matrixWorld);
          cam.position.set(camera.position.x, -camera.position.y, camera.position.z);
          regard.set(0, 0, -1).applyMatrix4(rot).add(camera.position); regard.y = -regard.y;
          haut.set(0, 1, 0).applyMatrix4(rot); haut.y = -haut.y;
          cam.up.copy(haut); cam.lookAt(regard);
          cam.updateMatrixWorld();
          cam.projectionMatrix.copy(camera.projectionMatrix);
          cam.projectionMatrixInverse.copy(camera.projectionMatrixInverse);
          communs.uMiroirMat.value.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1)
            .multiply(cam.projectionMatrix).multiply(cam.matrixWorldInverse);
          communs.uMiroirTex.value = null; // le sol ne lit pas l'image qu'on est en train de peindre
          renderer.setRenderTarget(rt);
          renderer.render(scene, cam);
          communs.uMiroirTex.value = rt.texture;
        },
      };
    } catch (e) { miroir = null; }
  }

  /* --------------------- Polices (textes peints dans la 3D) --------------------- */
  if (document.fonts && document.fonts.load) {
    await Promise.race([
      Promise.all([`500 64px ${SERIF}`, `italic 500 64px ${SERIF}`, `800 64px ${SANS}`, `600 64px ${SANS}`].map((f) => document.fonts.load(f))),
      new Promise((r) => setTimeout(r, 1800)),
    ]).catch(() => {});
  }

  /* --------------------- Textures des cartes (chargement progressif) --------------------- */
  const chargeur = new THREE.TextureLoader();
  const cacheTex = new Map();
  const attente = [];
  let enCours = 0; let finis = 0; let total = 0;
  function textureProduit(id) {
    if (cacheTex.has(id)) return cacheTex.get(id).promesse;
    const p = cat.produits[id];
    const entree = {};
    entree.promesse = new Promise((ok) => { entree.ok = ok; });
    cacheTex.set(id, entree);
    total++;
    attente.push({ url: RACINE + p.texture, secours: RACINE + p.image, entree });
    pomper();
    return entree.promesse;
  }
  function pomper() {
    while (enCours < 4 && attente.length) {
      const j = attente.shift();
      enCours++;
      const fin = (t) => {
        enCours--; finis++;
        if (t) { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = ANISO; }
        j.entree.ok(t ? { tex: t, aspect: t.image.width / t.image.height } : null);
        rappels.progression(total ? finis / total : 1);
        if (finis === total) planifierReflets(0.4);
        pomper();
      };
      chargeur.load(j.url, fin, undefined, () => chargeur.load(j.secours, fin, undefined, () => fin(null)));
    }
  }
  const ARRONDIS = new Map();
  function arrondi(aspect) {
    const k = Math.round(aspect * 10) / 10;
    if (ARRONDIS.has(k)) return ARRONDIS.get(k);
    const w = 256; const h = Math.max(24, Math.round(256 / k));
    const [c, x] = toile(w, h);
    x.fillStyle = '#000'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#fff'; chemin(x, 0, 0, w, h, Math.min(w, h) * 0.07); x.fill();
    const t = texDe(c, false, false);
    ARRONDIS.set(k, t);
    return t;
  }
  /** Carte = plan texturé brillant : couleurs exactes (émission) + reflets de la salle. */
  /** Couleur dominante (la plus vive) d'un visuel, pour le halo de la carte. */
  const COULEURS_MARQUE = new Map();
  function couleurMarque(id, image) {
    if (COULEURS_MARQUE.has(id)) return COULEURS_MARQUE.get(id);
    let res = null;
    try {
      const n = 24; const [cv, x] = toile(n, n);
      x.drawImage(image, 0, 0, n, n);
      const d = x.getImageData(0, 0, n, n).data;
      let r = 0; let g = 0; let b = 0; let poids = 0;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] < 128) continue;
        const R = d[i] / 255; const G2 = d[i + 1] / 255; const B2 = d[i + 2] / 255;
        const mx = Math.max(R, G2, B2); const mn = Math.min(R, G2, B2);
        const sat = mx ? (mx - mn) / mx : 0;
        const w = sat * sat * mx; // privilégie les couleurs vives et lumineuses
        r += R * w; g += G2 * w; b += B2 * w; poids += w;
      }
      if (poids > 0.5) {
        const c = new THREE.Color(r / poids, g / poids, b / poids);
        const hsl = {}; c.getHSL(hsl);
        c.setHSL(hsl.h, Math.max(0.6, hsl.s), 0.58);
        res = '#' + c.getHexString();
      }
    } catch (_) { res = null; }
    COULEURS_MARQUE.set(id, res);
    return res;
  }
  // Bande lumineuse en biais qui balaie les cartes (reflet « carte premium »)
  const TEX_BRILLANCE = (() => {
    const [cv, x] = toile(512, 256);
    x.translate(256, 128); x.rotate(-0.42);
    for (const [w, a] of [[90, 0.75], [26, 0.95]]) {
      const g = x.createLinearGradient(-w, 0, w, 0);
      g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, `rgba(255,255,255,${a})`); g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g; x.fillRect(-w, -400, w * 2, 800);
    }
    const g2 = x.createLinearGradient(110, 0, 150, 0);
    g2.addColorStop(0, 'rgba(255,255,255,0)'); g2.addColorStop(0.5, 'rgba(255,255,255,.45)'); g2.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g2; x.fillRect(110, -400, 40, 800);
    return texDe(cv, false, false);
  })();

  // Éclat en étoile à 4 branches (scintillement sur le coin des cartes en vitrine)
  const TEX_ETOILE = (() => {
    const [cv, x] = toile(128, 128);
    x.translate(64, 64);
    for (let k = 0; k < 2; k++) {
      const g = x.createLinearGradient(-64, 0, 64, 0);
      g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g; x.beginPath(); x.moveTo(-64, 0); x.quadraticCurveTo(0, -5, 64, 0); x.quadraticCurveTo(0, 5, -64, 0); x.fill();
      x.rotate(Math.PI / 2);
    }
    const g2 = x.createRadialGradient(0, 0, 0, 0, 0, 22); g2.addColorStop(0, 'rgba(255,255,255,1)'); g2.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g2; x.fillRect(-22, -22, 44, 44);
    return texDe(cv, false, false);
  })();

  // Corps de carte en volume (tranche métallique, coins arrondis identiques au visuel)
  const CORPS = new Map();
  function geoCorps(aspect) {
    const k = Math.round(aspect * 10) / 10;
    if (CORPS.has(k)) return CORPS.get(k);
    const rx = 0.07 * Math.min(1, 1 / k); const ry = 0.07 * Math.min(k, 1);
    const s = new THREE.Shape();
    s.moveTo(-0.5 + rx, -0.5); s.lineTo(0.5 - rx, -0.5); s.absellipse(0.5 - rx, -0.5 + ry, rx, ry, -Math.PI / 2, 0, false);
    s.lineTo(0.5, 0.5 - ry); s.absellipse(0.5 - rx, 0.5 - ry, rx, ry, 0, Math.PI / 2, false);
    s.lineTo(-0.5 + rx, 0.5); s.absellipse(-0.5 + rx, 0.5 - ry, rx, ry, Math.PI / 2, Math.PI, false);
    s.lineTo(-0.5, -0.5 + ry); s.absellipse(-0.5 + rx, -0.5 + ry, rx, ry, Math.PI, Math.PI * 1.5, false);
    const g = new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false, curveSegments: 6 });
    CORPS.set(k, g);
    return g;
  }
  const matCorps = STD ? new THREE.MeshStandardMaterial({ color: 0x23232a, metalness: 0.85, roughness: 0.28, envMapIntensity: 1.3 }) : null;

  function carte(id, { maxW = 0.92, maxH = 0.62, jetable = true, vitrine = false } = {}) {
    const mat = STD
      ? matStd({ color: 0x000000, emissive: 0x9a958d, roughness: 0.16, metalness: 0, envMapIntensity: 0.22, transparent: true }, jetable)
      : matBasic({ color: 0xdddddd, transparent: true }, jetable);
    const mesh = new THREE.Mesh(GEO.plan, mat);
    const e = { id, mesh, w: maxW, h: maxW / 1.586, pret: false };
    if (vitrine) {
      // Halo à la couleur de la marque, derrière la carte (enfant de la carte : suit sa position et sa taille)
      e.halo = new THREE.Mesh(GEO.plan, matHalo(0xffffff, 0, jetable));
      e.halo.position.z = -0.03; e.halo.scale.set(1.75, 2.1, 1); e.halo.renderOrder = 1;
      mesh.add(e.halo);
      // Reflet brillant qui traverse la carte de temps en temps
      const tb = TEX_BRILLANCE.clone(); tb.needsUpdate = true; tb.offset.x = 2;
      e.brillance = new THREE.Mesh(GEO.plan, matBasic({ map: tb, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }, jetable));
      e.brillance.position.z = 0.002; e.brillance.renderOrder = 7;
      mesh.add(e.brillance);
    }
    const fixer = (aspect) => { let w = maxW; let h = w / aspect; if (h > maxH) { h = maxH; w = h * aspect; } e.w = w; e.h = h; };
    fixer(1.586);
    e.eclat = (v) => { if (STD) mat.emissiveIntensity = e.pret ? v : 0.6; else mat.color.setScalar(e.pret ? v : 0.8); };
    textureProduit(id).then((t) => {
      if (!t) return;
      if (STD) { mat.emissiveMap = t.tex; mat.emissive.set(0xffffff); } else { mat.map = t.tex; mat.color.set(0xffffff); }
      mat.alphaMap = arrondi(t.aspect); mat.needsUpdate = true;
      if (e.brillance) { e.brillance.material.alphaMap = arrondi(t.aspect); e.brillance.material.needsUpdate = true; }
      if (e.halo) e.halo.material.color.set(couleurMarque(id, t.tex.image) || cat.boutiques[0].theme.couleurs.lumiere);
      if (vitrine && matCorps) {
        // Épaisseur réelle : la carte devient un objet (tranche visible dès qu'elle pivote)
        e.corps = new THREE.Mesh(geoCorps(t.aspect), matCorps);
        e.corps.position.z = -0.0125; e.corps.scale.z = 0.012;
        mesh.add(e.corps);
      }
      fixer(t.aspect); e.pret = true;
      if (e.apresChargement) e.apresChargement();
    });
    return e;
  }

  /* --------------------- Matières peintes une fois --------------------- */
  const MOTIFS = new Map();
  function motif(type, couleurs) {
    const cle = `${type}|${couleurs.accent}|${couleurs.mur}`;
    if (MOTIFS.has(cle)) return MOTIFS.get(cle);
    const s = 512; const [c, x] = toile(s, s); const r = alea(hachage(cle));
    const bois = (base, fonce, clair) => {
      x.fillStyle = base; x.fillRect(0, 0, s, s);
      for (let i = 0; i < 90; i++) {
        const y = r() * s; const amp = 1.5 + r() * 4; const f = 0.004 + r() * 0.008;
        x.strokeStyle = r() < 0.55 ? rgba(fonce, 0.1 + r() * 0.22) : rgba(clair, 0.08 + r() * 0.16);
        x.lineWidth = 0.5 + r() * 2;
        x.beginPath();
        for (let px = 0; px <= s; px += 8) { const yy = y + Math.sin(px * f + i) * amp; if (px) x.lineTo(px, yy); else x.moveTo(px, yy); }
        x.stroke();
      }
    };
    switch (type) {
      case 'marbre': {
        x.fillStyle = '#F4F2EE'; x.fillRect(0, 0, s, s);
        for (let i = 0; i < 14; i++) {
          x.strokeStyle = `rgba(${140 + r() * 30},${136 + r() * 30},${128 + r() * 30},${0.1 + r() * 0.26})`;
          x.lineWidth = 0.4 + r() * 2.2;
          x.beginPath();
          let px = r() * s; let py = -20;
          x.moveTo(px, py);
          while (py < s + 20) { const nx = px + (r() - 0.5) * 110; const ny = py + 30 + r() * 70; x.quadraticCurveTo((px + nx) / 2 + (r() - 0.5) * 60, (py + ny) / 2, nx, ny); px = nx; py = ny; }
          x.stroke();
        }
        break;
      }
      case 'chene': bois('#D6C3A3', '#9C7C52', '#F1E2C6'); break;
      case 'acajou': bois('#5A2316', '#2E0E07', '#8A3D26'); break;
      case 'sapin': bois(couleurs.accent, melange(couleurs.accent, '#000000', 0.5), melange(couleurs.accent, '#ffffff', 0.18)); break;
      case 'beton': {
        x.fillStyle = '#26262A'; x.fillRect(0, 0, s, s);
        for (let i = 0; i < 6000; i++) { x.fillStyle = r() < 0.5 ? `rgba(255,255,255,${r() * 0.04})` : `rgba(0,0,0,${r() * 0.12})`; x.fillRect(r() * s, r() * s, 1 + r() * 2, 1 + r() * 2); }
        break;
      }
      case 'laque': {
        const g = x.createLinearGradient(0, 0, s, s); g.addColorStop(0, '#0B0B0D'); g.addColorStop(0.5, '#18181C'); g.addColorStop(1, '#0A0A0B');
        x.fillStyle = g; x.fillRect(0, 0, s, s); break;
      }
      default: x.fillStyle = couleurs.mur; x.fillRect(0, 0, s, s);
    }
    MOTIFS.set(cle, c);
    return c;
  }

  /* --------------------- Lumière précalculée --------------------- */
  const PPM = 48;
  function peindreSol(t) {
    const c0 = t.couleurs; const cw = L * PPM; const ch = P * PPM;
    const [c, x] = toile(cw, ch);
    const pat = x.createPattern(motif(t.matieres.sol, c0), 'repeat');
    if (pat.setTransform) pat.setTransform(new DOMMatrix().scale(t.matieres.sol === 'marbre' ? 0.8 : 0.5));
    x.fillStyle = pat; x.fillRect(0, 0, cw, ch);
    x.fillStyle = rgba(c0.sol, 0.3); x.fillRect(0, 0, cw, ch);
    const pas = t.matieres.sol === 'marbre' ? 1.4 : t.matieres.sol === 'beton' ? 2.8 : 0;
    x.strokeStyle = 'rgba(0,0,0,.08)'; x.lineWidth = 1;
    if (pas) for (let v = 0; v < Math.max(L, P); v += pas) { x.beginPath(); x.moveTo(v * PPM, 0); x.lineTo(v * PPM, ch); x.moveTo(0, v * PPM); x.lineTo(cw, v * PPM); x.stroke(); }
    else for (let v = 0; v < L; v += 0.18) { x.fillStyle = `rgba(0,0,0,${0.05 + ((v * 7) % 1) * 0.05})`; x.fillRect(v * PPM, 0, 1, ch); }
    const X = (wx) => (wx + L / 2) * PPM; const Z = (wz) => (wz + P) * PPM;
    x.globalCompositeOperation = 'multiply'; x.fillStyle = '#B4B4B4'; x.fillRect(0, 0, cw, ch);
    x.globalCompositeOperation = 'screen';
    for (const lx of LIGNES_LED) {
      const g = x.createLinearGradient(X(lx - 1.6), 0, X(lx + 1.6), 0);
      g.addColorStop(0, rgba(c0.lumiere, 0)); g.addColorStop(0.5, rgba(c0.lumiere, 0.32 * t.lumiere.intensite)); g.addColorStop(1, rgba(c0.lumiere, 0));
      x.fillStyle = g; x.fillRect(X(lx - 1.6), Z(-17.5), 3.2 * PPM, 16.5 * PPM);
    }
    for (const s of SLOTS) {
      const px = X(s.cote * 5.9); const pz = Z(s.z);
      const g = x.createRadialGradient(px, pz, 0, px, pz, 2.2 * PPM);
      g.addColorStop(0, rgba(melange(c0.lumiere, c0.accent, 0.25), 0.4)); g.addColorStop(1, 'rgba(0,0,0,0)');
      x.save(); x.translate(px, pz); x.scale(0.6, 1); x.translate(-px, -pz); x.fillStyle = g; x.fillRect(0, 0, cw, ch); x.restore();
    }
    { const g = x.createRadialGradient(X(0), Z(COMPTOIR_Z + 1.2), 0, X(0), Z(COMPTOIR_Z + 1.2), 3 * PPM); g.addColorStop(0, rgba(c0.lumiere, 0.45)); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, cw, ch); }
    x.globalCompositeOperation = 'multiply';
    const bord = (x0, y0, x1, y1, f = '#5E5E5E') => { const g = x.createLinearGradient(x0, y0, x1, y1); g.addColorStop(0, f); g.addColorStop(1, '#FFFFFF'); return g; };
    x.fillStyle = bord(0, 0, 1.4 * PPM, 0); x.fillRect(0, 0, 1.4 * PPM, ch);
    x.fillStyle = bord(cw, 0, cw - 1.4 * PPM, 0); x.fillRect(cw - 1.4 * PPM, 0, 1.4 * PPM, ch);
    x.fillStyle = bord(0, 0, 0, 1.3 * PPM); x.fillRect(0, 0, cw, 1.3 * PPM);
    for (const s of SLOTS) {
      const xa = s.cote < 0 ? 0.62 * PPM : cw - 0.62 * PPM; const xb = s.cote < 0 ? 1.05 * PPM : cw - 1.05 * PPM;
      x.fillStyle = bord(xa, 0, xb, 0, '#6A6A6A'); x.fillRect(Math.min(xa, xb), Z(s.z) - 1.75 * PPM, Math.abs(xb - xa), 3.5 * PPM);
    }
    const gc = x.createRadialGradient(X(0), Z(COMPTOIR_Z), 0.3 * PPM, X(0), Z(COMPTOIR_Z), 2.8 * PPM);
    gc.addColorStop(0, '#666666'); gc.addColorStop(1, '#FFFFFF');
    x.save(); x.translate(X(0), Z(COMPTOIR_Z)); x.scale(1, 0.42); x.translate(-X(0), -Z(COMPTOIR_Z)); x.fillStyle = gc; x.fillRect(0, 0, cw, ch); x.restore();
    x.globalCompositeOperation = 'source-over';
    return texDe(c);
  }

  /** Murs cannelés (lames verticales) + lavage de lumière en haut (corniche LED). */
  function peindreMur(t, longueur) {
    const c0 = t.couleurs; const cw = Math.round(longueur * 48); const ch = Math.round(H * 48);
    const [c, x] = toile(cw, ch);
    x.fillStyle = c0.mur; x.fillRect(0, 0, cw, ch);
    const sombre = luminance(c0.mur) < 0.35;
    for (let px = 0; px < cw; px += 4) {
      const g = x.createLinearGradient(px, 0, px + 4, 0);
      g.addColorStop(0, `rgba(255,255,255,${sombre ? 0.05 : 0.18})`); g.addColorStop(0.5, 'rgba(255,255,255,0)'); g.addColorStop(1, `rgba(0,0,0,${sombre ? 0.25 : 0.07})`);
      x.fillStyle = g; x.fillRect(px, 0, 4, ch);
    }
    x.globalCompositeOperation = 'screen';
    const lav = x.createLinearGradient(0, 0, 0, ch * 0.75);
    lav.addColorStop(0, rgba((t.decor || []).includes('neon') ? c0.accent : c0.lumiere, sombre ? 0.55 : 0.4)); lav.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = lav; x.fillRect(0, 0, cw, ch);
    x.globalCompositeOperation = 'multiply';
    const g = x.createLinearGradient(0, 0, 0, ch); g.addColorStop(0, '#FFFFFF'); g.addColorStop(0.6, '#F2F2F2'); g.addColorStop(1, '#8E8E8E');
    x.fillStyle = g; x.fillRect(0, 0, cw, ch);
    x.globalCompositeOperation = 'source-over';
    x.fillStyle = melange(c0.accent, '#000000', 0.35); x.fillRect(0, ch - 7, cw, 7);
    x.fillStyle = c0.metal; x.fillRect(0, ch - 8, cw, 1.4);
    return texDe(c);
  }

  function peindrePlafond(t) {
    const c0 = t.couleurs; const cw = L * 24; const ch = P * 24;
    const [c, x] = toile(cw, ch);
    x.fillStyle = melange(c0.plafond, '#000000', 0.08); x.fillRect(0, 0, cw, ch);
    for (const lx of LIGNES_LED) { const px = (lx + L / 2) * 24; x.fillStyle = 'rgba(0,0,0,.35)'; x.fillRect(px - 4, 24, 8, ch - 150); }
    x.globalCompositeOperation = 'screen';
    for (const lx of LIGNES_LED) {
      const px = (lx + L / 2) * 24; const g = x.createLinearGradient(px - 40, 0, px + 40, 0);
      g.addColorStop(0, rgba(c0.lumiere, 0)); g.addColorStop(0.5, rgba(c0.lumiere, 0.3)); g.addColorStop(1, rgba(c0.lumiere, 0));
      x.fillStyle = g; x.fillRect(px - 40, 24, 80, ch - 150);
    }
    const b = x.createLinearGradient(0, 0, 30, 0); b.addColorStop(0, rgba(c0.lumiere, 0.3)); b.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = b; x.fillRect(0, 0, 30, ch); x.save(); x.translate(cw, 0); x.scale(-1, 1); x.fillRect(0, 0, 30, ch); x.restore();
    x.globalCompositeOperation = 'source-over';
    return texDe(c);
  }

  /* --------------------- Textes, étiquettes, écran --------------------- */
  function style(t) {
    const d = t.decor || []; const c = t.couleurs;
    if (d.includes('neon')) return { neon: true, texte: c.accent, metal: c.metal, police: `800 {t}px ${SANS}`, maj: true, sombre: true };
    const sombre = luminance(c.mur) < 0.35;
    return { neon: false, texte: sombre ? c.metal : c.accent, metal: c.metal, police: (d.includes('sapin') ? 'italic ' : '') + `500 {t}px ${SERIF}`, maj: false, sombre };
  }
  /** Titre lumineux flottant (au-dessus d'une vitrine, d'une porte). */
  function titreLumineux(texte, st, w = 1024, h = 200) {
    const [c, x] = toile(w, h);
    const txt = st.maj ? texte.toUpperCase() : texte;
    x.textAlign = 'center'; x.textBaseline = 'middle';
    let taille;
    if (st.neon || st.sombre) {
      x.shadowColor = st.texte; x.shadowBlur = 26; x.fillStyle = st.texte;
      taille = texteAjuste(x, txt, w / 2, h / 2 - 8, w - 80, st.police, Math.round(h * 0.42));
      x.shadowBlur = 0; x.fillStyle = st.neon ? '#FFE8E5' : melange(st.texte, '#ffffff', 0.45);
      texteAjuste(x, txt, w / 2, h / 2 - 8, w - 80, st.police, taille);
    } else {
      x.fillStyle = st.texte;
      taille = texteAjuste(x, txt, w / 2, h / 2 - 8, w - 80, st.police, Math.round(h * 0.42));
    }
    const lw = Math.min(w - 120, x.measureText(txt).width * 0.6);
    const g = x.createLinearGradient(w / 2 - lw / 2, 0, w / 2 + lw / 2, 0);
    g.addColorStop(0, rgba(st.metal, 0)); g.addColorStop(0.5, rgba(st.metal, 1)); g.addColorStop(1, rgba(st.metal, 0));
    x.fillStyle = g; x.fillRect(w / 2 - lw / 2, h / 2 + taille * 0.42, lw, 3);
    return texDe(c);
  }
  /** Étiquette « verre » flottante (prix). */
  function etiquette(texte, st, ok) {
    const [c, x] = toile(512, 120);
    chemin(x, 6, 10, 500, 100, 22); x.fillStyle = 'rgba(10,12,18,.74)'; x.fill();
    x.lineWidth = 2.5; x.strokeStyle = ok ? rgba(st.neon ? st.texte : st.metal, 0.95) : 'rgba(160,160,160,.6)';
    if (ok) { x.shadowColor = st.neon ? st.texte : st.metal; x.shadowBlur = 10; }
    x.stroke(); x.shadowBlur = 0;
    x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = ok ? '#FFFFFF' : '#A9A9A9';
    texteAjuste(x, texte, 256, 62, 460, `700 {t}px ${SANS}`, 46);
    return texDe(c);
  }
  const eurosTxt = (n) => (Number.isInteger(Number(n)) ? `€${n}` : `€${Number(n).toFixed(2)}`);
  const prixCourt = (p) => {
    if (p.type === 'carte') return `€${cat.montantLibre.min} – €${cat.montantLibre.max}${p.promo ? ` · −${p.promo.remise}%` : ''}`;
    return p.prix == null ? cat.textes.prixADefinir : eurosTxt(p.prix);
  };
  /* --------------------------- Promotions (vente flash) --------------------------- */
  const OR_FLASH = '#FFD23F';
  const promoDe = (slug) => (cat.promotions || []).find((pr) => pr.boutique === slug) || null;
  const ciblePromo = (pr) => {
    const t = pr.types || []; const noms = { pack: 'packs', carte: 'cards', abonnement: 'subscriptions' };
    return t.length === 1 ? `on ${noms[t[0]] || t[0]}` : t.length ? 'on a selection' : 'on the whole store';
  };
  const sousTitrePromo = (b) => { const pr = promoDe(b.slug); return pr ? `${pr.accroche || pr.libelle} · −${pr.remise}% ${ciblePromo(pr)}` : null; };
  // Bannières animées « VENTE FLASH » (une par promotion, partagée entre façade et intérieur)
  const bannieres = new Map();
  function banniere(pr, couleurs) {
    if (!bannieres.has(pr.id || pr.libelle)) {
      const [c, x] = E.toile(1024, 180);
      const opts = { remise: pr.remise, cible: ciblePromo(pr), fin: pr.fin, accent: couleurs.accent, metal: couleurs.metal, style: pr.style || 'flash', accroche: pr.accroche || pr.libelle };
      E.peindreBanniere(x, 1024, 180, 0, opts);
      bannieres.set(pr.id || pr.libelle, { c, x, tex: texDe(c, true, false), opts });
    }
    return bannieres.get(pr.id || pr.libelle);
  }
  let derniereBanniere = 0;
  function majBannieres(t) {
    for (const bn of bannieres.values()) { E.peindreBanniere(bn.x, 1024, 180, t, bn.opts); bn.tex.needsUpdate = true; }
  }
  const stickers = new Map();
  const stickerTex = (remise, style = 'flash') => {
    const k = `${style}:${remise}`;
    if (!stickers.has(k)) stickers.set(k, texDe(E.peindreAutocollant(remise, { style }), true, false));
    return stickers.get(k);
  };
  const TEX_FAISCEAU = texDe(E.peindreFaisceau(), false, false);
  // Animation de la vitrine en promo (réinitialisée à chaque boutique)
  let promoAnim = null;

  /* ===================================================================== */
  /*  INTÉRIEUR — construit une fois, rhabillé à chaque boutique            */
  /* ===================================================================== */
  const M = {
    sol: STD ? matStd({ color: 0x000000, emissive: 0xffffff, roughness: 0.16, metalness: 0, envMapIntensity: 0.55 }, false) : matBasic({}, false),
    plafond: matBasic({}, false), murG: matBasic({}, false), murD: matBasic({}, false), murF: matBasic({}, false), murA: matBasic({}, false),
    allee: matStd({ color: 0x111111, roughness: 0.08, metalness: 0.3, envMapIntensity: 1 }, false),
    meuble: matStd({ roughness: 0.5, metalness: 0.02, envMapIntensity: 0.6 }, false),
    socle: matStd({ color: 0x0c0c0e, roughness: 0.6 }, false),
    plateau: matStd({ roughness: 0.14, metalness: 0.02, envMapIntensity: 1 }, false),
    metal: matStd({ color: 0xc9a24b, roughness: 0.22, metalness: 1, envMapIntensity: 1.2 }, false),
    verre: matStd({ color: 0xffffff, transparent: true, opacity: 0.1, roughness: 0.02, metalness: 0, depthWrite: false, envMapIntensity: 1.6 }, false),
    etagere: matStd({ color: 0xffffff, transparent: true, opacity: 0.28, roughness: 0.04, metalness: 0, depthWrite: false, envMapIntensity: 1.2 }, false),
    caisson: matBasic({}, false),
    led: matBasic({ color: 0xffffff }, false),
    ledAccent: matBasic({ color: 0xffffff }, false),
  };
  const sol = plan(L, P, M.sol, 0, 0, -P / 2, groupeInterieur); sol.rotation.x = -Math.PI / 2;
  const plaf = plan(L, P, M.plafond, 0, H, -P / 2, groupeInterieur); plaf.rotation.x = Math.PI / 2;
  const murG = plan(P, H, M.murG, -L / 2, H / 2, -P / 2, groupeInterieur); murG.rotation.y = Math.PI / 2;
  const murD = plan(P, H, M.murD, L / 2, H / 2, -P / 2, groupeInterieur); murD.rotation.y = -Math.PI / 2;
  plan(L, H, M.murF, 0, H / 2, ZF, groupeInterieur);
  const murA = plan(L, H, M.murA, 0, H / 2, 0, groupeInterieur); murA.rotation.y = Math.PI;

  /* ---------------- Hologrammes (touche technologique, bien visible) ----------------
     - anneaux holographiques qui tournent au sol (entrée de la boutique, parvis de la façade)
     - impulsions de lumière qui filent le long de l'allée
     - barre de scan qui balaie chaque vitrine
     - façade : cartes géantes en orbite + faisceaux qui balaient le ciel */
  const HOLO = '#5FE3FF';
  const holoSols = []; const orbite = []; const faisceauxCiel = []; const pulses = [];
  let scans = [];
  let animDecor = []; // animations du décor propre à la boutique (Noël, Black Friday), remises à zéro à chaque thème
  function anneauxHolo(parent, x, z, r, couleur) {
    const grp = new THREE.Group(); grp.position.set(x, 0.03, z); grp.rotation.x = -Math.PI / 2; parent.add(grp);
    const mat = matBasic({ color: lumineux(couleur, 2.4), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }, false);
    [[1, 0.04, 5.2], [0.82, 0.02, 4.2], [0.6, 0.06, 1.7], [0.38, 0.015, 6.0], [0.6, 0.06, 1.7]].forEach(([k, ep, arc], i) => {
      const m = new THREE.Mesh(new THREE.RingGeometry(r * k - ep, r * k, 96, 1, i * 1.9 + (i === 4 ? Math.PI : 0), arc), mat);
      m.userData.vit = (i % 2 ? -1 : 1) * (0.3 + i * 0.2); m.renderOrder = 8; grp.add(m);
    });
    grp.userData.mat = mat;
    return grp;
  }
  const holoEntree = anneauxHolo(groupeInterieur, 0, -6.4, 1.02, HOLO);
  holoSols.push(holoEntree);
  const matPulse = matBasic({ color: 0xffffff }, false);
  for (const x of [-1.05, 1.05]) for (let k = 0; k < 3; k++) {
    const m = boite(0.034, 0.014, 1.1, matPulse, x, 0.014, -5, groupeInterieur);
    m.userData.dec = k / 3 + (x > 0 ? 0.17 : 0); m.visible = !reduit; pulses.push(m);
  }

  // Allée : verre sombre bordé de deux filets lumineux
  const allee = plan(2.1, 15.8, M.allee, 0, 0.004, -9.4, groupeInterieur); allee.rotation.x = -Math.PI / 2;
  for (const x of [-1.05, 1.05]) boite(0.022, 0.006, 15.8, M.ledAccent, x, 0.006, -9.4, groupeInterieur);
  // Rubans LED au plafond + corniches lumineuses
  for (const x of LIGNES_LED) boite(0.05, 0.012, 16.6, M.led, x, H - 0.012, -9.2, groupeInterieur);
  for (const x of [-L / 2 + 0.06, L / 2 - 0.06]) boite(0.035, 0.035, P - 0.6, M.ledAccent, x, H - 0.16, -P / 2, groupeInterieur);
  boite(L - 0.4, 0.035, 0.035, M.ledAccent, 0, H - 0.16, ZF + 0.06, groupeInterieur);

  // Architecture en relief : pilastres entre les vitrines (filet lumineux vertical) et poutres
  // au plafond. Donne du volume et de la parallaxe à une salle sinon faite de murs plats.
  M.pilastre = matStd({ color: 0x888888, roughness: 0.55, metalness: 0.1, envMapIntensity: 0.7 }, false);
  for (const z of [-2.2, -6.2, -10.2, -14.2, -18.2]) {
    for (const cote of [-1, 1]) {
      boite(0.2, H, 0.36, M.pilastre, cote * (L / 2 - 0.1), H / 2, z, groupeInterieur);
      boite(0.24, 0.12, 0.42, M.metal, cote * (L / 2 - 0.12), 0.06, z, groupeInterieur);
      boite(0.012, H - 0.9, 0.03, M.ledAccent, cote * (L / 2 - 0.206), H / 2 + 0.05, z, groupeInterieur);
    }
    boite(L - 0.4, 0.16, 0.36, M.pilastre, 0, H - 0.08, z, groupeInterieur);
  }
  // Reflets réels sur le sol et l'allée (appareils puissants)
  const forceSol = miroir ? miroir.appliquer(M.sol, 0.5) : null;
  if (miroir) miroir.appliquer(M.allee, 0.75);

  // Vitrines : pièces fixes instanciées sur les 8 emplacements
  const PIECES = [
    { mat: M.socle, parts: [[3.3, 0.09, 0.6, 0, 0.045, -0.02]] },
    { mat: M.meuble, parts: [[3.4, 0.82, 0.7, 0, 0.5, 0]] },
    {
      mat: M.metal,
      parts: [
        [3.44, 0.022, 0.74, 0, 0.92, 0],
        [0.03, 1.5, 0.03, -1.7, 1.68, 0.33], [0.03, 1.5, 0.03, 1.7, 1.68, 0.33],
        [0.03, 1.5, 0.03, -1.7, 1.68, -0.33], [0.03, 1.5, 0.03, 1.7, 1.68, -0.33],
        [3.44, 0.03, 0.03, 0, 2.44, 0.33], [3.44, 0.03, 0.03, 0, 2.44, -0.33],
        [0.03, 0.03, 0.7, -1.7, 2.44, 0], [0.03, 0.03, 0.7, 1.7, 2.44, 0],
      ],
    },
    { mat: M.caisson, parts: [[3.36, 1.5, 0.02, 0, 1.68, -0.33]] },
    { mat: M.led, parts: [[3.3, 0.012, 0.012, 0, 2.415, 0.3]] },
    { mat: M.etagere, parts: [[3.3, 0.018, 0.56, 0, 1.18, 0]], ordre: 4 },
    { mat: M.verre, parts: [[3.36, 1.5, 0.008, 0, 1.68, 0.335], [0.008, 1.5, 0.66, -1.69, 1.68, 0], [0.008, 1.5, 0.66, 1.69, 1.68, 0], [3.36, 0.008, 0.66, 0, 2.43, 0]], ordre: 6 },
  ];
  const instances = PIECES.map((pc) => {
    const im = new THREE.InstancedMesh(GEO.boite, pc.mat, SLOTS.length * pc.parts.length);
    im.frustumCulled = false;
    if (pc.ordre) im.renderOrder = pc.ordre;
    groupeInterieur.add(im);
    return { pc, im };
  });
  const slotsG = SLOTS.map((s) => {
    const g = new THREE.Group();
    g.position.set(s.cote * (L / 2 - 0.38), 0, s.z);
    g.rotation.y = s.cote < 0 ? Math.PI / 2 : -Math.PI / 2;
    groupeInterieur.add(g);
    g.updateMatrixWorld(true);
    return g;
  });
  function placerVitrines(nb) {
    const m = new THREE.Matrix4(); const loc = new THREE.Matrix4(); const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (const { pc, im } of instances) {
      let k = 0;
      SLOTS.forEach((_, s) => {
        for (const [w, h, d, x, y, z] of pc.parts) {
          if (s < nb) { loc.compose(V(x, y, z), new THREE.Quaternion(), V(w, h, d)); m.multiplyMatrices(slotsG[s].matrix, loc); im.setMatrixAt(k, m); }
          else im.setMatrixAt(k, zero);
          k++;
        }
      });
      im.instanceMatrix.needsUpdate = true;
    }
  }

  // Comptoir : plateau en cascade, liseré, LED sous plateau, suspension linéaire
  const comptoir = new THREE.Group();
  comptoir.position.set(0, 0, COMPTOIR_Z);
  groupeInterieur.add(comptoir);
  boite(4.4, 0.09, 0.8, M.socle, 0, 0.045, 0, comptoir);
  boite(4.6, 0.9, 0.9, M.meuble, 0, 0.54, 0, comptoir);
  boite(4.85, 0.07, 1.08, M.plateau, 0, 1.035, 0, comptoir);
  for (const sx of [-2.39, 2.39]) boite(0.07, 1.035, 1.08, M.plateau, sx, 0.5, 0, comptoir);
  boite(4.71, 0.02, 0.025, M.metal, 0, 0.993, 0.545, comptoir);
  boite(4.4, 0.014, 0.02, M.led, 0, 0.975, 0.5, comptoir);
  const lueurComptoir = plan(5.4, 1.5, matHalo(0xffffff, 0.35, false), 0, 0.012, 1.0, comptoir);
  lueurComptoir.rotation.x = -Math.PI / 2;
  boite(0.006, 1.3, 0.006, M.metal, -1.4, H - 0.65, 0.05, comptoir); boite(0.006, 1.3, 0.006, M.metal, 1.4, H - 0.65, 0.05, comptoir);
  boite(3.3, 0.045, 0.1, M.socle, 0, H - 1.32, 0.05, comptoir);
  boite(3.2, 0.01, 0.05, M.led, 0, H - 1.347, 0.05, comptoir);
  const plaqueComptoir = plan(2.2, 0.4, matBasic({ transparent: true }, false), 0, 0.6, 0.456, comptoir); plaqueComptoir.renderOrder = 2;
  const holo = plan(1.9, 0.52, matBasic({ transparent: true, depthWrite: false }, false), 0, 2.25, 0.1, comptoir); holo.renderOrder = 7;
  const groupePresentoir = new THREE.Group(); groupePresentoir.position.set(-1.25, 1.07, 0.02); comptoir.add(groupePresentoir);
  const groupePanier = new THREE.Group(); groupePanier.position.set(1.3, 1.07, 0.08); comptoir.add(groupePanier);
  boite(0.95, 0.018, 0.62, M.metal, 0, 0.009, 0, groupePanier);
  const cartesPanier = new THREE.Group(); groupePanier.add(cartesPanier);
  boite(0.16, 0.04, 0.26, matStd({ color: 0x111111, roughness: 0.3 }, false), 0.25, 1.09, -0.2, comptoir);
  const ecranTPE = plan(0.12, 0.085, matBasic({ color: lumineux('#8fd0ff', 1.6) }, false), 0.25, 1.113, -0.19, comptoir);
  ecranTPE.rotation.x = -Math.PI / 2 + 0.35;

  // Écran numérique au fond (animé)
  const [ecranC, ecranX] = toile(1024, 300);
  const ecranTex = texDe(ecranC, true, false);
  plan(5.2, 1.52, matBasic({ map: ecranTex, color: lumineux('#ffffff', 1.35) }, false), 0, 3.0, ZF + 0.04, groupeInterieur);
  boite(5.32, 1.64, 0.05, M.socle, 0, 3.0, ZF + 0.012, groupeInterieur);

  /* ---------------- Hologramme « newsletter » (à gauche du comptoir) ----------------
     Projecteur sur pied + faisceau + panneau holographique animé qui se tourne vers
     le visiteur, anneaux qui tournent et particules qui montent. Cliquable. */
  const NL = cat.experience && cat.experience.newsletter;
  const HOLO_X = -2.95; const HOLO_Z = COMPTOIR_Z + 0.05;
  const holoNl = NL && NL.actif ? (() => {
    const CYAN = '#5FE3FF';
    const g = new THREE.Group(); g.position.set(HOLO_X, 0, HOLO_Z); groupeInterieur.add(g);
    const mEmet = matBasic({ color: lumineux(CYAN, 2.6) }, false);
    const mSombre = matStd({ color: 0x0b1216, roughness: 0.3, metalness: 0.85, envMapIntensity: 1.1 }, false);
    cylindre(0.34, 0.06, mSombre, 0, 0.03, 0, g);
    cylindre(0.355, 0.014, mEmet, 0, 0.066, 0, g);
    cylindre(0.1, 0.9, mSombre, 0, 0.5, 0, g);
    for (const y of [0.32, 0.56, 0.8]) cylindre(0.106, 0.014, mEmet, 0, y, 0, g);
    cylindre(0.26, 0.07, mSombre, 0, 0.98, 0, g);
    cylindre(0.27, 0.012, mEmet, 0, 0.95, 0, g);
    cylindre(0.19, 0.01, matBasic({ color: lumineux('#E8FDFF', 3) }, false), 0, 1.02, 0, g);
    // Faisceau conique (de la lentille au bas du panneau)
    const [cf, xf] = toile(4, 128);
    { const d = xf.createLinearGradient(0, 0, 0, 128); d.addColorStop(0, 'rgba(255,255,255,0)'); d.addColorStop(1, 'rgba(255,255,255,1)'); xf.fillStyle = d; xf.fillRect(0, 0, 4, 128); }
    const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.17, 0.3, 32, 1, true),
      matBasic({ map: texDe(cf, false, false), color: lumineux(CYAN, 1.3), transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }, false));
    cone.position.y = 1.17; cone.renderOrder = 6; g.add(cone);
    // Halo au sol + anneau gravé qui tourne
    const halo = plan(1.9, 1.9, matHalo(CYAN, 0.32, false), 0, 0.012, 0, g); halo.rotation.x = -Math.PI / 2;
    const peindreAnneaux = (n, epais) => {
      const [c, x] = toile(256, 256); x.strokeStyle = '#fff'; x.lineCap = 'round';
      for (let i = 0; i < n; i++) { x.lineWidth = epais; const a = (i / n) * Math.PI * 2; x.beginPath(); x.arc(128, 128, 112, a, a + (Math.PI * 2 / n) * 0.62); x.stroke(); }
      x.lineWidth = 2; x.globalAlpha = 0.6; x.beginPath(); x.arc(128, 128, 92, 0, Math.PI * 2); x.stroke();
      for (let i = 0; i < 36; i++) { const a = (i / 36) * Math.PI * 2; x.beginPath(); x.moveTo(128 + Math.cos(a) * 80, 128 + Math.sin(a) * 80); x.lineTo(128 + Math.cos(a) * (i % 3 ? 85 : 89), 128 + Math.sin(a) * (i % 3 ? 85 : 89)); x.stroke(); }
      return texDe(c, false, false);
    };
    const mAnneau = (tex, op) => matBasic({ map: tex, color: lumineux(CYAN, 1.8), transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }, false);
    const anneauSol = plan(1.25, 1.25, mAnneau(peindreAnneaux(6, 6), 0.55), 0, 0.016, 0, g); anneauSol.rotation.x = -Math.PI / 2; anneauSol.renderOrder = 6;
    // Pivot : tout ce qui flotte se tourne vers le visiteur
    const pivot = new THREE.Group(); g.add(pivot);
    const anneauBas = plan(0.78, 0.78, mAnneau(peindreAnneaux(3, 9), 0.75), 0, 1.06, 0, pivot); anneauBas.rotation.x = -Math.PI / 2; anneauBas.renderOrder = 6;
    const [cH, xH] = toile(512, 680);
    const texH = texDe(cH, true, false);
    const mPanneau = matBasic({ map: texH, color: lumineux('#ffffff', 1.12), transparent: true, depthWrite: false, side: THREE.DoubleSide }, false);
    const panneau = plan(0.98, 1.3, mPanneau, 0, 1.98, 0, pivot); panneau.renderOrder = 8;
    // Arcs en orbite autour du panneau
    const orbite = plan(1.5, 1.5, mAnneau(peindreAnneaux(4, 4), 0.35), 0, 1.98, -0.05, pivot); orbite.renderOrder = 7;
    // Particules qui montent dans le faisceau
    const N = 46; const pos = new Float32Array(N * 3); const vit = new Float32Array(N);
    const semer = (i, y) => { const a = Math.random() * Math.PI * 2; const r = Math.random() * 0.42; pos[i * 3] = Math.cos(a) * r; pos[i * 3 + 1] = y; pos[i * 3 + 2] = Math.sin(a) * r * 0.5; vit[i] = 0.18 + Math.random() * 0.35; };
    for (let i = 0; i < N; i++) semer(i, 1.02 + Math.random() * 1.6);
    const geoP = new THREE.BufferGeometry(); geoP.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const points = new THREE.Points(geoP, new THREE.PointsMaterial({ size: 0.028, map: TEX_HALO, color: lumineux(CYAN, 2.2), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    points.frustumCulled = false; pivot.add(points);
    // Zones de clic ajustées à ce qu'on voit : le panneau (dans le pivot, donc toujours face au visiteur,
    // un peu plus grand pour viser facilement de loin) + le projecteur. Rien d'autre : la porte voisine reste libre.
    const zoneP = cliquable(boite(1.12, 1.46, 0.1, matInvisible, 0, 1.98, 0, pivot), { type: 'newsletter' });
    const zoneB = cliquable(boite(0.62, 1.3, 0.62, matInvisible, 0, 0.65, 0, g), { type: 'newsletter' });
    const zone = [zoneP, zoneB];
    const opts = { titre: NL.titre || 'Join the club', sousTitre: 'NEWSLETTER', bouton: 'Tap to subscribe', abonne: false };
    E.peindreHolo(xH, 512, 680, 0, opts); texH.needsUpdate = true;
    return { g, pivot, panneau, mPanneau, cone, anneauBas, anneauSol, orbite, points, geoP, pos, vit, semer, N, texH, xH, opts, zone, flash: 0, glitch: 0, derniere: 0 };
  })() : null;

  /* ---------------- Hôtesse 3D (style film d'animation) : au comptoir et devant chaque porte ----------------
     Même jeune femme partout (grands yeux marron, carré gris foncé, frange de côté) ; tenue selon la boutique :
     sweat zippé gris et short (générale), bomber noir-orangé et sac shopping (Black Friday), robe de Noël à
     fourrure et bonnet (Christmas). Ombrage « dessin animé » indépendant des lumières : toujours lisible.
     Toucher une hôtesse de porte = entrer dans sa boutique. */
  const cachePersos = new Map();
  const groupePersos = new THREE.Group(); groupeInterieur.add(groupePersos);
  let personnages = [];
  const remiseBF = () => { const pr = (cat.promotions || []).find((x) => x.boutique === 'black-friday'); return pr ? `-${pr.remise}%` : 'SALE'; };
  function creerPersonnage(variante, x, z, ry, role, cible = null, lumiere = null) {
    const cle = `${variante}|${role}`;
    let perso = cachePersos.get(cle);
    if (!perso) { perso = PERS.construireHotesse({ variante, pose: role === 'comptoir' ? 'comptoir' : 'debout' }); cachePersos.set(cle, perso); }
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; groupePersos.add(g);
    const uniforms = { uRim: { value: new THREE.Color(lumiere || PERS.lumiereVariante(variante)) }, uExpo: { value: 1 } };
    const mat = garder(new THREE.ShaderMaterial({ uniforms, vertexShader: PERS.SHADER_TOON.vertex, fragmentShader: PERS.SHADER_TOON.fragment, side: THREE.DoubleSide }));
    const meshes = {};
    for (const [nom, m] of Object.entries(perso.maillages)) {
      const geo = garder(new THREE.BufferGeometry());
      geo.setAttribute('position', new THREE.BufferAttribute(m.positions, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(m.normales, 3));
      geo.setAttribute('teinte', new THREE.BufferAttribute(m.couleurs, 3));
      geo.setAttribute('drapeau', new THREE.BufferAttribute(m.drapeaux, 2));
      geo.setIndex(new THREE.BufferAttribute(m.indices, 1));
      const me = new THREE.Mesh(geo, mat); me.matrixAutoUpdate = false; me.frustumCulled = false; g.add(me);
      meshes[nom] = me;
    }
    if (perso.badge) { // badge Black Friday : la vraie remise en cours
      const b = plan(0.05, 0.027, matBasic({ map: texDe(E.peindreBadgeHolo(remiseBF(), '#FFC94A')), transparent: true }), ...perso.badge, meshes.torse);
      b.rotation.y = -0.35; b.renderOrder = 3;
    }
    if (role !== 'comptoir') ombreAuSol(0.36, x, z + 0.02, groupePersos, 0.55);
    const p = { g, meshes, perso, x, z, ry, role, uniforms, etat: PERS.creerEtat(personnages.length + variante.length * 7), zone: null };
    if (cible) p.zone = cliquable(boite(0.7, 1.9, 0.6, matInvisible, x, 0.95, z, groupePersos), cible);
    majPersonnage(p, 0, 0);
    personnages.push(p);
    return p;
  }
  function majPersonnage(p, dt, t) {
    const dx = nav.pos.x - p.x; const dz = nav.pos.z - p.z; const dist = Math.hypot(dx, dz);
    if (dist > 24) return;
    let vers = Math.atan2(dx, dz) - p.ry; vers = Math.atan2(Math.sin(vers), Math.cos(vers));
    const rg = dir(nav.yaw, 0); const face = (-dx * rg.x - dz * rg.z) / (dist || 1) > 0.86;
    const e = PERS.avancer(p.etat, dt, t, { vers, dist, face, role: p.role });
    const rots = PERS.animer(p.perso, reduit ? 1 : t, reduit ? { regard: e.regard, regardYeux: e.regardYeux, sourire: e.sourire, phase: e.phase } : e);
    const mats = PERS.matricesOs(p.perso, rots);
    for (const nom in p.meshes) { const me = p.meshes[nom]; me.matrix.fromArray(mats[nom]); me.matrixWorldNeedsUpdate = true; }
  }
  const varianteDe = (b) => PERS.varianteDe(E.genre(b.theme));

  /** Anime l'hologramme : orientation, flottement, scintillement, particules, texture. */
  function majHolo(dt, maintenant) {
    const h = holoNl;
    const dx = nav.pos.x - HOLO_X; const dz = nav.pos.z - HOLO_Z; const dist = Math.hypot(dx, dz);
    if (dist > 17) return;
    const cible = clamp(Math.atan2(dx, dz), -1.05, 1.05);
    h.pivot.rotation.y += (cible - h.pivot.rotation.y) * Math.min(1, dt * 2.5);
    h.flash = Math.max(0, h.flash - dt * 1.6);
    if (!reduit) {
      h.pivot.position.y = Math.sin(temps * 1.3) * 0.022;
      h.anneauBas.rotation.z += dt * 0.9; h.anneauSol.rotation.z -= dt * 0.35; h.orbite.rotation.z -= dt * 0.25;
      if (h.glitch <= 0 && Math.random() < 0.0035) h.glitch = 0.09 + Math.random() * 0.08;
      if (h.glitch > 0) h.glitch -= dt;
      const scint = h.glitch > 0 ? 0.35 + Math.random() * 0.4 : 0.9 + 0.1 * Math.sin(temps * 21);
      h.mPanneau.opacity = scint;
      h.panneau.position.x = h.glitch > 0 ? (Math.random() - 0.5) * 0.04 : 0;
      for (let i = 0; i < h.N; i++) { h.pos[i * 3 + 1] += h.vit[i] * dt; if (h.pos[i * 3 + 1] > 2.7) h.semer(i, 1.02); }
      h.geoP.attributes.position.needsUpdate = true;
    }
    h.mPanneau.color.copy(lumineux('#ffffff', 1.12 + h.flash * 1.1));
    h.cone.material.opacity = 0.5 + h.flash * 0.4 + (reduit ? 0 : 0.06 * Math.sin(temps * 6));
    if (dist < 14 && maintenant - h.derniere > (reduit ? 1000 : niveau > 0 ? 66 : 120)) { h.derniere = maintenant; E.peindreHolo(h.xH, 512, 680, temps, h.opts); h.texH.needsUpdate = true; }
  }

  const groupePortes = new THREE.Group(); groupeInterieur.add(groupePortes);
  const groupeDecor = new THREE.Group(); groupeInterieur.add(groupeDecor);

  // Reflet balayant la vitre de la vitrine active
  const [cr, xr] = toile(256, 4);
  { const g = xr.createLinearGradient(0, 0, 256, 0); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)'); xr.fillStyle = g; xr.fillRect(0, 0, 256, 4); }
  const reflet = plan(0.45, 1.5, matBasic({ map: texDe(cr, false, false), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }, false), 0, 1.68, 0.345);
  reflet.rotation.z = -0.25; reflet.renderOrder = 8;

  // Repère au sol (« touche pour aller ici »)
  const repere = new THREE.Mesh(new THREE.RingGeometry(0.16, 0.2, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
  repere.rotation.x = -Math.PI / 2; repere.position.y = 0.012; repere.renderOrder = 9;
  scene.add(repere);

  /* ------------------------------ Décors ------------------------------ */
  const ampoules = [];
  let neonMats = [];
  let facteurCartes = 1; // luminosité des cartes en vitrine (theme.vitrines.luminositeCartes)
  function lampadaire(t) { // colonne de verre dépoli lumineuse
    const g = new THREE.Group();
    cylindre(0.24, 0.06, M.metal, 0, 0.03, 0, g);
    cylindre(0.11, 1.9, matBasic({ color: lumineux(t.couleurs.lumiere, 1.5) }), 0, 1.0, 0, g);
    cylindre(0.13, 0.03, M.metal, 0, 1.96, 0, g);
    plan(1.2, 2.4, matHalo(t.couleurs.lumiere, 0.18), 0, 1.0, 0.2, g);
    ombreAuSol(0.55, 0, 0, g);
    return g;
  }
  function arbreLumineux(h, t) { // sapin de Noël en points de lumière (spirale)
    const g = new THREE.Group();
    const n = 160; const im = new THREE.InstancedMesh(garder(new THREE.SphereGeometry(0.022, 8, 6)), matBasic({ color: 0xffffff }), n);
    const m4 = new THREE.Matrix4(); const col = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const u = i / n; const y = 0.15 + u * h; const rad = (1 - u) * h * 0.36; const a = u * Math.PI * 2 * 9;
      m4.makeTranslation(Math.cos(a) * rad, y, Math.sin(a) * rad); im.setMatrixAt(i, m4);
      im.setColorAt(i, col.copy(lumineux(i % 4 ? t.couleurs.metal : '#FFF4DC', 2.2)));
    }
    g.add(im); ampoules.push(im);
    const etoile = new THREE.Mesh(garder(new THREE.OctahedronGeometry(0.1)), matBasic({ color: lumineux(t.couleurs.metal, 3) }));
    etoile.position.y = h + 0.2; etoile.userData.tourne = true; g.add(etoile);
    plan(h, h * 1.3, matHalo(t.couleurs.metal, 0.12), 0, h * 0.55, 0, g);
    cylindre(0.3, 0.08, M.metal, 0, 0.04, 0, g);
    ombreAuSol(0.8, 0, 0, g, 0.5);
    return g;
  }
  function colonneNeon(t) {
    const g = new THREE.Group();
    cylindre(0.16, 2.3, matStd({ color: 0x0b0b0d, roughness: 0.25, metalness: 0.4 }), 0, 1.15, 0, g);
    for (const y of [0.6, 1.3, 2.0]) {
      const anneau = new THREE.Mesh(garder(new THREE.TorusGeometry(0.2, 0.012, 8, 48)), matBasic({ color: lumineux(t.couleurs.accent, 3) }));
      anneau.position.y = y; anneau.rotation.x = Math.PI / 2; g.add(anneau); neonMats.push(anneau.material);
    }
    ombreAuSol(0.5, 0, 0, g);
    return g;
  }
  function decorPour(t) {
    const d = t.decor || [];
    if (d.includes('sapin')) return arbreLumineux(2.1, t);
    if (d.includes('neon')) return colonneNeon(t);
    return lampadaire(t);
  }
  function guirlande(points, t, parent) {
    const geo = garder(new THREE.BufferGeometry().setFromPoints(points));
    parent.add(new THREE.Line(geo, garder(new THREE.LineBasicMaterial({ color: 0x2a2a2a }))));
    const courbe = new THREE.CatmullRomCurve3(points);
    const n = Math.floor(courbe.getLength() / 0.22);
    const im = new THREE.InstancedMesh(garder(new THREE.SphereGeometry(0.022, 8, 6)), matBasic({ color: 0xffffff }), n);
    const m4 = new THREE.Matrix4(); const col = new THREE.Color();
    for (let i = 0; i < n; i++) { const p = courbe.getPointAt(i / n); im.setMatrixAt(i, m4.makeTranslation(p.x, p.y - 0.02, p.z)); im.setColorAt(i, col.copy(lumineux(i % 3 ? '#FFE6B0' : t.couleurs.metal, 2.4))); }
    parent.add(im); ampoules.push(im);
  }
  function festons(x0, z0, x1, z1, y, creux, n, parent, t) {
    const pts = [];
    for (let k = 0; k <= n * 10; k++) { const u = k / (n * 10); const f = (u * n) % 1; pts.push(V(x0 + (x1 - x0) * u, y - creux * Math.sin(Math.PI * f), z0 + (z1 - z0) * u)); }
    guirlande(pts, t, parent);
  }

  /* ---------------- Décor de NOËL (en plus des sapins, guirlandes et de la neige) ----------------
     Tout est placé AU-DESSUS ou À CÔTÉ des vitrines, jamais devant les cartes :
     boules géantes suspendues qui se balancent, grande étoile lumineuse, neige posée et guirlande
     d'ampoules sur chaque vitrine (elle encadre les cartes), paquets cadeaux entre les vitrines. */
  function decorNoel(t, nbSections) {
    const c = t.couleurs; const r = alea(77);
    const teintes = ['#C8102E', c.metal, '#1F7A3A', '#F4F1EA'].map((col) => matStd({ color: col, metalness: 0.9, roughness: 0.16, envMapIntensity: 1.7 }));
    const geoB = garder(new THREE.SphereGeometry(1, 24, 16));
    for (const z of [-4.2, -8.2, -12.2, -16.2]) for (const x of [-3.5, -1.75, 1.75, 3.5]) {
      const piv = new THREE.Group(); piv.position.set(x + (r() - 0.5) * 0.3, H - 0.02, z + (r() - 0.5) * 1.2); groupeDecor.add(piv);
      const l = 0.4 + r() * 0.45; const ray = 0.1 + r() * 0.08;
      boite(0.006, l, 0.006, M.metal, 0, -l / 2, 0, piv);
      const s = new THREE.Mesh(geoB, teintes[Math.floor(r() * teintes.length)]); s.scale.setScalar(ray); s.position.y = -l - ray; piv.add(s);
      cylindre(ray * 0.3, 0.035, M.metal, 0, -l - 0.01, 0, piv);
      const ph = r() * 6.28; const amp = 0.05 + r() * 0.06;
      animDecor.push((dt, tt) => { piv.rotation.z = amp * Math.sin(tt * 0.9 + ph); piv.rotation.x = amp * 0.6 * Math.sin(tt * 0.7 + ph * 1.7); });
    }
    // Grande étoile à 8 branches, au-dessus de l'allée
    {
      const et = new THREE.Group(); et.position.set(0, 3.3, -10.2); groupeDecor.add(et);
      const geo = garder(new THREE.OctahedronGeometry(1)); const m = matBasic({ color: lumineux(c.metal, 3) });
      for (let k = 0; k < 4; k++) { const b = new THREE.Mesh(geo, m); b.scale.set(0.05, k % 2 ? 0.34 : 0.56, 0.05); b.rotation.z = k * Math.PI / 4; et.add(b); }
      const halo = plan(2.6, 2.6, matHalo(c.metal, 0.4), 0, 0, -0.05, et);
      boite(0.005, H - 3.3 - 0.55, 0.005, M.metal, 0, 3.3 + 0.56 + (H - 3.3 - 0.55) / 2, -10.2, groupeDecor);
      animDecor.push((dt, tt) => { et.rotation.y = 0.5 * Math.sin(tt * 0.5); const p = 1 + 0.1 * Math.sin(tt * 2.2); et.scale.setScalar(p); halo.material.opacity = 0.3 + 0.18 * Math.sin(tt * 2.2); });
    }
    // Sur chaque vitrine : neige posée + guirlande d'ampoules le long du haut de la vitre
    const mNeige = matStd({ color: 0xffffff, roughness: 0.95, metalness: 0, emissive: 0x9fb2cc, emissiveIntensity: 0.55 });
    const geoA = garder(new THREE.SphereGeometry(0.02, 8, 6));
    const coul = ['#FF3B3B', '#FFD27A', '#3DDC6A', '#FFFFFF'];
    const m4 = new THREE.Matrix4(); const col = new THREE.Color();
    for (let s = 0; s < nbSections; s++) {
      const g = new THREE.Group(); g.position.copy(slotsG[s].position); g.rotation.copy(slotsG[s].rotation); groupeDecor.add(g);
      boite(3.52, 0.06, 0.78, mNeige, 0, 2.485, 0, g);
      for (let k = 0; k < 7; k++) { const b = new THREE.Mesh(geoB, mNeige); b.scale.set(0.2 + r() * 0.2, 0.06 + r() * 0.05, 0.16 + r() * 0.1); b.position.set(-1.5 + k * 0.5 + (r() - 0.5) * 0.2, 2.5, 0.2 + r() * 0.15); g.add(b); }
      const n = 26; const im = new THREE.InstancedMesh(geoA, matBasic({ color: 0xffffff }), n);
      for (let k = 0; k < n; k++) { const u = k / (n - 1); im.setMatrixAt(k, m4.makeTranslation(-1.66 + u * 3.32, 2.4 - 0.07 * Math.abs(Math.sin(u * Math.PI * 4)), 0.36)); im.setColorAt(k, col.copy(lumineux(coul[k % 4], 2.6))); }
      g.add(im); ampoules.push(im);
    }
    // Paquets cadeaux entre les vitrines
    const papiers = ['#C8102E', '#1F7A3A', '#F4F1EA', c.metal].map((x) => matStd({ color: x, roughness: 0.45, metalness: 0.15 }));
    const ruban = matStd({ color: c.metal, roughness: 0.25, metalness: 0.9, envMapIntensity: 1.4 });
    const cadeau = (x, y, z, t2, ry, k) => {
      const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; groupeDecor.add(g);
      boite(t2, t2 * 0.8, t2, papiers[k % 4], 0, t2 * 0.4, 0, g);
      boite(t2 * 1.02, t2 * 0.81, t2 * 0.16, k % 4 === 3 ? papiers[0] : ruban, 0, t2 * 0.4, 0, g);
      boite(t2 * 0.16, t2 * 0.81, t2 * 1.02, k % 4 === 3 ? papiers[0] : ruban, 0, t2 * 0.4, 0, g);
    };
    let k = 0;
    for (const z of [-6.2, -10.2, -14.2]) for (const cote of [-1, 1]) {
      cadeau(cote * 6.5, 0, z, 0.34, r() * 0.5, k++); cadeau(cote * 6.5, 0.272, z, 0.22, r() * 1.2, k++);
    }
  }

  /* ---------------- Décor BLACK FRIDAY : couloir d'énergie ----------------
     Arches néon qui s'allument en cascade vers le fond, lasers qui balaient SOUS le plafond
     (au-dessus des vitrines), chevrons lumineux qui défilent sur l'allée. Rien devant les cartes. */
  function decorBlackFriday(t) {
    const c = t.couleurs;
    [-2.2, -6.2, -10.2, -14.2, -18.2].forEach((z, k) => {
      const base = lumineux(k % 2 ? c.metal : c.accent, 1);
      const m = matBasic({ color: base.clone() });
      for (const cote of [-1, 1]) boite(0.03, H - 0.3, 0.03, m, cote * (L / 2 - 0.24), (H - 0.3) / 2, z + 0.2, groupeDecor);
      boite(L - 0.48, 0.03, 0.03, m, 0, H - 0.2, z + 0.2, groupeDecor);
      animDecor.push((dt, tt) => { const u = (((tt * 0.9 - k * 0.24) % 1.7) + 1.7) % 1.7; const p = u < 0.5 ? Math.sin(Math.PI * u / 0.5) : 0; m.color.copy(base).multiplyScalar(0.45 + 4.5 * p); });
    });
    for (let k = 0; k < 6; k++) {
      const cote = k % 2 ? 1 : -1;
      const piv = new THREE.Group(); piv.position.set(cote * (L / 2 - 0.3), 3.72, -3.2 - Math.floor(k / 2) * 6.4); groupeDecor.add(piv);
      const m = matBasic({ color: lumineux(k % 3 ? c.accent : c.metal, 3.5), transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false });
      boite(13, 0.016, 0.016, m, -cote * 6.5, 0, 0, piv);
      cylindre(0.05, 0.1, matStd({ color: 0x0b0b0d, roughness: 0.3, metalness: 0.6 }), 0, 0, 0, piv);
      animDecor.push((dt, tt) => { piv.rotation.y = cote * 0.55 * Math.sin(tt * 0.6 + k * 1.3); piv.rotation.z = cote * 0.025 * Math.sin(tt * 0.45 + k); m.opacity = 0.55 + 0.3 * Math.sin(tt * 3 + k * 2); });
    }
    {
      const [cv, x] = toile(128, 128);
      x.strokeStyle = '#ffffff'; x.lineWidth = 12; x.lineCap = 'round'; x.lineJoin = 'round';
      x.beginPath(); x.moveTo(20, 96); x.lineTo(64, 44); x.lineTo(108, 96); x.stroke();
      const tx = texDe(cv, false); tx.wrapS = tx.wrapT = THREE.RepeatWrapping; tx.repeat.set(1, 14);
      const ch = plan(1.3, 15.2, matBasic({ map: tx, color: lumineux(c.accent, 2.2), transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false }), 0, 0.011, -9.4, groupeDecor);
      ch.rotation.x = -Math.PI / 2; ch.renderOrder = 7;
      animDecor.push((dt) => { tx.offset.y -= dt * 0.9; });
    }
  }

  // Neige (Noël) : très légère
  const NB_NEIGE = REGLAGES[2].neige;
  const neigeGeo = new THREE.BufferGeometry();
  const neigePos = new Float32Array(NB_NEIGE * 3); const neigeVit = new Float32Array(NB_NEIGE);
  { const r = alea(9); for (let i = 0; i < NB_NEIGE; i++) { neigePos[i * 3] = (r() - 0.5) * (L - 0.6); neigePos[i * 3 + 1] = r() * H; neigePos[i * 3 + 2] = -0.5 - r() * (P - 1); neigeVit[i] = 0.12 + r() * 0.2; } }
  neigeGeo.setAttribute('position', new THREE.BufferAttribute(neigePos, 3));
  const [cf, xf] = toile(32, 32);
  { const g = xf.createRadialGradient(16, 16, 0, 16, 16, 16); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)'); xf.fillStyle = g; xf.fillRect(0, 0, 32, 32); }
  const neige = new THREE.Points(neigeGeo, new THREE.PointsMaterial({ size: 0.028, map: texDe(cf, false, false), transparent: true, depthWrite: false, opacity: 0.6, toneMapped: false }));
  neige.frustumCulled = false;
  groupeInterieur.add(neige);
  const majNbNeige = () => neigeGeo.setDrawRange(0, REGLAGES[niveau].neige);
  majNbNeige();

  // Poussières de lumière : fines particules qui montent lentement dans l'air (profondeur, atmosphère)
  const NB_POUSSIERE = 260;
  const poussiereGeo = new THREE.BufferGeometry();
  const poussierePos = new Float32Array(NB_POUSSIERE * 3);
  { const r = alea(31); for (let i = 0; i < NB_POUSSIERE; i++) { poussierePos[i * 3] = (r() - 0.5) * (L - 1.2); poussierePos[i * 3 + 1] = 0.3 + r() * (H - 0.6); poussierePos[i * 3 + 2] = -0.8 - r() * (P - 2); } }
  poussiereGeo.setAttribute('position', new THREE.BufferAttribute(poussierePos, 3));
  const poussiere = new THREE.Points(poussiereGeo, new THREE.PointsMaterial({ size: 0.024, map: neige.material.map, transparent: true, depthWrite: false, opacity: 0.5, blending: THREE.AdditiveBlending, toneMapped: false }));
  poussiere.frustumCulled = false; poussiere.visible = niveau >= 1 && !reduit;
  groupeInterieur.add(poussiere);
  // Gros flocons doux (Noël) : peu nombreux, ils tombent lentement en se balançant
  const NB_FLOCONS = 150;
  const floconGeo = new THREE.BufferGeometry();
  const floconPos = new Float32Array(NB_FLOCONS * 3);
  { const r = alea(53); for (let i = 0; i < NB_FLOCONS; i++) { floconPos[i * 3] = (r() - 0.5) * (L - 2.2); floconPos[i * 3 + 1] = r() * H; floconPos[i * 3 + 2] = -0.8 - r() * (P - 2); } }
  floconGeo.setAttribute('position', new THREE.BufferAttribute(floconPos, 3));
  const flocons = new THREE.Points(floconGeo, new THREE.PointsMaterial({ size: 0.075, map: neige.material.map, transparent: true, depthWrite: false, opacity: 0.55, toneMapped: false }));
  flocons.frustumCulled = false; flocons.visible = false;
  groupeInterieur.add(flocons);
  // Cône de lumière (douche lumineuse au-dessus de chaque vitrine)
  const GEO_CONE = new THREE.CylinderGeometry(0.06, 1, 1, 28, 1, true);
  const TEX_CONE = degrade(['#ffffff', '#6a6a6a', '#000000'], true, false);

  /* ------------------------------ Thème courant ------------------------------ */
  let themeCourant = null;
  let carrousels = [];
  let cliquables = [];
  let portes = [];
  let envInterieur = null;
  let ecranTheme = null;
  let compteCible = 0; let compteLibelle = '';

  /** Vitrine en promotion : bannière animée, guirlande d'ampoules qui « court »,
   *  projecteurs qui balaient, étincelles qui montent, halo rouge au sol. */
  function effetVenteFlash(g, pr, c) {
    const noel = pr.style === 'noel';
    const bn = banniere(pr, c);
    const pb = plan(3.1, 3.1 * 180 / 1024, matBasic({ map: bn.tex, color: lumineux('#ffffff', 1.25), transparent: true }), 0, 3.52, 0.12, g);
    pb.renderOrder = 2;
    for (const sx of [-1, 1]) boite(0.012, 4.2 - 3.79, 0.012, M.metal, sx * 1.3, 3.79 + (4.2 - 3.79) / 2, 0.12, g);
    // Ampoules en chenillard autour de la vitrine
    const pts = [];
    const x0 = -1.76; const x1 = 1.76; const y0 = 0.94; const y1 = 2.48; const pas = 0.17;
    for (let x = x0; x < x1; x += pas) pts.push([x, y1]);
    for (let y = y1; y > y0; y -= pas) pts.push([x1, y]);
    for (let x = x1; x > x0; x -= pas) pts.push([x, y0]);
    for (let y = y0; y < y1; y += pas) pts.push([x0, y]);
    const im = new THREE.InstancedMesh(GEO.sphere, matBasic({ color: 0xffffff }), pts.length);
    const m4 = new THREE.Matrix4(); const cl = new THREE.Color();
    pts.forEach(([x, y], k) => { m4.compose(V(x, y, 0.37), new THREE.Quaternion(), V(0.024, 0.024, 0.024)); im.setMatrixAt(k, m4); im.setColorAt(k, cl.copy(lumineux(OR_FLASH, 2.5))); });
    im.instanceMatrix.needsUpdate = true;
    g.add(im); promoAnim.ampoules.push({ im, n: pts.length, accent: c.accent, noel });
    // Projecteurs qui balaient (lumière chaude et douce pour Noël)
    for (const [sx, coul] of noel ? [[-1, '#FFD9A0'], [1, '#FFE6A3']] : [[-1, c.accent], [1, OR_FLASH]]) {
      const pivot = new THREE.Group(); pivot.position.set(sx * 1.45, 0.02, 0.95); g.add(pivot);
      const f = plan(0.55, 3.6, matBasic({ map: TEX_FAISCEAU, color: lumineux(coul, 1.2), transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false }), 0, 1.8, 0, pivot);
      f.renderOrder = 8;
      cylindre(0.07, 0.06, M.socle, 0, 0.03, 0, pivot);
      promoAnim.faisceaux.push({ pivot, sx, lent: noel });
    }
    // Étincelles
    if (!reduit) {
      const n = 46; const geo = new THREE.BufferGeometry(); const pos = new Float32Array(n * 3); const vit = new Float32Array(n); const rr = alea(91);
      for (let k = 0; k < n; k++) { pos[k * 3] = -1.6 + rr() * 3.2; pos[k * 3 + 1] = 0.95 + rr() * 1.5; pos[k * 3 + 2] = 0.4 + rr() * 0.35; vit[k] = (noel ? -1 : 1) * (0.12 + rr() * 0.3); }
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const pts2 = new THREE.Points(geo, garder(new THREE.PointsMaterial({ size: noel ? 0.05 : 0.045, map: TEX_HALO, color: lumineux(noel ? '#FFF1D0' : OR_FLASH, 2.2), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })));
      pts2.frustumCulled = false; pts2.renderOrder = 9; g.add(pts2);
      promoAnim.particules.push({ geo, pos, vit, n });
    }
    // Halo rouge au sol, qui respire
    const l = plan(4.4, 2.0, matHalo(noel ? '#FFD27A' : c.accent, 0.3), 0, 0.014, 1.1, g); l.rotation.x = -Math.PI / 2;
    promoAnim.lueurs.push(l);
  }

  function majVenteFlash(dt) {
    if (!promoAnim) return;
    for (const e of promoAnim.cartes) {
      if (!e.sticker) continue;
      const k = reduit ? 1 : 1 + 0.07 * Math.sin(temps * 4.2);
      const sz = e.taille * k;
      e.sticker.scale.set(sz, sz, 1);
      e.sticker.position.set(e.mesh.position.x + e.mesh.scale.x * 0.44, e.mesh.position.y + e.mesh.scale.y * 0.4, e.mesh.position.z + 0.02);
      e.sticker.rotation.z = reduit ? -0.2 : -0.2 + 0.09 * Math.sin(temps * 2.3);
    }
    if (reduit) return;
    const tic = Math.floor(temps * 11);
    for (const a of promoAnim.ampoules) {
      if (a.tic === tic) continue; a.tic = tic;
      if (a.noel) {
        const coul = ['#FF4D5E', '#FFD27A', '#5BE08A', '#FFFFFF'];
        for (let k = 0; k < a.n; k++) a.im.setColorAt(k, col.copy(lumineux(coul[k % 4], (Math.floor(tic / 3) + k) % 3 === 0 ? 0.5 : 2.6)));
      } else for (let k = 0; k < a.n; k++) a.im.setColorAt(k, col.copy(lumineux((k + tic) % 4 === 0 ? OR_FLASH : a.accent, (k + tic) % 4 === 0 ? 3.2 : 0.9)));
      if (a.im.instanceColor) a.im.instanceColor.needsUpdate = true;
    }
    for (const f of promoAnim.faisceaux) f.pivot.rotation.z = f.sx * 0.18 + Math.sin(temps * (f.lent ? 0.45 : 0.9) + (f.sx > 0 ? 1.6 : 0)) * (f.lent ? 0.25 : 0.42);
    for (const pa of promoAnim.particules) {
      for (let k = 0; k < pa.n; k++) {
        pa.pos[k * 3 + 1] += pa.vit[k] * dt;
        pa.pos[k * 3] += Math.sin(temps * 2 + k) * 0.0015;
        if (pa.pos[k * 3 + 1] > 2.5) pa.pos[k * 3 + 1] = 0.95;
        else if (pa.pos[k * 3 + 1] < 0.95) pa.pos[k * 3 + 1] = 2.5;
      }
      pa.geo.attributes.position.needsUpdate = true;
    }
    for (const l of promoAnim.lueurs) l.material.opacity = 0.22 + 0.14 * (0.5 + 0.5 * Math.sin(temps * 3));
  }

  function appliquerTheme(slug) {
    const b = cat.boutiques.find((x) => x.slug === slug);
    if (!b) return;
    themeCourant = slug;
    poubelle.forEach((x) => x.dispose && x.dispose());
    poubelle = [];
    neonMats = [];
    const t = b.theme; const c = t.couleurs; const st = style(t); const d = t.decor || [];

    const tSol = peindreSol(t);
    if (STD) { M.sol.emissiveMap = tSol; M.sol.roughness = t.matieres.sol === 'marbre' ? 0.14 : t.matieres.sol === 'beton' ? 0.3 : 0.24; } else M.sol.map = tSol;
    M.sol.needsUpdate = true;
    M.plafond.map = peindrePlafond(t); M.plafond.needsUpdate = true;
    for (const [m, l] of [[M.murG, P], [M.murD, P], [M.murF, L], [M.murA, L]]) { m.map = peindreMur(t, l); m.needsUpdate = true; }
    M.allee.color.set(melange(c.tapis, '#000000', 0.55));
    scans = [];
    holoEntree.visible = !d.includes('neon'); // Black Friday : l'allée porte déjà les chevrons, pas d'anneaux au sol
    holoEntree.userData.mat.color.copy(lumineux(d.includes('neon') ? c.accent : d.includes('sapin') ? c.metal : HOLO, 2.4));
    matPulse.color.copy(lumineux(d.includes('neon') ? c.accent : c.lumiere, 5));
    M.pilastre.color.set(luminance(c.mur) < 0.35 ? melange(c.mur, '#ffffff', 0.1) : melange(c.mur, c.accent, 0.16));
    if (forceSol) {
      forceSol.base = t.matieres.sol === 'marbre' ? 0.55 : t.matieres.sol === 'beton' ? 0.3 : 0.34;
      if (miroir.actif) { forceSol.value = forceSol.base; M.sol.envMapIntensity = 0.25; }
    }
    const tMeuble = new THREE.CanvasTexture(motif(t.matieres.comptoirFacade, c)); tMeuble.colorSpace = THREE.SRGBColorSpace; garder(tMeuble);
    M.meuble.map = tMeuble; M.meuble.color.set(0xffffff); M.meuble.needsUpdate = true;
    const tPlateau = new THREE.CanvasTexture(motif(t.matieres.comptoirPlateau, c)); tPlateau.colorSpace = THREE.SRGBColorSpace;
    tPlateau.wrapS = tPlateau.wrapT = THREE.RepeatWrapping; tPlateau.repeat.set(2.5, 0.6); garder(tPlateau);
    M.plateau.map = tPlateau; M.plateau.needsUpdate = true;
    const metalNoir = t.matieres.vitrineCadre === 'noirMat';
    M.metal.color.set(metalNoir ? '#161616' : c.metal);
    if (STD) { M.metal.metalness = metalNoir ? 0.3 : 1; M.metal.roughness = metalNoir ? 0.55 : 0.22; }
    const verre = t.matieres.verre;
    // Réglages des vitrines (config : theme.vitrines). fond « sombre » : fond profond derrière
    // les cartes, vitre moins réfléchissante, pour que les couleurs des cartes ressortent.
    const reglV = t.vitrines || {};
    const fondSombre = reglV.fond === 'sombre';
    facteurCartes = Number(reglV.luminositeCartes) > 0 ? Math.min(1.2, Number(reglV.luminositeCartes)) : 1;
    M.verre.color.set(verre === 'fume' ? '#2c2c30' : '#ffffff');
    // Vitre de façade des vitrines : présente (reflets) mais sans voiler les cartes
    M.verre.opacity = verre === 'fume' ? 0.12 : verre === 'givre' ? 0.09 : fondSombre ? 0.04 : 0.06;
    if (STD) { M.verre.envMapIntensity = fondSombre ? 0.45 : verre === 'fume' ? 0.8 : 1.0; M.etagere.envMapIntensity = fondSombre ? 0.5 : 1.2; M.etagere.opacity = fondSombre ? 0.18 : 0.28; }
    M.caisson.map = fondSombre
      ? degrade([melange(c.accent, c.lumiere, 0.16), c.accent, melange(c.accent, '#000000', 0.45)])
      : degrade([melange(c.lumiere, '#ffffff', 0.35), melange(c.accent, c.lumiere, 0.25), melange(c.accent, '#000000', 0.35)]);
    M.caisson.color.copy(lumineux('#ffffff', fondSombre ? 0.92 : d.includes('neon') ? 1.0 : 1.08)); M.caisson.needsUpdate = true;
    M.led.color.copy(lumineux(c.lumiere, fondSombre ? 2.2 : 3.2));
    M.ledAccent.color.copy(lumineux(d.includes('neon') ? c.accent : c.metal, d.includes('neon') ? 3.2 : 2.2));
    if (d.includes('neon')) neonMats.push(M.ledAccent);
    lueurComptoir.material.color.set(c.lumiere);
    plaqueComptoir.material.map = etiquette('Counter', st, true); plaqueComptoir.material.needsUpdate = true;

    // Vitrines
    carrousels = [];
    cliquables = [];
    promoAnim = { cartes: [], ampoules: [], faisceaux: [], particules: [], lueurs: [] };
    placerVitrines(Math.min(b.sections.length, SLOTS.length));
    slotsG.forEach((g) => { while (g.children.length) g.remove(g.children[0]); });
    b.sections.forEach((s, i) => {
      if (i >= SLOTS.length) return;
      const g = slotsG[i];
      const titre = plan(2.6, 0.5, matBasic({ map: titreLumineux(s.titre.replace(/^Aisle \d+ — /, ''), st), transparent: true, depthWrite: false }), 0, 2.92, 0.05, g);
      titre.renderOrder = 2;
      // Toutes les cartes du rayon sont exposées en même temps (plus de carrousel caché) :
      // une rangée sur présentoirs en verre, ou deux étagères pour 4 packs.
      const grand = s.produits.every((id) => cat.produits[id].type === 'pack');
      const n = s.produits.length;
      const rangs = grand && n >= 4 ? 2 : 1;
      const cols = Math.ceil(n / rangs);
      const pas = (3.12 - (cols - 1) * 0.14) / cols + 0.14;
      const wMax = Math.min(pas - 0.14, grand ? 1.45 : 0.98);
      const hMax = rangs === 2 ? 0.5 : n === 1 ? 0.9 : grand ? 0.8 : 0.72;
      if (rangs === 2) { const e2 = boite(3.3, 0.018, 0.56, M.etagere, 0, 1.84, 0, g); e2.renderOrder = 4; }
      const lueur = plan(1, 1, matHalo(c.lumiere, 0), 0, 1.6, -0.12, g);
      const car = { slot: i, ids: s.produits, cartes: [], sel: -1, selAvant: -2, lueur, titre: s.titre };
      s.produits.forEach((id, k) => {
        const p = cat.produits[id];
        const e = carte(id, { maxW: wMax, maxH: hMax, vitrine: true });
        const r = rangs === 2 && k < cols ? 0 : 1; // 0 = étagère du haut
        const nRang = rangs === 1 ? n : r === 0 ? cols : n - cols;
        const colonne = rangs === 1 || r === 0 ? k : k - cols;
        e.x = (colonne - (nRang - 1) / 2) * pas;
        e.base = rangs === 1 ? 1.42 : r === 0 ? 1.86 : 1.2;
        e.hl = 0;
        e.dispo = (p.type === 'carte' || p.prix != null) && p.disponible;
        e.mesh.renderOrder = 3;
        cliquable(e.mesh, { type: 'carte', produit: id, slot: i, index: k });
        if (rangs === 1) { const pied = boite(Math.min(0.3, wMax * 0.42), 0.22, 0.14, M.etagere, e.x, 1.31, 0.03, g); pied.renderOrder = 4; }
        e.ombre = plan(1, 1, matBasic({ map: TEX_OMBRE, transparent: true, opacity: 0.5, depthWrite: false }), e.x, e.base + 0.004, 0.03, g);
        e.ombre.rotation.x = -Math.PI / 2;
        // Socle lumineux à la couleur de la marque : chaque carte est posée sur un trait de lumière
        e.barre = plan(1, 1, matBasic({ color: lumineux(c.lumiere, 2), transparent: true, opacity: 0.9, depthWrite: false }), e.x, e.base + 0.008, 0.1, g);
        e.barre.renderOrder = 4;
        // Mise en scène « écrin » : nappe de lumière colorée sous la carte, pinceau de lumière qui tombe
        // du haut de la vitrine sur elle, et deux éclats qui scintillent sur ses coins.
        e.nappe = plan(1, 1, matHalo(c.lumiere, 0.4), e.x, e.base + 0.02, 0.11, g); e.nappe.renderOrder = 4;
        if (niveau >= 1) {
          const hautY = rangs === 2 && r === 1 ? 1.82 : 2.41;
          const hc = hautY - (e.base + 0.02);
          e.pinceau = new THREE.Mesh(GEO_CONE, matBasic({ map: TEX_CONE, color: c.lumiere, transparent: true, opacity: 0.14, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
          e.pinceau.scale.set(wMax * 0.62, hc, 0.2); e.pinceau.position.set(e.x, e.base + 0.02 + hc / 2, -0.06); e.pinceau.renderOrder = 2;
          g.add(e.pinceau);
        }
        if (!reduit) {
          e.eclats = [0, 1].map((q) => { const m = plan(0.13, 0.13, matBasic({ map: TEX_ETOILE, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }), e.x, e.base + 0.3, 0.14, g); m.renderOrder = 8; m.userData.q = q; return m; });
        }
        e.apresChargement = () => { const cm = COULEURS_MARQUE.get(id); if (cm) { e.barre.material.color.copy(lumineux(cm, 2.8)); e.nappe.material.color.set(cm); } };
        const lt = Math.min(0.58, pas * 0.86);
        const texTag = e.dispo && p.promo && p.prixAvant != null
          ? texDe(E.peindreEtiquettePromo(eurosTxt(p.prixAvant), eurosTxt(p.prix), p.promo.remise, { accent: c.accent, metal: c.metal, style: p.promo.style }))
          : etiquette(e.dispo ? prixCourt(p) : cat.textes.indisponible, st, e.dispo);
        e.tag = plan(lt, lt * 0.235, matBasic({ map: texTag, transparent: true, depthWrite: false }), e.x, r === 0 && rangs === 2 ? 1.77 : 1.105, 0.31, g);
        e.tag.renderOrder = 5;
        if (p.promo) {
          // Autocollant « −10 % » qui suit la carte (pulsation)
          e.sticker = plan(1, 1, matBasic({ map: stickerTex(p.promo.remise, p.promo.style), transparent: true, depthWrite: false }), e.x, e.base + 0.4, 0.1, g);
          e.sticker.renderOrder = 6; e.taille = Math.min(0.3, wMax * 0.3);
          promoAnim.cartes.push(e);
        }
        g.add(e.mesh);
        car.cartes.push(e);
        cliquables.push(e.mesh);
      });
      if (verre === 'givre') {
        const [cg, xg] = toile(512, 256); const r = alea(11 + i);
        for (const [cx, cy] of [[0, 0], [512, 0], [0, 256], [512, 256]]) for (let k = 0; k < 220; k++) { const a = r() * Math.PI * 2; const dd = Math.pow(r(), 2) * 100; xg.fillStyle = `rgba(255,255,255,${0.08 + r() * 0.3})`; xg.fillRect(cx + Math.cos(a) * dd, cy + Math.sin(a) * dd, 2 + r() * 2, 2 + r() * 2); }
        const gv = plan(3.36, 1.5, matBasic({ map: texDe(cg, false), transparent: true, depthWrite: false }), 0, 1.68, 0.342, g); gv.renderOrder = 7;
      }
      if (!reduit) {
        // Barre de scan holographique qui balaie le fond de la vitrine
        const scan = plan(3.3, 0.04, matBasic({ color: lumineux(d.includes('neon') ? c.accent : HOLO, 3), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }), 0, 1.6, -0.3, g);
        scan.renderOrder = 2; scan.userData.dec = i * 0.37;
        const traine = plan(3.3, 0.5, matBasic({ map: TEX_CONE, color: d.includes('neon') ? c.accent : HOLO, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }), 0, -6, 0, scan);
        traine.scale.set(1, 12, 1); traine.position.y = -6.5; scan.userData.traine = traine;
        scans.push(scan);
      }
      if (niveau >= 1) {
        // Douches de lumière : deux cônes translucides qui tombent du plafond devant la vitrine
        for (const cx of [-0.95, 0.95]) {
          const cone = new THREE.Mesh(GEO_CONE, matBasic({ map: TEX_CONE, color: c.lumiere, transparent: true, opacity: luminance(c.mur) < 0.35 ? 0.11 : 0.06, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
          cone.scale.set(0.95, H - 0.05, 0.95); cone.position.set(cx, (H - 0.05) / 2, 0.95); cone.renderOrder = 8;
          g.add(cone);
        }
      }
      cliquables.push(cliquable(boite(3.5, 2.6, 1.0, matInvisible, 0, 1.6, 0.2, g), { type: 'station', id: `v${i}` }));
      carrousels.push(car);
      const prS = s.produits.map((id) => cat.produits[id].promo).find(Boolean);
      if (prS) effetVenteFlash(g, prS, c);
    });

    // Décors
    groupeDecor.clear();
    ampoules.length = 0;
    for (let s = b.sections.length; s < SLOTS.length; s++) {
      const dd = decorPour(t);
      dd.position.copy(slotsG[s].position).add(V(SLOTS[s].cote * -0.6, 0, 0));
      groupeDecor.add(dd);
    }
    const entree = decorPour(t); entree.position.set(-5.85, 0, -1.3); groupeDecor.add(entree);
    {
      const sc = new THREE.Group(); sc.position.set(5.8, 0, -1.4); sc.rotation.y = -Math.PI / 2;
      boite(0.7, 0.07, 0.4, M.socle, 0, 0.035, 0, sc);
      boite(0.8, 0.95, 0.45, M.meuble, 0, 0.545, 0, sc);
      boite(0.86, 0.04, 0.5, M.plateau, 0, 1.04, 0, sc);
      const pl = plan(1.3, 0.3, matBasic({ map: titreLumineux('Customer service', st, 1024, 240), transparent: true, depthWrite: false }), 0, 1.45, 0, sc);
      pl.renderOrder = 2;
      cliquables.push(cliquable(boite(1.1, 1.8, 0.8, matInvisible, 0, 0.9, 0, sc), { type: 'service' }));
      groupeDecor.add(sc);
    }
    neige.visible = d.includes('neige') && REGLAGES[niveau].neige > 0;
    flocons.visible = d.includes('neige') && niveau >= 1 && !reduit;
    animDecor = [];
    if (d.includes('sapin') || d.includes('neige')) decorNoel(t, Math.min(b.sections.length, SLOTS.length));
    if (d.includes('neon')) decorBlackFriday(t);
    if (d.includes('guirlandes')) {
      festons(-L / 2 + 0.1, -0.8, -L / 2 + 0.1, -17.8, 3.85, 0.28, 5, groupeDecor, t);
      festons(L / 2 - 0.1, -0.8, L / 2 - 0.1, -17.8, 3.85, 0.28, 5, groupeDecor, t);
    }
    ecranTheme = { t, b };
    compteCible = d.includes('compteARebours') && t.compteARebours ? new Date(t.compteARebours.cible).getTime() : 0;
    compteLibelle = t.compteARebours ? t.compteARebours.libelle : '';
    dessinerEcran(0);

    construirePresentoir(b);
    groupePersos.clear(); personnages = [];
    creerPersonnage(varianteDe(b), 0.42, COMPTOIR_Z - 0.96, 0, 'comptoir', null, b.theme.couleurs.lumiere);
    construirePortes(b);
    majPanier(panierCourant, false);
    cliquables.push(...groupePresentoir.children.filter((x) => x.userData.cible), ...portes.map((p) => p.zone), ...personnages.filter((p) => p.zone).map((p) => p.zone));
    if (holoNl) cliquables.push(...holoNl.zone);
    if (contexte === 'interieur') { scene.fog = brume(t); reglerLumieres(); }
    planifierReflets(0.5);
  }
  const brume = (t) => new THREE.FogExp2(melange(t.couleurs.mur, t.couleurs.lumiere, 0.3), luminance(t.couleurs.mur) < 0.35 ? 0.026 : 0.017);

  /** Écran numérique animé (fond de la boutique). */
  let derniereImageEcran = 0;
  function dessinerEcran(temps) {
    if (!ecranTheme) return;
    const { t, b } = ecranTheme; const c = t.couleurs; const x = ecranX; const w = 1024; const h = 300;
    const neon = (t.decor || []).includes('neon');
    x.fillStyle = neon ? '#050506' : melange(c.accent, '#000000', 0.55); x.fillRect(0, 0, w, h);
    x.globalCompositeOperation = 'screen';
    [[0.25, 0.4, c.accent], [0.7, 0.6, c.metal], [0.5, 0.3, c.lumiere]].forEach(([bx, by, col], i) => {
      const px = (bx + 0.18 * Math.sin(temps * 0.25 + i * 2.1)) * w; const py = (by + 0.2 * Math.cos(temps * 0.3 + i)) * h;
      const g = x.createRadialGradient(px, py, 0, px, py, 340);
      g.addColorStop(0, rgba(col, neon ? 0.55 : 0.4)); g.addColorStop(1, rgba(col, 0));
      x.fillStyle = g; x.fillRect(0, 0, w, h);
    });
    x.globalCompositeOperation = 'source-over';
    x.fillStyle = 'rgba(255,255,255,.035)'; for (let y = 0; y < h; y += 4) x.fillRect(0, y, w, 1);
    const balayage = ((temps * 0.12) % 1) * (w + 200) - 100;
    const gb = x.createLinearGradient(balayage - 80, 0, balayage + 80, 0); gb.addColorStop(0, 'rgba(255,255,255,0)'); gb.addColorStop(0.5, 'rgba(255,255,255,.08)'); gb.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = gb; x.fillRect(balayage - 80, 0, 160, h);
    x.textAlign = 'center'; x.textBaseline = 'middle';
    if (neon) {
      const y1 = compteCible ? 112 : 150;
      x.shadowColor = c.accent; x.shadowBlur = 30; x.fillStyle = c.accent;
      const tt = texteAjuste(x, b.nomCourt.toUpperCase(), w / 2, y1, w - 120, `800 {t}px ${SANS}`, 104);
      x.shadowBlur = 0; x.fillStyle = '#FFE8E5'; texteAjuste(x, b.nomCourt.toUpperCase(), w / 2, y1, w - 120, `800 {t}px ${SANS}`, tt);
      if (compteCible) {
        const dd = Math.max(0, compteCible - Date.now());
        const j = Math.floor(dd / 864e5); const hh = Math.floor(dd / 36e5) % 24; const m = Math.floor(dd / 6e4) % 60; const s = Math.floor(dd / 1e3) % 60;
        const p2 = (n) => String(n).padStart(2, '0');
        x.font = `600 30px ${SANS}`; x.fillStyle = 'rgba(255,255,255,.75)'; x.fillText(compteLibelle, w / 2, 205);
        x.shadowColor = c.metal; x.shadowBlur = 14; x.fillStyle = c.metal; x.font = `800 54px ${SANS}`;
        x.fillText(`${j}d  ${p2(hh)}:${p2(m)}:${p2(s)}`, w / 2, 254); x.shadowBlur = 0;
      }
    } else {
      x.fillStyle = 'rgba(255,255,255,.95)';
      const police = ((t.decor || []).includes('sapin') ? 'italic ' : '') + `500 {t}px ${SERIF}`;
      texteAjuste(x, cat.site.accroche, w / 2, 128, w - 140, police, 76);
      x.fillStyle = c.metal; x.font = `700 28px ${SANS}`;
      x.fillText(cat.site.sousAccroche.toUpperCase(), w / 2, 206);
    }
    ecranTex.needsUpdate = true;
  }

  function construirePresentoir(b) {
    groupePresentoir.clear();
    const st = style(b.theme);
    const groupes = (b.presentoir || []).slice(0, 3);
    if (!groupes.length) return;
    const tete = plan(1.1, 0.24, matBasic({ map: etiquette("Don't miss", st, true), transparent: true, depthWrite: false }), 0, 0.64, -0.4, groupePresentoir);
    tete.rotation.x = -0.12; tete.renderOrder = 5;
    groupes.forEach((gr, k) => {
      const autre = cat.boutiques.find((x) => x.slug === gr.boutique);
      if (!autre) return;
      const y = 0.03 + k * 0.14; const z = 0.2 - k * 0.24;
      boite(1.75, 0.04, 0.25, M.plateau, 0, y, z, groupePresentoir);
      const bande = plan(1.2, 0.09, matBasic({ map: etiquette(autre.nomCourt, style(autre.theme), true), transparent: true, depthWrite: false }), 0, y, z + 0.128, groupePresentoir);
      bande.renderOrder = 5;
      const n = Math.min(3, gr.produits.length);
      gr.produits.slice(0, 3).forEach((id, j) => {
        const e = carte(id, { maxW: 0.42, maxH: 0.26 });
        const placer = () => { e.mesh.scale.set(e.w, e.h, 1); e.mesh.position.set((j - (n - 1) / 2) * 0.52, y + 0.04 + e.h / 2, z - 0.02); e.eclat(1); };
        e.apresChargement = placer; placer();
        e.mesh.rotation.x = -0.22;
        cliquable(e.mesh, { type: 'presentoir', boutique: gr.boutique, produit: id });
        groupePresentoir.add(e.mesh);
      });
    });
  }

  /** Portails vers les autres boutiques : encadrement, enseigne lumineuse au nom de la
   *  boutique, vue sur la boutique voisine à travers la porte vitrée, lumière au sol. */
  function construirePortes(b) {
    groupePortes.clear();
    portes = [];
    const autres = cat.boutiques.filter((x) => x.slug !== b.slug);
    const xs = autres.length <= 2 ? [-4.6, 4.6] : [-5.7, -3.7, 3.7, 5.7];
    autres.slice(0, xs.length).forEach((a, i) => {
      const t = a.theme; const c = t.couleurs; const gen = E.genre(t);
      const neon = gen === 'neon'; const fete = gen === 'fete';
      const lw = autres.length <= 2 ? 1.4 : 1.1; const lh = 2.86;
      const pw = lw + 0.9; // largeur du portail
      const g = new THREE.Group(); g.position.set(xs[i], 0, ZF); groupePortes.add(g);
      // Habillage mural
      const teinte = neon ? '#0E0E11' : fete ? melange(c.accent, '#000000', 0.3) : melange(c.accent, '#000000', 0.1);
      boite(pw, 3.3, 0.05, matStd({ color: teinte, roughness: neon ? 0.4 : 0.6, metalness: neon ? 0.45 : 0.1, envMapIntensity: 0.8 }), 0, 1.65, 0.025, g);
      const mCadre = matStd({ color: neon ? '#1A1A1E' : c.metal, metalness: neon ? 0.45 : 1, roughness: neon ? 0.4 : 0.22, envMapIntensity: 1.2 });
      for (const sx of [-1, 1]) {
        boite(0.18, 3.0, 0.22, mCadre, sx * (lw / 2 + 0.09), 1.5, 0.12, g);       // pilastre
        boite(0.26, 0.14, 0.28, mCadre, sx * (lw / 2 + 0.09), 0.07, 0.13, g);     // socle
        const mLed = matBasic({ color: lumineux(neon ? c.accent : fete ? '#FFD9A0' : '#FFE6B8', neon ? 3 : 2.2) });
        if (neon) neonMats.push(mLed);
        boite(0.022, 2.84, 0.022, mLed, sx * (lw / 2 + 0.008), 1.43, 0.235, g);  // ruban LED intérieur
      }
      boite(lw + 0.36, 0.13, 0.24, mCadre, 0, 3.01, 0.12, g);                       // linteau
      // Vue sur la boutique voisine (derrière la vitre)
      plan(lw, lh, matBasic({ map: texDe(E.peindreVue(t)), color: lumineux('#ffffff', 1.12) }), 0, 1.43, 0.03, g);
      // Porte vitrée (s'ouvre au passage)
      const pivot = new THREE.Group(); pivot.position.set(-lw / 2, 0, 0.1); g.add(pivot);
      const mVerre = matStd({ color: neon ? '#3a3a40' : '#ffffff', transparent: true, opacity: neon ? 0.28 : 0.16, roughness: 0.04, metalness: 0.1, depthWrite: false, envMapIntensity: 1.5 });
      const vitre = boite(lw, 2.82, 0.03, mVerre, lw / 2, 1.43, 0, pivot); vitre.renderOrder = 6;
      for (const [w, h, x, y] of [[lw, 0.05, lw / 2, 0.03], [lw, 0.05, lw / 2, 2.83], [0.05, 2.86, 0.025, 1.43], [0.05, 2.86, lw - 0.025, 1.43]]) boite(w, h, 0.05, mCadre, x, y, 0, pivot);
      boite(0.03, 1.1, 0.06, matStd({ color: neon ? c.metal : c.metal, metalness: 1, roughness: 0.2 }), lw - 0.16, 1.2, 0.07, pivot);
      {
        // Bandeau dépoli gravé au nom de la boutique, à hauteur des yeux
        const [cv, xv] = E.toile(512, 80);
        xv.fillStyle = 'rgba(255,255,255,.2)'; xv.fillRect(0, 10, 512, 60);
        xv.fillStyle = 'rgba(255,255,255,.92)'; xv.textAlign = 'center'; xv.textBaseline = 'middle';
        xv.font = `700 34px ${SANS}`; xv.fillText((a.nomCourt || a.nom).toUpperCase().split('').join(' '), 256, 41);
        const band = plan(lw - 0.1, (lw - 0.1) * 80 / 512, matBasic({ map: texDe(cv), transparent: true, depthWrite: false, opacity: 0.85 }), lw / 2, 1.62, 0.02, pivot);
        band.renderOrder = 7;
      }
      // Petit panneau « Enter › » sur la vitre : indique qu'on peut passer la porte (pulse doucement)
      const indice = plan(0.66, 0.66 * 96 / 384, matBasic({ map: texDe(E.peindreIndicePorte({ accent: neon ? c.accent : c.metal })), transparent: true, depthWrite: false, opacity: 0.9 }), lw / 2, 1.3, 0.035, pivot);
      indice.renderOrder = 8;
      // Enseigne lumineuse au-dessus de la porte
      const ew = pw + 0.1; const eh = ew * 300 / 1024; const ey = 3.12 + eh / 2 + 0.04;
      boite(ew + 0.06, eh + 0.06, 0.14, matStd({ color: 0x111114, roughness: 0.5, metalness: 0.5 }), 0, ey, 0.1, g);
      const ens = plan(ew, eh, matBasic({ map: texDe(E.peindreEnseigne(a, { sousTitre: sousTitrePromo(a) })), color: lumineux('#ffffff', neon ? 1.35 : 1.18) }), 0, ey, 0.172, g);
      ens.renderOrder = 2;
      plan(ew * 1.5, eh * 2.6, matHalo(neon ? c.accent : fete ? 0xffd27a : 0xffe6b8, neon ? 0.32 : 0.22), 0, ey, 0.05, g);
      for (const sx of [-1, 1]) boite(0.014, H - (ey + eh / 2), 0.014, M.metal, sx * ew * 0.36, ey + eh / 2 + (H - (ey + eh / 2)) / 2, 0.1, g);
      // Lumière qui se répand au sol + nom de la boutique peint au sol
      const fl = plan(pw * 1.5, 2.4, matHalo(neon ? c.accent : c.lumiere, 0.3), 0, 0.012, 1.2, g); fl.rotation.x = -Math.PI / 2;
      const sol = plan(1.3, 0.65, matBasic({ map: texDe(E.peindreSol(a)), transparent: true, depthWrite: false }), 0, 0.016, 1.15, g);
      sol.rotation.x = -Math.PI / 2; sol.renderOrder = 1;
      // Signature du thème
      if (neon) {
        const m = matBasic({ color: lumineux(c.accent, 3) }); neonMats.push(m);
        boite(0.022, 3.2, 0.022, m, -pw / 2 + 0.04, 1.6, 0.07, g); boite(0.022, 3.2, 0.022, m, pw / 2 - 0.04, 1.6, 0.07, g);
        const m2 = matBasic({ color: lumineux(c.metal, 2.6) }); neonMats.push(m2);
        boite(0.016, 3.0, 0.016, m2, -pw / 2 + 0.1, 1.5, 0.07, g); boite(0.016, 3.0, 0.016, m2, pw / 2 - 0.1, 1.5, 0.07, g);
      }
      if (fete) {
        const couronne = new THREE.Mesh(garder(new THREE.TorusGeometry(0.2, 0.05, 10, 32)), matStd({ color: 0x1d4a2a, roughness: 0.85 }));
        couronne.position.set(lw / 2, 2.12, 0.06); pivot.add(couronne);
        const nb = 18; const imc = new THREE.InstancedMesh(garder(new THREE.SphereGeometry(0.014, 6, 4)), matBasic({ color: 0xffffff }), nb);
        const m4 = new THREE.Matrix4(); const cl = new THREE.Color();
        for (let k = 0; k < nb; k++) { const a2 = (k / nb) * Math.PI * 2; imc.setMatrixAt(k, m4.makeTranslation(lw / 2 + Math.cos(a2) * 0.2, 2.12 + Math.sin(a2) * 0.2, 0.11)); imc.setColorAt(k, cl.copy(lumineux(c.metal, 2.5))); }
        pivot.add(imc); ampoules.push(imc);
        // Guirlande d'ampoules autour du portail
        const pts = []; const gx = pw / 2 - 0.06;
        for (let y = 0.2; y < 3.08; y += 0.16) pts.push([-gx, y]);
        for (let x = -gx; x < gx; x += 0.16) pts.push([x, 3.08 + 0.05 * Math.sin((x / gx) * Math.PI * 3)]);
        for (let y = 3.08; y > 0.2; y -= 0.16) pts.push([gx, y]);
        const img = new THREE.InstancedMesh(GEO.sphere, matBasic({ color: 0xffffff }), pts.length);
        pts.forEach(([x, y], k) => { m4.compose(V(x, y, 0.08), new THREE.Quaternion(), V(0.022, 0.022, 0.022)); img.setMatrixAt(k, m4); img.setColorAt(k, cl.copy(lumineux(k % 2 ? '#FFE2A8' : c.metal, 2.4))); });
        img.instanceMatrix.needsUpdate = true;
        g.add(img); ampoules.push(img);
      }
      if (!neon && !fete) {
        // Appliques en laiton de part et d'autre
        for (const sx of [-1, 1]) {
          const ax = sx * (pw / 2 - 0.02);
          boite(0.1, 0.26, 0.1, mCadre, ax, 2.25, 0.08, g);
          boite(0.06, 0.16, 0.06, matBasic({ color: lumineux('#FFE2B0', 2.6) }), ax, 2.25, 0.14, g);
          plan(0.9, 1.3, matHalo(0xffe2b0, 0.35), ax, 2.25, 0.06, g);
        }
      }
      const zone = cliquable(boite(lw + 0.4, 3.2, 0.6, matInvisible, 0, 1.6, 0.3, g), { type: 'porte', boutique: a.slug });
      portes.push({ slug: a.slug, nom: a.nomCourt || a.nom, x: xs[i], pivot, zone, indice });
      // Hôte(sse) devant la porte, habillé(e) aux couleurs de la boutique où elle mène
      if (autres.length <= 2) {
        const sx = Math.sign(xs[i]); const hx = xs[i] + sx * (pw / 2 + 0.46);
        creerPersonnage(varianteDe(a), hx, ZF + 0.62, -sx * 0.42, 'porte', { type: 'porte', boutique: a.slug }, b.theme.couleurs.lumiere);
      }
    });
  }

  /* ------------------------------ Panier sur le comptoir ------------------------------ */
  let panierCourant = o.panier || [];
  let nbPanierAffiche = 0;
  function majPanier(lignes, animer = true) {
    panierCourant = lignes || [];
    const unites = panierCourant.flatMap((l) => Array(l.quantite).fill(l.produit)).slice(-8);
    const avant = nbPanierAffiche;
    cartesPanier.clear();
    const r = alea(5);
    unites.forEach((id, k) => {
      const e = carte(id, { maxW: 0.42, maxH: 0.3 });
      const rz = (r() - 0.5) * 0.5; const ox = (r() - 0.5) * 0.12; const oz = (r() - 0.5) * 0.08;
      const yFin = 0.022 + k * 0.006;
      e.mesh.rotation.set(-Math.PI / 2, 0, rz);
      const poser = () => { e.mesh.scale.set(e.w, e.h, 1); e.eclat(0.95); };
      e.apresChargement = poser; poser();
      e.mesh.position.set(ox, yFin, oz);
      cartesPanier.add(e.mesh);
      if (animer && k >= avant && !reduit) {
        e.mesh.position.y = yFin + 0.8;
        animerVers((kk) => { e.mesh.position.y = yFin + 0.8 * (1 - kk); }, 450, EASE.out);
      }
    });
    nbPanierAffiche = unites.length;
    // Panneau holographique au-dessus du comptoir
    const b = cat.boutiques.find((x) => x.slug === themeCourant);
    if (!b) return;
    const st = style(b.theme);
    const n = panierCourant.reduce((s, l) => s + l.quantite, 0);
    const totalE = panierCourant.reduce((s, l) => { const p = cat.produits[l.produit]; const pu = p ? (p.type === 'carte' ? l.montant : p.prix) : 0; return s + (pu || 0) * l.quantite; }, 0);
    const [c, x] = toile(760, 210);
    chemin(x, 4, 4, 752, 202, 26); x.fillStyle = 'rgba(8,10,16,.55)'; x.fill();
    x.lineWidth = 2; x.strokeStyle = rgba(st.neon ? st.texte : st.metal, 0.9); x.shadowColor = x.strokeStyle; x.shadowBlur = 14; x.stroke(); x.shadowBlur = 0;
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillStyle = 'rgba(255,255,255,.7)'; x.font = `700 26px ${SANS}`; x.fillText('INSTANT DELIVERY BY EMAIL', 380, 58);
    x.fillStyle = '#FFFFFF'; x.font = `700 54px ${SANS}`;
    const totalTxt = Number.isInteger(totalE) ? String(totalE) : totalE.toFixed(2);
    x.fillText(n ? `Your cart: ${n} · €${totalTxt}` : 'Your cart is empty', 380, 130);
    if (holo.material.map) holo.material.map.dispose();
    holo.material.map = texDe(c, true, false); holo.material.color.copy(lumineux('#ffffff', 1.15)); holo.material.needsUpdate = true;
  }

  /* ------------------------------ Reflets de la vraie salle ------------------------------ */
  let refletsDans = -1;
  function planifierReflets(delai) { if (REGLAGES[niveau].env) refletsDans = delai; }
  function capturerReflets() {
    if (!REGLAGES[niveau].env || contexte !== 'interieur') return;
    const visFacade = groupeFacade.visible; const visRepere = repere.visible;
    groupeFacade.visible = false; repere.visible = false;
    groupeInterieur.position.set(0, -1.7, 10.5); // centre de la salle à l'origine pour la capture
    groupeInterieur.updateMatrixWorld(true);
    const ancien = envInterieur;
    envInterieur = pmrem.fromScene(scene, 0.015, 0.1, 60).texture;
    groupeInterieur.position.set(0, 0, 0); groupeInterieur.updateMatrixWorld(true);
    groupeFacade.visible = visFacade; repere.visible = visRepere;
    scene.environment = envInterieur;
    if (ancien) ancien.dispose();
  }

  function reglerLumieres() {
    const t = cat.boutiques.find((b) => b.slug === themeCourant).theme;
    const env = REGLAGES[niveau].env;
    hemi.color.set(t.couleurs.lumiere); hemi.groundColor.set(t.couleurs.sol);
    hemi.intensity = (env ? 1.3 : 2.6) * t.lumiere.intensite;
    soleil.color.set(t.couleurs.lumiere); soleil.intensity = (env ? 1.2 : 1.7) * t.lumiere.intensite;
    soleil.position.set(2, 8, -6); soleil.target.position.set(0, 0, -12);
    renderer.toneMappingExposure = t.lumiere.exposition || 1;
    if (post) post.force((t.decor || []).includes('neon') ? 1.15 : 0.8);
  }

  /* ===================================================================== */
  /*  FAÇADE                                                                */
  /* ===================================================================== */
  const fenetres = [];
  let porteFacade = null;
  let envFacade = null;
  const neigeFacade = [];
  const stickersFacade = [];
  const facadeAmpoules = [];
  function construireFacade() {
    const g = groupeFacade;
    const bs = cat.boutiques.slice().sort((a, b) => a.ordre - b.ordre);
    const centre = bs.find((b) => b.slug === cat.boutiqueParDefaut) || bs[0];
    const gauche = bs.filter((b) => b.ordre < centre.ordre).pop() || null;
    const droite = bs.find((b) => b.ordre > centre.ordre) || null;
    const c0 = centre.theme.couleurs;
    // Hologrammes de façade : cartes géantes en orbite devant la boutique (cliquables : elles font entrer),
    // anneaux au sol devant la porte, deux faisceaux qui balaient le ciel depuis le toit.
    {
      const ids = [...new Set(cat.boutiques.flatMap((b) => b.sections.flatMap((s) => s.produits)))].filter((id) => cat.produits[id].type === 'carte').slice(0, 8);
      ids.forEach((id, k) => {
        const e = carte(id, { maxW: 1.3, maxH: 0.86, jetable: false, vitrine: true });
        e.k = k; e.n = ids.length;
        e.mesh.renderOrder = 9;
        // Position de départ (conservée telle quelle si « animations réduites »)
        const a0 = (k / ids.length) * Math.PI * 2;
        e.mesh.position.set(Math.cos(a0) * 7.4, 2.9 + Math.sin(a0) * 0.5, 4.4 + Math.sin(a0) * 2.4);
        e.mesh.scale.set(e.w, e.h, 1);
        e.apresChargement = () => { e.mesh.scale.set(e.w, e.h, 1); if (e.halo) e.halo.material.opacity = 0.4; };
        cliquable(e.mesh, { type: 'entrer', boutique: centre.slug });
        g.add(e.mesh); orbite.push(e);
      });
      holoSols.push(anneauxHolo(g, 0, 3.4, 2.7, HOLO));
      for (const sx of [-6.5, 6.5]) {
        const pivot = new THREE.Group(); pivot.position.set(sx, 8.7, -0.6); g.add(pivot);
        const f = new THREE.Mesh(GEO_CONE, matBasic({ map: TEX_CONE, color: sx < 0 ? HOLO : c0.metal, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }, false));
        f.rotation.x = Math.PI; f.scale.set(2.4, 18, 2.4); f.position.y = 9; pivot.add(f);
        pivot.userData.sens = sx < 0 ? 1 : -1;
        faisceauxCiel.push(pivot);
      }
    }
    const mFacade = matStd({ color: c0.facade, roughness: 0.42, metalness: 0.15, envMapIntensity: 0.8 }, false);
    const mPierre = matStd({ color: 0xd9d2c4, roughness: 0.85 }, false);
    const mLaiton = matStd({ color: c0.metal, metalness: 1, roughness: 0.25, envMapIntensity: 1.3 }, false);
    const piece = (x0, x1, y0, y1, m = mFacade, d = 0.5, z = -0.25) => boite(x1 - x0, y1 - y0, d, m, (x0 + x1) / 2, (y0 + y1) / 2, z, g);
    piece(-9, -8.3, 0, 4.2); piece(-3.0, -2.4, 0, 4.2); piece(2.4, 3.0, 0, 4.2); piece(8.3, 9, 0, 4.2);
    piece(-8.3, -3.0, 0, 0.6); piece(3.0, 8.3, 0, 0.6); piece(-2.4, -1.0, 0, 0.6); piece(1.0, 2.4, 0, 0.6);
    piece(-1.0, -0.9, 0, 3.6, mLaiton, 0.3, -0.1); piece(0.9, 1.0, 0, 3.6, mLaiton, 0.3, -0.1);
    piece(-0.9, 0.9, 3.0, 3.6); piece(-9, 9, 3.6, 4.2); piece(-9, 9, 4.2, 5.5);
    piece(-9.2, 9.2, 5.5, 5.6, mLaiton, 0.62, -0.2);
    piece(-9, 9, 5.6, 8.4, mPierre); piece(-9.3, 9.3, 8.4, 8.7, mPierre, 0.8, -0.15);
    for (const [x0, x1] of [[-8.3, -3.0], [-2.4, -1.0], [1.0, 2.4], [3.0, 8.3]]) {
      boite(x1 - x0 + 0.06, 0.035, 0.1, mLaiton, (x0 + x1) / 2, 0.6, 0.03, g);
      boite(x1 - x0 + 0.06, 0.035, 0.1, mLaiton, (x0 + x1) / 2, 3.6, 0.03, g);
    }
    // Enseigne : lettres dorées lumineuses
    {
      const [c, x] = toile(2048, 228);
      x.textAlign = 'center'; x.textBaseline = 'middle';
      const police = `500 {t}px ${SERIF}`; const nom = cat.site.nom.toUpperCase();
      x.shadowColor = c0.metal; x.shadowBlur = 24; x.fillStyle = c0.metal; const tt = texteAjuste(x, nom, 1024, 114, 1800, police, 140);
      x.shadowBlur = 0; const or = x.createLinearGradient(0, 40, 0, 190); or.addColorStop(0, '#FFF1C8'); or.addColorStop(0.55, '#E9C66E'); or.addColorStop(1, '#B98B2E');
      x.fillStyle = or; texteAjuste(x, nom, 1024, 114, 1800, police, tt);
      const ens = plan(9.6, 1.07, matBasic({ map: texDe(c, true, false), transparent: true, color: lumineux('#ffffff', 1.5), depthWrite: false }, false), 0, 4.86, 0.03, g);
      ens.renderOrder = 2;
      plan(10, 2.2, matHalo(0xffd9a0, 0.12, false), 0, 4.86, 0.02, g);
    }
    // Étage
    {
      const r = alea(21);
      for (const x of [-7, -3.5, 0, 3.5, 7]) {
        boite(1.5, 1.9, 0.15, mPierre, x, 7.0, 0.02, g);
        const allume = r() < 0.6;
        plan(1.2, 1.6, matBasic({ map: degrade(allume ? ['#FFE4B5', '#C9894A', '#5A3A22'] : ['#26324A', '#1A2335', '#121826'], true, false) }, false), x, 7.0, 0.1, g);
        boite(1.6, 0.06, 0.3, mPierre, x, 6.1, 0.12, g);
      }
    }
    if (gauche) fenetres.push(vitrineFacade(gauche, -8.3, -3.0, 0.6, 3.6, 3, g));
    if (droite) fenetres.push(vitrineFacade(droite, 3.0, 8.3, 0.6, 3.6, 3, g));
    // Enseignes : une par boutique, au-dessus de sa vitrine (format bandeau) et de la porte
    for (const [bq, x0, x1] of [[gauche, -8.3, -3.0], [droite, 3.0, 8.3]]) {
      if (!bq) continue;
      const neonB = E.genre(bq.theme) === 'neon';
      const ew = Math.min(x1 - x0 - 0.3, 0.54 * 8); const eh = ew / 8;
      boite(ew + 0.08, eh + 0.08, 0.12, matStd({ color: 0x0f0f12, roughness: 0.5, metalness: 0.5 }, false), (x0 + x1) / 2, 3.9, 0.06, g);
      const pe = plan(ew, eh, matBasic({ map: texDe(E.peindreEnseigne(bq, { w: 2048, h: 256, sousTitre: sousTitrePromo(bq) }), true, false), color: lumineux('#ffffff', neonB ? 1.4 : 1.2) }, false), (x0 + x1) / 2, 3.9, 0.125, g);
      pe.renderOrder = 2;
      plan(ew * 1.25, eh * 3, matHalo(neonB ? bq.theme.couleurs.accent : 0xffd9a0, neonB ? 0.3 : 0.18, false), (x0 + x1) / 2, 3.9, 0.04, g);
      cliquable(plan(ew, eh, matInvisible, (x0 + x1) / 2, 3.9, 0.14, g), { type: 'fenetre', boutique: bq.slug });
    }
    {
      // Plaque de la boutique centrale au-dessus de la porte
      const pw = 1.72; const ph = pw * 300 / 1024;
      const pl = plan(pw, ph, matBasic({ map: texDe(E.peindreEnseigne(centre, { sousTitre: sousTitrePromo(centre) }), true, false), color: lumineux('#ffffff', 1.15) }, false), 0, 3.3, 0.03, g);
      pl.renderOrder = 2;
    }
    fenetres.push(vitrineFacade(centre, -2.4, -1.0, 0.6, 3.6, 1, g, 0));
    fenetres.push(vitrineFacade(centre, 1.0, 2.4, 0.6, 3.6, 1, g, 1));
    // Porte vitrée
    {
      plan(1.8, 3.0, matBasic({ map: degrade(['#FFF1D8', '#F2D9AE', '#B98A55'], true, false), color: lumineux('#ffffff', 1.2) }, false), 0, 1.5, -1.6, g);
      const pivot = new THREE.Group(); pivot.position.set(-0.9, 0, -0.06); g.add(pivot);
      const vitre = plan(1.8, 3.0, matStd({ color: 0xffffff, transparent: true, opacity: 0.14, roughness: 0.03, metalness: 0, depthWrite: false, envMapIntensity: 1.6 }, false), 0.9, 1.5, 0, pivot);
      vitre.renderOrder = 6;
      for (const [w, h, x, y] of [[1.8, 0.06, 0.9, 0.03], [1.8, 0.06, 0.9, 2.97], [0.06, 3.0, 0.03, 1.5], [0.06, 3.0, 1.77, 1.5]]) boite(w, h, 0.05, mLaiton, x, y, 0, pivot);
      boite(0.035, 1.2, 0.05, mLaiton, 1.6, 1.2, 0.08, pivot);
      const [c, x] = toile(256, 160);
      chemin(x, 4, 4, 248, 152, 14); x.fillStyle = '#FFFFFF'; x.fill(); x.lineWidth = 4; x.strokeStyle = c0.metal; x.stroke();
      x.fillStyle = c0.facade; x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = `italic 500 72px ${SERIF}`; x.fillText('Open', 128, 84);
      plan(0.52, 0.32, matBasic({ map: texDe(c, true, false) }, false), 0.9, 2.1, -0.07, pivot);
      cliquable(boite(1.9, 3.1, 0.5, matInvisible, 0, 1.55, 0.2, g), { type: 'entrer', boutique: centre.slug });
      porteFacade = { pivot, slug: centre.slug };
      for (const sx of [-1.35, 1.35]) {
        boite(0.14, 0.28, 0.14, mLaiton, sx, 3.25, 0.12, g);
        boite(0.09, 0.18, 0.09, matBasic({ color: lumineux('#ffd9a0', 2.8) }, false), sx, 3.25, 0.12, g);
        plan(1.0, 1.0, matHalo(0xffd9a0, 0.4, false), sx, 3.25, 0.25, g);
      }
      const mBac = matStd({ color: 0x15151a, roughness: 0.4, metalness: 0.3 }, false); const mVert = matStd({ color: 0x2b4f31, roughness: 0.9 }, false);
      for (const sx of [-1.75, 1.75]) {
        cylindre(0.3, 0.55, mBac, sx, 0.275, 0.6, g); cylindre(0.31, 0.02, mLaiton, sx, 0.55, 0.6, g);
        const s = new THREE.Mesh(GEO.sphere, mVert); s.scale.set(0.34, 0.42, 0.34); s.position.set(sx, 0.95, 0.6); g.add(s);
      }
    }
    // Rue : trottoir mouillé (reflets), lampadaires, voisins
    {
      const [c, x] = toile(1040, 360);
      x.fillStyle = '#6E6A63'; x.fillRect(0, 0, 1040, 360);
      x.strokeStyle = 'rgba(0,0,0,.2)'; x.lineWidth = 2;
      for (let px = 0; px < 1040; px += 60) { x.beginPath(); x.moveTo(px, 0); x.lineTo(px, 360); x.stroke(); }
      for (let py = 0; py < 360; py += 60) { x.beginPath(); x.moveTo(0, py); x.lineTo(1040, py); x.stroke(); }
      x.globalCompositeOperation = 'multiply'; x.fillStyle = '#6A7084'; x.fillRect(0, 0, 1040, 360);
      x.globalCompositeOperation = 'screen';
      const flaque = (wx, col, a) => { const px = (wx + 13) * 40; const gg = x.createRadialGradient(px, 0, 0, px, 0, 230); gg.addColorStop(0, rgba(col, a)); gg.addColorStop(1, rgba(col, 0)); x.save(); x.scale(1, 1.15); x.fillStyle = gg; x.fillRect(0, 0, 1040, 360); x.restore(); };
      if (gauche) flaque(-5.6, gauche.theme.couleurs.accent, 0.5);
      if (droite) flaque(5.6, droite.theme.couleurs.lumiere, 0.45);
      flaque(0, c0.lumiere, 0.55);
      x.globalCompositeOperation = 'source-over';
      const mTrottoir = STD
        ? matStd({ color: 0x000000, emissive: 0xffffff, emissiveMap: texDe(c, true, false), roughness: 0.22, metalness: 0, envMapIntensity: 0.9 }, false)
        : matBasic({ map: texDe(c, true, false) }, false);
      if (miroir && STD) miroir.appliquer(mTrottoir, 0.6); // trottoir mouillé : reflète vraiment les vitrines
      const trottoir = plan(26, 9, mTrottoir, 0, 0, 4.5, g); trottoir.rotation.x = -Math.PI / 2;
      boite(26, 0.14, 0.28, matStd({ color: 0x77736c, roughness: 0.8 }, false), 0, 0.07, 9.0, g);
      const [cr2, xr2] = toile(512, 512);
      xr2.fillStyle = '#121418'; xr2.fillRect(0, 0, 512, 512);
      const r = alea(4); for (let i = 0; i < 6000; i++) { xr2.fillStyle = `rgba(255,255,255,${r() * 0.035})`; xr2.fillRect(r() * 512, r() * 512, 1.5, 1.5); }
      xr2.fillStyle = 'rgba(230,220,190,.3)'; for (let px = 0; px < 512; px += 64) xr2.fillRect(px, 250, 34, 6);
      const mRue = STD ? matStd({ color: 0x000000, emissive: 0xffffff, emissiveMap: texDe(cr2, true, false), roughness: 0.35, metalness: 0, envMapIntensity: 0.6 }, false) : matBasic({ map: texDe(cr2, true, false) }, false);
      const rue = plan(70, 34, mRue, 0, -0.02, 26, g); rue.rotation.x = -Math.PI / 2;
      const mMat = matStd({ color: 0x1a1d24, roughness: 0.4, metalness: 0.6 }, false);
      for (const sx of [-11, 11]) {
        cylindre(0.06, 4.6, mMat, sx, 2.3, 8.6, g);
        boite(0.5, 0.08, 0.22, mMat, sx, 4.62, 8.6, g);
        boite(0.42, 0.02, 0.16, matBasic({ color: lumineux('#FFE2B0', 3) }, false), sx, 4.57, 8.6, g);
        plan(2.4, 2.4, matHalo(0xffd9a0, 0.3, false), sx, 4.5, 8.7, g);
        const fl = plan(4, 4, matHalo(0xffd9a0, 0.18, false), sx, 0.01, 8.0, g); fl.rotation.x = -Math.PI / 2;
      }
      const mVoisin = matStd({ color: 0x232a38, roughness: 0.8 }, false);
      for (const [x0, h] of [[-20.5, 10.5], [9.2, 9.5]]) {
        boite(11.2, h, 6, mVoisin, x0 + 5.6, h / 2, -3, g);
        const n = 12; const im = new THREE.InstancedMesh(GEO.plan, matBasic({ color: 0xffffff }, false), n);
        const m4 = new THREE.Matrix4(); const col = new THREE.Color(); const rr = alea(hachage(x0));
        for (let i = 0; i < n; i++) { const cx = x0 + 1.4 + (i % 4) * 2.8; const cy = 4.8 + Math.floor(i / 4) * 2.1; m4.compose(V(cx, cy, 0.01), new THREE.Quaternion(), V(1.1, 1.4, 1)); im.setMatrixAt(i, m4); im.setColorAt(i, col.set(rr() < 0.45 ? '#F3C98B' : '#262F47')); }
        g.add(im);
      }
      if (REGLAGES[niveau].env) {
        const s = new THREE.Scene();
        s.add(new THREE.Mesh(new THREE.SphereGeometry(30, 16, 10), new THREE.MeshBasicMaterial({ map: degrade(['#0A1222', '#2A3A5E', '#C88A5A', '#141820'], true, false), side: THREE.BackSide })));
        envFacade = pmrem.fromScene(s, 0.04).texture;
      }
    }
  }
  const ciel = degrade(['#070D1A', '#16223D', '#3D3552', '#A86F4C'], true, false);

  function vitrineFacade(b, x0, x1, y0, y1, nb, parent, decalage = 0) {
    const g = new THREE.Group(); parent.add(g);
    const t = b.theme; const c = t.couleurs; const d = t.decor || [];
    const neon = d.includes('neon'); const fete = d.some((k) => ['neige', 'guirlandes', 'sapin'].includes(k));
    const w = x1 - x0; const h = y1 - y0; const cx = (x0 + x1) / 2; const cy = (y0 + y1) / 2; const prof = 1.4;
    plan(w, h, matBasic({ map: degrade([melange(c.mur, '#ffffff', neon ? 0.04 : 0.2), melange(c.mur, '#000000', 0.4)], true, false), color: lumineux('#ffffff', 1.1) }, false), cx, cy, -prof, g);
    const mNiche = matBasic({ color: melange(c.mur, '#000000', 0.35) }, false);
    const sg = plan(prof, h, mNiche, x0, cy, -prof / 2, g); sg.rotation.y = Math.PI / 2;
    const sd = plan(prof, h, mNiche, x1, cy, -prof / 2, g); sd.rotation.y = -Math.PI / 2;
    const so = plan(w, prof, matBasic({ color: melange(c.sol, '#000000', 0.2) }, false), cx, y0 + 0.002, -prof / 2, g); so.rotation.x = -Math.PI / 2;
    const ha = plan(w, prof, mNiche, cx, y1 - 0.002, -prof / 2, g); ha.rotation.x = Math.PI / 2;
    boite(w - 0.1, 0.012, 0.012, matBasic({ color: lumineux(neon ? c.accent : c.lumiere, 3) }, false), cx, y1 - 0.02, -0.3, g);
    const fl = plan(w * 0.9, prof * 0.9, matHalo(neon ? c.accent : c.lumiere, 0.45, false), cx, y0 + 0.01, -prof / 2, g); fl.rotation.x = -Math.PI / 2;
    const ids = b.sections.flatMap((s) => s.produits).slice(decalage, decalage + nb);
    const mSocle = matStd({ color: neon ? '#111111' : c.metal, metalness: neon ? 0.3 : 1, roughness: 0.3 }, false);
    ids.forEach((id, k) => {
      const px = x0 + (k + 0.5) * (w / nb);
      const pw = Math.min(1.45, (w / nb) * 0.82);
      cylindre(pw * 0.38, 0.3, mSocle, px, y0 + 0.15, -prof * 0.55, g);
      const e = carte(id, { maxW: pw, maxH: h * 0.48, jetable: false });
      const placer = () => { e.mesh.scale.set(e.w, e.h, 1); e.mesh.position.set(px, y0 + 0.32 + e.h / 2, -prof * 0.55); e.eclat(1); };
      e.apresChargement = placer; placer();
      e.mesh.rotation.y = (k - (nb - 1) / 2) * -0.14;
      e.mesh.renderOrder = 3;
      g.add(e.mesh);
    });
    const prF = nb > 1 ? promoDe(b.slug) : null;
    if (prF) {
      const bn = banniere(prF, c);
      const tp = plan(w * 0.82, w * 0.82 * 180 / 1024, matBasic({ map: bn.tex, color: lumineux('#ffffff', 1.3), transparent: true }, false), cx, y1 - 0.38, -0.3, g);
      tp.renderOrder = 4;
      const sk = plan(1.05, 1.05, matBasic({ map: stickerTex(prF.remise, prF.style), transparent: true, depthWrite: false, color: lumineux('#ffffff', 1.1) }, false), x1 - 0.7, y0 + 0.75, -0.015, g);
      sk.rotation.z = -0.22; sk.renderOrder = 7;
      stickersFacade.push(sk);
    } else if (nb > 1) {
      const st = style(t);
      const tp = plan(w * 0.7, w * 0.15, matBasic({ map: titreLumineux(b.nomCourt, { ...st, sombre: true }, 1024, 220), transparent: true, depthWrite: false, color: lumineux('#ffffff', 1.3) }, false), cx, y1 - 0.42, -0.35, g);
      tp.renderOrder = 4;
    }
    if (neon) {
      const m = matBasic({ color: lumineux(c.accent, 3) }, false);
      for (const [bw, bh, bx, by] of [[w - 0.1, 0.02, cx, y1 - 0.08], [w - 0.1, 0.02, cx, y0 + 0.08], [0.02, h - 0.1, x0 + 0.08, cy], [0.02, h - 0.1, x1 - 0.08, cy]]) boite(bw, bh, 0.02, m, bx, by, -0.12, g);
    }
    if (fete) {
      const pts = []; for (let k = 0; k <= 40; k++) { const u = k / 40; pts.push(V(x0 + 0.1 + (w - 0.2) * u, y1 - 0.12 - 0.16 * Math.sin(Math.PI * ((u * 3) % 1)), -0.25)); }
      const courbe = new THREE.CatmullRomCurve3(pts);
      const n = 36; const im = new THREE.InstancedMesh(GEO.sphere, matBasic({ color: 0xffffff }, false), n);
      const m4 = new THREE.Matrix4(); const col = new THREE.Color();
      for (let i = 0; i < n; i++) { const p = courbe.getPointAt(i / n); m4.compose(p, new THREE.Quaternion(), V(0.022, 0.022, 0.022)); im.setMatrixAt(i, m4); im.setColorAt(i, col.copy(lumineux(i % 2 ? c.metal : '#FFE2A8', 2.5))); }
      g.add(im); facadeAmpoules.push(im);
      if (REGLAGES[niveau].neige) {
        const nbn = 70; const geo = new THREE.BufferGeometry(); const pos = new Float32Array(nbn * 3); const rr = alea(77);
        for (let i = 0; i < nbn; i++) { pos[i * 3] = x0 + rr() * w; pos[i * 3 + 1] = y0 + rr() * h; pos[i * 3 + 2] = -0.2 - rr() * (prof - 0.3); }
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        const pts2 = new THREE.Points(geo, neige.material); pts2.frustumCulled = false; g.add(pts2);
        neigeFacade.push({ geo, pos, y0, y1 });
      }
    }
    const vitre = plan(w, h, matStd({ color: neon ? '#2a2a2e' : '#ffffff', transparent: true, opacity: neon ? 0.2 : 0.08, roughness: 0.03, metalness: 0, depthWrite: false, envMapIntensity: 1.8 }, false), cx, cy, -0.04, g);
    vitre.renderOrder = 6;
    const zone = cliquable(plan(w, h, matInvisible, cx, cy, 0.02, g), { type: nb > 1 ? 'fenetre' : 'entrer', boutique: b.slug });
    return { g, slug: b.slug, zone, cx, cy };
  }

  /* ===================================================================== */
  /*  NAVIGATION                                                            */
  /* ===================================================================== */
  const anims = new Set();
  function animerVers(f, duree, courbe = EASE.inOut) {
    if (reduit || duree <= 0) { f(1); return Promise.resolve(); }
    return new Promise((ok) => anims.add({ t: 0, duree: duree / 1000, f, courbe, ok }));
  }
  function fondu(vers, couleur, duree) {
    if (couleur) voile.style.background = couleur;
    const de = Number(voile.style.opacity || 0);
    return animerVers((k) => { voile.style.opacity = String(de + (vers - de) * k); }, reduit ? 120 : duree, EASE.inOut).then(() => { voile.style.opacity = String(vers); });
  }

  // Position et regard du visiteur
  const nav = {
    pos: V(0, 2.4, 30), yaw: 0, pitch: 0, yawC: 0, pitchC: 0,
    vel: V(0, 0, 0), dest: null, trajet: null,
    entree: { avant: 0, cote: 0, tour: 0 }, // clavier + joystick
    impulsion: 0,                            // molette / pincement (m/s)
  };
  const dir = (yaw, pitch, v = V(0, 0, 0)) => { const c = Math.cos(pitch); return v.set(-Math.sin(yaw) * c, Math.sin(pitch), -Math.cos(yaw) * c); };
  const angles = (de, vers) => { const d = vers.clone().sub(de); return { yaw: Math.atan2(-d.x, -d.z), pitch: Math.atan2(d.y, Math.hypot(d.x, d.z)) }; };

  /** Déplacement animé vers une position et un point regardé. Toute action du visiteur l'interrompt. */
  function allerVers(pos, regard, duree) {
    const p0 = nav.pos.clone(); const y0 = nav.yaw; const t0 = nav.pitch;
    const a = angles(pos, regard);
    const dy = angleDiff(y0, a.yaw);
    const d = duree ?? clamp((p0.distanceTo(pos) / 2.4) * 1000, 600, 1700);
    nav.dest = null; nav.vel.set(0, 0, 0);
    const tr = {};
    nav.trajet = tr;
    return animerVers((k) => {
      if (nav.trajet !== tr) return;
      nav.pos.lerpVectors(p0, pos, k);
      nav.yaw = nav.yawC = y0 + dy * k;
      nav.pitch = nav.pitchC = t0 + (a.pitch - t0) * k;
      if (k >= 1) nav.trajet = null;
    }, d);
  }
  function interrompre() { nav.trajet = null; nav.dest = null; }

  // Zone de circulation (on ne traverse ni vitrines, ni comptoir, ni décors)
  const obstacles = [{ x: -5.85, z: -1.3, r: 0.75 }, { x: 5.8, z: -1.4, r: 0.75 }];
  if (holoNl) obstacles.push({ x: HOLO_X, z: HOLO_Z, r: 0.6 });
  function contraindre(p) {
    p.x = clamp(p.x, -5.3, 5.3);
    p.z = clamp(p.z, -21.0, -0.4);
    if (p.z < -17.6) p.x = Math.sign(p.x || 1) * Math.max(Math.abs(p.x), 3.05);
    for (const ob of obstacles) {
      const dx = p.x - ob.x; const dz = p.z - ob.z; const dd = Math.hypot(dx, dz);
      if (dd < ob.r && dd > 1e-4) { p.x = ob.x + (dx / dd) * ob.r; p.z = ob.z + (dz / dd) * ob.r; }
    }
    p.y = OEIL;
    return p;
  }

  const tanV = () => Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const largeurEcran = () => conteneur.clientWidth || window.innerWidth;
  function centreVitrine(slot) { const s = SLOTS[slot]; return V(s.cote * (L / 2 - 0.73), 1.8, s.z); }

  /** Raccourcis (barre du bas) : position + point regardé. */
  function pose(id) {
    const tv = tanV(); const th = tv * camera.aspect;
    if (id === 'facade') {
      const d = Math.max(19.5 / 2 / th, 9.8 / 2 / tv) * 1.02;
      return { pos: V(0, 2.4, Math.min(d, 36)), regard: V(0, camera.aspect < 0.9 ? 2.9 : 3.6, 0) };
    }
    if (id === 'accueil') return { pos: V(0, OEIL, -0.8), regard: V(0, 1.45, -12) };
    if (id === 'comptoir') {
      const d = clamp(Math.max((camera.aspect < 1 ? 5.4 : 8.5) / 2 / th, 3.4 / 2 / tv), 2.6, 9);
      return { pos: contraindre(V(0, 0, COMPTOIR_Z + 0.55 + d)), regard: V(0, 1.3, COMPTOIR_Z) };
    }
    if (id === 'newsletter') {
      const d = camera.aspect < 1 ? 3.0 : 2.75;
      return { pos: contraindre(V(HOLO_X + 0.85, 0, HOLO_Z + d)), regard: V(HOLO_X, 1.8, HOLO_Z) };
    }
    if (id.startsWith('v')) {
      const slot = Number(id.slice(1)); const s = SLOTS[slot]; const c = centreVitrine(slot);
      const d = clamp(Math.max((camera.aspect < 0.8 ? 2.7 : 3.9) / 2 / th, 2.9 / 2 / tv), 1.8, 6.5);
      return { pos: contraindre(V(c.x - s.cote * d, 0, s.z)), regard: V(c.x, 1.85, s.z) };
    }
    if (id.startsWith('porte:')) {
      const pt = portes.find((p) => `porte:${p.slug}` === id);
      return { pos: contraindre(V(pt.x, 0, ZF + 3.8)), regard: V(pt.x, 1.6, ZF) };
    }
    return pose('accueil');
  }

  let contexte = 'facade';
  let zone = { id: 'facade', type: 'facade' };
  let zoom = null; let avantZoom = null;
  let verrou = false;
  let enAttente = null;
  function deverrouiller() { verrou = false; if (enAttente) { const id = enAttente; enAttente = null; allerStation(id); } }

  function changerContexte(c) {
    contexte = c;
    groupeFacade.visible = c === 'facade';
    groupeInterieur.visible = c === 'interieur';
    pad.style.display = c === 'interieur' ? '' : 'none';
    if (c === 'facade') {
      scene.background = ciel;
      scene.fog = new THREE.FogExp2('#141B2C', 0.012);
      hemi.color.set('#8FA3D6'); hemi.groundColor.set('#3A2E25'); hemi.intensity = REGLAGES[niveau].env ? 1.0 : 1.9;
      soleil.color.set('#FFD9B0'); soleil.intensity = 1.1; soleil.position.set(-5, 7, 12); soleil.target.position.set(0, 2, 0);
      renderer.toneMappingExposure = 1.05;
      scene.environment = envFacade;
      if (post) post.force(1.0);
    } else {
      const t = cat.boutiques.find((b) => b.slug === themeCourant).theme;
      scene.background = new THREE.Color(t.couleurs.mur);
      scene.fog = brume(t);
      scene.environment = envInterieur;
      reglerLumieres();
      planifierReflets(0.3);
    }
  }

  /** Zone actuelle (vitrine regardée, comptoir…) : barre du bas, légende et « Reculer ». */
  let carrouselActif = null;
  function majZone() {
    if (contexte !== 'interieur') return;
    const regard = dir(nav.yaw, 0); let meilleur = null;
    carrousels.forEach((car) => {
      const c = centreVitrine(car.slot); const dx = c.x - nav.pos.x; const dz = c.z - nav.pos.z; const dd = Math.hypot(dx, dz);
      const face = (dx * regard.x + dz * regard.z) / (dd || 1);
      if (dd < 6.2 && face > 0.72 && (!meilleur || dd < meilleur.d)) meilleur = { car, d: dd };
    });
    let z = null;
    if (zoom) z = zone;
    else if (meilleur) z = { id: `v${meilleur.car.slot}`, type: 'vitrine', slot: meilleur.car.slot, proche: meilleur.d < 4.8 };
    else {
      if (holoNl) {
        const hx = HOLO_X - nav.pos.x; const hz = HOLO_Z - nav.pos.z; const dh = Math.hypot(hx, hz);
        if (dh < 5.2 && (hx * regard.x + hz * regard.z) / (dh || 1) > 0.9) z = { id: 'newsletter', type: 'newsletter' };
      }
      if (!z) {
        for (const pt of portes) {
          const px = pt.x - nav.pos.x; const pz = ZF - nav.pos.z; const dp = Math.hypot(px, pz);
          if (dp < 8 && (px * regard.x + pz * regard.z) / (dp || 1) > 0.93) { z = { id: `porte:${pt.slug}`, type: 'porte', boutique: pt.slug, nom: pt.nom }; break; }
        }
      }
      const cx = -nav.pos.x; const cz = COMPTOIR_Z - nav.pos.z; const dc = Math.hypot(cx, cz);
      if (!z && dc < 11 && (cx * regard.x + cz * regard.z) / (dc || 1) > 0.8) z = { id: 'comptoir', type: 'comptoir' };
    }
    if (!z) z = { id: 'libre', type: 'libre' };
    carrouselActif = z.type === 'vitrine' ? carrousels[z.slot] : null;
    if (z.id !== zone.id) {
      zone = z;
      const b = cat.boutiques.find((x) => x.slug === themeCourant);
      rappels.station({ ...z, titre: z.type === 'vitrine' ? b.sections[z.slot]?.titre || '' : '' });
      if (carrouselActif) carrouselActif.selAvant = -2; else rappels.centre(null);
    } else zone = z;
  }

  async function allerStation(id) {
    if (contexte !== 'interieur') return;
    if (id.startsWith('v') && !carrousels[Number(id.slice(1))]) return;
    zoom = null; avantZoom = null;
    const p = pose(id);
    await allerVers(p.pos, p.regard);
  }

  function poseZoom(z) {
    const car = carrousels[z.slot]; const e = car.cartes[z.index]; const s = SLOTS[z.slot];
    const p = slotsG[z.slot].localToWorld(V(e.x, e.base + 0.012 + (e.h * 1.07) / 2, 0.11));
    const n = V(-s.cote, 0, 0); const droite = V(0, 0, s.cote);
    const tv = tanV(); const th = tv * camera.aspect; const larg = e.w * 1.07; const haut = e.h * 1.07;
    let d; const regard = p.clone();
    if (largeurEcran() >= 960) {
      d = Math.max(larg / 0.4 / 2 / th, haut / 0.55 / 2 / tv);
      regard.addScaledVector(droite, (2 * d * th * (460 / largeurEcran())) / 2);
    } else {
      d = Math.max(larg / 0.55 / 2 / th, haut / 0.13 / 2 / tv);
      regard.y -= 2 * d * tv * 0.29;
    }
    const pos = p.clone().addScaledVector(n, d); pos.y = p.y;
    return { pos, regard };
  }
  async function zoomer(slot, index) {
    const car = carrousels[slot];
    car.sel = index;
    avantZoom = avantZoom || { pos: nav.pos.clone(), yaw: nav.yaw, pitch: nav.pitch };
    zoom = { slot, index };
    const p = poseZoom(zoom);
    await allerVers(p.pos, p.regard, 700);
  }
  function fermerZoom() {
    if (!zoom) return;
    zoom = null;
    if (avantZoom) {
      const a = avantZoom; avantZoom = null;
      const pos = contraindre(a.pos.clone());
      allerVers(pos, pos.clone().add(dir(a.yaw, a.pitch).multiplyScalar(5)), 600);
    }
  }
  /** Prendre du recul : 2,5 m en arrière, en gardant le regard. */
  function reculer(m = 2.5) {
    if (contexte !== 'interieur' || verrou) return;
    if (zoom) { fermerZoom(); return; }
    const cible = contraindre(nav.pos.clone().add(dir(nav.yaw, 0).multiplyScalar(-m)));
    allerVers(cible, cible.clone().add(dir(nav.yaw, Math.min(nav.pitch, 0)).multiplyScalar(5)), 650);
  }

  /* ------------------------------ Interaction ------------------------------ */
  const canvas = renderer.domElement;
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const planSol = new THREE.Plane(V(0, 1, 0), 0);
  function viser(ev) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const cibles = contexte === 'facade' ? [...fenetres.map((f) => f.zone), ...groupeFacade.children.filter((x) => x.userData.cible)] : cliquables;
    const hits = ray.intersectObjects(cibles, false);
    let zoneHit = null;
    for (const h of hits) {
      const ob = h.object;
      if (!ob.visible) continue;
      if (ob.material && ob.material !== matInvisible && ob.material.opacity < 0.3) continue;
      const c = ob.userData.cible;
      // Hologramme newsletter devant une porte (de près comme de loin) : on garde celui que le doigt
      // vise le plus au centre. Le cœur du panneau ouvre toujours le formulaire ; son bord laisse passer la porte.
      if (c.type === 'newsletter') {
        const porte = hits.find((k) => k.object.userData.cible?.type === 'porte');
        if (porte && centrage(h) > 0.72 && centrage(porte) < centrage(h)) continue;
      }
      if (c.type !== 'station') return !zoneHit || h.distance < zoneHit.d + 1.6 ? { ...c, distance: h.distance } : zoneHit.c;
      if (!zoneHit) zoneHit = { c: { ...c, distance: h.distance }, d: h.distance };
    }
    return zoneHit ? zoneHit.c : null;
  }
  /** 0 = clic au centre de la zone touchée, 1 = sur son bord (dans le plan face au visiteur). */
  function centrage(h) {
    const geo = h.object.geometry;
    if (!geo || !h.object.worldToLocal) return 0.5;
    if (!geo.boundingBox && geo.computeBoundingBox) geo.computeBoundingBox();
    const bb = geo.boundingBox; if (!bb) return 0.5;
    const p = h.object.worldToLocal(h.point.clone());
    const hx = (bb.max.x - bb.min.x) / 2 || 1; const hy = (bb.max.y - bb.min.y) / 2 || 1;
    return Math.max(Math.abs(p.x - (bb.max.x + bb.min.x) / 2) / hx, Math.abs(p.y - (bb.max.y + bb.min.y) / 2) / hy);
  }
  function pointSol() {
    if (contexte !== 'interieur') return null;
    const p = V(0, 0, 0);
    if (!ray.ray.intersectPlane(planSol, p)) return null;
    if (p.distanceTo(nav.pos) > 22) return null;
    return p;
  }

  // Joystick (téléphone ET ordinateur) : haut/bas = avancer/reculer, gauche/droite = tourner
  const pad = document.createElement('div');
  pad.className = 'pad3d';
  pad.setAttribute('aria-hidden', 'true');
  pad.title = 'Drag to move';
  pad.innerHTML = '<span class="pad3d-bouton"></span>';
  pad.style.display = 'none';
  conteneur.appendChild(pad);
  const bouton = pad.firstChild;
  let padId = null;
  const majPad = (ev) => {
    const r = pad.getBoundingClientRect(); const R = r.width / 2;
    let dx = ev.clientX - (r.left + R); let dy = ev.clientY - (r.top + R);
    const l = Math.hypot(dx, dy); if (l > R * 0.62) { dx *= (R * 0.62) / l; dy *= (R * 0.62) / l; }
    bouton.style.transform = `translate(${dx}px, ${dy}px)`;
    nav.entree.avant = clamp(-dy / (R * 0.62), -1, 1);
    nav.entree.tour = Math.abs(dx) > R * 0.12 ? clamp(dx / (R * 0.62), -1, 1) : 0;
  };
  pad.addEventListener('pointerdown', (ev) => { ev.stopPropagation(); interrompre(); if (zoom) fermerZoom(); padId = ev.pointerId; pad.setPointerCapture(ev.pointerId); majPad(ev); });
  pad.addEventListener('pointermove', (ev) => { if (ev.pointerId === padId) majPad(ev); });
  const finPad = (ev) => { if (ev.pointerId !== padId) return; padId = null; bouton.style.transform = ''; nav.entree.avant = 0; nav.entree.tour = 0; };
  pad.addEventListener('pointerup', finPad); pad.addEventListener('pointercancel', finPad);

  let survolee = null;
  let porteSurvolee = null;
  const pointeurs = new Map();
  const geste = { mode: null, id: null, x0: 0, y0: 0, t0: 0, x: 0, y: 0, t: 0, v: 0, deplace: 0, car: null, pince: 0 };

  canvas.addEventListener('pointerdown', (ev) => {
    if (verrou) return;
    pointeurs.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    try { canvas.setPointerCapture(ev.pointerId); } catch (_) { /* rien */ }
    if (pointeurs.size === 2) { // deux doigts : pincer pour avancer / reculer
      const [a, b] = [...pointeurs.values()];
      geste.mode = 'pince'; geste.pince = Math.hypot(a.x - b.x, a.y - b.y);
      return;
    }
    interrompre();
    Object.assign(geste, { id: ev.pointerId, x0: ev.clientX, y0: ev.clientY, x: ev.clientX, y: ev.clientY, t0: performance.now(), t: performance.now(), v: 0, deplace: 0, car: null, mode: 'regard' });
    if (zoom) { geste.mode = 'aucun'; return; }
    if (contexte !== 'interieur') return;
    conteneur.classList.add('saisie');
  });

  canvas.addEventListener('pointermove', (ev) => {
    if (pointeurs.has(ev.pointerId)) pointeurs.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (geste.mode === 'pince' && pointeurs.size === 2) {
      const [a, b] = [...pointeurs.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (zoom && d < geste.pince - 20) fermerZoom();
      nav.impulsion = clamp(nav.impulsion + (d - geste.pince) * 0.035, -3, 3); geste.pince = d;
      return;
    }
    if (!pointeurs.has(ev.pointerId) || ev.pointerId !== geste.id) {
      if (ev.pointerType === 'mouse' && !pointeurs.size) survol(ev);
      return;
    }
    const maintenant = performance.now();
    const dx = ev.clientX - geste.x; const dy = ev.clientY - geste.y; const dt = Math.max(1, maintenant - geste.t);
    geste.deplace = Math.max(geste.deplace, Math.hypot(ev.clientX - geste.x0, ev.clientY - geste.y0));
    if (geste.mode === 'regard') {
      const k = (tactile ? 0.0052 : 0.0042) * (camera.fov / 52);
      nav.yawC += dx * k;
      nav.pitchC = clamp(nav.pitchC + dy * k, contexte === 'facade' ? -0.3 : -0.75, contexte === 'facade' ? 0.25 : 0.6);
      if (contexte === 'facade') nav.yawC = clamp(nav.yawC, -0.45, 0.45);
    }
    geste.x = ev.clientX; geste.y = ev.clientY; geste.t = maintenant;
  });

  const finGeste = (ev) => {
    pointeurs.delete(ev.pointerId);
    if (geste.mode === 'pince') { if (pointeurs.size === 0) geste.mode = null; return; }
    if (ev.pointerId !== geste.id) return;
    conteneur.classList.remove('saisie');
    const tap = geste.deplace < 9 && performance.now() - geste.t0 < 450;
    geste.mode = null; geste.car = null;
    if (tap && ev.type === 'pointerup') toucher(ev);
  };
  canvas.addEventListener('pointerup', finGeste);
  canvas.addEventListener('pointercancel', finGeste);

  canvas.addEventListener('wheel', (ev) => {
    if (verrou || contexte !== 'interieur') return;
    ev.preventDefault();
    interrompre();
    if (zoom) { if (ev.deltaY > 0) fermerZoom(); return; }
    nav.impulsion = clamp(nav.impulsion - ev.deltaY * 0.012, -3.2, 3.2); // molette : avancer / reculer
  }, { passive: false });

  // Position du pointeur (−1…1), lissée : inclinaison des cartes et parallaxe de la façade
  const pointeur = new THREE.Vector2(); const pointeurCible = new THREE.Vector2();
  canvas.addEventListener('pointermove', (ev) => {
    if (ev.pointerType === 'touch') return;
    const r = canvas.getBoundingClientRect();
    pointeurCible.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
  }, { passive: true });
  canvas.addEventListener('pointerleave', () => pointeurCible.set(0, 0), { passive: true });

  let dernierSurvol = 0;
  function survol(ev) {
    const t = performance.now(); if (t - dernierSurvol < 60) return; dernierSurvol = t;
    const c = viser(ev);
    survolee = c && c.type === 'carte' ? carrousels[c.slot]?.cartes[c.index] : null;
    carrousels.forEach((car) => { car.sel = c && c.type === 'carte' && c.slot === car.slot ? c.index : -1; });
    const surSol = !c || c.type === 'station' ? pointSol() : null;
    conteneur.classList.toggle('pointe', Boolean(c) || Boolean(surSol));
    // Retour visuel : on voit tout de suite ce que le clic va ouvrir (hologramme ou porte)
    if (holoNl && c && c.type === 'newsletter') holoNl.flash = Math.max(holoNl.flash, 0.4);
    porteSurvolee = c && c.type === 'porte' ? c.boutique : null;
    if (surSol && !zoom) { repere.position.x = surSol.x; repere.position.z = surSol.z; repere.material.opacity = 0.55; }
    else if (!nav.dest) repere.material.opacity = 0;
  }

  function marcherVers(p) {
    const cible = contraindre(V(p.x, 0, p.z));
    interrompre();
    nav.dest = cible;
    repere.position.set(cible.x, 0.012, cible.z); repere.material.opacity = 0.8;
  }

  async function toucher(ev) {
    const c = viser(ev);
    if (verrou) return;
    if (!c) { const s = pointSol(); if (s && !zoom) { marcherVers(s); rappels.clic(); } return; }
    rappels.clic();
    switch (c.type) {
      case 'entrer': case 'fenetre': rappels.entrer(c.boutique); break;
      case 'station':
        if (c.id.startsWith('v') && zone.id === c.id && zone.proche) { const s = pointSol(); if (s) marcherVers(s); break; }
        allerStation(c.id); break;
      case 'carte': {
        const car = carrousels[c.slot];
        if (c.distance > 6.5 && zone.id !== `v${c.slot}`) { await allerStation(`v${c.slot}`); break; }
        verrou = true;
        try { await zoomer(c.slot, c.index); } finally { verrou = false; }
        rappels.ouvrirFiche(car.cartes[c.index].id);
        break;
      }
      case 'porte': rappels.porte(c.boutique); break;
      case 'presentoir': rappels.presentoir(c.boutique, c.produit); break;
      case 'panier': rappels.panier(); break;
      case 'service': rappels.service(); break;
      case 'newsletter':
        if (c.distance > 6.5) await allerStation('newsletter');
        if (holoNl) holoNl.flash = 1;
        rappels.newsletter?.();
        break;
      default:
    }
  }

  const touches = new Set();
  const majClavier = () => {
    const av = (touches.has('KeyW') || touches.has('ArrowUp') ? 1 : 0) - (touches.has('KeyS') || touches.has('ArrowDown') ? 1 : 0);
    const co = (touches.has('KeyD') ? 1 : 0) - (touches.has('KeyA') ? 1 : 0);
    const to = (touches.has('ArrowRight') || touches.has('KeyE') ? 1 : 0) - (touches.has('ArrowLeft') || touches.has('KeyQ') ? 1 : 0);
    if (padId === null) { nav.entree.avant = av; nav.entree.tour = to; }
    nav.entree.cote = co;
  };
  function clavierLibre(ev) {
    if (pause || contexte !== 'interieur') return false;
    if (document.querySelector('.tiroir:not([hidden]), #guide:not([hidden]), #confirmation:not([hidden])')) return false;
    const c = ev.target;
    if (c && c.closest && c.closest('input, textarea, select')) return false;
    return c === document.body || c === canvas || (c.closest && c.closest('#stations, #hud'));
  }
  window.addEventListener('keydown', (ev) => {
    if (!clavierLibre(ev)) return;
    const k = ev.code;
    const surBouton = ev.target.closest && ev.target.closest('button');
    if ((k === 'ArrowLeft' || k === 'ArrowRight') && carrouselActif && zone.proche && !surBouton) {
      ev.preventDefault();
      const car = carrouselActif;
      car.sel = car.sel < 0 ? 0 : clamp(car.sel + (k === 'ArrowRight' ? 1 : -1), 0, car.cartes.length - 1);
      return;
    }
    if ((k === 'Enter' || k === 'Space') && carrouselActif && !zoom && !surBouton) {
      ev.preventDefault();
      const car = carrouselActif; const i = Math.max(0, car.sel);
      verrou = true;
      zoomer(car.slot, i).then(() => { verrou = false; rappels.ouvrirFiche(car.cartes[i].id); });
      return;
    }
    if (k === 'Backspace') { ev.preventDefault(); reculer(); return; }
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(k)) {
      if (surBouton && (k === 'ArrowLeft' || k === 'ArrowRight')) return; // laisser la barre défiler
      ev.preventDefault(); interrompre(); if (zoom) fermerZoom(); touches.add(k); majClavier();
    }
  });
  window.addEventListener('keyup', (ev) => { touches.delete(ev.code); majClavier(); });
  window.addEventListener('blur', () => { touches.clear(); majClavier(); });

  /* ------------------------------ Boucle ------------------------------ */
  let pause = false;
  let dernier = performance.now();
  let temps = 0; let tZone = 0;
  let fpsAcc = 0; let fpsN = 0; let lent = 0;
  let minuterieTwinkle = 0;
  const col = new THREE.Color();
  const tmp = V(0, 0, 0);

  function majCarrousel(car, dt, actif) {
    if (car.sel !== car.selAvant) {
      car.selAvant = car.sel;
      if (actif) {
        if (car.sel >= 0) { rappels.centre(car.cartes[car.sel].id); balayer(car.slot, car.cartes[car.sel].x); }
        else rappels.rayon({ titre: car.titre, nombre: car.cartes.length });
      }
    }
    let lueur = null;
    car.cartes.forEach((e, i) => {
      e.hl += ((i === car.sel ? 1 : 0) - e.hl) * Math.min(1, dt * 10);
      const s = 1 + 0.07 * e.hl;
      const y = e.base + 0.012 + (e.h * s) / 2 + (reduit ? 0 : 0.006 * Math.sin(temps * 1.2 + i * 1.7));
      e.mesh.scale.set(e.w * s, e.h * s, 1);
      e.mesh.position.set(e.x, y, 0.03 + 0.1 * e.hl);
      if (!reduit) {
        // Les cartes vivent : léger balancement au repos ; survolée, la carte s'incline vers le pointeur
        let ry = 0.07 * Math.sin(temps * 0.55 + i * 2.1) * (1 - e.hl); let rx = 0;
        if (e.hl > 0.02) {
          e.mesh.getWorldPosition(tmp).project(camera);
          ry += clamp((pointeur.x - tmp.x) * 2.2, -0.42, 0.42) * e.hl;
          rx = clamp((tmp.y - pointeur.y) * 1.6, -0.25, 0.25) * e.hl;
        }
        e.mesh.rotation.set(rx, ry, 0);
      }
      e.eclat((car.sel < 0 ? 1.06 : 0.88 + 0.24 * e.hl) * (e.dispo ? 1 : 0.6) * facteurCartes);
      if (e.halo) {
        // Halo de marque qui respire doucement, plus fort sur la carte survolée
        const souffle = reduit ? 1 : 1 + 0.14 * Math.sin(temps * 1.3 + i * 1.9);
        e.halo.material.opacity = e.pret ? (0.3 + 0.3 * e.hl) * souffle * (e.dispo ? 1 : 0.35) : 0;
      }
      if (e.brillance) {
        // Reflet qui balaie la carte : toutes les ~7 s (décalé d'une carte à l'autre), toutes les 2,6 s sur la carte survolée
        const periode = e.hl > 0.5 ? 2.6 : 7;
        const u = ((temps + i * 1.15) % periode) / 1.1;
        if (!reduit && e.pret && u <= 1) {
          e.brillance.material.map.offset.x = 0.95 - 1.9 * u;
          e.brillance.material.opacity = (0.32 + 0.3 * e.hl) * Math.sin(Math.PI * u);
        } else e.brillance.material.opacity = 0;
      }
      e.ombre.scale.set(e.w * s * 1.15, 0.3, 1);
      if (e.barre) {
        const souffle = reduit ? 1 : 0.85 + 0.15 * Math.sin(temps * 1.6 + i * 1.3);
        e.barre.scale.set(e.w * (0.9 + 0.12 * e.hl), 0.02 + 0.014 * e.hl, 1);
        e.barre.material.opacity = (0.75 + 0.25 * e.hl) * souffle * (e.dispo ? 1 : 0.25);
        e.nappe.scale.set(e.w * (1.5 + 0.4 * e.hl), 0.26 + 0.1 * e.hl, 1);
        e.nappe.material.opacity = e.pret ? (0.42 + 0.3 * e.hl) * souffle * (e.dispo ? 1 : 0.2) : 0;
        if (e.pinceau) e.pinceau.material.opacity = (0.13 + 0.16 * e.hl) * (e.dispo ? 1 : 0.3);
        if (e.eclats) for (const m of e.eclats) {
          // Scintillement bref et décalé d'une carte à l'autre ; plus fréquent sur la carte survolée
          const ph = temps * (1.1 + 0.9 * e.hl) + i * 2.4 + m.userData.q * 3.1;
          const v = e.pret && e.dispo ? Math.pow(Math.max(0, Math.sin(ph)), 10) : 0;
          m.position.set(e.x + (m.userData.q ? -0.4 : 0.42) * e.w * s, y + (m.userData.q ? -0.3 : 0.36) * e.h * s, 0.14 + 0.1 * e.hl);
          m.scale.setScalar(0.09 + 0.12 * v); m.rotation.z = ph * 0.3; m.material.opacity = v;
        }
      }
      if (e.hl > 0.05) lueur = e;
    });
    if (lueur) {
      car.lueur.position.set(lueur.x, lueur.base + 0.012 + lueur.h / 2, -0.12);
      car.lueur.scale.set(lueur.w * 2.2, lueur.h * 2.4, 1);
      car.lueur.material.opacity = 0.5 * lueur.hl;
    } else car.lueur.material.opacity = 0;
  }

  let balayage = null;
  function balayer(slot, x = 0) { if (reduit) return; slotsG[slot].add(reflet); balayage = { t: 0, x }; }

  function majNavigation(dt) {
    if (!nav.trajet) { // regard amorti (fluide)
      const k = Math.min(1, dt * 14);
      nav.yaw += angleDiff(nav.yaw, nav.yawC) * k;
      nav.pitch += (nav.pitchC - nav.pitch) * k;
    }
    if (contexte !== 'interieur' || nav.trajet || zoom) { nav.vel.set(0, 0, 0); return; }
    if (nav.entree.tour) nav.yawC -= nav.entree.tour * 1.5 * dt;
    const avant = dir(nav.yaw, 0); const cote = V(-avant.z, 0, avant.x);
    const voulu = V(0, 0, 0)
      .addScaledVector(avant, nav.entree.avant * 2.3 + nav.impulsion)
      .addScaledVector(cote, nav.entree.cote * 1.8);
    nav.impulsion *= Math.exp(-dt * 4.5); if (Math.abs(nav.impulsion) < 0.02) nav.impulsion = 0;
    if (nav.dest) {
      const d = V(nav.dest.x - nav.pos.x, 0, nav.dest.z - nav.pos.z); const l = d.length();
      if (l < 0.06 || voulu.lengthSq() > 0.01) { nav.dest = null; }
      else {
        voulu.copy(d.multiplyScalar(Math.min(2.4, l * 2.2) / l));
        if (l > 1.2) { const a = Math.atan2(-voulu.x, -voulu.z); nav.yawC = nav.yaw + angleDiff(nav.yaw, a) * 0.5; }
      }
    }
    nav.vel.lerp(voulu, Math.min(1, dt * 7));
    if (nav.vel.lengthSq() > 1e-5) { nav.pos.addScaledVector(nav.vel, dt); contraindre(nav.pos); }
  }

  function boucle() {
    const maintenant = performance.now();
    const dt = Math.min(0.05, (maintenant - dernier) / 1000);
    dernier = maintenant; temps += dt;

    for (const a of anims) { a.t += dt; const k = Math.min(1, a.t / a.duree); a.f(a.courbe(k)); if (k >= 1) { anims.delete(a); a.ok(); } }
    majNavigation(dt);
    pointeur.lerp(pointeurCible, Math.min(1, dt * 5));
    if (!reduit) {
      for (const h of holoSols) for (const m of h.children) m.rotation.z += m.userData.vit * dt;
      if (contexte === 'interieur') {
        for (const f of animDecor) f(dt, temps);
        if (flocons.visible) {
          for (let i = 0; i < NB_FLOCONS; i++) {
            floconPos[i * 3 + 1] -= (0.16 + (i % 5) * 0.035) * dt;
            floconPos[i * 3] += Math.sin(temps * 0.6 + i) * 0.0035;
            if (floconPos[i * 3 + 1] < 0) floconPos[i * 3 + 1] = H;
          }
          floconGeo.attributes.position.needsUpdate = true;
        }
        for (const m of pulses) { const u = (temps * 0.2 + m.userData.dec) % 1; m.position.z = -1.9 - u * 15; m.scale.z = 0.5 + 1.4 * Math.sin(Math.PI * u); }
        for (const s of scans) {
          const u = (temps * 0.22 + s.userData.dec) % 1; const a = Math.sin(Math.PI * u);
          s.position.y = 0.98 + u * 1.42; s.material.opacity = 0.9 * a; s.userData.traine.material.opacity = 0.16 * a;
        }
      } else {
        // Cartes en orbite : grande ellipse devant la façade, chaque carte reste tournée vers le visiteur
        for (const e of orbite) {
          const a = temps * 0.22 + (e.k / e.n) * Math.PI * 2;
          const prof = Math.sin(a); // +1 = au plus près du visiteur
          e.mesh.position.set(Math.cos(a) * 7.8, 4.3 + 0.3 * Math.sin(temps * 0.8 + e.k * 1.3) - prof * 0.9, 3.2 + prof * 1.7);
          const s = 0.8 + 0.2 * prof;
          e.mesh.scale.set(e.w * s, e.h * s, 1);
          e.mesh.rotation.set(0.08 * Math.sin(temps * 0.7 + e.k), -Math.cos(a) * 0.55 + 0.12 * Math.sin(temps * 0.9 + e.k * 2), 0.05 * Math.sin(temps * 0.6 + e.k));
          if (e.halo) e.halo.material.opacity = e.pret ? 0.3 + 0.25 * (0.5 + 0.5 * prof) : 0;
          if (e.brillance) {
            const u = ((temps + e.k * 0.8) % 4.5) / 1.1;
            if (e.pret && u <= 1) { e.brillance.material.map.offset.x = 0.95 - 1.9 * u; e.brillance.material.opacity = 0.55 * Math.sin(Math.PI * u); } else e.brillance.material.opacity = 0;
          }
        }
        for (const p of faisceauxCiel) { p.rotation.z = p.userData.sens * (0.35 + 0.3 * Math.sin(temps * 0.35)); p.rotation.x = 0.25 * Math.sin(temps * 0.27 + p.userData.sens); }
      }
    }

    if (contexte === 'interieur') {
      if (poussiere.visible) {
        for (let i = 0; i < NB_POUSSIERE; i++) {
          poussierePos[i * 3 + 1] += (0.012 + (i % 7) * 0.004) * dt;
          poussierePos[i * 3] += Math.sin(temps * 0.25 + i) * 0.0009;
          if (poussierePos[i * 3 + 1] > H - 0.2) poussierePos[i * 3 + 1] = 0.3;
        }
        poussiereGeo.attributes.position.needsUpdate = true;
      }
      carrousels.forEach((car) => majCarrousel(car, dt, car === carrouselActif));
      majVenteFlash(dt);
      if (holoNl) majHolo(dt, maintenant);
      for (let k = 0; k < personnages.length; k++) majPersonnage(personnages[k], dt, temps);
      if (!reduit) for (let k = 0; k < portes.length; k++) { const ind = portes[k].indice; if (ind) ind.material.opacity = portes[k].slug === porteSurvolee ? 1 : 0.62 + 0.34 * (0.5 + 0.5 * Math.sin(temps * 2.6 + k)); }
      tZone += dt; if (tZone > 0.15) { tZone = 0; majZone(); }
      if (balayage) {
        balayage.t += dt / 0.65;
        const k = Math.min(1, balayage.t);
        reflet.position.x = clamp(balayage.x - 0.7 + 1.4 * k, -1.6, 1.6); reflet.material.opacity = Math.sin(Math.PI * k) * 0.4;
        if (k >= 1) { balayage = null; reflet.material.opacity = 0; }
      }
      if (neige.visible) {
        const n = REGLAGES[niveau].neige;
        for (let i = 0; i < n; i++) {
          neigePos[i * 3 + 1] -= neigeVit[i] * dt;
          neigePos[i * 3] += Math.sin(temps * 0.7 + i) * 0.001;
          if (neigePos[i * 3 + 1] < 0) neigePos[i * 3 + 1] = H;
        }
        neigeGeo.attributes.position.needsUpdate = true;
      }
      if (neonMats.length && !reduit && Math.random() < 0.006) {
        const m = neonMats[Math.floor(Math.random() * neonMats.length)];
        if (!m.userData.flash) {
          const base = m.color.clone(); m.userData.flash = true;
          m.color.multiplyScalar(0.35);
          setTimeout(() => { m.color.copy(base); m.userData.flash = false; }, 60);
        }
      }
      if (maintenant - derniereImageEcran > (reduit ? 1000 : 80)) { derniereImageEcran = maintenant; dessinerEcran(temps); }
      groupeDecor.traverse((x) => { if (x.userData.tourne) x.rotation.y += dt * 0.6; });
      if (repere.material.opacity > 0 && !nav.dest && !conteneur.classList.contains('pointe')) repere.material.opacity = Math.max(0, repere.material.opacity - dt * 1.5);
      if (refletsDans >= 0) { refletsDans -= dt; if (refletsDans < 0) { refletsDans = -1; capturerReflets(); } }
    } else {
      for (const nf of neigeFacade) {
        for (let i = 0; i < nf.pos.length / 3; i++) { nf.pos[i * 3 + 1] -= 0.22 * dt; if (nf.pos[i * 3 + 1] < nf.y0) nf.pos[i * 3 + 1] = nf.y1; }
        nf.geo.attributes.position.needsUpdate = true;
      }
    }
    if (bannieres.size && maintenant - derniereBanniere > (reduit ? 1000 : 90)) { derniereBanniere = maintenant; majBannieres(temps); }
    if (contexte !== 'interieur' && !reduit) stickersFacade.forEach((sk, k) => { const z = 1 + 0.06 * Math.sin(temps * 4 + k); sk.scale.set(1.05 * z, 1.05 * z, 1); });
    minuterieTwinkle += dt;
    if (minuterieTwinkle > 0.14 && !reduit) {
      minuterieTwinkle = 0;
      for (const im of contexte === 'interieur' ? ampoules : facadeAmpoules) {
        if (!im.instanceColor) continue;
        for (let k = 0; k < 4; k++) {
          const i = Math.floor(Math.random() * im.count);
          im.getColorAt(i, col);
          const v = Math.max(col.r, col.g, col.b);
          col.multiplyScalar(v > 1.2 ? 0.4 : 2.5);
          im.setColorAt(i, col);
        }
        im.instanceColor.needsUpdate = true;
      }
    }

    camera.position.copy(nav.pos);
    if (!reduit && contexte === 'interieur' && !nav.trajet) camera.position.y += Math.sin(temps * 0.5) * 0.004;
    camera.lookAt(tmp.copy(nav.pos).add(dir(nav.yaw, nav.pitch)));
    if (contexte === 'facade' && !reduit && !nav.trajet) {
      // Parallaxe : la façade « tourne » légèrement avec la souris + lente respiration de la caméra
      camera.position.x += pointeur.x * 1.1 + Math.sin(temps * 0.23) * 0.18;
      camera.position.y += pointeur.y * 0.4 + Math.sin(temps * 0.31) * 0.06;
      camera.lookAt(tmp.copy(nav.pos).addScaledVector(dir(nav.yaw, nav.pitch), 20));
    }
    if (miroir && miroir.actif) miroir.rendre();
    if (post && post.actif) post.rendre(scene, camera);
    else { renderer.setRenderTarget(null); renderer.render(scene, camera); }

    fpsAcc += dt; fpsN++;
    if (fpsAcc >= 1.5) {
      const fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0;
      if (fps < cibleFPS * 0.8) lent++; else lent = Math.max(0, lent - 1);
      if (lent >= 3 && miroir && miroir.actif) {
        // Premier allègement : on coupe le sol miroir (retour aux reflets d'environnement d'origine)
        miroir.couper(); lent = 0; if (STD) M.sol.envMapIntensity = 0.55;
      } else if (lent >= 3 && niveau > 0) {
        niveau--; lent = 0;
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, REGLAGES[niveau].ratio));
        if (!REGLAGES[niveau].post && post) post.actif = false;
        majNbNeige();
        if (!REGLAGES[niveau].neige) neige.visible = false;
        redimensionner();
        rappels.qualite(niveau);
      }
    }
  }

  function redimensionner() {
    const w = conteneur.clientWidth || window.innerWidth; const h = conteneur.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.fov = camera.aspect < 1 ? 64 : 52; camera.updateProjectionMatrix();
    if (post) post.taille(w, h);
    if (miroir) miroir.taille(w, h);
    if (contexte === 'facade' && !nav.trajet) nav.pos.copy(pose('facade').pos);
  }
  new ResizeObserver(redimensionner).observe(conteneur);

  /* ------------------------------ Démarrage ------------------------------ */
  function produitsDe(slug) { const b = cat.boutiques.find((x) => x.slug === slug); return b ? b.sections.flatMap((s) => s.produits) : []; }
  construireFacade();
  appliquerTheme(o.boutique || cat.boutiqueParDefaut);
  for (const b of cat.boutiques) for (const id of produitsDe(b.slug)) textureProduit(id);
  changerContexte('facade');
  redimensionner();
  renderer.setAnimationLoop(boucle);

  function placer(p) { nav.pos.copy(p.pos); const a = angles(p.pos, p.regard); nav.yaw = nav.yawC = a.yaw; nav.pitch = nav.pitchC = a.pitch; }
  function annoncer(z) { zone = z; rappels.station({ ...z, titre: '' }); rappels.centre(null); }

  /* ------------------------------ API publique ------------------------------ */
  return {
    async allerFacade({ instant } = {}) {
      zoom = null; avantZoom = null; interrompre();
      if (contexte === 'interieur' && !instant) await fondu(1, '#070D1A', 280);
      changerContexte('facade');
      const p = pose('facade');
      placer({ pos: p.pos.clone().add(V(0, 0.4, instant ? 0 : 4)), regard: p.regard });
      annoncer({ id: 'facade', type: 'facade' });
      if (porteFacade) porteFacade.pivot.rotation.y = 0;
      fondu(0, null, 420);
      await allerVers(p.pos, p.regard, instant ? 0 : 1100);
    },

    async entrer(slug, { instant } = {}) {
      if (verrou) return;
      verrou = true;
      try {
        if (slug !== themeCourant) appliquerTheme(slug);
        const b = cat.boutiques.find((x) => x.slug === slug);
        if (!instant && !reduit && contexte === 'facade') {
          const f = fenetres.find((x) => x.slug === slug && x.zone.userData.cible.type === 'fenetre');
          const vx = f ? f.cx : 0;
          rappels.passage();
          const ouvrir = !f && porteFacade ? animerVers((k) => { porteFacade.pivot.rotation.y = 1.25 * k; }, 900, EASE.inOut) : null;
          await allerVers(V(vx, 1.7, 3.2), V(vx, 1.65, -2), 950);
          await ouvrir;
          await fondu(1, b.theme.couleurs.mur, 260);
        }
        changerContexte('interieur');
        const p = pose('accueil');
        placer({ pos: V(0, OEIL, -0.2), regard: p.regard });
        annoncer({ id: 'libre', type: 'libre' });
        if (instant || reduit) { placer(p); voile.style.opacity = '0'; return; }
        fondu(0, null, 420);
        await allerVers(p.pos, p.regard, 650);
      } finally { deverrouiller(); }
    },

    /** Passage par une porte vers une autre boutique (transition d'1 seconde). */
    async changerBoutique(slug) {
      if (slug === themeCourant || verrou) return;
      if (contexte !== 'interieur') { appliquerTheme(slug); rappels.boutique(slug); return; }
      verrou = true;
      try {
        zoom = null; avantZoom = null;
        const pt = portes.find((x) => x.slug === slug);
        const b = cat.boutiques.find((x) => x.slug === slug);
        const duree = cat.experience.dureeTransitionPortail || 1000;
        rappels.passage();
        if (pt && !reduit) {
          animerVers((k) => { pt.pivot.rotation.y = 1.45 * k; }, duree * 0.45, EASE.out);
          const vers = allerVers(V(pt.x, OEIL, ZF + 0.9), V(pt.x, 1.6, ZF - 3), duree * 0.5);
          await new Promise((r) => setTimeout(r, duree * 0.3));
          await fondu(1, b.theme.couleurs.mur, duree * 0.2);
          await vers;
        } else {
          await fondu(1, b.theme.couleurs.mur, 150);
        }
        appliquerTheme(slug);
        changerContexte('interieur');
        rappels.boutique(slug);
        const p = pose('accueil');
        placer({ pos: V(0, OEIL, -0.2), regard: p.regard });
        annoncer({ id: 'libre', type: 'libre' });
        fondu(0, null, duree * 0.4);
        await allerVers(p.pos, p.regard, reduit ? 0 : duree * 0.45);
      } finally { deverrouiller(); }
    },

    allerStation(id) { if (!verrou) return allerStation(id); enAttente = id; return Promise.resolve(); },
    /** Hologramme newsletter : affiche « inscrit » et/ou fait un flash lumineux. */
    holo({ abonne, flash } = {}) {
      if (!holoNl) return false;
      if (abonne != null) holoNl.opts.abonne = Boolean(abonne);
      if (flash) holoNl.flash = 1;
      return true;
    },

    async ouvrirProduit(id) {
      if (contexte !== 'interieur') return;
      const car = carrousels.find((c) => c.ids.includes(id));
      if (!car) return;
      const index = car.ids.indexOf(id);
      if (zone.id !== `v${car.slot}`) await allerStation(`v${car.slot}`);
      verrou = true;
      try { await zoomer(car.slot, index); } finally { verrou = false; }
    },

    fermerProduit() { fermerZoom(); },
    reculer() { reculer(); },
    majPanier(lignes) { majPanier(lignes, true); },

    pause(v) {
      pause = Boolean(v);
      renderer.setAnimationLoop(pause ? null : boucle);
      if (!pause) dernier = performance.now();
    },

    detruire() { renderer.setAnimationLoop(null); renderer.dispose(); conteneur.innerHTML = ''; },
  };
}
