import { redirect } from "next/navigation";

/**
 * Die Pipeline ist seit dem 12.08.2026 die Standardsicht der Arbeitszentrale
 * und hat keine eigene Adresse mehr. Die Weiterleitung bleibt: Lesezeichen,
 * alte Links aus Nachrichtenentwürfen und der Verlauf sollen nicht ins Leere
 * laufen.
 */
export default function PipelinePage() {
  redirect("/dashboard");
}
