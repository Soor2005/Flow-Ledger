import { createClient } from '@supabase/supabase-js';

// ── CONFIG ────────────────────────────────────────────────────────────────────
// Paste your Supabase project URL and anon key here after creating your project
// at https://supabase.com → New Project → Settings → API
const SUPABASE_URL  = process.env.REACT_APP_SUPABASE_URL  || '';
const SUPABASE_ANON = process.env.REACT_APP_SUPABASE_ANON || '';

// Returns null if not configured yet — app works fully offline without it
export const supabase = SUPABASE_URL && SUPABASE_ANON
  ? createClient(SUPABASE_URL, SUPABASE_ANON)
  : null;

export const isSupabaseEnabled = () => !!supabase;

// ── SYNC HELPERS ──────────────────────────────────────────────────────────────
// Call these after local SQLite writes to optionally replicate to the cloud

export async function syncSession(session) {
  if (!supabase) return;
  try {
    await supabase.from('sessions').upsert({
      id:               session.id,
      user_id:          session.user_id,
      category:         session.category,
      project_id:       session.project_id,
      title:            session.title,
      started_at:       session.started_at,
      ended_at:         session.ended_at,
      duration_seconds: session.duration_seconds,
      is_deep_work:     session.is_deep_work,
      session_type:     session.session_type,
      notes:            session.notes,
    });
  } catch (e) {
    console.warn('[Supabase] sync failed:', e.message);
  }
}

export async function syncAppUsage(entry) {
  if (!supabase) return;
  try {
    await supabase.from('app_usage').upsert(entry);
  } catch (e) {
    console.warn('[Supabase] app_usage sync failed:', e.message);
  }
}

export async function fetchRemoteSessions(userId, from, to) {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('sessions')
    .select('*')
    .eq('user_id', userId)
    .gte('started_at', from)
    .lte('started_at', to)
    .order('started_at', { ascending: false });
  if (error) { console.warn('[Supabase] fetch failed:', error.message); return []; }
  return data || [];
}
