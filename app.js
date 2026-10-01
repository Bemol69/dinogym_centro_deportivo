/* DINOGYM — interacciones y animaciones (sin librerías) */
(() => {
  const D = window.__DG__ || { bloques: [], feriados: [] };
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fmt = (n) => Math.round(n).toLocaleString("es-CL").replace(/,/g, ".");
  const store = {
    get(k) { try { return sessionStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { sessionStorage.setItem(k, v); } catch {} },
  };

  /* ---------- Intro: mordida que abre la página ---------- */
  const hero = $(".hero");
  $$(".hero__title .w > span").forEach((s, i) => s.style.setProperty("--d", `${0.08 + i * 0.07}s`));
  const startHero = () => hero && hero.classList.add("is-in");

  const intro = $(".intro");
  if (!intro) startHero();
  else if (reduce || store.get("dg_intro")) {
    intro.remove();
    startHero();
  } else {
    store.set("dg_intro", "1");
    const at = (ms, fn) => setTimeout(fn, ms);
    at(260, () => intro.classList.add("is-bite"));
    at(520, () => { intro.classList.remove("is-bite"); intro.classList.add("is-snap"); });
    at(900, () => intro.classList.add("is-open"));
    at(1000, startHero);
    at(1800, () => intro.remove());
  }

  /* ---------- Aparición al hacer scroll ---------- */
  const countUp = (el) => {
    const to = Number(el.dataset.count) || 0;
    if (reduce || !to) return;
    const t0 = performance.now(), dur = 1100;
    const step = (now) => {
      const p = Math.min(1, (now - t0) / dur);
      el.textContent = fmt(to * (1 - Math.pow(1 - p, 4)));
      if (p < 1) requestAnimationFrame(step);
      else el.textContent = fmt(to);
    };
    requestAnimationFrame(step);
  };

  const onIn = (el) => {
    el.classList.add("is-in");
    $$("[data-count]", el).forEach(countUp);
  };

  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => {
        if (e.isIntersecting) { onIn(e.target); io.unobserve(e.target); }
      }),
      { rootMargin: "0px 0px -8% 0px", threshold: 0.12 }
    );
    $$("[data-reveal], .tracks").forEach((el) => io.observe(el));

    // La mascota se pausa cuando no está en pantalla (ahorra batería)
    const rex = $(".mascot");
    if (rex) new IntersectionObserver(([e]) => rex.classList.toggle("is-paused", !e.isIntersecting)).observe(rex);
  } else {
    $$("[data-reveal], .tracks").forEach(onIn);
  }

  /* ---------- Navegación: fondo, progreso, botón flotante, sección activa ---------- */
  const nav = $(".nav"), bar = $(".progress i"), fab = $(".fab");
  const links = $$(".nav__links a");
  const secs = links.map((a) => $(a.getAttribute("href"))).filter(Boolean);
  let ticking = false;
  const onScroll = () => {
    ticking = false;
    const y = scrollY, max = document.documentElement.scrollHeight - innerHeight;
    nav && nav.classList.toggle("is-scrolled", y > 10);
    bar && bar.style.setProperty("--p", max > 0 ? Math.min(1, y / max).toFixed(4) : 0);
    fab && fab.classList.toggle("is-on", y > innerHeight * 0.6);
    let cur = null;
    for (const s of secs) if (s.getBoundingClientRect().top < innerHeight * 0.4) cur = s;
    links.forEach((a) => a.classList.toggle("is-active", !!cur && a.getAttribute("href") === "#" + cur.id));
  };
  addEventListener("scroll", () => { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
  onScroll();

  /* ---------- Menú móvil ---------- */
  const burger = $(".burger"), menu = $("#menu");
  const setMenu = (open) => {
    if (!menu || !burger) return;
    menu.hidden = !open;
    burger.setAttribute("aria-expanded", String(open));
    burger.setAttribute("aria-label", open ? "Cerrar menú" : "Abrir menú");
    $("use", burger).setAttribute("href", open ? "#i-x" : "#i-menu");
    document.body.style.overflow = open ? "hidden" : "";
  };
  burger && burger.addEventListener("click", () => setMenu(menu.hidden));
  menu && $$("a", menu).forEach((a) => a.addEventListener("click", () => setMenu(false)));
  addEventListener("keydown", (e) => { if (e.key === "Escape" && menu && !menu.hidden) { setMenu(false); burger.focus(); } });
  matchMedia("(min-width: 921px)").addEventListener("change", (e) => e.matches && setMenu(false));

  /* ---------- Pestañas de planes ---------- */
  const tabs = $(".tabs");
  if (tabs) {
    const btns = $$(".tab", tabs), ink = $(".tabs__ink", tabs);
    const place = () => {
      const on = btns.find((b) => b.classList.contains("is-on"));
      if (!on || !ink) return;
      ink.style.width = on.offsetWidth + "px";
      ink.style.transform = `translateX(${on.offsetLeft}px)`;
    };
    const select = (b, focus) => {
      btns.forEach((x) => {
        const on = x === b;
        x.classList.toggle("is-on", on);
        x.setAttribute("aria-selected", String(on));
        x.tabIndex = on ? 0 : -1;
        const panel = document.getElementById(x.getAttribute("aria-controls"));
        panel && panel.classList.toggle("is-on", on);
      });
      if (focus) b.focus();
      place();
    };
    btns.forEach((b, i) => {
      b.addEventListener("click", () => select(b));
      b.addEventListener("keydown", (e) => {
        const k = e.key;
        if (k !== "ArrowRight" && k !== "ArrowLeft" && k !== "Home" && k !== "End") return;
        e.preventDefault();
        const n = k === "Home" ? 0 : k === "End" ? btns.length - 1 : (i + (k === "ArrowRight" ? 1 : -1) + btns.length) % btns.length;
        select(btns[n], true);
      });
    });
    place();
    tabs.classList.add("is-ready");
    addEventListener("resize", place);
    document.fonts && document.fonts.ready.then(place);
  }

  /* ---------- Horario: abierto / cerrado en hora de Chile ---------- */
  const status = $(".status");
  const DIAS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];
  const WD = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
  const mins = (t) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
  const pad = (n) => String(n).padStart(2, "0");

  function chileNow() {
    const parts = {};
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Santiago", year: "numeric", month: "2-digit", day: "2-digit",
      weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(new Date()).forEach((p) => (parts[p.type] = p.value));
    return { y: +parts.year, m: +parts.month, d: +parts.day, wd: WD[parts.weekday], min: (+parts.hour % 24) * 60 + +parts.minute };
  }
  const blockFor = (wd) => D.bloques.find((b) => (b.desde <= b.hasta ? wd >= b.desde && wd <= b.hasta : wd >= b.desde || wd <= b.hasta));

  function updateStatus() {
    let now;
    try { now = chileNow(); } catch { return; }
    const txt = status && $(".status__txt", status);
    const isHoliday = (k) => {
      const dt = new Date(Date.UTC(now.y, now.m - 1, now.d + k));
      return D.feriados.includes(`${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`);
    };
    const nextOpen = () => {
      for (let k = 1; k <= 7; k++) {
        const wd = (now.wd + k) % 7, b = blockFor(wd);
        if (b && !isHoliday(k)) return `abre ${k === 1 ? "mañana" : "el " + DIAS[wd]} a las ${b.abre}`;
      }
      return "";
    };
    const today = blockFor(now.wd);
    let open = false, msg;
    if (isHoliday(0)) msg = `Hoy cerrado por feriado · ${nextOpen()}`;
    else if (today && now.min >= mins(today.abre) && now.min < mins(today.cierra)) { open = true; msg = `Abierto ahora · cierra a las ${today.cierra}`; }
    else if (today && now.min < mins(today.abre)) msg = `Cerrado ahora · abre hoy a las ${today.abre}`;
    else msg = `Cerrado ahora · ${nextOpen()}`;
    if (status && txt) {
      status.classList.toggle("is-open", open);
      status.classList.toggle("is-closed", !open);
      txt.textContent = msg.replace(/ · $/, "");
    }
    // Semana: destaca hoy y marca la hora actual en la barra (escala 05:00–23:00)
    $$(".wk__row").forEach((r) => {
      const isToday = Number(r.dataset.day) === now.wd;
      r.classList.toggle("is-today", isToday);
      let mark = $(".wk__now", r);
      const h = now.min / 60;
      if (isToday && h >= 5 && h <= 23) {
        if (!mark) { mark = document.createElement("em"); mark.className = "wk__now"; $(".wk__bar", r).appendChild(mark); }
        mark.style.left = `${((h - 5) / 18) * 100}%`;
      } else if (mark) mark.remove();
    });
  }
  if (D.bloques && D.bloques.length) {
    updateStatus();
    setInterval(updateStatus, 60000);
  }
})();
