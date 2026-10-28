"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { ApiClientError } from "@/lib/api";

type Draft = {
  clinicName: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  password: string;
  terms: boolean;
};

type SignupResult = {
  email: string;
  emailDelivery: "PENDING" | "SENT" | "SKIPPED" | "FAILED";
  appUrl: string | null;
};

type StreamSignupResult = Pick<SignupResult, "emailDelivery" | "appUrl">;

type SignupStep =
  | "VALIDATING"
  | "ACCOUNT_CREATED"
  | "CLINIC_PROVISIONING"
  | "CLINIC_READY"
  | "OWNER_ACTIVATED"
  | "EMAIL_QUEUED"
  | "COMPLETED"
  | "FAILED";

const signupSteps: Array<{ step: SignupStep; label: string }> = [
  { step: "VALIDATING", label: "ตรวจสอบข้อมูล" },
  { step: "ACCOUNT_CREATED", label: "สร้างบัญชี Owner" },
  { step: "CLINIC_PROVISIONING", label: "เตรียม Clinic และสิทธิ์" },
  { step: "CLINIC_READY", label: "เปิดแพ็กเกจ Free" },
  { step: "OWNER_ACTIVATED", label: "เปิดใช้งาน Owner" },
  { step: "EMAIL_QUEUED", label: "เตรียมอีเมล Owner Portal" },
  { step: "COMPLETED", label: "สร้างคลินิกสำเร็จ" },
];

const initialDraft: Draft = {
  clinicName: "",
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  password: "",
  terms: false,
};

