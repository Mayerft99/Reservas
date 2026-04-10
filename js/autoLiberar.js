// ── autoLiberar.js ────────────────────────────────────────────────────────────

import { actualizarEstado } from "./db.js";
import { toast } from "./ui.js";

const TIEMPO_ESPERA_SEG = 180;
const INTERVALO_MS      = 60_000;

let ultimasMesas = [];

export function actualizarRefMesas(mesas) {
  ultimasMesas = mesas;
}

export function iniciarAutoLiberar() {
  setInterval(async () => {
    const ahora = Date.now();
    const vencidas = ultimasMesas.filter((m) => {
      if (m.estado !== "espera" || !m.hora_bloqueo) return false;
      return (ahora - new Date(m.hora_bloqueo).getTime()) / 1000 > TIEMPO_ESPERA_SEG;
    });
    for (const m of vencidas) {
      await actualizarEstado(m.id, { estado: "libre", usuario_id: null, hora_bloqueo: null });
      toast(`Mesa "${m.nombre}" liberada automáticamente`, "warning");
    }
  }, INTERVALO_MS);
}
