// ── ui.js ─────────────────────────────────────────────────────────────────────

// ── Toast ─────────────────────────────────────────────────────────────────────

const toastContainer = document.getElementById("toastContainer");

export function toast(message, type = "info", duration = 3500) {
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.textContent = message;
  toastContainer.appendChild(el);
  setTimeout(() => {
    el.classList.add("removing");
    el.addEventListener("animationend", () => el.remove(), { once: true });
  }, duration);
}

// ── Modal reserva (nueva) ─────────────────────────────────────────────────────

const backdrop     = document.getElementById("modalBackdrop");
const mesaNombreEl = document.getElementById("modalMesaNombre");
const inputCliente = document.getElementById("modalInputCliente");
const inputTel     = document.getElementById("modalInputTel");
const inputEvento  = document.getElementById("modalInputEvento");
const inputHora    = document.getElementById("modalInputHora");
const btnConfirmar = document.getElementById("modalConfirmar");
const btnCancelar  = document.getElementById("modalCancelar");
const btnClose     = document.getElementById("modalClose");
const personasNum  = document.getElementById("personasNum");
const btnMenos     = document.getElementById("personasMenos");
const btnMas       = document.getElementById("personasMas");
const unionList    = document.getElementById("unionList");
const unionSection = document.getElementById("unionSection");
const btnMoverRes  = document.getElementById("btnMoverReserva");

let resolveModal   = null;
let personasActual = 2;

btnMenos.addEventListener("click", () => { if (personasActual > 1)  { personasActual--; personasNum.textContent = personasActual; } });
btnMas.addEventListener("click",   () => { if (personasActual < 30) { personasActual++; personasNum.textContent = personasActual; } });

function cerrarModal(valor = null) {
  backdrop.classList.remove("open");
  if (resolveModal) { resolveModal(valor); resolveModal = null; }
}

btnCancelar.addEventListener("click", () => cerrarModal(null));
btnClose.addEventListener("click",    () => cerrarModal(null));
backdrop.addEventListener("click",   (e) => { if (e.target === backdrop) cerrarModal(null); });

export function abrirModalReserva(mesaPrincipal, mesasDelSector = []) {
  mesaNombreEl.textContent   = mesaPrincipal.nombre;
  inputCliente.value         = "";
  inputTel.value             = "";
  inputEvento.value          = "";
  personasActual             = mesaPrincipal.capacidad || 2;
  personasNum.textContent    = personasActual;
  btnMoverRes.style.display  = "none";
  btnConfirmar.textContent   = "Confirmar reserva";
  btnConfirmar.className     = "btn btn-primary";

  // Hora default = ahora
  const ahora = new Date();
  ahora.setMinutes(ahora.getMinutes() - ahora.getTimezoneOffset());
  inputHora.value = ahora.toISOString().slice(0, 16);

  const candidatas = mesasDelSector.filter(m => m.id !== mesaPrincipal.id && m.estado === "libre");
  unionSection.style.display = candidatas.length > 0 ? "block" : "none";
  unionList.innerHTML = candidatas.map(m => `
    <label class="union-item">
      <input type="checkbox" class="union-check" data-id="${m.id}" data-nombre="${m.nombre}">
      <span class="union-nombre">${m.nombre}</span>
      <span class="union-cap">👤 ${m.capacidad || "—"}</span>
    </label>
  `).join("");

  backdrop.classList.add("open");
  setTimeout(() => inputCliente.focus(), 200);

  return new Promise((resolve) => {
    resolveModal = resolve;
    const handler = () => {
      const cliente  = inputCliente.value.trim();
      const telefono = inputTel.value.trim();
      const evento   = inputEvento.value.trim();
      const hora     = inputHora.value;
      if (!cliente) {
        inputCliente.focus();
        inputCliente.style.borderColor = "var(--reservada)";
        setTimeout(() => inputCliente.style.borderColor = "", 800);
        return;
      }
      const checks = unionList.querySelectorAll(".union-check:checked");
      const mesasUnidas = Array.from(checks).map(c => ({ id: c.dataset.id, nombre: c.dataset.nombre }));
      cerrarModal({ cliente, telefono, evento, hora_reserva: hora ? new Date(hora).toISOString() : new Date().toISOString(), personas: personasActual, mesasUnidas });
      btnConfirmar.removeEventListener("click", handler);
    };
    btnConfirmar.addEventListener("click", handler);
    inputCliente.onkeydown = (e) => { if (e.key === "Enter") inputTel.focus(); };
    inputTel.onkeydown     = (e) => { if (e.key === "Enter") handler(); };
  });
}

// Modal ver reservada
export function abrirModalReservada(mesa) {
  mesaNombreEl.textContent   = mesa.nombre;
  inputCliente.value         = mesa.cliente || "";
  inputTel.value             = mesa.telefono || "";
  inputEvento.value          = mesa.evento || "";
  personasActual             = mesa.personas || 1;
  personasNum.textContent    = personasActual;
  unionSection.style.display = "none";
  btnMoverRes.style.display  = "inline-flex";
  btnConfirmar.textContent   = "Liberar mesa";
  btnConfirmar.className     = "btn btn-danger";

  if (mesa.hora_reserva) {
    const d = new Date(mesa.hora_reserva);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    inputHora.value = d.toISOString().slice(0, 16);
  } else {
    inputHora.value = "";
  }

  backdrop.classList.add("open");

  return new Promise((resolve) => {
    resolveModal = resolve;
    const handleLiberar = () => { cerrarModal("liberar"); cleanup(); };
    const handleMover   = () => { cerrarModal("mover");   cleanup(); };
    const cleanup = () => {
      btnConfirmar.removeEventListener("click", handleLiberar);
      btnMoverRes.removeEventListener("click",  handleMover);
      btnConfirmar.textContent = "Confirmar reserva";
      btnConfirmar.className   = "btn btn-primary";
    };
    btnConfirmar.addEventListener("click", handleLiberar);
    btnMoverRes.addEventListener("click",  handleMover);
  });
}

