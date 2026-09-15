import { useMemo, useState } from 'react'
import { money, toInt, toNumber } from '../domain/money'
import { can } from '../domain/permissions'
import { addPart, deletePart, updatePart } from '../domain/masterData'
import { receiveStock } from '../domain/invoiceService'
import { CORE_CHARGE, CORE_CHARGE_CATEGORY, SURCHARGE_CATEGORY, unitPriceFor } from '../domain/pricing'
import { CATEGORIES, type Part } from '../domain/types'
import { useStore } from '../state/store'
import { Confirm, Empty, SearchBar, TextField } from '../components/ui'

interface PartForm {
  partNo: string
  description: string
  category: string
  qtyOnHand: string
  cost: string
  price: string
  vendor: string
}

const BLANK: PartForm = { partNo: '', description: '', category: 'FILTERS', qtyOnHand: '0', cost: '0', price: '0', vendor: '' }

const toForm = (p: Part): PartForm => ({
  partNo: p.partNo,
  description: p.description,
  category: p.category,
  qtyOnHand: String(p.qtyOnHand),
  cost: String(p.cost),
  price: String(p.price),
  vendor: p.vendor,
})

const toPart = (f: PartForm): Part => ({
  partNo: f.partNo,
  description: f.description,
  category: f.category,
  qtyOnHand: toInt(f.qtyOnHand, 0),
  cost: toNumber(f.cost, 0),
  price: toNumber(f.price, 0),
  vendor: f.vendor,
})

