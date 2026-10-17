import "./scripts/load-env.mjs";

/**
 * Manual check of the consumer-facing email (dev tool).
 *
 * Builds the confirmation a consumer of the given business would receive, using
 * the real rows in the database, and writes it to `email-preview.html` plus a
 * summary to stdout. The transporter is replaced with an in-memory stub, so
 * nothing is ever sent.
 *
 *   npx tsx verify-business-email.ts "CENCOSUD"
 */

const { db } = await import("./server/db");
const { eq } = await import("drizzle-orm");
const { businesses, complaints } = await import("@shared/schema");
const { storage } = await import("./server/storage");
const { emailIdentity } = await import("./server/services/emailIdentity");
const { emailService } = await import("./server/services/emailService");

const needle = (process.argv[2] ?? "CENCOSUD").toUpperCase();

const rows = await db.select().from(businesses);
const business = rows.find((row) => row.businessName.toUpperCase().includes(needle));

if (!business) {
  console.error(`No business matches "${needle}"`);
  process.exit(1);
}

const config = await storage.getLibroConfiguration(business.id);
const identity = emailIdentity(business, config);

const [complaint] = await db
  .select()
  .from(complaints)
  .where(eq(complaints.businessId, business.id))
  .limit(1);

let captured: any = null;
// Hard safety: replace the transporter, so no SMTP call can happen here.
(emailService as any).transporter = {
  sendMail: async (options: any) => {
    captured = options;
    return { messageId: "preview" };
  },
};

await emailService.sendComplaintConfirmation(
  complaint?.consumerEmail ?? "consumidor@example.com",
  (complaint ?? {}) as any,
  undefined,
  {
    subjectPrefix: config?.emailSubjectPrefix ?? null,
    headerText: config?.emailHeaderText ?? null,
    footerText: config?.emailFooterText ?? null,
    identity,
  },
);

const mask = (value: string | null | undefined) =>
  value ? value.replace(/^(.{2}).*(@.*)$/, "$1***$2") : null;

console.log(`business : ${business.businessName}`);
console.log(`identity : ${JSON.stringify({ ...identity, fromAddress: mask(identity.fromAddress), replyTo: mask(identity.replyTo) }, null, 2)}`);
console.log(`from     : ${JSON.stringify(captured?.from)}`);
console.log(`replyTo  : ${JSON.stringify(captured?.replyTo)}`);
console.log(`subject  : ${captured?.subject}`);
console.log(`logo in body : ${String(captured?.html ?? "").includes("<img")}`);
console.log(`footer   : ${(captured?.text ?? "").split("\n").slice(-5).join(" | ")}`);

const { writeFileSync } = await import("node:fs");
writeFileSync("email-preview.html", String(captured?.html ?? ""));

process.exit(0);
