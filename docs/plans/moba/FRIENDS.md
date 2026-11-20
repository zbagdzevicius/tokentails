# Friends on Home (friends panel)

Founder, Nov 20: "implement this version of friends section (top 1 from our versions of friends list) and also drop
existing one completely (that collapsable sidebar). … it should be placed at the top on mobile and settings, sound,
friends buttons removed (sounds, settings button move to profile screen)".

The design is the chosen concept (1600x900 Home): a "FRIENDS 3/12" panel at the top right with an add-friend button,
rows with a round avatar and presence dot, the name and a rank badge, a status line and a square yellow "+".

## Rules

- One friends list: Home's panel (`pawlegends/src/ui/home/friendsRail.ts`, `friendsRail.css`). Nothing opens it; it
  is always on Home (not in the first guided match, and only with a host session: embedded).
- One place per thing. Every feature of the old sidebar now lives in exactly one place (table below).
- PLAY stays dominant: the panel ends above the PLAY cluster (`placeRail` measures it) and the poster frames the
  champion clear of it (`render/lobby.ts` `HOME_HUD` counts `.fr-rail`).
- No feature flags.

## The panel

| Part | Behaviour |
|---|---|
| Header | "FRIENDS" + online/total ("3/12": friends not offline / all). The add-friend button (badge: friend requests waiting) opens the add-friend sheet. A chat button appears only while DMs are unread (badge: the count) and opens the newest unread conversation. |
| Order | Online, away and in a lobby first; then in a queue or a match; then offline, most recently seen first. Favourites first inside the online and busy groups. |
| Row | Avatar (40 px) with a presence dot: green online or in a lobby, amber away, yellow in a queue or match, grey offline. Name + rank badge (the ranked tier group, Kitten to Legend, when placed this season; none otherwise). Status: "Online", "Away", "In lobby · 2/3", "In match · 12:40" (ticks each second), "3m ago" / "1h ago" / "2d ago" for offline (dimmed). |
| Row tap | The Player Card (the Profile screen, other-player mode). |
| "+" | Invites to a party: with no party, a party lobby opens and the invite goes out once it is up (the same flow as before, `inviteAfterParty`, now a queue so several friends can be invited at once). Grey with its reason in a match, in a queue, offline (from Home), or already in your party; a tap on a grey "+" says why (Home's toast). From your own party lobby an offline friend can be invited (they get a notification). A Ranked party invites to Ranked. |
| Many friends | About five rows show, then the list scrolls inside the panel (a fade while more wait below). |
| 0 friends | "No friends yet. Add players you met by name." + Add friend. |
| Guest | "Sign in to add friends, see who's online and keep your progress." + Sign in. |
| Phones | A strip of avatar chips at the top right (`.is-strip`, `(max-height: 500px), (max-width: 700px)`): the add button with the count first, then chips (avatar, dot, name under), a small "+" on invitable friends; a long press on a chip invites too. It sits right of the currencies and the champion nameplate; when the row is too narrow it drops under the nameplate. |

Rank badge data: `social.get` friend rows carry `rk` (the tier index 0..12) when the friend is placed in the current
season (`backend/src/pawlegends/social/social.service.ts` `tiersOf`, one batched read of `pawlegendsratings`;
spec `friend-tiers.spec.ts`).

## Settings and Sound

The round Friends, Settings and Sound buttons on Home are gone (the whole top-right corner). Settings and Sound are on
the Profile screen (the profile chip) beside Edit profile: Settings opens the panel, Sound is a switch that says its
state ("Sound on" / "Sound off", `aria-pressed`) and saves on the device as before (`setMuted`, also told to the host).
On a phone they shrink to icons. In a match the pause menu keeps Settings; spectating and replays keep theirs. The
Profile's Account tab no longer has a second Settings card. The Profile "Friends" button is removed (the sidebar is
gone; Home's panel is the friends list).

Sign-in on Home: Home has no corner, so no account chip mounts there. Signed out, the panel's Sign in (and Profile's
Sign in). The classic title keeps its corner chip.

