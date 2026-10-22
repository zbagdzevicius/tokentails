#!/usr/bin/env python3
"""Beat analysis for the Moon Rave second track: MP3 -> raw beat map JSON.

Usage: beatmap.py SRC.mp3 OUT.json [--keep-tmp]

Takes about 45 s and 7.5 GB of RAM for the 62-minute mix.

This is the scratch analysis chain (a1 a6 a9 b1 hires refine2 build) merged into one script.
Only the stages that feed the output are kept. Intermediate arrays live in a temp dir.

Timeline: the source MP3 has one corrupt frame at 300.697 s that ffmpeg drops (1152 samples),
which would put every later beat 26 ms early. The 44.1 kHz decode used for beat placement
therefore runs with `-af aresample=async=1:min_hard_comp=0.01:first_pts=0`, which puts the
missing samples back as silence. The output is in that corrected timeline; it is recorded
under `timeline`. The 22.05 kHz decode only feeds coarse features (global beat phase,
per-second loudness, kick presence), as in the original analysis.

The pinned result is scripts/track/back-on-track-v1.raw.json; track-split.mjs reads that,
so the split never needs Python.
"""
import json, os, shutil, subprocess, sys, tempfile
import numpy as np
import librosa
from scipy.ndimage import median_filter, uniform_filter1d

AF = 'aresample=async=1:min_hard_comp=0.01:first_pts=0'
GAP_AT = 300.697
GAP_SAMPLES = 1152


def decode(src, sr, af=None):
    cmd = ['ffmpeg', '-v', 'error', '-i', src]
    if af:
        cmd += ['-af', af]
    cmd += ['-ac', '1', '-ar', str(sr), '-f', 's16le', '-']
    raw = subprocess.run(cmd, capture_output=True, check=True).stdout
    return (np.frombuffer(raw, np.int16).astype(np.float32) / 32768.0)


def decode_f32(src, sr, af=None):
    cmd = ['ffmpeg', '-v', 'error', '-i', src]
    if af:
        cmd += ['-af', af]
    cmd += ['-f', 'f32le', '-ac', '1', '-ar', str(sr), '-']
    raw = subprocess.run(cmd, capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32)


