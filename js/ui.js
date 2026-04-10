// ── ui.js ─────────────────────────────────────────────────────────────────────

// ── Toast ─────────────────────────────────────────────────────────────────────

const toastContainer = document.getElementById("toastContainer");

export function toast(message, type = "info", duration = 3200) {
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.textContent = message;
  toastContainer.appendChild(el);
  setTimeout(() => {
    el.classList.add("removing");
    el.addEventListener("animationend", () => el.remove(), { once: true });
  }, duration);
}

// ── Modal reserva ─────────────────────────────────────────────────────────────

const backdrop     = document.getElementById("modalBackdrop");
const mesaNombreEl = document.getElementById("modalMesaNombre");
const inputCliente = document.getElementById("modalInputCliente");
const inputTel     = document.getElementById("modalInputTel");
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

btnMenos.addEventListener("click", () => {
  if (personasActual > 1) { personasActual--; personasNum.textContent = personasActual; }
});
btnMas.addEventListener("click", () => {
  if (personasActual < 30) { personasActual++; personasNum.textContent = personasActual; }
});

function cerrarModal(valor = null) {
  backdrop.classList.remove("open");
  if (resolveModal) { resolveModal(valor); resolveModal = null; }
}

btnCancelar.addEventListener("click", () => cerrarModal(null));
btnClose.addEventListener("click",    () => cerrarModal(null));
backdrop.addEventListener("click",   (e) => { if (e.target === backdrop) cerrarModal(null); });

/**
 * Modal para NUEVA reserva (mesa libre).
 * @returns {Promise<{cliente, telefono, personas, mesasUnidas}|null>}
 */
export function abrirModalReserva(mesaPrincipal, mesasDelSector = []) {
  mesaNombreEl.textContent    = mesaPrincipal.nombre;
  inputCliente.value          = "";
  inputTel.value              = "";
  personasActual              = mesaPrincipal.capacidad || 2;
  personasNum.textContent     = personasActual;
  btnMoverRes.style.display   = "none"; // ocultar botón mover en modal nuevo

  const candidatas = mesasDelSector.filter(
    (m) => m.id !== mesaPrincipal.id && m.estado === "libre"
  );

  if (candidatas.length > 0) {
    unionSection.style.display = "block";
    unionList.innerHTML = candidatas.map((m) => `
      <label class="union-item">
        <input type="checkbox" class="union-check" data-id="${m.id}" data-nombre="${m.nombre}">
        <span class="union-nombre">${m.nombre}</span>
        <span class="union-cap">👤 ${m.capacidad || "—"}</span>
      </label>
    `).join("");
  } else {
    unionSection.style.display = "none";
    unionList.innerHTML = "";
  }

  backdrop.classList.add("open");
  setTimeout(() => inputCliente.focus(), 200);

  return new Promise((resolve) => {
    resolveModal = resolve;
    const handler = () => {
      const cliente  = inputCliente.value.trim();
      const telefono = inputTel.value.trim();
      if (!cliente) {
        inputCliente.focus();
        inputCliente.style.borderColor = "var(--reservada)";
        setTimeout(() => (inputCliente.style.borderColor = ""), 800);
        return;
      }
      const checks = unionList.querySelectorAll(".union-check:checked");
      const mesasUnidas = Array.from(checks).map((c) => ({ id: c.dataset.id, nombre: c.dataset.nombre }));
      cerrarModal({ cliente, telefono, personas: personasActual, mesasUnidas });
      btnConfirmar.removeEventListener("click", handler);
    };
    btnConfirmar.addEventListener("click", handler);
    inputCliente.onkeydown = (e) => { if (e.key === "Enter") inputTel.focus(); };
    inputTel.onkeydown     = (e) => { if (e.key === "Enter") handler(); };
  });
}

/**
 * Modal para VER reserva activa (mesa reservada).
 * Muestra datos y ofrece botón "Mover a otra mesa".
 * @returns {Promise<'liberar'|'mover'|null>}
 */
