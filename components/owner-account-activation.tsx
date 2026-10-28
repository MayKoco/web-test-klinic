"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { ApiClientError, apiRequest } from "@/lib/api";

export default function OwnerAccountActivation({
  initialToken,
}: {
  initialToken: string;
}) {
  const [token, setToken] = useState(initialToken);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  async function activate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setResult(null);
    try {
      await apiRequest("/owner/auth/activate", {
        method: "POST",
        body: JSON.stringify({ token: token.trim(), password }),
      });
      setPassword("");
      setResult({ ok: true, text: "เปิดใช้งาน Owner Account สำเร็จแล้ว" });
    } catch (error) {
      setResult({
        ok: false,
        text:
          error instanceof ApiClientError
            ? `${error.code}: ${error.message}`
            : "เปิดใช้งานบัญชีไม่สำเร็จ",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="owner-auth-page">
      <section className="owner-auth-card">
        <p className="eyebrow">GLOBAL OWNER</p>
        <h1>ตั้งรหัสผ่าน Owner</h1>
        <p className="muted">บัญชีนี้ใช้ Login ครั้งเดียวเพื่อดู Organization และทุกสาขาที่เป็นเจ้าของ</p>
        <form className="form-stack" onSubmit={activate} method="post">
          <label>
            Activation Token
            <input value={token} onChange={(event) => setToken(event.target.value)} required />
          </label>
          <label>
            Password ใหม่ (อย่างน้อย 8 ตัว)
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={8}
              autoComplete="new-password"
              required
            />
          </label>
          <button className="primary-button" disabled={busy}>
            {busy ? "กำลังเปิดบัญชี..." : "เปิดใช้งาน Owner Account"}
          </button>
        </form>
        {result && <div className={`notice ${result.ok ? "success" : "error"}`}>{result.text}</div>}
        {result?.ok && <Link className="owner-inline-link" href="/owner">ไปหน้า Owner Login →</Link>}
      </section>
    </main>
  );
}
