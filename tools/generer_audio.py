"""Génère les narrations de synthèse à partir des textes de data/contes.json.

Le texte lu est exactement celui qui s'affiche : tous deux viennent des champs
« textes » de data/contes.json (scenes[i].textes, ou textes du récit).

    python tools/generer_audio.py --traduire   complète les traductions manquantes (NLLB-200), puis génère
    python tools/generer_audio.py              régénère les audios dont le texte a changé
    python tools/generer_audio.py --tout       régénère tous les audios
    python tools/generer_audio.py --verifier   vérifie seulement (fichier présent, à jour, durée cohérente)
    option --recit <id>                        limite le travail à un récit
    option --nettoyer                          supprime les MP3 de assets/audio/ qui ne servent plus

Fichiers produits :
    récit en scènes : assets/audio/<id>-<numéro de scène>-<code langue>.mp3
    fiche simple    : assets/audio/<id>-<code langue>.mp3
    assets/audio/empreintes.json : empreinte du texte de chaque MP3 (sert à repérer un audio périmé)
"""
import argparse, asyncio, hashlib, json, re, shutil, subprocess, sys, tempfile, unicodedata
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
DONNEES = RACINE / "data" / "contes.json"
AUDIO = RACINE / "assets" / "audio"
EMPREINTES = AUDIO / "empreintes.json"

# Langues dans lesquelles chaque scène des récits immersifs est traduite
LANGUES_SCENES = ["mos", "dyu", "ful"]
TRADUCTEUR = "facebook/nllb-200-distilled-600M"
PAUSE_PHRASE, PAUSE_PARAGRAPHE = 0.35, 0.8   # secondes
FREQUENCE, DEBIT = 24000, "64k"
VERSION = "2"  # à changer pour forcer la régénération si les réglages ci-dessus changent


# ---------- Outils ----------
def lire_donnees():
    return json.loads(DONNEES.read_text("utf-8"))


def ecrire_json(fichier, valeur):
    # newline="\n" : pas de fins de ligne Windows, le fichier reste identique d'un poste à l'autre
    fichier.write_text(json.dumps(valeur, ensure_ascii=False, indent=2), "utf-8", newline="\n")


def ecrire_donnees(donnees):
    ecrire_json(DONNEES, donnees)


def paragraphes(texte):
    return [p.strip() for p in re.split(r"\n\s*\n", texte) if p.strip()]


def phrases(paragraphe):
    """Découpe en phrases ; un guillemet fermant reste avec sa phrase."""
    morceaux = re.findall(r".+?(?:[.!?…]+(?:\s*[»”])?(?=\s|$)|$)", paragraphe, re.S)
    return [m.strip() for m in morceaux if m.strip()]


def trouver_ffmpeg():
    for nom in ("ffmpeg", "ffprobe"):
        chemin = shutil.which(nom)
        if not chemin:
            sys.exit(f"{nom} introuvable : installez-le (winget install --id Gyan.FFmpeg -e) puis rouvrez le terminal.")
        yield chemin


def unites(donnees, filtre=None):
    """Chaque morceau à lire : (récit, numéro de scène ou None, objet qui porte « textes »)."""
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


def code_de_langue(donnees, nom):
    return next((k for k, v in donnees["langues"].items() if v["nom"] == nom), None)


def langues_voulues(donnees, conte):
    """Langues dans lesquelles ce récit doit exister, en plus du français."""
    if conte.get("scenes"):
        return list(LANGUES_SCENES)
    code = code_de_langue(donnees, conte.get("langue"))
    return [code] if code and code != "fr" else []


def empreinte(code, voix, texte):
    return hashlib.sha1(json.dumps([VERSION, code, voix, texte], ensure_ascii=False).encode("utf-8")).hexdigest()


# ---------- 1. Traductions ----------
def traduire(donnees, filtre):
    a_faire = []
    for conte, numero, porteur in unites(donnees, filtre):
        for code in langues_voulues(donnees, conte):
            if donnees["langues"][code]["nllb"] and not porteur["textes"].get(code):
                a_faire.append((conte, numero, porteur, code))
    if not a_faire:
        print("Traductions : rien à compléter.")
        return []
    from transformers import AutoModelForSeq2SeqLM, AutoTokenizer
    tok = AutoTokenizer.from_pretrained(TRADUCTEUR, src_lang="fra_Latn")
    modele = AutoModelForSeq2SeqLM.from_pretrained(TRADUCTEUR)

    def une_phrase(phrase, cible, prudent=False):
        entree = tok(phrase, return_tensors="pt")
        sortie = modele.generate(
            **entree, forced_bos_token_id=tok.convert_tokens_to_ids(cible), max_new_tokens=256, max_length=None,
            num_beams=5 if prudent else 4, no_repeat_ngram_size=3, repetition_penalty=1.3 if prudent else 1.0)
        return tok.batch_decode(sortie, skip_special_tokens=True)[0].strip()

    alertes = []
    for conte, numero, porteur, code in a_faire:
        cible = donnees["langues"][code]["nllb"]
        traduits = []
        for paragraphe in paragraphes(porteur["textes"]["fr"]):
            morceaux = []
            for phrase in phrases(paragraphe):
                t = une_phrase(phrase, cible)
                if len(t) > 3 * len(phrase) + 20:  # le modèle part en boucle : on réessaie prudemment
                    t = une_phrase(phrase, cible, prudent=True)
                    if len(t) > 3 * len(phrase) + 20:
                        alertes.append(f"{conte['id']} {numero or ''} {code} : traduction suspecte (trop longue) pour « {phrase} »")
                morceaux.append(t)
            traduits.append(" ".join(morceaux))
        porteur["textes"][code] = "\n\n".join(traduits)
        print(f"traduit {conte['id']} {numero or ''} -> {code}")
    ecrire_donnees(donnees)
    return alertes


