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
vm.runInContext(source.slice(start, end) + '\nthis.parseTikTokAdsRaw = parseTikTokAdsRaw;', context);

const matrix = [
  ['Nome do produto', 'ID do produto', 'Impulsionamento dos criativos ativo', 'Custo', 'Pedidos de SKU', 'Custo por pedido', 'Receita bruta', 'ROI', 'Moeda'],
  ['Produto A', '1736053751479174361', 0, '0.84', 1, '0.84', '27.70', '32.98', 'BRL'],
  ['Produto A repetido', '1736053751479174361', 0, '0.16', 1, '0.16', '2.30', '14.38', 'BRL'],
  ['Produto B', '1735872897561429209', 0, '0.00', 0, '0.00', '0.00', '0.00', 'BRL']
];
const result = context.parseTikTokAdsRaw(matrix, 'Click Piscinas');

assert.strictEqual(result.sourceRows, 3);
assert.strictEqual(result.ads, 2);
assert.strictEqual(result.duplicatesConsolidated, 1);
assert.strictEqual(result.rows.length, 4);
assert.deepStrictEqual(JSON.parse(JSON.stringify(result.rows.slice(0, 2))), [
  { marketplace: 'TikTok', marketplaceSale: 'Click Piscinas', sku: '', ad: '1736053751479174361', date: '', category: 'ADS F', subcategory: 'ADS F', value: 30 },
  { marketplace: 'TikTok', marketplaceSale: 'Click Piscinas', sku: '', ad: '1736053751479174361', date: '', category: '03.Despesas Marketplace', subcategory: 'Publicidade', value: -1 }
]);
assert.ok(!result.rows.some((row) => row.category === 'Cliques'));

console.log('TikTok ADS raw transform tests: PASS');
