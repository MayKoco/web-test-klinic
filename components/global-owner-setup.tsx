"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { ApiClientError, apiRequest } from "@/lib/api";

const localAdmin = { email: "admin@platform.test", password: "Admin1234!" };

export default function GlobalOwnerSetup() {
  const [form, setForm] = useState({
    platformEmail: process.env.NODE_ENV === "development" ? localAdmin.email : "",
    platformPassword: process.env.NODE_ENV === "development" ? localAdmin.password : "",
    organizationName: "",
    ownerEmail: "",
    firstName: "",
    lastName: "",
    phone: "",
  });
  const [busy, setBusy] = useState(false);
  const [activationUrl, setActivationUrl] = useState("");
  const [error, setError] = useState("");

  function update(key: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setActivationUrl("");
    try {
      const platform = await apiRequest<{ accessToken: string }>("/platform/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email: form.platformEmail.trim().toLowerCase(),
          password: form.platformPassword,
        }),
      });
      const organization = await apiRequest<{
        id: string;
        ownerAccount: { id: string };
      }>("/platform/organizations", {
        method: "POST",
        token: platform.data.accessToken,
        headers: { "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({
          name: form.organizationName.trim(),
          owner: {
            email: form.ownerEmail.trim().toLowerCase(),
            firstName: form.firstName.trim(),
            lastName: form.lastName.trim(),
            ...(form.phone.trim() ? { phone: form.phone.trim() } : {}),
          },
        }),
      });
      const activation = await apiRequest<{ activationUrl: string }>(
        `/platform/owner-accounts/${encodeURIComponent(organization.data.ownerAccount.id)}/activation`,
        { method: "POST", token: platform.data.accessToken },
      );
      setActivationUrl(activation.data.activationUrl);
    } catch (cause) {
      setError(
        cause instanceof ApiClientError
          ? `${cause.code}: ${cause.message}`
          : "สร้าง Owner Profile ไม่สำเร็จ",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="owner-auth-page">
      <section className="owner-setup-card">
        <header className="owner-page-head">
          <div>
            <p className="eyebrow">INTERNAL PLATFORM FLOW</p>
            <h1>สร้าง Global Owner Profile</h1>
            <p className="muted">สร้าง Organization และออก Activation URL โดยไม่ใช้ Email provider</p>
          </div>
          <Link className="ghost-button owner-link-button" href="/owner">Owner Login</Link>
        </header>
        <form className="owner-setup-grid" onSubmit={create} method="post">
          <fieldset>
            <legend>Platform Admin</legend>
            <label>Platform Email<input value={form.platformEmail} onChange={(e) => update("platformEmail", e.target.value)} required /></label>
            <label>Platform Password<input type="password" value={form.platformPassword} onChange={(e) => update("platformPassword", e.target.value)} required /></label>
          </fieldset>
          <fieldset>
            <legend>Organization & Owner</legend>
            <label>Organization Name<input value={form.organizationName} onChange={(e) => update("organizationName", e.target.value)} required /></label>
            <label>Owner Email<input type="email" value={form.ownerEmail} onChange={(e) => update("ownerEmail", e.target.value)} required /></label>
            <div className="owner-name-row">
              <label>First Name<input value={form.firstName} onChange={(e) => update("firstName", e.target.value)} required /></label>
              <label>Last Name<input value={form.lastName} onChange={(e) => update("lastName", e.target.value)} required /></label>
            </div>
            <label>Phone (optional)<input value={form.phone} onChange={(e) => update("phone", e.target.value)} /></label>
          </fieldset>
          <button className="primary-button owner-wide-action" disabled={busy}>{busy ? "กำลังสร้าง..." : "สร้าง Profile และออก Activation URL"}</button>
        </form>
        {error && <div className="notice error">{error}</div>}
        {activationUrl && (
          <a className="owner-activation-result" href={activationUrl}>
            <span><small>OWNER ACTIVATION URL</small><b>{activationUrl}</b></span><strong>เปิดหน้า Activation →</strong>
          </a>
        )}
      </section>
    </main>
  );
}
