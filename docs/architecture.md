# Architecture

A server-authoritative, real-time multiplayer Texas Hold'em game. This document
describes the system **as built**. For the intuition behind the pot-splitting
math specifically, see [side-pots.md](./side-pots.md).

---

## 1. High-Level Architecture

```
┌────────────────┐   WebSocket    ┌──────────────────────────────────────┐
│  React client  │ ◄────────────► │  Node server                         │
│                │   JSON msgs    │                                      │
│  Lobby         │                │  WebSocketServer.ts  connections,    │
│  Table         │                │                      routing, timers │
│  CardDisplay   │                │  GameManager.ts      rooms in memory │
│                │                │  GameEngine.ts       poker rules     │
│                │                │  pots.ts             pot splitting   │
└────────────────┘                └──────────────────────────────────────┘
```

### Server (`server/src`)

| File | Responsibility |
|---|---|
| `index.ts` | Entry point; starts the WebSocket handler on `PORT` (default 8080). |
| `websocket/WebSocketServer.ts` | Connection lifecycle, message routing, per-room turn timers, broadcasting, DTO construction, hand-completion payouts. |
| `game/GameManager.ts` | Singleton holding `Map<roomId, Room>`. Create/join/leave, auto-deletes empty rooms. No persistence. |
| `game/GameEngine.ts` | All poker rules: dealing, blinds, valid actions, betting rounds, phase progression, hand evaluation, hand resolution. Pure functions over `GameState` + `Map<string, Player>`. |
| `game/pots.ts` | Pot layering and awarding. Pure, no game-state coupling. |
| `types/index.ts` | Shared domain types, wire messages, and DTOs. |

### Client (`client/src`)

| File | Responsibility |
|---|---|
| `hooks/useWebSocket.ts` | Connection + JSON send/receive. |
| `App.tsx` | Top-level state machine: lobby ↔ table, holds the latest `GameStateDTO`. |
| `components/Lobby.tsx` | Name entry, room list, create/join. |
| `components/Table.tsx` | Table rendering, pot display, action panel, showdown overlay. |
| `components/CardDisplay.tsx` | Card rendering. |
| `types/index.ts` | Mirror of the server's wire types. |

### Server-authoritative model

Clients send *intent* (`player-action`) and render *state*. They never compute
game outcomes. Every rule — whose turn it is, which actions are legal, how much
a raise must be, who wins which pot — is decided on the server, and the client
is told the result.

Consequences that matter in the code:

- **Hole cards are filtered per client.** `toGameStateDTO(room, forPlayerId)`
  builds a different payload for every connection: your own cards in `myCards`,
  everyone else reduced to `handSize`.
- **The client never derives betting limits.** `minRaise` is computed by the
  server and shipped in `GameStateDTO`; `Table.tsx` uses it as the slider
  minimum rather than recomputing the rule.
- **Invalid actions are rejected, not prevented.** `processAction` re-checks the
  turn and re-derives `getValidActions` before touching any chips.

---

## 2. Rooms and Connections

`GameManager` is a singleton with an in-memory `Map`. State is lost on restart,
which is a deliberate trade for having no database in a prototype.

- A room holds up to 6 players and fixed blinds (10 / 20). Players start with
  1000 chips.
- Joining is blocked once `room.gameState !== null` — you cannot sit down mid-hand.
- Removing the last player deletes the room.

`WebSocketServer` keeps a `Map<WebSocket, ClientConnection>` associating each
socket with a `playerId` and `roomId`, which is how broadcasts are scoped to a
room and how per-client card filtering is done.

### Turn timers, away players, and rejoin

- Each turn starts a 30s timer (`ACTION_TIMER_SECONDS`), one per room. The
  deadline is broadcast in `action-required` so every client renders the same
  countdown. On expiry the server auto-checks if checking is legal, otherwise
  auto-folds.
- `leave-game` marks a player `isAway` rather than removing them: they fold out
  of the current hand (immediately if it is their turn), and while away their
  turns are auto-folded with no timer. `rejoin-game` clears the flag and replays
  the current state to them.
- A hard disconnect (`close`) removes the player from the room outright. Chips
  they already put in the pot stay in the pot and are treated as folded.

---

## 3. Game State

