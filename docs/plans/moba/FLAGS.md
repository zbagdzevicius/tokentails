# Country flags

Founder ask (Nov 15): "implement country flags ( based on the IP of user ). for bots - just use random flags. it'll create more social aspect."

## What players see

- A small flag before a player's name in the party lobby, the loading screen, the in-match scoreboard, the results table, the friends list, the weekly and ranked boards, and next to "My code" in Friends.
- A neutral paw (🐾) when the player hid their flag or no country is known.
- Bots show a flag too: a seeded pick from `BOT_FLAGS` (60 common countries) per match seed and seat. Every player in the match sees the same bot flag. Bots are still labelled as bots where they were before; the flag does not change that.
- Settings → "Show my country flag" (on by default). Off: everyone else sees a paw. Guests too.

## Where the country comes from

- Only Cloudflare's `cf-ipcountry` header, the ISO 3166-1 alpha-2 code Cloudflare derives from the request IP (the same source as the Moon Rave flags and the relay's RTT region). Non-country codes (`XX`, `T1` Tor, `A1`, `A2`, `O1`, `EU`, `AP`, `ZZ`) give no flag.
- The IP is never read, stored or logged for this. No paid API and no GeoIP database ship with the backend.
- `GET /pawlegends/flag` (twice a day at most per device) records the code on the account's row in `pawlegendsflags` (`_id` = account id, `cc`, `off`, `at`). The relay uses the stored row; without one it uses the country of the socket's own upgrade request.
- An unticketed relay socket never shows a flag (its hide choice cannot be read).
- The row is deleted with the account (`social-purge.ts`).

## Wire

- `MemberView.cc?` (party views), `MatchMsg.flags?: (string | null)[]` per seat (null for bots, hidden or unknown), `cc?` on friends rows and board rows. Older relays and backends send none; the client then shows its own flag and seeded bot flags only.
- Not part of the sim: no sim, replay or hash change.

## Rendering

- Flag emoji (two regional indicator letters). Windows draws no flag emoji, so a one-time canvas check there loads `/fonts/pl-flags.woff2` from the web host (`pawlegends-web/public/fonts`, 77 kB, flags only, "Twemoji Country Flags" by TalkJS, MIT; art Twemoji, CC BY 4.0). It sits outside the game's 10 MB output. Other platforms, and the iOS and Android apps, never download it; a Windows page served elsewhere shows the two letters instead.

## Not done

- No GeoIP fallback when Cloudflare is bypassed (direct origin, local dev): the flag is then unknown (a paw). Cloudflare must keep "IP Geolocation" on.
- The match history and profile pages (round 7 `history` package) can read `cc` from the same rows.
