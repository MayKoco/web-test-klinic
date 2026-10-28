This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

หน้า Login แบ่ง flow ทดสอบเป็นสองส่วน:

- **Clinic Login** — เข้า Clinic API Lab ตามปกติ
- **Owner Activation Test** (`/activation`) — เลือกสร้าง Clinic ใหม่หรือใช้ Clinic
- **Global Owner Setup** (`/owner/setup`) — สร้าง Organization/Owner และออก activation URL ใน local
- **Global Owner Portal** (`/owner`) — Login ด้วย Owner credential ชุดเดียวและดู Organization/Clinic
  ที่มีอยู่ จากนั้น issue token, activate Owner และตรวจ Clinic login โดยไม่ใช้
  email provider ระบบแสดง `appUrl` ที่ Platform คืนมาเมื่อสำเร็จ

Local subdomain ใช้ `lvh.me` ซึ่ง resolve กลับ `127.0.0.1` เช่น
`http://happy01.lvh.me:3000/` หน้านี้ดึง Clinic จาก hostname และจะแสดงเฉพาะ
Email/Password ส่วน `http://localhost:3000/` ยังมี Clinic Code เป็น development
fallback

Activation token และรหัสผ่านไม่ถูกเก็บใน browser storage

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
