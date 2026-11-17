import { RoleGate } from "@/components/auth/RoleGate";

export default function CompanyLayout({ children }: LayoutProps<"/c">) {
  return <RoleGate role="company_admin">{children}</RoleGate>;
}
