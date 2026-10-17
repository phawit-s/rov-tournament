import BootFallback from "@/components/widget/BootFallback";

/**
 * Layout สำหรับ widget ที่เอาไปวางใน OBS / Streamlabs
 * ต้องพื้นหลังโปร่งใส ไม่มี scrollbar และไม่มีเฮดเดอร์ของเว็บ
 *
 * ตัว widget เขียนขนาดเป็น px ทั้งหมด จึงไม่ขึ้นกับขนาดตัวอักษรรากของเว็บ
 * (ดูเหตุผลใน NowPlayingCard) ที่นี่ไม่ต้องไปแตะ font-size ของ html
 */
export default function WidgetLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: `
            html, body {
              background: transparent !important;
              margin: 0;
              overflow: hidden;
            }
            body::-webkit-scrollbar { display: none; }

            /*
              ป้ายสำรองตอนโค้ดฝั่งเบราว์เซอร์ไม่ทำงาน

              หน้า widget ถูก build ออกมาเป็น HTML เปล่าสนิท ทุกอย่างที่เห็น
              มาจากโค้ดฝั่งเบราว์เซอร์ล้วน ถ้าโค้ดไม่ทำงานด้วยเหตุใดก็ตาม —
              ไฟล์หายหลัง deploy, ส่วนขยายบล็อก, เบราว์เซอร์เก่าอ่านไวยากรณ์ใหม่ไม่ออก —
              สิ่งที่เห็นคือจอขาวเปล่าที่ไม่มีอะไรบอกสาเหตุเลยสักตัว

              ตัวนี้อยู่ใน HTML ตั้งแต่แรก จึงรอดทุกกรณีข้างบน
              หน่วงไว้ 6 วินาทีเพื่อไม่ให้แวบมาให้เห็นตอนโหลดปกติ
              แล้วโค้ดจะซ่อนมันทันทีที่ทำงานได้ ด้วยการติดธงที่ <html>
              (ดูใน BootFallback — ห้ามลบโหนดนี้ทิ้ง มันเป็นของที่ React เรนเดอร์)

              ใช้ฟอนต์ของระบบ เพราะกรณีที่ป้ายนี้โผล่ ฟอนต์ของเว็บก็มักโหลดไม่ขึ้นด้วย
              สีเขียนตรงๆ ไม่อ้างตัวแปรของเว็บ ด้วยเหตุผลเดียวกัน
            */
            html[data-widget-booted] #widget-boot-fallback {
              display: none;
            }
            #widget-boot-fallback {
              position: fixed;
              inset: 12px;
              display: grid;
              place-items: center;
              text-align: center;
              font-family: "Segoe UI", system-ui, sans-serif;
              color: #ffffff;
              background: rgb(34 34 38 / 0.96);
              border-radius: 20px;
              padding: 20px;
              opacity: 0;
              animation: widget-boot-show 0.4s ease 6s forwards;
            }
            #widget-boot-fallback b {
              display: block;
              margin-bottom: 6px;
              font-size: 17px;
              font-weight: 700;
            }
            #widget-boot-fallback span {
              font-size: 14px;
              line-height: 1.6;
              color: rgb(255 255 255 / 0.78);
            }
            @keyframes widget-boot-show { to { opacity: 1; } }
          `,
        }}
      />
      {children}
      <BootFallback />
      <div id="widget-boot-fallback">
        <div>
          <b>widget โหลดไม่ขึ้น</b>
          <span>
            กด Ctrl+F5 หนึ่งครั้ง ถ้าอยู่ใน OBS ให้เปิด Properties ของ source แล้วกด
            Refresh cache of current page
            <br />
            ถ้ายังไม่หาย ลองปิดส่วนขยายกันโฆษณาเฉพาะเว็บนี้ หรือเปลี่ยนเครือข่าย
          </span>
        </div>
      </div>
    </>
  );
}
