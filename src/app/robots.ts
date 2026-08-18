import type { MetadataRoute } from "next";

/**
 * Was Suchmaschinen sehen duerfen.
 *
 * Faellig mit dem oeffentlichen Anfrageformular (15.08.2026): Bis dahin lag
 * alles hinter dem Site-Gate und war ohnehin nicht erreichbar.
 *
 * Gesperrt werden die Strecken, die ihr Geheimnis IM PFAD tragen – ein
 * indizierter Upload- oder Selbstauskunfts-Link waere der Zugang zu den
 * Unterlagen eines fremden Menschen, oeffentlich auffindbar. Dass ein
 * Suchdienst so eine Adresse nur ueber einen Verweis fande, ist kein Trost:
 * Browser-Erweiterungen und Vorschaudienste melden besuchte Adressen weiter.
 *
 * `/anfrage` ist mitgesperrt, aber aus einem anderen Grund: Der oeffentliche
 * Eingang gehoert zu EINER Organisation und ist kein Inhalt der Plattform –
 * er soll ueber den Vermittler gefunden werden, nicht ueber Google.
 *
 * Das Gate selbst (`/gate`) und die API haben in einem Suchindex ebenfalls
 * nichts verloren.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/upload/", "/selbstauskunft/", "/anfrage/", "/api/", "/gate", "/monitoring"],
    },
  };
}
