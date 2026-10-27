/* =========================================================
   conte.js — lecture immersive d'un récit (conte.html?id=...)
   ========================================================= */

const zone = document.getElementById("recit");
let scenes = [];
let actuelle = 0;

async function demarrer() {
  const id = new URLSearchParams(location.search).get("id");
  let contes;
  try {
    contes = await chargerContes();
  } catch (erreur) {
    zone.innerHTML = `<p class="conteneur message">Le récit n'a pas pu être chargé : ${echapper(erreur.message)}.</p>`;
    return;
  }

  const index = contes.findIndex((c) => c.id === id);
  if (index === -1) {
    zone.innerHTML = `<div class="conteneur"><p class="message">Ce récit n'existe pas ou a changé d'adresse. <a href="bibliotheque.html">Retrouvez tous les récits dans la bibliothèque.</a></p></div>`;
    return;
  }
  const conte = contes[index];
  const suivant = contes[(index + 1) % contes.length];
  document.title = `${conte.titre} — Contes du Faso`;

  const tete = `
    <div class="conteneur recit-tete">
      <a class="retour" href="carte.html#${conte.id}">Voir sur la carte</a>
      <h1>${echapper(conte.titre)}</h1>
      <div class="meta">${pastilleType(conte.type)}<span>${echapper(conte.ville)}</span><span>Peuple ${echapper(conte.peuple)}</span><span>${echapper(conte.langue)}</span></div>
    </div>`;

  scenes = conte.scenes || [];
  if (scenes.length) {
    zone.innerHTML = tete + htmlImmersif(conte, suivant) + htmlLecteur(conte);
    brancherScenes(conte);
  } else {
    zone.innerHTML = tete + htmlFiche(conte, suivant) + htmlLecteur(conte);
  }
  brancherLecteur(conte);
}

/* ---------- Mode immersif : scène par scène ---------- */
function htmlImmersif(conte, suivant) {
  const points = scenes.map((s, i) =>
    `<button aria-label="Scène ${i + 1} : ${echapper(s.titre)}" data-i="${i}"></button>`).join("");
  return `
    <section class="conteneur" aria-label="Le récit">
      <div class="scene" id="scene" aria-live="polite">
        <div class="scene-visuel" id="scene-visuel"></div>
        <div class="scene-texte">
          <p class="scene-etape" id="scene-etape"></p>
          <h2 id="scene-titre"></h2>
          <p id="scene-paragraphe"></p>
        </div>
      </div>
      <nav class="navigation-scenes" aria-label="Scènes">
        <div class="points">${points}</div>
        <div class="boutons">
          <button class="bouton secondaire" id="precedent">Scène précédente</button>
          <button class="bouton" id="suivant">Scène suivante</button>
        </div>
      </nav>
      <div class="morale" id="morale" hidden>
        <h2>La morale</h2>
        <p>${echapper(conte.morale)}</p>
        <div class="boutons">
          <button class="bouton secondaire" id="relire">Relire depuis le début</button>
          <a class="bouton" href="conte.html?id=${suivant.id}">Récit suivant : ${echapper(suivant.titre)}</a>
        </div>
      </div>
      <p class="source">Source : ${echapper(conte.source)}</p>
    </section>`;
}

function brancherScenes(conte) {
  document.getElementById("precedent").addEventListener("click", () => allerA(actuelle - 1, conte));
  document.getElementById("suivant").addEventListener("click", () => allerA(actuelle + 1, conte));
  document.getElementById("relire").addEventListener("click", () => {
    allerA(0, conte);
    document.getElementById("scene").scrollIntoView({ behavior: "smooth", block: "center" });
  });
  document.querySelectorAll(".points button").forEach((b) =>
    b.addEventListener("click", () => allerA(Number(b.dataset.i), conte)));
  document.addEventListener("keydown", (e) => {
    if (e.target.closest("input, select, textarea, audio")) return;
    if (e.key === "ArrowRight") allerA(actuelle + 1, conte);
    if (e.key === "ArrowLeft") allerA(actuelle - 1, conte);
  });
  afficherScene(0, conte, false);
}

