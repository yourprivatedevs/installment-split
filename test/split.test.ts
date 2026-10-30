import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatMinorUnits, splitByPercentages, splitEqual, toMinorUnits } from "../src/index.js";

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

describe("splitEqual", () => {
  it("splits 100.00 three ways with the extra cent on the first installment", () => {
    assert.deepEqual(splitEqual(10000, 3), [3334, 3333, 3333]);
  });

  it("can put the extra cents on the last installments instead", () => {
    assert.deepEqual(splitEqual(10000, 3, { remainder: "last" }), [3333, 3333, 3334]);
    assert.deepEqual(splitEqual(10002, 4, { remainder: "last" }), [2500, 2500, 2501, 2501]);
  });

  it("splits 0.01 three ways without losing or inventing a cent", () => {
    assert.deepEqual(splitEqual(1, 3), [1, 0, 0]);
    assert.deepEqual(splitEqual(1, 3, { remainder: "last" }), [0, 0, 1]);
    assert.deepEqual(splitEqual(2, 3), [1, 1, 0]);
  });

  it("returns the whole total for a single installment", () => {
    assert.deepEqual(splitEqual(1999, 1), [1999]);
  });

  it("returns zeros for a zero total", () => {
    assert.deepEqual(splitEqual(0, 4), [0, 0, 0, 0]);
  });

  it("returns exact shares when the total divides evenly", () => {
    assert.deepEqual(splitEqual(9000, 3), [3000, 3000, 3000]);
  });

  it("handles more installments than minor units", () => {
    assert.deepEqual(splitEqual(3, 5), [1, 1, 1, 0, 0]);
  });

  it("splits a 0-decimal currency (JPY)", () => {
    const total = toMinorUnits("1000", "JPY");
    const parts = splitEqual(total, 3);
    assert.deepEqual(parts, [334, 333, 333]);
    assert.deepEqual(parts.map((p) => formatMinorUnits(p, "JPY")), ["334", "333", "333"]);
  });

  it("splits a 3-decimal currency (KWD)", () => {
    const total = toMinorUnits("10.000", "KWD");
    const parts = splitEqual(total, 3);
    assert.deepEqual(parts.map((p) => formatMinorUnits(p, "KWD")), ["3.334", "3.333", "3.333"]);
  });

  it("splits a 2-decimal currency end to end from a decimal string", () => {
    const parts = splitEqual(toMinorUnits("100.00", "USD"), 3);
    assert.deepEqual(parts.map((p) => formatMinorUnits(p, "USD")), ["33.34", "33.33", "33.33"]);
  });

  it("sums exactly and never differs by more than one unit, for many totals and counts", () => {
    for (const rule of ["first", "last"] as const) {
      for (let total = 0; total <= 500; total += 1) {
        for (let parts = 1; parts <= 13; parts += 1) {
          const result = splitEqual(total, parts, { remainder: rule });
          assert.equal(result.length, parts);
          assert.equal(sum(result), total);
          assert.ok(Math.max(...result) - Math.min(...result) <= 1);
        }
      }
    }
  });

  it("stays exact at the edge of the safe integer range", () => {
    const parts = splitEqual(Number.MAX_SAFE_INTEGER, 3);
    assert.equal(sum(parts), Number.MAX_SAFE_INTEGER);
    assert.ok(Math.max(...parts) - Math.min(...parts) <= 1);
  });

  it("rejects an installment count below 1 or that is not an integer", () => {
    for (const bad of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      assert.throws(() => splitEqual(100, bad), RangeError);
    }
  });

  it("rejects totals that are not safe integers", () => {
    for (const bad of [10.5, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 53]) {
      assert.throws(() => splitEqual(bad, 3), RangeError);
    }
  });

  it("rejects negative totals by default", () => {
    assert.throws(() => splitEqual(-100, 3), /allowNegative/);
  });

  it("splits a negative total when allowNegative is set", () => {
    const parts = splitEqual(-10000, 3, { allowNegative: true });
    assert.deepEqual(parts, [-3334, -3333, -3333]);
    assert.equal(sum(parts), -10000);
  });

  it("never returns negative zero", () => {
    const parts = splitEqual(-1, 3, { allowNegative: true });
    assert.deepEqual(parts, [-1, 0, 0]);
    assert.ok(parts.every((p) => !Object.is(p, -0)));
  });
});

