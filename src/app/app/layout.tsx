import { connection } from "next/server";
import { AppDataUnavailable } from "@/components/dashboard/AppDataUnavailable";
import { AppShell } from "@/components/dashboard/AppShell";
import { DemoAppProvider } from "@/components/dashboard/DemoAppProvider";
import { LiveAppProvider } from "@/features/dashboard/LiveAppProvider";
import { DEMO_ENABLED } from "@/lib/demo-flag";

/**
 * QEVRA_APP_MODE chooses one provider at request time. Live errors never fall back to demo data.
 */
export default async function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  await connection();
  const mode = process.env.QEVRA_APP_MODE;
  if (mode === "live") {
    return (
      <LiveAppProvider>
        <AppShell>{children}</AppShell>
      </LiveAppProvider>
    );
  }
  if ((mode === "demo" || !mode) && DEMO_ENABLED) {
    return (
      <DemoAppProvider>
        <AppShell>{children}</AppShell>
      </DemoAppProvider>
    );
  }
  return <AppDataUnavailable />;
}
