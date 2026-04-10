// ── mesa.js ───────────────────────────────────────────────────────────────────

import { actualizarEstado, eliminarMesa, crearReserva, actualizarSlot, getSectorConfig } from "./db.js";
import { toast, abrirModalReserva, abrirModalReservada, abrirModalMover } from "./ui.js";

let USER_ID = null;
export function setUserId(id) { USER_ID = id; }

let restauranteActivo = 1;
export function setRestauranteActivo(r) { restauranteActivo = r; }

let _todasLasMesas = [];

// ── Inicializar celdas ────────────────────────────────────────────────────────

export function inicializarCroquis(restaurante = 1) {
  const sectores = ["ruta", "galeria", "salon"];
  sectores.forEach((sector) => {
    const zona = document.getElementById(`zona-${sector}`);
    if (!zona) return;
    const { filas, cols } = getSectorConfig(restaurante, sector);
    reconstruirZona(zona, sector, filas, cols);
  });
}

export function reconstruirZona(zona, sector, filas, cols) {
  zona.innerHTML = "";
  zona.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
  const total = filas * cols;
  for (let i = 0; i < total; i++) {
    const celda = document.createElement("div");
    celda.className   = "celda";
    celda.dataset.sector = sector;
    celda.dataset.slot   = i;
    celda.dataset.cols   = cols;
    zona.appendChild(celda);
    vincularCeldaDrop(celda);
  }
}

// ── Render ────────────────────────────────────────────────────────────────────

export function renderMesas(mesas) {
  _todasLasMesas = mesas;
  const filtradas = mesas.filter((m) => (m.restaurante || 1) === restauranteActivo);

  document.querySelectorAll(".celda").forEach((c) => (c.innerHTML = ""));

  filtradas.forEach((m) => {
    const zona  = document.getElementById(`zona-${m.sector}`);
    if (!zona) return;
    const celdas = zona.querySelectorAll(".celda");
    const celda  = celdas[m.slot ?? 0] || celdas[celdas.length - 1];
    if (!celda) return;
    celda.appendChild(crearElementoMesa(m));
  });

  actualizarStats(filtradas);
}

// ── Elemento DOM ──────────────────────────────────────────────────────────────

function crearElementoMesa(m) {
  const div = document.createElement("div");
  div.className    = `mesa ${m.estado}`;
  div.dataset.id   = String(m.id);
  div.draggable    = true;

  const grupoBadge = m.grupo_id
    ? `<span class="mesa-grupo-badge" title="Grupo de mesas">⊞</span>` : "";

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

  div.innerHTML = `${grupoBadge}<span class="mesa-nombre">${m.nombre}</span>${infoHtml}`;

  // Drag
  div.addEventListener("dragstart", (e) => manejarDragStart(e, m));

  // Click
  div.addEventListener("click", () => manejarClick(m));

  // Clic derecho → eliminar
  div.addEventListener("contextmenu", (e) => { e.preventDefault(); manejarEliminar(m); });

  return div;
}

// ── Drag & Drop dentro del sector ─────────────────────────────────────────────

let dragMesa = null; // mesa siendo arrastrada

function manejarDragStart(e, m) {
  dragMesa = m;
  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.setData("text/plain", String(m.id));
  setTimeout(() => {
    const el = document.querySelector(`.mesa[data-id="${m.id}"]`);
    if (el) el.classList.add("dragging");
  }, 0);
}

