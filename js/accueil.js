/* =========================================================
   accueil.js — étoiles, parallaxe et veillées mises en avant
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

/* 3. Les trois veillées (récits immersifs) */
async function afficherVeillees() {
  const liste = document.getElementById("veillees");
  if (!liste) return;
  try {
    const contes = await chargerContes();
    const choix = contes.filter((c) => c.immersif).slice(0, 3);
    liste.innerHTML = choix.map((c, i) => `
      <li class="veillee">
        <a class="veillee-visuel" href="conte.html?id=${c.id}" tabindex="-1" aria-hidden="true">${visuelConte(c)}</a>
        <div>
          <p class="veillee-numero">Veillée ${i + 1}</p>
          <h3><a href="conte.html?id=${c.id}">${echapper(c.titre)}</a></h3>
          <div class="meta">${pastilleType(c.type)}<span>${echapper(c.ville)}</span><span>${echapper(c.langue)}</span></div>
          <p>${echapper(c.resume)}</p>
          <a class="bouton secondaire" href="conte.html?id=${c.id}">Écouter le récit</a>
        </div>
      </li>`).join("");
  } catch (erreur) {
    liste.outerHTML = `<p class="message">Les récits n'ont pas pu être chargés : ${echapper(erreur.message)}. Ouvrez le site avec Live Server ou depuis son adresse en ligne.</p>`;
  }
}

/* Sur téléphone, le paysage est cadré depuis la gauche (là où se trouve le feu) */
function cadrerPaysage() {
  const etroit = window.matchMedia("(max-width: 760px)").matches;
  document.querySelectorAll(".calque:not(.calque-etoiles)").forEach((calque) => {
    calque.setAttribute("preserveAspectRatio", etroit ? "xMinYMax slice" : "xMidYMax slice");
  });
}
window.addEventListener("resize", cadrerPaysage);

cadrerPaysage();
allumerEtoiles();
activerParallaxe();
afficherVeillees();
