"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { ApiClientError, apiRequest } from "@/lib/api";
import OwnerBranchPurchase, { returnedBranchOrganization } from "@/components/owner-branch-purchase";
import { ClinicLoginResult, ClinicSessionProfile } from "@/lib/clinic-session";
import {
  clearOwnerSession,
  OwnerSession,
  readOwnerSession,
  renewOwnerSession,
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

const localOwner = {
  email: "owner.83670702@global.test",
  password: "OwnerPortal2026!",
};

const clinicLoginUrl = (appUrl: string) =>
  `${appUrl.replace(/\/+$/, "")}/login`;

export default function OwnerPortal() {
  const [credentials, setCredentials] = useState(localOwner);
  const [accessToken, setAccessToken] = useState("");
  const [refreshToken, setRefreshToken] = useState("");
  const [owner, setOwner] = useState<Owner | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [selectedOrganizationId, setSelectedOrganizationId] = useState("");
  const [branches, setBranches] = useState<Branch[]>([]);
  const [showBranchForm, setShowBranchForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    const session = readOwnerSession();
    if (!session) return;

    Promise.resolve()
      .then(async () => {
        setBusy(true);
        const returnedOrganization = returnedBranchOrganization();
        const restored = returnedOrganization ? await renewOwnerSession(session) : session;
        setAccessToken(restored.accessToken);
        setRefreshToken(restored.refreshToken);
        setOwner(restored.owner);
        const result = await apiRequest<Organization[]>(
          "/owner/organizations?limit=100&sortBy=name&sortOrder=asc", { token: restored.accessToken },
        );
        setOrganizations(result.data);
        const returned = result.data.find((organization) => organization.id === returnedOrganization);
        if (returned) setShowBranchForm(true);
        const organizationId = returned?.id ?? result.data[0]?.id;
        if (organizationId) {
          setSelectedOrganizationId(organizationId);
          const branches = await apiRequest<Branch[]>(
            `/owner/organizations/${encodeURIComponent(organizationId)}/branches?limit=100&sortBy=name&sortOrder=asc`,
            { token: restored.accessToken },
          );
          setBranches(branches.data);
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
      const organizationResult = await apiRequest<Organization[]>(
        "/owner/organizations?limit=100&sortBy=name&sortOrder=asc", { token: session.data.accessToken },
      );
      setOrganizations(organizationResult.data);
      const returned = organizationResult.data.find((organization) => organization.id === returnedBranchOrganization());
      const organizationId = returned?.id ?? organizationResult.data[0]?.id;
      if (returned) setShowBranchForm(true);
      if (organizationId) await loadBranches(organizationId, session.data.accessToken);
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

  async function enterPurchasedBranch(clinicId: string, code: string) {
    try {
      const { data } = await apiRequest<ClinicLoginResult>(`/owner/branches/${encodeURIComponent(clinicId)}/session`, { method: "POST", token: accessToken });
      const profile: ClinicSessionProfile = { name: data.user.email, clinicCode: code, roles: data.user.roles };
      window.localStorage.setItem("klinic-test-token", data.accessToken);
      window.localStorage.setItem("klinic-test-profile", JSON.stringify(profile));
      window.location.replace("/dashboard");
    } catch (cause) {
      setError(message(cause));
      setShowBranchForm(false);
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
              disabled={!selectedOrganizationId}
              onClick={() => { setShowBranchForm((current) => !current); setError(""); setSuccess(""); }}
            >
              {showBranchForm ? "ยกเลิก" : "+ เปิดสาขาใหม่"}
            </button>
          </div>
          {showBranchForm && selectedOrganization && <OwnerBranchPurchase
            key={selectedOrganization.id}
            token={accessToken}
            organization={selectedOrganization}
            onClose={() => setShowBranchForm(false)}
            onReady={() => { setSuccess("สาขาใหม่พร้อมใช้งานแล้ว"); void loadBranches(selectedOrganization.id); }}
            onEnter={(clinicId, code) => void enterPurchasedBranch(clinicId, code)}
          />}
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
                {branch.appUrl ? <a href={clinicLoginUrl(branch.appUrl)}>ดู Clinic URL →</a> : <span className="muted">ยังไม่มี Clinic URL</span>}
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
