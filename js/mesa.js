// ── mesa.js ───────────────────────────────────────────────────────────────────

import {
  actualizarEstado, eliminarMesa, crearReserva,
  actualizarSlot, getSectorConfig,
  verificarDuplicado, registrarHistorial,
} from "./db.js";
import { toast, abrirModalReserva, abrirModalReservada, abrirModalMover } from "./ui.js";

let USER_ID    = null;
let USER_EMAIL = "";
export function setUserId(id)    { USER_ID = id; }
export function setUserEmail(em) { USER_EMAIL = em; }

let restauranteActivo = 1;
export function setRestauranteActivo(r) { restauranteActivo = r; }

let _todasLasMesas = [];
let _busqueda      = "";
export function setBusqueda(q) { _busqueda = q; }

// ── Inicializar celdas ────────────────────────────────────────────────────────

export function inicializarCroquis(restaurante = 1) {
  ["ruta", "galeria", "salon"].forEach(sector => {
    const zona = document.getElementById(`zona-${sector}`);
    if (!zona) return;
    const { filas, cols } = getSectorConfig(restaurante, sector);
    reconstruirZona(zona, sector, filas, cols);
  });
}

export function reconstruirZona(zona, sector, filas, cols) {
  zona.innerHTML = "";
  zona.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
  for (let i = 0; i < filas * cols; i++) {
    const celda = document.createElement("div");
    celda.className      = "celda";
    celda.dataset.sector = sector;
    celda.dataset.slot   = i;
    zona.appendChild(celda);
    vincularCeldaDrop(celda);
  }
}

// ── Render ────────────────────────────────────────────────────────────────────

export function renderMesas(mesas) {
  _todasLasMesas = mesas;
  const filtradas = mesas.filter(m => (m.restaurante || 1) === restauranteActivo);

  document.querySelectorAll(".celda").forEach(c => (c.innerHTML = ""));

  filtradas.forEach(m => {
    const zona  = document.getElementById(`zona-${m.sector}`);
    if (!zona) return;
    const celdas = zona.querySelectorAll(".celda");
    const celda  = celdas[m.slot ?? 0] || celdas[celdas.length - 1];
    if (!celda) return;
    const el = crearElementoMesa(m);
    // Highlight búsqueda
    if (_busqueda) {
      const coincide =
        (m.nombre  || "").toLowerCase().includes(_busqueda) ||
        (m.cliente || "").toLowerCase().includes(_busqueda);
      if (!coincide) el.classList.add("mesa-dim");
    }
    celda.appendChild(el);
  });

  actualizarStats(filtradas);
}

// ── Elemento DOM ──────────────────────────────────────────────────────────────

function crearElementoMesa(m) {
  const div = document.createElement("div");
  div.className  = `mesa ${m.estado}`;
  div.dataset.id = String(m.id);
  div.draggable  = true;

  const grupoBadge = m.grupo_id ? `<span class="mesa-grupo-badge">⊞</span>` : "";
  const horaStr = m.hora_reserva
    ? new Date(m.hora_reserva).toLocaleTimeString("es-BO", { hour: "2-digit", minute: "2-digit" })
    : "";

  let infoHtml = "";
  if (m.estado === "reservada" && m.cliente) {
    infoHtml = `
      <span class="mesa-cliente">${m.cliente}</span>
      ${m.telefono ? `<span class="mesa-tel">${m.telefono}</span>` : ""}
      <span class="mesa-personas">👤 ${m.personas || "—"}${horaStr ? " · " + horaStr : ""}</span>
      ${m.evento ? `<span class="mesa-evento">${m.evento}</span>` : ""}
    `;
  } else {
    infoHtml = `<span class="mesa-personas">👤 ${m.capacidad || "—"}</span>`;
  }

  div.innerHTML = `${grupoBadge}<span class="mesa-nombre">${m.nombre}</span>${infoHtml}`;
  div.addEventListener("dragstart",   (e) => manejarDragStart(e, m));
  div.addEventListener("click",       () => manejarClick(m));
  div.addEventListener("contextmenu", (e) => { e.preventDefault(); manejarEliminar(m); });
  return div;
}

// ── Drag & Drop ───────────────────────────────────────────────────────────────

let dragMesa = null;

function manejarDragStart(e, m) {
  dragMesa = m;
  e.dataTransfer.effectAllowed = "move";
  setTimeout(() => {
    const el = document.querySelector(`.mesa[data-id="${m.id}"]`);
    if (el) el.classList.add("dragging");
  }, 0);
}