function vincularCeldaDrop(celda) {
  celda.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    celda.classList.add("celda-over");
  });

  celda.addEventListener("dragleave", () => {
    celda.classList.remove("celda-over");
  });

  celda.addEventListener("drop", async (e) => {
    e.preventDefault();
    celda.classList.remove("celda-over");

    if (!dragMesa) return;

    const sectorDestino = celda.dataset.sector;
    const slotDestino   = Number(celda.dataset.slot);

    // Solo permitir arrastrar dentro del mismo sector
    if (dragMesa.sector !== sectorDestino) {
      toast("Solo podés arrastrar dentro del mismo sector. Para mover la reserva usá el botón 'Mover a otra mesa'.", "warning");
      dragMesa = null;
      return;
    }

    // Si la celda destino tiene una mesa, intercambiar slots
    const mesaEnDestino = _todasLasMesas.find(
      (m) => m.sector === sectorDestino
          && (m.slot ?? 0) === slotDestino
          && (m.restaurante || 1) === restauranteActivo
          && m.id !== dragMesa.id
    );

    const slotOrigen = dragMesa.slot ?? 0;

    // Mover mesa arrastrada al slot destino
    await actualizarSlot(dragMesa.id, slotDestino, dragMesa.sector, dragMesa.restaurante || 1);

    // Si había otra mesa ahí, mandarla al slot origen
    if (mesaEnDestino) {
      await actualizarSlot(mesaEnDestino.id, slotOrigen, mesaEnDestino.sector, mesaEnDestino.restaurante || 1);
    }

    dragMesa = null;
  });
}

// ── Click → flujo principal ───────────────────────────────────────────────────

async function manejarClick(m) {

  // ── LIBRE → abrir modal de nueva reserva ─────────────────────────────────
  if (m.estado === "libre") {
    await actualizarEstado(m.id, {
      estado: "espera",
      usuario_id: USER_ID,
      hora_bloqueo: new Date().toISOString(),
    });

    const mesasSector = _todasLasMesas.filter(
      (x) => x.sector === m.sector
          && (x.restaurante || 1) === restauranteActivo
          && x.estado === "libre"
          && x.id !== m.id
    );

    const resultado = await abrirModalReserva(m, mesasSector);

    if (!resultado) {
      await actualizarEstado(m.id, { estado: "libre", usuario_id: null, hora_bloqueo: null });
      return;
    }

    const { cliente, telefono, personas, mesasUnidas } = resultado;
    const grupo_id = mesasUnidas.length > 0 ? crypto.randomUUID() : null;

    await crearReserva({ mesa_id: m.id, nombre_cliente: cliente, usuario_id: USER_ID, personas, telefono, grupo_id });
    await actualizarEstado(m.id, { estado: "reservada", cliente, personas, telefono, grupo_id });

    for (const mu of mesasUnidas) {
      await actualizarEstado(mu.id, { estado: "reservada", cliente, personas, telefono, grupo_id, usuario_id: USER_ID });
      await crearReserva({ mesa_id: mu.id, nombre_cliente: cliente, usuario_id: USER_ID, personas, telefono, grupo_id });
    }

    const unionMsg = mesasUnidas.length > 0 ? ` + ${mesasUnidas.map((x) => x.nombre).join(", ")}` : "";
    toast(`Reserva: ${cliente} (${personas} pers.) en ${m.nombre}${unionMsg}`, "success");
    return;
  }

  // ── ESPERA → cancelar bloqueo ─────────────────────────────────────────────
  if (m.estado === "espera") {
    if (m.usuario_id && m.usuario_id !== USER_ID) {
      toast("Otra persona está gestionando esta mesa", "danger");
      return;
    }
    const ok = confirm(`¿Cancelar bloqueo de "${m.nombre}"?`);
    if (!ok) return;
    await actualizarEstado(m.id, { estado: "libre", usuario_id: null, hora_bloqueo: null });
    toast(`Mesa "${m.nombre}" liberada`, "info");
    return;
  }

  // ── RESERVADA → ver detalle / liberar / mover ─────────────────────────────
  if (m.estado === "reservada") {
    const accion = await abrirModalReservada(m);

    if (!accion) return;

    if (accion === "liberar") {
      const ok = confirm(`¿Liberar "${m.nombre}"${m.grupo_id ? " y todas las mesas del grupo" : ""}?`);
      if (!ok) return;
      await liberarMesaOGrupo(m);
      return;
    }

    if (accion === "mover") {
      await manejarMoverReserva(m);
    }
  }
}

