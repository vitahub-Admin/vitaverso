"use client";

import { useEffect, useState } from "react";
import Cookies from "js-cookie";
import Banner from "../components/Banner";

export default function CompartirReferralPage() {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [customerId, setCustomerId] = useState(null);
  const [referralLink, setReferralLink] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const customerIdFromCookie = Cookies.get("customerId");
    console.log('🔍 CustomerId from cookie:', customerIdFromCookie);
    
    if (!customerIdFromCookie) {
      setError("No hay customerId disponible - necesitas estar logueado");
      setLoading(false);
      return;
    }
    
    const numericCustomerId = parseInt(customerIdFromCookie);
    console.log('🔍 Numeric customerId:', numericCustomerId);
    
    setCustomerId(numericCustomerId);
    
    // Generar el link de referral
    if (numericCustomerId) {
      const baseUrl = window.location.origin;
      const registerUrl = `https://vitahub.mx/pages/registro-afiliados?sourceRef=${numericCustomerId}`;
      setReferralLink(registerUrl);
    }
    
    setLoading(false);
  }, []);

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Error al copiar: ', err);
      // Fallback
      const textArea = document.createElement('textarea');
      textArea.value = referralLink;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const goToRegistration = () => {
    if (referralLink) {
      window.open(referralLink, '_blank');
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center gap-6 p-4">
        <Banner/>
        <div className="w-full bg-white shadow-md rounded-lg p-8 text-center">
          <p className="text-gray-500">Cargando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-6 p-4">
  
      <Banner youtubeVideoUrl="https://www.youtube.com/watch?v=-qgYe5UelcE" />

      {/* Header */}
      <div className="w-full bg-[#1b3f7a] rounded-lg p-4 mb-6">
        <h1 className="text-3xl md:text-4xl text-white font-lato text-center">
          Compartir Referral
        </h1>
      </div>

      {error && (
        <div className="w-full bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          <strong>Error: </strong> {error}
        </div>
      )}

      {!customerId ? (
        <div className="w-full bg-white shadow-md rounded-lg p-8 text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">⚠️</span>
          </div>
          <h2 className="text-xl font-bold text-gray-800 mb-4">Acceso no autorizado</h2>
          <p className="text-gray-600 mb-6">Necesitas estar logueado para generar tu link de referral.</p>
          <button 
            onClick={() => window.location.href = '/login'}
            className="px-6 py-3 bg-[#1b3f7a] text-white rounded-lg hover:bg-[#2a5298] transition-colors font-medium"
          >
            Ir al Login
          </button>
        </div>
      ) : (
        <>
          {/* Explicación del proceso */}
          <div className="w-full bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden">
            <div className="p-6 border-b border-gray-200 bg-gray-50">
              <h2 className="text-xl font-semibold text-gray-800 text-center">¿Cómo funciona el programa de referidos?</h2>
            </div>
            
            <div className="p-6 space-y-6">
              {[
                {
                  step: "1",
                  title: "Comparte tu link único",
                  description: "Envía tu link personalizado a otros profesionales de la salud"
                },
                {
                  step: "2", 
                  title: "Se registran como afiliados",
                  description: "Tus referidos completan el registro en el programa"
                },
                {
                  step: "3",
                  title: "Ganas comisiones", 
                  description: "Recibe una comision de $300 cuando  tu referido haga su primer venta"
                }
              ].map((item, idx) => (
                <div key={idx} className="flex items-start gap-4">
                  <div className="w-8 h-8 bg-[#1b3f7a] rounded-full flex items-center justify-center text-white font-semibold text-sm flex-shrink-0">
                    {item.step}
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-800 mb-1">{item.title}</h3>
                    <p className="text-gray-600 text-sm">{item.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Tu Link de Referral */}
          <div className="w-full bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden">
            <div className="p-6 border-b border-gray-200 bg-gray-50">
              <h2 className="text-xl font-semibold text-gray-800 text-center">Tu Link Personalizado</h2>
            </div>
            
            <div className="p-6">


              {/* Link y botones */}
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row gap-4">
                  <div className="flex-1">
                    <input
                      type="text"
                      value={referralLink}
                      readOnly
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg bg-gray-50 text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#1b3f7a] font-mono text-sm"
                      placeholder="Generando link..."
                    />
                  </div>
                  <button
                    onClick={copyToClipboard}
                    className={`px-6 py-3 rounded-lg font-medium whitespace-nowrap transition-colors ${
                      copied 
                        ? "bg-green-600 text-white" 
                        : "bg-gray-600 text-white hover:bg-gray-700"
                    }`}
                  >
                    {copied ? "✓ Copiado" : "Copiar Link"}
                  </button>
                </div>

              </div>
            </div>
          </div>

        </>
      )}
    </div>
  );
}