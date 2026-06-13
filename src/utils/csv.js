export function csvEscape(value) {
  const text = value === null || value === undefined ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

export function downloadCSV(filename, rows) {
  const csv = rows.map(row => row.map(csvEscape).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function parseCSV(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"' && quoted && next === '"') {
      cell += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      row.push(cell);
      cell = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') i += 1;
      row.push(cell);
      if (row.some(value => value.trim() !== '')) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }

  row.push(cell);
  if (row.some(value => value.trim() !== '')) rows.push(row);
  return rows;
}

export function rowsToObjects(rows) {
  if (!rows.length) return [];
  const headers = rows[0].map(header => header.trim().toLowerCase());
  return rows.slice(1).map(row => headers.reduce((item, header, index) => {
    item[header] = row[index]?.trim() || '';
    return item;
  }, {}));
}

export function readCSVFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(rowsToObjects(parseCSV(String(reader.result || ''))));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

export function normalizeValue(value) {
  return String(value || '').trim().toLowerCase();
}
