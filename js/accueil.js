/* =========================================================
   accueil.js — étoiles et parallaxe de la veillée
   ========================================================= */

const reduireMouvement = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* 1. Le ciel étoilé */
function allumerEtoiles() {
  const groupe = document.getElementById("etoiles");
  if (!groupe) return;
  const ns = "http://www.w3.org/2000/svg";
  for (let i = 0; i < 140; i++) {
    const etoile = document.createElementNS(ns, "circle");
    const x = Math.random() * 1440;
    const y = Math.random() * 380;
    etoile.setAttribute("cx", x.toFixed(1));
    etoile.setAttribute("cy", y.toFixed(1));
    etoile.setAttribute("r", (Math.random() * 1.3 + 0.4).toFixed(2));
    etoile.setAttribute("class", "etoile");
    etoile.style.setProperty("--o", (Math.random() * 0.6 + 0.3).toFixed(2));
    etoile.style.animationDelay = `${(Math.random() * 0.8).toFixed(2)}s, ${(Math.random() * 4).toFixed(2)}s`;
    groupe.appendChild(etoile);
  }
}

/* 2. Parallaxe : chaque calque suit la souris et le défilement à sa vitesse */
function activerParallaxe() {
  if (reduireMouvement) return;
  const calques = [...document.querySelectorAll(".calque")];
  let sx = 0, sy = 0, defil = 0, demande = false;

  const dessiner = () => {
    calques.forEach((calque) => {
      const p = Number(calque.dataset.profondeur || 0);
      calque.style.transform = `translate3d(${sx * p}px, ${sy * p * 0.5 + defil * p * 0.02}px, 0)`;
    });
    demande = false;
  };
  const planifier = () => {
    if (!demande) { demande = true; requestAnimationFrame(dessiner); }
  };

  window.addEventListener("pointermove", (e) => {
    sx = (e.clientX / window.innerWidth - 0.5) * -1;
    sy = (e.clientY / window.innerHeight - 0.5) * -1;
    planifier();
  });
  window.addEventListener("scroll", () => {
    defil = window.scrollY;
    planifier();
  }, { passive: true });
}

/* Sur téléphone et tablette en portrait, le paysage est cadré depuis la gauche (là où se trouve le feu) */
function cadrerPaysage() {
  // même condition que dans css/accueil.css
  const etroit = window.matchMedia("(max-width: 760px), (orientation: portrait) and (max-width: 1100px)").matches;
  document.querySelectorAll(".calque:not(.calque-etoiles)").forEach((calque) => {
    calque.setAttribute("preserveAspectRatio", etroit ? "xMinYMax slice" : "xMidYMax slice");
  });
}
window.addEventListener("resize", cadrerPaysage);

cadrerPaysage();
allumerEtoiles();
activerParallaxe();
