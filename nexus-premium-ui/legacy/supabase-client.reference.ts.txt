import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

export const isSupabaseConfigured = !!supabaseUrl && !!supabaseAnonKey

// Nexus currently uses a browser-managed Supabase session rather than SSR
// cookies. Use the implicit OAuth flow so Google returns the session directly
// to the browser instead of requiring a one-time PKCE code exchange on a
// callback page. This is deliberately paired with detectSessionInUrl=true.
// Keep the lightweight lock override because Nexus has experienced mobile
// Navigator Locks contention during auth initialisation.
const nexusAuthLock = async <T>(
  _name: string,
  _acquireTimeout: number,
  fn: () => Promise<T>,
): Promise<T> => fn()

export const supabase = createClient(
  supabaseUrl ?? 'https://placeholder.supabase.co',
  supabaseAnonKey ?? 'placeholder-anon-key',
  {
    auth: {
      flowType: 'implicit',
      detectSessionInUrl: true,
      autoRefreshToken: true,
      persistSession: true,
      lock: nexusAuthLock,
    },
  },
)
