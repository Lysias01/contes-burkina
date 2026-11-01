/* =========================================================
   carte.js — carte interactive 2D/3D (MapLibre GL JS)
   Le Burkina en plein jour, couleur de savane : chaque récit
   est un arbre à palabres, là où l'on se réunit pour écouter.
   ========================================================= */

const STYLE_FOND = "https://tiles.openfreemap.org/styles/positron";
const RELIEF_TUILES = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";
const CENTRE_BURKINA = [-1.6, 12.25];
// Emprise du contour geoBoundaries (data/burkina.geojson) : vue de départ et bouton « Recentrer »
const BOITE_BURKINA = [[-5.52, 9.4], [2.41, 15.09]];
// Récits d'une même ville : arbres côte à côte (écart en pixels), juste au-dessus de la vraie
// position, car à l'ouest d'Ouagadougou l'arbre de Sabou est tout proche au zoom national
const ECART_MEME_VILLE = 32;
const HAUSSE_MEME_VILLE = 18;
// Le pays reste toujours au moins en partie à l'écran : le centre de la vue peut s'écarter
// de son emprise d'au plus cette part d'une demi-largeur (ou demi-hauteur) d'écran
const PART_ECRAN_HORS_PAYS = 0.8;
// Marge de déplacement au zoom minimum (pixels) : assez pour afficher un aperçu près d'un bord
const MARGE_APERCU = 360;
// Vue 3D : inclinaison et orientation de départ, inclinaison à l'approche d'un récit,
// et exagération du relief (le Burkina est plutôt plat)
const PENTE_3D = 52;
const CAP_3D = -14;
const PENTE_RECIT = 58;
const EXAGERATION_RELIEF = 12;
const ZOOM_RECIT = 8;
// Largeur maximale d'un aperçu : il laisse toujours la place à la colonne de contrôles
const LARGEUR_APERCU = "min(320px, calc(100vw - 88px))";
// Hauteur de l'arbre au-dessus de son point : l'aperçu s'ouvre juste au-dessus
const HAUTEUR_ARBRE = 46;
const NOMS_AU_DESSUS = ["Ouagadougou", "Bobo-Dioulasso", "Fada N'Gourma", "Dori"];

const ARBRE = `
  <svg class="arbre" viewBox="-26 -66 52 72" aria-hidden="true" focusable="false">
    <path class="arbre-tronc" d="M-11 2 C-8 -10 -8 -20 -5 -30 C-9 -36 -13 -40 -16 -43 L-12 -45 C-8 -41 -4 -37 -1 -36 L0 -50 L3 -50 L3 -36 C6 -38 10 -42 13 -45 L17 -43 C13 -38 8 -33 5 -30 C8 -20 8 -10 11 2Z"/>
    <g class="arbre-couronne">
      <ellipse cx="-14" cy="-45" rx="11" ry="8"/>
      <ellipse cx="14" cy="-47" rx="11" ry="8"/>
      <ellipse cx="1" cy="-54" rx="14" ry="10"/>
    </g>
  </svg>`;

const etat = {
  carte: null,
  contes: [],
  marqueurs: new Map(), // id -> { marqueur, element, conte, decalage }
  popup: null,
  vue3d: true,
  derive: 0, // lente respiration de la caméra (numéro de requestAnimationFrame)
};

const mouvementReduit = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/* Couleurs de css/style.css : MapLibre a besoin de leurs valeurs, pas de var(--...) */
function couleur(nom) {
  return getComputedStyle(document.documentElement).getPropertyValue(`--${nom}`).trim();
}

