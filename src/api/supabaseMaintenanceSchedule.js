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

  for (const row of rows) {
    // Saltar duplicados
    if (existingCodes.has(row.codigo_equipo)) {
      saveResult.skipped++;
      saveResult.errors.push(
        `Código "${row.codigo_equipo}" ya existe para el año ${year} — omitido.`
      );
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
      saveResult.errors.push(
        `Error insertando "${row.codigo_equipo}": ${scheduleErr.message}`
      );
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

      const { error: monthErr } = await supabase
        .from(st(TABLE_MONTHS))
        .insert(monthRows);

      if (monthErr) {
        saveResult.errors.push(
          `Error inserting meses para "${row.codigo_equipo}": ${monthErr.message}`
        );
        // No abortamos; la cabecera quedó insertada
      }
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
