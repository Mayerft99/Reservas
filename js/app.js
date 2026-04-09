// ── app.js — Orquestador principal ────────────────────────────────────────────

import { fetchMesas, crearMesa, suscribirCambios, verificarSesion, obtenerUsuario, logout, eliminarMesa } from "./db.js";
import { renderMesas, setUserId, setRestauranteActivo, inicializarCroquis } from "./mesa.js";
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

document.getElementById("btnLogout").addEventListener("click", async () => {
  await logout();
});

// ── Estado local ──────────────────────────────────────────────────────────────

let mesasCache       = [];
let restauranteActivo = 1;

// ── Inicializar croquis ───────────────────────────────────────────────────────

inicializarCroquis();

// ── Carga ─────────────────────────────────────────────────────────────────────

async function cargar() {
  try {
    mesasCache = await fetchMesas();
    renderMesas(mesasCache);
    actualizarRefMesas(mesasCache);
  } catch (err) {
    console.error("Error al cargar mesas:", err);
    toast("Error al cargar mesas", "danger");
  }
}

// ── Selector de restaurante ───────────────────────────────────────────────────

document.getElementById("restauranteTabs").addEventListener("click", (e) => {
  const tab = e.target.closest(".rtab");
  if (!tab) return;

  document.querySelectorAll(".rtab").forEach((t) => t.classList.remove("active"));
  tab.classList.add("active");

  restauranteActivo = Number(tab.dataset.rest);
  setRestauranteActivo(restauranteActivo);

  const label = document.getElementById("restauranteLabel");
  if (label) label.textContent = `Restaurante ${restauranteActivo}`;

  renderMesas(mesasCache);
});

// ── Sidebar toggle ────────────────────────────────────────────────────────────

const sidebar   = document.getElementById("sidebar");
const btnToggle = document.getElementById("toggleSidebar");
const btnOpen   = document.getElementById("openSidebar");

btnToggle.addEventListener("click", () => {
  sidebar.classList.add("collapsed");
  btnOpen.style.display = "inline-flex";
});

btnOpen.addEventListener("click", () => {
  sidebar.classList.remove("collapsed");
  btnOpen.style.display = "none";
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

  // Calcular próximo slot libre en ese sector para este restaurante
  const mesasSector = mesasCache.filter(
    (m) => m.sector === sector && (m.restaurante || 1) === restauranteActivo
  );

  // Límites de celdas por sector
  const LIMITES = { ruta: 6, galeria: 9, salon: 9 };
  const limite  = LIMITES[sector] || 9;

  if (mesasSector.length >= limite) {
    toast(`El sector ${sector} ya está completo (${limite} mesas máx.)`, "warning");
    return;
  }

  // Encontrar slot disponible
  const slotsUsados = new Set(mesasSector.map((m) => m.slot ?? 0));
  let slotLibre = 0;
  while (slotsUsados.has(slotLibre)) slotLibre++;

  try {
    await crearMesa({ nombre, sector, capacidad, slot: slotLibre, restaurante: restauranteActivo });
    document.getElementById("inputNombre").value = "";
    toast(`Mesa "${nombre}" creada en ${sector}`, "success");
  } catch (err) {
    toast("Error al crear mesa", "danger");
    console.error(err);
  }
});

document.getElementById("inputNombre").addEventListener("keydown", (e) => {
  if (e.key === "Enter") document.getElementById("btnCrear").click();
});

// ── Limpiar todo (solo restaurante activo) ────────────────────────────────────

document.getElementById("btnLimpiarTodo").addEventListener("click", async () => {
  const ok = confirm(`¿Eliminar TODAS las mesas del Restaurante ${restauranteActivo}?`);
  if (!ok) return;

  const mesasRest = mesasCache.filter((m) => (m.restaurante || 1) === restauranteActivo);
  for (const m of mesasRest) {
    await eliminarMesa(m.id);
  }
  toast(`Restaurante ${restauranteActivo} limpiado`, "info");
});

// ── Realtime ──────────────────────────────────────────────────────────────────

suscribirCambios(cargar);

// ── Auto-liberar ──────────────────────────────────────────────────────────────

iniciarAutoLiberar();

// ── Iniciar ───────────────────────────────────────────────────────────────────

cargar();
