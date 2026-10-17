import "./scripts/load-env.mjs";

/**
 * Sends ONE real copy of the consumer confirmation email (dev/QA tool).
 *
 * The recipient is the tenant's own address - the business's administrator, or
 * its notification inbox - and NEVER the complaint's consumer address: this is a
 * design review of a real message, not a resend to a consumer. An explicit
 * address can be passed as the first argument.
 *
 *   npx tsx send-confirmation-preview.ts --dry-run     # show what would happen
 *   npx tsx send-confirmation-preview.ts               # send to the tenant owner
 *   npx tsx send-confirmation-preview.ts yo@correo.pe  # send to a given address
 */

const { eq } = await import("drizzle-orm");
const { db } = await import("./server/db");
const { businesses, complaints, users } = await import("@shared/schema");
const { storage } = await import("./server/storage");
const { emailIdentity } = await import("./server/services/emailIdentity");
const { emailService } = await import("./server/services/emailService");
const { pdfService } = await import("./server/services/pdfService");
const { buildConsultUrl } = await import("./server/services/consultUrl");
const { readLogoBuffer } = await import("./server/services/logoService");

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const explicitRecipient = args.find((arg) => !arg.startsWith("--"));

const needle = (process.env.PREVIEW_BUSINESS ?? "CENCOSUD").toUpperCase();
const mask = (value?: string | null) =>
  value ? value.replace(/^(.{2}).*(@.*)$/, "$1***$2") : null;

const allBusinesses = await db.select().from(businesses);
const business = allBusinesses.find((row) => row.businessName.toUpperCase().includes(needle));
if (!business) {
  console.error(`No business matches "${needle}"`);
  process.exit(1);
}

const [complaint] = await db
  .select()
  .from(complaints)
  .where(eq(complaints.businessId, business.id))
  .limit(1);
if (!complaint) {
  console.error(`"${business.businessName}" has no complaint to preview`);
  process.exit(1);
}

const establishment = await storage.getEstablishment(complaint.establishmentId);
const config = await storage.getLibroConfiguration(business.id);
const identity = emailIdentity(business, config);

// Who is "me": the tenant's own login first, then its notification inbox.
const tenantUsers = await db.select().from(users).where(eq(users.businessId, business.id));
const owner = tenantUsers.find((user) => user.role === "admin") ?? tenantUsers[0];
const recipient =
  explicitRecipient ??
  config?.notificationEmail ??
  owner?.email ??
  "";

console.log(`business  : ${business.businessName} (${business.ruc})`);
console.log(`complaint : ${complaint.correlativeNumber} · ${complaint.complaintType}`);
console.log(`consumer  : ${mask(complaint.consumerEmail)}  <- never used as recipient`);
console.log(`owner     : ${mask(owner?.email)}`);
console.log(`notify    : ${mask(config?.notificationEmail)}`);
console.log(`RECIPIENT : ${recipient}`);
console.log(`from      : ${identity.fromName} <${mask(identity.fromAddress)}>, reply-to ${mask(identity.replyTo)}`);
console.log(`logo      : ${identity.logoUrl ?? "(none uploaded)"}`);

if (!recipient) {
  console.error("No recipient resolved - pass one explicitly.");
  process.exit(1);
}

if (recipient.toLowerCase() === complaint.consumerEmail.toLowerCase()) {
  console.error(
    "Refusing to send: that address belongs to the consumer. Pass the address you want to review it in.",
  );
  process.exit(1);
}

if (!process.env.SMTP_USER || !process.env.SMTP_PASSWORD) {
  console.error("SMTP_USER / SMTP_PASSWORD are not configured: nothing would be delivered.");
  process.exit(1);
}

if (dryRun) {
  console.log("\n[dry-run] nothing sent.");
  process.exit(0);
}

if (!establishment) {
  console.error("The complaint's establishment no longer exists: cannot build the constancia.");
  process.exit(1);
}

const pdf = await pdfService.generateComplaintConfirmation(complaint, business, establishment, {
  consultUrl: buildConsultUrl(config?.urlSlug, complaint.correlativeNumber),
  logo: config?.logoFileName ? readLogoBuffer(config.logoFileName) : null,
});

await emailService.sendComplaintConfirmation(recipient, complaint, pdf, {
  subjectPrefix: config?.emailSubjectPrefix ?? null,
  headerText: config?.emailHeaderText ?? null,
  footerText: config?.emailFooterText ?? null,
  identity,
});

console.log(`\nsent to ${recipient} (constancia PDF attached, ${Math.round(pdf.length / 1024)} KB)`);
process.exit(0);
