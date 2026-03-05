"use client";

import { useEffect, useState } from "react";
import Banner from "../components/Banner";
import axios from "axios";
import { Banknote, ShoppingBag } from "lucide-react";

export default function WalletPage() {
  const [wallet, setWallet] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [exchanges, setExchanges] = useState([]);

  const [loading, setLoading] = useState(true);
  const [withdrawing, setWithdrawing] = useState(false);

  const [message, setMessage] = useState(null);
  const [pendingExchange, setPendingExchange] = useState(null);

  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [exchangeType, setExchangeType] = useState(null);

  const [clabe, setClabe] = useState(null);

  useEffect(() => {
    async function fetchWallet() {
      try {
        const res = await fetch("/api/affiliates/wallet");
        const data = await res.json();

        if (data.success) {
          setWallet(data.wallet);
          setTransactions(data.transactions || []);
        }

        const exRes = await fetch("/api/affiliates/wallet/exchange");
        const exData = await exRes.json();

        if (exData.success) {
          setExchanges(exData.exchanges || []);

          const pending = exData.exchanges.find(
            (ex) => ex.status === "pending"
          );

          setPendingExchange(pending || null);
        }
      } catch (err) {
        console.error("Error loading wallet:", err);
      } finally {
        setLoading(false);
      }
    }

    const getClabe = async () => {
      try {
        const response = await axios.get("/api/affiliates/clabe");

        if (response.data.success) {
          setClabe(response.data.clabe_interbancaria);
        }
      } catch (error) {
        console.error("Error loading clabe:", error);
      }
    };

    fetchWallet();
    getClabe();
  }, []);

  if (loading) {
    return (
      <div className="p-8">
        <p>Cargando wallet...</p>
      </div>
    );
  }

  if (!wallet) {
    return (
      <div className="p-8">
        <p>No se pudo cargar la información.</p>
      </div>
    );
  }

  const handleExchange = async () => {
    const amount = Number(withdrawAmount);

    if (!exchangeType) {
      setMessage("Selecciona un tipo de solicitud");
      return;
    }

    if (!amount || amount <= 0) {
      setMessage("Ingresa un monto válido");
      return;
    }

    if (amount > wallet.available) {
      setMessage("No tienes saldo suficiente");
      return;
    }

    if (pendingExchange) {
      setMessage("Ya tienes una solicitud pendiente");
      return;
    }

    if (exchangeType === "cash" && !clabe) {
      setMessage("Debes registrar una CLABE para retirar dinero");
      return;
    }

    try {
      setWithdrawing(true);
      setMessage(null);

      const res = await fetch("/api/affiliates/wallet/exchange", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          points_requested: amount,
          exchange_type: exchangeType,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data?.message || "Error al solicitar");
      }

      setMessage("Solicitud enviada correctamente ✅");
      setWithdrawAmount("");
      setExchangeType(null);

      const exRes = await fetch("/api/affiliates/wallet/exchange");
      const exData = await exRes.json();

      if (exData.success) {
        setExchanges(exData.exchanges);

        const pending = exData.exchanges.find(
          (ex) => ex.status === "pending"
        );

        setPendingExchange(pending || null);
      }
    } catch (err) {
      setMessage(err?.message || "Error inesperado");
    } finally {
      setWithdrawing(false);
    }
  };

  const storeCreditValue =
  exchangeType === "store_credit" && withdrawAmount
    ? Number(withdrawAmount) * 1.05
    : 0;

  return (
    <div className="flex flex-col items-center p-4">
      <Banner youtubeVideoUrl="https://www.youtube.com/watch?v=mSYOgM052PM" />

      <div className="w-full bg-[#1b3f7a] rounded-lg p-4 mb-6">
        <h1 className="text-3xl md:text-4xl text-white font-lato">
          Mi Wallet
        </h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* BALANCE */}
        <div className="bg-white shadow rounded-2xl p-6">
          <h2 className="text-lg font-semibold mb-4">Saldo disponible</h2>

          <p className="text-4xl font-bold text-green-600">
            ${Number(wallet.available).toFixed(2)} {wallet.currency}
          </p>

          <div className="mt-6 text-sm text-gray-500 space-y-1">
            <p>Total ganado: ${Number(wallet.total_earned).toFixed(2)}</p>
            <p>Total retirado: ${Number(wallet.total_withdrawn).toFixed(2)}</p>
          </div>
        </div>

        {/* HISTORIAL */}
        <div className="bg-white shadow rounded-2xl p-6">
          <h2 className="text-lg font-semibold mb-4">Historial</h2>

          <div className="space-y-3 max-h-80 overflow-y-auto pr-2">

            {transactions.length === 0 && (
              <p className="text-sm text-gray-500">
                No hay movimientos todavía.
              </p>
            )}

            {transactions.map((tx) => (
              <div
                key={tx.id}
                className="border-b pb-2 text-sm flex justify-between"
              >
                <div>
                  <p className="font-medium">{tx.description}</p>
                  <p className="text-gray-400 text-xs">
                    {new Date(tx.processed_at).toLocaleDateString()}
                  </p>
                </div>

                <div
                  className={`font-semibold ${
                    tx.type === "earning"
                      ? "text-green-600"
                      : "text-red-600"
                  }`}
                >
                  {tx.type === "earning" ? "+" : "-"}$
                  {Number(tx.amount).toFixed(2)}
                </div>
              </div>
            ))}

          </div>
        </div>

        {/* SOLICITUD */}
        <div className="bg-white shadow rounded-2xl p-6">

          <p className="text-sm text-gray-400">
            Chequea tu CLABE antes de solicitar un retiro
          </p>

          <div className="mb-4 p-3 rounded-lg bg-gray-50 border text-sm">
            <div className="flex justify-between items-start">
              <div>
                <p className="font-medium text-gray-700 mb-1">
                  CLABE interbancaria
                </p>

                {clabe ? (
                  <p className="text-[#1b3f7a] font-semibold">
                    {clabe}
                  </p>
                ) : (
                  <p className="text-red-600">
                    No ingresaste aún tu CLABE interbancaria.
                  </p>
                )}
              </div>

              <a
                href="https://pro.vitahub.mx/mis-datos"
                className="ml-4 px-4 py-2 bg-[#1b3f7a] text-white rounded-lg text-xs font-semibold"
              >
                {clabe ? "Editar" : "Agregar"}
              </a>
            </div>
          </div>

          <h2 className="text-lg font-semibold mb-4">
            Solicitar retiro o crédito
          </h2>

          {pendingExchange && (
            <div className="mb-4 p-3 rounded-lg bg-yellow-100 text-yellow-800 text-sm">
              Tienes una solicitud pendiente por $
              {Number(pendingExchange.points_requested).toFixed(2)}.
              <br />
              No puedes generar otra hasta que sea procesada.
            </div>
          )}

          <p className="text-sm text-gray-600 mb-3">
            ¿Qué deseas solicitar?
          </p>

          <div className="space-y-2 mb-4">

            <button
              disabled={!!pendingExchange}
              onClick={() => setExchangeType("cash")}
              className={`w-full p-3 rounded-lg border flex items-center gap-2 ${
                exchangeType === "cash"
                  ? "bg-[#1b3f7a] text-white"
                  : "bg-gray-50"
              }`}
            >
              <Banknote size={18} />
              <span>Retirar dinero</span>
            </button>

            <button
              disabled={!!pendingExchange}
              onClick={() => setExchangeType("store_credit")}
              className={`w-full p-3 rounded-lg border flex items-center gap-2 ${
                exchangeType === "store_credit"
                  ? "bg-[#1b3f7a] text-white"
                  : "bg-gray-50"
              }`}
            >
              <ShoppingBag size={18}/>
              <span>Crédito en tienda (+5% de bonificación)</span>
            </button>

          </div>

          {exchangeType && (
            <>
              <input
                type="number"
                min="1"
                max={wallet.available}
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(e.target.value)}
                disabled={!!pendingExchange}
                placeholder="Monto"
                className="w-full border rounded-lg px-3 py-2 mb-4"
              />
              {exchangeType === "store_credit" && withdrawAmount > 0 && (
                <>
                  <p className="text-sm text-gray-500">
    Recibirás un cupón de <span className="font-semibold text-green-600">
      ${storeCreditValue.toFixed(2)}
    </span> 
    </p>
    <p  className="text-sm text-gray-500 mb-4">para usar en la tienda.
  </p>
                </>

)}

              <button
                disabled={
                  !withdrawAmount ||
                  withdrawing ||
                  !!pendingExchange ||
                  wallet.available <= 0
                }
                onClick={handleExchange}
                className="w-full py-3 rounded-xl font-semibold bg-[#1b3f7a] text-white disabled:bg-gray-300 disabled:text-gray-500"
              >
                {withdrawing
                  ? "Procesando..."
                  : exchangeType === "cash"
                  ? "Solicitar retiro"
                  : "Solicitar crédito en tienda"}
              </button>
            </>
          )}
          

          {message && (
            <p className="mt-3 text-sm text-center text-gray-600">
              {message}
            </p>
          )}

        </div>

      </div>
    </div>
  );
}