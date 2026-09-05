# Realtime Poker

## Project Overview

Realtime Poker is a server-authoritative multiplayer Texas Hold'em application. All game logic runs on the server — clients only send actions and render state — which prevents cheating and keeps every player's view consistent in real time. The game supports up to 6 players per room, full betting rounds (pre-flop through river), all-ins with correct main pot and side pot splitting, showdown hand evaluation, a leaderboard, and animated card dealing.

**Documentation**
- [Architecture](docs/architecture.md) — how the client, server, and game engine fit together
- [How side pots work](docs/side-pots.md) — the intuition behind the pot-splitting logic

### Tech Stack

**Backend**
- Node.js
- TypeScript
- WebSocket (`ws`) — bidirectional real-time communication
- In-memory state management (no database)

**Frontend**
- React 18
- TypeScript
- Vite

---

## Get Started

The app is live at: https://realtime-poker-teal.vercel.app/

### Run it locally

```bash
npm run install:all   # install server and client dependencies
npm run dev:server    # WebSocket server on :8080
npm run dev:client    # Vite dev server, in a second terminal
```

Tests and typechecking live in `server/`:

```bash
cd server
npm test          # poker rules: side pots, all-ins, chip conservation
npm run typecheck
```

### 1. Pick a Name

On the lobby page, enter the display name you want to be known by at the table.

### 2. Create or Join a Room

After creating your character, you will land in the lobby. From here you can:
- **Create a new room** — generates a room code you can share with others
- **Join an existing room** — enter a room code to sit at that table

Rooms support up to 6 players.

### 3. Start the Game

Once 2 or more players are seated in the room, the host can start the game. Each player is dealt 2 hole cards and the first betting round (pre-flop) begins.

### 4. Play

Players take turns acting in order. On your turn you will be prompted with the actions available to you:

| Action | When Available |
|--------|---------------|
| Fold | Any time |
| Check | When there is no bet to call |
| Call | When there is an outstanding bet |
| Bet | When no bet has been placed yet |
| Raise | When there is an existing bet |
| All-In | Any time |

A raise must be at least as large as the previous raise, and you can always move all-in for less if that is your whole stack.

The hand progresses through the flop (3 community cards), turn (1 card), and river (1 card), with a betting round after each. At showdown, the best 5-card hand wins the pot.

When players are all-in for different amounts, the pot splits into a main pot and side pots: you can only win the chips you covered. Any chips nobody matched are handed straight back. If everyone left in the hand is all-in, the remaining community cards are dealt out automatically. See [How side pots work](docs/side-pots.md).

### 5. Leaderboard and Next Hand

After each hand concludes, a results screen shows the winner and updated chip counts. The game then prompts all players to continue to the next hand. After the session, a leaderboard displays final standings before redirecting everyone back to the lobby.

---

## Visuals
No rooms available.
<img width="1552" height="939" alt="Screenshot 2026-03-04 at 9 24 44 PM" src="https://github.com/user-attachments/assets/52589221-3e7e-4871-baa2-13ab07952db6" />

A room is available to join.
<img width="1552" height="939" alt="Screenshot 2026-03-04 at 9 25 33 PM" src="https://github.com/user-attachments/assets/dacc4403-faef-4964-8077-ac8d3519d5ee" />

You joined a room.
<img width="1552" height="939" alt="Screenshot 2026-03-04 at 9 26 50 PM" src="https://github.com/user-attachments/assets/eb25178b-dc28-4f15-9a19-74ad83244502" />

Room has started.
<img width="1552" height="939" alt="Screenshot 2026-03-04 at 9 28 37 PM" src="https://github.com/user-attachments/assets/c24b84bf-0de6-4402-ae66-2296e55c39f6" />

Players have been eliminated.
<img width="1552" height="939" alt="Screenshot 2026-03-04 at 9 30 26 PM" src="https://github.com/user-attachments/assets/e3e4d5e2-bec6-44bb-a858-c74b2e6b8bb1" />

Final standings.



---

## Outcomes

*Coming soon.*
