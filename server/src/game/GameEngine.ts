import { Card, Suit, Rank, GameState, Player, ActionType, HandResult, Winner, Room } from '../types/index.js';

const SUITS: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'];
const RANKS: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit, rank });
    }
  }
  return shuffleDeck(deck);
}

export function shuffleDeck(deck: Card[]): Card[] {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export function dealCards(deck: Card[], count: number): Card[] {
  return deck.splice(0, count);
}

export function startGame(room: Room): GameState {
  const players = room.players;
  const playerOrder = Array.from(players.keys());
  const numPlayers = playerOrder.length;
  const deck = createDeck();

  // Pick random dealer for first hand
  const dealerIndex = Math.floor(Math.random() * numPlayers);

  // Calculate positions (wrap around)
  const smallBlindIndex = (dealerIndex + 1) % numPlayers;
  const bigBlindIndex = (dealerIndex + 2) % numPlayers;
  const firstToActIndex = (dealerIndex + 3) % numPlayers;

  // Reset and set up all players
  for (const [i, playerId] of playerOrder.entries()) {
    const player = players.get(playerId)!;
    player.hand = dealCards(deck, 2);
    player.status = 'active';
    player.bet = 0;
    player.isDealer = i === dealerIndex;
    player.isSmallBlind = i === smallBlindIndex;
    player.isBigBlind = i === bigBlindIndex;
  }

  // Create game state
  const gameState: GameState = {
    roomId: room.id,
    phase: 'pre-flop',
    deck,
    communityCards: [],
    pot: 0,
    currentBet: room.bigBlind,
    minRaise: room.bigBlind, // Minimum raise is always at least the big blind
    bigBlind: room.bigBlind,
    currentPlayerIndex: firstToActIndex,
    dealerIndex,
    playerOrder,
    roundBets: new Map(),
    playersActed: new Set(),
    lastRaiser: playerOrder[bigBlindIndex], // BB is considered the "raiser" pre-flop
    handNumber: 1,
  };

  // Post blinds
  const sbPlayer = players.get(playerOrder[smallBlindIndex])!;
  const bbPlayer = players.get(playerOrder[bigBlindIndex])!;

  const sbAmount = Math.min(sbPlayer.chips, room.smallBlind);
  sbPlayer.chips -= sbAmount;
  sbPlayer.bet = sbAmount;
  gameState.roundBets.set(sbPlayer.id, sbAmount);
  gameState.pot += sbAmount;

  const bbAmount = Math.min(bbPlayer.chips, room.bigBlind);
  bbPlayer.chips -= bbAmount;
  bbPlayer.bet = bbAmount;
  gameState.roundBets.set(bbPlayer.id, bbAmount);
  gameState.pot += bbAmount;

  return gameState;
}

export function getValidActions(gameState: GameState, player: Player): ActionType[] {
  const actions: ActionType[] = ['fold'];

  if (player.status !== 'active') {
    return [];
  }

  const playerBet = gameState.roundBets.get(player.id) || 0;
  const toCall = gameState.currentBet - playerBet;

  if (toCall === 0) {
    actions.push('check');
  }

  if (toCall > 0 && player.chips >= toCall) {
    actions.push('call');
  }

  if (player.chips > toCall) {
    if (gameState.currentBet === 0) {
      actions.push('bet');
    } else {
      actions.push('raise');
    }
  }

  if (player.chips > 0) {
    actions.push('all-in');
  }

  return actions;
}

export interface ActionResult {
  success: boolean;
  error?: string;
  roundComplete: boolean;
  handComplete: boolean;
}

export function processAction(
  gameState: GameState,
  players: Map<string, Player>,
  playerId: string,
  action: ActionType,
  amount?: number
): ActionResult {
  const player = players.get(playerId);
  if (!player) {
    return { success: false, error: 'Player not found', roundComplete: false, handComplete: false };
  }

  const currentPlayerId = gameState.playerOrder[gameState.currentPlayerIndex];
  if (playerId !== currentPlayerId) {
    return { success: false, error: 'Not your turn', roundComplete: false, handComplete: false };
  }

  const validActions = getValidActions(gameState, player);
  if (!validActions.includes(action)) {
    return { success: false, error: 'Invalid action', roundComplete: false, handComplete: false };
  }

  // Mark player as having acted
  gameState.playersActed.add(playerId);

  // Process the action
  switch (action) {
    case 'fold':
      player.status = 'folded';
      break;

    case 'check':
      // No chip movement
      break;

    case 'call': {
      const playerBet = gameState.roundBets.get(playerId) || 0;
      const toCall = gameState.currentBet - playerBet;
      const callAmount = Math.min(toCall, player.chips);
      player.chips -= callAmount;
      player.bet += callAmount;
      gameState.pot += callAmount;
      gameState.roundBets.set(playerId, (gameState.roundBets.get(playerId) || 0) + callAmount);
      break;
    }

    case 'bet':
    case 'raise': {
      const playerBet = gameState.roundBets.get(playerId) || 0;

      // For a bet (no current bet), minimum is bigBlind
      // For a raise, minimum is double the current bet
      const minBetTotal = action === 'bet'
        ? gameState.bigBlind
        : gameState.currentBet * 2;

      // Amount is the total bet the player wants to make (not the raise amount)
      const targetTotal = amount || minBetTotal;

      // Validate minimum bet (allow if player doesn't have enough for min, they'd go all-in)
      if (targetTotal < minBetTotal && targetTotal < player.chips + playerBet) {
        return { success: false, error: `Minimum raise is ${minBetTotal}`, roundComplete: false, handComplete: false };
      }

      const amountToAdd = targetTotal - playerBet;
      const actualAdd = Math.min(amountToAdd, player.chips);

      player.chips -= actualAdd;
      player.bet += actualAdd;
      gameState.pot += actualAdd;

      const newTotal = playerBet + actualAdd;
      gameState.roundBets.set(playerId, newTotal);

      // Update minRaise for display purposes (the raise amount)
      gameState.minRaise = newTotal;

      gameState.currentBet = newTotal;

      // Reset acted tracking - everyone needs to respond to the raise
      gameState.playersActed.clear();
      gameState.playersActed.add(playerId);
      gameState.lastRaiser = playerId;
      break;
    }

    case 'all-in': {
      const allInAmount = player.chips;
      player.chips = 0;
      player.bet += allInAmount;
      player.status = 'all-in';
      gameState.pot += allInAmount;
      const newBet = (gameState.roundBets.get(playerId) || 0) + allInAmount;
      gameState.roundBets.set(playerId, newBet);
      if (newBet > gameState.currentBet) {
        gameState.currentBet = newBet;
        // Reset acted tracking - everyone needs to respond to the raise
        gameState.playersActed.clear();
        gameState.playersActed.add(playerId);
        gameState.lastRaiser = playerId;
      }
      break;
    }
  }

  // Check if only one player remains
  const activePlayers = getActivePlayers(gameState, players);
  if (activePlayers.length === 1) {
    gameState.phase = 'complete';
    return { success: true, roundComplete: true, handComplete: true };
  }

  // Check if betting round is complete
  const roundComplete = isBettingRoundComplete(gameState, players);

  if (roundComplete) {
    const handComplete = advancePhase(gameState, players);
    return { success: true, roundComplete: true, handComplete };
  }

  // Move to next player
  advanceToNextPlayer(gameState, players);

  return { success: true, roundComplete: false, handComplete: false };
}

export function getActivePlayers(gameState: GameState, players: Map<string, Player>): Player[] {
  return gameState.playerOrder
    .map(id => players.get(id)!)
    .filter(p => p.status === 'active' || p.status === 'all-in');
}

function isBettingRoundComplete(gameState: GameState, players: Map<string, Player>): boolean {
  const activePlayers = gameState.playerOrder
    .map(id => players.get(id)!)
    .filter(p => p.status === 'active');

  // All active players must have acted this round
  for (const player of activePlayers) {
    if (!gameState.playersActed.has(player.id)) {
      return false;
    }
  }

  // All active players must have matched the current bet
  for (const player of activePlayers) {
    const playerBet = gameState.roundBets.get(player.id) || 0;
    if (playerBet < gameState.currentBet) {
      return false;
    }
  }

  return true;
}

function advanceToNextPlayer(gameState: GameState, players: Map<string, Player>): void {
  const numPlayers = gameState.playerOrder.length;
  let nextIndex = (gameState.currentPlayerIndex + 1) % numPlayers;

  // Find next active player
  for (let i = 0; i < numPlayers; i++) {
    const playerId = gameState.playerOrder[nextIndex];
    const player = players.get(playerId)!;
    if (player.status === 'active') {
      gameState.currentPlayerIndex = nextIndex;
      return;
    }
    nextIndex = (nextIndex + 1) % numPlayers;
  }
}

function advancePhase(gameState: GameState, players: Map<string, Player>): boolean {
  // Reset for new betting round
  gameState.roundBets.clear();
  gameState.playersActed.clear();
  gameState.currentBet = 0;
  gameState.minRaise = gameState.bigBlind; // Reset to big blind for new round
  gameState.lastRaiser = null;

  // Reset each player's bet for the new round
  for (const player of players.values()) {
    player.bet = 0;
  }

  // First to act post-flop is first active player after dealer
  const numPlayers = gameState.playerOrder.length;
  let startIndex = (gameState.dealerIndex + 1) % numPlayers;

  // Find first active player
  for (let i = 0; i < numPlayers; i++) {
    const idx = (startIndex + i) % numPlayers;
    const playerId = gameState.playerOrder[idx];
    const player = players.get(playerId)!;
    if (player.status === 'active') {
      gameState.currentPlayerIndex = idx;
      break;
    }
  }

  switch (gameState.phase) {
    case 'pre-flop':
      gameState.phase = 'flop';
      gameState.communityCards.push(...dealCards(gameState.deck, 3));
      return false;

    case 'flop':
      gameState.phase = 'turn';
      gameState.communityCards.push(...dealCards(gameState.deck, 1));
      return false;

    case 'turn':
      gameState.phase = 'river';
      gameState.communityCards.push(...dealCards(gameState.deck, 1));
      return false;

    case 'river':
      gameState.phase = 'showdown';
      return true;

    default:
      return true;
  }
}

export function evaluateHand(_cards: Card[]): HandResult {
  // TODO: Implement hand evaluation
  return {
    playerId: '',
    rank: 'high-card',
    cards: [],
    score: 0,
  };
}

export function determineWinners(_gameState: GameState, _players: Map<string, Player>): Winner[] {
  // TODO: Implement winner determination
  return [];
}
