// app/layout.jsx
"use client";

import "./globals.css";
import Header from "./components/Header";
import SetCustomerId from "./components/SetCustomerId";
import { Suspense, useState, useEffect } from "react";
import Sidebar from "./components/Sidebar";
import Script from "next/script";
import Cookies from "js-cookie";
import { usePathname } from "next/navigation";

export default function RootLayout({ children }) {
  const [showAuthModal, setShowAuthModal] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    // Solo inicializar clarity en el cliente
    import("react-microsoft-clarity").then(({ clarity }) => {
      clarity.init("tydr53wsez");
    });
  }, []);

  useEffect(() => {
    // Verificar autenticación cuando cambia la ruta
    const customerId = Cookies.get("customerId");
    const isUnauthorizedPage = pathname === '/unauthorized';
    
    console.log("🔐 Layout auth check:", { customerId, pathname, isUnauthorizedPage });

    // Si no hay customerId y no estamos en una página pública, mostrar modal
    if (!customerId && !isUnauthorizedPage) {
      console.log("🚫 No auth, mostrando modal");
      setShowAuthModal(true);
    } else {
      setShowAuthModal(false);
    }
  }, [pathname]);

  const redirectToShop = () => {
    window.location.href = 'https://vitahub.mx/login';
  };

  const redirectToAffiliateRegister = () => {
    window.location.href = 'https://vitahub.mx/pages/registro-afiliados';
  };

  const closeModal = () => {
    // No permitir cerrar el modal - obligar a autenticarse
    return;
  };

  return (
    <html lang="en">
      <body className="h-screen flex flex-col bg-white">
        <Script
          src="https://t.contentsquare.net/uxa/bc20e7d4875d3.js"
          strategy="afterInteractive"
        />
        
        <Suspense fallback={null}>
          <SetCustomerId />
        </Suspense>

        {/* Modal de autenticación */}
        {showAuthModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl max-w-md w-full mx-auto">
              {/* Header del modal */}
              <div className="bg-[#1b3f7a] text-white p-6 rounded-t-xl text-center">
                <div className="w-16 h-16 bg-white bg-opacity-20 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-2xl">🔐</span>
                </div>
                <h2 className="text-2xl font-bold mb-2">Acceso Requerido</h2>
                <p className="text-blue-100">
                  Necesitas identificarte para continuar
                </p>
              </div>

              {/* Contenido del modal */}
              <div className="p-6 space-y-4">
                <p className="text-gray-600 text-center">
                  Para acceder al panel profesional de VitaHub, necesitas tu cuenta de cliente.
                </p>

                <div className="space-y-3">
                  <button 
                    onClick={redirectToShop}
                    className="w-full px-6 py-3 bg-[#1b3f7a] text-white rounded-lg hover:bg-green-700 transition-colors font-medium flex items-center justify-center gap-2"
                  >
                    
                    Ir a Mi Cuenta VitaHub
                  </button>

                  <button 
                    onClick={redirectToAffiliateRegister}
                    className="w-full px-6 py-3 bg-[#2BB9B8] #2BB9B8 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium flex items-center justify-center gap-2"
                  >
                  
                    Registrarme como Afiliado
                  </button>
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-4">
                  <h4 className="font-semibold text-blue-800 text-sm mb-2">¿Primera vez aquí?</h4>
                  <ul className="text-blue-700 text-xs space-y-1">
                    <li>• Inicia sesión en tu cuenta de VitaHub</li>
                    <li>• O regístrate como afiliado profesional</li>
                    <li>• Tu acceso será automático</li>
                  </ul>
                </div>
              </div>


             
            </div>
          </div>
        )}

        {/* Contenido principal - se muestra solo si está autenticado o no hay modal */}
        {!showAuthModal && (
          <>
            <Header />
            <div className="flex flex-1 overflow-hidden">
              <Sidebar />
              <main className="flex-1 bg-white overflow-y-auto">
                {children}
              </main>
            </div>
          </>
        )}
      </body>
    </html>
  );
}