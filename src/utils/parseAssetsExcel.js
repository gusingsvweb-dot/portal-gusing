/**
 * parseAssetsExcel.js
 * Parsea archivos Excel de gestión de activos:
 *   - FR-MN-19: Listado maestro de equipos
 *   - FR-MN-05: Listado maestro de equipos de oficina
 *
 * Usa SheetJS (xlsx) para la lectura. No depende de posiciones fijas —
 * detecta encabezados dinámicamente buscando columnas conocidas.
 */
import * as XLSX from "xlsx";

// ─── Constantes ────────────────────────────────────────────────────────────────

const DOC_TYPES = {
  FRMN19: "FR-MN-19",
  FRMN05: "FR-MN-05",
};

// Columnas "firma" de cada hoja — se usan para detección automática
const FRMN19_SIGNATURE = ["CÓDIGO", "CODIGO", "PROCESO", "PLANTA", "EQUIPO"];
const FRMN05_SHEETS    = ["COMPUTADORES", "IMPRESORAS", "CELULARES"];

// ─── normalizeHeader ──────────────────────────────────────────────────────────

/**
 * Convierte un encabezado de Excel al snake_case normalizado.
 * Elimina tildes, puntuación extra, espacios dobles y pasa a minúsculas.
 *
 * Ejemplos:
 *   "CÓDIGO"        → "codigo"
 *   "AREA ESTERIL"  → "area_esteril"
 *   "S.A.C"         → "sac"
 *   "DISCO DURO C:" → "disco_duro_c"
 *   "Proposito"     → "proposito"
 */
export function normalizeHeader(raw) {
  if (!raw && raw !== 0) return "";
  return String(raw)
    .trim()
    // Tildes
    .replace(/[áàäâã]/gi, "a")
    .replace(/[éèëê]/gi,  "e")
    .replace(/[íìïî]/gi,  "i")
    .replace(/[óòöôõ]/gi, "o")
    .replace(/[úùüû]/gi,  "u")
    .replace(/[ñ]/gi,     "n")
    // Puntuación (puntos, dos puntos, paréntesis, barra)
    .replace(/[.:()\/\\]/g, " ")
    // Guion a espacio
    .replace(/-/g, " ")
    // Espacios múltiples → uno
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    // Espacios → guion bajo
    .replace(/ /g, "_");
}

// ─── normalizeStatus ──────────────────────────────────────────────────────────

/**
 * Convierte el estado de un activo a un valor canónico.
 */
export function normalizeStatus(raw) {
  if (!raw) return null;
  const s = String(raw).trim().toUpperCase();
  if (["ACTIVO", "ACTIVA", "ACTIVE", "SI"].includes(s))         return "Activo";
  if (["INACTIVO", "INACTIVA", "INACTIVE"].includes(s))         return "Inactivo";
  if (["FUERA DE USO", "BAJA", "DADO DE BAJA"].includes(s))     return "Fuera de uso";
  if (["EN REPARACION", "REPARACION", "MANTENIMIENTO"].includes(s)) return "En reparación";
  // Retornar el original capitalizado si no se reconoce
  return raw.trim().charAt(0).toUpperCase() + raw.trim().slice(1).toLowerCase();
}

// ─── normalizeValue ───────────────────────────────────────────────────────────

function normalizeValue(val) {
  if (val === null || val === undefined || val === "") return null;
  const s = String(val).trim();
  if (["N.A", "N.A.", "NO APLICA", "N/A", "NO APPLY", "-", "—"].includes(s.toUpperCase())) return null;
  return s || null;
}

// ─── findHeaderRow ────────────────────────────────────────────────────────────

/**
 * Busca la fila de encabezados en un array de arrays (máx 30 filas).
 * Retorna { rowIndex, headers: Map<normalizedKey, colIndex> } o null.
 *
 * @param {Array[]} rows     - sheet_to_json con header:1
 * @param {string[]} lookFor - palabras clave a buscar (normalizadas)
 */
function findHeaderRow(rows, lookFor) {
  const lookForNorm = lookFor.map(normalizeHeader);

  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;

    const rowNorm = row.map(c => normalizeHeader(String(c ?? "")));
    const matches = lookForNorm.filter(k => rowNorm.includes(k));

    // Considera encabezado si al menos 2 de las keywords aparecen
    if (matches.length >= 2) {
      const headers = new Map();
      rowNorm.forEach((key, idx) => {
        if (key) headers.set(key, idx);
      });
      return { rowIndex: i, headers };
    }
  }
  return null;
}

// ─── getCell ─────────────────────────────────────────────────────────────────

