"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { apiRequest } from "@/lib/api";
import { createClientId } from "@/lib/client-id";
import { readOwnerDirectoryPages } from "@/lib/owner-directory-pages";
import styles from "./owner-package-directory.module.css";

export type OwnerBranch = {
  clinicId: string;
  name: string;
  code: string;
  provisioningStatus: string;
  accessStatus: string;
  subscriptionId: string | null;
  canEnter: boolean;
  subscription: { expiresAt: string | null } | null;
};

type Plan = {
  id: string;
  packageName: string;
  allocated: number;
  branchLimit: number;
  remaining: number;
  startsAt: string | null;
  expiresAt: string | null;
  subscriptionDays: number;
  renewalAmountMinor: number | null;
  canCreate: boolean;
  status: "ACTIVE" | "EXPIRED" | "PENDING_START";
};

type Offer = {
  id: string;
  name: string;
  price: string;
  subscriptionDays: number;
  branchLimit: number;
};

type Order = {
  id: string;
  purpose: "ADDITIONAL_PACKAGE" | "PACKAGE_RENEWAL";
  packageName: string;
  requestStatus: string;
  amountMinor: number;
  createdAt: string;
  ticketExpiresAt: string | null;
};

type DialogState =
  | { kind: "purchase" }
  | { kind: "branch" | "renew"; plan: Plan }
  | { kind: "ticket"; order: Order };

type Filter = "all" | "quota" | "current";
const filters: { value: Filter; label: string }[] = [
  { value: "all", label: "ทั้งหมด" },
  { value: "quota", label: "เพิ่มสาขาได้" },
  { value: "current", label: "กำลังใช้งาน" },
];
const planStatuses = {
  ACTIVE: "ใช้งานได้",
  EXPIRED: "หมดอายุ",
  PENDING_START: "รอเปิดใช้งาน",
};
const orderStatuses: Record<string, string> = {
  SUBMITTED: "รอรับเรื่อง",
  ACCEPTED: "รับเรื่องแล้ว",
  COMPLETED: "สำเร็จ",
};
const PAGE_SIZE = 12;
const money = (value: number) =>
  new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB" }).format(
    value,
  );
const date = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("th-TH", {
        dateStyle: "medium",
        timeZone: "Asia/Bangkok",
      }).format(new Date(value))
    : "—";
const errorText = (cause: unknown) =>
  cause instanceof Error ? cause.message : String(cause);
const orderKind = (order: Order) =>
  order.purpose === "PACKAGE_RENEWAL" ? "ต่ออายุ" : "ซื้อเพิ่ม";
const orderStatus = (order: Order) =>
  orderStatuses[order.requestStatus] ?? order.requestStatus;

const iconPaths = {
  plus: "M12 5v14M5 12h14",
  refresh: "M20 11a8 8 0 1 0-2 6m2-13v7h-7",
  search: "M21 21l-5-5m2-5a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z",
  calendar:
    "M4 9h16M8 3v4m8-4v4M6 5h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z",
  copy: "M8 8h11v13H8zm7-4H4v13",
  arrow: "M4 12h15m-6-6 6 6-6 6",
  close: "m6 6 12 12M18 6 6 18",
  ticket: "M4 4h16v16H4zm4 4h8m-8 4h8m-8 4h4",
  check: "m5 12 4 4L19 6",
};
function Icon({ name }: { name: keyof typeof iconPaths }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={iconPaths[name]} />
    </svg>
  );
}

function copyCodeInPage(code: string) {
  const previous = document.activeElement;
  const field = document.createElement("textarea");
  field.value = code;
  field.setAttribute("readonly", "");
  field.style.position = "fixed";
  field.style.opacity = "0";
  document.body.append(field);
  try {
    field.select();
    return document.execCommand("copy");
  } finally {
    field.remove();
    if (previous instanceof HTMLElement)
      previous.focus({ preventScroll: true });
  }
}

