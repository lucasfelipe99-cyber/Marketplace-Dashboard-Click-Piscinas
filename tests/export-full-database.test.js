'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const XLSX = require('../assets/xlsx.full.min.js');
const source = fs.readFileSync(require.resolve('../assets/export-full-database.js'), 'utf8');
async function run(failSecond) {
  const rows = [['ID', 'Valor', 'Texto'], ['001234567890123456789', -1234.56789, '1.234,56789'], ['00001', 0.000000123, '=1+1'], ['2', 0, '']];
  const before = JSON.stringify(rows), calls = [];
  let click, file;
  const button = { disabled: false, addEventListener: (_, handler) => { click = handler; } }, status = {};
  const api = Object.assign({}, XLSX, { writeFile: workbook => { file = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }); } });
  const context = { document: { getElementById: id => id === 'exportFullDatabase' ? button : status }, window: { XLSX: api }, XLSX: api,
    fetch: async (url, options) => {
      calls.push({url, options});
      if (url === '/api/latest-base') return { ok: true, json: async () => ({ months: { '9': { exists: true, month: '9', rowsUrl: '/nine' }, '1': { exists: true, month: '1', rowsUrl: '/one' } } }) };
      return { ok: !(failSecond && url.startsWith('/nine')), json: async () => ({rows}) };
    }
  };
  vm.runInNewContext(source, context);
  await click();
  assert.equal(button.disabled, false);
  assert.equal(JSON.stringify(rows), before, 'Stored data must not be mutated');
  assert(calls.every(call => !call.options.method), 'Only read requests are allowed');
  if (failSecond) {
    assert.equal(file, undefined, 'A failed month must not produce a partial export');
    assert.match(status.textContent, /não concluída/);
  } else {
    const workbook = XLSX.read(file, { type: 'buffer' });
    assert.deepEqual(workbook.SheetNames, ['Mes 01', 'Mes 09']);
    for (const name of workbook.SheetNames) {
      assert.deepEqual(XLSX.utils.sheet_to_json(workbook.Sheets[name], {header: 1, raw: true, defval: ''}), rows);
      assert.equal(workbook.Sheets[name].A2.t, 's');
      assert.equal(workbook.Sheets[name].B2.t, 'n');
      assert.equal(workbook.Sheets[name].C3.f, undefined);
    }
  }
}
(async () => { await run(false); await run(true); console.log('PASS: all months, exact XLSX round-trip, original types, no mutations, no partial export'); })().catch(error => { console.error(error); process.exitCode = 1; });
