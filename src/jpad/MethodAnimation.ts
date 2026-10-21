/**
 * JPadBlox: Animierte Skizze „Methode als Blackbox“ für den Dialog „Baue Deine neue Methode“.
 *
 * Vier Szenen laufen nacheinander in einer Schleife:
 *   1. void ohne Parameter        void hupe()                      → nichts kommt heraus (nur eine Wirkung)
 *   2. void mit Parameter         void laufe(Integer schritte)     → nichts kommt heraus (nur eine Wirkung)
 *   3. Rückgabe ohne Parameter    Integer wuerfle()                → 6 fällt heraus
 *   4. Rückgabe mit Parameter     Boolean istUngerade(Integer x)   → false fällt heraus
 *
 * Ablauf einer Szene: Klappe öffnet sich, der Becher kippt den Wert hinein, in der Kiste dreht sich ein
 * Zahnrad, dann fällt der Rückgabewert aus dem Rohr (bei void erscheint stattdessen nur die Wirkung).
 * Stil: wie eine handgezeichnete Skizze (leicht verzitterte Linien, Handschrift).
 */

type Scene = {
    title: string;
    name: string;
    param?: { type: string, name: string, value: string };
    ret?: { type: string, value: string };
    effect?: string;
};

const SCENES: Scene[] = [
    { title: "void – ohne Parameter", name: "hupe", effect: "Tuuut!" },
    { title: "void – mit Parameter", name: "laufe", param: { type: "Integer", name: "schritte", value: "3" }, effect: "läuft 3 Schritte" },
    { title: "Rückgabe – ohne Parameter", name: "wuerfle", ret: { type: "Integer", value: "6" } },
    { title: "Rückgabe – mit Parameter", name: "istUngerade", param: { type: "Integer", name: "x", value: "4" }, ret: { type: "Boolean", value: "false" } },
];

const BLUE = "#3157F5";
const ORANGE = "#E8590C";

function esc(s: string) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Zahnrad als Pfad (Mittelpunkt 0/0) */
function gearPath(teeth: number, rOuter: number, rInner: number): string {
    let d = "";
    const step = Math.PI * 2 / teeth;
    for (let i = 0; i < teeth; i++) {
        const a = i * step;
        const pts = [
            [rInner, a - step * 0.30], [rOuter, a - step * 0.16], [rOuter, a + step * 0.16], [rInner, a + step * 0.30]
        ].map(([r, t]) => `${(r * Math.cos(t)).toFixed(1)} ${(r * Math.sin(t)).toFixed(1)}`);
        d += (i == 0 ? "M" : "L") + pts.join(" L") + " ";
    }
    return d + "Z";
}

