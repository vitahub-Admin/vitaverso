// ═══════════════════════════════════════════════
// CompartirReferralPage.jsx
// ═══════════════════════════════════════════════
"use client";

import { useEffect, useState } from "react";
import Cookies from "js-cookie";
import Banner from "../components/Banner";
import { Link, Copy, Check, Users, Gift, TrendingUp, AlertCircle } from "lucide-react";

export default function CompartirReferralPage() {
  const [error,        setError]       = useState("");
  const [loading,      setLoading]     = useState(true);
  const [customerId,   setCustomerId]  = useState(null);
  const [referralLink, setReferralLink] = useState("");
  const [copied,       setCopied]      = useState(false);

  useEffect(() => {
    const id = Cookies.get("customerId");
    if (!id) {
      setError("No hay customerId disponible — necesitás estar logueado");
      setLoading(false);
      return;
    }
    const numericId = parseInt(id);
    setCustomerId(numericId);
    setReferralLink(`https://vitahub.mx/pages/registro-afiliados?sourceRef=${numericId}`);
    setLoading(false);
  }, []);

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(referralLink);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = referralLink;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const PASOS = [
    { icon: Link,       title: "Comparte tu link único",        desc: "Envia tu link personalizado a otros profesionales de la salud." },
    { icon: Users,      title: "Se registran como afiliados",   desc: "Tus referidos completan el registro en el programa." },
    { icon: TrendingUp, title: "Ganas comisiones",              desc: "Recibes $300 cuando tu referido realice su primera venta." },
  ];

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <Banner youtubeVideoUrl="https://www.youtube.com/watch?v=-qgYe5UelcE" />

      {/* ── Título ── */}
      <div className="w-full border-b border-gray-100 px-6">
        <div className="max-w-[960px] mx-auto py-6">
          <h1 className="text-3xl font-extrabold text-[#1b3f7a] tracking-tight leading-none mb-1">
            Compartir Referral
          </h1>
          <p className="text-sm text-gray-400 font-medium">
            Invita colegas y gana por cada nuevo afiliado
          </p>
        </div>
      </div>

      <div className="max-w-[960px] mx-auto px-6 py-7 flex flex-col gap-5">

        {loading && (
          <div className="flex items-center justify-center py-16 gap-3 text-gray-400">
            <div className="w-6 h-6 rounded-full border-[3px] border-gray-200 border-t-[#1b3f7a] animate-spin" />
            <span className="text-sm">Cargando…</span>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-3 rounded-xl flex items-center gap-2">
            <AlertCircle size={15} className="shrink-0" />
            {error}
          </div>
        )}

        {!loading && !customerId && !error && (
          <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-10 flex flex-col items-center gap-4 text-center">
            <div className="w-12 h-12 bg-red-50 rounded-2xl flex items-center justify-center text-red-400">
              <AlertCircle size={22} />
            </div>
            <h2 className="text-base font-bold text-gray-700">Acceso no autorizado</h2>
            <p className="text-sm text-gray-400">Necesitas estar logueado para generar tu link de referral.</p>
            <button
              onClick={() => window.location.href = "/login"}
              className="px-5 py-2.5 bg-[#1b3f7a] text-white rounded-xl text-sm font-semibold hover:bg-[#163264] transition"
            >
              Ir al Login
            </button>
          </div>
        )}

        {!loading && customerId && (
          <>
            {/* ══ Cómo funciona ══ */}
            <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-6">
              <p className="text-[0.67rem] font-semibold tracking-widest uppercase text-gray-400 mb-4">
                Cómo funciona
              </p>
              <div className="flex flex-col gap-4">
                {PASOS.map((paso, i) => (
                  <div key={i} className="flex items-start gap-4">
                    <div className="w-9 h-9 rounded-xl bg-blue-50 text-[#1b3f7a] flex items-center justify-center shrink-0">
                      <paso.icon size={16} />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-gray-800 mb-0.5">{paso.title}</p>
                      <p className="text-xs text-gray-500 leading-relaxed">{paso.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* ══ Tu link ══ */}
            <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-6">
              <p className="text-[0.67rem] font-semibold tracking-widest uppercase text-gray-400 mb-3">
                Tu link personalizado
              </p>
              <div className="flex gap-2">
                <div className="flex-1 border border-gray-200 rounded-xl px-4 py-3 bg-gray-50 overflow-hidden">
                  <code className="text-xs text-gray-600 truncate block">{referralLink}</code>
                </div>
                <button
                  onClick={copyToClipboard}
                  className={`shrink-0 flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold transition ${
                    copied
                      ? "bg-emerald-50 text-emerald-600 border border-emerald-200"
                      : "bg-[#1b3f7a] text-white hover:bg-[#163264]"
                  }`}
                >
                  {copied ? <Check size={15} /> : <Copy size={15} />}
                  {copied ? "Copiado" : "Copiar"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}