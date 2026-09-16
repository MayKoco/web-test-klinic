"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import AppSidebar from "@/components/app-sidebar";
import { ApiClientError, apiRequest } from "@/lib/api";

type Category = "ALL" | "PRODUCT" | "SERVICE" | "COURSE" | "PACKAGE" | "PROMOTION";
type ItemType = "CATALOG" | "PROMOTION";
type CatalogItem = {
  id: string; code: string; name: string; description?: string; type: Exclude<Category,"ALL"|"PROMOTION">;
  basePrice: string; finalPrice: string; discountType:"NONE"|"PERCENT"|"AMOUNT"; discountValue:string; discountAmount:string; status: string; productDetail?: { unit: string; currentStock: number };
  serviceDetail?: { durationMinutes: number }; courseDetail?: { sessionCount: number };
};
type Promotion = { id:string; code:string; name:string; basePrice:string; finalPrice:string; discountType:"NONE"|"PERCENT"|"AMOUNT"; discountValue:string; discountAmount:string; status:string; components:{id:string}[] };
type Patient = { id:string; hn:string; firstName:string; lastName:string; phone?:string; nickname?:string };
type CartLine = { key:string; itemType:ItemType; itemId:string; category:Category; code:string; name:string; basePrice:number; price:number; discountType:"NONE"|"PERCENT"|"AMOUNT"; discountValue:number; discountAmount:number; quantity:number; detail?:string; stock?:number };
type Preview = {
  patientRequired:boolean;
  lines:{ itemType:ItemType; itemId:string; code:string; name:string; quantity:number; unitBasePrice:string; baseAmount:string; discountAmount:string; netAmount:string }[];
  totals:{ subtotal:string; discountAmount:string; taxAmount:string; netAmount:string };
  warnings:string[];
};
type Sale = { id:string; saleNo:string; status:string; netAmount:string; balanceAmount:string };
type PaymentResult = { sale:Sale; issuedEntitlements:{id:string; entitlementType:string; totalUnits:number; remainingUnits:number}[] };
type Commerce = {
  summary:{ totalPaid:string; netCollected:string; outstandingAmount:string; saleCount:number; activeEntitlementCount:number; remainingServiceUnits:number; remainingCourseUnits:number };
  recentSales:{id:string;saleNo:string;status:string;netAmount:string;createdAt:string}[];
  activeEntitlements:{id:string;entitlementType:string;totalUnits:number;usedUnits:number;remainingUnits:number;expiresAt?:string}[];
  recentPayments:{id:string;paymentNo:string;amount:string;method:string;paidAt:string}[];
};

const categoryMeta:Record<Category,{label:string;icon:string}> = {
  ALL:{label:"ทั้งหมด",icon:"✦"}, PRODUCT:{label:"สินค้า",icon:"◇"}, SERVICE:{label:"บริการ",icon:"✚"},
  COURSE:{label:"คอร์ส",icon:"◎"}, PACKAGE:{label:"แพ็กเกจ",icon:"▦"}, PROMOTION:{label:"โปรโมชัน",icon:"%"},
};
const money=(value:string|number|undefined)=>new Intl.NumberFormat("th-TH",{style:"currency",currency:"THB",minimumFractionDigits:0,maximumFractionDigits:2}).format(Number(value??0));
const errorText=(error:unknown)=>{const e=error as ApiClientError;return e.code?`${e.code}: ${e.message}`:(e.message||"เกิดข้อผิดพลาด");};

