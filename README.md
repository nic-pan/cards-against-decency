# Blank Slate (working title)

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
- A player who misses two rounds in a row becomes "away" and sits out. The player can come back.
- A disconnected player keeps their seat for 90 seconds.
- A room closes when the last human leaves, or after 2 hours with no activity.

## Assumptions in version 1

These are decisions that the brief did not specify. Change them if you want different behaviour.

- A game needs at least 3 participants (the Card Czar and 2 players). Bots count as participants.
- The hand size is fixed at 10 cards.
- When the Card Czar does not choose in time, nobody scores and the cards go back to the players' hands.
- When the Card Czar leaves, the round is cancelled.
- Decks, bots and the points to win change only in the lobby. Time limits and late joining can change at any time.
- Bans exist only while the room exists. A ban covers the player's session token and a hashed IP.
- In Phase 1, decks are JSON files. PostgreSQL is not used yet. Add it when Phase 2 needs saved custom decks.

## Card content

`data/decks/cah-base.json` holds the Cards Against Humanity base set (CC BY-NC-SA 2.0). The text comes from [JSON Against Humanity](https://github.com/crhallberg/json-against-humanity) (CC BY-NC-SA 4.0). The import removed 10 duplicate cards. To import again:

```sh
docker compose run --rm -v /path/to/folder:/src:ro app \
  npm run import:jah -- /src/cah-all-full.json "CAH Base Set" cah-base
```

## Not in version 1

Chat, the activity log, Player Cards, saved custom decks, public rooms, and community deck imports are planned for Phases 2–4 in the project brief.
