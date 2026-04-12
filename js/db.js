// ── db.js ─────────────────────────────────────────────────────────────────────

const SUPABASE_URL = "https://atlpolnlgkoqlpixlsfy.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF0bHBvbG5sZ2tvcWxwaXhsc2Z5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3MDI1MDgsImV4cCI6MjA5MTI3ODUwOH0.roz1-0RHaDPLq9tpLp_3vgJawJtx-CfK9avsZS34lgw";

export const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  realtime: { params: { eventsPerSecond: 10 } },
});

// ── Auth ──────────────────────────────────────────────────────────────────────

/**
 * Verifica sesión activa. Si no hay sesión redirige a login.
 * Usa onAuthStateChange para capturar también tokens expirados.
 */
export function iniciarGuardiaAuth() {
  return new Promise((resolve) => {
    db.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || (!session && event !== "INITIAL_SESSION")) {
        window.location.href = "login.html";
      }
      if (event === "INITIAL_SESSION") {
        if (!session) {
          window.location.href = "login.html";
        } else {
          resolve(session.user);
        }
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

// ── Config sectores en Supabase (compartida entre dispositivos) ───────────────

const DEFAULTS = {
  salon:   { filas: 3, cols: 3 },
  galeria: { filas: 3, cols: 3 },
  ruta:    { filas: 2, cols: 3 },
};

// Cache local para evitar requests repetidos
const _configCache = {};

export async function fetchConfigSectores(restaurante) {
  const { data, error } = await db
    .from("config_sectores")
    .select("*")
    .eq("restaurante", restaurante);
  if (error || !data) return;
  data.forEach(row => {
    const key = `${restaurante}_${row.sector}`;
    _configCache[key] = { filas: row.filas, cols: row.cols };
  });
}

export function getSectorConfig(restaurante, sector) {
  const key = `${restaurante}_${sector}`;
  return _configCache[key] ?? { ...DEFAULTS[sector] };
}

export async function setSectorConfig(restaurante, sector, filas, cols) {
  const key = `${restaurante}_${sector}`;
  _configCache[key] = { filas, cols };
  // Upsert en Supabase para que todos los dispositivos lo vean
  const { error } = await db.from("config_sectores").upsert(
    { restaurante, sector, filas, cols },
    { onConflict: "restaurante,sector" }
  );
  if (error) console.error("Config sector error:", error);
}

// Dirección del croquis — guardada en config_sectores con sector='_dir'
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

export function suscribirCambios(callback) {
  const channel = db.channel("cambios-globales");

  // Mesas
  channel.on("postgres_changes",
    { event: "*", schema: "public", table: "mesas" },
    () => callback("mesas")
  );

  // Config sectores (para sincronizar filas/cols entre dispositivos)
  channel.on("postgres_changes",
    { event: "*", schema: "public", table: "config_sectores" },
    () => callback("config")
  );

  channel.subscribe((status) => {
    if (status === "SUBSCRIBED") console.log("✅ Realtime conectado");
    if (status === "CHANNEL_ERROR") console.warn("⚠️ Realtime error, reintentando...");
  });

  return channel;
}
