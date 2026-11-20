"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import styles from "./subscription-registration.module.css";

export type SubscriptionPlan = {
  id: string;
  name: string;
  description?: string | null;
  price: string | number;
  subscriptionDays: number;
  branchLimit: number;
  isFree: boolean;
  features?: unknown;
};

function Icon({ name }: { name: string }) {
  const paths: Record<string, ReactNode> = {
    building: (
      <>
        <rect x="4" y="3" width="16" height="18" rx="2" />
        <path d="M8 7h1m6 0h1M8 11h1m6 0h1M9 21v-5h6v5" />
      </>
    ),
    pin: (
      <>
        <path d="M20 10c0 6-8 11-8 11S4 16 4 10a8 8 0 1 1 16 0Z" />
        <circle cx="12" cy="10" r="2.5" />
      </>
    ),
    user: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21v-2a8 8 0 0 1 16 0v2" />
      </>
    ),
    mail: (
      <>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="m3 6 9 7 9-7" />
      </>
    ),
    phone: (
      <path d="M22 16.9v3a2 2 0 0 1-2.2 2A19.8 19.8 0 0 1 3.1 5.2 2 2 0 0 1 5.1 3h3l2 5-2 2a16 16 0 0 0 6 6l2-2Z" />
    ),
    file: (
      <>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
        <path d="M14 2v6h6M8 13h8m-8 4h5" />
      </>
    ),
    globe: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3a19 19 0 0 1 0 18 19 19 0 0 1 0-18Z" />
      </>
    ),
    shield: (
      <>
        <path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Z" />
        <path d="m8 12 3 3 5-6" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
    back: <path d="M20 12H4m6-6-6 6 6 6" />,
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    hash: <path d="M4 9h16M3 15h16M10 3 6 21M18 3l-4 18" />,
    link: (
      <>
        <path d="m10 13 4-4m-5 8-2 2a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0m0 0 2-2a4 4 0 0 1 6 6l-5 5a4 4 0 0 1-6 0" />
      </>
    ),
  };
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name] ?? paths.building}
    </svg>
  );
}

export { Icon as SubscriptionIcon };

function Field({
  id,
  label,
  required,
  optional,
  icon,
  children,
  hint,
}: {
  id: string;
  label: string;
  required?: boolean;
  optional?: boolean;
  icon?: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <div className={styles.field}>
      <label htmlFor={id}>
        {label}
        {required && <span className={styles.required}> *</span>}
        {optional && <span className={styles.optional}> (ถ้ามี)</span>}
      </label>
      <div className={icon ? styles.inputIcon : styles.inputWrap}>
        {icon && <Icon name={icon} />} {children}
      </div>
      {hint && <p className={styles.hint}>{hint}</p>}
    </div>
  );
}

const CLINIC_BASE_DOMAIN = process.env.NEXT_PUBLIC_CLINIC_BASE_DOMAIN?.trim() || "lvh.me";
// Match the public checkout DTO and reserved names enforced by the API.
const SUBDOMAIN_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])?$/;
const RESERVED_SUBDOMAINS = new Set(["www", "api", "app", "admin", "platform", "support", "status", "mail"]);

function organizationSlug(name: string) {
  return name.toLowerCase().normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63)
    .replace(/-+$/g, "");
}

function withRandomSuffix(slug: string) {
  const suffix = Math.random().toString(36).slice(2, 8).padEnd(6, "0");
  return `${(slug || "clinic").slice(0, 56).replace(/-+$/g, "")}-${suffix}`;
}

