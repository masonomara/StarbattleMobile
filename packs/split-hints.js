#!/usr/bin/env node
// scripts/split-hints.js
//
// Splits fat pack files (with inline hints) into:
//   ${packId}.json        — slim pack: sbn + solution, no hints, version bumped to 2
//   ${packId}-hints.json  — hints-only: { version, hints: HintStep[][] } indexed by puzzle position
//
// Usage:
//   node scripts/split-hints.js [--dry-run] [packId ...]
//
//   No packIds → processes all known library packs (from packs/) + streak packs (from Supabase).
//   With packIds → processes only those packs.
//
// Required env vars (add to .env):
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY   (not the anon key — needs storage write permission)
//
// Release pipeline for a new daily pack:
//   1. Generate the fat daily.json (upstream tool, produces sbn+solution+hints per puzzle)
//   2. Upload it to Supabase storage as "daily.json" using the Supabase dashboard or CLI
//   3. node scripts/split-hints.js daily
//      → downloads fat pack, splits it, re-uploads slim + hints files
//   4. Ship an app update that includes PACK_MIN_VERSION = 2 (if not already deployed)
//      → existing users' cached fat files are evicted on next launch and slim files downloaded

'use strict';

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const DRY_RUN = process.argv.includes('--dry-run');
const PACK_MIN_VERSION = 2; // must match src/packs/index.ts

const LOCAL_PACKS_DIR = path.join(__dirname, '..', 'packs');
const LOCAL_PACK_IDS = fs.readdirSync(LOCAL_PACKS_DIR)
  .filter(f => f.endsWith('.json') && !f.endsWith('-hints.json') && !f.endsWith('-slim.json'))
  .map(f => f.replace('.json', ''));

const STREAK_PACK_IDS = ['daily', 'weekly', 'monthly'];

async function downloadFromSupabase(storagePath) {
  const { data, error } = await supabase.storage.from('packs').download(storagePath);
  if (error) throw new Error(`Download failed for ${storagePath}: ${error.message}`);
  return data.text();
}

async function uploadToSupabase(storagePath, content) {
  if (DRY_RUN) {
    console.log(`  [dry-run] would upload ${storagePath} (${(content.length / 1024).toFixed(1)} KB)`);
    return;
  }
  const blob = new Blob([content], { type: 'application/json' });
  const { error } = await supabase.storage
    .from('packs')
    .upload(storagePath, blob, { upsert: true, contentType: 'application/json' });
  if (error) throw new Error(`Upload failed for ${storagePath}: ${error.message}`);
  console.log(`  uploaded ${storagePath} (${(content.length / 1024).toFixed(1)} KB)`);
}

function splitPack(data) {
  if (!Array.isArray(data.puzzles) || data.puzzles.length === 0) {
    throw new Error('Pack has no puzzles');
  }

  const slim = {
    ...data,
    version: PACK_MIN_VERSION,
    puzzles: data.puzzles.map(p => {
      const { hints: _discarded, ...rest } = p;
      return rest;
    }),
  };

  const hintsFile = {
    version: 1,
    hints: data.puzzles.map(p => p.hints ?? []),
  };

  return { slim, hintsFile };
}

function verifyAlignment(slim, hintsFile) {
  if (slim.puzzles.length !== hintsFile.hints.length) {
    throw new Error(
      `Alignment error: slim has ${slim.puzzles.length} puzzles, hints has ${hintsFile.hints.length} entries`,
    );
  }
  for (const p of slim.puzzles) {
    if ('hints' in p) throw new Error(`Slim puzzle still contains hints field`);
    if (!p.sbn) throw new Error(`Slim puzzle missing sbn`);
  }
}

async function processPack(packId, rawText) {
  const data = JSON.parse(rawText);

  if (data.version >= PACK_MIN_VERSION && !data.puzzles.some(p => 'hints' in p)) {
    console.log(`  already slim (version ${data.version}), skipping upload`);
    return;
  }

  const { slim, hintsFile } = splitPack(data);
  verifyAlignment(slim, hintsFile);

  const slimText = JSON.stringify(slim);
  const hintsText = JSON.stringify(hintsFile);

  const savingsKb = ((rawText.length - slimText.length) / 1024).toFixed(1);
  console.log(
    `  ${(rawText.length / 1024).toFixed(1)} KB full` +
    ` → ${(slimText.length / 1024).toFixed(1)} KB slim` +
    ` + ${(hintsText.length / 1024).toFixed(1)} KB hints` +
    ` (saved ${savingsKb} KB in main file)`,
  );
  console.log(`  puzzles: ${slim.puzzles.length}, hint entries: ${hintsFile.hints.length}`);

  await uploadToSupabase(`${packId}.json`, slimText);
  await uploadToSupabase(`${packId}-hints.json`, hintsText);

  // Keep local file in sync for library packs
  const localPath = path.join(LOCAL_PACKS_DIR, `${packId}.json`);
  if (fs.existsSync(localPath) && !DRY_RUN) {
    fs.writeFileSync(localPath, slimText, 'utf8');
    console.log(`  updated local packs/${packId}.json`);
  }
}

async function processLocalPack(packId) {
  const localPath = path.join(LOCAL_PACKS_DIR, `${packId}.json`);
  if (!fs.existsSync(localPath)) {
    console.error(`  not found in packs/ directory: ${packId}`);
    return;
  }
  console.log(`\nLocal pack: ${packId}`);
  await processPack(packId, fs.readFileSync(localPath, 'utf8'));
}

async function processRemotePack(packId) {
  console.log(`\nRemote pack: ${packId}`);
  try {
    const raw = await downloadFromSupabase(`${packId}.json`);
    await processPack(packId, raw);
  } catch (e) {
    console.error(`  error: ${e.message}`);
  }
}

async function main() {
  const targetArgs = process.argv.slice(2).filter(a => !a.startsWith('--'));

  const localTargets = targetArgs.length
    ? LOCAL_PACK_IDS.filter(id => targetArgs.includes(id))
    : LOCAL_PACK_IDS;

  const remoteTargets = targetArgs.length
    ? STREAK_PACK_IDS.filter(id => targetArgs.includes(id))
    : STREAK_PACK_IDS;

  if (DRY_RUN) console.log('=== DRY RUN — no files will be uploaded ===');
  console.log(`Processing ${localTargets.length} local + ${remoteTargets.length} remote packs\n`);

  for (const packId of localTargets) await processLocalPack(packId);
  for (const packId of remoteTargets) await processRemotePack(packId);

  console.log('\nDone.');
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
