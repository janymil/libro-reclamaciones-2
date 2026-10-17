import { describe, expect, it } from "vitest";

import { RETENTION_MONTHS } from "./plans";
import {
  MAX_PRIVACY_POLICY_URL_LENGTH,
  buildPrivacyPolicy,
  normalizePrivacyPolicyUrl,
  privacyPolicyPath,
  privacyPolicyUrlSchema,
} from "./privacy-policy";

/**
 * The privacy policy behind the consent checkbox of the public form.
 *
 * Two risks are covered here. The first is the link: the value is typed by an
 * operator and rendered as an `href` on a public page, so only http(s) may come
 * out of the normalizer. The second is the text: it is generated for a business
 * that has no policy of its own, so it must carry the responsible party, the real
 * retention window and working channels for the ARCO rights - and must not leak
 * the internal notification inbox the public endpoints stopped exposing.
 */
describe("normalizePrivacyPolicyUrl", () => {
  it("keeps an http(s) URL", () => {
    expect(normalizePrivacyPolicyUrl("https://www.cencosud.pe/politica-de-privacidad")).toBe(
      "https://www.cencosud.pe/politica-de-privacidad",
    );
    expect(normalizePrivacyPolicyUrl("http://miempresa.pe/privacidad")).toBe(
      "http://miempresa.pe/privacidad",
    );
  });

  it("completes a bare domain with https, which is what an operator types", () => {
    expect(normalizePrivacyPolicyUrl("miempresa.pe/politica")).toBe("https://miempresa.pe/politica");
    expect(normalizePrivacyPolicyUrl("  www.miempresa.pe  ")).toBe("https://www.miempresa.pe/");
  });

  it("refuses anything that is not a web page", () => {
    expect(normalizePrivacyPolicyUrl("javascript:alert(document.cookie)")).toBeNull();
    expect(normalizePrivacyPolicyUrl("data:text/html,<script>alert(1)</script>")).toBeNull();
    expect(normalizePrivacyPolicyUrl("//evil.example/politica")).toBeNull();
    expect(normalizePrivacyPolicyUrl("ftp://miempresa.pe/politica")).toBeNull();
    expect(normalizePrivacyPolicyUrl("https://localhost/politica")).toBeNull();
    expect(normalizePrivacyPolicyUrl("no es una url")).toBeNull();
  });

  it("treats empty and non-string input as nothing to publish", () => {
    expect(normalizePrivacyPolicyUrl("")).toBeNull();
    expect(normalizePrivacyPolicyUrl("   ")).toBeNull();
    expect(normalizePrivacyPolicyUrl(null)).toBeNull();
    expect(normalizePrivacyPolicyUrl(undefined)).toBeNull();
    expect(normalizePrivacyPolicyUrl({ url: "https://miempresa.pe" })).toBeNull();
  });

  it("never returns a value the column could not store", () => {
    const tooLong = `https://miempresa.pe/${"a".repeat(MAX_PRIVACY_POLICY_URL_LENGTH)}`;

    expect(normalizePrivacyPolicyUrl(tooLong)).toBeNull();
  });
});

describe("privacyPolicyUrlSchema", () => {
  it("normalizes what the operator sends", () => {
    expect(privacyPolicyUrlSchema.parse(" miempresa.pe/privacidad ")).toBe(
      "https://miempresa.pe/privacidad",
    );
  });

  it("clears the link with an empty string or null", () => {
    expect(privacyPolicyUrlSchema.parse("")).toBeNull();
    expect(privacyPolicyUrlSchema.parse("   ")).toBeNull();
    expect(privacyPolicyUrlSchema.parse(null)).toBeNull();
  });

  it("leaves the field untouched when it is not sent at all", () => {
    // Saving an unrelated field must not wipe the published link.
    expect(privacyPolicyUrlSchema.parse(undefined)).toBeUndefined();
  });

  it("rejects an unusable value instead of saving it", () => {
    expect(privacyPolicyUrlSchema.safeParse("javascript:alert(1)").success).toBe(false);
    expect(
      privacyPolicyUrlSchema.safeParse("x".repeat(MAX_PRIVACY_POLICY_URL_LENGTH + 1)).success,
    ).toBe(false);
  });
});

describe("buildPrivacyPolicy", () => {
  const cencosud = {
    businessName: "Cencosud Retail Perú S.A.",
    commercialName: "Wong",
    ruc: "20109072177",
    address: "Av. Alfredo Benavides 3187",
    distrito: "Santiago de Surco",
    provincia: "Lima",
    departamento: "Lima",
    whatsappNumber: "999888777",
    websiteUrl: "https://www.wong.pe",
  };

  it("identifies the responsible party as the consumer sees it", () => {
    const policy = buildPrivacyPolicy(cencosud);

    expect(policy.responsible).toMatchObject({
      name: "Cencosud Retail Perú S.A.",
      commercialName: "Wong",
      ruc: "20109072177",
      address: "Av. Alfredo Benavides 3187, Santiago de Surco, Lima, Lima",
    });
  });

  it("states the real retention window, not a hardcoded number", () => {
    const text = buildPrivacyPolicy(cencosud)
      .sections.flatMap((section) => section.paragraphs)
      .join(" ");

    expect(buildPrivacyPolicy(cencosud).retentionMonths).toBe(RETENTION_MONTHS);
    expect(text).toContain(`durante ${RETENTION_MONTHS} meses`);

    expect(buildPrivacyPolicy({ ...cencosud, retentionMonths: 12 }).retentionMonths).toBe(12);
  });

  it("offers only the channels the business actually published", () => {
    const withContacts = buildPrivacyPolicy(cencosud);
    expect(withContacts.arcoChannels[0]).toContain("Av. Alfredo Benavides 3187");
    expect(withContacts.arcoChannels).toContain("Por WhatsApp al 999888777.");
    expect(withContacts.arcoChannels).toContain("A través de la página web https://www.wong.pe.");

    const bare = buildPrivacyPolicy({
      businessName: "Bodega La Esquina",
      ruc: "20123456789",
      address: "Jr. Puno 123",
    });
    expect(bare.arcoChannels).toHaveLength(1);
    expect(bare.arcoChannels[0]).toContain("Jr. Puno 123");
    expect(bare.responsible.commercialName).toBeNull();
  });

  it("covers every section the PDF draft covers, and never leaks the inbox", () => {
    const policy = buildPrivacyPolicy(cencosud);
    const titles = policy.sections.map((section) => section.title);

    expect(titles).toHaveLength(8);
    expect(titles[0]).toBe("1. Marco normativo");
    expect(policy.sections[0].paragraphs.join(" ")).toContain("Ley N° 29733");
    expect(titles[5]).toBe("6. Derechos ARCO");

    // The notification inbox is internal contact data: the public endpoints
    // stopped exposing it, and the policy text must not put it back.
    expect(JSON.stringify(policy)).not.toMatch(/@/);
  });
});

describe("privacyPolicyPath", () => {
  it("builds the hosted policy URL of a book", () => {
    expect(privacyPolicyPath("empresa-demo")).toBe("/libro/empresa-demo/politica-de-privacidad");
    expect(privacyPolicyPath("tienda ríos")).toBe("/libro/tienda%20r%C3%ADos/politica-de-privacidad");
  });
});
