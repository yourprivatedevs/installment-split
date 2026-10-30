/**
 * A currency, given either as an ISO 4217 code ("USD") or directly as the
 * number of decimal places of its minor unit (2).
 */
export type Currency = string | number;

/** ISO 4217 currencies whose minor unit has 0 decimal places. */
const ZERO_DECIMAL = new Set([
  "BIF", "CLP", "DJF", "GNF", "ISK", "JPY", "KMF", "KRW", "PYG", "RWF", "UGX",
  "VND", "VUV", "XAF", "XOF", "XPF",
]);

/** ISO 4217 currencies whose minor unit has 3 decimal places. */
const THREE_DECIMAL = new Set(["BHD", "IQD", "JOD", "KWD", "LYD", "OMR", "TND"]);

const MAX_DIGITS = 4;

/**
 * Number of decimal places in a currency's minor unit.
 *
 * Codes in the 0-decimal and 3-decimal lists resolve to 0 and 3; every other
 * well-formed three-letter code resolves to 2. A number is used as given, so
 * pass one for anything the lists do not cover.
 */
export function currencyDigits(currency: Currency): number {
  if (typeof currency === "number") {
    if (!Number.isInteger(currency) || currency < 0 || currency > MAX_DIGITS) {
      throw new RangeError(`Decimal places must be an integer from 0 to ${MAX_DIGITS}, got ${currency}`);
    }
    return currency;
  }
  const code = currency.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) {
    throw new RangeError(`Invalid currency code: ${JSON.stringify(currency)}`);
  }
  if (ZERO_DECIMAL.has(code)) return 0;
  if (THREE_DECIMAL.has(code)) return 3;
  return 2;
}

/**
 * Parse a decimal amount into an integer number of minor units, without ever
 * going through floating point arithmetic.
 *
 *   toMinorUnits("19.99", "USD")  // 1999
 *   toMinorUnits("1500", "JPY")   // 1500
 *   toMinorUnits("1.250", "KWD")  // 1250
 *
 * Throws if the amount has more decimal places than the currency allows
 * (trailing zeros are fine) or does not fit in a safe integer.
 */
export function toMinorUnits(amount: string | number, currency: Currency): number {
  const digits = currencyDigits(currency);
  const text = String(amount).trim();
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(text);
  if (!match) {
    throw new RangeError(`Not a plain decimal amount: ${JSON.stringify(text)}`);
  }
  const [, sign = "", whole = "0", fraction = ""] = match;
  const extra = fraction.slice(digits);
  if (/[^0]/.test(extra)) {
    throw new RangeError(`${JSON.stringify(text)} has more than ${digits} decimal places`);
  }
  const minor = BigInt(whole + fraction.slice(0, digits).padEnd(digits, "0"));
  if (minor > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError(`${JSON.stringify(text)} is too large to represent exactly`);
  }
  return sign === "-" && minor !== 0n ? -Number(minor) : Number(minor);
}

/**
 * Format an integer number of minor units as a plain decimal string.
 *
 *   formatMinorUnits(3334, "USD")  // "33.34"
 *   formatMinorUnits(-5, "USD")    // "-0.05"
 *   formatMinorUnits(1250, "KWD")  // "1.250"
 *
 * No thousands separators or currency symbols; use `Intl.NumberFormat` for
 * display and keep this for storage and APIs.
 */
export function formatMinorUnits(minor: number, currency: Currency): string {
  if (!Number.isSafeInteger(minor)) {
    throw new RangeError(`Minor units must be a safe integer, got ${minor}`);
  }
  const digits = currencyDigits(currency);
  const sign = minor < 0 ? "-" : "";
  const padded = String(Math.abs(minor)).padStart(digits + 1, "0");
  if (digits === 0) return sign + padded;
  return `${sign}${padded.slice(0, -digits)}.${padded.slice(-digits)}`;
}
