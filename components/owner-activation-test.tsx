"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { ApiClientError, apiRequest } from "@/lib/api";

type Mode = "CREATE" | "EXISTING";
type Phase =
  | "IDLE"
  | "PLATFORM_LOGIN"
  | "CLINIC_CREATE"
  | "CLINIC_LOOKUP"
  | "ISSUE"
  | "ACTIVATE"
  | "VERIFY"
  | "DONE";
type RunningPhase = Exclude<Phase, "IDLE" | "DONE">;
type TenantDestination = {
  subdomain: string | null;
  appUrl: string | null;
};

const phaseText: Record<RunningPhase, string> = {
  PLATFORM_LOGIN: "ยืนยัน Platform Admin",
  CLINIC_CREATE: "สร้าง Clinic และ Owner",
  CLINIC_LOOKUP: "ค้นหา Clinic จาก Clinic Code",
  ISSUE: "ออก activation token แบบใช้ครั้งเดียว",
  ACTIVATE: "ตั้งรหัสผ่านและเปิดบัญชี Owner",
  VERIFY: "ตรวจสอบ Clinic Login",
};

const phaseErrorText: Record<RunningPhase, string> = {
  PLATFORM_LOGIN: "Platform Admin Login ไม่ผ่าน",
  CLINIC_CREATE: "สร้าง Clinic ไม่สำเร็จ",
  CLINIC_LOOKUP: "ค้นหา Clinic ไม่สำเร็จ",
  ISSUE: "ออก activation token ไม่สำเร็จ",
  ACTIVATE: "เปิดบัญชี Owner ไม่สำเร็จ",
  VERIFY: "ตรวจ Clinic Login ไม่สำเร็จ",
};

const localSeedAdmin = {
  email: "admin@platform.test",
  password: "Admin1234!",
};

const initialForm = {
  platformEmail: process.env.NODE_ENV === "development" ? localSeedAdmin.email : "",
  platformPassword:
    process.env.NODE_ENV === "development" ? localSeedAdmin.password : "",
  clinicName: "",
  clinicCode: "",
  ownerFirstName: "",
  ownerLastName: "",
  ownerEmail: "",
  subscriptionDays: "30",
  newPassword: "",
};

function tokenFromUrl(activationUrl: string) {
  const token = new URL(activationUrl, window.location.origin).searchParams.get("token");
  if (!token) throw new Error("Activation URL ไม่มี token");
  return token;
}

function errorMessage(error: unknown) {
  if (error instanceof ApiClientError) {
    return `${error.code ? `${error.code}: ` : ""}${error.message}`;
  }
  return error instanceof Error ? error.message : "ทดสอบ activation ไม่สำเร็จ";
}

