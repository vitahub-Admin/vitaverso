"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import axios from "axios";

// Función para formatear fecha
const formatDate = (dateString) => {
  if (!dateString) return "—";
  
  try {
    const date = new Date(dateString);
    
    // Formato: "15 de Enero, 2024 - 14:30"
    const options = { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    };
    
    return date.toLocaleDateString('es-ES', options);
  } catch (error) {
    console.error("Error formateando fecha:", error);
    return dateString || "—";
  }
};

// Función para calcular tiempo desde la creación
const getTimeSince = (dateString) => {
  if (!dateString) return "";
  
  try {
    const created = new Date(dateString);
    const now = new Date();
    const diffMs = now - created;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) {
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      if (diffHours === 0) {
        const diffMinutes = Math.floor(diffMs / (1000 * 60));
        return `Hace ${diffMinutes} minutos`;
      }
      return `Hace ${diffHours} horas`;
    } else if (diffDays === 1) {
      return "Hace 1 día";
    } else if (diffDays < 30) {
      return `Hace ${diffDays} días`;
    } else if (diffDays < 365) {
      const diffMonths = Math.floor(diffDays / 30);
      return `Hace ${diffMonths} ${diffMonths === 1 ? 'mes' : 'meses'}`;
    } else {
      const diffYears = Math.floor(diffDays / 365);
      return `Hace ${diffYears} ${diffYears === 1 ? 'año' : 'años'}`;
    }
  } catch (error) {
    return "";
  }
};

