import { AppDataUnavailable } from "@/components/dashboard/AppDataUnavailable";
import { AppShell } from "@/components/dashboard/AppShell";
import { DemoAppProvider } from "@/components/dashboard/DemoAppProvider";
import { DEMO_ENABLED } from "@/lib/demo-flag";

/**
 * Dashboard shell. Every screen under /app reads one AppModel through the provider.
 * Today the only provider is the demo one: every value is a labelled fixture and nothing can move funds.
 * Engineering integration: swap DemoAppProvider for a provider that supplies a real AppModelValue.
 */
export default function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  if (!DEMO_ENABLED) return <AppDataUnavailable />;
  return (
    <DemoAppProvider>
      <AppShell>{children}</AppShell>
    </DemoAppProvider>
  );
}
