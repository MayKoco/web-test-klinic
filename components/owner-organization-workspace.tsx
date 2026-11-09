"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import AppSidebar from "@/components/app-sidebar";
import { ApiClientError, apiRequest } from "@/lib/api";
import { createClientId } from "@/lib/client-id";
import { ClinicLoginResult, ClinicSessionProfile } from "@/lib/clinic-session";
import { clearOwnerSession, OwnerSession, readOwnerSession } from "@/lib/owner-session";

type Organization = { id: string; name: string; status: string; branchCount: number };
type OwnerPackage = { id: string; name: string; description: string | null };
type Branch = {
  clinicId: string; name: string; code: string; subdomain: string | null;
  appUrl: string | null; provisioningStatus: string; accessStatus: string;
  package: { id: string; name: string } | null;
  membership: { role: string; clinicUserId: string | null } | null;
};
type AccessState = "loading" | "owner" | "forbidden";

function errorMessage(cause: unknown) {
  const apiError = cause as ApiClientError;
  return apiError.code ? `${apiError.code}: ${apiError.message}` : (apiError.message ?? String(cause));
}

export default function OwnerOrganizationWorkspace() {
  const [profile, setProfile] = useState<ClinicSessionProfile | null>(null);
  const [ownerSession, setOwnerSession] = useState<OwnerSession | null>(null);
  const [access, setAccess] = useState<AccessState>("loading");
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [selectedOrganizationId, setSelectedOrganizationId] = useState("");
  const [branches, setBranches] = useState<Branch[]>([]);
  const [packages, setPackages] = useState<OwnerPackage[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const token = window.localStorage.getItem("klinic-test-token");
    const savedProfile = window.localStorage.getItem("klinic-test-profile");
    const currentOwnerSession = readOwnerSession();
    if (!token) { window.location.replace("/login"); return; }

    let currentProfile: ClinicSessionProfile | null = null;
    if (savedProfile) {
      try { currentProfile = JSON.parse(savedProfile) as ClinicSessionProfile; } catch { currentProfile = null; }
    }

    Promise.resolve().then(async () => {
      if (currentProfile) setProfile(currentProfile);
      const permissionResult = await apiRequest<{ roles: string[]; permissions: string[] }>("/auth/me/permissions", { token });
      if (!permissionResult.data.roles.includes("OWNER") || !currentOwnerSession) {
        setError(currentOwnerSession ? "บัญชีนี้ไม่มีสิทธิ์ OWNER" : "กรุณาออกจากระบบและเข้าสู่ระบบใหม่เพื่อยืนยัน Global Owner");
        setAccess("forbidden");
        return;
      }
      setOwnerSession(currentOwnerSession);
      const nextProfile = currentProfile ? { ...currentProfile, roles: permissionResult.data.roles } : null;
      if (nextProfile) {
        setProfile(nextProfile);
        window.localStorage.setItem("klinic-test-profile", JSON.stringify(nextProfile));
      }
      const [organizationResult, packageResult] = await Promise.all([
        apiRequest<Organization[]>("/owner/organizations?limit=100&sortBy=name&sortOrder=asc", { token: currentOwnerSession.accessToken }),
        apiRequest<OwnerPackage[]>("/owner/packages", { token: currentOwnerSession.accessToken }),
      ]);
      setOrganizations(organizationResult.data);
      setPackages(packageResult.data);
      const organizationId = organizationResult.data[0]?.id ?? "";
      setSelectedOrganizationId(organizationId);
      if (organizationId) {
        const branchResult = await apiRequest<Branch[]>(`/owner/organizations/${encodeURIComponent(organizationId)}/branches?limit=100&sortBy=name&sortOrder=asc`, { token: currentOwnerSession.accessToken });
        setBranches(branchResult.data);
      }
      setAccess("owner");
    }).catch((cause: ApiClientError) => {
      if (cause.status === 401) clearOwnerSession();
      setError(errorMessage(cause));
      setAccess("forbidden");
    });
  }, []);

  const selectedOrganization = organizations.find((item) => item.id === selectedOrganizationId);
  const currentBranch = branches.find((branch) => branch.code === profile?.clinicCode) ?? branches[0];
  const workspaceLabel = useMemo(() => currentBranch?.subdomain ?? "Local", [currentBranch]);

  async function loadBranches(organizationId: string) {
    if (!ownerSession) return;
    setSelectedOrganizationId(organizationId); setBusy(true); setError("");
    try {
      const result = await apiRequest<Branch[]>(`/owner/organizations/${encodeURIComponent(organizationId)}/branches?limit=100&sortBy=name&sortOrder=asc`, { token: ownerSession.accessToken });
      setBranches(result.data);
    } catch (cause) { setError(errorMessage(cause)); } finally { setBusy(false); }
  }

  async function createBranch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ownerSession || !selectedOrganizationId) return;
    const form = new FormData(event.currentTarget);
    setBusy(true); setError("");
    try {
      const result = await apiRequest<Branch>(`/owner/organizations/${encodeURIComponent(selectedOrganizationId)}/branches`, {
        method: "POST", token: ownerSession.accessToken,
        headers: { "Idempotency-Key": createClientId() },
        body: JSON.stringify({ name: String(form.get("name") ?? "").trim(), code: String(form.get("code") ?? "").trim().toUpperCase(), packageId: String(form.get("packageId") ?? "") }),
      });
      setShowForm(false); setNotice(`เปิด ${result.data.name} สำเร็จ`);
      await loadBranches(selectedOrganizationId);
    } catch (cause) { setError(errorMessage(cause)); } finally { setBusy(false); }
  }

  async function switchClinic(branch: Branch) {
    if (!ownerSession || branch.code === profile?.clinicCode) return;
    setBusy(true); setError("");
    try {
      const result = await apiRequest<ClinicLoginResult>(`/owner/branches/${encodeURIComponent(branch.clinicId)}/session`, { method: "POST", token: ownerSession.accessToken });
      const nextProfile: ClinicSessionProfile = { name: result.data.user.email, clinicCode: branch.code, roles: result.data.user.roles };
      window.localStorage.setItem("klinic-test-token", result.data.accessToken);
      window.localStorage.setItem("klinic-test-profile", JSON.stringify(nextProfile));
      window.location.replace("/dashboard");
    } catch (cause) { setError(errorMessage(cause)); setBusy(false); }
  }

  return <main className="app-shell owner-organization-app">
    <AppSidebar active="organization" profile={profile} />
    <section className="workspace">
      <header className="topbar owner-organization-topbar"><div><p className="eyebrow">OWNER WORKSPACE</p><h1>องค์กรและสาขา</h1></div>{access === "owner" && <button className="owner-create-branch" type="button" onClick={() => setShowForm(true)}><span>＋</span> เปิดสาขาใหม่</button>}</header>
      <div className="content owner-organization-content">
        {access === "loading" && <section className="owner-state-card"><span className="owner-state-spinner" /><h2>กำลังตรวจสอบ Global Owner</h2></section>}
        {access === "forbidden" && <section className="owner-state-card forbidden"><span>⌁</span><p className="eyebrow">GLOBAL OWNER ONLY</p><h2>ไม่สามารถเปิด Owner workspace</h2><p>{error}</p><a href="/login">เข้าสู่ระบบใหม่</a></section>}
        {access === "owner" && <>
          {error && <div className="notice error owner-organization-notice">{error}<button type="button" onClick={() => setError("")}>×</button></div>}
          {notice && <div className="notice success owner-organization-notice">{notice}<button type="button" onClick={() => setNotice("")}>×</button></div>}
          <section className="owner-organization-hero"><div><span className="owner-scope-pill">GLOBAL OWNER</span><p className="eyebrow">ORGANIZATION</p><h2>{selectedOrganization?.name ?? "องค์กรของคุณ"}</h2><p>Owner session ตรวจ ownership จาก PlatformAccount และ BranchMembership ก่อนจัดการทุกสาขา</p></div><div className="owner-organization-metrics"><article><span>สาขาทั้งหมด</span><strong>{branches.length}</strong><small>Clinics</small></article><article><span>แพ็กเกจปัจจุบัน</span><strong>{currentBranch?.package?.name ?? "—"}</strong><small>Plan</small></article><article><span>Workspace</span><strong>{workspaceLabel}</strong><small>Subdomain</small></article></div></section>
          {organizations.length > 1 && <div className="owner-org-switcher"><label>Organization<select value={selectedOrganizationId} onChange={(event) => void loadBranches(event.target.value)}>{organizations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div>}
          <section className="owner-branch-section"><header><div><p className="eyebrow">BRANCH DIRECTORY</p><h2>สาขาของคุณ</h2><p>เลือกสาขาเพื่อแลก Owner session เป็น Clinic token ใหม่</p></div><span>{branches.length} สาขา</span></header><div className="owner-branch-cards">
            {branches.map((branch) => { const current = branch.code === profile?.clinicCode; return <article key={branch.clinicId} className={current ? "current" : ""}><div className="owner-branch-card-head"><span>{branch.name.slice(0, 1).toUpperCase()}</span><i>{current ? "สาขาปัจจุบัน" : branch.provisioningStatus}</i></div><h3>{branch.name}</h3><p>Clinic code <b>{branch.code}</b></p><div className="owner-branch-card-foot"><span><i /> {branch.accessStatus}</span><button type="button" disabled={busy || current || branch.provisioningStatus !== "READY"} onClick={() => void switchClinic(branch)}>{current ? "กำลังใช้งาน" : "เข้าสู่สาขา"}</button></div></article>; })}
            <button className="owner-add-branch-card" type="button" onClick={() => setShowForm(true)}><span>＋</span><b>เพิ่มสาขาใหม่</b><small>ใช้ Owner และ Organization เดิม</small></button>
          </div></section>
          <aside className="owner-flow-note"><span>i</span><div><b>Token boundary</b><p>Owner token ใช้จัดการ Organization ส่วน Clinic token ใช้งานเฉพาะสาขาปัจจุบัน การสลับสาขาจะออก Clinic token ใหม่ทุกครั้ง</p></div></aside>
        </>}
      </div>
    </section>
    {showForm && <div className="modal-backdrop owner-branch-modal" role="presentation" onMouseDown={() => setShowForm(false)}><form className="modal-box owner-inline-branch-form" onSubmit={createBranch} onMouseDown={(event) => event.stopPropagation()}><header><div><p className="eyebrow">NEW BRANCH</p><h2>เปิดสาขาใหม่</h2><p>Owner และ Subdomain ใช้จาก Organization ปัจจุบัน</p></div><button type="button" onClick={() => setShowForm(false)}>×</button></header><div className="owner-inline-fields"><label>ชื่อสาขา<input name="name" placeholder="เช่น Klinic สาขาทองหล่อ" required /></label><label>Clinic code<input name="code" placeholder="เช่น BKK02" required /></label><label>แพ็กเกจ<select name="packageId" required defaultValue={packages[0]?.id}>{packages.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Organization<input value={selectedOrganization?.name ?? ""} readOnly /></label></div><div className="owner-inline-summary"><span>01</span><p><b>Owner เดิมจะถูกเพิ่มให้สาขาอัตโนมัติ</b><small>ระบบ provision Clinic OWNER และ Subscription ให้ใน flow เดียว</small></p></div><footer><small>Idempotent provisioning</small><div><button className="ghost-button" type="button" onClick={() => setShowForm(false)}>ยกเลิก</button><button className="primary-button" type="submit" disabled={busy}>{busy ? "กำลังสร้าง..." : "ยืนยันเปิดสาขา"}</button></div></footer></form></div>}
  </main>;
}
