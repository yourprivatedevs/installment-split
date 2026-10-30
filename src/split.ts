export interface SplitOptions {
  /**
   * Which installments receive the leftover minor units when the total does
   * not divide exactly. Ties between equal fractional remainders go to the
   * earliest installment (`"first"`, the default) or the latest (`"last"`).
   */
  remainder?: "first" | "last";
  /**
   * Accept a negative total, such as a refund or a credit note. The magnitude
   * is split and every installment gets the negative sign. Default `false`.
   */
  allowNegative?: boolean;
}

/** Percentages are read to 6 decimal places and held as integers. */
const PERCENT_SCALE = 1_000_000;
const PERCENT_TOTAL = 100n * BigInt(PERCENT_SCALE);

/**
 * Split `total` minor units into `parts` installments of near-equal size.
 *
 *   splitEqual(10000, 3)  // [3334, 3333, 3333]
 *
 * The installments always add up to `total`, and no two differ by more than
 * one minor unit.
 */
export function splitEqual(total: number, parts: number, options: SplitOptions = {}): number[] {
  if (!Number.isInteger(parts) || parts < 1) {
    throw new RangeError(`Number of installments must be an integer of at least 1, got ${parts}`);
  }
  const weights = Array.from({ length: parts }, () => 1n);
  return allocate(total, weights, BigInt(parts), options);
}

/**
 * Split `total` minor units according to `percentages`, which must add up to
 * exactly 100.
 *
 *   splitByPercentages(10000, [33.33, 33.33, 33.34])  // [3333, 3333, 3334]
 *   splitByPercentages(100, [30, 70])                 // [30, 70]
 *
 * Percentages may have up to 6 decimal places. Anything finer is rejected
 * rather than silently rounded; use `splitEqual` for thirds.
 */
export function splitByPercentages(
  total: number,
  percentages: readonly number[],
  options: SplitOptions = {},
): number[] {
  if (percentages.length < 1) {
    throw new RangeError("At least one percentage is required");
  }
  const weights = percentages.map(toScaledPercentage);
  const sum = weights.reduce((a, b) => a + b, 0n);
  if (sum !== PERCENT_TOTAL) {
    throw new RangeError(`Percentages must add up to 100, got ${Number(sum) / PERCENT_SCALE}`);
  }
  return allocate(total, weights, PERCENT_TOTAL, options);
}

function toScaledPercentage(percentage: number): bigint {
  if (!Number.isFinite(percentage) || percentage < 0 || percentage > 100) {
    throw new RangeError(`Each percentage must be between 0 and 100, got ${percentage}`);
  }
  const scaled = percentage * PERCENT_SCALE;
  const rounded = Math.round(scaled);
  if (Math.abs(scaled - rounded) > 1e-3) {
    throw new RangeError(`Percentage ${percentage} has more than 6 decimal places`);
  }
  return BigInt(rounded);
}

/**
 * Largest remainder allocation. Each installment gets the floor of its exact
 * share (`total * weight / weightSum`); the minor units left over, always
 * fewer than the number of installments, go one each to the installments with
 * the biggest fractional remainders. All arithmetic is integer arithmetic.
 */
function allocate(total: number, weights: bigint[], weightSum: bigint, options: SplitOptions): number[] {
  if (!Number.isSafeInteger(total)) {
    throw new RangeError(`Total must be a safe integer number of minor units, got ${total}`);
  }
  if (total < 0 && !options.allowNegative) {
    throw new RangeError(`Negative total ${total} rejected; pass allowNegative to split a refund or credit`);
  }

  const magnitude = BigInt(Math.abs(total));
  const shares = weights.map((weight) => (magnitude * weight) / weightSum);
  const remainders = weights.map((weight) => (magnitude * weight) % weightSum);
  const leftover = Number(magnitude - shares.reduce((a, b) => a + b, 0n));

  const lastWins = options.remainder === "last";
  const order = shares
    .map((_, index) => index)
    .sort((a, b) => {
      const byRemainder = remainders[a]! === remainders[b]! ? 0 : remainders[a]! > remainders[b]! ? -1 : 1;
      return byRemainder || (lastWins ? b - a : a - b);
    });
  for (const index of order.slice(0, leftover)) {
    shares[index]! += 1n;
  }

  const negative = total < 0;
  return shares.map((share) => (negative && share !== 0n ? -Number(share) : Number(share)));
}
