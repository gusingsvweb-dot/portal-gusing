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

  for (const asset of assets) {
    const { _fila, ...cleanAsset } = asset; // quitar campo interno _fila
    const isExisting = existingCodes.has(cleanAsset.codigo);

    if (isExisting && duplicateMode === "skip") {
      result.skipped++;
      continue;
    }

    const payload = {
      ...cleanAsset,
      imported_at:      now,
      imported_by:      userId || null,
      source_file_name: fileName,
    };

    let err;

    if (isExisting && duplicateMode === "update") {
      // UPDATE — no sobreescribir campos vacíos con null si ya tienen valor
      const { error } = await supabase
        .from(st(T_ACTIVOS))
        .update(payload)
        .eq("codigo", cleanAsset.codigo);
      err = error;
      if (!error) result.updated++;
    } else {
      // INSERT
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
      // Verificar si ya existe el spec
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
