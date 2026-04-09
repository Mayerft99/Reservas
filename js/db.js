// ── db.js — Supabase client & operaciones de BD ──────────────────────────────

const SUPABASE_URL = "https://atlpolnlgkoqlpixlsfy.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF0bHBvbG5sZ2tvcWxwaXhsc2Z5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3MDI1MDgsImV4cCI6MjA5MTI3ODUwOH0.roz1-0RHaDPLq9tpLp_3vgJawJtx-CfK9avsZS34lgw";

export const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ── Auth ──────────────────────────────────────────────────────────────────────

/**
 * Verifica si hay sesión activa. Si no la hay, redirige a login.html.
 */
export async function verificarSesion() {
  const { data } = await db.auth.getSession();
  if (!data.session) {
    window.location.href = "login.html";
  }
}

/**
 * Devuelve el usuario autenticado actualmente.
 * @returns {Promise<import('@supabase/supabase-js').User|null>}
 */
export async function obtenerUsuario() {
  const { data } = await db.auth.getUser();
  return data?.user ?? null;
}

/**
 * Cierra la sesión y redirige a login.html.
 */
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

export async function crearMesa({ nombre, sector, ancho = 110, alto = 70 }) {
  const { error } = await db.from("mesas").insert({
    nombre,
    sector,
    estado: "libre",
    pos_x: 80 + Math.floor(Math.random() * 300),
    pos_y: 80 + Math.floor(Math.random() * 200),
    ancho,
    alto,
  });
  if (error) throw error;
}

export async function actualizarPosicion(id, pos_x, pos_y) {
  const { error } = await db
    .from("mesas")
    .update({ pos_x, pos_y })
    .eq("id", id);
  if (error) throw error;
}

export async function actualizarEstado(id, campos) {
  const { error } = await db.from("mesas").update(campos).eq("id", id);
  if (error) throw error;
}

export async function eliminarMesa(id) {
  const { error } = await db.from("mesas").delete().eq("id", id);
  if (error) throw error;
}

// ── Reservas ──────────────────────────────────────────────────────────────────

export async function crearReserva(mesa_id, nombre_cliente, usuario_id) {
  const { error } = await db
    .from("reservas")
    .insert({ mesa_id, nombre_cliente, usuario_id });
  if (error) throw error;
}

// ── Realtime ──────────────────────────────────────────────────────────────────

export function suscribirCambios(callback) {
  return db
    .channel("cambios-mesas")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "mesas" },
      () => callback()
    )
    .subscribe();
}
