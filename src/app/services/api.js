// services/api.js
const API_CONFIG = {
    baseURL: process.env.NEXT_PUBLIC_API_URL || '',
    headers: {
      'Content-Type': 'application/json',
    },
    // Timeout después de 30 segundos
    timeout: 30000
  };
  
  // Interceptor global para manejar errores
  async function handleResponse(response) {
    if (!response.ok) {
      let errorMessage = 'Error en la solicitud';
      
      try {
        const errorData = await response.json();
        errorMessage = errorData.error || errorData.message || errorMessage;
      } catch {
        errorMessage = `Error ${response.status}: ${response.statusText}`;
      }
      
      throw new Error(errorMessage);
    }
    
    return response.json();
  }
  
  // Función para hacer fetch con configuración base
  export async function apiFetch(endpoint, options = {}) {
    const url = `${API_CONFIG.baseURL}${endpoint}`;
    
    const config = {
      ...options,
      headers: {
        ...API_CONFIG.headers,
        ...options.headers,
      }
    };
    
    // Agregar timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_CONFIG.timeout);
    
    try {
      const response = await fetch(url, {
        ...config,
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      return handleResponse(response);
      
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error.name === 'AbortError') {
        throw new Error('La solicitud tardó demasiado tiempo');
      }
      
      throw error;
    }
  }