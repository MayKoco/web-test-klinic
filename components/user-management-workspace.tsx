"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import AppSidebar from "@/components/app-sidebar";
import { ApiClientError, apiRequest } from "@/lib/api";

type UserStatus = "ACTIVE" | "DISABLED" | "PENDING_ACTIVATION";
type Role = { id: string; code: string; name: string; description?: string | null; isActive: boolean; isSystemRole?: boolean };
type ClinicUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  status: UserStatus;
  createdAt: string;
  updatedAt: string;
  roles: Role[];
};
type Profile = { name: string; clinicCode: string };
type UserDraft = { firstName: string; lastName: string; email: string; password: string; roleId: string };
type ModalState = { mode: "create"; user: null } | { mode: "edit" | "password"; user: ClinicUser } | null;

const emptyDraft: UserDraft = { firstName: "", lastName: "", email: "", password: "", roleId: "" };
const statusLabel: Record<UserStatus, string> = { ACTIVE: "ใช้งานอยู่", DISABLED: "ปิดใช้งาน", PENDING_ACTIVATION: "รอเปิดใช้งาน" };
const roleDescription: Record<string, string> = {
  OWNER: "เจ้าของสาขาและสิทธิ์สูงสุด",
  ADMIN: "ดูแลการตั้งค่าและผู้ใช้งาน",
  MANAGER: "ดูแลงานปฏิบัติการของสาขา",
  STAFF: "Check-in และงานชำระเงิน",
  DOCTOR: "ข้อมูลและผลการรักษาของผู้ป่วย",
};

function errorText(error: unknown) {
  const apiError = error as ApiClientError;
  return apiError.code ? `${apiError.code}: ${apiError.message}` : apiError.message || "เกิดข้อผิดพลาด";
}

function initials(user: ClinicUser) {
  return `${user.firstName?.[0] ?? ""}${user.lastName?.[0] ?? ""}` || user.email[0].toUpperCase();
}

