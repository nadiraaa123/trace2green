import { RoleGate } from "@/components/auth/RoleGate";
import { BottomNav } from "@/components/supplier/BottomNav";

export default function SupplierLayout({ children }: LayoutProps<"/s">) {
  return (
    <RoleGate role="supplier">
      <div className="min-h-dvh bg-surface">
        <div className="mx-auto min-h-dvh max-w-md bg-surface px-5 pb-28">{children}</div>
        <BottomNav />
      </div>
    </RoleGate>
  );
}