function getCell(row, headers, key) {
  const normKey = normalizeHeader(key);
  const idx = headers.get(normKey);
  if (idx === undefined || idx === -1) return null;
  return normalizeValue(row[idx]);
}

// ─── detectDocumentType ───────────────────────────────────────────────────────

/**
 * Detecta si el workbook es FR-MN-19 o FR-MN-05.
 * @returns { docType: string|null, reason: string }
 */
export function detectDocumentType(workbook) {
  const sheetNames = workbook.SheetNames.map(s => s.trim().toUpperCase());

  // FR-MN-19: tiene una hoja "Listado maestro" o similar
  const hasMaster = workbook.SheetNames.find(
    s => normalizeHeader(s).includes("listado") || normalizeHeader(s).includes("maestro")
  );

  if (hasMaster) {
    // Verificar que tenga las columnas firma
    const sheet = workbook.Sheets[hasMaster];
    const rows  = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
    const hdr   = findHeaderRow(rows, ["CÓDIGO", "PROCESO", "EQUIPO"]);
    if (hdr) return { docType: DOC_TYPES.FRMN19, detectedSheet: hasMaster, reason: `Hoja "${hasMaster}" con columnas CÓDIGO, PROCESO, EQUIPO` };
  }

  // FR-MN-05: tiene hojas COMPUTADORES / IMPRESORAS / CELULARES
  const officeSheets = FRMN05_SHEETS.filter(s => sheetNames.includes(s));
  if (officeSheets.length >= 1) {
    return { docType: DOC_TYPES.FRMN05, detectedSheets: officeSheets, reason: `Hojas de oficina detectadas: ${officeSheets.join(", ")}` };
  }

  return { docType: null, reason: "No se pudo identificar el formato. Verifica que sea FR-MN-19 o FR-MN-05." };
}

// ─── parseFRMN19 ──────────────────────────────────────────────────────────────

/**
 * Parsea la hoja "Listado maestro" del FR-MN-19.
 * @returns { assets: NormalizedAsset[], warnings: string[], errors: string[] }
 */
export function parseFRMN19(workbook) {
  const result = { assets: [], warnings: [], errors: [] };

  // Buscar la hoja (puede llamarse con tildes o variaciones)
  const sheetName = workbook.SheetNames.find(
    s => normalizeHeader(s).includes("listado") || normalizeHeader(s).includes("maestro")
  );
  if (!sheetName) {
    result.errors.push("No se encontró la hoja 'Listado maestro' en el archivo.");
    return result;
  }

  const sheet = workbook.Sheets[sheetName];
  const rows  = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false });

  const hdr = findHeaderRow(rows, ["CÓDIGO", "PROCESO", "EQUIPO"]);
  if (!hdr) {
    result.errors.push(`Hoja "${sheetName}": no se detectaron los encabezados esperados (CÓDIGO, PROCESO, EQUIPO) en las primeras 30 filas.`);
    return result;
  }

  const { rowIndex, headers } = hdr;

  // Mapeo de alias para columnas con nombres variables
  const COL = {
    codigo:      ["codigo", "code", "cod"],
    equipo:      ["equipo", "nombre_equipo", "nombre", "descripcion"],
    proceso:     ["proceso", "process"],
    planta:      ["planta", "plant"],
    nivel:       ["nivel", "level"],
    area:        ["area", "ubicacion"],
    area_esteril:["area_esteril", "area_estéril", "estéril"],
    estado:      ["estado", "status"],
    sac:         ["sac", "s_a_c"],
    serie:       ["serie", "serial", "numero_de_serie"],
    modelo:      ["modelo", "model"],
  };

  function getByAliases(row, aliases) {
    for (const alias of aliases) {
      const idx = headers.get(alias);
      if (idx !== undefined) return normalizeValue(row[idx]);
    }
    return null;
  }

  const seen = new Set();

  for (let i = rowIndex + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every(c => !c || String(c).trim() === "")) continue;

    const codigo = getByAliases(row, COL.codigo);
    if (!codigo) continue;

    if (seen.has(codigo)) {
      result.warnings.push(`Fila ${i + 1}: código "${codigo}" duplicado en el archivo — se usó solo la primera ocurrencia.`);
      continue;
    }
    seen.add(codigo);

    const nombre = getByAliases(row, COL.equipo) || `Equipo ${codigo}`;
    const nivel  = getByAliases(row, COL.nivel);

    result.assets.push({
      codigo,
      nombre,
      asset_type:      "Equipo",
      tipo:            "Equipo",
      criticidad:      "Media",        // Default para equipos de planta
      process:         getByAliases(row, COL.proceso),
      plant:           getByAliases(row, COL.planta),
      level_num:       nivel ? (parseInt(nivel) || null) : null,
      area:            getByAliases(row, COL.area),
      sterile_area:    getByAliases(row, COL.area_esteril),
      estado:          normalizeStatus(getByAliases(row, COL.estado)) || "Activo",
      sac:             getByAliases(row, COL.sac),
      serial:          getByAliases(row, COL.serie),
      model_name:      getByAliases(row, COL.modelo),
      source_document: DOC_TYPES.FRMN19,
      source_sheet:    sheetName,
      _fila:           i + 1,
    });
  }

  if (result.assets.length === 0) {
    result.warnings.push("No se encontraron equipos con código válido en la hoja.");
  }

  return result;
}

