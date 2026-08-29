import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const site = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '')

  if (!url || !key) {
    return NextResponse.json(
      { configured: false, error: 'missing_supabase_environment' },
      { status: 503 },
    )
  }

  const supabase = createClient(url, key, { auth: { flowType: 'pkce' } })
  const redirectTo = `${site || 'https://nexus-premium-website-business.vercel.app'}/auth/callback`

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: true },
  })

  if (error) {
    return NextResponse.json(
      { configured: true, oauthReady: false, error: error.message, redirectTo },
      { status: 502 },
    )
  }

  return NextResponse.json({
    configured: true,
    oauthReady: Boolean(data.url),
    redirectTo,
    providerUrl: data.url ? new URL(data.url).origin : null,
  })
}
