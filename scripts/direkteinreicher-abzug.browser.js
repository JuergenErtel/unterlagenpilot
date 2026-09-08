/**
 * Abzug der Direkteinreicherinformationen aus dem Europace-Wiki.
 *
 * Laeuft NICHT in Node, sondern in der Browserkonsole eines Tabs, der bei
 * https://europacewiki.zendesk.com angemeldet ist – die Artikel sind ohne
 * Anmeldung unsichtbar (680 statt 5.908 Artikel, ein einziger
 * Direkteinreicher-Artikel). Ganze Datei kopieren, in die Konsole einfuegen,
 * Enter. Ergebnis: Download `europace-direkteinreicher.json`, danach
 *
 *   npx tsx --env-file=.env scripts/direkteinreicher-import.ts data/europace-direkteinreicher.json
 *
 * Die Listen-Schnittstelle liefert den Artikeltext (`body`) gleich mit – ein
 * Durchlauf ueber alle Seiten genuegt, kein Nachladen je Artikel.
 */
(async () => {
  const artikel = [];
  let seite = 1;
  let gesamt = 0;
  for (;;) {
    const r = await fetch(`/api/v2/help_center/de/articles.json?per_page=100&page=${seite}`, {
      credentials: "include",
    });
    if (!r.ok) throw new Error(`Seite ${seite}: HTTP ${r.status}`);
    const j = await r.json();
    gesamt = j.count;
    for (const a of j.articles) {
      if (!/direkteinreicher/i.test(a.title)) continue;
      artikel.push({ artikelId: a.id, titel: a.title, aktualisiert: a.updated_at, body: a.body });
    }
    console.log(`Seite ${seite}/${j.page_count}: ${artikel.length} Direkteinreicher-Artikel bisher`);
    if (!j.next_page) break;
    seite++;
  }
  const abzug = {
    quelle: "Europace-Wiki (Zendesk) – Direkteinreicherinformationen",
    geholtAm: new Date().toISOString().slice(0, 10),
    artikelGesamt: gesamt,
    artikel,
  };
  const blob = new Blob([JSON.stringify(abzug)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "europace-direkteinreicher.json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  console.log(`Fertig: ${artikel.length} Artikel von ${gesamt} gesamt.`);
})();
