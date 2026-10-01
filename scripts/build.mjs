// Arma el sitio final en dist/ a partir de index.html + data/*.json
// Uso: node scripts/build.mjs   (Vercel lo ejecuta en cada commit, incluidos los del panel /admin)
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const DIST = path.join(ROOT, "dist");
const cfg = readJSON("sitio.config.json");
const SITE = (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : cfg.site_url).replace(/\/$/, "");

function readJSON(rel) {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf8"));
  } catch (e) {
    throw new Error(`No se pudo leer ${rel}: ${e.message}`);
  }
}
const esc = (s = "") => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const num = (n) => Math.round(Number(n) || 0).toLocaleString("es-CL").replace(/,/g, ".");
const clp = (n) => "$" + num(n);
const icon = (n, cls = "i") => `<svg class="${cls}" aria-hidden="true"><use href="#i-${n}"/></svg>`;

const aj = readJSON("data/ajustes.json");
const pl = readJSON("data/planes.json");
const sv = readJSON("data/servicios.json");
const ho = readJSON("data/horario.json");
const ga = readJSON("data/galeria.json");

// ---------- validaciones (errores claros en el log de Vercel) ----------
if (aj.whatsapp && !/^56\d{9}$/.test(aj.whatsapp)) throw new Error(`WhatsApp inválido "${aj.whatsapp}": usa 569XXXXXXXX (11 dígitos)`);
if (!aj.instagram) throw new Error("Falta el usuario de Instagram en data/ajustes.json");
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const DIAS = ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"];
const DIAS_C = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const bloques = (ho.bloques || []).filter((b) => b && b.desde && b.hasta);
for (const b of bloques) {
  if (!HORA.test(b.abre) || !HORA.test(b.cierra)) throw new Error(`Horario inválido en "${b.dias}": usa HH:MM (ej 06:00)`);
  if (!DIAS.includes(b.desde) || !DIAS.includes(b.hasta)) throw new Error(`Día inválido en el bloque "${b.dias}"`);
}

const grupos = (pl.grupos || []).filter((g) => g && g.id && g.nombre);
const planes = (pl.planes || [])
  .filter((p) => p && p.visible !== false && p.nombre)
  .map((p) => ({ ...p, precio: Math.max(0, Math.round(Number(p.precio) || 0)), personas: Math.max(1, Math.round(Number(p.personas) || 1)) }));
// Un plan con un grupo que ya no existe se muestra en el primer grupo (para que no desaparezca sin aviso)
for (const p of planes) {
  if (!grupos.some((g) => g.id === p.grupo)) {
    console.warn(`Aviso: el plan "${p.nombre}" tiene un grupo que no existe ("${p.grupo}"); se muestra en "${grupos[0]?.nombre}".`);
    p.grupo = grupos[0]?.id;
  }
}
const gruposConPlanes = grupos.filter((g) => planes.some((p) => p.grupo === g.id));
if (!gruposConPlanes.length) throw new Error("No hay planes visibles en data/planes.json");

