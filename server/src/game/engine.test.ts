import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Card, GameState, Player, Rank, Room, Suit } from '../types/index.js';
import {
  startGame,
  processAction,
  getValidActions,
  advanceRunoutPhase,
  settleHand,
  calculateSidePots,
  settledContributions,
  effectiveMaxBet,
} from './GameEngine.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** "As" -> A of spades, "10h" -> ten of hearts. */
function card(notation: string): Card {
  const rank = notation.slice(0, -1) as Rank;
  const suitChar = notation.slice(-1);
  const suits: Record<string, Suit> = { h: 'hearts', d: 'diamonds', c: 'clubs', s: 'spades' };
  return { rank, suit: suits[suitChar] };
}

function cards(...notations: string[]): Card[] {
  return notations.map(card);
}

function makePlayer(id: string, chips: number): Player {
  return {
    id,
    name: id,
    chips,
    bet: 0,
    hand: [],
    status: 'waiting',
    isDealer: false,
    isSmallBlind: false,
    isBigBlind: false,
    isAway: false,
  };
}

function makeRoom(stacks: number[], smallBlind = 10, bigBlind = 20): Room {
  const players = new Map<string, Player>();
  stacks.forEach((chips, i) => {
    const id = `P${i}`;
    players.set(id, makePlayer(id, chips));
  });
  return {
    id: 'room-1',
    name: 'test room',
    players,
    maxPlayers: 6,
    smallBlind,
    bigBlind,
    gameState: null,
    createdAt: Date.now(),
    eliminatedPlayers: [],
  };
}

const realRandom = Math.random;

/** Deal with P0 on the button so seat order is fixed: P1 = SB, P2 = BB. */
function startWithButtonOnP0(room: Room): GameState {
  Math.random = () => 0;
  try {
    return startGame(room);
  } finally {
    Math.random = realRandom;
  }
}

function totalChips(room: Room): number {
  return [...room.players.values()].reduce((sum, p) => sum + p.chips, 0);
}

/** Chips live in exactly two places mid-hand: player stacks and the pot. */
function chipsInPlay(room: Room, gameState: GameState): number {
  return totalChips(room) + gameState.pot;
}

function act(
  room: Room,
  gameState: GameState,
  playerId: string,
  action: Parameters<typeof processAction>[3],
  amount?: number,
) {
  const before = chipsInPlay(room, gameState);
  const result = processAction(gameState, room.players, playerId, action, amount);
  assert.ok(result.success, `${playerId} ${action} failed: ${result.error}`);
  assert.equal(
    chipsInPlay(room, gameState),
    before,
    `chips changed during ${playerId} ${action}`,
  );
  return result;
}

/** Deal out the rest of the board when everyone left is all-in. */
function runOut(room: Room, gameState: GameState) {
  let guard = 0;
  while (advanceRunoutPhase(gameState, room.players) === 'runout') {
    assert.ok(++guard < 10, 'runout did not terminate');
  }
  assert.equal(gameState.phase, 'showdown');
}

/** Force a known board and known hole cards so results are deterministic. */
function setCards(room: Room, gameState: GameState, board: Card[], hands: Record<string, Card[]>) {
  gameState.communityCards = board;
  for (const [id, hand] of Object.entries(hands)) {
    room.players.get(id)!.hand = hand;
  }
}

const BOARD = cards('2h', '7d', '9s', 'Jc', '4h');
const TRIP_NINES = cards('9h', '9d');   // best on BOARD
const PAIR_ACES = cards('As', 'Ad');    // second
const PAIR_KINGS = cards('Ks', 'Kd');   // third
const KING_HIGH_A = cards('Kh', 'Qd');  // ties with...
const KING_HIGH_B = cards('Kc', 'Qs');  // ...this one

// ---------------------------------------------------------------------------

