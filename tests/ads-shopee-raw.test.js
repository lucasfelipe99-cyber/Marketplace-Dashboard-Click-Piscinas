'use strict';

const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '..', 'assets', 'ads-upload.js'), 'utf8');
const start = source.indexOf('  function clean(');
const end = source.indexOf('  function fileBase64(', start);
const dayStart = source.indexOf('  function dayFromFileName(');
const dayEnd = source.indexOf('  function parseMatrix(', dayStart);
assert.ok(start >= 0 && end > start && dayStart >= 0 && dayEnd > dayStart, 'Funções do tratador de ADS não encontradas.');

const context = { XLSX: { SSF: { parse_date_code: () => null } } };
vm.createContext(context);
vm.runInContext(source.slice(start, end) + source.slice(dayStart, dayEnd) + '\nthis.parseShopeeRaw = parseShopeeRaw; this.dayFromFileName = dayFromFileName;', context);

const matrix = [
  ['Relatório de Todos os Anúncios CPC - Shopee Brasil'],
  ['Nome da loja', 'LOJA TESTE'],
  [],
  ['#', 'Nome do Anúncio', 'ID do produto', 'Cliques', 'GMV', 'Despesas'],
  [1, 'Produto A', '123', 10, 200, 20],
  [2, 'Produto A repetido', '123', 5, 50, 5],
  [3, 'GMV Max da Loja', '-', 7, 100, 8]
];
const result = context.parseShopeeRaw(matrix, 'Conta Shopee');

assert.strictEqual(result.sourceRows, 3);
assert.strictEqual(result.ads, 2);
assert.strictEqual(result.duplicatesConsolidated, 1);
assert.strictEqual(result.rows.length, 6);
assert.deepStrictEqual(JSON.parse(JSON.stringify(result.rows.slice(0, 3))), [
  { marketplace: 'Shopee', marketplaceSale: 'Conta Shopee', sku: '', ad: '123', title: 'Produto A', date: '', category: 'ADS F', subcategory: 'ADS F', value: 250 },
  { marketplace: 'Shopee', marketplaceSale: 'Conta Shopee', sku: '', ad: '123', title: 'Produto A', date: '', category: '03.Despesas Marketplace', subcategory: 'Publicidade', value: -25 },
  { marketplace: 'Shopee', marketplaceSale: 'Conta Shopee', sku: '', ad: '123', title: 'Produto A', date: '', category: 'Cliques', subcategory: 'Cliques', value: 15 }
]);
assert.strictEqual(context.dayFromFileName('31.csv', 2026, 8), 31);
assert.strictEqual(context.dayFromFileName('Dados+Gerais+de+Anúncios+Shopee-31_08_2026-31_08_2026.csv', 2026, 8), 31);
assert.throws(() => context.dayFromFileName('Shopee-31_08_2026.csv', 2026, 7), /não pertence ao mês selecionado/);

const consolidated = [
  ['#', 'Nome do Anúncio', 'Status', 'ID do produto', 'Cliques', 'GMV', 'Despesas', 'Data', 'Arquivo Origem', 'Sheet1.SKU de referência'],
  [1, 'Produto com SKU', 'Ativo', '987654', 12, 300, 30, '01/09/2026', '1.csv', 'SKU-ABC'],
  [2, 'Produto com SKU', 'Ativo', '987654', 8, 100, 10, '01/09/2026', '1.csv', 'SKU-ABC'],
  [3, 'Produto outro dia', 'Ativo', '111222', 5, 50, 6, '02/09/2026', '2.csv', 'SKU-XYZ']
];
const consolidatedResult = context.parseShopeeRaw(consolidated, 'Conta Shopee');
assert.strictEqual(consolidatedResult.unified, true);
assert.strictEqual(consolidatedResult.minDate, '2026-09-01');
assert.strictEqual(consolidatedResult.maxDate, '2026-09-02');
assert.strictEqual(consolidatedResult.ads, 2);
assert.deepStrictEqual(JSON.parse(JSON.stringify(consolidatedResult.rows.slice(0, 3))), [
  { marketplace: 'Shopee', marketplaceSale: 'Conta Shopee', sku: 'SKU-ABC', ad: '987654', title: 'Produto com SKU', date: '2026-09-01', category: 'ADS F', subcategory: 'ADS F', value: 400 },
  { marketplace: 'Shopee', marketplaceSale: 'Conta Shopee', sku: 'SKU-ABC', ad: '987654', title: 'Produto com SKU', date: '2026-09-01', category: '03.Despesas Marketplace', subcategory: 'Publicidade', value: -40 },
  { marketplace: 'Shopee', marketplaceSale: 'Conta Shopee', sku: 'SKU-ABC', ad: '987654', title: 'Produto com SKU', date: '2026-09-01', category: 'Cliques', subcategory: 'Cliques', value: 20 }
]);

console.log('Shopee ADS raw transform tests: PASS');
