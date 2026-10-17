import { EditorView } from "@codemirror/view";
import { StateEffect, Transaction } from "@codemirror/state";

/**
 * Diagnose-Protokoll für Fehler, die nur auf echten Geräten auftreten (z. B. Doppeltipp auf dem
 * iPad im Querformat). Aktiv nur mit „?debug“ in der Adresse. Zeigt die letzten Ereignisse in
 * einem kleinen Kasten oben rechts; „Kopieren“ legt das ganze Protokoll in die Zwischenablage.
 */
export function startDebugLog(view: EditorView) {
    const t0 = performance.now();
    const lines: string[] = [];
    const panel = document.createElement("div");
    panel.className = "jp-debuglog";
    panel.innerHTML = `<div class="jp-debuglog-bar"><b>Diagnose</b>
        <button data-a="copy">Kopieren</button><button data-a="clear">Leeren</button><button data-a="close">×</button></div>
        <pre></pre>`;
    document.body.appendChild(panel);
    const pre = panel.querySelector("pre")!;
    let raf = 0;
    const render = () => { raf = 0; pre.textContent = lines.slice(-60).join("\n"); pre.scrollTop = pre.scrollHeight; };
    const log = (msg: string) => {
        lines.push(((performance.now() - t0) / 1000).toFixed(2).padStart(6) + "  " + msg);
        if (lines.length > 400) lines.shift();
        if (!raf) raf = requestAnimationFrame(render);
    };
    (window as any).__jpadDbg = log;

    panel.addEventListener("click", async e => {
        const a = (e.target as HTMLElement).closest<HTMLElement>("[data-a]")?.dataset.a;
        if (a == "copy") {
            const text = environment() + "\n" + lines.join("\n");
            try { await navigator.clipboard.writeText(text); log("(Protokoll kopiert)"); } catch (err) { log("(Kopieren nicht erlaubt)"); }
        } else if (a == "clear") { lines.length = 0; render(); }
        else if (a == "close") { panel.remove(); (window as any).__jpadDbg = undefined; }
    });

    const environment = () => {
        const vv = window.visualViewport;
        return `Umgebung: ${navigator.userAgent}\nFenster ${innerWidth}×${innerHeight}, Bildschirm ${screen.width}×${screen.height}, ` +
            `VV ${vv ? Math.round(vv.width) + "×" + Math.round(vv.height) + " top " + Math.round(vv.offsetTop) + " scale " + vv.scale.toFixed(2) : "-"}, ` +
            `Layout ${document.querySelector<HTMLElement>(".jp-app")?.dataset.layout}, html.class „${document.documentElement.className}“`;
    };

    const where = (node: Node | null, offset: number): string => {
        if (!node) return "–";
        if (view.contentDOM.contains(node)) {
            try {
                const pos = view.posAtDOM(node, offset);
                const line = view.state.doc.lineAt(pos);
                return `Editor pos ${pos} (Z${line.number}:${pos - line.from})`;
            } catch (e) { return "Editor ?"; }
        }
        const el = node.nodeType == 1 ? node as Element : node.parentElement;
        const cls = el ? (el.tagName.toLowerCase() + (el.className && typeof el.className == "string" ? "." + el.className.split(" ").slice(0, 2).join(".") : "")) : node.nodeName;
        const txt = (node.textContent || "").trim().slice(0, 18);
        return `AUSSERHALB ${cls}[${offset}] „${txt}“`;
    };

    const touchInfo = (e: TouchEvent) => {
        const t = e.changedTouches[0];
        const target = e.target as Element;
        const inEditor = view.contentDOM.contains(target);
        let pos = "";
        if (t && inEditor) { const p = view.posAtCoords({ x: t.clientX, y: t.clientY }); pos = p == null ? "" : ` pos ${p}`; }
        return `${e.type} (${t ? Math.round(t.clientX) + "," + Math.round(t.clientY) : "-"}) ${inEditor ? "im Editor" : (target?.className || target?.tagName)}${pos} touches=${e.touches.length}`;
    };
    for (const type of ["touchstart", "touchend", "touchcancel"]) {
        document.addEventListener(type, e => log(touchInfo(e as TouchEvent)), { capture: true, passive: true });
    }
    document.addEventListener("selectionchange", () => {
        const s = document.getSelection();
        if (!s) return;
        log(`DOM-Auswahl ${where(s.anchorNode, s.anchorOffset)} → ${where(s.focusNode, s.focusOffset)} (${s.toString().length} Zeichen)`);
    });
    view.dispatch({
        effects: StateEffect.appendConfig.of(EditorView.updateListener.of(u => {
            if (!u.selectionSet && !u.focusChanged && !u.geometryChanged) return;
            const ev = u.transactions.map(t => t.annotation(Transaction.userEvent)).filter(x => x).join(",");
            const sel = u.state.selection.main;
            if (u.selectionSet) log(`CM-Auswahl ${sel.anchor}→${sel.head}${ev ? " [" + ev + "]" : ""}`);
            if (u.focusChanged) log(`CM-Fokus ${u.view.hasFocus ? "an" : "aus"}`);
            if (u.geometryChanged) log(`CM-Geometrie geändert (Höhe ${Math.round(u.view.dom.clientHeight)})`);
        }))
    });
    const vv = window.visualViewport;
    if (vv) {
        const vvlog = (e: Event) => log(`VV ${e.type}: ${Math.round(vv.width)}×${Math.round(vv.height)} top ${Math.round(vv.offsetTop)} left ${Math.round(vv.offsetLeft)} scale ${vv.scale.toFixed(2)}`);
        vv.addEventListener("resize", vvlog);
        vv.addEventListener("scroll", vvlog);
    }
    window.addEventListener("scroll", () => log(`window scroll ${Math.round(scrollX)},${Math.round(scrollY)}`), { passive: true });
    view.scrollDOM.addEventListener("scroll", () => log(`Editor scroll ${Math.round(view.scrollDOM.scrollTop)}`), { passive: true });
    new MutationObserver(ms => {
        for (const m of ms) log(`html.${m.attributeName}: ${(m.target as Element).getAttribute(m.attributeName!)?.slice(0, 80)}`);
    }).observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style"] });
    log(environment());
}
