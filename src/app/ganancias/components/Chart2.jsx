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

// helper para truncar texto en máximo 2 líneas
function truncateText(text, maxCharsPerLine = 15, maxLines = 2) {
  if (text == null) return "";
  text = String(text); // <<-- coerción a string
  const words = text.split(/\s+/);

  let lines = [];
  let currentLine = "";

  for (let word of words) {
    if ((currentLine + " " + word).trim().length <= maxCharsPerLine) {
      currentLine = (currentLine + " " + word).trim();
    } else {
      lines.push(currentLine);
      currentLine = word;
    }
    if (lines.length === maxLines) break;
  }

  if (currentLine && lines.length < maxLines) {
    lines.push(currentLine);
  }

  // si todavía quedan palabras sin mostrar, agregamos "..."
  if (words.join(" ").length > lines.join(" ").length) {
    lines[lines.length - 1] += "...";
  }

  return lines.join("\n");
}

// custom tick renderer
const CustomTick = ({ x, y, payload }) => {
  const truncated = truncateText(payload.value, 15, 2);
  return (
    <text
      x={x}
      y={y}
      dy={4}
      textAnchor="end"
      fill="#333"
      fontSize={12}
    >
      {truncated.split("\n").map((line, index) => (
        <tspan key={index} x={x} dy={index === 0 ? 0 : 14}>
          {line}
        </tspan>
      ))}
    </text>
  );
};

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
            tick={<CustomTick />}
          />
          <Tooltip formatter={(value) => `${value} vendidos`} />
          <Bar dataKey="quantity" fill="#1b3f7a" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