const CSS = `
.jp-manim { color: var(--ink, #2B3140); position: relative; }
.jp-manim svg { display: block; width: 100%; height: auto; }
.jp-manim .ink { fill: none; stroke: currentColor; stroke-width: 2.8; stroke-linecap: round; stroke-linejoin: round; }
.jp-manim .thin { fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }
.jp-manim .hand { font-family: "Chalkboard SE", "Bradley Hand", "Segoe Print", "Comic Sans MS", cursive; fill: currentColor; }
.jp-manim .mono { font-family: ui-monospace, "SF Mono", Menlo, monospace; fill: currentColor; }
.jp-manim .anim { transform-box: fill-box; }
.jp-manim .param-part, .jp-manim .ret-part, .jp-manim .void-part { transition: opacity .35s ease; }
.jp-manim:not(.has-param) .param-part { opacity: 0; }
.jp-manim:not(.has-ret) .ret-part { opacity: 0; }
.jp-manim.has-ret .void-part { opacity: 0; }

.jp-manim .lid { transform-origin: 0% 100%; transition: transform .45s cubic-bezier(.3,.7,.4,1.3); }
.jp-manim.open .lid { transform: rotate(-32deg); }
.jp-manim .cup { transform-origin: 50% 50%; transition: transform .5s ease; }
.jp-manim.pour .cup { transform: rotate(-48deg) translate(-6px, 4px); }

.jp-manim .gear { transform-origin: 50% 50%; }
.jp-manim.run .gear { animation: jp-manim-spin 1.1s linear infinite; }
.jp-manim .gear-small { transform-origin: 50% 50%; }
.jp-manim.run .gear-small { animation: jp-manim-spin 0.8s linear infinite reverse; }
@keyframes jp-manim-spin { to { transform: rotate(360deg); } }

.jp-manim .token-in { opacity: 0; }
.jp-manim.drop .token-in { animation: jp-manim-in 1s ease-in forwards; }
@keyframes jp-manim-in {
    0%   { opacity: 0; transform: translate(0, 0); }
    12%  { opacity: 1; }
    45%  { transform: translate(-28px, -8px); }
    85%  { opacity: 1; transform: translate(-56px, 42px) scale(.8); }
    100% { opacity: 0; transform: translate(-66px, 50px) scale(.6); }
}
.jp-manim .token-out { opacity: 0; }
.jp-manim.out .token-out { animation: jp-manim-out 1.3s cubic-bezier(.4,0,.6,1) forwards; }
@keyframes jp-manim-out {
    0%   { opacity: 0; transform: translate(70px, -78px) scale(.6); }
    20%  { opacity: 1; transform: translate(40px, -78px) scale(.8); }
    45%  { transform: translate(0, -60px) scale(1); }
    100% { opacity: 1; transform: translate(0, 0) rotate(-8deg); }
}
.jp-manim .effect { opacity: 0; transform-origin: 50% 100%; }
.jp-manim.out .effect { animation: jp-manim-pop .5s cubic-bezier(.3,.7,.4,1.5) forwards; }
@keyframes jp-manim-pop { from { opacity: 0; transform: scale(.4); } to { opacity: 1; transform: scale(1); } }

.jp-manim .scene-fade { transition: opacity .35s ease; }
.jp-manim.switching .scene-fade { opacity: 0; }

.jp-manim-dots { display: flex; justify-content: center; gap: 6px; margin-top: 2px; }
.jp-manim-dots button { width: 9px; height: 9px; padding: 0; border-radius: 50%; background: currentColor; opacity: .22; border: 0; }
.jp-manim-dots button[aria-current="true"] { opacity: .75; }
@media (prefers-reduced-motion: reduce) {
    .jp-manim.run .gear, .jp-manim.run .gear-small { animation-duration: 4s; }
}
`;

