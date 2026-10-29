"""Compose la musique d'ambiance du site par synthèse sonore : assets/musique/ambiance.mp3.

Une veillée calme : mélodie de balafon sur une gamme pentatonique, basse douce,
shaker et djembé très en retrait, grillons et crépitement du feu.

Le morceau est construit de façon circulaire : une note qui dépasse la fin
reprend au début, la réverbération et les bruits de fond sont filtrés dans
le domaine des fréquences (donc périodiques). La boucle est sans couture.

    python tools/composer_ambiance.py                 génère assets/musique/ambiance.mp3
    python tools/composer_ambiance.py --graine 12     une autre variation de la mélodie

Nécessite numpy, scipy et ffmpeg (voir README.md).
"""
import argparse, shutil, subprocess, sys, tempfile
from pathlib import Path

import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, sosfilt

RACINE = Path(__file__).resolve().parent.parent
FREQ = 44100
TEMPO = 86                      # battements par minute
MESURES = 32                    # 32 mesures à 4 temps : environ 89 secondes
TEMPS = 60 / TEMPO
DUREE = MESURES * 4 * TEMPS
N = int(round(DUREE * FREQ))

# Gamme pentatonique mineure de la (la, do, ré, mi, sol), sur deux octaves
GAMME = [57, 60, 62, 64, 67, 69, 72, 74, 76, 79]
# Basse : une mesure par note, sur un cycle de quatre mesures (la, la, sol, mi)
BASSE = [45, 45, 43, 40]


def hz(midi):
    return 440.0 * 2 ** ((midi - 69) / 12)


# ---------- Outils ----------
def ajouter(piste, debut, son):
    """Ajoute un son dans une piste circulaire : ce qui dépasse la fin reprend au début."""
    i = int(debut) % N
    fin = i + len(son)
    if fin <= N:
        piste[i:fin] += son
    else:
        k = N - i
        piste[i:] += son[:k]
        piste[:len(son) - k] += son[k:]


def placer(stereo, debut, son, pan):
    """pan de -1 (gauche) à 1 (droite), loi à puissance constante."""
    angle = (pan + 1) * np.pi / 4
    ajouter(stereo[0], debut, son * np.cos(angle))
    ajouter(stereo[1], debut, son * np.sin(angle))


def filtre_frequentiel(signal, gain):
    """Filtrage circulaire par FFT : gain(fréquences) -> coefficient."""
    spectre = np.fft.rfft(signal)
    spectre *= gain(np.fft.rfftfreq(len(signal), 1 / FREQ))
    return np.fft.irfft(spectre, len(signal))


def passe_bande(signal, bas, haut, ordre=2):
    return sosfilt(butter(ordre, [bas, haut], btype="band", fs=FREQ, output="sos"), signal)


def enveloppe_attaque(n, ms=2):
    k = max(1, int(FREQ * ms / 1000))
    env = np.ones(n)
    env[:k] = 0.5 - 0.5 * np.cos(np.linspace(0, np.pi, k))
    return env


# ---------- Instruments ----------
def lame_balafon(freq, force, alea):
    """Une lame de balafon : modes de la lame en bois, choc de la mailloche, bourdonnement de la calebasse."""
    duree = 1.6
    t = np.arange(int(duree * FREQ)) / FREQ
    # (rapport de fréquence, amplitude, durée de résonance en secondes) : bois, résonance courte
    modes = [(1.0, 1.0, 0.42), (2.0, 0.10, 0.22), (3.93, 0.32, 0.11), (9.2, 0.07, 0.04)]
    son = sum(a * np.exp(-t / d) * np.sin(2 * np.pi * freq * r * t + alea.uniform(0, 6.28)) for r, a, d in modes)
    # Calebasse : la membrane fait légèrement vibrer le son (bourdonnement)
    bruit = passe_bande(alea.standard_normal(len(t)), 90, 320)
    bruit /= np.abs(bruit).max() + 1e-9
    son += 0.10 * np.exp(-t / 0.18) * np.sin(2 * np.pi * freq * t) * bruit
    # Choc de la mailloche : bref bruit filtré
    k = int(0.008 * FREQ)
    clic = passe_bande(alea.standard_normal(k), 1500, 5000) * np.exp(-np.arange(k) / (0.0015 * FREQ))
    son[:k] += 0.35 * clic
    return force * son * enveloppe_attaque(len(t))


def note_basse(freq, duree, force):
    t = np.arange(int(duree * FREQ)) / FREQ
    son = np.sin(2 * np.pi * freq * t) + 0.25 * np.sin(4 * np.pi * freq * t) + 0.08 * np.sin(6 * np.pi * freq * t)
    env = np.minimum(1, t / 0.03) * np.exp(-t / (duree * 0.55))
    return force * son * env


def shaker(alea, force):
    k = int(0.05 * FREQ)
    son = passe_bande(alea.standard_normal(k), 5000, 12000)
    env = np.minimum(1, np.arange(k) / (0.008 * FREQ)) * np.exp(-np.arange(k) / (0.012 * FREQ))
    return force * son * env


