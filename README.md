# Realtime Poker

## Project Overview

Realtime Poker is a server-authoritative multiplayer Texas Hold'em application. All game logic runs on the server — clients only send actions and render state — which prevents cheating and keeps every player's view consistent in real time. The game supports up to 6 players per room, full betting rounds (pre-flop through river), showdown hand evaluation, a leaderboard, and animated card dealing.

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

### 1. Create a Character

On the landing page, enter a display name and any other character details to identify yourself at the table. This creates your player profile for the session.

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

The hand progresses through the flop (3 community cards), turn (1 card), and river (1 card), with a betting round after each. At showdown, the best 5-card hand wins the pot.

### 5. Leaderboard and Next Hand

After each hand concludes, a results screen shows the winner and updated chip counts. The game then prompts all players to continue to the next hand. After the session, a leaderboard displays final standings before redirecting everyone back to the lobby.

---

## Visuals

*Screenshots coming soon.*

---

## Outcomes

*Coming soon.*
