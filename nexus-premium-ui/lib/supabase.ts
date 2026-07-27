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
      // Automatically detect and exchange the code when the browser lands on
      // /auth/callback?code=XXX. The callback page calls exchangeCodeForSession
      // explicitly as well — having detectSessionInUrl: true means the Supabase
      // client starts the exchange immediately on module init, so there is no
      // gap between page load and useEffect hydration.
      detectSessionInUrl: true,
      autoRefreshToken: true,
      persistSession: true,
    },
  },
)
