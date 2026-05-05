import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import Navbar from "../components/navbar";
import Footer from "../components/Footer";
import {
  parseMaintenanceScheduleExcel,
  getMesConMasMantenimientos,
} from "../utils/parseMaintenanceScheduleExcel";
import {
  getExistingCodes,
  saveScheduleToSupabase,
} from "../api/supabaseMaintenanceSchedule";
import "./Mantenimiento.css";
import "./ImportarCronograma.css";

// ─── Constantes ───────────────────────────────────────────────────────────────

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - 1 + i);

const MES_LABELS = {
  ENE: "Ene", FEB: "Feb", MAR: "Mar", ABR: "Abr",
  MAY: "May", JUN: "Jun", JUL: "Jul", AGO: "Ago",
  SEP: "Sep", OCT: "Oct", NOV: "Nov", DIC: "Dic",
};

// ─── Componente principal ──────────────────────────────────────────────────────

export default function ImportarCronograma() {
  const navigate = useNavigate();
  const { usuarioActual } = useAuth();
  const fileInputRef = useRef(null);

  // Step: 1=upload, 2=preview, 3=done
  const [step, setStep] = useState(1);
  const [dragOver, setDragOver] = useState(false);

  // Archivo
  const [file, setFile] = useState(null);
  const [year, setYear] = useState(CURRENT_YEAR);

  // Parse result
  const [parseResult, setParseResult] = useState(null);
  const [existingCodes, setExistingCodes] = useState(new Set());
  const [analyzing, setAnalyzing] = useState(false);

  // Save result
  const [saving, setSaving] = useState(false);
  const [saveProgress, setSaveProgress] = useState(0);
  const [saveResult, setSaveResult] = useState(null);

  // ── Handlers de archivo ────────────────────────────────────────────────────

  function handleFileSelect(selectedFile) {
    if (!selectedFile) return;
    if (!selectedFile.name.endsWith(".xlsx")) {
      alert("Solo se aceptan archivos .xlsx");
      return;
    }
    setFile(selectedFile);
    setParseResult(null);
    setSaveResult(null);
    setStep(1);
  }

  function onInputChange(e) {
    handleFileSelect(e.target.files[0]);
  }

  function onDrop(e) {
    e.preventDefault();
    setDragOver(false);
    handleFileSelect(e.dataTransfer.files[0]);
  }

  function removeFile() {
    setFile(null);
    setParseResult(null);
    setSaveResult(null);
    setStep(1);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  // ── Analizar ───────────────────────────────────────────────────────────────

  async function handleAnalyze() {
    if (!file) return;
    setAnalyzing(true);
    setSaveResult(null);

    try {
      const [result, existing] = await Promise.all([
        parseMaintenanceScheduleExcel(file),
        getExistingCodes(year),
      ]);
      setParseResult(result);
      setExistingCodes(existing);
      if (result.errors.length === 0) setStep(2);
    } catch (err) {
      console.error("Error analizando archivo:", err);
      setParseResult({
        rows: [], errors: [`Error inesperado: ${err.message}`],
        warnings: [], sheetFound: false, totalMeses: 0,
      });
    } finally {
      setAnalyzing(false);
    }
  }

  // ── Guardar ────────────────────────────────────────────────────────────────

  async function handleSave() {
    if (!parseResult || parseResult.rows.length === 0) return;
    setSaving(true);
    setSaveProgress(0);

    // Filas válidas (sin duplicados con la BD)
    const validRows = parseResult.rows.filter(
      r => !existingCodes.has(r.codigo_equipo)
    );

    // Simular progreso visual
    let progress = 0;
    const progressInterval = setInterval(() => {
      progress = Math.min(progress + (100 / (validRows.length + 1)), 90);
      setSaveProgress(Math.round(progress));
    }, 200);

    try {
      const result = await saveScheduleToSupabase({
        rows: validRows,
        year,
        fileName: file.name,
        userId: usuarioActual?.id || null,
        existingCodes,
      });

      clearInterval(progressInterval);
      setSaveProgress(100);
      setSaveResult(result);
      setStep(3);
    } catch (err) {
      clearInterval(progressInterval);
      alert("Error guardando: " + err.message);
    } finally {
      setSaving(false);
    }
  }

  // ── Computed values ────────────────────────────────────────────────────────

  const newRows     = parseResult?.rows.filter(r => !existingCodes.has(r.codigo_equipo)) ?? [];
  const dupRows     = parseResult?.rows.filter(r =>  existingCodes.has(r.codigo_equipo)) ?? [];
  const mesTop      = parseResult ? getMesConMasMantenimientos(newRows) : "—";
  const totalMeses  = newRows.reduce((s, r) => s + r.meses_programados.length, 0);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      <Navbar />
      <div className="ic-container">

        {/* Header */}
        <div className="ic-header">
          <div>
            <h2 className="ic-title">📥 Importar Cronograma de Preventivos</h2>
            <p className="ic-subtitle">
              Carga el archivo FR-MN-01 en formato .xlsx para registrar el plan anual
            </p>
          </div>
          <button className="ic-secondary-btn" onClick={() => navigate("/mantenimiento/plan-maestro")}>
            ← Plan Maestro
          </button>
        </div>

        {/* Steps */}
        <div className="ic-steps">
          {[
            { n: 1, label: "Subir archivo" },
            { n: 2, label: "Vista previa" },
            { n: 3, label: "Importación lista" },
          ].map(({ n, label }) => (
            <div
              key={n}
              className={`ic-step ${step === n ? "active" : step > n ? "done" : ""}`}
            >
              <span className="ic-step-num">{step > n ? "✓" : n}</span>
              {label}
            </div>
          ))}
        </div>

        {/* ── STEP 1: Upload ───────────────────────────────────────── */}
        <div className="ic-card">
          <h3 className="ic-card-title">📄 Seleccionar archivo</h3>

          {/* Drop zone */}
          <div
            className={`ic-drop-zone ${dragOver ? "drag-over" : ""} ${file ? "has-file" : ""}`}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => !file && fileInputRef.current?.click()}
          >
            <input
              type="file"
              accept=".xlsx"
              className="ic-file-input"
              ref={fileInputRef}
              onChange={onInputChange}
            />

            {!file ? (
              <>
                <div className="ic-drop-icon">📊</div>
                <p className="ic-drop-title">Arrastra tu archivo aquí</p>
                <p className="ic-drop-sub">o haz click para explorar — solo archivos .xlsx</p>
                <button
                  className="ic-browse-btn"
                  onClick={e => { e.stopPropagation(); fileInputRef.current?.click(); }}
                >
                  📂 Seleccionar archivo
                </button>
              </>
            ) : (
              <div className="ic-file-badge" onClick={e => e.stopPropagation()}>
                <span className="ic-file-icon">📊</span>
                <div>
                  <div className="ic-file-name">{file.name}</div>
                  <div className="ic-file-size">
                    {(file.size / 1024).toFixed(1)} KB
                    {" · "}Modificado: {new Date(file.lastModified).toLocaleDateString("es-CO")}
                  </div>
                </div>
                <button className="ic-file-remove" onClick={removeFile}>✖ Quitar</button>
              </div>
            )}
          </div>
        </div>

        {/* Config */}
        <div className="ic-card">
          <h3 className="ic-card-title">⚙️ Configuración</h3>
          <div className="ic-config-row">
            <div className="ic-field-group">
              <label className="ic-label">Año del cronograma</label>
              <select
                className="ic-select"
                value={year}
                onChange={e => setYear(parseInt(e.target.value))}
                disabled={analyzing || saving}
              >
                {YEARS.map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>

            <div className="ic-field-group">
              <label className="ic-label">Responsable de importación</label>
              <div className="ic-input" style={{
                display: "flex", alignItems: "center", gap: "8px",
                background: "#f8fafc", color: "#475569", fontSize: "0.875rem"
              }}>
                👤 {usuarioActual?.nombre || usuarioActual?.email || "Usuario autenticado"}
              </div>
            </div>

            <button
              className="ic-analyze-btn"
              onClick={handleAnalyze}
              disabled={!file || analyzing || saving}
            >
              {analyzing ? (
                <><div className="ic-spinner" /> Analizando...</>
              ) : (
                <>🔍 Analizar archivo</>
              )}
            </button>
          </div>
        </div>

        {/* ── STEP 2: Preview ──────────────────────────────────────── */}
        {parseResult && (
          <>
            {/* Errores bloqueantes */}
            {parseResult.errors.length > 0 && (
              <div className="ic-alert error">
                <span className="ic-alert-icon">🚫</span>
                <div>
                  <strong>Errores detectados — no se puede continuar:</strong>
                  {parseResult.errors.map((e, i) => (
                    <div key={i} style={{ marginTop: 6, fontSize: "0.875rem" }}>• {e}</div>
                  ))}
                </div>
              </div>
            )}

            {/* Advertencias */}
            {parseResult.warnings.length > 0 && (
              <div className="ic-alert warning">
                <span className="ic-alert-icon">⚠️</span>
                <div>
                  <strong>Advertencias:</strong>
                  {parseResult.warnings.map((w, i) => (
                    <div key={i} style={{ marginTop: 6, fontSize: "0.875rem" }}>• {w}</div>
                  ))}
                </div>
              </div>
            )}

            {/* Duplicados en BD */}
            {dupRows.length > 0 && (
              <div className="ic-alert warning">
                <span className="ic-alert-icon">📋</span>
                <div>
                  <strong>{dupRows.length} equipo(s) ya importados para el año {year} — serán omitidos:</strong>
                  <div style={{ marginTop: 6, fontSize: "0.8rem", opacity: 0.85 }}>
                    {dupRows.map(r => r.codigo_equipo).join(", ")}
                  </div>
                </div>
              </div>
            )}

            {/* Summary cards */}
            {parseResult.rows.length > 0 && (
              <>
                <div className="ic-summary-grid">
                  <div className="ic-sum-card" style={{ "--sc": "#6366f1" }}>
                    <span className="ic-sum-icon">🏭</span>
                    <span className="ic-sum-val">{newRows.length}</span>
                    <span className="ic-sum-lbl">Equipos a importar</span>
                  </div>
                  <div className="ic-sum-card" style={{ "--sc": "#3b82f6" }}>
                    <span className="ic-sum-icon">📅</span>
                    <span className="ic-sum-val">{totalMeses}</span>
                    <span className="ic-sum-lbl">Mantenimientos programados</span>
                  </div>
                  <div className="ic-sum-card" style={{ "--sc": "#10b981" }}>
                    <span className="ic-sum-icon">🗓️</span>
                    <span className="ic-sum-val">{mesTop}</span>
                    <span className="ic-sum-lbl">Mes con más actividad</span>
                  </div>
                  <div className="ic-sum-card" style={{ "--sc": "#f59e0b" }}>
                    <span className="ic-sum-icon">⚠️</span>
                    <span className="ic-sum-val">{dupRows.length}</span>
                    <span className="ic-sum-lbl">Duplicados omitidos</span>
                  </div>
                  <div className="ic-sum-card" style={{ "--sc": "#ef4444" }}>
                    <span className="ic-sum-icon">🔴</span>
                    <span className="ic-sum-val">{parseResult.errors.length}</span>
                    <span className="ic-sum-lbl">Errores detectados</span>
                  </div>
                </div>

                {/* Preview table */}
                <div className="ic-card" style={{ padding: 0, overflow: "hidden" }}>
                  <div style={{ padding: "20px 28px", borderBottom: "1px solid #f1f5f9" }}>
                    <h3 className="ic-card-title" style={{ margin: 0 }}>
                      👁️ Vista previa — {newRows.length} equipos nuevos
                    </h3>
                  </div>
                  <div className="ic-table-wrap" style={{ borderRadius: 0, border: "none" }}>
                    <table className="ic-table">
                      <thead>
                        <tr>
                          <th>Código</th>
                          <th>Nombre del equipo</th>
                          <th>Tarea a realizar</th>
                          <th>Semana</th>
                          <th>Freq.</th>
                          <th>Meses programados</th>
                          <th>Estado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {parseResult.rows.map((row) => {
                          const isDup = existingCodes.has(row.codigo_equipo);
                          return (
                            <tr key={row.codigo_equipo} className={isDup ? "row-invalid" : ""}>
                              <td>{row.codigo_equipo}</td>
                              <td style={{ maxWidth: 220, fontWeight: 600, color: "#1e293b" }}>
                                <span title={row.nombre_equipo}>
                                  {row.nombre_equipo.length > 40
                                    ? row.nombre_equipo.slice(0, 38) + "…"
                                    : row.nombre_equipo}
                                </span>
                              </td>
                              <td style={{ maxWidth: 260, color: "#475569", fontSize: "0.78rem" }}>
                                <span title={row.tarea_realizar}>
                                  {row.tarea_realizar.length > 60
                                    ? row.tarea_realizar.slice(0, 58) + "…"
                                    : row.tarea_realizar || "—"}
                                </span>
                              </td>
                              <td style={{ textAlign: "center" }}>
                                {row.semana_programada ?? "—"}
                              </td>
                              <td style={{ textAlign: "center" }}>
                                {row.frecuencia_meses ? `${row.frecuencia_meses}m` : "—"}
                              </td>
                              <td>
                                <div className="ic-months-wrap">
                                  {row.meses_programados.length === 0
                                    ? <span style={{ color: "#94a3b8", fontSize: "0.78rem" }}>Sin meses</span>
                                    : row.meses_programados.map(m => (
                                      <span key={m.mes} className="ic-month-badge">
                                        {MES_LABELS[m.mes] || m.mes}
                                      </span>
                                    ))
                                  }
                                </div>
                              </td>
                              <td>
                                {isDup ? (
                                  <span className="ic-status-badge ic-status-error">⊘ Duplicado</span>
                                ) : (
                                  <span className="ic-status-badge ic-status-pendiente">🕐 Pendiente</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Save progress */}
                {saving && (
                  <div className="ic-card">
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                      <span style={{ fontWeight: 700, color: "#1e293b" }}>Guardando en base de datos...</span>
                      <span style={{ color: "#64748b", fontSize: "0.85rem" }}>{saveProgress}%</span>
                    </div>
                    <div className="ic-progress-wrap">
                      <div className="ic-progress-fill" style={{ width: `${saveProgress}%` }} />
                    </div>
                  </div>
                )}

                {/* Footer actions */}
                {parseResult.errors.length === 0 && newRows.length > 0 && !saving && step !== 3 && (
                  <div className="ic-footer-actions">
                    <div className="ic-footer-info">
                      Se importarán <strong>{newRows.length}</strong> equipo(s) con{" "}
                      <strong>{totalMeses}</strong> mantenimiento(s) programado(s) para el año{" "}
                      <strong>{year}</strong>
                    </div>
                    <div style={{ display: "flex", gap: 12 }}>
                      <button className="ic-secondary-btn" onClick={removeFile}>
                        ✖ Cancelar
                      </button>
                      <button
                        className="ic-save-btn"
                        onClick={handleSave}
                        disabled={saving}
                      >
                        💾 Guardar cronograma
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* ── STEP 3: Done ─────────────────────────────────────────── */}
        {step === 3 && saveResult && (
          <div className="ic-card">
            <div className="ic-alert success">
              <span className="ic-alert-icon">✅</span>
              <div>
                <strong>¡Cronograma importado exitosamente!</strong>
                <div style={{ marginTop: 8, fontSize: "0.875rem", lineHeight: 1.6 }}>
                  • <strong>{saveResult.inserted}</strong> equipo(s) guardados correctamente<br />
                  • <strong>{saveResult.skipped}</strong> omitido(s) por duplicado<br />
                  {saveResult.errors.length > 0 && (
                    <>• <strong>{saveResult.errors.length}</strong> advertencia(s) de inserción</>
                  )}
                </div>
              </div>
            </div>

            {saveResult.errors.length > 0 && (
              <div className="ic-error-list" style={{ marginTop: 0 }}>
                <strong style={{ fontSize: "0.85rem", color: "#92400e" }}>Detalles:</strong>
                {saveResult.errors.map((e, i) => (
                  <div key={i} className="ic-error-item">
                    <span>•</span> {e}
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: "flex", gap: 12, marginTop: 20, flexWrap: "wrap" }}>
              <button className="ic-save-btn" onClick={() => navigate("/mantenimiento/plan-maestro")}>
                📅 Ver Plan Maestro
              </button>
              <button
                className="ic-secondary-btn"
                onClick={() => {
                  setStep(1);
                  setFile(null);
                  setParseResult(null);
                  setSaveResult(null);
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
              >
                📥 Importar otro archivo
              </button>
            </div>
          </div>
        )}

      </div>
      <Footer />
    </>
  );
}
