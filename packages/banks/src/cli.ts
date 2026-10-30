import { createRequire } from 'node:module';
import { validateBank } from './validator.js';

const require = createRequire(import.meta.url);
const seedEmbeddedData = require('./seed-embedded.json');

const result = validateBank(seedEmbeddedData);
if (!result.valid) {
  console.error('Validation failed for seed-embedded.json:');
  for (const err of result.errors) {
    console.error(` - ${err}`);
  }
  process.exit(1);
} else {
  console.log('✓ seed-embedded.json passed validation.');
}
