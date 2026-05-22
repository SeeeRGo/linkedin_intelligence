import '../env-loader.js';
import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_SCHEMA_PATH = path.resolve('airtable/schema.json');

function parseArgs(argv) {
  const result = {
    apply: false,
    baseId: process.env.AIRTABLE_BASE_ID,
    token: process.env.AIRTABLE_API_KEY,
    schemaPath: DEFAULT_SCHEMA_PATH
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--apply') {
      result.apply = true;
      continue;
    }
    if (arg === '--dry-run') {
      result.apply = false;
      continue;
    }
    if (arg.startsWith('--base-id=')) {
      result.baseId = arg.slice('--base-id='.length);
      continue;
    }
    if (arg === '--base-id') {
      result.baseId = argv[i + 1] || '';
      i += 1;
      continue;
    }
    if (arg.startsWith('--token=')) {
      result.token = arg.slice('--token='.length);
      continue;
    }
    if (arg === '--token') {
      result.token = argv[i + 1] || '';
      i += 1;
      continue;
    }
    if (arg.startsWith('--schema=')) {
      result.schemaPath = path.resolve(arg.slice('--schema='.length));
      continue;
    }
    if (arg === '--schema') {
      result.schemaPath = path.resolve(argv[i + 1] || DEFAULT_SCHEMA_PATH);
      i += 1;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      printHelpAndExit();
    }
  }

  return result;
}

function printHelpAndExit() {
  console.log([
    'Usage:',
    '  node scripts/create-airtable-schema.mjs --apply',
    '',
    'Environment variables:',
    '  AIRTABLE_BASE_ID',
    '  AIRTABLE_API_KEY',
    '',
    'Optional flags:',
    '  --dry-run',
    '  --base-id <id>',
    '  --token <pat>',
    '  --schema <path>',
    ''
  ].join('\n'));
  process.exit(0);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function toChoiceOptions(options) {
  return {
    choices: options.map((name) => ({ name }))
  };
}

function normalizeFieldForApi(field) {
  const payload = { name: field.name, type: field.type };

  if (field.type === 'singleSelect' || field.type === 'multipleSelects') {
    const options = Array.isArray(field.options) ? field.options : [];
    payload.options = toChoiceOptions(options);
    return payload;
  }

  if (field.type === 'number') {
    payload.options = { precision: 0 };
    return payload;
  }

  if (field.type === 'date') {
    payload.options = {
      dateFormat: { name: 'iso', format: 'YYYY-MM-DD' }
    };
    return payload;
  }

  if (field.type === 'dateTime') {
    payload.options = {
      dateFormat: { name: 'iso', format: 'YYYY-MM-DD' },
      timeFormat: { name: '24hour', format: 'HH:mm' },
      timeZone: 'utc'
    };
    return payload;
  }

  if (field.type === 'checkbox') {
    payload.options = { icon: 'check', color: 'greenBright' };
    return payload;
  }

  return payload;
}

function expectedSelectNames(field) {
  return new Set(Array.isArray(field.options) ? field.options.map(String) : []);
}

function actualSelectNames(field) {
  const choices = field?.options?.choices;
  if (!Array.isArray(choices)) return new Set();
  return new Set(choices.map((choice) => String(choice.name || '')));
}

function fieldMatchesSchema(actual, expected) {
  if (!actual || actual.type !== expected.type) return false;

  if (expected.type === 'singleSelect' || expected.type === 'multipleSelects') {
    const want = expectedSelectNames(expected);
    const have = actualSelectNames(actual);
    if (want.size !== have.size) return false;
    for (const value of want) {
      if (!have.has(value)) return false;
    }
  }

  return true;
}

async function requestJson(url, { method = 'GET', token, body } = {}) {
  const headers = {
    Authorization: `Bearer ${token}`
  };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  const text = await response.text();
  let parsed;
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    parsed = { raw: text };
  }

  if (!response.ok) {
    const message = parsed?.error?.message || parsed?.message || parsed?.raw || text || response.statusText;
    throw new Error(`${method} ${url} failed (${response.status}): ${message}`);
  }

  return parsed;
}

async function listTables(baseId, token) {
  return requestJson(`https://api.airtable.com/v0/meta/bases/${baseId}/tables`, {
    token
  });
}

