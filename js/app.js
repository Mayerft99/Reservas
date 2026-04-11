// ── app.js ────────────────────────────────────────────────────────────────────

import {
  fetchMesas, crearMesa, suscribirCambios, verificarSesion, obtenerUsuario,
  logout, eliminarMesa, getSectorConfig, setSectorConfig, getCroquisDir,
  setCroquisDir, fetchHistorial, fetchReservas,
} from "./db.js";
import {
  renderMesas, setUserId, setUserEmail, setRestauranteActivo,
  inicializarCroquis, reconstruirZona, setBusqueda,
} from "./mesa.js";
import { actualizarRefMesas, iniciarAutoLiberar } from "./autoLiberar.js";
import { toast, mostrarHistorial, setBuscadorCallback } from "./ui.js";
import { exportarExcel } from "./export.js";

// ── Auth ──────────────────────────────────────────────────────────────────────

await verificarSesion();
const usuario = await obtenerUsuario();
if (usuario) {
  setUserId(usuario.id);
  setUserEmail(usuario.email);
  const emailEl = document.getElementById("userEmail");
  if (emailEl) emailEl.textContent = usuario.email;
}
document.getElementById("btnLogout").addEventListener("click", async () => await logout());

// ── Estado ────────────────────────────────────────────────────────────────────

let mesasCache        = [];
let reservasCache     = [];
let restauranteActivo = 1;

// ── Croquis inicial ───────────────────────────────────────────────────────────

aplicarDireccionCroquis(getCroquisDir());
inicializarCroquis(restauranteActivo);
renderContadoresSector(restauranteActivo);

// ── Carga ─────────────────────────────────────────────────────────────────────

async function cargar() {
  try {
    mesasCache    = await fetchMesas();
    reservasCache = await fetchReservas();
    renderMesas(mesasCache);
    actualizarRefMesas(mesasCache);
  } catch (err) {
    console.error(err);
    toast("Error al cargar datos", "danger");
  }
}

// ── Dirección croquis ─────────────────────────────────────────────────────────

function aplicarDireccionCroquis(dir) {
  const wrapper = document.getElementById("croquisWrapper");
  if (!wrapper) return;
  wrapper.className = dir === "vertical" ? "croquis-wrapper vertical" : "croquis-wrapper";
  const btnDir = document.getElementById("btnDireccion");
  if (btnDir) btnDir.textContent = dir === "vertical" ? "↔ Horizontal" : "↕ Vertical";
}

document.getElementById("btnDireccion").addEventListener("click", () => {
  const actual = getCroquisDir();
  const nuevo  = actual === "vertical" ? "horizontal" : "vertical";
  setCroquisDir(nuevo);
  aplicarDireccionCroquis(nuevo);
});

// ── Selector restaurante ──────────────────────────────────────────────────────

document.getElementById("restauranteTabs").addEventListener("click", (e) => {
  const tab = e.target.closest(".rtab");
  if (!tab) return;
  document.querySelectorAll(".rtab").forEach(t => t.classList.remove("active"));
  tab.classList.add("active");
  restauranteActivo = Number(tab.dataset.rest);
  setRestauranteActivo(restauranteActivo);
  document.getElementById("restauranteLabel").textContent = `Restaurante ${restauranteActivo}`;
  inicializarCroquis(restauranteActivo);
  renderContadoresSector(restauranteActivo);
  renderMesas(mesasCache);
});

// ── Sidebar ───────────────────────────────────────────────────────────────────

const sidebar   = document.getElementById("sidebar");
const btnToggle = document.getElementById("toggleSidebar");
const btnOpen   = document.getElementById("openSidebar");
btnToggle.addEventListener("click", () => { sidebar.classList.add("collapsed"); btnOpen.style.display = "inline-flex"; });
btnOpen.addEventListener("click",   () => { sidebar.classList.remove("collapsed"); btnOpen.style.display = "none"; });

// ── Controles grilla por sector ───────────────────────────────────────────────

function renderContadoresSector(rest) {
  ["ruta", "galeria", "salon"].forEach(sector => {
    const { filas, cols } = getSectorConfig(rest, sector);
    const fEl = document.getElementById(`filas-${sector}`);
    const cEl = document.getElementById(`cols-${sector}`);
    if (fEl) fEl.textContent = filas;
    if (cEl) cEl.textContent = cols;
  });
}

