# Minimal Server-Authoritative Real-Time Multiplayer Poker App

## 1. High-Level Architecture

### Backend (Node.js + TypeScript)
- **WebSocket Server** (using `ws` or Socket.IO)
  - Manages client connections
  - Routes events to game logic
  - Broadcasts state updates
- **Game Manager** (singleton/service)
  - Maintains all active rooms in-memory (Map<roomId, Room>)
  - Handles room creation/joining
- **Game Engine**
  - Processes game actions (bet, fold, check, call, raise)
  - Enforces poker rules
  - Manages turn progression and hand evaluation
  - Determines winners

### Frontend (React + TypeScript)
- **WebSocket Client** (hooks-based)
- **Game UI Components**
  - Lobby/Room selector
  - Table view (players, community cards, pot)
  - Action buttons (bet, fold, call, raise)
  - Player hand display

### Communication Flow
```
Client → WebSocket → Server validates → Updates GameState → Broadcasts to all clients
```

**Design Decision**: Server-authoritative means all game logic runs on the server. Clients only send actions and render state. This prevents cheating and keeps clients simple.

---

## 2. Core Data Models (TypeScript)

```typescript
// ============================================
// CORE TYPES
// ============================================

type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';
type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A';

interface Card {
  suit: Suit;
  rank: Rank;
}

type PlayerStatus = 'waiting' | 'active' | 'folded' | 'all-in' | 'out';
type GamePhase = 'waiting' | 'pre-flop' | 'flop' | 'turn' | 'river' | 'showdown' | 'complete';

// ============================================
// PLAYER MODEL
// ============================================

interface Player {
  id: string;                    // Unique player identifier
  name: string;                  // Display name
  chips: number;                 // Current chip count
  bet: number;                   // Current bet in this round
  hand: Card[];                  // Private cards (2 cards in Texas Hold'em)
  status: PlayerStatus;          // Current player state
  isDealer: boolean;             // Dealer button position
  isSmallBlind: boolean;
  isBigBlind: boolean;
}

// ============================================
// ROOM MODEL
// ============================================

interface Room {
  id: string;                    // Unique room identifier
  name: string;                  // Room name
  players: Map<string, Player>;  // Player map (playerId → Player)
  maxPlayers: number;            // Room capacity (typically 6 or 9)
  smallBlind: number;            // Small blind amount
  bigBlind: number;              // Big blind amount
  gameState: GameState | null;   // Current game (null if not started)
  createdAt: number;             // Timestamp
}

// ============================================
// GAME STATE MODEL
// ============================================

interface GameState {
  roomId: string;                // Reference to parent room
  phase: GamePhase;              // Current game phase
  deck: Card[];                  // Remaining cards in deck
  communityCards: Card[];        // Shared cards (0-5 cards)
  pot: number;                   // Total chips in pot
  currentBet: number;            // Current bet to match
  currentPlayerIndex: number;    // Index of player whose turn it is
  dealerIndex: number;           // Index of dealer
  playerOrder: string[];         // Ordered list of player IDs
  roundBets: Map<string, number>; // Bets placed this betting round
  handNumber: number;            // Hand counter for this room
}

// ============================================
// ACTION TYPES
// ============================================

type ActionType = 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'all-in';

interface PlayerAction {
  playerId: string;
  action: ActionType;
  amount?: number;               // For bet/raise actions
}

// ============================================
// HAND RESULT
// ============================================

type HandRank =
  | 'high-card'
  | 'pair'
  | 'two-pair'
  | 'three-of-a-kind'
  | 'straight'
  | 'flush'
  | 'full-house'
  | 'four-of-a-kind'
  | 'straight-flush'
  | 'royal-flush';

interface HandResult {
  playerId: string;
  rank: HandRank;
  cards: Card[];                 // Best 5-card hand
  score: number;                 // Numeric score for comparison
}

interface Winner {
  playerId: string;
  amount: number;
  handResult: HandResult;
}
```

**Design Decisions**:
- **Map vs Array for players**: Map provides O(1) lookup by ID, critical for server performance
- **playerOrder array**: Separate ordered list makes turn rotation simple
- **roundBets tracking**: Track bets per betting round to know when all players have acted
- **Simple status enum**: Covers all player states without over-engineering

---

## 3. Event Flow (WebSocket Messages)

### Client → Server Events

```typescript
// ============================================
// CLIENT → SERVER MESSAGES
// ============================================

type ClientMessage =
  | { type: 'create-room'; payload: { roomName: string; playerName: string } }
  | { type: 'join-room'; payload: { roomId: string; playerName: string } }
  | { type: 'leave-room'; payload: { roomId: string; playerId: string } }
  | { type: 'start-game'; payload: { roomId: string } }
  | { type: 'player-action'; payload: { roomId: string; playerId: string; action: PlayerAction } };
```

### Server → Client Events

