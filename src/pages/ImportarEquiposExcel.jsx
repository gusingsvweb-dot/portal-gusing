import { useRef, useState } from "react";
import { useNavigate }      from "react-router-dom";
import { useAuth }          from "../context/AuthContext";
import Navbar               from "../components/navbar";
import Footer               from "../components/Footer";
import { parseAssetsExcel } from "../utils/parseAssetsExcel";
import {
  getExistingAssetCodes,
  saveAssetsToSupabase,
} from "../api/supabaseAssets";
import "./Mantenimiento.css";
import "./ImportarCronograma.css";   // re-usa ic-* base styles
import "./ImportarEquiposExcel.css"; // estilos propios ia-*

// ─── Helpers visuales ─────────────────────────────────────────────────────────

const TYPE_META = {
  Equipo:      { icon: "⚙️",  cls: "ia-type-equipo"     },
  Computador:  { icon: "💻",  cls: "ia-type-computador"  },
  Impresora:   { icon: "🖨️",  cls: "ia-type-impresora"   },
  Celular:     { icon: "📱",  cls: "ia-type-celular"     },
};

function TypeBadge({ type }) {
  const meta = TYPE_META[type] || { icon: "📦", cls: "ia-type-otro" };
  return (
    <span className={`ia-type-badge ${meta.cls}`}>
      {meta.icon} {type}
    </span>
  );
}