function vincularCeldaDrop(celda) {
  celda.addEventListener("dragover",  (e) => { e.preventDefault(); celda.classList.add("celda-over"); });
  celda.addEventListener("dragleave", ()  => celda.classList.remove("celda-over"));
  celda.addEventListener("drop", async (e) => {
    e.preventDefault();
    celda.classList.remove("celda-over");
    if (!dragMesa) return;

    const sectorDest = celda.dataset.sector;
    const slotDest   = Number(celda.dataset.slot);

    if (dragMesa.sector !== sectorDest) {
      toast("Solo podés arrastrar dentro del mismo sector. Usá 'Mover a otra mesa' para cambiar de sector.", "warning");
      dragMesa = null;
      return;
    }

    const mesaEnDest = _todasLasMesas.find(m =>
      m.sector === sectorDest &&
      (m.slot ?? 0) === slotDest &&
      (m.restaurante || 1) === restauranteActivo &&
      m.id !== dragMesa.id
    );

    const slotOrigen = dragMesa.slot ?? 0;
    await actualizarSlot(dragMesa.id, slotDest, dragMesa.sector, dragMesa.restaurante || 1);
    if (mesaEnDest) {
      await actualizarSlot(mesaEnDest.id, slotOrigen, mesaEnDest.sector, mesaEnDest.restaurante || 1);
    }
    dragMesa = null;
  });
}

// ── Click principal ───────────────────────────────────────────────────────────

