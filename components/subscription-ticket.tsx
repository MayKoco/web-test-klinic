"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./subscription-ticket.module.css";
import { SubscriptionIcon as Icon } from "./subscription-registration";
type Ticket = {
  id: string;
  clinicName: string;
  packageName: string;
  amountMinor: number;
  currency: string;
  paymentMethod: string;
  approvedAt: string | null;
  subscriptionDays: number;
  branchLimit: number;
  requestStatus: string;
  paymentStatus: string;
  provisioningStatus: string;
  bankDetails: {
    name: string;
    accountName: string;
    accountNumber: string;
    isTest: boolean;
  } | null;
  invoice: { id: string; number: string; pdfStatus: string } | null;
  evidence: {
    id: string;
    status: string;
    reviewReason: string | null;
    createdAt: string;
  }[];
};
const label: Record<string, string> = {
  SUBMITTED: "รอเจ้าหน้าที่รับเรื่อง",
  ACCEPTED: "รับเรื่องแล้ว",
  COMPLETED: "สร้างคลินิกสำเร็จ",
  AWAITING_TRANSFER: "รอโอนชำระ",
  UNDER_REVIEW: "รอตรวจหลักฐาน",
  VERIFIED: "ยืนยันรับเงินแล้ว",
  NOT_REQUIRED: "ไม่มีค่าใช้จ่าย",
  APPROVED: "อนุมัติแล้ว รอสร้างคลินิก",
  NEEDS_RESUBMISSION: "กรุณาส่งหลักฐานใหม่",
  NOT_STARTED: "ยังไม่เริ่มสร้าง",
  PAID: "รอเริ่มสร้าง",
  PROVISIONING: "กำลังสร้าง",
  READY: "พร้อมใช้งาน",
  FAILED: "กำลังติดตามงานสร้าง",
  REJECTED: "ขอหลักฐานใหม่",
};
export function SubscriptionTicket({
  id,
  apiBase = "/api/clinic/public",
}: {
  id: string;
  apiBase?: string;
}) {
  const [token, setToken] = useState(""),
    [ticket, setTicket] = useState<Ticket | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [selectedFile, setSelectedFile] = useState<File | null>(null),
    [dragging, setDragging] = useState(false),
    [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const uploadPending = useRef(false);
  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      if (!active) return;
      const value =
        window.location.hash.slice(1) ||
        sessionStorage.getItem(`ticket:${id}`) ||
        "";
      if (value) {
        sessionStorage.setItem(`ticket:${id}`, value);
        setToken(value);
        history.replaceState(null, "", window.location.pathname);
      } else setError("ลิงก์ติดตามไม่ครบ กรุณาเปิดลิงก์จากอีเมลอีกครั้ง");
    });
    return () => {
      active = false;
    };
  }, [id]);
  const refresh = useCallback(async () => {
    if (!token) return;
    try {
      const r = await fetch(`${apiBase}/subscription-orders/${id}`, {
        headers: { "X-Subscription-Ticket": token },
        cache: "no-store",
      });
      const b = await r.json();
      if (!r.ok || !b.success) throw new Error(b.message || "โหลดสถานะไม่ได้");
      setTicket(b.data);
      setUpdatedAt(new Date());
      setError("");
    } catch (e) {
      setError(String(e));
    }
  }, [apiBase, id, token]);
  useEffect(() => {
    if (!token) return;
    void Promise.resolve().then(refresh);
    let polls = 0;
    const timer = setInterval(() => {
      if (++polls >= 60) {
        clearInterval(timer);
        return;
      }
      void refresh();
    }, 10000);
    return () => clearInterval(timer);
  }, [token, refresh]);
  async function download() {
    setBusy(true);
    try {
      const r = await fetch(
        `${apiBase}/subscription-orders/${id}/invoice/download`,
        { headers: { "X-Subscription-Ticket": token } },
      );
      if (!r.ok) {
        const b = await r.json();
        throw new Error(b.message || "เอกสารยังไม่พร้อม");
      }
      const url = URL.createObjectURL(await r.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = `${ticket?.invoice?.number || "invoice"}.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError(String(e));
    } finally {
      uploadPending.current = false;
      setBusy(false);
    }
  }
  function chooseFile(file: File | undefined) {
    if (!file || busy) return;
    setError("");
    setNotice("");
    if (!["image/png", "image/jpeg", "application/pdf"].includes(file.type)) {
      setError("รองรับเฉพาะไฟล์ PNG, JPEG หรือ PDF เท่านั้น");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("ไฟล์ต้องไม่เกิน 5 MB");
      return;
    }
    setSelectedFile(file);
    setNotice("");
  }
  async function copyAccount() {
    if (!ticket?.bankDetails) return;
    try {
      if (!navigator.clipboard) throw new Error();
      await navigator.clipboard.writeText(ticket.bankDetails.accountNumber);
      setNotice("คัดลอกเลขบัญชีแล้ว");
    } catch {
      setError(
        "ไม่สามารถคัดลอกอัตโนมัติได้ กรุณาเลือกและคัดลอกเลขบัญชีที่แสดง",
      );
    }
  }
  async function upload(file: File | null) {
    if (!file || uploadPending.current) return;
    if (file.size > 5 * 1024 * 1024) {
      setError("ไฟล์ต้องไม่เกิน 5 MB");
      return;
    }
    uploadPending.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const r = await fetch(`${apiBase}/subscription-orders/${id}/evidence`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Subscription-Ticket": token,
        },
        body: JSON.stringify({ base64, contentType: file.type }),
      });
      const b = await r.json();
      if (!r.ok || !b.success)
        throw new Error(b.message || "ส่งหลักฐานไม่สำเร็จ");
      setSelectedFile(null);
      setNotice("ส่งหลักฐานแล้ว กรุณารอเจ้าหน้าที่ตรวจสอบ");
      await refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      uploadPending.current = false;
      setBusy(false);
    }
  }
  const free = ticket?.paymentMethod === "FREE";
  const accepted =
    !!ticket && ["ACCEPTED", "COMPLETED"].includes(ticket.requestStatus);
  const authorized =
    !!ticket &&
    (free ? !!ticket.approvedAt : ticket.paymentStatus === "VERIFIED");
  const ready = ticket?.provisioningStatus === "READY";
  const reviewing = ticket?.paymentStatus === "UNDER_REVIEW";
  const resubmit = ticket?.paymentStatus === "NEEDS_RESUBMISSION";
  const canUpload =
    !!ticket?.bankDetails &&
    !free &&
    ticket.requestStatus === "ACCEPTED" &&
    !authorized;
  const steps = free
    ? [
        { title: "ส่งคำขอสมัคร", detail: "บันทึกคำขอแล้ว", done: true },
        {
          title: "เจ้าหน้าที่รับเรื่อง",
          detail: accepted ? "รับเรื่องแล้ว" : "รอเจ้าหน้าที่รับเรื่อง",
          done: accepted,
        },
        {
          title: "อนุมัติแพ็กเกจฟรี",
          detail: authorized
            ? "อนุมัติแล้ว · ไม่มีค่าใช้จ่าย"
            : "รออนุมัติเปิดใช้งานฟรี",
          done: authorized,
        },
        {
          title: "เปิดใช้งานคลินิก",
          detail: ticket
            ? label[ticket.provisioningStatus] || ticket.provisioningStatus
            : "ยังไม่เริ่มสร้าง",
          done: ready,
        },
      ]
    : [
        {
          title: "ส่งคำขอสมัคร",
          detail: accepted
            ? "เจ้าหน้าที่รับเรื่องแล้ว"
            : "รอเจ้าหน้าที่รับเรื่อง",
          done: accepted,
        },
        {
          title: "ชำระเงินและแนบสลิป",
          detail:
            reviewing || authorized
              ? "ส่งหลักฐานแล้ว"
              : resubmit
                ? "กรุณาแนบหลักฐานใหม่"
                : accepted
                  ? "รอโอนชำระและแนบหลักฐาน"
                  : "รอออก Invoice",
          done: reviewing || authorized,
        },
        {
          title: "ตรวจสอบยอดเงิน",
          detail: authorized
            ? "ยืนยันรับเงินแล้ว"
            : reviewing
              ? "เจ้าหน้าที่กำลังตรวจสอบ"
              : "รอตรวจหลักฐาน",
          done: authorized,
        },
        {
          title: "เปิดใช้งานคลินิก",
          detail: ticket
            ? label[ticket.provisioningStatus] || ticket.provisioningStatus
            : "ยังไม่เริ่มสร้าง",
          done: ready,
        },
      ];
  const currentStep = steps.findIndex((step) => !step.done);
  const reassurance = ready
    ? "ระบบสร้างองค์กรและสาขาแรกพร้อมใช้งานแล้ว และเริ่มนับอายุแพ็กเกจเรียบร้อย"
    : "แพ็กเกจจะเริ่มนับเมื่อระบบสร้างองค์กรและสาขาแรกพร้อมใช้งาน ทุกสาขาหมดอายุพร้อมกัน";
  return (
    <div className={styles.page}>
      <header className={styles.topbar}>
        <a href="/subscription/plans" className={styles.brand}>
          <span>K</span> Klinic <small>ONBOARDING</small>
        </a>
        <span className={styles.secure}>
          <Icon name="shield" /> ลิงก์ติดตามคำขอส่วนบุคคล
        </span>
      </header>
      <main className={styles.wrap}>
        <header className={styles.heading}>
          <div>
            <p className={styles.eyebrow}>รายการคำขอเปิดใช้งานคลินิก</p>
            <h1>ติดตามสถานะคำขอและการชำระเงิน</h1>
            <p className={styles.reference}>
              เลขอ้างอิง <span>{id}</span>
            </p>
          </div>
          <div className={styles.refresh}>
            <span>
              <Icon name="clock" />{" "}
              {updatedAt
                ? `ตรวจสอบล่าสุด ${updatedAt.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`
                : "กำลังตรวจสอบสถานะ"}
            </span>
            <button
              className={styles.secondary}
              onClick={() => void refresh()}
              disabled={busy || !token}
            >
              รีเฟรช
            </button>
          </div>
        </header>
        {error && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className={styles.notice}>
            {notice}
          </p>
        )}
        {!ticket && !error && (
          <section className={styles.card} role="status">
            กำลังโหลดข้อมูลคำขอ…
          </section>
        )}
        {ticket && (
          <>
            <section
              className={`${styles.card} ${styles.progress}`}
              aria-label="ขั้นตอนการดำเนินการ"
            >
              <ol>
                {steps.map((step, index) => (
                  <li
                    key={step.title}
                    className={
                      step.done
                        ? styles.complete
                        : index === currentStep
                          ? styles.current
                          : ""
                    }
                    aria-current={index === currentStep ? "step" : undefined}
                  >
                    <span className={styles.stepIcon}>
                      {step.done ? <Icon name="check" /> : index + 1}
                    </span>
                    <div>
                      <strong>
                        {index + 1}. {step.title}
                      </strong>
                      <p>{step.detail}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
            <div className={styles.layout}>
              <div className={styles.mainColumn}>
                {ready && (
                  <section
                    className={styles.success}
                    aria-label="คลินิกพร้อมใช้งาน"
                  >
                    <span className={styles.successIcon}>
                      <Icon name="check" />
                    </span>
                    <div>
                      <p>
                        {free
                          ? "อนุมัติแพ็กเกจฟรีเรียบร้อยแล้ว"
                          : "ยืนยันรับเงินเรียบร้อยแล้ว"}
                      </p>
                      <h2>{ticket.clinicName} พร้อมใช้งานแล้ว</h2>
                      <p>
                        เริ่มนับอายุแพ็กเกจ {ticket.subscriptionDays} วัน ·
                        สูงสุด {ticket.branchLimit} สาขา
                      </p>
                      <p className={styles.activation}>
                        กรุณาเปิดอีเมล Activation
                        เพื่อตั้งรหัสผ่านและเข้าสู่คลินิก
                      </p>
                    </div>
                  </section>
                )}
                <section className={styles.card}>
                  <div className={styles.cardHeader}>
                    <div>
                      <h2>
                        <Icon name="file" />{" "}
                        {free ? "เอกสารแพ็กเกจฟรี" : "Invoice และการโอนชำระ"}
                      </h2>
                      <p>
                        {free
                          ? "ติดตามการอนุมัติและดาวน์โหลดเอกสารแพ็กเกจของคุณ"
                          : "ดาวน์โหลดใบแจ้งหนี้ โอนชำระตามยอด และส่งหลักฐานให้เจ้าหน้าที่ตรวจสอบ"}
                      </p>
                    </div>
                  </div>
                  <div className={styles.cardBody}>
                    <div className={styles.invoice}>
                      <span className={styles.documentIcon}>
                        <Icon name="file" />
                      </span>
                      <div>
                        <strong>
                          {ticket.invoice?.number || "เอกสาร Invoice"}
                        </strong>
                        <p>
                          {!ticket.invoice
                            ? "รอเจ้าหน้าที่ออกเอกสาร"
                            : ticket.invoice.pdfStatus === "READY"
                              ? "เอกสารพร้อมดาวน์โหลด · PDF"
                              : "กำลังจัดเตรียมเอกสาร PDF"}
                        </p>
                      </div>
                      <button
                        className={styles.primary}
                        disabled={busy || ticket.invoice?.pdfStatus !== "READY"}
                        onClick={() => void download()}
                      >
                        ดาวน์โหลด
                        {ticket.invoice
                          ? ` ${ticket.invoice.number}`
                          : "เอกสาร"}
                      </button>
                    </div>
                    {free ? (
                      <div className={styles.info}>
                        <Icon name="shield" />
                        <p>
                          {authorized
                            ? "แพ็กเกจฟรีได้รับอนุมัติแล้ว ไม่มีค่าใช้จ่ายและไม่ต้องแนบสลิป"
                            : "ไม่มีค่าใช้จ่ายและไม่ต้องแนบสลิป กรุณารอเจ้าหน้าที่รับเรื่องและอนุมัติเปิดใช้งาน"}
                        </p>
                      </div>
                    ) : (
                      <>
                        {ticket.bankDetails ? (
                          <section aria-label="บัญชีธนาคารสำหรับโอนชำระ">
                            <h3>ช่องทางโอนชำระเงิน</h3>
                            <div className={styles.bank}>
                              <span className={styles.bankIcon}>
                                <Icon name="building" />
                              </span>
                              <div>
                                <strong>{ticket.bankDetails.name}</strong>
                                {ticket.bankDetails.isTest && (
                                  <span className={styles.testBadge}>
                                    บัญชีทดสอบ
                                  </span>
                                )}
                                <p>
                                  ชื่อบัญชี: {ticket.bankDetails.accountName}
                                </p>
                                <p>
                                  เลขที่บัญชี{" "}
                                  <b className={styles.account}>
                                    {ticket.bankDetails.accountNumber}
                                  </b>
                                </p>
                              </div>
                              <button
                                className={styles.copy}
                                onClick={() => void copyAccount()}
                              >
                                คัดลอกเลขบัญชี
                              </button>
                            </div>
                          </section>
                        ) : (
                          <div className={styles.info}>
                            <Icon name="clock" />
                            <p>
                              รอเจ้าหน้าที่รับเรื่องและออก Invoice
                              พร้อมรายละเอียดบัญชีธนาคาร
                            </p>
                          </div>
                        )}
                        {canUpload && (
                          <section aria-label="แนบหลักฐานการโอน">
                            <h3>แนบหลักฐานการโอน</h3>
                            <p className={styles.helper}>
                              PNG, JPEG หรือ PDF ขนาดไม่เกิน 5 MB ·
                              การแนบหลักฐานยังไม่ถือว่ายืนยันรับเงิน
                            </p>
                            <input
                              ref={fileInput}
                              className={styles.hiddenInput}
                              type="file"
                              aria-label="เลือกไฟล์หลักฐานการโอน"
                              accept="image/png,image/jpeg,application/pdf"
                              disabled={busy}
                              onChange={(e) => {
                                chooseFile(e.target.files?.[0]);
                                e.target.value = "";
                              }}
                            />
                            {!selectedFile ? (
                              <button
                                type="button"
                                className={`${styles.dropzone} ${dragging ? styles.dragging : ""}`}
                                disabled={busy}
                                onClick={() => fileInput.current?.click()}
                                onDragOver={(e) => {
                                  e.preventDefault();
                                  if (!busy) setDragging(true);
                                }}
                                onDragLeave={() => setDragging(false)}
                                onDrop={(e) => {
                                  e.preventDefault();
                                  setDragging(false);
                                  chooseFile(e.dataTransfer.files[0]);
                                }}
                              >
                                <span className={styles.uploadIcon}>
                                  <Icon name="file" />
                                </span>
                                <strong>
                                  {reviewing
                                    ? "ส่งหลักฐานเพิ่มเติม"
                                    : resubmit
                                      ? "เลือกหลักฐานใหม่"
                                      : "คลิกเพื่อเลือกไฟล์ หรือลากสลิปมาวางที่นี่"}
                                </strong>
                                <span>
                                  รองรับ PNG, JPEG และ PDF · ไม่เกิน 5 MB
                                </span>
                              </button>
                            ) : (
                              <div className={styles.selected}>
                                <span className={styles.documentIcon}>
                                  <Icon name="file" />
                                </span>
                                <div>
                                  <strong>{selectedFile.name}</strong>
                                  <p>
                                    {(selectedFile.size / 1024 / 1024).toFixed(
                                      2,
                                    )}{" "}
                                    MB · พร้อมส่งหลักฐาน
                                  </p>
                                </div>
                                <button
                                  className={styles.secondary}
                                  disabled={busy}
                                  onClick={() => setSelectedFile(null)}
                                >
                                  นำไฟล์ออก
                                </button>
                              </div>
                            )}
                            {selectedFile && (
                              <div className={styles.submitBar}>
                                <p>ตรวจสอบไฟล์ก่อนส่งให้เจ้าหน้าที่</p>
                                <button
                                  className={styles.primary}
                                  disabled={busy}
                                  onClick={() => void upload(selectedFile)}
                                >
                                  {busy
                                    ? "กำลังส่งหลักฐาน…"
                                    : "ส่งหลักฐานการโอน"}
                                </button>
                              </div>
                            )}
                          </section>
                        )}
                        {authorized && (
                          <div className={styles.info}>
                            <Icon name="check" />
                            <p>
                              เจ้าหน้าที่ยืนยันรับเงินแล้ว
                              ไม่ต้องแนบหลักฐานเพิ่มเติม
                            </p>
                          </div>
                        )}
                      </>
                    )}
                    {ticket.evidence.length > 0 && (
                      <section aria-label="ประวัติหลักฐานการโอน">
                        <h3>ประวัติหลักฐานการโอน</h3>
                        <ul className={styles.history}>
                          {ticket.evidence.map((e) => (
                            <li key={e.id}>
                              <span className={styles.documentIcon}>
                                <Icon name="file" />
                              </span>
                              <div>
                                <strong>หลักฐานการโอน</strong>
                                <p>
                                  {new Date(e.createdAt).toLocaleString(
                                    "th-TH",
                                    { timeZone: "Asia/Bangkok" },
                                  )}
                                </p>
                                {e.reviewReason && (
                                  <p className={styles.reason}>
                                    เหตุผลจากเจ้าหน้าที่: {e.reviewReason}
                                  </p>
                                )}
                              </div>
                              <span
                                className={`${styles.badge} ${e.status === "REJECTED" ? styles.warning : ""}`}
                              >
                                {e.status === "SUBMITTED"
                                  ? "รอตรวจหลักฐาน"
                                  : label[e.status] || e.status}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </section>
                    )}
                  </div>
                </section>
              </div>
              <aside className={styles.sidebar}>
                <section className={styles.card} aria-label="สรุปคำขอสมัคร">
                  <div className={styles.summaryHead}>
                    <span className={styles.documentIcon}>
                      <Icon name="building" />
                    </span>
                    <div>
                      <h2>สรุปคำขอสมัคร</h2>
                      <p>ข้อมูลองค์กรและแพ็กเกจที่เลือก</p>
                    </div>
                  </div>
                  <div className={styles.cardBody}>
                    <h3 className={styles.clinic}>{ticket.clinicName}</h3>
                    <div className={styles.badges}>
                      <span
                        className={`${styles.badge} ${reviewing || resubmit ? styles.warning : ""}`}
                      >
                        {label[ticket.paymentStatus] || ticket.paymentStatus}
                      </span>
                      <span className={styles.badge}>
                        {label[ticket.provisioningStatus] ||
                          ticket.provisioningStatus}
                      </span>
                    </div>
                    <p className={styles.money}>
                      {new Intl.NumberFormat("th-TH", {
                        style: "currency",
                        currency: ticket.currency || "THB",
                        maximumFractionDigits: 2,
                      }).format(ticket.amountMinor / 100)}
                      <small>ยอด{free ? "แพ็กเกจฟรี" : "ชำระรวม"}</small>
                    </p>
                    <dl className={styles.details}>
                      <div>
                        <dt>แพ็กเกจ</dt>
                        <dd>{ticket.packageName}</dd>
                      </div>
                      <div>
                        <dt>ระยะเวลาใช้งาน</dt>
                        <dd>{ticket.subscriptionDays} วัน</dd>
                      </div>
                      <div>
                        <dt>โควตาสาขา</dt>
                        <dd>สูงสุด {ticket.branchLimit} สาขา</dd>
                      </div>
                      <div>
                        <dt>เลขที่ใบแจ้งหนี้</dt>
                        <dd>{ticket.invoice?.number || "ยังไม่ออกเอกสาร"}</dd>
                      </div>
                      <div>
                        <dt>สถานะคำขอ</dt>
                        <dd>
                          {label[ticket.requestStatus] || ticket.requestStatus}
                        </dd>
                      </div>
                    </dl>
                    <div
                      className={`${styles.info} ${ready ? styles.readyInfo : ""}`}
                    >
                      <Icon name="shield" />
                      <p>{reassurance}</p>
                    </div>
                  </div>
                </section>
                <section className={`${styles.card} ${styles.help}`}>
                  <span className={styles.documentIcon}>
                    <Icon name="mail" />
                  </span>
                  <div>
                    <h3>เก็บลิงก์ติดตามนี้ไว้</h3>
                    <p>
                      ใช้ตรวจสอบสถานะและดาวน์โหลดเอกสาร อีเมล Activation
                      จะส่งเมื่อคลินิกพร้อมใช้งาน
                    </p>
                  </div>
                </section>
              </aside>
            </div>
          </>
        )}
        <footer className={styles.footer}>
          Klinic · จัดการคลินิกและทุกสาขาในที่เดียว
        </footer>
      </main>
    </div>
  );
}
