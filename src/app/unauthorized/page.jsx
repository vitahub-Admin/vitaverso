// app/unauthorized/page.jsx
"use client";

import { useEffect, useState } from "react";
import Banner from "../components/Banner";

export default function UnauthorizedPage() {
  const [currentUrl, setCurrentUrl] = useState("");

  useEffect(() => {
    setCurrentUrl(window.location.origin + window.location.pathname);
  }, []);

  const redirectToShop = () => {
    window.location.href = 'https://vitahub.mx/account';
  };

  const redirectToAffiliateRegister = () => {
    window.location.href = 'https://vitahub.mx/pages/registro-afiliados';
  };

  const showInstructions = () => {
    const message = `Para acceder al panel profesional:\n\n1. Inicia sesión en https://vitahub.mx/account\n2. Tu customerId aparecerá automáticamente\n3. O contacta a soporte: soporte@vitahub.mx`;
    alert(message);
  };

  return (
    <div className="flex flex-col items-center gap-6 p-4 min-h-screen bg-gray-50">
      <Banner />

      <div className="w-full bg-[#1b3f7a] rounded-lg p-4 mb-6">
        <h1 className="text-3xl md:text-4xl text-white font-lato text-center">
          Acceso Requerido
        </h1>
      </div>

      <div className="w-full max-w-2xl bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden">
        <div className="bg-orange-50 border-b border-orange-200 p-6 text-center">
          <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">🔒</span>
          </div>
          <h2 className="text-xl font-bold text-orange-800 mb-2">Identificación Necesaria</h2>
          <p className="text-orange-600 text-sm">
            Necesitas tu customerId de VitaHub para acceder a esta página.
          </p>
        </div>

        <div className="p-6 space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="font-semibold text-blue-800 mb-2">🏪 Ir a Mi Cuenta VitaHub</h3>
            <p className="text-blue-700 text-sm mb-3">Accede con tu cuenta existente.</p>
            <button 
              onClick={redirectToShop}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium text-sm"
            >
              Iniciar Sesión
            </button>
          </div>

          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <h3 className="font-semibold text-green-800 mb-2">💼 Registrarse como Afiliado</h3>
            <p className="text-green-700 text-sm mb-3">Únete a nuestro programa profesional.</p>
            <button 
              onClick={redirectToAffiliateRegister}
              className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium text-sm"
            >
              Registrarme
            </button>
          </div>

          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <h3 className="font-semibold text-gray-800 mb-2">❓ ¿Necesitas Ayuda?</h3>
            <p className="text-gray-700 text-sm mb-3">Instrucciones para obtener tu customerId.</p>
            <button 
              onClick={showInstructions}
              className="w-full px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors font-medium text-sm"
            >
              Ver Instrucciones
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}