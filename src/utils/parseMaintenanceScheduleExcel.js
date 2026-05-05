/**
 * parseMaintenanceScheduleExcel.js
 * Utilidad para parsear el Excel "FR-MN-01 Cronograma de mantenimientos preventivos"
 * Usa la librería SheetJS (xlsx) para leer el archivo.
 */
import * as XLSX from "xlsx";

// ─── Constantes ───────────────────────────────────────────────────────────────

const SHEET_NAME = "DATOS";

const MES_MAP = {
  ENE: 1, FEB: 2, MAR: 3,  ABR: 4,  MAY: 5,  JUN: 6,
  JUL: 7, AGO: 8, SEP: 9,  OCT: 10, NOV: 11, DIC: 12,
};

// Alias posibles en los encabezados del Excel
const COL_ALIASES = {
  nombre:     ["NOMBRE", "NOMBRE EQUIPO", "EQUIPO"],
  tarea:      ["TAREA A REALIZAR", "TAREA", "ACTIVIDAD", "DESCRIPCION"],
  codigo:     ["CÓDIGO", "CODIGO", "CODE", "COD", "TAG"],
  semana:     ["SEMANA", "SEM", "SEMANA PROGRAMADA"],
  frecuencia: ["FRECUENCIA (MESES)", "FRECUENCIA", "FREQ MESES", "FREC"],
  mes_base:   ["MES BASE", "MES INICIO", "MES_BASE"],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Normaliza un valor de celda a string limpio en mayúsculas
 */
function normalizeCell(val) {
  if (val === null || val === undefined) return "";
  return String(val).trim().toUpperCase();
}

/**
 * Dado un array de encabezados normalizados y un objeto de aliases,
 * retorna el índice de la columna o -1 si no se encuentra.
 */
function findColIndex(headers, aliasKey) {
  const aliases = COL_ALIASES[aliasKey] || [];
  for (const alias of aliases) {
    const idx = headers.findIndex(h => h === alias || h.startsWith(alias));
    if (idx !== -1) return idx;
  }
  return -1;
}

/**
 * Convierte un número de columna (0-based) a letra Excel (A, B, C, ... Z, AA ...)
 */
function colNumToLetter(n) {
  let letter = "";
  while (n >= 0) {
    letter = String.fromCharCode((n % 26) + 65) + letter;
    n = Math.floor(n / 26) - 1;
  }
  return letter;
}

// ─── Parser principal ─────────────────────────────────────────────────────────

/**
 * parseMaintenanceScheduleExcel
 * Lee un archivo .xlsx y extrae los datos del cronograma de mantenimiento.
 *
 * @param {File} file  — objeto File del input / drop
 * @returns {Promise<ParseResult>}
 *   ParseResult = { rows: ScheduleRow[], errors: string[], warnings: string[], sheetFound: boolean }
 */
export async function parseMaintenanceScheduleExcel(file) {
  const result = {
    rows: [],
    errors: [],
    warnings: [],
    sheetFound: false,
    totalMeses: 0,
  };

  // 1. Leer el archivo como ArrayBuffer
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", cellText: false, cellDates: true });

  // 2. Verificar que exista la hoja DATOS
  if (!workbook.SheetNames.includes(SHEET_NAME)) {
    result.errors.push(`No se encontró la hoja "${SHEET_NAME}" en el archivo. Hojas disponibles: ${workbook.SheetNames.join(", ")}`);
    return result;
  }

  result.sheetFound = true;
  const sheet = workbook.Sheets[SHEET_NAME];

  // 3. Convertir a array de arrays (raw) para control total
  const raw = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
    blankrows: false,
  });

  if (raw.length < 2) {
    result.errors.push("La hoja DATOS está vacía o no tiene suficientes filas.");
    return result;
  }

  // 4. Buscar la fila de encabezados (la que contenga "NOMBRE" en alguna columna)
  let headerRowIdx = -1;
  for (let i = 0; i < Math.min(raw.length, 20); i++) {
    const row = raw[i];
    const normalized = row.map(c => normalizeCell(c));
    if (normalized.some(c => c === "NOMBRE" || c === "NOMBRE EQUIPO")) {
      headerRowIdx = i;
      break;
    }
  }

  if (headerRowIdx === -1) {
    result.errors.push(
      "No se encontró la fila de encabezados. Se buscó la columna 'NOMBRE' en las primeras 20 filas."
    );
    return result;
  }

  const headers = raw[headerRowIdx].map(c => normalizeCell(c));

  // 5. Mapear índices de columnas
  const iNombre     = findColIndex(headers, "nombre");
  const iTarea      = findColIndex(headers, "tarea");
  const iCodigo     = findColIndex(headers, "codigo");
  const iSemana     = findColIndex(headers, "semana");
  const iFrecuencia = findColIndex(headers, "frecuencia");
  const iMesBase    = findColIndex(headers, "mes_base");

  // Validar columnas obligatorias
  if (iNombre === -1)  result.warnings.push("Columna 'NOMBRE' no detectada exactamente.");
  if (iCodigo === -1)  result.errors.push("Columna 'CÓDIGO / CODIGO' es obligatoria y no se encontró.");
  if (iTarea === -1)   result.warnings.push("Columna 'TAREA A REALIZAR' no encontrada — se dejará en blanco.");

  if (result.errors.length > 0) return result;

  // Índices de meses (buscar ENE, FEB, ..., DIC en headers)
  const mesIndices = {}; // { "ENE": 6, "FEB": 7, ... }
  Object.keys(MES_MAP).forEach(mes => {
    const idx = headers.indexOf(mes);
    if (idx !== -1) mesIndices[mes] = idx;
  });

  const mesesEncontrados = Object.keys(mesIndices);
  if (mesesEncontrados.length === 0) {
    result.warnings.push("No se detectaron columnas de meses (ENE–DIC). Revisa que los encabezados estén en mayúsculas sin tildes.");
  }

  // 6. Recorrer filas de datos (desde headerRowIdx + 1)
  const codigosVistos = new Set();

  for (let rowIdx = headerRowIdx + 1; rowIdx < raw.length; rowIdx++) {
    const row = raw[rowIdx];

    // Ignorar filas completamente vacías
    if (row.every(c => c === "" || c === null || c === undefined)) continue;

    const rawCodigo = row[iCodigo];
    const codigo    = normalizeCell(rawCodigo);

    // Ignorar filas sin código
    if (!codigo) continue;

    // Detectar duplicados dentro del mismo archivo
    if (codigosVistos.has(codigo)) {
      result.warnings.push(`Fila ${rowIdx + 1}: código "${codigo}" duplicado en el archivo — se importará solo la primera ocurrencia.`);
      continue;
    }
    codigosVistos.add(codigo);

    // Extraer campos principales
    const nombre     = String(iNombre     >= 0 ? (row[iNombre]     ?? "") : "").trim();
    const tarea      = String(iTarea      >= 0 ? (row[iTarea]      ?? "") : "").trim();
    const semana     = iSemana     >= 0 ? parseInt(row[iSemana])     || null : null;
    const frecuencia = iFrecuencia >= 0 ? parseInt(row[iFrecuencia]) || null : null;
    const mesBase    = iMesBase    >= 0 ? parseInt(row[iMesBase])    || null : null;

    // Extraer meses programados
    const meses_programados = [];
    Object.entries(mesIndices).forEach(([mes, colIdx]) => {
      const val = normalizeCell(row[colIdx]);
      if (val === "X" || val === "✓" || val === "SI" || val === "1" || val === "TRUE") {
        meses_programados.push({
          mes,
          numero_mes: MES_MAP[mes],
          programado: true,
        });
      }
    });

    // Ordenar meses por número
    meses_programados.sort((a, b) => a.numero_mes - b.numero_mes);

    result.rows.push({
      _fila: rowIdx + 1,              // Número de fila en el Excel (para debug)
      codigo_equipo: codigo,
      nombre_equipo: nombre,
      tarea_realizar: tarea,
      semana_programada: semana,
      frecuencia_meses: frecuencia,
      mes_base: mesBase,
      meses_programados,
      estado_inicial: "Pendiente",
    });

    result.totalMeses += meses_programados.length;
  }

  if (result.rows.length === 0) {
    result.warnings.push("No se encontraron filas con datos válidos (código de equipo requerido).");
  }

  return result;
}

/**
 * Retorna el mes con más mantenimientos programados dado el array de rows
 * @param {Array} rows
 * @returns {string} — Nombre del mes (ej: "MAY")
 */
export function getMesConMasMantenimientos(rows) {
  const conteo = {};
  rows.forEach(r => {
    r.meses_programados.forEach(m => {
      conteo[m.mes] = (conteo[m.mes] || 0) + 1;
    });
  });
  if (Object.keys(conteo).length === 0) return "—";
  return Object.entries(conteo).sort((a, b) => b[1] - a[1])[0][0];
}
