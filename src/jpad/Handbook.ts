import apiText from "./api/online-ide-api.txt?raw";
import { parser as javaParser } from "@lezer/java";
import { highlightCode } from "@lezer/highlight";
import { javaHighlight } from "./TouchEditor.js";
import { icon } from "./Icons.js";
import { escapeHtml } from "./LanguageBridge.js";

/**
 * „Class Handbuch“: Klassenreferenz der Online-IDE (aus der API-Dokumentation von Martin Pabst),
 * durchsuchbar, mit aufklappbaren Klassen und Syntax-Hervorhebung.
 */

type MemberKind = "constructor" | "method" | "field" | "constants";

type ApiMember = { kind: MemberKind, signature: string, name: string, doc: string };

type ApiClass = {
    name: string;          // einfacher Name, z. B. "ArrayList"
    declaration: string;   // z. B. "public class ArrayList<E> implements List<E>, Cloneable"
    kind: "class" | "interface" | "enum" | "abstract";
    superTypes: string[];
    doc: string;
    members: ApiMember[];
};

// ---------------------------------------------------------------------------
// Einlesen der Textdatei
// ---------------------------------------------------------------------------

function parseApi(text: string): ApiClass[] {
    const lines = text.split(/\r?\n/);
    const classes: ApiClass[] = [];
    let current: ApiClass | null = null;
    let doc: string[] | null = null;     // gerade gelesener Doku-Kommentar
    let pendingDoc = "";

    for (const raw of lines) {
        const line = raw.replace(/\s+$/, "");
        const trimmed = line.trim();

        if (trimmed.startsWith("/**")) {
            doc = [];
            const rest = trimmed.substring(3).replace(/\*\*?\/$/, "").trim();
            if (rest) doc.push(rest);
            if (/\*\/$/.test(trimmed) && trimmed.length > 3) { pendingDoc = doc.join(" "); doc = null; }
            continue;
        }
        if (doc) {
            if (/^\*+\/$/.test(trimmed)) {
                pendingDoc = doc.join(" ").replace(/\s+/g, " ").trim();
                doc = null;
            } else {
                doc.push(trimmed.replace(/^\*\s?/, ""));
            }
            continue;
        }

        if (!current) {
            const m = trimmed.match(/^(.*?\b(class|interface|enum)\s+([A-Za-z_][\w]*)[^{]*)\{\s*$/);
            if (m) {
                const declaration = m[1].trim();
                const kind = m[2] == "class" ? (/\babstract\b/.test(declaration) ? "abstract" : "class") : <any>m[2];
                const superTypes: string[] = [];
                const ext = declaration.match(/\b(?:extends|implements)\s+(.*)$/);
                if (ext) {
                    for (const part of ext[1].split(/\b(?:extends|implements)\b|,/)) {
                        const n = part.trim().match(/^([A-Za-z_]\w*)/);
                        if (n) superTypes.push(n[1]);
                    }
                }
                current = { name: m[3], declaration, kind, superTypes, doc: pendingDoc, members: [] };
                pendingDoc = "";
            }
            continue;
        }

        if (trimmed == "}") {
            classes.push(current);
            current = null;
            pendingDoc = "";
            continue;
        }

        if (!trimmed) continue;

        // Mitglied (Konstruktor, Methode, Attribut, Enum-Konstanten)
        const signature = trimmed.replace(/;$/, "");
        let kind: MemberKind;
        let name: string;
        const paren = signature.indexOf("(");
        if (current.kind == "enum" && current.members.length == 0 && paren < 0 && !/\b(public|private|protected|static)\b/.test(signature)) {
            kind = "constants";
            name = signature;
        } else if (paren >= 0) {
            const before = signature.substring(0, paren).trim();
            name = before.split(/\s+/).pop() || before;
            kind = name == current.name ? "constructor" : "method";
        } else {
            kind = "field";
            name = signature.split(/\s+/).pop() || signature;
        }
        current.members.push({ kind, signature, name, doc: pendingDoc });
        pendingDoc = "";
    }
    return classes.sort((a, b) => a.name.localeCompare(b.name, "de", { sensitivity: "base" }));
}

// ---------------------------------------------------------------------------
// Syntax-Hervorhebung mit demselben Farbschema wie im Editor
// ---------------------------------------------------------------------------

function highlightJava(code: string): string {
    // Einzelne Signaturen in eine Klasse einbetten, damit der Java-Parser sie sauber erkennt
    const prefix = "class __X {\n";
    const wrapped = prefix + code + ";\n}";
    const tree = javaParser.parse(wrapped);
    let html = "";
    highlightCode(wrapped, tree, javaHighlight,
        (text, classes) => {
            const t = escapeHtml(text);
            html += classes ? `<span class="${classes}">${t}</span>` : t;
        },
        () => { html += "\n"; },
        prefix.length, prefix.length + code.length);
    return html;
}

function highlightDeclaration(code: string): string {
    const wrapped = code + " {}";
    const tree = javaParser.parse(wrapped);
    let html = "";
    highlightCode(wrapped, tree, javaHighlight,
        (text, classes) => {
            const t = escapeHtml(text);
            html += classes ? `<span class="${classes}">${t}</span>` : t;
        },
        () => { html += "\n"; }, 0, code.length);
    return html;
}

/** Text der Doku: `code` und Bezeichner hervorheben, Rest escapen */
function docHtml(doc: string): string {
    return escapeHtml(doc).replace(/`([^`]+)`/g, "<code>$1</code>");
}

function firstSentence(doc: string): string {
    const m = doc.match(/^(.{0,140}?[.!?])(\s|$)/);
    if (m) return m[1];
    return doc.length > 140 ? doc.substring(0, 137) + " …" : doc;
}

const KIND_LABEL: Record<ApiClass["kind"], string> = {
    class: "Klasse", abstract: "abstrakte Klasse", interface: "Interface", enum: "Enum"
};

const SECTION_LABEL: Record<MemberKind, string> = {
    constants: "Werte", constructor: "Konstruktoren", field: "Attribute", method: "Methoden"
};

// ---------------------------------------------------------------------------
// Oberfläche
// ---------------------------------------------------------------------------

let cachedClasses: ApiClass[] | null = null;

export function openHandbook(root: HTMLElement) {
    if (!cachedClasses) cachedClasses = parseApi(apiText);
    const classes = cachedClasses;
    const byName = new Map(classes.map(c => [c.name, c]));

    const layer = document.createElement("div");
    layer.className = "jp-sheet-layer jp-handbook-layer";
    layer.innerHTML = `
        <div class="jp-handbook" role="dialog" aria-modal="true" aria-label="Class Handbuch">
            <header class="jp-handbook-head">
                <h2>Class Handbuch</h2>
                <span class="jp-handbook-count"></span>
                <button class="jp-iconbtn jp-handbook-close" aria-label="Schließen">${icon("close")}</button>
            </header>
            <label class="jp-handbook-search">
                ${icon("search")}
                <input type="search" placeholder="Klasse oder Methode suchen, z. B. ArrayList oder setFillColor"
                    autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" enterkeyhint="search">
            </label>
            <div class="jp-handbook-list"></div>
            <p class="jp-handbook-source">Quelle: API-Dokumentation der Online-IDE von Martin Pabst.</p>
        </div>`;
    root.appendChild(layer);
    requestAnimationFrame(() => layer.classList.add("is-open"));

    const list = layer.querySelector<HTMLElement>(".jp-handbook-list")!;
    const input = layer.querySelector<HTMLInputElement>("input")!;
    const count = layer.querySelector<HTMLElement>(".jp-handbook-count")!;

    const close = () => {
        layer.classList.remove("is-open");
        document.removeEventListener("keydown", onKey);
        setTimeout(() => layer.remove(), 200);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key == "Escape") close(); };
    document.addEventListener("keydown", onKey);
    layer.querySelector(".jp-handbook-close")!.addEventListener("click", close);
    layer.addEventListener("click", e => { if (e.target == layer) close(); });

    const renderMembers = (cls: ApiClass, filter: string): string => {
        const order: MemberKind[] = ["constants", "constructor", "field", "method"];
        let html = "";
        for (const kind of order) {
            let members = cls.members.filter(m => m.kind == kind);
            if (filter) {
                const own = members.filter(m => m.name.toLowerCase().includes(filter));
                if (!cls.name.toLowerCase().includes(filter)) members = own;
            }
            if (members.length == 0) continue;
            html += `<h4>${SECTION_LABEL[kind]}</h4><ul class="jp-api-members">`;
            for (const m of members) {
                const hit = filter && !cls.name.toLowerCase().includes(filter) && m.name.toLowerCase().includes(filter);
                html += `<li class="${hit ? "is-hit" : ""}"><pre class="jp-api-sig">${highlightJava(m.signature)}</pre>`
                    + (m.doc ? `<p>${docHtml(m.doc)}</p>` : "") + `</li>`;
            }
            html += `</ul>`;
        }
        return html || `<p class="jp-hint">Keine öffentlichen Elemente.</p>`;
    };

    const renderClassBody = (cls: ApiClass, filter: string) => {
        let decl = highlightDeclaration(cls.declaration);
        // Oberklassen/Interfaces anklickbar machen
        for (const st of cls.superTypes) {
            if (!byName.has(st)) continue;
            decl = decl.replace(new RegExp(`(>|\\b)${st}(<|\\b)`), `$1<button class="jp-api-link" data-goto="${st}">${st}</button>$2`);
        }
        return `<pre class="jp-api-decl">${decl}</pre>`
            + (cls.doc ? `<p class="jp-api-doc">${docHtml(cls.doc)}</p>` : "")
            + renderMembers(cls, filter);
    };

    const render = () => {
        const filter = input.value.trim().toLowerCase();
        list.innerHTML = "";
        let shown = 0;
        for (const cls of classes) {
            const classHit = !filter || cls.name.toLowerCase().includes(filter);
            const memberHits = filter ? cls.members.filter(m => m.name.toLowerCase().includes(filter)).length : 0;
            if (!classHit && memberHits == 0) continue;
            shown++;
            const item = document.createElement("section");
            item.className = "jp-api-class";
            item.dataset.name = cls.name;
            item.innerHTML = `
                <button class="jp-api-head" aria-expanded="false">
                    <span class="jp-api-chevron">${icon("right")}</span>
                    <span class="jp-api-title">
                        <span class="jp-api-name">${escapeHtml(cls.name)}</span>
                        <span class="jp-api-kind">${KIND_LABEL[cls.kind]}${cls.superTypes.length ? " · " + escapeHtml(cls.superTypes.join(", ")) : ""}</span>
                        ${cls.doc ? `<span class="jp-api-summary">${escapeHtml(firstSentence(cls.doc))}</span>` : ""}
                    </span>
                    ${filter && memberHits > 0 && !cls.name.toLowerCase().includes(filter) ? `<span class="jp-api-hits">${memberHits} Treffer</span>` : ""}
                </button>
                <div class="jp-api-body" hidden></div>`;
            const head = item.querySelector<HTMLElement>(".jp-api-head")!;
            const body = item.querySelector<HTMLElement>(".jp-api-body")!;
            head.addEventListener("click", () => {
                const open = head.getAttribute("aria-expanded") != "true";
                head.setAttribute("aria-expanded", String(open));
                if (open && !body.dataset.rendered) {
                    body.innerHTML = renderClassBody(cls, filter);
                    body.dataset.rendered = "1";
                }
                body.hidden = !open;
            });
            list.appendChild(item);
        }
        count.textContent = filter ? `${shown} von ${classes.length}` : `${classes.length} Klassen`;
        if (shown == 0) {
            list.innerHTML = `<div class="jp-empty">${icon("search")}<p>Nichts gefunden für „${escapeHtml(input.value.trim())}“.</p></div>`;
        } else if (filter && shown <= 3) {
            // Bei wenigen Treffern gleich aufklappen
            list.querySelectorAll<HTMLElement>(".jp-api-head").forEach(h => h.click());
        }
    };

    // Sprung zu Oberklasse / Interface
    list.addEventListener("click", e => {
        const link = (<HTMLElement>e.target).closest<HTMLElement>("[data-goto]");
        if (!link) return;
        e.stopPropagation();
        const name = link.dataset.goto!;
        if (input.value) { input.value = ""; render(); }
        const target = list.querySelector<HTMLElement>(`.jp-api-class[data-name="${name}"]`);
        if (!target) return;
        const head = target.querySelector<HTMLElement>(".jp-api-head")!;
        if (head.getAttribute("aria-expanded") != "true") head.click();
        target.scrollIntoView({ block: "start", behavior: "smooth" });
    });

    let timer: any;
    input.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(render, 120); });
    render();
}
