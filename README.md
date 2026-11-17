# Cards Against Decency

A browser party card game with fill-in-the-blank cards, for friends. It is a free, non-commercial project inspired by Pretend You're Xyzzy. It is not affiliated with Cards Against Humanity LLC or Pretend You're Xyzzy.

## Run it

You only need Docker. You do not need Node.js on your computer.

1. Start Docker Desktop.
2. Run `docker compose up`.
3. Open http://localhost:3000.

Run the tests:

```sh
docker compose run --rm app npm test
docker compose run --rm app npm run typecheck
```

To test with friends on the same network, open `http://<your-computer-ip>:3000` on their devices.

## Deploying

The game needs a host that runs one long-running Node.js process, because `server.ts` runs Next.js and the Socket.IO game server together. Vercel and other serverless hosts do not work: they never start `server.ts`.

### Render (free plan)

`render.yaml` describes the service. To deploy:

1. Sign in to Render with GitHub.
2. Click **New > Blueprint** and choose this repository.
3. Click **Apply**. Render builds and starts the game. Each push to `main` deploys again.

What `render.yaml` sets:

- Build: `npm ci && npm run build`. Start: `npm start`. Node.js 22. Region: Frankfurt.
- Health check: `/healthz`. It answers `ok` without rendering a page.
- `CLIENT_IP_HEADER=cf-connecting-ip`: the player's address comes from Cloudflare's header, which a browser cannot fake.
- `TRUST_PROXY=3`: the fallback. Render's `X-Forwarded-For` has 3 proxy entries (checked on 2026-11-17).

Limits of the free plan:

- The service sleeps after 15 minutes without visits or game messages. The next visitor waits about a minute. An uptime monitor (for example UptimeRobot) that calls `/healthz` every 5 minutes keeps it awake. This uses most of the 750 free hours each month, so it works for one service only.
- A sleep, a restart or a deploy deletes all live rooms.

### Rules for any host

- Run **one instance only**. Live rooms are in memory, so a second instance does not see them.
- **Tell the server where the real player address is.** Without this, every player looks like the same IP address, so the rate limits cover all players at once and a ban blocks everyone.
  - `CLIENT_IP_HEADER`: a header that the host's edge network sets and protects (`cf-connecting-ip`, `true-client-ip` or `x-real-ip`). Use it only when every request passes through that network.
  - `TRUST_PROXY`: the number of entries that the host's proxies add to `X-Forwarded-For`. The server counts that many from the right. Never trust the left side: a browser can write it.
- Rate limits for each IP address: 60 create, join and leave actions each minute, and 300 name and room checks each minute. Friends on one Wi-Fi share one IP address.

## Test players (development only)

Add fake human players to a local room, to test with more people:

```sh
docker compose exec app npm run dev:players -- <ROOM CODE> [count] [--idle] [--password=...]
```

- The players are called "Tester Ana", "Tester Bo", and so on. If a name is in use, the script adds a number. The game treats them as people, not bots.
- Without `--idle`, they play random cards and choose random answers as Card Czar.
- Press Ctrl+C to remove them from the room.
- The script refuses to run when `NODE_ENV` is `production`.

## Structure

| Path | Purpose |
| --- | --- |
| `src/engine/` | Game rules. Pure TypeScript, with no UI or network code. Tested in `game.test.ts`. |
| `src/server/` | Socket.IO server: rooms, sessions, validation, rate limits, security log. |
| `src/lib/protocol.ts` | Event and data types shared by the browser and the server. |
| `src/components/`, `src/app/` | Next.js UI. |
| `data/decks/` | Decks in the internal format. The server loads every `.json` file here. |
| `scripts/` | Deck import scripts. |
| `server.ts` | Entry point. Runs Next.js and Socket.IO in one process. |

## Rules that the server enforces

