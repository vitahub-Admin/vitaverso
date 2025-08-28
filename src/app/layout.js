// app/layout.jsx
import "./globals.css";
import Header from "./Header";
import Link from "next/link";


export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="h-screen flex flex-col">
        {/* Header */}
     <Header/>


        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar */}
          <aside className=" bg-[#1b3f7a] border-r shadow-inner p-4 overflow-y-auto  text-white ">
            <nav className="flex flex-col gap-2">
              <Link href="/" className="px-3 py-2 rounded hover:bg-[#122d57]">
                Mi Dashboard
              </Link>
              <Link href="/academia-vitahub" className="px-3 py-2 rounded hover:bg-[#122d57]">
                Academia Vitahub
              </Link>
              <Link href="/config" className="px-3 py-2 rounded hover:bg-[#122d57]">
                Ayuda
              </Link>
              <Link href="/config" className="px-3 py-2 rounded hover:bg-[#122d57]">
                Configuraciones
              </Link>
            </nav>
          </aside>

          {/* Main content */}
          <main className="flex-1 bg-white overflow-y-auto p-6">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
