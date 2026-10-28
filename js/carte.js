/* =========================================================
   carte.js — carte interactive 2D/3D (MapLibre GL JS)
   ========================================================= */

const STYLE_FOND = "https://tiles.openfreemap.org/styles/positron";
const RELIEF_TUILES = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";
const CENTRE_BURKINA = [-1.6, 12.25];

const etat = {
  carte: null,
  contes: [],
  marqueurs: new Map(), // id -> { marqueur, element, conte }
  popup: null,
  vue3d: false,
};

/* ---------- Démarrage ---------- */
async function demarrer() {
  try {
    etat.contes = await chargerContes();
  } catch (erreur) {
    afficherErreur(`Les récits n'ont pas pu être chargés : ${erreur.message}.`);
    return;
  }
  remplirFiltreLangues();
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
      // Le pays entier tient dans l'écran, quelle que soit sa taille
      bounds: [[-5.6, 9.3], [2.45, 15.15]],
      // marges : aucun point ne démarre sous le bouton 3D (haut gauche) ni sous les contrôles (droite)
      fitBoundsOptions: { padding: { top: 64, right: 64, bottom: 32, left: 32 } },
      minZoom: 4,
      maxZoom: 12,
      maxPitch: 70,
      attributionControl: { compact: true },
    });
  } catch (erreur) {
    afficherErreur("Ce navigateur ne peut pas afficher la carte (WebGL indisponible). La liste des récits reste disponible.");
    return;
  }
  etat.carte.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
  etat.carte.addControl(new maplibregl.FullscreenControl(), "top-right");

  etat.carte.on("load", async () => {
    // Petit écran : l'attribution reste repliée derrière son bouton (i), toujours consultable
    if (matchMedia("(max-width: 760px)").matches) {
      const attribution = document.querySelector(".maplibregl-ctrl-attrib.maplibregl-compact-show");
      if (attribution) {
        attribution.classList.remove("maplibregl-compact-show");
        attribution.removeAttribute("open");
      }
    }
    await ajouterBurkina();
    ajouterRelief();
    ajouterMarqueurs();
    ouvrirDepuisAdresse();
    // carte.html#id modifié à la main, ou boutons Précédent / Suivant du navigateur
    window.addEventListener("hashchange", ouvrirDepuisAdresse);
  });

  etat.carte.on("error", (e) => console.warn("Carte :", e.error?.message || e));

  document.getElementById("bascule-3d").addEventListener("click", basculer3D);
  document.querySelectorAll('input[name="type"]').forEach((c) => c.addEventListener("change", appliquerFiltres));
  document.getElementById("filtre-langue").addEventListener("change", appliquerFiltres);
}

/* ---------- Le pays mis en valeur ---------- */
async function ajouterBurkina() {
  const carte = etat.carte;
  const reponse = await fetch("data/burkina.geojson");
  const burkina = await reponse.json();
  const contour = burkina.features[0].geometry.coordinates[0];

  // Masque : le monde entier assombri, sauf le Burkina
  const masque = {
    type: "Feature",
    geometry: {
      type: "Polygon",
      coordinates: [
        [[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]],
        contour,
      ],
    },
  };

  carte.addSource("masque", { type: "geojson", data: masque });
  carte.addSource("burkina", { type: "geojson", data: burkina });

  carte.addLayer({
    id: "masque",
    type: "fill",
    source: "masque",
    paint: { "fill-color": "#1d2251", "fill-opacity": 0.62 },
  });
  carte.addLayer({
    id: "burkina-teinte",
    type: "fill",
    source: "burkina",
    paint: { "fill-color": "#c2502b", "fill-opacity": 0.08 },
  });
  carte.addLayer({
    id: "burkina-contour",
    type: "line",
    source: "burkina",
    paint: { "line-color": "#e8a934", "line-width": 2.5 },
  });
}

