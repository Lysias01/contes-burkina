/* =========================================================
   conte.js — lecture immersive d'un récit (conte.html?id=...)
   ========================================================= */

const zone = document.getElementById("recit");
let scenes = [];
let actuelle = 0;
let langue = "fr"; // langue affichée et écoutée, gardée d'une scène à l'autre

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
      ${htmlChoixLangue(conte)}
    </div>
    <audio id="audio-recit" preload="none"></audio>`;

  scenes = conte.scenes || [];
  if (scenes.length) {
    await Promise.all(scenes.map((s) => chargerIllustration(s.image)));
    zone.innerHTML = tete + htmlImmersif(conte, suivant);
    brancherScenes(conte);
    brancherEcoute(() => cheminAudio(conte, actuelle + 1));
  } else {
    // La couverture est insérée dans la page (comme les scènes) pour être animée
    await chargerIllustration(conte.image);
    zone.innerHTML = tete + htmlFiche(conte, suivant);
    afficherIllustration({ image: conte.image, titre: conte.titre }, 0, conte);
    brancherParallaxe();
    remplirFiche(conte);
    brancherEcoute(() => cheminAudio(conte, null));
  }
  brancherChoixLangue(conte);
}

/* ---------- Langue du récit : texte et audio viennent de la même source ---------- */
function htmlChoixLangue(conte) {
  const codes = languesDuConte(conte);
  if (!codes.length) return "";
  const options = codes.map((code) =>
    `<option value="${code}">${echapper(nomLangue(code))} (voix de synthèse)</option>`).join("");
  // Langue du récit sans traduction possible : on le dit plutôt que de l'inventer
  const absente = conte.langue && !codes.map(nomLangue).includes(conte.langue)
    ? `<p class="note-langue">Pas encore de version en ${echapper(conte.langue)} : aucun outil de traduction automatique ne couvre cette langue.</p>`
    : "";
  return `
    <div class="choix-langue">
      <label for="langue-recit">Lire et écouter en</label>
      <select class="champ" id="langue-recit">${options}</select>
      ${absente}
    </div>`;
}

function brancherChoixLangue(conte) {
  const select = document.getElementById("langue-recit");
  if (!select) return;
  select.value = langue;
  select.addEventListener("change", () => {
    langue = select.value;
    arreterEcoute();
    if (scenes.length) afficherTexteScene(scenes[actuelle]);
    else remplirFiche(conte);
  });
}

function cheminAudio(conte, numero) {
  return numero ? `assets/audio/${conte.id}-${numero}-${langue}.mp3` : `assets/audio/${conte.id}-${langue}.mp3`;
}

/* ---------- Écoute : un bouton, l'audio de la langue affichée ---------- */
function htmlEcoute(libelle) {
  return `
    <div class="ecoute">
      <button class="bouton secondaire" id="ecouter" type="button" data-libelle="${libelle}">
        <span class="ecoute-icone" aria-hidden="true">▶</span> <span class="ecoute-libelle">${libelle}</span>
      </button>
      <span class="ecoute-etat" id="ecoute-etat" aria-live="polite"></span>
    </div>`;
}

function majEcoute(enCours) {
  const bouton = document.getElementById("ecouter");
  if (!bouton) return;
  bouton.querySelector(".ecoute-icone").textContent = enCours ? "■" : "▶";
  bouton.querySelector(".ecoute-libelle").textContent = enCours ? "Arrêter la lecture" : bouton.dataset.libelle;
}

function arreterEcoute() {
  const audio = document.getElementById("audio-recit");
  if (!audio) return;
  audio.pause();
  if (audio.getAttribute("src")) audio.currentTime = 0;
  majEcoute(false);
  const etat = document.getElementById("ecoute-etat");
  if (etat) etat.textContent = "";
}

function brancherEcoute(source) {
  const audio = document.getElementById("audio-recit");
  const bouton = document.getElementById("ecouter");
  if (!audio || !bouton) return;
  bouton.addEventListener("click", () => {
    if (!audio.paused) return arreterEcoute();
    const chemin = source();
    if (audio.getAttribute("src") !== chemin) audio.src = chemin;
    document.getElementById("ecoute-etat").textContent = "";
    audio.play().catch(() => {}); // un fichier absent est signalé par l'événement « error »
  });
  audio.addEventListener("play", () => majEcoute(true));
  audio.addEventListener("pause", () => majEcoute(false));
  audio.addEventListener("error", () => {
    majEcoute(false);
    document.getElementById("ecoute-etat").textContent = "L'audio de ce passage n'a pas pu être chargé.";
  });
}

/* ---------- Illustrations de scène ----------
   Les SVG sont insérés dans la page (et non en <img>) pour que css/conte.css
   puisse animer leurs calques et leurs éléments anime-* */
const illustrations = new Map(); // chemin -> code SVG, ou null si le fichier manque
const mouvementReduit = matchMedia("(prefers-reduced-motion: reduce)");

async function chargerIllustration(chemin) {
  if (!chemin) return null;
  if (illustrations.has(chemin)) return illustrations.get(chemin);
  let svg = null;
  try {
    const reponse = await fetch(chemin);
    if (reponse.ok) {
      const texte = await reponse.text();
      if (texte.includes("<svg")) svg = texte;
    }
  } catch (erreur) {
    // Fichier absent ou hors connexion : on gardera l'illustration de secours
  }
  illustrations.set(chemin, svg);
  return svg;
}

function afficherIllustration(s, i, conte) {
  const conteneur = document.getElementById("scene-visuel");
  const svg = illustrations.get(s.image);
  if (!svg) {
    conteneur.innerHTML = illustrationSecours({ ...conte, id: `${conte.id}-${i}` });
    return;
  }
  conteneur.innerHTML = svg;
  const racine = conteneur.querySelector("svg");
  racine.setAttribute("role", "img");
  racine.setAttribute("aria-label", s.titre);
}

/* Parallaxe : les trois calques suivent la souris, d'autant plus qu'ils sont proches */
function brancherParallaxe() {
  const visuel = document.getElementById("scene-visuel");
  const regler = (x, y) => {
    visuel.style.setProperty("--px", x.toFixed(3));
    visuel.style.setProperty("--py", y.toFixed(3));
  };
  visuel.addEventListener("pointermove", (e) => {
    if (e.pointerType !== "mouse" || mouvementReduit.matches) return;
    const r = visuel.getBoundingClientRect();
    regler((e.clientX - r.left) / r.width - 0.5, (e.clientY - r.top) / r.height - 0.5);
  });
  visuel.addEventListener("pointerleave", () => regler(0, 0));
}

/* Les adresses citées dans la source deviennent des liens (le texte est d'abord échappé) */
function sourceAvecLiens(texte) {
  return echapper(texte).replace(/https?:\/\/[^\s<]+[^\s<.,;:]/g,
    (adresse) => `<a href="${adresse}" target="_blank" rel="noopener">${adresse}</a>`);
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
          <p class="traduction" id="scene-traduction" lang="fr" hidden></p>
          ${htmlEcoute("Écouter la scène")}
          <div class="choix" id="choix" hidden>
            <p class="choix-question" id="choix-question"></p>
            <div class="choix-options" id="choix-options" role="group" aria-labelledby="choix-question"></div>
            <p class="choix-reponse" id="choix-reponse" aria-live="polite"></p>
          </div>
        </div>
      </div>
      <nav class="navigation-scenes" aria-label="Scènes">
        <div class="points">${points}</div>
        <div class="boutons">
          <button class="bouton secondaire" id="precedent">Scène précédente</button>
          <button class="bouton" id="suivant">Scène suivante</button>
        </div>
        <p class="aide-balayage">Astuce : balayez la scène vers la gauche ou la droite pour en changer.</p>
      </nav>
      <div class="morale" id="morale" hidden>
        <h2>La morale</h2>
        <p>${echapper(conte.morale)}</p>
        <div class="boutons">
          <button class="bouton secondaire" id="relire">Relire depuis le début</button>
          <a class="bouton" href="conte.html?id=${suivant.id}">Récit suivant : ${echapper(suivant.titre)}</a>
        </div>
      </div>
      ${questionsQuiz(conte).length ? `
      <section class="quiz" id="quiz" aria-labelledby="quiz-titre" hidden>
        <h2 id="quiz-titre">Le quiz du récit</h2>
        <div id="quiz-corps"></div>
        <div class="quiz-retour" id="quiz-retour" aria-live="polite"></div>
      </section>` : ""}
      <p class="source">Source : ${sourceAvecLiens(conte.source)}</p>
    </section>`;
}

