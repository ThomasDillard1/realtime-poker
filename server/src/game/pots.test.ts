import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildPots, awardPots, Contribution, Pot } from './pots.js';

function c(playerId: string, amount: number, folded = false): Contribution {
  return { playerId, amount, folded };
}

function totalPots(pots: Pot[]): number {
  return pots.reduce((sum, p) => sum + p.amount, 0);
}

function totalRefunds(refunds: Map<string, number>): number {
  return [...refunds.values()].reduce((sum, n) => sum + n, 0);
}

/** Every chip contributed must end up in exactly one pot or one refund. */
function assertConserved(contributions: Contribution[], pots: Pot[], refunds: Map<string, number>) {
  const contributed = contributions.reduce((sum, x) => sum + x.amount, 0);
  assert.equal(
    totalPots(pots) + totalRefunds(refunds),
    contributed,
    'chips created or destroyed while building pots',
  );
}

describe('buildPots', () => {
  test('splits three unequal contributions into layered pots', () => {
    // The canonical case: $50 / $100 / $200.
    const contributions = [c('A', 50), c('B', 100), c('C', 200)];
    const { pots, refunds } = buildPots(contributions);

    assert.deepEqual(pots, [
      { amount: 150, eligiblePlayerIds: ['A', 'B', 'C'] }, // 50 x 3
      { amount: 100, eligiblePlayerIds: ['B', 'C'] },      // 50 x 2
    ]);
    // C's top 100 was never matched by anyone.
    assert.deepEqual([...refunds], [['C', 100]]);
    assertConserved(contributions, pots, refunds);
  });

  test('equal contributions make a single pot', () => {
    const { pots, refunds } = buildPots([c('A', 100), c('B', 100), c('C', 100)]);
    assert.deepEqual(pots, [{ amount: 300, eligiblePlayerIds: ['A', 'B', 'C'] }]);
    assert.equal(refunds.size, 0);
  });

  test('handles several all-ins at distinct levels', () => {
    const contributions = [c('A', 25), c('B', 75), c('C', 150), c('D', 150)];
    const { pots, refunds } = buildPots(contributions);

    assert.deepEqual(pots, [
      { amount: 100, eligiblePlayerIds: ['A', 'B', 'C', 'D'] }, // 25 x 4
      { amount: 150, eligiblePlayerIds: ['B', 'C', 'D'] },      // 50 x 3
      { amount: 150, eligiblePlayerIds: ['C', 'D'] },           // 75 x 2
    ]);
    assert.equal(refunds.size, 0, 'the top level was matched, nothing to return');
    assertConserved(contributions, pots, refunds);
  });

  test('folded chips stay in the pot but win nothing', () => {
    const contributions = [c('A', 100), c('B', 100, true), c('C', 100)];
    const { pots, refunds } = buildPots(contributions);

    assert.deepEqual(pots, [{ amount: 300, eligiblePlayerIds: ['A', 'C'] }]);
    assert.equal(refunds.size, 0);
    assertConserved(contributions, pots, refunds);
  });

  test('a fold above a short all-in still funds the main pot', () => {
    // A is all-in for 50, B folds having put in 100, C and D contest 200.
    const contributions = [c('A', 50), c('B', 100, true), c('C', 200), c('D', 200)];
    const { pots, refunds } = buildPots(contributions);

    assert.deepEqual(pots, [
      { amount: 200, eligiblePlayerIds: ['A', 'C', 'D'] }, // 50 x 4, including B's chips
      { amount: 350, eligiblePlayerIds: ['C', 'D'] },      // 50 x 3 then 100 x 2, merged
    ]);
    assert.equal(refunds.size, 0);
    assertConserved(contributions, pots, refunds);
  });

  test('merges adjacent layers with identical eligibility', () => {
    // B folded at 200; A and C both reach 300. The 0-200 and 200-300 layers are
    // contested by the same pair, so they collapse into a single pot rather
    // than showing up as a phantom side pot.
    const contributions = [c('A', 300), c('B', 200, true), c('C', 300)];
    const { pots, refunds } = buildPots(contributions);

    assert.deepEqual(pots, [{ amount: 800, eligiblePlayerIds: ['A', 'C'] }]);
    assert.equal(refunds.size, 0);
    assertConserved(contributions, pots, refunds);
  });

  test('returns an over-bet that only one short stack called', () => {
    const contributions = [c('A', 500), c('B', 100)];
    const { pots, refunds } = buildPots(contributions);

    assert.deepEqual(pots, [{ amount: 200, eligiblePlayerIds: ['A', 'B'] }]);
    assert.deepEqual([...refunds], [['A', 400]]);
    assertConserved(contributions, pots, refunds);
  });

  test('a blind nobody called is returned rather than potted', () => {
    // Everyone folds to the big blind pre-flop.
    const contributions = [c('SB', 10, true), c('BB', 20)];
    const { pots, refunds } = buildPots(contributions);

    assert.deepEqual(pots, [{ amount: 20, eligiblePlayerIds: ['BB'] }]);
    assert.deepEqual([...refunds], [['BB', 10]]);
    assertConserved(contributions, pots, refunds);
  });

  test('ignores players with no contribution', () => {
    const { pots } = buildPots([c('A', 100), c('B', 0), c('C', 100)]);
    assert.deepEqual(pots, [{ amount: 200, eligiblePlayerIds: ['A', 'C'] }]);
  });

  test('no contributions yields no pots', () => {
    const { pots, refunds } = buildPots([]);
    assert.deepEqual(pots, []);
    assert.equal(refunds.size, 0);
  });

  test('property: chips are conserved and eligibility shrinks monotonically', () => {
    let seed = 12345;
    const rand = (n: number) => {
      // Deterministic LCG so a failure is reproducible.
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed % n;
    };

    for (let trial = 0; trial < 500; trial++) {
      const numPlayers = 2 + rand(7); // 2-8 players
      const contributions: Contribution[] = [];
      for (let i = 0; i < numPlayers; i++) {
        contributions.push(c(`P${i}`, rand(500), rand(3) === 0));
      }
      // At least one player must still be live, as in a real hand.
      contributions[0] = c('P0', 1 + rand(500), false);

      const { pots, refunds } = buildPots(contributions);
      assertConserved(contributions, pots, refunds);

      for (let i = 1; i < pots.length; i++) {
        const previous = new Set(pots[i - 1].eligiblePlayerIds);
        for (const id of pots[i].eligiblePlayerIds) {
          assert.ok(previous.has(id), `pot ${i} eligibility is not a subset of pot ${i - 1}`);
        }
      }

      for (const pot of pots) {
        assert.ok(pot.amount > 0, 'empty pot layer');
        assert.ok(pot.eligiblePlayerIds.length > 0, 'pot with nobody able to win it');
      }
    }
  });
});

