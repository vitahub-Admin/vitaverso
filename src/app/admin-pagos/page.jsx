"use client";

import { useEffect, useState } from "react";
import { affiliatesService } from "../services/affiliates";

export default function AdminWalletPage() {
  const [stats, setStats] = useState(null);

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

  /* ============================= */
  /* PLATFORM SETTINGS */
  /* ============================= */
  const [settings, setSettings] = useState({});
  const [settingEdits, setSettingEdits] = useState({});
  const [savingKey, setSavingKey] = useState(null);

  useEffect(() => {
    fetch("/api/admin/settings")
      .then((r) => r.json())
      .then((data) => {
        const map = {};
        (data || []).forEach((s) => { map[s.key] = s; });
        setSettings(map);
        const edits = {};
        (data || []).forEach((s) => { edits[s.key] = String(Math.round(s.value * 100)); });
        setSettingEdits(edits);
      });
  }, []);

  async function saveSetting(key) {
    setSavingKey(key);
    const pct = parseFloat(settingEdits[key]);
    if (isNaN(pct) || pct < 0 || pct > 100) {
      showToast("Valor inválido (0–100)", "error");
      setSavingKey(null);
      return;
    }
    const res = await fetch("/api/admin/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, value: pct / 100 }),
    });
    if (res.ok) {
      const updated = await res.json();
      setSettings((prev) => ({ ...prev, [key]: updated }));
      showToast("Guardado correctamente");
    } else {
      showToast("Error al guardar", "error");
    }
    setSavingKey(null);
  }

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
    fetch('/api/admin/points/exchanges/stats')
      .then(r => r.json())
      .then(d => { if (d.success) setStats(d); });
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


  const handleExport = (type) => {
  window.open(
    `/api/admin/points/exchanges?status=${type}&export=csv`,
    "_blank"
  );
};
  return (
    <div className="p-8">
    
       <div className="w-full bg-[#1b3f7a] rounded-lg p-4 flex flex-col md:flex-row md:justify-between gap-4 mb-6">
        <h1 className="text-3xl md:text-4xl text-white font-lato"> Administración de Wallet</h1>
      </div>

      {/* ── Stats ── */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[
            {
              label: `Total movido (${stats.thisMonth.label})`,
              value: `$${Number(stats.thisMonth.total).toLocaleString('es-MX', { minimumFractionDigits: 0 })}`,
              sub: stats.growth_pct !== null
                ? `${stats.growth_pct >= 0 ? '↑' : '↓'} ${Math.abs(stats.growth_pct)}% vs mes anterior`
                : null,
              subColor: stats.growth_pct >= 0 ? 'text-green-600' : 'text-red-500',
            },
            {
              label: `Total movido (${stats.lastMonth.label})`,
              value: `$${Number(stats.lastMonth.total).toLocaleString('es-MX', { minimumFractionDigits: 0 })}`,
              sub: `${stats.lastMonth.count} operaciones`,
              subColor: 'text-gray-400',
            },
            {
              label: 'Prefieren crédito en tienda',
              value: `${stats.thisMonth.credit_pct}%`,
              sub: `$${Number(stats.thisMonth.store_credit.amount).toLocaleString('es-MX', { minimumFractionDigits: 0 })} · ${stats.thisMonth.store_credit.count} ops`,
              subColor: 'text-blue-500',
            },
            {
              label: 'Prefieren retiro en efectivo',
              value: `${100 - stats.thisMonth.credit_pct}%`,
              sub: `$${Number(stats.thisMonth.cash.amount).toLocaleString('es-MX', { minimumFractionDigits: 0 })} · ${stats.thisMonth.cash.count} ops`,
              subColor: 'text-gray-400',
            },
          ].map(({ label, value, sub, subColor }) => (
            <div key={label} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
              <p className="text-[0.7rem] text-gray-400 font-medium mb-1">{label}</p>
              <p className="text-2xl font-extrabold text-[#1b3f7a] leading-none">{value}</p>
              {sub && <p className={`text-xs mt-1.5 font-medium ${subColor}`}>{sub}</p>}
            </div>
          ))}
        </div>
      )}


      <h2 className="text-xl font-semibold mb-6">
        Gestión de Retiros
      </h2>

      {loadingExchanges ? (
        <p>Cargando retiros...</p>
      ) : (
        <>
      <div className="flex justify-between items-center mb-2">
  <h3 className="font-semibold">
    Solicitudes Pendientes
  </h3>

  {pending.length > 0 && (
    <button
      onClick={() => handleExport("pending")}
      className="px-4 py-2 bg-[#1b3f7a] text-white text-xs rounded-lg hover:opacity-90"
    >
      Exportar CSV
    </button>
  )}
</div>

          {pending.length === 0 ? (
            <p className="mb-8">
              No hay solicitudes pendientes.
            </p>
          ) : (
           <div className="bg-white shadow rounded-xl overflow-hidden mb-10">
  <table className="w-full text-sm">
    <thead className="bg-gray-50 text-left">
      <tr>
        <th className="p-3">ID</th>
        <th className="p-3">Afiliado</th>
        <th className="p-3">Monto</th>
        <th className="p-3">Tipo</th>
        <th className="p-3">Fecha</th>
        <th className="p-3">Acciones</th>
      </tr>
    </thead>

    <tbody>
      {pending.map((ex) => (
        <tr key={ex.id} className="border-t">
          <td className="p-3">{ex.id}</td>

          <td className="p-3">
            {ex.affiliates?.first_name} {ex.affiliates?.last_name}
          </td>

          <td className="p-3 font-semibold">
            ${Number(ex.points_requested).toFixed(2)}
          </td>

          <td className="p-3 font-semibold capitalize">
            {ex.exchange_type === "cash"
              ? "Retiro"
              : "Crédito en tienda"}
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
        <div className="flex justify-between items-center mb-2">
  <h3 className="font-semibold">
    Historial de Retiros
  </h3>

  {history.length > 0 && (
    <button
      onClick={() => handleExport("history")}
      className="px-4 py-2 bg-gray-700 text-white text-xs rounded-lg hover:opacity-90"
    >
      Exportar CSV
    </button>
  )}
</div>
          {history.length === 0 ? (
            <p>No hay historial todavía.</p>
          ) : (
            <div className="bg-white shadow rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-left">
      <tr>
        <th className="p-3">ID</th>
        <th className="p-3">Afiliado</th>
        <th className="p-3">Monto</th>
        <th className="p-3">Tipo</th>
        <th className="p-3">Fecha</th>
        <th className="p-3">Estado</th>
      </tr>
    </thead>
                <tbody>
                  {history.map((ex) => (
                    <tr key={ex.id} className="border-t">
                      <td className="p-3">{ex.id}</td>
                      <td className="p-3">
                        {ex.affiliates?.first_name}{" "}
                        {ex.affiliates?.last_name}
                      </td>
                      <td className="p-3 font-semibold">
                        ${Number(ex.points_requested).toFixed(2)}
                      </td>
                      <td className="p-3 font-semibold">
                        {ex.exchange_type}
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

      {/* ===== COMISIONES DE PLATAFORMA ===== */}
      <div className="mt-10">
        <h2 className="text-lg font-bold text-gray-800 mb-1">Comisiones de plataforma</h2>
        <p className="text-sm text-gray-500 mb-4">Valores en porcentaje (%). Los cambios aplican a las próximas transacciones.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[
            {
              key: "booking_commission_rate",
              title: "Comisión sobre booking",
              description: "% que Vitahub retiene de cada cita pagada. El afiliado recibe el resto.",
              icon: "📅",
            },
            {
              key: "store_credit_bonus_rate",
              title: "Bonus store credit",
              description: "% extra que recibe el afiliado cuando elige cobrar en crédito de tienda.",
              icon: "🏪",
            },
          ].map(({ key, title, description, icon }) => (
            <div key={key} className="bg-white border border-gray-200 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-lg">{icon}</span>
                <h3 className="font-semibold text-gray-800 text-sm">{title}</h3>
              </div>
              <p className="text-xs text-gray-400 mb-4">{description}</p>
              <div className="flex items-center gap-3">
                <div className="relative flex-1">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    value={settingEdits[key] ?? ""}
                    onChange={(e) => setSettingEdits((prev) => ({ ...prev, [key]: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">%</span>
                </div>
                <button
                  onClick={() => saveSetting(key)}
                  disabled={savingKey === key}
                  className="px-4 py-2 bg-[#1b3f7a] text-white rounded-lg text-sm font-medium disabled:opacity-60 hover:bg-[#16336a] transition-colors"
                >
                  {savingKey === key ? "..." : "Guardar"}
                </button>
              </div>
              {settings[key] && (
                <p className="text-xs text-gray-400 mt-2">
                  Actual: <span className="font-semibold text-gray-600">{Math.round(settings[key].value * 100)}%</span>
                  {" · "}última modificación: {new Date(settings[key].updated_at).toLocaleDateString("es-AR")}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>

      {toast && (
        <div className={`fixed bottom-4 right-4 px-4 py-2 text-white rounded shadow ${toast.type === "error" ? "bg-red-600" : "bg-green-600"}`}>
          {toast.message}
        </div>
      )}
    </div>
  );
}
