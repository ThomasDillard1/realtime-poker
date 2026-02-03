// ============================================
// CORE TYPES
// ============================================

export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';
export type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A';

export interface Card {
  suit: Suit;
  rank: Rank;
}

export type PlayerStatus = 'waiting' | 'active' | 'folded' | 'all-in' | 'out';
export type GamePhase = 'waiting' | 'pre-flop' | 'flop' | 'turn' | 'river' | 'showdown' | 'complete';
export type ActionType = 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'all-in';

// ============================================
// ACTION TYPES
// ============================================

export interface PlayerAction {
  playerId: string;
  action: ActionType;
  amount?: number;
}

// ============================================
// HAND RESULT
// ============================================

export type HandRank =
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

export interface HandResult {
  playerId: string;
  rank: HandRank;
  cards: Card[];
  score: number;
}

export interface Winner {
  playerId: string;
  amount: number;
  handResult: HandResult;
}

// ============================================
// CLIENT → SERVER MESSAGES
// ============================================

export type ClientMessage =
  | { type: 'create-room'; payload: { roomName: string; playerName: string } }
  | { type: 'join-room'; payload: { roomId: string; playerName: string } }
  | { type: 'leave-room'; payload: { roomId: string; playerId: string } }
  | { type: 'start-game'; payload: { roomId: string } }
  | { type: 'start-next-hand'; payload: { roomId: string } }
  | { type: 'player-action'; payload: { roomId: string; playerId: string; action: PlayerAction } }
  | { type: 'get-rooms'; payload: Record<string, never> }
  | { type: 'leave-game'; payload: { roomId: string; playerId: string } }
  | { type: 'rejoin-game'; payload: { roomId: string; playerId: string } };

// ============================================
// SERVER → CLIENT MESSAGES
// ============================================

export type ServerMessage =
  | { type: 'room-created'; payload: { room: RoomDTO } }
  | { type: 'room-joined'; payload: { room: RoomDTO; playerId: string } }
  | { type: 'player-joined'; payload: { roomId: string; player: PlayerDTO } }
  | { type: 'player-left'; payload: { roomId: string; playerId: string } }
  | { type: 'game-started'; payload: { gameState: GameStateDTO } }
  | { type: 'game-updated'; payload: { gameState: GameStateDTO } }
  | { type: 'action-required'; payload: { playerId: string; validActions: ActionType[]; turnDeadline: number } }
  | { type: 'hand-complete'; payload: HandCompletePayload }
  | { type: 'game-over'; payload: GameOverPayload }
  | { type: 'rooms-list'; payload: { rooms: RoomDTO[] } }
  | { type: 'error'; payload: { message: string } }
  | { type: 'left-game'; payload: { roomId: string; playerId: string } }
  | { type: 'player-away'; payload: { roomId: string; playerId: string; isAway: boolean } }
  | { type: 'game-rejoined'; payload: { room: RoomDTO; playerId: string; gameState?: GameStateDTO; handComplete?: HandCompletePayload } };

export interface GameOverPayload {
  winner: PlayerDTO;
  players: PlayerDTO[];  // Final standings
}

// ============================================
// DATA TRANSFER OBJECTS (DTOs)
// ============================================

export interface PlayerDTO {
  id: string;
  name: string;
  chips: number;
  bet: number;
  handSize: number;
  status: PlayerStatus;
  isDealer: boolean;
  isSmallBlind: boolean;
  isBigBlind: boolean;
  isAway: boolean;
}

// Extended DTO that reveals cards at showdown
export interface ShowdownPlayerDTO extends PlayerDTO {
  hand: Card[];
}

export interface HandCompletePayload {
  winners: Winner[];
  players: ShowdownPlayerDTO[];
  communityCards: Card[];
  pot: number;
  isShowdown: boolean;
}

export interface RoomDTO {
  id: string;
  name: string;
  players: PlayerDTO[];
  maxPlayers: number;
  smallBlind: number;
  bigBlind: number;
  inProgress: boolean;
}

export interface GameStateDTO {
  roomId: string;
  phase: GamePhase;
  communityCards: Card[];
  pot: number;
  currentBet: number;
  minRaise: number;
  bigBlind: number;
  currentPlayerId: string | null;
  players: PlayerDTO[];
  myCards?: Card[];
}
