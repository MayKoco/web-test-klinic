"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AppSidebar from "@/components/app-sidebar";
import { ApiClientError, apiRequest } from "@/lib/api";

type CType = "PRODUCT" | "SERVICE" | "COURSE" | "PACKAGE";
type DType = "NONE" | "PERCENT" | "AMOUNT";
type Tab = "CATALOG" | "BUNDLES" | "SALES" | "REPORTS";
type ProductClass = "GENERAL" | "MEDICINE" | "MEDICAL_SUPPLY";
type TaxBreakdown = { taxableAmount:string; nonTaxableAmount:string; taxAmount:string; grossAmount:string };
type Item = { id:string; code:string; name:string; description?:string; type:CType; basePrice:string; discountType:DType; discountValue:string; discountAmount:string; finalPrice:string; priceIncludesVat?:boolean; taxBreakdown?:TaxBreakdown|null; status:"DRAFT"|"ACTIVE"|"INACTIVE"; productDetail?:{unit:string;barcode?:string;currentStock:number;minStock:string|number;productClass:ProductClass;trackLot:boolean;trackExpiry:boolean}; serviceDetail?:{durationMinutes:number;servicePrice:string}; courseDetail?:{sessionCount:number;validityDays?:number;coursePrice?:string}; packageComponents?:{id:string;itemId:string;quantity:number;item:Item}[] };
type ServiceProduct = {id:string;serviceId:string;productId:string;quantity:number;unitPrice:string;discountType:DType;discountValue:string;sortOrder:number;lineNetPrice:string;lineDiscountAmount:string;product:Item};
type Promo = { id:string;code:string;name:string;status:string;basePrice:string;finalPrice:string;discountType:DType;discountValue:string;startsAt?:string;endsAt?:string;components:{id:string;itemId:string;quantity:number;item:Item}[] };
type Patient = {id:string;hn:string;firstName:string;lastName:string};
type Sale = {id:string;saleNo:string;status:string;patientId?:string;subtotal:string;discountAmount:string;taxAmount:string;netAmount:string;paidAmount:string;balanceAmount:string;lines:{id:string;itemNameSnapshot:string;itemType:string;quantity:number;netAmount:string;taxAmount:string}[]};
type SalesReport = {billCount:number;subtotal:string;discountAmount:string;netSales:string;refundAmount:string;netSalesAfterRefund:string;outstandingAmount:string};
type PaymentReport = {cashAmount:string;transferAmount:string;creditCardAmount:string;qrAmount:string;totalCollected:string;totalRefunded:string;netCollected:string};
type QuantityReport = {productDirectQuantity:number;productBundleQuantity:number;serviceDirectUnits:number;serviceBundleUnits:number;courseSoldQuantity:number;packageSoldQuantity:number;promotionSoldQuantity:number;entitlementUsedUnits:number};
type Draft = {type:Exclude<CType,"PACKAGE">;code:string;name:string;description:string;basePrice:string;discountType:DType;discountValue:string;unit:string;barcode:string;minStock:string;productClass:ProductClass;trackLot:boolean;trackExpiry:boolean;durationMinutes:string;sessionCount:string;validityDays:string};
type BundleDraft = {code:string;name:string;discountType:DType;discountValue:string;components:Record<string,number>};
type NewServiceProducts = Record<string,{quantity:number;unitPrice:string;discountType:DType;discountValue:string}>;

const blank:Draft={type:"PRODUCT",code:"",name:"",description:"",basePrice:"",discountType:"NONE",discountValue:"0",unit:"ชิ้น",barcode:"",minStock:"0",productClass:"GENERAL",trackLot:false,trackExpiry:false,durationMinutes:"60",sessionCount:"5",validityDays:"180"};
const meta:Record<CType,{label:string;icon:string;tone:string}>={PRODUCT:{label:"สินค้า",icon:"◇",tone:"catalog-blue"},SERVICE:{label:"บริการ",icon:"✦",tone:"catalog-teal"},COURSE:{label:"คอร์ส",icon:"◎",tone:"catalog-violet"},PACKAGE:{label:"แพ็กเกจ",icon:"▦",tone:"catalog-amber"}};
const money=(v:string|number|undefined)=>new Intl.NumberFormat("th-TH",{style:"currency",currency:"THB",minimumFractionDigits:0,maximumFractionDigits:2}).format(Number(v??0));
const err=(e:unknown)=>{const a=e as ApiClientError;return a.code?`${a.code}: ${a.message}`:(a.message??String(e));};
const localDT=()=>{const d=new Date();return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);};