// ─── parseFRMN05 ──────────────────────────────────────────────────────────────

/**
 * Parsea las hojas COMPUTADORES, IMPRESORAS y CELULARES del FR-MN-05.
 * @returns { assets: NormalizedAsset[], techSpecs: TechSpec[], warnings: string[], errors: string[] }
 */
export function parseFRMN05(workbook) {
  const result = { assets: [], techSpecs: [], warnings: [], errors: [] };
  const seen   = new Set();

  // ── COMPUTADORES ──────────────────────────────────────────────────────────
  const compSheet = workbook.SheetNames.find(s => s.trim().toUpperCase() === "COMPUTADORES");
  if (compSheet) {
    const sheet = workbook.Sheets[compSheet];
    const rows  = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false });
    const hdr   = findHeaderRow(rows, ["Código", "Nivel", "Ubicación"]);

    if (!hdr) {
      result.warnings.push("Hoja COMPUTADORES: no se detectaron encabezados válidos.");
    } else {
      const { rowIndex, headers } = hdr;

      for (let i = rowIndex + 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.every(c => !c || String(c).trim() === "")) continue;

        const getCellLocal = (k) => {
          const idx = headers.get(normalizeHeader(k));
          return idx !== undefined ? normalizeValue(row[idx]) : null;
        };

        const codigo = getCellLocal("Código") || getCellLocal("Codigo");
        if (!codigo) continue;
        if (seen.has(codigo)) {
          result.warnings.push(`COMPUTADORES fila ${i + 1}: código "${codigo}" duplicado.`);
          continue;
        }
        seen.add(codigo);

        const nivel = getCellLocal("Nivel");

        const asset = {
          codigo,
          nombre:          `Computador ${codigo}`,
          asset_type:      "Computador",
          tipo:            "Computador",
          criticidad:      "Baja",
          serial:          getCellLocal("Serial"),
          brand:           getCellLocal("Marca"),
          model_name:      getCellLocal("Modelo"),
          equipment_subtype: getCellLocal("Tipo"),
          level_num:       nivel ? (parseInt(nivel) || null) : null,
          location:        getCellLocal("Ubicación") || getCellLocal("Ubicacion"),
          purpose:         getCellLocal("Proposito") || getCellLocal("Propósito"),
          responsible:     getCellLocal("Responsable"),
          estado:          normalizeStatus(getCellLocal("Estado")) || "Activo",
          source_document: DOC_TYPES.FRMN05,
          source_sheet:    compSheet,
          _fila:           i + 1,
        };

        result.assets.push(asset);

        // Specs técnicas
        result.techSpecs.push({
          activo_id: codigo,
          processor: getCellLocal("Procesador"),
          ram:       getCellLocal("RAM"),
          disk_c:    getCellLocal("DISCO DURO C:") || getCellLocal("disco_duro_c"),
          disk_d:    getCellLocal("DISCO DURO D:") || getCellLocal("disco_duro_d"),
          software:  getCellLocal("Software"),
          monitor:   getCellLocal("Monitor"),
          mouse:     getCellLocal("Mouse"),
          keyboard:  getCellLocal("Teclado"),
        });
      }
    }
  }

  // ── IMPRESORAS ────────────────────────────────────────────────────────────
  const impSheet = workbook.SheetNames.find(s => s.trim().toUpperCase() === "IMPRESORAS");
  if (impSheet) {
    const sheet = workbook.Sheets[impSheet];
    const rows  = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false });
    const hdr   = findHeaderRow(rows, ["CÓDIGO", "Ubicación", "Estado"]);

    if (!hdr) {
      result.warnings.push("Hoja IMPRESORAS: no se detectaron encabezados válidos.");
    } else {
      const { rowIndex, headers } = hdr;

      for (let i = rowIndex + 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.every(c => !c || String(c).trim() === "")) continue;

        const getCellLocal = (k) => {
          const idx = headers.get(normalizeHeader(k));
          return idx !== undefined ? normalizeValue(row[idx]) : null;
        };

        const codigo = getCellLocal("CÓDIGO") || getCellLocal("Código") || getCellLocal("Codigo");
        if (!codigo) continue;
        if (seen.has(codigo)) {
          result.warnings.push(`IMPRESORAS fila ${i + 1}: código "${codigo}" duplicado.`);
          continue;
        }
        seen.add(codigo);

        result.assets.push({
          codigo,
          nombre:            `Impresora ${codigo}`,
          asset_type:        "Impresora",
          tipo:              "Equipo",
          criticidad:        "Baja",
          serial:            getCellLocal("Serial"),
          location:          getCellLocal("Ubicación") || getCellLocal("Ubicacion"),
          responsible_process: getCellLocal("Procesos Responsables") || getCellLocal("Proceso Responsable"),
          model_name:        getCellLocal("Modelo"),
          estado:            normalizeStatus(getCellLocal("Estado")) || "Activo",
          source_document:   DOC_TYPES.FRMN05,
          source_sheet:      impSheet,
          _fila:             i + 1,
        });
      }
    }
  }

  // ── CELULARES ─────────────────────────────────────────────────────────────
  const celSheet = workbook.SheetNames.find(s => s.trim().toUpperCase() === "CELULARES");
  if (celSheet) {
    const sheet = workbook.Sheets[celSheet];
    const rows  = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false });
    const hdr   = findHeaderRow(rows, ["CÓDIGO", "IMEI", "Marca"]);

    if (!hdr) {
      result.warnings.push("Hoja CELULARES: no se detectaron encabezados válidos.");
    } else {
      const { rowIndex, headers } = hdr;

      for (let i = rowIndex + 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.every(c => !c || String(c).trim() === "")) continue;

        const getCellLocal = (k) => {
          const idx = headers.get(normalizeHeader(k));
          return idx !== undefined ? normalizeValue(row[idx]) : null;
        };

        const codigo = getCellLocal("CÓDIGO") || getCellLocal("Código") || getCellLocal("Codigo");
        if (!codigo) continue;
        if (seen.has(codigo)) {
          result.warnings.push(`CELULARES fila ${i + 1}: código "${codigo}" duplicado.`);
          continue;
        }
        seen.add(codigo);

        result.assets.push({
          codigo,
          nombre:            `Celular ${codigo}`,
          asset_type:        "Celular",
          tipo:              "Equipo",
          criticidad:        "Baja",
          imei:              getCellLocal("IMEI"),
          responsible_process: getCellLocal("Proceso Responsable") || getCellLocal("Procesos Responsables"),
          charger:           getCellLocal("Cargador"),
          brand:             getCellLocal("Marca"),
          model_name:        getCellLocal("Modelo"),
          estado:            normalizeStatus(getCellLocal("Estado")) || "Activo",
          source_document:   DOC_TYPES.FRMN05,
          source_sheet:      celSheet,
          _fila:             i + 1,
        });
      }
    }
  }

  if (!compSheet && !impSheet && !celSheet) {
    result.errors.push("No se encontraron hojas COMPUTADORES, IMPRESORAS ni CELULARES en el archivo.");
  }

  return result;
}

