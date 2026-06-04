// List open bug reports filed by users. Used by the developer (and by Claude
// in subsequent conversations) to triage tickets and propose fixes.
//
// Usage:
//   node --env-file=.env supabase/seed/list_bug_reports.mjs
//   node --env-file=.env supabase/seed/list_bug_reports.mjs --status=open
//   node --env-file=.env supabase/seed/list_bug_reports.mjs --status=all
//
// The default scope is `open` reports. Pass --status=all to dump everything.

import { createClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('EXPO_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
  process.exit(1);
}

const args = process.argv.slice(2);
const statusArg = args.find((a) => a.startsWith('--status='))?.split('=')[1] ?? 'open';

const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

let query = supabase
  .from('bug_reports')
  .select('id, user_id, created_at, description, context, status, resolution_note')
  .order('created_at', { ascending: false });

if (statusArg !== 'all') {
  query = query.eq('status', statusArg);
}

const { data, error } = await query;
if (error) {
  console.error('Query failed:', error.message);
  process.exit(1);
}

if (!data || data.length === 0) {
  console.log(`No bug reports with status='${statusArg}'.`);
  process.exit(0);
}

console.log(`\n${data.length} report(s) with status='${statusArg}':\n`);
for (const r of data) {
  const route = r.context?.route ?? 'unknown';
  const platform = r.context?.platform ?? '?';
  const version = r.context?.appVersion ?? '?';
  console.log('─'.repeat(72));
  console.log(`id:          ${r.id}`);
  console.log(`status:      ${r.status}`);
  console.log(`created:     ${r.created_at}`);
  console.log(`route:       ${route}   platform=${platform}   v=${version}`);
  console.log(`user_id:     ${r.user_id}`);
  console.log(`description:`);
  console.log(`  ${r.description.split('\n').join('\n  ')}`);
  if (r.resolution_note) {
    console.log(`note:        ${r.resolution_note}`);
  }
}
console.log('─'.repeat(72));
console.log('');
console.log('To mark a ticket as fixed:');
console.log('  node --env-file=.env supabase/seed/update_bug_report.mjs <id> --status=fixed --note="..."');
