const base = 'https://nexus-web-dev.jayrussell99999.workers.dev';
const response = await fetch(`${base}/v1/health`, { redirect: 'manual' });
if (!response.ok) throw new Error(`Nexus staging health check returned HTTP ${response.status}.`);
const body = await response.json();
if (body?.ok !== true) throw new Error('Nexus staging health response did not report ok=true.');
console.log('Nexus frontend/API health check passed.');
