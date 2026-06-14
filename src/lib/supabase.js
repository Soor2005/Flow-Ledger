import { createClient } from '@supabase/supabase-js';

const supabaseUrl  = process.env.REACT_APP_SUPABASE_URL  || '';
const supabaseAnon = process.env.REACT_APP_SUPABASE_ANON || '';

if (!supabaseUrl || !supabaseAnon) {
  console.error(
    '[Flow Ledger] Supabase credentials missing.\n' +
    'Add REACT_APP_SUPABASE_URL and REACT_APP_SUPABASE_ANON to your .env file and restart.'
  );
}

// Use implicit flow so email-confirmation deep-links carry tokens directly in
// the URL hash (#access_token=...&refresh_token=...) instead of a PKCE code.
// PKCE requires the code verifier to be in the same browser session that made
// the signUp call — in Electron the browser opens the link externally, so the
// verifier is unavailable there and the exchange fails.
const supabase = createClient(
  supabaseUrl  || 'https://placeholder.supabase.co',
  supabaseAnon || 'placeholder',
  {
    auth: {
      flowType:       'implicit',
      persistSession: true,
      storageKey:     'fl_supabase_session',
      storage:        window.localStorage,
    },
  }
);

export default supabase;