describe("splitByPercentages", () => {
  it("splits 100.00 as 33.33 / 33.33 / 33.34", () => {
    assert.deepEqual(splitByPercentages(10000, [33.33, 33.33, 33.34]), [3333, 3333, 3334]);
  });

  it("gives the single cent to the largest fractional remainder", () => {
    assert.deepEqual(splitByPercentages(1, [33.33, 33.33, 33.34]), [0, 0, 1]);
    assert.deepEqual(splitByPercentages(100, [33.33, 33.33, 33.34]), [33, 33, 34]);
  });

  it("splits a deposit plus balance plan", () => {
    assert.deepEqual(splitByPercentages(100000, [30, 35, 35]), [30000, 35000, 35000]);
  });

  it("breaks ties toward the first installment, or the last on request", () => {
    assert.deepEqual(splitByPercentages(101, [50, 50]), [51, 50]);
    assert.deepEqual(splitByPercentages(101, [50, 50], { remainder: "last" }), [50, 51]);
  });

  it("uses largest remainder, not position, when remainders differ", () => {
    // Exact shares 3.3, 3.3, 3.4: the leftover unit belongs to the third.
    assert.deepEqual(splitByPercentages(10, [33, 33, 34]), [3, 3, 4]);
    // Exact shares 0.4, 4.6, 5.0: the leftover unit goes to 4.6, not to the first installment.
    assert.deepEqual(splitByPercentages(10, [4, 46, 50]), [0, 5, 5]);
    // Exact shares 0.45, 4.05, 4.5: the leftover unit goes to 4.5.
    assert.deepEqual(splitByPercentages(9, [5, 45, 50]), [0, 4, 5]);
  });

  it("never gives a leftover unit to a 0% installment", () => {
    assert.deepEqual(splitByPercentages(1, [0, 50, 50]), [0, 1, 0]);
    assert.deepEqual(splitByPercentages(1, [50, 50, 0], { remainder: "last" }), [0, 1, 0]);
    assert.deepEqual(splitByPercentages(500, [100]), [500]);
  });

  it("accepts up to 6 decimal places", () => {
    assert.deepEqual(splitByPercentages(1_000_000, [33.333333, 33.333333, 33.333334]), [333333, 333333, 333334]);
  });

  it("splits JPY by percentages", () => {
    const parts = splitByPercentages(toMinorUnits("1000", "JPY"), [33.33, 33.33, 33.34]);
    assert.deepEqual(parts, [333, 333, 334]);
  });

  it("splits a negative total by percentages when allowed", () => {
    assert.deepEqual(splitByPercentages(-101, [50, 50], { allowNegative: true }), [-51, -50]);
  });

  it("sums exactly and stays within one unit of the exact share, for many plans", () => {
    const plans = [
      [33.33, 33.33, 33.34],
      [10, 20, 30, 40],
      [0.01, 99.99],
      [12.5, 12.5, 25, 50],
      [14.29, 14.29, 14.29, 14.29, 14.29, 14.29, 14.26],
      [100],
    ];
    for (const plan of plans) {
      for (const total of [0, 1, 2, 7, 99, 100, 101, 9999, 10000, 123457, 99999999]) {
        const parts = splitByPercentages(total, plan);
        assert.equal(sum(parts), total);
        parts.forEach((part, i) => {
          assert.ok(Math.abs(part - (total * plan[i]!) / 100) < 1, `${plan} of ${total}, part ${i}`);
        });
      }
    }
  });

  it("rejects percentages that do not add up to 100", () => {
    assert.throws(() => splitByPercentages(100, [33.33, 33.33, 33.33]), /add up to 100, got 99.99/);
    assert.throws(() => splitByPercentages(100, [50, 50.01]), /add up to 100/);
  });

  it("does not trip over floating point when adding percentages", () => {
    // 0.1 + 0.2 is 0.30000000000000004 as a float; 10 + 20 + 70 is exact either way.
    assert.deepEqual(splitByPercentages(1000, [0.1, 0.2, 99.7]), [1, 2, 997]);
  });

  it("rejects an empty list, negative, out-of-range and non-finite percentages", () => {
    assert.throws(() => splitByPercentages(100, []), RangeError);
    assert.throws(() => splitByPercentages(100, [-10, 110]), RangeError);
    assert.throws(() => splitByPercentages(100, [150, -50]), RangeError);
    assert.throws(() => splitByPercentages(100, [Number.NaN, 100]), RangeError);
  });

  it("rejects percentages finer than 6 decimal places instead of rounding them", () => {
    const third = 100 / 3;
    assert.throws(() => splitByPercentages(100, [third, third, third]), /more than 6 decimal places/);
  });

  it("rejects negative totals by default", () => {
    assert.throws(() => splitByPercentages(-100, [50, 50]), /allowNegative/);
  });
});
