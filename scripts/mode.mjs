#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const WORKSPACE_ROOT = path.resolve(ROOT, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

const hasWorkspaceRoot = fs.existsSync(path.join(WORKSPACE_ROOT, '.gitmodules'));
const hasEnv = fs.existsSync(path.join(ROOT, '.env')) || fs.existsSync(path.join(ROOT, '.env.local'));

console.log(`mode: ${hasWorkspaceRoot ? 'workspace child' : 'standalone portfolio repo'}`);
console.log(`OpenRTC dependency: ${pkg.dependencies?.openrtc ?? 'missing'} (published package by default)`);
console.log(`env: VITE_OPENRTC_API_KEY ${hasEnv ? 'configured locally' : 'needed for live cursors'}`);
console.log('credential owner: Portfolio App only; never Plutonium or boilerplate identities');
console.log('\ncommands:');
console.log('- dev: `pnpm dev`');
console.log('- verify: `pnpm typecheck && pnpm test && pnpm build`');
