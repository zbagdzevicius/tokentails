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

## Known limits (not fixed here)

- Pushes for an offline friend still depend on VAPID keys, which are not set. The invite row expires after 60 s either way.
- On GCP's split roles (API on Cloud Run, relay on a VM), `ChatBus` does not reach the relay. The 4 s inbox covers DMs and invites on every layout.
- A player still on an older game build without the inbox op falls back to the 30 s pulse, and its invite toast keeps the old Join-only layout until it reloads.