function allerA(i, conte) {
  if (i < 0) return;
  if (i >= scenes.length) {
    // Fin du récit : on affiche la morale
    document.getElementById("morale").hidden = false;
    document.querySelectorAll(".points button").forEach((b) => b.classList.add("lu"));
    document.getElementById("morale").scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }
  afficherScene(i, conte, true);
}

function afficherScene(i, conte, anime) {
  const bloc = document.getElementById("scene");
  const remplir = () => {
    actuelle = i;
    const s = scenes[i];
    const visuel = s.image ? { ...conte, image: s.image, id: `${conte.id}-${i}` } : { ...conte, id: `${conte.id}-${i}` };
    document.getElementById("scene-visuel").innerHTML = visuelConte(visuel);
    document.getElementById("scene-etape").textContent = `Scène ${i + 1} sur ${scenes.length}`;
    document.getElementById("scene-titre").textContent = s.titre;
    document.getElementById("scene-paragraphe").textContent = s.texte;
    document.querySelectorAll(".points button").forEach((b, j) => {
      if (j === i) b.setAttribute("aria-current", "step"); else b.removeAttribute("aria-current");
      b.classList.toggle("lu", j < i);
    });
    document.getElementById("precedent").disabled = i === 0;
    document.getElementById("suivant").textContent = i === scenes.length - 1 ? "Terminer le récit" : "Scène suivante";
    bloc.classList.remove("sortie");
    bloc.classList.remove("entree");
    requestAnimationFrame(() => requestAnimationFrame(() => bloc.classList.add("entree")));
  };
  if (!anime) return remplir();
  bloc.classList.add("sortie");
  setTimeout(remplir, 300);
}

/* ---------- Fiche simple ---------- */
function htmlFiche(conte, suivant) {
  return `
    <section class="conteneur fiche">
      <div class="scene-visuel">${visuelConte(conte)}</div>
      <div class="fiche-texte">
        <p>${echapper(conte.resume)}</p>
        <p class="bientot">La version illustrée scène par scène de ce récit est en préparation.</p>
      </div>
    </section>
    <section class="conteneur">
      <div class="morale">
        <h2>La morale</h2>
        <p>${echapper(conte.morale)}</p>
        <div class="boutons"><a class="bouton" href="conte.html?id=${suivant.id}">Récit suivant : ${echapper(suivant.titre)}</a></div>
      </div>
      <p class="source">Source : ${echapper(conte.source)}</p>
    </section>`;
}

/* ---------- Lecteur audio multilingue ---------- */
function htmlLecteur(conte) {
  const pistes = conte.audio || [];
  const options = pistes.map((p, i) => `<option value="${i}">${echapper(p.langue)}</option>`).join("");
  return `
    <div class="lecteur" aria-label="Écouter le récit">
      <div class="conteneur">
        <label>Écouter en
          <select class="champ" id="choix-langue">${options}</select>
        </label>
        <audio id="audio" controls preload="none" hidden></audio>
        <p class="absent" id="audio-absent" hidden>L'enregistrement dans cette langue arrive bientôt.</p>
      </div>
    </div>`;
}

function brancherLecteur(conte) {
  const pistes = conte.audio || [];
  const choix = document.getElementById("choix-langue");
  const audio = document.getElementById("audio");
  const absent = document.getElementById("audio-absent");
  const charger = () => {
    const piste = pistes[Number(choix.value)];
    audio.pause();
    if (piste && piste.fichier) {
      audio.src = piste.fichier;
      audio.hidden = false;
      absent.hidden = true;
    } else {
      audio.removeAttribute("src");
      audio.hidden = true;
      absent.hidden = false;
    }
  };
  choix.addEventListener("change", charger);
  charger();
}

demarrer();
