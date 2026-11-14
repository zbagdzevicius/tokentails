# Share and push: highlight clips, push notifications

Gap package `share-push` from round 3 of the Wild Rift / Mobile Legends / Brawl Stars gap analysis
(`~/Downloads/paw-legends/research/gaps2-shipped.html`, rows "Watch / share: no clip export" and "Retention: no push
notifications"). No sim change, no new play path, nothing with a price, nothing from Token Tails.

## 1. Highlight clips

A 10-20 s video of a match, recorded in the browser from its replay, shared to the system share sheet or saved.

- **Replay viewer → Clip** (`data-testid="replay-clip"`, a red dot on the replay bar, hidden where the browser cannot
  record). The panel picks **Vertical 9:16** (720x1280, for Shorts / TikTok / Reels; the default on touch and portrait
  screens) or **Wide 16:9** (1280x720), and **10 / 15 / 20 s**. **Record** starts at the play head at 1x; the button
  turns into the running time (tap it to stop early). Pause pauses the clip; a seek or Exit throws it away; the
  replay's end finishes it. Near the end, Record rewinds to the last 15 s first.
- **Results → Share card → Video clip: Vertical 9:16 / Wide 16:9** (the Legend Moment): the replay opens on its own,
  the scout runs the whole match ("Finding your Legend Moment…"), the view cues the 15 s window with the most of the
  player's takedowns, 4 s before the first one (no takedowns: the match's last 15 s), and records it. Only for a kept
  solo replay of this sim version (party matches keep no replay, MATCH-MOMENTS.md §1).
