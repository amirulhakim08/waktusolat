import { Brand } from "./Brand";

export function AuthShell({ title, subtitle, children, wide }: { title: string; subtitle?: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-brand-50 to-[#f6f7f5] px-4 py-10">
      <div className="mx-auto mb-8 flex max-w-5xl justify-center"><Brand /></div>
      <main className={`mx-auto rounded-2xl bg-white p-6 shadow-sm ring-1 ring-black/5 sm:p-8 ${wide ? "max-w-3xl" : "max-w-md"}`}>
        <h1 className="text-xl font-semibold text-ink">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-black/60">{subtitle}</p>}
        <div className="mt-6">{children}</div>
      </main>
    </div>
  );
}
