import fs from "fs";

let content = fs.readFileSync("src/utils/parseAssetsExcel.js", "utf-8");

// 1. Update DOC_TYPES
content = content.replace('FRMN05: "FR-MN-05",', 'FRMN05: "FR-MN-05",\n  FRMN24: "FR-MN-24",');

// 2. Update detectDocumentType
content = content.replace('return { docType: null, reason: "No se pudo identificar el formato. Verifica que sea FR-MN-19 o FR-MN-05." };', `// FR-MN-24: tiene columnas PISO, INSTALACIÓN, TIPO DE ÁREA
  const hasInst = workbook.SheetNames.find(s => {
    const sheet = workbook.Sheets[s];
    const rows  = require("xlsx").utils.sheet_to_json(sheet, { header: 1, defval: "" });
    const hdr   = findHeaderRow(rows, ["PISO", "INSTALACIÓN", "TIPO DE ÁREA"]);
    return !!hdr;
  });

  if (hasInst) {
    return { docType: DOC_TYPES.FRMN24, detectedSheet: hasInst, reason: \`Hoja "\${hasInst}" con columnas de instalaciones detectadas\` };
  }

  return { docType: null, reason: "No se pudo identificar el formato. Verifica que sea FR-MN-19, FR-MN-05 o FR-MN-24." };`);

// 3. Add parseFRMN24 before parseAssetsExcel
const parseFRMN24 = `

// ─── parseFRMN24 ──────────────────────────────────────────────────────────────

/**
 * Parsea el Listado Maestro de Instalaciones (FR-MN-24).
 */
export function parseFRMN24(workbook) {
  const result = { assets: [], techSpecs: [], warnings: [], errors: [] };
  
  const sheetName = workbook.SheetNames.find(s => {
    const sheet = workbook.Sheets[s];
    const rows  = require("xlsx").utils.sheet_to_json(sheet, { header: 1, defval: "" });
    return !!findHeaderRow(rows, ["PISO", "INSTALACIÓN", "TIPO DE ÁREA"]);
  });

  if (!sheetName) {
    result.errors.push("No se encontró una hoja válida para FR-MN-24.");
    return result;
  }

  const sheet = workbook.Sheets[sheetName];
  const rows  = require("xlsx").utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false });

  // En FR-MN-24 la fila 9 (index 8) tiene encabezados principales, la fila 10 (index 9) tiene subencabezados.
  // findHeaderRow buscará en las primeras 30.
  const hdr = findHeaderRow(rows, ["PISO", "INSTALACIÓN", "TIPO DE ÁREA"]);
  if (!hdr) return result;

  const { rowIndex, headers } = hdr;
  
  // Como las columnas de servicios (Eléctrico, Hidráulico) están divididas en la siguiente fila (rowIndex + 1),
  // necesitamos mapear los índices de las columnas a los subencabezados para guardarlos.
  const subHeadersRow = rows[rowIndex + 1] || [];
  
  // Crear un mapa de índices de columnas que contienen especificaciones técnicas.
  // Ignoramos las primeras columnas que ya son principales.
  const specColumns = [];
  for (let c = 0; c < subHeadersRow.length; c++) {
    const val = normalizeValue(subHeadersRow[c]);
    if (val && !headers.has(normalizeHeader(val)) && c > 3) {
      // Guardar el nombre original del subencabezado para la base de datos
      specColumns.push({ index: c, name: String(subHeadersRow[c]).trim() });
    }
  }

  const seen = new Set();
  
  for (let i = rowIndex + 2; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every(c => !c || String(c).trim() === "")) continue;

    const getCellLocal = (k) => {
      const idx = headers.get(normalizeHeader(k));
      return idx !== undefined ? normalizeValue(row[idx]) : null;
    };

    const piso = getCellLocal("PISO");
    const instalacion = getCellLocal("INSTALACIÓN") || getCellLocal("INSTALACION");
    const tipoArea = getCellLocal("TIPO DE ÁREA") || getCellLocal("TIPO DE AREA");
    const clasificacion = getCellLocal("CLASIFICACIÓN DE INSTALACIÓN") || getCellLocal("CLASIFICACION");
    const observaciones = getCellLocal("OBSERVACIONES");

    if (!instalacion) continue;

    // Generar código autogenerado
    const strPiso = piso ? \`P\${piso}\` : "P0";
    // Limpiar nombre para código: quitar acentos, espacios por guiones, solo alfanuméricos
    const cleanName = normalizeHeader(instalacion).replace(/_/g, "").substring(0, 8).toUpperCase();
    let codigo = \`INST-\${strPiso}-\${cleanName}\`;
    
    // Evitar duplicados de código
    let counter = 1;
    let baseCode = codigo;
    while(seen.has(codigo)) {
      codigo = \`\${baseCode}-\${counter}\`;
      counter++;
    }
    seen.add(codigo);

    result.assets.push({
      codigo,
      nombre:            instalacion,
      asset_type:        "Instalación",
      tipo:              "Instalación", // En BD podría ser Instalación
      criticidad:        "Media",
      area:              tipoArea,
      location:          tipoArea,
      process:           clasificacion,
      level_num:         piso ? (parseInt(piso) || null) : null,
      estado:            "Activo",
      descripcion:       observaciones || null,
      source_document:   DOC_TYPES.FRMN24,
      source_sheet:      sheetName,
      _fila:             i + 1,
    });
    
    // Recopilar specs extra
    const extraSpecs = {};
    for (const specCol of specColumns) {
      const val = normalizeValue(row[specCol.index]);
      if (val) {
        extraSpecs[specCol.name] = val;
      }
    }
    
    if (Object.keys(extraSpecs).length > 0) {
      // Lo guardamos como string JSON en un campo extra_specs si quisieramos,
      // Pero saveAssetsToSupabase espera objetos en techSpecs. Lo mandamos así y 
      // luego lo serializamos en Supabase.
      result.techSpecs.push({
        activo_id: codigo,
        extra_specs: extraSpecs
      });
    }
  }
  
  if (result.assets.length === 0) {
    result.warnings.push("No se encontraron instalaciones válidas en la hoja.");
  }

  return result;
}
`;

content = content.replace('// ─── parseAssetsExcel (ENTRY POINT) ──────────────────────────────────────────', parseFRMN24 + '\n// ─── parseAssetsExcel (ENTRY POINT) ──────────────────────────────────────────');

// 4. Update parseAssetsExcel
content = content.replace('} else if (docType === DOC_TYPES.FRMN05) {', `} else if (docType === DOC_TYPES.FRMN24) {
    const r  = parseFRMN24(workbook);
    assets   = r.assets;
    techSpecs = r.techSpecs;
    errors   = r.errors;
    warnings = r.warnings;
  } else if (docType === DOC_TYPES.FRMN05) {`);

fs.writeFileSync("src/utils/parseAssetsExcel.js", content);
console.log("Patched parseAssetsExcel.js");