def djembe(grave, force):
    t = np.arange(int(0.35 * FREQ)) / FREQ
    f0 = 80 if grave else 210
    frequence = f0 * (1 + 0.5 * np.exp(-t / 0.02))   # la hauteur chute juste après la frappe
    phase = 2 * np.pi * np.cumsum(frequence) / FREQ
    return force * np.sin(phase) * np.exp(-t / (0.16 if grave else 0.08)) * enveloppe_attaque(len(t), 1)


def stridulation(freq, alea):
    """Un chant de grillon : trois impulsions rapides."""
    son = np.zeros(int(0.14 * FREQ))
    for k in range(3):
        n = int(0.018 * FREQ)
        t = np.arange(n) / FREQ
        debut = int(k * 0.038 * FREQ)
        son[debut:debut + n] += np.sin(2 * np.pi * freq * t) * np.hanning(n)
    return son * alea.uniform(0.6, 1.0)


def crepitement(alea):
    n = int(alea.uniform(0.002, 0.006) * FREQ)
    return passe_bande(alea.standard_normal(n), 800, 6000) * np.exp(-np.arange(n) / (0.001 * FREQ))


# ---------- Composition ----------
def composer_motif(alea):
    """Motif de deux mesures (16 croches) : marche aléatoire sur la gamme, avec silences."""
    motif, degre = [], 4
    for pas in range(16):
        jouer = alea.random() < (0.75 if pas % 2 == 0 else 0.35)
        if pas in (7, 15):          # respiration en fin de mesure
            jouer = alea.random() < 0.2
        if jouer:
            degre = int(np.clip(degre + alea.choice([-2, -1, -1, 0, 1, 1, 2]), 1, 8))
            motif.append((pas, degre))
    return motif


def varier(motif, alea, intensite):
    """Variation : quelques notes déplacées, ajoutées ou retirées, parfois transposées."""
    transpo = alea.choice([0, 0, 1, -1, 2]) if intensite > 0.5 else 0
    resultat = []
    for pas, degre in motif:
        if alea.random() < 0.15 * intensite:
            continue
        if alea.random() < 0.3 * intensite:
            degre += alea.choice([-1, 1])
        resultat.append((pas, int(np.clip(degre + transpo, 0, 9))))
    for _ in range(int(2 * intensite)):
        pas = int(alea.integers(0, 16))
        if pas not in [p for p, _ in resultat]:
            resultat.append((pas, int(alea.integers(2, 8))))
    return sorted(resultat)