function couleurAlpha(nom, alpha) {
  const hex = couleur(nom).slice(1);
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/* ---------- Démarrage ---------- */
async function demarrer() {
  try {
    etat.contes = await chargerContes();
  } catch (erreur) {
    afficherErreur(`Les récits n'ont pas pu être chargés : ${erreur.message}.`);
    return;
  }
  afficherListe();

  if (typeof maplibregl === "undefined") {
    afficherErreur("La bibliothèque de carte n'a pas pu se charger. Vérifiez la connexion internet ; la liste des récits reste disponible.");
    return;
  }

  try {
    etat.carte = new maplibregl.Map({
      container: "carte",
      style: STYLE_FOND,
      center: CENTRE_BURKINA,
      bounds: BOITE_BURKINA,
      fitBoundsOptions: { padding: marges() },
      minZoom: 4, // ajusté ensuite par limiterVue()
      renderWorldCopies: false,
      // à fort zoom, maxBounds seul laisserait glisser la vue hors du pays : on retient le centre
      transformCameraUpdate: ({ center, zoom }) => ({ center: retenirCentre(center, zoom) }),
      maxZoom: 12,
      maxPitch: 70,
      attributionControl: { compact: true },
      locale: {
        "NavigationControl.ZoomIn": "Zoomer",
        "NavigationControl.ZoomOut": "Dézoomer",
        "NavigationControl.ResetBearing": "Réorienter vers le nord",
        "FullscreenControl.Enter": "Plein écran",
        "FullscreenControl.Exit": "Quitter le plein écran",
        "AttributionControl.ToggleAttribution": "Afficher les crédits de la carte",
        "Popup.Close": "Fermer l'aperçu",
      },
    });
  } catch (erreur) {
    afficherErreur("Ce navigateur ne peut pas afficher la carte (WebGL indisponible). La liste des récits reste disponible.");
    return;
  }
  etat.carte.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
  etat.carte.addControl(new maplibregl.FullscreenControl(), "top-right");
  etat.carte.addControl(new ControleRecentrer(), "top-right");

  etat.carte.on("load", async () => {
    // Petit écran : l'attribution reste repliée derrière son bouton (i), toujours consultable
    if (matchMedia("(max-width: 760px)").matches) {
      const attribution = document.querySelector(".maplibregl-ctrl-attrib.maplibregl-compact-show");
      if (attribution) {
        attribution.classList.remove("maplibregl-compact-show");
        attribution.removeAttribute("open");
      }
    }
    habillerFond();
    limiterVue();
    etat.carte.on("resize", limiterVue); // rotation du téléphone, fenêtre redimensionnée
    await ajouterBurkina();
    ajouterMarqueurs();
    etat.carte.setTerrain({ source: "relief", exaggeration: EXAGERATION_RELIEF });
    document.getElementById("carte").classList.add("prete");
    lancerOuverture();
    // carte.html#id modifié à la main, ou boutons Précédent / Suivant du navigateur
    window.addEventListener("hashchange", ouvrirDepuisAdresse);
  });

  etat.carte.on("error", (e) => console.warn("Carte :", e.error?.message || e));

  // Dès que le visiteur prend la main, la caméra le laisse faire
  ["mousedown", "touchstart", "wheel"].forEach((type) =>
    document.getElementById("carte").addEventListener(type, arreterDerive, { passive: true }));
  document.addEventListener("visibilitychange", () => { if (document.hidden) arreterDerive(); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && etat.popup && etat.popup.isOpen()) etat.popup.remove();
  });
  document.getElementById("bascule-3d").addEventListener("click", basculer3D);
}

