/**
 * JPadBlox: Kleine Werkstätten aus den Lernpfaden „Erste Schritte mit JPad“ und „Der Schaf-Konstruktor“,
 * für die großen Hilfen der Bausteine (langes Drücken). Inhalte, Zeichnungen und Texte stammen aus
 * den Lernpfaden; hier sind sie nur so verpackt, dass sie in einem Hinweis-Fenster laufen.
 *
 *   factory  Schaf-Fabrik: aus dem Bauplan Schaf entstehen Zeile für Zeile zwei Schafe (Lernpfad 1, Station 7)
 *   ctor     Konstruktor-Werkstatt: new Schaf("Dolli", …) füllt die Attribute (Lernpfad 2)
 *   param    Parameter-Werkstatt: s1.umbenennen("Lotte") (Lernpfad 2)
 *   sheep    Ein fertiges Schaf-Objekt mit seinen Attributen (still)
 *   array    Der Schäfer mit einem Array von Schafen (still)
 */

export type LabKind = "factory" | "ctor" | "param" | "sheep" | "array";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// ---------------------------------------------------------------- Hervorhebung wie in den Lernpfaden

const KW = new Set(["class", "new", "void", "return", "if", "else", "while", "for", "true", "false", "null", "this", "extends"]);
function hl(line: string): string {
    const re = /(\/\/.*$)|("(?:[^"\\]|\\.)*")|(\b\d+(?:\.\d+)?\b)|([A-Za-z_äöüÄÖÜß]\w*)|(\s+)|([^\sA-Za-z_\d"]+)/g;
    let out = "", m: RegExpExecArray | null;
    while ((m = re.exec(line))) {
        if (m[1]) out += `<span class="t-com">${esc(m[1])}</span>`;
        else if (m[2]) out += `<span class="t-str">${esc(m[2])}</span>`;
        else if (m[3]) out += `<span class="t-num">${m[3]}</span>`;
        else if (m[4]) {
            const w = m[4], rest = line.slice(re.lastIndex);
            if (KW.has(w)) out += `<span class="t-kw">${w}</span>`;
            else if (/^\s*\(/.test(rest) && !/^[A-Z]/.test(w)) out += `<span class="t-fn">${w}</span>`;
            else if (/^[A-Z]/.test(w)) out += `<span class="t-ty">${w}</span>`;
            else out += w;
        } else out += esc(m[0]);
    }
    return out;
}

// ---------------------------------------------------------------- Zeichnungen (aus den Lernpfaden)

const WOOL: Record<string, string> = { weiss: "var(--wool-weiss)", schwarz: "var(--wool-schwarz)", braun: "var(--wool-braun)" };
function sheepSVG(farbe?: string): string {
    const fill = farbe ? WOOL[farbe] : undefined;
    const puffs = [[34, 40, 14], [50, 32, 15], [68, 34, 14], [80, 46, 12], [26, 54, 12], [44, 56, 15], [62, 56, 15], [78, 58, 11]];
    return `<svg class="sheep" viewBox="0 0 110 88" aria-hidden="true">
      <g class="legs"><rect x="34" y="62" width="7" height="20" rx="2"/><rect x="48" y="64" width="7" height="18" rx="2"/><rect x="62" y="64" width="7" height="18" rx="2"/><rect x="74" y="62" width="7" height="20" rx="2"/></g>
      ${puffs.map(([x, y, r]) => `<circle class="wool${fill ? "" : " is-ghost"}" cx="${x}" cy="${y}" r="${r}" ${fill ? `fill="${fill}" stroke="rgba(0,0,0,.18)" stroke-width="1"` : ""}/>`).join("")}
      <ellipse class="head" cx="18" cy="42" rx="12" ry="14"/>
      <ellipse class="head" cx="9" cy="33" rx="6" ry="3.5" transform="rotate(-25 9 33)"/>
      <ellipse class="head" cx="27" cy="31" rx="6" ry="3.5" transform="rotate(25 27 31)"/>
      <circle class="eye" cx="13" cy="41" r="2.4"/><circle class="eye" cx="22" cy="41" r="2.4"/>
    </svg>`;
}
function shepherdSVG(): string {
    return `<svg class="shepherd" viewBox="0 0 110 88" aria-hidden="true">
      <path d="M80 8 q8 0 8 8 v66" fill="none" stroke="#8a5a2b" stroke-width="4" stroke-linecap="round"/>
      <path d="M40 30 q15-10 30 0 l8 50 h-46z" fill="#2e7a3b"/>
      <rect x="47" y="40" width="16" height="40" fill="#6f6a3a"/>
      <circle cx="55" cy="22" r="11" fill="#e2b48f"/>
      <path d="M43 22 q12-22 24 0 q-2-6-12-6 q-10 0-12 6z" fill="#2e7a3b"/>
      <path d="M48 27 q7 9 14 0 v4 q-7 6-14 0z" fill="#5a3a22"/>
      <circle cx="51" cy="22" r="1.4" fill="#1e2a21"/><circle cx="59" cy="22" r="1.4" fill="#1e2a21"/>
    </svg>`;
}

