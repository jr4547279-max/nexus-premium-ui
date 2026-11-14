import { readFile, writeFile } from 'node:fs/promises';

const configPath = 'workers/nexus-api/wrangler.jsonc';
const id = process.env.NEXUS_DATABASE_ID;
if (!id || !/^[0-9a-f-]{36}$/i.test(id)) throw new Error('The preflight did not provide a valid Nexus D1 database ID.');

let config = await readFile(configPath, 'utf8');
if (!/"database_name"\s*:\s*"nexus-app-dev"/.test(config)) throw new Error('Refusing to edit a config that does not target nexus-app-dev.');
const placeholder = '00000000-0000-4000-8000-000000000000';
const currentIds = [...config.matchAll(/"database_id"\s*:\s*"([^"]+)"/g)].map((match) => match[1]);
if (currentIds.length !== 1) throw new Error('Expected exactly one D1 binding in the Nexus API config.');
if (currentIds[0] !== id && currentIds[0] !== placeholder) throw new Error('Refusing to replace a non-placeholder D1 ID that differs from preflight.');
config = config.replace(`"database_id": "${currentIds[0]}"`, `"database_id": "${id}"`);
await writeFile(configPath, config);
console.log('Bound the verified nexus-app-dev ID in this temporary Actions checkout.');
