// ── mesa.js — Renderizado de mesas en croquis estructurado ───────────────────

import { actualizarEstado, eliminarMesa, crearReserva } from "./db.js";
import { toast, abrirModalReserva } from "./ui.js";

// ID del usuario autenticado — se inyecta desde app.js al iniciar
let USER_ID = null;
export function setUserId(id) { USER_ID = id; }

// Restaurante activo
let restauranteActivo = 1;
export function setRestauranteActivo(r) { restauranteActivo = r; }

// Definición de zonas: sector → { filas, cols }
const ZONAS = {
  ruta:    { filas: 2, cols: 3 },
  galeria: { filas: 3, cols: 3 },
  salon:   { filas: 3, cols: 3 },
};

// ── Inicializar celdas de cada zona ───────────────────────────────────────────

export function inicializarCroquis() {
  Object.entries(ZONAS).forEach(([sector, { filas, cols }]) => {
    const zona = document.getElementById(`zona-${sector}`);
    if (!zona) return;
    zona.innerHTML = "";
    const total = filas * cols;
    for (let i = 0; i < total; i++) {
      const celda = document.createElement("div");
      celda.className = "celda";
      celda.dataset.sector = sector;
      celda.dataset.slot = i;
      zona.appendChild(celda);
    }
  });
}

// ── Render principal ──────────────────────────────────────────────────────────

export function renderMesas(mesas) {
  // Filtrar por restaurante activo
  const mesasFiltradas = mesas.filter((m) => (m.restaurante || 1) === restauranteActivo);

  // Limpiar todas las celdas
  document.querySelectorAll(".celda").forEach((celda) => {
    celda.innerHTML = "";
  });

  // Asignar cada mesa a su celda (por sector + slot)
  mesasFiltradas.forEach((m) => {
    const sector = m.sector || "galeria";
    const slot   = m.slot ?? 0;
    const zona   = document.getElementById(`zona-${sector}`);
    if (!zona) return;

    const celdas = zona.querySelectorAll(".celda");
    const celda  = celdas[slot] || celdas[celdas.length - 1];
    if (!celda) return;

    const div = crearElementoMesa(m);
    celda.appendChild(div);
  });

  actualizarStats(mesasFiltradas);
}

// ── Crear elemento DOM de una mesa ────────────────────────────────────────────

function crearElementoMesa(m) {
  const div = document.createElement("div");
  div.className = `mesa ${m.estado}`;
  div.dataset.id = String(m.id);

  const personas = m.personas || m.capacidad || "—";
  const clienteHtml = m.cliente
    ? `<span class="mesa-cliente">${m.cliente}</span>`
    : "";

  div.innerHTML = `
    <span class="mesa-nombre">${m.nombre}</span>
    <span class="mesa-personas">👤 ${personas}</span>
    ${clienteHtml}
  `;

  // Click → cambio de estado
  div.addEventListener("click", () => manejarClick(m));

  // Clic derecho → eliminar
  div.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    manejarEliminar(m);
  });

  return div;
}

// ── Click (cambio de estado) ──────────────────────────────────────────────────

async function manejarClick(m) {
  if (m.estado === "libre") {
    await actualizarEstado(m.id, {
      estado: "espera",
      usuario_id: USER_ID,
      hora_bloqueo: new Date().toISOString(),
    });
    toast(`Mesa "${m.nombre}" en espera`, "warning");
    return;
  }

  if (m.estado === "espera") {
    if (m.usuario_id && m.usuario_id !== USER_ID) {
      toast("Otra persona está gestionando esta mesa", "danger");
      return;
    }

    const resultado = await abrirModalReserva(m.nombre, m.capacidad || 2);
    if (!resultado) return;

    const { cliente, personas } = resultado;

    await crearReserva(m.id, cliente, USER_ID, personas);
    await actualizarEstado(m.id, { estado: "reservada", cliente, personas });
    toast(`Reserva confirmada para ${cliente} (${personas} personas)`, "success");
    return;
  }

  if (m.estado === "reservada") {
    const ok = confirm(`¿Liberar la mesa "${m.nombre}"?`);
    if (!ok) return;
    await actualizarEstado(m.id, { estado: "libre", usuario_id: null, cliente: null, personas: null });
    toast(`Mesa "${m.nombre}" liberada`, "info");
  }
}

// ── Eliminar ──────────────────────────────────────────────────────────────────

async function manejarEliminar(m) {
  const ok = confirm(`¿Eliminar la mesa "${m.nombre}"?`);
  if (!ok) return;
  await eliminarMesa(m.id);
  toast(`Mesa "${m.nombre}" eliminada`, "danger");
}

// ── Stats ─────────────────────────────────────────────────────────────────────

function actualizarStats(mesas) {
  document.getElementById("statLibre").textContent     = mesas.filter((m) => m.estado === "libre").length;
  document.getElementById("statEspera").textContent    = mesas.filter((m) => m.estado === "espera").length;
  document.getElementById("statReservada").textContent = mesas.filter((m) => m.estado === "reservada").length;
}
