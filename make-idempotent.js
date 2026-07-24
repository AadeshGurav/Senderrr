const fs = require('fs');

const path = '/Users/aadeshgurav/projekts/OpenWA_1/OpenWA/database/migrations/1784887919922-CompleteSchemaForPostgres.ts';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(/CREATE TABLE "/g, 'CREATE TABLE IF NOT EXISTS "');
content = content.replace(/CREATE INDEX "/g, 'CREATE INDEX IF NOT EXISTS "');
content = content.replace(/CREATE UNIQUE INDEX "/g, 'CREATE UNIQUE INDEX IF NOT EXISTS "');

fs.writeFileSync(path, content);
console.log('Migration made idempotent.');