const ATTR4 = ["name", "farbe", "schnarchGeraeusch", "maehGeraeusch"];

function objCard(v: string, cls: string, attrs: string[], a: Record<string, string | undefined>, flashKey?: string): string {
    const rows = attrs.map(k => {
        const val = a[k];
        return `<div class="${k == flashKey ? "is-flash" : ""}">${k} = <span class="v${val == null ? " is-null" : ""}">${val == null ? "null" : `"${esc(val)}"`}</span></div>`;
    }).join("");
    return `<div class="obj"><div class="obj-name">${esc(v)}${v ? " " : ""}: ${esc(cls)}</div><div class="obj-attrs">${rows}</div></div>`;
}

// ---------------------------------------------------------------- Schaf-Fabrik (Lernpfad 1, auf zwei Schafe gekürzt)

function factoryLab(): HTMLElement {
    const src = 'Schaf s1 = new Schaf();\ns1.name = "Dolli";\ns1.farbe = "weiss";\ns1.schnarchGeraeusch = "Mpfhh";\ns1.maehGeraeusch = "Mbähhh";\n\nSchaf s2 = new Schaf();\ns2.name = "Gunthard";\ns2.farbe = "schwarz";';
    type O = { v: string, a: Record<string, string> };
    type S = { objs: O[], changed: { v: string, k: string } | null, last?: any };
    const set = (s: S, v: string, k: string, val: string) => { s.objs.find(o => o.v == v)!.a[k] = val; s.changed = { v, k }; };
    const STEPS: { line: number, act: (s: S) => void, say: string }[] = [
        { line: 1, act: s => { s.objs.push({ v: "s1", a: {} }); }, say: "<code>new Schaf()</code> baut nach dem Bauplan ein neues Objekt. Die Variable <code>s1</code> zeigt darauf. Alle Attribute sind noch leer: <code>null</code>." },
        { line: 2, act: s => set(s, "s1", "name", "Dolli"), say: "Das Objekt <code>s1</code> bekommt seinen Namen: Dolli." },
        { line: 3, act: s => set(s, "s1", "farbe", "weiss"), say: "Jetzt hat Dolli eine Farbe. Erst jetzt wissen wir, wie ihre Wolle aussieht." },
        { line: 4, act: s => set(s, "s1", "schnarchGeraeusch", "Mpfhh"), say: "So schnarcht Dolli: „Mpfhh“." },
        { line: 5, act: s => set(s, "s1", "maehGeraeusch", "Mbähhh"), say: "Und so mäht sie: „Mbähhh“. Dolli ist fertig." },
        { line: 7, act: s => { s.objs.push({ v: "s2", a: {} }); }, say: "Noch einmal <code>new Schaf()</code>: ein zweites, eigenes Objekt aus demselben Bauplan. Seine Attribute sind wieder alle <code>null</code>." },
        { line: 8, act: s => set(s, "s2", "name", "Gunthard"), say: "<code>s2</code> heißt Gunthard. Dollis Name bleibt, wie er ist." },
        { line: 9, act: s => set(s, "s2", "farbe", "schwarz"), say: "Gunthard ist schwarz. Zwei Schafe, ein Bauplan – jedes mit eigenen Werten." },
    ];
    const stateAt = (k: number): S => {
        const s: S = { objs: [], changed: null };
        for (let i = 0; i < k; i++) { s.changed = null; STEPS[i].act(s); }
        return s;
    };

    const root = document.createElement("div");
    root.className = "jp-lab factory";
    root.innerHTML = `
        <div class="factory-top">
            <div class="factory-code"><pre>${src.split("\n").map((l, i) => `<span class="ln" data-n="${i + 1}">${hl(l) || " "}</span>`).join("")}</pre></div>
            <div class="field">
                <div class="blueprint-label">Bauplan (Klasse)</div>
                <div class="blueprints"><div class="uml" data-role="bp">
                    <div class="uml-name">Schaf</div>
                    <div class="uml-sec">name: String<br>farbe: String<br>schnarchGeraeusch: String<br>maehGeraeusch: String</div>
                    <div class="uml-sec">schlafen()<br>unterhalten()</div>
                </div></div>
                <div class="blueprint-label">Weide (Objekte)</div>
                <div class="pasture" data-role="pasture"></div>
            </div>
        </div>
        <div class="lab-bar">
            <button class="fbtn" type="button" data-act="back" aria-label="Eine Zeile zurück">◀</button>
            <button class="fbtn primary" type="button" data-act="next">Nächste Zeile ▶</button>
            <button class="fbtn" type="button" data-act="play">Abspielen</button>
            <button class="fbtn" type="button" data-act="reset">Neu</button>
            <div class="lab-say" data-role="say" aria-live="polite"></div>
        </div>`;
    const lineEls = [...root.querySelectorAll<HTMLElement>(".factory-code .ln")];
    const pasture = root.querySelector<HTMLElement>("[data-role=pasture]")!;
    const say = root.querySelector<HTMLElement>("[data-role=say]")!;
    const bp = root.querySelector<HTMLElement>("[data-role=bp]")!;
    const btn = (a: string) => root.querySelector<HTMLButtonElement>(`[data-act=${a}]`)!;
    let k = 0, prevCount = 0, timer: any = null;

    const render = (animate: boolean) => {
        const s = stateAt(k);
        lineEls.forEach((el, i) => {
            const n = i + 1;
            el.classList.toggle("is-next", k < STEPS.length && STEPS[k].line == n);
            el.classList.toggle("is-done", STEPS.slice(0, k).some(st => st.line == n));
        });
        pasture.innerHTML = !s.objs.length
            ? `<div class="pasture-empty">Noch keine Objekte. Bisher gibt es nur den Bauplan.</div>`
            : s.objs.map((o, i) => {
                const isNew = animate && i >= prevCount;
                const flash = animate && s.changed && s.changed.v == o.v ? s.changed.k : undefined;
                const tag = o.a.name ? `<span class="nametag">${esc(o.a.name)}</span>` : `<span class="nametag is-empty">(ohne Namen)</span>`;
                return `<div class="critter${isNew ? " is-new" : ""}">${sheepSVG(o.a.farbe)}${tag}${objCard(o.v, "Schaf", ATTR4, o.a, flash)}</div>`;
            }).join("");
        if (animate && s.objs.length > prevCount) { bp.classList.remove("is-pulse"); void bp.offsetWidth; bp.classList.add("is-pulse"); }
        prevCount = s.objs.length;
        say.innerHTML = k == 0 ? "Noch ist nichts passiert. Es gibt nur den Bauplan <code>Schaf</code>. Tippe auf <strong>Nächste Zeile</strong>." : STEPS[k - 1].say;
        btn("back").disabled = k == 0;
        btn("next").disabled = k >= STEPS.length;
    };
    const stop = () => { clearInterval(timer); timer = null; btn("play").textContent = "Abspielen"; };
    btn("next").addEventListener("click", () => { stop(); if (k < STEPS.length) { k++; render(true); } });
    btn("back").addEventListener("click", () => { stop(); if (k > 0) { k--; prevCount = 99; render(false); } });
    btn("reset").addEventListener("click", () => { stop(); k = 0; prevCount = 0; render(false); });
    btn("play").addEventListener("click", () => {
        if (timer) { stop(); return; }
        if (k >= STEPS.length) { k = 0; prevCount = 0; render(false); }
        btn("play").textContent = "Pause";
        timer = setInterval(() => {
            if (!root.isConnected || k >= STEPS.length) { stop(); return; }
            k++; render(true);
        }, 1500);
    });
    render(false);
    return root;
}

