/**
 * Pot construction and awarding.
 *
 * Deliberately free of Player/GameState coupling: everything here operates on
 * plain contribution records, which makes the rules easy to test in isolation.
 *
 * The model is "contribution levels". Every chip a player puts into the hand is
 * stacked into a column under that player. Slicing those columns horizontally at
 * each distinct column height produces the main pot and every side pot, with no
 * need to special-case how many players are all-in or in what order.
 */

/** One player's total contribution to the current hand. */
export interface Contribution {
  playerId: string;
  /** Total chips this player has put into the pot this hand. */
  amount: number;
  /** Folded players' chips stay in the pot, but they can never win one. */
  folded: boolean;
}

/** A single pot layer contested by a specific set of players. */
export interface Pot {
  amount: number;
  eligiblePlayerIds: string[];
}

/** Who actually won a pot, reported alongside the winnings totals. */
export interface PotAward {
  amount: number;
  winnerIds: string[];
}

export interface AwardResult {
  /** playerId -> total chips won across every pot. */
  winnings: Map<string, number>;
  /** One entry per pot, in the same order, naming that pot's winner(s). */
  results: PotAward[];
}

export interface PotLayout {
  /** Main pot first, then side pots in ascending contribution order. */
  pots: Pot[];
  /** Chips no opponent ever matched, returned to the player who bet them. */
  refunds: Map<string, number>;
}

/**
 * Slice contributions into pot layers.
 *
 * For each distinct contribution level, every player who reached that level
 * pays the height of the layer into it, and every player still in the hand who
 * reached that level can win it. A layer that only one player paid into is
 * money nobody matched, so it is refunded rather than contested.
 *
 * Guarantees `sum(pots) + sum(refunds) === sum(contributions)`.
 */
export function buildPots(contributions: Contribution[]): PotLayout {
  const live = contributions.filter(c => c.amount > 0);
  const refunds = new Map<string, number>();
  if (live.length === 0) return { pots: [], refunds };

  const levels = [...new Set(live.map(c => c.amount))].sort((a, b) => a - b);

  const layers: Pot[] = [];
  let previousLevel = 0;

  for (const level of levels) {
    const layerSize = level - previousLevel;
    previousLevel = level;
    if (layerSize <= 0) continue;

    // Everyone who reached this level pays into the layer — folded players
    // included, since their chips are forfeited to the pot, not returned.
    const contributors = live.filter(c => c.amount >= level);

    if (contributors.length === 1) {
      // Nobody matched these chips. They go back to whoever bet them.
      const { playerId } = contributors[0];
      refunds.set(playerId, (refunds.get(playerId) || 0) + layerSize);
      continue;
    }

    layers.push({
      amount: layerSize * contributors.length,
      eligiblePlayerIds: contributors.filter(c => !c.folded).map(c => c.playerId),
    });
  }

  // A layer whose contributors all folded has no one to win it. Push those
  // chips down into the nearest lower pot that does have eligible players.
  for (let i = layers.length - 1; i >= 0; i--) {
    if (layers[i].eligiblePlayerIds.length > 0) continue;
    const target = findLowerPotWithEligible(layers, i);
    if (target < 0) {
      throw new Error('buildPots: no eligible player for any pot layer');
    }
    layers[target].amount += layers[i].amount;
    layers.splice(i, 1);
  }

  // Adjacent layers contested by exactly the same players are one pot.
  const pots: Pot[] = [];
  for (const layer of layers) {
    const last = pots[pots.length - 1];
    if (last && sameEligibility(last.eligiblePlayerIds, layer.eligiblePlayerIds)) {
      last.amount += layer.amount;
    } else {
      pots.push({ ...layer });
    }
  }

  return { pots, refunds };
}

function findLowerPotWithEligible(layers: Pot[], from: number): number {
  for (let i = from - 1; i >= 0; i--) {
    if (layers[i].eligiblePlayerIds.length > 0) return i;
  }
  return -1;
}

function sameEligibility(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every(id => set.has(id));
}

/**
 * Award each pot to the best hand among its eligible players.
 *
 * `scores` maps a player id to their hand score; a pot with a single eligible
 * player is awarded without consulting it, which is what lets the
 * everyone-folded case run through this same path with no scores at all.
 *
 * Split pots divide evenly and hand the odd chips out in `seatOrder`, so the
 * result is deterministic rather than dependent on map iteration order.
 *
 * Returns both the per-player totals (what to credit) and the per-pot winners
 * (what to show), so the UI can say which pot each player actually won.
 */
export function awardPots(
  pots: Pot[],
  scores: Map<string, number>,
  seatOrder: string[],
): AwardResult {
  const winnings = new Map<string, number>();
  const results: PotAward[] = [];
  const award = (playerId: string, amount: number) => {
    if (amount <= 0) return;
    winnings.set(playerId, (winnings.get(playerId) || 0) + amount);
  };

  for (const pot of pots) {
    if (pot.eligiblePlayerIds.length === 0) {
      results.push({ amount: pot.amount, winnerIds: [] });
      continue;
    }

    if (pot.eligiblePlayerIds.length === 1) {
      award(pot.eligiblePlayerIds[0], pot.amount);
      results.push({ amount: pot.amount, winnerIds: [pot.eligiblePlayerIds[0]] });
      continue;
    }

    const scored = pot.eligiblePlayerIds.filter(id => scores.has(id));
    if (scored.length === 0) {
      throw new Error('awardPots: contested pot has no scored players');
    }

    const best = Math.max(...scored.map(id => scores.get(id)!));
    const potWinners = scored.filter(id => scores.get(id) === best);

    const share = Math.floor(pot.amount / potWinners.length);
    let remainder = pot.amount - share * potWinners.length;

    for (const id of potWinners) {
      award(id, share);
    }

    // Odd chips go to the tied winners in seat order (first to act first).
    for (const id of seatOrder) {
      if (remainder <= 0) break;
      if (!potWinners.includes(id)) continue;
      award(id, 1);
      remainder--;
    }

    // Report tied winners in seat order to match the payout order above.
    results.push({
      amount: pot.amount,
      winnerIds: seatOrder.filter(id => potWinners.includes(id)),
    });
  }

  return { winnings, results };
}
