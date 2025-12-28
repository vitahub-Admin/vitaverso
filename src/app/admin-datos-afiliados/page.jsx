// app/admin/affiliates/page.jsx
'use client';

import { useState, useEffect } from 'react';
import { affiliatesService } from '../services/affiliates';
import AffiliatesSearch from './components/AffiliatesSearch';
import AffiliatesTable from './components/AffiliatesTable';

export default function AffiliatesPage() {
  const [affiliates, setAffiliates] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // Cargar datos iniciales
  useEffect(() => {
    fetchAffiliates();
  }, []);
  
  const fetchAffiliates = async (params = {}) => {
    setLoading(true);
    
    try {
      const result = await affiliatesService.getAll({
        page: 1,
        limit: 50,
        ...params
      });
      
      if (result.success) {
        setAffiliates(result.data);
        setMeta(result.meta);
      }
    } catch (error) {
      console.error('Error cargando afiliados:', error);
      // Mostrar error al usuario
    } finally {
      setLoading(false);
    }
  };
  
  const handleEdit = (affiliate) => {
    // Navegar a página de edición
    router.push(`/admin/affiliates/${affiliate.id}`);
  };
  
  const handleDelete = async (affiliate) => {
    if (confirm(`¿${affiliate.status === 'active' ? 'Desactivar' : 'Activar'} a ${affiliate.first_name}?`)) {
      try {
        const newStatus = affiliate.status === 'active' ? 'inactive' : 'active';
        await affiliatesService.changeStatus(affiliate.id, newStatus);
        
        // Actualizar lista
        fetchAffiliates();
        
        alert(`Afiliado ${newStatus === 'active' ? 'activado' : 'desactivado'} exitosamente`);
      } catch (error) {
        alert('Error al cambiar estado: ' + error.message);
      }
    }
  };
  
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Gestión de Afiliados</h1>
      
      {/* Barra de búsqueda y filtros */}
      <AffiliatesSearch 
        onResults={(data, meta) => {
          setAffiliates(data);
          setMeta(meta);
        }}
        onLoading={setLoading}
      />
      
      {/* Estadísticas rápidas */}
      <div className="my-6 grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="text-2xl font-bold">{meta?.pagination?.total || 0}</div>
          <div className="text-gray-600">Total Afiliados</div>
        </div>
        {/* Más estadísticas... */}
      </div>
      
      {/* Tabla de resultados */}
      {loading ? (
        <div className="text-center py-10">Cargando...</div>
      ) : (
        <AffiliatesTable 
          affiliates={affiliates}
          meta={meta}
          onEdit={handleEdit}
          onDelete={handleDelete}
        />
      )}
    </div>
  );
}