def log(*a):
    print(*a, file=sys.stderr, flush=True)


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    if len(args) != 2:
        sys.exit('usage: beatmap.py SRC.mp3 OUT.json')
    src, out_path = args
    tmp = tempfile.mkdtemp(prefix='bot-beatmap-')

    # ---- stage 1: coarse features at 22.05 kHz (a1, a6, a9) ----
    sr = 22050; hop = 256; fr = sr / hop
    y = decode(src, sr)
    log('22k samples', len(y), len(y) / sr)
    S1 = np.abs(librosa.stft(y, n_fft=1024, hop_length=hop))
    rms = librosa.feature.rms(S=S1, frame_length=1024)[0].astype(np.float32)
    del S1
    S2 = np.abs(librosa.stft(y, n_fft=2048, hop_length=hop)).astype(np.float32)
    f = librosa.fft_frequencies(sr=sr, n_fft=2048)
    sub_e = S2[(f >= 25) & (f < 65)].sum(0)
    del S2, y
    L = np.log1p(sub_e / (np.median(sub_e) + 1e-9) * 10)
    d = np.maximum(0, np.diff(L, prepend=L[0]))
    sub_on = d / (uniform_filter1d(d, int(8 * fr)) + 1e-9)
    n = len(rms); nsec = int(n / fr)

    def per_sec(a):
        return np.array([a[int(i * fr):int((i + 1) * fr)].mean() for i in range(nsec)])
    Rsec = 20 * np.log10(per_sec(rms) + 1e-6)
    Ssec = 10 * np.log10(per_sec(sub_e) + 1e-6)
    np.savez(os.path.join(tmp, 'coarse.npz'), rms=rms, sub_e=sub_e, sub_on=sub_on, R=Rsec, S=Ssec)
    log('coarse done')

    # ---- stage 2: global beat phase from the sub-band onset (b1) ----
    B0 = 145.05; P0 = 60 / B0
    x = np.arange(len(sub_on)); phs = np.arange(0, P0, 0.001)
    ks = np.arange(int(90 / P0), int(3730 / P0))
    sel = ks[(Ssec > 18)[np.clip((ks * P0).astype(int), 0, len(Ssec) - 1)]]
    v = np.array([np.interp((sel * P0 + ph) * fr, x, sub_on).mean() for ph in phs])
    ph_sub = float(phs[v.argmax()])
    log('ph_sub', ph_sub)

    # ---- stage 3: high-res onset envelope at 44.1 kHz on the corrected timeline (hires) ----
    sr44 = 44100; hop44 = 64; dt = hop44 / sr44
    y44 = decode_f32(src, sr44, AF)
    total = len(y44); DUR = total / sr44
    log('44k samples (gap-filled)', total, DUR)
    C = 41344 * 64; pad = 2048; parts = []
    for s in range(0, total, C):
        a = max(0, s - pad); b = min(total, s + C + pad)
        oe = librosa.onset.onset_strength(y=y44[a:b], sr=sr44, hop_length=hop44, n_fft=1024)
        i0 = (s - a) // hop44; m = -(-(min(s + C, total) - s) // hop44)
        parts.append(oe[i0:i0 + m])
    del y44
    oe = np.concatenate(parts).astype(np.float64); N = len(oe)
    np.save(os.path.join(tmp, 'oe44.npy'), oe.astype(np.float32))

    # ---- stage 4: per-beat refinement to the attack start (refine2) ----
    K = np.arange(0, int(DUR / P0) + 1); g = K * P0 + ph_sub - 0.040; g = g[(g >= 0) & (g < DUR)]
    W = int(0.060 / dt)
    bk = np.zeros(len(g)); st = np.zeros(len(g))
    for i, t in enumerate(g):
        c = int(round(t / dt)); a, b = max(1, c - W), min(N - 1, c + W + 1)
        j = a + int(oe[a:b].argmax()); k = j
        while k > max(1, j - int(0.025 / dt)) and oe[k - 1] <= oe[k]:
            k -= 1
        bk[i] = k * dt; st[i] = oe[j] / (np.median(oe[max(0, c - 300):c + 300]) + 1e-9)
    good = (Ssec[np.clip(g.astype(int), 0, len(Ssec) - 1)] > 18) & (st > 2.5)
    r = (bk - g) * 1000
    idx = np.where(good)[0]
    rsm = uniform_filter1d(median_filter(r[idx], size=33, mode='nearest'), 9, mode='nearest')
    beats = g + np.interp(np.arange(len(g)), idx, rsm) / 1000
    log('beats', len(beats))

    # ---- stage 5: tempo, downbeats, energy, drops and builds (build) ----
    A = np.c_[np.ones(len(idx)), idx]
    coef, *_ = np.linalg.lstsq(A, beats[idx], rcond=None)
    bpm_fit = 60 / coef[1]
    INTRO_END = 30.0
    lb = 60 / uniform_filter1d(np.diff(beats), 64, mode='nearest')
    segs = []
    for t0 in np.arange(0, DUR, 30):
        m = (beats[:-1] >= t0) & (beats[:-1] < t0 + 30)
        if m.sum() < 4:
            continue
        segs.append((t0, min(t0 + 30, DUR), float(np.median(lb[m]))))
    win_bpm = np.array([s[2] for s in segs])
    tempo = [{'start': 0.0, 'end': INTRO_END, 'bpm': round(float(np.median(win_bpm)), 2), 'beatless': True}]
    cur = None
    for (a, b, bp) in segs:
        if b <= INTRO_END:
            continue
        a = max(a, INTRO_END); bp = round(bp, 2)
        if cur and abs(cur['bpm'] - bp) <= 0.15:
            cur['end'] = b; cur['_v'].append(bp)
        else:
            if cur:
                tempo.append(cur)
            cur = {'start': a, 'end': b, 'bpm': bp, '_v': [bp]}
    tempo.append(cur)
    for t in tempo:
        t['start'] = round(float(t['start']), 3); t['end'] = round(float(t['end']), 3)
        if '_v' in t:
            t['bpm'] = round(float(np.median(t.pop('_v'))), 2)

    cs = np.concatenate([[0], np.cumsum(sub_e.astype(np.float64))])
    ia = np.clip((beats * fr).astype(int), 0, len(sub_e) - 1)
    ib = np.clip(((beats + P0) * fr).astype(int), 1, len(sub_e))
    E = 10 * np.log10((cs[ib] - cs[ia]) / np.maximum(ib - ia, 1) + 1e-9)
    th = (np.percentile(E, 10) + np.percentile(E, 90)) / 2
    kp = median_filter((E > th).astype(int), 5) > 0
    runs = []; cv = kp[0]; s0 = 0
    for i in range(1, len(kp)):
        if kp[i] != cv:
            runs.append((bool(cv), s0, i)); cv = kp[i]; s0 = i
    runs.append((bool(cv), s0, len(kp)))
    returns = [a for j, (v_, a, e) in enumerate(runs) if v_ and j > 0 and e - a >= 8 and runs[j - 1][2] - runs[j - 1][1] >= 8]
    BAR = int(np.bincount(np.array(returns) % 4, minlength=4).argmax())
    bi = np.arange(len(beats)); downbeats = beats[bi[(bi % 4) == BAR]]
    first_db = float(downbeats[downbeats >= INTRO_END][0])

    sec = np.arange(int(np.ceil(DUR)))
    Rs = uniform_filter1d(Rsec, 3)
    lo, hi = np.percentile(Rs, [3, 99.5])
    energy = np.clip((Rs - lo) / (hi - lo), 0, 1)
    bl = 4 * P0
    drops = []; builds = []; breaks = []

    def snap(i):
        return int(BAR + 4 * round((i - BAR) / 4))
    for j, (v_, a, e) in enumerate(runs):
        if v_ or e - a < 32 or e >= len(beats) - 8 or j == 0:
            continue
        lowv = Rs[int(beats[a]):int(beats[e - 1]) + 1].mean(); post = Rs[int(beats[e]):int(beats[e]) + 8].mean()
        if post - lowv < 5:
            continue
        di = snap(e); td = float(beats[di]); ai = snap(a)
        seg = Rs[int(beats[a]):max(int(beats[a]) + 1, int(td - 4 * bl))]
        lo_t = int(beats[a]) + int(np.argmin(seg))
        b_ = snap(int(np.searchsorted(beats, lo_t)))
        if b_ >= di - 8 or b_ < ai:
            b_ = ai
        drops.append(round(td, 3)); builds.append(round(float(beats[b_]), 3))
        breaks.append([round(float(beats[ai]), 3), round(td, 3)])

    out = {'v': 1, 'src': 'ModeGospel_Back_on_Track_mix', 'bpmGlobal': round(float(bpm_fit), 3), 'duration': round(DUR, 3),
           'timeline': {'gapFill': {'at': GAP_AT, 'samples': GAP_SAMPLES, 'sr': 44100}, 'ffmpegAf': AF},
           'barPhase': BAR, 'beatsPerBar': 4, 'phraseBeats': 16,
           'firstBeat': round(float(beats[beats >= INTRO_END][0]), 3), 'firstDownbeat': round(first_db, 3),
           'tempoSegments': tempo, 'beats': [round(float(t), 3) for t in beats],
           'downbeats': [round(float(t), 3) for t in downbeats],
           'drops': drops, 'builds': builds, 'breakdowns': breaks,
           'energy': [{'t': int(t), 'e': round(float(e), 2)} for t, e in zip(sec, energy[:len(sec)])]}
    with open(out_path, 'w') as fh:
        json.dump(out, fh, indent=1)
    log('bpm', out['bpmGlobal'], 'beats', len(beats), 'drops', len(drops), 'duration', DUR)
    if '--keep-tmp' in sys.argv:
        log('intermediate arrays kept in', tmp)
    else:
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == '__main__':
    main()