describe('all-in and side pots, end to end', () => {
  afterEach(() => {
    Math.random = realRandom;
  });

  test('main pot and side pot go to different players, excess is returned', () => {
    const room = makeRoom([1000, 200, 100]);
    const gameState = startWithButtonOnP0(room);
    const startingChips = totalChips(room) + gameState.pot;

    // P0 shoves — but is capped at P1's 200, the deepest stack that could call.
    act(room, gameState, 'P0', 'all-in');
    assert.equal(room.players.get('P0')!.chips, 800, 'uncallable chips never leave the stack');
    assert.equal(room.players.get('P0')!.status, 'active', 'covering player is not actually all-in');

    // Both shorter stacks call off their stacks (their all-in *is* the call, so
    // the engine no longer offers a separate all-in action).
    act(room, gameState, 'P1', 'call');
    const last = act(room, gameState, 'P2', 'call');

    assert.ok(last.runout, 'everyone is all-in, so the board should run out');
    runOut(room, gameState);

    setCards(room, gameState, BOARD, {
      P0: PAIR_KINGS,   // worst hand, but has everyone covered
      P1: PAIR_ACES,    // wins the side pot
      P2: TRIP_NINES,   // shortest stack, wins the main pot
    });

    const { winners, sidePots, potResults, refunds, contestedPot } = settleHand(gameState, room.players);

    assert.deepEqual(sidePots, [
      { amount: 300, eligiblePlayerIds: ['P0', 'P1', 'P2'] }, // 100 x 3
      { amount: 200, eligiblePlayerIds: ['P0', 'P1'] },       // 100 x 2
    ]);
    assert.deepEqual(refunds, [], 'nothing to refund — the excess was never committed');
    assert.equal(contestedPot, 500);

    const won = new Map(winners.map(w => [w.playerId, w.amount]));
    assert.equal(won.get('P2'), 300, 'short stack takes the main pot');
    assert.equal(won.get('P1'), 200, 'middle stack takes the side pot');
    assert.equal(won.get('P0'), undefined, 'P0 wins no pot; the 800 was a return');

    assert.equal(room.players.get('P0')!.chips, 800);
    assert.equal(room.players.get('P1')!.chips, 200);
    assert.equal(room.players.get('P2')!.chips, 300);
    assert.equal(totalChips(room), startingChips, 'chips conserved across the hand');

    // The UI needs each pot attributed to its own winner, not one merged total.
    assert.deepEqual(potResults, [
      { amount: 300, eligiblePlayerIds: ['P0', 'P1', 'P2'], winnerIds: ['P2'] },
      { amount: 200, eligiblePlayerIds: ['P0', 'P1'], winnerIds: ['P1'] },
    ]);
  });

  test('three all-in levels produce three pots with shrinking eligibility', () => {
    const room = makeRoom([600, 400, 200, 100]);
    const gameState = startWithButtonOnP0(room);
    const startingChips = totalChips(room) + gameState.pot;

    // Seats: P0 button, P1 SB, P2 BB, P3 first to act.
    act(room, gameState, 'P3', 'all-in'); // 100, the whole stack
    act(room, gameState, 'P0', 'all-in'); // capped at 400 — P1 is the deepest caller
    act(room, gameState, 'P1', 'call');   // 400, all-in
    act(room, gameState, 'P2', 'call');   // 200, all-in
    runOut(room, gameState);

    setCards(room, gameState, BOARD, {
      P0: PAIR_KINGS,
      P1: TRIP_NINES,  // best hand among the deep stacks
      P2: PAIR_ACES,
      P3: cards('3c', '5d'), // nothing
    });

    const { sidePots, refunds } = settleHand(gameState, room.players);

    assert.deepEqual(sidePots, [
      { amount: 400, eligiblePlayerIds: ['P0', 'P1', 'P2', 'P3'] }, // 100 x 4
      { amount: 300, eligiblePlayerIds: ['P0', 'P1', 'P2'] },       // 100 x 3
      { amount: 400, eligiblePlayerIds: ['P0', 'P1'] },             // 200 x 2
    ]);
    assert.deepEqual(refunds, []);
    assert.equal(room.players.get('P0')!.chips, 200, 'P0 kept the 200 nobody could call');

    // P1 has the best hand and is eligible for every pot she reached.
    assert.equal(room.players.get('P1')!.chips, 1100);
    assert.equal(totalChips(room), startingChips);
  });

  test('a folded player funds the pot but cannot win it', () => {
    const room = makeRoom([1000, 1000, 100]);
    const gameState = startWithButtonOnP0(room);
    const startingChips = totalChips(room) + gameState.pot;

    act(room, gameState, 'P0', 'raise', 200);
    act(room, gameState, 'P1', 'call');    // P1 puts in 200, then folds later
    act(room, gameState, 'P2', 'call');    // 100, all-in for less than the 200

    // Flop (P1 acts first, left of the button): P1 folds to a bet,
    // leaving her 200 behind in the pot.
    act(room, gameState, 'P1', 'check');
    act(room, gameState, 'P0', 'bet', 100);
    act(room, gameState, 'P1', 'fold');

    setCards(room, gameState, BOARD, {
      P0: PAIR_KINGS,
      P1: TRIP_NINES,  // best hand, but folded — must win nothing
      P2: PAIR_ACES,
    });
    gameState.phase = 'showdown';

    const { sidePots, refunds, winners } = settleHand(gameState, room.players);

    // Contributions: P0 300, P1 200, P2 100.
    assert.deepEqual(sidePots, [
      { amount: 300, eligiblePlayerIds: ['P0', 'P2'] }, // 100 x 3
      { amount: 200, eligiblePlayerIds: ['P0'] },       // 100 x 2, P1's chips forfeited
    ]);
    assert.deepEqual(refunds, [{ playerId: 'P0', amount: 100 }], 'the flop bet nobody called comes back');

    const won = new Map(winners.map(w => [w.playerId, w.amount]));
    assert.equal(won.get('P1'), undefined, 'a folded player never wins a pot');
    assert.equal(won.get('P2'), 300, 'P2 wins the pot he was eligible for');
    assert.equal(won.get('P0'), 200);
    assert.equal(totalChips(room), startingChips);
  });

  test('a tied pot is split evenly', () => {
    const room = makeRoom([500, 500, 500]);
    const gameState = startWithButtonOnP0(room);
    const startingChips = totalChips(room) + gameState.pot;

    act(room, gameState, 'P0', 'fold');
    act(room, gameState, 'P1', 'all-in');
    act(room, gameState, 'P2', 'call');
    runOut(room, gameState);

    setCards(room, gameState, BOARD, {
      P1: KING_HIGH_A,
      P2: KING_HIGH_B,
    });

    const { winners } = settleHand(gameState, room.players);

    assert.equal(winners.length, 2);
    assert.equal(room.players.get('P1')!.chips, 500);
    assert.equal(room.players.get('P2')!.chips, 500);
    assert.equal(totalChips(room), startingChips);
  });

  test('a player all-in from the blind stays in and can win the main pot', () => {
    const room = makeRoom([1000, 5, 1000]);
    const gameState = startWithButtonOnP0(room);
    const startingChips = totalChips(room) + gameState.pot;

    const shortStack = room.players.get('P1')!;
    assert.equal(shortStack.status, 'all-in', 'posting the last chips is an all-in, not a fold');
    assert.equal(shortStack.chips, 0);
    assert.deepEqual(getValidActions(gameState, shortStack, room.players), [], 'all-in players never act');

    act(room, gameState, 'P0', 'call');   // 20
    act(room, gameState, 'P2', 'check');  // BB checks its option
    // Flop
    act(room, gameState, 'P2', 'check');
    act(room, gameState, 'P0', 'check');
    // Turn
    act(room, gameState, 'P2', 'check');
    act(room, gameState, 'P0', 'check');
    // River
    act(room, gameState, 'P2', 'check');
    act(room, gameState, 'P0', 'check');

    setCards(room, gameState, BOARD, {
      P0: PAIR_KINGS,
      P1: TRIP_NINES,  // the all-in blind has the best hand
      P2: PAIR_ACES,
    });

    const { sidePots } = settleHand(gameState, room.players);

    // Contributions: P0 20, P1 5, P2 20.
    assert.deepEqual(sidePots, [
      { amount: 15, eligiblePlayerIds: ['P0', 'P1', 'P2'] }, // 5 x 3
      { amount: 30, eligiblePlayerIds: ['P0', 'P2'] },       // 15 x 2
    ]);
    assert.equal(room.players.get('P1')!.chips, 15, 'wins exactly the pot she paid for');
    assert.equal(room.players.get('P2')!.chips, 1010, 'best remaining hand takes the side pot');
    assert.equal(totalChips(room), startingChips);
  });

  test('everyone folding returns the uncalled blind instead of potting it', () => {
    const room = makeRoom([1000, 1000, 1000]);
    const gameState = startWithButtonOnP0(room);
    const startingChips = totalChips(room) + gameState.pot;

    act(room, gameState, 'P0', 'fold');
    const result = act(room, gameState, 'P1', 'fold');
    assert.ok(result.handComplete);

    const { winners, refunds, contestedPot } = settleHand(gameState, room.players);

    assert.deepEqual(winners.map(w => [w.playerId, w.amount]), [['P2', 20]]);
    assert.deepEqual(refunds, [{ playerId: 'P2', amount: 10 }], 'BB gets back the half nobody called');
    assert.equal(contestedPot, 20);
    assert.equal(room.players.get('P2')!.chips, 1010, 'net gain is the small blind');
    assert.equal(totalChips(room), startingChips);
  });
});

