import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatBytes, storageStatus, requestPersistence } from '../../app/js/persistence.js';

test('formatBytes em pt-BR', () => {
  assert.equal(formatBytes(0), '0 bytes');
  assert.equal(formatBytes(512), '512 bytes');
  assert.equal(formatBytes(1536), '1,5 KB');
  assert.equal(formatBytes(12 * 1024), '12 KB');
  assert.equal(formatBytes(3.4 * 1024 * 1024), '3,4 MB');
  assert.equal(formatBytes(1.2 * 1024 ** 3), '1,2 GB');
  assert.equal(formatBytes(null), '—');
});

test('sem a API de armazenamento: informa que não há suporte, sem lançar', async () => {
  assert.deepEqual(await storageStatus(), { supported: false, persisted: null, usage: null, quota: null });
  assert.equal(await requestPersistence(), false);
});