// ---------------------------------------------------------------- Schritt-Werkstatt (Lernpfad 2)

type LabState = { line: [number, number] | null, params: [string, string, boolean?][], obj: { v: string, a: Record<string, string> } | null, say: string, empty?: string, paramsEmpty?: string };

function stepLab(cfg: { files: { name: string, src: string, start?: number }[], count: number, state: (k: number) => LabState }): HTMLElement {
    const root = document.createElement("div");
    root.className = "jp-lab lab";
    root.innerHTML = `
        <div class="lab-top">
            <div class="lab-code">${cfg.files.map((f, fi) => `<div class="fn">${esc(f.name)}</div><pre>${f.src.split("\n").map((l, i) =>
                `<span class="ln" data-f="${fi}" data-n="${(f.start || 1) + i}">${hl(l) || " "}</span>`).join("")}</pre>`).join("")}</div>
            <div class="lab-stage">
                <div class="params" data-role="params"></div>
                <div class="pasture" data-role="pasture"></div>
            </div>
        </div>
        <div class="lab-bar">
            <button class="fbtn" type="button" data-act="back" aria-label="Einen Schritt zurück">◀</button>
            <button class="fbtn primary" type="button" data-act="next">Nächster Schritt ▶</button>
            <button class="fbtn" type="button" data-act="reset">Neu</button>
            <div class="lab-say" data-role="say" aria-live="polite"></div>
        </div>`;
    const codeEl = root.querySelector<HTMLElement>(".lab-code")!;
    const paramsEl = root.querySelector<HTMLElement>("[data-role=params]")!;
    const pasture = root.querySelector<HTMLElement>("[data-role=pasture]")!;
    const say = root.querySelector<HTMLElement>("[data-role=say]")!;
    const back = root.querySelector<HTMLButtonElement>("[data-act=back]")!, next = root.querySelector<HTMLButtonElement>("[data-act=next]")!;
    let k = 0, prev: LabState | null = null;
    const render = (animate: boolean) => {
        const s = cfg.state(k), p = animate ? prev : null;
        codeEl.querySelectorAll<HTMLElement>(".ln").forEach(el => el.classList.toggle("is-next", !!s.line && +el.dataset.f! == s.line[0] && +el.dataset.n! == s.line[1]));
        paramsEl.innerHTML = s.params.length == 0
            ? `<span class="params-empty">${esc(s.paramsEmpty || "keine Parameter-Schachteln")}</span>`
            : s.params.map(([n, v, gone]) => `<span class="pbox${animate && p && !p.params.some(x => x[0] == n) ? " is-new" : ""}${gone ? " is-gone" : ""}"><span class="pn">${n}</span> = <span class="pv">"${esc(v)}"</span></span>`).join("");
        if (!s.obj) pasture.innerHTML = `<div class="pasture-empty">${esc(s.empty || "Noch kein Objekt.")}</div>`;
        else {
            const o = s.obj, isNew = animate && p && !p.obj;
            const flash = animate && p && p.obj ? ATTR4.find(a => p.obj!.a[a] !== o.a[a]) : undefined;
            pasture.innerHTML = `<div class="critter${isNew ? " is-new" : ""}">
                ${sheepSVG(o.a.farbe)}
                <span class="nametag${o.a.name ? "" : " is-empty"}">${o.a.name ? esc(o.a.name) : "(noch ohne Namen)"}</span>
                ${objCard(o.v, "Schaf", ATTR4, o.a, flash)}
            </div>`;
        }
        say.innerHTML = s.say;
        back.disabled = k == 0;
        next.disabled = k >= cfg.count - 1;
        prev = s;
    };
    next.addEventListener("click", () => { if (k < cfg.count - 1) { k++; render(true); } });
    back.addEventListener("click", () => { if (k > 0) { k--; prev = null; render(false); } });
    root.querySelector("[data-act=reset]")!.addEventListener("click", () => { k = 0; prev = null; render(false); });
    render(false);
    return root;
}

