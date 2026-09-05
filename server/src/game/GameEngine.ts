import { Card, Suit, Rank, GameState, Player, ActionType, HandResult, HandRank, Winner, Room, SidePotDTO, RefundDTO, PotResultDTO } from '../types/index.js';
import { buildPots, awardPots, Contribution } from './pots.js';

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

/**
 * Post a blind (or any forced bet) for a player.
 *
 * A player whose stack cannot cover the blind posts what they have and is
 * immediately all-in — they must stay eligible for the part of the pot they
 * paid for rather than being left 'active' with no chips, which would leave
 * them able to do nothing but fold.
 */
function postBlind(gameState: GameState, player: Player, amount: number): void {
  const posted = Math.min(player.chips, amount);
  player.chips -= posted;
  player.bet = posted;
  gameState.roundBets.set(player.id, posted);
  gameState.playerContributions.set(player.id, posted);
  gameState.pot += posted;
  if (player.chips === 0) {
    player.status = 'all-in';
  }
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
    // A raise must reach at least one big blind above the current bet.
    minRaise: room.bigBlind * 2,
    lastRaiseSize: room.bigBlind,
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
  postBlind(gameState, players.get(playerOrder[smallBlindIndex])!, room.smallBlind);
  postBlind(gameState, players.get(playerOrder[bigBlindIndex])!, room.bigBlind);

  return gameState;
}

/**
 * The most a player can usefully have bet on this street — the "effective stack".
 *
 * No opponent can call more than they own, so chips beyond the deepest remaining
 * opponent's reach could never be matched. Rather than take them and hand them
 * back as a refund at the end, they simply never leave the player's stack: going
 * all-in against a shorter stack is a call, not a shove.
 *
 * Blinds are exempt — they are forced bets, posted in full and refunded if
 * nobody covers them.
 */
export function effectiveMaxBet(
  gameState: GameState,
  players: Map<string, Player>,
  player: Player,
): number {
  const playerBet = gameState.roundBets.get(player.id) || 0;
  const ownMax = player.chips + playerBet;

  let opponentMax = 0;
  for (const id of gameState.playerOrder) {
    if (id === player.id) continue;
    const opponent = players.get(id);
    if (!opponent || opponent.status === 'folded' || opponent.status === 'out') continue;
    opponentMax = Math.max(opponentMax, opponent.chips + (gameState.roundBets.get(id) || 0));
  }

  // Never below what the player has already committed this street.
  return Math.min(ownMax, Math.max(opponentMax, playerBet));
}

export function getValidActions(
  gameState: GameState,
  player: Player,
  players: Map<string, Player>,
): ActionType[] {
  const actions: ActionType[] = ['fold'];

  if (player.status !== 'active') {
    return [];
  }

  const playerBet = gameState.roundBets.get(player.id) || 0;
  const toCall = gameState.currentBet - playerBet;
  const maxBet = effectiveMaxBet(gameState, players, player);

  if (toCall === 0) {
    actions.push('check');
  }

  if (toCall > 0 && player.chips > 0) {
    actions.push('call');
  }

  // A player who has already acted since the last full raise and is now facing
  // a short all-in may only call or fold — an undersized all-in does not
  // re-open the betting.
  const canAggress = !(toCall > 0 && gameState.playersActed.has(player.id));

  // Aggression needs room above the current bet that an opponent could match.
  if (player.chips > toCall && canAggress && maxBet > gameState.currentBet) {
    if (gameState.currentBet === 0) {
      actions.push('bet');
    } else {
      actions.push('raise');
    }
  }

  // Offer all-in only when it does something a call would not. Capped to the
  // call amount (heads-up against a shorter all-in, or a stack too small to
  // cover the bet), it *is* the call, so showing both is just noise.
  if (player.chips > 0 && maxBet > gameState.currentBet) {
    actions.push('all-in');
  }

  return actions;
}

export interface ActionResult {
  success: boolean;
  error?: string;
  roundComplete: boolean;
  handComplete: boolean;
  runout?: boolean; // All-in runout: more community cards to deal with delay
}

/**
 * Move chips from a player's stack into the pot until their bet for this round
 * reaches `targetTotal` (or their stack runs out, which puts them all-in).
 * Returns the player's resulting total bet for the round.
 */
function commitTo(gameState: GameState, player: Player, targetTotal: number): number {
  const playerBet = gameState.roundBets.get(player.id) || 0;
  const added = Math.max(0, Math.min(targetTotal - playerBet, player.chips));

  player.chips -= added;
  player.bet += added;
  gameState.pot += added;

  const newTotal = playerBet + added;
  gameState.roundBets.set(player.id, newTotal);
  gameState.playerContributions.set(
    player.id,
    (gameState.playerContributions.get(player.id) || 0) + added,
  );

  if (player.chips === 0) {
    player.status = 'all-in';
  }

  return newTotal;
}

