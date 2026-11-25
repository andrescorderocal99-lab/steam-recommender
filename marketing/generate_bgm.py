"""Genera marketing/bgm.mp3: 30 s de fondo instrumental lo-fi / synthwave suave en bucle perfecto.

Uso:
    python marketing/generate_bgm.py
    python marketing/generate_bgm.py --seed 7 --out marketing/bgm.mp3

Pensado para sonar al ~12 % por debajo de la voz: acordes cálidos (Fmaj7 - G6 - Em7 - Am9),
bajo redondo, un arpegio suave con eco y un bombo muy ligero que "bombea" el pad.
Sin agudos: todo se filtra por debajo de ~4,5 kHz. Las colas de cada nota se pliegan al
principio del archivo, así que el final enlaza sin corte con el inicio.

Requiere numpy y ffmpeg en el PATH.
"""
from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
import tempfile
import wave
from pathlib import Path

import numpy as np

SR = 44100
BPM = 96
BEAT = 60 / BPM                 # 0,625 s
BAR = 4 * BEAT                  # 2,5 s
BARS = 12                       # 12 compases = 30 s exactos -> bucle limpio
LENGTH = int(round(BARS * BAR * SR))

# (notas del pad en MIDI, raíz del bajo en MIDI)
PROGRESSION = [
    ([53, 57, 60, 64], 41),       # Fmaj7
    ([55, 59, 62, 64], 43),       # G6
    ([52, 55, 59, 62], 40),       # Em7
    ([57, 60, 64, 67, 71], 45),   # Am9 (sin raíz grave en el pad)
]


def hz(midi: float) -> float:
    return 440.0 * 2 ** ((midi - 69) / 12)


def place(buf: np.ndarray, sig: np.ndarray, start: float) -> None:
    """Suma `sig` a `buf` desde `start` (s); lo que sobra por el final vuelve al principio."""
    i = int(round(start * SR)) % len(buf)
    while len(sig):
        n = min(len(sig), len(buf) - i)
        buf[i:i + n] += sig[:n]
        sig, i = sig[n:], 0


def env_adsr(n: int, a: float, r: float) -> np.ndarray:
    t = np.arange(n) / SR
    dur = n / SR
    e = np.minimum(1.0, t / a)
    tail = np.clip((dur - t) / r, 0, 1)
    return e * tail


