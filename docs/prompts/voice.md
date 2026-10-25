# Epic Blast: Ansagerstimme

Stand: 24. Oktober 2026. Sprache der Ansagen: Englisch.
Generator: Krea, Modell `bytedance/seed-audio-1.0`. Es wurde keine Nachahmung eines
bestimmten Sprechers verlangt.

Das Spiel nutzt die fertig geschnittenen Clips in `src/assets/audio/announcer/`.
Die Rohtakes liegen nicht mehr im aktuellen Stand des Repos, nur noch in der Git-Historie
(`design/voice-previews/`, zuletzt in `65747c4`). Wer neu schneiden oder rendern will,
legt sie lokal nach `voice-takes/` (von Git ignoriert), zum Beispiel mit
`git restore --source=65747c4 design/voice-previews` und anschließendem Verschieben.

## Wiederverwendbarer Prompt

Nur die Ansagen in `[EVENT CALLS]` ersetzen, jeweils in englischen Anführungszeichen.
Kurze Ausrufe von zwei bis fünf Wörtern bevorzugen.

```text
An original powerful male arcade fighting-game announcer. Deep smooth resonant bass-baritone, clean rounded vocal tone, confident commanding presence. Exciting triumphant enthusiastic delivery: celebrate the player's achievement with strong upward energy and punchy emphatic words. Keep the dark epic fighting-game character but sound energized and victorious rather than threatening or gloomy. Absolutely NO rasp, NO gravel, NO growling, NO vocal fry, NO harsh distortion, NO demonic doubling, NO whispering. Natural full-bodied clear human voice, studio clarity, subtle short arena reverb. Speak ONLY these exact English calls, with 1.2 seconds silence between them: [EVENT CALLS] No introductions, no extra words, no music, no crowd, no sound effects. Original voice, do not imitate any specific actor or existing character.
```

Der exakt freigegebene Ausgangsprompt verwendete an dieser Stelle:

```text
Speak ONLY these four exact English calls, with 1.2 seconds silence between them: "Triple clear!" "Unstoppable!" "Legendary!" "New high score!"
```

## Takes und Clips

| Take | Clips im Spiel |
| --- | --- |
| `smooth-energetic-announcer` (roh) → `epic-blast-announcer` (mit Effekten) | `triple`, `unstoppable`, `legendary`, `record` |
| `extra-calls` (Ergänzung im gleichen Stil) | `level`, `revive`, `over` |
| `new-calls-1`: Clean sweep! · Sweep again! · Maximum multiplier! · New world! · Eclipse! · Combo saved! | `sweep`, `sweep-again`, `max-multiplier`, `new-world`, `eclipse`, `combo-saved` |
| `new-calls-2`: Last chance! · Record in sight! · New champion! · Perfect round! · Brilliant! · Close call! | `last-chance`, `record-in-sight`, `champion`, `perfect`, `brilliant`, `close-call` |
| `new-calls-3`: In the zone! · Cross strike! · On fire! · Epic blast! · Let's blast! · One million! | `zone`, `cross`, `fire`, `epic-blast`, `lets-blast`, `million` |

Ein Textprompt legt den Stil fest, garantiert aber keine identische Sprecheridentität
bei einer neuen Generierung. Neue Takes gegen die vorhandenen Clips abhören:
glatter tiefer Männerklang, klare Konsonanten, hörbare Begeisterung, kein Kratzen.
Falls später ein Generator mit Stimmenreferenz verwendet wird, den unbearbeiteten
Take als Referenz nehmen und die Effekte erst danach anwenden.

## Effekte und Lautstärke

Die zusätzliche Wucht entsteht durch die Nachbearbeitung, nicht durch einen
kratzigeren Prompt oder künstlich abgesenkte Tonhöhe. Der Renderer ist die
verbindliche Effektvorlage:

```sh
node tools/render-voice.mjs voice-takes/new-calls-4.mp3 voice-takes/new-calls-4.wav
```

- Originalsignal: Gain 0,88.
- Stereo-Arena-Hall: 1,35 s Impuls, 34 ms Vorverzögerung, Tiefpass 4.800 Hz, Gain 0,40.
- Dopplung: 18/27 ms, jeweils Gain 0,13, Panorama −0,65/+0,65.
- Echo: 180/360 ms, Gain 0,23/0,11, Panorama −0,40/+0,40, Tiefpass 3.600 Hz.
- Keine Tonhöhenänderung, kein zusätzliches Knurren oder Verzerren.
- Datei-Peak: 0,89 (ca. −1 dBFS), Stereo, 44,1 kHz, 16-Bit-WAV.
- Im Spiel: Ansager-Gain **0,22**; Musik während der Ansage auf **35 %** ihres normalen Gains.

## Schneiden

`python tools/split-voice-clips.py` (NumPy und ffmpeg nötig) schneidet die bearbeiteten
Takes an den leisen Stellen zwischen den Phrasen und speichert MP3s mit 128 kbit/s.
Das Skript enthält die bisherigen Takes und Phrasennamen und muss für neue Takes
ergänzt werden. Neue Clips in `src/audio/announcer.ts` registrieren. Sprechpause von
6,5 Sekunden, Ereignisprioritäten, Stummschaltung und den eigenen Musikschalter beibehalten.
