'use strict';

function normalize(value) {
  return String(value || '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ');
}

function applyProductCategoryImport(master, sourceRows) {
  if (!Array.isArray(sourceRows) || !sourceRows.length) throw new Error('Nenhuma categoria preenchida foi encontrada na planilha.');
  if (sourceRows.length > 100000) throw new Error('A planilha excede o limite de 100.000 linhas.');
  const categories = new Map((master.categories || []).map((item) => [normalize(item.name), item]));
  const assignments = new Map();
  let blankRows = 0, duplicateRows = 0;
  sourceRows.forEach((row) => {
    const sku = String(row && row.sku || '').trim();
    const categoryName = String(row && row.categoryName || '').trim();
    if (!sku || !categoryName) { blankRows += 1; return; }
    if (assignments.has(sku)) {
      if (normalize(assignments.get(sku)) !== normalize(categoryName)) throw new Error('O SKU "' + sku + '" aparece com categorias diferentes na planilha.');
      duplicateRows += 1; return;
    }
    assignments.set(sku, categoryName);
  });
  if (!assignments.size) throw new Error('Preencha a coluna Categoria oficial antes de importar.');
  const unknownCategories = [...new Set([...assignments.values()].filter((name) => !categories.has(normalize(name))))];
  if (unknownCategories.length) throw new Error('Categorias não cadastradas no sistema: ' + unknownCategories.slice(0, 12).join(', ') + '.');
  const unknownSkus = [...assignments.keys()].filter((sku) => !master.skus || !master.skus[sku]);
  if (unknownSkus.length) throw new Error('SKUs não encontrados no cadastro atual: ' + unknownSkus.slice(0, 12).join(', ') + '.');
  let updated = 0, unchanged = 0;
  assignments.forEach((categoryName, sku) => {
    const categoryId = categories.get(normalize(categoryName)).id;
    if (master.skus[sku].categoryId === categoryId) unchanged += 1;
    else { master.skus[sku].categoryId = categoryId; updated += 1; }
  });
  return { updated, unchanged, blankRows, duplicateRows, imported: assignments.size };
}

module.exports = { applyProductCategoryImport };
