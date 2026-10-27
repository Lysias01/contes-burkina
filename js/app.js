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
        <button class="bouton-menu" aria-expanded="false" aria-controls="nav">Menu</button>
        <nav class="nav" id="nav" aria-label="Navigation principale">${liens}</nav>
      </div>`;
    const bouton = entete.querySelector(".bouton-menu");
    const nav = entete.querySelector(".nav");
    bouton.addEventListener("click", () => {
      const ouvert = nav.classList.toggle("ouvert");
      bouton.setAttribute("aria-expanded", ouvert);
    });
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
