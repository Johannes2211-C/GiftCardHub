'use strict';
/**
 * Lecture et validation du fichier de configuration unique.
 * Tous les prix et montants du site viennent d'ici (jamais écrits en dur).
 */
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '..', 'config', 'boutique.config.js');
const TYPES = new Set(['carte', 'abonnement', 'pack']);
const SLUG = /^[a-z0-9-]{1,60}$/;

function chargerConfig() {
  delete require.cache[require.resolve(CONFIG_PATH)];
  const config = require(CONFIG_PATH);
  valider(config);
  return config;
}

function valider(config) {
  const erreurs = [];
  const { produits, boutiques, montantLibre } = config;
  if (!produits || !boutiques) throw new Error('Configuration : "produits" et "boutiques" sont obligatoires.');

  if (!(montantLibre.min > 0 && montantLibre.max >= montantLibre.min)) erreurs.push('montantLibre : min/max invalides.');

  for (const [id, p] of Object.entries(produits)) {
    if (!SLUG.test(id)) erreurs.push(`Produit "${id}" : identifiant invalide (minuscules, chiffres, tirets).`);
    if (!TYPES.has(p.type)) erreurs.push(`Produit "${id}" : type "${p.type}" inconnu.`);
    if (!p.nom || !p.image) erreurs.push(`Produit "${id}" : nom et image obligatoires.`);
    if (p.type !== 'carte' && p.prix !== null && !(typeof p.prix === 'number' && p.prix > 0)) {
      erreurs.push(`Produit "${id}" : prix doit être un nombre positif ou null (à définir).`);
    }
    if (p.type === 'pack') {
      if (!Array.isArray(p.contenu) || p.contenu.length === 0) erreurs.push(`Pack "${id}" : contenu vide.`);
      else for (const c of p.contenu) if (!produits[c.produit]) erreurs.push(`Pack "${id}" : produit inclus "${c.produit}" introuvable.`);
    }
  }

  for (const [cle, b] of Object.entries(boutiques)) {
    if (b.slug !== cle) erreurs.push(`Boutique "${cle}" : le slug doit être identique à la clé.`);
    const vus = new Set();
    for (const s of b.sections || []) {
      for (const pid of s.produits) {
        if (!produits[pid]) erreurs.push(`Boutique "${cle}" / ${s.titre} : produit "${pid}" introuvable.`);
        if (vus.has(pid)) erreurs.push(`Boutique "${cle}" : "${pid}" apparaît deux fois (une seule fiche par article).`);
        vus.add(pid);
      }
    }
    for (const pr of b.presentoir || []) {
      if (!boutiques[pr.boutique]) erreurs.push(`Boutique "${cle}" / présentoir : boutique "${pr.boutique}" introuvable.`);
      else for (const pid of pr.produits) {
        const ok = (boutiques[pr.boutique].sections || []).some((s) => s.produits.includes(pid));
        if (!ok) erreurs.push(`Boutique "${cle}" / présentoir : "${pid}" n'est pas vendu dans "${pr.boutique}".`);
      }
    }
  }
  for (const pr of config.promotions || []) {
    const nom = `Promotion "${pr.id || pr.libelle || '?'}"`;
    if (!(typeof pr.remise === 'number' && pr.remise > 0 && pr.remise < 100)) erreurs.push(`${nom} : remise entre 1 et 99 (%).`);
    if (pr.boutique && !boutiques[pr.boutique]) erreurs.push(`${nom} : boutique "${pr.boutique}" introuvable.`);
    for (const pid of pr.produits || []) if (!produits[pid]) erreurs.push(`${nom} : produit "${pid}" introuvable.`);
    for (const ty of pr.types || []) if (!TYPES.has(ty)) erreurs.push(`${nom} : type "${ty}" inconnu.`);
    for (const k of ['debut', 'fin']) if (pr[k] && Number.isNaN(Date.parse(pr[k]))) erreurs.push(`${nom} : date "${k}" invalide.`);
  }
  if (!boutiques[config.boutiqueParDefaut]) erreurs.push('boutiqueParDefaut : boutique introuvable.');
  if (erreurs.length) throw new Error('Configuration invalide :\n - ' + erreurs.join('\n - '));
}

