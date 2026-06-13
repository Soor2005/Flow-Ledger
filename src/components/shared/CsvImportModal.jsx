import React, { useRef, useState } from 'react';
import { AlertCircle, Check, Download, Upload, X } from 'lucide-react';
import { downloadCSV, readCSVFile } from '../../utils/csv';

export default function CsvImportModal({ title, description, columns, sampleRows, onClose, onImport }) {
  const inputRef = useRef(null);
  const [fileName, setFileName] = useState('');
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const templateRows = [columns.map(col => col.key), ...sampleRows];

  const handleFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setError('');
    setResult(null);
    setImporting(true);
    try {
      const rows = await readCSVFile(file);
      const imported = await onImport(rows);
      setResult({ imported, total: rows.length });
    } catch (err) {
      setError(err?.message || 'Could not import the CSV file.');
    } finally {
      setImporting(false);
      event.target.value = '';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="w-[620px] max-w-[calc(100vw-32px)] bg-bg-card border border-brd-strong rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-5 border-b border-brd-default">
          <div>
            <h3 className="text-sm font-bold text-white">{title}</h3>
            <p className="text-xs text-tx-faint mt-0.5">{description}</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg text-tx-faint hover:text-white hover:bg-brd-default transition-all">
            <X size={14} />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div className="grid grid-cols-2 gap-3">
            {columns.map(col => (
              <div key={col.key} className="rounded-lg border border-brd-default bg-bg-app px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-white">{col.key}</span>
                  {col.required && <span className="text-[9px] uppercase tracking-wider text-red-300">Required</span>}
                </div>
                <p className="text-[10px] text-tx-faint mt-1">{col.hint}</p>
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-brd-default bg-bg-app overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b border-brd-default">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-tx-faint">CSV structure</span>
              <button onClick={() => downloadCSV(`${title.toLowerCase().replace(/\s+/g, '-')}-template.csv`, templateRows)}
                className="flex items-center gap-1.5 text-[11px] text-tx-secondary hover:text-white transition-colors">
                <Download size={11} />Template
              </button>
            </div>
            <pre className="p-3 text-[11px] text-tx-secondary overflow-x-auto">{templateRows.map(r => r.join(',')).join('\n')}</pre>
          </div>

          <input ref={inputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleFile} />
          <button onClick={() => inputRef.current?.click()} disabled={importing}
            className="w-full flex items-center justify-center gap-2 bg-accent hover:bg-accent-light disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-semibold px-4 py-3 rounded-xl transition-all">
            <Upload size={14} />
            {importing ? 'Importing...' : fileName ? `Import ${fileName}` : 'Choose CSV File'}
          </button>

          {result && (
            <div className="flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/10 px-3 py-2 text-xs text-green-300">
              <Check size={13} />Imported {result.imported} of {result.total} rows.
            </div>
          )}
          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
              <AlertCircle size={13} />{error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
