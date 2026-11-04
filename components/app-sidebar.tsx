"use client";

import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/api";
import { ClinicSessionProfile, hasOwnerRole } from "@/lib/clinic-session";
import { clearOwnerSession } from "@/lib/owner-session";

type SidebarProps = {
  active: "dashboard" | "patients" | "queue" | "scheduling" | "treatments" | "catalog" | "inventory" | "sales" | "payments" | "resources" | "settings" | "users" | "organization";
  profile?: ClinicSessionProfile | null;
};

type MenuItem = {
  id: SidebarProps["active"];
  href: string;
  icon: string;
  label: string;
  anyPermission?: string[];
};

const groups: Array<{ label: string; ownerOnly?: boolean; items: MenuItem[] }> = [
  {
    label: "ภาพรวมและบริการ",
    items: [
      { id: "dashboard", href: "/dashboard", icon: "⌂", label: "แดชบอร์ด" },
      { id: "patients", href: "/patients", icon: "○", label: "ลูกค้า", anyPermission: ["PATIENT_VIEW"] },
      { id: "users", href: "/users", icon: "♙", label: "พนักงาน", anyPermission: ["USER_VIEW"] },
      { id: "scheduling", href: "/appointments", icon: "▦", label: "นัดหมาย", anyPermission: ["APPOINTMENT_VIEW"] },
      { id: "queue", href: "/queue", icon: "≋", label: "คิว / Check-in", anyPermission: ["QUEUE_VIEW"] },
      { id: "treatments", href: "/treatments", icon: "+", label: "การรักษา", anyPermission: ["TREATMENT_VIEW"] },
    ],
  },
  {
    label: "สินค้าและการเงิน",
    items: [
      { id: "catalog", href: "/catalog", icon: "◇", label: "ผลิตภัณฑ์และบริการ", anyPermission: ["CATALOG_VIEW"] },
      { id: "inventory", href: "/inventory", icon: "▤", label: "คลังสินค้า / Lot", anyPermission: ["CATALOG_VIEW"] },
      { id: "sales", href: "/sales", icon: "฿", label: "การขาย", anyPermission: ["SALE_VIEW"] },
      { id: "payments", href: "/payments", icon: "▭", label: "การชำระเงิน", anyPermission: ["PAYMENT_VIEW"] },
    ],
  },
  {
      label: "ตั้งค่าคลินิก",
      items: [
      { id: "resources", href: "/resources", icon: "✚", label: "แพทย์และห้องตรวจ", anyPermission: ["DOCTOR_VIEW", "DOCTOR_SCHEDULE_VIEW"] },
      { id: "settings", href: "/settings", icon: "⚙", label: "ข้อมูลพื้นฐานและตั้งค่า", anyPermission: ["SETTING_VIEW"] },
    ],
  },
  {
    label: "สำหรับเจ้าของ",
    ownerOnly: true,
    items: [
      { id: "organization", href: "/organization", icon: "⌘", label: "องค์กรและสาขา" },
    ],
  },
];

export default function AppSidebar({ active, profile }: SidebarProps) {
  const [ownerResolved, setOwnerResolved] = useState(false);
  const [permissions, setPermissions] = useState<string[] | null>(null);

  useEffect(() => {
    const token = window.localStorage.getItem("klinic-test-token");
    if (!token) {
      return;
    }

    let cancelled = false;
    apiRequest<{ roles: string[]; permissions: string[] }>("/auth/me/permissions", { token })
      .then((result) => {
        if (cancelled) return;
        setPermissions(result.data.permissions);
        setOwnerResolved(result.data.roles.includes("OWNER"));
        const saved = window.localStorage.getItem("klinic-test-profile");
        if (!saved) return;
        const current = JSON.parse(saved) as ClinicSessionProfile;
        window.localStorage.setItem(
          "klinic-test-profile",
          JSON.stringify({ ...current, roles: result.data.roles }),
        );
      })
      .catch(() => {
        if (!cancelled) {
          setPermissions([]);
          setOwnerResolved(false);
        }
      });

    return () => { cancelled = true; };
  }, [profile]);

  const ownerVisible = profile?.roles ? hasOwnerRole(profile) : ownerResolved;
  const visibleGroups = groups
    .filter((group) => !group.ownerOnly || ownerVisible)
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => !item.anyPermission || item.anyPermission.some((permission) => permissions?.includes(permission))),
    }))
    .filter((group) => group.items.length > 0);

  function logout() {
    window.localStorage.removeItem("klinic-test-token");
    window.localStorage.removeItem("klinic-test-profile");
    clearOwnerSession();
    window.location.replace("/login");
  }

  return (
    <>
      <aside className="sidebar app-sidebar">
        <a className="brand sidebar-brand" href="/dashboard">
          <div className="brand-mark small">K<span>+</span></div>
          <div><strong>Klinic</strong><small>CLINIC OS</small></div>
        </a>

        <nav className="sidebar-menu" aria-label="เมนูหลัก">
          {visibleGroups.map(group => (
            <section className="sidebar-group" key={group.label}>
              <p>{group.label}</p>
              {group.items.map(item => (
                <a
                  key={`${item.href}-${item.label}`}
                  href={item.href}
                  className={active === item.id ? "active" : ""}
                >
                  <span className="sidebar-icon" aria-hidden="true">{item.icon}</span>
                  <span>{item.label}</span>
                  {item.id === "queue" && <i>LIVE</i>}
                </a>
              ))}
            </section>
          ))}
        </nav>

        <div className="sidebar-session">
          <div className="sidebar-foot">
            <span className="profile-avatar">{(profile?.name ?? "K").slice(0, 1).toUpperCase()}</span>
            <div><b>{profile?.clinicCode ?? "Connected"}</b><small>{profile?.name ?? "Authenticated session"}</small></div>
            <span className="online-dot" />
          </div>
          <button className="sidebar-logout" type="button" onClick={logout}>
            <span aria-hidden="true">↪</span>
            ออกจากระบบ
          </button>
        </div>
      </aside>
      <nav className="mobile-app-nav" aria-label="เมนูหลักบนมือถือ">
        {visibleGroups.map((group) => group.items.map((item) => (
          <a key={`mobile-${item.href}`} href={item.href} className={active === item.id ? "active" : ""}>
            <span aria-hidden="true">{item.icon}</span><b>{item.label.replace(" / Check-in", "")}</b>
          </a>
        )))}
        <button className="mobile-logout" type="button" onClick={logout}>
          <span aria-hidden="true">↪</span><b>ออกจากระบบ</b>
        </button>
      </nav>
    </>
  );
}
