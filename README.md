# installment-split

[![CI](https://github.com/yourprivatedevs/installment-split/actions/workflows/ci.yml/badge.svg)](https://github.com/yourprivatedevs/installment-split/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Split a money total into installments, cent-accurate. Equal split or custom
percentages, in integer minor units, with a documented rule for where the
leftover cents go. TypeScript, zero runtime dependencies.

```ts
import { splitEqual, toMinorUnits, formatMinorUnits } from "installment-split";

const total = toMinorUnits("100.00", "USD");            // 10000
splitEqual(total, 3).map((p) => formatMinorUnits(p, "USD"));
// ["33.34", "33.33", "33.33"]  adds up to 100.00
```

## The problem

Dividing money by `n` and rounding each piece does not add back up to the total:

```ts
const piece = (100 / 3).toFixed(2);   // "33.33"
Number(piece) * 3;                    // 99.99, one cent has vanished
```

Floats make it worse before rounding even starts: `0.1 + 0.2` is
`0.30000000000000004`, and `19.99 * 100` is `1998.9999999999998`. A payment
plan that charges three times `33.33` for a `100.00` quote is short by a cent,
and a plan that rounds each piece up is over. Either way the schedule no
longer matches the quote, and someone finds out when the books are reconciled.

This library avoids both problems:

- Amounts are **integers in minor units** (cents for USD, yen for JPY, fils for
  KWD). No floating point is involved in the split.
- The split is done once, over the whole total, with a **fixed allocation
  rule**, so the installments always sum to exactly the input.

## Install

```sh
npm install github:yourprivatedevs/installment-split
```

Not on the npm registry; npm installs it from GitHub and builds it on install.
Requires Node 20 or later. ES modules only.

## Usage

### Equal installments

```ts
import { splitEqual } from "installment-split";

splitEqual(10000, 3);                         // [3334, 3333, 3333]
splitEqual(10000, 3, { remainder: "last" });  // [3333, 3333, 3334]
splitEqual(1, 3);                             // [1, 0, 0]   one cent, three installments
```

### Custom percentages

Percentages must add up to exactly 100. They are read to 6 decimal places and
held as integers, so `33.33 + 33.33 + 33.34` is exactly 100 with no float
error.

```ts
import { splitByPercentages } from "installment-split";

splitByPercentages(10000, [33.33, 33.33, 33.34]);  // [3333, 3333, 3334]
splitByPercentages(100000, [30, 35, 35]);          // [30000, 35000, 35000]  deposit, then two payments
splitByPercentages(9999, [30, 35, 35]);            // [3000, 3500, 3499]
```

### Currencies with 0, 2 or 3 decimal places

The split itself does not care about currency; it works on whole minor units.
The currency only matters when converting to and from decimal strings, and the
helpers do that without floating point:

```ts
import { splitEqual, toMinorUnits, formatMinorUnits } from "installment-split";

// JPY has no minor unit below 1 yen
splitEqual(toMinorUnits("1000", "JPY"), 3).map((p) => formatMinorUnits(p, "JPY"));
// ["334", "333", "333"]

// KWD has three decimal places
splitEqual(toMinorUnits("10.000", "KWD"), 3).map((p) => formatMinorUnits(p, "KWD"));
// ["3.334", "3.333", "3.333"]
```

`currencyDigits("JPY")` is `0`, `currencyDigits("KWD")` is `3`, and any other
three-letter code is `2`. The built-in lists cover the common ISO 4217
currencies with 0 and 3 decimal places. For anything else, pass the number of
decimal places directly: `toMinorUnits("1.2345", 4)`.

### Refunds and credits

Negative totals are rejected by default so that a sign error upstream does not
turn into a schedule of negative payments. To split a refund on purpose, opt in:

```ts
splitEqual(-10000, 3, { allowNegative: true });  // [-3334, -3333, -3333]
```

## The allocation rule

This is the part to read if you need the schedule to be predictable.

1. Each installment's exact share is `total * weight / sum of weights`. For an
   equal split every weight is 1; for percentages the weights are the
   percentages.
2. Every installment gets the **floor** of its exact share in minor units.
3. The minor units still unassigned are always **fewer than the number of
   installments**. They are handed out **one each**, to the installments with
   the **largest fractional remainder** (the largest remainder method).
4. Ties are broken by position: the **earliest** installment wins by default,
   or the **latest** with `{ remainder: "last" }`.

Consequences worth knowing:

- For an equal split every fractional remainder is the same, so rule 4 decides:
  with `"first"` the first *r* installments are one unit larger, where *r* is the
  leftover; with `"last"` it is the last *r*. No two installments ever differ
  by more than one minor unit.
- For percentages the leftover goes where the rounding loss was largest, so
  each installment is within one minor unit of its exact share.
- An installment with a 0% weight never receives a leftover unit.
- The result depends only on the inputs. Same input, same schedule, every time.

Pick `"first"` when the first payment is a deposit and may absorb the extra
cents, and `"last"` when you want the regular payments identical and the final
one to carry the difference. Whichever you choose, keep it fixed so schedules
can be regenerated and compared.

## API

| Function | Description |
| --- | --- |
| `splitEqual(total, parts, options?)` | Split `total` minor units into `parts` near-equal installments. |
| `splitByPercentages(total, percentages, options?)` | Split by percentages that sum to 100. |
| `toMinorUnits(amount, currency)` | Parse `"19.99"` into `1999`. Rejects more decimals than the currency has. |
| `formatMinorUnits(minor, currency)` | Format `1999` as `"19.99"`. |
| `currencyDigits(currency)` | Decimal places for an ISO 4217 code (0, 2 or 3). |

`SplitOptions`: `remainder?: "first" | "last"` (default `"first"`) and
`allowNegative?: boolean` (default `false`).

Input is validated and a `RangeError` is thrown for:

- a total that is not a safe integer, or is negative without `allowNegative`
- fewer than one installment, or a non-integer installment count
- percentages that do not sum to exactly 100, are negative, are above 100, are
  not finite, or have more than 6 decimal places (use `splitEqual` for thirds)
- decimal strings with more places than the currency allows, or that are not
  plain decimals (`"1,000.00"`, `"1e3"`)

## Used for

Quoting tools that offer payment plans: a deposit plus balance, or the same
amount over several months, where the schedule has to match the quote to the
cent.

## Development

```sh
npm install
npm test        # compiles with tsc, then runs node:test
npm run build   # emits dist/
```

## License

MIT, copyright Your Private Dev. Built by [Your Private Dev](https://yourprivatedev.com),
a one-person engineering service for workflow automation, AI agents and
integrations.
