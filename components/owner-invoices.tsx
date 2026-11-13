"use client";

import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/api";

type Invoice = {
  checkout?: { paidAt: string | null; paymentMethod?: string };
  id: string;
  number: string;
  checkoutId: string;
  issuedAt: string;
  pdfStatus: string;
  snapshot: {
    paidAt?: string | null;
    organizationName: string;
    branchName: string;
    packageName: string;
    subscriptionDays: number;
    amountMinor: number;
    currency: string;
    buyer: { name: string; email: string };
    seller: { name: string; address: string };
  };
};
const paymentLabel = (invoice: Invoice) =>
  invoice.checkout?.paymentMethod === "FREE"
    ? "ไม่มีค่าใช้จ่าย"
    : invoice.checkout?.paidAt || invoice.snapshot.paidAt
      ? "PAID"
      : "รอชำระ";
const money = (invoice: Invoice) =>
  new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: invoice.snapshot.currency.toUpperCase(),
  }).format(invoice.snapshot.amountMinor / 100);

export function OwnerInvoices({
  token,
  organizationId,
  checkoutId,
}: {
  token: string;
  organizationId: string;
  checkoutId?: string;
}) {
  const [rows, setRows] = useState<Invoice[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [reload, setReload] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [selected, setSelected] = useState<Invoice>();
  const [prepared, setPrepared] = useState<{ id: string; url: string }>();
  useEffect(
    () => () => {
      if (prepared) URL.revokeObjectURL(prepared.url);
    },
    [prepared],
  );
  const base = `/owner/organizations/${encodeURIComponent(organizationId)}/invoices`;
  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({
      page: String(page),
      limit: checkoutId ? "1" : "10",
    });
    if (checkoutId) params.set("checkoutId", checkoutId);
    apiRequest<Invoice[]>(`${base}?${params}`, {
      token,
      signal: controller.signal,
    })
      .then((result) => {
        if (!controller.signal.aborted) {
          setRows(result.data);
          setPages(Math.max(1, result.meta?.totalPages ?? 1));
          setError("");
        }
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setError(String(cause));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [base, checkoutId, page, reload, token]);
  async function download(invoice: Invoice) {
    setBusy(invoice.id);
    setError("");
    try {
      if (prepared?.id === invoice.id) {
        const link = document.createElement("a");
        link.href = prepared.url;
        link.download = `${invoice.number}.pdf`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        return;
      }
      const response = await fetch(
        `/api/clinic${base}/${encodeURIComponent(invoice.id)}/download`,
        { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
      );
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.message || "ดาวน์โหลด Invoice ไม่สำเร็จ");
      }
      const url = URL.createObjectURL(await response.blob());
      setPrepared({ id: invoice.id, url });
      const link = document.createElement("a");
      link.href = url;
      link.download = `${invoice.number}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy("");
    }
  }
  return (
    <section className="owner-invoices">
      <header>
        <div>
          <p className="eyebrow">BILLING HISTORY</p>
          <h2>
            {checkoutId ? "Invoice ของรายการนี้" : "ประวัติการซื้อ / Invoice"}
          </h2>
          <p className="muted">เอกสารรายการที่ชำระแล้วขององค์กรคุณ</p>
        </div>
        <button
          type="button"
          className="ghost-button"
          onClick={() => {
            setLoading(true);
            setReload((value) => value + 1);
          }}
        >
          รีเฟรชเอกสาร
        </button>
      </header>
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
      {loading ? (
        <p role="status">กำลังโหลด Invoice…</p>
      ) : !rows.length ? (
        <p className="muted">
          {checkoutId
            ? "กำลังเตรียม Invoice หลังยืนยันการชำระ กดรีเฟรชเอกสารเพื่อตรวจสอบ"
            : "ยังไม่มี Invoice ของรายการชำระเงิน"}
        </p>
      ) : (
        <div className="owner-invoice-list">
          {rows.map((invoice) => (
            <article key={invoice.id}>
              <button
                type="button"
                className="owner-invoice-detail"
                onClick={() => setSelected(invoice)}
              >
                <strong>{invoice.number}</strong>
                <span>
                  {invoice.snapshot.organizationName} · สาขา{" "}
                  {invoice.snapshot.branchName}
                </span>
                <small>
                  {invoice.snapshot.packageName} ·{" "}
                  {invoice.snapshot.subscriptionDays} วัน ·{" "}
                  {new Date(invoice.issuedAt).toLocaleDateString("th-TH", {
                    timeZone: "Asia/Bangkok",
                  })}
                </small>
                <b>
                  {money(invoice)} <em>{paymentLabel(invoice)}</em>
                </b>
              </button>
              <button
                type="button"
                className="primary-button"
                disabled={Boolean(busy)}
                onClick={() => void download(invoice)}
              >
                {busy === invoice.id ? "กำลังดาวน์โหลด…" : "ดาวน์โหลด PDF"}
              </button>
              {prepared?.id === invoice.id && (
                <a
                  className="ghost-button"
                  href={prepared.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  เปิด PDF
                </a>
              )}
            </article>
          ))}
        </div>
      )}
      {!checkoutId && pages > 1 && (
        <div className="owner-invoice-pages">
          <button
            type="button"
            className="ghost-button"
            disabled={page <= 1}
            onClick={() => {
              setLoading(true);
              setPage(page - 1);
            }}
          >
            ก่อนหน้า
          </button>
          <span>
            หน้า {page} / {pages}
          </span>
          <button
            type="button"
            className="ghost-button"
            disabled={page >= pages}
            onClick={() => {
              setLoading(true);
              setPage(page + 1);
            }}
          >
            ถัดไป
          </button>
        </div>
      )}
      {selected && (
        <div
          className="modal-backdrop owner-invoice-modal"
          onClick={() => setSelected(undefined)}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="owner-invoice-title"
            className="modal-box"
            onClick={(event) => event.stopPropagation()}
          >
            <header>
              <h2 id="owner-invoice-title">{selected.number}</h2>
              <button
                type="button"
                className="ghost-button"
                onClick={() => setSelected(undefined)}
              >
                ปิด Invoice
              </button>
            </header>
            <p>
              <b>
                {selected.snapshot.organizationName} · สาขา{" "}
                {selected.snapshot.branchName}
              </b>
            </p>
            <p>
              {selected.snapshot.packageName} ·{" "}
              {selected.snapshot.subscriptionDays} วัน
            </p>
            <p className="owner-invoice-amount">
              {money(selected)} <span>{paymentLabel(selected)}</span>
            </p>
            <p className="muted">
              ผู้ซื้อ {selected.snapshot.buyer.name}
              <br />
              {selected.snapshot.buyer.email}
            </p>
            <p className="muted">
              {selected.snapshot.seller.name}
              <br />
              {selected.snapshot.seller.address}
            </p>
            <button
              type="button"
              disabled={Boolean(busy)}
              className="primary-button"
              onClick={() => void download(selected)}
            >
              ดาวน์โหลด Invoice PDF
            </button>
            {prepared?.id === selected.id && (
              <a
                className="ghost-button"
                href={prepared.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                เปิด PDF
              </a>
            )}
            {error && (
              <p role="alert" className="notice error">
                {error}
              </p>
            )}
          </section>
        </div>
      )}
    </section>
  );
}