async function manejarClick(m) {

  if (m.estado === "libre") {
    await actualizarEstado(m.id, { estado: "espera", usuario_id: USER_ID, hora_bloqueo: new Date().toISOString() });

    const mesasSector = _todasLasMesas.filter(x =>
      x.sector === m.sector && (x.restaurante || 1) === restauranteActivo &&
      x.estado === "libre" && x.id !== m.id
    );

    const resultado = await abrirModalReserva(m, mesasSector);

    if (!resultado) {
      await actualizarEstado(m.id, { estado: "libre", usuario_id: null, hora_bloqueo: null });
      return;
    }

    const { cliente, telefono, evento, hora_reserva, personas, mesasUnidas } = resultado;

    // ── Verificar duplicado ───────────────────────────────────────────────
    const fecha = hora_reserva ? hora_reserva.split("T")[0] : new Date().toISOString().split("T")[0];
    const esDuplicado = await verificarDuplicado({ cliente, telefono, evento, fecha });
    if (esDuplicado) {
      const ok = confirm(`⚠️ "${cliente}" ya tiene una reserva en este evento/día.\n¿Confirmás de todas formas?`);
      if (!ok) {
        await actualizarEstado(m.id, { estado: "libre", usuario_id: null, hora_bloqueo: null });
        return;
      }
    }

    const grupo_id = mesasUnidas.length > 0 ? crypto.randomUUID() : null;

    await crearReserva({ mesa_id: m.id, nombre_cliente: cliente, usuario_id: USER_ID, personas, telefono, grupo_id, evento, hora_reserva });
    await actualizarEstado(m.id, { estado: "reservada", cliente, personas, telefono, grupo_id, evento, hora_reserva });

    for (const mu of mesasUnidas) {
      await actualizarEstado(mu.id, { estado: "reservada", cliente, personas, telefono, grupo_id, evento, hora_reserva, usuario_id: USER_ID });
      await crearReserva({ mesa_id: mu.id, nombre_cliente: cliente, usuario_id: USER_ID, personas, telefono, grupo_id, evento, hora_reserva });
    }

    // Registrar en historial
    const unionMsg = mesasUnidas.length > 0 ? ` (+ ${mesasUnidas.map(x => x.nombre).join(", ")})` : "";
    await registrarHistorial({
      tipo: "reserva", mesa_nombre: m.nombre + unionMsg, sector: m.sector,
      restaurante: m.restaurante || 1, cliente, telefono, personas, evento, hora_reserva,
      usuario_email: USER_EMAIL, detalle: `Reserva confirmada`,
    });

    toast(`✅ Reserva: ${cliente} (${personas} pers.) · ${m.nombre}${unionMsg}`, "success");
    return;
  }

  if (m.estado === "espera") {
    if (m.usuario_id && m.usuario_id !== USER_ID) { toast("Otra persona está gestionando esta mesa", "danger"); return; }
    const ok = confirm(`¿Cancelar bloqueo de "${m.nombre}"?`);
    if (!ok) return;
    await actualizarEstado(m.id, { estado: "libre", usuario_id: null, hora_bloqueo: null });
    toast(`Mesa "${m.nombre}" liberada`, "info");
    return;
  }

  if (m.estado === "reservada") {
    const accion = await abrirModalReservada(m);
    if (!accion) return;

    if (accion === "liberar") {
      const ok = confirm(`¿Liberar "${m.nombre}"${m.grupo_id ? " y todo el grupo" : ""}?`);
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
  if (mesaOrigen.grupo_id) {
    const grupo = _todasLasMesas.filter(x => x.grupo_id === mesaOrigen.grupo_id && x.id !== mesaOrigen.id);
    if (grupo.length > 0) {
      const moverTodo = confirm(
        `Mesa pertenece a grupo con: ${grupo.map(x => x.nombre).join(", ")}.\n\nAceptar = mover todo el grupo\nCancelar = mover solo esta mesa`
      );
      const destino = await abrirModalMover(mesaOrigen, _todasLasMesas, restauranteActivo);
      if (!destino) return;

      await moverDatos(mesaOrigen, destino.mesaDestinoId, destino.nuevoRestaurante, moverTodo ? mesaOrigen.grupo_id : null);

      if (!moverTodo) {
        for (const gm of grupo) {
          await actualizarEstado(gm.id, { estado: "libre", usuario_id: null, cliente: null, personas: null, telefono: null, grupo_id: null, hora_bloqueo: null });
        }
      }

      await registrarHistorial({
        tipo: "movimiento", mesa_nombre: `${mesaOrigen.nombre} → ${destino.mesaDestinoNombre}`,
        sector: mesaOrigen.sector, restaurante: mesaOrigen.restaurante || 1,
        cliente: mesaOrigen.cliente, telefono: mesaOrigen.telefono, personas: mesaOrigen.personas,
        evento: mesaOrigen.evento, hora_reserva: mesaOrigen.hora_reserva,
        usuario_email: USER_EMAIL, detalle: moverTodo ? "Grupo movido" : "Mesa movida, grupo liberado",
      });

      toast(`Reserva movida a ${destino.mesaDestinoNombre}`, "success");
      return;
    }
  }

  const destino = await abrirModalMover(mesaOrigen, _todasLasMesas, restauranteActivo);
  if (!destino) return;
  await moverDatos(mesaOrigen, destino.mesaDestinoId, destino.nuevoRestaurante, mesaOrigen.grupo_id);

  await registrarHistorial({
    tipo: "movimiento", mesa_nombre: `${mesaOrigen.nombre} → ${destino.mesaDestinoNombre}`,
    sector: mesaOrigen.sector, restaurante: mesaOrigen.restaurante || 1,
    cliente: mesaOrigen.cliente, telefono: mesaOrigen.telefono, personas: mesaOrigen.personas,
    evento: mesaOrigen.evento, hora_reserva: mesaOrigen.hora_reserva,
    usuario_email: USER_EMAIL, detalle: "Reserva movida",
  });

  toast(`Reserva de ${mesaOrigen.cliente} → ${destino.mesaDestinoNombre}`, "success");
}

async function moverDatos(origen, destinoId, nuevoRestaurante, grupo_id) {
  await actualizarEstado(destinoId, {
    estado: "reservada", cliente: origen.cliente, telefono: origen.telefono,
    personas: origen.personas, usuario_id: USER_ID, grupo_id: grupo_id || null,
    evento: origen.evento, hora_reserva: origen.hora_reserva,
  });
  await actualizarEstado(origen.id, {
    estado: "libre", usuario_id: null, cliente: null, personas: null,
    telefono: null, grupo_id: null, hora_bloqueo: null, evento: null, hora_reserva: null,
  });
}

// ── Liberar ───────────────────────────────────────────────────────────────────

async function liberarMesaOGrupo(m) {
  const campos = { estado: "libre", usuario_id: null, cliente: null, personas: null, telefono: null, grupo_id: null, hora_bloqueo: null, evento: null, hora_reserva: null };
  await actualizarEstado(m.id, campos);

  await registrarHistorial({
    tipo: "liberacion", mesa_nombre: m.nombre, sector: m.sector,
    restaurante: m.restaurante || 1, cliente: m.cliente, telefono: m.telefono,
    personas: m.personas, evento: m.evento, hora_reserva: m.hora_reserva,
    usuario_email: USER_EMAIL, detalle: "Mesa liberada",
  });

  if (m.grupo_id) {
    const grupo = _todasLasMesas.filter(x => x.grupo_id === m.grupo_id && x.id !== m.id);
    for (const gm of grupo) {
      await actualizarEstado(gm.id, campos);
      await registrarHistorial({
        tipo: "liberacion", mesa_nombre: gm.nombre, sector: gm.sector,
        restaurante: gm.restaurante || 1, cliente: gm.cliente,
        usuario_email: USER_EMAIL, detalle: "Liberada por grupo",
      });
    }
    if (grupo.length > 0) { toast(`Grupo liberado: ${m.nombre} + ${grupo.map(x => x.nombre).join(", ")}`, "info"); return; }
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
  document.getElementById("statLibre").textContent     = mesas.filter(m => m.estado === "libre").length;
  document.getElementById("statEspera").textContent    = mesas.filter(m => m.estado === "espera").length;
  document.getElementById("statReservada").textContent = mesas.filter(m => m.estado === "reservada").length;
}
