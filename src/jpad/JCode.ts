/**
 * JPadBlox: JCodes – kurze Codes (5 Zeichen, z. B. „H88HF“), mit denen Schüler ein Lernprojekt öffnen.
 *
 * Der Code wird aus dem Pfad der Datei unterhalb von learn/ berechnet, z. B. „10/JPad-Schafkonstruktor.json“
 * (FNV-1a, 32 Bit; die unteren 25 Bit als 5 Zeichen). Er muss also nirgends eingetragen werden: Wer eine
 * Datei in learn/9 … learn/13 legt, hat damit auch ihren Code. Weil sich ein Code nicht zurückrechnen lässt,
 * fragt JPad den Server: learn/jcode.php listet die Dateien und sucht die passende (gleiche Rechnung in PHP).
 * Ohne PHP (z. B. GitHub Pages) dient learn/jcodes.json als Liste { "CODE": "10/Datei.json", … }.
 *
 * Zeichenvorrat ohne leicht verwechselbare Zeichen (kein 0/O, 1/I).
 */

export const JCODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
export const JCODE_LENGTH = 5;

/** Code einer Datei; rel = Pfad unterhalb von learn/, z. B. „10/JPad-Schafkonstruktor.json“ */
export function jcodeOf(rel: string): string {
    let h = 0x811c9dc5;
    for (const b of new TextEncoder().encode(rel)) {
        h ^= b;
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    let code = "";
    for (let i = 0; i < JCODE_LENGTH; i++) { code += JCODE_ALPHABET[h & 31]; h >>>= 5; }
    return code;
}

/** Eingabe vereinheitlichen: Großbuchstaben, ohne Leerzeichen und Bindestriche */
export function normalizeJCode(input: string): string {
    return input.toUpperCase().replace(/[\s\-_.]/g, "");
}

export function jcodeFormatError(code: string): string | null {
    if (code.length == 0) return "Bitte gib den Code ein.";
    if (code.length != JCODE_LENGTH) return `Ein JCode hat genau ${JCODE_LENGTH} Zeichen.`;
    if (/[0O1I]/.test(code)) return "In JCodes kommen 0, O, 1 und I nicht vor. Schau noch einmal genau hin.";
    if ([...code].some(ch => !JCODE_ALPHABET.includes(ch))) return "Der Code enthält ein Zeichen, das es in JCodes nicht gibt.";
    return null;
}

/** Pfad (relativ zu JPad, z. B. „learn/10/JPad-Schafkonstruktor.json“) zum Code suchen */
export async function resolveJCode(code: string): Promise<{ path?: string, error?: string }> {
    const base = new URL("learn/", location.href);
    // 1. PHP auf dem Webspace
    try {
        const r = await fetch(new URL("jcode.php?code=" + encodeURIComponent(code), base), { cache: "no-store" });
        const text = await r.text();
        if (/^\s*\{/.test(text)) {
            const j = JSON.parse(text);
            if (j.path) return { path: "learn/" + j.path };
            if (r.status == 404) return { error: `Zum Code „${code}“ gibt es kein Projekt. Prüfe die Schreibweise.` };
        }
    } catch (e) { /* weiter mit der Liste */ }
    // 2. Feste Liste
    try {
        const r = await fetch(new URL("jcodes.json", base), { cache: "no-store" });
        if (r.ok) {
            const map = await r.json();
            const rel = map[code];
            if (typeof rel == "string") return { path: "learn/" + rel };
            return { error: `Zum Code „${code}“ gibt es kein Projekt. Prüfe die Schreibweise.` };
        }
    } catch (e) { }
    return { error: "Die Liste der Lernprojekte ist gerade nicht erreichbar. Bist du online?" };
}
