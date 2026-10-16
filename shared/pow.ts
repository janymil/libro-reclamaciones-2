/**
 * Proof-of-work challenge contract, shared by the browser and the server.
 *
 * The public portal needs a "not a robot" gate that is (a) not a third-party
 * script, (b) usable without seeing, reading or typing anything, and (c) not
 * machine-trivial. A hash puzzle satisfies all three: the server hands out a
 * salt and a difficulty, the browser must find the first `nonce` whose
 * `SHA-256(salt + nonce)` digest starts with `difficulty` hex zeros, and the
 * server re-hashes the submitted nonce to check it.
 *
 * That is strictly better than an arithmetic question (which a bot just parses
 * out of the response) and strictly cheaper than an image puzzle for the people
 * who must be able to file a complaint: nothing is rendered to be read and
 * nothing has to be typed.
 *
 * Both sides must agree on the exact input string and on what counts as a
 * solution, so those two rules live here and nowhere else.
 */

export const POW_ALGORITHM = "SHA-256" as const;

/**
 * Leading hex zeros the solver must find. Each extra zero multiplies the
 * expected work by 16: 4 -> ~65k hashes (a few hundred ms in a browser),
 * 5 -> ~1M (noticeable on a phone), 6 -> ~16M (punishing).
 *
 * Tunable through `CAPTCHA_POW_DIFFICULTY` so a spam wave can be answered
 * without a deploy - and lowered again when it passes.
 */
export const DEFAULT_POW_DIFFICULTY = 4;

export const MIN_POW_DIFFICULTY = 1;
export const MAX_POW_DIFFICULTY = 6;

/**
 * Upper bound of the search space, i.e. the largest nonce the server accepts.
 * With difficulty 4 a solution is found after ~65k attempts on average, so the
 * bound is only a sanity limit on a client that never finds one.
 */
export const DEFAULT_POW_MAX_NUMBER = 2_000_000;

/** What the solver needs to know. Safe to publish: it is the puzzle. */
export interface PowChallenge {
  algorithm: typeof POW_ALGORITHM;
  salt: string;
  difficulty: number;
  maxNumber: number;
}

/** Coerces any configuration value into a usable difficulty. */
export function clampPowDifficulty(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_POW_DIFFICULTY;
  }
  const rounded = Math.floor(parsed);
  if (rounded < MIN_POW_DIFFICULTY) return MIN_POW_DIFFICULTY;
  if (rounded > MAX_POW_DIFFICULTY) return MAX_POW_DIFFICULTY;
  return rounded;
}

/** Coerces any configuration value into a usable search-space bound. */
export function clampPowMaxNumber(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return DEFAULT_POW_MAX_NUMBER;
  }
  return Math.floor(parsed);
}

/** The hex prefix a valid digest must start with. */
export function powTarget(difficulty: number): string {
  return "0".repeat(difficulty);
}

/**
 * The exact string that gets hashed. Kept as a function (not a template
 * inlined in two places) because a mismatch here silently rejects every
 * solution.
 */
export function powInput(salt: string, nonce: number): string {
  return `${salt}${nonce}`;
}

/** True when a lowercase hex digest meets the difficulty. */
export function satisfiesPow(digestHex: string, difficulty: number): boolean {
  const target = powTarget(difficulty);
  if (difficulty < MIN_POW_DIFFICULTY || digestHex.length < target.length) {
    return false;
  }
  return digestHex.startsWith(target);
}