/* ---------- Fond de carte : la palette du site, les noms en français ---------- */
function habillerFond() {
  const carte = etat.carte;
  const texte = ["coalesce", ["get", "name:fr"], ["get", "name:latin"], ["get", "name"]];
  carte.getStyle().layers.forEach(({ id, type, filter }) => {
    if (type === "background") {
      carte.setPaintProperty(id, "background-color", couleur("sable"));
    } else if (type === "fill") {
      carte.setPaintProperty(id, "fill-color", id === "water" ? couleur("eau") : couleur("sable"));
      carte.setPaintProperty(id, "fill-opacity", id === "water" ? 1 : 0.25);
      if (id !== "water") carte.setPaintProperty(id, "fill-outline-color", couleurAlpha("sable", 0));
    } else if (type === "line") {
      carte.setPaintProperty(id, "line-color", id.startsWith("boundary") ? couleur("encre-douce") : couleur("tronc"));
      carte.setPaintProperty(id, "line-opacity", id.startsWith("boundary") ? 0.35 : 0.14);
    } else if (type === "symbol") {
      // Seuls les noms de lieux restent : ni routes, ni numéros de routes, ni aéroports
      // ni noms de régions, souvent en anglais
      if ((!id.startsWith("label_") && !id.startsWith("water_name")) || id === "label_state") {
        carte.setLayoutProperty(id, "visibility", "none");
        return;
      }
      carte.setLayoutProperty(id, "text-field", texte);
      if (id === "label_city") carte.setLayerZoomRange(id, 7, 24);
      if (id === "label_town" || id === "label_village" || id === "label_other") carte.setLayerZoomRange(id, 8, 24);
      carte.setPaintProperty(id, "text-color", couleur("encre-douce"));
      carte.setPaintProperty(id, "text-halo-color", couleurAlpha("coton", 0.9));
      carte.setPaintProperty(id, "text-halo-width", 1.4);
      // Le nom du pays laisserait une grande inscription sous les arbres
      if (id.startsWith("label_country") && filter) {
        carte.setFilter(id, ["all", filter, ["!=", ["get", "name"], "Burkina Faso"], ["!=", ["get", "name:fr"], "Burkina Faso"]]);
      }
      // Les localités des récits ont leur propre nom (ajouterNomsDesLieux) : pas de doublon
      if (id.startsWith("label_") && !id.startsWith("label_country")) {
        const nomsDesRecits = ["literal", etat.contes.map((c) => c.ville)];
        const sansDoublon = ["!", ["in", ["get", "name"], nomsDesRecits]];
        carte.setFilter(id, filter ? ["all", filter, sansDoublon] : sansDoublon);
      }
    }
  });
}

/* ---------- Le pays en couleur de savane, ses voisins estompés ---------- */
async function ajouterBurkina() {
  const carte = etat.carte;
  const reponse = await fetch("data/burkina.geojson");
  const burkina = await reponse.json();
  const geometrie = burkina.features[0].geometry;
  // Contour extérieur de chaque polygone (Polygon ou MultiPolygon)
  const contours = geometrie.type === "Polygon" ? [geometrie.coordinates[0]] : geometrie.coordinates.map((p) => p[0]);

  // Masque : le monde entier estompé, sauf le Burkina. Le monde est décrit dans le sens
  // inverse des aiguilles d'une montre ; les « trous » doivent tourner dans l'autre sens.
  const aire = (anneau) => anneau.reduce((s, [x1, y1], i) => {
    const [x2, y2] = anneau[(i + 1) % anneau.length];
    return s + (x1 * y2 - x2 * y1);
  }, 0);
  const trous = contours.map((anneau) => (aire(anneau) > 0 ? [...anneau].reverse() : anneau));
  const masque = {
    type: "Feature",
    geometry: {
      type: "Polygon",
      coordinates: [[[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]], ...trous],
    },
  };
  const frontiere = { type: "Feature", geometry: { type: "MultiLineString", coordinates: contours } };

  // Deux sources distinctes pour le relief 3D et l'ombrage (recommandation de MapLibre)
  const relief = {
    type: "raster-dem",
    tiles: [RELIEF_TUILES],
    encoding: "terrarium",
    tileSize: 256,
    maxzoom: 12,
    attribution: "Relief : Mapzen / AWS Terrain Tiles",
  };
  carte.addSource("relief", relief);
  carte.addSource("relief-ombrage", relief);
  carte.addSource("masque", { type: "geojson", data: masque });
  carte.addSource("burkina", { type: "geojson", data: burkina });
  carte.addSource("frontiere", { type: "geojson", data: frontiere, lineMetrics: true });

  // Tout passe sous les noms de lieux, qui restent lisibles
  const sousLesNoms = carte.getStyle().layers.find((c) => c.type === "symbol" && c.layout?.visibility !== "none")?.id;
  const ajouter = (couche) => carte.addLayer(couche, sousLesNoms);

  ajouter({
    id: "masque",
    type: "fill",
    source: "masque",
    paint: { "fill-color": couleur("coton"), "fill-opacity": 0.6 },
  });
  ajouter({
    id: "burkina-teinte",
    type: "fill",
    source: "burkina",
    paint: { "fill-color": couleur("savane"), "fill-opacity": 0.9 },
  });
  // Le relief se lit en douceur, comme sur une carte dessinée
  ajouter({
    id: "ombrage",
    type: "hillshade",
    source: "relief-ombrage",
    paint: {
      "hillshade-shadow-color": couleur("tronc"),
      "hillshade-highlight-color": couleur("coton"),
      "hillshade-accent-color": couleur("tronc"),
      "hillshade-exaggeration": 0.45,
    },
  });
  ajouter({
    id: "frontiere-halo",
    type: "line",
    source: "frontiere",
    paint: { "line-color": couleur("coton"), "line-width": 10, "line-blur": 6, "line-opacity": 0, "line-opacity-transition": { duration: 1400 } },
  });
  ajouter({
    id: "frontiere-trait",
    type: "line",
    source: "frontiere",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-width": 2.5, "line-gradient": traitDessine(1) },
  });
  ajouterNomsDesLieux();
}