# ---------- 2. Voix ----------
class VoixMMS:
    def __init__(self, modele):
        import torch
        from transformers import AutoTokenizer, VitsModel
        self.torch = torch
        self.tok = AutoTokenizer.from_pretrained(modele)
        self.modele = VitsModel.from_pretrained(modele)
        self.vocab = set(self.tok.get_vocab())
        self.frequence = self.modele.config.sampling_rate

    def preparer(self, phrase):
        """Lettres hors alphabet du modèle : accent retiré si possible, sinon signalées."""
        sortie, perdus = [], set()
        for ch in phrase.lower():
            if ch in self.vocab or ch.isspace():
                sortie.append(ch)
            elif unicodedata.category(ch)[0] in "PS":
                sortie.append(" ")  # ponctuation : non prononcée
            else:
                base = unicodedata.normalize("NFD", ch)[0]
                if base in self.vocab:
                    sortie.append(base)
                else:
                    perdus.add(ch)
        return re.sub(r"\s+", " ", "".join(sortie)).strip(), perdus

    def dire(self, phrase, fichier):
        import scipy.io.wavfile
        from transformers import set_seed
        texte, perdus = self.preparer(phrase)
        if not texte:
            return perdus
        set_seed(555)  # même texte -> même audio
        with self.torch.no_grad():
            onde = self.modele(**self.tok(texte, return_tensors="pt")).waveform[0].numpy()
        scipy.io.wavfile.write(fichier, self.frequence, onde)
        return perdus


class VoixEdge:
    def __init__(self, voix):
        import edge_tts
        self.edge_tts, self.voix = edge_tts, voix

    def dire_tout(self, liste):
        async def tout():
            limite = asyncio.Semaphore(4)
            async def une(phrase, fichier):
                async with limite:
                    for essai in range(3):
                        try:
                            return await self.edge_tts.Communicate(phrase, self.voix).save(str(fichier))
                        except Exception:
                            if essai == 2:
                                raise
                            await asyncio.sleep(2)
            await asyncio.gather(*(une(p, f) for p, f in liste))
        asyncio.run(tout())


def charger_voix(langue):
    voix = langue["voix"]
    if voix.startswith("edge-tts "):
        return VoixEdge(voix.split(" ", 1)[1])
    return VoixMMS(voix)


def decoder(ffmpeg, fichier):
    return subprocess.run([ffmpeg, "-v", "error", "-i", str(fichier), "-f", "s16le", "-ac", "1", "-ar", str(FREQUENCE), "-"],
                          check=True, capture_output=True).stdout


def silence(secondes):
    return b"\0\0" * int(FREQUENCE * secondes)


def generer_un(ffmpeg, voix, texte, sortie, temp):
    """Une phrase à la fois, puis assemblage avec de courtes pauses."""
    plan = [(p, k, phrase, temp / f"{p}-{k}.audio") for p, par in enumerate(paragraphes(texte)) for k, phrase in enumerate(phrases(par))]
    perdus = set()
    if isinstance(voix, VoixEdge):
        voix.dire_tout([(phrase, f) for _, _, phrase, f in plan])
    else:
        for _, _, phrase, f in plan:
            perdus |= voix.dire(phrase, f)
    brut, precedent = b"", None
    for p, _, _, f in plan:
        if not f.exists():
            continue
        if precedent is not None:
            brut += silence(PAUSE_PARAGRAPHE if p != precedent else PAUSE_PHRASE)
        brut += decoder(ffmpeg, f)
        precedent = p
    filtre = ("silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.1,areverse,"
              "silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.1,areverse,"
              "loudnorm=I=-16:TP=-1.5:LRA=11")
    subprocess.run([ffmpeg, "-y", "-v", "error", "-f", "s16le", "-ar", str(FREQUENCE), "-ac", "1", "-i", "-",
                    "-af", filtre, "-ar", str(FREQUENCE), "-ac", "1", "-b:a", DEBIT, str(sortie)], input=brut, check=True)
    return sorted(perdus)