## Where the old sidebar's features went

| Old sidebar (`social/socialSheet.ts`, deleted) | Now |
|---|---|
| Friends list, groups (Favourites, Online, In match, Offline), presence, status line, flags | Home's panel (flags are on the Player Card) |
| Search my friends | Dropped as a separate field: the panel is short and ordered; the add-friend sheet's name search marks friends ("Friends") |
| Row quick actions: Invite | The panel's "+" |
| Join an open lobby | Player Card: Join lobby |
| Watch a friend's match | Player Card: Watch |
| Ask to join a closed lobby | Player Card: Ask to join (a "Wanna play?" DM) |
| Invite when their match ends (queued) | Player Card: "Invite when their match ends" / Cancel queued invite (sent or told when they are free, on the panel's refresh) |
| Row menu: Message | Player Card: Message (the DM thread, `social/dmHost.ts` + `chatSheet.ts`) |
| Row menu: View profile / Match history | The row itself opens the Player Card (Matches tab there) |
| Row menu: Pin to favourites | Player Card: Pin to / Unpin from favourites |
| Row menu: Remove friend (tap twice) | Player Card: Remove friend (asked once) |
| Row menu: Block (5 s Undo) | Player Card: Block (asked once); unblock in Profile → Account → Blocked players |
| Blocks (no list before) | Profile → Account → Blocked players, with Unblock |
| Unread DMs on rows, chat tabs | The panel's chat button (count) opens the newest unread conversation; the thread's tab strip lists the others |
| DM toast | Opens that conversation (unchanged) |
| Add friend by name, typeahead, old PL- code | Add-friend sheet (`social/friendsSheet.ts`), opened from the panel's add-friend button |
| Friend requests in (Accept, Decline) and sent (Cancel) | Add-friend sheet; the waiting count is the add button's badge |
| Recent players (Add) | Add-friend sheet: From your recent matches |
| My status (Online, Away, Appear offline), status note, copy my name | Add-friend sheet: You |
| Auto-Away after 10 min idle | Unchanged (app) |
| Invite gift (Share link, Claim; the invite code left the game on Nov 20, GROWTH.md) | Add-friend sheet: Invite a friend |
| Watch a featured live match | Add-friend sheet: Watch a live match (when one is featured) |
| Age question, guest sign-in | Add-friend sheet (and the panel's Sign in for a guest) |
| Clubs tab | The club window (`social/clubsModal.ts`) from Profile: Your club / Find a club |
| Ranked tab (status, placements, Play Casual) | Already elsewhere: Profile → Overview → Ranked card, Home's Ranked button |
| Party lobby "Invite friends" | The add-friend sheet in invite mode: Home's rows with their "+" over the lobby |
| Pulse every 30 s, invite toasts | Unchanged (app); the pulse redraws the panel |

The old sidebar's stylesheet survives as `social/social.css` for the parts that remain (the DM thread, request and
suggestion rows, my status card, the invite gift, the club window); its sidebar-only rules were removed.
`social/socialState.ts` holds the shared shapes and helpers (status notes, `laterStep`, error text).

## Tests

- Unit: `tests/unit/friends-panel.test.ts` (order, status, invite rule, rank badge, header badges, empty, guest, no
  round buttons on Home), `friends-sheet.test.ts` (add by name, requests, recent, status, age, invite mode),
  `profile-screen.test.ts` (Settings and Sound, friend actions, blocks), `clubs.test.ts` (the club window),
  `invite.test.ts` (the invite gift in the sheet), backend `friend-tiers.spec.ts`.
- E2E: `tests/e2e/friends-panel.spec.ts` (0, 5 and 12 friends at 1440x900, 1600x900, 844x390 and 667x375: clear of
  PLAY, the champion and the HUD; row → card, add → sheet, + → party lobby; Profile has Settings and Sound, Sound
  persists), plus the updated `social`, `chat`, `clubs`, `nickname-id`, `match-history`, `mp/social-invites` specs.
  Settings from Home in tests: `tests/e2e/openSettings.ts`.
