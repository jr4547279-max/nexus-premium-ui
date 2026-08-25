# Vercel root deployment fix

The experiment branch keeps the original nested Next.js application at `nexus-premium-ui/`, while the repository root now exposes a small Next.js-compatible workspace entrypoint for Vercel detection.

The root build delegates to the nested application and `vercel.json` points Vercel at the nested `.next` output.

This file documents the deployment workaround and is intentionally scoped to the experiment branch.