function svgMarkup(): string {
    const gear = gearPath(10, 24, 18);
    const gearS = gearPath(8, 14, 10);
    return `
<svg viewBox="0 0 560 360" role="img" aria-label="Animierte Skizze: Eine Methode als Kiste. Parameter werden rechts durch eine Klappe hineingegeben, die Rückgabe fällt links aus einem Rohr heraus.">
  <defs>
    <filter id="jp-manim-wobble" x="-5%" y="-5%" width="110%" height="110%">
      <feTurbulence type="fractalNoise" baseFrequency="0.018" numOctaves="1" seed="7" result="n"/>
      <feDisplacementMap in="SourceGraphic" in2="n" scale="1.4" xChannelSelector="R" yChannelSelector="G"/>
    </filter>
    <marker id="jp-manim-arrow-b" viewBox="0 0 12 12" refX="9" refY="6" markerWidth="9" markerHeight="9" orient="auto">
      <path d="M1.5 1.5 L10 6 L1.5 10.5" fill="none" stroke="${BLUE}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </marker>
    <marker id="jp-manim-arrow-o" viewBox="0 0 12 12" refX="9" refY="6" markerWidth="9" markerHeight="9" orient="auto">
      <path d="M1.5 1.5 L10 6 L1.5 10.5" fill="none" stroke="${ORANGE}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </marker>
  </defs>

  <text class="hand scene-fade" data-ref="title" x="280" y="24" text-anchor="middle" font-size="19" font-weight="700"></text>

  <g filter="url(#jp-manim-wobble)">
    <!-- Kiste -->
    <path d="M190 82 L386 76 L390 240 L186 244 Z" fill="#2B3140" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/>
    <path class="thin" d="M198 232 l22 -22 M220 236 l28 -28" stroke="#5A6278"/>

    <!-- Klappe rechts -->
    <g class="param-part">
      <path d="M381 110 L389 109 L390 152 L382 153 Z" fill="#C9CFDC" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
      <g class="lid anim">
        <path d="M386 110 L431 92 L435 98 L389 117 Z" fill="#E9ECF3" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/>
      </g>
      <circle cx="387" cy="111" r="3" fill="currentColor"/>
    </g>

    <!-- Rohr links -->
    <g class="ret-part">
      <path d="M188 186 L120 187 Q92 188 92 216 L92 242 L120 242 L120 220 Q120 214 128 214 L187 213 Z"
            fill="#EEF1F6" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round"/>
      <path class="thin" d="M150 189 L150 212 M168 188 L168 212"/>
      <text class="hand" data-ref="retType" x="140" y="178" text-anchor="middle" font-size="16" font-weight="700"></text>
      <text class="hand" x="40" y="116" font-size="17" font-weight="700" style="fill:${ORANGE}">Rückgabe</text>
      <text class="hand" x="40" y="136" font-size="13" style="fill:${ORANGE}">(das kommt heraus)</text>
      <path class="thin" d="M82 144 Q 88 164 98 180" marker-end="url(#jp-manim-arrow-o)" style="stroke:${ORANGE}"/>
    </g>
    <g class="void-part">
      <text class="hand" x="98" y="196" text-anchor="middle" font-size="16" font-weight="700" style="fill:${ORANGE}">void</text>
      <text class="hand" x="98" y="216" text-anchor="middle" font-size="13" style="fill:${ORANGE}">es kommt nichts</text>
      <text class="hand" x="98" y="232" text-anchor="middle" font-size="13" style="fill:${ORANGE}">heraus</text>
    </g>
  </g>

  <!-- Name und Zahnräder in der Kiste (ohne Zitter-Filter, damit sie sauber drehen) -->
  <text class="hand scene-fade" data-ref="name" x="288" y="118" text-anchor="middle" font-size="24" font-weight="700" style="fill:#fff"></text>
  <g transform="translate(276 180)"><path class="gear anim" d="${gear}" fill="none" stroke="#AEB6C8" stroke-width="2.4" stroke-linejoin="round"/><circle r="6" fill="none" stroke="#AEB6C8" stroke-width="2.4"/></g>
  <g transform="translate(316 202)"><path class="gear-small anim" d="${gearS}" fill="none" stroke="#7F89A3" stroke-width="2" stroke-linejoin="round"/><circle r="3.5" fill="none" stroke="#7F89A3" stroke-width="2"/></g>

  <!-- Becher mit Parameter -->
  <g class="param-part" style="color:${BLUE}">
    <g class="cup anim">
      <path d="M436 82 L526 82 L514 172 L448 172 Z" fill="#E7EDFF" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round" filter="url(#jp-manim-wobble)"/>
      <text class="hand" data-ref="paramType" x="481" y="118" text-anchor="middle" font-size="16" font-weight="700"></text>
      <text class="hand" data-ref="paramName" x="481" y="146" text-anchor="middle" font-size="17" font-weight="700"></text>
    </g>
    <path class="ink" d="M426 66 C 420 92, 414 110, 400 126" marker-end="url(#jp-manim-arrow-b)" style="stroke:${BLUE}" filter="url(#jp-manim-wobble)"/>
    <text class="hand" x="481" y="212" text-anchor="middle" font-size="17" font-weight="700">Parameter</text>
    <text class="hand" x="481" y="231" text-anchor="middle" font-size="13">(das gibst du hinein)</text>
    <!-- Wert, der in die Klappe fällt -->
    <g class="token-in anim">
      <rect x="444" y="72" width="38" height="26" rx="6" fill="#fff" stroke="${BLUE}" stroke-width="2"/>
      <text class="hand" data-ref="paramValue" x="463" y="90" text-anchor="middle" font-size="14" font-weight="700" style="fill:${BLUE}"></text>
    </g>
  </g>

  <!-- Rückgabewert, der aus dem Rohr fällt -->
  <g class="ret-part">
    <g class="token-out anim">
      <rect x="72" y="262" width="68" height="30" rx="7" fill="#FFF1E6" stroke="${ORANGE}" stroke-width="2.4"/>
      <text class="hand" data-ref="retValue" x="106" y="283" text-anchor="middle" font-size="18" font-weight="700" style="fill:${ORANGE}"></text>
    </g>
  </g>

  <!-- Wirkung bei void -->
  <g class="void-part">
    <g class="effect anim">
      <path d="M196 60 Q 196 40 224 40 L 336 40 Q 364 40 364 58 Q 364 74 336 74 L 290 74 L 272 86 L 274 74 L 224 74 Q 196 74 196 60 Z"
            fill="#FFF9DB" stroke="currentColor" stroke-width="2" stroke-linejoin="round" filter="url(#jp-manim-wobble)"/>
      <text class="hand" data-ref="effect" x="280" y="63" text-anchor="middle" font-size="15" font-weight="700" style="fill:#1B1B12"></text>
    </g>
  </g>

  <!-- Methodenkopf -->
  <text class="mono scene-fade" data-ref="head" x="280" y="336" text-anchor="middle" font-size="16"></text>
</svg>`;
}

