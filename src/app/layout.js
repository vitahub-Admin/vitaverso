// app/layout.jsx
import "./globals.css";
import Header from "./Header";
import Link from "next/link";
import SetCustomerId from "./components/SetCustomerId";

export default function RootLayout({ children }) {

  const whatsappNumber = "5215534532104";
  const whatsappMessage = encodeURIComponent(
    "Estoy en el programa de afiliados y tengo una duda"
  );
  const whatsappLink = `https://wa.me/${whatsappNumber}?text=${whatsappMessage}`;
  return (
    <html lang="en">
      <body className="h-screen flex flex-col">
        <SetCustomerId/>
        {/* Header */}
     <Header/>


        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar */}
          <aside className=" bg-[#1b3f7a] border-r shadow-inner p-4 overflow-y-auto  text-white ">
            <nav className="flex flex-col gap-2">
              <Link href="/" className="px-3 py-2 rounded hover:bg-[#122d57]">
                Ganancias
              </Link>
              <Link href="/ordenes" className="px-3 py-2 rounded hover:bg-[#122d57]">
                Órdenes
              </Link>
              <Link href="/mis-carritos" className="px-3 py-2 rounded hover:bg-[#122d57]">
                Mis Carritos
              </Link>
              <Link href="/mi-tienda" className="px-3 py-2 rounded hover:bg-[#122d57]">
                Mi Tienda
              </Link>
              <Link href="/manual" className="px-3 py-2 rounded hover:bg-[#122d57]">
                Manual
              </Link>
              <Link href="/academia-vitahub" className="px-3 py-2 rounded hover:bg-[#122d57]">
                Academia Vitahub
              </Link>
              <Link
        href={whatsappLink}
        target="_blank"
        rel="noopener noreferrer"
        className="px-3 py-2 rounded bg-[#228f34] hover:bg-[#12571d]"
      >
              Ayuda
      </Link>
            </nav>
          </aside>

          {/* Main content */}
          <main className="flex-1 bg-white overflow-y-auto">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
