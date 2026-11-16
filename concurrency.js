/* Swift Learning Guide → Concurrency: figure behaviour. Plain JS, no framework. */
(function () {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const NS = "http://www.w3.org/2000/svg";
  const svgEl = (tag, attrs, parent) => {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  };
  const esc = s => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const rand = (a, b) => a + Math.random() * (b - a);

  /* ---------- code blocks: highlight, then split into lines ---------- */
  function prepCode(code) {
    if (window.hljs) { try { hljs.highlightElement(code); } catch (e) { /* plain text is fine */ } }
    code.innerHTML = code.innerHTML.split("\n").map(l => `<span class="ln">${l || " "}</span>`).join("");
  }
  $$("pre.code code").forEach(prepCode);
  const hot = (pre, lines) => $$(".ln", pre).forEach((ln, i) => ln.classList.toggle("hot", lines.includes(i)));

  /* ---------- animation helpers ---------- */
  // Runs frame(t) for t from 0 to `units`, at `speed` units per second. Returns a stop function.
  function play(units, frame, speed = 1, done) {
    if (reduce) { frame(units); if (done) done(); return () => {}; }
    let start = null, id = 0, stopped = false;
    const step = now => {
      if (stopped) return;
      if (start === null) start = now;
      const t = Math.min(((now - start) / 1000) * speed, units);
      frame(t);
      if (t < units) id = requestAnimationFrame(step); else if (done) done();
    };
    id = requestAnimationFrame(step);
    return () => { stopped = true; cancelAnimationFrame(id); };
  }

  // Draws a lane chart into an <svg>. Returns render(t) that reveals blocks up to time t.
  function timeline(svg, { lanes, tmax, labelW = 64, laneH = 24, gap = 10, markers = [] }) {
    const W = svg.viewBox.baseVal.width;
    const top = markers.length ? 22 : 4;
    const x0 = labelW, x1 = W - 14;
    const sx = t => x0 + ((x1 - x0) * t) / tmax;
    const ay = top + lanes.length * (laneH + gap);
    svg.setAttribute("viewBox", `0 0 ${W} ${ay + 26}`);
    svg.textContent = "";
    const blocks = [];
    lanes.forEach((lane, i) => {
      const y = top + i * (laneH + gap);
      const lt = svgEl("text", { x: 0, y: y + laneH / 2 + 4, "font-size": 11, class: "mono mute" }, svg);
      lt.textContent = lane.label;
      const guide = svgEl("line", { x1: x0, x2: x1, y1: y + laneH / 2, y2: y + laneH / 2, "stroke-dasharray": "2 5" }, svg);
      guide.style.stroke = "var(--line)";
      lane.blocks.forEach(b => {
        const r = svgEl("rect", { x: sx(b.s), y, height: laneH, width: sx(b.e) - sx(b.s), rx: 5 }, svg);
        if (b.dashed) {
          r.style.fill = "color-mix(in srgb, var(--wait) 10%, transparent)";
          r.style.stroke = "var(--wait)";
          r.style.strokeWidth = "1.5";
          r.setAttribute("stroke-dasharray", "4 3");
        } else r.style.fill = `var(--${b.c})`;
        const tx = svgEl("text", { x: sx(b.s) + 6, y: y + laneH / 2 + 4, "font-size": 11, class: "mono" }, svg);
        tx.textContent = b.label || "";
        tx.style.fill = b.dashed ? "var(--wait)" : "var(--surface)";
        tx.style.fontWeight = "600";
        blocks.push({ b, r, tx, need: (b.label || "").length * 7 + 8 });
      });
    });
    const axis = svgEl("line", { x1: x0, x2: x1, y1: ay, y2: ay }, svg);
    axis.style.stroke = "var(--muted)";
    for (let s = 0; s <= tmax; s++) {
      const tick = svgEl("line", { x1: sx(s), x2: sx(s), y1: ay, y2: ay + 5 }, svg);
      tick.style.stroke = "var(--muted)";
      const tl = svgEl("text", { x: sx(s), y: ay + 18, "font-size": 10, "text-anchor": "middle", class: "mono mute" }, svg);
      tl.textContent = s + "s";
    }
    const marks = markers.map(m => {
      const g = svgEl("g", {}, svg);
      const ln = svgEl("line", { x1: sx(m.t), x2: sx(m.t), y1: 14, y2: ay, "stroke-dasharray": "4 3", "stroke-width": 1.5 }, g);
      ln.style.stroke = "var(--ok)";
      const tx = svgEl("text", { x: sx(m.t) + 6, y: 12, "font-size": 11, class: "mono" }, g);
      tx.textContent = m.label;
      tx.style.fill = "var(--ok)";
      tx.style.fontWeight = "600";
      return { m, g };
    });
    const head = svgEl("line", { x1: x0, x2: x0, y1: top - 2, y2: ay, "stroke-width": 2 }, svg);
    head.style.stroke = "var(--accent)";
    function render(t) {
      blocks.forEach(({ b, r, tx, need }) => {
        const e = Math.max(b.s, Math.min(t, b.e));
        const w = Math.max(0, sx(e) - sx(b.s));
        r.setAttribute("width", w);
        tx.style.opacity = w >= Math.min(sx(b.e) - sx(b.s), need) && t > b.s ? 1 : 0;
      });
      marks.forEach(({ m, g }) => { g.style.opacity = t >= m.t ? 1 : 0; });
      head.setAttribute("x1", sx(t));
      head.setAttribute("x2", sx(t));
      head.style.opacity = t > 0 && t < tmax ? 1 : 0;
    }
    render(tmax);
    return render;
  }

  // Generic step-through controller: prefix-prev / -next / -reset / -count / -cap.
  function stepper(prefix, steps, render) {
    let i = 0;
    const prev = $(`#${prefix}-prev`), next = $(`#${prefix}-next`), reset = $(`#${prefix}-reset`);
    const count = $(`#${prefix}-count`), cap = $(`#${prefix}-cap`);
    const api = {
      steps,
      go(n) {
        i = Math.max(0, Math.min(api.steps.length - 1, n));
        const s = api.steps[i];
        render(s, i);
        cap.innerHTML = s.cap;
        count.textContent = `Step ${i + 1} of ${api.steps.length}`;
        prev.disabled = i === 0;
        next.disabled = i === api.steps.length - 1;
      },
      get i() { return i; },
      redraw() { render(api.steps[i], i); }
    };
    prev.addEventListener("click", () => api.go(i - 1));
    next.addEventListener("click", () => api.go(i + 1));
    reset.addEventListener("click", () => api.go(0));
    api.go(0);
    return api;
  }

  // Moves a ticket to a lane of a stage. spec: {row, text, cls, st} or null to hide.
  function place(stage, tk, spec) {
    const isOther = tk.classList.contains("other");
    if (!spec) { tk.classList.add("gone"); return; }
    tk.className = `tk${isOther ? " other" : ""} ${spec.cls || ""} ${spec.st || ""}`;
    tk.textContent = spec.text;
    const lane = $$(".lane", stage)[spec.row];
    tk.style.top = lane.offsetTop + (lane.offsetHeight - tk.offsetHeight) / 2 + "px";
  }

  // Segmented control: calls onPick(value) and keeps aria-pressed in sync.
  function seg(root, attr, onPick) {
    const btns = $$("button", root);
    btns.forEach(b => b.addEventListener("click", () => {
      btns.forEach(x => x.setAttribute("aria-pressed", String(x === b)));
      onPick(b.dataset[attr]);
    }));
    return v => btns.forEach(b => { b.disabled = v; });
  }

  /* =========================================================
     Fig 1: taking turns vs side by side
     ========================================================= */
  const f1a = timeline($("#f1-async"), {
    tmax: 6, labelW: 58,
    lanes: [
      { label: "Core 1", blocks: [
        { s: 0, e: 1, c: "main", label: "UI" }, { s: 1, e: 1.5, c: "run", label: "Net" },
        { s: 1.5, e: 3.5, c: "ink", label: "Parse" }, { s: 3.5, e: 4.5, c: "main", label: "UI" },
        { s: 4.5, e: 5, c: "run", label: "Net" }, { s: 5, e: 6, c: "main", label: "UI" } ] },
      { label: "await", blocks: [{ s: 1.5, e: 4.5, dashed: true, label: "waiting for server" }] }
    ]
  });
  const f1p = timeline($("#f1-par"), {
    tmax: 6, labelW: 58,
    lanes: [
      { label: "Core 1", blocks: [{ s: 0, e: 6, c: "main", label: "UI" }] },
      { label: "Core 2", blocks: [{ s: 0, e: 0.5, c: "run", label: "Net" }, { s: 3.5, e: 4, c: "run", label: "Net" }] },
      { label: "Core 3", blocks: [{ s: 0, e: 2, c: "ink", label: "Parse" }] },
      { label: "Core 4", blocks: [{ s: 0, e: 3, c: "muted", label: "Thumbnails" }] }
    ]
  });
  let stop1 = () => {};
  $("#f1-play").addEventListener("click", () => { stop1(); stop1 = play(6, t => { f1a(t); f1p(t); }, 1.5); });

  /* Fig 1b: code style toggle */
  seg($("#f1b .seg"), "style", v => {
    $("#f1b-cb").hidden = v !== "cb";
    $("#f1b-aw").hidden = v !== "aw";
    $("#f1b-note").textContent = v === "cb"
      ? "Every step that waits adds another closure and another level of nesting. Real code gets deep fast."
      : "Same steps, written top to bottom. The two awaits show exactly where the code can pause.";
  });

  /* =========================================================
     Fig 2: suspension stepper
     ========================================================= */
  {
    const stage = $("#f2-stage"), you = $("#f2-you"), other = $("#f2-other"), code = $("#f2-code");
    const run = (row, text) => ({ row, text, cls: "c-run", st: "running" });
    const wait = text => ({ row: 0, text, cls: "c-wait", st: "waiting" });
    const oth = (row, text) => ({ row, text, cls: "c-muted" });
    const steps = [
      { line: [0], you: run(1, "your code · line 1"), other: null,
        cap: "<b>Start.</b> Your code runs on some thread until it reaches the first <code>await</code>." },
      { line: [0], you: wait("waiting · listPhotos(…)"), other: oth(1, "other code · refresh galleries"),
        cap: "<b>Suspend.</b> <code>await listPhotos</code> pauses your code and gives up the thread. Other code, like a background refresh, runs on it meanwhile." },
      { line: [0], you: run(2, "your code · photoNames = […]"), other: oth(1, "other code · refresh galleries"),
        cap: "<b>Resume, maybe somewhere else.</b> <code>listPhotos</code> returns and your code continues, this time on Thread 2. Swift doesn't promise which thread you come back on." },
      { line: [1, 2], you: run(2, "your code · sort, pick a name"), other: oth(1, "other code · refresh galleries"),
        cap: "<b>Plain synchronous code.</b> No <code>await</code> on these lines, so nothing can pause them." },
      { line: [3], you: wait("waiting · downloadPhoto(…)"), other: oth(2, "other code · handle a tap"),
        cap: "<b>Suspend again.</b> While the photo downloads, the thread is free for other work." },
      { line: [4], you: run(1, "your code · show(photo)"), other: null,
        cap: "<b>Resume and finish.</b> The photo is ready and <code>show(photo)</code> runs. Two awaits gave other code two chances to run." }
    ];
    const s2 = stepper("f2", steps, s => { hot(code, s.line); place(stage, you, s.you); place(stage, other, s.other); });
    addEventListener("resize", () => s2.redraw());
  }

  /* =========================================================
     Fig 2b: top-down migration
     ========================================================= */
  {
    const layers = [
      { who: "Button action (UI)", sync: 'Button("Load") { model.load() }', async: 'Button("Load") { Task { await model.load() } }' },
      { who: "View model", sync: "func load()", async: "func load() async" },
      { who: "Service", sync: "func fetch() -> [Photo]", async: "func fetch() async -> [Photo]" },
      { who: "Network client", sync: "func get(_ url: URL) -> Data", async: "func get(_ url: URL) async -> Data" }
    ];
    let done = 0, bad = -1;
    const box = $("#f2b-layers"), status = $("#f2b-status");
    function draw() {
      box.innerHTML = layers.map((L, i) => {
        const conv = i < done;
        const link = i < layers.length - 1
          ? `<div class="link">${i < done && i + 1 < done ? "calls with await" : i < done ? "async code calling sync code: fine" : "plain call"}</div>`
          : "";
        return `<div class="layer${conv ? " async" : ""}${i === bad ? " bad" : ""}"><div><div class="who">${L.who}</div><code>${esc(conv ? L.async : L.sync)}</code></div><span class="tag ${conv ? "c-run" : "c-muted"}">${conv ? (i === 0 ? "starts a Task" : "async") : "sync"}</span></div>${link}`;
      }).join("");
      $("#f2b-top").disabled = done === layers.length;
      $("#f2b-bottom").disabled = done > 0;
    }
    $("#f2b-top").addEventListener("click", () => {
      bad = -1;
      done++;
      status.innerHTML = done === 1
        ? `<span class="c-ok">✓ The button can't be async, so it starts a <code>Task</code> and awaits inside it. It still calls the sync layers below with no problem.</span>`
        : done < layers.length
          ? `<span class="c-ok">✓ ${layers[done - 1].who} is async now. Its caller is already async, so it can await it, and it can still call the sync layer below.</span>`
          : `<span class="c-ok">✓ All four layers converted, top-down. At no point did sync code need to wait for async code.</span>`;
      draw();
    });
    $("#f2b-bottom").addEventListener("click", () => {
      bad = layers.length - 2;
      status.innerHTML = `<span class="c-cancel">✗ Making <code>get</code> async breaks <code>fetch()</code>: synchronous code can't call an async function and wait for its result. Bottom-up doesn't work.</span>`;
      draw();
    });
    $("#f2b-reset").addEventListener("click", () => { done = 0; bad = -1; status.textContent = "Every layer is synchronous. Start from the top."; draw(); });
    status.textContent = "Every layer is synchronous. Start from the top.";
    draw();
  }

  /* =========================================================
     Fig 3: array vs async sequence
     ========================================================= */
  {
    const rows = {
      a: { track: $("#f3-a"), con: $("#f3-con-a"), sus: $("#f3-sus-a"), chips: [{ s: 2.2, e: 3, text: "[IMG001, IMG99, IMG0404]", out: ["IMG001", "IMG99", "IMG0404"] }] },
      b: { track: $("#f3-b"), con: $("#f3-con-b"), sus: $("#f3-sus-b"), chips: [
        { s: 0.2, e: 1, text: "IMG001", out: ["IMG001"] }, { s: 1.2, e: 2, text: "IMG99", out: ["IMG99"] }, { s: 2.2, e: 3, text: "IMG0404", out: ["IMG0404"] }] }
    };
    Object.values(rows).forEach(r => r.chips.forEach(c => {
      c.el = document.createElement("span");
      c.el.className = "chip3";
      c.el.textContent = c.text;
      r.track.appendChild(c.el);
    }));
    function frame(t) {
      Object.entries(rows).forEach(([key, r]) => {
        const W = r.track.clientWidth;
        let lines = [];
        r.chips.forEach(c => {
          const w = c.el.offsetWidth;
          if (t < c.s || t >= c.e) c.el.style.opacity = 0;
          else { c.el.style.opacity = 1; c.el.style.transform = `translateX(${((t - c.s) / (c.e - c.s)) * Math.max(0, W - w - 90)}px)`; }
          if (t >= c.e) lines = lines.concat(c.out.map(o => `<div><span class="t">${c.e.toFixed(1)}s</span> got ${o}</div>`));
        });
        const busy = key === "a" ? t < 3 : r.chips.some(c => t < c.e);
        r.sus.style.opacity = busy && t > 0 ? 1 : 0;
        const html = lines.join("") || `<div class="t">${key === "a" ? "nothing yet: still waiting for the whole array" : "waiting for the first element"}</div>`;
        if (r.con.innerHTML !== html) r.con.innerHTML = html;
      });
    }
    frame(3.4);
    let stop3 = () => {};
    $("#f3-play").addEventListener("click", () => { stop3(); stop3 = play(3.4, frame); });
  }

  /* =========================================================
     Fig 4: the download race
     ========================================================= */
  {
    const seq = timeline($("#f4-seq"), {
      tmax: 5, labelW: 72,
      lanes: [
        { label: "IMG001", blocks: [{ s: 0, e: 1, c: "run", label: "1.0s" }] },
        { label: "IMG99", blocks: [{ s: 1, e: 3, c: "run", label: "2.0s" }] },
        { label: "IMG0404", blocks: [{ s: 3, e: 4.5, c: "run", label: "1.5s" }] }
      ]
    });
    const par = timeline($("#f4-par"), {
      tmax: 5, labelW: 72,
      markers: [{ t: 2, label: "await [first, second, third] returns" }],
      lanes: [
        { label: "IMG001", blocks: [{ s: 0, e: 1, c: "ok", label: "1.0s" }] },
        { label: "IMG99", blocks: [{ s: 0, e: 2, c: "ok", label: "2.0s" }] },
        { label: "IMG0404", blocks: [{ s: 0, e: 1.5, c: "ok", label: "1.5s" }] }
      ]
    });
    const tS = $("#f4-tseq"), tP = $("#f4-tpar");
    let stop4 = () => {};
    $("#f4-play").addEventListener("click", () => {
      stop4();
      stop4 = play(5, t => {
        seq(t); par(t);
        tS.textContent = Math.min(t, 4.5).toFixed(1) + "s";
        tP.textContent = Math.min(t, 2).toFixed(1) + "s";
      });
    });
  }

  /* =========================================================
     Fig 5: task group tree
     ========================================================= */
  {
    const tree = $("#f5-tree"), kidsEl = $("#f5-kids"), out = $("#f5-out"), explain = $("#f5-explain");
    const base = () => [{ n: "IMG001", d: 1.0 }, { n: "IMG99", d: 2.0 }, { n: "IMG0404", d: 1.5 }];
    const extra = ["IMG2024", "IMG7", "IMG512"];
    let kids = base(), running = false, stop5 = () => {};
    const ord = n => n + (["th", "st", "nd", "rd"][n % 10 > 3 || Math.floor(n / 10) === 1 ? 0 : n % 10] || "th");
    function connector() {
      const ns = kidsEl.children;
      if (!ns.length) return;
      const box = kidsEl.getBoundingClientRect(), f = ns[0].getBoundingClientRect(), l = ns[ns.length - 1].getBoundingClientRect();
      kidsEl.style.setProperty("--bl", f.left + f.width / 2 - box.left + "px");
      kidsEl.style.setProperty("--br", Math.max(0, box.right - (l.left + l.width / 2)) + "px");
    }
    function draw() {
      kidsEl.innerHTML = kids.map((k, i) =>
        `<div class="node" style="--i:${i + 1}"><span>${k.n}</span><div class="bar"><i></i></div><span class="badge-x bx-prio-child">priority: high</span><span class="badge-x bx-cancel">cancelled</span><span class="badge-x bx-local">requestID "A1"</span></div>`
      ).join("");
      connector();
      $("#f5-add").disabled = running || kids.length >= 6;
    }
    function intro() {
      out.innerHTML = `<div class="t">for await photo in group { … }  ← results appear here as children finish</div>`;
    }
    $("#f5-add").addEventListener("click", () => {
      if (kids.length >= 6) return;
      kids.push({ n: extra[kids.length - 3], d: Math.round(rand(0.8, 2.4) * 10) / 10 });
      draw();
    });
    $("#f5-reset").addEventListener("click", () => { stop5(); running = false; kids = base(); $("#f5-run").disabled = false; draw(); intro(); });
    $("#f5-run").addEventListener("click", () => {
      stop5();
      draw();
      running = true;
      $("#f5-run").disabled = true;
      $("#f5-add").disabled = true;
      out.innerHTML = `<div class="t">withTaskGroup: added ${kids.map(k => k.n).join(", ")}</div>`;
      const nodes = Array.from(kidsEl.children);
      let finished = 0;
      const tmax = Math.max(...kids.map(k => k.d)) + 0.2;
      stop5 = play(tmax, t => {
        kids.forEach((k, i) => {
          nodes[i].querySelector(".bar > i").style.width = Math.min(t / k.d, 1) * 100 + "%";
          if (t >= k.d && !k.done) {
            k.done = true;
            finished++;
            nodes[i].classList.add("finished");
            nodes[i].insertAdjacentHTML("beforeend", `<span class="order">${finished}</span>`);
            out.insertAdjacentHTML("beforeend", `<div><span class="t">${k.d.toFixed(1)}s</span> <span class="e-ok">for await → ${k.n}</span> <span class="t">(${ord(finished)} back)</span></div>`);
          }
        });
      }, 1, () => {
        const order = kids.slice().sort((a, b) => a.d - b.d).map(k => k.n);
        out.insertAdjacentHTML("beforeend", `<div class="e-ok">group returns [${order.join(", ")}]: completion order, not the order added</div>`);
        out.scrollTop = out.scrollHeight;
        kids.forEach(k => { delete k.done; });
        running = false;
        $("#f5-run").disabled = false;
        $("#f5-add").disabled = kids.length >= 6;
      });
    });
    const texts = {
      wait: "<b>You can't forget to wait.</b> <code>withTaskGroup</code> doesn't return until every child has finished, so no child is left running behind your back.",
      priority: "<b>Priority escalates.</b> Give a child a higher priority and the parent task's priority is raised to match automatically.",
      cancel: "<b>Cancellation flows down.</b> Cancel the parent and every child is cancelled automatically. Each child still has to notice it (section 6).",
      locals: "<b>Task-local values flow down.</b> A <code>@TaskLocal</code> value on the parent, like a request ID, is visible in every child, efficiently and automatically."
    };
    const chips = $$("#f5 .chip");
    chips.forEach(c => c.addEventListener("click", () => {
      const on = tree.dataset.demo !== c.dataset.demo;
      tree.dataset.demo = on ? c.dataset.demo : "";
      chips.forEach(x => x.setAttribute("aria-pressed", String(on && x === c)));
      explain.innerHTML = on ? texts[c.dataset.demo] : "Tap a benefit to see it on the tree.";
    }));
    addEventListener("resize", connector);
    draw();
    intro();
  }

  /* =========================================================
     Fig 6: cooperative cancellation
     ========================================================= */
  {
    const names = ["IMG001", "IMG002", "IMG003", "IMG004", "IMG005", "IMG006", "IMG007", "IMG008"];
    const ADD = 0.35, DL = 1.6, COOKS = 2;
    const rowsEl = $("#f6-rows"), logEl = $("#f6-log"), result = $("#f6-result");
    const startBtn = $("#f6-start"), cancelBtn = $("#f6-cancel");
    let sim = null, raf = 0;
    const STATE = {
      idle: ["not added", "c-muted"], queued: ["added, waiting", "c-muted"], running: ["downloading", "c-run"],
      done: ["done", "c-ok"], nil: ["returned nil", "c-wait"], skipped: ["never added", "c-cancel"]
    };
    function rows() {
      rowsEl.innerHTML = names.map((n, i) => `<div class="prow s-idle" id="p6-${i}"><span>${n}</span><span class="bar"><i></i></span><span class="st tag c-muted">not added</span></div>`).join("");
    }
    function setRow(i, st) {
      const r = $(`#p6-${i}`);
      r.className = `prow s-${st}`;
      const tag = $(".st", r);
      tag.textContent = STATE[st][0];
      tag.className = `st tag ${STATE[st][1]}`;
      if (st === "done") $(".bar > i", r).style.width = "100%";
    }
    function log(text, cls) {
      logEl.insertAdjacentHTML("beforeend", `<div class="${cls || ""}"><span class="t">${sim.t.toFixed(1)}s</span> ${text}</div>`);
      logEl.scrollTop = logEl.scrollHeight;
    }
    function reset() {
      cancelAnimationFrame(raf);
      sim = null;
      rows();
      logEl.innerHTML = `<div class="t">The group adds one photo every 0.35s. Each download takes 1.6s.</div>`;
      result.className = "report";
      result.textContent = "Press Start, then Cancel while photos are still downloading.";
      startBtn.disabled = false;
      cancelBtn.disabled = true;
    }
    function tick(dt) {
      const s = sim;
      s.t += dt;
      // 1. the for loop: addTaskUnlessCancelled
      while (!s.stopAdding && s.t >= s.nextAdd) {
        const i = s.added;
        if (s.cancelled) {
          log(`addTaskUnlessCancelled(${names[i]}) → false · break`, "e-cancel");
          for (let j = i; j < names.length; j++) { s.p[j].st = "skipped"; setRow(j, "skipped"); }
          s.stopAdding = true;
          break;
        }
        s.p[i].st = "queued";
        setRow(i, "queued");
        log(`addTaskUnlessCancelled(${names[i]}) → true`);
        s.added++;
        s.nextAdd += ADD;
        if (s.added === names.length) s.stopAdding = true;
      }
      // 2. downloads that finish
      s.p.forEach((p, i) => {
        if (p.st === "running" && s.t >= p.end) {
          p.st = "done";
          setRow(i, "done");
          s.results.push(names[i]);
          log(`${names[i]} finished → results.append${s.cancelled && p.start < s.cancelAt ? " (it started before the cancel)" : ""}`, "e-ok");
        }
      });
      // 3. free cooks pick up queued children, which check Task.isCancelled first
      let busy = s.p.filter(p => p.st === "running").length;
      for (let i = 0; i < names.length && busy < COOKS; i++) {
        const p = s.p[i];
        if (p.st !== "queued") continue;
        if (s.cancelled) {
          p.st = "nil";
          setRow(i, "nil");
          log(`${names[i]} starts: Task.isCancelled is true → return nil`, "e-wait");
        } else {
          p.st = "running";
          p.start = s.t;
          p.end = s.t + DL;
          setRow(i, "running");
          log(`${names[i]} starts: Task.isCancelled is false → download`);
          busy++;
        }
      }
      s.p.forEach((p, i) => {
        if (p.st === "running") $(`#p6-${i} .bar > i`).style.width = Math.min((s.t - p.start) / DL, 1) * 100 + "%";
      });
      // 4. finished?
      if (s.stopAdding && !s.p.some(p => p.st === "queued" || p.st === "running")) {
        s.over = true;
        log(`group returns ${s.results.length} of ${names.length} photos`, "e-ok");
        result.className = s.cancelled ? "report good" : "report";
        result.innerHTML = s.cancelled
          ? `<b>Partial result:</b> [${s.results.join(", ")}], ${s.results.length} of ${names.length} photos. Finished work was kept; nothing new started after the cancel.`
          : `All ${names.length} photos downloaded. Run it again and press Cancel partway through.`;
        startBtn.disabled = false;
        cancelBtn.disabled = true;
      }
    }
    startBtn.addEventListener("click", () => {
      reset();
      sim = { t: 0, nextAdd: 0, added: 0, stopAdding: false, cancelled: false, cancelAt: 0, results: [], over: false, p: names.map(() => ({ st: "idle" })) };
      logEl.innerHTML = "";
      result.textContent = "Running… press Cancel whenever you like.";
      startBtn.disabled = true;
      cancelBtn.disabled = false;
      let last = performance.now();
      const loop = now => {
        if (!sim || sim.over) return;
        tick(Math.min((now - last) / 1000, 0.1));
        last = now;
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    });
    cancelBtn.addEventListener("click", () => {
      if (!sim || sim.cancelled) return;
      sim.cancelled = true;
      sim.cancelAt = sim.t;
      cancelBtn.disabled = true;
      log("task.cancel() → the flag is set. Nothing stops on its own.", "e-cancel");
    });
    $("#f6-reset").addEventListener("click", reset);
    reset();
  }

  /* =========================================================
     Fig 7: what a new task inherits
     ========================================================= */
  {
    const out = $("#f7-out");
    function spawn(detached) {
      const row = (k, v, inh) => `<div class="row"><span>${k}</span><b class="${inh ? "inh" : "lost"}">${v} ${inh ? "✓" : "✗"}</b></div>`;
      const html = `<div class="ticket"><span class="t-head">${detached ? "Task.detached { }" : "Task { }"}</span>${
        row("isolation", detached ? "none" : "@MainActor", !detached)}${
        row("priority", detached ? "default" : ".high", !detached)}${
        row("requestID", detached ? '"none"' : '"A1"', !detached)}${
        row("parent task", "none", false)}</div>`;
      out.insertAdjacentHTML("afterbegin", html);
      while (out.children.length > 4) out.lastElementChild.remove();
    }
    $("#f7-task").addEventListener("click", () => spawn(false));
    $("#f7-det").addEventListener("click", () => spawn(true));
    spawn(true);
    spawn(false);
  }

  /* =========================================================
     Fig 8: data race vs actor
     ========================================================= */
  {
    let mode = "race", timer = 0;
    const A = $("#f8-a"), B = $("#f8-b"), countEl = $("#f8-count"), report = $("#f8-report"), shared = $("#f8-shared");
    const lock = seg($("#f8 .seg"), "mode", v => {
      mode = v;
      shared.classList.toggle("actor", v === "actor");
      $("#f8-kind").textContent = v === "actor" ? "inside an actor" : "a plain class";
      clearUI();
      report.className = "report";
      report.textContent = v === "actor"
        ? "Now the count lives in an actor. Each read-and-write happens as one turn; the other task waits at its await."
        : "Adding 1 means three steps: read the count, add 1, write it back. Run it and watch what happens when two tasks overlap.";
    });
    function clearUI() {
      countEl.textContent = "0";
      [A, B].forEach(r => { r.classList.remove("waiting"); $(".op", r).textContent = "ready"; $$(".dots i", r).forEach(d => d.classList.remove("on")); });
    }
    $("#f8-run").addEventListener("click", () => {
      clearInterval(timer);
      clearUI();
      let count = 0, lost = 0, holder = null;
      const T = [{ el: A, left: 5, ph: "read", local: 0 }, { el: B, left: 5, ph: "read", local: 0 }];
      $("#f8-run").disabled = true;
      lock(true);
      report.className = "report";
      report.textContent = "Running…";
      timer = setInterval(() => {
        const live = T.filter(x => x.left > 0);
        if (!live.length) {
          clearInterval(timer);
          $("#f8-run").disabled = false;
          lock(false);
          T.forEach(x => { x.el.classList.remove("waiting"); $(".op", x.el).textContent = "finished"; });
          if (mode === "actor") { report.className = "report good"; report.textContent = `Expected 10, got ${count}. The actor ran each read-and-write as one uninterrupted turn.`; }
          else if (lost) { report.className = "report bad"; report.textContent = `Expected 10, got ${count}. ${lost} update${lost > 1 ? "s were" : " was"} lost: both tasks read the same value before either wrote it back.`; }
          else { report.className = "report"; report.textContent = `Got 10 this time. Races depend on timing, which is why they hide. Run it again.`; }
          return;
        }
        const x = mode === "actor" && holder ? holder : live[Math.floor(Math.random() * live.length)];
        const op = $(".op", x.el);
        if (x.ph === "read") {
          x.local = count;
          x.ph = "write";
          op.textContent = `read count → ${count}`;
          if (mode === "actor") {
            holder = x;
            T.filter(y => y !== x && y.left > 0).forEach(y => { y.el.classList.add("waiting"); $(".op", y.el).textContent = "await: actor is busy, waiting"; });
          }
        } else {
          const overwrote = count !== x.local;
          if (overwrote) lost += count - x.local;
          count = x.local + 1;
          x.ph = "read";
          x.left--;
          $$(".dots i", x.el)[4 - x.left].classList.add("on");
          op.innerHTML = overwrote ? `write count = ${count} <span class="c-cancel">(overwrote the other task's work)</span>` : `write count = ${count}`;
          countEl.textContent = count;
          if (mode === "actor") { holder = null; T.forEach(y => y.el.classList.remove("waiting")); }
        }
      }, reduce ? 1 : 420);
    });
  }

  /* =========================================================
     Fig 9: hop to the main actor
     ========================================================= */
  {
    const stage = $("#f9-stage"), you = $("#f9-you"), other = $("#f9-other"), code = $("#f9-code"), ph = $("#f9-new");
    const steps = [
      { line: [1], you: { row: 1, text: "downloadPhoto(named:)", cls: "c-run", st: "running" }, other: { row: 0, text: "handle scroll", cls: "c-main" }, img: false,
        cap: "<b>Download in the background.</b> <code>downloadAndShowPhoto</code> isn't on the main actor, so the download runs elsewhere. The main actor stays free to scroll and handle taps." },
      { line: [2], you: { row: 1, text: "await show(photo)", cls: "c-wait", st: "waiting" }, other: { row: 0, text: "render frame", cls: "c-main" }, img: false,
        cap: "<b>Ask for the main actor.</b> <code>show(_:)</code> is <code>@MainActor</code>, so calling it from outside needs <code>await</code>. Your code waits for the main actor to finish what it's doing." },
      { line: [5, 6, 7, 8], you: { row: 0, text: "show(photo)", cls: "c-main", st: "running" }, other: null, img: true,
        cap: "<b>Your turn on the main actor.</b> <code>show(photo)</code> runs there and updates the UI." },
      { line: [], you: null, other: { row: 0, text: "handle tap", cls: "c-main" }, img: true,
        cap: "<b>Done.</b> Only the UI update ran on the main actor. The slow download never blocked scrolling or taps." }
    ];
    const s9 = stepper("f9", steps, s => {
      hot(code, s.line);
      place(stage, you, s.you);
      place(stage, other, s.other);
      ph.classList.toggle("new", s.img);
      ph.textContent = s.img ? "IMG0404" : "…";
    });
    addEventListener("resize", () => s9.redraw());
  }

  /* Fig 9b: whole type vs members */
  seg($("#f9b .seg"), "m", v => {
    const members = v === "members";
    $("#f9b-type").hidden = members;
    $("#f9b-members").hidden = !members;
    $$('#f9b-list .tag[data-ui="0"]').forEach(t => t.classList.toggle("off", members));
    $("#f9b-note").textContent = members
      ? "Only the UI state and the drawing code are main-actor. cachePhotos() and hasCachedPhotos can be used from anywhere."
      : "Everything in the type runs on the main actor, including the networking code that doesn't need to.";
  });

  /* =========================================================
     Fig 10: class vs actor
     ========================================================= */
  {
    const box = $("#f10-box"), mail = $("#f10-mail"), mEl = $("#f10-m"), maxEl = $("#f10-max"), rep = $("#f10-report");
    const t1 = $("#f10-t1 .op"), t2 = $("#f10-t2 .op"), r2 = $("#f10-t2");
    const S = (m, max, broken, a, b, waiting, msgs, report, cap) => ({ m, max, broken, a, b, waiting, msgs, report, cap });
    const classSteps = [
      S("[25]", 25, false, "calls update(with: 31)", "about to read the logger", false, null, null,
        "<b>Two tasks, one class instance.</b> Task 1 records a new reading of 31. Task 2 wants a summary: the latest readings and the max."),
      S("[25, 31]", 25, true, "measurements.append(31)", "…", false, null, null,
        "<b>The broken moment.</b> 31 is in the array, but <code>max</code> still says 25. The logger's rule, max is the largest reading, is false right now."),
      S("[25, 31]", 25, true, "(about to fix max)", "reads [25, 31], max 25", false, null, ["bad", "Task 2's summary: readings [25, 31], max 25. That's wrong."],
        "<b>Task 2 reads at the worst time.</b> Nothing about a class stops another task from reading in the middle of an update."),
      S("[25, 31]", 31, false, "max = 31 · done", "already used the bad data", false, null, ["bad", "Task 2's summary: readings [25, 31], max 25. That's wrong."],
        "<b>Too late.</b> Task 1 restores the rule, but Task 2 has already acted on the broken state.")
    ];
    const actorSteps = [
      S("[25]", 25, false, "await logger.update(with: 31)", "await logger.summary", true, [["update(with: 31)", "active"], ["summary", "queued"]], null,
        "<b>Two tasks, one actor.</b> Both call into the actor. It takes them one at a time: Task 1's call runs, Task 2's call waits its turn."),
      S("[25, 31]", 25, true, "measurements.append(31)", "suspended at await", true, [["update(with: 31)", "active"], ["summary", "queued"]], null,
        "<b>Same broken moment, sealed inside.</b> The rule is briefly false, but only code running on the actor could see it, and that's Task 1."),
      S("[25, 31]", 31, false, "max = 31 · returns", "suspended at await", true, [["summary", "active"]], null,
        "<b>No await inside update(with:).</b> So it runs start to finish before any other call gets in. The rule holds again."),
      S("[25, 31]", 31, false, "done", "reads [25, 31], max 31", false, [["summary", "active"]], ["good", "Task 2's summary: readings [25, 31], max 31. Correct."],
        "<b>Task 2's turn.</b> It can only ever see the logger between updates, when the rule holds.")
    ];
    let kind = "class", auto = 0;
    function render(s) {
      const isActor = kind === "actor";
      box.classList.toggle("plain", !isActor);
      $("#f10-kind").textContent = isActor ? "actor TemperatureLogger" : "class TemperatureLogger";
      mail.hidden = !isActor;
      mail.innerHTML = s.msgs ? `<span class="small muted">mailbox:</span>` + s.msgs.map(([t, st]) => `<span class="msg c-actor ${st}">${t}</span>`).join("") : "";
      mEl.textContent = s.m;
      maxEl.textContent = s.max;
      mEl.classList.toggle("broken", s.broken);
      maxEl.classList.toggle("broken", s.broken);
      t1.textContent = s.a;
      t2.textContent = s.b;
      r2.classList.toggle("waiting", s.waiting);
      if (s.report) { rep.hidden = false; rep.className = "report " + s.report[0]; rep.textContent = s.report[1]; }
      else { rep.hidden = false; rep.className = "report"; rep.textContent = "Task 2's summary: not read yet."; }
    }
    const s10 = stepper("f10", classSteps, render);
    const lock = seg($("#f10 .seg"), "k", v => {
      clearInterval(auto);
      kind = v;
      s10.steps = v === "actor" ? actorSteps : classSteps;
      s10.go(0);
    });
    $("#f10-auto").addEventListener("click", () => {
      clearInterval(auto);
      s10.go(0);
      lock(true);
      auto = setInterval(() => {
        if (s10.i >= s10.steps.length - 1) { clearInterval(auto); lock(false); return; }
        s10.go(s10.i + 1);
      }, reduce ? 10 : 1800);
    });
  }

  /* =========================================================
     Fig 12b: Sendable quiz
     ========================================================= */
  {
    const Q = [
      { code: "struct TemperatureReading {\n    var measurement: Int\n}", ans: true,
        why: "A struct whose stored properties are all sendable. It isn't public, so Swift makes it Sendable automatically." },
      { code: "class Counter {\n    var count = 0\n}", ans: false,
        why: "A class with a mutable property and nothing guarding it. Two tasks holding the same Counter could change count at once." },
      { code: "@MainActor\nclass PhotoStore {\n    var photos: [Data] = []\n}", ans: true,
        why: "Mutable, but the main actor guards it: every access runs on the main actor, one at a time." },
      { code: "final class Config: Sendable {\n    let name: String\n    let retries: Int\n}", ans: true,
        why: "No mutable state, and its constants are sendable. A class has to be final and declare Sendable itself." },
      { code: "enum LoadState {\n    case idle\n    case loading(progress: Double)\n}", ans: true,
        why: "An enum whose associated values are sendable is sendable, automatically when it isn't public." },
      { code: "struct Album {\n    var title: String\n    var counter: Counter\n}", ans: false,
        why: "One stored property is the non-sendable Counter class, so the struct as a whole can't be shared safely." },
      { code: "struct FileDescriptor {\n    let rawValue: Int\n}\n\n@available(*, unavailable)\nextension FileDescriptor: Sendable {}", ans: false,
        why: "It would qualify on its own, but the unavailable conformance explicitly opts it out." },
      { code: "actor TemperatureLogger {\n    var measurements: [Int] = []\n}", ans: true,
        why: "Every actor is Sendable: it protects its own state by serving one task at a time." }
    ];
    const quiz = $("#f12-quiz"), score = $("#f12-score");
    let answered = 0, right = 0;
    function build() {
      answered = 0; right = 0;
      score.textContent = `0 / ${Q.length} answered`;
      quiz.innerHTML = Q.map((q, i) => `<div class="qcard" data-i="${i}"><pre class="code"><code class="language-swift">${esc(q.code)}</code></pre><div class="qbtns"><button class="btn" type="button" data-a="1">Sendable</button><button class="btn" type="button" data-a="0">Not sendable</button></div><p class="why" hidden></p></div>`).join("");
      $$("code", quiz).forEach(prepCode);
    }
    quiz.addEventListener("click", e => {
      const b = e.target.closest("button[data-a]");
      if (!b) return;
      const card = b.closest(".qcard"), q = Q[+card.dataset.i];
      const ok = (b.dataset.a === "1") === q.ans;
      $$("button", card).forEach(x => { x.disabled = true; });
      card.classList.add(ok ? "right" : "wrong");
      const why = $(".why", card);
      why.hidden = false;
      why.innerHTML = `<span class="verdict">${ok ? "Right" : "Not quite"}: ${q.ans ? "Sendable" : "not Sendable"}.</span> ${q.why}`;
      answered++;
      if (ok) right++;
      score.textContent = answered === Q.length ? `${right} / ${Q.length} correct` : `${answered} / ${Q.length} answered · ${right} right`;
    });
    $("#f12-reset").addEventListener("click", build);
    build();
  }

  /* =========================================================
     Recap: multiple choice
     ========================================================= */
  {
    const M = [
      { q: "What does await mark?", opts: ["A spot where the function might pause", "A spot that always runs on a background thread", "A spot that blocks the thread until the result is ready"], a: 0,
        fb: "await marks a possible suspension point. While your code is suspended, the thread is free for other work. Nothing blocks." },
      { q: "Three downloads take 1.0s, 2.0s and 1.5s. With async let, about how long until all three are back?", opts: ["4.5s", "2.0s", "1.0s"], a: 1,
        fb: "They run at the same time, so you wait for the slowest one: about 2.0s, given enough resources." },
      { q: "You cancel a task that's halfway through a download. What happens?", opts: ["It stops immediately", "Its cancelled flag is set, and its own code decides when and how to stop", "Its child tasks keep running until you cancel each one"], a: 1,
        fb: "Cancellation is cooperative. Child tasks are cancelled automatically too, but each one still has to check." },
      { q: "Which one runs with the current actor isolation, priority and task-local values?", opts: ["Task { }", "Task.detached { }", "Both"], a: 0,
        fb: "Task { } behaves like the code around it. Task.detached starts from a clean slate." },
      { q: "Inside an actor method with no await, can another task see half-updated state?", opts: ["Yes, actors only protect properties, not methods", "No: the actor runs one piece of code at a time, and code without await can't be interrupted"], a: 1,
        fb: "No await means no suspension point, so the method finishes before anyone else gets a turn." },
      { q: "Can synchronous code call an async function and wait for its result?", opts: ["Yes, with a semaphore", "No, there's no safe way, so convert callers from the top down", "Yes, if the function is @MainActor"], a: 1,
        fb: "The standard library leaves this out on purpose because it leads to races and deadlocks. Sync code can start a Task, but it can't wait for it." }
    ];
    const root = $("#mcq");
    root.innerHTML = M.map((m, i) => `<div class="mcq" data-i="${i}"><p class="q">${i + 1}. ${esc(m.q)}</p><div class="opts">${m.opts.map((o, j) => `<button type="button" data-j="${j}">${esc(o)}</button>`).join("")}</div><p class="fb" hidden></p></div>`).join("");
    root.addEventListener("click", e => {
      const b = e.target.closest("button[data-j]");
      if (!b) return;
      const box = b.closest(".mcq"), m = M[+box.dataset.i], j = +b.dataset.j;
      $$("button", box).forEach((x, k) => { x.classList.toggle("right", k === m.a); x.classList.toggle("wrong", k === j && j !== m.a); });
      const fb = $(".fb", box);
      fb.hidden = false;
      fb.innerHTML = `<b class="${j === m.a ? "c-ok" : "c-cancel"}">${j === m.a ? "Right." : "Not quite."}</b> ${esc(m.fb)}`;
    });
  }

  /* =========================================================
     Progress: done buttons, rail, top bar (this browser only)
     ========================================================= */
  {
    const KEY = "swift-guide:concurrency";
    const ids = $$("section.sec").map(s => s.id);
    let done = new Set();
    try { done = new Set((JSON.parse(localStorage.getItem(KEY) || "[]") || []).filter(id => ids.includes(id))); } catch (e) { /* storage blocked */ }
    function paint() {
      $$(".done-btn").forEach(b => {
        const on = done.has(b.dataset.done);
        b.setAttribute("aria-pressed", String(on));
        b.textContent = on ? "✓ Done" : "Mark as done";
      });
      $$(".rail a").forEach(a => a.classList.toggle("done", done.has(a.hash.slice(1))));
      const n = done.size;
      $("#prog-text").textContent = `${n} / ${ids.length} done`;
      $("#toc-count").textContent = `${n} / ${ids.length}`;
      $("#prog-bar").style.width = (n / ids.length) * 100 + "%";
    }
    $$(".done-btn").forEach(b => b.addEventListener("click", () => {
      const id = b.dataset.done;
      if (done.has(id)) done.delete(id); else done.add(id);
      try { localStorage.setItem(KEY, JSON.stringify([...done])); } catch (e) { /* storage blocked */ }
      paint();
    }));
    paint();

    // Open the section list on wide screens; it's a collapsible list on narrow ones.
    const wide = matchMedia("(min-width: 1001px)");
    const syncToc = () => { $("#toc").open = wide.matches; };
    syncToc();
    wide.addEventListener("change", syncToc);

    // Highlight the section being read.
    const links = new Map($$(".rail a").map(a => [a.hash.slice(1), a]));
    if ("IntersectionObserver" in window) {
      const io = new IntersectionObserver(entries => {
        entries.forEach(en => {
          if (!en.isIntersecting) return;
          links.forEach(a => a.classList.remove("here"));
          const a = links.get(en.target.id);
          if (a) a.classList.add("here");
        });
      }, { rootMargin: "-35% 0px -60% 0px" });
      $$("section.sec").forEach(s => io.observe(s));
    }
  }
})();
