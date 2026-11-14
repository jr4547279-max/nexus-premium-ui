const accountId = '4d654fd2fae39e00cc7e5a534cf6d741';
const token = process.env.CLOUDFLARE_API_TOKEN;
const missing = [];

if (!token) missing.push('GitHub Actions secret CLOUDFLARE_API_TOKEN is missing.');
if (!process.env.NEXUS_RESEND_API_KEY) missing.push('Add a Nexus-only Resend sending key as NEXUS_RESEND_API_KEY.');
if (!process.env.NEXUS_EMAIL_FROM) missing.push('Set repository variable NEXUS_EMAIL_FROM to the verified Nexus sender address.');
if (process.env.NEXUS_EMAIL_SENDER_VERIFIED !== 'true') missing.push('Set NEXUS_EMAIL_SENDER_VERIFIED=true only after the sender domain is verified at the email provider.');
if (process.env.NEXUS_RESEND_OVERAGES_DISABLED !== 'true') missing.push('Disable Resend paid overages and set NEXUS_RESEND_OVERAGES_DISABLED=true.');
if (process.env.NEXUS_BILLING_READ_CONFIRMED !== 'true') missing.push('Add Billing Read and set NEXUS_BILLING_READ_CONFIRMED=true after confirming the scope in Cloudflare.');
if (process.env.NEXUS_FREE_PLAN_CONFIRMED !== 'true') missing.push('Reconfirm the account is on Workers Free in Cloudflare and set NEXUS_FREE_PLAN_CONFIRMED=true.');
if (process.env.NEXUS_RESOURCE_USAGE_REVIEWED !== 'true') missing.push('Review current Workers/D1/Durable Objects usage in the Cloudflare dashboard (or reconnect with Account Analytics Read) and set NEXUS_RESOURCE_USAGE_REVIEWED=true.');

const output = process.env.GITHUB_OUTPUT;
const writeOutput = async (key, value) => {
  if (output) await (await import('node:fs/promises')).appendFile(output, `${key}=${value}\n`);
};

let databaseId = '';
let databaseExists = false;
if (token) {
  const request = async (path, label) => {
    const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
      headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
    });
    if (!response.ok) {
      const reason = response.status === 401 || response.status === 403
        ? 'the token is missing the required read permission'
        : 'the Cloudflare API request failed';
      missing.push(`${label}: HTTP ${response.status}; ${reason}.`);
      return null;
    }
    const body = await response.json();
    if (!body?.success) {
      missing.push(`${label}: Cloudflare did not confirm success.`);
      return null;
    }
    return body;
  };

  const verify = await request('/user/tokens/verify', 'Token verification');
  if (verify?.result?.status && verify.result.status !== 'active') missing.push('The Cloudflare API token is not active.');
  if (verify?.result?.expires_on && Date.parse(verify.result.expires_on) <= Date.now()) missing.push('The Cloudflare API token has expired.');

  const [workers, databases, billing] = await Promise.all([
    request(`/accounts/${accountId}/workers/scripts?page=1&per_page=100`, 'Workers inventory read'),
    request(`/accounts/${accountId}/d1/database?page=1&per_page=100`, 'D1 inventory read'),
    request(`/accounts/${accountId}/billing/usage`, 'Billing usage read'),
  ]);

  const workerList = Array.isArray(workers?.result) ? workers.result : [];
  const dbList = Array.isArray(databases?.result) ? databases.result : [];
  const targetDb = dbList.filter((db) => db?.name === 'nexus-app-dev');
  const targetWorkers = workerList.filter((worker) => ['nexus-web-dev', 'nexus-api-dev'].includes(worker?.id ?? worker?.script));
  if (targetDb.length > 1) missing.push('More than one exact nexus-app-dev database match was returned; resolve the naming conflict manually.');
  if (targetDb.length === 1) {
    databaseId = targetDb[0].uuid ?? targetDb[0].id ?? '';
    databaseExists = Boolean(databaseId);
    if (!databaseId) missing.push('The exact nexus-app-dev database exists but Cloudflare did not return its ID.');
  }
  if (!databaseExists && dbList.length >= 10) missing.push('The Free-plan D1 database quota is already full; no database will be created.');
  const newWorkerCount = Math.max(0, 2 - targetWorkers.length);
  if (workerList.length + newWorkerCount > 100) missing.push('The Free-plan Worker quota would be exceeded by the Nexus Workers.');
  if (newWorkerCount > 0 && process.env.NEXUS_WORKERS_ADMIN_CONFIRMED !== 'true') {
    missing.push('New Worker scripts need product-level Workers Admin. Add that permission, or create both Nexus Worker placeholders and scope this token to edit only those two Workers.');
  }
  if (newWorkerCount === 0 && process.env.NEXUS_WORKERS_EDIT_CONFIRMED !== 'true') {
    missing.push('Confirm this token has Editor/Scripts Edit access to both exact Nexus Workers.');
  }
  if (billing) console.log('PASS Cloudflare billing usage endpoint is readable.');
  if (workers) console.log(`PASS Workers inventory readable (${workerList.length} scripts; no names outside Nexus targets are printed).`);
  if (databases) console.log(`PASS D1 inventory readable (${dbList.length} databases; only the Nexus target is inspected).`);
  if (databaseExists) console.log('PASS nexus-app-dev already exists; preflight will bind only that exact database.');
}

for (const message of missing) console.error(`BLOCKED: ${message}`);
const ready = missing.length === 0;
await writeOutput('ready', String(ready));
await writeOutput('database_id', databaseId);
await writeOutput('database_exists', String(databaseExists));
if (!ready) process.exitCode = 1;
else console.log('PASS all staging gates. No Cloudflare resources were changed by preflight.');