/* ---------- Relief (utilisé par la vue 3D) ---------- */
function ajouterRelief() {
  const carte = etat.carte;
  carte.addSource("relief", {
    type: "raster-dem",
    tiles: [RELIEF_TUILES],
    encoding: "terrarium",
    tileSize: 256,
    maxzoom: 12,
    attribution: "Relief : Mapzen / AWS Terrain Tiles",
  });
  carte.addLayer({
    id: "ombrage",
    type: "hillshade",
    source: "relief",
    layout: { visibility: "none" },
    paint: {
      "hillshade-shadow-color": "#1d2251",
      "hillshade-highlight-color": "#f3e7cf",
      "hillshade-exaggeration": 0.35,
    },
  }, "masque");
}

function basculer3D() {
  const carte = etat.carte;
  const bouton = document.getElementById("bascule-3d");
  if (!carte) return;
  etat.vue3d = !etat.vue3d;

  if (etat.vue3d) {
    // Le Burkina est plutôt plat : on exagère le relief pour qu'il se voie
    carte.setTerrain({ source: "relief", exaggeration: 6 });
    carte.setLayoutProperty("ombrage", "visibility", "visible");
    carte.easeTo({ pitch: 62, bearing: -18, duration: 1400 });
  } else {
    carte.setTerrain(null);
    carte.setLayoutProperty("ombrage", "visibility", "none");
    carte.easeTo({ pitch: 0, bearing: 0, duration: 1000 });
  }
  bouton.textContent = etat.vue3d ? "Revenir en vue 2D" : "Passer en vue 3D";
  bouton.setAttribute("aria-pressed", String(etat.vue3d));
}

/* ---------- Marqueurs et aperçus ---------- */
function ajouterMarqueurs() {
  etat.contes.forEach((conte) => {
    const element = document.createElement("button");
    element.className = "marqueur";
    element.dataset.type = conte.type;
    element.setAttribute("aria-label", `${conte.titre}, ${conte.ville}`);
    element.addEventListener("click", (e) => {
      e.stopPropagation();
      ouvrirConte(conte.id, false);
    });

    const marqueur = new maplibregl.Marker({ element })
      .setLngLat([conte.lng, conte.lat])
      .addTo(etat.carte);
    // MapLibre remplace le libellé par « Map marker » : on remet le titre du récit
    element.setAttribute("aria-label", `${conte.titre}, ${conte.ville}`);
    etat.marqueurs.set(conte.id, { marqueur, element, conte });
  });
}

function htmlApercu(conte) {
  return `
    <article class="apercu">
      ${visuelConte(conte)}
      <div class="apercu-corps">
        ${pastilleType(conte.type)}
        <h2>${echapper(conte.titre)}</h2>
        <p>${echapper(conte.resume)}</p>
        <a class="bouton" href="conte.html?id=${conte.id}">Lire le récit</a>
      </div>
    </article>`;
}

function ouvrirConte(id, voler = true) {
  const entree = etat.marqueurs.get(id);
  if (!entree) return;
  const { conte, element } = entree;

  etat.marqueurs.forEach((m) => m.element.classList.remove("actif"));
  element.classList.add("actif");
  document.querySelectorAll(".liste-recits button").forEach((b) => {
    b.setAttribute("aria-current", String(b.dataset.id === id));
  });

  if (etat.popup) etat.popup.remove();
  // Toujours au-dessus du point : la carte est ensuite décalée pour que l'aperçu tienne en entier
  etat.popup = new maplibregl.Popup({ offset: 18, maxWidth: "290px", anchor: "bottom" })
    .setLngLat([conte.lng, conte.lat])
    .setHTML(htmlApercu(conte))
    .addTo(etat.carte);
  etat.popup.on("close", () => element.classList.remove("actif"));

  if (voler) {
    etat.carte.flyTo({ center: [conte.lng, conte.lat], zoom: Math.max(etat.carte.getZoom(), 7.5), speed: 0.9 });
    etat.carte.once("moveend", cadrerApercu);
  } else {
    cadrerApercu();
  }

  history.replaceState(null, "", `#${id}`);
}

