import "./env";
import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle as drizzleNeon } from 'drizzle-orm/neon-serverless';
import type { NeonDatabase } from 'drizzle-orm/neon-serverless';
import path from 'path';
import ws from "ws";
import * as schema from "@shared/schema";

neonConfig.webSocketConstructor = ws;

const connectionString = process.env.DATABASE_URL;

/**
 * Whether the app is running against the embedded local database instead of the
 * production PostgreSQL (Neon) instance.
 *
 * In production DATABASE_URL points at a Neon serverless PostgreSQL database.
 * For local development we allow the app to boot with an embedded PGlite
 * database (PostgreSQL compiled to WebAssembly) whenever DATABASE_URL is
 * missing or explicitly uses the `pglite:` scheme, so no external service has
 * to be provisioned.
 */
export const isLocalDatabase =
  !connectionString || connectionString.startsWith('pglite:');

const projectRoot = path.resolve(import.meta.dirname, '..');

async function createDatabase(): Promise<NeonDatabase<typeof schema>> {
  if (isLocalDatabase) {
    const dataDir = connectionString?.startsWith('pglite:')
      ? connectionString.slice('pglite:'.length)
      : path.join(projectRoot, '.local-db');

    // Loaded lazily so the local-only dependency is never pulled in on a
    // production (Neon) deployment.
    const { PGlite } = await import('@electric-sql/pglite');
    const { drizzle } = await import('drizzle-orm/pglite');
    const { migrate } = await import('drizzle-orm/pglite/migrator');

    console.log(`[db] DATABASE_URL not set - using embedded PGlite database at ${dataDir}`);

    const client = new PGlite(dataDir);
    const localDb = drizzle(client, { schema });

    // Keep the embedded database in sync with the committed SQL migrations.
    await migrate(localDb, { migrationsFolder: path.join(projectRoot, 'migrations') });

    // PGlite and Neon both implement Drizzle's PgDatabase interface.
    return localDb as unknown as NeonDatabase<typeof schema>;
  }

  const pool = new Pool({ connectionString: connectionString! });
  console.log('[db] using Neon serverless PostgreSQL (DATABASE_URL)');
  return drizzleNeon(pool, { schema });
}

export const db = await createDatabase();