```ts
interface GameState {
  roomId: string;
  phase: GamePhase;                       // waiting | pre-flop | flop | turn | river | showdown | complete
  deck: Card[];                           // remaining undealt cards
  communityCards: Card[];                 // 0-5 shared cards
  pot: number;                            // every chip committed this hand
  currentBet: number;                     // the amount to match on this street
  minRaise: number;                       // minimum TOTAL a raise must reach
  lastRaiseSize: number;                  // size of the last full raise increment
  bigBlind: number;
  currentPlayerIndex: number;             // index into playerOrder
  dealerIndex: number;                    // index into playerOrder
  playerOrder: string[];                  // seat order for this hand
  roundBets: Map<string, number>;         // committed on the CURRENT street
  playerContributions: Map<string, number>; // committed across the WHOLE hand
  playersActed: Set<string>;              // acted since the last full raise
  lastRaiser: string | null;
  handNumber: number;
}
```

### Three different "bet" numbers

This is the distinction side pots depend on, so it is worth being precise:

| Field | Scope | Reset when |
|---|---|---|
| `player.bet` | Current street, per player. Rendered as the chips in front of a seat. | Each new street |
| `gameState.roundBets` | Current street, per player. Drives "have you matched `currentBet`?" | Each new street |
| `gameState.playerContributions` | **The whole hand**, per player. The ledger pots are built from. | Each new hand |

`roundBets` answers "can this betting round end?"; `playerContributions` answers
"what is each player entitled to win?". Conflating them is what makes naive
implementations mishandle all-ins that happen on early streets.

`playersActed` means *acted since the last full raise*, not *acted this street* —
a full raise clears it so everyone gets to respond again.

---

## 4. Hand Lifecycle

```
waiting ─► pre-flop ─► flop ─► turn ─► river ─► showdown ─► (payout) ─► next hand
                └──────────── all folded ────────────┘
```

1. **Setup** (`startGame` / `startNextHand`) — build `playerOrder` from players
   with chips, rotate the button, shuffle, deal 2 cards each, post blinds.
   `startNextHand` also marks players with 0 chips as `out` and returns `null`
   when fewer than 2 players remain, which ends the game.
2. **Betting** (`processAction`) — validate turn and action, move chips, then ask
   `isBettingRoundComplete`: every still-active player has acted since the last
   full raise *and* matched `currentBet`. All-in players are excluded — they
   cannot act and cannot match.
3. **Street change** (`advancePhase`) — clear `roundBets` / `playersActed` /
   `currentBet`, reset each `player.bet`, deal the next community cards, and set
   action to the first active player left of the button.
4. **Runout** — if fewer than 2 players can still act (everyone else is all-in),
   there is nothing left to bet. `advancePhase` returns `'runout'` and the
   WebSocket layer calls `advanceRunoutPhase` on a 1.5s timer per street so the
   remaining board is dealt one card at a time for the players to watch. Hole
   cards of all-in players are revealed early via `revealedHands`.
5. **Resolution** (`settleHand`) — refunds, then payouts. See §6.
6. **Next hand** — `hand-complete` is broadcast, `room.gameState` is cleared, and
   after 6s the server auto-starts the next hand, removing busted players and
   recording them in `room.eliminatedPlayers` for the final standings. When one
   player is left, `game-over` carries the standings.

### Blinds

`postBlind` deducts `min(stack, blind)`. A player whose stack cannot cover the
blind posts what they have and is marked **all-in immediately** — they stay
eligible for the portion of the pot they paid for. (Leaving them `active` with
zero chips would make `fold` their only legal action, forfeiting money they
already have equity in.)

---

## 5. Betting Rules as Implemented

`getValidActions` derives the legal set from `toCall = currentBet - roundBets[player]`:

| Action | Offered when |
|---|---|
| `fold` | Always (for an active player) |
| `check` | `toCall === 0` |
| `call` | `toCall > 0` and the player has chips (short stacks call all-in for less) |
| `bet` | `currentBet === 0`, stack exceeds `toCall`, and there is room under the effective stack |
| `raise` | `currentBet > 0`, stack exceeds `toCall`, and there is room under the effective stack |
| `all-in` | Only when it would commit *more* than a call — otherwise it is the call |

**Raise sizing.** A raise must reach `minRaise = currentBet + lastRaiseSize`.
Pre-flop `lastRaiseSize` starts at one big blind, so the first raise must reach
2 BB; after a raise to 60 over a 20 bet the increment is 40, so the next raise
must reach 100. The exception is a player whose whole stack is smaller than that
— they may always put it all in.

**Short all-ins do not re-open the betting.** `applyAggression` compares the
increment against `lastRaiseSize`:

