import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Plus, X, FileDown, Trash2, Receipt, CheckCircle2, Send, ChevronDown,
} from 'lucide-react';
import { fmtMoney } from '../../utils/currency';
import { exportInvoicePDF } from '../../utils/invoiceBuilder';

const api = window.electron || {};

const STATUS_META = {
  draft: { label: 'Draft', color: '#94a3b8', bg: 'rgba(148,163,184,0.12)' },
  sent:  { label: 'Sent',  color: '#5BA7FF', bg: 'rgba(91,167,255,0.12)' },
  paid:  { label: 'Paid',  color: '#34D399', bg: 'rgba(52,211,153,0.12)' },
};

function StatusBadge({ status }) {
  const meta = STATUS_META[status] || STATUS_META.draft;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold"
      style={{ color: meta.color, background: meta.bg }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: meta.color }} />
      {meta.label}
    </span>
  );
}

function fmtDate(ts) {
  if (!ts) return '—';
  return new Date(ts * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ─── New Invoice Modal ─────────────────────────────────────────────────────────
function GenerateInvoiceModal({ clients, onClose, onGenerate }) {
  const now = Math.floor(Date.now() / 1000);
  const [clientId, setClientId] = useState(clients[0]?.id || '');
  const [from, setFrom] = useState(new Date(new Date().setDate(1)).toISOString().slice(0, 10));
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [taxRate, setTaxRate] = useState('0');
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const toUnix = (dateStr) => dateStr ? Math.floor(new Date(dateStr).getTime() / 1000) : null;

  const submit = async () => {
    if (!clientId) return;
    setBusy(true);
    setError('');
    try {
      await onGenerate({
        clientId,
        from: toUnix(from),
        to: toUnix(to) + 86399, // include the full "to" day
        taxRate: parseFloat(taxRate) || 0,
        dueDate: toUnix(dueDate),
        notes: notes.trim() || null,
      });
    } catch (err) {
      console.error('[GenerateInvoiceModal] generate failed:', err);
      setError(err.message || 'Something went wrong generating the invoice.');
    }
    setBusy(false);
  };

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-md rounded-2xl border border-brd-default bg-bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-brd-subtle px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/15 text-accent"><Receipt size={14} /></div>
            <h3 className="text-sm font-bold text-tx-primary">Generate Invoice</h3>
          </div>
          <button onClick={onClose} className="text-tx-faint hover:text-tx-primary"><X size={16} /></button>
        </div>

        <div className="flex flex-col gap-3.5 px-5 py-4">
          <div>
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-tx-faint">Client</p>
            <select value={clientId} onChange={e => setClientId(e.target.value)}
              className="w-full rounded-lg border border-brd-default bg-bg-input px-3 py-2 text-sm text-tx-primary outline-none focus:border-accent">
              {clients.length === 0 && <option value="">No clients yet</option>}
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-tx-faint">Period From</p>
              <input type="date" value={from} onChange={e => setFrom(e.target.value)}
                className="w-full rounded-lg border border-brd-default bg-bg-input px-3 py-2 text-sm text-tx-primary outline-none focus:border-accent" />
            </div>
            <div>
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-tx-faint">Period To</p>
              <input type="date" value={to} onChange={e => setTo(e.target.value)}
                className="w-full rounded-lg border border-brd-default bg-bg-input px-3 py-2 text-sm text-tx-primary outline-none focus:border-accent" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-tx-faint">Tax Rate (%)</p>
              <input type="number" min="0" step="0.1" value={taxRate} onChange={e => setTaxRate(e.target.value)}
                className="w-full rounded-lg border border-brd-default bg-bg-input px-3 py-2 text-sm text-tx-primary outline-none focus:border-accent" />
            </div>
            <div>
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-tx-faint">Due Date</p>
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
                className="w-full rounded-lg border border-brd-default bg-bg-input px-3 py-2 text-sm text-tx-primary outline-none focus:border-accent" />
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-tx-faint">Notes (optional)</p>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Payment terms, bank details, thank-you note…"
              className="w-full resize-none rounded-lg border border-brd-default bg-bg-input px-3 py-2 text-sm text-tx-primary outline-none focus:border-accent" />
          </div>

          <p className="text-[10.5px] leading-relaxed text-tx-faint">
            Billable tracked time for this client in the selected period will be grouped by project and totaled
            using each project's rate (or the client's hourly rate if a project has none).
          </p>
        </div>

        {error && (
          <div className="mx-5 mb-3 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-[11px] text-red-300">
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 border-t border-brd-subtle px-5 py-3.5">
          <button onClick={onClose} className="rounded-lg px-3.5 py-2 text-xs font-semibold text-tx-faint hover:text-tx-primary">Cancel</button>
          <button onClick={submit} disabled={busy || !clientId}
            className="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-white transition-all hover:bg-accent-light disabled:opacity-50">
            {busy ? 'Generating…' : 'Generate Invoice'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Invoice Detail Modal ──────────────────────────────────────────────────────
function InvoiceDetailModal({ invoice, accountName, onClose, onStatusChange, onDelete }) {
  const [exporting, setExporting] = useState(false);
  const lineItems = useMemo(() => {
    try { return JSON.parse(invoice.line_items_json || '[]'); } catch { return []; }
  }, [invoice.line_items_json]);

  const client = { name: invoice.client_name, company: invoice.client_company, email: invoice.client_email, color: invoice.client_color };
  const currency = invoice.currency || 'USD';

  const handleExport = async () => {
    setExporting(true);
    try {
      await exportInvoicePDF(invoice, client, accountName);
    } catch (err) {
      console.error('[InvoiceDetailModal] PDF export failed:', err);
    }
    setExporting(false);
  };

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="flex max-h-full w-full max-w-lg flex-col rounded-2xl border border-brd-default bg-bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-brd-subtle px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/15 text-accent"><Receipt size={14} /></div>
            <div>
              <h3 className="text-sm font-bold text-tx-primary">{invoice.invoice_number}</h3>
              <p className="text-[11px] text-tx-faint">{invoice.client_name}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-tx-faint hover:text-tx-primary"><X size={16} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="mb-4 flex items-center justify-between">
            <StatusBadge status={invoice.status} />
            <p className="text-[11px] text-tx-faint">Issued {fmtDate(invoice.issue_date)} · Due {invoice.due_date ? fmtDate(invoice.due_date) : '—'}</p>
          </div>

          <div className="overflow-hidden rounded-xl border border-brd-subtle">
            <table className="w-full text-xs">
              <thead className="bg-bg-input">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold text-tx-faint">Description</th>
                  <th className="px-3 py-2 text-right font-semibold text-tx-faint">Hours</th>
                  <th className="px-3 py-2 text-right font-semibold text-tx-faint">Rate</th>
                  <th className="px-3 py-2 text-right font-semibold text-tx-faint">Amount</th>
                </tr>
              </thead>
              <tbody>
                {lineItems.length === 0 ? (
                  <tr><td colSpan={4} className="px-3 py-6 text-center text-tx-faint">No billable items in this period</td></tr>
                ) : lineItems.map((li, i) => (
                  <tr key={i} className="border-t border-brd-subtle">
                    <td className="px-3 py-2 text-tx-primary">{li.description}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-tx-secondary">{li.hours.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-tx-secondary">{fmtMoney(li.rate, currency)}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold text-tx-primary">{fmtMoney(li.amount, currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="ml-auto mt-3 flex w-48 flex-col gap-1 text-xs">
            <div className="flex justify-between text-tx-secondary"><span>Subtotal</span><span>{fmtMoney(invoice.subtotal, currency)}</span></div>
            {invoice.tax_rate > 0 && (
              <div className="flex justify-between text-tx-secondary"><span>Tax ({invoice.tax_rate}%)</span><span>{fmtMoney(invoice.tax_amount, currency)}</span></div>
            )}
            <div className="flex justify-between border-t border-brd-subtle pt-1.5 text-sm font-bold text-tx-primary"><span>Total</span><span>{fmtMoney(invoice.total, currency)}</span></div>
          </div>

          {invoice.notes && (
            <div className="mt-4 rounded-lg bg-bg-input px-3 py-2.5 text-[11px] text-tx-secondary">{invoice.notes}</div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-brd-subtle px-5 py-3.5">
          <div className="flex gap-1.5">
            {invoice.status !== 'sent' && invoice.status !== 'paid' && (
              <button onClick={() => onStatusChange(invoice.id, 'sent')}
                className="flex items-center gap-1 rounded-lg border border-brd-default px-2.5 py-1.5 text-[11px] font-semibold text-tx-secondary hover:text-tx-primary">
                <Send size={11} />Mark Sent
              </button>
            )}
            {invoice.status !== 'paid' && (
              <button onClick={() => onStatusChange(invoice.id, 'paid')}
                className="flex items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-400 hover:bg-emerald-500/18">
                <CheckCircle2 size={11} />Mark Paid
              </button>
            )}
            <button onClick={() => onDelete(invoice.id)}
              className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-red-400/80 hover:text-red-400">
              <Trash2 size={11} />Delete
            </button>
          </div>
          <button onClick={handleExport} disabled={exporting}
            className="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-white hover:bg-accent-light disabled:opacity-50">
            <FileDown size={13} />{exporting ? 'Exporting…' : 'Export PDF'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────────
export default function InvoicesPage({ user, accountName }) {
  const [invoices, setInvoices] = useState([]);
  const [clients, setClients]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [showGenerate, setShowGenerate] = useState(false);
  const [selected, setSelected] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');

  const load = useCallback(async () => {
    setLoading(true);
    const [invList, clientList] = await Promise.all([
      api.listInvoices?.({ userId: user.id }),
      api.listClients?.({ userId: user.id }),
    ]);
    setInvoices(invList || []);
    setClients(clientList || []);
    setLoading(false);
  }, [user.id]);

  useEffect(() => { load(); }, [load]);

  const handleGenerate = async (params) => {
    if (typeof api.generateInvoice !== 'function') {
      throw new Error('Invoicing isn\'t available yet — rebuild/restart the app to pick up this feature.');
    }
    const invoice = await api.generateInvoice({ userId: user.id, ...params });
    if (!invoice || invoice.success === false) {
      throw new Error(invoice?.error || 'Failed to generate invoice.');
    }
    setShowGenerate(false);
    await load();
    if (invoice.id) {
      const full = await api.getInvoice?.({ invoiceId: invoice.id });
      if (full) setSelected(full);
    }
  };

  const handleStatusChange = async (invoiceId, status) => {
    await api.updateInvoice?.({ invoiceId, status });
    const full = await api.getInvoice?.({ invoiceId });
    setSelected(full || null);
    load();
  };

  const handleDelete = async (invoiceId) => {
    if (!window.confirm('Delete this invoice? This cannot be undone.')) return;
    await api.deleteInvoice?.({ invoiceId });
    setSelected(null);
    load();
  };

  const openDetail = async (invoice) => {
    const full = await api.getInvoice?.({ invoiceId: invoice.id });
    setSelected(full || invoice);
  };

  const filtered = statusFilter === 'all' ? invoices : invoices.filter(i => i.status === statusFilter);

  const totalsByStatus = useMemo(() => {
    const t = { draft: 0, sent: 0, paid: 0 };
    for (const inv of invoices) t[inv.status] = (t[inv.status] || 0) + 1;
    return t;
  }, [invoices]);

  return (
    <div className="fl-page fl-report-page">
      <div className="fl-work-surface flex flex-col">

        <div className="fl-page-toolbar">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/15 text-accent">
              <Receipt size={15} />
            </div>
            <div>
              <h1 className="text-sm font-bold text-white">Invoices</h1>
              <p className="text-[11px] text-tx-faint">{invoices.length} invoices · {totalsByStatus.draft || 0} draft · {totalsByStatus.sent || 0} sent · {totalsByStatus.paid || 0} paid</p>
            </div>
          </div>

          <div className="relative">
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
              className="rounded-lg border border-brd-default bg-bg-input pl-3 pr-7 py-2 text-xs text-tx-secondary focus:outline-none focus:border-accent appearance-none cursor-pointer">
              <option value="all">All Status</option>
              <option value="draft">Draft</option>
              <option value="sent">Sent</option>
              <option value="paid">Paid</option>
            </select>
            <ChevronDown size={10} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-tx-faint pointer-events-none" />
          </div>

          <div className="flex-1" />

          <button onClick={() => setShowGenerate(true)}
            className="flex items-center gap-1.5 bg-accent hover:bg-accent-light text-white text-xs font-semibold px-3.5 py-2 rounded-lg transition-all">
            <Plus size={12} />New Invoice
          </button>
        </div>

        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center h-40 text-tx-faint text-sm">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/10 text-accent"><Receipt size={20} /></div>
              <div>
                <p className="text-sm font-semibold text-tx-primary">No invoices yet</p>
                <p className="mt-1 text-xs text-tx-faint">Generate one from a client's tracked billable time.</p>
              </div>
              {clients.length === 0 ? (
                <p className="text-xs text-tx-faint">Add a client first to generate an invoice.</p>
              ) : (
                <button onClick={() => setShowGenerate(true)}
                  className="mt-1 flex items-center gap-1.5 bg-accent hover:bg-accent-light text-white text-xs font-semibold px-3.5 py-2 rounded-lg">
                  <Plus size={12} />New Invoice
                </button>
              )}
            </div>
          ) : (
            <table className="w-full border-collapse">
              <thead className="sticky top-0 z-10">
                <tr className="fl-table-head">
                  <th className="px-4 py-3.5 border-b-2 border-brd-strong/60 text-left text-[10px] font-semibold uppercase tracking-wider text-tx-muted">Invoice</th>
                  <th className="px-4 py-3.5 border-b-2 border-brd-strong/60 text-left text-[10px] font-semibold uppercase tracking-wider text-tx-muted">Client</th>
                  <th className="px-4 py-3.5 border-b-2 border-brd-strong/60 text-left text-[10px] font-semibold uppercase tracking-wider text-tx-muted">Period</th>
                  <th className="px-4 py-3.5 border-b-2 border-brd-strong/60 text-left text-[10px] font-semibold uppercase tracking-wider text-tx-muted">Due</th>
                  <th className="px-4 py-3.5 border-b-2 border-brd-strong/60 text-right text-[10px] font-semibold uppercase tracking-wider text-tx-muted">Total</th>
                  <th className="px-4 py-3.5 border-b-2 border-brd-strong/60 text-left text-[10px] font-semibold uppercase tracking-wider text-tx-muted">Status</th>
                  <th className="px-4 py-3.5 border-b-2 border-brd-strong/60 w-10" />
                </tr>
              </thead>
              <tbody>
                {filtered.map(inv => (
                  <tr key={inv.id} onClick={() => openDetail(inv)}
                    className="cursor-pointer border-b border-brd-subtle hover:bg-bg-hover transition-colors">
                    <td className="px-4 py-3.5 text-sm font-semibold text-tx-primary tabular-nums">{inv.invoice_number}</td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full" style={{ background: inv.client_color || '#6366f1' }} />
                        <span className="text-xs text-tx-secondary">{inv.client_name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-[11px] text-tx-faint">{fmtDate(inv.period_from)} – {fmtDate(inv.period_to)}</td>
                    <td className="px-4 py-3.5 text-[11px] text-tx-faint">{inv.due_date ? fmtDate(inv.due_date) : '—'}</td>
                    <td className="px-4 py-3.5 text-right text-xs font-semibold tabular-nums text-tx-primary">{fmtMoney(inv.total, inv.currency)}</td>
                    <td className="px-4 py-3.5"><StatusBadge status={inv.status} /></td>
                    <td className="px-4 py-3.5">
                      <button onClick={(e) => { e.stopPropagation(); handleDelete(inv.id); }}
                        className="text-tx-faint hover:text-red-400"><Trash2 size={12} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {showGenerate && (
        <GenerateInvoiceModal clients={clients} onClose={() => setShowGenerate(false)} onGenerate={handleGenerate} />
      )}
      {selected && (
        <InvoiceDetailModal invoice={selected} accountName={accountName} onClose={() => setSelected(null)}
          onStatusChange={handleStatusChange} onDelete={handleDelete} />
      )}
    </div>
  );
}
