// ── ui.js — Utilidades de interfaz (toast, modal) ─────────────────────────────

// ── Toast ─────────────────────────────────────────────────────────────────────

const toastContainer = document.getElementById("toastContainer");

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
const personasNum  = document.getElementById("personasNum");
const btnMenos     = document.getElementById("personasMenos");
const btnMas       = document.getElementById("personasMas");

let resolveModal = null;
let personasActual = 2;

// Control de personas
btnMenos.addEventListener("click", () => {
  if (personasActual > 1) {
    personasActual--;
    personasNum.textContent = personasActual;
  }
});

btnMas.addEventListener("click", () => {
  if (personasActual < 20) {
    personasActual++;
    personasNum.textContent = personasActual;
  }
});

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
 * @param {number} capacidadDefault  Capacidad sugerida de la mesa
 * @returns {Promise<{cliente: string, personas: number}|null>}
 */
export function abrirModalReserva(nombreMesa, capacidadDefault = 2) {
  modalTitle.textContent = "Confirmar reserva";
  mesaNombre.textContent = nombreMesa;
  inputCliente.value     = "";
  personasActual = capacidadDefault;
  personasNum.textContent = personasActual;

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
      cerrarModal({ cliente: nombre, personas: personasActual });
      btnConfirmar.removeEventListener("click", handler);
    };

    btnConfirmar.addEventListener("click", handler);

    inputCliente.onkeydown = (e) => {
      if (e.key === "Enter") handler();
    };
  });
}