def pad_note(freq: float, dur: float, rng: np.random.Generator) -> np.ndarray:
    """Pad cálido: 3 osciladores desafinados con armónicos que caen rápido (tipo saw muy filtrada)."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    out = np.zeros(n)
    for cents in (-7, 0, 7):
        f = freq * 2 ** (cents / 1200)
        for k in range(1, 7):
            if f * k > 2500:
                break
            amp = (1 / k) * np.exp(-0.45 * (k - 1))
            out += amp * np.sin(2 * np.pi * f * k * t + rng.uniform(0, 2 * np.pi))
    # vibrato de amplitud lento para que respire
    out *= 1 + 0.06 * np.sin(2 * np.pi * 0.25 * t + rng.uniform(0, 2 * np.pi))
    return out * env_adsr(n, a=0.6, r=0.9)


def bass_note(freq: float, dur: float) -> np.ndarray:
    n = int(dur * SR)
    t = np.arange(n) / SR
    sig = np.sin(2 * np.pi * freq * t) + 0.25 * np.sin(2 * np.pi * 2 * freq * t)
    return sig * np.exp(-t / 0.9) * env_adsr(n, a=0.012, r=0.08)


def pluck(freq: float, dur: float = 0.6) -> np.ndarray:
    n = int(dur * SR)
    t = np.arange(n) / SR
    sig = np.sin(2 * np.pi * freq * t) + 0.18 * np.sin(2 * np.pi * 2 * freq * t)
    return sig * np.exp(-t / 0.22) * env_adsr(n, a=0.006, r=0.05)


def kick(dur: float = 0.45) -> np.ndarray:
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = 45 + 70 * np.exp(-t / 0.035)          # barrido 115 -> 45 Hz
    phase = 2 * np.pi * np.cumsum(f) / SR
    return np.sin(phase) * np.exp(-t / 0.13)


def render(seed: int) -> np.ndarray:
    rng = np.random.default_rng(seed)
    pad = np.zeros(LENGTH)
    bass = np.zeros(LENGTH)
    arp = np.zeros(LENGTH)
    drums = np.zeros(LENGTH)

    for bar in range(BARS):
        notes, root = PROGRESSION[bar % len(PROGRESSION)]
        t0 = bar * BAR
        # pad: se solapa 0,9 s con el siguiente acorde (sin clics entre acordes)
        for m in notes:
            place(pad, pad_note(hz(m), BAR + 0.9, rng), t0)
        # bajo: tiempos 1 y 3, y una síncopa suave en el "y" del 4
        for beat, vel in ((0, 1.0), (2, 0.8), (3.5, 0.5)):
            place(bass, vel * bass_note(hz(root), BEAT * 1.6), t0 + beat * BEAT)
        # arpegio en corcheas una octava arriba, subiendo y bajando
        tones = [m + 12 for m in notes[:4]]
        pattern = tones + tones[-2:0:-1] + tones[:2]
        for step in range(8):
            vel = 0.55 + 0.25 * rng.random() + (0.2 if step % 2 == 0 else 0)
            place(arp, vel * pluck(hz(pattern[step % len(pattern)])), t0 + step * BEAT / 2)
        # bombo muy ligero en 1 y 3
        for beat in (0, 2):
            place(drums, kick(), t0 + beat * BEAT)

    # eco del arpegio a corchea con puntillo (también circular)
    delayed = np.zeros(LENGTH)
    for k, g in ((1, 0.35), (2, 0.15)):
        delayed += g * np.roll(arp, int(round(k * 0.75 * BEAT * SR)))
    arp += delayed

    # "sidechain": el pad baja un poco con cada pulso de negra
    t = (np.arange(LENGTH) / SR) % BEAT
    pump = 1 - 0.28 * np.exp(-t / 0.16)

    def norm(x: np.ndarray) -> np.ndarray:
        return x / (np.max(np.abs(x)) or 1)

    mix = (0.50 * norm(pad) * pump + 0.42 * norm(bass) + 0.20 * norm(arp) + 0.30 * norm(drums))

    # estéreo: el arpegio y su eco se abren un poco
    left = mix + 0.06 * norm(np.roll(arp, int(0.011 * SR)))
    right = mix + 0.06 * norm(np.roll(arp, int(0.017 * SR)))
    stereo = np.stack([left, right], axis=1)
    # volumen por RMS (~-18 dBFS), con el pico limitado a -1 dBFS
    gain = min(10 ** (-18 / 20) / np.sqrt(np.mean(stereo ** 2)), 0.89 / np.max(np.abs(stereo)))
    return stereo * gain


def write_wav(path: Path, data: np.ndarray) -> None:
    pcm = (np.clip(data, -1, 1) * 32767).astype("<i2")
    with wave.open(str(path), "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


def main() -> None:
    ap = argparse.ArgumentParser(description="Genera la música de fondo de los Shorts")
    ap.add_argument("--out", type=Path, default=Path(__file__).resolve().parent / "bgm.mp3")
    ap.add_argument("--seed", type=int, default=1)
    args = ap.parse_args()

    if not shutil.which("ffmpeg"):
        sys.exit("[x] 'ffmpeg' no está en el PATH.")

    audio = render(args.seed)
    with tempfile.TemporaryDirectory() as tmp:
        wav = Path(tmp) / "bgm.wav"
        # se filtran 3 vueltas seguidas y se queda la del medio: así los filtros llegan
        # "calientes" al inicio y el empalme final -> inicio sigue siendo continuo
        write_wav(wav, np.tile(audio, (3, 1)))
        loop = LENGTH / SR
        r = subprocess.run(
            ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(wav),
             "-af", f"highpass=f=32,lowpass=f=4500,atrim=start={loop}:end={2 * loop},asetpts=N/SR/TB",
             "-ar", str(SR), "-c:a", "libmp3lame", "-b:a", "192k", str(args.out)],
            capture_output=True, text=True)
        if r.returncode != 0:
            sys.exit(f"[x] ffmpeg: {r.stderr.strip()}")
    print(f"[ok] {args.out}  ({LENGTH / SR:.1f}s, {BPM} BPM)")


if __name__ == "__main__":
    main()