let cssInjected = false;

/**
 * Erzeugt die Animation. Sie läuft, solange das Element im Dokument hängt, und hält danach von selbst an.
 */
export function createMethodAnimation(): HTMLElement {
    if (!cssInjected) {
        const st = document.createElement("style");
        st.textContent = CSS;
        document.head.appendChild(st);
        cssInjected = true;
    }
    const root = document.createElement("div");
    root.className = "jp-manim";
    root.innerHTML = svgMarkup() + `<div class="jp-manim-dots" role="tablist" aria-label="Beispiele">${SCENES.map((s, i) =>
        `<button type="button" data-scene="${i}" aria-label="${esc(s.title)}"></button>`).join("")}</div>`;
    const ref = (n: string) => root.querySelector<SVGTextElement>(`[data-ref="${n}"]`)!;

    let index = 0, timers: any[] = [];
    const later = (ms: number, f: () => void) => timers.push(setTimeout(f, ms));
    const clear = () => { timers.forEach(clearTimeout); timers = []; };

    const play = (i: number) => {
        clear();
        index = i;
        const s = SCENES[i];
        root.classList.add("switching");
        root.classList.remove("open", "pour", "drop", "run", "out");
        later(380, () => {
            ref("title").textContent = `${i + 1}/4 · ${s.title}`;
            ref("name").textContent = s.name;
            ref("paramType").textContent = s.param?.type ?? "";
            ref("paramName").textContent = s.param?.name ?? "";
            ref("paramValue").textContent = s.param?.value ?? "";
            ref("retType").textContent = s.ret?.type ?? "";
            ref("retValue").textContent = s.ret?.value ?? "";
            ref("effect").textContent = s.effect ?? "";
            const head = ref("head");
            head.innerHTML = `<tspan style="fill:${ORANGE}" font-weight="700">${esc(s.ret?.type ?? "void")}</tspan> ${esc(s.name)}(` +
                (s.param ? `<tspan style="fill:${BLUE}" font-weight="700">${esc(s.param.type + " " + s.param.name)}</tspan>` : "") + ")";
            root.classList.toggle("has-param", !!s.param);
            root.classList.toggle("has-ret", !!s.ret);
            root.querySelectorAll<HTMLElement>("[data-scene]").forEach(b => b.setAttribute("aria-current", String(b.dataset.scene == String(i))));
            root.classList.remove("switching");
        });
        // Doppelt so lange Pausen wie die Bewegungen selbst brauchen, damit man in Ruhe zuschauen kann
        let t = 1800;
        if (s.param) {
            later(t, () => root.classList.add("open"));
            later(t + 900, () => root.classList.add("pour"));
            later(t + 1600, () => root.classList.add("drop"));
            t += 3800;
        }
        later(t, () => root.classList.add("run"));
        t += 3000;
        later(t, () => root.classList.add("out"));
        later(t + 800, () => root.classList.remove("pour"));
        later(t + 1400, () => root.classList.remove("open"));
        t += 5200;
        later(t, () => root.classList.remove("run"));
        later(t + 200, () => {
            if (!root.isConnected) { clear(); return; }
            play((index + 1) % SCENES.length);
        });
    };

    root.addEventListener("click", e => {
        const b = (e.target as HTMLElement).closest<HTMLElement>("[data-scene]");
        if (b) play(parseInt(b.dataset.scene!));
    });

    // Erst starten, wenn das Element eingehängt ist
    const start = () => root.isConnected ? play(0) : requestAnimationFrame(start);
    requestAnimationFrame(start);
    return root;
}
