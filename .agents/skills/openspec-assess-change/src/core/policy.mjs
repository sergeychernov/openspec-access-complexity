// Selection policy "minimum-resource-with-time-penalty" (policy version 1).
// Among variants that pass the quality floor and critical factors, the preferred one has the smallest
//
//   S = C × (1 + k × max(0, T − g) / s)
//
// C — upper forecast of the original resource use (API highMicros or subscription highLoad),
// T — typical time forecast in minutes, g — grace minutes (no penalty up to and including g),
// s — interval minutes (> 0), k = rateBp / 10000 per interval (0 disables the time penalty).
// S is exact: numerator = C × (10000·s + rateBp·over), denominator = 10000·s, compared by BigInt
// cross-multiplication. There is no saturation, no anchor and no rounding before comparison; S is a
// comparison criterion, never a billed amount or a quota draw (budget/quota checks use C itself).

export const POLICY_ID = 'minimum-resource-with-time-penalty';
export const LEGACY_POLICY_ID = 'weighted-utility';
export const POLICY_VERSION = 1;

function reduce(num, den) {
  let a = num < 0n ? -num : num;
  let b = den;
  while (b) [a, b] = [b, a % b];
  const g = a || 1n;
  return { numerator: num / g, denominator: den / g };
}

const asText = (f) => ({ numerator: f.numerator.toString(), denominator: f.denominator.toString() });

// Returns the adjusted cost for one variant. `cost` and `typicalMinutes` are integers or null.
export function adjustedCost({ cost, typicalMinutes, penalty, costUnit }) {
  const { graceMinutes: g, intervalMinutes: s, rateBp: k } = penalty;
  const missing = [];
  if (cost === null || cost === undefined) missing.push(costUnit === 'micros' ? 'API cost (high forecast)' : 'subscription load (high forecast)');
  const needTime = k > 0;
  if (needTime && (typicalMinutes === null || typicalMinutes === undefined)) missing.push('typical time (needed for the time penalty)');
  const over = typicalMinutes === null || typicalMinutes === undefined ? null : Math.max(0, typicalMinutes - g);
  const den = 10000n * BigInt(s);
  const multiplier = needTime
    ? (over === null ? null : reduce(den + BigInt(k) * BigInt(over), den))
    : { numerator: 1n, denominator: 1n };
  const out = {
    policy: POLICY_ID,
    costUnit,
    cost: cost ?? null,
    typicalMinutes: typicalMinutes ?? null,
    graceMinutes: g,
    intervalMinutes: s,
    rateBp: k,
    overMinutes: needTime ? over : null,
    multiplier: multiplier ? asText(multiplier) : null,
    value: null,
    complete: missing.length === 0,
    missing,
  };
  if (out.complete) {
    out.value = asText(reduce(BigInt(cost) * multiplier.numerator, multiplier.denominator));
  }
  return out;
}

// -1 / 0 / 1 for exact fractions given as { numerator, denominator } decimal strings.
export function compareFraction(a, b) {
  const l = BigInt(a.numerator) * BigInt(b.denominator);
  const r = BigInt(b.numerator) * BigInt(a.denominator);
  return l === r ? 0 : (l < r ? -1 : 1);
}

// Decimal rendering for display only (never used for ordering).
export function formatFraction(f, decimals = 4) {
  if (!f) return null;
  const n = BigInt(f.numerator);
  const d = BigInt(f.denominator);
  const scale = 10n ** BigInt(decimals);
  const q = (n * scale) / d;
  const whole = q / scale;
  const frac = (q % scale).toString().padStart(decimals, '0').replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : whole.toString();
}