/* Chaque localité d'un récit porte son nom sous ses arbres, à tous les zooms */
function ajouterNomsDesLieux() {
  const carte = etat.carte;
  const lieux = new Map();
  etat.contes.forEach((c) => { if (!lieux.has(c.ville)) lieux.set(c.ville, [c.lng, c.lat]); });
  carte.addSource("lieux-recits", {
    type: "geojson",
    data: {
      type: "FeatureCollection",
      features: [...lieux].map(([nom, position]) => ({
        type: "Feature",
        properties: { nom },
        geometry: { type: "Point", coordinates: position },
      })),
    },
  });
  carte.addLayer({
    id: "lieux-recits",
    type: "symbol",
    source: "lieux-recits",
    layout: {
      "text-field": ["get", "nom"],
      "text-font": carte.getLayoutProperty("label_city_capital", "text-font"),
      "text-size": matchMedia("(max-width: 760px)").matches ? 10.5 : ["interpolate", ["linear"], ["zoom"], 5, 12, 9, 15],
      // Quelques noms passent au-dessus des arbres : vus de loin, ces lieux sont voisins
      "text-anchor": ["case", ["in", ["get", "nom"], ["literal", NOMS_AU_DESSUS]], "bottom", "top"],
      "text-offset": ["case",
        ["in", ["get", "nom"], ["literal", ["Fada N'Gourma", "Dori"]]], ["literal", [0, -3]], // un seul arbre, moins haut
        ["in", ["get", "nom"], ["literal", NOMS_AU_DESSUS]], ["literal", [0, -4.5]],
        ["literal", [0, 0.6]]],
      "text-allow-overlap": true,
    },
    paint: {
      "text-color": couleur("encre"),
      "text-halo-color": couleurAlpha("coton", 0.95),
      "text-halo-width": 1.6,
    },
  });
}

/* La frontière dessinée jusqu'à la part « avancee » de sa longueur (de 0 à 1) */
function traitDessine(avancee) {
  const trait = couleur("tronc");
  return avancee >= 1
    ? ["interpolate", ["linear"], ["line-progress"], 0, trait, 1, trait]
    : ["step", ["line-progress"], trait, Math.max(0.001, avancee), couleurAlpha("tronc", 0)];
}

/* ---------- Ouverture : la frontière se dessine, la caméra s'incline, les arbres poussent ---------- */
function lancerOuverture() {
  const carte = etat.carte;
  const vue = vueDepart();
  const recitDemande = etat.marqueurs.has(location.hash.slice(1));
  carte.setPaintProperty("frontiere-halo", "line-opacity", 0.8);

  if (mouvementReduit() || recitDemande) {
    carte.jumpTo(vue);
    planterArbres(false);
    ouvrirDepuisAdresse();
    return;
  }

  carte.jumpTo({ center: vue.center, zoom: carte.getMinZoom(), pitch: 0, bearing: 0 });
  const duree = 2600;
  const debut = performance.now();
  const dessiner = (maintenant) => {
    const t = Math.min(1, (maintenant - debut) / duree);
    carte.setPaintProperty("frontiere-trait", "line-gradient", traitDessine(t));
    if (t < 1) requestAnimationFrame(dessiner);
  };
  carte.setPaintProperty("frontiere-trait", "line-gradient", traitDessine(0));
  requestAnimationFrame(dessiner);
  planterArbres(true);
  setTimeout(() => {
    carte.easeTo({ ...vue, duration: 4200, easing: (t) => 1 - (1 - t) ** 3 });
    carte.once("moveend", demarrerDerive);
  }, 500);
}