- **The clip sheet**: the video (looping, muted preview), its length, framing, format and size; **Share** (the system
  share sheet with the file, `navigator.share({files})`), **Save video** (a download, `paw-legends-clip-YYYYMMDD.mp4`),
  **Record again**. Where a device cannot share a video file (desktop browsers, the Android app's WebView) Share
  saves it and copies the link with the text, like the share card.
- **What is in the video**: the game view centre-cropped to the framing (the camera follows the champion, so it stays
  in the frame), the v6 banner for the first 2.6 s (the best moment as the headline, "SHUT DOWN!", else LEGEND MOMENT;
  the champion and the mode under it), and the PAW LEGENDS · pawlegends.app mark bottom right. The HUD is not in it
  (it is HTML over the canvas). The sound is everything the game plays (a tap on the WebAudio master, after mute and
  volume: a muted game records a silent clip).
- **Format**: MP4 (H.264 + AAC) where the browser records it (Safari, Chrome 126+), else WebM (VP9/VP8 + Opus).
  3.5-4 Mbit/s: a 15 s clip is about 6-8 MB.
- **How**: `src/share/clip.ts` (its own lazy chunk with the viewer). The app's frame loop calls `runFrameTap()` right
  after each drawn frame (`render/renderer.ts`); while a clip records, the tap copies the WebGL canvas into a 2D
  canvas (the drawing buffer still holds the frame there, so no `preserveDrawingBuffer` cost on normal frames),
  `captureStream(30)` feeds `MediaRecorder`, and `sfx.tap()` adds a `MediaStreamAudioDestinationNode` on the master.
- **App shells**: no Capacitor share, filesystem or media plugin is installed (`pawlegends-app/package.json`), so the
  apps use the same web flow: on iPhone the WebView's `navigator.share` takes the file (Save Video goes to Photos); on
  Android the WebView has no file sharing, so Share saves and copies the link. Follow-up below for a native path.
- Analytics: `clip_start` (framing, seconds, auto), `clip_moment` (takedowns), `clip_made` (seconds, framing, ext, kb),
  `clip_share` (via share or save), `share_card` `via: clip`.

## 2. Push notifications

Web push to pawlegends.app's service worker, for five categories, each of which the player can turn off.

| Category | When | Text | Gap per device | Push TTL |
|---|---|---|---|---|
| `invite` Friend invites | a friend invites you to their party (`POST /pawlegends/social/invite`) | "Party invite: Mochi invited you to their party. Tap to join." | 1 min | 2 min |
| `club` Club chest ready | your club's weekly wins reach a new chest tier and you added a win this week | "Club chest ready: Your club reached 10 wins this week…" | 12 h | 12 h |
| `ranked` Ranked opening | the ranked gate opens (24 ranked-eligible players online, ranked/status.ts) | "Ranked is open: 31 players are online…" | 12 h | 30 min |
| `event` New events | a live-ops event begins: featured mode, community goal, fan vote (announced once, within 2 h of its start) | "New in Paw Legends: Fan vote. Until Nov 30" | 6 h | 6 h |
| `nap` Winter Nap gifts | Winter Nap began; daily at 18:00 device time while it runs: a gift waiting to open, or today's gift still to earn | "A Winter Nap gift is waiting" / "Your next Winter Nap gift" | 20 h | 6 h |

- **Rules for every push** (`backend/src/pawlegends/push/push.rules.ts`): quiet hours 22:00-09:00 device time (the
  device's UTC offset is stored with the subscription; a push due then is dropped, not queued), at most 4 pushes a
  device in 24 h, the category gap above, a `Topic` per category so an undelivered push is replaced by a newer one.
  The slot is claimed in the database before sending, so two backend instances never both send.
- **Opt-in** (`src/social/push.ts`, `src/ui/pushAsk.ts`): after a win, never in the first launch (the profile's
  session 1), the game's own card in the offer card's corner: "Never miss a match … Turn on / Not now". Only **Turn
  on** shows the browser's permission prompt. "Not now" waits a week; two asks at most. Never in a match, never in the
  apps, never where the browser has already decided. Settings → **Notifications** (on/off) and, when on, one row per
  category. A blocked browser permission shows a line saying so.
- **Where it works**: Chrome, Edge, Firefox and Samsung Internet on desktop and Android; Safari on macOS; on iPhone
  only in a Home Screen web app (Safari has no `PushManager` in a tab). The game checks `PushManager`, a secure context
  and a server key, and shows nothing otherwise.
- **Service worker**: `pawlegends-web/public/push-sw.js` at `https://pawlegends.app/push-sw.js`, scope `/`. It has no
  fetch handler (it never touches page loads or caches); it shows a push and on a tap focuses an open `/play` tab or
  opens the push's path (only a pawlegends.app path). Served with `Cache-Control: max-age=0, must-revalidate`.
- **The subscription path**: the game never sees a token. API ops through the host (`embed/api.ts`,
  `pawlegends-web/components/pawlegends/apiBridge.ts`, `shared/pawlegends-bridge.fixtures.json`): `push.key` →
  `GET /pawlegends/push/key` (public), `push.subscribe` → `POST /pawlegends/push/subscribe {endpoint, p256dh, auth,
  cats, tz}`, `push.prefs` → `POST /pawlegends/push/prefs {endpoint, cats, tz}`, `push.off` →
  `POST /pawlegends/push/unsubscribe {endpoint}`. The writes take the session (guests too, not a transient one). Each
  launch with notifications on re-sends the current subscription (a rotated endpoint, another account, a new time
  zone). The server accepts only push-service endpoints (FCM, Mozilla, Apple, WNS; https, no port or credentials),
  keeps at most 5 devices an account, and deletes a device on 404/410 or after 5 failed sends in a row.
- **Backend**: `backend/src/pawlegends/push/` (`push.service.ts`, `push.controller.ts`, `push.schema.ts`, collections
  `pawlegendspushsubs` and `pawlegendspushstate`). Encryption (RFC 8291 aes128gcm) and VAPID (RFC 8292) are the
  backend's dependency-free ones (`src/badcat/badcat-webpush.ts`). Other services send only through
  `push-sink.ts` (`pushNotify`, `pushBroadcast`): fire and forget, never part of the action (an invite, a `/live`
  save, the ranked gate) and never failing it. Crons: events every 5 min (lease `pawlegends-push-events`), Winter Nap
  hourly (lease `pawlegends-push-nap`). One log line a send: `pl_push {"cat","out"}`.
- **Keys** (env names, never in the repo): `PAWLEGENDS_VAPID_PUBLIC_KEY` (87 characters), `PAWLEGENDS_VAPID_PRIVATE_KEY`
  (43 characters, secret), optional `PAWLEGENDS_VAPID_SUBJECT` (default `https://pawlegends.app`). Without a valid pair
  `GET /pawlegends/push/key` answers `{key: null}`, the game shows no opt-in and no Settings rows, and nothing is sent.
  Make a pair with:
  `node -e "const e=require('crypto').createECDH('prime256v1');e.generateKeys();console.log(e.getPublicKey('base64url'),e.getPrivateKey('base64url'))"`.
  About 1 key in 256 prints a 42-character private key (a leading zero byte dropped); the server pads it to 32 bytes
  (fixed in the round 3 review; before that such a pair was refused and push stayed off).
  Rotating the pair invalidates every subscription (the browsers subscribed with the old public key): the game sees
  no subscription at the next launch and the player turns it on again.
- Analytics: `push_prompt` (asks), `push_optin` (result on / denied / unavailable / failed / later, from card or
  settings), `push_prefs` (cat, on).

### Native push in the app shells (not built: no push plugin is configured)

`pawlegends-app` has no push plugin (`@capacitor/push-notifications` or `@capacitor-firebase/messaging`), and its
WebViews have no web push, so the apps show no opt-in. The steps when the apps should get it:

1. `npm i @capacitor-firebase/messaging` in `pawlegends-app` (the Firebase project the shell already uses for sign-in;
   FCM covers both platforms), `npx cap sync`.
2. iOS: in the Apple Developer account create an APNs auth key (.p8), upload it to Firebase → Project settings → Cloud
   Messaging; in Xcode add the Push Notifications capability and Background Modes → Remote notifications;
   `aps-environment` in the entitlements. Android: `google-services.json` is already in the shell for sign-in; add the
   `POST_NOTIFICATIONS` permission (Android 13+).
3. Backend: a second transport in `push.service.ts` `sendTo` for rows with `kind: 'fcm'` (an FCM registration token
   instead of a web endpoint), sent with `firebase-admin` `messaging().send` (already a backend dependency), same
   rules and categories. A `push.subscribe` variant carries `{token, platform}`.
4. Game: `pushSupported()` also true in a shell with the plugin; `enablePush` asks the plugin for permission and the
   token instead of the service worker. Ship as an OTA web update after the store binary with the plugin.

## Follow-ups

- Native push (above) and a native share/save for clips (`@capacitor/share` + `@capacitor/filesystem`: write the clip
  to the cache folder and share its file URL; on Android that also gives Save to gallery).
- Clips of party and PvP matches (needs their replays, MATCH-MOMENTS.md follow-ups).
- The HUD in the clip (draw the score and the takedown banner on the 2D canvas).
- Pushes for a friend coming online and for a finished season reward.