describe('raise rules around all-ins', () => {
  afterEach(() => {
    Math.random = realRandom;
  });

  test('a short all-in does not re-open betting for players who already acted', () => {
    const room = makeRoom([1000, 1000, 80]);
    const gameState = startWithButtonOnP0(room);

    act(room, gameState, 'P0', 'raise', 60); // full raise: increment 40
    act(room, gameState, 'P1', 'call');
    act(room, gameState, 'P2', 'all-in');    // 80 total: only a 20 increment

    assert.equal(gameState.currentBet, 80, 'the short all-in still raises the price');

    const p0Actions = getValidActions(gameState, room.players.get('P0')!, room.players);
    assert.ok(p0Actions.includes('call'));
    assert.ok(!p0Actions.includes('raise'), 'no re-raise rights against a short all-in');

    const p1Actions = getValidActions(gameState, room.players.get('P1')!, room.players);
    assert.ok(!p1Actions.includes('raise'));
  });

  test('a full all-in raise does re-open betting', () => {
    const room = makeRoom([1000, 1000, 200]);
    const gameState = startWithButtonOnP0(room);

    act(room, gameState, 'P0', 'raise', 60);
    act(room, gameState, 'P1', 'call');
    act(room, gameState, 'P2', 'all-in');    // 200 total: a 140 increment, a full raise

    const p0Actions = getValidActions(gameState, room.players.get('P0')!, room.players);
    assert.ok(p0Actions.includes('raise'), 'a full raise gives everyone action again');
  });

  test('minRaise tracks the last raise increment, not double the bet', () => {
    const room = makeRoom([1000, 1000, 1000]);
    const gameState = startWithButtonOnP0(room);

    assert.equal(gameState.minRaise, 40, 'pre-flop: one big blind over the blind');

    act(room, gameState, 'P0', 'raise', 60);
    assert.equal(gameState.lastRaiseSize, 40);
    assert.equal(gameState.minRaise, 100, 'must raise by at least the last increment');

    const tooSmall = processAction(gameState, room.players, 'P1', 'raise', 80);
    assert.equal(tooSmall.success, false);
    assert.match(tooSmall.error!, /Minimum raise is 100/);
  });
});

