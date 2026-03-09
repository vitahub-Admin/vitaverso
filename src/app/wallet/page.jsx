"use client";

import { useEffect, useState } from "react";
import Banner from "../components/Banner";
import axios from "axios";
import {
  Banknote, ShoppingBag, TrendingUp, ArrowUpRight,
  Clock, CheckCircle2, XCircle, Sparkles, CircleDollarSign,
  ShieldCheck, BadgePercent, Timer,
} from "lucide-react";

function fmt(n) {
  return Number(n).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function WalletPage() {
  const [wallet, setWallet]                   = useState(null);
  const [transactions, setTransactions]       = useState([]);
  const [loading, setLoading]                 = useState(true);
  const [withdrawing, setWithdrawing]         = useState(false);
  const [message, setMessage]                 = useState(null);
  const [messageType, setMessageType]         = useState("info");
  const [pendingExchange, setPendingExchange] = useState(null);
  const [withdrawAmount, setWithdrawAmount]   = useState("");
  const [exchangeType, setExchangeType]       = useState(null);
  const [clabe, setClabe]                     = useState(null);

  useEffect(() => {
    async function fetchWallet() {
      try {
        const res  = await fetch("/api/affiliates/wallet");
        const data = await res.json();
        if (data.success) { setWallet(data.wallet); setTransactions(data.transactions || []); }
        const exRes  = await fetch("/api/affiliates/wallet/exchange");
        const exData = await exRes.json();
        if (exData.success)
          setPendingExchange(exData.exchanges?.find((ex) => ex.status === "pending") || null);
      } catch (err) { console.error(err); }
      finally { setLoading(false); }
    }
    const getClabe = async () => {
      try {
        const r = await axios.get("/api/affiliates/clabe");
        if (r.data.success) setClabe(r.data.clabe_interbancaria);
      } catch (e) { console.error(e); }
    };
    fetchWallet();
    getClabe();
  }, []);

  const handleExchange = async () => {
    const amount = Number(withdrawAmount);
    if (!exchangeType)                     return notify("Selecciona un tipo de solicitud");
    if (!amount || amount <= 0)            return notify("Ingresa un monto válido");
    if (amount < 200)                      return notify("El monto mínimo de retiro es $200 MXN");
    if (amount > wallet.available)         return notify("No tienes saldo suficiente");
    if (pendingExchange)                   return notify("Ya tienes una solicitud pendiente");
    if (exchangeType === "cash" && !clabe) return notify("Debes registrar una CLABE para retirar dinero");
    try {
      setWithdrawing(true); setMessage(null);
      const res  = await fetch("/api/affiliates/wallet/exchange", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ points_requested: amount, exchange_type: exchangeType }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data?.message || "Error al solicitar");
      notify("¡Solicitud enviada correctamente!", "success");
      setWithdrawAmount(""); setExchangeType(null);
      const exRes  = await fetch("/api/affiliates/wallet/exchange");
      const exData = await exRes.json();
      if (exData.success)
        setPendingExchange(exData.exchanges?.find((ex) => ex.status === "pending") || null);
    } catch (err) { notify(err?.message || "Error inesperado", "error"); }
    finally { setWithdrawing(false); }
  };

  function notify(msg, type = "info") { setMessage(msg); setMessageType(type); }

  const storeCreditValue = exchangeType === "store_credit" && withdrawAmount ? Number(withdrawAmount) * 1.05 : 0;
  const bonus            = exchangeType === "store_credit" && withdrawAmount ? Number(withdrawAmount) * 0.05 : 0;

  if (loading) return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-white">
      <div className="w-9 h-9 rounded-full border-[3px] border-gray-200 border-t-[#1b3f7a] animate-spin" />
      <p className="text-sm text-gray-400">Cargando wallet…</p>
    </div>
  );

  if (!wallet) return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <p className="text-gray-400">No se pudo cargar la información.</p>
    </div>
  );

  const noticeStyles = {
    success: "bg-emerald-50 text-emerald-700 border border-emerald-200",
    error:   "bg-red-50 text-red-600 border border-red-200",
    warning: "bg-amber-50 text-amber-700 border border-amber-200",
    info:    "bg-blue-50 text-blue-700 border border-blue-200",
  };

  return (
    <div className="min-h-screen bg-white text-gray-900">


      <Banner youtubeVideoUrl="https://www.youtube.com/watch?v=mSYOgM052PM" />

      {/* ── Título full-width ── */}
      <div className="w-full border-b border-gray-100 px-6">
        <div className="max-w-[960px] mx-auto py-6">
          <h1 className="text-3xl font-bold text-[#1b3f7a] tracking-tight leading-none mb-1">
            Mi Wallet
          </h1>
          <p className="text-sm text-gray-400 font-medium">Administrá tus ganancias y créditos</p>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="max-w-[960px] mx-auto px-6 py-7 flex flex-col gap-5">

        {/* ══ FILA 1: Balance + Solicitud ══ */}
        <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-5 items-start">

          {/* Balance */}
          <div className="relative bg-white border border-gray-100 rounded-2xl p-7 shadow-sm overflow-hidden">
       

            <p className="flex items-center gap-1.5 text-[0.67rem] font-semibold tracking-widest uppercase text-gray-400 mb-3">
              <CircleDollarSign size={12} /> Saldo disponible
            </p>

            <div className="flex items-start gap-1 leading-none">
              <span className="text-xl font-bold text-[#1b3f7a] mt-1">$</span>
              <span className="text-4xl font-extrabold text-[#1b3f7a] tracking-tight">
                {fmt(wallet.available)}
              </span>
              <span className="text-xs text-gray-300 self-end mb-1.5 ml-1 tracking-wider">
                {wallet.currency}
              </span>
            </div>

            <div className="h-px bg-gray-100 my-5" />

            <div className="flex flex-col gap-2.5">
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <TrendingUp size={12} />
                <span>Total ganado</span>
                <span className="ml-auto text-gray-600 font-medium text-[0.78rem]">
                  ${fmt(wallet.total_earned)}
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <ArrowUpRight size={12} />
                <span>Total retirado</span>
                <span className="ml-auto text-gray-600 font-medium text-[0.78rem]">
                  ${fmt(wallet.total_withdrawn)}
                </span>
              </div>
            </div>
          </div>

          {/* Columna derecha */}
          <div className="flex flex-col gap-3">

            {/* CLABE strip */}
            <div className="flex items-center justify-between gap-3 bg-white border border-gray-100 rounded-xl px-5 py-3.5 shadow-sm">
              <div className="flex flex-col gap-1 min-w-0">
                <p className="text-[0.67rem] font-semibold tracking-widest uppercase text-gray-400">CLABE interbancaria</p>
                {clabe ? (
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 size={13} className="text-emerald-500 shrink-0" />
                    <span className="text-xs text-gray-600 truncate">{clabe}</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <XCircle size={13} className="text-orange-400 shrink-0" />
                    <span className="text-xs text-orange-500 font-medium">No registrada aún</span>
                  </div>
                )}
              </div>
              <a href="https://pro.vitahub.mx/mis-datos"
                className="shrink-0 px-4 py-2 bg-[#1b3f7a] text-white rounded-lg text-xs font-semibold hover:bg-[#163264] transition-colors">
                {clabe ? "Editar" : "Agregar"}
              </a>
            </div>

            {/* Solicitud */}
            <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm">
              <h2 className="text-sm font-bold text-gray-900 mb-4">
                Solicitar retiro o crédito
              </h2>

              {pendingExchange && (
                <div className="flex items-start gap-2 text-xs bg-amber-50 text-amber-700 border border-amber-200 rounded-lg px-3 py-2.5 mb-4">
                  <Clock size={13} className="shrink-0 mt-0.5" />
                  <span>Solicitud pendiente por <strong>${fmt(pendingExchange.points_requested)}</strong> — en validación.</span>
                </div>
              )}

              <p className="text-[0.67rem] font-semibold tracking-widest uppercase text-gray-400 mb-2.5">¿Qué querés solicitar?</p>

              <div className="flex flex-col sm:flex-row gap-2.5 mb-5">
                {/* Store credit — primero */}
                <button
                  disabled={!!pendingExchange}
                  onClick={() => setExchangeType("store_credit")}
                  className={`flex-1 flex items-center gap-2.5 p-3 rounded-xl border-[1.5px] text-left transition-all
                    ${exchangeType === "store_credit"
                      ? "border-[#1b3f7a] bg-blue-50 shadow-[0_0_0_3px_rgba(27,63,122,0.08)]"
                      : "border-gray-200 hover:border-[#1b3f7a] hover:bg-blue-50/40"}
                    disabled:opacity-40 disabled:cursor-not-allowed`}
                >
                  <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center shrink-0 text-[#1b3f7a]">
                    <ShoppingBag size={16} />
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <strong className="text-xs font-700 text-gray-900">Crédito en tienda</strong>
                    <span className="text-[0.68rem] text-emerald-600 font-semibold flex items-center gap-1">
                      <Sparkles size={9} /> +5% bonificación
                    </span>
                  </div>
                </button>

                {/* Cash — segundo */}
                <button
                  disabled={!!pendingExchange}
                  onClick={() => setExchangeType("cash")}
                  className={`flex-1 flex items-center gap-2.5 p-3 rounded-xl border-[1.5px] text-left transition-all
                    ${exchangeType === "cash"
                      ? "border-[#1b3f7a] bg-blue-50 shadow-[0_0_0_3px_rgba(27,63,122,0.08)]"
                      : "border-gray-200 hover:border-[#1b3f7a] hover:bg-blue-50/40"}
                    disabled:opacity-40 disabled:cursor-not-allowed`}
                >
                  <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center shrink-0 text-[#1b3f7a]">
                    <Banknote size={16} />
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <strong className="text-xs font-700 text-gray-900">Retirar dinero</strong>
                    <span className="text-[0.68rem] text-gray-400">A tu CLABE</span>
                  </div>
                </button>
              </div>

              {exchangeType && (
                <div className="animate-fadeIn">
                  <label className="block text-xs font-semibold text-gray-500 mb-2">Monto a solicitar</label>
                  <div className={`flex items-stretch border-[1.5px] rounded-xl overflow-hidden mb-3 transition-all focus-within:border-[#1b3f7a] focus-within:shadow-[0_0_0_3px_rgba(27,63,122,0.08)] border-gray-200`}>
                    <span className="px-3 text-sm text-gray-400 bg-gray-50 flex items-center border-r border-gray-100">$</span>
                    <input
                      type="number" min="200" max={wallet.available}
                      value={withdrawAmount}
                      onChange={(e) => setWithdrawAmount(e.target.value)}
                      disabled={!!pendingExchange}
                      placeholder="0.00"
                      className="flex-1 px-3 py-2.5 text-sm font-medium text-gray-900 bg-white outline-none"
                    />
                    <span className="px-3 text-xs text-gray-400 bg-gray-50 flex items-center border-l border-gray-100">{wallet.currency}</span>
                  </div>

                  {exchangeType === "store_credit" && withdrawAmount > 0 && (
                    <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 mb-3 flex flex-col gap-1.5">
                      <div className="flex justify-between text-xs text-gray-500">
                        <span>Monto solicitado</span><span>${fmt(withdrawAmount)}</span>
                      </div>
                      <div className="flex justify-between text-xs text-emerald-600 font-semibold">
                        <span>✦ Bonificación (+5%)</span><span>+${fmt(bonus)}</span>
                      </div>
                      <div className="h-px bg-blue-100 my-0.5" />
                      <div className="flex justify-between text-sm font-semibold text-gray-800">
                        <span>Recibirás en cupón</span>
                        <strong className="text-[#1b3f7a]">${fmt(storeCreditValue)}</strong>
                      </div>
                    </div>
                  )}

                  <button
                    disabled={!withdrawAmount || withdrawing || !!pendingExchange || wallet.available <= 0}
                    onClick={handleExchange}
                    className="w-full py-3 bg-[#1b3f7a] text-white rounded-xl text-sm font-bold hover:bg-[#163264] hover:-translate-y-px transition-all disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed disabled:translate-y-0"
                  >
                    {withdrawing ? "Procesando…" : exchangeType === "cash" ? "Solicitar retiro" : "Solicitar crédito en tienda"}
                  </button>
                </div>
              )}

              {message && (
                <div className={`flex items-start gap-2 text-xs rounded-lg px-3 py-2.5 mt-3 ${noticeStyles[messageType]}`}>
                  {messageType === "success" && <CheckCircle2 size={13} className="shrink-0 mt-0.5" />}
                  {messageType === "error"   && <XCircle size={13} className="shrink-0 mt-0.5" />}
                  {messageType === "info"    && <Clock size={13} className="shrink-0 mt-0.5" />}
                  {message}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ══ FILA 2: Historial + Guías ══ */}
        <div className="grid grid-cols-1 md:grid-cols-[1fr_280px] gap-5 items-start">

          {/* Historial */}
          <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm">
            <h2 className="text-sm font-bold text-gray-900 mb-4">
              Historial de movimientos
            </h2>
            <div className="overflow-y-auto max-h-72 pr-1 scrollbar-thin scrollbar-thumb-gray-200">
              {transactions.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-10 text-gray-300">
                  <CircleDollarSign size={28} strokeWidth={1.5} />
                  <p className="text-xs text-gray-400">Sin movimientos todavía</p>
                </div>
              ) : transactions.map((tx) => (
                <div key={tx.id} className="flex items-start gap-3 py-1 border-b border-gray-50 last:border-0">
                  <div className={`w-2 h-2 rounded-full shrink-0 mt-1.5 ${tx.type === "earning" ? "bg-emerald-400" : "bg-amber-400"}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-700 truncate">{tx.description}</p>
                    <p className="text-[0.66rem] text-gray-300 mt-0.5">
                      {new Date(tx.processed_at).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" })}
                    </p>
                  </div>
                  <span
                    className={`text-xs font-medium shrink-0 ${tx.type === "earning" ? "text-emerald-500" : "text-amber-500"}`}>
                    {tx.type === "earning" ? "+" : "−"}${fmt(tx.amount)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Guías */}
          <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm">
            <h2 className="text-sm font-bold text-gray-900 mb-4">
              Cómo funciona
            </h2>
            <div className="flex flex-col gap-4">

              {[
                { icon: ShieldCheck, title: "Validación de solicitudes", text: "Toda solicitud es revisada por el equipo admin antes de procesarse." },
                { icon: Banknote,    title: "Retiro mínimo $200 MXN",    text: "El monto mínimo para retirar dinero en efectivo es de $200 MXN." },
                { icon: BadgePercent,title: "+5% en crédito de tienda",  text: "Al elegir crédito en tienda recibís un 5% extra sobre el monto en cupón." },
                { icon: Timer,       title: "3 a 5 días hábiles",        text: "Los retiros y créditos aprobados se acreditan dentro de ese plazo." },
              ].map(({ icon: Icon, title, text }) => (
                <div key={title} className="flex items-start gap-3">
                  <div className="w-7 h-7 rounded-lg bg-blue-50 text-[#1b3f7a] flex items-center justify-center shrink-0">
                    <Icon size={14} />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-700 mb-0.5">{title}</p>
                    <p className="text-[0.72rem] text-gray-400 leading-relaxed">{text}</p>
                  </div>
                </div>
              ))}

            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