export default function CatalogWorkspace(){
  const [token,setToken]=useState(""); const [profile,setProfile]=useState<{name:string;clinicCode:string}|null>(null); const [tab,setTab]=useState<Tab>("CATALOG");
  const [items,setItems]=useState<Item[]>([]); const [promos,setPromos]=useState<Promo[]>([]); const [patients,setPatients]=useState<Patient[]>([]); const [sales,setSales]=useState<Sale[]>([]);
  const [loading,setLoading]=useState(true); const [saving,setSaving]=useState(false); const [notice,setNotice]=useState<{kind:"success"|"error";text:string}|null>(null);
  const [filter,setFilter]=useState<"ALL"|CType>("ALL"); const [search,setSearch]=useState(""); const [draft,setDraft]=useState<Draft>(blank); const [activate,setActivate]=useState(true);
  const [newServiceProducts,setNewServiceProducts]=useState<NewServiceProducts>({});
  const [selectedService,setSelectedService]=useState<Item|null>(null); const [serviceProducts,setServiceProducts]=useState<ServiceProduct[]>([]); const [recipe,setRecipe]=useState({productId:"",quantity:1,unitPrice:"",discountType:"NONE" as DType,discountValue:"0"});
  const [pack,setPack]=useState<BundleDraft>({code:"",name:"",discountType:"NONE",discountValue:"0",components:{}});
  const [promo,setPromo]=useState<BundleDraft&{startsAt:string;endsAt:string}>({code:"",name:"",discountType:"PERCENT",discountValue:"10",components:{},startsAt:"",endsAt:""});
  const [sale,setSale]=useState({patientId:"",itemType:"CATALOG" as "CATALOG"|"PROMOTION",itemId:"",quantity:1});
  const [payment,setPayment]=useState({saleId:"",amount:"",method:"QR",reference:"",paidAt:localDT()}); const [month,setMonth]=useState(localDT().slice(0,7));
  const [reports,setReports]=useState<{sales:SalesReport;payments:PaymentReport;qty:QuantityReport}|null>(null);

  const load=useCallback(async(t:string,keep=false)=>{setLoading(true);try{const [a,b,c,d]=await Promise.all([
    apiRequest<Item[]>("/catalog/items?limit=100&sortBy=createdAt&sortOrder=desc",{token:t}),apiRequest<Promo[]>("/promotions?limit=100&sortBy=createdAt&sortOrder=desc",{token:t}),apiRequest<Patient[]>("/patients?limit=100&sortBy=createdAt&sortOrder=desc",{token:t}),apiRequest<Sale[]>("/sales?limit=100&sortBy=createdAt&sortOrder=desc",{token:t})]);
    setItems(a.data);setPromos(b.data);setPatients(c.data);setSales(d.data);if(!keep)setNotice(null);}catch(e){setNotice({kind:"error",text:err(e)});}finally{setLoading(false);}},[]);
  useEffect(()=>{const t=localStorage.getItem("klinic-test-token");const p=localStorage.getItem("klinic-test-profile");queueMicrotask(()=>{if(!t){setLoading(false);return;}setToken(t);if(p)try{setProfile(JSON.parse(p));}catch{setProfile(null);}void load(t);});},[load]);
  useEffect(()=>{const requested=new URLSearchParams(window.location.search).get("tab");if(["CATALOG","BUNDLES","SALES","REPORTS"].includes(requested??""))queueMicrotask(()=>setTab(requested as Tab));},[]);

  const active=useMemo(()=>items.filter(i=>i.status==="ACTIVE"),[items]); const activePromos=useMemo(()=>promos.filter(p=>p.status==="ACTIVE"),[promos]);
  const shown=useMemo(()=>items.filter(i=>(filter==="ALL"||i.type===filter)&&(!search.trim()||`${i.code} ${i.name}`.toLowerCase().includes(search.toLowerCase()))),[items,filter,search]);
  const price=useMemo(()=>{const productsPerUse=["SERVICE","COURSE"].includes(draft.type)?Object.values(newServiceProducts).reduce((sum,row)=>{const line=Number(row.unitPrice||0)*row.quantity;const discount=row.discountType==="PERCENT"?line*Number(row.discountValue||0)/100:row.discountType==="AMOUNT"?Number(row.discountValue||0):0;return sum+Math.max(0,line-discount);},0):0;const productsTotal=draft.type==="COURSE"?productsPerUse*Number(draft.sessionCount||0):productsPerUse;const procedure=Number(draft.basePrice||0);const base=procedure+productsTotal;const discount=draft.discountType==="PERCENT"?base*Number(draft.discountValue||0)/100:draft.discountType==="AMOUNT"?Number(draft.discountValue||0):0;const final=Math.max(0,base-discount);const nonTaxable=draft.type==="PRODUCT"?0:base?Math.round(final*procedure/base*100)/100:0;const taxableGross=final-nonTaxable;const vat=Math.round(taxableGross*7/107*100)/100;return{base,discount,final,nonTaxable,taxable:taxableGross-vat,vat,taxableGross};},[draft,newServiceProducts]);
  const action=async(fn:()=>Promise<unknown>,text:string,reload=true)=>{setSaving(true);setNotice(null);try{await fn();setNotice({kind:"success",text});if(reload)await load(token,true);return true;}catch(e){setNotice({kind:"error",text:err(e)});return false;}finally{setSaving(false);}};
  const components=(v:Record<string,number>)=>Object.entries(v).filter(([,q])=>q>0).map(([itemId,quantity],sortOrder)=>({itemId,quantity,sortOrder}));
  const setComp=(kind:"pack"|"promo",id:string,q:number)=>{if(kind==="pack")setPack(d=>({...d,components:{...d.components,[id]:Math.max(0,q)}}));else setPromo(d=>({...d,components:{...d.components,[id]:Math.max(0,q)}}));};

  async function createItem(e:FormEvent){e.preventDefault();const t=draft.type;const endpoint={PRODUCT:"/catalog/products",SERVICE:"/catalog/services",COURSE:"/catalog/courses"}[t];const common={code:draft.code,name:draft.name,description:draft.description||undefined,basePrice:Number(draft.basePrice),discountType:draft.discountType,discountValue:draft.discountType==="NONE"?0:Number(draft.discountValue)};const detail=t==="PRODUCT"?{unit:draft.unit,barcode:draft.barcode||undefined,minStock:Number(draft.minStock||0),productClass:draft.productClass,trackLot:draft.trackLot,trackExpiry:draft.trackExpiry}:t==="SERVICE"?{durationMinutes:Number(draft.durationMinutes)}:{sessionCount:Number(draft.sessionCount),validityDays:draft.validityDays?Number(draft.validityDays):undefined};const activateNow=activate&&!(t==="PRODUCT"&&draft.trackLot);const ok=await action(async()=>{const r=await apiRequest<Item>(endpoint,{method:"POST",token,body:JSON.stringify({...common,...detail})});if(t==="SERVICE"||t==="COURSE")for(const [productId,row] of Object.entries(newServiceProducts))await apiRequest(`/catalog/${t==="SERVICE"?"services":"courses"}/${r.data.id}/products`,{method:"POST",token,body:JSON.stringify({productId,quantity:row.quantity,unitPrice:Number(row.unitPrice),discountType:row.discountType,discountValue:row.discountType==="NONE"?0:Number(row.discountValue)})});if(activateNow)await apiRequest(`/catalog/items/${r.data.id}`,{method:"PATCH",token,body:JSON.stringify({status:"ACTIVE"})});},`สร้าง${meta[t].label}${t==="PRODUCT"&&draft.trackLot?"เป็นฉบับร่าง กรุณารับ Lot แรกก่อนเปิดใช้งาน":["SERVICE","COURSE"].includes(t)&&Object.keys(newServiceProducts).length?`พร้อมสูตรต่อครั้ง ${Object.keys(newServiceProducts).length} รายการ`:""}เรียบร้อย`);if(ok){setDraft(d=>({...blank,type:d.type}));setNewServiceProducts({});}}
  const formulaPath=(item:Item)=>item.type==="COURSE"?"courses":"services";
  async function openService(service:Item){setSelectedService(service);setSaving(true);try{const r=await apiRequest<ServiceProduct[]>(`/catalog/${formulaPath(service)}/${service.id}/products`,{token});setServiceProducts(r.data);}catch(e){setNotice({kind:"error",text:err(e)});}finally{setSaving(false);}}
  async function addServiceProduct(e:FormEvent){e.preventDefault();if(!selectedService||!recipe.productId)return;const ok=await action(()=>apiRequest(`/catalog/${formulaPath(selectedService)}/${selectedService.id}/products`,{method:"POST",token,body:JSON.stringify({...recipe,unitPrice:Number(recipe.unitPrice),discountValue:recipe.discountType==="NONE"?0:Number(recipe.discountValue)})}),"เพิ่มสินค้าในสูตรต่อครั้งและคำนวณราคาใหม่แล้ว");if(ok){const service=(await apiRequest<Item>(`/catalog/items/${selectedService.id}`,{token})).data;setSelectedService(service);await openService(service);setRecipe({productId:"",quantity:1,unitPrice:"",discountType:"NONE",discountValue:"0"});}}
  async function updateServiceProduct(productId:string,data:{quantity:number;unitPrice:number;discountType:DType;discountValue:number}){if(!selectedService)return;const ok=await action(()=>apiRequest(`/catalog/${formulaPath(selectedService)}/${selectedService.id}/products/${productId}`,{method:"PATCH",token,body:JSON.stringify(data)}),"แก้สูตรสินค้าต่อครั้งและคำนวณราคาใหม่แล้ว");if(ok){const service=(await apiRequest<Item>(`/catalog/items/${selectedService.id}`,{token})).data;setSelectedService(service);await openService(service);}}
  async function removeServiceProduct(productId:string){if(!selectedService)return;const ok=await action(()=>apiRequest(`/catalog/${formulaPath(selectedService)}/${selectedService.id}/products/${productId}`,{method:"DELETE",token}),"ลบสินค้าออกจากสูตรแล้ว");if(ok){const service=(await apiRequest<Item>(`/catalog/items/${selectedService.id}`,{token})).data;setSelectedService(service);await openService(service);}}
  async function createBundle(e:FormEvent,kind:"pack"|"promo"){e.preventDefault();const d=kind==="pack"?pack:promo;const list=components(d.components);if(!list.length){setNotice({kind:"error",text:"เลือกองค์ประกอบอย่างน้อย 1 รายการ"});return;}const body={code:d.code,name:d.name,discountType:d.discountType,discountValue:d.discountType==="NONE"?0:Number(d.discountValue),components:list,...(kind==="promo"?{startsAt:promo.startsAt?new Date(promo.startsAt).toISOString():undefined,endsAt:promo.endsAt?new Date(promo.endsAt).toISOString():undefined}:{})};const ok=await action(()=>apiRequest(kind==="pack"?"/catalog/packages":"/promotions",{method:"POST",token,body:JSON.stringify(body)}),kind==="pack"?"สร้างแพ็กเกจเรียบร้อย":"สร้างโปรโมชันแบบร่างเรียบร้อย");if(ok){if(kind==="pack")setPack({code:"",name:"",discountType:"NONE",discountValue:"0",components:{}});else setPromo({code:"",name:"",discountType:"PERCENT",discountValue:"10",components:{},startsAt:"",endsAt:""});}}
  async function createSale(e:FormEvent){e.preventDefault();if(!sale.itemId)return setNotice({kind:"error",text:"เลือกรายการขายก่อน"});let made:Sale|undefined;const ok=await action(async()=>{const r=await apiRequest<Sale>("/sales",{method:"POST",token,body:JSON.stringify({patientId:sale.patientId||undefined,lines:[{itemType:sale.itemType,itemId:sale.itemId,quantity:sale.quantity}]})});const confirmed=await apiRequest<Sale>(`/sales/${r.data.id}/confirm`,{method:"POST",token});made=confirmed.data;},"สร้างและยืนยันใบขายเรียบร้อย");if(ok&&made)setPayment(p=>({...p,saleId:made!.id,amount:made!.balanceAmount}));}
  async function pay(e:FormEvent){e.preventDefault();const selected=sales.find(s=>s.id===payment.saleId);const ok=await action(()=>apiRequest(`/sales/${payment.saleId}/payments`,{method:"POST",token,headers:{"Idempotency-Key":crypto.randomUUID()},body:JSON.stringify({amount:Number(payment.amount),method:payment.method,reference:payment.reference||undefined,paidAt:new Date(payment.paidAt).toISOString()})}),"บันทึกรับชำระเรียบร้อย");if(ok&&selected?.patientId&&Number(payment.amount)>=Number(selected.balanceAmount))await action(()=>apiRequest(`/sales/${selected.id}/issue-entitlements`,{method:"POST",token}),"ชำระครบและออกสิทธิ์เรียบร้อย");}
  async function report(){setSaving(true);setNotice(null);try{const [a,b,c]=await Promise.all([apiRequest<SalesReport>(`/reports/sales/monthly?month=${month}`,{token}),apiRequest<PaymentReport>(`/reports/payments/monthly?month=${month}`,{token}),apiRequest<QuantityReport>(`/reports/quantities/monthly?month=${month}`,{token})]);setReports({sales:a.data,payments:b.data,qty:c.data});setNotice({kind:"success",text:`โหลดรายงานเดือน ${month} แล้ว`});}catch(e){setNotice({kind:"error",text:err(e)});}finally{setSaving(false);}}

  if(loading&&!token)return <div className="catalog-loading">กำลังตรวจสอบ session…</div>;
  if(!token)return <main className="catalog-auth"><div className="catalog-auth-card"><div className="brand-mark">K<span>+</span></div><p className="eyebrow">COMMERCE WORKSPACE</p><h1>กรุณาเข้าสู่ระบบ Clinic ก่อน</h1><p>หน้านี้ใช้ session เดียวกับ Scheduling workbench</p><Link className="primary-button catalog-link-button" href="/">ไปหน้าเข้าสู่ระบบ</Link>{notice&&<div className={`notice ${notice.kind}`}>{notice.text}</div>}</div></main>;

  const titles={CATALOG:"ผลิตภัณฑ์และบริการ",BUNDLES:"แพ็กเกจและโปรโมชัน",SALES:"การขายและชำระเงิน",REPORTS:"สรุปการขายรายเดือน"};
  return <main className="app-shell catalog-app"><AppSidebar active={tab==="SALES"?"sales":"catalog"} profile={profile}/><section className="workspace"><header className="topbar"><div><p className="eyebrow">CLINIC COMMERCE</p><h1>{titles[tab]}</h1></div><div className="top-actions"><Link className="ghost-button catalog-link-button" href="/appointments">← Scheduling</Link><button className="ghost-button" onClick={()=>void load(token)}>↻ โหลดใหม่</button></div></header><div className="content catalog-content">{notice&&<div className={`notice catalog-notice ${notice.kind}`}><span>{notice.kind==="success"?"✓":"!"}</span>{notice.text}<button onClick={()=>setNotice(null)}>×</button></div>}<div className="mobile-tabs">{(["CATALOG","BUNDLES","SALES","REPORTS"] as Tab[]).map(x=><button key={x} className={tab===x?"active":""} onClick={()=>setTab(x)}>{x}</button>)}</div>
    {tab==="CATALOG"&&<><section className="catalog-hero"><div><p className="eyebrow">CATALOG OVERVIEW</p><h2>จัดระเบียบสิ่งที่คลินิกขาย</h2><p>กำหนดราคา ส่วนลด และรายละเอียดของแต่ละประเภทจากหน้าเดียว</p></div><div className="catalog-metrics">{[["เปิดใช้งาน",active.length],["สินค้า",items.filter(i=>i.type==="PRODUCT").length],["บริการ",items.filter(i=>i.type==="SERVICE").length],["คอร์ส/แพ็กเกจ",items.filter(i=>["COURSE","PACKAGE"].includes(i.type)).length]].map(([l,v])=><div key={l}><span>{l}</span><b>{v}</b></div>)}</div></section><section className="catalog-layout"><article className="panel catalog-list-panel"><div className="catalog-list-heading"><div><p className="eyebrow">MASTER DATA</p><h3>รายการใน Catalog</h3></div><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="ค้นหาชื่อหรือรหัส…"/></div><div className="catalog-tabs"><button className={filter==="ALL"?"active":""} onClick={()=>setFilter("ALL")}>ทั้งหมด <b>{items.length}</b></button>{(["PRODUCT","SERVICE","COURSE","PACKAGE"] as CType[]).map(t=><button key={t} className={filter===t?"active":""} onClick={()=>setFilter(t)}>{meta[t].label}</button>)}</div>{loading?<Empty text="กำลังโหลด…"/>:!shown.length?<Empty text="ยังไม่มีรายการในหมวดนี้"/>:<div className="catalog-grid">{shown.map(i=><CatalogCard key={i.id} item={i} onManage={["SERVICE","COURSE"].includes(i.type)?()=>void openService(i):undefined} onStatus={s=>void action(()=>apiRequest(`/catalog/items/${i.id}`,{method:"PATCH",token,body:JSON.stringify({status:s})}),`${i.name}: ${s}`)}/>)}</div>}</article><article className="panel catalog-create-panel"><Heading icon="＋" over="CREATE VIA API" title="สร้างรายการใหม่"/><div className="create-type-switch">{(["PRODUCT","SERVICE","COURSE"] as Draft["type"][]).map(t=><button type="button" key={t} className={draft.type===t?"active":""} onClick={()=>setDraft(d=>({...d,type:t}))}>{meta[t].label}</button>)}</div><form className="catalog-form" onSubmit={createItem}><Two a={<Field label="รหัส"><input value={draft.code} onChange={e=>setDraft(d=>({...d,code:e.target.value.toUpperCase()}))} required/></Field>} b={<Field label="ชื่อรายการ"><input value={draft.name} onChange={e=>setDraft(d=>({...d,name:e.target.value}))} required/></Field>}/><Field label="รายละเอียด"><textarea value={draft.description} onChange={e=>setDraft(d=>({...d,description:e.target.value}))}/></Field><PriceFields draft={draft} setDraft={setDraft}/>{draft.type==="PRODUCT"&&<section className="product-stock-settings"><header><span>▦</span><div><b>ข้อมูลสินค้าและคลัง</b><small>กำหนดหน่วย การติดตาม Lot และจุดแจ้งเตือน Stock ต่ำ</small></div></header><div className="product-stock-grid"><Field label="ประเภทสินค้า"><select value={draft.productClass} onChange={e=>{const productClass=e.target.value as ProductClass;const tracked=productClass!=="GENERAL";setDraft(d=>({...d,productClass,trackLot:tracked,trackExpiry:tracked}));}}><option value="GENERAL">สินค้าทั่วไป</option><option value="MEDICINE">ยา</option><option value="MEDICAL_SUPPLY">เวชภัณฑ์</option></select></Field><Field label="หน่วย"><input value={draft.unit} onChange={e=>setDraft(d=>({...d,unit:e.target.value}))} required/></Field><Field label="Barcode"><input value={draft.barcode} onChange={e=>setDraft(d=>({...d,barcode:e.target.value}))}/></Field><Field label="Stock ขั้นต่ำ"><input type="number" min="0" step="0.001" value={draft.minStock} onChange={e=>setDraft(d=>({...d,minStock:e.target.value}))}/><small className="stock-threshold-help">แจ้งเตือนเมื่อคงเหลือ ≤ ค่านี้ · ใส่ 0 เพื่อปิด</small></Field></div><div className="catalog-policy"><label><input type="checkbox" checked={draft.trackLot} onChange={e=>setDraft(d=>({...d,trackLot:e.target.checked,trackExpiry:e.target.checked?d.trackExpiry:false}))}/> ติดตาม Lot</label><label><input type="checkbox" checked={draft.trackExpiry} onChange={e=>setDraft(d=>({...d,trackExpiry:e.target.checked,trackLot:e.target.checked?true:d.trackLot}))}/> บังคับวันหมดอายุ</label>{draft.trackLot&&<small>สินค้าจะเป็น DRAFT จนกว่าจะรับ Lot แรก แล้วจึงเปิดใช้งานได้</small>}</div></section>} {draft.type==="SERVICE"&&<Field label="ระยะเวลา (นาที)"><input type="number" min="1" value={draft.durationMinutes} onChange={e=>setDraft(d=>({...d,durationMinutes:e.target.value}))} required/></Field>}{draft.type==="COURSE"&&<Two a={<Field label="จำนวนครั้ง"><input type="number" min="1" value={draft.sessionCount} onChange={e=>setDraft(d=>({...d,sessionCount:e.target.value}))} required/></Field>} b={<Field label="อายุคอร์ส (วัน)"><input type="number" min="1" value={draft.validityDays} onChange={e=>setDraft(d=>({...d,validityDays:e.target.value}))}/></Field>}/>} {["SERVICE","COURSE"].includes(draft.type)&&<NewServiceProductPicker ownerType={draft.type as "SERVICE"|"COURSE"} token={token} initialProducts={active.filter(i=>i.type==="PRODUCT")} values={newServiceProducts} onChange={setNewServiceProducts}/>}<TaxPricePreview price={price} /><label className="catalog-check"><input type="checkbox" checked={activate&&!(draft.type==="PRODUCT"&&draft.trackLot)} disabled={draft.type==="PRODUCT"&&draft.trackLot} onChange={e=>setActivate(e.target.checked)}/> {draft.type==="PRODUCT"&&draft.trackLot?"รับ Lot แรกก่อนเปิดใช้งาน":"เปิดใช้งานทันที"}</label><button className="primary-button" disabled={saving}>สร้าง{meta[draft.type].label}</button></form></article></section>{selectedService&&<ServiceRecipe service={selectedService} rows={serviceProducts} products={active.filter(i=>i.type==="PRODUCT")} recipe={recipe} saving={saving} setRecipe={setRecipe} close={()=>setSelectedService(null)} add={addServiceProduct} update={updateServiceProduct} remove={removeServiceProduct}/>}</>}
    {tab==="BUNDLES"&&<BundleView items={items} active={active} promos={promos} pack={pack} promo={promo} saving={saving} setPack={setPack} setPromo={setPromo} setComp={setComp} submit={createBundle} promoAction={(p,x)=>void action(()=>apiRequest(`/promotions/${p.id}/${x}`,{method:"POST",token}),`${p.name}: ${x}`)}/>} 
    {tab==="SALES"&&<SalesView active={active} promos={activePromos} patients={patients} sales={sales} sale={sale} payment={payment} saving={saving} setSale={setSale} setPayment={setPayment} createSale={createSale} pay={pay}/>} 
    {tab==="REPORTS"&&<ReportView month={month} setMonth={setMonth} reports={reports} saving={saving} load={()=>void report()}/>} 
  </div></section></main>;
}

