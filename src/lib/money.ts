/**
 * Money as integer minor units.
 *
 * A price is never a float. `19.99` is not representable in binary floating
 * point, and the error compounds the first time anything sums a column — the
 * classic symptom is a total that is off by a cent for reasons no one can
 * reproduce. Everything here is integer arithmetic; the decimal point exists
 * only in `formatMoney` and in the form input's parser.
 *
 * The currency travels with the amount because the catalogue is not
 * single-currency: VND has no minor unit at all (₫1 is one minor unit), while
 * USD has two decimal places. A bare integer with the currency held elsewhere
 * is how a ₫250,000 product becomes a $2,500.00 one.
 */

export type Currency = "VND" | "USD" | "EUR";

export const CURRENCIES: readonly Currency[] = ["VND", "USD", "EUR"];

/** How many decimal places the currency's minor unit implies. */
const FRACTION_DIGITS: Readonly<Record<Currency, number>> = {
  VND: 0,
  USD: 2,
  EUR: 2,
};

export const isCurrency = (value: string): value is Currency =>
  (CURRENCIES as readonly string[]).includes(value);

export const fractionDigits = (currency: Currency): number =>
  FRACTION_DIGITS[currency];

export type Money = {
  readonly minor: number;
  readonly currency: Currency;
};

/**
 * Parse what a person typed into minor units.
 *
 * Accepts the separators a Vietnamese keyboard and an English one both
 * produce — `250.000`, `250,000`, `250000` — which is genuinely ambiguous, so
 * the rule is explicit: the **last** separator is a decimal point only when it
 * is followed by exactly the currency's number of decimal places. `1.234` in
 * VND (zero decimal places) is therefore 1234, not 1.234.
 */
export const parseMoney = (
  input: string,
  currency: Currency,
): { readonly ok: true; readonly value: number } | { readonly ok: false } => {
  const trimmed = input.trim();
  if (trimmed === "") return { ok: false };
  if (!/^-?[\d.,\s]+$/.test(trimmed)) return { ok: false };

  const negative = trimmed.startsWith("-");
  const digitsAndSeps = trimmed.replace(/[-\s]/g, "");
  const digits = FRACTION_DIGITS[currency];

  const lastSep = Math.max(
    digitsAndSeps.lastIndexOf("."),
    digitsAndSeps.lastIndexOf(","),
  );
  const tail = lastSep === -1 ? "" : digitsAndSeps.slice(lastSep + 1);

  const isDecimalPoint =
    digits > 0 &&
    lastSep !== -1 &&
    tail.length === digits &&
    /^\d+$/.test(tail);

  const whole = (
    isDecimalPoint ? digitsAndSeps.slice(0, lastSep) : digitsAndSeps
  ).replace(/[.,]/g, "");
  const fraction = isDecimalPoint ? tail : "0".repeat(digits);

  if (!/^\d*$/.test(whole) || whole === "") return { ok: false };

  const minor = Number(`${whole}${fraction}`);
  if (!Number.isSafeInteger(minor)) return { ok: false };
  return { ok: true, value: negative ? -minor : minor };
};

/** Minor units back into the value a form field should show. */
export const toDecimalString = (minor: number, currency: Currency): string => {
  const digits = FRACTION_DIGITS[currency];
  if (digits === 0) return String(minor);
  const sign = minor < 0 ? "-" : "";
  const abs = Math.abs(minor)
    .toString()
    .padStart(digits + 1, "0");
  return `${sign}${abs.slice(0, -digits)}.${abs.slice(-digits)}`;
};

/** Localised display. `Intl` is given minor units divided down, never a value
 * that was a float earlier in its life. */
export const formatMoney = (money: Money, locale = "en-US"): string => {
  const digits = FRACTION_DIGITS[money.currency];
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: money.currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(money.minor / 10 ** digits);
};
