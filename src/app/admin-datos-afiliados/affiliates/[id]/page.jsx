"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import axios from "axios";

export default function AffiliateDetailPage() {
  const { id } = useParams();
  const router = useRouter();

  const [affiliate, setAffiliate] = useState(null);
  const [form, setForm] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

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
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">
          Afiliado #{affiliate.id}
        </h1>
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

      {/* Datos */}
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

      {/* Estado rápido */}
      <div className="flex gap-2 pt-2">
        <button
          disabled={saving}
          onClick={() => changeStatus("active")}
          className="px-4 py-2 text-sm bg-green-100 text-green-800 rounded"
        >
          Activar
        </button>
        <button
          disabled={saving}
          onClick={() => changeStatus("inactive")}
          className="px-4 py-2 text-sm bg-red-100 text-red-800 rounded"
        >
          Desactivar
        </button>
      </div>

      {/* Shopify */}
      <div className="border-t pt-4 space-y-2">
        <h2 className="font-medium">Accesos Shopify</h2>

        {affiliate.shopify_customer_id && (
          <a
            href={`https://admin.shopify.com/store/${shopifyStore}/customers/${affiliate.shopify_customer_id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="block text-blue-600 hover:underline"
          >
            Ver cliente en Shopify
          </a>
        )}

        {affiliate.shopify_collection_id && (
          <a
            href={`https://admin.shopify.com/store/${shopifyStore}/collections/${affiliate.shopify_collection_id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="block text-blue-600 hover:underline"
          >
            Ver colección del afiliado
          </a>
        )}
      </div>
    </div>
  );
}

/* ---------- Components ---------- */

function Field({ label, value }) {
  return (
    <div className="border rounded p-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-sm font-medium break-all">
        {value || "—"}
      </p>
    </div>
  );
}

function EditableField({ label, value, editable, onChange }) {
  return (
    <div className="border rounded p-3 space-y-1">
      <p className="text-xs text-gray-500">{label}</p>
      {editable ? (
        <input
          value={value}
          onChange={e => onChange(e.target.value)}
          className="w-full border rounded px-2 py-1 text-sm"
        />
      ) : (
        <p className="text-sm font-medium break-all">
          {value || "—"}
        </p>
      )}
    </div>
  );
}
  