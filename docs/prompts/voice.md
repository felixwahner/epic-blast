# Epic Blast: announcer voice

As of October 24, 2026. Language of the calls: English.
Generator: Krea, model `bytedance/seed-audio-1.0`. No imitation of a specific
speaker was requested.

The game uses the finished, cut clips in `src/assets/audio/announcer/`.
The raw takes are no longer in the current state of the repo, only in the Git history
(`design/voice-previews/`, last in `65747c4`). To cut or render again, put them
locally into `voice-takes/` (ignored by Git), for example with
`git restore --source=65747c4 design/voice-previews` and then moving them.

## Reusable prompt

Replace only the calls in `[EVENT CALLS]`, each in English double quotes.
Prefer short exclamations of two to five words.

```text
An original powerful male arcade fighting-game announcer. Deep smooth resonant bass-baritone, clean rounded vocal tone, confident commanding presence. Exciting triumphant enthusiastic delivery: celebrate the player's achievement with strong upward energy and punchy emphatic words. Keep the dark epic fighting-game character but sound energized and victorious rather than threatening or gloomy. Absolutely NO rasp, NO gravel, NO growling, NO vocal fry, NO harsh distortion, NO demonic doubling, NO whispering. Natural full-bodied clear human voice, studio clarity, subtle short arena reverb. Speak ONLY these exact English calls, with 1.2 seconds silence between them: [EVENT CALLS] No introductions, no extra words, no music, no crowd, no sound effects. Original voice, do not imitate any specific actor or existing character.
```

The exact approved original prompt used this at that spot:

```text
Speak ONLY these four exact English calls, with 1.2 seconds silence between them: "Triple clear!" "Unstoppable!" "Legendary!" "New high score!"
```

## Takes and clips

| Take | Clips in the game |
| --- | --- |
| `smooth-energetic-announcer` (raw) → `epic-blast-announcer` (with effects) | `triple`, `unstoppable`, `legendary`, `record` |
| `extra-calls` (addition in the same style) | `level`, `revive`, `over` |
| `new-calls-1`: Clean sweep! · Sweep again! · Maximum multiplier! · New world! · Eclipse! · Combo saved! | `sweep`, `sweep-again`, `max-multiplier`, `new-world`, `eclipse`, `combo-saved` |
| `new-calls-2`: Last chance! · Record in sight! · New champion! · Perfect round! · Brilliant! · Close call! | `last-chance`, `record-in-sight`, `champion`, `perfect`, `brilliant`, `close-call` |
| `new-calls-3`: In the zone! · Cross strike! · On fire! · Epic blast! · Let's blast! · One million! | `zone`, `cross`, `fire`, `epic-blast`, `lets-blast`, `million` |

A text prompt sets the style but does not guarantee the same speaker identity
in a new generation. Check new takes against the existing clips by ear:
smooth deep male sound, clear consonants, audible excitement, no rasp.
If a generator with a voice reference is used later, take the unprocessed
take as the reference and apply the effects only afterwards.

## Effects and loudness

The extra punch comes from post-processing, not from a raspier prompt or an
artificially lowered pitch. The renderer is the binding effects template:

```sh
node tools/render-voice.mjs voice-takes/new-calls-4.mp3 voice-takes/new-calls-4.wav
```

- Dry signal: gain 0.88.
- Stereo arena reverb: 1.35 s impulse, 34 ms pre-delay, low-pass 4,800 Hz, gain 0.40.
- Doubling: 18/27 ms, gain 0.13 each, pan −0.65/+0.65.
- Echo: 180/360 ms, gain 0.23/0.11, pan −0.40/+0.40, low-pass 3,600 Hz.
- No pitch change, no added growl or distortion.
- File peak: 0.89 (about −1 dBFS), stereo, 44.1 kHz, 16-bit WAV.
- In the game: announcer gain **0.22**; music drops to **35 %** of its normal gain during a call.

## Cutting

`python tools/split-voice-clips.py` (needs NumPy and ffmpeg) cuts the processed
takes at the quiet gaps between phrases and saves MP3s at 128 kbit/s.
The script contains the existing takes and phrase names and has to be extended
for new takes. Register new clips in `src/audio/announcer.ts`. Keep the 6.5-second
pause between calls, the event priorities, muting and the separate music toggle.