export default function UserManagementWorkspace() {
  const [token, setToken] = useState("");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [users, setUsers] = useState<ClinicUser[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [meta, setMeta] = useState({ total: 0, page: 1, totalPages: 1 });
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"ALL" | "ACTIVE" | "DISABLED">("ALL");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [modal, setModal] = useState<ModalState>(null);
  const [draft, setDraft] = useState<UserDraft>(emptyDraft);
  const [password, setPassword] = useState("");

  const load = useCallback(async (activeToken: string, search = "", activeStatus: typeof status = "ALL") => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: "1", limit: "100", sortBy: "createdAt", sortOrder: "desc" });
      if (search.trim()) params.set("search", search.trim());
      if (activeStatus !== "ALL") params.set("status", activeStatus);
      const [userResponse, roleResponse] = await Promise.all([
        apiRequest<ClinicUser[]>(`/users?${params}`, { token: activeToken }),
        apiRequest<Role[]>("/roles?limit=100&sortBy=name&sortOrder=asc", { token: activeToken }),
      ]);
      setUsers(userResponse.data);
      setMeta({
        total: userResponse.meta?.total ?? userResponse.data.length,
        page: userResponse.meta?.page ?? 1,
        totalPages: userResponse.meta?.totalPages ?? 1,
      });
      setRoles(roleResponse.data.filter((role) => role.isActive));
    } catch (error) {
      setNotice({ kind: "error", text: errorText(error) });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const savedToken = localStorage.getItem("klinic-test-token");
    const savedProfile = localStorage.getItem("klinic-test-profile");
    queueMicrotask(() => {
      if (!savedToken) { setLoading(false); return; }
      setToken(savedToken);
      if (savedProfile) {
        try { setProfile(JSON.parse(savedProfile)); } catch { setProfile(null); }
      }
      void load(savedToken);
    });
  }, [load]);

  const totals = useMemo(() => ({
    active: users.filter((user) => user.status === "ACTIVE").length,
    disabled: users.filter((user) => user.status === "DISABLED").length,
    doctors: users.filter((user) => user.roles.some((role) => role.code === "DOCTOR")).length,
  }), [users]);

  function openCreate() {
    setDraft({ ...emptyDraft, roleId: roles.find((role) => role.code === "STAFF")?.id ?? "" });
    setModal({ mode: "create", user: null });
    setNotice(null);
  }

  function openEdit(user: ClinicUser) {
    setDraft({ firstName: user.firstName, lastName: user.lastName, email: user.email, password: "", roleId: user.roles[0]?.id ?? "" });
    setModal({ mode: "edit", user });
    setNotice(null);
  }

  async function submitUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!modal || modal.mode === "password") return;
    if (!draft.roleId) { setNotice({ kind: "error", text: "กรุณาเลือก 1 บทบาท" }); return; }
    setSaving(true); setNotice(null);
    try {
      if (modal.mode === "create") {
        await apiRequest<ClinicUser>("/users", { method: "POST", token, body: JSON.stringify(draft) });
        setNotice({ kind: "success", text: `สร้างบัญชี ${draft.email.toLowerCase()} เรียบร้อยแล้ว` });
      } else {
        await apiRequest<ClinicUser>(`/users/${modal.user.id}`, {
          method: "PATCH", token,
          body: JSON.stringify({ firstName: draft.firstName, lastName: draft.lastName, email: draft.email }),
        });
        await apiRequest(`/users/${modal.user.id}/roles`, { method: "PUT", token, body: JSON.stringify({ roleIds: [draft.roleId] }) });
        setNotice({ kind: "success", text: `อัปเดตข้อมูล ${draft.firstName} ${draft.lastName} เรียบร้อยแล้ว` });
      }
      setModal(null);
      await load(token, query, status);
    } catch (error) {
      setNotice({ kind: "error", text: errorText(error) });
    } finally { setSaving(false); }
  }

  async function submitPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!modal || modal.mode !== "password") return;
    setSaving(true); setNotice(null);
    try {
      await apiRequest(`/users/${modal.user.id}/password`, { method: "PATCH", token, body: JSON.stringify({ password }) });
      setModal(null); setPassword("");
      setNotice({ kind: "success", text: `ตั้งรหัสผ่านใหม่ให้ ${modal.user.firstName} เรียบร้อยแล้ว` });
    } catch (error) { setNotice({ kind: "error", text: errorText(error) }); }
    finally { setSaving(false); }
  }

  async function changeStatus(user: ClinicUser) {
    if (user.status === "PENDING_ACTIVATION") return;
    const nextStatus = user.status === "ACTIVE" ? "DISABLED" : "ACTIVE";
    setSaving(true); setNotice(null);
    try {
      await apiRequest(`/users/${user.id}/status`, { method: "PATCH", token, body: JSON.stringify({ status: nextStatus }) });
      setNotice({ kind: "success", text: `${nextStatus === "ACTIVE" ? "เปิด" : "ปิด"}การใช้งาน ${user.firstName} เรียบร้อยแล้ว` });
      await load(token, query, status);
    } catch (error) { setNotice({ kind: "error", text: errorText(error) }); }
    finally { setSaving(false); }
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void load(token, query, status);
  }

  if (loading && !token) return <div className="catalog-loading">กำลังเตรียมหน้าจัดการผู้ใช้งาน…</div>;
  if (!token) return <main className="catalog-auth"><div className="catalog-auth-card"><div className="brand-mark">K<span>+</span></div><p className="eyebrow">USER MANAGEMENT</p><h1>กรุณาเข้าสู่ระบบก่อน</h1><p className="muted">หน้าจัดการผู้ใช้งานใช้ session เดียวกับ Clinic workbench</p><Link className="primary-button catalog-link-button" href="/">ไปหน้าเข้าสู่ระบบ</Link></div></main>;

  return <main className="app-shell users-app">
    <AppSidebar active="users" profile={profile} />
    <section className="workspace">
      <header className="topbar users-topbar">
        <div><p className="eyebrow">CLINIC ACCESS</p><h1>ผู้ใช้งานและสิทธิ์</h1><p>สร้างบัญชี กำหนดบทบาท และควบคุมการเข้าใช้งานของสาขา</p></div>
        <div className="top-actions"><button className="ghost-button" onClick={() => void load(token, query, status)}>↻ โหลดใหม่</button><button className="primary-button users-create" onClick={openCreate}>＋ เพิ่มผู้ใช้งาน</button></div>
      </header>
      <div className="content users-content">
        {notice && <div className={`notice users-notice ${notice.kind}`}><b>{notice.kind === "success" ? "✓" : "!"}</b><span>{notice.text}</span><button onClick={() => setNotice(null)}>×</button></div>}

        <section className="users-overview">
          <article className="users-summary-card primary"><span>♙</span><div><small>ผู้ใช้งานทั้งหมด</small><b>{meta.total}</b><p>บัญชีในสาขานี้</p></div></article>
          <article className="users-summary-card"><span>✓</span><div><small>กำลังใช้งาน</small><b>{totals.active}</b><p>เข้าสู่ระบบได้</p></div></article>
          <article className="users-summary-card"><span>＋</span><div><small>แพทย์</small><b>{totals.doctors}</b><p>บทบาท DOCTOR</p></div></article>
          <article className="users-summary-card muted-card"><span>×</span><div><small>ปิดใช้งาน</small><b>{totals.disabled}</b><p>เก็บประวัติไว้</p></div></article>
        </section>

        <section className="panel users-directory">
          <header className="users-directory-head">
            <div><p className="eyebrow">DIRECTORY</p><h2>รายชื่อผู้ใช้งาน</h2><p>ใช้การปิดใช้งานแทนการลบบัญชี เพื่อเก็บประวัติการทำรายการ</p></div>
            <form className="users-filters" onSubmit={submitSearch}>
              <label className="users-search"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ค้นหาชื่อหรือนามสกุล หรืออีเมล…" /></label>
              <select value={status} onChange={(event) => { const value = event.target.value as typeof status; setStatus(value); void load(token, query, value); }}>
                <option value="ALL">ทุกสถานะ</option><option value="ACTIVE">ใช้งานอยู่</option><option value="DISABLED">ปิดใช้งาน</option>
              </select>
              <button className="ghost-button" type="submit">ค้นหา</button>
            </form>
          </header>

          <div className="users-table">
            <div className="users-table-head"><span>ผู้ใช้งาน</span><span>บัญชีเข้าสู่ระบบ</span><span>บทบาท</span><span>สถานะ</span><span>จัดการ</span></div>
            {loading ? <div className="users-empty">กำลังโหลดผู้ใช้งาน…</div> : users.length === 0 ? <div className="users-empty"><span>⌕</span><b>ไม่พบผู้ใช้งาน</b><p>ลองเปลี่ยนคำค้นหาหรือตัวกรองสถานะ</p></div> : users.map((user) => <article key={user.id}>
              <div className="users-identity"><span>{initials(user)}</span><div><b>{user.firstName} {user.lastName}</b><small>เพิ่มเมื่อ {new Intl.DateTimeFormat("th-TH", { dateStyle: "medium" }).format(new Date(user.createdAt))}</small></div></div>
              <div className="users-account"><b>{user.email}</b><small>ใช้สำหรับเข้าสู่ระบบ</small></div>
              <div className="users-roles">{user.roles.length ? user.roles.map((role) => <span key={role.id} className={role.code.toLowerCase()}>{role.name}</span>) : <em>ยังไม่มีบทบาท</em>}</div>
              <span className={`users-status ${user.status.toLowerCase()}`}><i />{statusLabel[user.status]}</span>
              <div className="users-actions"><button title="แก้ไขข้อมูลและบทบาท" onClick={() => openEdit(user)}>แก้ไข</button><button title="ตั้งรหัสผ่านใหม่" onClick={() => { setPassword(""); setModal({ mode: "password", user }); }}>รหัสผ่าน</button><button className={user.status === "ACTIVE" ? "danger" : "enable"} disabled={saving || user.status === "PENDING_ACTIVATION"} onClick={() => void changeStatus(user)}>{user.status === "ACTIVE" ? "ปิดใช้" : "เปิดใช้"}</button></div>
            </article>)}
          </div>
          <footer className="users-table-footer"><span>แสดง {users.length} จาก {meta.total} บัญชี</span><span>หน้า {meta.page} / {meta.totalPages}</span></footer>
        </section>
      </div>
    </section>

    {modal && modal.mode !== "password" && <div className="users-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setModal(null); }}>
      <form className="users-modal" onSubmit={submitUser}>
        <header><div><p className="eyebrow">{modal.mode === "create" ? "NEW USER" : "EDIT USER"}</p><h2>{modal.mode === "create" ? "เพิ่มผู้ใช้งานในสาขา" : `แก้ไข ${modal.user.firstName} ${modal.user.lastName}`}</h2><p>{modal.mode === "create" ? "กำหนดข้อมูลเข้าสู่ระบบและบทบาทเริ่มต้น" : "อัปเดตข้อมูลบัญชีและสิทธิ์การทำงาน"}</p></div><button type="button" onClick={() => setModal(null)}>×</button></header>
        <div className="users-form-grid">
          <label>ชื่อจริง *<input required maxLength={100} value={draft.firstName} onChange={(event) => setDraft({ ...draft, firstName: event.target.value })} /></label>
          <label>นามสกุล *<input required maxLength={100} value={draft.lastName} onChange={(event) => setDraft({ ...draft, lastName: event.target.value })} /></label>
          <label>อีเมล *<input required type="email" maxLength={254} value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} /></label>
          {modal.mode === "create" && <label className="wide">รหัสผ่านเริ่มต้น *<input required minLength={8} maxLength={72} type="password" autoComplete="new-password" value={draft.password} onChange={(event) => setDraft({ ...draft, password: event.target.value })} /><small>อย่างน้อย 8 ตัวอักษร แจ้งให้ผู้ใช้เปลี่ยนหลังเข้าสู่ระบบครั้งแรก</small></label>}
        </div>
        <fieldset className="users-role-picker"><legend>บทบาทและขอบเขตการทำงาน *</legend><p>ผู้ใช้งานหนึ่งคนเลือกได้หนึ่งบทบาท</p><div>{roles.map((role) => <label key={role.id} className={draft.roleId === role.id ? "selected" : ""}><input type="radio" name="clinic-role" checked={draft.roleId === role.id} onChange={() => setDraft({ ...draft, roleId: role.id })} /><span>{role.code.slice(0, 1)}</span><div><b>{role.name}</b><small>{roleDescription[role.code] ?? role.description ?? role.code}</small></div><i>✓</i></label>)}</div></fieldset>
        <footer><button className="ghost-button" type="button" disabled={saving} onClick={() => setModal(null)}>ยกเลิก</button><button className="primary-button" type="submit" disabled={saving}>{saving ? "กำลังบันทึก…" : modal.mode === "create" ? "สร้างผู้ใช้งาน" : "บันทึกการแก้ไข"}</button></footer>
      </form>
    </div>}

    {modal?.mode === "password" && <div className="users-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setModal(null); }}><form className="users-modal users-password-modal" onSubmit={submitPassword}><header><div><p className="eyebrow">RESET PASSWORD</p><h2>ตั้งรหัสผ่านใหม่</h2><p>{modal.user.firstName} {modal.user.lastName} · {modal.user.email}</p></div><button type="button" onClick={() => setModal(null)}>×</button></header><label>รหัสผ่านใหม่ *<input autoFocus required minLength={8} maxLength={72} type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} /><small>อย่างน้อย 8 ตัวอักษร</small></label><div className="users-security-note"><span>!</span><p>บัญชีจะใช้รหัสผ่านใหม่ในการเข้าสู่ระบบครั้งถัดไป</p></div><footer><button className="ghost-button" type="button" disabled={saving} onClick={() => setModal(null)}>ยกเลิก</button><button className="primary-button" type="submit" disabled={saving}>{saving ? "กำลังบันทึก…" : "ยืนยันรหัสผ่านใหม่"}</button></footer></form></div>}
  </main>;
}
