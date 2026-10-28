import AppSidebar from "@/components/app-sidebar";

type ModuleId = "dashboard" | "patients" | "treatments" | "payments" | "resources" | "settings";

const modules: Record<ModuleId, {
  eyebrow: string;
  title: string;
  description: string;
  role: string;
  actions: string[];
}> = {
  dashboard: { eyebrow: "CLINIC OVERVIEW", title: "แดชบอร์ด", description: "ภาพรวมงานของคลินิกในแต่ละวัน", role: "OWNER · MANAGER · STAFF · DOCTOR", actions: ["นัดหมายวันนี้", "คิวที่กำลังรอ", "ยอดขายและการชำระ", "แจ้งเตือนสต็อก"] },
  patients: { eyebrow: "PATIENT DIRECTORY", title: "ลูกค้า", description: "ค้นหาและดูประวัติพื้นฐานของลูกค้า", role: "OWNER · MANAGER · STAFF · DOCTOR", actions: ["รายชื่อลูกค้า", "ข้อมูลติดต่อ", "ประวัตินัดหมาย", "สิทธิ์และคอร์สคงเหลือ"] },
  treatments: { eyebrow: "CLINICAL WORKSPACE", title: "การรักษา", description: "Clinical workspace สำหรับแพทย์โดยเฉพาะ", role: "DOCTOR", actions: ["บันทึกการรักษา", "อาการและบริเวณรักษา", "ภาพก่อนและหลัง", "ใช้สิทธิ์การรักษา"] },
  payments: { eyebrow: "PAYMENT OPERATIONS", title: "การชำระเงิน", description: "ติดตามยอดค้างและรายการรับชำระของคลินิก", role: "OWNER · MANAGER", actions: ["ยอดรอชำระ", "ประวัติการชำระ", "ใบเสร็จ", "สรุปยอดประจำวัน"] },
  resources: { eyebrow: "CLINIC RESOURCES", title: "แพทย์และห้องตรวจ", description: "จัดการทรัพยากรและช่วงเวลาที่เปิดให้จอง", role: "OWNER · MANAGER · DOCTOR", actions: ["รายชื่อแพทย์", "ห้องตรวจ", "ตารางเวร", "วันหยุดและข้อยกเว้น"] },
  settings: { eyebrow: "CLINIC SETTINGS", title: "ข้อมูลพื้นฐานและตั้งค่า", description: "ข้อมูลสาขา เวลาเปิดทำการ และค่าระบบ", role: "OWNER · MANAGER · STAFF", actions: ["ข้อมูลคลินิก", "เวลาเปิดทำการ", "Subdomain", "การตั้งค่าการทำงาน"] },
};

export default function ClinicModulePage({ module }: { module: ModuleId }) {
  const item = modules[module];
  return (
    <main className="app-shell">
      <AppSidebar active={module} />
      <section className="workspace">
        <header className="topbar module-topbar">
          <div><p className="eyebrow">{item.eyebrow}</p><h1>{item.title}</h1></div>
          <span className="module-role">{item.role}</span>
        </header>
        <div className="content module-content">
          <section className="module-intro">
            <div><p className="eyebrow">MODULE MAP</p><h2>{item.description}</h2><p>หน้านี้เป็นจุดเข้าจากเมนูหลัก เพื่อให้ navigation ครบทุก domain และใช้ layout เดียวกันทั้งระบบ</p></div>
            <span>{item.title.slice(0, 1)}</span>
          </section>
          <section className="module-action-grid">
            {item.actions.map((action, index) => <article key={action}><span>{String(index + 1).padStart(2, "0")}</span><div><b>{action}</b><small>เตรียม route สำหรับเชื่อม UI และ API ของโมดูล</small></div><i>→</i></article>)}
          </section>
          <div className="module-note"><span>i</span><p><b>Navigation พร้อมใช้งาน</b> Feature ภายในหน้านี้จะพัฒนาตาม controller และ permission ของแต่ละ role โดยไม่รวมทุก workflow ไว้ในหน้าเดียว</p></div>
        </div>
      </section>
    </main>
  );
}
