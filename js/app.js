// ── app.js ────────────────────────────────────────────────────────────────────

import {
  fetchMesas, crearMesa, suscribirCambios,
  iniciarGuardiaAuth, logout,
  eliminarMesa, getSectorConfig, setSectorConfig,
  fetchConfigSectores, getCroquisDir, setCroquisDir,
  fetchHistorial, fetchReservas,
  notificarCambioMesas, notificarCambioConfig,
} from "./db.js";
import {
  renderMesas, setUserId, setUserEmail, setRestauranteActivo,
  inicializarCroquis, reconstruirZona, setBusqueda,
} from "./mesa.js";
import { actualizarRefMesas, iniciarAutoLiberar } from "./autoLiberar.js";
import { toast, mostrarHistorial, setBuscadorCallback } from "./ui.js";
import { exportarExcel } from "./export.js";

// ── Auth ──────────────────────────────────────────────────────────────────────

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

async function recargarConfig() {
  await fetchConfigSectores(restauranteActivo);
  renderContadoresSector(restauranteActivo);
  inicializarCroquis(restauranteActivo);
  renderMesas(mesasCache);
}

// ── Inicializar ───────────────────────────────────────────────────────────────

async function inicializarApp() {
  await fetchConfigSectores(1);
  await fetchConfigSectores(2);

  const dir = await getCroquisDir();
  aplicarDireccionCroquis(dir);

  inicializarCroquis(restauranteActivo);
  renderContadoresSector(restauranteActivo);

  // Suscribir DESPUÉS de tener todo listo
  suscribirCambios(
    () => cargar(),          // callback mesas
    () => recargarConfig()   // callback config
  );

  await cargar();
  iniciarAutoLiberar();
}

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
  const nuevo = wrapper.classList.contains("vertical") ? "horizontal" : "vertical";
  aplicarDireccionCroquis(nuevo);
  await setCroquisDir(nuevo);
  await notificarCambioConfig();
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
const overlay   = document.getElementById("sidebarOverlay");

function abrirSidebar() {
  sidebar.classList.remove("collapsed");
  if (overlay) overlay.classList.add("visible");
}
function cerrarSidebar() {
  sidebar.classList.add("collapsed");
  if (overlay) overlay.classList.remove("visible");
}

btnToggle.addEventListener("click", cerrarSidebar);
btnOpen.addEventListener("click", abrirSidebar);
overlay?.addEventListener("click", cerrarSidebar);

// ── Controles grilla ──────────────────────────────────────────────────────────

function renderContadoresSector(rest) {
  ["salon", "galeria", "ruta"].forEach(sector => {
    const { filas, cols } = getSectorConfig(rest, sector);
    const fEl = document.getElementById(`filas-${sector}`);
    const cEl = document.getElementById(`cols-${sector}`);
    if (fEl) fEl.textContent = filas;
    if (cEl) cEl.textContent = cols;
  });
}

document.getElementById("sectorControls").addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-sector][data-tipo][data-delta]");
  if (!btn) return;
  const { sector, tipo, delta } = btn.dataset;
  const { filas, cols } = getSectorConfig(restauranteActivo, sector);
  let nf = tipo === "filas" ? Math.max(1, Math.min(8, filas + Number(delta))) : filas;
  let nc = tipo === "cols"  ? Math.max(1, Math.min(8, cols  + Number(delta))) : cols;

  await setSectorConfig(restauranteActivo, sector, nf, nc);
  await notificarCambioConfig(); // notificar a todos los dispositivos

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
    // Notificar a todos los dispositivos conectados
    await notificarCambioMesas();
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
  await notificarCambioMesas();
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

// ── Arrancar ──────────────────────────────────────────────────────────────────

inicializarApp();
