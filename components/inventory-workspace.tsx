"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import AppSidebar from "@/components/app-sidebar";
import { ApiClientError, apiRequest } from "@/lib/api";

type ProductClass = "GENERAL" | "MEDICINE" | "MEDICAL_SUPPLY";
type Product = {
  id: string;
  code: string;
  name: string;
  status: "DRAFT" | "ACTIVE" | "INACTIVE";
  productDetail?: {
    unit: string;
    currentStock: string | number;
    minStock: string | number;
    productClass: ProductClass;
    trackLot: boolean;
    trackExpiry: boolean;
  };
};
type Lot = { id: string; lotNumber: string; manufacturedAt?: string; expiresAt?: string; onHand: string; discountType:"NONE"|"PERCENT"|"AMOUNT";discountValue:string;discountStartsAt?:string;discountEndsAt?:string };
type Stock = {
  productId: string;
  code: string;
  name: string;
  unit: string;
  productClass: ProductClass;
  trackLot: boolean;
  trackExpiry: boolean;
  totalOnHand: string;
  minStock: string;
  shortage: string;
  unallocatedOnHand: string;
  lots: Lot[];
};
type ReceiptLine = { id: string; quantity: string; unitCost: string };
type Receipt = {
  id: string;
  receiptNo: string;
  receivedAt: string;
  externalDocumentNo?: string;
  sourceName?: string;
  note?: string;
  status: "POSTED" | "REVERSED";
  totalCost: string;
  reversalReason?: string;
  lines: ReceiptLine[];
};
type DraftLine = {
  key: string;
  productMode: "EXISTING" | "NEW";
  productId: string;
  productSearch: string;
  lotChoice: string;
  quantity: string;
  unitCost: string;
  lotNumber: string;
  manufacturedAt: string;
  expiresAt: string;
  newProduct: {
    code: string;
    name: string;
    productClass: ProductClass;
    unit: string;
    barcode: string;
    basePrice: string;
    minStock: string;
  };
};

const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });
const blankLine = (): DraftLine => ({ key: crypto.randomUUID(), productMode: "EXISTING", productId: "", productSearch: "", lotChoice: "NEW", quantity: "1", unitCost: "", lotNumber: "", manufacturedAt: "", expiresAt: "", newProduct: { code: "", name: "", productClass: "GENERAL", unit: "ชิ้น", barcode: "", basePrice: "0", minStock: "0" } });
const money = (value: string | number) => new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB", minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(Number(value));
const qty = (value: string | number) => new Intl.NumberFormat("th-TH", { maximumFractionDigits: 3 }).format(Number(value));
const date = (value?: string) => value ? new Intl.DateTimeFormat("th-TH", { dateStyle: "medium" }).format(new Date(value)) : "—";
const errorText = (error: unknown) => { const value = error as ApiClientError; return value.code ? `${value.code}: ${value.message}` : value.message || "เกิดข้อผิดพลาด"; };

