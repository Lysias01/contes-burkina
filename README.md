# Contes du Faso

Plateforme web multimédia et carte interactive des contes et légendes du Burkina Faso.
Projet du groupe 6, module Web Multimédia 2026. En ligne : https://lysias01.github.io/contes-burkina/

## Fonctionnalités

- **Carte interactive 2D/3D** (MapLibre GL JS) : un point par récit, aperçu et lien vers le récit.
- **Contes, légendes et récits historiques** : 10 récits, dont 3 à lire scène par scène.
- **Illustrations animées** : une illustration SVG animée pour chaque récit.
- **Audio** : les 10 récits se lisent et s'écoutent en français, mooré, dioula et fulfulde (voix de synthèse), avec une musique d'ambiance.
- **Expérience interactive** : choix au milieu du récit, quiz à la fin, balayage sur téléphone.

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
carte.html            carte interactive 2D/3D et liste des récits
conte.html            lecture d'un récit (conte.html?id=yennenga)
apropos.html          équipe, crédits et licences
css/                  style.css (charte commune) + une feuille par page
js/                   app.js (commun : en-tête, musique, données) + un script par page
data/contes.json      les récits, leurs textes dans chaque langue, la liste des langues
data/burkina.geojson  contour du pays (geoBoundaries, CC BY 4.0)
assets/images/        illustrations SVG des récits
assets/icones/        favicon.svg
assets/audio/         narrations MP3 générées, sous-titres .vtt associés, empreintes.json
assets/musique/       musique d'ambiance composée par tools/composer_ambiance.py
tools/                generer_audio.py (traductions et narrations), generer_sous_titres.py (sous-titres .vtt), composer_ambiance.py (musique), docker/ (environnement de génération)
```

## Ajouter ou compléter un récit

Tout se fait dans `data/contes.json` : copier un bloc de la liste `contes`, puis renseigner `id`, `titre`, `type` (`conte`, `legende` ou `historique`), `peuple`, `langue`, `ville`, `lat`, `lng`, `resume`, `morale`, `image`, et `textes` ou `scenes` (`choix` et `quiz` sont facultatifs). Lancer ensuite `python tools/generer_audio.py --traduire`.

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

## Régénérer les sous-titres

Chaque MP3 est accompagné d'un `.vtt` du même nom, affiché en direct sous le bouton d'écoute. Le script lit la durée du MP3 (ffprobe) et répartit le temps entre les phrases selon leur longueur : le calage est donc approximatif. Il suffit d'avoir ffmpeg.

```powershell
python tools/generer_sous_titres.py                 # génère les .vtt manquants ou périmés
python tools/generer_sous_titres.py --recit dafra   # un seul récit
python tools/generer_sous_titres.py --tout          # tout régénérer
```

**Après toute régénération audio**, relancez ce script. Pour générer les narrations sans rien installer sur le poste, voir [tools/docker/README.md](tools/docker/README.md).

## Régénérer la musique d'ambiance

`python tools/composer_ambiance.py` recompose `assets/musique/ambiance.mp3` par synthèse sonore (numpy, scipy et ffmpeg, dans le même environnement que les narrations). Le morceau boucle sans couture ; `--graine 12` (ou un autre nombre) donne une autre variation de la mélodie.

## Technologies

HTML, CSS et JavaScript sans framework ni compilation ; JSON ; SVG ; MapLibre GL JS ; OpenFreeMap ; relief AWS Terrain Tiles ; Meta MMS-TTS et NLLB-200 ; polices Caprasimo et Literata.