/**
 * Record a bet/raise/all-in that may have increased the bet to match.
 *
 * Only a *full* raise — one at least as large as the last raise increment —
 * re-opens the betting for players who have already acted. A short all-in
 * still raises the amount others must call, but players who already acted may
 * only call or fold (enforced in `getValidActions`).
 */
function applyAggression(gameState: GameState, playerId: string, newTotal: number): void {
  if (newTotal <= gameState.currentBet) {
    // A call, or an all-in for less than the current bet: nothing re-opens.
    return;
  }

  const increment = newTotal - gameState.currentBet;
  const isFullRaise = increment >= gameState.lastRaiseSize;

  gameState.currentBet = newTotal;
  gameState.lastRaiser = playerId;

  if (isFullRaise) {
    gameState.lastRaiseSize = increment;
    // Everyone still gets to respond to a full raise.
    gameState.playersActed.clear();
    gameState.playersActed.add(playerId);
  }

  gameState.minRaise = gameState.currentBet + gameState.lastRaiseSize;
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

  const validActions = getValidActions(gameState, player, players);
  const maxBet = effectiveMaxBet(gameState, players, player);
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

    case 'call':
      commitTo(gameState, player, Math.min(gameState.currentBet, maxBet));
      break;

    case 'bet':
    case 'raise': {
      const playerBet = gameState.roundBets.get(playerId) || 0;

      // For a bet (no current bet) the minimum is one big blind.
      // For a raise it is the current bet plus the last full raise increment.
      const minBetTotal = action === 'bet'
        ? gameState.bigBlind
        : gameState.minRaise;

      // Amount is the total bet the player wants to make (not the raise amount)
      // Anything above the effective stack is uncallable, so trim it.
      const targetTotal = Math.min(amount || minBetTotal, maxBet);

      // Below the minimum is only allowed when it is everything the player can
      // usefully commit (their effective all-in).
      if (targetTotal < minBetTotal && targetTotal < maxBet) {
        return { success: false, error: `Minimum raise is ${minBetTotal}`, roundComplete: false, handComplete: false };
      }

      const newTotal = commitTo(gameState, player, targetTotal);
      applyAggression(gameState, playerId, newTotal);
      break;
    }

    case 'all-in': {
      // Commit up to the effective stack, not the whole stack: chips no
      // opponent could match stay where they are.
      const newTotal = commitTo(gameState, player, maxBet);
      applyAggression(gameState, playerId, newTotal);
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
    const phaseResult = advancePhase(gameState, players);
    if (phaseResult === 'runout') {
      return { success: true, roundComplete: true, handComplete: false, runout: true };
    }
    return { success: true, roundComplete: true, handComplete: phaseResult };
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

function advancePhase(gameState: GameState, players: Map<string, Player>): boolean | 'runout' {
  // Reset for new betting round
  gameState.roundBets.clear();
  gameState.playersActed.clear();
  gameState.currentBet = 0;
  // New street: the bar for a raise resets to one big blind.
  gameState.minRaise = gameState.bigBlind;
  gameState.lastRaiseSize = gameState.bigBlind;
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

  // Check if anyone can still act - if not, signal runout needed
  if (!canAnyoneAct(gameState, players)) {
    // All remaining players are all-in - return 'runout' to let caller deal next cards with a delay
    return 'runout';
  }

  return false;
}

// Advance to the next runout phase (for all-in scenarios with delayed dealing)
// Returns: 'showdown' if hand is complete, 'runout' if more cards to deal
export function advanceRunoutPhase(gameState: GameState, players: Map<string, Player>): 'showdown' | 'runout' {
  const result = advancePhase(gameState, players);
  if (result === true) return 'showdown';
  if (result === 'runout') return 'runout';
  // Should not happen in runout context, but handle gracefully
  return 'showdown';
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

/** Build the pot-layer input from the hand's contribution ledger. */
function toContributions(
  playerContributions: Map<string, number>,
  players: Map<string, Player>,
): Contribution[] {
  const contributions: Contribution[] = [];
  for (const [playerId, amount] of playerContributions) {
    if (amount <= 0) continue;
    const player = players.get(playerId);
    // A player who disconnected mid-hand is gone from the room but their chips
    // stay in the pot, forfeited exactly like a fold.
    const folded = !player || player.status === 'folded';
    contributions.push({ playerId, amount, folded });
  }

  // Report eligibility in seat order so pots are stable and readable.
  const seats = [...players.keys()];
  const seatOf = (playerId: string) => {
    const index = seats.indexOf(playerId);
    return index === -1 ? seats.length : index;
  };
  contributions.sort((a, b) => seatOf(a.playerId) - seatOf(b.playerId));

  return contributions;
}

/**
 * Contributions from *completed* streets only.
 *
 * Chips bet on the current street sit in front of players until the street ends,
 * so they are excluded here. Settled chips are always fully matched, which keeps
 * the displayed pot breakdown stable for the whole street instead of re-slicing
 * on every unmatched bet.
 */
export function settledContributions(gameState: GameState): Map<string, number> {
  const settled = new Map<string, number>();
  for (const [playerId, total] of gameState.playerContributions) {
    settled.set(playerId, total - (gameState.roundBets.get(playerId) || 0));
  }
  return settled;
}

/**
 * Pot breakdown for display while a hand is in progress.
 * Uncalled chips are excluded — they are not part of any contested pot.
 */
export function calculateSidePots(
  playerContributions: Map<string, number>,
  players: Map<string, Player>,
): SidePotDTO[] {
  return buildPots(toContributions(playerContributions, players)).pots;
}

export interface HandResolution {
  winners: Winner[];
  sidePots: SidePotDTO[];
  /** Per-pot outcome: amount, who could win it, and who did. */
  potResults: PotResultDTO[];
  refunds: RefundDTO[];
  /** Total of the contested pots, i.e. the pot after uncalled chips are returned. */
  contestedPot: number;
}

/**
 * Resolve a finished hand into refunds and per-pot winners.
 *
 * This is the single resolution path for every ending: a showdown between any
 * number of players, an all-in runout, or everyone folding to one player. The
 * fold case needs no special handling — the survivor is simply the only
 * eligible player in every pot.
 */
export function resolveHand(gameState: GameState, players: Map<string, Player>): HandResolution {
  const { pots, refunds } = buildPots(toContributions(gameState.playerContributions, players));

  // Evaluate hands once per player still in the hand.
  const handResults = new Map<string, HandResult>();
  const scores = new Map<string, number>();
  const contenders = getActivePlayers(gameState, players);
  const isShowdown = contenders.length > 1;

  if (isShowdown) {
    for (const player of contenders) {
      const result = evaluateHand([...player.hand, ...gameState.communityCards], player.id);
      handResults.set(player.id, result);
      scores.set(player.id, result.score);
    }
  }

  const { winnings, results } = awardPots(pots, scores, gameState.playerOrder);

  const emptyResult = (playerId: string): HandResult =>
    ({ playerId, rank: 'high-card', cards: [], score: 0 });

  const winners: Winner[] = [];
  for (const [playerId, amount] of winnings) {
    winners.push({
      playerId,
      amount,
      handResult: handResults.get(playerId) ?? emptyResult(playerId),
    });
  }

  // Sort by amount descending for consistent display
  winners.sort((a, b) => b.amount - a.amount);

  return {
    winners,
    sidePots: pots,
    potResults: pots.map((pot, i) => ({
      amount: pot.amount,
      eligiblePlayerIds: pot.eligiblePlayerIds,
      winnerIds: results[i]?.winnerIds ?? [],
    })),
    refunds: [...refunds].map(([playerId, amount]) => ({ playerId, amount })),
    contestedPot: pots.reduce((sum, pot) => sum + pot.amount, 0),
  };
}

/**
 * Resolve a hand and move the chips: uncalled contributions go back to the
 * player who bet them, then each pot is paid to its winner(s).
 */
export function settleHand(gameState: GameState, players: Map<string, Player>): HandResolution {
  const resolution = resolveHand(gameState, players);

  for (const { playerId, amount } of resolution.refunds) {
    const player = players.get(playerId);
    if (player) player.chips += amount;
  }

  for (const { playerId, amount } of resolution.winners) {
    const player = players.get(playerId);
    if (player) player.chips += amount;
  }

  return resolution;
}

/** Winners only, for callers that do not need refunds or the pot breakdown. */
export function determineWinners(gameState: GameState, players: Map<string, Player>): Winner[] {
  return resolveHand(gameState, players).winners;
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
    minRaise: room.bigBlind * 2,
    lastRaiseSize: room.bigBlind,
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
  postBlind(gameState, players.get(playerOrder[smallBlindIndex])!, room.smallBlind);
  postBlind(gameState, players.get(playerOrder[bigBlindIndex])!, room.bigBlind);

  return gameState;
}
