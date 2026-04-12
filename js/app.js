// ── app.js ────────────────────────────────────────────────────────────────────

import {
  fetchMesas, crearMesa, suscribirCambios,
  iniciarGuardiaAuth, obtenerUsuario, logout,
  eliminarMesa, getSectorConfig, setSectorConfig,
  fetchConfigSectores, getCroquisDir, setCroquisDir,
  fetchHistorial, fetchReservas,
} from "./db.js";
import {
  renderMesas, setUserId, setUserEmail, setRestauranteActivo,
  inicializarCroquis, reconstruirZona, setBusqueda,
} from "./mesa.js";
import { actualizarRefMesas, iniciarAutoLiberar } from "./autoLiberar.js";
import { toast, mostrarHistorial, setBuscadorCallback } from "./ui.js";
import { exportarExcel } from "./export.js";

// ── Auth — DEBE ser lo primero, bloquea hasta tener sesión ───────────────────
// iniciarGuardiaAuth() espera el evento INITIAL_SESSION de Supabase.
// Si no hay sesión redirige automáticamente a login.html.

const usuarioAuth = await iniciarGuardiaAuth();

if (usuarioAuth) {
  setUserId(usuarioAuth.id);
  setUserEmail(usuarioAuth.email);
  const emailEl = document.getElementById("userEmail");
  if (emailEl) emailEl.textContent = usuarioAuth.email;
}

document.getElementById("btnLogout").addEventListener("click", async () => await logout());

// ── Estado ────────────────────────────────────────────────────────────────────

let mesasCache        = [];
let reservasCache     = [];
let restauranteActivo = 1;

// ── Inicializar croquis (carga config desde Supabase) ─────────────────────────

async function inicializarApp() {
  // Cargar config de sectores desde Supabase para este restaurante
  await fetchConfigSectores(1);
  await fetchConfigSectores(2);

  // Dirección del croquis
  const dir = await getCroquisDir();
  aplicarDireccionCroquis(dir);

  inicializarCroquis(restauranteActivo);
  renderContadoresSector(restauranteActivo);
  await cargar();
}

// ── Carga de datos ────────────────────────────────────────────────────────────

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

// ── Realtime — maneja tanto mesas como config ─────────────────────────────────

suscribirCambios(async (tipo) => {
  if (tipo === "mesas") {
    await cargar();
  }
  if (tipo === "config") {
    // Recargar config de sectores y reconstruir croquis
    await fetchConfigSectores(restauranteActivo);
    renderContadoresSector(restauranteActivo);
    inicializarCroquis(restauranteActivo);
    renderMesas(mesasCache);
  }
});

// ── Dirección croquis ─────────────────────────────────────────────────────────

function aplicarDireccionCroquis(dir) {
  const wrapper = document.getElementById("croquisWrapper");
  if (!wrapper) return;
  wrapper.className = dir === "vertical" ? "croquis-wrapper vertical" : "croquis-wrapper";
  const btn = document.getElementById("btnDireccion");
  if (btn) btn.textContent = dir === "vertical" ? "↔ Horizontal" : "↕ Vertical";
}

document.getElementById("btnDireccion").addEventListener("click", async () => {
  const wrapper = document.getElementById("croquisWrapper");
  const esVertical = wrapper.classList.contains("vertical");
  const nuevo = esVertical ? "horizontal" : "vertical";
  aplicarDireccionCroquis(nuevo);
  await setCroquisDir(nuevo);
});

// ── Selector restaurante ──────────────────────────────────────────────────────

document.getElementById("restauranteTabs").addEventListener("click", async (e) => {
  const tab = e.target.closest(".rtab");
  if (!tab) return;
  document.querySelectorAll(".rtab").forEach(t => t.classList.remove("active"));
  tab.classList.add("active");
  restauranteActivo = Number(tab.dataset.rest);
  setRestauranteActivo(restauranteActivo);
  document.getElementById("restauranteLabel").textContent = `Restaurante ${restauranteActivo}`;
  await fetchConfigSectores(restauranteActivo);
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

// ── Controles grilla ──────────────────────────────────────────────────────────

function renderContadoresSector(rest) {
  ["salon", "galeria", "ruta"].forEach(sector => {
    const { filas, cols } = getSectorConfig(rest, sector);
    const fEl = document.getElementById(`filas-${sector}`);
    const cEl = document.getElementById(`cols-${sector}`);
    if (fEl) fEl.textContent = filas;
    if (cEl) cEl.textContent  = cols;
  });
}

document.getElementById("sectorControls").addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-sector][data-tipo][data-delta]");
  if (!btn) return;
  const { sector, tipo, delta } = btn.dataset;
  const { filas, cols } = getSectorConfig(restauranteActivo, sector);
  let nf = filas, nc = cols;
  if (tipo === "filas") nf = Math.max(1, Math.min(8, filas + Number(delta)));
  if (tipo === "cols")  nc = Math.max(1, Math.min(8, cols  + Number(delta)));

  // Guardar en Supabase (se propaga vía realtime a otros dispositivos)
  await setSectorConfig(restauranteActivo, sector, nf, nc);

  // Actualizar local inmediatamente sin esperar realtime
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

  if (!nombre) {
    document.getElementById("inputNombre").focus();
    toast("Ingresá el nombre de la mesa", "warning");
    return;
  }

  const { filas, cols } = getSectorConfig(restauranteActivo, sector);
  const mesasSector = mesasCache.filter(m => m.sector === sector && (m.restaurante || 1) === restauranteActivo);

  if (mesasSector.length >= filas * cols) {
    toast(`Sector ${sector} lleno. Agregá más filas/columnas primero.`, "warning");
    return;
  }

  const slotsUsados = new Set(mesasSector.map(m => m.slot ?? 0));
  let slotLibre = 0;
  while (slotsUsados.has(slotLibre)) slotLibre++;

  try {
    await crearMesa({ nombre, sector, capacidad, slot: slotLibre, restaurante: restauranteActivo });
    document.getElementById("inputNombre").value = "";
    // No hace falta llamar cargar() — el realtime lo hace automáticamente
    toast(`Mesa "${nombre}" creada`, "success");
  } catch (err) {
    toast("Error al crear mesa", "danger");
    console.error(err);
  }
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
  const tipo  = document.getElementById("exportTipo").value;
  const valor = document.getElementById("exportValor").value.trim();
  document.getElementById("exportPanel").classList.remove("open");
  await exportarExcel({ reservas: reservasCache, mesas: mesasCache, tipo, valor });
});

document.getElementById("exportTipo").addEventListener("change", (e) => {
  const label = document.getElementById("exportValorLabel");
  const input = document.getElementById("exportValor");
  if (e.target.value === "dia") {
    label.textContent = "Fecha";
    input.type = "date";
    input.placeholder = "";
  } else {
    label.textContent = "Nombre del evento";
    input.type = "text";
    input.placeholder = "Ej: Cumpleaños García";
  }
});

// ── Auto-liberar ──────────────────────────────────────────────────────────────

iniciarAutoLiberar();

// ── Arrancar ──────────────────────────────────────────────────────────────────

inicializarApp();
