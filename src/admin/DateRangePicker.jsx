import React from "react";
import { Calendar } from "lucide-react";

const COLORS = { cream: "#f5ebdd", gold: "#D4AF37" };

const inputStyle = {
  borderRadius: 8, border: "1px solid rgba(245,235,221,0.15)",
  background: "rgba(245,235,221,0.05)", color: COLORS.cream, padding: "6px 10px", fontSize: 13, outline: "none",
  colorScheme: "dark",
};

// Default range every consumer of this picker starts with — the last
// 1 month, matching the backend's own default in app/date_range.py
// (so a page that never touches the picker still shows the same
// window the API would have used anyway).
export function defaultDateRange() {
  const end = new Date();
  const start = new Date();
  start.setMonth(start.getMonth() - 1);
  const toIso = (d) => d.toISOString().slice(0, 10);
  return { startDate: toIso(start), endDate: toIso(end) };
}

export default function DateRangePicker({ startDate, endDate, onChange }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Calendar className="h-4 w-4" style={{ color: COLORS.gold }} />
      <input
        type="date"
        value={startDate}
        max={endDate}
        onChange={(e) => onChange({ startDate: e.target.value, endDate })}
        style={inputStyle}
      />
      <span className="text-xs" style={{ color: "rgba(245,235,221,0.5)" }}>to</span>
      <input
        type="date"
        value={endDate}
        min={startDate}
        onChange={(e) => onChange({ startDate, endDate: e.target.value })}
        style={inputStyle}
      />
    </div>
  );
}