export default function SalesWorkspace(){
  const [token,setToken]=useState("");
  const [profile,setProfile]=useState<{name:string;clinicCode:string}|null>(null);
  const [items,setItems]=useState<CatalogItem[]>([]);
  const [promotions,setPromotions]=useState<Promotion[]>([]);
  const [patients,setPatients]=useState<Patient[]>([]);
  const [patientId,setPatientId]=useState("");
  const [patientQuery,setPatientQuery]=useState("");
  const [category,setCategory]=useState<Category>("ALL");
  const [query,setQuery]=useState("");
  const [cart,setCart]=useState<CartLine[]>([]);
  const [preview,setPreview]=useState<Preview|null>(null);
  const [commerce,setCommerce]=useState<Commerce|null>(null);
  const [note,setNote]=useState("");
  const [loading,setLoading]=useState(true);
  const [previewing,setPreviewing]=useState(false);
  const [saving,setSaving]=useState(false);
  const [notice,setNotice]=useState<{kind:"success"|"error";text:string}|null>(null);
  const [payment,setPayment]=useState<{sale:Sale;amount:string;method:string;reference:string}|null>(null);
  const [receipt,setReceipt]=useState<{sale:Sale;entitlements:number}|null>(null);

  const load=useCallback(async(activeToken:string)=>{
    setLoading(true); setNotice(null);
    try{
      const [catalogResponse,promotionResponse,patientResponse]=await Promise.all([
        apiRequest<CatalogItem[]>("/catalog/items?status=ACTIVE&limit=100&sortBy=name&sortOrder=asc",{token:activeToken}),
        apiRequest<Promotion[]>("/promotions?status=ACTIVE&limit=100&sortBy=name&sortOrder=asc",{token:activeToken}),
        apiRequest<Patient[]>("/patients?limit=100&sortBy=firstName&sortOrder=asc",{token:activeToken}),
      ]);
      setItems(catalogResponse.data); setPromotions(promotionResponse.data.filter(p=>p.status==="ACTIVE")); setPatients(patientResponse.data);
    }catch(error){setNotice({kind:"error",text:errorText(error)});}finally{setLoading(false);}
  },[]);

  useEffect(()=>{
    const savedToken=localStorage.getItem("klinic-test-token");
    const savedProfile=localStorage.getItem("klinic-test-profile");
    queueMicrotask(()=>{
      if(!savedToken){setLoading(false);return;}
      setToken(savedToken);
      if(savedProfile)try{setProfile(JSON.parse(savedProfile));}catch{setProfile(null);}
      void load(savedToken);
    });
  },[load]);

  useEffect(()=>{
    if(!token||!cart.length){queueMicrotask(()=>{setPreview(null);setPreviewing(false);});return;}
    const timer=window.setTimeout(async()=>{
      setPreviewing(true);
      try{
        const response=await apiRequest<Preview>("/sales/preview",{method:"POST",token,body:JSON.stringify({patientId:patientId||undefined,lines:cart.map(({itemType,itemId,quantity})=>({itemType,itemId,quantity}))})});
        setPreview(response.data);
      }catch(error){setPreview(null);setNotice({kind:"error",text:errorText(error)});}finally{setPreviewing(false);}
    },250);
    return()=>window.clearTimeout(timer);
  },[cart,patientId,token]);

  useEffect(()=>{
    if(!token||!patientId){queueMicrotask(()=>setCommerce(null));return;}
    let live=true;
    apiRequest<Commerce>(`/patients/${patientId}/commerce-summary`,{token})
      .then(response=>{if(live)setCommerce(response.data);})
      .catch(error=>{if(live)setNotice({kind:"error",text:errorText(error)});});
    return()=>{live=false;};
  },[patientId,token]);

  const selectedPatient=patients.find(patient=>patient.id===patientId);
  const patientChoices=useMemo(()=>patients.filter(patient=>`${patient.hn} ${patient.firstName} ${patient.lastName} ${patient.phone??""}`.toLowerCase().includes(patientQuery.trim().toLowerCase())).slice(0,8),[patients,patientQuery]);
  const sellable=useMemo(()=>{
    const catalog:CartLine[]=items.map(item=>({key:`CATALOG:${item.id}`,itemType:"CATALOG",itemId:item.id,category:item.type,code:item.code,name:item.name,basePrice:Number(item.basePrice),price:Number(item.finalPrice),discountType:item.discountType,discountValue:Number(item.discountValue),discountAmount:Number(item.discountAmount),quantity:0,stock:item.productDetail?.currentStock,detail:item.type==="PRODUCT"?`${item.productDetail?.unit??"ชิ้น"} · คงเหลือ ${item.productDetail?.currentStock??0}`:item.type==="SERVICE"?`${item.serviceDetail?.durationMinutes??0} นาที`:item.type==="COURSE"?`${item.courseDetail?.sessionCount??0} ครั้ง`:undefined}));
    const promo:CartLine[]=promotions.map(item=>({key:`PROMOTION:${item.id}`,itemType:"PROMOTION",itemId:item.id,category:"PROMOTION",code:item.code,name:item.name,basePrice:Number(item.basePrice),price:Number(item.finalPrice),discountType:item.discountType,discountValue:Number(item.discountValue),discountAmount:Number(item.discountAmount),quantity:0,detail:`รวม ${item.components.length} รายการ`}));
    return [...catalog,...promo].filter(item=>(category==="ALL"||item.category===category)&&`${item.code} ${item.name}`.toLowerCase().includes(query.trim().toLowerCase()));
  },[items,promotions,category,query]);

  function add(item:CartLine){
    setCart(current=>current.some(line=>line.key===item.key)?current.map(line=>line.key===item.key?{...line,quantity:line.quantity+1}:line):[...current,{...item,quantity:1}]);
  }
  function changeQuantity(key:string,quantity:number){setCart(current=>quantity<1?current.filter(line=>line.key!==key):current.map(line=>line.key===key?{...line,quantity}:line));}

  async function checkout(){
    if(!cart.length)return;
    if(preview?.patientRequired&&!patientId){setNotice({kind:"error",text:"รายการนี้เป็นบริการหรือคอร์ส กรุณาเลือกลูกค้าก่อนยืนยัน"});return;}
    setSaving(true); setNotice(null);
    try{
      const body={patientId:patientId||undefined,note:note.trim()||undefined,lines:cart.map(({itemType,itemId,quantity})=>({itemType,itemId,quantity}))};
      const created=await apiRequest<Sale>("/sales",{method:"POST",token,body:JSON.stringify(body)});
      const confirmed=await apiRequest<Sale>(`/sales/${created.data.id}/confirm`,{method:"POST",token});
      setPayment({sale:confirmed.data,amount:confirmed.data.balanceAmount,method:"QR",reference:""});
    }catch(error){setNotice({kind:"error",text:errorText(error)});}finally{setSaving(false);}
  }

  async function submitPayment(){
    if(!payment)return;
    setSaving(true); setNotice(null);
    try{
      const result=await apiRequest<PaymentResult>(`/sales/${payment.sale.id}/payments`,{
        method:"POST",token,headers:{"Idempotency-Key":crypto.randomUUID()},
        body:JSON.stringify({amount:Number(payment.amount),method:payment.method,reference:payment.reference.trim()||undefined,paidAt:new Date().toISOString()}),
      });
      setReceipt({sale:result.data.sale,entitlements:result.data.issuedEntitlements.length});
      setPayment(null); setCart([]); setPreview(null); setNote("");
      setNotice({kind:"success",text:`รับชำระ ${money(payment.amount)} สำหรับ ${result.data.sale.saleNo} เรียบร้อย`});
      if(patientId){const summary=await apiRequest<Commerce>(`/patients/${patientId}/commerce-summary`,{token});setCommerce(summary.data);}
    }catch(error){setNotice({kind:"error",text:errorText(error)});}finally{setSaving(false);}
  }

  if(loading&&!token)return <div className="catalog-loading">กำลังเตรียมหน้าการขาย…</div>;
  if(!token)return <main className="catalog-auth"><div className="catalog-auth-card"><div className="brand-mark">K<span>+</span></div><p className="eyebrow">POINT OF SALE</p><h1>กรุณาเข้าสู่ระบบก่อน</h1><p className="muted">หน้าการขายใช้ session เดียวกับ Clinic workbench</p><Link className="primary-button catalog-link-button" href="/">ไปหน้าเข้าสู่ระบบ</Link></div></main>;

  return <main className="app-shell sales-app">
    <AppSidebar active="sales" profile={profile}/>
    <section className="workspace">
      <header className="topbar sales-topbar"><div><p className="eyebrow">POINT OF SALE</p><h1>สร้างรายการขาย</h1><p>เลือกลูกค้า เพิ่มสินค้าและบริการ แล้วรับชำระใน flow เดียว</p></div><div className="top-actions"><span className="sales-live"><i/> API พร้อมใช้งาน</span><button className="ghost-button" onClick={()=>void load(token)}>↻ โหลดใหม่</button></div></header>
      <div className="content sales-content">
        {notice&&<div className={`notice sales-notice ${notice.kind}`}><b>{notice.kind==="success"?"✓":"!"}</b><span>{notice.text}</span><button onClick={()=>setNotice(null)}>×</button></div>}
        <section className="sales-customer-strip panel">
          <div className="sales-step"><span>1</span><div><small>ลูกค้า</small><b>{selectedPatient?`${selectedPatient.firstName} ${selectedPatient.lastName}`:"เลือกลูกค้าก่อนขายบริการ"}</b></div></div>
          <div className="patient-combobox"><span>⌕</span><input value={patientQuery} onChange={e=>setPatientQuery(e.target.value)} placeholder="ค้นหา HN, ชื่อ หรือเบอร์โทร…"/>{selectedPatient&&<button onClick={()=>{setPatientId("");setPatientQuery("");}}>เปลี่ยน</button>}
            {!selectedPatient&&patientQuery&&<div className="patient-results">{patientChoices.map(patient=><button key={patient.id} onClick={()=>{setPatientId(patient.id);setPatientQuery(`${patient.hn} · ${patient.firstName} ${patient.lastName}`);}}><span>{patient.firstName.slice(0,1)}</span><div><b>{patient.firstName} {patient.lastName}</b><small>{patient.hn}{patient.phone?` · ${patient.phone}`:""}</small></div></button>)}{!patientChoices.length&&<p>ไม่พบลูกค้า</p>}</div>}
          </div>
          {commerce&&<div className="customer-mini-summary"><span><small>ชำระสะสม</small><b>{money(commerce.summary.netCollected)}</b></span><span><small>คอร์สคงเหลือ</small><b>{commerce.summary.remainingCourseUnits} ครั้ง</b></span><span><small>สิทธิ์ใช้งาน</small><b>{commerce.summary.activeEntitlementCount}</b></span></div>}
        </section>

        <section className="sales-layout">
          <div className="sales-browser panel">
            <div className="sales-section-heading"><div><p className="eyebrow">CATALOG</p><h2>เลือกรายการ</h2></div><label className="sales-search"><span>⌕</span><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="ค้นหาชื่อหรือรหัส…"/></label></div>
            <div className="sales-category-tabs">{(Object.keys(categoryMeta) as Category[]).map(value=><button key={value} className={category===value?"active":""} onClick={()=>setCategory(value)}><span>{categoryMeta[value].icon}</span>{categoryMeta[value].label}</button>)}</div>
            {loading?<div className="sales-empty">กำลังโหลดรายการ…</div>:!sellable.length?<div className="sales-empty">ไม่พบรายการที่ค้นหา</div>:<div className="sales-product-list">{sellable.map(item=>{
              const inCart=cart.find(line=>line.key===item.key)?.quantity??0;
              const discounted=item.discountAmount>0||item.price<item.basePrice;
              const discountLabel=item.discountType==="PERCENT"?`ลด ${item.discountValue}%`:`ลด ${money(item.discountAmount||item.discountValue)}`;
              return <article key={item.key} className={inCart?"selected":""} role="button" tabIndex={0} aria-label={`เพิ่ม ${item.name} ลงรายการสั่งซื้อ`} onClick={()=>add(item)} onKeyDown={event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();add(item);}}}><span className={`sales-product-icon ${item.category.toLowerCase()}`}>{categoryMeta[item.category].icon}</span><div><small>{item.code} · {categoryMeta[item.category].label}</small><h3>{item.name}</h3><p>{item.detail||"พร้อมขาย"}{item.stock!==undefined&&item.stock<=0&&<em> · สต็อกติดลบได้</em>}</p></div><div className="sales-list-price">{discounted&&<><span>{discountLabel}</span><del>{money(item.basePrice)}</del></>}<strong>{money(item.price)}</strong></div><button onClick={event=>{event.stopPropagation();add(item);}}>{inCart?`เพิ่มอีก · ${inCart}`:"+ เพิ่ม"}</button></article>;
            })}</div>}
          </div>

          <aside className="sales-cart panel">
            <div className="sales-section-heading"><div><p className="eyebrow">ORDER</p><h2>รายการสั่งซื้อ</h2></div><span className="cart-count">{cart.reduce((sum,line)=>sum+line.quantity,0)} รายการ</span></div>
            {!cart.length?<div className="cart-empty"><span>＋</span><b>ยังไม่มีรายการ</b><p>เลือกรายการจากด้านซ้ายเพื่อเริ่มสร้างใบขาย</p></div>:<div className="cart-lines">{cart.map(line=>{
              const calculated=preview?.lines.find(item=>item.itemType===line.itemType&&item.itemId===line.itemId);
              return <article key={line.key}><div className="cart-line-title"><span className={line.category.toLowerCase()}>{categoryMeta[line.category].label}</span><button onClick={()=>changeQuantity(line.key,0)}>×</button></div><h3>{line.name}</h3><div className="cart-line-bottom"><div className="quantity-control"><button onClick={()=>changeQuantity(line.key,line.quantity-1)}>−</button><b>{line.quantity}</b><button onClick={()=>changeQuantity(line.key,line.quantity+1)}>＋</button></div><strong>{money(calculated?.netAmount??line.price*line.quantity)}</strong></div></article>;
            })}</div>}
            <label className="sale-note">บันทึกในใบขาย<textarea value={note} onChange={e=>setNote(e.target.value)} placeholder="เช่น ลูกค้าขอใบเสร็จฉบับเต็ม"/></label>
            {preview?.patientRequired&&!patientId&&<div className="patient-required">เลือกผู้รับบริการก่อนยืนยัน เพื่อออกสิทธิ์บริการหรือคอร์สให้ถูกคน</div>}
            <div className="cart-totals"><div><span>ยอดก่อนส่วนลด</span><b>{previewing?"…":money(preview?.totals.subtotal)}</b></div><div className="discount"><span>ส่วนลด</span><b>− {money(preview?.totals.discountAmount)}</b></div><div className="grand-total"><span>ยอดสุทธิ</span><b>{previewing?"กำลังคำนวณ":money(preview?.totals.netAmount)}</b></div></div>
            <button className="primary-button checkout-button" disabled={!cart.length||!preview||previewing||saving||(preview.patientRequired&&!patientId)} onClick={()=>void checkout()}>{saving?"กำลังสร้างใบขาย…":"ตรวจสอบและรับชำระ →"}</button>
            <p className="cart-footnote">ราคาถูกคำนวณจาก API และ snapshot เมื่อสร้างใบขาย</p>
          </aside>
        </section>

        {selectedPatient&&commerce&&<section className="panel customer-commerce"><div className="sales-section-heading"><div><p className="eyebrow">CUSTOMER WALLET</p><h2>ข้อมูลการซื้อและสิทธิ์ของลูกค้า</h2></div><span>ยอดค้าง {money(commerce.summary.outstandingAmount)}</span></div><div className="commerce-columns"><div><h3>สิทธิ์ที่ใช้งานอยู่</h3>{commerce.activeEntitlements.length?commerce.activeEntitlements.map(item=><article key={item.id}><span className="commerce-icon">{item.entitlementType==="COURSE"?"◎":"✚"}</span><div><b>{item.entitlementType==="COURSE"?"สิทธิ์คอร์ส":"สิทธิ์บริการ"}</b><small>ใช้แล้ว {item.usedUnits} จาก {item.totalUnits}{item.expiresAt?` · หมดอายุ ${new Date(item.expiresAt).toLocaleDateString("th-TH")}`:""}</small></div><strong>{item.remainingUnits} ครั้ง</strong></article>):<p className="commerce-empty">ยังไม่มีสิทธิ์ที่ใช้งานอยู่</p>}</div><div><h3>การชำระล่าสุด</h3>{commerce.recentPayments.length?commerce.recentPayments.map(item=><article key={item.id}><span className="commerce-icon payment">฿</span><div><b>{item.paymentNo}</b><small>{item.method} · {new Date(item.paidAt).toLocaleDateString("th-TH")}</small></div><strong>{money(item.amount)}</strong></article>):<p className="commerce-empty">ยังไม่มีประวัติการชำระ</p>}</div></div></section>}
      </div>
    </section>

    {payment&&<div className="sales-modal-backdrop" role="presentation"><section className="sales-payment-modal" role="dialog" aria-modal="true" aria-labelledby="payment-title"><button className="modal-close" onClick={()=>setPayment(null)}>×</button><span className="payment-mark">฿</span><p className="eyebrow">PAYMENT</p><h2 id="payment-title">รับชำระ {payment.sale.saleNo}</h2><p>ใบขายถูกยืนยันแล้ว เลือกช่องทางและตรวจสอบยอดก่อนบันทึก</p><div className="payment-due"><span>ยอดที่ต้องชำระ</span><b>{money(payment.sale.balanceAmount)}</b></div><div className="payment-methods">{[["QR","QR พร้อมเพย์"],["CASH","เงินสด"],["TRANSFER","โอนเงิน"],["CREDIT_CARD","บัตร"]].map(([value,label])=><button key={value} className={payment.method===value?"active":""} onClick={()=>setPayment(current=>current&&({...current,method:value}))}>{label}</button>)}</div><label>ยอดรับ<input type="number" min="0.01" step="0.01" value={payment.amount} onChange={e=>setPayment(current=>current&&({...current,amount:e.target.value}))}/></label><label>เลขอ้างอิง (ถ้ามี)<input value={payment.reference} onChange={e=>setPayment(current=>current&&({...current,reference:e.target.value}))} placeholder="Transaction / Slip reference"/></label><button className="primary-button" disabled={saving||!Number(payment.amount)} onClick={()=>void submitPayment()}>{saving?"กำลังบันทึก…":`ยืนยันรับชำระ ${money(payment.amount)}`}</button><button className="ghost-button" onClick={()=>setPayment(null)}>รับชำระภายหลัง</button></section></div>}
    {receipt&&<div className="receipt-toast"><span>✓</span><div><b>ชำระเงินสำเร็จ</b><p>{receipt.sale.saleNo} · {money(receipt.sale.netAmount)}{receipt.entitlements?` · ออกสิทธิ์ ${receipt.entitlements} รายการ`:""}</p></div><button onClick={()=>setReceipt(null)}>×</button></div>}
  </main>;
}
