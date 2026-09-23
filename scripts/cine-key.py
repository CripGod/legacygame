"""
A cinematic delivered over black (no alpha in the export): the black surround keyed out by flood fill, so the picture's
own darks stay. Writes a ProRes 4444 .mov with alpha (the sound carried over) for `npm run cine`.

    python3 scripts/cine-key.py in.mov out.mov [--black 12] [--feather 0.8]

The surround is every pixel darker than --black that connects to the frame's edge; everything enclosed by the picture
(a dark coat, ink specks inside a paper edge) stays. The edge gets a light feather. Needs ffmpeg, numpy and scipy.
The direction and the rest of the route: docs/cinematics.md.
"""
import argparse, json, subprocess, sys
import numpy as np
from scipy import ndimage

ap = argparse.ArgumentParser()
ap.add_argument('src'); ap.add_argument('out')
ap.add_argument('--black', type=float, default=12.0, help='luma at or below which a pixel can be surround (0-255)')
ap.add_argument('--feather', type=float, default=0.8, help='gaussian blur on the alpha edge, in pixels')
a = ap.parse_args()

probe = json.loads(subprocess.run(['ffprobe', '-v', 'error', '-print_format', 'json', '-show_streams', a.src], capture_output=True, text=True).stdout)
v = next(s for s in probe['streams'] if s['codec_type'] == 'video')
has_audio = any(s['codec_type'] == 'audio' for s in probe['streams'])
W, H = int(v['width']), int(v['height'])
num, den = (int(x) for x in v['r_frame_rate'].split('/'))
fps = f'{num}/{den}'

dec = subprocess.Popen(['ffmpeg', '-v', 'error', '-i', a.src, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], stdout=subprocess.PIPE)
enc_args = ['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', f'{W}x{H}', '-r', fps, '-i', '-']
if has_audio:
    enc_args += ['-i', a.src, '-map', '0:v:0', '-map', '1:a:0', '-c:a', 'pcm_s16le']
enc_args += ['-c:v', 'prores_ks', '-profile:v', '4444', '-pix_fmt', 'yuva444p10le', '-shortest', a.out]
enc = subprocess.Popen(enc_args, stdin=subprocess.PIPE)

n = 0
while True:
    buf = dec.stdout.read(W * H * 3)
    if len(buf) < W * H * 3:
        break
    rgb = np.frombuffer(buf, dtype=np.uint8).reshape(H, W, 3)
    Y = 0.299 * rgb[..., 0] + 0.587 * rgb[..., 1] + 0.114 * rgb[..., 2]
    dark = Y <= a.black
    lab, _ = ndimage.label(dark)
    edge_labels = np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))
    outside = np.isin(lab, edge_labels[edge_labels != 0])
    alpha = (~outside).astype(np.float32)
    if a.feather > 0:
        alpha = ndimage.gaussian_filter(alpha, a.feather)
    out = np.concatenate([rgb, (alpha * 255.0 + 0.5).astype(np.uint8)[..., None]], axis=2)
    enc.stdin.write(out.tobytes())
    n += 1
    if n % 24 == 0:
        print(f'frame {n}', file=sys.stderr, flush=True)
enc.stdin.close(); dec.stdout.close(); enc.wait(); dec.wait()
print(f'{n} frames keyed -> {a.out}' if enc.returncode == 0 else f'ffmpeg failed ({enc.returncode})')
sys.exit(enc.returncode)
