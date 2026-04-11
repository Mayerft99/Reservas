// ── export.js — Exportar reservas a Excel ────────────────────────────────────
// Usa SheetJS (xlsx) cargado desde CDN en index.html

export async function exportarExcel({ reservas, mesas, tipo = "dia", valor = "" }) {
  if (!window.XLSX) {
    alert("Error: librería XLSX no cargada.");
    return;
  }
  const XLSX = window.XLSX;

  // ── Filtrar reservas ──────────────────────────────────────────────────────
  let datos = reservas;
  if (tipo === "dia" && valor) {
    datos = reservas.filter(r => (r.fecha || "").startsWith(valor));
  } else if (tipo === "evento" && valor) {
    datos = reservas.filter(r => (r.evento || "").toLowerCase().includes(valor.toLowerCase()));
  }

  if (datos.length === 0) {
    alert("No hay reservas para exportar con ese filtro.");
    return;
  }

  // ── Hoja 1: Reservas ──────────────────────────────────────────────────────
  const mesaMap = Object.fromEntries(mesas.map(m => [m.id, m]));

  const filas = datos.map(r => {
    const mesa = mesaMap[r.mesa_id] || {};
    return {
      "Fecha":         r.fecha || "",
      "Hora reserva":  r.hora_reserva ? new Date(r.hora_reserva).toLocaleTimeString("es-BO", { hour: "2-digit", minute: "2-digit" }) : "",
      "Cliente":       r.nombre_cliente || "",
      "Teléfono":      r.telefono || "",
      "Personas":      r.personas || "",
      "Evento":        r.evento || "",
      "Mesa":          mesa.nombre || r.mesa_id,
      "Sector":        mesa.sector || "",
      "Restaurante":   mesa.restaurante || 1,
      "Creado":        r.created_at ? new Date(r.created_at).toLocaleString("es-BO") : "",
    };
  });

  const ws1 = XLSX.utils.json_to_sheet(filas);
  ajustarColumnas(ws1, filas);

  // ── Hoja 2: Croquis ───────────────────────────────────────────────────────
  const sectores   = ["salon", "galeria", "ruta"];
  const restaurante = 1;
  const croquisFilas = [];

  sectores.forEach(sector => {
    croquisFilas.push({ "Sector": `▶ ${sector.toUpperCase()}`, "Mesa": "", "Estado": "", "Cliente": "", "Personas": "", "Hora": "", "Evento": "" });
    const mesasSector = mesas.filter(m => m.sector === sector && (m.restaurante || 1) === restaurante);
    mesasSector.sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0));
    mesasSector.forEach(m => {
      croquisFilas.push({
        "Sector":   sector,
        "Mesa":     m.nombre,
        "Estado":   m.estado,
        "Cliente":  m.cliente || "",
        "Personas": m.personas || "",
        "Hora":     m.hora_reserva ? new Date(m.hora_reserva).toLocaleTimeString("es-BO", { hour: "2-digit", minute: "2-digit" }) : "",
        "Evento":   m.evento || "",
      });
    });
    croquisFilas.push({});
  });

  const ws2 = XLSX.utils.json_to_sheet(croquisFilas);
  ajustarColumnas(ws2, croquisFilas);

  // ── Colorear celdas de estado en hoja croquis ─────────────────────────────
  const colEstado = 2; // columna C (0-indexed)
  croquisFilas.forEach((fila, idx) => {
    if (!fila["Estado"]) return;
    const cellRef = XLSX.utils.encode_cell({ r: idx + 1, c: colEstado });
    if (!ws2[cellRef]) return;
    const color = fila["Estado"] === "reservada" ? "FFEF4444"
                : fila["Estado"] === "espera"    ? "FFF59E0B"
                : "FF22C55E";
    ws2[cellRef].s = { fill: { fgColor: { rgb: color } }, font: { bold: true } };
  });

  // ── Workbook ──────────────────────────────────────────────────────────────
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws1, "Reservas");
  XLSX.utils.book_append_sheet(wb, ws2, "Croquis");

  const nombreArchivo = `reservas_${tipo}_${valor || "todas"}_${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, nombreArchivo);
}

function ajustarColumnas(ws, data) {
  if (!data.length) return;
  const keys = Object.keys(data[0]);
  ws["!cols"] = keys.map(k => ({
    wch: Math.max(k.length, ...data.map(r => String(r[k] || "").length), 10) + 2,
  }));
}
