// ── ui.js — Toast + Modal de reserva con unión de mesas ──────────────────────

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

// ── Modal ─────────────────────────────────────────────────────────────────────

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

let resolveModal   = null;
let personasActual = 2;

// Personas +/−
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
backdrop.addEventListener("click", (e) => { if (e.target === backdrop) cerrarModal(null); });

/**
 * Abre el modal de reserva.
 * @param {object} mesaPrincipal  La mesa clickeada
 * @param {Array}  mesasDelSector Todas las mesas libres del mismo sector (para unir)
 * @returns {Promise<{cliente, telefono, personas, mesasUnidas}|null>}
 */
export function abrirModalReserva(mesaPrincipal, mesasDelSector = []) {
  mesaNombreEl.textContent = mesaPrincipal.nombre;
  inputCliente.value       = "";
  inputTel.value           = "";
  personasActual           = mesaPrincipal.capacidad || 2;
  personasNum.textContent  = personasActual;

  // Renderizar lista de mesas para unir (libres del mismo sector, excluyendo la principal)
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
      const cliente = inputCliente.value.trim();
      const telefono = inputTel.value.trim();

      if (!cliente) {
        inputCliente.focus();
        inputCliente.style.borderColor = "var(--reservada)";
        setTimeout(() => (inputCliente.style.borderColor = ""), 800);
        return;
      }

      // Mesas seleccionadas para unir
      const checks = unionList.querySelectorAll(".union-check:checked");
      const mesasUnidas = Array.from(checks).map((c) => ({
        id: c.dataset.id,
        nombre: c.dataset.nombre,
      }));

      cerrarModal({ cliente, telefono, personas: personasActual, mesasUnidas });
      btnConfirmar.removeEventListener("click", handler);
    };

    btnConfirmar.addEventListener("click", handler);
    inputCliente.onkeydown  = (e) => { if (e.key === "Enter") inputTel.focus(); };
    inputTel.onkeydown      = (e) => { if (e.key === "Enter") handler(); };
  });
}