/* ---------- Choix au milieu du récit (champ "choix" d'une scène) ---------- */
const choixFaits = new Map(); // index de la scène -> option choisie

function aUnChoix(s) {
  return !!(s && s.choix && Array.isArray(s.choix.options) && s.choix.options.length);
}

/* Tant que le choix de la scène n'est pas fait, on ne peut pas avancer */
function sceneBloquee() {
  return aUnChoix(scenes[actuelle]) && !choixFaits.has(actuelle);
}

function afficherChoix(s, i) {
  const bloc = document.getElementById("choix");
  if (!aUnChoix(s)) {
    bloc.hidden = true;
    return;
  }
  bloc.hidden = false;
  document.getElementById("choix-question").textContent = s.choix.question;
  const options = document.getElementById("choix-options");
  options.innerHTML = s.choix.options.map((o, k) =>
    `<button class="bouton secondaire" data-k="${k}" aria-pressed="false">${echapper(o.texte)}</button>`).join("");
  options.querySelectorAll("button").forEach((b) =>
    b.addEventListener("click", () => repondreChoix(i, Number(b.dataset.k))));
  const reponse = document.getElementById("choix-reponse");
  reponse.classList.add("consigne");
  reponse.textContent = "Choisis une réponse pour continuer le récit.";
  if (choixFaits.has(i)) montrerReponseChoix(i, choixFaits.get(i));
}

