import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { targetForKey, verifyBundle } from './install-community-showcase.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

test('showcase storage keys cannot leave the upload root', () => {
  const root = path.resolve('data/uploads');
  assert.equal(targetForKey(root, 'users/user-student-demo/works/work-123/image-123'),
    path.join(root, 'users', 'user-student-demo', 'works', 'work-123', 'image-123'));
  for (const key of ['../outside', 'users/x/works/y/../outside', '/absolute', 'users/x/works/y/z/extra']) {
    assert.throws(() => targetForKey(root, key));
  }
});

test('published showcase bundle contains nine cases and 53 matching public images', async () => {
  const { manifest, imageCount, bytes } = await verifyBundle();
  assert.equal(manifest.cases.length, 9);
  assert.equal(imageCount, 53);
  assert.ok(bytes > 0);
  assert.ok(manifest.cases.every(item => !Object.hasOwn(item.story, 'authorizationNote')));
  assert.ok(manifest.cases.every(item => item.assets.every(asset => asset.mimeType.startsWith('image/'))));
});

test('local and staging deployment paths install the same showcase bundle', async () => {
  const files = ['package.json', 'scripts/dev.mjs', 'scripts/start-local.ps1', 'deploy/deploy-staging.sh'];
  for (const file of files) {
    const source = await readFile(path.join(repositoryRoot, file), 'utf8');
    assert.match(source, /showcase:install/, file);
  }
});