const full = () => ({ name: "Dolli", farbe: "weiss", schnarchGeraeusch: "Mpfhh", maehGeraeusch: "Mbähhh" });

function ctorLab(): HTMLElement {
    const steps: { line: [number, number], params?: [string, string][], obj?: { v: string, a: Record<string, string> } | null, set?: [string, string], done?: boolean, say: string, empty?: string }[] = [
        { line: [0, 1], params: [], obj: null, say: "Im Hauptprogramm steht <code>new Schaf(\"Dolli\", \"weiss\", \"Mpfhh\", \"Mbähhh\")</code>. Noch gibt es kein Schaf.", empty: "Noch kein Objekt. Gleich wird gebaut." },
        { line: [1, 8], params: [["n", "Dolli"], ["f", "weiss"], ["s", "Mpfhh"], ["m", "Mbähhh"]], obj: { v: "", a: {} }, say: "<code>new</code> baut ein leeres Schaf (alle Attribute <code>null</code>) und ruft den Konstruktor auf. Die vier Werte wandern der Reihe nach in die Parameter <code>n</code>, <code>f</code>, <code>s</code>, <code>m</code>." },
        { line: [1, 9], set: ["name", "Dolli"], say: "<code>name = n;</code> Das Schaf bekommt seinen Namen." },
        { line: [1, 10], set: ["farbe", "weiss"], say: "<code>farbe = f;</code> Jetzt hat es auch weiße Wolle." },
        { line: [1, 11], set: ["schnarchGeraeusch", "Mpfhh"], say: "<code>schnarchGeraeusch = s;</code>" },
        { line: [1, 12], set: ["maehGeraeusch", "Mbähhh"], say: "<code>maehGeraeusch = m;</code> Alle vier Attribute sind gefüllt." },
        { line: [0, 1], done: true, say: "Der Konstruktor ist fertig, die Parameter-Schachteln sind weg. Erst jetzt wird das fertige Schaf in die Variable <code>s1</code> gelegt: aus <code>: Schaf</code> wird <code>s1 : Schaf</code>." },
    ];
    return stepLab({
        files: [
            { name: "Hauptprogramm.java", src: 'Schaf s1 = new Schaf("Dolli", "weiss", "Mpfhh", "Mbähhh");' },
            { name: "Schaf.java (Konstruktor)", src: 'Schaf(String n, String f, String s, String m) {\n   name = n;\n   farbe = f;\n   schnarchGeraeusch = s;\n   maehGeraeusch = m;\n}', start: 8 }
        ],
        count: steps.length,
        state(k) {
            let params: [string, string, boolean?][] = [], obj: LabState["obj"] = null, line: LabState["line"] = null, say = "", empty = "";
            for (let i = 0; i <= k; i++) {
                const st = steps[i];
                line = st.line; say = st.say; empty = st.empty || empty;
                if (st.params) params = st.params.map(p => [p[0], p[1]]);
                if (st.obj !== undefined) obj = st.obj ? { v: st.obj.v, a: { ...st.obj.a } } : null;
                if (st.set && obj) obj = { v: obj.v, a: { ...obj.a, [st.set[0]]: st.set[1] } };
                if (st.done && obj) { params = params.map(p => [p[0], p[1], true]); obj = { v: "s1", a: { ...obj.a } }; }
            }
            return { line, params, obj, say, empty, paramsEmpty: "noch keine – der Konstruktor läuft noch nicht" };
        }
    });
}