describe('in-hand pot display', () => {
  afterEach(() => {
    Math.random = realRandom;
  });

  test('side pots are reported while the hand is still running', () => {
    const room = makeRoom([1000, 200, 100]);
    const gameState = startWithButtonOnP0(room);

    act(room, gameState, 'P0', 'all-in');
    act(room, gameState, 'P1', 'call');
    act(room, gameState, 'P2', 'call');

    const pots = calculateSidePots(gameState.playerContributions, room.players);
    assert.deepEqual(pots, [
      { amount: 300, eligiblePlayerIds: ['P0', 'P1', 'P2'] },
      { amount: 200, eligiblePlayerIds: ['P0', 'P1'] },
    ]);
    assert.equal(pots.reduce((sum, p) => sum + p.amount, 0), 500);
  });
});

describe('randomised hands', () => {
  afterEach(() => {
    Math.random = realRandom;
  });

  test('chips are conserved through hundreds of randomly played hands', () => {
    let seed = 987654321;
    const rand = (n: number) => {
      // Deterministic LCG so any failure is reproducible.
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed % n;
    };

    for (let hand = 0; hand < 300; hand++) {
      const numPlayers = 2 + rand(5);
      // Uneven stacks, some too short to cover a blind, to force all-ins.
      const stacks = Array.from({ length: numPlayers }, () => 1 + rand(400));
      const room = makeRoom(stacks);

      Math.random = () => rand(1000) / 1000;
      const gameState = startGame(room);
      Math.random = realRandom;

      const startingChips = chipsInPlay(room, gameState);
      let guard = 0;

      // Play the hand out with random legal actions.
      for (;;) {
        assert.ok(++guard < 500, 'hand did not terminate');

        if (gameState.phase === 'showdown' || gameState.phase === 'complete') break;

        const currentId = gameState.playerOrder[gameState.currentPlayerIndex];
        const current = room.players.get(currentId)!;
        const options = getValidActions(gameState, current, room.players);
        if (options.length === 0) break;

        const choice = options[rand(options.length)];
        const before = chipsInPlay(room, gameState);
        const result = processAction(
          gameState,
          room.players,
          currentId,
          choice,
          // Raise to a legal total, or shove if the stack cannot reach it.
          choice === 'raise' || choice === 'bet'
            ? Math.min(gameState.minRaise + rand(50), current.chips + (gameState.roundBets.get(currentId) || 0))
            : undefined,
        );

        assert.ok(result.success, `${choice} rejected: ${result.error}`);
        assert.equal(chipsInPlay(room, gameState), before, `chips moved during ${choice}`);

        if (result.handComplete) break;
        if (result.runout) {
          runOut(room, gameState);
          break;
        }
      }

      const { winners, refunds, contestedPot } = settleHand(gameState, room.players);

      const paidOut = winners.reduce((sum, w) => sum + w.amount, 0);
      assert.equal(paidOut, contestedPot, 'every contested chip was awarded');
      assert.equal(
        paidOut + refunds.reduce((sum, r) => sum + r.amount, 0),
        gameState.pot,
        'pot fully distributed between winners and refunds',
      );
      assert.equal(totalChips(room), startingChips, `hand ${hand}: chips created or destroyed`);
    }
  });
});