export default function PublicLanding() {
  const [draft, setDraft] = useState(initialDraft);
  const [subdomainSuffix, setSubdomainSuffix] = useState("");
  const [submitted, setSubmitted] = useState<SignupResult | null>(null);
  const [currentStep, setCurrentStep] = useState<SignupStep | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [signupModalOpen, setSignupModalOpen] = useState(false);
  const generatedSubdomain = useMemo(() => {
    if (!subdomainSuffix) return "";
    const slug = draft.clinicName
      .trim()
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 24);
    return `${slug || "clinic"}-${subdomainSuffix}`;
  }, [draft.clinicName, subdomainSuffix]);

  useEffect(() => {
    if (!signupModalOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [signupModalOpen]);

  function update<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setSubmitted(null);
    setCurrentStep(null);
  }

  function updateClinicName(value: string) {
    update("clinicName", value);
    if (value.trim() && !subdomainSuffix) setSubdomainSuffix(randomSuffix());
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setSubmitted(null);
    setCurrentStep("VALIDATING");
    setSignupModalOpen(true);
    try {
      const signup = await streamSignup(
        {
          clinicName: draft.clinicName.trim(),
          email: draft.email.trim().toLowerCase(),
          firstName: draft.firstName.trim(),
          lastName: draft.lastName.trim(),
          ...(draft.phone.trim() ? { phone: draft.phone.trim() } : {}),
          password: draft.password,
          acceptedTermsVersion: "2026-10-28",
        },
        setCurrentStep,
      );
      setSubmitted({
        email: draft.email.trim().toLowerCase(),
        emailDelivery: signup.emailDelivery,
        appUrl: signup.appUrl,
      });
      setDraft((current) => ({ ...current, password: "", terms: false }));
    } catch (cause) {
      setError(
        cause instanceof ApiClientError
          ? `${cause.code}: ${cause.message}`
          : "สร้างคลินิกไม่สำเร็จ",
      );
    } finally {
      setBusy(false);
    }
  }

  function closeSignupModal() {
    if (busy) return;
    setSignupModalOpen(false);
    setCurrentStep(null);
    setSubmitted(null);
    setError("");
  }

  return (
    <main className="public-site">
      <header className="public-nav">
        <Link className="public-brand" href="/">
          <span className="public-brand-mark">K+</span>
          <span>
            <b>Klinic</b>
            <small>Clinic operating system</small>
          </span>
        </Link>
        <nav aria-label="เมนูเว็บไซต์">
          <a href="#features">จุดเด่น</a>
          <a href="#pricing">แพ็กเกจ</a>
          <Link href="/owner">Owner Portal</Link>
          <Link className="public-nav-cta" href="/login">
            เข้าสู่ระบบคลินิก
          </Link>
        </nav>
      </header>

      <section className="public-hero">
        <div className="public-hero-copy">
          <p className="public-kicker">
            <span /> เริ่มต้นฟรี · ไม่ต้องใช้บัตรเครดิต
          </p>
          <h1>
            จัดการคลินิกให้เรียบง่าย
            <br />
            ตั้งแต่วันแรก
          </h1>
          <p>
            ระบบเดียวสำหรับนัดหมาย คิว การขาย และทีมงาน พร้อม URL
            ของคลินิกที่เปิดใช้งานได้จากทุกที่
          </p>
          <div className="public-hero-actions">
            <a className="public-primary" href="#start">
              เปิดคลินิกฟรี
            </a>
            <Link className="public-secondary" href="/login">
              ดูระบบทดสอบ <span>→</span>
            </Link>
          </div>
          <div className="public-trust-row">
            <span>✓ ตั้งค่าไม่เกิน 3 นาที</span>
            <span>✓ ข้อมูลแยกตามคลินิก</span>
            <span>✓ ยกเลิกได้ทุกเมื่อ</span>
          </div>
        </div>
        <div
          className="public-product-preview"
          aria-label="ตัวอย่างหน้าจอ Klinic"
        >
          <div className="preview-bar">
            <i />
            <i />
            <i />
            <span>happy-clinic.klinic.app</span>
          </div>
          <div className="preview-body">
            <aside>
              <b>K+</b>
              {["▦", "○", "≋", "+", "◇", "฿"].map((item, index) => (
                <span
                  className={index === 2 ? "active" : ""}
                  key={item + index}
                >
                  {item}
                </span>
              ))}
            </aside>
            <section>
              <header>
                <div>
                  <small>วันนี้ · 28 ตุลาคม</small>
                  <strong>ภาพรวมคลินิก</strong>
                </div>
                <button>+ สร้างนัด</button>
              </header>
              <div className="preview-metrics">
                <article>
                  <small>นัดหมายวันนี้</small>
                  <b>18</b>
                  <em>+12%</em>
                </article>
                <article>
                  <small>กำลังรอคิว</small>
                  <b>4</b>
                  <em>Live</em>
                </article>
                <article>
                  <small>ยอดขายวันนี้</small>
                  <b>฿24.8k</b>
                  <em>+8%</em>
                </article>
              </div>
              <div className="preview-card">
                <div>
                  <strong>คิวล่าสุด</strong>
                  <small>อัปเดตแบบเรียลไทม์</small>
                </div>
                {[
                  "HN-00241 · คุณพิมพ์ชนก",
                  "HN-00198 · คุณธนกร",
                  "HN-00265 · คุณกานดา",
                ].map((name, index) => (
                  <p key={name}>
                    <i>{index + 1}</i>
                    <span>
                      {name}
                      <small>
                        {index === 0
                          ? "รอตรวจ"
                          : index === 1
                            ? "กำลังรักษา"
                            : "เช็กอินแล้ว"}
                      </small>
                    </span>
                    <b>{index === 1 ? "ห้อง 2" : "10:" + (15 + index * 10)}</b>
                  </p>
                ))}
              </div>
            </section>
          </div>
        </div>
      </section>

      <section className="public-value" id="features">
        <div>
          <span>01</span>
          <b>เริ่มได้ทันที</b>
          <p>สร้าง Owner, Organization และคลินิกจากแบบฟอร์มเดียว</p>
        </div>
        <div>
          <span>02</span>
          <b>พร้อมสำหรับหลายสาขา</b>
          <p>หนึ่งบัญชี Owner ดูแลทุกคลินิกได้จาก Portal กลาง</p>
        </div>
        <div>
          <span>03</span>
          <b>สิทธิ์ตรงกับงาน</b>
          <p>Owner, Manager, Staff และ Doctor เห็นเฉพาะงานที่รับผิดชอบ</p>
        </div>
      </section>

      <section className="public-onboarding" id="pricing">
        <div className="public-plan-copy">
          <p className="public-kicker">FREE TIER</p>
          <h2>
            ทุกอย่างที่ต้องใช้
            <br />
            เพื่อเปิดคลินิกแรก
          </h2>
          <p>
            ทดลอง workflow จริงก่อนตัดสินใจอัปเกรด
            ไม่มีค่าแรกเข้าและไม่ผูกบัตรเครดิต
          </p>
          <article className="public-plan-card">
            <header>
              <span>
                <b>Free</b>
                <small>สำหรับคลินิกเริ่มต้น</small>
              </span>
              <strong>
                ฿0<small>/ เดือน</small>
              </strong>
            </header>
            <ul>
              <li>1 คลินิก</li>
              <li>Owner account 1 คน</li>
              <li>นัดหมาย คิว และข้อมูลลูกค้า</li>
              <li>Subdomain ของคลินิก</li>
            </ul>
            <p>แพ็กเกจถูกเลือกให้อัตโนมัติ ผู้ใช้ไม่ต้องกรอก Package ID</p>
          </article>
        </div>

        <form className="public-signup-card" id="start" onSubmit={submit}>
          <header>
            <div>
              <p className="public-kicker">OPEN YOUR CLINIC</p>
              <h2>เปิดคลินิกฟรี</h2>
              <p>กรอกข้อมูลที่จำเป็น ระบบจะสร้างส่วนที่เหลือให้</p>
            </div>
            <span>FREE</span>
          </header>

          <fieldset>
            <legend>
              <span>1</span>
              <div>
                <b>ข้อมูลคลินิก</b>
                <small>ชื่อและ URL ที่ลูกค้าของคุณจะเห็น</small>
              </div>
            </legend>
            <label className="public-wide">
              ชื่อคลินิก
              <input
                required
                minLength={2}
                maxLength={120}
                value={draft.clinicName}
                onChange={(event) => updateClinicName(event.target.value)}
                placeholder="เช่น Happy Clinic Bangkok"
              />
            </label>
            <div className="public-wide public-generated-domain">
              <span>URL คลินิก Free Tier</span>
              <b>
                {generatedSubdomain
                  ? `${generatedSubdomain}.klinic.app`
                  : "ระบบจะสร้าง URL หลังกรอกชื่อคลินิก"}
              </b>
              <small>
                <i /> ระบบตรวจชื่อซ้ำและเปลี่ยนรหัสท้ายให้อัตโนมัติ
              </small>
            </div>
          </fieldset>

          <fieldset>
            <legend>
              <span>2</span>
              <div>
                <b>ข้อมูลเจ้าของคลินิก</b>
                <small>ใช้เป็นบัญชี Owner กลางสำหรับทุกสาขา</small>
              </div>
            </legend>
            <label>
              ชื่อ
              <input
                required
                value={draft.firstName}
                onChange={(event) => update("firstName", event.target.value)}
                placeholder="ชื่อ"
              />
            </label>
            <label>
              นามสกุล
              <input
                required
                value={draft.lastName}
                onChange={(event) => update("lastName", event.target.value)}
                placeholder="นามสกุล"
              />
            </label>
            <label className="public-wide">
              Email
              <input
                required
                type="email"
                autoComplete="email"
                value={draft.email}
                onChange={(event) => update("email", event.target.value)}
                placeholder="owner@clinic.com"
              />
            </label>
            <label>
              เบอร์โทร <em>ไม่บังคับ</em>
              <input
                inputMode="tel"
                value={draft.phone}
                onChange={(event) => update("phone", event.target.value)}
                placeholder="08X-XXX-XXXX"
              />
            </label>
            <label>
              Password
              <input
                required
                type="password"
                minLength={8}
                autoComplete="new-password"
                value={draft.password}
                onChange={(event) => update("password", event.target.value)}
                placeholder="อย่างน้อย 8 ตัว"
              />
            </label>
          </fieldset>

          <label className="public-terms">
            <input
              required
              type="checkbox"
              checked={draft.terms}
              onChange={(event) => update("terms", event.target.checked)}
            />
            <span>
              ยอมรับเงื่อนไขการใช้งานและนโยบายความเป็นส่วนตัว{" "}
              <small>ระบบจะบันทึก version และเวลาที่ยอมรับ</small>
            </span>
          </label>
          <button className="public-submit" disabled={busy}>
            {busy ? "กำลังสร้างคลินิก..." : "สร้างคลินิก Free Tier"}{" "}
            <span>→</span>
          </button>
          <p className="public-form-note">
            Organization, Clinic ID, Role OWNER และ Subscription
            จะถูกสร้างโดยระบบ
          </p>
        </form>
      </section>

      {signupModalOpen && currentStep && (
        <div className="signup-modal-backdrop" role="presentation">
          <section
            aria-describedby="signup-progress-description"
            aria-labelledby="signup-progress-title"
            aria-modal="true"
            className={`signup-modal ${error ? "has-error" : submitted ? "is-complete" : ""}`}
            role="dialog"
          >
            {!busy && (
              <button
                aria-label="ปิดหน้าต่าง"
                className="signup-modal-close"
                onClick={closeSignupModal}
                type="button"
              >
                ×
              </button>
            )}
            <header className="signup-modal-header">
              <span className="signup-modal-symbol" aria-hidden="true">
                {error ? "!" : submitted ? "✓" : <i />}
              </span>
              <div>
                <p className="public-kicker">CLINIC SETUP</p>
                <h2 id="signup-progress-title">
                  {error
                    ? "สร้างคลินิกไม่สำเร็จ"
                    : submitted
                      ? "คลินิกของคุณพร้อมแล้ว"
                      : "กำลังสร้างคลินิกของคุณ"}
                </h2>
                <p id="signup-progress-description">
                  {error
                    ? "ตรวจสอบข้อความด้านล่าง แล้วลองสมัครอีกครั้ง"
                    : submitted
                      ? "ทุกขั้นตอนเสร็จสมบูรณ์ คุณสามารถเข้าสู่ระบบได้ทันที"
                      : "กรุณารอสักครู่ และอย่าปิดหน้าต่างนี้"}
                </p>
              </div>
            </header>

            <ol className="signup-modal-steps" aria-live="polite">
              {signupSteps.map((item, index) => {
                const activeIndex = signupSteps.findIndex(
                  (candidate) => candidate.step === currentStep,
                );
                const state = submitted
                  ? "done"
                  : index < activeIndex
                    ? "done"
                    : index === activeIndex
                      ? error
                        ? "failed"
                        : "active"
                      : "pending";
                return (
                  <li className={state} key={item.step}>
                    <span aria-hidden="true">
                      {state === "done" ? "✓" : state === "active" ? <i /> : index + 1}
                    </span>
                    <b>{item.label}</b>
                    <small>
                      {state === "done"
                        ? "เสร็จแล้ว"
                        : state === "active"
                          ? "กำลังดำเนินการ..."
                          : state === "failed"
                            ? "เกิดข้อผิดพลาด"
                            : "รอดำเนินการ"}
                    </small>
                  </li>
                );
              })}
            </ol>

            {error && <div className="signup-modal-error">{error}</div>}

            {submitted && (
              <div className="signup-modal-result">
                <p>
                  {submitted.emailDelivery === "SENT"
                    ? `ส่งรายละเอียดไปที่ ${submitted.email} แล้ว`
                    : submitted.emailDelivery === "PENDING"
                      ? `กำลังส่งรายละเอียดไปที่ ${submitted.email}`
                      : `คลินิกพร้อมใช้งาน แต่ยังส่งอีเมลไปที่ ${submitted.email} ไม่สำเร็จ`}
                </p>
                <div className="signup-modal-actions">
                  {submitted.appUrl && (
                    <a href={withLoginPath(submitted.appUrl)}>
                      เข้าสู่ระบบคลินิก <span>→</span>
                    </a>
                  )}
                  <Link href="/owner">เข้าสู่ Owner Portal</Link>
                </div>
              </div>
            )}

            {error && (
              <button
                className="signup-modal-retry"
                onClick={closeSignupModal}
                type="button"
              >
                กลับไปตรวจสอบข้อมูล
              </button>
            )}
          </section>
        </div>
      )}

      <footer className="public-footer">
        <Link className="public-brand" href="/">
          <span className="public-brand-mark">K+</span>
          <span>
            <b>Klinic</b>
            <small>Clinic operating system</small>
          </span>
        </Link>
        <p>ระบบทดสอบสำหรับ Klinic platform · Local development</p>
        <nav>
          <Link href="/activation">Activation Lab</Link>
          <Link href="/owner/setup">Platform Setup</Link>
          <Link href="/owner">Owner Portal</Link>
        </nav>
      </footer>
    </main>
  );
}