export function SubscriptionRegistration({
  plan,
  apiBase,
  onBack,
  variant = "page",
}: {
  plan: SubscriptionPlan;
  apiBase: string;
  onBack: () => void;
  variant?: "page" | "dialog";
}) {
  const [form, setForm] = useState({
    clinicName: "",
    branchName: "",
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
  });
  const [billing, setBilling] = useState({
    name: "",
    email: "",
    address: "",
    taxId: "",
    branch: "",
  });
  const [sameEmail, setSameEmail] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [customSubdomain, setCustomSubdomain] = useState<string | null>(null);
  const [fallbackSubdomain, setFallbackSubdomain] = useState("");
  const [subdomainAlternative, setSubdomainAlternative] = useState("");
  const [subdomainError, setSubdomainError] = useState("");
  const [domainCheck, setDomainCheck] = useState<{
    name: string;
    status: "available" | "taken" | "unreachable";
  } | null>(null);
  const requestKey = useRef("");
  const submitting = useRef(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const subdomainInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (subdomainError && !busy) subdomainInputRef.current?.focus();
  }, [subdomainError, busy]);
  useEffect(() => {
    if (variant !== "dialog") return;
    const dialog = dialogRef.current;
    const opener =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const previousOverflow = document.body.style.overflow;
    dialog?.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      dialog?.close();
      document.body.style.overflow = previousOverflow;
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [variant]);
  const Root = variant === "dialog" ? "div" : "main";

  const money = (value: number) =>
    new Intl.NumberFormat("th-TH", { maximumFractionDigits: 2 }).format(value);
  const amount = Number(plan.price);
  const slug = organizationSlug(form.clinicName);
  const suggestedSubdomain = !form.clinicName.trim()
    ? ""
    : SUBDOMAIN_PATTERN.test(slug) && !RESERVED_SUBDOMAINS.has(slug)
      ? slug
      : fallbackSubdomain;
  const subdomain = customSubdomain ?? suggestedSubdomain;
  const validSubdomain = SUBDOMAIN_PATTERN.test(subdomain) && !RESERVED_SUBDOMAINS.has(subdomain);

  const availability = validSubdomain
    ? domainCheck?.name === subdomain ? domainCheck.status : "checking"
    : null;

  useEffect(() => {
    if (!validSubdomain) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(
          `${apiBase}/subscription-orders/availability/${encodeURIComponent(subdomain)}`,
          { signal: controller.signal, cache: "no-store" },
        );
        const result = await response.json();
        if (!response.ok || !result.success || typeof result.data?.available !== "boolean") {
          throw new Error("Invalid availability response");
        }
        if (!controller.signal.aborted) {
          setDomainCheck({ name: subdomain, status: result.data.available ? "available" : "taken" });
        }
      } catch {
        if (!controller.signal.aborted) setDomainCheck({ name: subdomain, status: "unreachable" });
      }
    }, 350);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [apiBase, subdomain, validSubdomain]);

  function changeSubdomain(value: string) {
    setCustomSubdomain(value.toLowerCase());
    setSubdomainAlternative("");
    setSubdomainError("");
    requestKey.current = "";
  }

  function changeOwner(key: keyof typeof form, value: string) {
    if (key === "clinicName" && customSubdomain === null) {
      const nextSlug = organizationSlug(value);
      if (value.trim() && (!SUBDOMAIN_PATTERN.test(nextSlug) || RESERVED_SUBDOMAINS.has(nextSlug)) && !fallbackSubdomain) {
        setFallbackSubdomain(withRandomSuffix("clinic"));
      }
      setSubdomainAlternative("");
      setSubdomainError("");
    }
    setForm((current) => ({ ...current, [key]: value }));
    requestKey.current = "";
  }
  function changeBilling(key: keyof typeof billing, value: string) {
    setBilling((current) => ({ ...current, [key]: value }));
    requestKey.current = "";
  }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || availability === "checking" || availability === "taken") return;
    if (!validSubdomain) {
      setSubdomainError(RESERVED_SUBDOMAINS.has(subdomain)
        ? "ชื่อนี้สงวนไว้ กรุณาเลือกชื่อ URL อื่น"
        : "ใช้ a–z, 0–9 และขีดกลาง ยาว 1 ตัวหรือ 3–63 ตัว และห้ามขึ้นต้นหรือลงท้ายด้วยขีดกลาง");
      return;
    }
    submitting.current = true;
    setBusy(true);
    setError("");
    if (!requestKey.current)
      requestKey.current = `request-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
    try {
      const response = await fetch(`${apiBase}/subscription-orders`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": requestKey.current,
        },
        body: JSON.stringify({
          ...form,
          packageId: plan.id,
          subdomain,
          billing: {
            ...billing,
            email: sameEmail ? form.email : billing.email,
          },
        }),
      });
      const result = await response.json();
      if (result.error?.code === "SUBDOMAIN_ALREADY_EXISTS") {
        setDomainCheck({ name: subdomain, status: "taken" });
        setSubdomainError("URL นี้ถูกใช้หรือจองแล้ว กรุณาเลือกชื่ออื่น");
        setSubdomainAlternative(withRandomSuffix(slug || subdomain));
        return;
      }
      if (!response.ok || !result.success || !result.data?.ticketUrl)
        throw new Error(result.message || "ส่งคำขอไม่สำเร็จ กรุณาลองอีกครั้ง");
      window.location.assign(result.data.ticketUrl);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "ส่งคำขอไม่สำเร็จ");
    } finally {
      setBusy(false);
      submitting.current = false;
    }
  }
  const view = (
    <Root
      className={`${styles.page} ${variant === "dialog" ? styles.dialogMode : ""}`}
    >
      <header className={styles.topbar}>
        <Link className={styles.brand} href="/">
          Klinic<span>.</span>
        </Link>
        <button
          type="button"
          disabled={busy}
          onClick={onBack}
          className={styles.back}
        >
          <Icon name="back" />
          กลับไปเลือกแพ็กเกจ
        </button>
      </header>
      <div className={styles.checkout}>
        <aside className={styles.summary} aria-label="สรุปแพ็กเกจที่เลือก">
          <div className={styles.summaryContent}>
            <span className={styles.badge}>
              <span />
              เริ่มต้นระบบคลินิกของคุณ
            </span>
            <p className={styles.eyebrow}>YOUR KLINIC PLAN</p>
            <h1>สมัคร {plan.name}</h1>
            {plan.description && (
              <p className={styles.description}>{plan.description}</p>
            )}
            <div className={styles.price}>
              <strong>฿{money(amount)}</strong>
              <span>/ {plan.subscriptionDays} วัน</span>
            </div>
            <ul className={styles.benefits}>
              <li>
                <span className={styles.benefitIcon}>
                  <Icon name="check" />
                </span>
                <span>
                  รองรับสูงสุด <strong>{plan.branchLimit ?? 1} สาขา</strong>{" "}
                  กรอกสาขาแรกก่อน และเพิ่มสาขาตามโควตาภายหลังได้
                </span>
              </li>
              <li>
                <span className={styles.benefitIcon}>
                  <Icon name="globe" />
                </span>
                <span>
                  ระบบจัดเตรียม <strong>URL เฉพาะองค์กร</strong>{" "}
                  ให้อัตโนมัติหลังสร้างคลินิกสำเร็จ
                </span>
              </li>
              <li>
                <span className={styles.benefitIcon}>
                  <Icon name="shield" />
                </span>
                <span>
                  <strong>ยังไม่เริ่มนับวันใช้งาน</strong>{" "}
                  {plan.isFree
                    ? "จนกว่าแอดมินอนุมัติและสร้างองค์กรกับสาขาแรกพร้อมใช้งาน"
                    : "จนกว่าจะยืนยันยอดโอนและสร้างองค์กรกับสาขาแรกพร้อมใช้งาน"}
                </span>
              </li>
            </ul>
            <div className={styles.periodNote}>
              <Icon name="clock" />
              <span>
                ทุกสาขาใช้วันหมดอายุเดียวกัน การเพิ่มสาขาไม่เริ่มนับวันใหม่
              </span>
            </div>
          </div>
          <div className={styles.total}>
            <div>
              <span>
                {plan.subscriptionDays} วัน · สูงสุด {plan.branchLimit ?? 1}{" "}
                สาขา
              </span>
              <span>฿{money(amount)}</span>
            </div>
            <div>
              <strong>ยอดชำระรวม</strong>
              <strong>฿{money(amount)}</strong>
            </div>
            <p>
              {plan.isFree
                ? "ไม่มีค่าใช้จ่าย รอเจ้าหน้าที่อนุมัติเปิดใช้งาน"
                : "โอนชำระหลังได้รับ Invoice จากเจ้าหน้าที่"}
            </p>
          </div>
        </aside>
        <section
          className={styles.formArea}
          aria-labelledby="registration-title"
        >
          <div className={styles.formIntro}>
            {variant === "dialog" && (
              <button
                type="button"
                className={styles.closeDialog}
                aria-label="ปิดหน้าต่างสมัคร"
                disabled={busy}
                onClick={onBack}
              >
                ×
              </button>
            )}
            <p className={styles.eyebrow}>SUBSCRIPTION REQUEST</p>
            <h2 id="registration-title">ข้อมูลการสมัคร</h2>
            <p>กรอกข้อมูลเพื่อให้เราเตรียมคลินิกและเอกสารให้คุณ</p>
          </div>
          <form onSubmit={submit} className={styles.form} aria-busy={busy}>
            <fieldset disabled={busy} className={styles.fieldset}>
              <legend>
                <span>1</span>ข้อมูลองค์กรและบัญชีผู้ดูแล (Owner)
              </legend>
              <div className={styles.pair}>
                <Field
                  id="subscription-org"
                  label="ชื่อองค์กร / คลินิก"
                  required
                  icon="building"
                >
                  <input
                    id="subscription-org"
                    required
                    maxLength={200}
                    placeholder="เช่น คลินิกเวชกรรม..."
                    value={form.clinicName}
                    onChange={(e) => changeOwner("clinicName", e.target.value)}
                  />
                </Field>
                <Field
                  id="subscription-branch"
                  label="ชื่อสาขาแรก"
                  required
                  icon="pin"
                >
                  <input
                    id="subscription-branch"
                    required
                    maxLength={200}
                    placeholder="เช่น สาขาสยามสแควร์"
                    value={form.branchName}
                    onChange={(e) => changeOwner("branchName", e.target.value)}
                  />
                </Field>
              </div>
              <div>
                <Field id="subscription-subdomain" label="URL เข้าใช้งานขององค์กร" required icon="link">
                  <input
                    id="subscription-subdomain"
                    ref={subdomainInputRef}
                    required
                    maxLength={63}
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    placeholder="เช่น kk-wellness"
                    value={subdomain}
                    aria-invalid={Boolean(subdomainError) || availability === "taken"}
                    aria-describedby={`subscription-domain-preview subscription-domain-status${subdomainError ? " subscription-domain-error" : ""}`}
                    onChange={(event) => changeSubdomain(event.target.value)}
                  />
                </Field>
                <p id="subscription-domain-preview" className={styles.domainPreview}>
                  <strong>{validSubdomain ? `${subdomain}.${CLINIC_BASE_DOMAIN}` : `ชื่อองค์กร.${CLINIC_BASE_DOMAIN}`}</strong>
                  {" · ทุกสาขาใช้งานผ่าน URL นี้"}
                </p>
                <div id="subscription-domain-status" role="status">
                  {availability === "checking" && <p className={styles.domainPreview}>กำลังตรวจสอบ URL…</p>}
                  {availability === "available" && <p className={styles.domainAvailable}>URL นี้ว่าง</p>}
                  {availability === "taken" && !subdomainError && <p className={styles.domainError}>URL นี้ถูกใช้หรือจองแล้ว กรุณาเลือกชื่ออื่น</p>}
                  {availability === "unreachable" && <p className={styles.domainPreview}>ตรวจ URL ล่วงหน้าไม่ได้ ระบบจะตรวจอีกครั้งเมื่อส่งคำขอ</p>}
                </div>
                {subdomainError && <p id="subscription-domain-error" className={styles.domainError} role="alert">{subdomainError}</p>}
                {(subdomainAlternative || availability === "taken") && (
                  <button type="button" className={styles.domainAlternative} onClick={() => changeSubdomain(subdomainAlternative || withRandomSuffix(slug || subdomain))}>
                    {subdomainAlternative ? `ใช้ ${subdomainAlternative}.${CLINIC_BASE_DOMAIN}` : "ลองชื่อที่เติมรหัสท้าย"}
                  </button>
                )}
              </div>
              <div className={styles.pair}>
                <Field
                  id="subscription-first"
                  label="ชื่อ Owner"
                  required
                  icon="user"
                >
                  <input
                    id="subscription-first"
                    required
                    maxLength={100}
                    autoComplete="given-name"
                    placeholder="ชื่อจริง"
                    value={form.firstName}
                    onChange={(e) => changeOwner("firstName", e.target.value)}
                  />
                </Field>
                <Field id="subscription-last" label="นามสกุล" required>
                  <input
                    id="subscription-last"
                    required
                    maxLength={100}
                    autoComplete="family-name"
                    placeholder="นามสกุล"
                    value={form.lastName}
                    onChange={(e) => changeOwner("lastName", e.target.value)}
                  />
                </Field>
              </div>
              <Field
                id="subscription-email"
                label="อีเมล Owner (ใช้สำหรับเข้าสู่ระบบ)"
                required
                icon="mail"
                hint="ใช้เป็นบัญชีเข้าสู่ระบบ และรับลิงก์ตั้งรหัสผ่านเมื่อคลินิกพร้อมใช้งาน"
              >
                <input
                  id="subscription-email"
                  required
                  type="email"
                  maxLength={254}
                  autoComplete="email"
                  placeholder="owner@yourclinic.com"
                  value={form.email}
                  onChange={(e) => changeOwner("email", e.target.value)}
                />
              </Field>
              <Field
                id="subscription-phone"
                label="เบอร์โทรติดต่อ"
                optional
                icon="phone"
              >
                <input
                  id="subscription-phone"
                  type="tel"
                  maxLength={30}
                  autoComplete="tel"
                  placeholder="08X-XXX-XXXX"
                  value={form.phone}
                  onChange={(e) => changeOwner("phone", e.target.value)}
                />
              </Field>
            </fieldset>
            <fieldset
              disabled={busy}
              className={`${styles.fieldset} ${styles.invoiceSection}`}
            >
              <legend>
                <span>2</span>ข้อมูลออกเอกสาร Invoice
              </legend>
              <Field
                id="subscription-buyer"
                label="ชื่อผู้รับ Invoice / บริษัท"
                required
                icon="file"
              >
                <input
                  id="subscription-buyer"
                  required
                  maxLength={200}
                  placeholder="ชื่อบุคคล หรือ ชื่อบริษัทจำกัด"
                  value={billing.name}
                  onChange={(e) => changeBilling("name", e.target.value)}
                />
              </Field>
              <div className={styles.field}>
                <div className={styles.invoiceEmailHeader}>
                  <label htmlFor="subscription-billing-email">
                    อีเมลรับเอกสาร Invoice{" "}
                    <span className={styles.required}>*</span>
                  </label>
                  <label className={styles.toggle}>
                    <input
                      type="checkbox"
                      role="switch"
                      checked={sameEmail}
                      onChange={(e) => {
                        setSameEmail(e.target.checked);
                        requestKey.current = "";
                      }}
                    />
                    <span className={styles.switchTrack} />
                    <span>ใช้อีเมลเดียวกับ Owner</span>
                  </label>
                </div>
                <div
                  className={`${styles.inputIcon} ${sameEmail ? styles.syncedInput : ""}`}
                >
                  <Icon name="mail" />
                  <input
                    id="subscription-billing-email"
                    type="email"
                    required
                    maxLength={254}
                    placeholder="accounting@yourclinic.com"
                    readOnly={sameEmail}
                    value={sameEmail ? form.email : billing.email}
                    onChange={(e) => changeBilling("email", e.target.value)}
                  />
                  {sameEmail && (
                    <span className={styles.synced}>
                      <Icon name="link" />
                      เชื่อมต่อแล้ว
                    </span>
                  )}
                </div>
              </div>
              <Field
                id="subscription-address"
                label="ที่อยู่สำหรับออก Invoice"
                required
              >
                <textarea
                  id="subscription-address"
                  required
                  maxLength={500}
                  rows={3}
                  autoComplete="street-address"
                  placeholder="เลขที่อาคาร ถนน แขวง/ตำบล เขต/อำเภอ จังหวัด รหัสไปรษณีย์"
                  value={billing.address}
                  onChange={(e) => changeBilling("address", e.target.value)}
                />
              </Field>
              <div className={styles.pair}>
                <Field
                  id="subscription-tax"
                  label="เลขประจำตัวผู้เสียภาษี"
                  optional
                  icon="hash"
                >
                  <input
                    id="subscription-tax"
                    maxLength={30}
                    placeholder="เลขประจำตัวผู้เสียภาษี"
                    value={billing.taxId}
                    onChange={(e) => changeBilling("taxId", e.target.value)}
                  />
                </Field>
                <Field
                  id="subscription-invoice-branch"
                  label="สำนักงานใหญ่ / สาขา"
                  optional
                  icon="building"
                >
                  <input
                    id="subscription-invoice-branch"
                    maxLength={100}
                    placeholder="เช่น สำนักงานใหญ่"
                    value={billing.branch}
                    onChange={(e) => changeBilling("branch", e.target.value)}
                  />
                </Field>
              </div>
            </fieldset>
            {error && (
              <p className={styles.error} role="alert">
                {error}
              </p>
            )}
            <div className={styles.info}>
              <span>
                <Icon name="clock" />
              </span>
              <p>
                {plan.isFree
                  ? "ส่งคำขอแล้ว เจ้าหน้าที่จะรับเรื่องและอนุมัติแพ็กเกจฟรี ไม่ต้องโอนชำระหรือแนบสลิป "
                  : "ส่งคำขอแล้ว เจ้าหน้าที่จะรับเรื่องและส่ง Invoice พร้อมบัญชีธนาคาร "}
                <strong>การส่งแบบฟอร์มยังไม่เริ่มนับอายุแพ็กเกจ</strong>
              </p>
            </div>
            <div className={styles.actions}>
              <button
                type="button"
                className={styles.cancel}
                disabled={busy}
                onClick={onBack}
              >
                ยกเลิก
              </button>
              <button className={styles.submit} disabled={busy || availability === "checking" || availability === "taken"}>
                {busy ? "กำลังส่งคำขอ…" : "ส่งคำขอสมัคร"}
                <Icon name="arrow" />
              </button>
            </div>
          </form>
        </section>
      </div>
      <p className={styles.footer}>Klinic · จัดการคลินิกและทุกสาขาในที่เดียว</p>
    </Root>
  );
  return variant === "dialog" ? (
    <dialog
      ref={dialogRef}
      className={styles.modalDialog}
      aria-label={`สมัคร ${plan.name}`}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onBack();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) onBack();
      }}
    >
      {view}
    </dialog>
  ) : (
    view
  );
}
