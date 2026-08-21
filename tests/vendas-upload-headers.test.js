'use strict';

const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const source = fs.readFileSync(require.resolve('../assets/vendas-upload.js'), 'utf8');
function extract(name, nextName) {
  const start = source.indexOf('  function ' + name + '(');
  const end = source.indexOf('  function ' + nextName + '(', start);
  assert(start >= 0 && end > start, 'Função ' + name + ' não encontrada');
  return source.slice(start, end);
}

const context = {};
vm.createContext(context);
vm.runInContext(
  extract('normalized', 'stagedNumber') +
  extract('marketplaceSaleName', 'productIdentifiers') +
  extract('productIdentifiers', 'cellNumber') +
  extract('headerIndex', 'normalizeTreatedHeaders') +
  extract('normalizeTreatedHeaders', 'metricHeaderIndex'),
  context
);

const required = ['Marketplace', 'Marketplace venda', 'Data', 'SKU', 'Título do anúncio', 'Unidades', 'Faturamento'];
function validate(headers) {
  const normalized = context.normalizeTreatedHeaders([headers, headers.map(() => '')])[0];
  required.forEach((name) => assert(context.headerIndex(normalized, name) >= 0, name + ' ausente'));
}

validate(['Marketplace','Marketplace venda','Número do pedido','Data do Pedido','Data','Status','Modalidade de entrega','Codigo SKU seller','Título do produto','SKU.1','Valor Total do Item','Quantidade de itens','Fat','Imposto','Custo do produto','Gross margin']);
validate(['Marketplace','Marketplace venda','ID do pedido','Data Completa','Data','Status','Opção de envio','ID do Produto','Nome do Produto','Número de referência SKU','Preço acordado','Quantidade','Faturamento','Imposto','Custo do produto','Gross margin']);
validate(['Marketplace','Marketplace venda','Order ID','Created Time','Data','Status','Fulfillment Type','SKU ID','Product Name','Seller SKU','Preço Unitário','Quantity','Faturamento','Imposto','Custo do produto','Gross margin']);
validate(['Marketplace','Marketplace venda','amazon-order-id','purchase-date','Data','Status','fulfillment-channel','asin','product-name','SKU.1','Preço Unitário','quantity','Faturamento','Imposto','Custo do produto','Margin R$']);

assert.strictEqual(context.marketplaceSaleName('Mercado Livre', 'Patas Fiéis'), 'Mercado Livre - Patas Fiéis');
assert.strictEqual(context.marketplaceSaleName('Mercado Livre', 'Mercado Livre - Patas Fiéis'), 'Mercado Livre - Patas Fiéis');
assert.deepStrictEqual(
  JSON.parse(JSON.stringify(context.productIdentifiers('', 'MLB123', 'Produto', 'Mercado Livre - Patas Fiéis'))),
  { sku: 'MLB123', ad: 'MLB123' }
);
assert.deepStrictEqual(
  JSON.parse(JSON.stringify(context.productIdentifiers('SKU1', '', 'Produto', 'TikTok - Click Piscinas'))),
  { sku: 'SKU1', ad: 'SKU1' }
);
assert.deepStrictEqual(
  JSON.parse(JSON.stringify(context.productIdentifiers('', '', 'Produto Azul', 'Shopee - Loja A'))),
  { sku: 'Produto Azul - Shopee - Loja A', ad: 'Produto Azul - Shopee - Loja A' }
);

console.log('Sales upload header normalization tests: PASS');