```typescript
// ============================================
// SERVER → CLIENT MESSAGES
// ============================================

type ServerMessage =
  | { type: 'room-created'; payload: { room: RoomDTO } }
  | { type: 'room-joined'; payload: { room: RoomDTO; playerId: string } }
  | { type: 'player-joined'; payload: { roomId: string; player: PlayerDTO } }
  | { type: 'player-left'; payload: { roomId: string; playerId: string } }
  | { type: 'game-started'; payload: { gameState: GameStateDTO } }
  | { type: 'game-updated'; payload: { gameState: GameStateDTO } }
  | { type: 'action-required'; payload: { playerId: string; validActions: ActionType[] } }
  | { type: 'hand-complete'; payload: { winners: Winner[]; newGameState: GameStateDTO } }
  | { type: 'error'; payload: { message: string } };

// ============================================
// DATA TRANSFER OBJECTS (DTOs)
// ============================================

// Sanitized player data (hides other players' cards)
interface PlayerDTO {
  id: string;
  name: string;
  chips: number;
  bet: number;
  handSize: number;              // Number of cards (not actual cards for others)
  status: PlayerStatus;
  isDealer: boolean;
  isSmallBlind: boolean;
  isBigBlind: boolean;
}

// Private player data (includes own cards)
interface PrivatePlayerDTO extends PlayerDTO {
  hand: Card[];                  // Only sent to card owner
}

interface RoomDTO {
  id: string;
  name: string;
  players: PlayerDTO[];
  maxPlayers: number;
  smallBlind: number;
  bigBlind: number;
  inProgress: boolean;
}

interface GameStateDTO {
  roomId: string;
  phase: GamePhase;
  communityCards: Card[];
  pot: number;
  currentBet: number;
  currentPlayerId: string | null;
  players: PlayerDTO[];          // Public player data
  myCards?: Card[];              // Private cards for this client
}
```

---

## 4. Event Flow Sequences

### **Sequence 1: Join Room**
```
1. Client → Server: { type: 'join-room', payload: { roomId, playerName } }
2. Server validates:
   - Room exists
   - Room not full
   - Player name not taken
3. Server creates Player object, adds to room
4. Server → All clients in room: { type: 'player-joined', payload: { player } }
5. Server → New client: { type: 'room-joined', payload: { room, playerId } }
```

### **Sequence 2: Start Game**
```
1. Client → Server: { type: 'start-game', payload: { roomId } }
2. Server validates:
   - At least 2 players
   - Game not already in progress
3. Server initializes GameState:
   - Shuffle deck
   - Assign dealer/blinds
   - Deal 2 cards to each player
   - Deduct blinds
   - Set phase to 'pre-flop'
4. Server → All clients: { type: 'game-started', payload: { gameState } }
5. Server → All clients: { type: 'action-required', payload: { playerId, validActions } }
```

### **Sequence 3: Player Action (Bet/Fold)**
```
1. Client → Server: { type: 'player-action', payload: { roomId, playerId, action } }
2. Server validates:
   - It's this player's turn
   - Action is valid (sufficient chips, etc.)
3. Server processes action:
   - Update player bet/chips/status
   - Update pot
   - Advance to next player OR next phase if round complete
4. Server → All clients: { type: 'game-updated', payload: { gameState } }
5. If more actions needed:
   Server → All clients: { type: 'action-required', payload: { playerId, validActions } }
6. If betting round complete:
   - If showdown, evaluate hands
   - Server → All clients: { type: 'hand-complete', payload: { winners, newGameState } }
```

### **Sequence 4: Advance Turn (Server Logic)**
```
This happens server-side after each action:

1. Check if betting round is complete:
   - All active players have acted
   - All bets are equal (or players are all-in)
2. If round complete:
   a. Reset roundBets
   b. Advance phase (pre-flop → flop → turn → river → showdown)
   c. Deal community cards if applicable
   d. Reset currentPlayerIndex to first active player after dealer
3. If not complete:
   a. Move currentPlayerIndex to next active player
4. Broadcast updated game state
```

---

## 5. Key Design Justifications

### **1. Server-Authoritative Model**
- **Why**: Prevents cheating. Clients can't modify game state or see hidden cards.
- **Trade-off**: Latency for every action, but acceptable for turn-based poker.

### **2. In-Memory State Only**
- **Why**: Simplicity. No database setup, schema migrations, or persistence logic.
- **Trade-off**: State lost on server restart. Fine for a minimal prototype.
- **Implementation**: Use `Map<roomId, Room>` in a singleton GameManager.

### **3. No Side Pots**
- **Why**: Simplifies all-in scenarios drastically. Standard poker has complex side pot calculations when multiple players go all-in with different chip counts.
- **Simplified rule**: If someone goes all-in, they can only win up to the amount they put in from each player. For a minimal game, you could even say "all-in players compete for the whole pot, but excess chips go to the next best hand" or just enforce minimum buy-ins to avoid the scenario.

### **4. WebSocket vs HTTP**
- **Why WebSocket**: Real-time bidirectional communication. Server can push updates (other player actions, turn changes) without polling.
- **Alternative**: Could use Server-Sent Events (SSE) + HTTP POST, but WebSocket is simpler for bidirectional.

### **5. DTO Pattern**
- **Why**: Never send full GameState with all private data. Filter what each client sees.
- **Example**: Player A receives their own cards but only sees "handSize: 2" for other players.

### **6. Turn Management**
- **Why playerOrder array**: Dealer position rotates. Using an ordered array + index makes rotation trivial (`dealerIndex = (dealerIndex + 1) % players.length`).
- **Betting round completion**: Track that all players have acted AND all bets equal `currentBet`.

### **7. Phase-Based State Machine**
```
waiting → pre-flop → flop → turn → river → showdown → complete
```
- **Why**: Clear progression. Each phase has specific rules (cards dealt, betting allowed).
- **Server enforces**: Can't skip phases, can't deal cards out of order.

---