function idempotencyKey() {
  return typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `activation-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export default function OwnerActivationTest() {
  const [mode, setMode] = useState<Mode>("CREATE");
  const [form, setForm] = useState(initialForm);
  const [phase, setPhase] = useState<Phase>("IDLE");
  const [notice, setNotice] = useState<{
    kind: "success" | "error" | "warning";
    text: string;
  } | null>(null);
  const [clinicDestination, setClinicDestination] =
    useState<TenantDestination | null>(null);
  const busy = !["IDLE", "DONE"].includes(phase);
  const steps: Array<{ phase: RunningPhase; label: string }> = [
    { phase: "PLATFORM_LOGIN", label: "Platform Admin Login" },
    mode === "CREATE"
      ? { phase: "CLINIC_CREATE", label: "สร้าง Clinic + Owner" }
      : { phase: "CLINIC_LOOKUP", label: "ค้นหา Clinic ที่ READY" },
    { phase: "ISSUE", label: "Issue single-use token" },
    { phase: "ACTIVATE", label: "ตั้งรหัสผ่าน Owner" },
    { phase: "VERIFY", label: "ตรวจ Clinic Login" },
  ];

  function updateForm(key: keyof typeof initialForm, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function selectMode(nextMode: Mode) {
    if (busy) return;
    setMode(nextMode);
    setPhase("IDLE");
    setNotice(null);
    setClinicDestination(null);
  }

  function fillLocalSeedAdmin() {
    setForm((current) => ({
      ...current,
      platformEmail: localSeedAdmin.email,
      platformPassword: localSeedAdmin.password,
    }));
    setPhase("IDLE");
    setNotice({
      kind: "warning",
      text: "เติมบัญชี Platform Admin จาก local seed แล้ว ใช้สำหรับ environment ทดสอบเท่านั้น",
    });
  }

  async function run(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice(null);
    setClinicDestination(null);
    let activated = false;
    let failedPhase: RunningPhase = "PLATFORM_LOGIN";

    try {
      setPhase(failedPhase);
      const platform = await apiRequest<{ accessToken: string }>("/platform/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email: form.platformEmail.trim().toLowerCase(),
          password: form.platformPassword,
        }),
      });

      const normalizedCode = form.clinicCode.trim().toUpperCase();
      let clinicId: string;
      let destination: TenantDestination;

      if (mode === "CREATE") {
        failedPhase = "CLINIC_CREATE";
        setPhase(failedPhase);
        const tenant = await apiRequest<{
          clinicId: string;
          provisioningStatus: string;
          subdomain: string | null;
          appUrl: string | null;
        }>(
          "/platform/clinics",
          {
            method: "POST",
            token: platform.data.accessToken,
            headers: { "Idempotency-Key": idempotencyKey() },
            body: JSON.stringify({
              clinicName: form.clinicName.trim(),
              clinicCode: normalizedCode,
              subscriptionDays: Number(form.subscriptionDays),
              admin: {
                email: form.ownerEmail.trim().toLowerCase(),
                firstName: form.ownerFirstName.trim(),
                lastName: form.ownerLastName.trim(),
              },
            }),
          },
        );
        if (tenant.data.provisioningStatus !== "READY") {
          throw new Error(`Clinic ยังไม่พร้อม: ${tenant.data.provisioningStatus}`);
        }
        clinicId = tenant.data.clinicId;
        destination = {
          subdomain: tenant.data.subdomain,
          appUrl: tenant.data.appUrl,
        };
      } else {
        failedPhase = "CLINIC_LOOKUP";
        setPhase(failedPhase);
        const tenants = await apiRequest<
          Array<{
            clinicId: string;
            code: string;
            provisioningStatus: string;
            subdomain: string | null;
            appUrl: string | null;
          }>
        >(`/platform/clinics?search=${encodeURIComponent(normalizedCode)}&limit=20`, {
          token: platform.data.accessToken,
        });
        const tenant = tenants.data.find(
          (item) => item.code.toUpperCase() === normalizedCode,
        );
        if (!tenant) throw new Error(`ไม่พบ Clinic Code ${normalizedCode}`);
        if (tenant.provisioningStatus !== "READY") {
          throw new Error(`Clinic ยังไม่พร้อม: ${tenant.provisioningStatus}`);
        }
        clinicId = tenant.clinicId;
        destination = {
          subdomain: tenant.subdomain,
          appUrl: tenant.appUrl,
        };
      }

      failedPhase = "ISSUE";
      setPhase(failedPhase);
      const activation = await apiRequest<{ activationUrl: string; expiresAt: string }>(
        `/platform/clinics/${encodeURIComponent(clinicId)}/owner-activation`,
        { method: "POST", token: platform.data.accessToken },
      );

      failedPhase = "ACTIVATE";
      setPhase(failedPhase);
      await apiRequest("/auth/activate", {
        method: "POST",
        body: JSON.stringify({
          token: tokenFromUrl(activation.data.activationUrl),
          password: form.newPassword,
        }),
      });
      activated = true;

      failedPhase = "VERIFY";
      setPhase(failedPhase);
      const verifyPath = destination.subdomain
        ? `/auth/clinics/${encodeURIComponent(destination.subdomain)}/login`
        : "/auth/login";
      await apiRequest(verifyPath, {
        method: "POST",
        body: JSON.stringify({
          ...(destination.subdomain ? {} : { clinicCode: normalizedCode }),
          email: form.ownerEmail.trim().toLowerCase(),
          password: form.newPassword,
        }),
      });

      setForm((current) => ({
        ...current,
        platformPassword: "",
        newPassword: "",
      }));
      setNotice({
        kind: "success",
        text:
          mode === "CREATE"
            ? "สร้าง Clinic, เปิดบัญชี Owner และตรวจ Clinic Login สำเร็จ"
            : "เปิดบัญชี Owner และตรวจ Clinic Login สำเร็จ",
      });
      setClinicDestination(destination);
      setPhase("DONE");
    } catch (error) {
      const detail = errorMessage(error);
      setForm((current) => ({
        ...current,
        platformPassword: "",
        newPassword: "",
      }));
      if (activated) {
        setNotice({
          kind: "warning",
          text: `บัญชีถูกเปิดแล้ว แต่ ${phaseErrorText[failedPhase]}: ${detail}`,
        });
        setPhase("DONE");
      } else {
        const hint =
          failedPhase === "PLATFORM_LOGIN"
            ? " — ตรวจ Platform Email/Password; ระบบยังไม่ได้อ่านข้อมูล Clinic Owner"
            : "";
        setNotice({
          kind: "error",
          text: `${phaseErrorText[failedPhase]}: ${detail}${hint}`,
        });
        setPhase("IDLE");
      }
    }
  }

  return (
    <main className="activation-page">
      <header className="activation-header">
        <Link className="brand activation-brand" href="/">
          <div className="activation-logo">K+</div>
          <div><strong>Klinic</strong><small>API LAB</small></div>
        </Link>
        <Link className="ghost-button" href="/">← กลับ Clinic Login</Link>
      </header>

      <section className="activation-layout">
        <aside className="activation-guide">
          <p className="eyebrow light">OWNER ACTIVATION</p>
          <h1>เปิดบัญชี Owner<br />โดยไม่ใช้ Email</h1>
          <p>ใช้ API จริงครบทั้งการสร้าง Clinic, token activation และ Clinic login verification</p>
          <ol>
            {steps.map((step, index) => {
              const currentIndex = steps.findIndex((item) => item.phase === phase);
              const state =
                phase === "DONE" || currentIndex > index
                  ? "done"
                  : currentIndex === index ? "running" : "";
              return (
                <li key={step.phase} className={state}>
                  <b>{index + 1}</b><span>{step.label}</span>
                </li>
              );
            })}
          </ol>
        </aside>

        <section className="activation-form-card">
          <nav className="login-flow-menu" aria-label="เลือก flow ทดสอบ">
            <Link href="/">Clinic Login</Link>
            <span className="active">Owner Activation Test</span>
          </nav>
          <p className="eyebrow">INTERNAL TEST FLOW</p>
          <h2>ข้อมูลสำหรับเปิดบัญชี</h2>
          <p className="muted">
            รหัสผ่านและ token ใช้ระหว่าง request เท่านั้นและไม่เก็บใน browser storage
          </p>

          <div className="activation-mode" aria-label="เลือกประเภทการทดสอบ">
            <button type="button" className={mode === "CREATE" ? "active" : ""}
              onClick={() => selectMode("CREATE")} disabled={busy}>
              สร้าง Clinic ใหม่
            </button>
            <button type="button" className={mode === "EXISTING" ? "active" : ""}
              onClick={() => selectMode("EXISTING")} disabled={busy}>
              ใช้ Clinic ที่มีอยู่
            </button>
          </div>

          <form className="activation-form" onSubmit={run}>
            <fieldset disabled={busy}>
              <div className="form-section">
                <h3><span>1</span> Platform Admin</h3>
                <div className="activation-fields">
                  <label>Platform Email
                    <input type="email" autoComplete="username"
                      value={form.platformEmail}
                      onChange={(event) => updateForm("platformEmail", event.target.value)}
                      required />
                  </label>
                  <label>Platform Password
                    <input type="password" autoComplete="current-password"
                      value={form.platformPassword}
                      onChange={(event) => updateForm("platformPassword", event.target.value)}
                      required />
                  </label>
                </div>
                <button
                  className="seed-admin-button"
                  type="button"
                  onClick={fillLocalSeedAdmin}
                >
                  เติมบัญชี Local Seed Admin
                </button>
                <small className="platform-login-hint">
                  ช่องนี้ใช้บัญชี Platform Admin ไม่ใช่ Clinic Owner
                </small>
              </div>

              <div className="form-section">
                <h3><span>2</span> {mode === "CREATE" ? "Clinic + Owner" : "Clinic Owner"}</h3>
                <div className="activation-fields">
                  {mode === "CREATE" && (
                    <>
                      <label className="wide">Clinic Name
                        <input value={form.clinicName}
                          onChange={(event) => updateForm("clinicName", event.target.value)}
                          placeholder="เช่น KK Development Clinic" required />
                      </label>
                      <label>Owner First Name
                        <input value={form.ownerFirstName}
                          onChange={(event) => updateForm("ownerFirstName", event.target.value)}
                          required />
                      </label>
                      <label>Owner Last Name
                        <input value={form.ownerLastName}
                          onChange={(event) => updateForm("ownerLastName", event.target.value)}
                          required />
                      </label>
                    </>
                  )}
                  <label>Clinic Code
                    <input value={form.clinicCode}
                      onChange={(event) => updateForm("clinicCode", event.target.value)}
                      placeholder="เช่น KKDEV" minLength={3} maxLength={32}
                      pattern="[A-Za-z0-9_-]+" required />
                  </label>
                  {mode === "CREATE" && (
                    <label>Subscription Days
                      <input type="number" min={1} max={3650}
                        value={form.subscriptionDays}
                        onChange={(event) => updateForm("subscriptionDays", event.target.value)}
                        required />
                    </label>
                  )}
                  <label className={mode === "EXISTING" ? "wide" : ""}>Owner Email
                    <input type="email" value={form.ownerEmail}
                      onChange={(event) => updateForm("ownerEmail", event.target.value)}
                      placeholder="owner@clinic.com" required />
                  </label>
                  <label className="wide">รหัสผ่านใหม่ (อย่างน้อย 8 ตัว)
                    <input type="password" minLength={8} autoComplete="new-password"
                      value={form.newPassword}
                      onChange={(event) => updateForm("newPassword", event.target.value)}
                      required />
                  </label>
                </div>
              </div>

              <button className="primary-button activation-submit" disabled={busy}>
                {busy
                  ? `${phaseText[phase as RunningPhase]}...`
                  : phase === "DONE"
                    ? "ทดสอบสำเร็จแล้ว"
                    : mode === "CREATE"
                      ? "สร้าง Clinic และทดสอบ Activation"
                      : "เริ่มทดสอบ Activation"}
              </button>
            </fieldset>
          </form>

          {notice && <div className={`notice ${notice.kind}`}>{notice.text}</div>}
          {clinicDestination?.appUrl && (
            <a className="clinic-url-result" href={clinicDestination.appUrl}>
              <span>
                <small>CLINIC SUBDOMAIN</small>
                <b>{clinicDestination.appUrl}</b>
              </span>
              <strong>เปิดหน้า Clinic Login →</strong>
            </a>
          )}
          <div className="activation-rule">
            <b>กติกาที่ยังคงใช้</b>
            <span>Token อายุ 24 ชั่วโมง · ใช้ได้ครั้งเดียว · Issue ใหม่ยกเลิก token เก่า</span>
          </div>
        </section>
      </section>
    </main>
  );
}