/* Sur petit écran, l'aperçu peut dépasser de la carte : on la décale juste assez */
function cadrerApercu() {
  if (!etat.popup) return;
  const apercu = etat.popup.getElement().getBoundingClientRect();
  const cadre = etat.carte.getContainer().getBoundingClientRect();
  // zone libre : sous le bouton 2D/3D (en haut) et à gauche des contrôles (à droite)
  const bouton = document.getElementById("bascule-3d").getBoundingClientRect();
  const controles = document.querySelector(".maplibregl-ctrl-top-right").getBoundingClientRect();
  const marge = 10;
  const haut = Math.max(cadre.top + marge, bouton.bottom + 8);
  const droite = Math.min(cadre.right - marge, controles.left - 8);
  let dx = 0;
  let dy = 0;
  if (apercu.left < cadre.left + marge) dx = apercu.left - cadre.left - marge;
  else if (apercu.right > droite) dx = apercu.right - droite;
  if (apercu.top < haut) dy = apercu.top - haut;
  else if (apercu.bottom > cadre.bottom - marge) dy = apercu.bottom - cadre.bottom + marge;
  if (dx || dy) {
    const reduit = matchMedia("(prefers-reduced-motion: reduce)").matches;
    etat.carte.panBy([dx, dy], { duration: reduit ? 0 : 400 });
  }
}

function ouvrirDepuisAdresse() {
  const id = location.hash.slice(1);
  if (id && etat.marqueurs.has(id)) ouvrirConte(id);
}

/* ---------- Liste et filtres ---------- */
function remplirFiltreLangues() {
  const select = document.getElementById("filtre-langue");
  const langues = [...new Set(etat.contes.flatMap((c) => [c.langue, ...languesDuConte(c).map(nomLangue)]))].sort();
  select.insertAdjacentHTML("beforeend", langues.map((l) => `<option>${echapper(l)}</option>`).join(""));
}

function contesVisibles() {
  const types = [...document.querySelectorAll('input[name="type"]:checked')].map((c) => c.value);
  const langue = document.getElementById("filtre-langue").value;
  return etat.contes.filter((c) =>
    types.includes(c.type) &&
    (!langue || c.langue === langue || languesDuConte(c).map(nomLangue).includes(langue))
  );
}

function afficherListe() {
  const liste = document.getElementById("liste-recits");
  const visibles = contesVisibles();
  if (!visibles.length) {
    liste.innerHTML = `<li class="message">Aucun récit ne correspond. Cochez un autre type ou choisissez « Toutes les langues ».</li>`;
    return;
  }
  liste.innerHTML = visibles.map((c) => `
    <li>
      <button data-id="${c.id}" aria-current="false">
        ${pastilleType(c.type)}
        <span class="titre">${echapper(c.titre)}</span>
        <span class="lieu">${echapper(c.ville)}, ${echapper(c.langue)}</span>
      </button>
    </li>`).join("");
  liste.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
    // Sur téléphone, la carte est au-dessus de la liste : on la ramène à l'écran
    const zone = document.querySelector(".zone-carte");
    if (zone.getBoundingClientRect().top < document.getElementById("entete").offsetHeight - 1) {
      const reduit = matchMedia("(prefers-reduced-motion: reduce)").matches;
      zone.scrollIntoView({ behavior: reduit ? "auto" : "smooth", block: "start" });
    }
    ouvrirConte(b.dataset.id);
  }));
}

function appliquerFiltres() {
  const visibles = new Set(contesVisibles().map((c) => c.id));
  etat.marqueurs.forEach(({ element }, id) => {
    element.style.display = visibles.has(id) ? "" : "none";
  });
  if (etat.popup) etat.popup.remove();
  afficherListe();
}

function afficherErreur(texte) {
  document.querySelector(".zone-carte").insertAdjacentHTML("beforeend",
    `<div class="erreur-carte"><p class="message">${echapper(texte)}</p></div>`);
  document.getElementById("bascule-3d").hidden = true;
}

demarrer();