function paramLab(): HTMLElement {
    return stepLab({
        files: [
            { name: "Hauptprogramm.java", src: 's1.umbenennen("Lotte");' },
            { name: "Schaf.java", src: 'void umbenennen(String neuerName) {\n   name = neuerName;\n}', start: 22 }
        ],
        count: 4,
        state(k) {
            const a = full();
            if (k == 0) return { line: [0, 1], params: [], obj: { v: "s1", a }, say: "Dolli gibt es schon. Gleich wird die Methode <code>umbenennen</code> mit dem Wert <code>\"Lotte\"</code> aufgerufen." };
            if (k == 1) return { line: [1, 23], params: [["neuerName", "Lotte"]], obj: { v: "s1", a }, say: "Beim Aufruf entsteht die Schachtel <code>neuerName</code>. Der Wert <code>\"Lotte\"</code> aus den Klammern wandert hinein." };
            if (k == 2) return { line: [1, 24], params: [["neuerName", "Lotte"]], obj: { v: "s1", a: { ...a, name: "Lotte" } }, say: "<code>name = neuerName;</code> kopiert den Wert aus der Parameter-Schachtel in das Attribut <code>name</code>." };
            return { line: null, params: [["neuerName", "Lotte", true]], obj: { v: "s1", a: { ...a, name: "Lotte" } }, say: "Die Methode ist fertig. Die Schachtel <code>neuerName</code> ist weg, aber der neue Name steckt jetzt sicher im Attribut." };
        }
    });
}

