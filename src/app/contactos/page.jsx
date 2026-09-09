"use client";

import { useEffect, useState, useMemo } from "react";
import Cookies from "js-cookie";
import { Users, ShoppingBag, TrendingUp } from "lucide-react";
import ContactsSheet from "./components/Contactsheet";
import PageHeader from "../components/PageHeader";

const fmtMXN = (n) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 2 })
    .format(Number(n) || 0);

function StatCard({ icon: Icon, label, value, accent }) {
  return (
    <div className="bg-white border border-[#D0E4EC] rounded-2xl p-4 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-xl bg-[#E6F4F8] flex items-center justify-center">
          <Icon size={16} className="text-[#1E8FA8]" />
        </div>
        <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#5B7A8C]">
          {label}
        </span>
      </div>
      <p className={`text-2xl font-extrabold tabular-nums leading-none ${accent || "text-[#1b3f7a]"}`}>
        {value}
      </p>
    </div>
  );
}

export default function ContactsPage() {
  const [error, setError] = useState("");
  const [contactsData, setContactsData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [customerId, setCustomerId] = useState(null);

  const fetchData = (customerId) => {
    fetch(`/api/google/contacts/${customerId}`)
      .then((res) => {
        if (!res.ok) throw new Error(`Error ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (!data.success) { setError(data.message); return; }
        setContactsData(data.data);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    const customerIdFromCookie = Cookies.get("customerId");
    if (!customerIdFromCookie) {
      setError("No hay customerId disponible");
      setLoading(false);
      return;
    }
    const numericCustomerId = parseInt(customerIdFromCookie);
    setCustomerId(numericCustomerId);
    fetchData(numericCustomerId);
  }, []);

  const totals = useMemo(() => {
    let totalContactos = contactsData.length;
    let totalCarritos = 0;
    let gananciaTotal = 0;

    contactsData.forEach((item) => {
      totalCarritos += item.cantidad_ordenes || 0;
      gananciaTotal += item.ganancia_total || 0;
    });

    return { totalContactos, totalCarritos, gananciaTotal };
  }, [contactsData]);

  if (loading) {
    return (
      <div className="min-h-full bg-[#F7F9FB] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-[#B0C8D4]">
          <div className="w-8 h-8 rounded-full border-[3px] border-[#D0E4EC] border-t-[#1E8FA8] animate-spin" />
          <p className="text-sm">Cargando contactos…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-[#F7F9FB]">
      <PageHeader title="Mis Contactos"
        subtitle="Pacientes que compraron con tus protocolos" />

      <div className="max-w-[960px] mx-auto px-4 sm:px-6 py-6 space-y-6">

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 rounded-2xl px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {/* Resumen */}
        {contactsData.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <StatCard icon={Users}       label="Contactos"      value={totals.totalContactos} />
            <StatCard icon={ShoppingBag} label="Órdenes"        value={totals.totalCarritos} />
            <StatCard icon={TrendingUp}  label="Ganancia total" value={fmtMXN(totals.gananciaTotal)}
              accent="text-[#1E8FA8]" />
          </div>
        )}

        {/* Tabla */}
        {contactsData.length > 0 && customerId ? (
          <div className="bg-white border border-[#D0E4EC] rounded-2xl p-4 overflow-hidden">
            <ContactsSheet data={contactsData} specialistId={customerId} />
          </div>
        ) : (
          !loading && (
            <div className="bg-white border border-[#D0E4EC] rounded-2xl p-10 text-center">
              <Users size={28} className="mx-auto mb-3 text-[#B0C8D4]" strokeWidth={1.5} />
              <p className="text-sm text-[#5B7A8C]">
                {error ? error : "Todavía no tienes contactos"}
              </p>
              <p className="text-xs text-[#B0C8D4] mt-1">
                Aparecen aquí cuando un paciente compra con alguno de tus protocolos
              </p>
            </div>
          )
        )}
      </div>
    </div>
  );
}
