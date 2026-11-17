import { RoleGate } from "@/components/auth/RoleGate";

export default function SupplierLayout({ children }: LayoutProps<"/s">) {
  return <RoleGate role="supplier">{children}</RoleGate>;
}
