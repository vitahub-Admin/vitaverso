// app/layout.jsx - VERSIÓN SIMPLIFICADA
"use client";

import "./globals.css";
import Header from "./components/Header";
import { Suspense, useState, useEffect } from "react";
import Sidebar from "./components/Sidebar";
import Script from "next/script";
import Cookies from "js-cookie";
import { useSearchParams, usePathname } from "next/navigation";

function AuthManager({ children }) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const token = searchParams.get("token");
    const customerIdFromCookie = Cookies.get("customerId");

    console.log("🔐 Auth check:", {
      token,
      fromCookie: customerIdFromCookie
    });
  
  // Si llega token en URL → validarlo
  if (token) {
    console.log("🔑 Token recibido, validando...");

    fetch("/api/verify-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.ok && data.customerId) {
          console.log("✅ Token válido, guardando customerId");
          Cookies.set("customerId", data.customerId, { expires: 30 });
          setShowAuthModal(false);
        } else {
          console.log("❌ Token inválido");
          Cookies.remove("customerId");
          setShowAuthModal(true);
        }
        setIsLoading(false);
      });

    return;
  }

    // Si hay customerId en cookie, todo bien
    if (customerIdFromCookie) {
      console.log("✅ CustomerId en cookie");
      setShowAuthModal(false);
      setIsLoading(false);
      return;
    }

    // Si no hay customerId en ningún lado
    console.log("🚫 No hay customerId, mostrando modal");
    setShowAuthModal(true);
    setIsLoading(false);
  }, [searchParams]);

  const redirectToShop = () => {
    window.location.href = 'https://vitahub.mx/account';
  };

  const redirectToAffiliateRegister = () => {
    window.location.href = 'https://vitahub.mx/pages/registro-afiliados';
  };

  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-white flex items-center justify-center z-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1b3f7a] mx-auto mb-2"></div>
          <p className="text-gray-600 text-sm">Verificando acceso...</p>
        </div>
      </div>
    );
  }

  if (showAuthModal) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl shadow-2xl max-w-md w-full mx-auto">
          <div className="bg-[#1b3f7a] text-white p-6 rounded-t-xl text-center">
            <div className="w-16 h-16 bg-white bg-opacity-20 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl">🔐</span>
            </div>
            <h2 className="text-2xl font-bold mb-2">Acceso Requerido</h2>
            <p className="text-blue-100">Necesitas identificarte para continuar</p>
          </div>

          <div className="p-6 space-y-4">
            <p className="text-gray-600 text-center">
              Para acceder al panel profesional de VitaHub, necesitas tu cuenta de cliente.
            </p>

            <div className="space-y-3">
              <button 
                onClick={redirectToShop}
                className="w-full px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium flex items-center justify-center gap-2"
              >
                <span>🏪</span>
                Ir a Mi Cuenta VitaHub
              </button>

              <button 
                onClick={redirectToAffiliateRegister}
                className="w-full px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium flex items-center justify-center gap-2"
              >
                <span>💼</span>
                Registrarme como Afiliado
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Si está autenticado, mostrar el contenido normal
  return children;
}

export default function RootLayout({ children }) {
  useEffect(() => {
    import("react-microsoft-clarity").then(({ clarity }) => {
      clarity.init("tydr53wsez");
    });
  }, []);

  return (
    <html lang="en">
      <body className="h-screen flex flex-col bg-white">
        <Script
          src="https://t.contentsquare.net/uxa/bc20e7d4875d3.js"
          strategy="afterInteractive"
        />
        
        <Suspense fallback={
          <div className="fixed inset-0 bg-white flex items-center justify-center z-50">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1b3f7a] mx-auto mb-2"></div>
              <p className="text-gray-600 text-sm">Cargando...</p>
            </div>
          </div>
        }>
          <AuthManager>
            <div className="flex flex-col h-screen">
              <Header />
              <div className="flex flex-1 overflow-hidden">
                <Sidebar />
                <main className="flex-1 bg-white overflow-y-auto">
                  {children}
                </main>
              </div>
            </div>
          </AuthManager>
        </Suspense>
      </body>
    </html>
  );
}