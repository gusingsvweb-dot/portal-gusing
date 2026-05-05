/**
 * supabaseAssets.js
 * Funciones de persistencia para el módulo de importación de activos.
 * Respeta el sistema dual (st()) del proyecto.
 */
import { supabase, st } from "../api/supabaseClient";

// ─── Tablas ───────────────────────────────────────────────────────────────────

const T_ACTIVOS     = "activos";
const T_TECH_SPECS  = "asset_technical_specs";
const T_BATCHES     = "asset_import_batches";

// ─── Verificar duplicados ─────────────────────────────────────────────────────

/**
 * Retorna un Set con los códigos que ya existen en la BD.
 * @param {string[]} codes
 * @returns {Promise<Set<string>>}
 */
export async function getExistingAssetCodes(codes) {
  if (!codes || codes.length === 0) return new Set();

  const { data, error } = await supabase
    .from(st(T_ACTIVOS))
    .select("codigo")
    .in("codigo", codes);

  if (error) {
    console.error("Error verificando códigos:", error);
    return new Set();
  }
  return new Set((data || []).map(r => r.codigo));
}

// ─── Guardar activos ──────────────────────────────────────────────────────────

/**
 * Guarda una lista de activos en Supabase.
 * Respeta la opción de manejo de duplicados: "skip" | "update"
 *
 * @param {object} params
 * @param {object[]}      params.assets        - Array de activos normalizados
 * @param {object[]}      params.techSpecs      - Specs técnicas (computadores)
 * @param {Set<string>}   params.existingCodes  - Códigos ya en BD
 * @param {"skip"|"update"} params.duplicateMode
 * @param {string}        params.fileName
 * @param {string}        params.docType
 * @param {string|null}   params.userId
 * @returns {Promise<SaveResult>}
 */
export async function saveAssetsToSupabase({
  assets,
  techSpecs = [],
  existingCodes,
  duplicateMode = "skip",
  fileName,
  docType,
  userId,
}) {
  const result = {
    inserted:  0,
    updated:   0,
    skipped:   0,
    errors:    [],
    batchId:   null,
  };

  const now    = new Date().toISOString();
  const techByCode = new Map(techSpecs.map(t => [t.activo_id, t]));

  // ── Sincronizar Áreas ──────────────────────────────────────────────────────
  // Obtenemos todos los nombres de procesos/áreas únicos del Excel
  const rawAreas = [...new Set(assets.map(a => a.process || a.area || a.location).filter(Boolean))];
  
  // Obtener áreas existentes en la BD
  const { data: dbAreas } = await supabase.from(st("areas")).select("id, nombre");
  const areaMap = new Map(dbAreas?.map(a => [a.nombre.toUpperCase(), a.id]) || []);

  // Crear las áreas que no existan
  for (const areaName of rawAreas) {
    const key = areaName.toUpperCase();
    if (!areaMap.has(key)) {
      const { data: newAr, error: arErr } = await supabase
        .from(st("areas"))
        .insert([{ nombre: areaName }])
        .select("id")
        .single();
      
      if (!arErr && newAr) {
        areaMap.set(key, newAr.id);
      }
    }
  }

  // ── Procesar Activos ───────────────────────────────────────────────────────
  for (const asset of assets) {
    const { _fila, process, area, location, ...cleanAsset } = asset; 
    const isExisting = existingCodes.has(cleanAsset.codigo);

    if (isExisting && duplicateMode === "skip") {
      result.skipped++;
      continue;
    }

    // Mapear el area_id basado en lo que detectamos
    const areaName = process || area || location;
    const areaId   = areaName ? areaMap.get(areaName.toUpperCase()) : null;

    const payload = {
      ...cleanAsset,
      area_id:          areaId,
      imported_at:      now,
      imported_by:      userId || null,
      source_file_name: fileName,
    };

    let err;

    if (isExisting && duplicateMode === "update") {
      const { error } = await supabase
        .from(st(T_ACTIVOS))
        .update(payload)
        .eq("codigo", cleanAsset.codigo);
      err = error;
      if (!error) result.updated++;
    } else {
      const { error } = await supabase
        .from(st(T_ACTIVOS))
        .insert(payload);
      err = error;
      if (!error) result.inserted++;
    }

    if (err) {
      result.errors.push(`"${cleanAsset.codigo}": ${err.message}`);
      continue;
    }

    // Guardar specs técnicas si existen
    const spec = techByCode.get(cleanAsset.codigo);
    if (spec) {
      const { data: existing } = await supabase
        .from(st(T_TECH_SPECS))
        .select("id")
        .eq("activo_id", cleanAsset.codigo)
        .maybeSingle();

      if (existing) {
        await supabase.from(st(T_TECH_SPECS)).update(spec).eq("activo_id", cleanAsset.codigo);
      } else {
        await supabase.from(st(T_TECH_SPECS)).insert(spec);
      }
    }
  }

  // Registrar el batch de importación
  const { data: batch } = await supabase
    .from(st(T_BATCHES))
    .insert({
      source_file_name: fileName,
      source_document:  docType,
      total_rows:       assets.length,
      imported_rows:    result.inserted + result.updated,
      skipped_rows:     result.skipped,
      error_rows:       result.errors.length,
      imported_by:      userId || null,
      summary: {
        inserted: result.inserted,
        updated:  result.updated,
        skipped:  result.skipped,
        errors:   result.errors.length,
      },
    })
    .select("id")
    .single();

  result.batchId = batch?.id || null;
  return result;
}

// ─── Consultar activos ────────────────────────────────────────────────────────

/**
 * Obtiene activos filtrados por tipo de documento fuente.
 * @param {string} [docType] — si undefined retorna todos
 */
export async function getAssetsBySource(docType) {
  let q = supabase.from(st(T_ACTIVOS)).select("*").order("codigo");
  if (docType) q = q.eq("source_document", docType);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}
