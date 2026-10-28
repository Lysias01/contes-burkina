# Contes du Faso

Plateforme web multimédia et carte interactive des contes et légendes du Burkina Faso.
Projet du groupe 6, module Web Multimédia 2026. En ligne : https://lysias01.github.io/contes-burkina/

## Fonctionnalités

- **Accueil** : une veillée animée sous le baobab (ciel étoilé, feu, parallaxe) et trois récits mis en avant.
- **Carte interactive 2D/3D** (MapLibre GL JS) : un point par récit, coloré selon le type ; aperçu avec résumé et lien ; filtres par type et par langue ; vue 3D avec relief. Au doigt : glisser pour déplacer, pincer pour zoomer.
- **Bibliothèque** : les 10 récits, recherche sans tenir compte des accents, filtres par type.
- **Lecture scène par scène** pour trois récits immersifs : illustrations SVG animées avec parallaxe, navigation par boutons, clavier (flèches) ou balayage sur téléphone, un choix interactif au milieu du récit et un quiz de trois questions à la fin.
- **Langues** : chaque récit se lit et s'écoute en français et, quand la traduction automatique le permet, en mooré, dioula ou fulfulde. La langue nationale s'affiche en grand, la traduction française en petit dessous. Le texte lu par la voix de synthèse est exactement le texte affiché.
- **Musique d'ambiance** facultative (bouton dans l'en-tête), jamais lancée sans geste de l'utilisateur, plus discrète pendant les narrations.
- **Pensé pour le téléphone** : zones tactiles de 44 px minimum, encoches respectées, aucune lecture automatique, `prefers-reduced-motion` respecté, utilisable entièrement au clavier.
- **Partage** : favicon, icône d'écran d'accueil, aperçu Open Graph (WhatsApp, réseaux sociaux), page 404.

## Lancer le site sur son ordinateur

Le site lit ses données dans `data/contes.json` : il doit être servi par un petit serveur, pas ouvert en double-cliquant sur le fichier.

- **VS Code** : installer l'extension _Live Server_, clic droit sur `index.html` puis _Open with Live Server_.
- **Ou en ligne de commande** : `python -m http.server 8000` dans ce dossier, puis ouvrir http://localhost:8000

## Mettre en ligne (GitHub Pages)

1. Créer un dépôt public sur GitHub, par exemple `contes-burkina`.
2. Y envoyer tout le contenu de ce dossier (bouton _Add file > Upload files_, ou `git push`).
3. _Settings > Pages_ : Source = _Deploy from a branch_, branche `main`, dossier `/ (root)`.
4. Le site est en ligne après une minute à l'adresse `https://<votre-compte>.github.io/contes-burkina/`.

## Structure

```
index.html            accueil (veillée animée)
carte.html            carte interactive 2D/3D
conte.html            lecture d'un récit (conte.html?id=yennenga)
bibliotheque.html     tous les récits, recherche et filtres
apropos.html          démarche, équipe, technologies, crédits
404.html              page « introuvable » (servie par GitHub Pages)
css/                  style.css (charte commune) + une feuille par page
js/                   app.js (commun : en-tête, musique, données) + un script par page
data/contes.json      les récits, leurs textes dans chaque langue, la liste des langues
data/burkina.geojson  contour du pays
assets/images/        illustrations SVG des récits, image de partage (partage.jpg)
assets/icones/        favicon.svg, apple-touch-icon.png
assets/audio/         narrations MP3 générées + empreintes.json
assets/musique/       musique d'ambiance (ambiance.mp3)
tools/                generer_audio.py (traductions et narrations de synthèse)
verifications.md      faits à vérifier pour chaque récit
```

## Ajouter ou compléter un récit

Tout se fait dans `data/contes.json`, sans toucher au code. Copiez un bloc existant de la liste `contes`, puis :

- `id` : identifiant unique sans accent ni espace (il sert dans l'adresse `conte.html?id=…` et dans le nom des audios).
- `titre`, `resume`, `morale`, `source`, `ville`, `peuple` : textes affichés.
- `langue` : nom de la langue du récit, tel qu'il figure dans `langues` (par exemple `Mooré`).

- `type` : `conte`, `legende` ou `historique` (couleur du point sur la carte).
- `lat` / `lng` : position sur la carte.
- `scenes` : liste de `{ "titre", "textes", "image" }`. Si elle est vide, le récit s'affiche en fiche simple et son texte est dans `textes` au niveau du récit.
- `textes` : une entrée par code de langue de `langues` (en haut du fichier), par exemple `{ "fr": "…", "mos": "…" }`. Paragraphes séparés par une ligne vide. C'est ce texte qui s'affiche **et** qui est lu par la voix de synthèse.
- `image` : chemin d'une illustration ; sans image, une illustration de nuit est générée automatiquement.
- `choix` (sur une scène) et `quiz` (sur le récit) : facultatifs, voir les récits immersifs pour le format.
- `a_verifier` : passer à `false` une fois les faits vérifiés sur deux sources.

Ensuite, lancez `python tools/generer_audio.py --traduire` (voir ci-dessous) pour créer les traductions et les audios du nouveau récit, puis `python -m http.server 8000` pour le vérifier.

## Régénérer les narrations audio

Les MP3 de `assets/audio/` sont produits à partir des `textes` de `data/contes.json` : le texte lu est toujours celui qui s'affiche. **Après avoir modifié un texte, relancez le script**, sinon l'audio ne correspond plus.

Voix : Meta MMS-TTS pour le mooré, le dioula et le fulfulde ; voix française Microsoft `fr-FR-HenriNeural` (via edge-tts, connexion Internet nécessaire). Traductions : NLLB-200 (mooré, dioula, fulfulde seulement).

**Installation (une seule fois)**, avec Python 3.10 ou plus récent et ffmpeg (`winget install --id Gyan.FFmpeg -e`) :

```powershell
python -m venv $env:USERPROFILE\.venvs\contes-faso
& $env:USERPROFILE\.venvs\contes-faso\Scripts\Activate.ps1
pip install torch --index-url https://download.pytorch.org/whl/cpu
pip install transformers scipy sentencepiece edge-tts
```

L'environnement est volontairement hors du projet (plusieurs Go). Au premier lancement, les modèles sont téléchargés (environ 3 Go).

**Utilisation**, depuis le dossier du projet, environnement activé :

```powershell
python tools/generer_audio.py                 # régénère les audios dont le texte a changé
python tools/generer_audio.py --traduire      # complète d'abord les traductions manquantes
python tools/generer_audio.py --verifier      # vérifie seulement : fichier présent, à jour, durée cohérente
python tools/generer_audio.py --recit dafra   # un seul récit
python tools/generer_audio.py --tout          # tout régénérer
python tools/generer_audio.py --nettoyer      # supprime les MP3 qui ne servent plus
```

Si vous modifiez un texte français, mettez aussi à jour (ou supprimez) ses traductions : `--traduire` ne complète que les traductions **absentes**, pour ne jamais écraser une traduction relue. `assets/audio/empreintes.json` garde l'empreinte du texte de chaque MP3 ; `--verifier` signale tout audio périmé.

## Technologies

HTML, CSS et JavaScript sans framework ni étape de compilation ; JSON pour les données ; SVG pour les illustrations ; MapLibre GL JS pour la carte ; fond de carte OpenFreeMap ; relief AWS Terrain Tiles ; Meta MMS-TTS et NLLB-200 pour les voix et les traductions ; polices Gloock et Literata ; hébergement GitHub Pages. Détail et crédits : page À propos.
