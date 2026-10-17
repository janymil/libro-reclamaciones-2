import { describe, expect, it } from "vitest";

import { parseJsonObject } from "./aiService";

describe("parseJsonObject", () => {
  it("parses a clean object", () => {
    expect(parseJsonObject<{ ok: boolean }>('{"ok":true}')).toEqual({ ok: true });
  });

  it("parses a fenced object", () => {
    expect(parseJsonObject<{ ok: boolean }>('```json\n{"ok":true}\n```')).toEqual({ ok: true });
  });

  it("extracts an object surrounded by prose", () => {
    expect(parseJsonObject<{ ok: boolean }>('Aquí está:\n{"ok":true}\nSaludos.')).toEqual({ ok: true });
  });

  it("returns an empty object for empty content", () => {
    expect(parseJsonObject(null)).toEqual({});
  });

  it("throws when there is no object at all", () => {
    expect(() => parseJsonObject("sin json")).toThrow(/valid JSON/);
  });
});
