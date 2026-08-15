import { notFound } from "next/navigation";
import { Logo } from "@/components/brand/logo";
import { ERSTER_SCHRITT, formularZuSlug } from "@/lib/leadformular/service";
import { schrittFinden } from "@/lib/self-disclosure/navigation";
import { EinstiegFormular } from "@/components/anfrage/einstieg-formular";

export const dynamic = "force-dynamic";

export default async function AnfrageEinstieg({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  // Unbekannt und abgeschaltet sehen gleich aus: Wer den Slug erraet, soll
  // nicht erfahren, dass es ihn gibt.
  const formular = await formularZuSlug(slug);
  if (!formular) notFound();

  // Fest "kurz": diese Seite IST der oeffentliche Anfragebogen, es gibt hier
  // noch keinen Link, aus dem sich der Umfang ableiten liesse.
  const schritt = schrittFinden(ERSTER_SCHRITT, {}, "kurz");
  if (!schritt) notFound();

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-8 p-6">
      <Logo />
      <EinstiegFormular
        slug={slug}
        schrittId={schritt.id}
        frage={schritt.schritt.frage}
        felder={schritt.schritt.felder}
      />
      <p className="mt-auto text-xs text-muted-foreground">
        Ihre Angaben werden verschlüsselt übertragen und ausschließlich zur Bearbeitung Ihrer
        Anfrage verwendet. Mehr dazu in der{" "}
        <a href="/datenschutz" className="underline">Datenschutzerklärung</a>.
      </p>
    </main>
  );
}
