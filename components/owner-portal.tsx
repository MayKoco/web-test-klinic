"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { ApiClientError, apiRequest } from "@/lib/api";
import {
  clearOwnerSession,
  OwnerSession,
  readOwnerSession,
  storeOwnerSession,
} from "@/lib/owner-session";

type Owner = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  status: string;
};

type Organization = {
  id: string;
  name: string;
  status: string;
  branchCount: number;
};

type Branch = {
  clinicId: string;
  name: string;
  code: string;
  subdomain: string | null;
  appUrl: string | null;
  provisioningStatus: string;
  accessStatus: string;
  package: { id: string; name: string } | null;
  subscription: { startsAt: string; expiresAt: string } | null;
  membership: { role: string; clinicUserId: string | null } | null;
};

type OwnerPackage = {
  id: string;
  name: string;
  description: string | null;
  price: string | number;
  subscriptionDays: number;
  features: string[];
};

type BranchDraft = {
  name: string;
  code: string;
  subdomain: string;
  packageId: string;
};

const localOwner = {
  email: "owner.83670702@global.test",
  password: "OwnerPortal2026!",
};

const emptyBranch = (packageId = ""): BranchDraft => ({
  name: "",
  code: "",
  subdomain: "",
  packageId,
});

export default function OwnerPortal() {
  const [credentials, setCredentials] = useState(localOwner);
  const [accessToken, setAccessToken] = useState("");
  const [refreshToken, setRefreshToken] = useState("");
  const [owner, setOwner] = useState<Owner | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [selectedOrganizationId, setSelectedOrganizationId] = useState("");
  const [branches, setBranches] = useState<Branch[]>([]);
  const [packages, setPackages] = useState<OwnerPackage[]>([]);
  const [branchDraft, setBranchDraft] = useState<BranchDraft>(emptyBranch());
  const [showBranchForm, setShowBranchForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    const session = readOwnerSession();
    if (!session) return;

    Promise.resolve()
      .then(async () => {
        setAccessToken(session.accessToken);
        setRefreshToken(session.refreshToken);
        setOwner(session.owner);
        setBusy(true);
        return Promise.all([
          apiRequest<Organization[]>(
            "/owner/organizations?limit=100&sortBy=name&sortOrder=asc",
            { token: session.accessToken },
          ),
          apiRequest<OwnerPackage[]>("/owner/packages", {
            token: session.accessToken,
          }),
        ]);
      })
      .then(async ([organizationResult, packageResult]) => {
        setOrganizations(organizationResult.data);
        setPackages(packageResult.data);
        setBranchDraft(emptyBranch(packageResult.data[0]?.id));
        if (organizationResult.data[0]) {
          const organizationId = organizationResult.data[0].id;
          setSelectedOrganizationId(organizationId);
          const branchResult = await apiRequest<Branch[]>(
            `/owner/organizations/${encodeURIComponent(organizationId)}/branches?limit=100&sortBy=name&sortOrder=asc`,
            { token: session.accessToken },
          );
          setBranches(branchResult.data);
        }
      })
      .catch((cause) => {
        clearOwnerSession();
        setAccessToken("");
        setRefreshToken("");
        setOwner(null);
        setError(message(cause));
      })
      .finally(() => setBusy(false));
  }, []);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const session = await apiRequest<OwnerSession>("/owner/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email: credentials.email.trim().toLowerCase(),
          password: credentials.password,
        }),
      });
      storeOwnerSession(session.data);
      setAccessToken(session.data.accessToken);
      setRefreshToken(session.data.refreshToken);
      setOwner(session.data.owner);
      setCredentials((current) => ({ ...current, password: "" }));
      const [organizationResult, packageResult] = await Promise.all([
        apiRequest<Organization[]>(
          "/owner/organizations?limit=100&sortBy=name&sortOrder=asc",
          { token: session.data.accessToken },
        ),
        apiRequest<OwnerPackage[]>("/owner/packages", {
          token: session.data.accessToken,
        }),
      ]);
      setOrganizations(organizationResult.data);
      setPackages(packageResult.data);
      setBranchDraft(emptyBranch(packageResult.data[0]?.id));
      if (organizationResult.data[0]) {
        await loadBranches(organizationResult.data[0].id, session.data.accessToken);
      }
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  }

  async function loadBranches(organizationId: string, token = accessToken) {
    setSelectedOrganizationId(organizationId);
    setError("");
    try {
      const result = await apiRequest<Branch[]>(
        `/owner/organizations/${encodeURIComponent(organizationId)}/branches?limit=100&sortBy=name&sortOrder=asc`,
        { token },
      );
      setBranches(result.data);
    } catch (cause) {
      setBranches([]);
      setError(message(cause));
    }
  }

  async function createBranch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedOrganizationId) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const result = await apiRequest<Branch>(
        `/owner/organizations/${encodeURIComponent(selectedOrganizationId)}/branches`,
        {
          method: "POST",
          token: accessToken,
          headers: { "Idempotency-Key": crypto.randomUUID() },
          body: JSON.stringify({
            name: branchDraft.name.trim(),
            code: branchDraft.code.trim(),
            subdomain: branchDraft.subdomain.trim().toLowerCase(),
            packageId: branchDraft.packageId,
          }),
        },
      );
      setSuccess(`สร้าง ${branchDraft.name.trim()} สำเร็จ · ${result.data.appUrl ?? result.data.subdomain ?? result.data.code}`);
      setOrganizations((current) => current.map((organization) => (
        organization.id === selectedOrganizationId
          ? { ...organization, branchCount: organization.branchCount + 1 }
          : organization
      )));
      setBranchDraft(emptyBranch(packages[0]?.id));
      setShowBranchForm(false);
      await loadBranches(selectedOrganizationId);
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    if (refreshToken) {
      await apiRequest("/owner/auth/logout", {
        method: "POST",
        body: JSON.stringify({ refreshToken }),
      }).catch(() => undefined);
    }
    clearOwnerSession();
    setAccessToken("");
    setRefreshToken("");
    setOwner(null);
    setOrganizations([]);
    setBranches([]);
    setPackages([]);
    setSelectedOrganizationId("");
    setShowBranchForm(false);
    setSuccess("");
  }

  if (!owner) {
    return (
      <main className="owner-auth-page">
        <section className="owner-auth-card">
          <p className="eyebrow">OWNER PORTAL</p>
          <h1>เข้าสู่ระบบเจ้าของคลินิก</h1>
          <p className="muted">ใช้ Email และ Password ชุดเดียวเพื่อดูทุก Organization และสาขา</p>
          <form className="form-stack" onSubmit={login} method="post">
            <label>Owner Email<input type="email" autoComplete="username" value={credentials.email} onChange={(event) => setCredentials((current) => ({ ...current, email: event.target.value }))} required /></label>
            <label>Password<input type="password" autoComplete="current-password" value={credentials.password} onChange={(event) => setCredentials((current) => ({ ...current, password: event.target.value }))} required /></label>
            <button className="primary-button" disabled={busy}>{busy ? "กำลังเข้าสู่ระบบ..." : "Owner Login"}</button>
          </form>
          {error && <div className="notice error">{error}</div>}
          <Link className="owner-inline-link" href="/owner/setup">สร้าง Owner Profile สำหรับ Local Test →</Link>
        </section>
      </main>
    );
  }

  const selectedOrganization = organizations.find((item) => item.id === selectedOrganizationId);

  return (
    <main className="owner-portal-page">
      <header className="owner-portal-header">
        <div>
          <p className="eyebrow">GLOBAL OWNER PORTAL</p>
          <h1>{owner.firstName} {owner.lastName}</h1>
          <p>{owner.email}</p>
        </div>
        <button className="ghost-button" onClick={logout}>ออกจากระบบ</button>
      </header>
      {error && <div className="notice error owner-portal-notice">{error}</div>}
      {success && <div className="notice success owner-portal-notice">{success}</div>}
      <section className="owner-portal-layout">
        <aside className="owner-org-list">
          <div className="owner-section-title"><div><p className="eyebrow">PROFILE SCOPE</p><h2>Organizations</h2></div><b>{organizations.length}</b></div>
          {organizations.map((organization) => (
            <button key={organization.id} className={organization.id === selectedOrganizationId ? "active" : ""} onClick={() => loadBranches(organization.id)}>
              <span><strong>{organization.name}</strong><small>{organization.branchCount} Clinics · {organization.status}</small></span><b>›</b>
            </button>
          ))}
          {!organizations.length && <div className="empty-state small">ยังไม่มี Organization</div>}
        </aside>
        <section className="owner-branch-panel">
          <div className="owner-section-title">
            <div><p className="eyebrow">CLINIC DIRECTORY</p><h2>{selectedOrganization?.name ?? "Clinics"}</h2></div>
            <button
              className="primary-button owner-new-branch-button"
              type="button"
              disabled={!selectedOrganizationId || !packages.length}
              onClick={() => { setShowBranchForm((current) => !current); setError(""); setSuccess(""); }}
            >
              {showBranchForm ? "ยกเลิก" : "+ เปิดสาขาใหม่"}
            </button>
          </div>
          {showBranchForm && (
            <form className="owner-branch-form" onSubmit={createBranch}>
              <header><div><p className="eyebrow">NEW CLINIC</p><h3>ข้อมูลสาขาใหม่</h3></div><small>Owner จะถูกเพิ่มเป็น OWNER ของสาขาอัตโนมัติ</small></header>
              <div className="owner-branch-fields">
                <label>ชื่อสาขา<input required maxLength={200} value={branchDraft.name} onChange={(event) => setBranchDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Klinic Chiang Mai" /></label>
                <label>Clinic Code<input required minLength={3} maxLength={32} pattern="[A-Za-z0-9_-]+" value={branchDraft.code} onChange={(event) => setBranchDraft((current) => ({ ...current, code: event.target.value.toUpperCase() }))} placeholder="CNX01" /></label>
                <label>Subdomain<input required minLength={3} maxLength={63} pattern="[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])?" value={branchDraft.subdomain} onChange={(event) => setBranchDraft((current) => ({ ...current, subdomain: event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") }))} placeholder="klinic-cnx" /><small>{branchDraft.subdomain ? `http://${branchDraft.subdomain}.lvh.me:3000` : "ใช้สำหรับ URL ของสาขา"}</small></label>
                <label>Package<select required value={branchDraft.packageId} onChange={(event) => setBranchDraft((current) => ({ ...current, packageId: event.target.value }))}><option value="" disabled>เลือก Package</option>{packages.map((item) => <option key={item.id} value={item.id}>{item.name} · ฿{Number(item.price).toLocaleString()} / {item.subscriptionDays} วัน</option>)}</select></label>
              </div>
              <footer><span>ระบบจะ provision Clinic, Subscription และ Owner membership</span><button className="primary-button" disabled={busy}>{busy ? "กำลังสร้างสาขา..." : "ยืนยันเปิดสาขา"}</button></footer>
            </form>
          )}
          <div className="owner-branch-grid">
            {branches.map((branch) => (
              <article key={branch.clinicId}>
                <header><div className="owner-clinic-mark">K+</div><span><strong>{branch.name}</strong><small>{branch.code}</small></span><em>{branch.provisioningStatus}</em></header>
                <dl>
                  <div><dt>Subdomain</dt><dd>{branch.subdomain ?? "—"}</dd></div>
                  <div><dt>Package</dt><dd>{branch.package?.name ?? "—"}</dd></div>
                  <div><dt>Membership</dt><dd>{branch.membership?.role ?? "Not linked"}</dd></div>
                  <div><dt>Access</dt><dd>{branch.accessStatus}</dd></div>
                </dl>
                {branch.appUrl ? <a href={branch.appUrl}>ดู Clinic URL →</a> : <span className="muted">ยังไม่มี Clinic URL</span>}
              </article>
            ))}
          </div>
          {!branches.length && <div className="empty-state">Organization นี้ยังไม่มี Clinic</div>}
        </section>
      </section>
    </main>
  );
}

function message(error: unknown) {
  return error instanceof ApiClientError
    ? `${error.code}: ${error.message}`
    : "เรียกข้อมูล Owner Portal ไม่สำเร็จ";
}
