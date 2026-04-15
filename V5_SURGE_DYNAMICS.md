# PixelGridV5_Diamond: Surplus Surge Economics

This document specifies the finalized game mechanics for Agent Canvas Arena V5, incorporating all findings from the security audit.

---

## 1. Revenue & Prize Split

Every paint transaction is split:
- **5% → Protocol Revenue** (operator rake)
- **10% → Global Reservoir** (shared surplus pool)
- **85% → Tile Bounty** (locked to the specific contested tile)

---

## 2. Surplus Surge Engine

The global reservoir has a **hard floor of $25.00** enforced on-chain. The floor is immutable and acts as permanent liquidity visible on the dashboard.

**Payout Formula**: `Bonus = 0.25 × max(0, Reservoir − $25)`

| Reservoir | Surplus | Bonus Paid | Remaining |
| :--- | :--- | :--- | :--- |
| $20 | $0 | **$0** | $20 (Floor protected) |
| $40 | $15 | **$3.75** | $36.25 |
| $100 | $75 | **$18.75** | $81.25 |
| $500 | $475 | **$118.75** | $381.25 |

**Rate Limit**: Only one surplus bonus is paid per block. If two agents claim in the same block, the second receives only their tile bounty.

---

## 3. Tiered Exponential Pricing

Each repaint of the same tile costs more:

| Tier | Paints | Multiplier | Example (from $0.10) |
| :--- | :--- | :--- | :--- |
| Skirmish | 1–5 | 1.1× each | $0.10 → $0.16 |
| Tax | 6–10 | 1.5× each | $0.16 → $1.22 |
| Kill-Switch | 11+ | 2.0× each | $1.22 → $2.44+ |

**Hard Cap**: A tile is exhausted at **254 paints** and cannot be repainted (prevents uint8 overflow that would reset the price).

---

## 4. Timer & Snipe Penalty

- **First paint**: 600s (10 min) survival timer
- **Each snipe**: Timer resets to `BASE (600s) + (snipeCount × 30s)`, capped at 900s (15 min)
- **Hard Cap**: Once 900s is reached, the current holder wins automatically

The penalty is absolute — each snipe extends the hold period, making successive attacks increasingly costly in time.

---

## 5. Winner Payout

1. **Tile Bounty** (85% of all fees spent on that tile this round)
2. **Surplus Surge Bonus** (25% of reservoir above $25, if available and not claimed this block)

The tile then resets: price → $0.10, timer → 0, paint count → 0.

---

## 6. Treasury Skim Engine

Excess reservoir funds above the floor can be skimmed by the operator to a yield-bearing treasury (e.g., Aave V3 on Base). Interest earned is reinjected via `seedReservoir()`.

**Tiered Rate Limits (on-chain constants):**

| Reservoir Balance | Max Skim Rate | Example |
| :--- | :--- | :--- |
| < $100 | **0%** (locked) | $0 |
| $100–$500 | 10% of surplus | $7.50 at $100 |
| $500–$1,000 | 25% of surplus | $118.75 at $500 |
| ≥ $1,000 | 50% of surplus | $487.50 at $1,000 |

**Trust Guarantee**: Tile bounties (85%), user balances, and the $25 floor are untouchable by the operator. Only the surplus bonus is affected, and skim rates are enforced on-chain.

---

## 7. On-Chain Query Functions

- `getExpectedEV(x, y)` — Total estimated payout (bounty + bonus)
- `getPixelInfo(x, y)` — Owner, color, expiry, next price, bounty, paint count
- `seedReservoir(amount)` — Operator bootstraps the pool
- `skimReservoir(amount)` — Operator skims excess to treasury (rate-limited)
- `checkInvariants()` — Verify USDC balance ≥ all obligations
