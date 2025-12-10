"use client";
import { useCustomer } from "../context/CustomerContext.jsx";
import BackButton from "./BackButton";
import Image from "next/image";

export default function Header() {
  const { customer, loading } = useCustomer();

  return (
    <header className="w-full bg-[#fafafa] text-[#1b3f7a] flex items-center justify-between px-4 shadow-md">
      <div className="flex gap-4 items-center">
        <BackButton />
        <Image src="/LOGO.png" alt="VITAHUB" width={273} height={80} />
      </div>
      
      <div className="flex flex-col text-right text-[#1b3f7a] text-sm min-w-[200px]">
        {loading ? (
          <>
            <div className="animate-pulse bg-gray-200 h-4 w-32 rounded mb-1"></div>
            <div className="animate-pulse bg-gray-200 h-3 w-24 rounded"></div>
          </>
        ) : customer ? (
          <>
            <p>{customer.first_name} {customer.last_name}</p>
            <p className="text-xs">{customer.email}</p>
          </>
        ) : (
          <p className="text-red-500 text-xs">No autenticado</p>
        )}
      </div>
    </header>
  );
}