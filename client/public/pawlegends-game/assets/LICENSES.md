# Asset licences

Every shipped asset gets a row here, copied from `swordcat/public/assets/LICENSES.md` for each PPK file used
(POC.md §6.9). M0 ships no binary assets: the map and units are placeholder geometry built in code.

| File | Source | Licence |
|---|---|---|
| `fonts/Fredoka-Latin.woff2` | Fredoka (Google Fonts, https://fonts.google.com/specimen/Fredoka), copied from `swordcat/public/assets/fonts/` | SIL Open Font License 1.1, `fonts/licenses/Fredoka-OFL.txt` |

Heroes, minions, towers and the map are procedural geometry built in code (`src/render/views/`), not baked assets.
Sounds are zzfx parameter arrays synthesised at runtime (`src/audio/`); zzfx is MIT (© 2019 Frank Force).
