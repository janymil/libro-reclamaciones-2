import "./scripts/load-env.mjs";

/**
 * Manual check of the automatic monthly reports (dev tool).
 *
 * Prints, for every company in the local database, the months
 * `GET /api/reports/monthly` would return. The list must never start before the
 * month the company was registered in.
 *
 *   npx tsx verify-monthly.ts
 */

const { db } = await import("./server/db");
const { businesses } = await import("@shared/schema");
const { reportingStorage } = await import("./server/storage/reporting.storage");

const rows = await db.select().from(businesses);

for (const business of rows) {
  const reports = await reportingStorage.getMonthlyReports(business.id);
  console.log(`\n${business.businessName} (${business.ruc})`);
  console.log(`  registrada: ${new Date(business.createdAt).toISOString()}`);
  for (const report of reports) {
    console.log(`  - ${report.month}: ${report.complaints} reclamaciones`);
  }
}

process.exit(0);
