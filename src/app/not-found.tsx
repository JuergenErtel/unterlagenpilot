import Link from "next/link";
import { FileQuestion } from "lucide-react";

/** Globale 404-Seite (u.a. für notFound() bei fremden/unbekannten Fällen). */
export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas p-6">
      <div className="max-w-md rounded-lg border bg-card p-8 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <FileQuestion className="h-6 w-6 text-muted-foreground" />
        </div>
        <h1 className="text-lg font-semibold">Seite nicht gefunden</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
          Die aufgerufene Seite oder der Fall existiert nicht oder Sie haben keinen Zugriff darauf.
        </p>
        <Link
          href="/dashboard"
          className="mt-5 inline-block rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          Zum Dashboard
        </Link>
      </div>
    </div>
  );
}
