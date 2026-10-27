/* =========================================================
   bibliotheque.js — liste des récits, recherche et filtres
   ========================================================= */

let tous = [];
let typeChoisi = "";

/* Ignore accents et majuscules : « loropeni » trouve « Loropéni » */
const normaliser = (t) => String(t).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

function afficher() {
  const requete = normaliser(document.getElementById("recherche").value.trim());
  const resultat = tous.filter((c) => {
    const texte = normaliser([c.titre, c.ville, c.peuple, c.langue, c.resume].join(" "));
    return (!typeChoisi || c.type === typeChoisi) && (!requete || texte.includes(requete));
  });

  document.getElementById("compteur").textContent =
    resultat.length > 1 ? `${resultat.length} récits` : resultat.length === 1 ? "1 récit" : "";

  const grille = document.getElementById("grille");
  if (!resultat.length) {
    grille.innerHTML = `<li class="message">Aucun récit ne correspond à « ${echapper(document.getElementById("recherche").value)} ». Essayez un nom de ville ou de peuple.</li>`;
    return;
  }
  grille.innerHTML = resultat.map((c) => `
    <li class="fiche-recit">
      <a href="conte.html?id=${c.id}">
        <div class="visuel">${visuelConte(c)}</div>
        ${pastilleType(c.type)}
        <h2>${echapper(c.titre)}</h2>
        <p class="lieu">${echapper(c.ville)}, ${echapper(c.langue)}</p>
        <p class="resume">${echapper(c.resume)}</p>
      </a>
    </li>`).join("");
}

async function demarrer() {
  try {
    tous = await chargerContes();
  } catch (erreur) {
    document.getElementById("grille").innerHTML = `<li class="message">Les récits n'ont pas pu être chargés : ${echapper(erreur.message)}.</li>`;
    return;
  }
  document.getElementById("recherche").addEventListener("input", afficher);
  document.querySelectorAll(".onglet").forEach((o) => o.addEventListener("click", () => {
    typeChoisi = o.dataset.type;
    document.querySelectorAll(".onglet").forEach((x) => x.setAttribute("aria-pressed", String(x === o)));
    afficher();
  }));
  afficher();
}

demarrer();