async function streamSignup(
  body: Record<string, unknown>,
  onProgress: (step: SignupStep) => void,
): Promise<StreamSignupResult> {
  const response = await fetch("/api/clinic/public/free-tier/signup/stream", {
    method: "POST",
    headers: { Accept: "text/event-stream", "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!response.ok || !response.body) {
    const payload = await response.json().catch(() => null);
    throw new ApiClientError(
      payload?.message ?? `API returned ${response.status}`,
      response.status,
      payload?.error?.code,
      payload?.error?.details,
    );
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let operationId: string | null = null;
  let result: StreamSignupResult | null = null;

  const processBlock = (block: string) => {
    let event = "message";
    const data: string[] = [];
    for (const line of block.split("\n")) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      if (line.startsWith("data:")) data.push(line.slice(5).trim());
    }
    if (!data.length) return;
    const payload = JSON.parse(data.join("\n"));
    if (event === "operation" && payload.id) {
      operationId = payload.id;
    }
    if (event === "progress" && payload.step && payload.step !== "FAILED") {
      onProgress(payload.step as SignupStep);
    }
    if (event === "complete") {
      onProgress("COMPLETED");
      result = {
        emailDelivery: payload.emailDelivery,
        appUrl: payload.branch?.appUrl ?? null,
      };
    }
    if (event === "error") {
      throw new ApiClientError(
        payload.message ?? "สร้างคลินิกไม่สำเร็จ",
        400,
        payload.code,
      );
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done }).replace(/\r\n/g, "\n");
    let boundary = buffer.indexOf("\n\n");
    while (boundary >= 0) {
      processBlock(buffer.slice(0, boundary));
      buffer = buffer.slice(boundary + 2);
      boundary = buffer.indexOf("\n\n");
    }
    if (done) break;
  }
  if (!result) {
    if (operationId) return pollSignupStatus(operationId, onProgress);
    throw new ApiClientError("การเชื่อมต่อ progress สิ้นสุดก่อนงานสำเร็จ", 502);
  }
  return result;
}

async function pollSignupStatus(
  operationId: string,
  onProgress: (step: SignupStep) => void,
): Promise<StreamSignupResult> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const response = await fetch(
      `/api/clinic/public/free-tier/signup/${encodeURIComponent(operationId)}/status`,
      { cache: "no-store" },
    );
    if (response.ok) {
      const payload = await response.json();
      const status = payload.data;
      if (status.currentStep && status.currentStep !== "FAILED") {
        onProgress(status.currentStep as SignupStep);
      }
      if (status.status === "SUCCEEDED") {
        return {
          emailDelivery:
            status.emailDelivery === "SENT" || status.emailDelivery === "FAILED"
              ? status.emailDelivery
              : "PENDING",
          appUrl: status.appUrl ?? null,
        };
      }
      if (status.status === "FAILED") {
        throw new ApiClientError(
          status.errorMessage ?? "สร้างคลินิกไม่สำเร็จ",
          400,
          status.errorCode,
        );
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new ApiClientError("หมดเวลารอตรวจสอบสถานะการสร้างคลินิก", 504);
}

function withLoginPath(appUrl: string) {
  return `${appUrl.replace(/\/$/, "")}/login`;
}

function randomSuffix() {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const values = new Uint8Array(4);
  crypto.getRandomValues(values);
  return Array.from(values, (value) => alphabet[value % alphabet.length]).join(
    "",
  );
}
