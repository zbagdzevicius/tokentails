"""QC a final: stream facts, loudness, single-frame luma spikes (flash glitches), and long static stretches.
usage: python -I qc.py <file.mp4>"""
import json, re, subprocess, sys
f = sys.argv[1]
FF = '/opt/homebrew/bin/ffmpeg'
pr = json.loads(subprocess.run(['ffprobe', '-v', 'error', '-show_streams', '-show_format', '-of', 'json', f], capture_output=True, text=True).stdout)
v = next(s for s in pr['streams'] if s['codec_type'] == 'video')
out = {'file': f.split('/')[-1], 'res': f"{v['width']}x{v['height']}", 'fps': v['r_frame_rate'], 'codec': f"{v['codec_name']} {v.get('profile')} {v['pix_fmt']}",
       'frames': int(v.get('nb_frames', 0)), 'dur': float(pr['format']['duration']), 'mbps': round(int(pr['format']['bit_rate']) / 1e6, 1)}
r = subprocess.run([FF, '-hide_banner', '-nostats', '-i', f, '-af', 'ebur128=peak=true:framelog=quiet', '-f', 'null', '-'], capture_output=True, text=True).stderr
s = r[r.rfind('Summary:'):]
out['LUFS'] = float(re.search(r'I:\s+(-?[\d.]+) LUFS', s).group(1))
out['TP'] = float(re.search(r'Peak:\s+(-?[\d.inf]+) dBFS', s).group(1))
r = subprocess.run([FF, '-hide_banner', '-nostats', '-i', f, '-vf', 'scale=320:-2,signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-', '-an', '-f', 'null', '-'], capture_output=True, text=True).stdout
Y = [float(x) for x in re.findall(r'YAVG=([\d.]+)', r)]
spikes = []
for i in range(1, len(Y) - 1):
    if Y[i] > 200 or (Y[i] - max(Y[i - 1], Y[i + 1]) > 30):
        spikes.append((i, round(i / 60, 3), round(Y[i], 1)))
out['luma_spikes'] = spikes[:20]
r = subprocess.run([FF, '-hide_banner', '-nostats', '-i', f, '-vf', 'scale=480:-2,freezedetect=n=0.002:d=0.75', '-an', '-f', 'null', '-'], capture_output=True, text=True).stderr
out['freezes'] = [(float(a), float(b)) for a, b in re.findall(r'freeze_start: ([\d.]+).*?\n.*?freeze_duration: ([\d.]+)', r)]
print(json.dumps(out))
