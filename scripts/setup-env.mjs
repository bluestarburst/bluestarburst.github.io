#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const args = process.argv.slice(2);
const check = args.includes('--check');
const force = args.includes('--force');
const allowProdLocal = args.includes('--allow-prod-local');

function flag(name, fallback = null) {
  const inline = args.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] && !args[index + 1].startsWith('--') ? args[index + 1] : fallback;
}

const tier = flag('--tier', 'dev');
const sets = new Map();
for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  const raw = arg === '--set' ? args[++index] : arg.startsWith('--set=') ? arg.slice('--set='.length) : null;
  if (!raw) continue;
  const separator = raw.indexOf('=');
  if (separator <= 0) throw new Error(`--set expects KEY=value, got "${raw}"`);
  sets.set(raw.slice(0, separator).trim(), raw.slice(separator + 1));
}

function targetFile() {
  if (tier === 'dev') return '.env.development.local';
  if (tier === 'staging') return '.env.staging.local';
  if (tier === 'prod' && allowProdLocal) return '.env.production.local';
  if (tier === 'prod') return null;
  throw new Error(`Unknown tier "${tier}" (expected dev, staging, prod).`);
}

function parseEnv(content) {
  const values = new Map();
  for (const raw of content.split(/\r?\n/)) {
    const separator = raw.indexOf('=');
    if (separator <= 0 || raw.trim().startsWith('#')) continue;
    values.set(raw.slice(0, separator).trim(), raw.slice(separator + 1));
  }
  return values;
}

function placeholder(value) {
  return !value.trim() || /your_|placeholder|example|REPLACE_ME/i.test(value);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function assignEnvValue(content, key, value) {
  const pattern = new RegExp(`^${escapeRegExp(key)}=.*$`, 'm');
  if (pattern.test(content)) return content.replace(pattern, `${key}=${value}`);
  return `${content.trimEnd()}\n${key}=${value}\n`;
}

function validate(values) {
  const errors = [];
  const apiKey = values.get('VITE_OPENRTC_API_KEY')?.trim() ?? '';
  if (!apiKey || placeholder(apiKey)) errors.push('VITE_OPENRTC_API_KEY is required');
  else if (!/^pk_(live|test)_/.test(apiKey)) errors.push('VITE_OPENRTC_API_KEY must start with pk_live_ or pk_test_');
  for (const [key, value] of values) {
    if (/^(sk_|whsec_)/.test(value.trim())) errors.push(`${key} contains a server secret in a browser-exposed env file`);
    if (/PLUTONIUM|files-bb895|pluto-rtc-prod|boilerplates/i.test(value)) errors.push(`${key} looks like a different workspace app credential`);
  }
  return errors;
}

const target = targetFile();
if (!target) {
  console.log('[env:setup] production values belong in GitHub Pages Actions secrets; pass --allow-prod-local only for a local prod-build smoke.');
  process.exit(0);
}

const examplePath = path.join(ROOT, '.env.example');
const targetPath = path.join(ROOT, target);
const example = fs.readFileSync(examplePath, 'utf8');

if (check) {
  if (!fs.existsSync(targetPath)) {
    console.error(`[env:doctor] missing ${target}; run pnpm env:setup -- --tier ${tier}`);
    process.exit(1);
  }
  const errors = validate(parseEnv(fs.readFileSync(targetPath, 'utf8')));
  if (errors.length > 0) {
    console.error(`[env:doctor] ${target} has issues:\n${errors.map((error) => `  - ${error}`).join('\n')}`);
    process.exit(1);
  }
  console.log(`[env:doctor] ${target} looks ready for ${tier}.`);
  process.exit(0);
}

if (fs.existsSync(targetPath) && !force) {
  console.log(`[env:setup] ${target} already exists; pass --force to replace it.`);
  process.exit(0);
}

let output = example;
for (const [key, value] of sets) {
  output = assignEnvValue(output, key, value);
}

fs.writeFileSync(targetPath, output.trimEnd() + '\n', { mode: 0o600 });
console.log(`[env:setup] wrote ${target}. Fill VITE_OPENRTC_API_KEY, then run pnpm env:doctor -- --tier ${tier}.`);
