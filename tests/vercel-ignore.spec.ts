import { test, expect } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// scripts/vercel-ignore.sh is vercel.json's ignoreCommand: exit 0 skips the build, exit 1 builds.
const script = join(process.cwd(), 'scripts/vercel-ignore.sh');
const SKIP = 0;
const BUILD = 1;

function run(files: string[], env: Record<string, string> = {}, cwd = process.cwd()) {
  const e: Record<string, string> = { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '', ...env };
  if (!('VERCEL_GIT_PREVIOUS_SHA' in env)) e.VERCEL_IGNORE_FILES = files.join('\n');
  return spawnSync('bash', [script], { env: e, cwd, encoding: 'utf8' }).status;
}

test.describe('vercel ignored build step', () => {
  test('skips when every changed file is non-site', () => {
    expect(run(['README.md'])).toBe(SKIP);
    expect(run(['.github/workflows/ci.yml', 'tests/tools.spec.ts', 'playwright.config.ts', 'CHANGELOG.md', 'docs/readme/home.png'])).toBe(SKIP);
  });

  test('builds for site files', () => {
    for (const f of ['src/pages/index.astro', 'public/fonts/archivo-var.woff2', 'package.json', 'package-lock.json', 'astro.config.mjs', 'scripts/postbuild.mjs', 'scripts/vendor.mjs', 'vercel.json', 'scripts/vercel-ignore.sh', 'tsconfig.json']) {
      expect(run([f]), f).toBe(BUILD);
    }
  });

  test('builds for a mix and for unknown paths', () => {
    expect(run(['README.md', 'src/data/pairs.ts'])).toBe(BUILD);
    expect(run(['tests/a.spec.ts', 'vercel.json'])).toBe(BUILD);
    expect(run(['somethingnew.txt'])).toBe(BUILD);
    expect(run(['README.md.evil/x'])).toBe(BUILD);
    expect(run(['tests/../src/x.ts'])).toBe(BUILD);
    expect(run(['sub/tests/x.ts'])).toBe(BUILD);
  });

  test('builds when the file list is empty', () => {
    expect(run([])).toBe(BUILD);
  });

  test('builds when the previous SHA is missing, empty or unknown', () => {
    expect(run([], { VERCEL_GIT_PREVIOUS_SHA: '' })).toBe(BUILD);
    expect(run([], { VERCEL_GIT_PREVIOUS_SHA: '0123456789abcdef0123456789abcdef01234567' })).toBe(BUILD);
  });

  test('builds outside a git repository (script error)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'vi-'));
    expect(run([], { VERCEL_GIT_PREVIOUS_SHA: 'abc123' }, dir)).toBe(BUILD);
  });

  test('uses the git diff against the previous SHA', () => {
    const dir = mkdtempSync(join(tmpdir(), 'vi-'));
    const git = (...a: string[]) => spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { cwd: dir, encoding: 'utf8' }).stdout.trim();
    git('init', '-q');
    writeFileSync(join(dir, 'README.md'), 'a');
    mkdirSync(join(dir, 'src'));
    writeFileSync(join(dir, 'src/a.ts'), 'a');
    git('add', '-A'); git('commit', '-qm', 'one');
    const base = git('rev-parse', 'HEAD');
    writeFileSync(join(dir, 'README.md'), 'b');
    git('commit', '-qam', 'docs only');
    expect(run([], { VERCEL_GIT_PREVIOUS_SHA: base }, dir)).toBe(SKIP);
    writeFileSync(join(dir, 'src/a.ts'), 'b');
    git('commit', '-qam', 'site');
    expect(run([], { VERCEL_GIT_PREVIOUS_SHA: base }, dir)).toBe(BUILD);
    // A rename out of src/ into docs/ still builds: the old path is listed too.
    mkdirSync(join(dir, 'docs'));
    git('mv', 'src/a.ts', 'docs/a.ts'); git('commit', '-qm', 'move');
    const head1 = git('rev-parse', 'HEAD~1');
    expect(run([], { VERCEL_GIT_PREVIOUS_SHA: head1 }, dir)).toBe(BUILD);
  });
});