export default function InventoryWorkspace() {
  const [token, setToken] = useState("");
  const [profile, setProfile] = useState<{ name: string; clinicCode: string } | null>(null);
  const [tab, setTab] = useState<"RECEIVE" | "STOCK" | "HISTORY">("RECEIVE");
  const [products, setProducts] = useState<Product[]>([]);
  const [stock, setStock] = useState<Stock[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [lots, setLots] = useState<Record<string, Lot[]>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [header, setHeader] = useState({ receivedAt: today(), externalDocumentNo: "", sourceName: "", note: "" });
  const [lines, setLines] = useState<DraftLine[]>([blankLine()]);

  const load = useCallback(async (activeToken: string) => {
    setLoading(true);
    try {
      const [catalogResult, stockResult, receiptResult] = await Promise.all([
        apiRequest<Product[]>("/catalog/items?type=PRODUCT&limit=100&sortBy=name&sortOrder=asc", { token: activeToken }),
        apiRequest<Stock[]>("/inventory/stock?includeZero=true&limit=100&sortBy=name&sortOrder=asc", { token: activeToken }),
        apiRequest<Receipt[]>("/inventory/receipts?limit=30&sortBy=createdAt&sortOrder=desc", { token: activeToken }),
      ]);
      setProducts(catalogResult.data.filter(item => item.status !== "INACTIVE"));
      setStock(stockResult.data);
      setReceipts(receiptResult.data);
    } catch (error) {
      setNotice({ kind: "error", text: errorText(error) });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const savedToken = localStorage.getItem("klinic-test-token");
    const savedProfile = localStorage.getItem("klinic-test-profile");
    queueMicrotask(() => {
      if (!savedToken) { setLoading(false); return; }
      setToken(savedToken);
      if (savedProfile) try { setProfile(JSON.parse(savedProfile)); } catch { setProfile(null); }
      void load(savedToken);
    });
  }, [load]);

  const loadLots = useCallback(async (productId: string) => {
    if (!productId || lots[productId]) return;
    try {
      const response = await apiRequest<Lot[]>(`/inventory/products/${productId}/lots?limit=100`, { token });
      setLots(current => ({ ...current, [productId]: response.data }));
    } catch (error) { setNotice({ kind: "error", text: errorText(error) }); }
  }, [lots, token]);

  const filteredStock = useMemo(() => stock.filter(item => `${item.code} ${item.name}`.toLowerCase().includes(search.toLowerCase())), [stock, search]);
  const totals = useMemo(() => lines.reduce((result, line) => ({ quantity: result.quantity + Number(line.quantity || 0), cost: result.cost + Number(line.quantity || 0) * Number(line.unitCost || 0) }), { quantity: 0, cost: 0 }), [lines]);

  function updateLine(key: string, patch: Partial<DraftLine>) {
    setLines(current => current.map(line => line.key === key ? { ...line, ...patch } : line));
  }

  async function submitReceipt(event: FormEvent) {
    event.preventDefault();
    if (lines.some(line => line.productMode === "EXISTING" && !line.productId)) return setNotice({ kind: "error", text: "กรุณาเลือกสินค้าให้ครบทุกรายการ" });
    if (lines.some(line => line.productMode === "NEW" && (!line.newProduct.code.trim() || !line.newProduct.name.trim() || !line.newProduct.unit.trim()))) return setNotice({ kind: "error", text: "สินค้าใหม่ต้องมีรหัส ชื่อ และหน่วย" });
    if (lines.some(line => line.lotChoice === "NEW" && !line.lotNumber.trim())) return setNotice({ kind: "error", text: "กรุณากรอกเลข Lot ใหม่ให้ครบ" });
    setSaving(true); setNotice(null);
    try {
      const resolvedLines = [...lines];
      for (let index = 0; index < resolvedLines.length; index += 1) {
        const line = resolvedLines[index];
        if (line.productMode !== "NEW" || line.productId) continue;
        const draft = line.newProduct;
        const trackExpiry = draft.productClass !== "GENERAL";
        const response = await apiRequest<Product>("/catalog/products", { method: "POST", token, body: JSON.stringify({ code: draft.code.trim().toUpperCase(), name: draft.name.trim(), basePrice: Number(draft.basePrice || 0), discountType: "NONE", discountValue: 0, unit: draft.unit.trim(), barcode: draft.barcode.trim() || undefined, minStock: Number(draft.minStock || 0), productClass: draft.productClass, trackLot: true, trackExpiry }) });
        const created = response.data;
        resolvedLines[index] = { ...line, productId: created.id, productSearch: `${created.code} · ${created.name}` };
        updateLine(line.key, { productId: created.id, productSearch: `${created.code} · ${created.name}` });
        setProducts(current => [...current, created].sort((left, right) => left.name.localeCompare(right.name, "th")));
        setLots(current => ({ ...current, [created.id]: [] }));
      }
      const duplicate = new Set(resolvedLines.map(line => `${line.productId}:${line.lotChoice === "NEW" ? line.lotNumber.trim().toUpperCase() : line.lotChoice}`));
      if (duplicate.size !== resolvedLines.length) throw new Error("สินค้าและ Lot เดียวกันใส่ซ้ำในเอกสารไม่ได้");
      await apiRequest("/inventory/receipts", {
        method: "POST", token, headers: { "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({
          receivedAt: new Date(`${header.receivedAt}T12:00:00+07:00`).toISOString(),
          externalDocumentNo: header.externalDocumentNo.trim() || undefined,
          sourceName: header.sourceName.trim() || undefined,
          note: header.note.trim() || undefined,
          lines: resolvedLines.map(line => ({
            productId: line.productId,
            ...(line.lotChoice === "NEW" ? { newLot: { lotNumber: line.lotNumber.trim(), manufacturedAt: line.manufacturedAt ? new Date(`${line.manufacturedAt}T00:00:00+07:00`).toISOString() : undefined, expiresAt: line.expiresAt ? new Date(`${line.expiresAt}T23:59:59+07:00`).toISOString() : undefined } } : { lotId: line.lotChoice }),
            quantity: Number(line.quantity), unitCost: Number(line.unitCost),
          })),
        }),
      });
      const newProductsInReceipt = resolvedLines.filter(line => line.productMode === "NEW").map(line => line.productId);
      const activations = await Promise.allSettled(newProductsInReceipt.map(id => apiRequest(`/catalog/items/${id}`, { method: "PATCH", token, body: JSON.stringify({ status: "ACTIVE" }) })));
      const activationFailures = activations.filter(result => result.status === "rejected").length;
      setNotice({ kind: activationFailures ? "error" : "success", text: activationFailures ? `รับสินค้าเข้าคลังแล้ว แต่มีสินค้าใหม่ ${activationFailures} รายการที่ยังเปิดใช้งานไม่สำเร็จ` : `รับสินค้า ${lines.length} รายการ รวม ${qty(totals.quantity)} หน่วยเข้าคลังแล้ว${newProductsInReceipt.length ? ` และเปิดใช้งานสินค้าใหม่ ${newProductsInReceipt.length} รายการ` : ""}` });
      setHeader({ receivedAt: today(), externalDocumentNo: "", sourceName: "", note: "" });
      setLines([blankLine()]); setLots({});
      await load(token);
    } catch (error) { setNotice({ kind: "error", text: errorText(error) }); }
    finally { setSaving(false); }
  }

  async function reverse(receipt: Receipt) {
    const reason = window.prompt(`เหตุผลที่กลับรายการ ${receipt.receiptNo}`)?.trim();
    if (!reason) return;
    setSaving(true); setNotice(null);
    try {
      await apiRequest(`/inventory/receipts/${receipt.id}/reverse`, { method: "POST", token, body: JSON.stringify({ reason }) });
      setNotice({ kind: "success", text: `กลับรายการ ${receipt.receiptNo} แล้ว` });
      await load(token);
    } catch (error) { setNotice({ kind: "error", text: errorText(error) }); }
    finally { setSaving(false); }
  }

  if (!token && !loading) return <main className="login-required"><div><b>ต้องเข้าสู่ระบบก่อน</b><p>หน้า Inventory ใช้ token และ clinic scope เดียวกับระบบทดสอบ</p><a href="/login">ไปหน้าเข้าสู่ระบบ</a></div></main>;

  return <main className="app-shell inventory-app">
    <AppSidebar active="inventory" profile={profile} />
    <section className="workspace">
      <header className="topbar inventory-topbar"><div><p className="eyebrow">INVENTORY LITE</p><h1>คลังสินค้าและ Lot</h1></div><div className="inventory-header-actions"><span className="inventory-api-dot">● API connected</span><button className="ghost-button" onClick={() => void load(token)} disabled={loading}>↻ รีเฟรช</button></div></header>
      <div className="content inventory-content">
        {notice && <div className={`notice ${notice.kind} inventory-notice`}><span>{notice.kind === "success" ? "✓" : "!"}</span>{notice.text}<button onClick={() => setNotice(null)}>×</button></div>}
        <section className="inventory-hero">
          <div><p className="eyebrow light">STOCK OPERATIONS</p><h2>รับเข้าเป็นเอกสาร ตรวจสอบได้ถึง Lot</h2><p>บันทึกยอดทันทีเมื่อรับเข้า และใช้ประวัติ Movement เป็นหลักฐานทุกการเปลี่ยนแปลง</p></div>
          <div className="inventory-metrics"><div><small>สินค้า</small><b>{stock.length}</b></div><div><small>Lot ที่มีอยู่</small><b>{stock.reduce((sum, item) => sum + item.lots.length, 0)}</b></div><div><small>เอกสารล่าสุด</small><b>{receipts.length}</b></div></div>
        </section>
        <nav className="inventory-tabs" aria-label="ส่วนงานคลังสินค้า">
          <button className={tab === "RECEIVE" ? "active" : ""} onClick={() => setTab("RECEIVE")}><span>＋</span><b>รับสินค้าเข้า</b><small>สร้างเอกสารและ Lot</small></button>
          <button className={tab === "STOCK" ? "active" : ""} onClick={() => setTab("STOCK")}><span>▦</span><b>ยอดคงเหลือ</b><small>แยกสินค้าและ Lot</small></button>
          <button className={tab === "HISTORY" ? "active" : ""} onClick={() => setTab("HISTORY")}><span>↗</span><b>ประวัติรับเข้า</b><small>ตรวจสอบและกลับรายการ</small></button>
        </nav>

        {tab === "RECEIVE" && <form className="inventory-receive" onSubmit={submitReceipt}>
          <section className="panel inventory-document"><header><div><p className="eyebrow">RECEIPT INFORMATION</p><h3>ข้อมูลการรับเข้า</h3></div><span>POSTED ทันที</span></header><div className="inventory-header-grid">
            <label>วันที่รับเข้า *<input type="date" value={header.receivedAt} onChange={event => setHeader(value => ({ ...value, receivedAt: event.target.value }))} required /></label>
            <label>เลขที่เอกสาร<input value={header.externalDocumentNo} onChange={event => setHeader(value => ({ ...value, externalDocumentNo: event.target.value }))} placeholder="เช่น INV-2569-0925" /></label>
            <label>ที่มา / ผู้จำหน่าย<input value={header.sourceName} onChange={event => setHeader(value => ({ ...value, sourceName: event.target.value }))} placeholder="ชื่อบริษัทหรือแหล่งที่มา" /></label>
            <label className="wide">หมายเหตุ<input value={header.note} onChange={event => setHeader(value => ({ ...value, note: event.target.value }))} placeholder="รายละเอียดเพิ่มเติม (ถ้ามี)" /></label>
          </div></section>
          <section className="panel inventory-lines">
            <header>
              <div><p className="eyebrow">RECEIPT LINES</p><h3>รายการรับเข้า</h3><p>แต่ละแถวคือสินค้า 1 รายการและ Lot ที่รับเข้าครั้งนี้</p></div>
              <button type="button" className="secondary-button" onClick={() => setLines(current => [...current, blankLine()])}>＋ เพิ่มสินค้า</button>
            </header>
            <datalist id="inventory-products">{products.map(product => <option key={product.id} value={`${product.code} · ${product.name}`} />)}</datalist>
            <div className="inventory-line-list">{lines.map((line, index) => {
              const product = products.find(item => item.id === line.productId);
              const productLots = lots[line.productId] ?? [];
              const requiresExpiry = line.productMode === "NEW" ? line.newProduct.productClass !== "GENERAL" : product?.productDetail?.trackExpiry;
              return <article className={`inventory-line ${line.productMode === "NEW" ? "new-product" : ""}`} key={line.key}>
                <div className="inventory-line-heading">
                  <div className="inventory-line-number">{index + 1}</div>
                  <div><b>สินค้า #{index + 1}</b><small>{line.productMode === "EXISTING" ? "เลือกจากทะเบียนสินค้า" : "ลงทะเบียนพร้อมรับเข้า"}</small></div>
                  <div className="inventory-product-mode"><button type="button" className={line.productMode === "EXISTING" ? "active" : ""} onClick={() => updateLine(line.key, { productMode: "EXISTING", productId: "", productSearch: "", lotChoice: "NEW" })}>สินค้าที่มีอยู่</button><button type="button" className={line.productMode === "NEW" ? "active" : ""} onClick={() => updateLine(line.key, { productMode: "NEW", productId: "", productSearch: "", lotChoice: "NEW" })}>＋ ลงทะเบียนใหม่</button></div>
                  {lines.length > 1 && <button type="button" className="inventory-remove" onClick={() => setLines(current => current.filter(item => item.key !== line.key))}>×</button>}
                </div>
                {line.productMode === "EXISTING" ? <div className="inventory-line-main">
                  <label>สินค้า *<input list="inventory-products" value={line.productSearch} placeholder="ค้นหาชื่อหรือรหัสสินค้า…" onChange={event => { const selected = products.find(item => `${item.code} · ${item.name}` === event.target.value); if (selected) { updateLine(line.key, { productId: selected.id, productSearch: event.target.value, lotChoice: "NEW", lotNumber: "", manufacturedAt: "", expiresAt: "" }); void loadLots(selected.id); } else updateLine(line.key, { productId: "", productSearch: event.target.value }); }} required /></label>
                  <label>Lot *<select value={line.lotChoice} disabled={!line.productId} onChange={event => updateLine(line.key, { lotChoice: event.target.value })}><option value="NEW">＋ สร้าง Lot ใหม่</option>{productLots.map(lot => <option key={lot.id} value={lot.id}>{lot.lotNumber} · คงเหลือ {qty(lot.onHand)}</option>)}</select></label>
                  <label>จำนวน *<input type="number" min="0.001" step="0.001" value={line.quantity} onChange={event => updateLine(line.key, { quantity: event.target.value })} required /></label>
                  <label>ต้นทุน/หน่วย *<input type="number" min="0" step="0.01" value={line.unitCost} onChange={event => updateLine(line.key, { unitCost: event.target.value })} placeholder="0.00" required /></label>
                </div> : <div className="inventory-inline-product">
                  <label className="inline-product-code">รหัสสินค้า *<input value={line.newProduct.code} onChange={event => updateLine(line.key, { newProduct: { ...line.newProduct, code: event.target.value.toUpperCase() } })} placeholder="เช่น MED-001" required /></label>
                  <label className="inline-product-name">ชื่อสินค้า *<input value={line.newProduct.name} onChange={event => updateLine(line.key, { newProduct: { ...line.newProduct, name: event.target.value } })} placeholder="ชื่อยาหรือสินค้า" required /></label>
                  <label className="inline-product-class">ประเภท *<select value={line.newProduct.productClass} onChange={event => updateLine(line.key, { newProduct: { ...line.newProduct, productClass: event.target.value as ProductClass } })}><option value="GENERAL">สินค้าทั่วไป</option><option value="MEDICINE">ยา</option><option value="MEDICAL_SUPPLY">เวชภัณฑ์</option></select></label>
                  <label className="inline-product-unit">หน่วย *<input value={line.newProduct.unit} onChange={event => updateLine(line.key, { newProduct: { ...line.newProduct, unit: event.target.value } })} required /></label>
                  <label className="inline-product-barcode">Barcode<input value={line.newProduct.barcode} onChange={event => updateLine(line.key, { newProduct: { ...line.newProduct, barcode: event.target.value } })} /></label>
                  <label className="inline-product-price">ราคาขาย<input type="number" min="0" step="0.01" value={line.newProduct.basePrice} onChange={event => updateLine(line.key, { newProduct: { ...line.newProduct, basePrice: event.target.value } })} /></label>
                  <label className="inline-product-min-stock">Stock ขั้นต่ำ<input type="number" min="0" step="0.001" value={line.newProduct.minStock} onChange={event => updateLine(line.key, { newProduct: { ...line.newProduct, minStock: event.target.value } })} /><small>0 = ไม่แจ้งเตือน</small></label>
                  <p>{requiresExpiry ? "ยา/เวชภัณฑ์: บังคับวันหมดอายุ" : "สินค้าทั่วไป: วันหมดอายุไม่บังคับ"}</p>
                </div>}
                {line.productMode === "NEW" && <div className="inventory-quantity-strip">
                  <div><span>LOT RECEIVING</span><b>{line.lotChoice === "NEW" ? "Lot ใหม่" : "Lot ที่มีอยู่"}</b></div>
                  <label>จำนวน *<input type="number" min="0.001" step="0.001" value={line.quantity} onChange={event => updateLine(line.key, { quantity: event.target.value })} required /></label>
                  <label>ต้นทุน/หน่วย *<input type="number" min="0" step="0.01" value={line.unitCost} onChange={event => updateLine(line.key, { unitCost: event.target.value })} placeholder="0.00" required /></label>
                </div>}
                {line.lotChoice === "NEW" && <div className="inventory-new-lot"><div><b>ข้อมูล Lot</b><small>{requiresExpiry ? "รายการนี้บังคับระบุวันหมดอายุ" : "Lot จะถูกสร้างพร้อมเอกสารรับเข้า"}</small></div><label>เลข Lot *<input value={line.lotNumber} onChange={event => updateLine(line.key, { lotNumber: event.target.value.toUpperCase() })} placeholder="LOT-2026-09D" required /></label><label>วันที่ผลิต<input type="date" value={line.manufacturedAt} max={header.receivedAt} onChange={event => updateLine(line.key, { manufacturedAt: event.target.value })} /></label><label>วันหมดอายุ {requiresExpiry ? "*" : ""}<input type="date" value={line.expiresAt} min={header.receivedAt} onChange={event => updateLine(line.key, { expiresAt: event.target.value })} required={Boolean(requiresExpiry)} /></label></div>}
              </article>;
            })}</div>
            <footer className="inventory-submit"><div><span>{lines.length} รายการ · {qty(totals.quantity)} หน่วย</span><b>มูลค่ารับเข้า {money(totals.cost)}</b></div><button className="primary-button" disabled={saving || loading}>{saving ? "กำลังบันทึก…" : "ยืนยันรับสินค้าเข้าคลัง"}</button></footer>
          </section>
        </form>}

        {tab === "STOCK" && <section className="panel inventory-stock"><header><div><p className="eyebrow">CURRENT BALANCE</p><h3>ยอดคงเหลือสินค้า</h3></div><input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="ค้นหาสินค้า…" /></header>{loading ? <Empty text="กำลังโหลดยอดคงเหลือ…" /> : !filteredStock.length ? <Empty text="ยังไม่มีข้อมูลสินค้า" /> : <div className="stock-table"><div className="stock-table-head"><span>สินค้า</span><span>ประเภท</span><span>ยอดรวม / ขั้นต่ำ</span><span>Lot / วันหมดอายุ / ส่วนลด</span></div>{filteredStock.map(item => {const isLow=Number(item.minStock)>0&&Number(item.totalOnHand)<=Number(item.minStock);return <article className={isLow?"low-stock-row":""} key={item.productId}><div><b>{item.name}</b><small>{item.code} · {item.unit}</small></div><span className={`class-pill ${item.productClass.toLowerCase()}`}>{item.productClass === "MEDICINE" ? "ยา" : item.productClass === "MEDICAL_SUPPLY" ? "เวชภัณฑ์" : "ทั่วไป"}</span><div className="stock-balance-cell"><strong className={Number(item.totalOnHand) < 0 ? "negative" : ""}>{qty(item.totalOnHand)} {item.unit}</strong><small>ขั้นต่ำ {qty(item.minStock)}{isLow?` · ขาด ${qty(item.shortage)}`:""}</small>{isLow&&<b>Stock ต่ำ</b>}</div><div className="stock-lots">{item.lots.length ? item.lots.map(lot => <LotDiscountEditor key={lot.id} lot={lot} unit={item.unit} token={token} saving={saving} setSaving={setSaving} onNotice={setNotice} onSaved={()=>void load(token)}/>) : <em>ยังไม่มี Lot</em>}{Number(item.unallocatedOnHand) !== 0 && <span className="unallocated"><b>ไม่ได้จัดสรร Lot</b><small>{qty(item.unallocatedOnHand)} {item.unit}</small></span>}</div></article>})}</div>}</section>}

        {tab === "HISTORY" && <section className="panel inventory-history"><header><div><p className="eyebrow">RECEIPT HISTORY</p><h3>ประวัติเอกสารรับเข้า</h3></div><span>{receipts.length} เอกสารล่าสุด</span></header>{loading ? <Empty text="กำลังโหลดประวัติ…" /> : !receipts.length ? <Empty text="ยังไม่มีเอกสารรับเข้า" /> : <div>{receipts.map(receipt => <article key={receipt.id}><div className="receipt-identity"><span>RCV</span><div><b>{receipt.receiptNo}</b><small>{date(receipt.receivedAt)} · {receipt.sourceName || "ไม่ระบุที่มา"}</small></div></div><div><small>เอกสารอ้างอิง</small><b>{receipt.externalDocumentNo || "—"}</b></div><div><small>จำนวน</small><b>{receipt.lines.length} รายการ / {qty(receipt.lines.reduce((sum, line) => sum + Number(line.quantity), 0))} หน่วย</b></div><div><small>มูลค่า</small><b>{money(receipt.totalCost)}</b></div><span className={`receipt-status ${receipt.status.toLowerCase()}`}>{receipt.status === "POSTED" ? "รับเข้าแล้ว" : "กลับรายการแล้ว"}</span>{receipt.status === "POSTED" ? <button disabled={saving} onClick={() => void reverse(receipt)}>กลับรายการ</button> : <small className="reversal-note">{receipt.reversalReason}</small>}</article>)}</div>}</section>}
      </div>
    </section>
  </main>;
}

function LotDiscountEditor({lot,unit,token,saving,setSaving,onNotice,onSaved}:{lot:Lot;unit:string;token:string;saving:boolean;setSaving:(value:boolean)=>void;onNotice:(value:{kind:"success"|"error";text:string}|null)=>void;onSaved:()=>void}) {
  const [type,setType]=useState<Lot["discountType"]>(lot.discountType??"NONE");
  const [value,setValue]=useState(String(lot.discountValue??"0"));
  async function save(event:FormEvent){event.preventDefault();setSaving(true);onNotice(null);try{await apiRequest(`/inventory/lots/${lot.id}/discount`,{method:"PATCH",token,body:JSON.stringify({discountType:type,discountValue:type==="NONE"?0:Number(value)})});onNotice({kind:"success",text:`อัปเดตส่วนลด ${lot.lotNumber} แล้ว`});onSaved();}catch(error){onNotice({kind:"error",text:errorText(error)});}finally{setSaving(false);}}
  return <form className="lot-discount" onSubmit={save}><div><b>{lot.lotNumber}</b><small>{qty(lot.onHand)} {unit} · หมดอายุ {date(lot.expiresAt)}</small></div><select aria-label={`ประเภทส่วนลด ${lot.lotNumber}`} value={type} onChange={event=>setType(event.target.value as Lot["discountType"])}><option value="NONE">ไม่ลด</option><option value="PERCENT">ลด %</option><option value="AMOUNT">ลด ฿</option></select><input aria-label={`ค่าส่วนลด ${lot.lotNumber}`} type="number" min="0" step="0.01" disabled={type==="NONE"} value={value} onChange={event=>setValue(event.target.value)}/><button disabled={saving}>บันทึก</button></form>;
}

function Empty({ text }: { text: string }) { return <div className="inventory-empty"><span>▦</span><p>{text}</p></div>; }