describe('pot display data', () => {
  afterEach(() => {
    Math.random = realRandom;
  });

  test('settled chips exclude bets still sitting in front of players', () => {
    const room = makeRoom([1000, 1000, 1000]);
    const gameState = startWithButtonOnP0(room);

    // Blinds are posted but the street is not done: only the matched part of
    // the blinds counts as settled.
    const duringBlinds = settledContributions(gameState);
    assert.equal([...duringBlinds.values()].reduce((a, b) => a + b, 0), 0);
    assert.equal(gameState.pot, 30, 'the raw pot still tracks every committed chip');

    act(room, gameState, 'P0', 'call');
    act(room, gameState, 'P1', 'call');
    act(room, gameState, 'P2', 'check');

    // Street complete: everything has been collected.
    const afterStreet = settledContributions(gameState);
    assert.equal([...afterStreet.values()].reduce((a, b) => a + b, 0), 60);
    assert.equal(gameState.pot, 60);
  });

  test('an unmatched bet does not create a phantom side pot mid-street', () => {
    const room = makeRoom([1000, 1000, 100]);
    const gameState = startWithButtonOnP0(room);

    act(room, gameState, 'P0', 'raise', 200);

    // Mid-street: P0 has 200 out, the blinds have 10 and 20, none of it matched.
    // Layering the raw contributions here would invent pots that do not exist...
    const rawMidStreet = calculateSidePots(gameState.playerContributions, room.players);
    assert.ok(rawMidStreet.length > 1, 'raw contributions do split mid-street (the old bug)');

    // ...while the settled view correctly shows nothing collected yet.
    assert.deepEqual(calculateSidePots(settledContributions(gameState), room.players), []);

    act(room, gameState, 'P1', 'call');
    assert.deepEqual(
      calculateSidePots(settledContributions(gameState), room.players),
      [],
      'still nothing settled while P2 has yet to act',
    );

    // P2's short call closes the street, so the real split appears — once.
    act(room, gameState, 'P2', 'call'); // 100, all-in for less than the 200

    assert.deepEqual(calculateSidePots(settledContributions(gameState), room.players), [
      { amount: 300, eligiblePlayerIds: ['P0', 'P1', 'P2'] },
      { amount: 200, eligiblePlayerIds: ['P0', 'P1'] },
    ]);
  });
});

