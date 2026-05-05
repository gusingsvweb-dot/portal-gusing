/**
 * supabaseMaintenanceSchedule.js
 * Funciones para guardar el cronograma importado en Supabase.
 * Usa el sistema de doble entorno (st()) del proyecto.
 */
import { supabase, st } from "../api/supabaseClient";

// ─── Nombres de tablas ──────────────────────────────────────────────────────

const TABLE_SCHEDULES = "maintenance_schedules";
const TABLE_MONTHS    = "maintenance_schedule_months";

// ─── Verificar duplicados ───────────────────────────────────────────────────

/**
 * Verifica qué códigos ya existen en la BD para el año dado.
 * Retorna un Set con los códigos ya importados.
 *
 * @param {number} year
 * @returns {Promise<Set<string>>}
 */
export async function getExistingCodes(year) {
  const { data, error } = await supabase
    .from(st(TABLE_SCHEDULES))
    .select("equipment_code")
    .eq("year", year);

  if (error) {
    console.error("Error verificando códigos existentes:", error);
    return new Set();
  }

  return new Set((data || []).map(r => r.equipment_code));
}

// ─── Guardar cronograma completo ─────────────────────────────────────────────

/**
 * Guarda todos los registros del cronograma en Supabase.
 * Inserta primero en maintenance_schedules y luego en maintenance_schedule_months.
 *
 * @param {Object} params
 * @param {Array}  params.rows         — rows del parser
 * @param {number} params.year         — año del cronograma
 * @param {string} params.fileName     — nombre del archivo fuente
 * @param {string|null} params.userId  — UUID del usuario autenticado
 * @param {Set<string>} params.existingCodes — códigos que ya existen
 * @returns {Promise<SaveResult>}
 *   SaveResult = { inserted: number, skipped: number, errors: string[] }
 */
export async function saveScheduleToSupabase({ rows, year, fileName, userId, existingCodes }) {
  const saveResult = { inserted: 0, skipped: 0, errors: [] };

  // 0. Obtener mapeo de códigos a IDs de activos para poder llenar planes_preventivos
  const allCodes = rows.map(r => r.codigo_equipo);
  const { data: assetMapData } = await supabase
    .from(st("activos"))
    .select("id, codigo")
    .in("codigo", allCodes);
  
  const assetMap = new Map(assetMapData?.map(a => [a.codigo, a.id]) || []);

  const MONTH_MAP = {
    ENE: 0, FEB: 1, MAR: 2, ABR: 3, MAY: 4, JUN: 5,
    JUL: 6, AGO: 7, SEP: 8, OCT: 9, NOV: 10, DIC: 11
  };

  for (const row of rows) {
    // Saltar duplicados
    if (existingCodes.has(row.codigo_equipo)) {
      saveResult.skipped++;
      saveResult.errors.push(`Código "${row.codigo_equipo}" ya existe para el año ${year} — omitido.`);
      continue;
    }

    // 1. Insertar en maintenance_schedules
    const { data: scheduleData, error: scheduleErr } = await supabase
      .from(st(TABLE_SCHEDULES))
      .insert({
        year,
        equipment_code:    row.codigo_equipo,
        equipment_name:    row.nombre_equipo,
        task_description:  row.tarea_realizar || null,
        scheduled_week:    row.semana_programada || null,
        frequency_months:  row.frecuencia_meses || null,
        base_month:        row.mes_base || null,
        source_file_name:  fileName,
        imported_by:       userId || null,
      })
      .select("id")
      .single();

    if (scheduleErr) {
      saveResult.errors.push(`Error insertando "${row.codigo_equipo}": ${scheduleErr.message}`);
      continue;
    }

    const scheduleId = scheduleData.id;

    // 2. Insertar meses en maintenance_schedule_months
    if (row.meses_programados.length > 0) {
      const monthRows = row.meses_programados.map(m => ({
        schedule_id:  scheduleId,
        month_number: m.numero_mes,
        month_name:   m.mes,
        is_scheduled: true,
        status:       "Pendiente",
      }));

      await supabase.from(st(TABLE_MONTHS)).insert(monthRows);
    }

    // 3. SINCRONIZAR CON MOTOR AUTOMÁTICO (planes_preventivos)
    const assetId = assetMap.get(row.codigo_equipo);
    if (assetId) {
      // Calcular fecha base: día 15 del mes base del año seleccionado
      const monthIndex = MONTH_MAP[row.mes_base] ?? 0;
      const baseDate = new Date(year, monthIndex, 15);
      
      // Si la fecha base ya pasó, calculamos la siguiente según frecuencia
      const frequencyMonths = parseInt(row.frecuencia_meses) || 1;
      const today = new Date();
      let nextDate = new Date(baseDate);
      
      while (nextDate < today) {
        nextDate.setMonth(nextDate.getMonth() + frequencyMonths);
      }

      // Upsert en planes_preventivos (si ya existe uno para este activo, lo actualizamos)
      await supabase.from(st("planes_preventivos")).upsert({
        activo_id:         assetId,
        frecuencia_dias:   frequencyMonths * 30, // Aproximado
        proxima_fecha:     nextDate.toISOString().split("T")[0],
        descripcion_tarea: row.tarea_realizar || "Mantenimiento preventivo programado",
        activo:            true
      }, { onConflict: "activo_id" });
    }

    saveResult.inserted++;
  }

  return saveResult;
}

