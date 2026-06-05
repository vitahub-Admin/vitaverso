"use client";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useParams } from "next/navigation";

export default function BookingConfirmedPage() {
  const { slug } = useParams();
  const params = useSearchParams();
  const orderNumber = params.get("order");

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="max-w-sm w-full bg-white rounded-2xl shadow-sm p-8 text-center">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-xl font-semibold text-gray-900 mb-2">¡Cita confirmada!</h1>
        <p className="text-gray-500 text-sm mb-6">
          Te enviamos un email de confirmación con todos los detalles de tu cita.
          {orderNumber && ` Orden #${orderNumber}.`}
        </p>
        <Link
          href={`/book/${slug}`}
          className="block text-blue-600 text-sm hover:underline"
        >
          Reservar otra cita
        </Link>
      </div>
    </div>
  );
}
