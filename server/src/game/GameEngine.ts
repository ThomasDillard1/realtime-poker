import { Card, Suit, Rank, GameState, Player, ActionType, HandResult, HandRank, Winner, Room } from '../types/index.js';

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
    playerContributions: new Map(),  // Track total contributions
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
  gameState.playerContributions.set(sbPlayer.id, sbAmount);
  gameState.pot += sbAmount;

  const bbAmount = Math.min(bbPlayer.chips, room.bigBlind);
  bbPlayer.chips -= bbAmount;
  bbPlayer.bet = bbAmount;
  gameState.roundBets.set(bbPlayer.id, bbAmount);
  gameState.playerContributions.set(bbPlayer.id, bbAmount);
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

  if (toCall > 0 && player.chips > 0) {
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
      gameState.playerContributions.set(playerId, (gameState.playerContributions.get(playerId) || 0) + callAmount);
      if (player.chips === 0) {
        player.status = 'all-in';
      }
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
      gameState.playerContributions.set(playerId, (gameState.playerContributions.get(playerId) || 0) + actualAdd);

      if (player.chips === 0) {
        player.status = 'all-in';
      }

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
      gameState.playerContributions.set(playerId, (gameState.playerContributions.get(playerId) || 0) + allInAmount);
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

// Check if any player can still make betting actions
function canAnyoneAct(gameState: GameState, players: Map<string, Player>): boolean {
  // Count players who are 'active' (not folded, not all-in)
  const playersWhoCanAct = gameState.playerOrder
    .map(id => players.get(id)!)
    .filter(p => p.status === 'active');

  // Need at least 2 players who can act for betting to continue
  // If only 1 or 0 players can act, we should run out the board
  return playersWhoCanAct.length >= 2;
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

  // Advance to next phase
  switch (gameState.phase) {
    case 'pre-flop':
      gameState.phase = 'flop';
      gameState.communityCards.push(...dealCards(gameState.deck, 3));
      break;

    case 'flop':
      gameState.phase = 'turn';
      gameState.communityCards.push(...dealCards(gameState.deck, 1));
      break;

    case 'turn':
      gameState.phase = 'river';
      gameState.communityCards.push(...dealCards(gameState.deck, 1));
      break;

    case 'river':
      gameState.phase = 'showdown';
      return true;

    default:
      return true;
  }

  // Check if anyone can still act - if not, keep advancing to showdown
  if (!canAnyoneAct(gameState, players)) {
    // All remaining players are all-in, run out the board
    return advancePhase(gameState, players);
  }

  return false;
}

// Card value for comparison (2=2, ..., 10=10, J=11, Q=12, K=13, A=14)
function cardValue(rank: Rank): number {
  const values: Record<Rank, number> = {
    '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10,
    'J': 11, 'Q': 12, 'K': 13, 'A': 14,
  };
  return values[rank];
}

// Generate all 5-card combinations from cards
function getCombinations(cards: Card[], size: number): Card[][] {
  const result: Card[][] = [];

  function combine(start: number, combo: Card[]) {
    if (combo.length === size) {
      result.push([...combo]);
      return;
    }
    for (let i = start; i < cards.length; i++) {
      combo.push(cards[i]);
      combine(i + 1, combo);
      combo.pop();
    }
  }

  combine(0, []);
  return result;
}

// Check for flush (5 cards of same suit)
function isFlush(cards: Card[]): boolean {
  const suit = cards[0].suit;
  return cards.every(c => c.suit === suit);
}

// Check for straight (5 consecutive cards)
function isStraight(cards: Card[]): boolean {
  const values = cards.map(c => cardValue(c.rank)).sort((a, b) => a - b);

  // Check for A-2-3-4-5 (wheel)
  if (values[4] === 14 && values[0] === 2 && values[1] === 3 && values[2] === 4 && values[3] === 5) {
    return true;
  }

  // Check consecutive
  for (let i = 1; i < values.length; i++) {
    if (values[i] !== values[i - 1] + 1) {
      return false;
    }
  }
  return true;
}

// Get rank counts (e.g., {14: 2, 10: 3} means pair of aces, three 10s)
function getRankCounts(cards: Card[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const card of cards) {
    const val = cardValue(card.rank);
    counts.set(val, (counts.get(val) || 0) + 1);
  }
  return counts;
}

// Score a 5-card hand (higher is better)
function scoreHand(cards: Card[]): { rank: HandRank; score: number } {
  const flush = isFlush(cards);
  const straight = isStraight(cards);
  const values = cards.map(c => cardValue(c.rank)).sort((a, b) => b - a);
  const counts = getRankCounts(cards);
  const countValues = Array.from(counts.entries()).sort((a, b) => {
    // Sort by count desc, then by value desc
    if (b[1] !== a[1]) return b[1] - a[1];
    return b[0] - a[0];
  });

  // Base score uses rank category (0-9) * 10^10 + kickers
  let baseScore = 0;
  let rank: HandRank = 'high-card';

  // Royal flush: A-K-Q-J-10 of same suit
  if (flush && straight && values[0] === 14 && values[4] === 10) {
    rank = 'royal-flush';
    baseScore = 9 * Math.pow(10, 10);
  }
  // Straight flush
  else if (flush && straight) {
    rank = 'straight-flush';
    // Handle wheel (A-2-3-4-5) - 5 is high
    const highCard = (values[0] === 14 && values[1] === 5) ? 5 : values[0];
    baseScore = 8 * Math.pow(10, 10) + highCard;
  }
  // Four of a kind
  else if (countValues[0][1] === 4) {
    rank = 'four-of-a-kind';
    baseScore = 7 * Math.pow(10, 10) + countValues[0][0] * Math.pow(10, 8) + countValues[1][0];
  }
  // Full house
  else if (countValues[0][1] === 3 && countValues[1][1] === 2) {
    rank = 'full-house';
    baseScore = 6 * Math.pow(10, 10) + countValues[0][0] * Math.pow(10, 8) + countValues[1][0];
  }
  // Flush
  else if (flush) {
    rank = 'flush';
    baseScore = 5 * Math.pow(10, 10);
    for (let i = 0; i < 5; i++) {
      baseScore += values[i] * Math.pow(10, 8 - i * 2);
    }
  }
  // Straight
  else if (straight) {
    rank = 'straight';
    // Handle wheel
    const highCard = (values[0] === 14 && values[1] === 5) ? 5 : values[0];
    baseScore = 4 * Math.pow(10, 10) + highCard;
  }
  // Three of a kind
  else if (countValues[0][1] === 3) {
    rank = 'three-of-a-kind';
    baseScore = 3 * Math.pow(10, 10) + countValues[0][0] * Math.pow(10, 8);
    // Add kickers
    const kickers = countValues.slice(1).map(c => c[0]).sort((a, b) => b - a);
    baseScore += kickers[0] * Math.pow(10, 6) + kickers[1] * Math.pow(10, 4);
  }
  // Two pair
  else if (countValues[0][1] === 2 && countValues[1][1] === 2) {
    rank = 'two-pair';
    const highPair = Math.max(countValues[0][0], countValues[1][0]);
    const lowPair = Math.min(countValues[0][0], countValues[1][0]);
    const kicker = countValues[2][0];
    baseScore = 2 * Math.pow(10, 10) + highPair * Math.pow(10, 8) + lowPair * Math.pow(10, 6) + kicker;
  }
  // Pair
  else if (countValues[0][1] === 2) {
    rank = 'pair';
    baseScore = 1 * Math.pow(10, 10) + countValues[0][0] * Math.pow(10, 8);
    // Add kickers
    const kickers = countValues.slice(1).map(c => c[0]).sort((a, b) => b - a);
    baseScore += kickers[0] * Math.pow(10, 6) + kickers[1] * Math.pow(10, 4) + kickers[2] * Math.pow(10, 2);
  }
  // High card
  else {
    rank = 'high-card';
    for (let i = 0; i < 5; i++) {
      baseScore += values[i] * Math.pow(10, 8 - i * 2);
    }
  }

  return { rank, score: baseScore };
}

export function evaluateHand(cards: Card[], playerId: string = ''): HandResult {
  if (cards.length < 5) {
    return { playerId, rank: 'high-card', cards: [], score: 0 };
  }

  // Get all 5-card combinations and find the best one
  const combinations = getCombinations(cards, 5);
  let bestResult = { rank: 'high-card' as HandRank, score: 0 };
  let bestCards: Card[] = [];

  for (const combo of combinations) {
    const result = scoreHand(combo);
    if (result.score > bestResult.score) {
      bestResult = result;
      bestCards = combo;
    }
  }

  return {
    playerId,
    rank: bestResult.rank,
    cards: bestCards,
    score: bestResult.score,
  };
}

export function determineWinners(gameState: GameState, players: Map<string, Player>): Winner[] {
  const activePlayers = getActivePlayers(gameState, players);
  const results: { player: Player; handResult: HandResult; contribution: number }[] = [];

  // Evaluate each active player's hand and get their contribution
  for (const player of activePlayers) {
    const allCards = [...player.hand, ...gameState.communityCards];
    const handResult = evaluateHand(allCards, player.id);
    const contribution = gameState.playerContributions.get(player.id) || 0;
    results.push({ player, handResult, contribution });
  }

  // Sort by score descending
  results.sort((a, b) => b.handResult.score - a.handResult.score);

  // Find all players with the highest score (could be a tie)
  const highestScore = results[0].handResult.score;
  const winnerResults = results.filter(r => r.handResult.score === highestScore);

  // Calculate how much each winner can win
  // Winner can only win up to their contribution from each other player
  const winners: Winner[] = [];
  let totalAwarded = 0;

  for (const winnerResult of winnerResults) {
    const winnerContribution = winnerResult.contribution;
    let winAmount = 0;

    // For each player (including winner), add min(their contribution, winner's contribution) / num winners
    for (const result of results) {
      const theirContribution = result.contribution;
      // Winner can only claim up to what they put in from each player
      winAmount += Math.min(theirContribution, winnerContribution);
    }

    // If multiple winners with same hand, split the winnable amount
    winAmount = Math.floor(winAmount / winnerResults.length);

    winners.push({
      playerId: winnerResult.player.id,
      amount: winAmount,
      handResult: winnerResult.handResult,
    });

    totalAwarded += winAmount;
  }

  // Return any excess to the player who over-bet (uncalled bet)
  const excessAmount = gameState.pot - totalAwarded;
  if (excessAmount > 0) {
    // Find the player who contributed more than the winner
    // In heads-up, this is the player who bet more than they could win
    for (const result of results) {
      const isWinner = winnerResults.some(w => w.player.id === result.player.id);
      if (!isWinner) {
        // Check if this player over-contributed
        const winnerMaxContribution = Math.max(...winnerResults.map(w => w.contribution));
        if (result.contribution > winnerMaxContribution) {
          // Return the excess to this player
          const playerExcess = result.contribution - winnerMaxContribution;
          result.player.chips += playerExcess;
        }
      }
    }
  }

  return winners;
}

export function startNextHand(room: Room, previousDealerIndex: number): GameState | null {
  const players = room.players;

  // First, clear ALL position flags for ALL players
  for (const player of players.values()) {
    player.isDealer = false;
    player.isSmallBlind = false;
    player.isBigBlind = false;
    player.hand = [];
    player.bet = 0;
  }

  // Mark players with no chips as 'out'
  for (const player of players.values()) {
    if (player.chips <= 0) {
      player.status = 'out';
    }
  }

  // Get eligible players (those with chips)
  const eligiblePlayers = Array.from(players.values()).filter(p => p.status !== 'out');

  if (eligiblePlayers.length < 2) {
    // Not enough players to continue
    return null;
  }

  // Build new player order from eligible players, maintaining original order
  const playerOrder = Array.from(players.keys()).filter(id => {
    const player = players.get(id)!;
    return player.status !== 'out';
  });

  const numPlayers = playerOrder.length;
  const deck = createDeck();

  // Rotate dealer to next eligible player
  let dealerIndex = (previousDealerIndex + 1) % numPlayers;

  // Calculate positions (wrap around)
  const smallBlindIndex = (dealerIndex + 1) % numPlayers;
  const bigBlindIndex = (dealerIndex + 2) % numPlayers;
  const firstToActIndex = numPlayers === 2
    ? smallBlindIndex  // Heads-up: SB acts first pre-flop
    : (dealerIndex + 3) % numPlayers;

  // Set up only eligible players
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
    minRaise: room.bigBlind,
    bigBlind: room.bigBlind,
    currentPlayerIndex: firstToActIndex,
    dealerIndex,
    playerOrder,
    roundBets: new Map(),
    playerContributions: new Map(),
    playersActed: new Set(),
    lastRaiser: playerOrder[bigBlindIndex],
    handNumber: (room.gameState?.handNumber || 0) + 1,
  };

  // Post blinds
  const sbPlayer = players.get(playerOrder[smallBlindIndex])!;
  const bbPlayer = players.get(playerOrder[bigBlindIndex])!;

  const sbAmount = Math.min(sbPlayer.chips, room.smallBlind);
  sbPlayer.chips -= sbAmount;
  sbPlayer.bet = sbAmount;
  gameState.roundBets.set(sbPlayer.id, sbAmount);
  gameState.playerContributions.set(sbPlayer.id, sbAmount);
  gameState.pot += sbAmount;

  const bbAmount = Math.min(bbPlayer.chips, room.bigBlind);
  bbPlayer.chips -= bbAmount;
  bbPlayer.bet = bbAmount;
  gameState.roundBets.set(bbPlayer.id, bbAmount);
  gameState.playerContributions.set(bbPlayer.id, bbAmount);
  gameState.pot += bbAmount;

  return gameState;
}
