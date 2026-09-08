'use strict';

const assert = require('assert');
const { applyProductCategoryImport } = require('../lib/product-category-import');

function state() {
  return { categories: [{ id: 'a', name: 'Bombas' }, { id: 'b', name: 'Filtros' }], skus: { '001': { sku: '001', categoryId: '' }, '002': { sku: '002', categoryId: 'b' } } };
}
let master = state();
let result = applyProductCategoryImport(master, [{ sku: '001', categoryName: ' bombas ' }, { sku: '001', categoryName: 'BOMBAS' }, { sku: '002', categoryName: 'Filtros' }, { sku: '003', categoryName: '' }]);
assert.deepStrictEqual(result, { updated: 1, unchanged: 1, blankRows: 1, duplicateRows: 1, imported: 2 });
assert.strictEqual(master.skus['001'].categoryId, 'a');
assert.throws(() => applyProductCategoryImport(state(), [{ sku: '001', categoryName: 'Categoria errada' }]), /Categorias não cadastradas/);
assert.throws(() => applyProductCategoryImport(state(), [{ sku: '999', categoryName: 'Bombas' }]), /SKUs não encontrados/);
assert.throws(() => applyProductCategoryImport(state(), [{ sku: '001', categoryName: 'Bombas' }, { sku: '001', categoryName: 'Filtros' }]), /categorias diferentes/);
console.log('Product category import tests: PASS');
