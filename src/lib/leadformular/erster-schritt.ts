/**
 * Der Schritt, mit dem das öffentliche Formular beginnt.
 *
 * Eigene Datei statt in `service.ts`: Der Server-Action-Test von
 * `starteAnfrage` mockt `@/lib/leadformular/service` komplett (nur
 * `formularZuSlug` bleibt real) – ein Import derselben Konstante aus jenem
 * Modul würde dort an Vitests strengem Mock-Proxy scheitern ("kein Export
 * definiert"), obwohl `ERSTER_SCHRITT` gar keine Funktion ist, die gemockt
 * werden müsste. `service.ts` re-exportiert die Konstante trotzdem, damit
 * jede andere Stelle sie unverändert von dort beziehen kann.
 */
export const ERSTER_SCHRITT = "finanzierungsart";
