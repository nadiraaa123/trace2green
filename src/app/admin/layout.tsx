"use client";
import { Building2, CalendarRange, LayoutDashboard, UserCog, Users } from "lucide-react";
import { RoleGate } from "@/components/auth/RoleGate";
import { InternalShell } from "@/components/internal/InternalShell";

const NAV = [
  { href: "/admin", label: "Ringkasan Platform", icon: LayoutDashboard, exact: true },
  { href: "/admin/pemasok", label: "Pemasok & Siklus", icon: Users },
  { href: "/admin/cs", label: "Tim Customer Success", icon: UserCog },
  { href: "/admin/perusahaan", label: "Perusahaan & Langganan", icon: Building2 },
  { href: "/admin/skenario", label: "Skenario 2027–2031", icon: CalendarRange },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <RoleGate role="platform_admin">
      <InternalShell nav={NAV} workspace="Platform Admin">{children}</InternalShell>
    </RoleGate>
  );
}
