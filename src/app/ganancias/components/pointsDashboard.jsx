"use client";

import { useState, useEffect } from 'react';
import axios from 'axios';

export default function PointsDashboard() {
  const [pointsData, setPointsData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchPoints();
  }, []);

  const fetchPoints = async () => {
    try {
      setLoading(true);
      const response = await axios.get('/api/affiliates/points');
      
      if (response.data.success) {
        setPointsData(response.data);
      } else {
        setError(response.data.message || 'Error al cargar puntos');
      }
    } catch (err) {
      console.error('Error fetching points:', err);
      setError(err.response?.data?.message || err.message || 'Error de conexión');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-4">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-[#1b3f7a]"></div>
        <p className="mt-2 text-gray-600">Cargando puntos...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-700">{error}</p>
        <button 
          onClick={fetchPoints}
          className="mt-2 px-3 py-1 text-sm bg-red-100 text-red-700 rounded hover:bg-red-200"
        >
          Reintentar
        </button>
      </div>
    );
  }

  if (!pointsData) return null;

  const { balance, summary, transactions, conversion_rate = 0.1 } = pointsData;

  return (
    <div className="bg-white rounded-xl shadow-lg p-6 mt-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-[#1b3f7a]">🏆 Mis Puntos</h2>
        <button
          onClick={fetchPoints}
          className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
        >
          Actualizar
        </button>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
          <div className="text-sm text-blue-600 font-medium">Disponibles</div>
          <div className="text-3xl font-bold text-blue-700">
            {balance.available.toLocaleString()} pts
          </div>
          <div className="text-sm text-gray-600 mt-1">
            ≈ ${(balance.available * conversion_rate).toLocaleString('es-MX', { 
              minimumFractionDigits: 2,
              maximumFractionDigits: 2 
            })} MXN
          </div>
        </div>

        <div className="bg-green-50 p-4 rounded-lg border border-green-100">
          <div className="text-sm text-green-600 font-medium">Total Ganados</div>
          <div className="text-3xl font-bold text-green-700">
            {summary.total_earned.toLocaleString()} pts
          </div>
          <div className="text-xs text-gray-500 mt-1">
            Desde tu registro
          </div>
        </div>

        <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
          <div className="text-sm text-gray-600 font-medium">Última Sincronización</div>
          <div className="text-lg font-semibold">
            {balance.last_sync_at 
              ? new Date(balance.last_sync_at).toLocaleDateString('es-MX')
              : 'Nunca'}
          </div>
          <div className="text-xs text-gray-500 mt-1">
            {balance.last_sync_at 
              ? new Date(balance.last_sync_at).toLocaleTimeString('es-MX', { 
                  hour: '2-digit', 
                  minute: '2-digit' 
                })
              : ''}
          </div>
        </div>
      </div>

      {/* Historial */}
      <div className="border-t pt-4">
        <div className="flex justify-between items-center mb-3">
          <h3 className="font-semibold text-gray-700">📋 Historial Reciente</h3>
          <span className="text-xs text-gray-500">
            {transactions.length} movimientos
          </span>
        </div>
        
        {transactions.length === 0 ? (
          <p className="text-gray-500 text-center py-4">No hay movimientos aún</p>
        ) : (
          <div className="space-y-3 max-h-80 overflow-y-auto pr-2">
            {transactions.map((transaction) => (
              <div 
                key={transaction.id} 
                className="flex justify-between items-center py-3 px-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-800">
                      {transaction.description}
                    </span>
                    <span className={`text-xs px-2 py-1 rounded ${
                      transaction.direction === 'IN' 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-red-100 text-red-800'
                    }`}>
                      {transaction.direction === 'IN' ? 'Ingreso' : 'Egreso'}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500 mt-1 flex items-center gap-2">
                    <span>{new Date(transaction.processed_at).toLocaleDateString('es-MX')}</span>
                    <span>•</span>
                    <span>{new Date(transaction.processed_at).toLocaleTimeString('es-MX', { 
                      hour: '2-digit', 
                      minute: '2-digit' 
                    })}</span>
                    {transaction.reference_id && (
                      <>
                        <span>•</span>
                        <span className="font-mono">Ref: {transaction.reference_id}</span>
                      </>
                    )}
                  </div>
                </div>
                
                <div className={`text-lg font-bold ${
                  transaction.direction === 'IN' 
                    ? 'text-green-600' 
                    : 'text-red-600'
                }`}>
                  {transaction.direction === 'IN' ? '+' : ''}{transaction.points}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Información */}
      <div className="mt-6 pt-4 border-t">
        <div className="text-sm text-gray-600 space-y-2">
          <div className="flex items-start gap-2">
            <span>💰</span>
            <span><strong>Valor de los puntos:</strong> 10 puntos = $1 MXN</span>
          </div>
          <div className="flex items-start gap-2">
            <span>⏱️</span>
            <span><strong>Los puntos no expiran</strong> y pueden ser canjeados en cualquier momento</span>
          </div>
          <div className="flex items-start gap-2">
            <span>📞</span>
            <span><strong>Para canjear puntos</strong> contacta a soporte</span>
          </div>
        </div>
      </div>
    </div>
  );
}