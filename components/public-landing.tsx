"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { ApiClientError, apiRequest } from "@/lib/api";

type Draft = {
  clinicName: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  password: string;
  terms: boolean;
};

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
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
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
  const previewUrl = useMemo(
    () =>
      generatedSubdomain
        ? `http://${generatedSubdomain}.lvh.me:3000`
        : "ระบบจะสร้าง URL หลังกรอกชื่อคลินิก",
    [generatedSubdomain],
  );

  function update<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setSubmitted(false);
  }

  function updateClinicName(value: string) {
    update("clinicName", value);
    if (value.trim() && !subdomainSuffix) setSubdomainSuffix(randomSuffix());
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const signup = await apiRequest<{
        branch: {
          clinicId: string;
          code: string;
          name: string;
          appUrl: string | null;
        };
      }>("/public/free-tier/signup", {
        method: "POST",
        body: JSON.stringify({
          clinicName: draft.clinicName.trim(),
          email: draft.email.trim().toLowerCase(),
          firstName: draft.firstName.trim(),
          lastName: draft.lastName.trim(),
          ...(draft.phone.trim() ? { phone: draft.phone.trim() } : {}),
          password: draft.password,
          acceptedTermsVersion: "2026-10-28",
        }),
      });
      const session = await apiRequest<{
        accessToken: string;
        user: { clinicId: string; email: string; roles: string[] };
      }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({
          clinicCode: signup.data.branch.code,
          email: draft.email.trim().toLowerCase(),
          password: draft.password,
        }),
      });
      window.localStorage.setItem(
        "klinic-test-token",
        session.data.accessToken,
      );
      window.localStorage.setItem(
        "klinic-test-profile",
        JSON.stringify({
          name: signup.data.branch.name,
          clinicCode: signup.data.branch.code,
        }),
      );
      setSubmitted(true);
      const destinationBase = signup.data.branch.appUrl
        ? `${signup.data.branch.appUrl}/appointments`
        : "/appointments";
      const handoff = new URLSearchParams({
        session: JSON.stringify({
          accessToken: session.data.accessToken,
          profile: {
            name: signup.data.branch.name,
            clinicCode: signup.data.branch.code,
          },
        }),
      });
      // Cross-subdomain navigation cannot use the Next router.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = `${destinationBase}#${handoff.toString()}`;
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
            {busy ? "กำลังสร้างและเข้าสู่คลินิก..." : "สร้างคลินิก Free Tier"}{" "}
            <span>→</span>
          </button>
          {error && (
            <div className="public-submit-result public-submit-error">
              <b>สร้างคลินิกไม่สำเร็จ</b>
              <span>{error}</span>
            </div>
          )}
          {submitted && (
            <div className="public-submit-result">
              <b>สร้างคลินิกสำเร็จ</b>
              <span>กำลังพาไปยัง {previewUrl}</span>
            </div>
          )}
          <p className="public-form-note">
            Organization, Clinic ID, Role OWNER และ Subscription
            จะถูกสร้างโดยระบบ
          </p>
        </form>
      </section>

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

function randomSuffix() {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const values = new Uint8Array(4);
  crypto.getRandomValues(values);
  return Array.from(values, (value) => alphabet[value % alphabet.length]).join(
    "",
  );
}