const servicios = (sv.servicios || []).filter((s) => s && s.visible !== false && s.nombre);
const fotos = (ga.fotos || []).filter((f) => f && f.foto).map((f) => ({ ...f, foto: f.foto.replace(/^\//, "") }));
for (const f of fotos) if (!fs.existsSync(path.join(ROOT, f.foto))) console.warn(`Aviso: falta la foto ${f.foto}`);

const IG = `https://www.instagram.com/${aj.instagram}/`;
const IG_DM = `https://ig.me/m/${aj.instagram}`;
// WhatsApp: siempre api.whatsapp.com (wa.me rompe algunos caracteres al redirigir)
const wa = (txt) => (aj.whatsapp ? `https://api.whatsapp.com/send?phone=${aj.whatsapp}&text=${encodeURIComponent(txt)}` : IG_DM);
const WA_GENERAL = wa(`Hola ${aj.nombre}, quiero información para inscribirme.`);
const telVisible = aj.whatsapp ? `+56 9 ${aj.whatsapp.slice(3, 7)} ${aj.whatsapp.slice(7)}` : "";

// ---------- portada ----------
// El lema se parte en palabras (para animarlas) y "fuerza" queda destacada
const LEMA_HTML = esc(aj.lema)
  .split(" ")
  .map((w) => `<span class="w"><span${/^fuerza$/i.test(w) ? ' class="hl"' : ""}>${w}</span></span>`)
  .join(" ");

const nota = Number(aj.google_nota) || 0;
const RATING = nota
  ? `<a class="rating" href="${esc(aj.maps_url)}" target="_blank" rel="noopener"><span class="rating__stars">${icon("star")}${icon("star")}${icon("star")}${icon("star")}${icon("star")}</span><b>${String(nota).replace(".", ",")}</b><small>en Google${aj.google_resenas ? ` · ${num(aj.google_resenas)} reseñas` : ""}</small></a>`
  : "";

const valores = (aj.valores || []).filter(Boolean);
const MARQUEE = Array(4)
  .fill(valores.map((v) => `<span>${esc(v)}</span>${icon("diente", "tooth")}`).join(""))
  .join("");

const BENEFICIOS = (aj.beneficios || [])
  .filter((b) => b && b.titulo)
  .map(
    (b, i) => `
        <li class="perk" data-reveal style="--d:${i * 0.08}s">
          <span class="perk__ico">${icon(b.icono || "check")}</span>
          <div><h3>${esc(b.titulo)}</h3><p>${esc(b.texto)}</p></div>
        </li>`
  )
  .join("");

// ---------- planes ----------
const personasIco = (n) => `<span class="ppl" aria-label="${n} ${n === 1 ? "persona" : "personas"}">${Array.from({ length: Math.min(n, 6) }, () => icon("person")).join("")}</span>`;

function planCard(p, i, g) {
  const consultar = !p.precio;
  const porPersona = !consultar && p.personas > 1 ? `<p class="plan__each">${clp(p.precio / p.personas)} por persona</p>` : "";
  const msg = `Hola ${aj.nombre}, quiero el ${p.nombre}${g.id !== "general" ? ` (${g.nombre})` : ""}${consultar ? "" : ` de ${clp(p.precio)}`}. ¿Me dan más información?`;
  const incluye = (p.incluye || []).filter(Boolean).map((x) => `<li>${icon("check")}${esc(x)}</li>`).join("");
  return `
          <article class="plan${p.destacado ? " plan--hot" : ""}" data-reveal style="--d:${i * 0.07}s">
            ${p.etiqueta ? `<span class="plan__tag">${p.destacado ? icon("llama") : ""}${esc(p.etiqueta)}</span>` : ""}
            <header class="plan__head">
              <h3 class="plan__name">${esc(p.nombre)}</h3>
              ${personasIco(p.personas)}
            </header>
            <p class="plan__price">${
              consultar
                ? `<span class="plan__ask">Consultar</span>`
                : `<span class="cur">$</span><span class="amt" data-count="${p.precio}">${num(p.precio)}</span><small>/${esc(p.periodo || "mes")}</small>`
            }</p>
            ${porPersona}
            ${p.detalle ? `<p class="plan__det">${esc(p.detalle)}</p>` : ""}
            ${incluye ? `<ul class="plan__list">${incluye}</ul>` : ""}
            <a class="btn ${p.destacado ? "btn--gold" : "btn--line"} plan__cta" href="${esc(wa(msg))}" target="_blank" rel="noopener">${consultar ? "Consultar valor" : "Quiero este plan"} ${icon("arrow-right")}</a>
          </article>`;
}

const PLANES_TABS = gruposConPlanes
  .map(
    (g, i) =>
      `<button type="button" role="tab" class="tab${i === 0 ? " is-on" : ""}" id="tab-${esc(g.id)}" aria-controls="panel-${esc(g.id)}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}">${icon(g.id === "estudiantes" ? "estudiante" : "pesa")}${esc(g.nombre)}</button>`
  )
  .join("");

const PLANES_PANELS = gruposConPlanes
  .map((g, gi) => {
    const lista = planes.filter((p) => p.grupo === g.id);
    return `
        <div class="plans__panel${gi === 0 ? " is-on" : ""}" role="tabpanel" id="panel-${esc(g.id)}" aria-labelledby="tab-${esc(g.id)}">
          <h3 class="plans__group">${esc(g.nombre)}</h3>
          ${g.nota ? `<p class="plans__note">${icon("alert")}${esc(g.nota)}</p>` : ""}
          <div class="plans__grid plans__grid--${Math.min(lista.length, 4)}">${lista.map((p, i) => planCard(p, i, g)).join("")}
          </div>
        </div>`;
  })
  .join("");

// ---------- servicios ----------
const SERVICIOS = servicios
  .map(
    (s, i) => `
        <article class="svc" data-reveal style="--d:${(i % 3) * 0.08}s">
          <div class="svc__top">
            <span class="svc__ico">${icon(s.icono || "pesa")}</span>
            ${s.etiqueta ? `<span class="svc__tag">${esc(s.etiqueta)}</span>` : `<span class="svc__n">${String(i + 1).padStart(2, "0")}</span>`}
          </div>
          <h3>${esc(s.nombre)}</h3>
          <p>${esc(s.texto)}</p>
          <a class="svc__link" href="${esc(wa(`Hola ${aj.nombre}, quiero información sobre ${s.nombre}.`))}" target="_blank" rel="noopener">Consultar ${icon("arrow-up-right")}</a>
        </article>`
  )
  .join("");

// ---------- galería ----------
const GALERIA = fotos
  .map(
    (f, i) => `
        <figure class="shot${i === 0 ? " shot--big" : ""}" data-reveal style="--d:${i * 0.08}s">
          <img src="/${esc(f.foto)}" alt="${esc(f.texto || aj.nombre)}" loading="lazy" decoding="async">
          ${f.texto ? `<figcaption>${esc(f.texto)}</figcaption>` : ""}
        </figure>`
  )
  .join("");

// ---------- horario ----------
const HORARIO = bloques
  .map(
    (b) => `
          <div class="hrow">
            <div class="hrow__d">${icon("calendario")}<span>${esc(b.dias)}</span></div>
            <div class="hrow__t"><b>${esc(b.abre)}</b><i aria-hidden="true"></i><b>${esc(b.cierra)}</b></div>
          </div>`
  )
  .join("") +
  (ho.cerrado_texto
    ? `
          <div class="hrow hrow--off">
            <div class="hrow__d">${icon("x")}<span>${esc(ho.cerrado_texto)}</span></div>
            <div class="hrow__t"><b>Cerrado</b></div>
          </div>`
    : "");

const enBloque = (b, di) => {
  const a = DIAS.indexOf(b.desde), z = DIAS.indexOf(b.hasta);
  return a <= z ? di >= a && di <= z : di >= a || di <= z;
};
const horas = (t) => { const [H, M] = t.split(":").map(Number); return H + M / 60; };
// La barra de cada día va de 05:00 a 23:00 para que las franjas se lean bien
const H0 = 5, H1 = 23;
const SEMANA = DIAS.map((d, di) => {
  const b = bloques.find((x) => enBloque(x, di));
  const l = b ? ((horas(b.abre) - H0) / (H1 - H0)) * 100 : 0;
  const w = b ? ((horas(b.cierra) - horas(b.abre)) / (H1 - H0)) * 100 : 0;
  return `<div class="wk__row" data-day="${di}"><span class="wk__d">${DIAS_C[di]}</span><div class="wk__bar">${b ? `<i style="left:${l.toFixed(2)}%;width:${w.toFixed(2)}%"></i>` : ""}</div><small>${b ? `${b.abre}–${b.cierra}` : "Cerrado"}</small></div>`;
}).join("");

const feriados = (ho.feriados || []).filter((f) => f && /^\d{2}-\d{2}$/.test(f.fecha));
const FERIADOS = feriados.map((f) => `<li>${esc(f.nombre || f.fecha)}</li>`).join("");

const AVISO = ho.aviso_activo && ho.aviso_texto ? `<div class="notice" role="status">${icon("alert")}<p>${esc(ho.aviso_texto)}</p></div>` : "";

// ---------- datos para app.js ----------
const clientData = {
  bloques: bloques.map((b) => ({ desde: DIAS.indexOf(b.desde), hasta: DIAS.indexOf(b.hasta), abre: b.abre, cierra: b.cierra })),
  feriados: feriados.map((f) => f.fecha),
};

// ---------- SEO ----------
const NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const ld = {
  "@context": "https://schema.org",
  "@type": "ExerciseGym",
  name: aj.nombre_completo || aj.nombre,
  url: SITE + "/",
  image: SITE + "/img/og.jpg",
  logo: SITE + "/img/logo.jpg",
  telephone: aj.whatsapp ? "+" + aj.whatsapp : undefined,
  address: { "@type": "PostalAddress", streetAddress: aj.direccion, addressLocality: aj.comuna, addressRegion: aj.region, addressCountry: "CL" },
  geo: { "@type": "GeoCoordinates", latitude: -34.4113997, longitude: -70.8566349 },
  openingHoursSpecification: bloques.map((b) => ({
    "@type": "OpeningHoursSpecification",
    dayOfWeek: NAMES.filter((_, di) => enBloque(b, di)),
    opens: b.abre,
    closes: b.cierra,
  })),
  sameAs: [IG],
  makesOffer: planes.filter((p) => p.precio).map((p) => ({ "@type": "Offer", name: p.nombre, price: p.precio, priceCurrency: "CLP" })),
};
const conPrecio = planes.filter((p) => p.precio);
if (conPrecio.length) ld.priceRange = `${clp(Math.min(...conPrecio.map((p) => p.precio)))} - ${clp(Math.max(...conPrecio.map((p) => p.precio)))}`;
const desde = conPrecio.length ? clp(Math.min(...conPrecio.map((p) => p.precio))) : "";

const vars = {
  SITE,
  NOMBRE: esc(aj.nombre),
  NOMBRE_COMPLETO: esc(aj.nombre_completo || aj.nombre),
  SEO_TITULO: esc(`Gimnasio en ${aj.comuna} | ${aj.nombre_completo || aj.nombre}`),
  SEO_DESC: esc(`Gimnasio en ${aj.direccion}, ${aj.comuna}. ${desde ? `Planes desde ${desde} al mes, ` : ""}planes para estudiantes, Plan AM, personal trainer, kickboxing y jiu-jitsu. Sin matrícula ni inscripción.`),
  IG,
  IG_USER: esc(aj.instagram),
  WA_GENERAL: esc(WA_GENERAL),
  WA_LABEL: aj.whatsapp ? "WhatsApp" : "Escríbenos",
  TEL: esc(telVisible),
  TEL_HREF: aj.whatsapp ? `tel:+${aj.whatsapp}` : IG_DM,
  DIRECCION: esc(aj.direccion),
  COMUNA: esc(aj.comuna),
  REGION: esc(aj.region),
  MAPS_URL: esc(aj.maps_url),
  RUTA_URL: esc(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${aj.direccion}, ${aj.comuna}, Chile`)}`),
  MAPS_EMBED: esc(`https://www.google.com/maps?q=${encodeURIComponent(`${aj.direccion}, ${aj.comuna}, Chile`)}&z=16&output=embed`),
  LEMA: esc(aj.lema),
  LEMA_HTML,
  HERO_BAJADA: esc(aj.hero_bajada),
  RATING,
  MARQUEE,
  BENEFICIOS,
  PLANES_TABS,
  PLANES_PANELS,
  SERVICIOS,
  GALERIA,
  HORARIO,
  SEMANA,
  FERIADOS,
  FERIADOS_NOTA: esc(ho.feriados_nota),
  AVISO,
  CIERRE_TITULO: esc(aj.cierre_titulo),
  CIERRE_TEXTO: esc(aj.cierre_texto),
  DATA: JSON.stringify(clientData).replace(/</g, "\\u003c"),
  LD: JSON.stringify(ld).replace(/</g, "\\u003c"),
  YEAR: String(new Date().getFullYear()),
  ICONS: fs.readFileSync(path.join(ROOT, "icons.svg"), "utf8"),
  V: String(Date.now()),
};

let html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
// Bloques opcionales <!-- SI:X -->...<!-- /SI:X -->
const cond = {
  SERVICIOS: servicios.length > 0,
  GALERIA: fotos.length > 0,
  FERIADOS: feriados.length > 0,
  BENEFICIOS: (aj.beneficios || []).length > 0,
  TABS: gruposConPlanes.length > 1,
  WHATSAPP: Boolean(aj.whatsapp),
};
html = html.replace(/<!-- SI:(\w+) -->([\s\S]*?)<!-- \/SI:\1 -->/g, (_, k, body) => {
  if (!(k in cond)) throw new Error(`Bloque SI:${k} sin condición en build.mjs`);
  return cond[k] ? body : "";
});
html = html.replace(/%%(\w+)%%/g, (m, k) => {
  if (!(k in vars)) throw new Error(`Falta el valor ${k} en build.mjs`);
  return vars[k];
});

// ---------- escribir dist ----------
fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });
const copy = (rel) => fs.cpSync(path.join(ROOT, rel), path.join(DIST, rel), { recursive: true });
["img", "styles.css", "app.js", "data"].forEach(copy);
fs.mkdirSync(path.join(DIST, "admin"));
fs.copyFileSync(path.join(ROOT, "admin/index.html"), path.join(DIST, "admin/index.html"));
fs.writeFileSync(
  path.join(DIST, "admin/config.yml"),
  fs.readFileSync(path.join(ROOT, "admin/config.yml"), "utf8").replace(/%%GITHUB_REPO%%/g, cfg.github_repo).replace(/%%SITE_URL%%/g, SITE)
);
fs.writeFileSync(path.join(DIST, "index.html"), html);
fs.writeFileSync(path.join(DIST, "robots.txt"), `User-agent: *\nAllow: /\nDisallow: /admin/\n\nSitemap: ${SITE}/sitemap.xml\n`);
fs.writeFileSync(
  path.join(DIST, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${SITE}/</loc><lastmod>${new Date().toISOString().slice(0, 10)}</lastmod></url></urlset>\n`
);
console.log(`Listo: dist/ · ${planes.length} planes en ${gruposConPlanes.length} grupos · ${servicios.length} servicios · ${fotos.length} fotos · ${SITE}`);
