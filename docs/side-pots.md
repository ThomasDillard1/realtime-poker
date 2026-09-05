# How Side Pots Work Here

The intuition behind the pot logic, in plain terms. Implementation:
[`server/src/game/pots.ts`](../server/src/game/pots.ts).

## The problem

Poker lets players bet more than an opponent can cover. If you bet $200 and I
only have $50, I cannot win your $200 — I only ever had $50 at stake. So when
players put in different amounts, "the pot" is not one prize. It is several,
each with a different guest list.

## The intuition: stack the chips in columns, then slice horizontally

Picture each player's total contribution for the hand as a **column of chips**.

```
                                        ┌─────┐  ← 100  (only C funded this)
                                        │  C  │        nobody matched it
                              ┌─────┬───┴─────┤
                              │  B  │    C    │  ← 50   (B and C funded it)
                    ┌─────┬───┴─────┼─────────┤
                    │  A  │    B    │    C    │  ← 50   (A, B and C funded it)
                    └─────┴─────────┴─────────┘
                       A=50    B=100     C=200
```

Now **slice horizontally at every height where a column ends** — at 50, at 100,
at 200. Each slice is one pot, and the rule for each slice is the same:

> Everyone whose column reaches this height paid into this slice,
> and everyone still in the hand whose column reaches this height can win it.

That single rule produces the whole structure:

| Slice | Height | Funded by | Amount | Contested by |
|---|---|---|---|---|
| Main pot | $0–50 | A, B, C | 50 × 3 = **$150** | A, B, C |
| Side pot 1 | $50–100 | B, C | 50 × 2 = **$100** | B, C |
| (uncalled) | $100–200 | C alone | **$100** | nobody — returned to C |

A wins at showdown? A takes $150 and nothing else — that is all A ever had at
risk. C wins? C takes all $250 plus the $100 back.

## Why this is the right shape

There is no case analysis. The code does not ask "how many players are all-in?"
or "is this a three-way all-in with a folder?" It only ever asks, per slice, *who
reached this height*. That makes it correct for any number of players and any
number of all-ins for free, and it is why the function is ~40 lines rather than a
tangle of branches.

## The four rules that fall out of it

**1. Folded players fund pots but cannot win them.**
Chips you put in are gone the moment you fold — they stay in every slice they
reached. So folded players count when *sizing* a slice, but are removed from the
list of players who can *win* it. This is why a fold does not shrink the pot.

**2. A slice only one player funded is not a pot at all.**
If nobody matched those chips, there is nothing to contest and no hand to beat.
It goes straight back to the player who bet it — a **refund**, not a win.

In practice this fires less often than you might expect, because voluntary bets
are capped at the effective stack before they are ever taken (see
[architecture.md §5](./architecture.md)): shoving $500 against a $100 stack only
commits $100 in the first place. Refunds remain for the cases a cap cannot
prevent — everyone folding to an uncalled bet or blind, and a bet whose only
possible caller folds afterward.

**3. Adjacent slices with the same guest list are one pot.**
If a folded player's column ends at $200 and the two live players both reach
$300, the $0–200 and $200–300 slices are contested by the same two people. Left
alone they would display as a phantom "side pot" that means nothing, so they are
merged.

**4. Eligibility only ever shrinks as you go up.**
Anyone who reached $100 necessarily reached $50. So each pot's guest list is a
subset of the one below it, and the main pot always has the most players. This is
asserted directly in the property test.

## Awarding

Each pot goes to the best hand among the players eligible for *that* pot. The
best hand at the table does not necessarily win everything — a short stack with
the nuts wins the main pot while the second-best hand takes the side pot.

Ties split the pot evenly. Chips are integers, so a $101 pot split two ways
leaves an odd chip; it goes to the tied player earliest in seat order, so the
result is deterministic rather than dependent on iteration order.

## The invariant

Chips are neither created nor destroyed:

```
sum(pots) + sum(refunds) === sum(contributions)
```

This holds by construction — every slice is accounted for exactly once, as either
a pot or a refund — and it is checked in two places: a randomised property test
over hundreds of generated contribution/fold combinations, and an assertion after
*every single action* in the end-to-end hand tests, where `sum(stacks) + pot` must
never change.

## Where a hand ends up here

Every ending routes through the same function, `settleHand`. A showdown, an
all-in runout, and everyone folding to one player are not three code paths — the
last player standing is simply the only eligible player in every pot, so the
general machinery already handles it. There is no special case to get wrong.