export default function InventoryPage() {
  const { data, session, apply } = useStore()
  const [search, setSearch] = useState('')
  const [selectedNo, setSelectedNo] = useState<string | null>(null)
  const [form, setForm] = useState<PartForm>(BLANK)
  const [receiveQty, setReceiveQty] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  const canEditParts = can(session!.role, 'part.edit')
  const canReceive = can(session!.role, 'stock.receive')

  // §3 — a term matching ANY of part number, description or category finds the
  // part. The legacy screen had `p0 || p1 && p2`, which hid most matches.
  const rows = useMemo(() => {
    const q = search.trim().toUpperCase()
    if (!q) return data.parts
    return data.parts.filter(
      (p) =>
        p.partNo.toUpperCase().includes(q) ||
        p.description.toUpperCase().includes(q) ||
        p.category.toUpperCase().includes(q),
    )
  }, [data.parts, search])

  const selected = selectedNo ? data.parts.find((p) => p.partNo === selectedNo) ?? null : null
  const patch = (p: Partial<PartForm>) => setForm((f) => ({ ...f, ...p }))

  function select(p: Part) {
    setSelectedNo(p.partNo)
    setForm(toForm(p))
    setReceiveQty('')
  }

  function clearForm() {
    setSelectedNo(null)
    setForm(BLANK)
    setReceiveQty('')
  }

  const categoryOptions = Array.from(new Set([...CATEGORIES, ...data.parts.map((p) => p.category)]))

  return (
    <>
      <div className="page-head">
        <h1>Inventory / Parts</h1>
        <p>Quantities, cost and list price for the parts on the shelves.</p>
      </div>

      <div className="card">
        <SearchBar value={search} onChange={setSearch} placeholder="Search part no, description or category…" />
        <div className="table-wrap" style={{ maxHeight: 340, overflowY: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Part no</th>
                <th>Description</th>
                <th>Category</th>
                <th className="num">On hand</th>
                <th className="num">Cost</th>
                <th className="num">List price</th>
                <th>Vendor</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr
                  key={p.partNo}
                  className={`clickable${p.partNo === selectedNo ? ' selected' : ''}${p.qtyOnHand < 5 ? ' flag-danger' : ''}`}
                  onClick={() => select(p)}
                >
                  <td className="mono">{p.partNo}</td>
                  <td>{p.description}</td>
                  <td>
                    {p.category}
                    {p.category === CORE_CHARGE_CATEGORY && <span className="chip neutral" style={{ marginLeft: 6 }}>CORE</span>}
                    {p.category === SURCHARGE_CATEGORY && <span className="chip neutral" style={{ marginLeft: 6 }}>FUEL</span>}
                  </td>
                  <td className="num">
                    {p.qtyOnHand} {p.qtyOnHand < 5 && <span className="chip low">LOW</span>}
                  </td>
                  <td className="num">{money(p.cost)}</td>
                  <td className="num">{money(p.price)}</td>
                  <td>{p.vendor}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <Empty>No parts match “{search}”.</Empty>}
        </div>
        <p className="hint" style={{ marginBottom: 0, marginTop: 10 }}>
          Rows marked red have fewer than 5 on hand. <strong>CORE</strong> = ${CORE_CHARGE}/unit core charge added at
          sale; <strong>FUEL</strong> = triggers the 3% fuel surcharge on the ticket.
        </p>
      </div>

      <div className="grid grid-2">
        <div className="card">
          <h2>{selected ? `Edit ${selected.partNo}` : 'New part'}</h2>
          {!canEditParts && (
            <div className="notice info">Clerks may view parts and receive stock, but not change parts or prices.</div>
          )}

          <TextField
            label="Part no"
            value={form.partNo}
            readOnly={!!selected}
            onChange={(v) => patch({ partNo: v.toUpperCase() })}
          />
          <TextField label="Description" value={form.description} onChange={(v) => patch({ description: v })} />
          <label className="field">
            <span>Category</span>
            <select value={form.category} onChange={(e) => patch({ category: e.target.value })}>
              {categoryOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <div className="row" style={{ gap: 12, alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}>
              <TextField label="Qty on hand" value={form.qtyOnHand} onChange={(v) => patch({ qtyOnHand: v })} />
            </div>
            <div style={{ flex: 1 }}>
              <TextField label="Cost" value={form.cost} onChange={(v) => patch({ cost: v })} />
            </div>
            <div style={{ flex: 1 }}>
              <TextField label="List price" value={form.price} onChange={(v) => patch({ price: v })} />
            </div>
          </div>
          <TextField label="Vendor" value={form.vendor} onChange={(v) => patch({ vendor: v })} />

          <div className="row" style={{ marginTop: 8 }}>
            <button
              className="btn primary"
              disabled={!canEditParts || !!selected}
              onClick={() => {
                if (apply(addPart(data, session!, toPart(form)), 'Part added.')) clearForm()
              }}
            >
              Add new
            </button>
            <button
              className="btn"
              disabled={!canEditParts || !selected}
              onClick={() => selected && apply(updatePart(data, session!, selected.partNo, toPart(form)), 'Part updated.')}
            >
              Update
            </button>
            <button className="btn danger" disabled={!canEditParts || !selected} onClick={() => setConfirmDelete(true)}>
              Delete
            </button>
            <button className="btn" onClick={clearForm}>
              Clear form
            </button>
          </div>
        </div>

        <div className="card">
          <h2>Receive stock</h2>
          <p className="hint" style={{ marginTop: 0 }}>
            Adds a received quantity to the selected part's on-hand count. Every receipt is written to the audit log.
          </p>
          <TextField label="Part" value={selected ? `${selected.partNo} — ${selected.description}` : 'Select a part above'} readOnly />
          <TextField label="Quantity received" value={receiveQty} onChange={setReceiveQty} />
          <button
            className="btn primary"
            disabled={!canReceive || !selected || receiveQty.trim() === ''}
            onClick={() => {
              if (!selected) return
              if (apply(receiveStock(data, session!, selected.partNo, toInt(receiveQty, 0)), `Received ${receiveQty} × ${selected.partNo}.`)) {
                setReceiveQty('')
                setForm((f) => ({ ...f, qtyOnHand: String(selected.qtyOnHand + toInt(receiveQty, 0)) }))
              }
            }}
          >
            Receive
          </button>

          {selected && (
            <>
              <h3 style={{ marginTop: 20, marginBottom: 8 }}>What this part sells for</h3>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Customer type</th>
                      <th className="num">Unit price</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(['RETAIL', 'WHOLESALE', 'FLEET'] as const).map((t) => (
                      <tr key={t}>
                        <td>{t}</td>
                        <td className="num">{money(unitPriceFor(selected, t))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="hint" style={{ marginBottom: 0 }}>
                Before volume discount, fuel surcharge and tax.
              </p>
            </>
          )}
        </div>
      </div>

      {confirmDelete && selected && (
        <Confirm
          title={`Delete ${selected.partNo}?`}
          body={`${selected.description} will be removed from inventory.`}
          confirmLabel="Delete"
          danger
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => {
            setConfirmDelete(false)
            if (apply(deletePart(data, session!, selected.partNo), `${selected.partNo} deleted.`)) clearForm()
          }}
        />
      )}
    </>
  )
}