// ─── Consultar cronogramas ────────────────────────────────────────────────────

/**
 * Obtiene todos los cronogramas de un año dado, con sus meses.
 * @param {number} year
 */
export async function getScheduleByYear(year) {
  const { data, error } = await supabase
    .from(st(TABLE_SCHEDULES))
    .select(`
      *,
      meses:${st(TABLE_MONTHS)}(*)
    `)
    .eq("year", year)
    .order("equipment_code");

  if (error) throw error;
  return data || [];
}

/**
 * Sincroniza todos los cronogramas existentes de un año con el motor automático.
 * @param {number} year
 */
export async function syncAllSchedulesWithMotor(year) {
  const schedules = await getScheduleByYear(year);
  if (!schedules.length) return;

  const allCodes = schedules.map(s => s.equipment_code);
  const { data: assetMapData } = await supabase
    .from(st("activos"))
    .select("id, codigo")
    .in("codigo", allCodes);
  
  const assetMap = new Map(assetMapData?.map(a => [a.codigo, a.id]) || []);

  const MONTH_MAP = {
    ENE: 0, FEB: 1, MAR: 2, ABR: 3, MAY: 4, JUN: 5,
    JUL: 6, AGO: 7, SEP: 8, OCT: 9, NOV: 10, DIC: 11
  };

  const today = new Date();

  for (const row of schedules) {
    const assetId = assetMap.get(row.equipment_code);
    if (!assetId) continue;

    // Calcular fecha base: día 15 del mes base del año seleccionado
    const monthIndex = MONTH_MAP[row.base_month] ?? 0;
    const baseDate = new Date(year, monthIndex, 15);
    
    // Si la fecha base ya pasó, calculamos la siguiente según frecuencia
    const frequencyMonths = parseInt(row.frequency_months) || 1;
    let nextDate = new Date(baseDate);
    
    while (nextDate < today) {
      nextDate.setMonth(nextDate.getMonth() + frequencyMonths);
    }

    // Upsert en planes_preventivos
    await supabase.from(st("planes_preventivos")).upsert({
      activo_id:         assetId,
      frecuencia_dias:   frequencyMonths * 30,
      proxima_fecha:     nextDate.toISOString().split("T")[0],
      descripcion_tarea: row.task_description || "Mantenimiento preventivo programado",
      activo:            true
    }, { onConflict: "activo_id" });
  }
}