def composer(graine):
    alea = np.random.default_rng(graine)
    bus_melodie = np.zeros((2, N))
    bus_basse = np.zeros((2, N))
    bus_percu = np.zeros((2, N))
    bus_nuit = np.zeros((2, N))
    croche = TEMPS / 2

    # Mélodie : 8 phrases de 4 mesures (motif A et réponse B), toujours variées
    motif_a, motif_b = composer_motif(alea), composer_motif(alea)
    plan = [("a", 0.2), ("b", 0.3), ("a", 0.6), ("b", 0.7), ("calme", 0), ("a", 0.5), ("b", 0.9), ("a", 0.8)]
    for phrase, (nom, intensite) in enumerate(plan):
        for moitie in range(2):
            debut_mesure = (phrase * 4 + moitie * 2) * 4 * TEMPS
            if nom == "calme":
                notes = [(p, d) for p, d in varier(motif_a, alea, 0.3) if p % 4 == 0]   # phrase dépouillée
            else:
                notes = varier(motif_a if nom == "a" else motif_b, alea, intensite + 0.2 * moitie)
            if moitie == 1 and notes:                                                  # la réponse se pose sur la tonique
                notes[-1] = (notes[-1][0], 5 if alea.random() < 0.6 else 3)
            for pas, degre in notes:
                t = debut_mesure + pas * croche + alea.normal(0, 0.008)
                force = alea.uniform(0.55, 0.9) * (1.0 if pas % 4 == 0 else 0.8)
                placer(bus_melodie, t * FREQ, lame_balafon(hz(GAMME[degre]), force, alea), alea.uniform(-0.25, 0.25))
                if alea.random() < 0.18 and degre + 5 < len(GAMME):                    # octave jouée à deux mailloches
                    placer(bus_melodie, (t + 0.012) * FREQ, lame_balafon(hz(GAMME[degre + 5]), force * 0.45, alea), 0.3)
                if alea.random() < 0.06:                                               # roulement bref
                    for r in (1, 2):
                        placer(bus_melodie, (t + r * 0.07) * FREQ, lame_balafon(hz(GAMME[degre]), force * 0.5 / r, alea), 0)

    # Second balafon : ostinato grave et discret, absent des phrases 1 et 5
    ostinato = [(0, 0), (3, 3), (6, 1), (8, 0), (11, 3), (14, 2)]
    for mesure in range(0, MESURES, 2):
        if mesure // 4 in (0, 4):
            continue
        for pas, degre in ostinato:
            t = mesure * 4 * TEMPS + pas * croche + alea.normal(0, 0.006)
            placer(bus_melodie, t * FREQ, lame_balafon(hz(GAMME[degre] - 12), alea.uniform(0.25, 0.35), alea), -0.55)

    # Basse douce
    for mesure in range(MESURES):
        f = hz(BASSE[mesure % 4])
        placer(bus_basse, mesure * 4 * TEMPS * FREQ, note_basse(f, 2.6 * TEMPS, 0.55), 0)
        placer(bus_basse, (mesure * 4 + 2.5) * TEMPS * FREQ, note_basse(f * 1.5, 1.2 * TEMPS, 0.25), 0)

    # Shaker et djembé, très en retrait, absents de la phrase calme
    for mesure in range(MESURES):
        if mesure // 4 == 4:
            continue
        for pas in range(8):
            accent = 1.0 if pas % 2 else 0.55
            placer(bus_percu, (mesure * 4 * TEMPS + pas * croche + alea.normal(0, 0.005)) * FREQ, shaker(alea, 0.1 * accent), 0.35)
        if mesure % 2 == 0:
            placer(bus_percu, mesure * 4 * TEMPS * FREQ, djembe(True, 0.35), -0.1)
        placer(bus_percu, (mesure * 4 + 2.5) * TEMPS * FREQ, djembe(False, 0.12), 0.15)
        if alea.random() < 0.4:
            placer(bus_percu, (mesure * 4 + 3) * TEMPS * FREQ, djembe(False, 0.08), 0.15)

    # Nuit de veillée : trois grillons, crépitement du feu, souffle grave
    for freq_grillon, pan in ((4300, -0.7), (4800, 0.6), (5200, 0.1)):
        t = alea.uniform(0, 1)
        while t < DUREE:
            if alea.random() < 0.85:
                placer(bus_nuit, t * FREQ, stridulation(freq_grillon, alea) * 0.04, pan)
            t += alea.uniform(0.55, 1.1)
    t = 0.0
    while t < DUREE:
        placer(bus_nuit, t * FREQ, crepitement(alea) * alea.uniform(0.02, 0.08), alea.uniform(-0.6, 0.2))
        t += alea.exponential(0.22)
    for canal in range(2):
        bus_nuit[canal] += 0.006 * filtre_frequentiel(alea.standard_normal(N), lambda f: (f > 30) / (1 + (f / 250) ** 2))

    # Réverbération circulaire (pièce boisée en plein air : courte et douce)
    duree_rev = int(1.4 * FREQ)
    t = np.arange(duree_rev) / FREQ
    mix = np.zeros((2, N))
    for canal in range(2):
        rep = np.zeros(N)
        rep[:duree_rev] = alea.standard_normal(duree_rev) * np.exp(-t / 0.35)
        rep = filtre_frequentiel(rep, lambda f: 1 / (1 + (f / 4000) ** 2))
        rep /= np.sqrt(np.sum(rep ** 2))
        sec = bus_melodie[canal] + 0.8 * bus_basse[canal]
        humide = np.fft.irfft(np.fft.rfft(sec) * np.fft.rfft(rep), N)
        mix[canal] = 0.75 * bus_melodie[canal] + 0.55 * bus_basse[canal] + 0.6 * bus_percu[canal] + bus_nuit[canal] + 0.22 * humide

    # Volume : un seul gain pour tout le morceau (pas de saut au point de boucle)
    mix -= mix.mean(axis=1, keepdims=True)
    efficace = np.sqrt(np.mean(mix ** 2))
    gain = min(10 ** (-20 / 20) / efficace, 0.89 / np.abs(mix).max())
    return (mix * gain).astype(np.float32)


def principal():
    p = argparse.ArgumentParser(description="Musique d'ambiance des Contes du Faso")
    p.add_argument("--graine", type=int, default=7, help="graine de la mélodie (même graine = même morceau)")
    p.add_argument("--sortie", default=str(RACINE / "assets" / "musique" / "ambiance.mp3"))
    args = p.parse_args()
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        sys.exit("ffmpeg introuvable : installez-le (winget install --id Gyan.FFmpeg -e) puis rouvrez le terminal.")
    stereo = composer(args.graine)
    with tempfile.TemporaryDirectory() as temp:
        wav = Path(temp) / "ambiance.wav"
        wavfile.write(wav, FREQ, stereo.T)
        subprocess.run([ffmpeg, "-y", "-v", "error", "-i", str(wav), "-c:a", "libmp3lame", "-b:a", "128k", "-ac", "2", args.sortie], check=True)
    taille = Path(args.sortie).stat().st_size
    print(f"{args.sortie} : {DUREE:.1f} s, {TEMPO} BPM, {taille / 1024 / 1024:.2f} Mo")


if __name__ == "__main__":
    principal()