// ─── parseAssetsExcel (ENTRY POINT) ──────────────────────────────────────────

/**
 * Función principal. Lee el archivo, detecta el documento y parsea todas las hojas.
 *
 * @param {File} file
 * @returns {Promise<{
 *   docType: string|null,
 *   docReason: string,
 *   assets: object[],
 *   techSpecs: object[],
 *   errors: string[],
 *   warnings: string[],
 *   sheetNames: string[]
 * }>}
 */
export async function parseAssetsExcel(file) {
  const buffer   = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", cellText: false, raw: false });

  const { docType, reason: docReason, detectedSheet, detectedSheets } =
    detectDocumentType(workbook);

  if (!docType) {
    return {
      docType: null,
      docReason,
      assets: [],
      techSpecs: [],
      errors: [docReason],
      warnings: [],
      sheetNames: workbook.SheetNames,
    };
  }

  let assets   = [];
  let techSpecs = [];
  let errors   = [];
  let warnings = [];

  if (docType === DOC_TYPES.FRMN19) {
    const r = parseFRMN19(workbook);
    assets   = r.assets;
    errors   = r.errors;
    warnings = r.warnings;
  } else if (docType === DOC_TYPES.FRMN05) {
    const r  = parseFRMN05(workbook);
    assets   = r.assets;
    techSpecs = r.techSpecs;
    errors   = r.errors;
    warnings = r.warnings;
  }

  return {
    docType,
    docReason,
    assets,
    techSpecs,
    errors,
    warnings,
    sheetNames: workbook.SheetNames,
  };
}
