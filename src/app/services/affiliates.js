
const API_BASE = 'api/admin/affiliates';

/**
 * Servicio para manejar todas las operaciones de afiliados
 */
export const affiliatesService = {
  
  /**
   * Obtener lista de afiliados con filtros
   * @param {Object} params - Parámetros de búsqueda y paginación
   * @returns {Promise}
   */
  async getAll(params = {}) {
    try {
      // Construir query string
      const queryParams = new URLSearchParams();
      
      // Agregar solo los parámetros que tienen valor
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          queryParams.append(key, value);
        }
      });
      
      const queryString = queryParams.toString();
      const url = queryString ? `${API_BASE}?${queryString}` : API_BASE;
      
      const res = await fetch(url);
      
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Error al obtener afiliados');
      }
      
      return await res.json();
      
    } catch (error) {
      console.error('Error en affiliatesService.getAll:', error);
      throw error;
    }
  },
  
  /**
   * Obtener un afiliado por ID
   * @param {string|number} id - ID del afiliado
   * @returns {Promise}
   */
  async getById(id) {
    try {
      const res = await fetch(`${API_BASE}/${id}`);
      
      if (!res.ok) {
        if (res.status === 404) {
          throw new Error('Afiliado no encontrado');
        }
        const error = await res.json();
        throw new Error(error.error || 'Error al obtener afiliado');
      }
      
      return await res.json();
      
    } catch (error) {
      console.error(`Error en affiliatesService.getById(${id}):`, error);
      throw error;
    }
  },
  
  /**
   * Crear un nuevo afiliado
   * @param {Object} data - Datos del afiliado
   * @returns {Promise}
   */
  async create(data) {
    try {
      const res = await fetch(API_BASE, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data)
      });
      
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Error al crear afiliado');
      }
      
      return await res.json();
      
    } catch (error) {
      console.error('Error en affiliatesService.create:', error);
      throw error;
    }
  },
  
  /**
   * Actualizar un afiliado existente
   * @param {string|number} id - ID del afiliado
   * @param {Object} data - Datos a actualizar
   * @returns {Promise}
   */
  async update(id, data) {
    try {
      const res = await fetch(`${API_BASE}/${id}`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data)
      });
      
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Error al actualizar afiliado');
      }
      
      return await res.json();
      
    } catch (error) {
      console.error(`Error en affiliatesService.update(${id}):`, error);
      throw error;
    }
  },
  
  /**
   * Eliminar/desactivar un afiliado
   * @param {string|number} id - ID del afiliado
   * @returns {Promise}
   */
  async delete(id) {
    try {
      const res = await fetch(`${API_BASE}/${id}`, {
        method: 'DELETE'
      });
      
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Error al eliminar afiliado');
      }
      
      return await res.json();
      
    } catch (error) {
      console.error(`Error en affiliatesService.delete(${id}):`, error);
      throw error;
    }
  },
  
  /**
   * Buscar afiliados (alias de getAll con parámetros de búsqueda)
   * @param {string} query - Término de búsqueda
   * @param {Object} options - Opciones adicionales
   * @returns {Promise}
   */
  async search(query, options = {}) {
    return this.getAll({
      search: query,
      searchField: options.searchField || 'all',
      limit: options.limit || 50,
      ...options
    });
  },
  
  /**
   * Obtener estadísticas de afiliados
   * @returns {Promise}
   */
  async getStats() {
    try {
      const res = await fetch(`${API_BASE}/stats`);
      
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Error al obtener estadísticas');
      }
      
      return await res.json();
      
    } catch (error) {
      console.error('Error en affiliatesService.getStats:', error);
      throw error;
    }
  },
  
  /**
   * Cambiar estado de un afiliado
   * @param {string|number} id - ID del afiliado
   * @param {string} status - Nuevo estado ('active', 'inactive', 'pending')
   * @returns {Promise}
   */
  async changeStatus(id, status) {
    return this.update(id, { status });
  },
  
  /**
   * Actualizar cuenta de pacientes
   * @param {string|number} id - ID del afiliado
   * @param {number} patientCount - Nueva cantidad de pacientes
   * @returns {Promise}
   */
  async updatePatientCount(id, patientCount) {
    return this.update(id, { patient_count: patientCount });
  },
  
  /**
   * Exportar afiliados a CSV/Excel
   * @param {Object} filters - Filtros para la exportación
   * @returns {Promise<Blob>}
   */
  async export(filters = {}) {
    try {
      // Obtener todos los datos (sin paginación)
      const params = { ...filters, limit: 10000 };
      const result = await this.getAll(params);
      
      if (!result.success) {
        throw new Error('Error al obtener datos para exportar');
      }
      
      // Convertir a CSV
      const headers = [
        'ID', 'Email', 'Nombre', 'Apellido', 'Teléfono', 'Profesión',
        'Pacientes', 'Estado', 'CLABE', 'Shopify ID', 'Fecha Creación'
      ];
      
      const rows = result.data.map(affiliate => [
        affiliate.id,
        affiliate.email,
        affiliate.first_name || '',
        affiliate.last_name || '',
        affiliate.phone || '',
        affiliate.profession || '',
        affiliate.patient_count || 0,
        affiliate.status,
        affiliate.clabe_interbancaria || '',
        affiliate.shopify_customer_id,
        new Date(affiliate.created_at).toLocaleDateString()
      ]);
      
      const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
      ].join('\n');
      
      // Crear blob para descarga
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      return blob;
      
    } catch (error) {
      console.error('Error en affiliatesService.export:', error);
      throw error;
    }
  },
  
  /**
   * Sincronizar desde Google Sheets (llama a tu webhook de n8n)
   * @returns {Promise}
   */
  async syncFromSheets() {
    try {
      // Esta URL sería tu webhook de n8n que dispara la sincronización
      const syncUrl = process.env.NEXT_PUBLIC_SYNC_WEBHOOK || '/api/sync/affiliates';
      
      const res = await fetch(syncUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Error en sincronización');
      }
      
      return await res.json();
      
    } catch (error) {
      console.error('Error en affiliatesService.syncFromSheets:', error);
      throw error;
    }
  }
};

/**
 * Hook personalizado para React (opcional)
 */
export function useAffiliates() {
  return {
    // Métodos del servicio
    ...affiliatesService,
    
    // Métodos específicos para React con estado
    useStatefulGetAll: () => {
      const [data, setData] = useState(null);
      const [loading, setLoading] = useState(false);
      const [error, setError] = useState(null);
      
      const fetchData = async (params = {}) => {
        setLoading(true);
        setError(null);
        
        try {
          const result = await affiliatesService.getAll(params);
          setData(result);
        } catch (err) {
          setError(err.message);
        } finally {
          setLoading(false);
        }
      };
      
      return { data, loading, error, refetch: fetchData };
    }
  };
}

export default affiliatesService;