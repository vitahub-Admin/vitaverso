"use client";

import { useEffect, useState } from "react";
import { affiliatesService } from "../services/affiliates";

export default function AdminWalletPage() {
  const [pending, setPending] = useState([]);
  const [history, setHistory] = useState([]);
  const [loadingExchanges, setLoadingExchanges] = useState(true);

  const [transactions, setTransactions] = useState([]);
  const [loadingTransactions, setLoadingTransactions] = useState(false);

  const [processingId, setProcessingId] = useState(null);
  const [toast, setToast] = useState(null);

  /* ============================= */
  /* AFILIADOS SEARCH */
  /* ============================= */

  const [affiliates, setAffiliates] = useState([]);
  const [affiliateSearch, setAffiliateSearch] = useState("");
  const [selectedAffiliate, setSelectedAffiliate] = useState(null);
  const [searching, setSearching] = useState(false);

  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustType, setAdjustType] = useState("IN");
  const [adjustNote, setAdjustNote] = useState("");
  const [adjusting, setAdjusting] = useState(false);

  function showToast(message, type = "success") {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }

  /* ============================= */
  /* FETCH EXCHANGES */
  /* ============================= */

  async function fetchExchanges() {
    try {
      setLoadingExchanges(true);

      const [pendingRes, historyRes] = await Promise.all([
        fetch(`/api/admin/points/exchanges?status=pending`),
        fetch(`/api/admin/points/exchanges?status=history`),
      ]);

      const pendingData = await pendingRes.json();
      const historyData = await historyRes.json();

      if (pendingData.success) setPending(pendingData.exchanges || []);
      if (historyData.success) setHistory(historyData.exchanges || []);
    } catch {
      showToast("Error cargando retiros", "error");
    } finally {
      setLoadingExchanges(false);
    }
  }

  /* ============================= */
  /* FETCH MANUAL TRANSACTIONS */
  /* ============================= */

  async function fetchTransactions() {
    try {
      setLoadingTransactions(true);

      const res = await fetch(
        "/api/admin/points/transactions?category=manual"
      );
      const data = await res.json();

      if (data.success) {
        setTransactions(data.data || []);
      }
    } catch {
      showToast("Error cargando ajustes manuales", "error");
    } finally {
      setLoadingTransactions(false);
    }
  }

  useEffect(() => {
    fetchExchanges();
    fetchTransactions();
  }, []);

  /* ============================= */
  /* SEARCH AFILIADOS */
  /* ============================= */

  useEffect(() => {
    const delay = setTimeout(async () => {
      if (!affiliateSearch || affiliateSearch.length < 2) {
        setAffiliates([]);
        return;
      }

      try {
        setSearching(true);

        const result = await affiliatesService.getAll({
          search: affiliateSearch,
          searchField: "all",
          limit: 15,
          status: "",
        });

        if (result.success) {
          setAffiliates(result.data || []);
        }
      } finally {
        setSearching(false);
      }
    }, 400);

    return () => clearTimeout(delay);
  }, [affiliateSearch]);

  /* ============================= */
  /* MANUAL ADJUST */
  /* ============================= */

  const handleManualAdjust = async () => {
    if (!selectedAffiliate || !adjustAmount || !adjustNote) {
      showToast("Completa todos los campos", "error");
      return;
    }

    try {
      setAdjusting(true);

      const amountNumber = Number(adjustAmount);
      if (isNaN(amountNumber) || amountNumber <= 0) {
        showToast("Monto inválido", "error");
        return;
      }

      const finalAmount =
        adjustType === "IN" ? amountNumber : -amountNumber;

      const res = await fetch("/api/admin/points/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          affiliateId: selectedAffiliate.shopify_customer_id,
          amount: finalAmount,
          note: adjustNote,
        }),
      });

      const data = await res.json();

      if (!data.success) {
        showToast(data.message || "Error", "error");
        return;
      }

      showToast("Ajuste aplicado correctamente");

      setAdjustAmount("");
      setAdjustNote("");
      setAffiliateSearch("");
      setSelectedAffiliate(null);
      setAffiliates([]);

      fetchTransactions();
    } finally {
      setAdjusting(false);
    }
  };

  /* ============================= */
  /* APPROVE / REJECT */
  /* ============================= */

  const handleApprove = async (id) => {
    try {
      setProcessingId(id);

      const res = await fetch(
        `/api/admin/points/exchanges/${id}/approve`,
        { method: "POST" }
      );

      const data = await res.json();

      if (!data.success) {
        showToast("Error aprobando", "error");
        return;
      }

      showToast("Retiro aprobado correctamente");
      fetchExchanges();
      fetchTransactions();
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (id) => {
    const note = prompt("Motivo del rechazo:");
    if (!note) return;

    try {
      setProcessingId(id);

      const res = await fetch(
        `/api/admin/points/exchanges/${id}/reject`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ admin_note: note }),
        }
      );

      const data = await res.json();

      if (!data.success) {
        showToast("Error rechazando", "error");
        return;
      }

      showToast("Retiro rechazado correctamente");
      fetchExchanges();
    } finally {
      setProcessingId(null);
    }
  };

  /* ============================= */
  /* RENDER */
  /* ============================= */

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-10">
        Administración de Wallet
      </h1>

      {/* ====================================================== */}
      {/* ================= GESTIÓN DE RETIROS ================= */}
      {/* ====================================================== */}

      <h2 className="text-xl font-semibold mb-6">
        Gestión de Retiros
      </h2>

      {loadingExchanges ? (
        <p>Cargando retiros...</p>
      ) : (
        <>
          {/* PENDIENTES */}
          <h3 className="font-semibold mb-2">
            Solicitudes Pendientes
          </h3>

          {pending.length === 0 ? (
            <p className="mb-8">
              No hay solicitudes pendientes.
            </p>
          ) : (
            <div className="bg-white shadow rounded-xl overflow-hidden mb-10">
              <table className="w-full text-sm">
                <tbody>
                  {pending.map((ex) => (
                    <tr key={ex.id} className="border-t">
                      <td className="p-3">{ex.id}</td>
                      <td className="p-3">
                        {ex.affiliate?.first_name}{" "}
                        {ex.affiliate?.last_name}
                      </td>
                      <td className="p-3 font-semibold">
                        ${Number(ex.points_requested).toFixed(2)}
                      </td>
                      <td className="p-3">
                        {new Date(ex.requested_at).toLocaleDateString("es-AR")}
                      </td>
                      <td className="p-3 space-x-2">
                        <button
                          onClick={() => handleApprove(ex.id)}
                          disabled={processingId === ex.id}
                          className="px-3 py-1 bg-green-600 text-white rounded"
                        >
                          Aprobar
                        </button>
                        <button
                          onClick={() => handleReject(ex.id)}
                          disabled={processingId === ex.id}
                          className="px-3 py-1 bg-red-600 text-white rounded"
                        >
                          Rechazar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* HISTORIAL */}
          <h3 className="font-semibold mb-2">
            Historial de Retiros
          </h3>

          {history.length === 0 ? (
            <p>No hay historial todavía.</p>
          ) : (
            <div className="bg-white shadow rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <tbody>
                  {history.map((ex) => (
                    <tr key={ex.id} className="border-t">
                      <td className="p-3">{ex.id}</td>
                      <td className="p-3">
                        {ex.affiliate?.first_name}{" "}
                        {ex.affiliate?.last_name}
                      </td>
                      <td className="p-3 font-semibold">
                        ${Number(ex.points_requested).toFixed(2)}
                      </td>
                      <td className="p-3">
                        {new Date(
                          ex.processed_at || ex.requested_at
                        ).toLocaleDateString("es-AR")}
                      </td>
                      <td className="p-3 capitalize">
                        {ex.status}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      <hr className="my-16 border-t-2 border-gray-200" />

      {/* ====================================================== */}
      {/* ================= AJUSTES MANUALES =================== */}
      {/* ====================================================== */}

      <h2 className="text-xl font-semibold mb-6">
        Gestión Manual de Wallet
      </h2>

      {/* FORMULARIO */}
      <div className="bg-white shadow rounded-xl p-4 mb-10">
        <div className="flex gap-3 items-end">
          <div className="w-[40%] relative">
            <label className="text-xs font-medium">
              Buscar afiliado
            </label>

            <input
              type="text"
              value={affiliateSearch}
              onChange={(e) => {
                setAffiliateSearch(e.target.value);
                setSelectedAffiliate(null);
              }}
              className="w-full border rounded p-2 text-sm"
              placeholder="Nombre o email..."
            />

            {affiliateSearch && !selectedAffiliate && (
              <div className="absolute bg-white border w-full max-h-48 overflow-y-auto shadow z-20 text-sm">
                {searching && (
                  <div className="p-2 text-gray-500">
                    Buscando...
                  </div>
                )}

                {!searching &&
                  affiliates.map((a) => (
                    <div
                      key={a.shopify_customer_id}
                      onClick={() => {
                        setSelectedAffiliate(a);
                        setAffiliateSearch(
                          `${a.first_name} ${a.last_name}`
                        );
                      }}
                      className="px-2 py-1 hover:bg-gray-100 cursor-pointer"
                    >
                      {a.first_name} {a.last_name}
                    </div>
                  ))}
              </div>
            )}
          </div>

          <div className="w-[15%]">
            <label className="text-xs font-medium">Tipo</label>
            <select
              value={adjustType}
              onChange={(e) => setAdjustType(e.target.value)}
              className="w-full border rounded p-2 text-sm"
            >
              <option value="IN">+</option>
              <option value="OUT">-</option>
            </select>
          </div>

          <div className="w-[20%]">
            <label className="text-xs font-medium">Monto</label>
            <input
              type="number"
              value={adjustAmount}
              onChange={(e) => setAdjustAmount(e.target.value)}
              className="w-full border rounded p-2 text-sm"
            />
          </div>

          <div className="w-[20%]">
            <label className="text-xs font-medium">Nota</label>
            <input
              type="text"
              value={adjustNote}
              onChange={(e) => setAdjustNote(e.target.value)}
              className="w-full border rounded p-2 text-sm"
            />
          </div>

          <div className="w-[5%]">
            <button
              onClick={handleManualAdjust}
              disabled={adjusting}
              className="w-full bg-blue-600 text-white rounded text-sm py-2"
            >
              OK
            </button>
          </div>
        </div>
      </div>

      {/* HISTORIAL MANUAL */}
      {loadingTransactions ? (
        <p>Cargando ajustes manuales...</p>
      ) : transactions.length === 0 ? (
        <p>No hay ajustes manuales todavía.</p>
      ) : (
        <div className="bg-white shadow rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left">
              <tr>
                <th className="p-3">ID</th>
                <th className="p-3">Afiliado</th>
                <th className="p-3">Monto</th>
                <th className="p-3">Descripción</th>
                <th className="p-3">Fecha</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((tx) => (
                <tr key={tx.id} className="border-t">
                  <td className="p-3">{tx.id}</td>
                  <td className="p-3">
                    {tx.affiliate?.first_name}{" "}
                    {tx.affiliate?.last_name}
                  </td>
                  <td
                    className={`p-3 font-semibold ${
                      tx.direction === "OUT"
                        ? "text-red-600"
                        : "text-green-600"
                    }`}
                  >
                    {tx.direction === "OUT" ? "-" : "+"}
                    {Number(tx.amount).toFixed(2)}
                  </td>
                  <td className="p-3">
                    {tx.description || "-"}
                  </td>
                  <td className="p-3">
                    {new Date(tx.created_at).toLocaleDateString("es-AR")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-4 right-4 px-4 py-2 bg-green-600 text-white rounded shadow">
          {toast.message}
        </div>
      )}
    </div>
  );
}