function repondreChoix(i, k) {
  choixFaits.set(i, k);
  montrerReponseChoix(i, k);
  document.getElementById("suivant").disabled = false;
}

function montrerReponseChoix(i, k) {
  document.querySelectorAll("#choix-options button").forEach((b, j) => b.setAttribute("aria-pressed", j === k));
  const reponse = document.getElementById("choix-reponse");
  reponse.classList.remove("consigne");
  reponse.textContent = scenes[i].choix.options[k].reponse;
}

/* ---------- Quiz de fin (champ "quiz" du récit) ---------- */
let quizIndex = 0;
let quizScore = 0;

function questionsQuiz(conte) {
  return (conte.quiz || []).filter((q) =>
    q && Array.isArray(q.propositions) && Number.isInteger(q.bonne) && q.propositions[q.bonne] !== undefined);
}

function demarrerQuiz(conte, donnerFocus) {
  quizIndex = 0;
  quizScore = 0;
  afficherQuestion(conte, donnerFocus);
}

function afficherQuestion(conte, donnerFocus) {
  const questions = questionsQuiz(conte);
  const q = questions[quizIndex];
  document.getElementById("quiz-corps").innerHTML = `
    <p class="quiz-etape">Question ${quizIndex + 1} sur ${questions.length}</p>
    <p class="quiz-question" id="quiz-question">${echapper(q.question)}</p>
    <div class="quiz-options" role="group" aria-labelledby="quiz-question">
      ${q.propositions.map((p, k) => `<button class="bouton secondaire" data-k="${k}">${echapper(p)}</button>`).join("")}
    </div>`;
  document.getElementById("quiz-retour").innerHTML = "";
  const boutons = document.querySelectorAll(".quiz-options button");
  boutons.forEach((b) => b.addEventListener("click", () => repondreQuiz(conte, Number(b.dataset.k))));
  if (donnerFocus) boutons[0].focus();
}

function repondreQuiz(conte, k) {
  const questions = questionsQuiz(conte);
  const q = questions[quizIndex];
  const juste = k === q.bonne;
  if (juste) quizScore++;
  document.querySelectorAll(".quiz-options button").forEach((b, j) => {
    b.disabled = true;
    if (j === q.bonne) {
      b.classList.add("juste");
      b.insertAdjacentHTML("beforeend", `<span class="marque">✓ bonne réponse</span>`);
    } else if (j === k) {
      b.classList.add("faux");
      b.insertAdjacentHTML("beforeend", `<span class="marque">✗ ta réponse</span>`);
    }
  });
  const dernier = quizIndex === questions.length - 1;
  const retour = document.getElementById("quiz-retour");
  retour.innerHTML = `
    <p><strong>${juste ? "Bonne réponse !" : "Pas tout à fait…"}</strong>
      ${juste ? "" : `La bonne réponse était : ${echapper(q.propositions[q.bonne])}.`}
      ${echapper(q.explication)}</p>
    <button class="bouton" id="quiz-suite">${dernier ? "Voir mon score" : "Question suivante"}</button>`;
  const suite = document.getElementById("quiz-suite");
  suite.addEventListener("click", () => {
    if (dernier) return afficherScore(conte);
    quizIndex++;
    afficherQuestion(conte, true);
  });
  suite.focus();
}