/* D'ouest en est, comme un récit qui passe d'un village à l'autre */
function planterArbres(progressivement) {
  [...etat.marqueurs.values()]
    .sort((a, b) => a.conte.lng - b.conte.lng)
    .forEach(({ element }, rang) => {
      element.style.setProperty("--apparition", progressivement ? `${1200 + rang * 260}ms` : "0ms");
      element.classList.add("plante");
    });
}

/* Sur grand écran, à l'arrêt, la caméra respire lentement. Elle s'arrête au moindre geste. */
function demarrerDerive() {
  const permise = etat.vue3d && !mouvementReduit() && matchMedia("(hover: hover) and (min-width: 1025px)").matches;
  if (!permise || etat.derive || document.hidden) return;
  const carte = etat.carte;
  const cap = carte.getBearing();
  const debut = performance.now();
  const avancer = (maintenant) => {
    carte.setBearing(cap + Math.sin((maintenant - debut) / 9000) * 5);
    etat.derive = requestAnimationFrame(avancer);
  };
  etat.derive = requestAnimationFrame(avancer);
}

function arreterDerive() {
  cancelAnimationFrame(etat.derive);
  etat.derive = 0;
}

/* ---------- 2D / 3D ---------- */
function basculer3D() {
  const carte = etat.carte;
  const bouton = document.getElementById("bascule-3d");
  if (!carte) return;
  arreterDerive();
  etat.vue3d = !etat.vue3d;

  if (etat.vue3d) {
    carte.setTerrain({ source: "relief", exaggeration: EXAGERATION_RELIEF });
    carte.easeTo({ pitch: PENTE_3D, bearing: CAP_3D, duration: 1400 });
  } else {
    carte.setTerrain(null);
    carte.easeTo({ pitch: 0, bearing: 0, duration: 1000 });
  }
  bouton.textContent = etat.vue3d ? "Passer en vue 2D" : "Passer en vue 3D";
  bouton.setAttribute("aria-pressed", String(etat.vue3d));
}

/* ---------- Cadrage : le Burkina reste toujours en vue ---------- */
/* Marges de cadrage : le pays ne passe ni sous le panneau flottant (à gauche, sur grand écran),
   ni sous le bouton 2D/3D, ni sous les contrôles (à droite) */
function marges() {
  const panneau = document.querySelector(".panneau");
  const flottant = panneau && getComputedStyle(panneau).position === "absolute";
  const cadre = document.getElementById("carte").getBoundingClientRect();
  const gauche = flottant ? panneau.getBoundingClientRect().right - cadre.left + 28 : 28;
  return flottant ? { top: 72, right: 72, bottom: 36, left: gauche + 12 } : { top: 76, right: 20, bottom: 28, left: 20 };
}

/* La vue de départ : tout le pays, incliné si la vue 3D est active */
function vueDepart() {
  const camera = etat.carte.cameraForBounds(BOITE_BURKINA, { padding: marges() });
  return etat.vue3d
    ? { center: camera.center, zoom: camera.zoom - 0.18, pitch: PENTE_3D, bearing: CAP_3D }
    : { center: camera.center, zoom: camera.zoom, pitch: 0, bearing: 0 };
}

/* Zoom minimum = le pays entier à l'écran (avec un peu de marge), et maxBounds limite le
   déplacement à ce que l'on voit à ce zoom, plus la place d'un aperçu. Avec retenirCentre(),
   impossible de « perdre » le pays, à tous les zooms. */
function retenirCentre(centre, zoom) {
  const [[ouest, sud], [est, nord]] = BOITE_BURKINA;
  // demi-écran en degrés au zoom demandé (approximation suffisante à cette latitude)
  const conteneur = document.getElementById("carte");
  const degresParPixel = 360 / (512 * 2 ** zoom);
  const margeX = (conteneur.clientWidth / 2) * degresParPixel * PART_ECRAN_HORS_PAYS;
  const margeY = (conteneur.clientHeight / 2) * degresParPixel * PART_ECRAN_HORS_PAYS;
  const borne = (v, min, max) => Math.min(max, Math.max(min, v));
  return new maplibregl.LngLat(
    borne(centre.lng, ouest - margeX, est + margeX),
    borne(centre.lat, sud - margeY, nord + margeY),
  );
}

