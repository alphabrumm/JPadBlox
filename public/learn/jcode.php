<?php
/*
 * JPad: JCodes auflösen.
 *
 *   jcode.php?code=H88HF   →  {"path":"10/JPad-Schafkonstruktor.json"}   (404 + {"error":…}, wenn unbekannt)
 *   jcode.php              →  Übersicht aller Lernprojekte mit ihren Codes (für die Lehrkraft)
 *
 * Gesucht wird in den Ordnern 9 … 13 neben dieser Datei nach .json, .zip und .html.
 * Der Code ist aus dem Pfad berechnet (FNV-1a, 32 Bit, untere 25 Bit als 5 Zeichen) –
 * genau wie in JPad (src/jpad/JCode.ts). Neue Dateien bekommen ihren Code also automatisch.
 */
header('Access-Control-Allow-Origin: *');
header('Cache-Control: no-store');

const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const KLASSEN = [9, 10, 11, 12, 13];

function jcode($rel) {
    $h = 0x811c9dc5;
    foreach (unpack('C*', $rel) as $b) {
        $h ^= $b;
        $h = ($h * 0x01000193) & 0xffffffff;
    }
    $code = '';
    for ($i = 0; $i < 5; $i++) { $code .= ALPHABET[$h & 31]; $h >>= 5; }
    return $code;
}

function dateien() {
    $liste = [];
    foreach (KLASSEN as $k) {
        $dir = __DIR__ . '/' . $k;
        if (!is_dir($dir)) continue;
        foreach (scandir($dir) as $f) {
            if (preg_match('/\.(json|zip|html?)$/i', $f) && is_file("$dir/$f")) $liste[] = "$k/$f";
        }
    }
    return $liste;
}

if (isset($_GET['code'])) {
    header('Content-Type: application/json; charset=utf-8');
    $code = strtoupper(preg_replace('/[\s\-_.]/', '', $_GET['code']));
    foreach (dateien() as $rel) {
        if (jcode($rel) === $code) { echo json_encode(['path' => $rel], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES); exit; }
    }
    http_response_code(404);
    echo json_encode(['error' => 'unbekannt']);
    exit;
}

// Übersicht für die Lehrkraft
header('Content-Type: text/html; charset=utf-8');
$alle = dateien();
$zaehler = array_count_values(array_map('jcode', $alle));
$basis = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off' ? 'https' : 'http') . '://' . $_SERVER['HTTP_HOST'] . dirname(dirname($_SERVER['SCRIPT_NAME']));
$basis = rtrim($basis, '/') . '/';
?><!doctype html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>JCodes</title>
<style>
body { font: 16px -apple-system, system-ui, sans-serif; margin: 24px; color: #1f2430; }
h1 { font-size: 22px; } h2 { font-size: 17px; margin-top: 28px; }
table { border-collapse: collapse; width: 100%; max-width: 900px; }
td, th { text-align: left; padding: 6px 10px; border-bottom: 1px solid #e3e6ee; }
.code { font: 700 18px ui-monospace, Menlo, monospace; letter-spacing: .08em; }
.doppelt { color: #c23b3b; }
a { color: #2f5be0; }
</style></head><body>
<h1>JCodes der Lernprojekte</h1>
<p>Schüler tippen in JPad im Menü auf „Projekt über JCode öffnen“ und geben den Code ein.</p>
<?php foreach (KLASSEN as $k):
    $inKlasse = array_values(array_filter($alle, function ($r) use ($k) { return strpos($r, "$k/") === 0; }));
    if (!$inKlasse) continue; ?>
<h2>Klasse <?= $k ?></h2>
<table><tr><th>JCode</th><th>Datei</th><th>Link</th></tr>
<?php foreach ($inKlasse as $rel): $c = jcode($rel); ?>
<tr><td class="code<?= $zaehler[$c] > 1 ? ' doppelt' : '' ?>"><?= $c ?><?= $zaehler[$c] > 1 ? ' (doppelt – Datei umbenennen!)' : '' ?></td>
<td><?= htmlspecialchars($rel) ?></td>
<td><a href="<?= htmlspecialchars($basis . '?lernpfad=learn/' . rawurlencode($k) . '/' . rawurlencode(basename($rel))) ?>">öffnen</a></td></tr>
<?php endforeach; ?>
</table>
<?php endforeach; ?>
</body></html>
