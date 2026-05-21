// Apply a single migration SQL file via direct Postgres connection.
// Usage: node --env-file=.env supabase/seed/apply_migration.mjs <path-to-sql>
// Reads DB password / project ref from env (set by caller).
// Pulls the rest from EXPO_PUBLIC_SUPABASE_URL.

import fs from 'node:fs';
import pg from 'pg';

const sqlFile = process.argv[2];
if (!sqlFile) {
  console.error('Usage: node apply_migration.mjs <path-to-sql>');
  process.exit(1);
}

const url = new URL(process.env.EXPO_PUBLIC_SUPABASE_URL);
const projectRef = url.host.split('.')[0]; // the subdomain of the Supabase URL
const password = process.env.SUPABASE_DB_PASSWORD;
if (!password) {
  console.error('SUPABASE_DB_PASSWORD env var is required.');
  process.exit(1);
}

// Use the EU pooler in transaction mode. The Frankfurt project lives behind
// aws-1-eu-central-1 (not aws-0-* — that one returns "Tenant or user not found").
const host = `aws-1-eu-central-1.pooler.supabase.com`;
const port = 6543;
const user = `postgres.${projectRef}`;

const sql = fs.readFileSync(sqlFile, 'utf8');
console.log(`Applying migration ${sqlFile} to ${host}:${port}/postgres (user=${user})`);

const client = new pg.Client({
  host,
  port,
  database: 'postgres',
  user,
  password,
  ssl: { rejectUnauthorized: false },
});

try {
  await client.connect();
  console.log('Connected. Executing SQL...');
  await client.query(sql);
  console.log('Migration applied successfully.');
} catch (err) {
  console.error('Migration failed:', err.message);
  process.exit(1);
} finally {
  await client.end();
}
