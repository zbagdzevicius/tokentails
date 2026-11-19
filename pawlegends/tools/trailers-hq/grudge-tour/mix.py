"""Grudge Tour audio: the score stems + the takes' own game SFX (game music off in the takes), placed on the edit's
frames, mastered to -14 LUFS integrated with true peak <= -1 dBTP (two-pass loudnorm, then measured).
usage: uv run --with numpy python -I mix.py <plan.json> <cut> <outwav>"""
import json, os, re, subprocess, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
G = os.path.join(HERE, '..')
FF = '/opt/homebrew/bin/ffmpeg'
SR = 48000
plan_file, cut, out = sys.argv[1:4]
plan = json.load(open(plan_file))[cut]
N = plan['frames']
n = N * SR // 60


def read(path, ss=0.0, dur=None):
    args = [FF, '-loglevel', 'error', '-ss', f'{ss:.4f}', '-i', path]
    if dur:
        args += ['-t', f'{dur:.4f}']
    args += ['-f', 'f32le', '-ac', '2', '-ar', str(SR), '-']
    b = subprocess.run(args, capture_output=True, check=True).stdout
    return np.frombuffer(b, dtype=np.float32).reshape(-1, 2).copy()


mus = read(os.path.join(G, 'audio', f'music-{cut}.wav'))[:n]
sti = read(os.path.join(G, 'audio', f'sting-{cut}.wav'))[:n]
game = np.zeros((n, 2), np.float32)
for s in plan['shots']:
    if s['kind'] != 'take':
        continue
    a = s['a'] * SR // 60
    d = (s['b'] - s['a']) / 60
    x = read(os.path.join(G, 'takes', 'hq', f"{s['take']}-h.mp4"), s['src'], d)
    m = min(len(x), n - a)
    x = x[:m]
    fade = min(144, m // 2)  # 3 ms
    ramp = np.linspace(0, 1, fade, dtype=np.float32)[:, None]
    x[:fade] *= ramp
    x[-fade:] *= ramp[::-1]
    game[a:a + m] += x
# levels: the score carries, the game's SFX sit ~6 dB under it, the designed stings on top
rms = lambda v: float(np.sqrt(np.mean(v ** 2)) + 1e-9)
mus *= 0.25 / rms(mus)
game *= (0.25 * 0.5) / rms(game)
sti *= 0.9 * 0.25 / max(rms(sti), 1e-9) if rms(sti) > 1e-6 else 1
mix = mus + game + sti
# hard silence after the last frame's hard-out and a 4 ms fade-in
mix[:192] *= np.linspace(0, 1, 192)[:, None]
tmp = out + '.raw.wav'
subprocess.run([FF, '-y', '-loglevel', 'error', '-f', 'f32le', '-ar', str(SR), '-ac', '2', '-i', '-', '-c:a', 'pcm_f32le', tmp], input=mix.astype(np.float32).tobytes(), check=True)


def measure(path):
    r = subprocess.run([FF, '-hide_banner', '-nostats', '-i', path, '-af', 'ebur128=peak=true:framelog=quiet', '-f', 'null', '-'], capture_output=True, text=True).stderr
    s = r[r.rfind('Summary:'):]
    I = float(re.search(r'I:\s+(-?[\d.]+) LUFS', s).group(1))
    TP = float(re.search(r'Peak:\s+(-?[\d.inf]+) dBFS', s).group(1))
    return I, TP


# limiter first (alimiter at -2 dBTP-ish), then a linear gain to -14 LUFS, iterate
gain_db = 0.0
for it in range(10):
    af = f'volume={gain_db:.2f}dB,alimiter=limit=0.79:attack=1:release=60:level=false,aresample=192000,alimiter=limit=0.79:attack=0.5:release=40:level=false,aresample=48000'
    subprocess.run([FF, '-y', '-loglevel', 'error', '-i', tmp, '-af', af, '-c:a', 'pcm_s24le', '-ar', '48000', out], check=True)
    I, TP = measure(out)
    print(f'  pass {it}: gain {gain_db:+.2f} dB -> I {I} LUFS, TP {TP} dBTP', flush=True)
    if abs(I + 14) <= 0.05 and TP <= -1.0:
        break
    gain_db += (-14 - I)
os.remove(tmp)
print(json.dumps({'cut': cut, 'I': I, 'TP': TP}))