function limiterVue() {
  const carte = etat.carte;
  carte.setMaxBounds(null);
  const vue = carte.cameraForBounds(BOITE_BURKINA, { padding: marges() });
  if (!vue) return;
  const zoomMin = Math.max(0, vue.zoom - 0.5);
  carte.setMinZoom(zoomMin);
  // Emprise de l'écran à ce zoom, centrée sur le pays (calcul en coordonnées Mercator)
  const { width, height } = carte.getContainer().getBoundingClientRect();
  const echelle = 512 * 2 ** zoomMin;
  const centre = maplibregl.MercatorCoordinate.fromLngLat(vue.center);
  const coin = (dx, dy) => new maplibregl.MercatorCoordinate(centre.x + dx / echelle, centre.y + dy / echelle).toLngLat();
  const sudOuest = coin(-width / 2 - MARGE_APERCU, height / 2 + MARGE_APERCU);
  const nordEst = coin(width / 2 + MARGE_APERCU, -height / 2 - MARGE_APERCU);
  carte.setMaxBounds([[sudOuest.lng, sudOuest.lat], [nordEst.lng, nordEst.lat]]);
}

/* Ramène la vue de départ (en gardant la vue 3D si elle est active) */
function recentrer() {
  arreterDerive();
  if (etat.popup) etat.popup.remove();
  const carte = etat.carte;
  carte.easeTo({ ...vueDepart(), duration: mouvementReduit() ? 0 : 1400 });
  carte.once("moveend", demarrerDerive);
}

/* Bouton « Recentrer sur le Burkina », rangé avec les autres contrôles de la carte */
class ControleRecentrer {
  onAdd() {
    this.conteneur = document.createElement("div");
    this.conteneur.className = "maplibregl-ctrl maplibregl-ctrl-group";
    this.conteneur.innerHTML = `
      <button type="button" class="bouton-recentrer" aria-label="Recentrer sur le Burkina" title="Recentrer sur le Burkina">
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
          <circle cx="12" cy="12" r="6.5" fill="none" stroke="currentColor" stroke-width="2"/>
          <circle cx="12" cy="12" r="2.2" fill="currentColor"/>
          <path d="M12 1.5v4M12 18.5v4M1.5 12h4M18.5 12h4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
      </button>`;
    this.conteneur.querySelector("button").addEventListener("click", recentrer);
    return this.conteneur;
  }

  onRemove() {
    this.conteneur.remove();
  }
}

/* ---------- Arbres à palabres et aperçus ---------- */
/* Récits d'une même ville : mêmes vraies coordonnées, arbres écartés de quelques pixels */
function decalagesParVille() {
  const parVille = new Map();
  etat.contes.forEach((c) => parVille.set(c.ville, [...(parVille.get(c.ville) || []), c.id]));
  const decalages = new Map();
  parVille.forEach((ids) => ids.forEach((id, k) =>
    decalages.set(id, ids.length > 1 ? [(k - (ids.length - 1) / 2) * ECART_MEME_VILLE, -HAUSSE_MEME_VILLE] : [0, 0])));
  return decalages;
}

function ajouterMarqueurs() {
  const decalages = decalagesParVille();
  // En 3D, le relief se charge après le mouvement : MapLibre ne replace pas alors les arbres
  // (il ne le fait qu'au mouvement suivant). On les recale une fois la carte stable.
  etat.carte.on("idle", () => {
    if (etat.vue3d) etat.marqueurs.forEach(({ marqueur }) => marqueur.setLngLat(marqueur.getLngLat()));
  });
  etat.contes.forEach((conte) => {
    const element = document.createElement("button");
    element.className = "marqueur";
    element.type = "button";
    element.dataset.type = conte.type;
    element.innerHTML = `${ARBRE}<span class="etiquette" aria-hidden="true">${echapper(conte.titre)}</span>`;
    element.addEventListener("click", (e) => {
      e.stopPropagation();
      ouvrirConte(conte.id);
    });

    const decalage = decalages.get(conte.id);
    const marqueur = new maplibregl.Marker({ element, offset: decalage, opacityWhenCovered: "1" })
      .setLngLat([conte.lng, conte.lat])
      .addTo(etat.carte);
    // MapLibre remplace le libellé par le sien : on remet le titre du récit
    element.setAttribute("aria-label", `${conte.titre}, ${conte.ville}`);
    etat.marqueurs.set(conte.id, { marqueur, element, conte, decalage });
  });
}

