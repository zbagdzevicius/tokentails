# Invites, friend DMs and join by code (LoL style)

The founder asked for this, verbatim: "create functionality to update profile / change nickname ( nickname change can be once only for free, then paid ). also allow to message friends and invite to match ( so they could join via code or be invited regulary like in league of legends )". This document covers the messaging and invite part. Profile and nickname changes are handled elsewhere.

It builds on `SOCIAL-RANKED.md` (friends, presence, invites) and `CHAT-AVATARS.md` (DMs, filter, age tiers, block, mute, report). Those systems are reused, not duplicated.

## What was already there

- DMs between accepted friends: server-side threads, a 30-day TTL, the text filter, age tiers (typed text only when both friends are 16+, otherwise phrases), block, mute, report and rate limits (`chat.service.ts`, `chatSheet.ts`).
- Party invites through the 30 s title pulse: a 3-minute TTL and a toast with Join only.
- Presence on friend rows. Party codes, `?party=` links, QR codes and "Join with code".
- The relay refuses a party that mixes sim builds when it starts. The fatal `update_required` shows Reload.

## What this adds

| Part | Where |
|---|---|
| **Fast inbox.** `GET /pawlegends/social/inbox?rev=` answers 204 while the caller's own `rev` is unchanged, so each poll is one indexed read. Otherwise it answers `{rev, invites, answers, chat}`. The game polls it every 4 s on Home, overlays and the party lobby. It never polls in a match or in a hidden tab. Invites and DMs bump the recipient's `rev`; an answer bumps the inviter's. | `social.service.ts` `inbox`, `social.controller.ts`, `app.ts` `startInbox` |
| **Invite card.** It shows "Mira invites you to a party" with Accept, Decline and a 60 s countdown bar. One card shows at a time, at the top, over every screen. Accept leaves the lobby you are in and joins the inviter's party. | `social/inviteInbox.ts` `inviteCard`, `app.ts` `acceptInvite` |
| **Answers.** `POST /pawlegends/social/invite/:id/answer {answer:'accept'\|'decline'}`. Accept returns the party code, or 410 `PAWLEGENDS_SOCIAL_INVITE_GONE` when the invite has expired or the friend is blocked. The inviter's inbox shows "Mira declined your invite" or "Mira is joining your party" once. | `social.service.ts` `answerInvite` |
| **Invite TTL 60 s** (was 3 min). A friend can be invited again as soon as the last invite expires or is answered. | `social.contracts.ts` |
| **One sim build per party.** An invite carries the inviter's `sim` (`<SIM_VERSION>.<source hash>`). The card names who must update. If your game is the older one, Accept becomes Reload. The relay's `update_required` now reads "Your game is out of date: reload to update and play together". | `inviteInbox.ts` `simCheck`, `party/ui/copy.ts` |
| **Inviting from the friends list.** In a party, every online friend who is not already in it gets Invite. Out of a party, Invite opens PLAY's Mode Select on With Friends. You pick the mode, which keeps the one play path. The invite goes out as soon as the lobby is up. An offline friend still gets the row (and a push if they turned pushes on), and the inviter is told they are offline. | `socialSheet.ts` `rowAction`, `app.ts` `inviteAfterParty` |
| **Inviting from the lobby.** An "Invite friends" button opens the Friends sheet over the lobby. Share, Copy and QR stay for the party code and link. | `party/ui/partyLobby.ts` |
| **Presence words.** The row shows Online, In lobby, In queue, In match or Offline. | `socialSheet.ts` `PRESENCE_TEXT` |
| **Live DMs outside the thread.** When the Friends sheet is closed, a new DM shows a toast like "Mira: see you at 7" with Open. Muted threads show nothing. Open goes straight to the thread. The unread summary now carries the friend's code. | `inviteInbox.ts` `dmToast`, `chat.service.ts` `summary` |
| **A DM keeps its newest 200 messages** on top of the 30-day TTL. | `chat.service.ts` `DM_KEEP`, `trimDm` |
| Host ops `social.inbox` and `invite.answer`, plus the args `sim`, `invite` and `answer`. The game, the host (`pawlegends-web` and the app via OTA) and `shared/pawlegends-bridge.fixtures.json` are updated together. | `embed/api.ts`, `apiBridge.ts` |

No IPs are stored. Rate limits per account: 40 inbox polls a minute (600 per IP), 20 answers a minute, and the existing invite limits (10 per 10 minutes, one pending invite per friend).

## Invite and name fixes (Nov 18)

Reported: an invite showed nothing on the friend's side, and the lobby showed a generated name ("Fancy Calico") for a
player who had set the nickname "zygis".

