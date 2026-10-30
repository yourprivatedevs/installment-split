import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { currencyDigits, formatMinorUnits, toMinorUnits } from "../src/index.js";

describe("currencyDigits", () => {
  it("resolves 0, 2 and 3 decimal currencies", () => {
    assert.equal(currencyDigits("JPY"), 0);
    assert.equal(currencyDigits("KRW"), 0);
    assert.equal(currencyDigits("USD"), 2);
    assert.equal(currencyDigits("EUR"), 2);
    assert.equal(currencyDigits("KWD"), 3);
    assert.equal(currencyDigits("BHD"), 3);
  });

  it("is case and whitespace insensitive", () => {
    assert.equal(currencyDigits(" jpy "), 0);
  });

  it("accepts a decimal place count directly", () => {
    assert.equal(currencyDigits(3), 3);
  });

  it("rejects malformed codes and counts", () => {
    assert.throws(() => currencyDigits("US"), RangeError);
    assert.throws(() => currencyDigits("DOLLAR"), RangeError);
    assert.throws(() => currencyDigits(-1), RangeError);
    assert.throws(() => currencyDigits(2.5), RangeError);
    assert.throws(() => currencyDigits(9), RangeError);
  });
});

describe("toMinorUnits", () => {
  it("parses decimal strings exactly", () => {
    assert.equal(toMinorUnits("100.00", "USD"), 10000);
    assert.equal(toMinorUnits("19.99", "USD"), 1999);
    assert.equal(toMinorUnits("0.01", "USD"), 1);
    assert.equal(toMinorUnits("5", "USD"), 500);
    assert.equal(toMinorUnits("5.1", "USD"), 510);
    assert.equal(toMinorUnits("1500", "JPY"), 1500);
    assert.equal(toMinorUnits("1.250", "KWD"), 1250);
  });

  it("handles negative amounts", () => {
    assert.equal(toMinorUnits("-19.99", "USD"), -1999);
    assert.ok(!Object.is(toMinorUnits("-0.00", "USD"), -0));
  });

  it("accepts numbers whose shortest decimal form fits the currency", () => {
    // 19.99 * 100 is 1998.9999999999998 in floating point; parsing the text avoids that.
    assert.equal(toMinorUnits(19.99, "USD"), 1999);
  });

  it("rejects numbers that carry floating point noise", () => {
    assert.throws(() => toMinorUnits(0.1 + 0.2, "USD"), /decimal places/);
    assert.throws(() => toMinorUnits(1.005, "USD"), /decimal places/);
  });

  it("rejects more decimal places than the currency has, unless they are zeros", () => {
    assert.throws(() => toMinorUnits("10.5", "JPY"), /decimal places/);
    assert.throws(() => toMinorUnits("10.001", "USD"), /decimal places/);
    assert.equal(toMinorUnits("10.000", "USD"), 1000);
    assert.equal(toMinorUnits("10.0", "JPY"), 10);
  });

  it("rejects text that is not a plain decimal", () => {
    for (const bad of ["", "abc", "1,000.00", "1e3", "$5", ".5", "5.", "--5"]) {
      assert.throws(() => toMinorUnits(bad, "USD"), RangeError, JSON.stringify(bad));
    }
    assert.throws(() => toMinorUnits(Number.NaN, "USD"), RangeError);
    assert.throws(() => toMinorUnits(1e21, "USD"), RangeError);
  });

  it("rejects amounts too large to represent exactly", () => {
    assert.throws(() => toMinorUnits("90071992547409.92", "USD"), /too large/);
    assert.equal(toMinorUnits("90071992547409.91", "USD"), Number.MAX_SAFE_INTEGER);
  });
});

describe("formatMinorUnits", () => {
  it("formats with the currency's decimal places", () => {
    assert.equal(formatMinorUnits(3334, "USD"), "33.34");
    assert.equal(formatMinorUnits(5, "USD"), "0.05");
    assert.equal(formatMinorUnits(0, "USD"), "0.00");
    assert.equal(formatMinorUnits(1500, "JPY"), "1500");
    assert.equal(formatMinorUnits(1250, "KWD"), "1.250");
    assert.equal(formatMinorUnits(7, "KWD"), "0.007");
  });

  it("formats negative amounts", () => {
    assert.equal(formatMinorUnits(-5, "USD"), "-0.05");
    assert.equal(formatMinorUnits(-1250, "KWD"), "-1.250");
  });

  it("round-trips through toMinorUnits", () => {
    for (const [text, currency] of [["0.01", "USD"], ["12345.67", "EUR"], ["999", "JPY"], ["0.001", "KWD"], ["-8.80", "USD"]] as const) {
      assert.equal(formatMinorUnits(toMinorUnits(text, currency), currency), text);
    }
  });

  it("rejects values that are not safe integers", () => {
    assert.throws(() => formatMinorUnits(1.5, "USD"), RangeError);
    assert.throws(() => formatMinorUnits(Number.NaN, "USD"), RangeError);
  });
});
