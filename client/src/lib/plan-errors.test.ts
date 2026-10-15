import { describe, it, expect } from 'vitest';

import {
  PLAN_ERROR_CODES,
  UPGRADE_PATH,
  isPlanError,
  parsePlanError,
  planErrorMessage,
} from './plan-errors';

/**
 * A plan rejection must never be mistaken for a random failure: the UI has to
 * read the API's own sentence and offer the upgrade path. These are the two
 * shapes `apiRequest` actually throws.
 */

describe('parsePlanError', () => {
  it('reads the message and code out of the apiRequest 402 string', () => {
    const error = new Error(
      '402: {"message":"Su plan Básico permite hasta 2 usuarios. Mejore su plan.","code":"quota_exceeded"}',
    );

    expect(parsePlanError(error)).toEqual({
      status: 402,
      code: 'quota_exceeded',
      message: 'Su plan Básico permite hasta 2 usuarios. Mejore su plan.',
    });
  });

  it('reads a feature gate the same way', () => {
    const parsed = parsePlanError(
      new Error('402: {"message":"Disponible desde el plan Pro.","code":"plan_upgrade_required"}'),
    );

    expect(parsed.status).toBe(402);
    expect(parsed.code).toBe('plan_upgrade_required');
  });

  it('never throws on a plain error, so the caller always gets a message', () => {
    expect(parsePlanError(new Error('boom'))).toEqual({
      status: null,
      code: null,
      message: 'boom',
    });
    expect(parsePlanError(undefined).message).toBe('');
  });

  it('survives a 402 whose body is not valid JSON', () => {
    expect(parsePlanError(new Error('402: <html>proxy</html>'))).toEqual({
      status: 402,
      code: null,
      message: '',
    });
  });
});

describe('isPlanError', () => {
  it('treats every plan/quota code as an upgrade situation', () => {
    for (const code of PLAN_ERROR_CODES) {
      expect(isPlanError(new Error(`402: {"message":"x","code":"${code}"}`))).toBe(true);
    }
  });

  it('never hijacks an unrelated failure', () => {
    expect(isPlanError(new Error('500: {"message":"boom"}'))).toBe(false);
    expect(isPlanError(new Error('network down'))).toBe(false);
  });
});

describe('planErrorMessage', () => {
  it('shows the server sentence when there is one', () => {
    expect(
      planErrorMessage(new Error('402: {"message":"Active el plan Básico.","code":"quota_exceeded"}')),
    ).toBe('Active el plan Básico.');
  });

  it('falls back to a sentence that still points at the plans, never empty', () => {
    expect(planErrorMessage(new Error(''))).toContain('plan');
  });
});

describe('the upgrade path', () => {
  it('points at the in-app plan page', () => {
    expect(UPGRADE_PATH).toBe('/plan');
  });
});