| Root cause | Fix | Where |
|---|---|---|
| A lobby reconnect re-sent the first party ticket. Tickets live 60 s and are single use per relay process, and production runs two instances. After a phone came back from the background, a network drop, a move to the other instance or a deploy, the relay refused the ticket and the player came back as a guest: a generated name, no presence, so `invite.send` answered "no party" and the friend got nothing. | A reconnect asks the host for a fresh ticket once the held one is 40 s old. A lobby welcomed as a new member asks for its own seat back by the code (the relay hands the same account its seat). | `net/socket.ts` `refreshTicketsWith`, `partyClient.ts` `welcome` |
| The party leader's name came from `memberName` until someone joined (`create` never ran `rename`). | `create` runs `rename`: the leader's nickname shows from the first view. | `party.service.ts` |
| A nickname changed while in a party never reached the relay (chat info cached 10 min, read only at hello). | The relay reads its lobby members' social `rev` every 10 s and reads the chat side again when it moved. | `party-relay.ts` `watchNames`, `relay-chat-info.ts` |
| With two relays, the one where a socket closed cleared the presence the other had just written for the player's new party. | The sink clears only the `relay.at` it wrote itself. | `presence-sink.ts` |
| A friend on Heroes, Recordings or the store read as offline (only the title pulse wrote presence), so the row had no Invite. | The 4 s inbox marks the player online (once a minute). In a party, every friend not in it gets Invite, offline ones too (they get a notification, the inviter is told). | `social.service.ts` `markOnline`, `socialSheet.ts` `rowAction` |
| Invite right after opening a lobby answered "Open a party first" (presence lands within 5 s). | The sheet retries "no party" 4 times, 2 s apart, and says "Inviting Mira…". An invite with no answer after 60 s says "Mira didn't answer your invite". | `socialSheet.ts` `sendInvite`, `app.ts` `watchSentInvite` |

**Friends by nickname.** Add takes a player name (Nov 20: the nickname is every account's unique username and the UI
never shows a code, SOCIAL-RANKED.md §2.4; a pasted old code still works). Typing 2+ letters shows up to 5 nicknames that start with
them (`GET /pawlegends/social/search?q=`, host op `social.search`), with avatar and flag. Add sends `{name}`, matched
exactly on the unique folded `nickKey` (case, accents and look-alikes ignored), so two players can never share a
nickname. Since Nov 20 every registered account has a nickname (assigned from its old shown name when never picked). Answers carry no code or account id; the caller, guests and
blocked players are left out; 40 searches a minute per account (200 per IP), and Add by name counts in the code-lookup
bucket.

## Invites that vanished unseen (Nov 19)

Reported, verbatim: "My friend invite me [Friends sidebar, Irvidas on mobile, Online, row menu "Invite to party"] through
this while was in party, it was written invitation sent but I haven't received anything anywhere. Popup should've
appeared for me to either confirm or reject". The invite row was stored (the inviter saw "Invite sent"), but the
friend's game only polled the inbox off-match, and the row died after 60 s.

| Root cause | Fix | Where |
|---|---|---|
| The inbox stopped while `this.session` or `party.state.inMatch` was set. The party's results keep `inMatch` until Play again or Home, so a player sitting on a party's results (or in any match) got nothing, and `showInvites` dropped the invite on the floor. | The inbox polls on every screen (every other beat in a live match). In a match an invite is a small top notice that takes no input ("Mira invited you to a party. Answer after the match."), the server is told `later`, and the card shows when the match ends. Party results show the card. | `app.ts` `startInbox`, `playingMatch`, `showInvites`, `flushHeldInvite`; `inviteInbox.ts` `matchNotice` |
| The row lived 60 s (`exp`, TTL index). A locked phone, a hidden tab, a match or a backed-off poll (status 0 → up to 60 s) meant the invite expired before the friend's game asked. There is no push (no VAPID keys). | `exp` is now the row's life (10 min; 40 min once `later`), `live` the 60 s popup window. Past its window an unanswered invite still comes back as `missed` with its age while the inviter is in that lobby ("Irvidas invited you to a party 3 min ago"), and Accept works while they are. A tab or app coming back to the front polls at once. | `social.service.ts` `pendingInvites`, `stillInParty`, `answerInvite`; `social.contracts.ts` `INVITE_KEEP_MS`, `INVITE_HOLD_MS` |
| A friend in another lobby could not be invited ("In another lobby", greyed), and accepting from a lobby gave no hint it leaves it. | Invite shows for a friend in another lobby. Their card reads "Leave your party and join Mira?" with Join and Decline; Join leaves the lobby (or the party's results) and joins. | `socialSheet.ts` `rowAction`, `inviteInbox.ts` `inviteCard` (`inParty`) |
| The inviter saw "Invite sent" whatever the friend was doing. | "Sent" only with the stored invite's id. The note says "Mira is in a match: they see it when it ends" or "They are in another lobby" (`busy`), and the inbox answers `later` ("Mira is in a match: they see your invite when it ends") besides accepted and declined; "didn't answer" still comes after the window. | `social.service.ts` `invite`, `inbox`; `socialSheet.ts` `sendInvite` |
| The App Store channel still ran the Nov 18 20:43 UTC bundle (`20261118204310-245a689`), from before the Nov 18 invite fix (0db6eed49). The hourly promote ran twice in 24 h (GitHub skips scheduled runs under load), and each run found nothing soaked newer than that bundle. | Promoted once these fixes shipped (`promote_now`). | `.github/workflows/pawlegends-ota.yml` |

Host contract: `invite.answer` takes `later` (`pawlegends-web` `apiBridge.ts`; the app's host ships in the same OTA bundle).
An older host refuses `later` (the invite then simply runs out on the inviter's side); an older game ignores
`missed`, `held` and `later` (a missed row arrives with `ttl: 0`, so its card closes at once).

## Known limits (not fixed here)

- Pushes for an offline friend still depend on VAPID keys, which are not set. The invite pops up for 60 s and waits up to 10 min while the inviter is in that lobby.
- On GCP's split roles (API on Cloud Run, relay on a VM), `ChatBus` does not reach the relay. The 4 s inbox covers DMs and invites on every layout.
- A player still on an older game build without the inbox op falls back to the 30 s pulse, and its invite toast keeps the old Join-only layout until it reloads.
