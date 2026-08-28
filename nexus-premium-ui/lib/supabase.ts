import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

export const isSupabaseConfigured = !!supabaseUrl && !!supabaseAnonKey

// Supabase Auth can deadlock on mobile browsers when its Navigator Locks
// integration is contended by the initial getSession() call. Nexus does not
// need cross-tab auth locking, so use a simple in-process no-op lock instead.
// This keeps sign-in/getSession independent of navigator.locks.
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
      flowType: 'pkce',
      detectSessionInUrl: false,
      autoRefreshToken: true,
      persistSession: true,
      lock: nexusAuthLock,
    },
  },
)