function BundleView(p:{items:Item[];active:Item[];promos:Promo[];pack:BundleDraft;promo:BundleDraft&{startsAt:string;endsAt:string};saving:boolean;setPack:React.Dispatch<React.SetStateAction<BundleDraft>>;setPromo:React.Dispatch<React.SetStateAction<BundleDraft&{startsAt:string;endsAt:string}>>;setComp:(k:"pack"|"promo",id:string,q:number)=>void;submit:(e:FormEvent,k:"pack"|"promo")=>void;promoAction:(p:Promo,a:string)=>void}){const choices=p.active.filter(i=>i.type!=="PACKAGE");return <><Intro over="BUNDLE BUILDER" title="รวมหลายรายการ แล้วตั้งราคาขายใหม่" text="ราคาตั้งต้นคำนวณจากองค์ประกอบ ส่วนลดรายการย่อยจะไม่ถูกนำมาซ้ำ" stats={[["แพ็กเกจ",p.items.filter(i=>i.type==="PACKAGE").length],["โปรโมชัน",p.promos.length]]}/><section className="two-column bundle-columns"><BundleForm title="สร้างแพ็กเกจ" kind="pack" value={p.pack} items={choices} saving={p.saving} setValue={p.setPack} setComp={p.setComp} submit={p.submit}/><BundleForm title="สร้างโปรโมชัน" kind="promo" value={p.promo} items={p.active} saving={p.saving} setValue={p.setPromo} setComp={p.setComp} submit={p.submit}/></section><section className="panel list-section"><Heading icon="%" over="PROMOTION LIFECYCLE" title="โปรโมชันทั้งหมด"/>{!p.promos.length?<Empty text="ยังไม่มีโปรโมชัน"/>:<div className="promo-list">{p.promos.map(x=><article key={x.id}><div><span className="catalog-code">{x.code}</span><h4>{x.name}</h4><small>{x.components.length} รายการ · {money(x.finalPrice)}</small></div><span className={`status-pill ${x.status.toLowerCase()}`}>{x.status}</span><div className="row-actions">{["DRAFT","PAUSED"].includes(x.status)&&<button onClick={()=>p.promoAction(x,"publish")}>Publish</button>}{x.status==="ACTIVE"&&<button onClick={()=>p.promoAction(x,"pause")}>Pause</button>}{!["ENDED","DRAFT"].includes(x.status)&&<button onClick={()=>p.promoAction(x,"end")}>End</button>}</div></article>)}</div>}</section></>}
function BundleForm<T extends BundleDraft>(p:{title:string;kind:"pack"|"promo";value:T;items:Item[];saving:boolean;setValue:React.Dispatch<React.SetStateAction<T>>;setComp:(k:"pack"|"promo",id:string,q:number)=>void;submit:(e:FormEvent,k:"pack"|"promo")=>void}){const promo=p.value as T&{startsAt?:string;endsAt?:string};return <article className="panel"><Heading icon={p.kind==="pack"?"▦":"%"} over={p.kind.toUpperCase()} title={p.title}/><form className="catalog-form" onSubmit={e=>p.submit(e,p.kind)}><Two a={<Field label="รหัส"><input value={p.value.code} onChange={e=>p.setValue(d=>({...d,code:e.target.value.toUpperCase()}))} required/></Field>} b={<Field label="ชื่อ"><input value={p.value.name} onChange={e=>p.setValue(d=>({...d,name:e.target.value}))} required/></Field>}/><Discount value={p.value} setValue={p.setValue}/>{p.kind==="promo"&&<Two a={<Field label="เริ่มใช้"><input type="datetime-local" value={promo.startsAt??""} onChange={e=>p.setValue(d=>({...d,startsAt:e.target.value}))}/></Field>} b={<Field label="สิ้นสุด"><input type="datetime-local" value={promo.endsAt??""} onChange={e=>p.setValue(d=>({...d,endsAt:e.target.value}))}/></Field>}/>}<Picker items={p.items} values={p.value.components} change={(id,q)=>p.setComp(p.kind,id,q)}/><button className="primary-button" disabled={p.saving}>สร้าง{p.kind==="pack"?"แพ็กเกจ":"โปรโมชันแบบร่าง"}</button></form></article>}

