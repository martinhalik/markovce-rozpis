import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { SCHEMA_STATEMENTS } from '../lib/schema.js';

test('db/init.sql matches the statements the API applies', () => {
    const initSql = fs.readFileSync(new URL('../db/init.sql', import.meta.url), 'utf8');
    assert.ok(initSql.includes(SCHEMA_STATEMENTS.map((s) => `${s};`).join('\n\n')),
        'db/init.sql is out of sync with lib/schema.js');
});
