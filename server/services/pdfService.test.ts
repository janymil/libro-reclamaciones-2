import { afterEach, describe, expect, it } from "vitest";
import { computeComplaintVerificationCode } from "./pdfService";
import { buildConsultUrl } from "./consultUrl";

describe("computeComplaintVerificationCode", () => {
  const complaint = { id: "comp-1", correlativeNumber: "2026-0001" };

  it("is deterministic for the same business and complaint", () => {
    expect(computeComplaintVerificationCode("biz-1", complaint)).toBe(
      computeComplaintVerificationCode("biz-1", complaint),
    );
  });

  it("changes with the business or the correlative number", () => {
    expect(computeComplaintVerificationCode("biz-1", complaint)).not.toBe(
      computeComplaintVerificationCode("biz-2", complaint),
    );
    expect(computeComplaintVerificationCode("biz-1", complaint)).not.toBe(
      computeComplaintVerificationCode("biz-1", { ...complaint, correlativeNumber: "2026-0002" }),
    );
  });

  it("formats as XXXX-XXXX without ambiguous characters", () => {
    const code = computeComplaintVerificationCode("biz-1", complaint);
    expect(code).toMatch(/^[0-9A-Z]{4}-[0-9A-Z]{4}$/);
    expect(code).not.toMatch(/[01OIL]/);
  });
});

describe("buildConsultUrl", () => {
  const original = process.env.APP_URL;

  afterEach(() => {
    process.env.APP_URL = original;
  });

  it("builds the folio deep link and trims trailing slashes", () => {
    process.env.APP_URL = "https://app.example.com/";
    expect(buildConsultUrl("mi-empresa", "2026-0001")).toBe(
      "https://app.example.com/libro/mi-empresa?folio=2026-0001",
    );
  });

  it("returns undefined without APP_URL or slug (no broken QR)", () => {
    process.env.APP_URL = "";
    expect(buildConsultUrl("mi-empresa", "2026-0001")).toBeUndefined();

    process.env.APP_URL = "https://app.example.com";
    expect(buildConsultUrl(null, "2026-0001")).toBeUndefined();
    expect(buildConsultUrl(undefined, "2026-0001")).toBeUndefined();
  });
});