export function abrirModalReservada(mesa) {
  mesaNombreEl.textContent  = mesa.nombre;
  inputCliente.value        = mesa.cliente || "";
  inputTel.value            = mesa.telefono || "";
  personasActual            = mesa.personas || 1;
  personasNum.textContent   = personasActual;
  unionSection.style.display = "none";
  btnMoverRes.style.display  = "inline-flex";
  btnConfirmar.textContent   = "Liberar mesa";
  btnConfirmar.className     = "btn btn-danger";

  backdrop.classList.add("open");

  return new Promise((resolve) => {
    resolveModal = resolve;

    const handleLiberar = () => {
      cerrarModal("liberar");
      cleanup();
    };
    const handleMover = () => {
      cerrarModal("mover");
      cleanup();
    };
    const cleanup = () => {
      btnConfirmar.removeEventListener("click", handleLiberar);
      btnMoverRes.removeEventListener("click", handleMover);
      btnConfirmar.textContent = "Confirmar reserva";
      btnConfirmar.className   = "btn btn-primary";
    };

    btnConfirmar.addEventListener("click", handleLiberar);
    btnMoverRes.addEventListener("click", handleMover);
  });
}

// ── Modal mover reserva ───────────────────────────────────────────────────────

const modalMover       = document.getElementById("modalMoverBackdrop");
const moverMesaOrigen  = document.getElementById("moverMesaOrigen");
const moverRestSelect  = document.getElementById("moverRestSelect");
const moverListaMesas  = document.getElementById("moverListaMesas");
const btnMoverConfirm  = document.getElementById("btnMoverConfirm");
const btnMoverCancelar = document.getElementById("btnMoverCancelar");
const btnMoverClose    = document.getElementById("btnMoverClose");

let resolveMover = null;

function cerrarModalMover(valor = null) {
  modalMover.classList.remove("open");
  if (resolveMover) { resolveMover(valor); resolveMover = null; }
}

btnMoverCancelar.addEventListener("click", () => cerrarModalMover(null));
btnMoverClose.addEventListener("click",    () => cerrarModalMover(null));
modalMover.addEventListener("click",       (e) => { if (e.target === modalMover) cerrarModalMover(null); });

/**
 * Abre el modal para mover una reserva.
 * @param {object} mesaOrigen       Mesa con la reserva actual
 * @param {Array}  todasLasMesas    Todas las mesas disponibles
 * @param {number} restActivo       Restaurante activo actualmente
 * @returns {Promise<{mesaDestino, nuevoRestaurante}|null>}
 */
export function abrirModalMover(mesaOrigen, todasLasMesas, restActivo) {
  moverMesaOrigen.textContent = `${mesaOrigen.nombre} (Rest. ${mesaOrigen.restaurante || 1})`;
  moverRestSelect.value       = restActivo;

  const renderMesasDestino = (restaurante) => {
    const libres = todasLasMesas.filter(
      (m) => m.estado === "libre" && (m.restaurante || 1) === Number(restaurante) && m.id !== mesaOrigen.id
    );
    if (libres.length === 0) {
      moverListaMesas.innerHTML = `<p class="mover-empty">No hay mesas libres en este restaurante.</p>`;
      return;
    }
    moverListaMesas.innerHTML = libres.map((m) => `
      <label class="mover-item">
        <input type="radio" name="mesaDestino" value="${m.id}" data-nombre="${m.nombre}" data-rest="${m.restaurante || 1}">
        <span class="mover-sector">${m.sector}</span>
        <span class="mover-nombre">${m.nombre}</span>
        <span class="mover-cap">👤 ${m.capacidad || "—"}</span>
      </label>
    `).join("");
  };

  renderMesasDestino(restActivo);

  moverRestSelect.onchange = (e) => renderMesasDestino(e.target.value);

  modalMover.classList.add("open");

  return new Promise((resolve) => {
    resolveMover = resolve;
    const handler = () => {
      const checked = moverListaMesas.querySelector("input[name='mesaDestino']:checked");
      if (!checked) {
        toast("Seleccioná una mesa destino", "warning");
        return;
      }
      cerrarModalMover({
        mesaDestinoId:   checked.value,
        mesaDestinoNombre: checked.dataset.nombre,
        nuevoRestaurante: Number(checked.dataset.rest),
      });
      btnMoverConfirm.removeEventListener("click", handler);
    };
    btnMoverConfirm.addEventListener("click", handler);
  });
}
