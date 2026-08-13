"use client";
import { useCustomer } from "../context/CustomerContext.jsx";
import BackButton from "./BackButton";
import Image from "next/image";
import Cookies from "js-cookie";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";

export default function Header() {
  const { customer, loading } = useCustomer();
  const router = useRouter();

  const handleLogout = () => {
    Cookies.remove("customerId");
    Cookies.remove("proJwt");
    router.replace("/");
    setTimeout(() => window.location.reload(), 50);
  };

  return (
    <header className="w-full bg-[#fafafa] text-[#1b3f7a] flex items-center justify-between px-4 shadow-md">
      <div className="flex gap-4 items-center">
        <BackButton />
        <Image src="/LOGO.png" alt="VITAHUB" width={273} height={80} />
      </div>

      <div className="flex items-center gap-3">
        <div className="flex flex-col text-right text-[#1b3f7a] text-sm">
          {loading ? (
            <>
              <div className="animate-pulse bg-gray-200 h-4 w-32 rounded mb-1"></div>
              <div className="animate-pulse bg-gray-200 h-3 w-24 rounded"></div>
            </>
          ) : customer ? (
            <>
              <p className="font-medium">{customer.first_name} {customer.last_name}</p>
              <p className="text-xs text-gray-400">{customer.email}</p>
            </>
          ) : (
            <p className="text-red-500 text-xs">No autenticado</p>
          )}
        </div>

        {customer && (
          <button
            onClick={handleLogout}
            title="Cerrar sesión"
            className="p-2 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors"
          >
            <LogOut size={16} />
          </button>
        )}
      </div>
    </header>
  );
}