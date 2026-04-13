// ── db.js ─────────────────────────────────────────────────────────────────────

const SUPABASE_URL = "https://atlpolnlgkoqlpixlsfy.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF0bHBvbG5sZ2tvcWxwaXhsc2Z5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3MDI1MDgsImV4cCI6MjA5MTI3ODUwOH0.roz1-0RHaDPLq9tpLp_3vgJawJtx-CfK9avsZS34lgw";

export const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ── Auth ──────────────────────────────────────────────────────────────────────

export function iniciarGuardiaAuth() {
  return new Promise((resolve) => {
    db.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || (event === "INITIAL_SESSION" && !session)) {
        window.location.href = "login.html";
        return;
      }
      if (event === "INITIAL_SESSION" && session) {
        resolve(session.user);
      }
    });
  });
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
  return data ?? [];
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
  const { error } = await db.from("mesas").update({ slot, sector, restaurante }).eq("id", id);
  if (error) throw error;
}

export async function eliminarMesa(id) {
  const { error } = await db.from("mesas").delete().eq("id", id);
  if (error) throw error;
}

// ── Verificar doble reserva ───────────────────────────────────────────────────

export async function verificarDuplicado({ cliente, telefono, evento, fecha }) {
  let query = db.from("reservas").select("id").ilike("nombre_cliente", cliente.trim());
  if (telefono) query = query.eq("telefono", telefono.trim());
  if (evento)   query = query.eq("evento", evento.trim());
  if (fecha)    query = query.eq("fecha", fecha);
  const { data } = await query;
  return data && data.length > 0;
}

// ── Reservas ──────────────────────────────────────────────────────────────────

export async function crearReserva({ mesa_id, nombre_cliente, usuario_id, personas, telefono, grupo_id, evento, hora_reserva }) {
  const fecha = hora_reserva ? hora_reserva.split("T")[0] : new Date().toISOString().split("T")[0];
  const { error } = await db.from("reservas").insert({
    mesa_id, nombre_cliente, usuario_id, personas, telefono, grupo_id, evento, hora_reserva, fecha,
  });
  if (error) throw error;
}

export async function fetchReservas({ fechaDesde, fechaHasta, evento } = {}) {
  let query = db.from("reservas").select("*").order("created_at", { ascending: false });
  if (fechaDesde) query = query.gte("fecha", fechaDesde);
  if (fechaHasta) query = query.lte("fecha", fechaHasta);
  if (evento)     query = query.eq("evento", evento);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

// ── Historial ─────────────────────────────────────────────────────────────────

export async function registrarHistorial(campos) {
  const { error } = await db.from("historial").insert(campos);
  if (error) console.error("Historial error:", error);
}

export async function fetchHistorial({ limite = 200 } = {}) {
  const { data, error } = await db
    .from("historial").select("*")
    .order("created_at", { ascending: false }).limit(limite);
  if (error) throw error;
  return data ?? [];
}

// ── Config sectores ───────────────────────────────────────────────────────────

const DEFAULTS = {
  salon:   { filas: 3, cols: 3 },
  galeria: { filas: 3, cols: 3 },
  ruta:    { filas: 2, cols: 3 },
};

const _cache = {};

export async function fetchConfigSectores(restaurante) {
  const { data } = await db.from("config_sectores").select("*").eq("restaurante", restaurante);
  (data ?? []).forEach(r => { _cache[`${restaurante}_${r.sector}`] = { filas: r.filas, cols: r.cols }; });
}

export function getSectorConfig(restaurante, sector) {
  return _cache[`${restaurante}_${sector}`] ?? { ...DEFAULTS[sector] };
}

export async function setSectorConfig(restaurante, sector, filas, cols) {
  _cache[`${restaurante}_${sector}`] = { filas, cols };
  await db.from("config_sectores").upsert(
    { restaurante, sector, filas, cols },
    { onConflict: "restaurante,sector" }
  );
}

export async function getCroquisDir() {
  const { data } = await db.from("config_sectores")
    .select("dir").eq("restaurante", 0).eq("sector", "_dir").single();
  return data?.dir ?? "vertical";
}

export async function setCroquisDir(dir) {
  await db.from("config_sectores").upsert(
    { restaurante: 0, sector: "_dir", filas: 0, cols: 0, dir },
    { onConflict: "restaurante,sector" }
  );
}

// ── Realtime ──────────────────────────────────────────────────────────────────
// Estrategia dual:
// 1. Canal postgres_changes — funciona si Replication está activado en Supabase
// 2. Canal broadcast "ping" — cualquier cliente que haga un cambio envía un ping,
//    y todos los demás refrescan. Funciona SIEMPRE sin configuración extra.

let _realtimeCallback = null;
let _configCallback   = null;

export function suscribirCambios(onMesas, onConfig) {
  _realtimeCallback = onMesas;
  _configCallback   = onConfig;

  const canal = db.channel("reservas-global");

  // ── Método 1: postgres_changes (requiere Replication activado) ────────────
  canal
    .on("postgres_changes", { event: "*", schema: "public", table: "mesas" },
      () => { if (_realtimeCallback) _realtimeCallback(); }
    )
    .on("postgres_changes", { event: "*", schema: "public", table: "config_sectores" },
      () => { if (_configCallback) _configCallback(); }
    )

  // ── Método 2: broadcast (siempre funciona, lo envía quien hace el cambio) ─
    .on("broadcast", { event: "mesas_changed" },
      () => { if (_realtimeCallback) _realtimeCallback(); }
    )
    .on("broadcast", { event: "config_changed" },
      () => { if (_configCallback) _configCallback(); }
    )

    .subscribe((status) => {
      const badge = document.getElementById("realtimeBadge");
      if (status === "SUBSCRIBED") {
        if (badge) { badge.textContent = "● En vivo"; badge.style.color = "var(--libre)"; }
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        if (badge) { badge.textContent = "○ Reconectando"; badge.style.color = "var(--espera)"; }
      }
    });

  return canal;
}

// Llamar después de insertar/actualizar mesas para notificar a todos
export async function notificarCambioMesas() {
  await db.channel("reservas-global").send({
    type: "broadcast", event: "mesas_changed", payload: {},
  });
}

export async function notificarCambioConfig() {
  await db.channel("reservas-global").send({
    type: "broadcast", event: "config_changed", payload: {},
  });
}
