"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useCustomer } from "./context/CustomerContext.jsx";

export default function HomePageClient() {
  const { customer } = useCustomer();

  if (!customer) return null;
 
  return (
    <div className="flex flex-col text-right text-[#1b3f7a] text-sm">
    <p>{customer.first_name} {customer.last_name}</p>
    <p className="text-xs">{customer.email}</p>
  </div>
  );
}
