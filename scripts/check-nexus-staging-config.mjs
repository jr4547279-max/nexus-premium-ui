import { readFile } from 'node:fs/promises';

const frontend = await readFile('nexus-premium-ui/wrangler.jsonc', 'utf8');
const api = await readFile('workers/nexus-api/wrangler.jsonc', 'utf8');
const workflow = await readFile('.github/workflows/nexus-staging.yml', 'utf8');
let frontendBuild = '';
try { frontendBuild = await readFile('nexus-premium-ui/dist/server/wrangler.json', 'utf8'); } catch {}

const checks = [
  ['frontend Worker is nexus-web-dev', /"name"\s*:\s*"nexus-web-dev"/.test(frontend)],
  ['frontend is pinned to the intended Cloudflare account', /"account_id"\s*:\s*"4d654fd2fae39e00cc7e5a534cf6d741"/.test(frontend)],
  ['frontend binds only nexus-api-dev', /"service"\s*:\s*"nexus-api-dev"/.test(frontend)],
  ['Vinext build output targets nexus-web-dev and nexus-api-dev',
    /"name":"nexus-web-dev"/.test(frontendBuild) && /"service":"nexus-api-dev"/.test(frontendBuild)],
  ['API Worker is nexus-api-dev', /"name"\s*:\s*"nexus-api-dev"/.test(api)],
  ['API is pinned to the intended Cloudflare account', /"account_id"\s*:\s*"4d654fd2fae39e00cc7e5a534cf6d741"/.test(api)],
  ['D1 target is nexus-app-dev', /"database_name"\s*:\s*"nexus-app-dev"/.test(api)],
  ['API is not directly exposed on workers.dev', /"workers_dev"\s*:\s*false/.test(api)],
  ['uploads remain disabled', /"ALLOW_UPLOADS"\s*:\s*"false"/.test(api)],
  ['no R2 binding is configured', !/"r2_buckets"\s*:/.test(api)],
  ['CircleRoom is a SQLite-backed Durable Object', /"new_sqlite_classes"\s*:\s*\[\s*"CircleRoom"\s*\]/.test(api)],
  ['no KV-backed Durable Object migration is configured', !/"new_classes"\s*:/.test(api)],
  ['API config retains the unprovisioned D1 placeholder', /00000000-0000-4000-8000-000000000000/.test(api)],
  ['workflow has no push, pull_request, or schedule trigger', !/^\s{2}(push|pull_request|schedule):/m.test(workflow)],
  ['manual preflight includes Resend test-mode configuration', workflow.includes('NEXUS_RESEND_TEST_MODE: ${{ vars.NEXUS_RESEND_TEST_MODE }}')],
  ['preflight inventories Durable Objects namespaces read-only', /workers\/durable_objects\/namespaces\?page=1&per_page=100/.test(await readFile('scripts/nexus-cloudflare-preflight.mjs', 'utf8'))],
  ['workflow deploy commands name only the three Nexus targets',
    workflow.includes('wrangler d1 create nexus-app-dev') &&
    workflow.includes('wrangler deploy --config wrangler.jsonc') &&
    workflow.includes('wrangler deploy --config dist/server/wrangler.json') &&
    workflow.includes('nexus-app-dev') && workflow.includes('nexus-api-dev') && workflow.includes('nexus-web-dev')],
  ['workflow contains no R2 provisioning or NumerVault target',
    !/r2 (bucket|create|put)|numervault|number-yard|nova-supply/i.test(workflow)],
];

const failures = checks.filter(([, ok]) => !ok);
for (const [label, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`);
if (failures.length) process.exitCode = 1;
