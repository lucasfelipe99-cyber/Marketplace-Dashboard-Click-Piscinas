(function () {
  'use strict';
  var button = document.getElementById('exportFullDatabase');
  var status = document.getElementById('exportFullDatabaseStatus');
  if (!button || !status) return;
  var busy = false;
  async function readMonth(metadata) {
    // Prefer the same stored rows used by the system, keeping original cell types.
    if (metadata.rowsUrl) {
      var response = await fetch(metadata.rowsUrl + '?v=' + encodeURIComponent(metadata.rowsUpdatedAt || metadata.updatedAt || ''), { cache: 'no-store' });
      if (!response.ok) throw new Error('Não foi possível ler os dados do mês ' + metadata.month + '.');
      var payload = await response.json();
      if (!Array.isArray(payload.rows)) throw new Error('Base inválida no mês ' + metadata.month + '.');
      return payload.rows;
    }
    var source = await fetch(metadata.url + '?v=' + encodeURIComponent(metadata.updatedAt || ''), { cache: 'no-store' });
    if (!source.ok) throw new Error('Não foi possível ler o arquivo do mês ' + metadata.month + '.');
    if (/\.csv$/i.test(metadata.fileName || '')) return window.parseCsv(await source.text());
    var original = XLSX.read(await source.arrayBuffer(), { type: 'array', cellDates: false });
    if (!original.SheetNames.length) throw new Error('Arquivo sem dados no mês ' + metadata.month + '.');
    return XLSX.utils.sheet_to_json(original.Sheets[original.SheetNames[0]], { header: 1, raw: true, defval: '', blankrows: true });
  }
  button.addEventListener('click', async function () {
    if (busy) return;
    busy = true;
    button.disabled = true;
    status.textContent = 'Consultando todos os meses publicados...';
    try {
      if (!window.XLSX) throw new Error('A biblioteca Excel não carregou. Atualize a página e tente novamente.');
      var response = await fetch('/api/latest-base', { cache: 'no-store' });
      if (!response.ok) throw new Error('Não foi possível consultar os meses publicados.');
      var metadata = await response.json();
      var months = Object.keys(metadata.months || {}).filter(function (key) { return metadata.months[key].exists; }).sort(function (a, b) { return Number(a) - Number(b); });
      if (!months.length) throw new Error('Nenhuma base publicada para exportar.');
      var workbook = XLSX.utils.book_new(), total = 0;
      for (var i = 0; i < months.length; i++) {
        var key = months[i];
        status.textContent = 'Lendo mês ' + key + ' (' + (i + 1) + '/' + months.length + ')...';
        var rows = await readMonth(metadata.months[key]);
        if (!rows.length || !rows.every(Array.isArray)) throw new Error('Base vazia ou inválida no mês ' + key + '. Nenhum arquivo foi exportado.');
        if (rows.some(function (row) { return row.length > 16384 || row.some(function (value) { return typeof value === 'string' && value.length > 32767; }); })) throw new Error('O mês ' + key + ' excede os limites de células do Excel. Nenhum arquivo foi exportado.');
        // Split oversized months instead of silently truncating at Excel's row limit.
        var count = Math.max(1, Math.ceil((rows.length - 1) / 1048575));
        for (var part = 0; part < count; part++) {
          var chunk = [rows[0]].concat(rows.slice(1 + part * 1048575, 1 + (part + 1) * 1048575));
          var sheet = XLSX.utils.aoa_to_sheet(chunk);
          XLSX.utils.book_append_sheet(workbook, sheet, 'Mes ' + String(key).padStart(2, '0') + (count > 1 ? ' - ' + (part + 1) : ''));
        }
        total += rows.length - 1;
      }
      XLSX.writeFile(workbook, 'Base_completa_todos_os_meses.xlsx', { bookType: 'xlsx', compression: true });
      status.textContent = 'Excel gerado: ' + months.length + ' meses e ' + total.toLocaleString('pt-BR') + ' linhas. Valores originais preservados.';
    } catch (error) {
      status.textContent = 'Exportação não concluída: ' + error.message;
    } finally {
      busy = false;
      button.disabled = false;
    }
  });
})();
