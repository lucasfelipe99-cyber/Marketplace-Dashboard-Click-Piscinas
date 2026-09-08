(function () {
  'use strict';

  var categoriesContainer = document.getElementById('productCategoriesContainer');
  var skuContainer = document.getElementById('skuCatalogContainer');
  if (!categoriesContainer || !skuContainer) return;

  var master = { categories: [], skus: {} };
  var loaded = false;
  var searchText = '';
  var pendingOnly = false;
  var bulkCategoryId = '';
  var categoryImportRows = null;
  var selectedSkus = new Set();

  function escapeValue(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (character) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character];
    });
  }

  function normalizeText(value) {
    return String(value == null ? '' : value).trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ');
  }

  function exportSkuCategories() {
    if (!window.XLSX) throw new Error('O componente de Excel ainda não terminou de carregar.');
    var categoryNames = Object.fromEntries((master.categories || []).map(function (item) { return [item.id, item.name]; }));
    var rows = [['SKU', 'Descrição', 'Marketplace', 'Categoria oficial']].concat(Object.values(master.skus || {}).sort(function (a, b) {
      return String(a.sku).localeCompare(String(b.sku), 'pt-BR');
    }).map(function (item) { return [String(item.sku || ''), item.description || '', item.marketplace || '', categoryNames[item.categoryId] || '']; }));
    var categoryRows = [['Categorias disponíveis']].concat((master.categories || []).map(function (item) { return [item.name]; }));
    var workbook = XLSX.utils.book_new();
    var skuSheet = XLSX.utils.aoa_to_sheet(rows), categorySheet = XLSX.utils.aoa_to_sheet(categoryRows);
    skuSheet['!cols'] = [{ wch: 24 }, { wch: 65 }, { wch: 24 }, { wch: 34 }];
    skuSheet['!autofilter'] = { ref: 'A1:D' + rows.length };
    categorySheet['!cols'] = [{ wch: 42 }];
    ['A1', 'B1', 'C1', 'D1'].forEach(function (cell) { if (skuSheet[cell]) skuSheet[cell].s = { font: { bold: true, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '2563EB' } } }; });
    if (categorySheet.A1) categorySheet.A1.s = { font: { bold: true, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '2563EB' } } };
    XLSX.utils.book_append_sheet(workbook, skuSheet, 'Cadastro de SKU');
    XLSX.utils.book_append_sheet(workbook, categorySheet, 'Categorias disponíveis');
    XLSX.writeFile(workbook, 'Cadastro_de_SKU_para_categorizar_' + new Date().toISOString().slice(0, 10) + '.xlsx', { bookType: 'xlsx', cellStyles: true });
  }

  async function readSkuCategoryWorkbook(file) {
    if (!window.XLSX) throw new Error('O componente de Excel ainda não terminou de carregar.');
    var workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', raw: true });
    var sheetName = workbook.SheetNames.find(function (name) { return normalizeText(name) === 'cadastro de sku'; }) || workbook.SheetNames[0];
    var matrix = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: '', raw: true });
    if (!matrix.length) throw new Error('A planilha está vazia.');
    var headers = matrix[0].map(normalizeText);
    var skuIndex = headers.indexOf('sku'), categoryIndex = headers.indexOf('categoria oficial');
    if (skuIndex < 0 || categoryIndex < 0) throw new Error('A planilha precisa conter as colunas SKU e Categoria oficial.');
    var rows = matrix.slice(1).map(function (row) { return { sku: String(row[skuIndex] == null ? '' : row[skuIndex]).trim(), categoryName: String(row[categoryIndex] == null ? '' : row[categoryIndex]).trim() }; }).filter(function (row) { return row.sku && row.categoryName; });
    if (!rows.length) throw new Error('Nenhuma categoria foi preenchida na planilha.');
    var knownCategories = new Set((master.categories || []).map(function (item) { return normalizeText(item.name); }));
    var unknown = Array.from(new Set(rows.map(function (row) { return row.categoryName; }).filter(function (name) { return !knownCategories.has(normalizeText(name)); })));
    if (unknown.length) throw new Error('Categorias não cadastradas: ' + unknown.slice(0, 12).join(', ') + '. Use os nomes da aba Categorias disponíveis.');
    return rows;
  }

  async function loadMaster(force) {
    if (loaded && !force) return master;
    var response = await fetch('/api/product-master', { cache: 'no-store' });
    if (!response.ok) throw new Error('Não foi possível carregar o cadastro.');
    master = await response.json();
    loaded = true;
    return master;
  }

  async function updateMaster(payload) {
    var response = await fetch('/api/product-master', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    var result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Não foi possível salvar.');
    master = result;
    loaded = true;
    return master;
  }

  function renderCategories() {
    var categories = master.categories || [];
    categoriesContainer.innerHTML = '<div class="product-master-page">' +
      '<section class="product-master-toolbar"><div class="product-master-title"><strong>Categorias de Produto</strong>' +
      '<span>Cadastre uma vez e selecione a mesma categoria nos SKUs. Nomes equivalentes não podem ser duplicados.</span></div>' +
      '<form class="product-master-form" id="categoryForm"><div class="product-master-field"><label for="newProductCategory">Nova categoria</label>' +
      '<input id="newProductCategory" required maxlength="80" placeholder="Ex.: Higiene e Limpeza"></div>' +
      '<button class="product-master-button" type="submit">Cadastrar categoria</button>' +
      '<button class="product-master-button" id="applyCategoriesToBase" type="button">Atualizar categorias na Base de Dados</button></form></section>' +
      '<div class="product-master-status" id="categoryStatus"></div><section class="product-master-card"><div class="product-master-stats">' +
      '<div class="product-master-stat"><strong>' + categories.length.toLocaleString('pt-BR') + '</strong><span>Categorias cadastradas</span></div></div>' +
      '<p class="product-master-note">As categorias começam fechadas. Clique em + para ver e alterar os SKUs vinculados.</p>' +
      '<div class="product-master-table-wrap"><table class="product-master-table product-category-tree"><thead><tr><th>Categoria oficial / SKU</th><th>Descrição</th><th>Categoria atual</th></tr></thead><tbody>' +
      (categories.length ? categories.map(function (category) {
        var linked = Object.values(master.skus || {}).filter(function (sku) { return sku.categoryId === category.id; })
          .sort(function (a, b) { return a.sku.localeCompare(b.sku, 'pt-BR'); });
        return '<tr class="product-category-row" data-category-row="' + escapeValue(category.id) + '"><td><button class="product-category-expand" type="button" aria-expanded="false">+</button><strong>' +
          escapeValue(category.name) + '</strong></td><td>' + linked.length.toLocaleString('pt-BR') + ' SKUs</td><td>' +
          new Date(category.createdAt).toLocaleDateString('pt-BR') + '</td></tr>' + linked.map(function (item) {
            return '<tr class="product-category-sku-row" data-category-parent="' + escapeValue(category.id) + '" hidden><td>' +
              escapeValue(item.sku) + '</td><td>' + escapeValue(item.description || '—') + '</td><td><select class="category-tree-select sku-category-select" data-sku="' +
              escapeValue(item.sku) + '">' + categoryOptions(item.categoryId) + '</select></td></tr>';
          }).join('');
      }).join('') : '<tr><td colspan="3">Nenhuma categoria cadastrada.</td></tr>') + '</tbody></table></div></section></div>';

    categoriesContainer.querySelectorAll('.product-category-expand').forEach(function (button) {
      button.addEventListener('click', function () {
        var categoryId = button.closest('[data-category-row]').dataset.categoryRow;
        var opening = button.getAttribute('aria-expanded') !== 'true';
        button.setAttribute('aria-expanded', String(opening));
        button.textContent = opening ? '−' : '+';
        categoriesContainer.querySelectorAll('[data-category-parent="' + categoryId + '"]').forEach(function (row) { row.hidden = !opening; });
      });
    });
    categoriesContainer.querySelectorAll('.category-tree-select').forEach(function (select) {
      select.addEventListener('change', async function () {
        var status = document.getElementById('categoryStatus');
        status.textContent = 'Salvando ' + this.dataset.sku + '...';
        try {
          await updateMaster({ action: 'assign-sku', sku: this.dataset.sku, categoryId: this.value });
          renderCategories();
          document.getElementById('categoryStatus').className = 'product-master-status success';
          document.getElementById('categoryStatus').textContent = 'Categoria do SKU alterada.';
        } catch (error) {
          status.className = 'product-master-status error';
          status.textContent = error.message;
        }
      });
    });

    document.getElementById('categoryForm').addEventListener('submit', async function (event) {
      event.preventDefault();
      var status = document.getElementById('categoryStatus');
      status.className = 'product-master-status';
      status.textContent = 'Salvando...';
      try {
        await updateMaster({ action: 'add-category', name: document.getElementById('newProductCategory').value });
        renderCategories();
        document.getElementById('categoryStatus').className = 'product-master-status success';
        document.getElementById('categoryStatus').textContent = 'Categoria cadastrada.';
      } catch (error) {
        status.className = 'product-master-status error';
        status.textContent = error.message;
      }
    });

    document.getElementById('applyCategoriesToBase').addEventListener('click', async function () {
      var button = this;
      var status = document.getElementById('categoryStatus');
      button.disabled = true;
      status.className = 'product-master-status';
      status.textContent = 'Atualizando Categoria2 no Actual e no Forecast...';
      try {
        var response = await fetch('/api/product-master/apply', { method: 'POST' });
        var result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Não foi possível atualizar a Base de Dados.');
        status.className = 'product-master-status success';
        status.textContent = result.updatedRows.toLocaleString('pt-BR') + ' linhas atualizadas em ' +
          result.files.toLocaleString('pt-BR') + ' arquivos. Recarregando relatórios...';
        window.setTimeout(function () { window.location.reload(); }, 900);
      } catch (error) {
        status.className = 'product-master-status error';
        status.textContent = error.message;
        button.disabled = false;
      }
    });
  }

  function getVisibleSkus() {
    return Object.values(master.skus || {}).filter(function (item) {
      var searchable = [item.sku, item.description].join(' ').toLowerCase();
      var words = searchText.split(/\s+/).filter(Boolean);
      var matches = !words.length || words.every(function (word) { return searchable.includes(word); });
      return matches && (!pendingOnly || !item.categoryId);
    }).sort(function (a, b) {
      return Number(Boolean(a.categoryId)) - Number(Boolean(b.categoryId)) || a.sku.localeCompare(b.sku, 'pt-BR');
    });
  }

  function categoryOptions(selected) {
    return '<option value="">Selecione...</option>' + (master.categories || []).map(function (category) {
      return '<option value="' + escapeValue(category.id) + '"' + (category.id === selected ? ' selected' : '') + '>' +
        escapeValue(category.name) + '</option>';
    }).join('');
  }

  function renderSkus() {
    var all = Object.values(master.skus || {});
    var visible = getVisibleSkus();
    var pending = all.filter(function (item) { return !item.categoryId; }).length;
    skuContainer.innerHTML = '<div class="product-master-page"><section class="product-master-toolbar"><div class="product-master-title">' +
      '<strong>Cadastro de SKU</strong><span>SKUs antigos permanecem cadastrados. Novos SKUs entram como pendentes até receberem uma categoria oficial.</span></div>' +
      '<div class="product-master-form"><div class="product-master-field"><label for="skuSearch">Buscar SKU ou produto</label>' +
      '<input id="skuSearch" value="' + escapeValue(searchText) + '" placeholder="Digite para filtrar"></div>' +
      '<div class="product-master-field"><label for="skuPendingFilter">Situação</label><select id="skuPendingFilter"><option value="">Todos</option>' +
      '<option value="pending"' + (pendingOnly ? ' selected' : '') + '>Somente pendentes</option></select></div>' +
      '<div class="product-master-field"><label for="skuBulkCategory">Categoria para os filtrados</label><select id="skuBulkCategory">' +
      categoryOptions(bulkCategoryId) + '</select></div><button class="product-master-button" id="assignFilteredSkus" type="button"' +
      (!visible.length ? ' disabled' : '') + '>Enviar ' + visible.length.toLocaleString('pt-BR') + ' para categoria</button>' +
      '<button class="product-master-button danger" id="deleteSelectedSkus" type="button"' +
      (!selectedSkus.size ? ' disabled' : '') + '>Excluir selecionados (' + selectedSkus.size.toLocaleString('pt-BR') + ')</button>' +
      '<div class="product-master-file-actions"><button class="product-master-button secondary" id="exportSkuCategories" type="button">Baixar Excel</button>' +
      '<label class="product-master-file-button">Selecionar Excel<input id="importSkuCategoriesFile" type="file" accept=".xlsx,.xls"></label>' +
      '<button class="product-master-button" id="importSkuCategories" type="button" disabled>Importar categorias</button></div></div></section>' +
      '<div class="product-master-status" id="skuStatus"></div>' +
      '<section class="product-master-card"><div class="product-master-stats"><div class="product-master-stat"><strong>' +
      all.length.toLocaleString('pt-BR') + '</strong><span>SKUs cadastrados</span></div><div class="product-master-stat"><strong>' +
      pending.toLocaleString('pt-BR') + '</strong><span>Pendentes de categoria</span></div><div class="product-master-stat"><strong>' +
      (all.length - pending).toLocaleString('pt-BR') + '</strong><span>Categorizados</span></div></div>' +
      '<p class="product-master-note">Exibindo ' + visible.length.toLocaleString('pt-BR') + ' SKUs.</p>' +
      '<div class="product-master-table-wrap"><table class="product-master-table"><thead><tr><th class="product-master-check"><input id="selectAllVisibleSkus" type="checkbox" aria-label="Selecionar todos os SKUs exibidos"></th><th>SKU</th><th>Descrição</th><th>Marketplace</th><th>Categoria oficial</th><th>Status</th></tr></thead><tbody>' +
      visible.map(function (item) {
        return '<tr><td class="product-master-check"><input class="sku-row-check" type="checkbox" data-sku="' + escapeValue(item.sku) + '"' + (selectedSkus.has(item.sku) ? ' checked' : '') + ' aria-label="Selecionar SKU ' + escapeValue(item.sku) + '"></td><td>' + escapeValue(item.sku) + '</td><td>' + escapeValue(item.description || '—') + '</td><td>' +
          escapeValue(item.marketplace || '—') + '</td><td><select class="sku-category-select" data-sku="' + escapeValue(item.sku) + '">' +
          categoryOptions(item.categoryId) + '</select></td><td class="' + (item.categoryId ? 'sku-saved' : 'sku-pending') + '">' +
          (item.categoryId ? 'Categorizado' : 'Pendente') + '</td></tr>';
      }).join('') + '</tbody></table></div></section></div>';

    document.getElementById('skuSearch').addEventListener('input', function () {
      searchText = this.value.trim().toLowerCase();
      renderSkus();
      var input = document.getElementById('skuSearch');
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    });
    document.getElementById('skuPendingFilter').addEventListener('change', function () {
      pendingOnly = this.value === 'pending';
      renderSkus();
    });
    document.getElementById('skuBulkCategory').addEventListener('change', function () {
      bulkCategoryId = this.value;
    });
    var selectAll = document.getElementById('selectAllVisibleSkus');
    selectAll.checked = visible.length > 0 && visible.every(function (item) { return selectedSkus.has(item.sku); });
    selectAll.addEventListener('change', function () {
      visible.forEach(function (item) { if (selectAll.checked) selectedSkus.add(item.sku); else selectedSkus.delete(item.sku); });
      renderSkus();
    });
    skuContainer.querySelectorAll('.sku-row-check').forEach(function (checkbox) {
      checkbox.addEventListener('change', function () {
        if (this.checked) selectedSkus.add(this.dataset.sku); else selectedSkus.delete(this.dataset.sku);
        renderSkus();
      });
    });
    document.getElementById('deleteSelectedSkus').addEventListener('click', async function () {
      var selected = Array.from(selectedSkus), status = document.getElementById('skuStatus'), button = this;
      if (!selected.length || !window.confirm('Excluir ' + selected.length.toLocaleString('pt-BR') + ' SKU(s) selecionado(s)? Eles não voltarão automaticamente ao recarregar a base.')) return;
      try {
        button.disabled = true; status.className = 'product-master-status'; status.textContent = 'Excluindo SKUs selecionados...';
        await updateMaster({ action: 'delete-skus', skus: selected });
        selectedSkus.clear(); renderSkus();
        document.getElementById('skuStatus').className = 'product-master-status success';
        document.getElementById('skuStatus').textContent = selected.length.toLocaleString('pt-BR') + ' SKU(s) excluído(s) do cadastro.';
      } catch (error) {
        status.className = 'product-master-status error'; status.textContent = error.message; button.disabled = false;
      }
    });
    document.getElementById('assignFilteredSkus').addEventListener('click', async function () {
      var button = this;
      var status = document.getElementById('skuStatus');
      var selected = getVisibleSkus();
      if (!bulkCategoryId) {
        status.className = 'product-master-status error';
        status.textContent = 'Selecione a categoria de destino.';
        return;
      }
      if (!selected.length) return;
      var category = (master.categories || []).find(function (item) { return item.id === bulkCategoryId; });
      if (!window.confirm('Enviar ' + selected.length.toLocaleString('pt-BR') + ' SKU(s) filtrados para "' +
        (category ? category.name : 'categoria selecionada') + '"?')) return;
      button.disabled = true;
      status.className = 'product-master-status';
      status.textContent = 'Categorizando os SKUs filtrados...';
      try {
        await updateMaster({
          action: 'assign-skus',
          categoryId: bulkCategoryId,
          skus: selected.map(function (item) { return item.sku; })
        });
        renderSkus();
        document.getElementById('skuStatus').className = 'product-master-status success';
        document.getElementById('skuStatus').textContent = selected.length.toLocaleString('pt-BR') +
          ' SKU(s) enviados para a categoria. Use o botão da página Categorias para atualizar a Base de Dados.';
      } catch (error) {
        status.className = 'product-master-status error';
        status.textContent = error.message;
        button.disabled = false;
      }
    });
    document.getElementById('exportSkuCategories').addEventListener('click', function () {
      var status = document.getElementById('skuStatus');
      try { exportSkuCategories(); status.className = 'product-master-status success'; status.textContent = 'Excel gerado com todos os SKUs e as categorias disponíveis.'; }
      catch (error) { status.className = 'product-master-status error'; status.textContent = error.message; }
    });
    document.getElementById('importSkuCategoriesFile').addEventListener('change', async function () {
      var status = document.getElementById('skuStatus'), importButton = document.getElementById('importSkuCategories');
      categoryImportRows = null; importButton.disabled = true;
      try {
        if (!this.files[0]) return;
        categoryImportRows = await readSkuCategoryWorkbook(this.files[0]);
        importButton.disabled = false; status.className = 'product-master-status success';
        status.textContent = categoryImportRows.length.toLocaleString('pt-BR') + ' SKU(s) categorizados prontos para importar.';
      } catch (error) { status.className = 'product-master-status error'; status.textContent = error.message; }
    });
    document.getElementById('importSkuCategories').addEventListener('click', async function () {
      var button = this, status = document.getElementById('skuStatus');
      if (!categoryImportRows || !categoryImportRows.length) return;
      if (!window.confirm('Importar as categorias preenchidas para ' + categoryImportRows.length.toLocaleString('pt-BR') + ' SKU(s)?')) return;
      try {
        button.disabled = true; status.className = 'product-master-status'; status.textContent = 'Validando e importando categorias...';
        var importedCount = categoryImportRows.length;
        await updateMaster({ action: 'import-categories', rows: categoryImportRows });
        categoryImportRows = null; renderSkus();
        document.getElementById('skuStatus').className = 'product-master-status success';
        document.getElementById('skuStatus').textContent = importedCount.toLocaleString('pt-BR') + ' SKU(s) conferidos e categorizados. Atualize as categorias na Base de Dados quando desejar publicar a mudança.';
      } catch (error) { status.className = 'product-master-status error'; status.textContent = error.message; button.disabled = false; }
    });
    skuContainer.querySelectorAll('.sku-category-select').forEach(function (select) {
      select.addEventListener('change', async function () {
        var status = document.getElementById('skuStatus');
        status.textContent = 'Salvando ' + this.dataset.sku + '...';
        try {
          await updateMaster({ action: 'assign-sku', sku: this.dataset.sku, categoryId: this.value });
          renderSkus();
          document.getElementById('skuStatus').className = 'product-master-status success';
          document.getElementById('skuStatus').textContent = 'Categoria do SKU salva.';
        } catch (error) {
          status.className = 'product-master-status error';
          status.textContent = error.message;
        }
      });
    });
  }

  async function openPanel(panelId) {
    try {
      await loadMaster(true);
      if (panelId === 'productCategoriesPanel') renderCategories();
      if (panelId === 'skuCatalogPanel') renderSkus();
    } catch (error) {
      var container = panelId === 'productCategoriesPanel' ? categoriesContainer : skuContainer;
      container.innerHTML = '<div class="empty-table">' + escapeValue(error.message) + '</div>';
    }
  }

  document.querySelectorAll('[data-tab="productCategoriesPanel"],[data-tab="skuCatalogPanel"]').forEach(function (button) {
    button.addEventListener('click', function () { openPanel(button.dataset.tab); });
  });
}());
