"""Run from the repository root: python tools/split-voice-clips.py

Split the approved, processed voice takes at their quiet phrase boundaries."""
from pathlib import Path
import wave
import numpy as np

out = Path('src/assets/audio/announcer')
out.mkdir(exist_ok=True)
for source, names in [
    ('epic-blast-announcer', ['triple', 'unstoppable', 'legendary', 'record']),
    ('extra-calls', ['level', 'revive', 'over']),
]:
    with wave.open(f'design/voice-previews/{source}.wav') as stream:
        rate = stream.getframerate()
        samples = np.frombuffer(stream.readframes(stream.getnframes()), dtype='<i2').reshape(-1, 2).astype(float) / 32768
    hop = rate // 100
    rms = np.array([np.sqrt(np.mean(samples[i:i + hop] ** 2)) for i in range(0, len(samples), hop)])
    active = np.flatnonzero(rms > .025)
    gaps = sorted([(b - a, a, b) for a, b in zip(active[:-1], active[1:]) if b - a > 15], reverse=True)
    boundaries = sorted(gaps[:len(names) - 1], key=lambda gap: gap[1])
    if len(boundaries) != len(names) - 1:
        raise ValueError(f'Cannot identify phrase boundaries in {source}')
    starts = [max(0, active[0] - 8)] + [max(0, b - 8) for _, a, b in boundaries]
    ends = [b - 9 for _, a, b in boundaries] + [min(len(rms), active[-1] + 100)]
    for name, start, end in zip(names, starts, ends):
        clip = samples[start * hop:end * hop].copy()
        fade = min(len(clip), int(rate * .045))
        clip[:fade] *= np.linspace(0, 1, fade)[:, None]
        clip[-fade:] *= np.linspace(1, 0, fade)[:, None]
        with wave.open(str(out / f'{name}.wav'), 'wb') as stream:
            stream.setnchannels(2)
            stream.setsampwidth(2)
            stream.setframerate(rate)
            stream.writeframes(np.round(clip * 32767).astype('<i2').tobytes())
        print(f'{name}: {start / 100:.2f}–{end / 100:.2f}s')