- The server holds all game state. The browser only sends actions.
- The server checks every action: who sent it, the game phase, and the cards in the player's hand.
- The Card Czar sees answers without names. The server sends names only after the Czar chooses.
- Bots play random cards from their hand. They never judge, write cards, or chat.
- A player who misses a round (does not play, or does not choose as Card Czar) gets a red warning. A second missed round in a row removes them from the game. The removed player sees why, and the other players see a red notice.
- A disconnected player keeps their seat for 90 seconds.
- A room closes when the last human player leaves, or after 2 hours with no activity.
- Players must accept the current `TERMS_VERSION` before they create or join a room.
- Only public rooms appear in the game list. The list never contains session tokens or player ids.
- Spectators see the game without cards. The Card Czar's anonymity rules apply to them too.
- Names are unique on the whole server, without case differences. Names like "Bot 1" are for bots only.
- When the host leaves, the human player who joined earliest becomes host. A room with only bots closes.
- Leaving the room screen in the app (the logo or the back button) keeps the seat for 90 seconds. The game list then shows "You are still in a game" with "Back to game" and "Leave game".
- Creating or joining another game leaves the previous one at once. "Log out" also leaves it.

## Assumptions in version 1

These are decisions that the brief did not specify. Change them if you want different behaviour.

- A game needs at least 3 participants (the Card Czar and 2 players). Bots count as participants.
- The hand size is fixed at 10 cards.
- When the Card Czar does not choose in time, nobody scores and the cards go back to the players' hands.
- When the Card Czar leaves, the round is cancelled.
- Players score "Offences". One Offence is one point. Decks, bots and the Offences to win change only in the lobby. Time limits and late joining can change at any time.
- Bans exist only while the room exists. A ban covers the player's session token and a hashed IP.
- New rooms are public. The host can make a room private when they create it, or later in the lobby.
- A spectator can start to play under the same rules as a late joiner.
- In Phase 1, decks are JSON files. PostgreSQL is not used yet. Add it when Phase 2 needs saved custom decks.

## Card content

`data/decks/cah-base.json` holds the Cards Against Humanity base set (CC BY-NC-SA 2.0). The text comes from [JSON Against Humanity](https://github.com/crhallberg/json-against-humanity) (CC BY-NC-SA 4.0). The import removed 10 duplicate cards. To import again:

```sh
docker compose run --rm -v /path/to/folder:/src:ro app \
  npm run import:jah -- /src/cah-all-full.json "CAH Base Set" cah-base
```

## Imported decks

The host can import user-made decks from [Many Decks](https://decks.rereadgames.com) by their 5-character code. The lobby links to a [pack browser](https://certifriedmultitool.com/cah/packs) and to Many Decks.

- The server fetches only from `decks.rereadgames.com/api/decks/{code}`, with a timeout and a size limit.
- The server converts and checks every card: plain text only, at most 200 characters, 1–3 blanks.
- Imported decks exist only in the room's memory. They are not stored or redistributed.
- Nobody moderates these decks. A public game with an imported deck shows a "Custom decks" label in the game list.
- Limits: 10 imported decks in each room, 10 imports each minute from one IP address.

## Sound credits

The game sounds come from [Pixabay](https://pixabay.com/sound-effects/) under the Pixabay Content License. The files in `public/sounds/` are shortened versions that the game plays. The original downloads stay in `assets/sounds-src/` on the developer's computer only: that folder is in `.gitignore`, because the licence does not allow sharing the raw files on their own.

| File | Original on Pixabay | Use |
| --- | --- | --- |
| `turn-funny.mp3` | "Horn" by digitalstore07 (ID 430368), first blast only | "Your turn", Funny style |
| `idle-warning.mp3` | "Suspenseful Boom" by Dragon Studio (ID 451863), from 1.4 s | The red idle warning |
| `removed.mp3` | "Thud Sound Effect" by Dragon Studio (ID 405470), 0.3–2.0 s | Removed for being idle, or by the host |
| `banned.mp3` | "faaah" from myinstants.com, uploaded by SpicyIceCream, from 0.08 s. **Licence unclear: replace with a licensed sound before a public launch.** | Banned by the host (only the banned player hears it) |

## Not in version 1

Chat, the activity log, Player Cards, saved custom decks, and community deck imports are planned for Phases 2–4 in the project brief. The public game list exists, but the extra moderation that the brief asks for with public games (Phase 4) does not exist yet.