function htmlApercu(conte) {
  const langues = languesDuConte(conte).map(nomLangue).join(" · ");
  return `
    <article class="apercu">
      <div class="scene-visuel apercu-visuel">${visuelConte(conte)}</div>
      <div class="apercu-corps">
        ${pastilleType(conte.type)}
        <h2>${echapper(conte.titre)}</h2>
        <p class="apercu-lieu">${echapper(conte.ville)}</p>
        <p class="apercu-resume">${echapper(conte.resume)}</p>
        <p class="apercu-langues">À écouter en ${echapper(langues)}</p>
        <a class="bouton" href="conte.html?id=${conte.id}">Lire et écouter le récit</a>
      </div>
    </article>`;
}

/* L'illustration de l'aperçu est insérée dans la page pour être animée (css/conte.css).
   En attendant, ou si le fichier manque, l'image fixe reste affichée. */
async function animerApercu(conte, popup) {
  if (!conte.image) return;
  try {
    const reponse = await fetch(conte.image);
    const svg = reponse.ok ? await reponse.text() : "";
    const visuel = popup.getElement()?.querySelector(".apercu-visuel");
    if (!visuel || !svg.includes("<svg")) return;
    visuel.innerHTML = svg;
    const racine = visuel.querySelector("svg");
    racine.setAttribute("role", "img");
    racine.setAttribute("aria-label", conte.titre);
    racine.setAttribute("preserveAspectRatio", "xMidYMax slice"); // le sujet des dessins est en bas
  } catch (erreur) {
    // Hors connexion : l'image fixe reste affichée
  }
}

function ouvrirConte(id) {
  const entree = etat.marqueurs.get(id);
  if (!entree) return;
  const { conte, element, decalage } = entree;
  arreterDerive();

  etat.marqueurs.forEach((m) => m.element.classList.remove("actif"));
  element.classList.add("actif");
  document.querySelectorAll(".liste-recits button").forEach((b) => {
    b.setAttribute("aria-current", String(b.dataset.id === id));
  });

  if (etat.popup) etat.popup.remove();
  // Toujours au-dessus de l'arbre ; l'aperçu suit son décalage (récits d'une même ville)
  const popup = new maplibregl.Popup({ offset: [decalage[0], decalage[1] - HAUTEUR_ARBRE], maxWidth: LARGEUR_APERCU, anchor: "bottom", focusAfterOpen: false })
    .setLngLat([conte.lng, conte.lat])
    .setHTML(htmlApercu(conte))
    .addTo(etat.carte);
  // Le focus entre dans l'aperçu sans interrompre le défilement qui ramène la carte à l'écran
  popup.getElement().querySelector(".apercu .bouton")?.focus({ preventScroll: true });
  popup.on("close", () => {
    element.classList.remove("actif");
    document.querySelectorAll(".liste-recits button").forEach((b) => b.setAttribute("aria-current", "false"));
  });
  etat.popup = popup;
  animerApercu(conte, popup);

  // Arrivée filmée : l'arbre se place sous le centre de la zone libre pour laisser la place à l'aperçu
  const zone = marges();
  const decalageCamera = [(zone.left - zone.right) / 2, popup.getElement().offsetHeight / 2];
  etat.carte.flyTo({
    center: [conte.lng, conte.lat],
    zoom: Math.max(etat.carte.getZoom(), ZOOM_RECIT),
    pitch: etat.vue3d ? PENTE_RECIT : 0,
    bearing: etat.vue3d ? CAP_3D + (conte.lng < CENTRE_BURKINA[0] ? 10 : -10) : 0,
    offset: decalageCamera,
    duration: 2200,
  });
  apresArret(() => cadrerApercu());

  history.replaceState(null, "", `#${id}`);
}