export default function AffiliateDetailPage() {
  const { id } = useParams();
  const router = useRouter();

  const [affiliate, setAffiliate] = useState(null);
  const [form, setForm] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [showBajaModal, setShowBajaModal] = useState(false);
  const [bajaLoading, setBajaLoading] = useState(false);
  const [bajaLog, setBajaLog] = useState(null);

  const shopifyStore = "7798ab-86";

  useEffect(() => {
    if (!id) return;
    fetchAffiliate();
  }, [id]);

  const fetchAffiliate = async () => {
    try {
      setLoading(true);
      const res = await axios.get(`/api/admin/affiliates/${id}`);
      setAffiliate(res.data.data);

      setForm({
        first_name: res.data.data.first_name ?? "",
        last_name: res.data.data.last_name ?? "",
        phone: res.data.data.phone ?? "",
        profession: res.data.data.profession ?? "",
        patient_count: res.data.data.patient_count ?? 0,
        social_media: res.data.data.social_media ?? "",
        status: res.data.data.status,
        clabe_interbancaria: res.data.data.clabe_interbancaria ?? ""
      });
    } catch (err) {
      setError(err.response?.data?.error || "Error cargando afiliado");
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (key, value) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const saveChanges = async () => {
    if (!confirm("¿Guardar cambios del afiliado?")) return;

    try {
      setSaving(true);
      const res = await axios.put(
        `/api/admin/affiliates/${id}`,
        form
      );
      setAffiliate(res.data.data);
      setIsEditing(false);
    } catch (err) {
      alert(err.response?.data?.error || "Error guardando cambios");
    } finally {
      setSaving(false);
    }
  };

  const darDeBaja = async () => {
    try {
      setBajaLoading(true);
      const res = await axios.delete(`/api/admin/affiliates/${id}`);
      setBajaLog(res.data.log);
      setTimeout(() => router.push('/admin-datos-afiliados'), 3000);
    } catch (err) {
      alert(err.response?.data?.error || 'Error al dar de baja');
      setShowBajaModal(false);
    } finally {
      setBajaLoading(false);
    }
  };

  const changeStatus = async (status) => {
    if (!confirm(`¿Cambiar estado a "${status}"?`)) return;

    try {
      setSaving(true);
      const res = await axios.patch(
        `/api/admin/affiliates/${id}`,
        { status }
      );
      setAffiliate(res.data.data);
      setForm(prev => ({ ...prev, status }));
    } catch (err) {
      alert(err.response?.data?.error || "Error cambiando estado");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="p-6">Cargando afiliado…</p>;
  if (error) return <p className="p-6 text-red-600">{error}</p>;
  if (!affiliate) return <p className="p-6">No encontrado</p>;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header con fecha de creación */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">
            Afiliado #{affiliate.id}
          </h1>
          {affiliate.created_at && (
            <div className="mt-1 text-sm text-gray-600">
              <span className="font-medium">Registrado el:</span> {formatDate(affiliate.created_at)}
              {getTimeSince(affiliate.created_at) && (
                <span className="ml-2 text-gray-500">
                  ({getTimeSince(affiliate.created_at)})
                </span>
              )}
            </div>
          )}
        </div>
        <button
          onClick={() => router.back()}
          className="text-sm text-blue-600 hover:underline"
        >
          ← Volver
        </button>
      </div>

      {/* Acciones edición */}
      <div className="flex gap-2">
        {!isEditing ? (
          <button
            onClick={() => setIsEditing(true)}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded"
          >
            Editar afiliado
          </button>
        ) : (
          <>
            <button
              disabled={saving}
              onClick={saveChanges}
              className="px-4 py-2 text-sm bg-green-600 text-white rounded"
            >
              Guardar cambios
            </button>
            <button
              disabled={saving}
              onClick={() => {
                setIsEditing(false);
                fetchAffiliate();
              }}
              className="px-4 py-2 text-sm bg-gray-200 rounded"
            >
              Cancelar
            </button>
          </>
        )}
      </div>

      {/* Sección de información principal */}
      <div className="bg-gray-50 border rounded-lg p-4">
        <h2 className="font-medium mb-3 text-gray-700">Información del Afiliado</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Email" value={affiliate.email} />
          <EditableField
            label="Nombre"
            value={form.first_name}
            editable={isEditing}
            onChange={v => handleChange("first_name", v)}
          />
          <EditableField
            label="Apellido"
            value={form.last_name}
            editable={isEditing}
            onChange={v => handleChange("last_name", v)}
          />
          <EditableField
            label="Teléfono"
            value={form.phone}
            editable={isEditing}
            onChange={v => handleChange("phone", v)}
          />
          <EditableField
            label="Profesión"
            value={form.profession}
            editable={isEditing}
            onChange={v => handleChange("profession", v)}
          />
          <EditableField
            label="CLABE interbancaria"
            value={form.clabe_interbancaria}
            editable={isEditing}
            onChange={v => handleChange("clabe_interbancaria", v)}
          />
          <Field label="Referral ID" value={affiliate.referral_id} />
          <Field label="Estado" value={affiliate.status} />
        </div>
      </div>

      {/* Sección de metadata */}
      <div className="bg-gray-50 border rounded-lg p-4">
        <h2 className="font-medium mb-3 text-gray-700">Información del Sistema</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field 
            label="ID Supabase" 
            value={affiliate.id} 
            copyable={true}
          />
          <Field 
            label="ID Shopify" 
            value={affiliate.shopify_customer_id} 
            copyable={true}
          />
          <Field 
            label="Creado el" 
            value={formatDate(affiliate.created_at)} 
            subtext={getTimeSince(affiliate.created_at)}
          />
          <Field 
            label="Actualizado el" 
            value={formatDate(affiliate.updated_at)} 
            subtext={getTimeSince(affiliate.updated_at)}
          />
          {affiliate.patient_count !== null && affiliate.patient_count !== undefined && (
            <Field 
              label="Cantidad de pacientes" 
              value={affiliate.patient_count} 
            />
          )}
          {affiliate.social_media && (
            <Field 
              label="Redes sociales" 
              value={affiliate.social_media} 
            />
          )}
        </div>
      </div>

      {/* Estado rápido */}
      <div className="flex gap-2 pt-2">
        <button
          disabled={saving}
          onClick={() => changeStatus("active")}
          className="px-4 py-2 text-sm bg-green-100 text-green-800 rounded hover:bg-green-200"
        >
          Activar
        </button>
        <button
          disabled={saving}
          onClick={() => changeStatus("inactive")}
          className="px-4 py-2 text-sm bg-red-100 text-red-800 rounded hover:bg-red-200"
        >
          Desactivar
        </button>
        <button
          disabled={saving}
          onClick={() => changeStatus("pending")}
          className="px-4 py-2 text-sm bg-yellow-100 text-yellow-800 rounded hover:bg-yellow-200"
        >
          Pendiente
        </button>
        <button
          disabled={saving}
          onClick={() => changeStatus("blocked")}
          className="px-4 py-2 text-sm bg-gray-100 text-gray-800 rounded hover:bg-gray-200"
        >
          Bloquear
        </button>
      </div>

      {/* Zona de peligro */}
      <div className="border border-red-200 rounded-lg p-4 bg-red-50">
        <h2 className="font-medium text-red-700 mb-1">Zona de peligro</h2>
        <p className="text-xs text-red-500 mb-3">
          Dar de baja elimina el tag "especialista" en Shopify, borra la colección del afiliado, rechaza retiros pendientes y marca el registro como inactivo. No se puede deshacer fácilmente.
        </p>
        <button
          onClick={() => setShowBajaModal(true)}
          disabled={!!affiliate.deleted_at}
          className="px-4 py-2 text-sm bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {affiliate.deleted_at ? 'Ya dado de baja' : 'Dar de baja del programa'}
        </button>
      </div>

      {/* Modal confirmación baja */}
      {showBajaModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4 shadow-xl">
            {bajaLog ? (
              <>
                <h3 className="text-lg font-semibold text-green-700 mb-3">✅ Afiliado dado de baja</h3>
                <ul className="text-sm space-y-1 mb-4">
                  {bajaLog.map((entry, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <span>{entry.ok || entry.count >= 0 ? '✓' : '✗'}</span>
                      <span className="text-gray-600">
                        {entry.action === 'shopify_tag_removed'       && 'Tag "especialista" eliminado de Shopify'}
                        {entry.action === 'shopify_collection_deleted' && 'Colección de Shopify eliminada'}
                        {entry.action === 'exchanges_rejected'         && `${entry.count} retiro(s) pendiente(s) rechazado(s)`}
                        {entry.action === 'soft_deleted'               && 'Registro marcado como inactivo en Supabase'}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-gray-400">Redirigiendo al listado…</p>
              </>
            ) : (
              <>
                <h3 className="text-lg font-semibold text-red-700 mb-2">¿Dar de baja a este afiliado?</h3>
                <p className="text-sm text-gray-700 mb-1">
                  <strong>{affiliate.first_name} {affiliate.last_name}</strong>
                </p>
                <p className="text-sm text-gray-500 mb-4">{affiliate.email}</p>
                <ul className="text-xs text-gray-500 space-y-1 mb-5">
                  <li>• Se quitará el tag "especialista" en Shopify</li>
                  <li>• Se eliminará su colección de Shopify</li>
                  <li>• Los retiros pendientes serán rechazados</li>
                  <li>• El registro quedará marcado como inactivo</li>
                </ul>
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => setShowBajaModal(false)}
                    disabled={bajaLoading}
                    className="px-4 py-2 text-sm bg-gray-100 rounded hover:bg-gray-200"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={darDeBaja}
                    disabled={bajaLoading}
                    className="px-4 py-2 text-sm bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-60"
                  >
                    {bajaLoading ? 'Procesando…' : 'Confirmar baja'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Shopify */}
      <div className="border-t pt-4 space-y-2">
        <h2 className="font-medium">Accesos Shopify</h2>

        {affiliate.shopify_customer_id && (
          <div className="flex items-center gap-2">
            <a
              href={`https://admin.shopify.com/store/${shopifyStore}/customers/${affiliate.shopify_customer_id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-blue-600 hover:underline"
            >
              Ver cliente en Shopify
            </a>
            <button
              onClick={() => navigator.clipboard.writeText(affiliate.shopify_customer_id)}
              className="text-xs text-gray-500 hover:text-gray-700"
              title="Copiar ID"
            >
              📋
            </button>
          </div>
        )}

        {affiliate.shopify_collection_id && (
          <div className="flex items-center gap-2">
            <a
              href={`https://admin.shopify.com/store/${shopifyStore}/collections/${affiliate.shopify_collection_id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-blue-600 hover:underline"
            >
              Ver colección del afiliado
            </a>
            <button
              onClick={() => navigator.clipboard.writeText(affiliate.shopify_collection_id)}
              className="text-xs text-gray-500 hover:text-gray-700"
              title="Copiar ID"
            >
              📋
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- Components Mejorados ---------- */

function Field({ label, value, subtext, copyable = false }) {
  const handleCopy = () => {
    if (copyable && value) {
      navigator.clipboard.writeText(value.toString());
      // Podrías agregar un toast de confirmación aquí
    }
  };

  return (
    <div className="border rounded p-3 bg-white">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium break-all">
          {value || "—"}
        </p>
        {copyable && value && (
          <button
            onClick={handleCopy}
            className="ml-2 text-gray-400 hover:text-gray-600"
            title="Copiar"
          >
            📋
          </button>
        )}
      </div>
      {subtext && (
        <p className="text-xs text-gray-400 mt-1">{subtext}</p>
      )}
    </div>
  );
}

function EditableField({ label, value, editable, onChange }) {
  return (
    <div className="border rounded p-3 space-y-1 bg-white">
      <p className="text-xs text-gray-500">{label}</p>
      {editable ? (
        <input
          value={value}
          onChange={e => onChange(e.target.value)}
          className="w-full border rounded px-2 py-1 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
      ) : (
        <p className="text-sm font-medium break-all">
          {value || "—"}
        </p>
      )}
    </div>
  );
}