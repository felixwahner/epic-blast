# Epic Blast: freigegebene Ansagerstimme

Stand: 24. Oktober 2026. Sprache der Ansagen: Englisch.
Generator: Krea, Modell `bytedance/seed-audio-1.0`.

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

## Klangreferenzen

- Unbearbeitete, freigegebene Stimme: `../voice-previews/smooth-energetic-announcer.mp3`
- Freigegebene Stimme mit Effekten: `../voice-previews/epic-blast-announcer.wav`
- Bereits eingebaute Einzelclips: dieser Ordner.

Ein Textprompt legt den Stil fest, garantiert aber keine identische Sprecheridentität
bei einer neuen Generierung. Neue Takes gegen diese lokalen Referenzen abhören:
glatter tiefer Männerklang, klare Konsonanten, hörbare Begeisterung, kein Kratzen.
Falls später ein Generator mit Stimmenreferenz verwendet wird, die unbearbeitete
Datei als Referenz nehmen; die Effekte erst danach anwenden.

## Freigegebene Effekte und Lautstärke

Die zusätzliche Wucht entsteht durch die Nachbearbeitung, nicht durch einen
kratzigeren Prompt oder künstlich abgesenkte Tonhöhe. Derselbe Renderer bleibt
die verbindliche Effektvorlage:

```sh
node render-voice-preview.mjs assets/voice-previews/new-events.mp3 assets/voice-previews/new-events.wav
```

- Originalsignal: Gain 0,88.
- Stereo-Arena-Hall: 1,35 s Impuls, 34 ms Vorverzögerung, Tiefpass 4.800 Hz, Gain 0,40.
- Dopplung: 18/27 ms, jeweils Gain 0,13, Panorama −0,65/+0,65.
- Echo: 180/360 ms, Gain 0,23/0,11, Panorama −0,40/+0,40, Tiefpass 3.600 Hz.
- Keine Tonhöhenänderung, kein zusätzliches Knurren oder Verzerren.
- Datei-Peak: 0,89 (ca. −1 dBFS), Stereo, 44,1 kHz, 16-Bit-WAV.
- Im Spiel: Ansager-Gain **0,22**; Musik während der Ansage auf **35 %** ihres normalen Gains.

Neue Phrasen mit erhaltenem Hallausklang einzeln ausschneiden und an den Grenzen
kurz ein-/ausblenden. `split-voice-clips.py` enthält die bisherigen Phrasennamen
und muss vor Verwendung für neue Takes entsprechend angepasst werden.
Neue Clips in `announcer.js` registrieren. Sprechpause von 6,5 Sekunden,
Ereignisprioritäten, Stummschaltung und unabhängigen Musikschalter beibehalten.
