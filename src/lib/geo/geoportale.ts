export interface GeoportalEntry {
  bundesland: string;
  label: string;
  url: string;
}

// Offizielle Geoportale der Länder (Einstiegspunkte für die amtliche
// Liegenschaftskarte/Flurkarte). Stand 2026; bei Bedarf pflegen.
export const BUNDESLAND_GEOPORTALE: GeoportalEntry[] = [
  { bundesland: "Baden-Württemberg", label: "Geoportal BW", url: "https://www.geoportal-bw.de/" },
  { bundesland: "Bayern", label: "BayernAtlas", url: "https://geoportal.bayern.de/bayernatlas/" },
  { bundesland: "Berlin", label: "Geoportal Berlin (FIS-Broker)", url: "https://fbinter.stadt-berlin.de/fb/" },
  { bundesland: "Brandenburg", label: "Geoportal Brandenburg", url: "https://geoportal.brandenburg.de/" },
  { bundesland: "Bremen", label: "Geoportal Bremen", url: "https://geoportal.bremen.de/" },
  { bundesland: "Hamburg", label: "Geoportal Hamburg", url: "https://geoportal-hamburg.de/geoportal/" },
  { bundesland: "Hessen", label: "Geoportal Hessen", url: "https://www.geoportal.hessen.de/" },
  { bundesland: "Mecklenburg-Vorpommern", label: "Geoportal MV", url: "https://www.geoportal-mv.de/" },
  { bundesland: "Niedersachsen", label: "Geoportal Niedersachsen", url: "https://www.geoportal.niedersachsen.de/" },
  { bundesland: "Nordrhein-Westfalen", label: "TIM-online NRW", url: "https://www.tim-online.nrw.de/tim-online2/" },
  { bundesland: "Rheinland-Pfalz", label: "Geoportal RLP", url: "https://www.geoportal.rlp.de/" },
  { bundesland: "Saarland", label: "Geoportal Saarland", url: "https://geoportal.saarland.de/" },
  { bundesland: "Sachsen", label: "Geoportal Sachsen", url: "https://geoportal.sachsen.de/" },
  { bundesland: "Sachsen-Anhalt", label: "Geodatenportal Sachsen-Anhalt", url: "https://www.geodatenportal.sachsen-anhalt.de/" },
  { bundesland: "Schleswig-Holstein", label: "Geoportal SH", url: "https://www.geoportal-sh.de/" },
  { bundesland: "Thüringen", label: "Geoportal Thüringen", url: "https://www.geoportal-th.de/" },
];

export const GEOPORTAL_FALLBACK: GeoportalEntry = {
  bundesland: "Deutschland",
  label: "Geoportal.de (bundesweit)",
  url: "https://www.geoportal.de/",
};

export function geoportalFor(bundesland?: string | null): { entry: GeoportalEntry; isFallback: boolean } {
  if (!bundesland) return { entry: GEOPORTAL_FALLBACK, isFallback: true };
  const norm = bundesland.trim().toLowerCase();
  const found = BUNDESLAND_GEOPORTALE.find((e) => e.bundesland.toLowerCase() === norm);
  return found ? { entry: found, isFallback: false } : { entry: GEOPORTAL_FALLBACK, isFallback: true };
}