function afficherScore(conte) {
  const total = questionsQuiz(conte).length;
  const message = quizScore === total
    ? "Bravo, tu as l'oreille d'un vrai griot !"
    : quizScore >= total / 2
      ? "Très bien, tu as bien écouté le récit !"
      : "Chaque relecture fait découvrir de nouveaux détails : retente ta chance !";
  document.getElementById("quiz-corps").innerHTML = "";
  document.getElementById("quiz-retour").innerHTML = `
    <p class="quiz-score">Ton score : <strong>${quizScore} sur ${total}</strong></p>
    <p>${message}</p>
    <button class="bouton" id="quiz-recommencer">Recommencer le quiz</button>`;
  const recommencer = document.getElementById("quiz-recommencer");
  recommencer.addEventListener("click", () => demarrerQuiz(conte, true));
  recommencer.focus();
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
    // Les flèches ne changent pas de scène pendant le quiz
    if (e.target.closest("input, select, textarea, .quiz")) return;
    if (e.key === "ArrowRight") allerA(actuelle + 1, conte);
    if (e.key === "ArrowLeft") allerA(actuelle - 1, conte);
  });
  brancherBalayage(conte);
  brancherParallaxe();
  afficherScene(0, conte, false);
}

/* Téléphone : balayer la scène vers la gauche ou la droite change de scène */
function brancherBalayage(conte) {
  const scene = document.getElementById("scene");
  let depart = null;
  scene.addEventListener("touchstart", (e) => {
    // un geste commencé sur un bouton ou un champ reste un toucher normal
    depart = e.touches.length === 1 && !e.target.closest("button, a, select")
      ? { x: e.touches[0].clientX, y: e.touches[0].clientY }
      : null;
  }, { passive: true });
  // Geste nettement horizontal : c'est un balayage de scène, pas un défilement. On le
  // garde pour nous, sinon le navigateur lance un « élan » et perd le toucher suivant.
  scene.addEventListener("touchmove", (e) => {
    if (!depart || e.touches.length !== 1 || !e.cancelable) return;
    const dx = e.touches[0].clientX - depart.x;
    const dy = e.touches[0].clientY - depart.y;
    if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.5) e.preventDefault();
  }, { passive: false });
  scene.addEventListener("touchend", (e) => {
    if (!depart) return;
    const dx = e.changedTouches[0].clientX - depart.x;
    const dy = e.changedTouches[0].clientY - depart.y;
    depart = null;
    // nettement horizontal et assez long, sinon c'est un défilement
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    allerA(actuelle + (dx < 0 ? 1 : -1), conte);
  }, { passive: true });
}

