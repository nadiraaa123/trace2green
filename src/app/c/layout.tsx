import { RoleGate } from "@/components/auth/RoleGate";
import { CompanyProvider } from "@/components/company/CompanyContext";
import { CompanyShell } from "@/components/company/Shell";

export default function CompanyLayout({ children }: LayoutProps<"/c">) {
  return (
    <RoleGate role="company_admin">
      <CompanyProvider>
        <CompanyShell>{children}</CompanyShell>
      </CompanyProvider>
    </RoleGate>
  );
}