async function createTable(baseId, token, tableSpec) {
  const fields = tableSpec.fields.map(normalizeFieldForApi);
  const body = {
    name: tableSpec.name,
    fields: [fields[0]]
  };
  if (tableSpec.description) body.description = tableSpec.description;

  return requestJson(`https://api.airtable.com/v0/meta/bases/${baseId}/tables`, {
    method: 'POST',
    token,
    body
  });
}

async function createField(baseId, token, tableId, fieldSpec) {
  return requestJson(`https://api.airtable.com/v0/meta/bases/${baseId}/tables/${tableId}/fields`, {
    method: 'POST',
    token,
    body: normalizeFieldForApi(fieldSpec)
  });
}

function summarizeTable(table) {
  return {
    id: table.id,
    name: table.name,
    fields: Array.isArray(table.fields) ? table.fields : []
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const schema = readJson(args.schemaPath);

  if (!schema?.tables?.length) {
    throw new Error(`No tables found in schema file: ${args.schemaPath}`);
  }

  console.log(`Schema file: ${args.schemaPath}`);

  if (!args.apply) {
    console.log('Dry run only. No Airtable changes will be made.');
    for (const table of schema.tables) {
      console.log(`- Table: ${table.name}`);
      for (const field of table.fields) {
        const suffix = field.type === 'singleSelect' || field.type === 'multipleSelects'
          ? ` [${Array.isArray(field.options) ? field.options.join(', ') : ''}]`
          : '';
        console.log(`  - ${field.name}: ${field.type}${suffix}`);
      }
    }
    return;
  }

  if (!args.baseId) {
    throw new Error('Missing AIRTABLE_BASE_ID. Set it in the environment or pass --base-id.');
  }
  if (!args.token) {
    throw new Error('Missing AIRTABLE_API_KEY. Set it in the environment or pass --token.');
  }
  if (typeof fetch !== 'function') {
    throw new Error('Global fetch is not available in this Node runtime.');
  }

  console.log(`Base ID: ${args.baseId}`);

  const existing = await listTables(args.baseId, args.token);
  const existingTables = new Map((existing.tables || []).map((table) => [table.name, summarizeTable(table)]));

  for (const tableSpec of schema.tables) {
    const existingTable = existingTables.get(tableSpec.name);
    const expectedFields = tableSpec.fields;

    if (!existingTable) {
      const created = await createTable(args.baseId, args.token, tableSpec);
      console.log(`Created table: ${tableSpec.name} (${created.id || 'no id returned'})`);

      const createdTable = {
        id: created.id,
        fields: Array.isArray(created.fields) ? created.fields : []
      };

      for (const fieldSpec of expectedFields.slice(1)) {
        await createField(args.baseId, args.token, createdTable.id, fieldSpec);
        console.log(`  Added field: ${fieldSpec.name}`);
      }
      continue;
    }

    const actualFields = new Map(existingTable.fields.map((field) => [field.name, field]));
    const primaryField = expectedFields[0];
    const actualPrimary = actualFields.get(primaryField.name);
    if (!actualPrimary) {
      throw new Error(`Table "${tableSpec.name}" exists but is missing expected primary field "${primaryField.name}".`);
    }
    if (!fieldMatchesSchema(actualPrimary, normalizeFieldForApi(primaryField))) {
      throw new Error(`Table "${tableSpec.name}" has a mismatched primary field "${primaryField.name}".`);
    }

    console.log(`Table exists: ${tableSpec.name}`);

    for (const fieldSpec of expectedFields.slice(1)) {
      const actualField = actualFields.get(fieldSpec.name);
      if (!actualField) {
        await createField(args.baseId, args.token, existingTable.id, fieldSpec);
        console.log(`  Added field: ${fieldSpec.name}`);
        continue;
      }

      const expectedField = normalizeFieldForApi(fieldSpec);
      if (!fieldMatchesSchema(actualField, expectedField)) {
        if (fieldSpec.type === 'singleSelect' || fieldSpec.type === 'multipleSelects') {
          console.warn(
            `  Warning: field "${tableSpec.name}.${fieldSpec.name}" exists with matching type but different select options. ` +
            'Leaving it in place because Airtable does not expose a reliable public field-option update path.'
          );
          continue;
        }
        throw new Error(
          `Table "${tableSpec.name}" field "${fieldSpec.name}" exists but does not match the repo schema. ` +
          'Reconcile it manually before rerunning this script.'
        );
      }
    }
  }

  console.log('Airtable schema is in sync.');
}

const isDirectRun = fileURLToPath(import.meta.url) === path.resolve(process.argv[1] || '');

if (isDirectRun) {
  main().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
}
