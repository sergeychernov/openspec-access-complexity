// Integer arithmetic helpers. All products/divisions go through BigInt and use a single
// rounding rule: floor (round toward negative infinity). Inputs must be safe integers.

export const BP_MAX = 10000; // basis points scale for indices, coefficients and utilities

export function assertInt(x, label = 'value') {
  if (typeof x !== 'number' || !Number.isSafeInteger(x)) {
    throw new RangeError(`${label} must be a safe integer, got ${String(x)}`);
  }
  return x;
}

function toBig(x, label) {
  if (typeof x === 'bigint') return x;
  assertInt(x, label);
  return BigInt(x);
}

export function bigFloorDiv(a, b) {
  if (b === 0n) throw new RangeError('division by zero');
  let q = a / b;
  if ((a % b !== 0n) && ((a < 0n) !== (b < 0n))) q -= 1n;
  return q;
}

export function toSafe(big, label = 'result') {
  if (big > BigInt(Number.MAX_SAFE_INTEGER) || big < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new RangeError(`${label} exceeds safe integer range`);
  }
  return Number(big);
}

// floor(a * b / c)
export function mulDiv(a, b, c, label = 'mulDiv') {
  return toSafe(bigFloorDiv(toBig(a, label) * toBig(b, label), toBig(c, label)), label);
}

// floor(sum(num) / den) where num and den are BigInt sums
export function floorDiv(a, b, label = 'floorDiv') {
  return toSafe(bigFloorDiv(toBig(a, label), toBig(b, label)), label);
}

export function sumBig(values) {
  let s = 0n;
  for (const v of values) s += toBig(v, 'sum term');
  return s;
}

export function clamp(x, lo, hi) {
  assertInt(x); assertInt(lo); assertInt(hi);
  return x < lo ? lo : (x > hi ? hi : x);
}

// N(x, anchor) = min(10000, floor(10000 * x / anchor)), anchor > 0, x >= 0
export function normalize(x, anchor) {
  assertInt(x, 'normalize x');
  assertInt(anchor, 'normalize anchor');
  if (anchor <= 0) throw new RangeError('anchor must be positive');
  if (x < 0) throw new RangeError('normalize x must be non-negative');
  return Math.min(BP_MAX, mulDiv(BP_MAX, x, anchor, 'normalize'));
}

// Weighted average floor(sum(w_i * v_i) / sum(w_i)); returns null when sum(w) == 0.
export function weightedAverage(pairs) {
  let num = 0n;
  let den = 0n;
  for (const [w, v] of pairs) {
    num += toBig(w, 'weight') * toBig(v, 'value');
    den += toBig(w, 'weight');
  }
  if (den === 0n) return null;
  return floorDiv(num, den, 'weightedAverage');
}
