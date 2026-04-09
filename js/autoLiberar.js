// ── autoLiberar.js — Libera mesas en espera que superaron el tiempo límite ────

import { actualizarEstado } from "./db.js";
import { toast } from "./ui.js";

const TIEMPO_ESPERA_SEG = 180; // 3 minutos
const INTERVALO_MS      = 60_000;

let ultimasMesas = [];

/**
 * Actualiza la referencia a la lista de mesas para que el auto-liberador
 * siempre trabaje con los datos más recientes.
 * @param {Array} mesas
 */
export function actualizarRefMesas(mesas) {
  ultimasMesas = mesas;
}

/**
 * Inicia el ciclo periódico de auto-liberación.
 */
export function iniciarAutoLiberar() {
  setInterval(async () => {
    const ahora = Date.now();

    const vencidas = ultimasMesas.filter((m) => {
      if (m.estado !== "espera" || !m.hora_bloqueo) return false;
      const diff = (ahora - new Date(m.hora_bloqueo).getTime()) / 1000;
      return diff > TIEMPO_ESPERA_SEG;
    });

    for (const m of vencidas) {
      await actualizarEstado(m.id, { estado: "libre", usuario_id: null });
      toast(`Mesa "${m.nombre}" liberada por tiempo de espera`, "warning");
    }
  }, INTERVALO_MS);
}