/* ----------------------------- Prix ----------------------------- */

const euros = (cents) => (cents / 100).toFixed(2);

function formatEuros(montant) {
  const n = Number(montant);
  const txt = Number.isInteger(n) ? String(n) : n.toFixed(2);
  return `€${txt}`;
}

/** Promotion en cours pour un article (ou null). */
function promoActive(config, produitId, maintenant = new Date()) {
  const p = config.produits[produitId];
  if (!p) return null;
  const t = maintenant.getTime();
  for (const pr of config.promotions || []) {
    if (pr.actif === false) continue;
    if (pr.debut && t < Date.parse(pr.debut)) continue;
    if (pr.fin && t > Date.parse(pr.fin)) continue;
    let vise;
    if (Array.isArray(pr.produits) && pr.produits.length) vise = pr.produits.includes(produitId);
    else {
      const b = pr.boutique ? config.boutiques[pr.boutique] : null;
      const dansBoutique = !b || (b.sections || []).some((s) => s.produits.includes(produitId));
      vise = dansBoutique && (!pr.types || pr.types.includes(p.type));
    }
    if (vise) return { id: pr.id || null, libelle: pr.libelle || 'Promotion', accroche: pr.accroche || pr.libelle || 'Promo', style: pr.style || 'flash', remise: pr.remise, boutique: pr.boutique || null, fin: pr.fin || null };
  }
  return null;
}
/** Applique une remise en % à un prix en centimes (arrondi au centime). */
const remiser = (cents, promo) => (promo ? Math.round(cents * (100 - promo.remise) / 100) : cents);

/**
 * Calcule le prix d'une ligne à partir de la configuration UNIQUEMENT.
 * Retourne { ok, prixCents, valeurCents, libelleValeur } ou { ok:false, message }.
 */
function prixLigne(config, produitId, montantDemande, maintenant = new Date()) {
  const p = config.produits[produitId];
  const promo = p ? promoActive(config, produitId, maintenant) : null;
  if (!p) return { ok: false, message: 'This item does not exist.' };
  if (p.type === 'carte') {
    const { min, max, pas } = config.montantLibre;
    const m = Number(montantDemande);
    if (!Number.isFinite(m)) return { ok: false, message: 'Choose an amount.' };
    if (m < min || m > max) return { ok: false, message: `Choose an amount between €${min} and €${max}.` };
    if (Math.round(m * 100) % Math.round(pas * 100) !== 0) return { ok: false, message: `The amount must be a multiple of €${pas}.` };
    const cents = Math.round(m * 100);
    return { ok: true, prixCents: remiser(cents, promo), prixAvantCents: promo ? cents : null, remise: promo ? promo.remise : null, valeurCents: cents, libelleValeur: formatEuros(m) };
  }
  if (p.prix === null || p.prix === undefined) return { ok: false, message: `${p.nom}: price not set yet, this item can't be bought.` };
  const cents = Math.round(p.prix * 100);
  return { ok: true, prixCents: remiser(cents, promo), prixAvantCents: promo ? cents : null, remise: promo ? promo.remise : null, valeurCents: null, libelleValeur: p.valeurAffichee || formatEuros(p.prix) };
}

/** Texte « Contenu » d'un pack : « Steam 50 € + PlayStation Store 25 € ». */
function contenuPack(config, p) {
  return p.contenu
    .map((c) => {
      const inc = config.produits[c.produit];
      const val = c.montant ? formatEuros(c.montant) : c.libelle || '';
      return `${inc.nom}${val && !inc.nom.includes(val) ? ' ' + val : ''}`;
    })
    .join(' + ');
}

function boutiquesActives(config) {
  return Object.values(config.boutiques)
    .filter((b) => b.actif)
    .sort((a, b) => a.ordre - b.ordre);
}

