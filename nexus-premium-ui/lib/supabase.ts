import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

export const isSupabaseConfigured = !!supabaseUrl && !!supabaseAnonKey

// createClient requires a non-empty URL string — use a placeholder when env
// vars are missing so the module never throws at import time.
export const supabase = createClient(
  supabaseUrl ?? 'https://placeholder.supabase.co',
  supabaseAnonKey ?? 'placeholder-anon-key',
  {
    auth: {
      // PKCE is the most secure OAuth flow and the Supabase JS v2 default.
      // Being explicit here prevents any environment from accidentally falling
      // back to the implicit flow.
      flowType: 'pkce',

      // ── WHY detectSessionInUrl is false ────────────────────────────────────
      // When this is true (the library default), the Supabase client calls
      // exchangeCodeForSession() automatically as soon as the module initialises
      // and it finds a ?code= parameter in window.location. That consumes the
      // one-time PKCE flow state immediately.
      //
      // Our /auth/callback page then calls exchangeCodeForSession() a second
      // time inside useEffect — and the second call always fails with:
      //   "flow_state_already_consumed" / "invalid_request"
      //
      // Setting this to false gives the callback page sole responsibility for
      // exchanging the code. The page uses a useRef guard to prevent a second
      // call even under React Strict Mode (which runs effects twice in dev).
      // ───────────────────────────────────────────────────────────────────────
      detectSessionInUrl: false,

      autoRefreshToken: true,
      persistSession: true,
    },
  },
)
