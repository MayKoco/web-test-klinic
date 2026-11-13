"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  SubscriptionRegistration,
  SubscriptionIcon as Icon,
  type SubscriptionPlan as Plan,
} from "./subscription-registration";
import styles from "./subscription-plans.module.css";

type Filter = "ALL" | "SINGLE" | "MULTI";
const money = (value: number) =>
  new Intl.NumberFormat("th-TH", { maximumFractionDigits: 2 }).format(value);
export function SubscriptionPlans({
  apiBase = "/api/clinic/public",
}: {
  apiBase?: string;
  freeSignupUrl?: string;
}) {
  const [plans, setPlans] = useState<Plan[]>([]),
    [selected, setSelected] = useState<Plan | null>(null),
    [filter, setFilter] = useState<Filter>("ALL"),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`${apiBase}/packages`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok || !result.success)
          throw new Error(result.message || "โหลดแพ็กเกจไม่สำเร็จ");
        if (!controller.signal.aborted) {
          setPlans(result.data);
          setError("");
        }
      })
      .catch((cause) => {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error ? cause.message : "โหลดแพ็กเกจไม่สำเร็จ",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [apiBase, reload]);
  const visible = plans.filter(
    (plan) =>
      filter === "ALL" ||
      (filter === "MULTI"
        ? (plan.branchLimit ?? 1) > 1
        : (plan.branchLimit ?? 1) === 1),
  );
  const compact = visible.filter(
    (plan) =>
      (plan.branchLimit ?? 1) === 1 &&
      (plan.isFree || plan.subscriptionDays < 365),
  );
  const featured = visible.filter((plan) => !compact.includes(plan));
  function card(plan: Plan, wide = false) {
    const multi = (plan.branchLimit ?? 1) > 1;
    const annual = !plan.isFree && plan.subscriptionDays >= 365;
    const features = Array.isArray(plan.features)
      ? plan.features.filter(
          (value): value is string =>
            typeof value === "string" &&
            value.trim().length > 0 &&
            // Structured branchLimit wins over legacy quota text in features.
            !/(?:\d|หลาย|ไม่จำกัด).{0,12}สาขา|\b(?:unlimited|\d+)\s+branches?\b/i.test(
              value,
            ),
        )
      : [];
    const highlights = features.length
      ? features.slice(0, 4)
      : [
          ...(multi
            ? [`รองรับสูงสุด ${plan.branchLimit} สาขาในแพ็กเกจเดียว`]
            : []),
          "ระบบจัดเตรียม URL ให้อัตโนมัติ",
          "เริ่มนับวันเมื่อคลินิกพร้อมใช้งาน",
          ...(multi ? ["ทุกสาขาใช้วันหมดอายุเดียวกัน"] : []),
        ];
    return (
      <article
        key={plan.id}
        className={`${styles.card} ${multi ? styles.dark : ""} ${wide ? styles.wide : ""}`}
      >
        <div className={styles.cardTop}>
          <span className={`${styles.iconTile} ${annual ? styles.annual : ""}`}>
            <Icon
              name={
                multi
                  ? "building"
                  : plan.isFree
                    ? "globe"
                    : annual
                      ? "shield"
                      : "clock"
              }
            />
          </span>
          <span className={styles.tag}>
            {plan.isFree
              ? "เริ่มต้นใช้งานฟรี"
              : multi
                ? "สำหรับหลายสาขา"
                : `ใช้งาน ${plan.subscriptionDays} วัน`}
          </span>
          {multi && (
            <small className={styles.average}>
              เฉลี่ย ฿{money(Number(plan.price) / (plan.branchLimit ?? 1))} /
              สาขา / {plan.subscriptionDays} วัน
            </small>
          )}
        </div>
        <div className={styles.offer}>
          <div className={styles.planTitle}>
            <h2>{plan.name}</h2>
            <p>
              {plan.description ||
                (multi
                  ? "กรอกสาขาแรกก่อน และเพิ่มสาขาตามโควตาภายหลังได้"
                  : "เลือกช่วงเวลาใช้งานที่เหมาะกับคลินิกของคุณ")}
            </p>
          </div>
          <div className={styles.priceBlock}>
            <div className={styles.price}>
              <strong>฿{money(Number(plan.price))}</strong>
              {!wide && <span>/ {plan.subscriptionDays} วัน</span>}
            </div>
            <span className={styles.quota}>
              <Icon name={multi ? "building" : "clock"} />
              {plan.subscriptionDays} วัน · สูงสุด {plan.branchLimit ?? 1} สาขา
            </span>
          </div>
        </div>
        <ul className={styles.features}>
          {highlights.map((feature, index) => (
            <li key={`${index}:${feature}`}>
              <Icon name="check" />
              <span>{feature}</span>
            </li>
          ))}
        </ul>
        <button
          type="button"
          className={`${styles.choose} ${plan.isFree ? styles.free : multi ? styles.primary : wide ? styles.solid : ""}`}
          onClick={() => setSelected(plan)}
        >
          {plan.isFree
            ? "สมัคร Free Tier"
            : `เลือกแพ็กเกจ${wide ? ` ${plan.name}` : ""}`}
          <Icon name="arrow" />
        </button>
      </article>
    );
  }
  return (
    <main className={styles.page}>
      <header className={styles.nav}>
        <div className={styles.navInner}>
          <Link href="/" className={styles.brand}>
            <span>
              <Icon name="globe" />
            </span>
            Klinic <em>Cloud</em>
          </Link>
          <span className={styles.reassurance}>
            <Icon name="shield" />
            เริ่มนับอายุแพ็กเกจเมื่อคลินิกพร้อมใช้งาน
          </span>
          <Link className={styles.login} href="/login">
            เข้าสู่ระบบ
          </Link>
        </div>
      </header>
      <div className={styles.content}>
        <section
          className={styles.intro}
          aria-labelledby="subscription-plans-title"
        >
          <span className={styles.introBadge}>แพ็กเกจและอัตราค่าบริการ</span>
          <h1 id="subscription-plans-title">
            เลือกแพ็กเกจที่เหมาะกับคลินิกของคุณ
          </h1>
          <p>
            เลือกแพ็กเกจ ส่งคำขอ และรอเจ้าหน้าที่รับเรื่อง พร้อม Invoice
            สำหรับแพ็กเกจที่มีค่าใช้จ่าย
            <br />
            <strong>
              ทุกสาขาหมดอายุพร้อมกัน เริ่มนับเมื่อคลินิกพร้อมใช้งาน
            </strong>
          </p>
          <div className={styles.filters} role="group" aria-label="กรองแพ็กเกจ">
            {(
              [
                ["ALL", `แพ็กเกจทั้งหมด (${plans.length})`],
                ["SINGLE", "สำหรับ 1 สาขา"],
                ["MULTI", "สำหรับหลายสาขา"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </section>
        {loading && (
          <p role="status" className={styles.status}>
            กำลังโหลดแพ็กเกจ…
          </p>
        )}
        {error && (
          <div role="alert" className={styles.error}>
            <p>{error}</p>
            <button
              type="button"
              onClick={() => {
                setLoading(true);
                setReload((value) => value + 1);
              }}
            >
              ลองอีกครั้ง
            </button>
          </div>
        )}
        {!loading && !error && (
          <>
            <p className={styles.srOnly} role="status">
              แสดง {visible.length} แพ็กเกจ
            </p>
            {compact.length > 0 && (
              <div
                className={`${styles.standardGrid} ${compact.length === 2 || (compact.length > 3 && compact.length % 3 === 1) ? styles.balanced : ""}`}
              >
                {compact.map((plan) => card(plan))}
              </div>
            )}
            {featured.length > 0 && (
              <div className={styles.featuredGrid}>
                {featured.map((plan) => card(plan, true))}
              </div>
            )}
            {!visible.length && (
              <p className={styles.status}>ยังไม่มีแพ็กเกจในกลุ่มนี้</p>
            )}
          </>
        )}
        <aside className={styles.process}>
          <span className={styles.processIcon}>
            <Icon name="file" />
          </span>
          <div>
            <h2>ขั้นตอนการสมัครและออกเอกสาร Invoice</h2>
            <p>
              เลือกแพ็กเกจ → กรอกข้อมูลองค์กรและข้อมูลออกบิล → เจ้าหน้าที่ส่ง
              Invoice พร้อมบัญชีธนาคารทางอีเมล
            </p>
          </div>
          <span className={styles.processBadge}>
            ติดตามสถานะผ่านลิงก์ Ticket
          </span>
        </aside>
        <footer className={styles.footer}>
          Klinic · จัดการคลินิกและทุกสาขาในที่เดียว
        </footer>
      </div>
      {selected && (
        <SubscriptionRegistration
          key={selected.id}
          plan={selected}
          apiBase={apiBase}
          variant="dialog"
          onBack={() => setSelected(null)}
        />
      )}
    </main>
  );
}
