"use client";
import { CalendarRange, LayoutDashboard } from "lucide-react";
import { RoleGate } from "@/components/auth/RoleGate";
import { InternalShell } from "@/components/internal/InternalShell";

const NAV = [
  { href: "/cs", label: "Portofolio Saya", icon: LayoutDashboard, exact: true },
  { href: "/cs/skenario", label: "Proyeksi Model 2027–2031", icon: CalendarRange },
];

export default function CsLayout({ children }: { children: React.ReactNode }) {
  return (
    <RoleGate role="customer_success">
      <InternalShell nav={NAV} workspace="Customer Success">{children}</InternalShell>
    </RoleGate>
  );
}
