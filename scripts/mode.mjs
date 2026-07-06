#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const WORKSPACE_ROOT = path.resolve(ROOT, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

const hasWorkspaceRoot = fs.existsSync(path.join(WORKSPACE_ROOT, '.gitmodules'));
const envPath = fs.existsSync(path.join(ROOT, '.env.development.local'))
  ? '.env.development.local'
  : fs.existsSync(path.join(ROOT, '.env'))
    ? '.env'
    : null;

console.log(`mode: ${hasWorkspaceRoot ? 'workspace child' : 'standalone portfolio repo'}`);
console.log(`OpenRTC dependency: ${pkg.dependencies?.openrtc ?? 'missing'} (published package by default)`);
console.log(`env: VITE_OPENRTC_API_KEY ${envPath ? `configured in ${envPath}` : 'needed; run pnpm env:setup'}`);
console.log('credential owner: Portfolio App only; never Plutonium or boilerplate identities');
console.log('\ncommands:');
console.log('- dev: `pnpm dev`');
console.log('- verify: `pnpm typecheck && pnpm test && pnpm build`');
