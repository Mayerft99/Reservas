// ── mesa.js — Croquis + lógica de reserva con unión de mesas ─────────────────

import { actualizarEstado, eliminarMesa, crearReserva } from "./db.js";
import { toast, abrirModalReserva } from "./ui.js";

let USER_ID = null;
export function setUserId(id) { USER_ID = id; }

let restauranteActivo = 1;
export function setRestauranteActivo(r) { restauranteActivo = r; }

// Cache de todas las mesas para acceder en clicks
let _todasLasMesas = [];

const ZONAS = {
  ruta:    { filas: 2, cols: 3 },
  galeria: { filas: 3, cols: 3 },
  salon:   { filas: 3, cols: 3 },
};

// ── Inicializar celdas vacías ─────────────────────────────────────────────────

export function inicializarCroquis() {
  Object.entries(ZONAS).forEach(([sector, { filas, cols }]) => {
    const zona = document.getElementById(`zona-${sector}`);
    if (!zona) return;
    zona.innerHTML = "";
    for (let i = 0; i < filas * cols; i++) {
      const celda = document.createElement("div");
      celda.className = "celda";
      celda.dataset.sector = sector;
      celda.dataset.slot   = i;
      zona.appendChild(celda);
    }
  });
}

// ── Render principal ──────────────────────────────────────────────────────────

export function renderMesas(mesas) {
  _todasLasMesas = mesas;

  const filtradas = mesas.filter((m) => (m.restaurante || 1) === restauranteActivo);

  // Limpiar celdas
  document.querySelectorAll(".celda").forEach((c) => (c.innerHTML = ""));

  filtradas.forEach((m) => {
    const zona   = document.getElementById(`zona-${m.sector}`);
    if (!zona) return;
    const celdas = zona.querySelectorAll(".celda");
    const celda  = celdas[m.slot ?? 0] || celdas[celdas.length - 1];
    if (!celda) return;
    celda.appendChild(crearElementoMesa(m));
  });

  actualizarStats(filtradas);
}

// ── Elemento DOM de mesa ──────────────────────────────────────────────────────

function crearElementoMesa(m) {
  const div = document.createElement("div");
  div.className = `mesa ${m.estado}`;
  div.dataset.id = String(m.id);

  // Badge de grupo (mesas unidas)
  const grupoBadge = m.grupo_id
    ? `<span class="mesa-grupo-badge" title="Mesa unida">⊞</span>`
    : "";

  // Info según estado
  let infoHtml = "";
  if (m.estado === "reservada" && m.cliente) {
    infoHtml = `
      <span class="mesa-cliente">${m.cliente}</span>
      ${m.telefono ? `<span class="mesa-tel">${m.telefono}</span>` : ""}
      <span class="mesa-personas">👤 ${m.personas || "—"}</span>
    `;
  } else {
    infoHtml = `<span class="mesa-personas">👤 ${m.capacidad || "—"}</span>`;
  }

  div.innerHTML = `
    ${grupoBadge}
    <span class="mesa-nombre">${m.nombre}</span>
    ${infoHtml}
  `;

  div.addEventListener("click",       () => manejarClick(m));
  div.addEventListener("contextmenu", (e) => { e.preventDefault(); manejarEliminar(m); });

  return div;
}

// ── Click → flujo de reserva ──────────────────────────────────────────────────

async function manejarClick(m) {

  // ── LIBRE → abrir modal de reserva directamente ───────────────────────────
  if (m.estado === "libre") {

    // Marcar en espera optimistamente
    await actualizarEstado(m.id, {
      estado: "espera",
      usuario_id: USER_ID,
      hora_bloqueo: new Date().toISOString(),
    });

    // Mesas libres del mismo sector y restaurante (para unir)
    const mesasSector = _todasLasMesas.filter(
      (x) => x.sector === m.sector
          && (x.restaurante || 1) === restauranteActivo
          && x.estado === "libre"
          && x.id !== m.id
    );

    const resultado = await abrirModalReserva(m, mesasSector);

    // Si cancela → liberar la mesa
    if (!resultado) {
      await actualizarEstado(m.id, { estado: "libre", usuario_id: null, hora_bloqueo: null });
      return;
    }

    const { cliente, telefono, personas, mesasUnidas } = resultado;

    // Generar grupo_id si hay mesas unidas
    const grupo_id = mesasUnidas.length > 0 ? crypto.randomUUID() : null;

    // Confirmar mesa principal
    await crearReserva({ mesa_id: m.id, nombre_cliente: cliente, usuario_id: USER_ID, personas, telefono, grupo_id });
    await actualizarEstado(m.id, { estado: "reservada", cliente, personas, telefono, grupo_id });

    // Confirmar mesas unidas
    for (const mu of mesasUnidas) {
      await actualizarEstado(mu.id, {
        estado: "reservada",
        cliente,
        personas,
        telefono,
        grupo_id,
        usuario_id: USER_ID,
      });
      await crearReserva({ mesa_id: mu.id, nombre_cliente: cliente, usuario_id: USER_ID, personas, telefono, grupo_id });
    }

    const unionMsg = mesasUnidas.length > 0
      ? ` + ${mesasUnidas.map((x) => x.nombre).join(", ")}`
      : "";
    toast(`Reserva confirmada: ${cliente} (${personas} pers.) en ${m.nombre}${unionMsg}`, "success");
    return;
  }

  // ── ESPERA → si es del mismo usuario, puede confirmar o cancelar ──────────
  if (m.estado === "espera") {
    if (m.usuario_id && m.usuario_id !== USER_ID) {
      toast("Otra persona está gestionando esta mesa", "danger");
      return;
    }
    // Permitir que el mismo usuario cancele el bloqueo
    const ok = confirm(`¿Cancelar la reserva en curso de "${m.nombre}"?`);
    if (!ok) return;
    await actualizarEstado(m.id, { estado: "libre", usuario_id: null, hora_bloqueo: null });
    toast(`Mesa "${m.nombre}" liberada`, "info");
    return;
  }

  // ── RESERVADA → liberar (y liberar grupo si aplica) ───────────────────────
  if (m.estado === "reservada") {
    const clienteInfo = m.cliente ? ` (${m.cliente})` : "";
    const ok = confirm(`¿Liberar la mesa "${m.nombre}"${clienteInfo}?`);
    if (!ok) return;

    const camposLibre = { estado: "libre", usuario_id: null, cliente: null, personas: null, telefono: null, grupo_id: null, hora_bloqueo: null };

    await actualizarEstado(m.id, camposLibre);

    // Si pertenece a un grupo, liberar todas las del grupo
    if (m.grupo_id) {
      const grupo = _todasLasMesas.filter(
        (x) => x.grupo_id === m.grupo_id && x.id !== m.id
      );
      for (const gm of grupo) {
        await actualizarEstado(gm.id, camposLibre);
      }
      if (grupo.length > 0) {
        toast(`Grupo liberado: ${m.nombre} + ${grupo.map((x) => x.nombre).join(", ")}`, "info");
        return;
      }
    }

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
  document.getElementById("statLibre").textContent      = mesas.filter((m) => m.estado === "libre").length;
  document.getElementById("statEspera").textContent     = mesas.filter((m) => m.estado === "espera").length;
  document.getElementById("statReservada").textContent  = mesas.filter((m) => m.estado === "reservada").length;
}