- *Full raise* (increment ≥ `lastRaiseSize`): raises `currentBet`, updates
  `lastRaiseSize`, and clears `playersActed` so everyone gets action again.
- *Short all-in* (increment < `lastRaiseSize`): raises `currentBet` — others must
  still call the higher amount — but does **not** clear `playersActed`. A player
  who already acted may only call or fold, which `getValidActions` enforces by
  withholding `bet`/`raise` from anyone already in `playersActed` who is facing a
  bet.

**The effective stack caps every voluntary bet.** `effectiveMaxBet` returns the
most a player can usefully have out on this street:

```
min(own stack + own bet, max over non-folded opponents of (their stack + their bet))
```

No opponent can call more than they own, so chips above that ceiling could never
be matched. Rather than take them and hand them back as a refund, they never
leave the stack: **going all-in against a shorter stack is a call, not a shove**.
The player keeps the remainder and stays `active` rather than being marked
all-in. Multiway the ceiling is the *deepest* remaining opponent, since they
could still call. A bet or raise above the ceiling is trimmed to it, and the
minimum-raise rule is waived when a player is committing their whole effective
stack.

Blinds are exempt — they are forced, posted in full, and refunded if nobody
covers them.

**Chip movement** goes through one function, `commitTo`, which moves
`min(target - alreadyBet, stack)` chips and updates `player.bet`, `roundBets`,
`playerContributions`, and `pot` together, marking the player all-in at zero.
Call, bet, raise, and all-in are all thin wrappers over it, so the four paths
cannot drift apart.

---

## 6. Pots and Payouts

Full explanation and worked examples: [side-pots.md](./side-pots.md).

`pots.ts` exposes two pure functions:

- `buildPots(contributions)` → `{ pots, refunds }`. Contributions are sliced at
  every distinct contribution level. Each layer is funded by everyone who reached
  it (**including folded players** — forfeited chips stay in) and can be won by
  the non-folded subset. A layer only one player funded was never matched by
  anyone, so it becomes a **refund** rather than a pot. Adjacent layers with
  identical eligibility are merged. Guarantees
  `sum(pots) + sum(refunds) === sum(contributions)`.
- `awardPots(pots, scores, seatOrder)` → `{ winnings, results }`. The best
  eligible score takes each pot; ties split, with odd chips handed out in seat
  order. `winnings` is the per-player total to credit; `results` names each pot's
  winner(s) in pot order, which is what lets the UI say "Main pot $300 — Alice,
  Side pot 1 $400 — Bob" instead of one merged number.

`GameEngine.settleHand` is the **single resolution path** for every ending —
showdown, all-in runout, or everyone folding to one player. The fold case needs
no branch: the last player standing is simply the only eligible player in every
pot. It returns `{ winners, sidePots, refunds, contestedPot }`, credits refunds
first and then pot winnings, and the WebSocket layer just reports the result.

`calculateSidePots` is the same layering used for live display in
`GameStateDTO.sidePots`, so the breakdown shown during a hand and the one at
showdown come from the same code. Uncalled chips are excluded from the breakdown
because nobody is contesting them.

### Settled vs. in-play chips

Chips bet on the current street sit in front of players until the street ends —
the standard poker-table convention, and the reason there are two pot numbers:

- `GameStateDTO.pot` — every chip committed this hand, including current-street bets.
- `GameStateDTO.settledPot` — chips from *completed* streets only, computed by
  `settledContributions(gameState)` (contribution minus `roundBets`). This is the
  headline "Pot" the client shows; the difference is rendered as "$N in play".

The live `sidePots` breakdown is layered from settled contributions too. Settled
chips are always fully matched, so the breakdown is stable for the whole street.
Layering the raw contributions instead would slice every unmatched bet into
transient layers that vanish as calls come in — pots that never existed.

### Card reveal at showdown

`toShowdownPlayerDTO` reveals cards only for players still in the hand, and only
when `isShowdown`. All hands are revealed when there are side pots or everyone is
all-in (no further betting was possible, so revealing hides nothing). Otherwise
reveal walks the showdown order from the last aggressor and stops after the last
winner, mimicking a live table where losing hands can be mucked.

---

## 7. Wire Protocol

### Client → Server

