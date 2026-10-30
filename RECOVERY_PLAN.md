# Nexus recovery — original product

Recovery branch: `recovery/original-nexus-2026-10`

## Non-negotiable product identity
- Preserve the original black-and-gold design and animated ring.
- Preserve `nexus-premium-ui/components/nexus/landing-page.tsx` and its "Stop asking when are you free?" headline.
- Restore the existing application; do not replace it with a new mockup.
- Preserve Golden Window v2, groups, social profiles, venues, routes and the world map.

## Verified repository findings (2026-10-30)
- App entry point: `nexus-premium-ui/app/page.tsx`, which renders `NexusApp`.
- Next.js configuration: `nexus-premium-ui/next.config.mjs`, with `output: 'standalone'`.
- Auth client: `nexus-premium-ui/lib/supabase.ts`, requires `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` for real sessions.
- Landing page source exists and contains original heading and golden-window preview.

## Verification gates (NOT yet passed)
- [ ] Install dependencies and build with `pnpm run build` from workspace root.
- [ ] Confirm landing page matches supplied screenshots on a mobile viewport.
- [ ] Confirm app can render with missing backend configuration without crashing.
- [ ] Choose a new isolated deployment target; do not overwrite existing Railway project.
- [ ] Deploy a preview and test HTTPS URL on mobile.
- [ ] Connect an operational backend and test sign-in, groups, availability, Golden Window, and venue routing.
- [ ] Check logs, accessibility, responsive layout and rollback.

## Hosting
Railway account currently lists a project named `innovative-wholeness`; ownership/purpose and compatibility with Nexus are not yet verified. Do not modify that project without checking.

## Safety
No production credentials in Git. No changes to `main` until recovery is verified. No claim of live deployment until URL and build are confirmed.
