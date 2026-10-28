/* =========================================================
   app.js — fonctions communes à toutes les pages
   ========================================================= */

const TYPES = {
  conte: { libelle: "Conte", couleur: "#e8a934" },
  legende: { libelle: "Légende", couleur: "#c2502b" },
  historique: { libelle: "Récit historique", couleur: "#5b9461" },
};

const PAGES = [
  { href: "index.html", libelle: "Accueil" },
  { href: "carte.html", libelle: "Carte" },
  { href: "bibliotheque.html", libelle: "Bibliothèque" },
  { href: "apropos.html", libelle: "À propos" },
];

/* Échappe le texte avant de l'insérer dans du HTML */
function echapper(texte) {
  return String(texte ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);
}

/* Charge les récits une seule fois */
let _contes = null;
async function chargerContes() {
  if (_contes) return _contes;
  const reponse = await fetch("data/contes.json");
  if (!reponse.ok) throw new Error("data/contes.json introuvable (" + reponse.status + ")");
  const donnees = await reponse.json();
  _contes = donnees.contes;
  return _contes;
}

/* En-tête et pied de page, identiques sur toutes les pages */
function construireEntete() {
  const actuelle = location.pathname.split("/").pop() || "index.html";
  const liens = PAGES.map((p) => {
    const actif = p.href === actuelle || (actuelle === "conte.html" && p.href === "bibliotheque.html");
    return `<a href="${p.href}"${actif ? ' aria-current="page"' : ""}>${p.libelle}</a>`;
  }).join("");

  const entete = document.getElementById("entete");
  if (entete) {
    entete.className = "entete";
    entete.innerHTML = `
      <div class="conteneur">
        <a class="logo" href="index.html">Contes <span>du Faso</span></a>
        <button class="bouton-musique" type="button" aria-pressed="false" title="Activer la musique" hidden>
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
            <path d="M9 17.5V5.5l10-2v12" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
            <circle cx="6.5" cy="17.5" r="2.5" fill="currentColor"/>
            <circle cx="16.5" cy="15.5" r="2.5" fill="currentColor"/>
            <path class="barre" d="M3 3l18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
          <span class="visuellement-cache">Activer la musique</span>
        </button>
        <button class="bouton-menu" aria-expanded="false" aria-controls="nav">Menu</button>
        <nav class="nav" id="nav" aria-label="Navigation principale">${liens}</nav>
      </div>`;
    const bouton = entete.querySelector(".bouton-menu");
    const nav = entete.querySelector(".nav");
    bouton.addEventListener("click", () => {
      const ouvert = nav.classList.toggle("ouvert");
      bouton.setAttribute("aria-expanded", ouvert);
    });
    brancherMusique(entete.querySelector(".bouton-musique"));
  }

  const pied = document.getElementById("pied");
  if (pied) {
    pied.className = "pied";
    pied.innerHTML = `
      <div class="conteneur">
        <p>Projet du groupe 6, Web Multimédia 2026</p>
        <p>Préserver, numériser et transmettre le patrimoine oral burkinabè.</p>
      </div>`;
  }
}

/* ---------- Musique d'ambiance ----------
   Jamais de lecture automatique : la musique ne part qu'après un geste
   de l'utilisateur. Le choix est mémorisé d'une page à l'autre. */
const MUSIQUE = {
  fichier: "assets/musique/ambiance.mp3",
  cle: "contes-musique",
  volume: 0.35,
  volumeBas: 0.1, // pendant qu'un enregistrement de récit joue
  fondu: 1000,    // durée des montées et descentes du son, en ms
};

function lirePreference() {
  try { return localStorage.getItem(MUSIQUE.cle) === "oui"; } catch (e) { return false; }
}

function ecrirePreference(active) {
  try { localStorage.setItem(MUSIQUE.cle, active ? "oui" : "non"); } catch (e) { /* stockage indisponible */ }
}

