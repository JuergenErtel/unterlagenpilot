import { redirect } from "next/navigation";

/**
 * Die Seite "Verwaltung & Nachverfolgung" ist am 16.10.2026 entfallen: Jürgen
 * fand sie nicht, und Fristen, Bank-Nachforderungen, Wiedervorlagen und
 * Abschlussdaten waren in PROD unbenutzt. Kontaktverlauf und
 * Backoffice-Übergabe stehen jetzt in der Fallakte. Alte Links und
 * Lesezeichen landen dort.
 */
export default async function VerwaltungPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/cases/${id}`);
}
