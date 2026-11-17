import { RoleGate } from "@/components/auth/RoleGate";

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return <RoleGate role="platform_admin">{children}</RoleGate>;
}
