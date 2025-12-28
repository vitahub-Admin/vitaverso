// components/AffiliatesSearch.jsx
'use client';

import { useState, useEffect } from 'react';
import { affiliatesService } from '../../services/affiliates';

export default function AffiliatesSearch({ onResults, onLoading }) {
  const [search, setSearch] = useState('');
  const [searchField, setSearchField] = useState('all');
  const [status, setStatus] = useState('active');
  const [profession, setProfession] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  
  // Debounce para búsqueda
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 500);
    
    return () => clearTimeout(timer);
  }, [search]);
  
  // Ejecutar búsqueda cuando cambian los filtros
  useEffect(() => {
    const fetchAffiliates = async () => {
      if (onLoading) onLoading(true);
      
      try {
        const params = {
          search: debouncedSearch || undefined,
          searchField: debouncedSearch ? searchField : undefined,
          status,
          profession: profession || undefined,
          page: 1,
          limit: 50
        };
        
        const result = await affiliatesService.getAll(params);
        
        if (result.success) {
          onResults(result.data, result.meta);
        }
      } catch (error) {
        console.error('Error buscando afiliados:', error);
      } finally {
        if (onLoading) onLoading(false);
      }
    };
    
    fetchAffiliates();
  }, [debouncedSearch, searchField, status, profession]);
  
  return (
    <div className="space-y-4 p-4 bg-gray-50 rounded-lg">
      <div className="flex flex-col md:flex-row gap-3">
        {/* Campo de búsqueda principal */}
        <div className="flex-1">
          <input
            type="text"
            placeholder="Buscar afiliados por nombre, email, teléfono o ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full px-4 py-2 border rounded-lg"
          />
        </div>
        
        {/* Selector de campo de búsqueda */}
        {search && (
          <select
            value={searchField}
            onChange={(e) => setSearchField(e.target.value)}
            className="px-3 py-2 border rounded-lg"
          >
            <option value="all">Todos los campos</option>
            <option value="name">Solo nombre</option>
            <option value="email">Solo email</option>
            <option value="phone">Solo teléfono</option>
          </select>
        )}
      </div>
      
      {/* Filtros adicionales */}
      <div className="flex flex-wrap gap-3">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="px-3 py-2 border rounded-lg"
        >
          <option value="">Todos los estados</option>
          <option value="active">Activos</option>
          <option value="inactive">Inactivos</option>
          <option value="pending">Pendientes</option>
        </select>
        
        <select
          value={profession}
          onChange={(e) => setProfession(e.target.value)}
          className="px-3 py-2 border rounded-lg"
        >
          <option value="">Todas las profesiones</option>
          <option value="Fisioterapeuta">Fisioterapeuta</option>
          <option value="Nutriólogo">Nutriólogo</option>
          <option value="Coach">Coach</option>
          <option value="Médico">Médico</option>
        </select>
        
        {/* Botón para limpiar filtros */}
        <button
          onClick={() => {
            setSearch('');
            setStatus('active');
            setProfession('');
          }}
          className="px-4 py-2 text-gray-600 border rounded-lg hover:bg-gray-100"
        >
          Limpiar filtros
        </button>
      </div>
    </div>
  );
}