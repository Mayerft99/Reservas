// ── ui.js — Utilidades de interfaz (toast, modal) ─────────────────────────────

// ── Toast ─────────────────────────────────────────────────────────────────────

const toastContainer = document.getElementById("toastContainer");

/**
 * Muestra una notificación temporal.
 * @param {string} message  Texto a mostrar
 * @param {'info'|'success'|'warning'|'danger'} type
 * @param {number} duration  Milisegundos (default 3000)
 */
export function toast(message, type = "info", duration = 3000) {
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.textContent = message;
  toastContainer.appendChild(el);

  setTimeout(() => {
    el.classList.add("removing");
    el.addEventListener("animationend", () => el.remove());
  }, duration);
}

// ── Modal de reserva ──────────────────────────────────────────────────────────

const backdrop     = document.getElementById("modalBackdrop");
const modalTitle   = document.getElementById("modalTitle");
const mesaNombre   = document.getElementById("modalMesaNombre");
const inputCliente = document.getElementById("modalInputCliente");
const btnConfirmar = document.getElementById("modalConfirmar");
const btnCancelar  = document.getElementById("modalCancelar");
const btnClose     = document.getElementById("modalClose");

let resolveModal = null;

function cerrarModal(valor = null) {
  backdrop.classList.remove("open");
  if (resolveModal) { resolveModal(valor); resolveModal = null; }
}

btnCancelar.addEventListener("click", () => cerrarModal(null));
btnClose.addEventListener("click",    () => cerrarModal(null));
backdrop.addEventListener("click", (e) => {
  if (e.target === backdrop) cerrarModal(null);
});

/**
 * Abre el modal de confirmación de reserva.
 * @param {string} nombreMesa
 * @returns {Promise<string|null>} Nombre del cliente o null si se canceló
 */
export function abrirModalReserva(nombreMesa) {
  modalTitle.textContent = "Confirmar reserva";
  mesaNombre.textContent = nombreMesa;
  inputCliente.value     = "";

  backdrop.classList.add("open");
  setTimeout(() => inputCliente.focus(), 200);

  return new Promise((resolve) => {
    resolveModal = resolve;

    const handler = () => {
      const nombre = inputCliente.value.trim();
      if (!nombre) {
        inputCliente.focus();
        inputCliente.style.borderColor = "var(--reservada)";
        setTimeout(() => (inputCliente.style.borderColor = ""), 800);
        return;
      }
      cerrarModal(nombre);
      btnConfirmar.removeEventListener("click", handler);
    };

    btnConfirmar.addEventListener("click", handler);

    // Enter para confirmar
    inputCliente.onkeydown = (e) => {
      if (e.key === "Enter") handler();
    };
  });
}
