// ── app.js — Orquestador principal ────────────────────────────────────────────

import { fetchMesas, crearMesa, suscribirCambios, verificarSesion, obtenerUsuario, logout } from "./db.js";
import { renderMesas, setSectorActivo, setUserId } from "./mesa.js";
import { actualizarRefMesas, iniciarAutoLiberar }  from "./autoLiberar.js";
import { toast }                                    from "./ui.js";

// ── Auth: verificar sesión antes de todo ──────────────────────────────────────

await verificarSesion();

const usuario = await obtenerUsuario();
if (usuario) {
  setUserId(usuario.id);
  const emailEl = document.getElementById("userEmail");
  if (emailEl) emailEl.textContent = usuario.email;
}

// Botón cerrar sesión
document.getElementById("btnLogout").addEventListener("click", async () => {
  await logout();
});

// ── Estado local ──────────────────────────────────────────────────────────────

let mesasCache = [];

// ── Carga y refresco ──────────────────────────────────────────────────────────

async function cargar() {
  try {
    mesasCache = await fetchMesas();
    renderMesas(mesasCache);
    actualizarRefMesas(mesasCache);
  } catch (err) {
    console.error("Error al cargar mesas:", err);
    toast("Error al cargar mesas", "danger");
  }
}

// ── Sidebar toggle ────────────────────────────────────────────────────────────

const sidebar       = document.getElementById("sidebar");
const btnToggle     = document.getElementById("toggleSidebar");
const btnOpen       = document.getElementById("openSidebar");

btnToggle.addEventListener("click", () => {
  sidebar.classList.add("collapsed");
  btnOpen.style.display = "inline-flex";
  btnToggle.style.display = "none";
});

btnOpen.addEventListener("click", () => {
  sidebar.classList.remove("collapsed");
  btnOpen.style.display = "none";
  btnToggle.style.display = "";
});

// ── Crear mesa ────────────────────────────────────────────────────────────────

document.getElementById("btnCrear").addEventListener("click", async () => {
  const nombre = document.getElementById("inputNombre").value.trim();
  const sector = document.getElementById("inputSector").value;
  const ancho  = parseInt(document.getElementById("inputAncho").value) || 110;
  const alto   = parseInt(document.getElementById("inputAlto").value)  || 70;

  if (!nombre) {
    document.getElementById("inputNombre").focus();
    toast("Ingresá el nombre de la mesa", "warning");
    return;
  }

  try {
    await crearMesa({ nombre, sector, ancho, alto });
    document.getElementById("inputNombre").value = "";
    toast(`Mesa "${nombre}" creada`, "success");
  } catch (err) {
    toast("Error al crear mesa", "danger");
    console.error(err);
  }
});

// Enter en input nombre → crear
document.getElementById("inputNombre").addEventListener("keydown", (e) => {
  if (e.key === "Enter") document.getElementById("btnCrear").click();
});

// ── Filtro de sector ──────────────────────────────────────────────────────────

document.getElementById("filterChips").addEventListener("click", (e) => {
  const chip = e.target.closest(".chip");
  if (!chip) return;

  document.querySelectorAll(".chip").forEach((c) => c.classList.remove("active"));
  chip.classList.add("active");

  setSectorActivo(chip.dataset.sector);
  renderMesas(mesasCache);
});

// ── Limpiar todo ──────────────────────────────────────────────────────────────

document.getElementById("btnLimpiarTodo").addEventListener("click", async () => {
  const ok = confirm("¿Eliminar TODAS las mesas? Esta acción no se puede deshacer.");
  if (!ok) return;

  // Eliminar una por una (o podría ser un batch en Supabase)
  const { eliminarMesa } = await import("./db.js");
  for (const m of mesasCache) {
    await eliminarMesa(m.id);
  }
  toast("Plano limpiado", "info");
});

// ── Realtime ──────────────────────────────────────────────────────────────────

suscribirCambios(cargar);

// ── Auto-liberar ──────────────────────────────────────────────────────────────

iniciarAutoLiberar();

// ── Iniciar ───────────────────────────────────────────────────────────────────

cargar();