function SalesView(p:{active:Item[];promos:Promo[];patients:Patient[];sales:Sale[];sale:{patientId:string;itemType:"CATALOG"|"PROMOTION";itemId:string;quantity:number};payment:{saleId:string;amount:string;method:string;reference:string;paidAt:string};saving:boolean;setSale:React.Dispatch<React.SetStateAction<{patientId:string;itemType:"CATALOG"|"PROMOTION";itemId:string;quantity:number}>>;setPayment:React.Dispatch<React.SetStateAction<{saleId:string;amount:string;method:string;reference:string;paidAt:string}>>;createSale:(e:FormEvent)=>void;pay:(e:FormEvent)=>void}){const payable=p.sales.filter(s=>["PENDING_PAYMENT","PARTIALLY_PAID"].includes(s.status));const choices=p.sale.itemType==="CATALOG"?p.active:p.promos;const selected=p.sale.itemType==="CATALOG"?p.active.find(item=>item.id===p.sale.itemId):undefined;return <><Intro over="POINT OF SALE TEST" title="สร้างใบขาย ยืนยัน และรับชำระ" text="ราคา snapshot ตอนสร้าง รองรับแบ่งชำระและออกสิทธิ์หลังชำระครบ" stats={[["ใบขาย",p.sales.length],["รอชำระ",payable.length]]}/><section className="two-column"><article className="panel"><Heading icon="↗" over="NEW SALE" title="สร้างใบขาย"/><form className="catalog-form" onSubmit={p.createSale}><Field label="ลูกค้า"><select value={p.sale.patientId} onChange={e=>p.setSale(d=>({...d,patientId:e.target.value}))}><option value="">Walk-in / ไม่ระบุ</option>{p.patients.map(x=><option key={x.id} value={x.id}>{x.hn} · {x.firstName} {x.lastName}</option>)}</select></Field><div className="create-type-switch"><button type="button" className={p.sale.itemType==="CATALOG"?"active":""} onClick={()=>p.setSale(d=>({...d,itemType:"CATALOG",itemId:""}))}>Catalog</button><button type="button" className={p.sale.itemType==="PROMOTION"?"active":""} onClick={()=>p.setSale(d=>({...d,itemType:"PROMOTION",itemId:""}))}>Promotion</button></div><Two a={<Field label="รายการ"><select value={p.sale.itemId} onChange={e=>p.setSale(d=>({...d,itemId:e.target.value}))} required><option value="">เลือกรายการ</option>{choices.map(x=><option key={x.id} value={x.id}>{x.code} · {x.name} · {money(x.finalPrice)}</option>)}</select></Field>} b={<Field label="จำนวน"><input type="number" min="1" value={p.sale.quantity} onChange={e=>p.setSale(d=>({...d,quantity:Number(e.target.value)}))}/></Field>}/>{selected&&<SaleTaxSummary item={selected} quantity={p.sale.quantity}/>}<button className="primary-button" disabled={p.saving}>สร้างและยืนยันใบขาย</button></form></article><article className="panel"><Heading icon="฿" over="PAYMENT" title="บันทึกรับชำระ"/><form className="catalog-form" onSubmit={p.pay}><Field label="ใบขาย"><select value={p.payment.saleId} onChange={e=>{const s=p.sales.find(x=>x.id===e.target.value);p.setPayment(d=>({...d,saleId:e.target.value,amount:s?.balanceAmount??""}));}} required><option value="">เลือกใบขาย</option>{payable.map(x=><option key={x.id} value={x.id}>{x.saleNo} · คงเหลือ {money(x.balanceAmount)}</option>)}</select></Field><Two a={<Field label="ยอดรับ"><input type="number" min="0.01" step="0.01" value={p.payment.amount} onChange={e=>p.setPayment(d=>({...d,amount:e.target.value}))} required/></Field>} b={<Field label="ช่องทาง"><select value={p.payment.method} onChange={e=>p.setPayment(d=>({...d,method:e.target.value}))}><option value="CASH">เงินสด</option><option value="TRANSFER">โอนเงิน</option><option value="CREDIT_CARD">บัตรเครดิต</option><option value="QR">QR</option><option value="OTHER">อื่น ๆ</option></select></Field>}/><Field label="วันที่รับชำระ"><input type="datetime-local" value={p.payment.paidAt} onChange={e=>p.setPayment(d=>({...d,paidAt:e.target.value}))} required/></Field><Field label="เลขอ้างอิง"><input value={p.payment.reference} onChange={e=>p.setPayment(d=>({...d,reference:e.target.value}))}/></Field><button className="primary-button" disabled={p.saving}>บันทึกรับชำระ</button></form></article></section><section className="panel list-section"><Heading icon="≡" over="SALES" title="ใบขายล่าสุด"/>{!p.sales.length?<Empty text="ยังไม่มีใบขาย"/>:<div className="sales-table"><div className="sales-table-head"><span>เลขที่</span><span>รายการ</span><span>ยอดสุทธิ</span><span>คงเหลือ</span><span>สถานะ</span></div>{p.sales.map(s=><div key={s.id}><b>{s.saleNo}</b><span>{s.lines.map(l=>`${l.itemNameSnapshot} ×${l.quantity}`).join(", ")}</span><strong>{money(s.netAmount)}</strong><strong>{money(s.balanceAmount)}</strong><span className={`status-pill ${s.status.toLowerCase()}`}>{s.status}</span></div>)}</div>}</section></>}

