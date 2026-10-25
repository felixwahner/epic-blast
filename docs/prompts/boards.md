# Prompts for the world art (boards and scenes)

These are the Krea prompts for worlds 10 to 19. Prompts for the first nine worlds were not
recorded; their art is the reference look below. Each world's art lives in
`src/assets/images/worlds/<slug>/`:

- `scene.webp`: the scenery behind the board, **2:3 portrait**. Generate at 1024×1536 (or larger),
  save as WebP at 768×1152, quality ~85.
- `board.webp`: the board material sheet, **square**. Generate at 1254×1254, save as WebP at
  836×836, quality ~90.

Until a world has these files, the game shows a coloured gradient and drawn sockets for it, so worlds can be added one by one.

## Shared style (match the existing 9 worlds)

**Scene:** vivid, highly detailed digital painting of a fantasy game backdrop, portrait. The scene is lit with saturated
neon/glow accents in the two world colours. The middle area stays calmer and darker, because the 8×8 game board sits on top of it.
Detail frames the left and right edges. No text, no UI, no characters in the foreground. The existing
`neon-arcade/scene.webp` (synthwave city) and `dungeon-loot/scene.webp` (golden treasure vault) are the reference look.

**Board:** a perfectly front-on, flat game board texture with an exact **7×7 grid of identical square sockets**,
evenly spaced, separated by thin raised rims, and a thin frame around the outside. Each socket is a dark, slightly glossy
recess made of the world's material, with a faint engraved motif inside. The sockets are evenly lit, with no perspective,
no shadows falling across the grid and no text. The game crops the inner ~55% of every socket, so each socket's centre
must show clean material. Reference: `neon-arcade/board.webp` (dark blue circuit metal) and `dungeon-loot/board.webp`
(dark stone with gold rims and runes).

## Worlds 10 to 19

| # | Slug | Colours (primary / secondary) |
|---|---|---|
| 1 | storm-citadel | #a9c8ff ice blue / #ffe14d lightning yellow |
| 2 | deep-sea-abyss | #2d6bff deep blue / #c6ff3d bio-lime |
| 3 | sky-kingdom | #ffde59 sun yellow / #ff8ad8 dawn pink |
| 4 | glitch-dimension | #39ff14 matrix green / #ff1f1f signal red |
| 5 | toy-box | #ff2d2d toy red / #ffd21f yellow |
| 6 | steam-foundry | #ffb347 copper / #4ee6d2 patina teal |
| 7 | jackpot-palace | #ffd700 gold / #e0102f velvet red |
| 8 | desert-mirage | #ff5a36 terracotta / #7a5cff dusk violet |
| 9 | sketchbook | #2f6bff ballpoint blue / #f5ff3d highlighter yellow |
| 10 | moonlit-dojo | #ff3b2f lantern red / #4b3cff indigo |

### 1. storm-citadel
- Scene: A dark gothic citadel on a sea cliff under a raging thunderstorm. Jagged ice-blue lightning bolts split towering storm clouds, yellow lightning glow rims the battlements, and rain streaks across the sky. Dramatic and epic, with an open dark sky in the centre.
- Board: Dark storm-grey slate sockets with ice-blue metal rims, a faint yellow zigzag lightning engraving in some sockets, and a wet sheen.

### 2. deep-sea-abyss
- Scene: The pitch-black deep ocean abyss with glowing bioluminescent jellyfish, an anglerfish lure light, lime-green glowing plankton and deep blue light shafts fading from far above. Coral silhouettes and kelp frame the sides. Mysterious, dark and cool.
- Board: Dark deep-blue mother-of-pearl sockets with lime bioluminescent rims, faint engraved bubble circles, and wet glossy surfaces.

### 3. sky-kingdom
- Scene: Floating islands above a sea of clouds at sunrise, with waterfalls pouring off the island edges into the void and small airships with sails. A warm golden sun and pink dawn sky. This is the brightest scene: cheerful and airy, with soft clouds in the centre.
- Board: Polished white-gold marble sockets with sun-yellow gilded rims and faint engraved cloud swirls. Bright but with dark enough recesses.

### 4. glitch-dimension
- Scene: The inside of a broken computer screen dimension, with corrupted pixel blocks, RGB chromatic-aberration streaks, scanlines, floating error-dialog windows, and green matrix-like data rain mixed with red glitch tears. Dark background.
- Board: Black LCD-panel sockets with green pixel rims, faint red/green pixel-noise speckles and scanline texture inside.

### 5. toy-box
- Scene: A child's playroom seen from toy size, with giant plastic building bricks, wooden alphabet blocks, a toy train track, and a teddy bear silhouette at the edge. Warm lamp light, bold red and yellow toys, and a cosy evening mood.
- Board: Glossy red plastic sockets like a toy brick baseplate, with yellow plastic rims and faint round studs moulded inside each socket.

### 6. steam-foundry
- Scene: A huge steampunk foundry hall full of giant brass gears, copper pipes, pressure gauges and glowing furnace light. Steam clouds, teal-green patina on the old metal, and industrial cathedral windows.
- Board: Dark riveted copper sockets with teal patina rims and a faint engraved gear in some sockets, with a brushed metal sheen.

### 7. jackpot-palace
- Scene: An opulent art-deco casino hall with rows of glowing slot machines, red velvet curtains, gold chandeliers and scattered casino chips and coins. Golden neon art-deco lines and a luxurious night atmosphere.
- Board: Dark red velvet-lacquer sockets with gold art-deco rims and a faint engraved casino-chip ring inside.

### 8. desert-mirage
- Scene: A desert at dusk, with tall sand dunes, saguaro cacti silhouettes, red rock mesas, and a shimmering heat mirage on the horizon. Terracotta orange sand and a violet dusk sky with the first stars.
- Board: Dark sandstone sockets with terracotta rims, faint engraved wavy sand lines inside and a dusty texture.

### 9. sketchbook
- Scene: A giant open school notebook with grid paper, filled with ballpoint-pen doodles of rockets, stars, monsters and arrows, plus highlighter-yellow scribbles, dog-eared pages and a pencil lying at the edge. Seen at night under a desk lamp, so the paper is dimmed.
- Board: Dark blue-inked grid-paper sockets with ballpoint-blue drawn rims and faint hatched pen scribbles inside. Hand-drawn feel, still a clean 7×7 grid.

### 10. moonlit-dojo
- Scene: A Japanese temple and dojo at night under a huge full moon, with glowing red paper lanterns, bamboo groves, a curved roof silhouette and falling maple leaves. Indigo night sky and lantern-red glow.
- Board: Dark indigo lacquered-wood sockets with red lacquer rims and a faint engraved ink brush stroke inside.
