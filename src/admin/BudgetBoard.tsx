import { useEffect, useId, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Icon } from '../components/Icon';
import { formatAmountFixed, formatAmountTyping, parseAmount } from '../lib/money';
import type { BudgetCurrency, BudgetItem, PartyBudget, WeddingApi } from '../lib/models';

const CURRENCIES: { code: BudgetCurrency; label: string }[] = [
  { code: 'UYU', label: 'Pesos uruguayos' },
  { code: 'ARS', label: 'Pesos argentinos' },
  { code: 'BRL', label: 'Reales' },
  { code: 'USD', label: 'Dólares estadounidenses' },
  { code: 'EUR', label: 'Euros' },
];

function formatMoney(amount: number, currency: BudgetCurrency) {
  return new Intl.NumberFormat('es-UY', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
}

function newItemId() {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function BudgetBoard({ api }: { api: WeddingApi }) {
  const [budget, setBudget] = useState<PartyBudget | null>(null);
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<BudgetCurrency | ''>('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState({ name: '', cost: '', paid: false, notes: '' });
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [revising, setRevising] = useState(false);
  const helpRef = useRef<HTMLDialogElement>(null);
  const helpTitle = useId();

  useEffect(() => {
    api.getBudget().then(setBudget).catch((reason: Error) => setNotice(reason.message));
  }, [api]);

  async function saveTotal(event: FormEvent) {
    event.preventDefault();
    const total = parseAmount(amount);
    if (total == null) {
      setNotice('El presupuesto tiene que ser un número mayor o igual a cero.');
      return;
    }
    setNotice('');
    setSaving(true);
    try {
      const next = await api.saveBudget(
        budget?.total == null
          ? { total, currency: currency as BudgetCurrency }
          : { total, currency: currency as BudgetCurrency, items: budget.items },
      );
      setBudget(next);
      setRevising(false);
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : 'No pudimos guardar el presupuesto.');
    } finally {
      setSaving(false);
    }
  }

  function beginEdit(item: BudgetItem) {
    setEditingId(item.id);
    setDraft({ name: item.name, cost: formatAmountFixed(item.cost), paid: item.paid, notes: item.notes ?? '' });
    setNotice('');
  }

  async function persist(items: BudgetItem[]) {
    if (budget?.total == null) return;
    setSaving(true);
    setNotice('');
    try {
      const next = await api.saveBudget({ total: budget.total, currency: budget.currency ?? 'UYU', items });
      setBudget(next);
      setEditingId(null);
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : 'No pudimos guardar el ítem.');
    } finally {
      setSaving(false);
    }
  }

  async function saveRow() {
    if (!budget || budget.total == null || !editingId) return;
    const name = draft.name.trim();
    const cost = parseAmount(draft.cost);
    if (!name) {
      setNotice('Cada ítem necesita un nombre.');
      return;
    }
    if (cost == null) {
      setNotice('El costo tiene que ser un número mayor o igual a cero.');
      return;
    }
    const notes = draft.notes.trim().replace(/\s+/g, ' ');
    if (notes.length > 240) {
      setNotice('Las observaciones son demasiado largas.');
      return;
    }
    await persist(budget.items.map((item) => (item.id === editingId ? { ...item, name, cost, paid: draft.paid, notes } : item)));
  }

  function beginRevise() {
    if (!budget || budget.total == null) return;
    setBudget({ ...budget, items: budget.items.filter((item) => item.name.trim()) });
    setAmount(formatAmountFixed(budget.total));
    setCurrency(budget.currency ?? '');
    setEditingId(null);
    setNotice('');
    setRevising(true);
  }

  function addRow() {
    if (!budget || editingId) return;
    const item = { id: newItemId(), name: '', cost: 0, paid: false, notes: '' };
    setBudget({ ...budget, items: [...budget.items, item] });
    beginEdit(item);
  }

  async function removeRow(id: string) {
    if (!budget) return;
    await persist(budget.items.filter((item) => item.id !== id));
  }

  if (!budget) return <p className="loading">Cargando…</p>;

  const activeCurrency = budget.currency ?? 'UYU';
  const totals = budgetTotals(budget.items, editingId, draft);
  const remainder = budget.total == null ? 0 : Math.round(budget.total * 100 - totals.spent * 100) / 100;

  return (
    <section className="canvas-section">
      {budget.total == null || revising ? (
        <form className="budget-setup" onSubmit={(event) => void saveTotal(event)}>
          <p className="eyebrow">Administración</p>
          <h2>El presupuesto de la fiesta</h2>
          <MoneyField
            className="budget-amount"
            label="Presupuesto total"
            required
            value={amount}
            onChange={setAmount}
          />
          <CurrencyChoice
            value={currency}
            allowEmpty
            disabled={saving}
            onChange={(value) => setCurrency(value)}
            onInfo={() => helpRef.current?.showModal()}
          />
          <button className="btn btn-primary button" type="submit" disabled={saving}>
            <Icon name="save" />
            Guardar
          </button>
          {notice ? <p className="status" role="status">{notice}</p> : null}
        </form>
      ) : (
        <>
          <header className="canvas-head budget-head">
            <div>
              <p className="eyebrow">Administración</p>
              <h2>La fiesta</h2>
            </div>
            <div className="budget-summary">
              <div className="budget-minis">
                <p className="budget-mini">
                  <span>Gasto total</span>
                  <strong>{formatMoney(totals.spent, activeCurrency)}</strong>
                </p>
                <p className="budget-mini">
                  <span>Resto del presupuesto</span>
                  <strong>{formatMoney(remainder, activeCurrency)}</strong>
                </p>
                <p className="budget-mini">
                  <span>Ya pagado</span>
                  <strong>{formatMoney(totals.paid, activeCurrency)}</strong>
                </p>
                <p className="budget-mini">
                  <span>Resta por pagar</span>
                  <strong>{formatMoney(totals.pending, activeCurrency)}</strong>
                </p>
              </div>
              <div className="budget-total">
                <p>
                  <span>Presupuesto total</span>
                  <strong className="budget-figure">{formatMoney(budget.total, activeCurrency)}</strong>
                </p>
                <button type="button" className="icon-action" aria-label="Modificar presupuesto" title="Modificar" disabled={saving} onClick={beginRevise}>
                  <Icon name="edit" />
                </button>
              </div>
            </div>
          </header>
          <div className="table-scroll canvas-table budget-table">
            <table>
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Costo</th>
                  <th>Pagado</th>
                  <th>Observaciones</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {budget.items.map((item) => {
                  const editing = editingId === item.id;
                  return (
                    <tr key={item.id}>
                      <td>
                        {editing ? (
                          <input aria-label="Item" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
                        ) : (
                          item.name
                        )}
                      </td>
                      <td>
                        {editing ? (
                          <MoneyField
                            label="Costo"
                            value={draft.cost}
                            onChange={(cost) => setDraft({ ...draft, cost })}
                          />
                        ) : (
                          formatMoney(item.cost, activeCurrency)
                        )}
                      </td>
                      <td>
                        {editing ? (
                          <select aria-label="Pagado" value={draft.paid ? 'si' : 'no'} onChange={(event) => setDraft({ ...draft, paid: event.target.value === 'si' })}>
                            <option value="si">Sí</option>
                            <option value="no">No</option>
                          </select>
                        ) : (
                          item.paid ? 'Sí' : 'No'
                        )}
                      </td>
                      <td className="notes-cell">
                        {editing ? (
                          <input aria-label="Observaciones" value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} />
                        ) : (
                          (item.notes ?? '').trim() ? item.notes : '—'
                        )}
                      </td>
                      <td>
                        <div className="row-actions">
                          {editing ? (
                            <button type="button" className="icon-action" aria-label="Guardar" title="Guardar" disabled={saving} onClick={() => void saveRow()}>
                              <Icon name="save" />
                            </button>
                          ) : (
                            <button type="button" className="icon-action" aria-label="Editar" title="Editar" disabled={saving || Boolean(editingId)} onClick={() => beginEdit(item)}>
                              <Icon name="edit" />
                            </button>
                          )}
                          <button type="button" className="icon-action is-danger" aria-label="Borrar" title="Borrar" disabled={saving || (Boolean(editingId) && editingId !== item.id)} onClick={() => void removeRow(item.id)}>
                            <Icon name="delete" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <button type="button" className="budget-add" aria-label="Agregar ítem" disabled={saving || Boolean(editingId)} onClick={addRow}>
            <Icon name="add" />
          </button>
          {notice ? <p className="status" role="status">{notice}</p> : null}
        </>
      )}
      <dialog ref={helpRef} className="rental-dialog csv-help" aria-labelledby={helpTitle}>
        <div className="rental-sheet">
          <button type="button" className="rental-close" aria-label="Cerrar" onClick={() => helpRef.current?.close()}>
            <Icon name="close" />
          </button>
          <p className="rental-kicker">Administración</p>
          <h2 id={helpTitle}>Si cambiás la moneda</h2>
          <p>
            Los importes quedan tal como los cargaste. Si más adelante elegís otra moneda, el presupuesto y los gastos no se convierten solos: el sistema no guarda el tipo de cambio, porque las cotizaciones se mueven. Vas a tener que actualizar cada monto al valor en la moneda nueva.
          </p>
        </div>
      </dialog>
    </section>
  );
}

function budgetTotals(items: BudgetItem[], editingId: string | null, draft: { cost: string; paid: boolean }) {
  let spentCents = 0;
  let paidCents = 0;
  for (const item of items) {
    const editing = item.id === editingId;
    const cost = editing ? (parseAmount(draft.cost) ?? item.cost) : item.cost;
    const paid = editing ? draft.paid : item.paid;
    const cents = Math.round(cost * 100);
    spentCents += cents;
    if (paid) paidCents += cents;
  }
  return { spent: spentCents / 100, paid: paidCents / 100, pending: (spentCents - paidCents) / 100 };
}

function MoneyField({
  label,
  value,
  required = false,
  className,
  onChange,
}: {
  label: string;
  value: string;
  required?: boolean;
  className?: string;
  onChange: (value: string) => void;
}) {
  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const cursor = input.selectionStart ?? input.value.length;
    const editableBefore = input.value.slice(0, cursor).replace(/[^\d,]/g, '').length;
    const next = formatAmountTyping(input.value);
    onChange(next);
    const caret = caretFromEditable(next, editableBefore);
    requestAnimationFrame(() => input.setSelectionRange(caret, caret));
  }

  return (
    <input
      className={className}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      aria-label={label}
      required={required}
      value={value}
      onChange={handleChange}
      onBlur={() => {
        const parsed = parseAmount(value);
        if (parsed != null) onChange(formatAmountFixed(parsed));
      }}
    />
  );
}

function caretFromEditable(formatted: string, editableCount: number) {
  if (editableCount <= 0) return 0;
  let seen = 0;
  for (let index = 0; index < formatted.length; index += 1) {
    if (/[\d,]/.test(formatted[index])) seen += 1;
    if (seen === editableCount) return index + 1;
  }
  return formatted.length;
}

function CurrencyChoice({
  value,
  allowEmpty = false,
  disabled,
  onChange,
  onInfo,
}: {
  value: BudgetCurrency | '';
  allowEmpty?: boolean;
  disabled: boolean;
  onChange: (value: BudgetCurrency | '') => void;
  onInfo: () => void;
}) {
  return (
    <div className="budget-currency">
      <label className="field">
        Moneda
        <select
          value={value}
          required={allowEmpty}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value as BudgetCurrency | '')}
        >
          {allowEmpty ? <option value="">Elegí la moneda</option> : null}
          {CURRENCIES.map((option) => (
            <option key={option.code} value={option.code}>{option.label}</option>
          ))}
        </select>
      </label>
      <button type="button" className="canvas-info" aria-label="Información sobre la moneda" onClick={onInfo}>
        <Icon name="info" />
      </button>
    </div>
  );
}