// ── Modal mover ───────────────────────────────────────────────────────────────

const modalMover      = document.getElementById("modalMoverBackdrop");
const moverOrigen     = document.getElementById("moverMesaOrigen");
const moverRestSelect = document.getElementById("moverRestSelect");
const moverListaMesas = document.getElementById("moverListaMesas");
const btnMoverConfirm = document.getElementById("btnMoverConfirm");
const btnMoverCancel  = document.getElementById("btnMoverCancelar");
const btnMoverClose   = document.getElementById("btnMoverClose");

let resolveMover = null;

function cerrarModalMover(val = null) {
  modalMover.classList.remove("open");
  if (resolveMover) { resolveMover(val); resolveMover = null; }
}

btnMoverCancel.addEventListener("click", () => cerrarModalMover(null));
btnMoverClose.addEventListener("click",  () => cerrarModalMover(null));
modalMover.addEventListener("click", (e) => { if (e.target === modalMover) cerrarModalMover(null); });

export function abrirModalMover(mesaOrigen, todasLasMesas, restActivo) {
  moverOrigen.textContent = `${mesaOrigen.nombre} (Rest. ${mesaOrigen.restaurante || 1})`;
  moverRestSelect.value   = restActivo;

  const render = (rest) => {
    const libres = todasLasMesas.filter(m =>
      m.estado === "libre" && (m.restaurante || 1) === Number(rest) && m.id !== mesaOrigen.id
    );
    moverListaMesas.innerHTML = libres.length === 0
      ? `<p class="mover-empty">No hay mesas libres en este restaurante.</p>`
      : libres.map(m => `
        <label class="mover-item">
          <input type="radio" name="mesaDest" value="${m.id}" data-nombre="${m.nombre}" data-rest="${m.restaurante || 1}">
          <span class="mover-sector">${m.sector}</span>
          <span class="mover-nombre">${m.nombre}</span>
          <span class="mover-cap">👤 ${m.capacidad || "—"}</span>
        </label>`).join("");
  };

  render(restActivo);
  moverRestSelect.onchange = (e) => render(e.target.value);
  modalMover.classList.add("open");

  return new Promise((resolve) => {
    resolveMover = resolve;
    const handler = () => {
      const checked = moverListaMesas.querySelector("input[name='mesaDest']:checked");
      if (!checked) { toast("Seleccioná una mesa destino", "warning"); return; }
      cerrarModalMover({ mesaDestinoId: checked.value, mesaDestinoNombre: checked.dataset.nombre, nuevoRestaurante: Number(checked.dataset.rest) });
      btnMoverConfirm.removeEventListener("click", handler);
    };
    btnMoverConfirm.addEventListener("click", handler);
  });
}

// ── Panel historial ───────────────────────────────────────────────────────────

const historialPanel  = document.getElementById("historialPanel");
const historialClose  = document.getElementById("historialClose");
const historialBody   = document.getElementById("historialBody");
const historialSearch = document.getElementById("historialSearch");
let _historialData    = [];

historialClose.addEventListener("click", () => historialPanel.classList.remove("open"));

export function mostrarHistorial(data) {
  _historialData = data;
  historialSearch.value = "";
  renderHistorial(data);
  historialPanel.classList.add("open");
}

historialSearch.addEventListener("input", () => {
  const q = historialSearch.value.toLowerCase();
  renderHistorial(_historialData.filter(h =>
    (h.cliente || "").toLowerCase().includes(q) ||
    (h.mesa_nombre || "").toLowerCase().includes(q) ||
    (h.evento || "").toLowerCase().includes(q) ||
    (h.tipo || "").toLowerCase().includes(q)
  ));
});

function renderHistorial(data) {
  if (data.length === 0) {
    historialBody.innerHTML = `<p class="hist-empty">Sin resultados.</p>`;
    return;
  }
  historialBody.innerHTML = data.map(h => {
    const fecha = new Date(h.created_at).toLocaleString("es-BO", { dateStyle: "short", timeStyle: "short" });
    const icono = h.tipo === "reserva" ? "🟢" : h.tipo === "liberacion" ? "⚪" : "🔵";
    return `
      <div class="hist-item">
        <div class="hist-top">
          <span class="hist-icono">${icono}</span>
          <span class="hist-tipo ${h.tipo}">${h.tipo}</span>
          <span class="hist-mesa">${h.mesa_nombre || "—"}</span>
          <span class="hist-fecha">${fecha}</span>
        </div>
        ${h.cliente ? `<div class="hist-cliente">${h.cliente}${h.telefono ? " · " + h.telefono : ""}${h.personas ? " · 👤 " + h.personas : ""}</div>` : ""}
        ${h.evento  ? `<div class="hist-evento">Evento: ${h.evento}</div>` : ""}
        ${h.detalle ? `<div class="hist-detalle">${h.detalle}</div>` : ""}
        <div class="hist-user">${h.usuario_email || ""}</div>
      </div>`;
  }).join("");
}

// ── Buscador de mesas ─────────────────────────────────────────────────────────

let _onBuscar = null;
export function setBuscadorCallback(fn) { _onBuscar = fn; }

document.getElementById("buscador").addEventListener("input", (e) => {
  if (_onBuscar) _onBuscar(e.target.value.toLowerCase().trim());
});
document.getElementById("buscadorClear").addEventListener("click", () => {
  document.getElementById("buscador").value = "";
  if (_onBuscar) _onBuscar("");
});