describe('awardPots', () => {
  const seats = ['A', 'B', 'C', 'D'];

  test('gives each pot to the best eligible hand', () => {
    const pots: Pot[] = [
      { amount: 150, eligiblePlayerIds: ['A', 'B', 'C'] },
      { amount: 100, eligiblePlayerIds: ['B', 'C'] },
    ];
    // A has the best hand overall but is only eligible for the main pot.
    const scores = new Map([['A', 900], ['B', 500], ['C', 700]]);

    const { winnings } = awardPots(pots, scores, seats);
    assert.deepEqual([...winnings], [['A', 150], ['C', 100]]);
  });

  test('splits a tied pot and hands odd chips out in seat order', () => {
    const pots: Pot[] = [{ amount: 101, eligiblePlayerIds: ['B', 'A'] }];
    const scores = new Map([['A', 500], ['B', 500]]);

    const { winnings } = awardPots(pots, scores, seats);
    assert.equal(winnings.get('A'), 51, 'A is earlier in seat order, so takes the odd chip');
    assert.equal(winnings.get('B'), 50);
  });

  test('splits three ways with two odd chips', () => {
    const pots: Pot[] = [{ amount: 302, eligiblePlayerIds: ['C', 'B', 'A'] }];
    const scores = new Map([['A', 5], ['B', 5], ['C', 5]]);

    const { winnings } = awardPots(pots, scores, seats);
    assert.deepEqual(
      [winnings.get('A'), winnings.get('B'), winnings.get('C')],
      [101, 101, 100],
    );
  });

  test('awards a single-eligible pot without needing a score', () => {
    const pots: Pot[] = [{ amount: 80, eligiblePlayerIds: ['A'] }];
    const { winnings } = awardPots(pots, new Map(), seats);
    assert.deepEqual([...winnings], [['A', 80]]);
  });

  test('total awarded always equals the total in the pots', () => {
    const pots: Pot[] = [
      { amount: 151, eligiblePlayerIds: ['A', 'B', 'C'] },
      { amount: 77, eligiblePlayerIds: ['B', 'C'] },
      { amount: 40, eligiblePlayerIds: ['C'] },
    ];
    const scores = new Map([['A', 10], ['B', 10], ['C', 10]]);

    const { winnings } = awardPots(pots, scores, seats);
    const paid = [...winnings.values()].reduce((sum, n) => sum + n, 0);
    assert.equal(paid, totalPots(pots));
  });
});

describe('awardPots per-pot results', () => {
  const seats = ['A', 'B', 'C', 'D'];

  test('names the winner of each pot separately', () => {
    const pots: Pot[] = [
      { amount: 150, eligiblePlayerIds: ['A', 'B', 'C'] },
      { amount: 100, eligiblePlayerIds: ['B', 'C'] },
    ];
    const scores = new Map([['A', 900], ['B', 500], ['C', 700]]);

    const { results } = awardPots(pots, scores, seats);
    assert.deepEqual(results, [
      { amount: 150, winnerIds: ['A'] },
      { amount: 100, winnerIds: ['C'] },
    ]);
  });

  test('reports every tied winner, in seat order', () => {
    const pots: Pot[] = [{ amount: 101, eligiblePlayerIds: ['C', 'A'] }];
    const scores = new Map([['A', 5], ['C', 5]]);

    const { results } = awardPots(pots, scores, seats);
    assert.deepEqual(results, [{ amount: 101, winnerIds: ['A', 'C'] }]);
  });

  test('results line up one-to-one with the pots passed in', () => {
    const pots: Pot[] = [
      { amount: 60, eligiblePlayerIds: ['A', 'B'] },
      { amount: 40, eligiblePlayerIds: ['A'] },
    ];
    const scores = new Map([['A', 1], ['B', 2]]);

    const { winnings, results } = awardPots(pots, scores, seats);
    assert.equal(results.length, pots.length);
    assert.deepEqual(results.map(r => r.amount), pots.map(p => p.amount));
    assert.equal(
      results.reduce((sum, r) => sum + r.amount, 0),
      [...winnings.values()].reduce((sum, n) => sum + n, 0),
    );
  });
});