function ReportView(p:{month:string;setMonth:(v:string)=>void;reports:{sales:SalesReport;payments:PaymentReport;qty:QuantityReport}|null;saving:boolean;load:()=>void}){return <><section className="section-intro report-intro"><div><p className="eyebrow">MONTHLY REPORTS</p><h2>ยอดขาย เงินรับ และจำนวนที่ขาย</h2><p>แยกวันที่เกิดยอดขายจากวันที่รับเงินจริง และแยกขายตรงจาก bundle</p></div><Field label="เดือน"><input type="month" value={p.month} onChange={e=>p.setMonth(e.target.value)}/></Field><button className="primary-button" disabled={p.saving} onClick={p.load}>ดูรายงาน</button></section>{!p.reports?<section className="panel"><Empty text="เลือกเดือนแล้วกดดูรายงาน"/></section>:<div className="report-grid"><Report title="ยอดขาย" rows={[["จำนวนบิล",p.reports.sales.billCount],["ยอดก่อนลด",money(p.reports.sales.subtotal)],["ส่วนลด",money(p.reports.sales.discountAmount)],["ยอดสุทธิ",money(p.reports.sales.netSales)],["คืนเงิน",money(p.reports.sales.refundAmount)],["ยอดหลังคืน",money(p.reports.sales.netSalesAfterRefund)],["ยอดค้าง",money(p.reports.sales.outstandingAmount)]]}/><Report title="เงินรับ" rows={[["เงินสด",money(p.reports.payments.cashAmount)],["โอนเงิน",money(p.reports.payments.transferAmount)],["บัตรเครดิต",money(p.reports.payments.creditCardAmount)],["QR",money(p.reports.payments.qrAmount)],["รับทั้งหมด",money(p.reports.payments.totalCollected)],["คืนทั้งหมด",money(p.reports.payments.totalRefunded)],["รับสุทธิ",money(p.reports.payments.netCollected)]]}/><Report title="จำนวนที่ขาย" rows={[["สินค้าขายตรง",p.reports.qty.productDirectQuantity],["สินค้าใน bundle",p.reports.qty.productBundleQuantity],["บริการขายตรง",p.reports.qty.serviceDirectUnits],["บริการใน bundle",p.reports.qty.serviceBundleUnits],["คอร์ส",p.reports.qty.courseSoldQuantity],["แพ็กเกจ",p.reports.qty.packageSoldQuantity],["โปรโมชัน",p.reports.qty.promotionSoldQuantity],["สิทธิ์ใช้แล้ว",p.reports.qty.entitlementUsedUnits]]}/></div>}</>}

