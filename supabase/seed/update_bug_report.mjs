// Update a bug report's status / resolution note (developer-side workflow).
//
// Usage:
//   node --env-file=.env supabase/seed/update_bug_report.mjs <id> --status=fixed
//   node --env-file=.env supabase/seed/update_bug_report.mjs <id> --status=fixing --note="..."

import { createClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('EXPO_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
  process.exit(1);
}

const [id, ...rest] = process.argv.slice(2);
if (!id) {
  console.error('Usage: update_bug_report.mjs <id> --status=<open|reviewing|fixing|fixed|wontfix|duplicate> [--note="..."]');
  process.exit(1);
}

const status = rest.find((a) => a.startsWith('--status='))?.split('=')[1];
const note = rest.find((a) => a.startsWith('--note='))?.split('=').slice(1).join('=');

if (!status && !note) {
  console.error('Provide at least --status or --note.');
  process.exit(1);
}

const patch = {};
if (status) patch.status = status;
if (note !== undefined) patch.resolution_note = note;

const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });
const { data, error } = await supabase
  .from('bug_reports')
  .update(patch)
  .eq('id', id)
  .select('*')
  .single();

if (error) {
  console.error('Update failed:', error.message);
  process.exit(1);
}

console.log('Updated:', data);
