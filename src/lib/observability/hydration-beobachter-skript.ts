/**
 * Das Beobachterskript für die Hydration-Diagnose – als Zeichenkette, weil es
 * INLINE im Dokumentkopf stehen muss.
 *
 * Warum nicht in `instrumentation-client.ts`, wo der Rest der Diagnose sitzt:
 * Dort läuft es zu spät. Gemessen am 24.08.2026 im lokalen Entwicklungsbau
 * (erzwungener Mismatch im Kopfbereich): Die Verfälschung geschah bei 381 ms,
 * React meldete den Fehler kurz darauf – die erste Aufzeichnung des dort
 * gestarteten Beobachters datierte auf **1032 ms**. Er hat die Reparatur, um
 * die es geht, vollständig verpasst. Ein Beweismittel, das nach der Tat
 * eintrifft, ist keins.
 *
 * Im Kopf dagegen läuft das Skript beim Parsen – vor jedem Bündel, vor
 * React, vor dem ersten Byte des Körpers. `document.documentElement` steht da
 * bereits, und `subtree: true` fängt alles Weitere ein.
 *
 * Aufgezeichnet werden ausschließlich Tagnamen, Attribut-NAMEN und Zeitpunkte
 * – keine Texte, keine Attributwerte. Derselbe Maßstab wie beim Fingerabdruck
 * (siehe `hydration-diagnose.ts`).
 *
 * Zwei Grenzen halten die Kosten klein: ein Ringpuffer über die letzten 300
 * Meldungen und Schluss nach 20 Sekunden.
 *
 * Warum die LETZTEN und nicht die ersten – auch das ist gemessen: Der
 * Entwicklungsbau des Dashboards erzeugt allein beim Einströmen über 200
 * Meldungen (Teilstücke an ihren Platz schieben, Kommentarmarken, im
 * Entwicklungsbau zusätzlich das Nachladen der Stile). Ein Puffer, der die
 * ersten behält, ist voll, bevor die Hydration überhaupt beginnt. Gebraucht
 * wird das Fenster unmittelbar VOR dem Fehler – und genau dort steht der
 * Bericht, denn er entsteht im Augenblick der Meldung.
 *
 * Alles in try/catch: Ein Fehler in der Diagnose darf niemals die Seite
 * kosten, die sie erklären soll.
 */
export const HYDRATION_BEOBACHTER_SKRIPT = `try{
var a=[];window.__domAenderungen=a;
var t=function(n){var r=[],i=0;for(;i<n.length;i++)r.push(n[i].nodeName);return r};
var o=new MutationObserver(function(m){for(var i=0;i<m.length;i++){
var e=m[i];var z=e.type==="characterData"?e.target.parentElement:e.target;
a.push({art:e.type,ziel:z||null,hinzugefuegt:t(e.addedNodes),entfernt:t(e.removedNodes),attribut:e.attributeName,ms:performance.now()});
if(a.length>300)a.shift()}});
o.observe(document.documentElement,{childList:true,subtree:true,characterData:true,attributes:true});
setTimeout(function(){o.disconnect()},20000)}catch(e){}`;
