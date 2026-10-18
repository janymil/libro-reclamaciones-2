import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

/**
 * Customer-facing guardrail.
 *
 * The client bundle is public: every string here can be read by any visitor,
 * even on a protected route. Internal infrastructure (mail provider, AI
 * provider, model names, database provider, internal env vars) must never be
 * written into it. This test fails the build if one of those names comes back.
 */
const FORBIDDEN = [
  /zoho/i,
  /\bgroq\b/i,
  /\bopenai\b/i,
  /gpt-oss/i,
  /neondatabase|neon\.tech/i,
  /cloudflare/i,
  /AI_API_KEY/,
  /SMTP_ALLOWED_SENDER_DOMAINS/,
  /api\.(groq|openai)\.com/i,
];

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return sourceFiles(full);
    }
    if (!/\.(ts|tsx)$/.test(entry.name)) {
      return [];
    }
    // This file necessarily contains the forbidden patterns.
    if (entry.name === "public-content.test.ts") {
      return [];
    }
    return [full];
  });
}

describe("customer-facing source", () => {
  it("does not name infrastructure providers, models or internal env vars", () => {
    const root = path.resolve(import.meta.dirname, "..");
    const offenders: string[] = [];

    for (const file of sourceFiles(root)) {
      const content = fs.readFileSync(file, "utf8");
      for (const pattern of FORBIDDEN) {
        if (pattern.test(content)) {
          offenders.push(`${path.relative(root, file)} -> ${pattern}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
