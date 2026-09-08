'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createSystemBackup, listSystemBackups, resetSystemData, restoreSystemBackup } = require('../lib/system-data-backups');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'marketplace-system-backup-'));
try {
  fs.writeFileSync(path.join(root, 'accounts.json'), '{"payables":[1]}');
  fs.mkdirSync(path.join(root, 'ads-upload-files'));
  fs.writeFileSync(path.join(root, 'ads-upload-files', '1.xlsx'), 'arquivo bruto');
  const first = createSystemBackup(root, 'teste-manual');
  assert.strictEqual(listSystemBackups(root)[0].id, first.id);

  const reset = resetSystemData(root);
  assert.ok(fs.existsSync(path.join(root, 'metadata.json')));
  assert.ok(!fs.existsSync(path.join(root, 'accounts.json')));
  assert.ok(fs.existsSync(path.join(root, 'system-backups', reset.safetyBackup.id)));

  const restored = restoreSystemBackup(root, first.id);
  assert.strictEqual(fs.readFileSync(path.join(root, 'accounts.json'), 'utf8'), '{"payables":[1]}');
  assert.strictEqual(fs.readFileSync(path.join(root, 'ads-upload-files', '1.xlsx'), 'utf8'), 'arquivo bruto');
  assert.ok(fs.existsSync(path.join(root, 'system-backups', restored.safetyBackup.id)));
  assert.throws(() => restoreSystemBackup(root, '../fora'), /Backup inválido/);
  console.log('System data backup tests: PASS');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
