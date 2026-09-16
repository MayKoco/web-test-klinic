"use client";

type SidebarProps = {
  active: "queue" | "scheduling" | "appointment" | "catalog" | "bundles" | "sales" | "reports" | "resources" | "schedule";
  profile?: { name: string; clinicCode: string } | null;
};

const groups = [
  {
    label: "งานประจำวัน",
    items: [
      { id: "queue", href: "/queue", icon: "≋", label: "คิว / Check-in" },
      { id: "scheduling", href: "/", icon: "▦", label: "ตารางนัดหมาย" },
      { id: "appointment", href: "/#appointment-form", icon: "+", label: "สร้างนัดใหม่" },
    ],
  },
  {
    label: "บริการและการขาย",
    items: [
      { id: "catalog", href: "/catalog", icon: "◇", label: "ผลิตภัณฑ์และบริการ" },
      { id: "bundles", href: "/catalog?tab=BUNDLES", icon: "⌘", label: "แพ็กเกจและโปรโมชัน" },
      { id: "sales", href: "/sales", icon: "฿", label: "การขายและชำระเงิน" },
      { id: "reports", href: "/catalog?tab=REPORTS", icon: "↗", label: "รายงาน" },
    ],
  },
  {
    label: "ตั้งค่าคลินิก",
    items: [
      { id: "resources", href: "/#resources", icon: "✚", label: "แพทย์และห้องตรวจ" },
      { id: "schedule", href: "/#schedule", icon: "⌁", label: "ตารางเวร" },
    ],
  },
] as const;

export default function AppSidebar({ active, profile }: SidebarProps) {
  return (
    <aside className="sidebar app-sidebar">
      <a className="brand sidebar-brand" href="/queue">
        <div className="brand-mark small">K<span>+</span></div>
        <div><strong>Klinic</strong><small>CLINIC OS</small></div>
      </a>

      <nav className="sidebar-menu" aria-label="เมนูหลัก">
        {groups.map(group => (
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

      <div className="sidebar-foot">
        <span className="profile-avatar">{(profile?.name ?? "K").slice(0, 1).toUpperCase()}</span>
        <div><b>{profile?.clinicCode ?? "Connected"}</b><small>{profile?.name ?? "Authenticated session"}</small></div>
        <span className="online-dot" />
      </div>
    </aside>
  );
}
