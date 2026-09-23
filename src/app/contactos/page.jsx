"use client";

import { useEffect, useState, useMemo } from "react";
import Cookies from "js-cookie";
import { Users, ShoppingBag, TrendingUp, Search, X, Send } from "lucide-react";
import ContactsSheet from "./components/Contactsheet";
import PageHeader from "../components/PageHeader";

// Sin acentos ni mayúsculas, para que "maria" encuentre a "María"
const normalizar = (s) =>
  String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const soloDigitos = (s) => String(s || "").replace(/\D/g, "");

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
  const [busqueda, setBusqueda] = useState("");

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
    let totalCarritos = 0;
    let totalCompras  = 0;
    let gananciaTotal = 0;

    contactsData.forEach((item) => {
      totalCarritos += item.cantidad_carritos || 0;
      totalCompras  += item.cantidad_ordenes  || 0;
      gananciaTotal += item.ganancia_total    || 0;
    });

    return { totalContactos: contactsData.length, totalCarritos, totalCompras, gananciaTotal };
  }, [contactsData]);

  // Busca por nombre, apellido y correo; el teléfono se compara solo por dígitos,
  // así "55 1234" encuentra "+5215512345678".
  const contactosFiltrados = useMemo(() => {
    const q = normalizar(busqueda.trim());
    if (!q) return contactsData;
    const qDigitos = soloDigitos(busqueda);
    return contactsData.filter((c) => {
      const texto = normalizar(`${c.nombre_cliente || ""} ${c.apellido_cliente || ""} ${c.email_cliente || ""}`);
      if (texto.includes(q)) return true;
      return qDigitos.length >= 3 && soloDigitos(c.telefono_cliente).includes(qDigitos);
    });
  }, [contactsData, busqueda]);

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
        subtitle="Tus pacientes: a quién le armaste carritos y quién compró" />

      <div className="max-w-[960px] mx-auto px-4 sm:px-6 py-6 space-y-6">

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 rounded-2xl px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {/* Resumen */}
        {contactsData.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard icon={Users}       label="Pacientes"        value={totals.totalContactos} />
            <StatCard icon={Send}        label="Carritos"         value={totals.totalCarritos} />
            <StatCard icon={ShoppingBag} label="Compras"          value={totals.totalCompras} />
            <StatCard icon={TrendingUp}  label="Ganancia total"   value={fmtMXN(totals.gananciaTotal)}
              accent="text-[#1E8FA8]" />
          </div>
        )}

        {/* Tabla */}
        {contactsData.length > 0 && customerId ? (
          <div className="bg-white border border-[#D0E4EC] rounded-2xl p-4 overflow-hidden space-y-4">
            {/* Buscador */}
            <div className="flex items-center gap-2 border border-[#D0E4EC] rounded-xl px-3 py-2.5 focus-within:border-[#1E8FA8] transition-colors">
              <Search size={16} className="text-[#8AAAB8] shrink-0" />
              <input
                type="search"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar por nombre, correo o teléfono"
                aria-label="Buscar contactos"
                className="flex-1 min-w-0 text-sm text-[#1b3f7a] placeholder:text-[#B0C8D4] bg-transparent outline-none"
              />
              {busqueda && (
                <button onClick={() => setBusqueda("")} aria-label="Borrar búsqueda"
                  className="text-[#8AAAB8] hover:text-[#1b3f7a] transition-colors">
                  <X size={16} />
                </button>
              )}
            </div>
            {busqueda.trim() && (
              <p className="text-xs text-[#5B7A8C] -mt-2">
                {contactosFiltrados.length} de {contactsData.length} contactos
              </p>
            )}

            {contactosFiltrados.length > 0 ? (
              <ContactsSheet data={contactosFiltrados} specialistId={customerId} />
            ) : (
              <div className="py-10 text-center">
                <Search size={24} className="mx-auto mb-2 text-[#B0C8D4]" strokeWidth={1.5} />
                <p className="text-sm text-[#5B7A8C]">Ningún contacto coincide con “{busqueda.trim()}”</p>
                <button onClick={() => setBusqueda("")}
                  className="mt-2 text-xs font-semibold text-[#1E8FA8] hover:underline">
                  Ver todos
                </button>
              </div>
            )}
          </div>
        ) : (
          !loading && (
            <div className="bg-white border border-[#D0E4EC] rounded-2xl p-10 text-center">
              <Users size={28} className="mx-auto mb-3 text-[#B0C8D4]" strokeWidth={1.5} />
              <p className="text-sm text-[#5B7A8C]">
                {error ? error : "Todavía no tienes contactos"}
              </p>
              <p className="text-xs text-[#B0C8D4] mt-1">
                Aparecen aquí en cuanto le armas un carrito a un paciente, compre o no
              </p>
            </div>
          )
        )}
      </div>
    </div>
  );
}
