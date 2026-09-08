'use strict';

const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '..', 'assets', 'ads-upload.js'), 'utf8');
const start = source.indexOf('  function clean(');
const end = source.indexOf('  function fileBase64(', start);
assert.ok(start >= 0 && end > start, 'Funções do tratador de ADS não encontradas.');

const context = { XLSX: { SSF: { parse_date_code: () => null } } };
vm.createContext(context);
vm.runInContext(source.slice(start, end) + '\nthis.parseMagaluAdsRaw = parseMagaluAdsRaw;', context);

const matrix = [
  ['Nome', 'SKU', 'Visualizações', 'Cliques', 'Cliques Cobrados', 'Vendas', 'Investimento', 'CTR', 'CPC', 'ROAS', 'ACOS', 'Número de Compras', 'Quantidade', 'Data de Início', 'Data de Término'],
  ['Produto Magalu', 'SKU-1', 100, 10, 10, 200, 20, 0, 0, 0, 0, 1, 1, '07/09/2026', '07/09/2026'],
  ['Produto Magalu', 'SKU-1', 50, 5, 5, 50, 5, 0, 0, 0, 0, 1, 1, '07/09/2026', '07/09/2026'],
  ['Produto sem SKU', '', 30, 3, 3, 80, 8, 0, 0, 0, 0, 1, 1, '08/09/2026', '08/09/2026']
];
const result = context.parseMagaluAdsRaw(matrix, 'Conta Magalu');

assert.strictEqual(result.unified, true);
assert.strictEqual(result.sourceRows, 3);
assert.strictEqual(result.ads, 2);
assert.strictEqual(result.duplicatesConsolidated, 1);
assert.strictEqual(result.minDate, '2026-09-07');
assert.strictEqual(result.maxDate, '2026-09-08');
assert.strictEqual(result.rows.length, 6);
assert.deepStrictEqual(JSON.parse(JSON.stringify(result.rows.slice(0, 3))), [
  { marketplace: 'Magalu', marketplaceSale: 'Conta Magalu', sku: 'SKU-1', ad: 'SKU-1', title: 'Produto Magalu', date: '2026-09-07', category: 'ADS F', subcategory: 'ADS F', value: 250 },
  { marketplace: 'Magalu', marketplaceSale: 'Conta Magalu', sku: 'SKU-1', ad: 'SKU-1', title: 'Produto Magalu', date: '2026-09-07', category: '03.Despesas Marketplace', subcategory: 'Publicidade', value: -25 },
  { marketplace: 'Magalu', marketplaceSale: 'Conta Magalu', sku: 'SKU-1', ad: 'SKU-1', title: 'Produto Magalu', date: '2026-09-07', category: 'Cliques', subcategory: 'Cliques', value: 15 }
]);
assert.strictEqual(result.rows[3].ad, 'Produto sem SKU');

console.log('Magalu ADS raw transform tests: PASS');
