import { useCallback, useEffect, useRef, useState } from "react";

import {
  POW_UNSUPPORTED_MESSAGE,
  fetchCaptchaChallenge,
  isPowSupported,
  solvePowChallenge,
  type SolvedCaptcha,
} from "@/lib/pow";

/**
 * Keeps a solved CAPTCHA ready for a form that will be submitted later.
 *
 * The consumer portal renders the challenge as soon as the form appears and
 * solves it while the visitor types, so submitting a complaint costs the visitor
 * nothing and requires no interaction with the verification. Components only
 * need to await `ensureSolved()` when they actually submit.
 */

export type CaptchaStatus = "solving" | "ready" | "error";

interface SolvedWithAge extends SolvedCaptcha {
  issuedAt: number;
}

/**
 * A challenge older than this is replaced before use.
 *
 * The server expires tokens after 10 minutes; a long complaint can easily take
 * that long, and a rejected submission is a much worse experience for the
 * visitor (and a legal-notice problem) than solving a fresh puzzle in 0.5 s.
 */
const REFRESH_AFTER_MS = 8 * 60 * 1000;

export interface CaptchaChallengeState {
  status: CaptchaStatus;
  /** Visitor-facing explanation when `status === "error"`. */
  error: string | null;
  /** Resolves with a solved challenge, solving (or refreshing) now if needed. */
  ensureSolved: () => Promise<SolvedCaptcha>;
  /** Discards the current challenge and solves a fresh one. */
  refresh: () => void;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "No se pudo completar la verificación de seguridad. Intente nuevamente.";
}

export function useCaptchaChallenge(): CaptchaChallengeState {
  const [status, setStatus] = useState<CaptchaStatus>("solving");
  const [error, setError] = useState<string | null>(null);

  // The solved pair lives in a ref as well as in state: `ensureSolved` must not
  // depend on a render that has not happened yet (a submission can arrive in the
  // same tick the puzzle was solved).
  const solvedRef = useRef<SolvedWithAge | null>(null);
  const pendingRef = useRef<Promise<SolvedCaptcha> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const begin = useCallback((): Promise<SolvedCaptcha> => {
    // Single flight: a submit and a retry landing together must not fetch two
    // challenges (the first one would be left unconsumed and unused).
    if (pendingRef.current) {
      return pendingRef.current;
    }

    setStatus("solving");
    setError(null);

    const pending = (async () => {
      try {
        if (!isPowSupported()) {
          throw new Error(POW_UNSUPPORTED_MESSAGE);
        }

        const challenge = await fetchCaptchaChallenge();
        const solution = await solvePowChallenge(challenge);
        const solved: SolvedWithAge = {
          token: challenge.token,
          solution,
          issuedAt: challenge.issuedAt ?? Date.now(),
        };

        solvedRef.current = solved;
        if (mountedRef.current) {
          setStatus("ready");
          setError(null);
        }

        return { token: solved.token, solution: solved.solution };
      } catch (caught) {
        solvedRef.current = null;
        if (mountedRef.current) {
          setStatus("error");
          setError(errorMessage(caught));
        }
        throw caught;
      } finally {
        pendingRef.current = null;
      }
    })();

    pendingRef.current = pending;
    return pending;
  }, []);

  // Preload on mount and swallow the rejection: the error is already rendered
  // from `status`/`error`, and an unhandled rejection here would only reach the
  // console.
  useEffect(() => {
    void begin().catch(() => undefined);
  }, [begin]);

  const ensureSolved = useCallback((): Promise<SolvedCaptcha> => {
    const current = solvedRef.current;
    if (current && Date.now() - current.issuedAt < REFRESH_AFTER_MS) {
      return Promise.resolve({ token: current.token, solution: current.solution });
    }

    solvedRef.current = null;
    return begin();
  }, [begin]);

  const refresh = useCallback(() => {
    solvedRef.current = null;
    void begin().catch(() => undefined);
  }, [begin]);

  return { status, error, ensureSolved, refresh };
}
