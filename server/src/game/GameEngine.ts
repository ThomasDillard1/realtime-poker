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
    currentPlayerIndex: firstToActIndex,
    dealerIndex,
    playerOrder,
    roundBets: new Map(),
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

export function evaluateHand(_cards: Card[]): HandResult {
  // TODO: Implement hand evaluation
  // This is a placeholder that will be implemented later
  return {
    playerId: '',
    rank: 'high-card',
    cards: [],
    score: 0,
  };
}

export function determineWinners(_gameState: GameState, _players: Map<string, Player>): Winner[] {
  // TODO: Implement winner determination
  // This is a placeholder that will be implemented later
  return [];
}
