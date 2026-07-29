/**
 * ค่าเชื่อมต่อ Firebase — ปลอดภัยที่จะอยู่ในโค้ดฝั่ง client
 * ตัวคุมสิทธิ์จริงคือ Firestore Security Rules ไม่ใช่ key พวกนี้
 *
 * ถ้าไม่ได้ตั้งค่า เว็บจะทำงานแบบออฟไลน์ (เก็บใน localStorage) เหมือนเดิมทุกอย่าง
 */
export const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? "",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? "",
};

/** มีหลังบ้านให้ใช้ไหม */
export const hasBackend =
  firebaseConfig.apiKey.length > 0 && firebaseConfig.projectId.length > 0;
