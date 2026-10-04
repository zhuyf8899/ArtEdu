import test from 'node:test';
import assert from 'node:assert/strict';
import { endpoint, filterCatalog } from './comfy-worker.mjs';
test('Worker only connects to loopback ComfyUI and explicitly approved nodes', () => {
    assert.equal(endpoint('http://127.0.0.1:8188').port, '8188');
    for (const u of ['http://evil.example:8188', 'file:///tmp/a', 'http://u:p@localhost:8188', 'http://localhost:8188/evil'])
        assert.throws(() => endpoint(u));
    assert.deepEqual(Object.keys(filterCatalog({ SaveImage: {}, UnapprovedPython: {} }, new Set(['SaveImage']))), ['SaveImage']);
});
