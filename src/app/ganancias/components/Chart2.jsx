"use client";

import { useMemo } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";

export default function Chart2({ data }) {
  const topProducts = useMemo(() => {
    const map = {};

    data.forEach((item) => {
      const name = item.line_items_name; // nombre del producto
      const quantity = item.line_items_quantity || 0; // cantidad vendida
      if (!map[name]) map[name] = 0;
      map[name] += quantity;
    });

    return Object.entries(map)
      .map(([name, quantity]) => ({ name, quantity }))
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 4); // top 4
  }, [data]);

  return (
    <div className="w-full h-80">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          layout="vertical"
          data={topProducts}
          margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
        >
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis type="number" />
          <YAxis
            type="category"
            dataKey="name"
            width={250} // ancho extra para nombres largos
          />
          <Tooltip formatter={(value) => `${value} vendidos`} />
          <Bar dataKey="quantity" fill="#1b3f7a" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
