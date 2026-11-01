# Environnement Docker pour `tools/generer_audio.py` et `tools/composer_ambiance.py`

Alternative à l'installation locale décrite dans le README principal : tout reste
dans l'image, rien n'est installé sur le poste. Le dépôt est monté tel quel, donc
les MP3 et `data/contes.json` sont modifiés directement sur le disque.

## Construire l'image (une fois)

```powershell
docker build -t contes-burkina-tts -f tools/docker/Dockerfile tools/docker
```

## Utiliser

Depuis la racine du dépôt :

```powershell
docker run --rm -v "${PWD}:/app" -v contes-burkina-tts-cache:/root/.cache contes-burkina-tts --verifier
docker run --rm -v "${PWD}:/app" -v contes-burkina-tts-cache:/root/.cache contes-burkina-tts --traduire
docker run --rm -v "${PWD}:/app" -v contes-burkina-tts-cache:/root/.cache contes-burkina-tts --recit dafra
docker run --rm -v "${PWD}:/app" -v contes-burkina-tts-cache:/root/.cache contes-burkina-tts --nettoyer
```

Le volume `contes-burkina-tts-cache` garde les modèles téléchargés (MMS-TTS,
NLLB-200, ~3 Go) d'un lancement à l'autre.

Pour `tools/composer_ambiance.py` (mêmes dépendances) :

```powershell
docker run --rm -v "${PWD}:/app" --entrypoint python contes-burkina-tts tools/composer_ambiance.py
```
