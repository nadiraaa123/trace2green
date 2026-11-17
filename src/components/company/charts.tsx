"use client";
// Charts follow the dataviz method: one axis, thin marks, recessive grid, tooltip on hover,
// legend for ≥2 series, colors from the validated source pair or the reserved status set.
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CATEGORIES, SOURCE_LABEL, type Source } from "@/lib/kpi";
import { CATEGORY_LABEL } from "@/lib/report";
import { SOURCE_COLOR, STATUS_COLOR } from "./ui";

const AXIS = { stroke: "#a3afc0", fontSize: 11, tickLine: false, axisLine: false } as const;
const TT = { contentStyle: { borderRadius: 12, border: "1px solid #e3e9ef", fontSize: 12 }, cursor: { stroke: "#d1ebe0", strokeWidth: 1 } };

export function TrendChart({ data, sources, unit = "%" }: { data: Record<string, number | string | null>[]; sources: Source[]; unit?: string }) {
  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
          <CartesianGrid stroke="#eef2f6" vertical={false} />
          <XAxis dataKey="label" {...AXIS} />
          <YAxis {...AXIS} domain={unit === "%" ? [0, 100] : ["auto", "auto"]} tickFormatter={(v) => `${v}${unit === "%" ? "%" : ""}`} />
          <Tooltip {...TT} formatter={(v, n) => [v == null ? "—" : `${Number(v).toLocaleString("id-ID", { maximumFractionDigits: 1 })}${unit === "%" ? "%" : ` ${unit}`}`, SOURCE_LABEL[n as Source] ?? n]} />
          {sources.length > 1 && <Legend formatter={(v) => SOURCE_LABEL[v as Source]} iconType="circle" wrapperStyle={{ fontSize: 12 }} />}
          {sources.map((s) => (
            <Line key={s} type="monotone" dataKey={s} stroke={SOURCE_COLOR[s]} strokeWidth={2} dot={{ r: 4, strokeWidth: 2, fill: "#fff" }} activeDot={{ r: 5 }} connectNulls={false} isAnimationActive={false} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ScoreDonut({ counts, title }: { counts: { HIJAU: number; KUNING: number; MERAH: number; none: number }; title?: string }) {
  const data = (["HIJAU", "KUNING", "MERAH", "none"] as const).map((k) => ({ key: k, name: k === "none" ? "Belum Dinilai" : k, value: counts[k] }));
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div className="flex items-center gap-4">
      <div className="relative size-32 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={total ? data : [{ key: "empty", name: "Kosong", value: 1 }]} dataKey="value" innerRadius={42} outerRadius={60} paddingAngle={total ? 2 : 0} stroke="#fff" strokeWidth={2} isAnimationActive={false}>
              {(total ? data : [{ key: "empty" }]).map((d) => <Cell key={d.key} fill={d.key === "empty" ? "#eef2f6" : STATUS_COLOR[d.key as keyof typeof STATUS_COLOR]} />)}
            </Pie>
            {total > 0 && <Tooltip {...TT} formatter={(v, n) => [`${v} laporan`, n]} />}
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-semibold">{total}</span>
          <span className="text-[10px] text-navy-500">{title ?? "laporan"}</span>
        </div>
      </div>
      <ul className="space-y-1.5 text-sm">
        {data.map((d) => (
          <li key={d.key} className="flex items-center gap-2">
            <span className="inline-block size-2.5 rounded-full" style={{ background: STATUS_COLOR[d.key] }} />
            <span className="w-24 text-navy-700">{d.name}</span>
            <span className="font-semibold">{d.value}</span>
            <span className="text-xs text-navy-500">{total ? `${Math.round((d.value / total) * 100)}%` : ""}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Categories on the axis (labels carry identity); one bar per source. Values in kg CO2e. */
export function EmissionBars({ bySource, sources }: { bySource: Record<Source, Record<string, number>>; sources: Source[] }) {
  const data = CATEGORIES.map((c) => ({ label: CATEGORY_LABEL[c].replace(" (BBM/LPG)", "").replace(" pengiriman", ""), ...Object.fromEntries(sources.map((s) => [s, Math.round(bySource[s]?.[c] ?? 0)])) }));
  return (
    <div className="h-60">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }} barGap={2}>
          <CartesianGrid stroke="#eef2f6" horizontal={false} />
          <XAxis type="number" {...AXIS} tickFormatter={(v) => `${(v / 1000).toLocaleString("id-ID", { maximumFractionDigits: 1 })} t`} />
          <YAxis type="category" dataKey="label" {...AXIS} width={92} />
          <Tooltip {...TT} cursor={{ fill: "#f7fafc" }} formatter={(v, n) => [`${Number(v).toLocaleString("id-ID")} kg CO₂e`, SOURCE_LABEL[n as Source]]} />
          {sources.length > 1 && <Legend formatter={(v) => SOURCE_LABEL[v as Source]} iconType="circle" wrapperStyle={{ fontSize: 12 }} />}
          {sources.map((s) => <Bar key={s} dataKey={s} fill={SOURCE_COLOR[s]} radius={[0, 4, 4, 0]} barSize={sources.length > 1 ? 9 : 14} isAnimationActive={false} />)}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
