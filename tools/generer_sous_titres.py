"""Génère les sous-titres WebVTT de assets/audio/, à partir des MP3 déjà produits
par tools/generer_audio.py et du découpage en phrases de data/contes.json.

Aucun audio n'est resynthétisé : la durée de chaque piste vient de ffprobe sur le
MP3 existant, et chaque phrase reçoit une part de temps proportionnelle à sa
longueur en caractères. La synthèse vocale a un débit quasi constant (voir
tools/generer_audio.py --verifier, qui mesure ce débit entre 0,03 et 0,15 s/lettre),
donc cette approximation reste fidèle sans avoir besoin d'horodatage phrase par phrase.

    python tools/generer_sous_titres.py              génère les .vtt manquants ou périmés
    python tools/generer_sous_titres.py --tout        régénère tous les .vtt
    python tools/generer_sous_titres.py --recit dafra limite le travail à un récit
"""
import argparse
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
DONNEES = RACINE / "data" / "contes.json"
AUDIO = RACINE / "assets" / "audio"

MARGE = 0.08  # pause entre deux sous-titres, pour que le dernier mot ne reste pas affiché


def lire_donnees():
    return json.loads(DONNEES.read_text("utf-8"))


def paragraphes(texte):
    return [p.strip() for p in re.split(r"\n\s*\n", texte) if p.strip()]


def phrases(paragraphe):
    """Découpe en phrases ; un guillemet fermant reste avec sa phrase. (Même règle que generer_audio.py.)"""
    morceaux = re.findall(r".+?(?:[.!?…]+(?:\s*[»”])?(?=\s|$)|$)", paragraphe, re.S)
    return [m.strip() for m in morceaux if m.strip()]


def trouver_ffprobe():
    chemin = shutil.which("ffprobe")
    if not chemin:
        sys.exit("ffprobe introuvable : installez ffmpeg (winget install --id Gyan.FFmpeg -e).")
    return chemin


def unites(donnees, filtre=None):
    """Chaque morceau sous-titré : (récit, numéro de scène ou None, objet qui porte « textes »)."""
    for c in donnees["contes"]:
        if filtre and c["id"] != filtre:
            continue
        if c.get("scenes"):
            for i, s in enumerate(c["scenes"]):
                yield c, i + 1, s
        elif c.get("textes"):
            yield c, None, c


def chemin_audio(conte, numero, code):
    nom = f"{conte['id']}-{numero}-{code}.mp3" if numero else f"{conte['id']}-{code}.mp3"
    return AUDIO / nom


def duree(ffprobe, fichier):
    r = subprocess.run(
        [ffprobe, "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(fichier)],
        capture_output=True, text=True)
    try:
        return float(r.stdout.strip())
    except ValueError:
        return None


def horodatage(secondes):
    secondes = max(0.0, secondes)
    h = int(secondes // 3600)
    m = int((secondes % 3600) // 60)
    s = secondes % 60
    return f"{h:02}:{m:02}:{s:06.3f}"


def cues(texte, duree_totale):
    unites_texte = [phrase for p in paragraphes(texte) for phrase in phrases(p)]
    if not unites_texte or not duree_totale:
        return []
    poids = [len(phrase) for phrase in unites_texte]
    total_poids = sum(poids) or 1
    resultat, t = [], 0.0
    for phrase, poid in zip(unites_texte, poids):
        part = duree_totale * poid / total_poids
        debut = t
        fin = t + part - MARGE if part > MARGE else t + part
        fin = min(duree_totale, max(fin, debut + 0.1))
        resultat.append((debut, fin, phrase))
        t += part
    return resultat


def ecrire_vtt(chemin, cues_liste):
    lignes = ["WEBVTT", ""]
    for debut, fin, texte in cues_liste:
        lignes.append(f"{horodatage(debut)} --> {horodatage(fin)}")
        lignes.append(texte.replace("\n", " "))
        lignes.append("")
    chemin.write_text("\n".join(lignes), "utf-8", newline="\n")


def generer(donnees, filtre, tout, ffprobe):
    fait = ignores = 0
    for conte, numero, porteur in unites(donnees, filtre):
        for code, texte in porteur["textes"].items():
            mp3 = chemin_audio(conte, numero, code)
            vtt = mp3.with_suffix(".vtt")
            if not mp3.exists():
                continue
            if not tout and vtt.exists() and vtt.stat().st_mtime >= mp3.stat().st_mtime:
                ignores += 1
                continue
            d = duree(ffprobe, mp3)
            if not d:
                print(f"!!  {mp3.name} : durée illisible, sous-titres non générés")
                continue
            ecrire_vtt(vtt, cues(texte, d))
            fait += 1
            print(f"sous-titres {vtt.name}")
    print(f"{fait} fichier(s) .vtt généré(s) ou mis à jour, {ignores} déjà à jour."
          if fait or ignores else "Rien à générer (aucun MP3 trouvé).")


def principal():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--tout", action="store_true", help="régénérer même les .vtt à jour")
    p.add_argument("--recit", help="identifiant d'un seul récit")
    args = p.parse_args()
    ffprobe = trouver_ffprobe()
    donnees = lire_donnees()
    generer(donnees, args.recit, args.tout, ffprobe)


if __name__ == "__main__":
    principal()