function allerA(i, conte) {
  if (i < 0) return;
  if (i > actuelle && sceneBloquee()) {
    // Le choix de la scène doit d'abord être fait
    document.querySelector("#choix-options button").focus();
    return;
  }
  if (i >= scenes.length) {
    // Fin du récit : on affiche la morale, puis le quiz s'il existe
    document.getElementById("morale").hidden = false;
    const quiz = document.getElementById("quiz");
    if (quiz && quiz.hidden) {
      quiz.hidden = false;
      demarrerQuiz(conte, false);
    }
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
    arreterEcoute(); // l'audio de la scène précédente s'arrête
    afficherIllustration(s, i, conte);
    document.getElementById("scene-etape").textContent = `Scène ${i + 1} sur ${scenes.length}`;
    document.getElementById("scene-titre").textContent = s.titre;
    afficherTexteScene(s);
    afficherChoix(s, i);
    document.querySelectorAll(".points button").forEach((b, j) => {
      if (j === i) b.setAttribute("aria-current", "step"); else b.removeAttribute("aria-current");
      b.classList.toggle("lu", j < i);
    });
    document.getElementById("precedent").disabled = i === 0;
    const suivant = document.getElementById("suivant");
    const focusSurSuivant = document.activeElement === suivant;
    suivant.textContent = i === scenes.length - 1 ? "Terminer le récit" : "Scène suivante";
    suivant.disabled = sceneBloquee();
    // Le bouton désactivé perdrait le focus : on le place sur le premier choix
    if (suivant.disabled && focusSurSuivant) document.querySelector("#choix-options button").focus();
    bloc.classList.remove("sortie");
    bloc.classList.remove("entree");
    requestAnimationFrame(() => requestAnimationFrame(() => bloc.classList.add("entree")));
    // Sur téléphone, l'illustration est au-dessus du texte : après « Scène suivante »,
    // on remonte au début de la nouvelle scène au lieu de laisser le visiteur sur les boutons.
    // Saut instantané : un toucher pendant un défilement animé serait perdu.
    const haut = bloc.getBoundingClientRect().top;
    const entete = document.getElementById("entete").offsetHeight;
    if (anime && haut < entete) {
      const racine = document.documentElement;
      racine.style.scrollBehavior = "auto";
      window.scrollBy(0, haut - entete - 8);
      racine.style.scrollBehavior = "";
    }
  };
  if (!anime) return remplir();
  bloc.classList.add("sortie");
  setTimeout(remplir, 300);
}

/* Langue nationale en grand, français en petit dessous */
function afficherTexteScene(s) {
  const textes = s.textes || {};
  const texte = document.getElementById("scene-paragraphe");
  texte.textContent = textes[langue] || textes.fr || "";
  texte.lang = textes[langue] ? langue : "fr";
  const traduction = document.getElementById("scene-traduction");
  traduction.hidden = langue === "fr" || !textes[langue];
  traduction.textContent = traduction.hidden ? "" : textes.fr;
}

/* ---------- Fiche simple ---------- */
/* Le texte complet est découpé en paragraphes sur les lignes vides */
function paragraphes(texte) {
  return String(texte || "").split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
}

function htmlFiche(conte, suivant) {
  const aUnTexte = paragraphes((conte.textes || {}).fr).length > 0;
  const recit = aUnTexte
    ? `<section class="conteneur" aria-label="Le récit">
        <div class="texte-complet">
          ${htmlEcoute("Écouter le récit")}
          <div id="texte-recit"></div>
        </div>
      </section>`
    : "";
  return `
    <section class="conteneur fiche">
      <div class="scene-visuel" id="scene-visuel"></div>
      <div class="fiche-texte">
        <p>${echapper(conte.resume)}</p>
        ${aUnTexte ? "" : `<p class="bientot">La version illustrée scène par scène de ce récit est en préparation.</p>`}
      </div>
    </section>
    ${recit}
    <section class="conteneur">
      <div class="morale">
        <h2>La morale</h2>
        <p>${echapper(conte.morale)}</p>
        <div class="boutons"><a class="bouton" href="conte.html?id=${suivant.id}">Récit suivant : ${echapper(suivant.titre)}</a></div>
      </div>
      <p class="source">Source : ${sourceAvecLiens(conte.source)}</p>
    </section>`;
}

/* Texte de la fiche dans la langue choisie, paragraphe par paragraphe,
   chacun suivi de sa version française en petit */
function remplirFiche(conte) {
  const zoneTexte = document.getElementById("texte-recit");
  if (!zoneTexte) return;
  const textes = conte.textes || {};
  const francais = paragraphes(textes.fr);
  const choisis = langue !== "fr" && textes[langue] ? paragraphes(textes[langue]) : [];
  if (!choisis.length) {
    zoneTexte.innerHTML = francais.map((p) => `<p lang="fr">${echapper(p)}</p>`).join("");
    return;
  }
  zoneTexte.innerHTML = choisis.map((p, k) => `
    <p lang="${langue}">${echapper(p)}</p>
    ${francais[k] ? `<p class="traduction" lang="fr">${echapper(francais[k])}</p>` : ""}`).join("");
}

demarrer();