function Intro({over,title,text,stats}:{over:string;title:string;text:string;stats:[string,number][]}){return <section className="section-intro"><div><p className="eyebrow">{over}</p><h2>{title}</h2><p>{text}</p></div>{stats.map(([l,v])=><div className="mini-stat" key={l}><b>{v}</b><span>{l}</span></div>)}</section>}
function Heading({icon,over,title}:{icon:string;over:string;title:string}){return <div className="panel-heading"><div className="icon-tile blue">{icon}</div><div><p className="eyebrow">{over}</p><h3>{title}</h3></div></div>}
function Empty({text}:{text:string}){return <div className="empty-state"><b>{text}</b></div>}
function Field({label,children}:{label:string;children:React.ReactNode}){return <label>{label}{children}</label>}
function Two({a,b}:{a:React.ReactNode;b:React.ReactNode}){return <div className="catalog-form-row">{a}{b}</div>}
function PriceFields({draft,setDraft}:{draft:Draft;setDraft:React.Dispatch<React.SetStateAction<Draft>>}){const label=draft.type==="PRODUCT"?"ราคาขาย (รวม VAT 7%)":draft.type==="SERVICE"?"ค่าหัตถการ (ไม่คิด VAT)":"ค่าหัตถการทั้งคอร์ส (ไม่คิด VAT)";return <><Two a={<Field label={label}><input type="number" min="0.01" step="0.01" value={draft.basePrice} onChange={e=>setDraft(d=>({...d,basePrice:e.target.value}))} required/></Field>} b={<Field label="ประเภทส่วนลด"><select value={draft.discountType} onChange={e=>setDraft(d=>({...d,discountType:e.target.value as DType}))}><option value="NONE">ไม่มีส่วนลด</option><option value="PERCENT">เปอร์เซ็นต์</option><option value="AMOUNT">จำนวนเงิน</option></select></Field>}/>{draft.discountType!=="NONE"&&<Field label="ค่าส่วนลด"><input type="number" min="0" step="0.01" value={draft.discountValue} onChange={e=>setDraft(d=>({...d,discountValue:e.target.value}))}/></Field>}</>}
function TaxPricePreview({price}:{price:{base:number;discount:number;final:number;nonTaxable:number;taxable:number;vat:number}}){return <div className="tax-price-preview"><div className="tax-preview-head"><span>สรุปราคา</span><small>ราคาสินค้ารวม VAT แล้ว</small></div><div className="tax-preview-row"><span>ค่าหัตถการ ไม่คิด VAT</span><b>{money(price.nonTaxable)}</b></div><div className="tax-preview-row"><span>มูลค่าสินค้าก่อน VAT</span><b>{money(price.taxable)}</b></div><div className="tax-preview-row"><span>VAT 7%</span><b>{money(price.vat)}</b></div>{price.discount>0&&<div className="tax-preview-row discount"><span>ส่วนลดรวม</span><b>− {money(price.discount)}</b></div>}<div className="tax-preview-total"><span><b>ยอดสุทธิ</b><small>รวม VAT แล้ว</small></span><strong>{money(price.final)}</strong></div></div>}
function SaleTaxSummary({item,quantity}:{item:Item;quantity:number}){const tax=item.taxBreakdown;return <div className="sale-tax-summary"><div><span>ไม่คิด VAT</span><b>{money(Number(tax?.nonTaxableAmount??0)*quantity)}</b></div><div><span>ก่อน VAT</span><b>{money(Number(tax?.taxableAmount??0)*quantity)}</b></div><div><span>VAT 7%</span><b>{money(Number(tax?.taxAmount??0)*quantity)}</b></div><div className="total"><span>ยอดชำระ รวม VAT</span><b>{money(Number(item.finalPrice)*quantity)}</b></div></div>}
function Discount<T extends BundleDraft>({value,setValue}:{value:T;setValue:React.Dispatch<React.SetStateAction<T>>}){return <Two a={<Field label="ประเภทส่วนลด"><select value={value.discountType} onChange={e=>setValue(d=>({...d,discountType:e.target.value as DType}))}><option value="NONE">ไม่มีส่วนลด</option><option value="PERCENT">เปอร์เซ็นต์</option><option value="AMOUNT">จำนวนเงิน</option></select></Field>} b={<Field label="ค่าส่วนลด"><input type="number" min="0" step="0.01" disabled={value.discountType==="NONE"} value={value.discountValue} onChange={e=>setValue(d=>({...d,discountValue:e.target.value}))}/></Field>}/>}
function Picker({items,values,change}:{items:Item[];values:Record<string,number>;change:(id:string,q:number)=>void}){return <div><span className="field-title">องค์ประกอบ</span><div className="component-picker">{items.map(i=><label key={i.id} className={values[i.id]>0?"selected":""}><input type="checkbox" checked={values[i.id]>0} onChange={e=>change(i.id,e.target.checked?1:0)}/><span><b>{i.name}</b><small>{meta[i.type].label} · {money(i.basePrice)}</small></span><input aria-label={`จำนวน ${i.name}`} type="number" min="1" value={values[i.id]||1} disabled={!values[i.id]} onChange={e=>change(i.id,Number(e.target.value))}/></label>)}</div></div>}
function Report({title,rows}:{title:string;rows:[string,string|number][]}){return <article className="panel report-card"><h3>{title}</h3>{rows.map(([l,v],i)=><div key={l} className={i===rows.length-1?"report-total":""}><span>{l}</span><b>{v}</b></div>)}</article>}
function NewServiceProductPicker({
  ownerType,
  token,
  initialProducts,
  values,
  onChange,
}: {
  ownerType: "SERVICE" | "COURSE";
  token: string;
  initialProducts: Item[];
  values: NewServiceProducts;
  onChange: React.Dispatch<React.SetStateAction<NewServiceProducts>>;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Item[]>(initialProducts.slice(0, 20));
  const [knownProducts, setKnownProducts] = useState<Item[]>(initialProducts);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const search = query.trim();
        const params = new URLSearchParams({
          type: "PRODUCT",
          status: "ACTIVE",
          limit: "20",
          sortBy: "name",
          sortOrder: "asc",
        });
        if (search) params.set("search", search);

        const response = await apiRequest<Item[]>(`/catalog/items?${params.toString()}`, { token });
        if (cancelled) return;

        setResults(response.data);
        setKnownProducts(current => {
          const productsById = new Map(current.map(product => [product.id, product]));
          response.data.forEach(product => productsById.set(product.id, product));
          return Array.from(productsById.values());
        });
        setSearchError("");
      } catch {
        if (!cancelled) setSearchError("ค้นหาสินค้าไม่สำเร็จ กรุณาลองอีกครั้ง");
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, token]);

  const visibleProducts = useMemo(() => {
    const productsById = new Map(knownProducts.map(product => [product.id, product]));
    const selected = Object.keys(values)
      .map(productId => productsById.get(productId))
      .filter((product): product is Item => Boolean(product));
    const selectedIds = new Set(selected.map(product => product.id));
    return [...selected, ...results.filter(product => !selectedIds.has(product.id))];
  }, [knownProducts, results, values]);

  return (
    <div className="new-service-products">
      <div className="new-service-products-head">
        <span className="field-title">
          สูตรสินค้าต่อครั้งสำหรับ{ownerType === "COURSE" ? "คอร์ส" : "บริการ"} <small>ระบบเลือก Lot แบบ FEFO ตอนใช้งานจริง</small>
        </span>
        <b>{Object.keys(values).length} รายการ</b>
      </div>

      <label className="service-product-search">
        <span aria-hidden="true">⌕</span>
        <input
          type="search"
          value={query}
          onChange={event => {
            setQuery(event.target.value);
            setSearching(true);
            setSearchError("");
          }}
          placeholder="ค้นหาจากชื่อหรือรหัสสินค้า…"
          aria-label={`ค้นหาสินค้าใน${ownerType === "COURSE" ? "คอร์ส" : "บริการ"}`}
        />
      </label>

      <div className="service-product-search-meta">
        <small>
          {searching
            ? "กำลังค้นหา…"
            : query.trim()
              ? `ผลลัพธ์ ${results.length} รายการ`
              : "แสดงสินค้า ACTIVE สูงสุด 20 รายการ"}
        </small>
        {Object.keys(values).length > 0 && <small>สินค้าที่เลือกจะแสดงไว้ด้านบน</small>}
      </div>

      {searchError ? (
        <div className="recipe-empty">{searchError}</div>
      ) : !visibleProducts.length && searching ? (
        <div className="recipe-empty">กำลังค้นหาสินค้า…</div>
      ) : !visibleProducts.length ? (
        <div className="recipe-empty">
          {query.trim() ? "ไม่พบสินค้า ACTIVE ที่ตรงกับคำค้น" : "ยังไม่มีสินค้า ACTIVE — เปิดใช้งานสินค้าก่อน"}
        </div>
      ) : (
        <div className="new-recipe-list">
          {visibleProducts.map(product => {
            const row = values[product.id];
            return (
              <div key={product.id} className={row ? "selected" : ""}>
                <label className="recipe-choice">
                  <input
                    type="checkbox"
                    checked={Boolean(row)}
                    onChange={event =>
                      onChange(current => {
                        if (!event.target.checked) {
                          const next = { ...current };
                          delete next[product.id];
                          return next;
                        }
                        return {
                          ...current,
                          [product.id]: {
                            quantity: 1,
                            unitPrice: product.basePrice,
                            discountType: "NONE",
                            discountValue: "0",
                          },
                        };
                      })
                    }
                  />
                  <span>
                    <b>{product.name} <em className="vat-badge">VAT 7%</em></b>
                    <small className={(product.productDetail?.currentStock ?? 0) < 0 ? "stock-negative-text" : ""}>
                      {product.code} · stock {product.productDetail?.currentStock ?? 0} {product.productDetail?.unit}
                    </small>
                  </span>
                </label>

                {row && (
                  <div className="new-recipe-fields">
                    <Field label="จำนวน">
                      <input
                        type="number"
                        min="1"
                        value={row.quantity}
                        onChange={event =>
                          onChange(current => ({
                            ...current,
                            [product.id]: {
                              ...current[product.id],
                              quantity: Number(event.target.value),
                            },
                          }))
                        }
                      />
                    </Field>
                    <Field label="ราคา/หน่วย (รวม VAT)">
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={row.unitPrice}
                        onChange={event =>
                          onChange(current => ({
                            ...current,
                            [product.id]: {
                              ...current[product.id],
                              unitPrice: event.target.value,
                            },
                          }))
                        }
                      />
                    </Field>
                    <Field label="ส่วนลด">
                      <select
                        value={row.discountType}
                        onChange={event =>
                          onChange(current => ({
                            ...current,
                            [product.id]: {
                              ...current[product.id],
                              discountType: event.target.value as DType,
                            },
                          }))
                        }
                      >
                        <option value="NONE">ไม่ลด</option>
                        <option value="PERCENT">%</option>
                        <option value="AMOUNT">บาท</option>
                      </select>
                    </Field>
                    <Field label="ค่า">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        disabled={row.discountType === "NONE"}
                        value={row.discountValue}
                        onChange={event =>
                          onChange(current => ({
                            ...current,
                            [product.id]: {
                              ...current[product.id],
                              discountValue: event.target.value,
                            },
                          }))
                        }
                      />
                    </Field>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
function ServiceRecipe(p:{service:Item;rows:ServiceProduct[];products:Item[];recipe:{productId:string;quantity:number;unitPrice:string;discountType:DType;discountValue:string};saving:boolean;setRecipe:React.Dispatch<React.SetStateAction<{productId:string;quantity:number;unitPrice:string;discountType:DType;discountValue:string}>>;close:()=>void;add:(e:FormEvent)=>void;update:(id:string,data:{quantity:number;unitPrice:number;discountType:DType;discountValue:number})=>void;remove:(id:string)=>void}){return <section className="panel service-recipe"><div className="recipe-head"><Heading icon="⚗" over={p.service.type==="COURSE"?"COURSE FORMULA":"SERVICE FORMULA"} title={`สูตรสินค้าต่อครั้ง: ${p.service.name}`}/><div className="recipe-totals"><span>ค่าหัตถการ <small>ไม่คิด VAT</small><b>{money(p.service.taxBreakdown?.nonTaxableAmount??p.service.serviceDetail?.servicePrice)}</b></span><span>ฐาน VAT <small>ก่อนภาษี</small><b>{money(p.service.taxBreakdown?.taxableAmount)}</b></span><span>VAT 7% <small>รวมในราคาแล้ว</small><b>{money(p.service.taxBreakdown?.taxAmount)}</b></span><span className="recipe-grand-total">ยอดสุทธิ <small>ลูกค้าชำระ</small><b>{money(p.service.finalPrice??p.service.basePrice)}</b></span></div><button className="text-button" onClick={p.close}>ปิด ×</button></div><form className="recipe-add" onSubmit={p.add}><Field label="สินค้า"><select value={p.recipe.productId} onChange={e=>{const product=p.products.find(x=>x.id===e.target.value);p.setRecipe(d=>({...d,productId:e.target.value,unitPrice:product?.basePrice??""}));}} required><option value="">เลือกสินค้าที่ ACTIVE</option>{p.products.filter(x=>!p.rows.some(r=>r.productId===x.id)).map(x=><option key={x.id} value={x.id}>{x.name} · stock {x.productDetail?.currentStock??0}</option>)}</select></Field><Field label="จำนวน"><input type="number" min="1" value={p.recipe.quantity} onChange={e=>p.setRecipe(d=>({...d,quantity:Number(e.target.value)}))}/></Field><Field label="ราคา/หน่วย (รวม VAT)"><input type="number" min="0.01" step="0.01" value={p.recipe.unitPrice} onChange={e=>p.setRecipe(d=>({...d,unitPrice:e.target.value}))}/></Field><Field label="ส่วนลด"><select value={p.recipe.discountType} onChange={e=>p.setRecipe(d=>({...d,discountType:e.target.value as DType}))}><option value="NONE">ไม่มี</option><option value="PERCENT">%</option><option value="AMOUNT">บาท</option></select></Field><Field label="ค่า"><input type="number" min="0" step="0.01" disabled={p.recipe.discountType==="NONE"} value={p.recipe.discountValue} onChange={e=>p.setRecipe(d=>({...d,discountValue:e.target.value}))}/></Field><button className="primary-button" disabled={p.saving}>เพิ่มสินค้า</button></form>{!p.rows.length?<Empty text={`${p.service.type==="COURSE"?"คอร์ส":"บริการ"}นี้ยังไม่มีสูตรสินค้า`}/>:<div className="recipe-list">{p.rows.map(r=><ServiceProductRow key={r.id} row={r} saving={p.saving} update={p.update} remove={p.remove}/>)}</div>}</section>}
function ServiceProductRow({row,saving,update,remove}:{row:ServiceProduct;saving:boolean;update:(id:string,data:{quantity:number;unitPrice:number;discountType:DType;discountValue:number})=>void;remove:(id:string)=>void}){return <form onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);update(row.productId,{quantity:Number(f.get("quantity")),unitPrice:Number(f.get("unitPrice")),discountType:String(f.get("discountType")) as DType,discountValue:Number(f.get("discountValue"))});}}><div className="recipe-product"><b>{row.product.name} <em className="vat-badge">VAT 7%</em></b><small className={(row.product.productDetail?.currentStock??0)<0?"stock-negative":""}>stock {row.product.productDetail?.currentStock??0} {row.product.productDetail?.unit}</small></div><input name="quantity" aria-label="จำนวน" type="number" min="1" defaultValue={row.quantity}/><input name="unitPrice" aria-label="ราคาต่อหน่วย" type="number" min="0.01" step="0.01" defaultValue={row.unitPrice}/><select name="discountType" aria-label="ประเภทส่วนลด" defaultValue={row.discountType}><option value="NONE">ไม่ลด</option><option value="PERCENT">%</option><option value="AMOUNT">บาท</option></select><input name="discountValue" aria-label="ค่าส่วนลด" type="number" min="0" step="0.01" defaultValue={row.discountValue}/><b>{money(row.lineNetPrice)}</b><div className="row-actions"><button disabled={saving}>บันทึก</button><button type="button" disabled={saving} onClick={()=>remove(row.productId)}>ลบ</button></div></form>}
function CatalogCard({item,onStatus,onManage}:{item:Item;onStatus:(s:"ACTIVE"|"INACTIVE")=>void;onManage?:()=>void}){const m=meta[item.type];const stock=item.productDetail?.currentStock;const minStock=Number(item.productDetail?.minStock??0);const detail=item.type==="PRODUCT"?`${item.productDetail?.unit} · stock ${stock??0} · ขั้นต่ำ ${minStock}`:item.type==="SERVICE"?`${item.serviceDetail?.durationMinutes} นาที · ค่าบริการ ${money(item.serviceDetail?.servicePrice)}`:item.type==="COURSE"?`${item.courseDetail?.sessionCount} ครั้ง`:"Bundle";const isLow=item.type==="PRODUCT"&&minStock>0&&Number(stock??0)<=minStock;return <article className="catalog-card"><div className="catalog-card-top"><span className={`catalog-type-icon ${m.tone}`}>{m.icon}</span><div><span className="catalog-code">{item.code}</span><h4>{item.name}</h4></div><span className={`status-pill ${item.status.toLowerCase()}`}>{item.status}</span></div><p>{item.description||"ไม่มีรายละเอียด"}</p><div className={`catalog-detail ${stock!==undefined&&stock<0?"stock-negative":""} ${isLow?"stock-low":""}`}>{m.label} · {detail}{isLow&&<b> · STOCK ต่ำ</b>}</div><div className="catalog-card-bottom"><div className="catalog-price">{Number(item.discountAmount)>0&&<del>{money(item.basePrice)}</del>}<b>{money(item.finalPrice)}</b><small>{item.type==="PRODUCT"?"รวม VAT 7%":item.type==="PACKAGE"?"ดูภาษีตอน Checkout":`VAT ${money(item.taxBreakdown?.taxAmount)} · รวมแล้ว`}</small></div><div className="row-actions">{onManage&&<button onClick={onManage}>จัดสินค้า</button>}<button className="status-action" onClick={()=>onStatus(item.status==="ACTIVE"?"INACTIVE":"ACTIVE")}>{item.status==="ACTIVE"?"ปิดใช้งาน":"เปิดใช้งาน"}</button></div></div></article>}