def generer(donnees, filtre, tout, ffmpeg):
    AUDIO.mkdir(parents=True, exist_ok=True)
    memo = json.loads(EMPREINTES.read_text("utf-8")) if EMPREINTES.exists() else {}
    voix_chargees = {}
    for conte, numero, porteur in unites(donnees, filtre):
        for code, texte in porteur["textes"].items():
            langue = donnees["langues"][code]
            sortie = chemin_audio(conte, numero, code)
            cle = sortie.name
            e = empreinte(code, langue["voix"], texte)
            if not tout and sortie.exists() and memo.get(cle, {}).get("empreinte") == e:
                continue
            if code not in voix_chargees:
                print(f"chargement de la voix {langue['voix']}")
                voix_chargees[code] = charger_voix(langue)
            with tempfile.TemporaryDirectory() as temp:
                perdus = generer_un(ffmpeg, voix_chargees[code], texte, sortie, Path(temp))
            memo[cle] = {"empreinte": e, "lettres_non_lues": perdus}
            print(f"audio {cle}" + (f"  (lettres hors alphabet de la voix, non lues : {' '.join(perdus)})" if perdus else ""))
            ecrire_json(EMPREINTES, memo)


# ---------- 3. Vérification ----------
def duree(ffprobe, fichier):
    r = subprocess.run([ffprobe, "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(fichier)],
                       capture_output=True, text=True)
    try:
        return float(r.stdout.strip())
    except ValueError:
        return None


def verifier(donnees, filtre, ffprobe):
    memo = json.loads(EMPREINTES.read_text("utf-8")) if EMPREINTES.exists() else {}
    problemes, tableau = [], {}
    for conte, numero, porteur in unites(donnees, filtre):
        ligne = tableau.setdefault(conte["id"], {})
        voulues = ["fr"] + langues_voulues(donnees, conte)
        for code in voulues:
            langue = donnees["langues"][code]
            texte = porteur["textes"].get(code)
            if not texte:
                raison = "pas de traduction automatique (absent de NLLB-200)" if not langue["nllb"] else "traduction manquante"
                ligne[code] = raison
                continue
            sortie = chemin_audio(conte, numero, code)
            ou = f"{conte['id']}{' scène ' + str(numero) if numero else ''} [{code}]"
            d = duree(ffprobe, sortie) if sortie.exists() else None
            lettres = sum(ch.isalpha() for ch in texte)
            seconde_par_lettre = d / lettres if d and lettres else 0
            if not sortie.exists():
                probleme = "fichier absent"
            elif d is None:
                probleme = "fichier illisible"
            elif memo.get(sortie.name, {}).get("empreinte") != empreinte(code, langue["voix"], texte):
                probleme = "audio périmé : le texte a changé depuis la génération"
            elif not 0.03 <= seconde_par_lettre <= 0.15:
                probleme = f"durée incohérente ({d:.1f} s pour {lettres} lettres)"
            else:
                probleme = None
            print(f"{'OK ' if not probleme else '!! '} {ou:34} {d or 0:6.1f} s  {lettres:5} lettres  {seconde_par_lettre:.3f} s/lettre"
                  + (f"  -> {probleme}" if probleme else ""))
            perdus = memo.get(sortie.name, {}).get("lettres_non_lues")
            if perdus:
                print(f"     lettres hors alphabet de la voix, non lues : {' '.join(perdus)}")
            if probleme:
                problemes.append(f"{ou} : {probleme}")
            if ligne.get(code) in (None, "✔"):
                ligne[code] = "✔" if not probleme else probleme
    codes = list(donnees["langues"])
    print("\nRécit".ljust(20) + "".join(donnees["langues"][c]["nom"][:10].ljust(12) for c in codes))
    for id_, ligne in tableau.items():
        print(id_.ljust(19) + "".join(("✔" if ligne.get(c) == "✔" else ("✘" if c in ligne else "·")).ljust(12) for c in codes))
    print("✔ présent et à jour   ✘ voir ci-dessus   · langue non prévue pour ce récit")
    return problemes


def orphelins(donnees):
    attendus = {chemin_audio(c, n, code).name for c, n, p in unites(donnees) for code in p["textes"]}
    return sorted(f for f in AUDIO.glob("*.mp3") if f.name not in attendus)


def principal():
    p = argparse.ArgumentParser(description="Narrations de synthèse des Contes du Faso")
    p.add_argument("--traduire", action="store_true", help="compléter les traductions manquantes avant de générer")
    p.add_argument("--tout", action="store_true", help="régénérer même les audios à jour")
    p.add_argument("--verifier", action="store_true", help="vérifier seulement, sans rien générer")
    p.add_argument("--nettoyer", action="store_true", help="supprimer les MP3 qui ne servent plus")
    p.add_argument("--recit", help="identifiant d'un seul récit")
    args = p.parse_args()
    ffmpeg, ffprobe = trouver_ffmpeg()
    donnees = lire_donnees()

    alertes = []
    if not args.verifier:
        if args.traduire:
            alertes = traduire(donnees, args.recit)
        generer(donnees, args.recit, args.tout, ffmpeg)
    inutiles = orphelins(donnees)
    for f in inutiles:
        if args.nettoyer:
            f.unlink()
        print(("supprimé : " if args.nettoyer else "inutilisé (--nettoyer pour supprimer) : ") + f.name)
    problemes = verifier(donnees, args.recit, ffprobe)
    for a in alertes + problemes:
        print("ATTENTION", a)
    sys.exit(1 if problemes else 0)


if __name__ == "__main__":
    principal()
