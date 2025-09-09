import "./globals.css";
import Header from "./components/Header";
import Link from "next/link";
import SetCustomerId from "./components/SetCustomerId";
import { Suspense } from "react";
import Sidebar from "./components/Sidebar";
import Cookies from "js-cookie";

export default function RootLayout({ children }) {



  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const customerId = urlParams.get("customerId");

    if (customerId) {
      // Guardamos cookie con el mismo nombre que el parámetro
      Cookies.set("customerId", customerId, { expires: 30 }); // expira en 7 días
      console.log("customerId guardado en cookie:", customerId);
    }
  }, []);
  return (
    
    <html lang="en">
      <body className="h-screen flex flex-col bg-white">
        <Suspense fallback={<div>Loading...</div>}>
          <SetCustomerId />
        </Suspense>

        {/* Header */}
        <Header />

        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar */}
          <Sidebar />

          {/* Main content */}
          <main className="flex-1 bg-white overflow-y-auto">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