function dialogTitle(dialog: DialogState) {
  switch (dialog.kind) {
    case "branch":
      return "สร้างสาขาใหม่";
    case "renew":
      return "ต่ออายุแพ็กเกจเดิม";
    case "purchase":
      return "ซื้อแพ็กเกจเพิ่ม";
    case "ticket":
      return "รายละเอียดคำขอ";
  }
}

type Props = {
  token: string;
  organizationId: string;
  ownerEmail: string;
  branches: OwnerBranch[];
  currentClinicCode?: string;
  switching: boolean;
  onEnter: (clinicId: string, code: string) => void;
  onChanged: () => Promise<void>;
};

export function OwnerPackageDirectory({
  token,
  organizationId,
  ownerEmail,
  branches,
  currentClinicCode,
  switching,
  onEnter,
  onChanged,
}: Props) {
  const base = `/owner/organizations/${encodeURIComponent(organizationId)}`;
  const [plans, setPlans] = useState<Plan[]>([]);
  const [offers, setOffers] = useState<Offer[] | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");
  const [ticketUrl, setTicketUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [checkedAt, setCheckedAt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [loadingOffers, setLoadingOffers] = useState(false);
  const replay = useRef<{ signature: string; key: string } | null>(null);
  const inFlight = useRef(false);
  const modal = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const titleId = useId();

  const load = useCallback(async () => {
    const [subscriptions, history] = await Promise.all([
      readOwnerDirectoryPages<Plan>(`${base}/subscriptions`, token),
      apiRequest<Order[]>(`${base}/package-orders?limit=20`, { token }),
    ]);
    setCheckedAt(Date.now());
    setPlans(subscriptions);
    setOrders(history.data);
  }, [base, token]);

  useEffect(() => {
    void Promise.resolve().then(load)
      .catch((cause: unknown) => setError(errorText(cause)))
      .finally(() => setLoading(false));
  }, [load]);

  useEffect(() => {
    const element = modal.current;
    if (dialog && element && !element.open) element.showModal();
  }, [dialog]);

  function openDialog(next: DialogState) {
    opener.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setFormError("");
    setDialog(next);
  }

  function closeDialog() {
    modal.current?.close();
    setDialog(null);
    opener.current?.focus({ preventScroll: true });
  }

  async function loadOffers() {
    setLoadingOffers(true);
    setFormError("");
    try {
      const result = await apiRequest<Offer[]>(
        "/owner/packages?paidOnly=true",
        { token },
      );
      setOffers(result.data);
    } catch (cause) {
      setFormError(errorText(cause));
    } finally {
      setLoadingOffers(false);
    }
  }

  async function perform(action: () => Promise<void>, inDialog = false) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    (inDialog ? setFormError : setError)("");
    try {
      await action();
    } catch (cause) {
      (inDialog ? setFormError : setError)(errorText(cause));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  async function submit(path: string, payload: object) {
    const body = JSON.stringify(payload);
    const signature = path + body;
    if (replay.current?.signature !== signature) {
      replay.current = { signature, key: createClientId() };
    }
    const result = await apiRequest<{
      ticketUrl?: string;
      branch?: { provisioningStatus: string };
    }>(path, {
      token,
      method: "POST",
      headers: { "Idempotency-Key": replay.current.key },
      body,
    });
    replay.current = null;
    return result.data;
  }

  async function refreshDirectory() {
    try {
      await Promise.all([load(), onChanged()]);
    } catch (cause) {
      setError(errorText(cause));
    }
  }

  function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dialog || dialog.kind === "ticket") return;
    const form = new FormData(event.currentTarget);
    const text = (field: string) => String(form.get(field) ?? "").trim();

    void perform(async () => {
      if (dialog.kind === "branch") {
        const name = text("branchName");
        if (!name) throw new Error("กรุณากรอกชื่อสาขา");
        const data = await submit(`${base}/branches`, {
          name,
          subscriptionId: dialog.plan.id,
        });
        setTicketUrl("");
        setNotice(
          data.branch?.provisioningStatus === "READY"
            ? "สร้างสาขาสำเร็จ"
            : "ระบบกำลังเตรียมสาขา",
        );
      } else {
        const billing = {
          name: text("name"),
          email: text("email"),
          address: text("address"),
          taxId: text("taxId") || undefined,
        };
        if (!billing.name || !billing.address)
          throw new Error("กรุณากรอกชื่อผู้ซื้อและที่อยู่สำหรับออก Invoice");
        const path =
          dialog.kind === "purchase"
            ? `${base}/package-orders`
            : `${base}/subscriptions/${dialog.plan.id}/renewal-orders`;
        const data = await submit(
          path,
          dialog.kind === "purchase"
            ? { billing, packageId: text("packageId") }
            : { billing },
        );
        setTicketUrl(data.ticketUrl ?? "");
        setNotice("ส่งคำขอแล้ว กรุณาติดตาม Invoice ใน Ticket");
      }
      closeDialog();
      await refreshDirectory();
    }, true);
  }

  function isCurrent(branch: OwnerBranch) {
    return branch.canEnter && branch.code === currentClinicCode;
  }

  async function copyCode(code: string) {
    try {
      if (navigator.clipboard) await navigator.clipboard.writeText(code);
      else if (!copyCodeInPage(code)) throw new Error();
      setTicketUrl("");
      setNotice(`คัดลอกรหัสสาขา ${code} แล้ว`);
    } catch {
      setError(`คัดลอกอัตโนมัติไม่สำเร็จ กรุณาคัดลอกรหัส ${code}`);
    }
  }

  function renderBranch(branch: OwnerBranch) {
    const current = isCurrent(branch);
    const unavailable =
      branch.accessStatus === "SUSPENDED"
        ? "ปิดการเข้าใช้งาน"
        : branch.provisioningStatus === "READY"
          ? "ยังเข้าใช้งานไม่ได้"
          : "กำลังเตรียมสาขา";
    return (
      <li
        key={branch.clinicId}
        className={styles.branch}
        data-current={current}
      >
        <div className={styles.branchInfo}>
          <div>
            <strong>{branch.name}</strong>
            {current && (
              <span className={styles.status} data-tone="positive">
                กำลังใช้งาน
              </span>
            )}
          </div>
          <div className={styles.branchCode}>
            <code>{branch.code}</code>
            <button
              type="button"
              className={styles.iconButton}
              aria-label={`คัดลอกรหัสสาขา ${branch.name}`}
              onClick={() => void copyCode(branch.code)}
            >
              <Icon name="copy" />
            </button>
          </div>
        </div>
        {!current && (
          <button
            type="button"
            className={styles.switchButton}
            disabled={switching || !branch.canEnter}
            onClick={() => onEnter(branch.clinicId, branch.code)}
          >
            {branch.canEnter ? (
              <>
                เข้าสู่สาขา <Icon name="arrow" />
              </>
            ) : (
              unavailable
            )}
          </button>
        )}
      </li>
    );
  }

  const branchesByPlan = new Map<string | null, OwnerBranch[]>();
  for (const branch of branches) {
    const group = branchesByPlan.get(branch.subscriptionId) ?? [];
    group.push(branch);
    branchesByPlan.set(branch.subscriptionId, group);
  }
  const exactQuery = query.trim().toLocaleLowerCase("th");
  const matches = (value: string) =>
    value.toLocaleLowerCase("th").includes(exactQuery);
  const branchMatches = (branch: OwnerBranch) =>
    [branch.name, branch.code, branch.clinicId].some(matches);
  const visiblePlans = plans
    .flatMap((plan) => {
      const group = branchesByPlan.get(plan.id) ?? [];
      const visibleBranches = matches(plan.packageName)
        ? group
        : group.filter(branchMatches);
      if (!matches(plan.packageName) && !visibleBranches.length) return [];
      return [{ plan, group, visibleBranches }];
    })
    .filter(
      ({ plan, group }) =>
        filter === "all" ||
        (filter === "quota" ? plan.canCreate : group.some(isCurrent)),
    );
  const legacyBranches = (branchesByPlan.get(null) ?? []).filter(
    (branch) =>
      (filter === "all" || (filter === "current" && isCurrent(branch))) &&
      (matches("สาขาในแพ็กเกจเดิม") || branchMatches(branch)),
  );
  const pages = Math.max(1, Math.ceil(visiblePlans.length / PAGE_SIZE));
  const currentPage = Math.min(pages, page);
  const quotaCount = plans.filter((plan) => plan.canCreate).length;

  return (
    <section className={styles.directory} aria-label="แพ็กเกจและสาขา">
      <header className={styles.pageHeader}>
        <div>
          <h2>แพ็กเกจของคุณ</h2>
          <p>ดูโควตา วันหมดอายุ และเลือกสาขาที่ต้องการเข้าใช้งาน</p>
        </div>
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.button}
            disabled={busy || loading}
            onClick={() => void perform(refreshDirectory)}
          >
            <Icon name="refresh" /> รีเฟรช
          </button>
          <button
            type="button"
            className={styles.primary}
            disabled={busy}
            onClick={() => {
              openDialog({ kind: "purchase" });
              void loadOffers();
            }}
          >
            <Icon name="plus" /> ซื้อแพ็กเกจเพิ่ม
          </button>
        </div>
      </header>

      {error && (
        <div className={styles.error} role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className={styles.notice} role="status">
          <Icon name="check" />
          <div>
            {notice}
            {ticketUrl && (
              <a href={ticketUrl}>
                เปิด Ticket และดาวน์โหลด Invoice <Icon name="arrow" />
              </a>
            )}
          </div>
          <button
            type="button"
            className={styles.iconButton}
            aria-label="ปิดการแจ้งเตือน"
            onClick={() => setNotice("")}
          >
            <Icon name="close" />
          </button>
        </div>
      )}

      <div className={styles.toolbar} aria-label="ค้นหาและกรองแพ็กเกจ">
        <div className={styles.search}>
          <Icon name="search" />
          <input
            type="search"
            aria-label="ค้นหาแพ็กเกจหรือสาขา"
            placeholder="ค้นหาชื่อแพ็กเกจ ชื่อสาขา หรือรหัสสาขา"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
          />
          {query && (
            <button
              type="button"
              className={styles.iconButton}
              aria-label="ล้างการค้นหา"
              onClick={() => {
                setQuery("");
                setPage(1);
              }}
            >
              <Icon name="close" />
            </button>
          )}
        </div>
        <div className={styles.filters}>
          {filters.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              aria-pressed={filter === value}
              onClick={() => {
                setFilter(value);
                setPage(1);
              }}
            >
              {label}
              {value === "all"
                ? ` (${plans.length})`
                : value === "quota"
                  ? ` (${quotaCount})`
                  : ""}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className={styles.empty} role="status">
          กำลังโหลดแพ็กเกจ
        </p>
      ) : (
        <>
          {!visiblePlans.length && !legacyBranches.length && (
            <div className={styles.empty}>
              <strong>
                {query || filter !== "all"
                  ? "ไม่พบแพ็กเกจหรือสาขาที่ค้นหา"
                  : "ยังไม่มีแพ็กเกจ"}
              </strong>
              {(query || filter !== "all") && (
                <button
                  type="button"
                  className={styles.linkButton}
                  onClick={() => {
                    setQuery("");
                    setFilter("all");
                    setPage(1);
                  }}
                >
                  แสดงแพ็กเกจทั้งหมด
                </button>
              )}
            </div>
          )}
          <div className={styles.grid}>
            {visiblePlans
              .slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
              .map(({ plan, group, visibleBranches }) => {
                const days = plan.expiresAt
                  ? Math.ceil(
                      (Date.parse(plan.expiresAt) - checkedAt) / 86_400_000,
                    )
                  : 0;
                const percent = plan.branchLimit
                  ? Math.min(
                      100,
                      Math.round((plan.allocated / plan.branchLimit) * 100),
                    )
                  : 0;
                return (
                  <article
                    key={plan.id}
                    className={styles.card}
                    data-current={group.some(isCurrent)}
                  >
                    <div className={styles.cardBody}>
                      <header className={styles.cardHeader}>
                        <div>
                          <h3>{plan.packageName}</h3>
                          <p className={styles.dates}>
                            <Icon name="calendar" /> {date(plan.startsAt)} –{" "}
                            {date(plan.expiresAt)}
                            {plan.status === "ACTIVE" && days > 0 && (
                              <span>เหลือ {days} วัน</span>
                            )}
                          </p>
                        </div>
                        <span
                          className={styles.status}
                          data-tone={
                            plan.status === "ACTIVE"
                              ? "positive"
                              : plan.status === "EXPIRED"
                                ? "expired"
                                : "pending"
                          }
                        >
                          {planStatuses[plan.status]}
                        </span>
                      </header>
                      <div className={styles.quota}>
                        <div>
                          <span>
                            ใช้แล้ว{" "}
                            <strong>
                              {plan.allocated} / {plan.branchLimit}
                            </strong>{" "}
                            สาขา · <b>เหลือ {plan.remaining}</b>
                          </span>
                          <span>{percent}%</span>
                        </div>
                        <progress
                          aria-label={`โควตาที่ใช้ใน ${plan.packageName}`}
                          max={100}
                          value={percent}
                        />
                      </div>
                      {visibleBranches.length > 0 && (
                        <ul className={styles.branchList}>
                          {visibleBranches.map(renderBranch)}
                        </ul>
                      )}
                      {!group.length && !plan.canCreate && (
                        <p className={styles.muted}>ยังไม่มีสาขาในแพ็กเกจนี้</p>
                      )}
                      {plan.canCreate && (
                        <button
                          type="button"
                          className={styles.quickAdd}
                          disabled={busy}
                          onClick={() => openDialog({ kind: "branch", plan })}
                        >
                          <Icon name="plus" /> เพิ่มสาขาใหม่ · เหลือ{" "}
                          {plan.remaining} สิทธิ์
                        </button>
                      )}
                    </div>
                    <footer className={styles.cardFooter}>
                      {plan.canCreate ? (
                        <button
                          type="button"
                          className={styles.linkButton}
                          disabled={busy}
                          onClick={() => openDialog({ kind: "branch", plan })}
                        >
                          <Icon name="plus" /> สร้างสาขา
                        </button>
                      ) : (
                        <span className={styles.muted}>
                          {plan.status === "EXPIRED"
                            ? "แพ็กเกจหมดอายุ"
                            : plan.remaining === 0
                              ? "เต็มโควตา"
                              : "ยังเปิดสร้างสาขาไม่ได้"}
                        </span>
                      )}
                      {plan.renewalAmountMinor !== null && (
                        <button
                          type="button"
                          className={styles.linkButton}
                          disabled={busy}
                          onClick={() => openDialog({ kind: "renew", plan })}
                        >
                          ต่ออายุแพ็กเกจเดิม
                        </button>
                      )}
                    </footer>
                  </article>
                );
              })}
            {legacyBranches.length > 0 && (
              <article className={styles.card}>
                <div className={styles.cardBody}>
                  <h3>สาขาในแพ็กเกจเดิม</h3>
                  <ul className={styles.branchList}>
                    {legacyBranches.map(renderBranch)}
                  </ul>
                </div>
              </article>
            )}
          </div>
          {pages > 1 && (
            <nav className={styles.pagination} aria-label="หน้ารายการแพ็กเกจ">
              <button
                type="button"
                className={styles.button}
                disabled={currentPage === 1}
                onClick={() => setPage(currentPage - 1)}
              >
                ก่อนหน้า
              </button>
              <span>
                {currentPage} / {pages}
              </span>
              <button
                type="button"
                className={styles.button}
                disabled={currentPage === pages}
                onClick={() => setPage(currentPage + 1)}
              >
                ถัดไป
              </button>
            </nav>
          )}
        </>
      )}

      <section className={styles.history} aria-label="คำขอซื้อและต่ออายุ">
        <header>
          <span className={styles.historyIcon}>
            <Icon name="ticket" />
          </span>
          <div>
            <h3>คำขอซื้อและต่ออายุ</h3>
            <p>ติดตามสถานะและเปิด Ticket ของแต่ละรายการ</p>
          </div>
        </header>
        {orders.length ? (
          <ul>
            {orders.map((order) => (
              <li key={order.id}>
                <div>
                  <strong>{order.packageName}</strong>{" "}
                  <span
                    className={styles.status}
                    data-tone={
                      order.requestStatus === "COMPLETED"
                        ? "positive"
                        : "pending"
                    }
                  >
                    {orderStatus(order)}
                  </span>
                  <p>
                    {orderKind(order)} · {date(order.createdAt)} ·{" "}
                    <code>{order.id.slice(0, 8)}</code>
                  </p>
                </div>
                <button
                  type="button"
                  className={styles.button}
                  disabled={busy}
                  onClick={() => openDialog({ kind: "ticket", order })}
                >
                  ดูรายละเอียด <Icon name="arrow" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.historyEmpty}>
            {loading ? "กำลังโหลดคำขอ" : "ยังไม่มีคำขอซื้อหรือต่ออายุ"}
          </p>
        )}
      </section>

      {dialog && (
        <dialog
          ref={modal}
          className={styles.dialog}
          aria-labelledby={titleId}
          onCancel={(event) => {
            event.preventDefault();
            if (!busy) closeDialog();
          }}
        >
          <header>
            <div>
              <h3 id={titleId}>{dialogTitle(dialog)}</h3>
              {"plan" in dialog && <p>{dialog.plan.packageName}</p>}
            </div>
            <button
              type="button"
              autoFocus
              className={styles.iconButton}
              aria-label="ปิดหน้าต่าง"
              disabled={busy}
              onClick={closeDialog}
            >
              <Icon name="close" />
            </button>
          </header>
          {formError && (
            <p className={styles.error} role="alert">
              {formError}
            </p>
          )}
          {dialog.kind === "ticket" ? (
            <>
              <dl className={styles.summary}>
                <div>
                  <dt>แพ็กเกจ</dt>
                  <dd>{dialog.order.packageName}</dd>
                </div>
                <div>
                  <dt>ประเภทคำขอ</dt>
                  <dd>{orderKind(dialog.order)}</dd>
                </div>
                <div>
                  <dt>สถานะ</dt>
                  <dd>{orderStatus(dialog.order)}</dd>
                </div>
                <div>
                  <dt>ยอด</dt>
                  <dd>{money(dialog.order.amountMinor / 100)}</dd>
                </div>
                <div>
                  <dt>เลขอ้างอิง</dt>
                  <dd>
                    <code>{dialog.order.id}</code>
                  </dd>
                </div>
              </dl>
              <footer>
                <button
                  type="button"
                  className={styles.button}
                  disabled={busy}
                  onClick={closeDialog}
                >
                  ปิด
                </button>
                <button
                  type="button"
                  className={styles.primary}
                  disabled={
                    busy ||
                    !dialog.order.ticketExpiresAt ||
                    Date.parse(dialog.order.ticketExpiresAt) <= checkedAt
                  }
                  onClick={() =>
                    void perform(async () => {
                      const { data } = await apiRequest<{ ticketUrl: string }>(
                        `${base}/package-orders/${dialog.order.id}`,
                        { token },
                      );
                      window.location.assign(data.ticketUrl);
                    }, true)
                  }
                >
                  เปิด Ticket <Icon name="arrow" />
                </button>
              </footer>
            </>
          ) : (
            <form className={styles.form} onSubmit={submitForm}>
              {dialog.kind === "branch" ? (
                <>
                  <label>
                    ชื่อสาขา
                    <input
                      name="branchName"
                      placeholder="เช่น สาขาสยาม"
                      required
                      maxLength={200}
                    />
                  </label>
                  <dl className={styles.summary}>
                    <div>
                      <dt>โควตาหลังสร้าง</dt>
                      <dd>
                        {dialog.plan.allocated + 1} / {dialog.plan.branchLimit}{" "}
                        สาขา
                      </dd>
                    </div>
                    <div>
                      <dt>หมดอายุพร้อมแพ็กเกจ</dt>
                      <dd>{date(dialog.plan.expiresAt)}</dd>
                    </div>
                  </dl>
                </>
              ) : (
                <>
                  {dialog.kind === "purchase" ? (
                    <fieldset className={styles.offers}>
                      <legend>เลือกแพ็กเกจ</legend>
                      {loadingOffers ? (
                        <p role="status">กำลังโหลดแพ็กเกจ</p>
                      ) : offers?.length ? (
                        offers.map((offer) => (
                          <label key={offer.id}>
                            <input
                              type="radio"
                              name="packageId"
                              value={offer.id}
                              required
                            />
                            <span>
                              <strong>{offer.name}</strong>
                              <small>
                                {offer.branchLimit} สาขา ·{" "}
                                {offer.subscriptionDays} วัน
                              </small>
                            </span>
                            <b>{money(Number(offer.price))}</b>
                          </label>
                        ))
                      ) : (
                        <div className={styles.muted}>
                          {offers ? (
                            "ยังไม่มีแพ็กเกจที่เปิดขาย"
                          ) : (
                            <button
                              className={styles.button}
                              type="button"
                              onClick={() => void loadOffers()}
                            >
                              ลองโหลดแพ็กเกจอีกครั้ง
                            </button>
                          )}
                        </div>
                      )}
                    </fieldset>
                  ) : (
                    <dl className={styles.summary}>
                      <div>
                        <dt>หมดอายุปัจจุบัน</dt>
                        <dd>{date(dialog.plan.expiresAt)}</dd>
                      </div>
                      <div>
                        <dt>ระยะเวลาต่ออายุ</dt>
                        <dd>{dialog.plan.subscriptionDays} วัน</dd>
                      </div>
                      <div>
                        <dt>ยอดต่ออายุ</dt>
                        <dd>
                          {money((dialog.plan.renewalAmountMinor ?? 0) / 100)}
                        </dd>
                      </div>
                    </dl>
                  )}
                  <fieldset className={styles.billing}>
                    <legend>ข้อมูลสำหรับออก Invoice</legend>
                    <label>
                      ชื่อผู้ซื้อ / ชื่อบริษัท
                      <input
                        name="name"
                        autoComplete="organization"
                        required
                        maxLength={200}
                      />
                    </label>
                    <label>
                      อีเมลรับเอกสาร
                      <input
                        name="email"
                        type="email"
                        autoComplete="email"
                        defaultValue={ownerEmail}
                        required
                      />
                    </label>
                    <label className={styles.fullField}>
                      ที่อยู่
                      <textarea
                        name="address"
                        autoComplete="street-address"
                        required
                        maxLength={500}
                        rows={2}
                      />
                    </label>
                    <label className={styles.fullField}>
                      เลขผู้เสียภาษี (ถ้ามี)
                      <input name="taxId" maxLength={30} />
                    </label>
                  </fieldset>
                </>
              )}
              <footer>
                <button
                  type="button"
                  className={styles.button}
                  disabled={busy}
                  onClick={closeDialog}
                >
                  ยกเลิก
                </button>
                <button
                  className={styles.primary}
                  disabled={
                    busy ||
                    (dialog.kind === "purchase" &&
                      (loadingOffers || !offers?.length))
                  }
                >
                  {busy
                    ? "กำลังส่ง…"
                    : dialog.kind === "branch"
                      ? "ยืนยันสร้างสาขา"
                      : "ส่งคำขอ"}
                </button>
              </footer>
            </form>
          )}
        </dialog>
      )}
    </section>
  );
}
