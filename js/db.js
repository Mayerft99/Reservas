// ── db.js ─────────────────────────────────────────────────────────────────────

const SUPABASE_URL = "https://atlpolnlgkoqlpixlsfy.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF0bHBvbG5sZ2tvcWxwaXhsc2Z5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3MDI1MDgsImV4cCI6MjA5MTI3ODUwOH0.roz1-0RHaDPLq9tpLp_3vgJawJtx-CfK9avsZS34lgw";

export const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ── Auth ──────────────────────────────────────────────────────────────────────

export async function verificarSesion() {
  const { data } = await db.auth.getSession();
  if (!data.session) window.location.href = "login.html";
}

export async function obtenerUsuario() {
  const { data } = await db.auth.getUser();
  return data?.user ?? null;
}

export async function logout() {
  await db.auth.signOut();
  window.location.href = "login.html";
}

// ── Mesas ─────────────────────────────────────────────────────────────────────

export async function fetchMesas() {
  const { data, error } = await db.from("mesas").select("*");
  if (error) throw error;
  return data;
}

export async function crearMesa({ nombre, sector, capacidad = 4, slot = 0, restaurante = 1 }) {
  const { error } = await db.from("mesas").insert({
    nombre, sector, capacidad, slot, restaurante, estado: "libre",
  });
  if (error) throw error;
}

export async function actualizarEstado(id, campos) {
  const { error } = await db.from("mesas").update(campos).eq("id", id);
  if (error) throw error;
}

export async function actualizarSlot(id, slot, sector, restaurante) {
  const { error } = await db.from("mesas")
    .update({ slot, sector, restaurante })
    .eq("id", id);
  if (error) throw error;
}

export async function eliminarMesa(id) {
  const { error } = await db.from("mesas").delete().eq("id", id);
  if (error) throw error;
}

// ── Reservas ──────────────────────────────────────────────────────────────────

export async function crearReserva({ mesa_id, nombre_cliente, usuario_id, personas, telefono, grupo_id }) {
  const { error } = await db.from("reservas").insert({
    mesa_id, nombre_cliente, usuario_id, personas, telefono, grupo_id,
  });
  if (error) throw error;
}

// ── Config de sectores (filas/cols guardadas en localStorage) ─────────────────
// Usamos localStorage para no necesitar tabla extra en Supabase.
// Clave: "sectorConfig_rest{N}_{sector}" → { filas, cols }

const DEFAULTS = { ruta: { filas: 2, cols: 3 }, galeria: { filas: 3, cols: 3 }, salon: { filas: 3, cols: 3 } };

export function getSectorConfig(restaurante, sector) {
  const key = `sectorConfig_rest${restaurante}_${sector}`;
  const raw = localStorage.getItem(key);
  return raw ? JSON.parse(raw) : { ...DEFAULTS[sector] };
}

export function setSectorConfig(restaurante, sector, filas, cols) {
  const key = `sectorConfig_rest${restaurante}_${sector}`;
  localStorage.setItem(key, JSON.stringify({ filas, cols }));
}

// ── Realtime ──────────────────────────────────────────────────────────────────

export function suscribirCambios(callback) {
  return db
    .channel("cambios-mesas")
    .on("postgres_changes", { event: "*", schema: "public", table: "mesas" }, () => callback())
    .subscribe();
}