// ── Mover reserva ─────────────────────────────────────────────────────────────

async function manejarMoverReserva(mesaOrigen) {
  // Si tiene grupo, preguntar qué hacer
  if (mesaOrigen.grupo_id) {
    const grupo = _todasLasMesas.filter(
      (x) => x.grupo_id === mesaOrigen.grupo_id && x.id !== mesaOrigen.id
    );
    if (grupo.length > 0) {
      const moverTodo = confirm(
        `Esta mesa pertenece a un grupo con: ${grupo.map((x) => x.nombre).join(", ")}.\n\n` +
        `¿Mover TODO el grupo junto?\n` +
        `Aceptar = mover todo el grupo\n` +
        `Cancelar = mover solo esta mesa (las otras se liberan)`
      );

      const destino = await abrirModalMover(mesaOrigen, _todasLasMesas, restauranteActivo);
      if (!destino) return;

      if (moverTodo) {
        // Mover mesa principal
        await moverDatos(mesaOrigen, destino.mesaDestinoId, destino.nuevoRestaurante, mesaOrigen.grupo_id);
        // Las demás del grupo se liberan (no hay suficientes destinos seleccionados para todo el grupo)
        for (const gm of grupo) {
          await actualizarEstado(gm.id, { estado: "libre", usuario_id: null, cliente: null, personas: null, telefono: null, grupo_id: null, hora_bloqueo: null });
        }
        toast(`Reserva movida a ${destino.mesaDestinoNombre}. El resto del grupo fue liberado.`, "success");
      } else {
        // Mover solo esta, liberar el grupo
        for (const gm of grupo) {
          await actualizarEstado(gm.id, { estado: "libre", usuario_id: null, cliente: null, personas: null, telefono: null, grupo_id: null, hora_bloqueo: null });
        }
        await moverDatos(mesaOrigen, destino.mesaDestinoId, destino.nuevoRestaurante, null);
        toast(`Reserva movida a ${destino.mesaDestinoNombre}.`, "success");
      }
      return;
    }
  }

  // Sin grupo
  const destino = await abrirModalMover(mesaOrigen, _todasLasMesas, restauranteActivo);
  if (!destino) return;

  await moverDatos(mesaOrigen, destino.mesaDestinoId, destino.nuevoRestaurante, mesaOrigen.grupo_id);
  toast(`Reserva de ${mesaOrigen.cliente} movida a ${destino.mesaDestinoNombre}`, "success");
}

async function moverDatos(origen, destinoId, nuevoRestaurante, grupo_id) {
  const campos = {
    estado:     "reservada",
    cliente:    origen.cliente,
    telefono:   origen.telefono,
    personas:   origen.personas,
    usuario_id: USER_ID,
    grupo_id:   grupo_id || null,
  };
  // Reservar destino
  await actualizarEstado(destinoId, campos);
  // Liberar origen
  await actualizarEstado(origen.id, {
    estado: "libre", usuario_id: null, cliente: null,
    personas: null, telefono: null, grupo_id: null, hora_bloqueo: null,
  });
}

// ── Liberar mesa o grupo ──────────────────────────────────────────────────────

async function liberarMesaOGrupo(m) {
  const camposLibre = {
    estado: "libre", usuario_id: null, cliente: null,
    personas: null, telefono: null, grupo_id: null, hora_bloqueo: null,
  };
  await actualizarEstado(m.id, camposLibre);

  if (m.grupo_id) {
    const grupo = _todasLasMesas.filter((x) => x.grupo_id === m.grupo_id && x.id !== m.id);
    for (const gm of grupo) await actualizarEstado(gm.id, camposLibre);
    if (grupo.length > 0) {
      toast(`Grupo liberado: ${m.nombre} + ${grupo.map((x) => x.nombre).join(", ")}`, "info");
      return;
    }
  }
  toast(`Mesa "${m.nombre}" liberada`, "info");
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
