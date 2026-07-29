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
          `,
        }}
      />
      {children}
    </>
  );
}