document.getElementById("sectorControls").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-sector][data-tipo][data-delta]");
  if (!btn) return;
  const { sector, tipo, delta } = btn.dataset;
  const { filas, cols } = getSectorConfig(restauranteActivo, sector);
  let nf = filas, nc = cols;
  if (tipo === "filas") nf = Math.max(1, Math.min(8, filas + Number(delta)));
  if (tipo === "cols")  nc = Math.max(1, Math.min(8, cols  + Number(delta)));
  setSectorConfig(restauranteActivo, sector, nf, nc);
  const zona = document.getElementById(`zona-${sector}`);
  if (zona) reconstruirZona(zona, sector, nf, nc);
  renderContadoresSector(restauranteActivo);
  renderMesas(mesasCache);
});

// ── Crear mesa ────────────────────────────────────────────────────────────────

document.getElementById("btnCrear").addEventListener("click", async () => {
  const nombre    = document.getElementById("inputNombre").value.trim();
  const sector    = document.getElementById("inputSector").value;
  const capacidad = parseInt(document.getElementById("inputCapacidad").value) || 4;

  if (!nombre) { document.getElementById("inputNombre").focus(); toast("Ingresá el nombre de la mesa", "warning"); return; }

  const { filas, cols } = getSectorConfig(restauranteActivo, sector);
  const mesasSector = mesasCache.filter(m => m.sector === sector && (m.restaurante || 1) === restauranteActivo);

  if (mesasSector.length >= filas * cols) {
    toast(`Sector ${sector} lleno. Agregá más filas/columnas.`, "warning");
    return;
  }

  const slotsUsados = new Set(mesasSector.map(m => m.slot ?? 0));
  let slotLibre = 0;
  while (slotsUsados.has(slotLibre)) slotLibre++;

  try {
    await crearMesa({ nombre, sector, capacidad, slot: slotLibre, restaurante: restauranteActivo });
    document.getElementById("inputNombre").value = "";
    toast(`Mesa "${nombre}" creada`, "success");
  } catch (err) { toast("Error al crear mesa", "danger"); console.error(err); }
});

document.getElementById("inputNombre").addEventListener("keydown", (e) => {
  if (e.key === "Enter") document.getElementById("btnCrear").click();
});

// ── Limpiar todo ──────────────────────────────────────────────────────────────

document.getElementById("btnLimpiarTodo").addEventListener("click", async () => {
  const ok = confirm(`¿Eliminar TODAS las mesas del Restaurante ${restauranteActivo}?`);
  if (!ok) return;
  for (const m of mesasCache.filter(m => (m.restaurante || 1) === restauranteActivo)) {
    await eliminarMesa(m.id);
  }
  toast(`Restaurante ${restauranteActivo} limpiado`, "info");
});

// ── Buscador ──────────────────────────────────────────────────────────────────

setBuscadorCallback((q) => {
  setBusqueda(q);
  renderMesas(mesasCache);
});

// ── Historial ─────────────────────────────────────────────────────────────────

document.getElementById("btnHistorial").addEventListener("click", async () => {
  try {
    const data = await fetchHistorial({ limite: 300 });
    mostrarHistorial(data);
  } catch (err) { toast("Error al cargar historial", "danger"); }
});

// ── Exportar Excel ────────────────────────────────────────────────────────────

document.getElementById("btnExportar").addEventListener("click", () => {
  document.getElementById("exportPanel").classList.toggle("open");
});

document.getElementById("btnExportarConfirm").addEventListener("click", async () => {
  const tipo  = document.getElementById("exportTipo").value;   // 'dia' | 'evento'
  const valor = document.getElementById("exportValor").value.trim();
  document.getElementById("exportPanel").classList.remove("open");
  await exportarExcel({ reservas: reservasCache, mesas: mesasCache, tipo, valor });
});

document.getElementById("exportTipo").addEventListener("change", (e) => {
  const label = document.getElementById("exportValorLabel");
  const input = document.getElementById("exportValor");
  if (e.target.value === "dia") {
    label.textContent = "Fecha (YYYY-MM-DD)";
    input.type = "date";
  } else {
    label.textContent = "Nombre del evento";
    input.type = "text";
    input.placeholder = "Ej: Cumpleaños García";
  }
});

// ── Realtime ──────────────────────────────────────────────────────────────────

suscribirCambios(cargar);
iniciarAutoLiberar();
cargar();
