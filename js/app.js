// ── app.js ────────────────────────────────────────────────────────────────────

import {
  fetchMesas, crearMesa, suscribirCambios,
  verificarSesion, obtenerUsuario, logout, eliminarMesa,
  getSectorConfig, setSectorConfig,
} from "./db.js";
import { renderMesas, setUserId, setRestauranteActivo, inicializarCroquis, reconstruirZona } from "./mesa.js";
import { actualizarRefMesas, iniciarAutoLiberar } from "./autoLiberar.js";
import { toast } from "./ui.js";

// ── Auth ──────────────────────────────────────────────────────────────────────

await verificarSesion();
const usuario = await obtenerUsuario();
if (usuario) {
  setUserId(usuario.id);
  const emailEl = document.getElementById("userEmail");
  if (emailEl) emailEl.textContent = usuario.email;
}
document.getElementById("btnLogout").addEventListener("click", async () => await logout());

// ── Estado ────────────────────────────────────────────────────────────────────

let mesasCache        = [];
let restauranteActivo = 1;

// ── Croquis inicial ───────────────────────────────────────────────────────────

inicializarCroquis(restauranteActivo);
renderContadoresSector(restauranteActivo);

// ── Carga ─────────────────────────────────────────────────────────────────────

async function cargar() {
  try {
    mesasCache = await fetchMesas();
    renderMesas(mesasCache);
    actualizarRefMesas(mesasCache);
  } catch (err) {
    console.error(err);
    toast("Error al cargar mesas", "danger");
  }
}

// ── Selector restaurante ──────────────────────────────────────────────────────

document.getElementById("restauranteTabs").addEventListener("click", (e) => {
  const tab = e.target.closest(".rtab");
  if (!tab) return;
  document.querySelectorAll(".rtab").forEach((t) => t.classList.remove("active"));
  tab.classList.add("active");
  restauranteActivo = Number(tab.dataset.rest);
  setRestauranteActivo(restauranteActivo);
  const label = document.getElementById("restauranteLabel");
  if (label) label.textContent = `Restaurante ${restauranteActivo}`;
  inicializarCroquis(restauranteActivo);
  renderContadoresSector(restauranteActivo);
  renderMesas(mesasCache);
});

// ── Sidebar toggle ────────────────────────────────────────────────────────────

const sidebar   = document.getElementById("sidebar");
const btnToggle = document.getElementById("toggleSidebar");
const btnOpen   = document.getElementById("openSidebar");
btnToggle.addEventListener("click", () => { sidebar.classList.add("collapsed"); btnOpen.style.display = "inline-flex"; });
btnOpen.addEventListener("click",   () => { sidebar.classList.remove("collapsed"); btnOpen.style.display = "none"; });

// ── Botones +/− por sector ────────────────────────────────────────────────────

function renderContadoresSector(restaurante) {
  const sectores = ["ruta", "galeria", "salon"];
  sectores.forEach((sector) => {
    const { filas, cols } = getSectorConfig(restaurante, sector);
    const filasEl = document.getElementById(`filas-${sector}`);
    const colsEl  = document.getElementById(`cols-${sector}`);
    if (filasEl) filasEl.textContent = filas;
    if (colsEl)  colsEl.textContent  = cols;
  });
}

function cambiarGrid(sector, tipo, delta) {
  const { filas, cols } = getSectorConfig(restauranteActivo, sector);
  let nuevaFilas = filas;
  let nuevaCols  = cols;

  if (tipo === "filas") nuevaFilas = Math.max(1, Math.min(8, filas + delta));
  if (tipo === "cols")  nuevaCols  = Math.max(1, Math.min(8, cols  + delta));

  setSectorConfig(restauranteActivo, sector, nuevaFilas, nuevaCols);

  const zona = document.getElementById(`zona-${sector}`);
  if (zona) reconstruirZona(zona, sector, nuevaFilas, nuevaCols);

  renderContadoresSector(restauranteActivo);
  renderMesas(mesasCache);
}

// Delegar clicks en los controles de sector
document.getElementById("sectorControls").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-sector][data-tipo][data-delta]");
  if (!btn) return;
  cambiarGrid(btn.dataset.sector, btn.dataset.tipo, Number(btn.dataset.delta));
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
  const limite = filas * cols;
  const mesasSector = mesasCache.filter(
    (m) => m.sector === sector && (m.restaurante || 1) === restauranteActivo
  );

  if (mesasSector.length >= limite) {
    toast(`Sector ${sector} lleno (${limite} celdas). Agregá más filas/columnas.`, "warning");
    return;
  }

  const slotsUsados = new Set(mesasSector.map((m) => m.slot ?? 0));
  let slotLibre = 0;
  while (slotsUsados.has(slotLibre)) slotLibre++;

  try {
    await crearMesa({ nombre, sector, capacidad, slot: slotLibre, restaurante: restauranteActivo });
    document.getElementById("inputNombre").value = "";
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
  const mesasRest = mesasCache.filter((m) => (m.restaurante || 1) === restauranteActivo);
  for (const m of mesasRest) await eliminarMesa(m.id);
  toast(`Restaurante ${restauranteActivo} limpiado`, "info");
});

// ── Realtime + auto-liberar ───────────────────────────────────────────────────

suscribirCambios(cargar);
iniciarAutoLiberar();
cargar();
