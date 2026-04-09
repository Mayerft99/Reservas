// ── mesa.js — Renderizado de mesas y lógica de drag ───────────────────────────

import { actualizarPosicion, actualizarEstado, eliminarMesa, crearReserva } from "./db.js";
import { toast, abrirModalReserva } from "./ui.js";

const plano = document.getElementById("plano");
const empty = document.getElementById("planoEmpty");

// ID del usuario autenticado — se inyecta desde app.js al iniciar
let USER_ID = null;

export function setUserId(id) {
  USER_ID = id;
}

// Sector activo para filtrar
let sectorActivo = "todos";

// ── Sector filter ─────────────────────────────────────────────────────────────

export function setSectorActivo(sector) {
  sectorActivo = sector;
}

// ── Render principal ──────────────────────────────────────────────────────────

/**
 * Re-renderiza todas las mesas en el plano.
 * @param {Array} mesas  Lista de registros de la tabla mesas
 */
export function renderMesas(mesas) {
  // Conservar refs existentes por id para no recrear todo el DOM
  const existentes = new Map(
    [...plano.querySelectorAll(".mesa")].map((el) => [el.dataset.id, el])
  );
  const nuevosIds = new Set(mesas.map((m) => String(m.id)));

  // Eliminar mesas que ya no existen
  existentes.forEach((el, id) => {
    if (!nuevosIds.has(id)) el.remove();
  });

  empty.classList.toggle("hidden", mesas.length > 0);

  mesas.forEach((m) => {
    const key   = String(m.id);
    const existe = existentes.has(key);
    const div   = existe ? existentes.get(key) : document.createElement("div");

    // Clases y posición
    div.className = `mesa ${m.estado}`;
    div.dataset.id = key;
    div.style.left   = m.pos_x + "px";
    div.style.top    = m.pos_y + "px";
    div.style.width  = (m.ancho || 110) + "px";
    div.style.height = (m.alto  || 70)  + "px";

    // Filtro de sector
    const visible = sectorActivo === "todos" || m.sector === sectorActivo;
    div.classList.toggle("hidden-filter", !visible);

    // Contenido interno (solo si cambió)
    const nuevaKey = `${m.nombre}|${m.estado}|${m.sector}`;
    if (div.dataset.renderKey !== nuevaKey) {
      div.dataset.renderKey = nuevaKey;
      div.innerHTML = `
        <span class="mesa-nombre">${m.nombre}</span>
        <span class="mesa-sector">${m.sector}</span>
      `;
    }

    if (!existe) {
      vincularEventos(div, m);
      plano.appendChild(div);
    } else {
      // Re-bind con datos frescos (onclick lleva closure)
      vincularEventos(div, m);
    }
  });

  actualizarStats(mesas);
}

// ── Eventos de cada mesa ──────────────────────────────────────────────────────

function vincularEventos(div, m) {
  // Drag
  div.onmousedown = (e) => manejarDrag(e, div, m);

  // Click → cambio de estado
  div.onclick = (e) => {
    if (div._dragged) return; // ignorar click post-drag
    manejarClick(m);
  };

  // Clic derecho → eliminar
  div.oncontextmenu = (e) => {
    e.preventDefault();
    manejarEliminar(m);
  };
}

// ── Drag ──────────────────────────────────────────────────────────────────────

function manejarDrag(e, div, m) {
  const planoRect = plano.getBoundingClientRect();
  const offsetX   = e.clientX - planoRect.left - parseInt(div.style.left);
  const offsetY   = e.clientY - planoRect.top  - parseInt(div.style.top);
  let dragging = false;

  div.style.zIndex = 20;
  div._dragged = false;

  const onMove = (e) => {
    dragging = true;
    div._dragged = true;
    const x = Math.max(0, e.clientX - planoRect.left - offsetX);
    const y = Math.max(0, e.clientY - planoRect.top  - offsetY);
    div.style.left = x + "px";
    div.style.top  = y + "px";
  };

  const onUp = async () => {
    div.style.zIndex = "";
    document.removeEventListener("mousemove", onMove);
    document.removeEventListener("mouseup",   onUp);

    if (dragging) {
      await actualizarPosicion(m.id, parseInt(div.style.left), parseInt(div.style.top));
    }
    // Resetear flag después del ciclo para que onclick lo vea
    setTimeout(() => { div._dragged = false; }, 0);
  };

  document.addEventListener("mousemove", onMove);
  document.addEventListener("mouseup",   onUp);
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
    if (m.usuario_id !== USER_ID) {
      toast("Otra persona está gestionando esta mesa", "danger");
      return;
    }

    const cliente = await abrirModalReserva(m.nombre);
    if (!cliente) return;

    await crearReserva(m.id, cliente, USER_ID);
    await actualizarEstado(m.id, { estado: "reservada" });
    toast(`Reserva confirmada para ${cliente}`, "success");
    return;
  }

  if (m.estado === "reservada") {
    const ok = confirm(`¿Liberar la mesa "${m.nombre}"?`);
    if (!ok) return;
    await actualizarEstado(m.id, { estado: "libre", usuario_id: null });
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
  const libre    = mesas.filter((m) => m.estado === "libre").length;
  const espera   = mesas.filter((m) => m.estado === "espera").length;
  const reservada = mesas.filter((m) => m.estado === "reservada").length;

  document.getElementById("statLibre").textContent    = libre;
  document.getElementById("statEspera").textContent   = espera;
  document.getElementById("statReservada").textContent = reservada;
}
