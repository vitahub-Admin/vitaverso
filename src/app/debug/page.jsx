"use client";

import { useEffect } from "react";
import Cookies from "js-cookie";
import { useCustomer } from "../context/CustomerContext.jsx";

export default function DebugPage() {
  const { customer } = useCustomer();

  useEffect(() => {
    console.log("🔍 CustomerContext:", customer);
    console.log("🔐 Cookies:", Cookies.get());
  }, [customer]);

  return (
    <div style={{ padding: "20px", fontFamily: "monospace" }}>
      <h1 style={{ fontSize: "24px", marginBottom: "20px" }}>
        🧪 Debug: Customer Data
      </h1>

      <h2 style={{ marginTop: "20px" }}>📌 Cookies</h2>
      <pre
        style={{
          background: "#f5f5f5",
          padding: "10px",
          borderRadius: "8px",
          overflowX: "auto",
        }}
      >
        {JSON.stringify(Cookies.get(), null, 2)}
      </pre>

      <h2 style={{ marginTop: "20px" }}>📌 CustomerContext</h2>
      <pre
        style={{
          background: "#f5f5f5",
          padding: "10px",
          borderRadius: "8px",
          overflowX: "auto",
        }}
      >
        {JSON.stringify(customer, null, 2)}
      </pre>
    </div>
  );
}