// ---------------------------------------------------------------- Stille Bilder

function sheepFigure(): HTMLElement {
    const root = document.createElement("div");
    root.className = "jp-lab still";
    root.innerHTML = `<div class="pasture">
        <div class="critter">${sheepSVG("weiss")}<span class="nametag">Dolli</span>${objCard("s1", "Schaf", ATTR4, full())}</div>
        <div class="critter">${sheepSVG("schwarz")}<span class="nametag">Gunthard</span>${objCard("s2", "Schaf", ATTR4, { name: "Gunthard", farbe: "schwarz" })}</div>
    </div>
    <p class="still-say">Jedes Schaf hat <strong>dieselben Attribute</strong> (aus dem Bauplan), aber <strong>eigene Werte</strong>. Was noch nicht gesetzt ist, hat den Wert <code>null</code>.</p>`;
    return root;
}

function arrayFigure(): HTMLElement {
    const root = document.createElement("div");
    root.className = "jp-lab still";
    const herd: [string, string][] = [["Dolli", "weiss"], ["Gunthard", "schwarz"], ["Helga", "braun"]];
    root.innerHTML = `
    <div class="arr">
        <div class="arr-owner">${shepherdSVG()}<div class="obj"><div class="obj-name">u : Schaefer</div><div class="obj-attrs"><div>name = <span class="v">"Ulf"</span></div><div>herde = <span class="v">●→</span></div></div></div></div>
        <div class="arr-body">
            <div class="arr-label"><code>herde</code> : <code>Schaf[]</code> mit Länge 3</div>
            <div class="arr-cells">${herd.map(([n, f], i) => `<div class="arr-cell"><div class="arr-idx">herde[${i}]</div>${sheepSVG(f)}<span class="nametag">${n}</span></div>`).join("")}</div>
        </div>
    </div>
    <p class="still-say">Ein Array ist eine Reihe von Fächern mit fester Länge. Jedes Fach hat eine Nummer, den <strong>Index</strong>, und der beginnt bei <strong>0</strong>. Ulfs Array <code>herde</code> hat 3 Fächer: <code>herde[0]</code> bis <code>herde[2]</code>.</p>`;
    return root;
}

export function createLab(kind: LabKind): HTMLElement {
    switch (kind) {
        case "factory": return factoryLab();
        case "ctor": return ctorLab();
        case "param": return paramLab();
        case "sheep": return sheepFigure();
        case "array": return arrayFigure();
    }
}