```ts
type ClientMessage =
  | { type: 'create-room';     payload: { roomName: string; playerName: string } }
  | { type: 'join-room';       payload: { roomId: string; playerName: string } }
  | { type: 'leave-room';      payload: { roomId: string; playerId: string } }
  | { type: 'start-game';      payload: { roomId: string } }
  | { type: 'start-next-hand'; payload: { roomId: string } }
  | { type: 'player-action';   payload: { roomId: string; playerId: string; action: PlayerAction } }
  | { type: 'get-rooms';       payload: Record<string, never> }
  | { type: 'leave-game';      payload: { roomId: string; playerId: string } }
  | { type: 'rejoin-game';     payload: { roomId: string; playerId: string } };
```

`PlayerAction.amount` is the **total** the player wants their bet for this street
to reach, not the increment.

### Server → Client

```ts
type ServerMessage =
  | { type: 'room-created';    payload: { room: RoomDTO } }
  | { type: 'room-joined';     payload: { room: RoomDTO; playerId: string } }
  | { type: 'player-joined';   payload: { roomId: string; player: PlayerDTO } }
  | { type: 'player-left';     payload: { roomId: string; playerId: string } }
  | { type: 'game-started';    payload: { gameState: GameStateDTO } }
  | { type: 'game-updated';    payload: { gameState: GameStateDTO } }
  | { type: 'action-required'; payload: { playerId: string; validActions: ActionType[]; turnDeadline: number } }
  | { type: 'hand-complete';   payload: HandCompletePayload }
  | { type: 'game-over';       payload: GameOverPayload }
  | { type: 'rooms-list';      payload: { rooms: RoomDTO[] } }
  | { type: 'error';           payload: { message: string } }
  | { type: 'left-game';       payload: { roomId: string; playerId: string } }
  | { type: 'player-away';     payload: { roomId: string; playerId: string; isAway: boolean } }
  | { type: 'game-rejoined';   payload: { room: RoomDTO; playerId: string; gameState?: GameStateDTO; handComplete?: HandCompletePayload } };
```

Key payloads:

```ts
interface GameStateDTO {
  roomId: string;
  phase: GamePhase;
  communityCards: Card[];
  pot: number;                  // total committed this hand, incl. current-street bets
  settledPot: number;           // chips from completed streets only
  sidePots: SidePotDTO[];       // contested pots, main first, layered from settled chips
  currentBet: number;
  minRaise: number;             // minimum total a raise must reach
  bigBlind: number;
  currentPlayerId: string | null;
  players: PlayerDTO[];         // handSize only, never other players' cards
  myMaxBet: number;             // most this client can usefully bet (effective stack)
  myCards?: Card[];             // this client's hole cards
  revealedHands?: { playerId: string; cards: Card[] }[];  // set during an all-in runout
}

interface HandCompletePayload {
  winners: Winner[];            // per-player totals across all pots won
  players: ShowdownPlayerDTO[]; // cards revealed per §6
  communityCards: Card[];
  pot: number;                  // contested pot, after refunds
  potResults: PotResultDTO[];   // per pot: amount, who could win it, who did
  refunds: RefundDTO[];         // uncalled chips returned to whoever bet them
  isShowdown: boolean;          // false when everyone folded
}
```

### Sequence: a betting action

```
1. Client → Server   player-action { roomId, playerId, action }
2. Server            clear the room's turn timer
3. Server            processAction: validate turn → validate action → move chips
4. Server            round complete? advance the street / start a runout
5. Server → clients  game-updated (personalised per client)
6a. more betting     action-required { playerId, validActions, turnDeadline } + start timer
6b. runout           deal one street per 1.5s tick, broadcasting game-updated
6c. hand over        settleHand → credit refunds and winnings → hand-complete
7. Server            after 6s auto-start the next hand, or broadcast game-over
```

---

## 8. Testing

`server/src/game/pots.test.ts` and `server/src/game/engine.test.ts` run on the
built-in Node test runner through `tsx` (no extra dependencies):

```bash
cd server
npm test          # unit + end-to-end poker scenarios
npm run typecheck
```

`pots.test.ts` covers the layering rules directly, including a randomised
property test asserting chip conservation and monotonically shrinking
eligibility across 500 generated cases. `engine.test.ts` plays real hands through
`processAction` — multi-way all-ins, folded contributors, split pots, blind
all-ins, runouts — and asserts after **every action** that `sum(stacks) + pot`
never changes.

---

## 9. Known Limitations

- In-memory only: a restart drops every room and game.
- No user authentication; a player is identified by a random id held by their socket.
- No reconnect-by-token — a hard disconnect removes the player from the room.
- Fixed 6-max, fixed 10/20 blinds, fixed 1000-chip starting stack; no buy-ins,
  rebuys, blind escalation, or antes.
- No rake, no hand history, no multi-table play.