function StatusBadge({ status }) {
  if (!status) return <span className="ia-muted">—</span>;
  const cls = status === "Activo"   ? "ia-status-activo"
            : status === "Inactivo" ? "ia-status-inactivo"
            : "ia-status-otro";
  return <span className={cls}>{status}</span>;
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function ImportarEquiposExcel() {
  const navigate = useNavigate();
  const { usuarioActual } = useAuth();
  const fileInputRef = useRef(null);

  // Paso: 1=upload, 2=preview, 3=done
  const [step,     setStep]     = useState(1);
  const [dragOver, setDragOver] = useState(false);

  // Archivo
  const [file, setFile] = useState(null);

  // Resultado del parser
  const [parseResult,    setParseResult]    = useState(null);
  const [existingCodes,  setExistingCodes]  = useState(new Set());
  const [duplicateMode,  setDuplicateMode]  = useState("skip"); // "skip" | "update"
  const [analyzing,      setAnalyzing]      = useState(false);

  // Guardado
  const [saving,      setSaving]      = useState(false);
  const [saveProgress,setSaveProgress]= useState(0);
  const [saveResult,  setSaveResult]  = useState(null);

  // Filtro de la tabla de preview
  const [filterType,  setFilterType]  = useState("todos");
  const [filterText,  setFilterText]  = useState("");

  // ── Manejo de archivo ────────────────────────────────────────────────────────

  function handleFile(f) {
    if (!f) return;
    if (!f.name.match(/\.(xlsx|xls)$/i)) {
      alert("Solo se aceptan archivos .xlsx o .xls");
      return;
    }
    setFile(f);
    setParseResult(null);
    setSaveResult(null);
    setStep(1);
    setFilterType("todos");
    setFilterText("");
  }

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    handleFile(e.dataTransfer.files[0]);
  };

  const removeFile = () => {
    setFile(null);
    setParseResult(null);
    setSaveResult(null);
    setStep(1);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // ── Analizar ─────────────────────────────────────────────────────────────────

  async function handleAnalyze() {
    if (!file) return;
    setAnalyzing(true);
    setSaveResult(null);
    try {
      const result = await parseAssetsExcel(file);
      const codes  = result.assets.map(a => a.codigo).filter(Boolean);
      const existing = await getExistingAssetCodes(codes);
      setParseResult(result);
      setExistingCodes(existing);
      if (result.errors.length === 0) setStep(2);
    } catch (err) {
      setParseResult({
        docType: null, docReason: "", assets: [], techSpecs: [],
        errors: [`Error inesperado: ${err.message}`], warnings: [], sheetNames: [],
      });
    } finally {
      setAnalyzing(false);
    }
  }

  // ── Guardar ──────────────────────────────────────────────────────────────────

  async function handleSave() {
    if (!parseResult || parseResult.assets.length === 0) return;
    setSaving(true);
    setSaveProgress(0);

    // Para mode="skip", solo los assets nuevos
    const toSave = duplicateMode === "skip"
      ? parseResult.assets.filter(a => !existingCodes.has(a.codigo))
      : parseResult.assets;

    let progress = 0;
    const interval = setInterval(() => {
      progress = Math.min(progress + (100 / (toSave.length + 1)), 88);
      setSaveProgress(Math.round(progress));
    }, 150);

    try {
      const result = await saveAssetsToSupabase({
        assets:        toSave,
        techSpecs:     parseResult.techSpecs || [],
        existingCodes,
        duplicateMode,
        fileName:      file.name,
        docType:       parseResult.docType,
        userId:        usuarioActual?.id || null,
      });
      clearInterval(interval);
      setSaveProgress(100);
      setSaveResult(result);
      setStep(3);
    } catch (err) {
      clearInterval(interval);
      alert("Error guardando: " + err.message);
    } finally {
      setSaving(false);
    }
  }

  // ── Valores computados ───────────────────────────────────────────────────────

  const assets     = parseResult?.assets || [];
  const newAssets  = assets.filter(a => !existingCodes.has(a.codigo));
  const dupAssets  = assets.filter(a =>  existingCodes.has(a.codigo));

  const byType = assets.reduce((acc, a) => {
    acc[a.asset_type] = (acc[a.asset_type] || 0) + 1;
    return acc;
  }, {});

  const filteredAssets = assets.filter(a => {
    if (filterType !== "todos" && a.asset_type !== filterType) return false;
    if (filterText.trim()) {
      const q = filterText.toLowerCase();
      return (
        a.codigo?.toLowerCase().includes(q) ||
        a.nombre?.toLowerCase().includes(q) ||
        a.area?.toLowerCase().includes(q)   ||
        a.location?.toLowerCase().includes(q) ||
        a.responsible?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const VALID_SHEETS  = ["Listado maestro", "COMPUTADORES", "IMPRESORAS", "CELULARES"];
  const detectedTypes = [...new Set(assets.map(a => a.asset_type))];

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <>
      <Navbar />
      <div className="ic-container">

        {/* Header */}
        <div className="ic-header">
          <div>
            <h2 className="ic-title">🏭 Importar Listado Maestro de Equipos</h2>
            <p className="ic-subtitle">
              Compatible con FR-MN-19 (equipos de planta) y FR-MN-05 (equipos de oficina)
            </p>
          </div>
          <button className="ic-secondary-btn" onClick={() => navigate("/mantenimiento/equipos")}>
            ← Gestión de Equipos
          </button>
        </div>

        {/* Steps */}
        <div className="ic-steps">
          {[
            { n: 1, label: "Subir archivo" },
            { n: 2, label: "Vista previa" },
            { n: 3, label: "Importado" },
          ].map(({ n, label }) => (
            <div key={n} className={`ic-step ${step === n ? "active" : step > n ? "done" : ""}`}>
              <span className="ic-step-num">{step > n ? "✓" : n}</span>
              {label}
            </div>
          ))}
        </div>

        {/* ── STEP 1: Upload ─────────────────────────────────────────── */}
        <div className="ic-card">
          <h3 className="ic-card-title">📄 Seleccionar archivo Excel</h3>
          <div
            className={`ic-drop-zone ${dragOver ? "drag-over" : ""} ${file ? "has-file" : ""}`}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => !file && fileInputRef.current?.click()}
          >
            <input
              type="file"
              accept=".xlsx,.xls"
              className="ic-file-input"
              ref={fileInputRef}
              onChange={e => handleFile(e.target.files[0])}
            />
            {!file ? (
              <>
                <div className="ic-drop-icon">📊</div>
                <p className="ic-drop-title">Arrastra tu archivo aquí</p>
                <p className="ic-drop-sub">
                  FR-MN-19 Listado maestro de equipos<br />
                  FR-MN-05 Listado maestro de equipos de oficina
                </p>
                <button className="ic-browse-btn" onClick={e => { e.stopPropagation(); fileInputRef.current?.click(); }}>
                  📂 Seleccionar archivo
                </button>
              </>
            ) : (
              <div className="ic-file-badge" onClick={e => e.stopPropagation()}>
                <span className="ic-file-icon">📊</span>
                <div>
                  <div className="ic-file-name">{file.name}</div>
                  <div className="ic-file-size">
                    {(file.size / 1024).toFixed(1)} KB &nbsp;·&nbsp;
                    {new Date(file.lastModified).toLocaleDateString("es-CO")}
                  </div>
                </div>
                <button className="ic-file-remove" onClick={removeFile}>✖ Quitar</button>
              </div>
            )}
          </div>
        </div>

        {/* Analizar button */}
        {file && !parseResult && (
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 24 }}>
            <button className="ic-analyze-btn" onClick={handleAnalyze} disabled={analyzing}>
              {analyzing ? <><div className="ic-spinner" /> Analizando...</> : <>🔍 Analizar archivo</>}
            </button>
          </div>
        )}

        {/* ── Resultado del parser ─────────────────────────────────── */}
        {parseResult && (
          <>
            {/* Tipo de documento detectado */}
            <div className={`ia-doc-detected ${parseResult.docType ? "" : "unknown"}`}>
              <span className="ia-doc-icon">
                {parseResult.docType === "FR-MN-19" ? "🏭"
                 : parseResult.docType === "FR-MN-05" ? "🖥️" : "❓"}
              </span>
              <div>
                <p className="ia-doc-name">
                  {parseResult.docType
                    ? `Documento detectado: ${parseResult.docType}`
                    : "Documento no reconocido"}
                </p>
                <p className="ia-doc-reason">{parseResult.docReason}</p>
                {parseResult.sheetNames?.length > 0 && (
                  <div className="ia-sheets-list">
                    {parseResult.sheetNames.map(s => (
                      <span
                        key={s}
                        className={`ia-sheet-pill ${VALID_SHEETS.some(v => s.toUpperCase().includes(v.toUpperCase())) ? "valid" : ""}`}
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Errores bloqueantes */}
            {parseResult.errors.length > 0 && (
              <div className="ic-alert error">
                <span className="ic-alert-icon">🚫</span>
                <div>
                  <strong>No se puede continuar:</strong>
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
                  <strong>Advertencias ({parseResult.warnings.length}):</strong>
                  {parseResult.warnings.slice(0, 5).map((w, i) => (
                    <div key={i} style={{ marginTop: 4, fontSize: "0.82rem" }}>• {w}</div>
                  ))}
                  {parseResult.warnings.length > 5 && (
                    <div style={{ marginTop: 4, fontSize: "0.78rem", color: "#92400e" }}>
                      … y {parseResult.warnings.length - 5} más
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Summary cards */}
            {assets.length > 0 && (
              <>
                <div className="ic-summary-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px,1fr))" }}>
                  <div className="ic-sum-card" style={{ "--sc": "#6366f1" }}>
                    <span className="ic-sum-icon">🏭</span>
                    <span className="ic-sum-val">{assets.length}</span>
                    <span className="ic-sum-lbl">Total detectados</span>
                  </div>
                  <div className="ic-sum-card" style={{ "--sc": "#10b981" }}>
                    <span className="ic-sum-icon">✨</span>
                    <span className="ic-sum-val">{newAssets.length}</span>
                    <span className="ic-sum-lbl">Nuevos</span>
                  </div>
                  <div className="ic-sum-card" style={{ "--sc": "#f59e0b" }}>
                    <span className="ic-sum-icon">🔄</span>
                    <span className="ic-sum-val">{dupAssets.length}</span>
                    <span className="ic-sum-lbl">Ya existen</span>
                  </div>
                  {Object.entries(byType).map(([type, count]) => {
                    const meta = TYPE_META[type] || { icon: "📦" };
                    const colors = {
                      Equipo: "#7c3aed", Computador: "#2563eb",
                      Impresora: "#d97706", Celular: "#059669",
                    };
                    return (
                      <div key={type} className="ic-sum-card" style={{ "--sc": colors[type] || "#64748b" }}>
                        <span className="ic-sum-icon">{meta.icon}</span>
                        <span className="ic-sum-val">{count}</span>
                        <span className="ic-sum-lbl">{type}s</span>
                      </div>
                    );
                  })}
                </div>

                {/* Modo de duplicados */}
                {dupAssets.length > 0 && (
                  <div className="ic-card">
                    <h3 className="ic-card-title">🔄 ¿Qué hacer con los {dupAssets.length} equipos ya existentes?</h3>
                    <div className="ia-dup-options">
                      {[
                        { val: "skip",   icon: "⏭️", label: "Omitir duplicados",  sub: "Los activos ya existentes no se tocarán. Solo se importarán los nuevos." },
                        { val: "update", icon: "✏️", label: "Actualizar existentes", sub: "Se actualizarán los datos de los activos ya registrados con la info del archivo." },
                      ].map(opt => (
                        <label
                          key={opt.val}
                          className={`ia-dup-option ${duplicateMode === opt.val ? "selected" : ""}`}
                        >
                          <input
                            type="radio"
                            name="dupMode"
                            value={opt.val}
                            checked={duplicateMode === opt.val}
                            onChange={() => setDuplicateMode(opt.val)}
                          />
                          <div>
                            <div className="ia-dup-option-label">{opt.icon} {opt.label}</div>
                            <div className="ia-dup-option-sub">{opt.sub}</div>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {/* Tabla de vista previa */}
                <div className="ic-card" style={{ padding: 0, overflow: "hidden" }}>
                  {/* Filtros de la tabla */}
                  <div style={{ padding: "16px 24px", borderBottom: "1px solid #f1f5f9", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                    <h3 className="ic-card-title" style={{ margin: 0, flex: 1 }}>
                      👁️ Vista previa — {filteredAssets.length} de {assets.length} equipos
                    </h3>
                    <div className="mant-search-wrap" style={{ maxWidth: 240 }}>
                      <span className="search-icon">🔍</span>
                      <input
                        className="mant-search-input"
                        placeholder="Buscar código, nombre..."
                        value={filterText}
                        onChange={e => setFilterText(e.target.value)}
                      />
                      {filterText && <button className="search-clear" onClick={() => setFilterText("")}>✖</button>}
                    </div>
                    <select
                      className="v2-select"
                      style={{ width: 160, height: 38 }}
                      value={filterType}
                      onChange={e => setFilterType(e.target.value)}
                    >
                      <option value="todos">Todos los tipos</option>
                      {detectedTypes.map(t => <option key={t} value={t}>{t}s</option>)}
                    </select>
                  </div>

                  <div style={{ overflowX: "auto" }}>
                    <table className="ia-table">
                      <thead>
                        <tr>
                          <th>Código</th>
                          <th>Nombre / Equipo</th>
                          <th>Tipo</th>
                          <th>Proceso / Área</th>
                          <th>Ubicación</th>
                          <th>Responsable</th>
                          <th>Estado</th>
                          <th>Fuente</th>
                          <th>Obs.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredAssets.map(a => {
                          const isDup = existingCodes.has(a.codigo);
                          return (
                            <tr key={`${a.codigo}-${a._fila}`} className={isDup ? "row-dup" : ""}>
                              <td><span className="ia-code-cell">{a.codigo}</span></td>
                              <td>
                                <span className="ia-name-cell" title={a.nombre}>
                                  {a.nombre?.length > 35 ? a.nombre.slice(0, 33) + "…" : a.nombre}
                                </span>
                              </td>
                              <td><TypeBadge type={a.asset_type} /></td>
                              <td>
                                <span style={{ fontSize: "0.78rem", color: "#475569" }}>
                                  {a.process || a.area || <span className="ia-muted">—</span>}
                                </span>
                              </td>
                              <td>
                                <span style={{ fontSize: "0.78rem", color: "#475569" }}>
                                  {a.location || a.area || <span className="ia-muted">—</span>}
                                </span>
                              </td>
                              <td>
                                <span style={{ fontSize: "0.78rem", color: "#475569" }}>
                                  {a.responsible || a.responsible_process || <span className="ia-muted">—</span>}
                                </span>
                              </td>
                              <td><StatusBadge status={a.estado} /></td>
                              <td>
                                <span className="ia-source-badge">
                                  {a.source_document} / {a.source_sheet}
                                </span>
                              </td>
                              <td>
                                {isDup ? (
                                  <span style={{ fontSize: "0.72rem", color: "#92400e", fontWeight: 700 }}>
                                    🔄 Existe
                                  </span>
                                ) : (
                                  <span style={{ fontSize: "0.72rem", color: "#166534", fontWeight: 700 }}>
                                    ✨ Nuevo
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Progreso de guardado */}
                {saving && (
                  <div className="ic-card">
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                      <span style={{ fontWeight: 700, color: "#1e293b" }}>Guardando equipos en base de datos...</span>
                      <span style={{ color: "#64748b", fontSize: "0.85rem" }}>{saveProgress}%</span>
                    </div>
                    <div className="ic-progress-wrap">
                      <div className="ic-progress-fill" style={{ width: `${saveProgress}%` }} />
                    </div>
                  </div>
                )}

                {/* Footer de acciones */}
                {parseResult.errors.length === 0 && !saving && step !== 3 && (
                  <div className="ic-footer-actions">
                    <div className="ic-footer-info">
                      {duplicateMode === "skip"
                        ? <><strong>{newAssets.length}</strong> equipos nuevos serán importados. <strong>{dupAssets.length}</strong> duplicados omitidos.</>
                        : <><strong>{assets.length}</strong> equipos serán procesados (<strong>{newAssets.length}</strong> nuevos + <strong>{dupAssets.length}</strong> actualizados).</>
                      }
                    </div>
                    <div style={{ display: "flex", gap: 12 }}>
                      <button className="ic-secondary-btn" onClick={removeFile}>✖ Cancelar</button>
                      <button
                        className="ic-save-btn"
                        onClick={handleSave}
                        disabled={saving || (duplicateMode === "skip" && newAssets.length === 0)}
                      >
                        💾 Guardar equipos
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* ── STEP 3: Done ──────────────────────────────────────────── */}
        {step === 3 && saveResult && (
          <div className="ic-card">
            <div className="ic-alert success">
              <span className="ic-alert-icon">✅</span>
              <div>
                <strong>¡Importación completada!</strong>
                <div style={{ marginTop: 8, fontSize: "0.875rem", lineHeight: 1.8 }}>
                  • <strong>{saveResult.inserted}</strong> equipo(s) insertados<br />
                  • <strong>{saveResult.updated}</strong> actualizado(s)<br />
                  • <strong>{saveResult.skipped}</strong> omitido(s) por duplicado<br />
                  {saveResult.errors.length > 0 && (
                    <>• <strong style={{ color: "#991b1b" }}>{saveResult.errors.length}</strong> error(es) durante la inserción</>
                  )}
                </div>
              </div>
            </div>

            {saveResult.errors.length > 0 && (
              <div className="ic-error-list">
                <strong style={{ fontSize: "0.85rem" }}>Errores de inserción:</strong>
                {saveResult.errors.slice(0, 10).map((e, i) => (
                  <div key={i} className="ic-error-item"><span>•</span> {e}</div>
                ))}
              </div>
            )}

            <div style={{ display: "flex", gap: 12, marginTop: 20, flexWrap: "wrap" }}>
              <button className="ic-save-btn" onClick={() => navigate("/mantenimiento/equipos")}>
                🏭 Ver Equipos
              </button>
              <button
                className="ic-secondary-btn"
                onClick={() => { setStep(1); setFile(null); setParseResult(null); setSaveResult(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}
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
