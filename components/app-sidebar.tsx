"use client";

type SidebarProps = {
  active: "dashboard" | "patients" | "queue" | "scheduling" | "treatments" | "catalog" | "inventory" | "sales" | "payments" | "resources" | "settings" | "users";
  profile?: { name: string; clinicCode: string } | null;
};

const groups = [
  {
    label: "ภาพรวมและบริการ",
    items: [
      { id: "dashboard", href: "/dashboard", icon: "⌂", label: "แดชบอร์ด" },
      { id: "patients", href: "/patients", icon: "○", label: "ลูกค้า" },
      { id: "users", href: "/users", icon: "♙", label: "พนักงาน" },
      { id: "scheduling", href: "/appointments", icon: "▦", label: "นัดหมาย" },
      { id: "queue", href: "/queue", icon: "≋", label: "คิว / Check-in" },
      { id: "treatments", href: "/treatments", icon: "+", label: "การรักษา" },
    ],
  },
  {
    label: "สินค้าและการเงิน",
    items: [
      { id: "catalog", href: "/catalog", icon: "◇", label: "ผลิตภัณฑ์และบริการ" },
      { id: "inventory", href: "/inventory", icon: "▤", label: "คลังสินค้า / Lot" },
      { id: "sales", href: "/sales", icon: "฿", label: "การขาย" },
      { id: "payments", href: "/payments", icon: "▭", label: "การชำระเงิน" },
    ],
  },
  {
      label: "ตั้งค่าคลินิก",
      items: [
      { id: "resources", href: "/resources", icon: "✚", label: "แพทย์และห้องตรวจ" },
      { id: "settings", href: "/settings", icon: "⚙", label: "ข้อมูลพื้นฐานและตั้งค่า" },
    ],
  },
] as const;

export default function AppSidebar({ active, profile }: SidebarProps) {
  return (
    <>
      <aside className="sidebar app-sidebar">
        <a className="brand sidebar-brand" href="/dashboard">
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
      <nav className="mobile-app-nav" aria-label="เมนูหลักบนมือถือ">
        {groups.map((group) => group.items.map((item) => (
          <a key={`mobile-${item.href}`} href={item.href} className={active === item.id ? "active" : ""}>
            <span aria-hidden="true">{item.icon}</span><b>{item.label.replace(" / Check-in", "")}</b>
          </a>
        )))}
      </nav>
    </>
  );
}