describe('all-in is capped at the effective stack', () => {
  afterEach(() => {
    Math.random = realRandom;
  });

  test('heads-up, shoving over a shorter all-in only matches it', () => {
    const room = makeRoom([1000, 120]);
    const gameState = startWithButtonOnP0(room);
    const startingChips = totalChips(room) + gameState.pot;

    // Heads-up: P1 posts the small blind and acts first; P0 is the big blind.
    const short = room.players.get('P1')!;
    const deep = room.players.get('P0')!;

    act(room, gameState, 'P1', 'all-in');  // 120, the whole short stack
    assert.equal(short.chips, 0);
    assert.equal(short.status, 'all-in');

    // P0 can only match 120 — an all-in here is exactly the call, so it is not
    // offered as a separate action.
    const options = getValidActions(gameState, deep, room.players);
    assert.ok(options.includes('call'));
    assert.ok(!options.includes('all-in'), 'all-in would be identical to calling');
    assert.ok(!options.includes('raise'), 'there is nothing left to raise against');

    act(room, gameState, 'P0', 'call');

    assert.equal(deep.chips, 880, 'the 880 nobody could call stays in the stack');
    assert.equal(deep.status, 'active', 'matching a short all-in does not put you all-in');
    assert.equal(gameState.pot, 240, 'only the contested chips are in the pot');
    assert.equal(totalChips(room) + gameState.pot, startingChips);
  });

  test('an explicit over-bet is trimmed to what an opponent can match', () => {
    const room = makeRoom([1000, 150]);
    const gameState = startWithButtonOnP0(room);

    act(room, gameState, 'P1', 'call');       // limp to 20
    act(room, gameState, 'P0', 'raise', 900); // more than P1 could ever call

    assert.equal(gameState.roundBets.get('P0'), 150, 'trimmed to the effective stack');
    assert.equal(room.players.get('P0')!.chips, 850);
    assert.equal(room.players.get('P0')!.status, 'active');
  });

  test('multiway, the cap is the deepest remaining opponent, not the shortest', () => {
    const room = makeRoom([1000, 500, 100]);
    const gameState = startWithButtonOnP0(room);

    act(room, gameState, 'P0', 'all-in');

    // P1 can still cover 500, so P0 may commit 500 — but not the full 1000.
    assert.equal(gameState.roundBets.get('P0'), 500);
    assert.equal(room.players.get('P0')!.chips, 500);
    assert.equal(room.players.get('P0')!.status, 'active');
  });

  test('a player who is covered still goes genuinely all-in', () => {
    const room = makeRoom([200, 1000]);
    const gameState = startWithButtonOnP0(room);

    act(room, gameState, 'P1', 'call');
    act(room, gameState, 'P0', 'all-in');

    assert.equal(room.players.get('P0')!.chips, 0);
    assert.equal(room.players.get('P0')!.status, 'all-in');
    assert.equal(gameState.currentBet, 200, 'a real shove still sets the price');
  });

  test('folded opponents do not raise the cap', () => {
    const room = makeRoom([1000, 900, 80]);
    const gameState = startWithButtonOnP0(room);

    act(room, gameState, 'P0', 'raise', 60);
    act(room, gameState, 'P1', 'fold');   // the 900-chip opponent is gone
    act(room, gameState, 'P2', 'call');   // 60, leaving 20 behind

    // P1's 900 is out of the hand, so the cap on the flop is P2's remaining 20
    // — not the deep stack that folded.
    assert.equal(effectiveMaxBet(gameState, room.players, room.players.get('P0')!), 20);
  });
});
