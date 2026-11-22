import { Logo } from "@/components/ui/Logo";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="flex min-h-dvh items-start justify-center bg-surface sm:items-center sm:py-10">
      <div className="w-full max-w-md bg-white px-6 pb-10 pt-8 sm:rounded-3xl sm:border sm:border-line sm:shadow-[var(--shadow-card)]">
        <div className="mb-2 flex justify-end"><Logo size="sm" /></div>
        {children}
      </div>
    </main>
  );
}
