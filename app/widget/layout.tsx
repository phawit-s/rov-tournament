import BootFallback from "@/components/widget/BootFallback";

/**
 * Layout สำหรับ widget ที่เอาไปวางใน OBS / Streamlabs
 * ต้องพื้นหลังโปร่งใส ไม่มี scrollbar และไม่มีเฮดเดอร์ของเว็บ
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

              หน้า widget ถูก build ออกมาเป็น HTML เปล่าสนิท (ตรวจแล้ว เหลือแต่ CSS
              268 ตัวอักษร) ทุกอย่างที่เห็นมาจากโค้ดฝั่งเบราว์เซอร์ล้วน
              ถ้าโค้ดไม่ทำงานด้วยเหตุใดก็ตาม — ไฟล์หายหลัง deploy, ส่วนขยายบล็อก,
              เบราว์เซอร์เก่าอ่านไวยากรณ์ใหม่ไม่ออก — สิ่งที่เห็นคือจอขาวเปล่า
              ที่ไม่มีอะไรบอกสาเหตุเลยสักตัว

              ตัวนี้อยู่ใน HTML ตั้งแต่แรก จึงรอดทุกกรณีข้างบน
              หน่วงไว้ 6 วินาทีเพื่อไม่ให้แวบมาให้เห็นตอนโหลดปกติ
              แล้วโค้ดจะถอดมันทิ้งทันทีที่ทำงานได้ (ดูใน WidgetShell)
            */
            #widget-boot-fallback {
              position: fixed;
              inset: 12px;
              display: grid;
              place-items: center;
              text-align: center;
              font-family: system-ui, sans-serif;
              color: #d8dae3;
              background: rgba(10, 10, 14, 0.92);
              border-radius: 18px;
              padding: 20px;
              opacity: 0;
              animation: widget-boot-show 0.4s ease 6s forwards;
            }
            #widget-boot-fallback b {
              display: block;
              margin-bottom: 6px;
              font-size: 15px;
            }
            #widget-boot-fallback span {
              font-size: 12px;
              line-height: 1.6;
              color: #9ba0b3;
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
            กด Ctrl+F5 หนึ่งครั้ง — ถ้าอยู่ใน OBS ให้คลิกขวาที่ source แล้วเลือก
            Refresh cache of current page
            <br />
            ถ้ายังไม่หาย ลองปิดส่วนขยายกันโฆษณาเฉพาะเว็บนี้ หรือเปลี่ยนเครือข่าย
          </span>
        </div>
      </div>
    </>
  );
}