function brancherMusique(bouton) {
  if (!bouton) return;
  const musique = new Audio();
  musique.loop = true;
  musique.preload = "metadata";
  musique.volume = 0;
  let enLecture = false;
  let animation = 0;

  // Un autre son de la page (le lecteur du récit) est-il en train de jouer ?
  const autreSonEnCours = () =>
    [...document.querySelectorAll("audio, video")].some((m) => !m.paused && !m.ended);
  const volumeCible = () => (autreSonEnCours() ? MUSIQUE.volumeBas : MUSIQUE.volume);

  // Fait glisser le volume jusqu'à la cible, puis appelle « ensuite »
  function glisserVers(cible, ensuite) {
    cancelAnimationFrame(animation);
    const depart = musique.volume;
    const debut = performance.now();
    const etape = (maintenant) => {
      const t = Math.min(1, (maintenant - debut) / MUSIQUE.fondu);
      musique.volume = Math.min(1, Math.max(0, depart + (cible - depart) * t));
      if (t < 1) animation = requestAnimationFrame(etape);
      else if (ensuite) ensuite();
    };
    animation = requestAnimationFrame(etape);
  }

  function majBouton() {
    const libelle = enLecture ? "Couper la musique" : "Activer la musique";
    bouton.setAttribute("aria-pressed", enLecture);
    bouton.title = libelle;
    bouton.querySelector(".visuellement-cache").textContent = libelle;
  }

  async function jouer() {
    try {
      await musique.play();
    } catch (e) {
      return false; // navigateur pas encore autorisé, ou fichier illisible
    }
    enLecture = true;
    majBouton();
    glisserVers(volumeCible());
    return true;
  }

  function couper() {
    enLecture = false;
    majBouton();
    glisserVers(0, () => { if (!enLecture) musique.pause(); });
  }

  bouton.addEventListener("click", () => {
    if (enLecture) {
      couper();
      ecrirePreference(false);
    } else {
      ecrirePreference(true);
      jouer();
    }
  });

  // Musique activée sur une page précédente : elle reprend au premier geste ici
  function reprendre(e) {
    if (bouton.contains(e.target)) return; // le bouton gère lui-même son clic
    if (e.type === "keydown" && e.key === "Escape") return; // n'ouvre pas le droit de jouer
    if (!enLecture && lirePreference()) jouer().then((ok) => { if (ok) arreterReprise(); });
    else arreterReprise();
  }
  function arreterReprise() {
    document.removeEventListener("click", reprendre);
    document.removeEventListener("keydown", reprendre);
  }
  if (lirePreference()) {
    document.addEventListener("click", reprendre);
    document.addEventListener("keydown", reprendre);
  }

  // Le récit parle : la musique se fait discrète, puis revient
  const ajuster = () => { if (enLecture) glisserVers(volumeCible()); };
  ["play", "pause", "ended"].forEach((type) => document.addEventListener(type, ajuster, true));

  // Le bouton n'apparaît que si le fichier se charge
  musique.addEventListener("loadedmetadata", () => { bouton.hidden = false; }, { once: true });
  musique.addEventListener("error", () => {
    cancelAnimationFrame(animation);
    arreterReprise();
    bouton.remove();
  });
  musique.src = MUSIQUE.fichier;
}

/* Illustration de secours tant qu'une vraie image n'est pas fournie :
   un paysage de nuit dont la couleur dépend du type de récit */
function illustrationSecours(conte, classe = "") {
  const c = (TYPES[conte.type] || TYPES.conte).couleur;
  const id = "g-" + conte.id;
  return `
  <svg class="${classe}" viewBox="0 0 400 240" preserveAspectRatio="xMidYMid slice" role="img" aria-label="${echapper(conte.titre)}">
    <defs>
      <linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#1d2251"/>
        <stop offset="1" stop-color="${c}" stop-opacity="0.55"/>
      </linearGradient>
    </defs>
    <rect width="400" height="240" fill="url(#${id})"/>
    <circle cx="310" cy="62" r="22" fill="#f3e7cf" opacity="0.9"/>
    <path d="M0 190 Q90 150 180 178 T400 168 V240 H0Z" fill="#14173a" opacity="0.65"/>
    <path d="M0 212 Q120 190 230 206 T400 200 V240 H0Z" fill="#14173a"/>
    <path d="M86 206 c2-30 -4-52 -2-70 c-14-6 -28-14 -34-26 c10 6 22 10 32 10 c-6-10 -8-22 -4-32 c4 12 10 20 18 26 c2-12 8-22 16-28 c-2 12 -2 22 2 32 c8-4 18-12 24-22 c-2 14 -12 26 -26 32 c0 20 -6 42 -4 78 z" fill="#14173a"/>
  </svg>`;
}

/* Image du récit (ou illustration de secours) */
function visuelConte(conte, classe = "") {
  if (conte.image) {
    return `<img class="${classe}" src="${echapper(conte.image)}" alt="${echapper(conte.titre)}" loading="lazy">`;
  }
  return illustrationSecours(conte, classe);
}

function pastilleType(type) {
  const t = TYPES[type] || TYPES.conte;
  return `<span class="type" data-type="${type}">${t.libelle}</span>`;
}

document.addEventListener("DOMContentLoaded", construireEntete);
