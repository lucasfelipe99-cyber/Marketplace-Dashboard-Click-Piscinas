'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const BACKUP_FOLDER = 'system-backups';
const LEGACY_BACKUP_FOLDERS = new Set(['base-refresh-backups', 'base-replacement-backups', 'ads-channel-delete-backups']);

function safeBackupId(value) {
  const id = String(value || '');
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-[a-f0-9]{8}$/.test(id)) throw new Error('Backup inválido.');
  return id;
}

function backupRoot(dataDir) { return path.join(dataDir, BACKUP_FOLDER); }
function operationalEntries(dataDir) {
  if (!fs.existsSync(dataDir)) return [];
  return fs.readdirSync(dataDir, { withFileTypes: true }).filter((entry) => entry.name !== BACKUP_FOLDER);
}
function snapshotEntries(dataDir) { return operationalEntries(dataDir).filter((entry) => !LEGACY_BACKUP_FOLDERS.has(entry.name)); }
function measure(target) {
  const stat = fs.lstatSync(target);
  if (!stat.isDirectory()) return { files: 1, bytes: stat.size };
  return fs.readdirSync(target).reduce((total, name) => {
    const current = measure(path.join(target, name));
    total.files += current.files; total.bytes += current.bytes; return total;
  }, { files: 0, bytes: 0 });
}
function createSystemBackup(dataDir, reason) {
  fs.mkdirSync(dataDir, { recursive: true });
  const root = backupRoot(dataDir);
  fs.mkdirSync(root, { recursive: true });
  const createdAt = new Date().toISOString();
  const id = createdAt.replace(/[:.]/g, '-') + '-' + crypto.randomBytes(4).toString('hex');
  const destination = path.join(root, id);
  const snapshot = path.join(destination, 'snapshot');
  fs.mkdirSync(snapshot, { recursive: true });
  const entries = snapshotEntries(dataDir);
  entries.forEach((entry) => fs.cpSync(path.join(dataDir, entry.name), path.join(snapshot, entry.name), { recursive: true, force: false, errorOnExist: true }));
  const size = measure(snapshot);
  const manifest = { version: 1, id, createdAt, reason: String(reason || 'manual'), files: size.files, bytes: size.bytes, entries: entries.map((entry) => entry.name) };
  fs.writeFileSync(path.join(destination, 'manifest.json'), JSON.stringify(manifest, null, 2));
  return manifest;
}
function listSystemBackups(dataDir) {
  const root = backupRoot(dataDir);
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => {
    try {
      const manifest = JSON.parse(fs.readFileSync(path.join(root, entry.name, 'manifest.json'), 'utf8'));
      return { id: entry.name, createdAt: manifest.createdAt, reason: manifest.reason, files: Number(manifest.files) || 0, bytes: Number(manifest.bytes) || 0 };
    } catch (_) { return null; }
  }).filter(Boolean).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}
function clearOperationalData(dataDir) {
  const entries = operationalEntries(dataDir);
  entries.forEach((entry) => fs.rmSync(path.join(dataDir, entry.name), { recursive: true, force: true }));
  fs.mkdirSync(path.join(dataDir, 'ads-upload-files'), { recursive: true });
  fs.mkdirSync(path.join(dataDir, 'ads-treated-files'), { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'metadata.json'), JSON.stringify({ areas: { area1: { months: {} } } }, null, 2));
  return entries.map((entry) => entry.name);
}
function resetSystemData(dataDir) {
  const safetyBackup = createSystemBackup(dataDir, 'antes-de-reiniciar-do-zero');
  const removed = clearOperationalData(dataDir);
  return { safetyBackup, removed };
}
function restoreSystemBackup(dataDir, backupId) {
  const id = safeBackupId(backupId);
  const snapshot = path.join(backupRoot(dataDir), id, 'snapshot');
  if (!fs.existsSync(snapshot) || !fs.statSync(snapshot).isDirectory()) throw new Error('O conteúdo deste backup não foi encontrado.');
  const safetyBackup = createSystemBackup(dataDir, 'antes-de-restaurar-' + id);
  clearOperationalData(dataDir);
  fs.readdirSync(snapshot, { withFileTypes: true }).forEach((entry) => fs.cpSync(path.join(snapshot, entry.name), path.join(dataDir, entry.name), { recursive: true, force: true }));
  return { restored: id, safetyBackup };
}

module.exports = { BACKUP_FOLDER, createSystemBackup, listSystemBackups, resetSystemData, restoreSystemBackup };