/* Après l'arrivée, si l'aperçu ou son arbre dépasse encore de la zone libre, on décale la carte juste assez.
   En vue inclinée, un seul décalage ne suffit pas toujours : on réessaie, l'écart se réduit à chaque fois. */
function cadrerApercu(essais = 4) {
  if (!etat.popup || !etat.popup.isOpen() || !Number.isInteger(essais)) return;
  const apercu = etat.popup.getElement().getBoundingClientRect();
  const cadre = etat.carte.getContainer().getBoundingClientRect();
  // zone libre : sous le bouton 2D/3D, à droite du panneau, à gauche des contrôles
  const bouton = document.getElementById("bascule-3d").getBoundingClientRect();
  const controles = document.querySelector(".maplibregl-ctrl-top-right").getBoundingClientRect();
  const marge = 10;
  const gauche = cadre.left + marges().left - 18;
  const droite = Math.min(cadre.right - marge, controles.left - 8);
  const haut = apercu.left < bouton.right + 8 ? Math.max(cadre.top + marge, bouton.bottom + 8) : cadre.top + marge;
  let dx = 0;
  let dy = 0;
  if (apercu.left < gauche) dx = apercu.left - gauche;
  else if (apercu.right > droite) dx = apercu.right - droite;
  if (apercu.top < haut) dy = apercu.top - haut;
  else if (apercu.bottom + HAUTEUR_ARBRE > cadre.bottom - marge) dy = apercu.bottom + HAUTEUR_ARBRE - cadre.bottom + marge;
  if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
    etat.carte.panBy([dx, dy], { duration: mouvementReduit() ? 0 : 400 });
    if (essais > 1) apresArret(() => cadrerApercu(essais - 1));
  }
}

/* En mouvement réduit, la caméra arrive aussitôt : « moveend » est déjà passé,
   et l'aperçu ne sera à sa nouvelle place qu'après l'image suivante */
function apresArret(suite) {
  if (etat.carte.isMoving()) etat.carte.once("moveend", suite);
  else requestAnimationFrame(() => requestAnimationFrame(suite));
}

function ouvrirDepuisAdresse() {
  const id = location.hash.slice(1);
  if (id && etat.marqueurs.has(id)) ouvrirConte(id);
}

/* ---------- Liste des récits ---------- */
function afficherListe() {
  const liste = document.getElementById("liste-recits");
  liste.innerHTML = etat.contes.map((c) => `
    <li>
      <button data-id="${c.id}" aria-current="false">
        <span class="vignette">${c.image ? `<img src="${echapper(c.image)}" alt="" loading="lazy">` : illustrationSecours(c)}</span>
        <span class="recit-texte">
          ${pastilleType(c.type)}
          <span class="titre">${echapper(c.titre)}</span>
          <span class="lieu">${echapper(c.ville)}, ${echapper(c.langue)}</span>
        </span>
      </button>
    </li>`).join("");
  liste.querySelectorAll("button").forEach((b) => {
    b.addEventListener("click", () => {
      // Sur téléphone, la carte est au-dessus de la liste : on la ramène à l'écran
      const zone = document.querySelector(".zone-carte");
      if (zone.getBoundingClientRect().top < document.getElementById("entete").offsetHeight - 1) {
        zone.scrollIntoView({ behavior: mouvementReduit() ? "auto" : "smooth", block: "start" });
      }
      ouvrirConte(b.dataset.id);
    });
    // Survoler un récit fait ressortir son arbre sur la carte
    const raviver = (survole) => etat.marqueurs.get(b.dataset.id)?.element.classList.toggle("survol", survole);
    b.addEventListener("pointerenter", () => raviver(true));
    b.addEventListener("pointerleave", () => raviver(false));
    b.addEventListener("focus", () => raviver(true));
    b.addEventListener("blur", () => raviver(false));
  });
}

function afficherErreur(texte) {
  document.querySelector(".zone-carte").insertAdjacentHTML("beforeend",
    `<div class="erreur-carte"><p class="message">${echapper(texte)}</p></div>`);
  document.getElementById("bascule-3d").hidden = true;
}

demarrer();
