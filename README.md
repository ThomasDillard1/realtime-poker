# Realtime Poker

A minimal server-authoritative real-time multiplayer poker application.

## Project Structure

```
realtime-poker/
├── server/          # Node.js + TypeScript + WebSocket
│   └── src/
│       ├── game/    # GameManager, GameEngine
│       ├── types/   # Shared type definitions
│       └── websocket/
└── client/          # React + TypeScript + Vite
    └── src/
        ├── components/
        ├── hooks/
        └── types/
```

## Getting Started

```bash
# Install dependencies
npm run install:all

# Start the server (ws://localhost:8080)
npm run dev:server

# Start the client (http://localhost:3000)
npm run dev:client
```

## Architecture

- **Server-authoritative**: All game logic runs on the server. Clients only send actions and render state.
- **In-memory state**: No database. State stored in `Map<roomId, Room>`.
- **WebSocket communication**: Real-time bidirectional updates.
- **DTO pattern**: Players only see their own cards; others are hidden.

## Game Flow

1. **Create/Join Room** - Players enter a room (max 6 players)
2. **Start Game** - Requires 2+ players
   1. Validation - At least 2 players, game not already in progress
   2. Deck creation - 52 cards shuffled
   3. Dealer selection - Random for first hand
   4. Position assignment - Dealer, Small Blind (D+1), Big Blind (D+2)
   5. Card dealing - 2 cards to each player
   6. Blind posting - SB and BB deducted from chips, added to pot
   7. Current player set - First to act is D+3 (after big blind)
   8. Broadcast - Each player receives personalized `game-started` with their own cards (others see `handSize` only)
   9. Action required - Current player notified with valid actions
3. **Betting Rounds** - Pre-flop, Flop, Turn, River
4. **Showdown** - Best hand wins the pot

## Player Actions

| Action   | Description                                      |
|----------|--------------------------------------------------|
| `fold`   | Surrender the hand, marked as folded             |
| `check`  | Pass action (only when no bet to call)           |
| `call`   | Match the current bet                            |
| `bet`    | Place a bet (when no current bet)                |
| `raise`  | Increase the current bet                         |
| `all-in` | Bet all remaining chips                          |

## Action Processing Flow

1. Validate it's the player's turn and action is valid
2. Process the action (update chips, pot, bets)
3. Check if only one player remains (everyone else folded) → hand complete
4. Check if betting round is complete (all bets equal) → advance phase
5. Otherwise advance to next active player
6. Broadcast `game-updated` to all players
7. Send `action-required` to current player (or `hand-complete` if hand ended)

## Phase Progression

```
pre-flop → flop (3 cards) → turn (1 card) → river (1 card) → showdown
```
