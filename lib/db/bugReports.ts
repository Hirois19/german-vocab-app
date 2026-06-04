/**
 * Repository for `bug_reports` — free-form tickets the user files from the
 * in-app bug button. The developer (or Claude on their behalf) reads them via
 * the service role to triage and ask the user how to fix each one.
 */

import { supabase } from './supabase';
import type { BugReportRow } from './types';

const TABLE = 'bug_reports';

export interface CreateBugReportInput {
  userId: string;
  description: string;
  context?: Record<string, unknown>;
}

export async function createBugReport(input: CreateBugReportInput): Promise<BugReportRow> {
  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      user_id: input.userId,
      description: input.description,
      context: input.context ?? null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as BugReportRow;
}

export async function listMyBugReports(userId: string): Promise<BugReportRow[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as BugReportRow[];
}

export async function deleteBugReport(id: string): Promise<void> {
  const { error } = await supabase.from(TABLE).delete().eq('id', id);
  if (error) throw error;
}
