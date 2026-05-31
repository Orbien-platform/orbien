import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";

export default function Home() {
  return (
    <>
      <Header />
      <main className="flex flex-1 flex-col items-center justify-center gap-4 py-32 px-6 text-center">
        <span className="text-xs font-medium uppercase tracking-[0.1em] text-ghost">
          Fundação · placeholder
        </span>
        <h1 className="text-4xl font-light tracking-tight text-ink max-w-lg">
          Gestão que serve.{" "}
          <span className="font-semibold text-navy">Igreja que cresce.</span>
        </h1>
        <p className="text-base font-light text-stone max-w-md">
          Site em construção. A fundação está no ar — design system, Header e
          Footer prontos para receber conteúdo real.
        </p>
      </main>
      <Footer />
    </>
  );
}