function boutiqueALaUne(config, maintenant = new Date()) {
  const jour = maintenant.toISOString().slice(0, 10);
  const b = boutiquesActives(config).find((x) => x.miseEnAvant && jour >= x.miseEnAvant.debut && jour < x.miseEnAvant.fin);
  return b ? b.slug : null;
}

function produitsDeBoutique(config, slug) {
  const b = config.boutiques[slug];
  if (!b) return [];
  return b.sections.flatMap((s) => s.produits);
}

/** Version publique du catalogue envoyée au navigateur (aucune donnée de stock détaillée). */
function cataloguePublic(config, { disponibilites = {}, paypalClientId = '', demo = false, maintenant = new Date() } = {}) {
  const produits = {};
  for (const [id, p] of Object.entries(config.produits)) {
    const promo = promoActive(config, id, maintenant);
    const prixBase = p.type === 'carte' ? null : p.prix ?? null;
    produits[id] = {
      id,
      nom: p.nom,
      type: p.type,
      pourQui: p.pourQui,
      description: p.description || null,
      resume: p.resume || null,
      contenu: p.type === 'pack'
        ? p.contenu.map((c) => ({ produit: c.produit, nom: config.produits[c.produit].nom, montant: c.montant || null, libelle: c.libelle || null }))
        : p.contenu,
      contenuTexte: p.type === 'pack' ? contenuPack(config, p) : p.contenu,
      prix: prixBase == null ? null : remiser(Math.round(prixBase * 100), promo) / 100,
      prixAvant: promo && prixBase != null ? prixBase : null,
      promo, // { libelle, remise, fin } ou null — appliquée aussi par le serveur au paiement
      valeurAffichee: p.valeurAffichee || null,
      image: `img/cartes/${p.image}`,
      texture: `img/cartes/3d/${p.image.replace(/\.(png|jpe?g)$/i, '.webp')}`,
      motsCles: p.motsCles || [],
      disponible: demo ? true : Boolean(disponibilites[id]),
    };
  }
  const boutiques = boutiquesActives(config).map((b) => ({
    slug: b.slug, nom: b.nom, nomCourt: b.nomCourt, slogan: b.slogan || '', ordre: b.ordre,
    theme: b.theme, sections: b.sections, presentoir: b.presentoir || [],
  }));
  return {
    site: {
      nom: config.site.nom, accroche: config.site.accroche, sousAccroche: config.site.sousAccroche,
      devise: config.site.devise, paysValidite: config.site.paysValidite, zoneValidite: config.site.zoneValidite || '', zoneCourte: config.site.zoneCourte || '', langue: config.site.langue || 'en', liens: config.site.liens,
      serviceClient: config.site.serviceClient, aide: config.site.aide,
    },
    textes: config.textes,
    montantLibre: config.montantLibre,
    produits,
    boutiques,
    boutiqueParDefaut: config.boutiqueParDefaut,
    aLaUne: boutiqueALaUne(config),
    promotions: (config.promotions || [])
      .filter((pr) => pr.actif !== false && !(pr.debut && maintenant < new Date(pr.debut)) && !(pr.fin && maintenant > new Date(pr.fin)))
      .map((pr) => ({ id: pr.id || null, libelle: pr.libelle || 'Promotion', accroche: pr.accroche || pr.libelle || 'Promo', style: pr.style || 'flash', remise: pr.remise, boutique: pr.boutique || null, types: pr.types || null, fin: pr.fin || null })),
    // L'adresse qui reçoit les inscriptions reste côté serveur (jamais dans la page : pas de spam)
    experience: config.experience && config.experience.newsletter
      ? { ...config.experience, newsletter: Object.fromEntries(Object.entries(config.experience.newsletter).filter(([k]) => k !== 'emailDestination')) }
      : config.experience,
    paypal: { clientId: paypalClientId, devise: config.site.devise },
    demo,
  };
}

module.exports = {
  chargerConfig, valider, prixLigne, promoActive, contenuPack, formatEuros, euros,
  boutiquesActives, boutiqueALaUne, produitsDeBoutique, cataloguePublic,
};
