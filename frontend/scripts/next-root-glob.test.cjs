/* eslint-disable @typescript-eslint/no-require-imports -- Exercises the CommonJS dependency contract used by the Next plugin. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { globSync } = require('../vendor/next-root-glob/index.cjs');

test('Next root globs preserve exact, wildcard and absolute directory matching', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'next-root-'));
  try {
    fs.mkdirSync(path.join(root, 'apps', 'one'), { recursive: true });
    fs.mkdirSync(path.join(root, 'apps', 'two'), { recursive: true });
    fs.writeFileSync(path.join(root, 'apps', 'file.txt'), 'not a directory');
    assert.deepEqual(globSync('apps/*', { cwd: root, onlyDirectories: true }).sort(), ['apps/one', 'apps/two']);
    assert.deepEqual(globSync(path.join(root, 'apps', 'one'), { onlyDirectories: true }), [path.join(root, 'apps', 'one')]);
    assert.deepEqual(globSync('missing/*', { cwd: root, onlyDirectories: true }), []);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('adversarial brace nesting and unsupported modes fail before glob evaluation', () => {
  assert.throws(() => globSync('{'.repeat(2000) + 'a' + '}'.repeat(2000), { onlyDirectories: true }), RangeError);
  assert.throws(() => globSync('*', {}), TypeError);
});

test('Next plugin imports the bounded override and keeps its rules', () => {
  const plugin = require('@next/eslint-plugin-next');
  assert.ok(plugin.rules['no-html-link-for-pages']);
  assert.ok(plugin.rules['no-img-element']);
  const { createRequire } = require('node:module');
  const fromPlugin = createRequire(require.resolve('@next/eslint-plugin-next'));
  assert.equal(fromPlugin('fast-glob/package.json').version, '3.3.1-nexus-root.1');
  assert.throws(() => fromPlugin('fast-glob').globSync('{nested}', { onlyDirectories: true }), RangeError);
});
