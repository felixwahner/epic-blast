# Epic Blast voice clips

Reusable generation prompt, approved references, and exact effect settings:
[VOICE-PROMPT.md](./VOICE-PROMPT.md).

Original English voices generated with Krea Seed Audio on 2026-10-24.
The user approved the smooth energetic voice with arena reverb, stereo doubling,
and two dark echoes. No imitation of a particular actor was requested.

`triple`, `unstoppable`, `legendary`, and `record` use that exact approved take.
`level`, `revive`, and `over` use a supplementary take prompted in the same style.

Source takes are in this folder. The game uses the split clips in
`src/assets/audio/announcer/`. Reproduce the effects with
`node tools/render-voice-preview.mjs [input.mp3] [output.wav]`, then split with
`python tools/split-voice-clips.py` (NumPy required).

Runtime gain is 0.22. Effects are baked into the files; Web Audio plays each clip
once without changing pitch. Music ducks to 35% of its usual gain during calls.
