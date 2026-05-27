import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase, st, ss } from "../api/supabaseClient";
import Navbar from "../components/navbar";
import Footer from "../components/Footer";
import "./Mantenimiento.css";
import "./GestionEquipos.css";

const TIPO_ICON = { 
  "Herramienta Manual": "🔧", 
  "Herramienta Eléctrica": "🔌", 
  "Equipo de Medición": "📐", 
  "Equipo de Seguridad": "🦺", 
  "Herramienta": "🔧" 
};

const ESTADO_COLORS = {
  "Disponible": { bg: "#dcfce7", color: "#166534", border: "#bbf7d0" },
  "En Uso": { bg: "#e0f2fe", color: "#0369a1", border: "#bae6fd" },
  "En Reparación": { bg: "#ffedd5", color: "#c2410c", border: "#fed7aa" },
  "Fuera de Servicio": { bg: "#fee2e2", color: "#991b1b", border: "#fecaca" }
};

export default function GestionHerramientas({ embedded = false }) {
  const navigate = useNavigate();
  const [activos, setEquipos] = useState([]);
  const [areas, setAreas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showAreaForm, setShowAreaForm] = useState(false);
  const [newAreaName, setNewAreaName] = useState("");
  const [selectedEquipo, setSelectedEquipo] = useState(null);
  const [rutina, setRutina] = useState([]);
  const [rutinaLoading, setRutinaLoading] = useState(false);
  const [filtroText, setFiltroText] = useState("");
  const [filtroCrit, setFiltroCrit] = useState("todos");
  const [filtroEstado, setFiltroEstado] = useState("todos");
  const [filtroCalibracion, setFiltroCalibracion] = useState("todos");
  const [saving, setSaving] = useState(false);
  const [proveedores, setProveedores] = useState([]);
  const [tiposSolicitud, setTiposSolicitud] = useState([]);
  const [defaultAreaId, setDefaultAreaId] = useState("");

  const [form, setForm] = useState({
    id: null,
    nombre: "",
    tipo: "Herramienta Manual",
    area_id: "",
    codigo: "",
    criticidad: "Baja",
    manual_url: "",
    // Metadata fields stored in descripcion
    brand: "",
    model: "",
    serial: "",
    status: "Disponible",
    lastCal: "",
    nextCal: "",
    notes: ""
  });
  const [file, setFile] = useState(null);
  const [showManualInt, setShowManualInt] = useState(false);
  const [manualIntForm, setManualIntForm] = useState({ 
    fecha: new Date().toISOString().split("T")[0], 
    descripcion: "", 
    accion: "", 
    tecnico: "",
    tipo_solicitud_id: 5 // Preventivo por defecto
  });

  useEffect(() => { loadData(); }, []);

  // Parses description column as JSON or falls back to plain text notes
  function parseDesc(descText) {
    const defaultData = { notes: descText || "", brand: "", model: "", serial: "", status: "Disponible", lastCal: "", nextCal: "" };
    if (!descText) return defaultData;
    if (descText.trim().startsWith("{") && descText.trim().endsWith("}")) {
      try {
        return { ...defaultData, ...JSON.parse(descText) };
      } catch (e) {
        return defaultData;
      }
    }
    return defaultData;
  }

  // Returns calibration status logic
  function getCalibrationStatus(nextCalDate) {
    if (!nextCalDate) return { label: "No requiere", class: "cal-none", icon: "⚪", color: "#64748b", bg: "#f1f5f9" };
    const next = new Date(nextCalDate + "T00:00:00");
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const diffTime = next - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) {
      return { label: "VENCIDA 🚨", class: "cal-expired", icon: "🚨", color: "#b91c1c", bg: "#fee2e2", border: "#fecaca" };
    } else if (diffDays <= 30) {
      return { label: `PRÓXIMA (${diffDays}d) ⏳`, class: "cal-warning", icon: "⏳", color: "#b45309", bg: "#fef3c7", border: "#fde68a" };
    } else {
      return { label: "VIGENTE ✅", class: "cal-ok", icon: "✅", color: "#15803d", bg: "#dcfce7", border: "#bbf7d0" };
    }
  }

  async function loadData() {
    setLoading(true);
    const [{ data: act }, { data: ars }, { data: provs }, { data: types }] = await Promise.all([
      supabase.from(st("activos")).select("*").order("nombre"),
      supabase.from(st("areas")).select("*").order("nombre"),
      supabase.from(st("proveedores_mant")).select("*").order("nombre"),
      supabase.from(st("tipos_solicitud")).select("*")
    ]);

    // Filter tools
    const toolTypes = ["Herramienta", "Herramienta Manual", "Herramienta Eléctrica", "Equipo de Medición", "Equipo de Seguridad"];
    const toolsOnly = (act || []).filter(a => 
      toolTypes.includes(a.tipo) || 
      a.tipo?.toLowerCase().includes("herramienta") || 
      a.tipo?.toLowerCase().includes("medicion") || 
      a.tipo?.toLowerCase().includes("medición") || 
      a.tipo?.toLowerCase().includes("seguridad")
    );

    setEquipos(toolsOnly);
    setAreas(ars || []);
    setProveedores(provs || []);
    setTiposSolicitud(types || []);

    const defArea = ars?.find(ar => 
      ar.nombre.toLowerCase().includes("mantenimiento") || 
      ar.nombre.toLowerCase().includes("taller")
    );
    
    const initialAreaId = defArea ? defArea.id : (ars?.[0]?.id || "");
    setDefaultAreaId(initialAreaId);
    
    setForm(prev => ({ 
      ...prev, 
      area_id: prev.area_id || initialAreaId 
    }));
    
    setLoading(false);
  }

  const stats = useMemo(() => {
    let vencidas = 0;
    let disponibles = 0;
    let enReparacion = 0;

    activos.forEach(a => {
      const parsed = parseDesc(a.descripcion);
      if (parsed.status === "Disponible") disponibles++;
      if (parsed.status === "En Reparación" || parsed.status === "Fuera de Servicio") enReparacion++;
      if (parsed.nextCal && getCalibrationStatus(parsed.nextCal).class === "cal-expired") {
        vencidas++;
      }
    });

    return {
      total: activos.length,
      disponibles,
      enReparacion,
      vencidas,
      noDisponible: activos.length - disponibles
    };
  }, [activos]);

  const filtered = useMemo(() => {
    return activos.filter(a => {
      const parsed = parseDesc(a.descripcion);
      
      // Filter criticidad
      if (filtroCrit !== "todos" && a.criticidad !== filtroCrit) return false;
      
      // Filter status
      if (filtroEstado !== "todos" && parsed.status !== filtroEstado) return false;
      
      // Filter calibration alert
      if (filtroCalibracion !== "todos") {
        const calStatus = getCalibrationStatus(parsed.nextCal);
        if (filtroCalibracion === "vencida" && calStatus.class !== "cal-expired") return false;
        if (filtroCalibracion === "proxima" && calStatus.class !== "cal-warning") return false;
        if (filtroCalibracion === "vigente" && calStatus.class !== "cal-ok") return false;
        if (filtroCalibracion === "no_requiere" && calStatus.class !== "cal-none") return false;
      }

      // Filter text
      if (filtroText.trim()) {
        const q = filtroText.toLowerCase();
        const areaName = areas.find(ar => ar.id === a.area_id)?.nombre || "";
        
        return (
          a.nombre?.toLowerCase().includes(q) ||
          a.codigo?.toLowerCase().includes(q) ||
          areaName.toLowerCase().includes(q) ||
          parsed.brand?.toLowerCase().includes(q) ||
          parsed.model?.toLowerCase().includes(q) ||
          parsed.serial?.toLowerCase().includes(q) ||
          parsed.notes?.toLowerCase().includes(q)
        );
      }

      return true;
    });
  }, [activos, filtroCrit, filtroEstado, filtroCalibracion, filtroText, areas]);

  async function openEdit(a, e) {
    e.stopPropagation();
    const parsed = parseDesc(a.descripcion);
    setForm({ 
      ...a, 
      brand: parsed.brand || "",
      model: parsed.model || "",
      serial: parsed.serial || "",
      status: parsed.status || "Disponible",
      lastCal: parsed.lastCal || "",
      nextCal: parsed.nextCal || "",
      notes: parsed.notes || ""
    });
    setShowForm(true);
  }

  async function saveEquipo() {
    if (!form.nombre || !form.area_id) return alert("Nombre y Área son obligatorios");
    setSaving(true);
    
    let currentUrl = form.manual_url;
    if (file) {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random()}.${fileExt}`;
      const filePath = `manuales/${fileName}`;
      
      const { error: uploadError } = await supabase.storage
        .from('manuales_equipos')
        .upload(filePath, file);

      if (uploadError) {
        alert("Error subiendo manual/certificado: " + uploadError.message);
      } else {
        const { data: urlData } = supabase.storage
          .from('manuales_equipos')
          .getPublicUrl(filePath);
        currentUrl = urlData.publicUrl;
      }
    }

    // Serialize metadata fields inside the descripcion column
    const descJson = JSON.stringify({
      notes: form.notes || "",
      brand: form.brand || "",
      model: form.model || "",
      serial: form.serial || "",
      status: form.status || "Disponible",
      lastCal: form.lastCal || "",
      nextCal: form.nextCal || ""
    });

    const payload = {
      nombre: form.nombre,
      tipo: form.tipo,
      area_id: parseInt(form.area_id),
      codigo: form.codigo || null,
      criticidad: form.criticidad,
      manual_url: currentUrl,
      descripcion: descJson
    };

    if (form.id) {
      payload.id = form.id;
    }

    const { error } = await supabase.from(st("activos")).upsert([payload]);
    if (error) alert("Error: " + error.message);
    else {
      setShowForm(false);
      resetForm();
      loadData();
    }
    setSaving(false);
  }

  async function saveManualIntervention() {
    if (!manualIntForm.descripcion || !manualIntForm.accion) return alert("Completa descripción y acción");
    setSaving(true);
    
    const { data: maxData } = await supabase
      .from(st("solicitudes"))
      .select("consecutivo")
      .eq("area_id", 1)
      .order("consecutivo", { ascending: false })
      .limit(1);
    
    const nextConsecutivo = (maxData?.[0]?.consecutivo || 0) + 1;

    const { error } = await supabase.from(st("solicitudes")).insert([{
      activo_id: selectedEquipo.id,
      tipo_solicitud_id: parseInt(manualIntForm.tipo_solicitud_id) || 2,
      descripcion: `(MANUAL) ${manualIntForm.descripcion}`,
      accion_realizada: manualIntForm.accion,
      usuario_id: manualIntForm.tecnico || "TÉCNICO EXTERNO",
      estado_id: 15, // Cerrado
      area_id: 1,
      consecutivo: nextConsecutivo,
      fecha_cierre: new Date(manualIntForm.fecha).toISOString(),
      created_at: new Date(manualIntForm.fecha).toISOString(),
      area_solicitante: "MANTENIMIENTO"
    }]);

    if (error) alert("Error: " + error.message);
    else {
      setShowManualInt(false);
      setManualIntForm({ fecha: new Date().toISOString().split("T")[0], descripcion: "", accion: "", tecnico: "", tipo_solicitud_id: 5 });
      loadRutina(selectedEquipo);
    }
    setSaving(false);
  }

  async function deleteEquipo(id, e) {
    e.stopPropagation();
    if (!confirm("¿Eliminar esta herramienta? Esta acción no se puede deshacer.")) return;
    const { error } = await supabase.from(st("activos")).delete().eq("id", id);
    if (error) alert("Error: " + error.message);
    else loadData();
  }

  async function saveNewArea() {
    if (!newAreaName.trim()) return;
    const { data, error } = await supabase.from(st("areas")).insert([{ nombre: newAreaName.trim() }]).select();
    if (error) { alert("Error al crear área: " + error.message); return; }
    const newAr = data[0];
    setNewAreaName("");
    setShowAreaForm(false);
    setAreas(prev => [...prev, newAr].sort((a, b) => a.nombre.localeCompare(b.nombre)));
    setForm(prev => ({ ...prev, area_id: newAr.id }));
  }

  async function loadRutina(activo) {
    setSelectedEquipo(activo);
    setRutinaLoading(true);
    setRutina([]);
    const { data } = await supabase
      .from(st("solicitudes"))
      .select(ss(`id, consecutivo, created_at, descripcion, accion_realizada, fecha_cierre, usuario_id, prioridad_id, tipos_solicitud(nombre)`))
      .eq("activo_id", activo.id)
      .in("estado_id", [13, 14, 15])
      .order("created_at", { ascending: false });
    setRutina(data || []);
    setRutinaLoading(false);
  }

  function printHojaRutina() {
    if (!selectedEquipo) return;
    const parsed = parseDesc(selectedEquipo.descripcion);
    const calStatus = getCalibrationStatus(parsed.nextCal);
    const printWindow = window.open("", "_blank");
    
    const html = `
      <html>
        <head>
          <title>Hoja de Control de Calibración - ${selectedEquipo.nombre}</title>
          <style>
            body { font-family: sans-serif; padding: 40px; color: #333; line-height: 1.6; }
            .header { display: flex; justify-content: space-between; border-bottom: 2px solid #333; padding-bottom: 10px; margin-bottom: 20px; }
            .title { font-size: 20px; font-weight: bold; }
            .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 30px; background: #f9f9f9; padding: 15px; border-radius: 8px; border: 1px solid #e2e8f0; }
            .info-item { font-size: 13px; }
            .info-item strong { color: #475569; }
            .alert-box { padding: 10px 15px; border-radius: 6px; font-weight: bold; margin-bottom: 20px; display: inline-block; font-size: 13px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th { background: #f1f5f9; text-align: left; padding: 10px; border: 1px solid #cbd5e1; font-size: 12px; }
            td { padding: 10px; border: 1px solid #cbd5e1; font-size: 12px; vertical-align: top; }
            .footer { margin-top: 50px; font-size: 11px; color: #64748b; text-align: center; border-top: 1px solid #e2e8f0; padding-top: 10px; }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="title">SISTEMA GMP — REGISTRO DE CALIBRACIÓN Y CONTROL</div>
            <div style="text-align: right; font-size: 12px;">
              <div>Código Serie: ${selectedEquipo.codigo || "N/A"}</div>
              <div>Fecha Emisión: ${new Date().toLocaleDateString()}</div>
            </div>
          </div>
          <div class="info-grid">
            <div class="info-item"><strong>HERRAMIENTA / EQUIPO:</strong> ${selectedEquipo.nombre}</div>
            <div class="info-item"><strong>MARCA / MODELO:</strong> ${parsed.brand || "N/A"} / ${parsed.model || "N/A"}</div>
            <div class="info-item"><strong>NÚMERO SERIE:</strong> ${parsed.serial || "N/A"}</div>
            <div class="info-item"><strong>CATEGORÍA:</strong> ${selectedEquipo.tipo}</div>
            <div class="info-item"><strong>UBICACIÓN / TALLER:</strong> ${areas.find(a => a.id === selectedEquipo.area_id)?.nombre || "N/A"}</div>
            <div class="info-item"><strong>ESTADO OPERATIVO:</strong> ${parsed.status}</div>
            <div class="info-item"><strong>ÚLT. CALIBRACIÓN:</strong> ${parsed.lastCal ? new Date(parsed.lastCal + "T00:00:00").toLocaleDateString() : "No registrada"}</div>
            <div class="info-item"><strong>PRÓX. CALIBRACIÓN:</strong> ${parsed.nextCal ? new Date(parsed.nextCal + "T00:00:00").toLocaleDateString() : "No registrada"}</div>
          </div>
          <div class="alert-box" style="background-color: ${calStatus.bg}; color: ${calStatus.color}; border: 1px solid ${calStatus.color}40;">
            ESTADO DE VIGENCIA DE CALIBRACIÓN: ${calStatus.label}
          </div>
          
          ${parsed.notes ? `
            <div style="margin-bottom: 25px; background: #fff; border-left: 4px solid #cbd5e1; padding-left: 10px;">
              <strong>Especificaciones / Notas:</strong>
              <p style="margin: 5px 0 0; font-size: 12px; color: #475569;">${parsed.notes}</p>
            </div>
          ` : ""}

          <h3>HISTORIAL DE CALIBRACIONES Y SERVICIOS</h3>
          <table>
            <thead>
              <tr>
                <th>FECHA</th>
                <th>OT</th>
                <th>TIPO</th>
                <th>DESCRIPCIÓN DE INTERVENCIÓN</th>
                <th>ACCIONES Y AJUSTES REALIZADOS</th>
                <th>RESPONSABLE</th>
              </tr>
            </thead>
            <tbody>
              ${rutina.map(r => `
                <tr>
                  <td>${new Date(r.fecha_cierre).toLocaleDateString()}</td>
                  <td>M-${r.consecutivo}</td>
                  <td>${r.tipos_solicitud?.nombre}</td>
                  <td>${r.descripcion}</td>
                  <td>${r.accion_realizada}</td>
                  <td>${r.usuario_id}</td>
                </tr>
              `).join("")}
              ${rutina.length === 0 ? '<tr><td colspan="6" style="text-align: center; color: #94a3b8;">No registra intervenciones en el historial.</td></tr>' : ""}
            </tbody>
          </table>
          <div class="footer">Documento de control interno de mantenimiento — Laboratorios Gusing SAS</div>
          <script>window.print(); setTimeout(() => window.close(), 500);</script>
        </body>
      </html>
    `;
    printWindow.document.write(html);
    printWindow.document.close();
  }

  function resetForm() {
    setForm({ 
      id: null,
      nombre: "", 
      tipo: "Herramienta Manual", 
      area_id: defaultAreaId, 
      codigo: "", 
      criticidad: "Baja", 
      manual_url: "",
      brand: "",
      model: "",
      serial: "",
      status: "Disponible",
      lastCal: "",
      nextCal: "",
      notes: ""
    });
    setFile(null);
    setShowAreaForm(false);
    setNewAreaName("");
  }

  return (
    <>
      {!embedded && <Navbar />}
      <div className={embedded ? "" : "mant-container"}>
        {!embedded && (
          <header className="mant-header-section">
            <div>
              <h2 className="mant-title">Equipos y Herramientas de Mantenimiento</h2>
              <p className="mant-subtitle">Control de calibración, vigencia y estado operativo para herramientas del taller — {activos.length} herramientas registradas</p>
            </div>
            <div className="mant-actions-group">
              <button className="mant-btn-action secondary" onClick={() => navigate("/mantenimiento")}>← Tablero</button>
              <button className="mant-btn-action primary" onClick={() => { resetForm(); setShowForm(true); }}>+ Nueva Herramienta</button>
            </div>
          </header>
        )}
        {embedded && (
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "16px" }}>
            <button className="mant-btn-action primary" onClick={() => { resetForm(); setShowForm(true); }}>+ Nueva Herramienta</button>
          </div>
        )}

        {/* STATS ROW */}
        <div className="activos-stats-row">
          <div className="activo-stat" onClick={() => { setFiltroEstado("todos"); setFiltroCalibracion("todos"); }} style={{ "--a": "var(--mant-primary)" }}>
            <span className="as-val">{stats.total}</span><span className="as-lbl">Total Herramientas</span>
          </div>
          <div className="activo-stat" onClick={() => { setFiltroEstado("Disponible"); setFiltroCalibracion("todos"); }} style={{ "--a": "#10b981" }}>
            <span className="as-val" style={{ color: "#10b981" }}>{stats.disponibles}</span><span className="as-lbl">Disponibles</span>
          </div>
          <div className="activo-stat" onClick={() => { setFiltroEstado("En Reparación"); setFiltroCalibracion("todos"); }} style={{ "--a": "#ef4444" }}>
            <span className="as-val" style={{ color: "#ef4444" }}>{stats.noDisponible}</span><span className="as-lbl">No Disponible</span>
          </div>
        </div>

        {/* FILTERS PANEL */}
        <div className="mant-filter-bar" style={{ display: "flex", flexWrap: "wrap", gap: "12px", alignItems: "center" }}>
          <div className="mant-search-wrap" style={{ flex: "1 1 250px" }}>
            <span className="search-icon">🔍</span>
            <input className="mant-search-input" placeholder="Buscar por nombre, marca, serie, tag..."
              value={filtroText} onChange={e => setFiltroText(e.target.value)} />
            {filtroText && <button className="search-clear" onClick={() => setFiltroText("")}>✖</button>}
          </div>

          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            {/* Status Filter */}
            <select className="v2-select" style={{ width: "160px", padding: "8px", borderRadius: "8px" }}
              value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}>
              <option value="todos">Todos los Estados</option>
              <option value="Disponible">Disponible</option>
              <option value="En Uso">En Uso</option>
              <option value="En Reparación">En Reparación</option>
              <option value="Fuera de Servicio">Fuera de Servicio</option>
            </select>

            {/* Calibration Expiry Filter */}
            <select className="v2-select" style={{ width: "185px", padding: "8px", borderRadius: "8px" }}
              value={filtroCalibracion} onChange={e => setFiltroCalibracion(e.target.value)}>
              <option value="todos">Todas las Calibraciones</option>
              <option value="vigente">Calibración Vigente</option>
              <option value="proxima">Próxima a vencer (&lt;30d)</option>
              <option value="vencida">Vencida 🚨</option>
              <option value="no_requiere">No requiere calibración</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div className="mant-loading-state">Actualizando inventario de herramientas...</div>
        ) : filtered.length === 0 ? (
          <div className="empty-state" style={{ marginTop: "60px" }}>
            <div className="empty-state-icon">🔧</div>
            <p>No se encontraron herramientas con los filtros seleccionados</p>
          </div>
        ) : (
          <div className="assets-grid-premium">
            {filtered.map(a => {
              const area = areas.find(ar => ar.id === a.area_id);
              const parsed = parseDesc(a.descripcion);
              const calStatus = getCalibrationStatus(parsed.nextCal);
              const stCol = ESTADO_COLORS[parsed.status] || { bg: "#f1f5f9", color: "#475569", border: "#cbd5e1" };

              return (
                <div key={a.id} className="asset-card-v2" onClick={() => loadRutina(a)} style={{ paddingBottom: "15px" }}>
                  <div className="card-v2-header" style={{ marginBottom: "8px" }}>
                    <span className="v2-id-tag">{a.codigo || `HER-${a.id}`}</span>
                    <span className="v2-type-badge" style={{ backgroundColor: "rgba(14, 165, 233, 0.15)", color: "#0ea5e9" }}>{a.tipo}</span>
                  </div>

                  <div style={{ display: "flex", gap: "10px", alignItems: "center", marginBottom: "8px" }}>
                    <div className="card-v2-icon" style={{ fontSize: "1.6rem", margin: 0 }}>{TIPO_ICON[a.tipo] || "🔧"}</div>
                    <div style={{ overflow: "hidden" }}>
                      <h4 style={{ margin: 0, fontSize: "0.95rem", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{a.nombre}</h4>
                      <p style={{ margin: "2px 0 0", fontSize: "0.75rem", color: "#64748b" }}>
                        {parsed.brand ? `${parsed.brand} ` : ""}{parsed.model ? `| Mod: ${parsed.model}` : ""}
                      </p>
                    </div>
                  </div>

                  {parsed.serial && (
                    <div style={{ fontSize: "0.75rem", color: "#475569", marginBottom: "8px" }}>
                      <strong>S/N:</strong> <code style={{ background: "#f1f5f9", padding: "2px 4px", borderRadius: "4px" }}>{parsed.serial}</code>
                    </div>
                  )}

                  {/* Status & Calibration Alert Row */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px", margin: "10px 0" }}>
                    <div style={{ 
                      fontSize: "0.72rem", padding: "4px 8px", borderRadius: "6px", display: "inline-flex", width: "fit-content",
                      backgroundColor: stCol.bg, color: stCol.color, border: `1px solid ${stCol.border}`, fontWeight: "bold"
                    }}>
                      Estado: {parsed.status}
                    </div>
                    
                    {parsed.nextCal && (
                      <div style={{ 
                        fontSize: "0.7rem", padding: "4px 8px", borderRadius: "6px", display: "inline-flex", width: "fit-content",
                        backgroundColor: calStatus.bg, color: calStatus.color, border: `1px solid ${calStatus.border}`, fontWeight: "bold"
                      }}>
                        Calibración: {calStatus.label}
                      </div>
                    )}
                  </div>

                  <div className="v2-location-info" style={{ marginTop: "auto", fontSize: "0.75rem" }}>📍 {area?.nombre || "Sin taller"}</div>
                  
                  <div className="card-v2-footer" style={{ marginTop: "12px", borderTop: "1px dashed #e2e8f0", paddingTop: "12px" }}>
                    <button className="mini-btn" onClick={e => { e.stopPropagation(); loadRutina(a); }}>📋 Historial</button>
                    <div style={{ display: "flex", gap: "6px" }}>
                      <button className="mini-btn" style={{ color: "var(--mant-primary)", borderColor: "#bfdbfe" }} onClick={e => openEdit(a, e)}>✏️ Editar</button>
                      <button className="mini-btn" style={{ color: "#ef4444", borderColor: "#fecaca" }} onClick={e => deleteEquipo(a.id, e)}>🗑️</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* FORM MODAL */}
        {showForm && (
          <div className="mant-modal-overlay-v2" onClick={() => { setShowForm(false); resetForm(); }}>
            <div className="mant-modal-content-centered" onClick={e => e.stopPropagation()}>
              <div className="modal-v2-header">
                <h3>{form.id ? "✏️ Editar Herramienta" : "✨ Nueva Herramienta"}</h3>
                <button className="close-btn-v2" onClick={() => { setShowForm(false); resetForm(); }}>✖</button>
              </div>
              <div className="modal-v2-body">
                <div className="v2-form-group">
                  <label>Nombre de la Herramienta / Instrumento <span className="req">*</span></label>
                  <input className="v2-input" type="text" value={form.nombre}
                    onChange={e => setForm({ ...form, nombre: e.target.value })}
                    placeholder="Ej: Taladro Percutor Makita 18V" />
                </div>
                
                <div className="v2-form-row">
                  <div className="v2-form-group">
                    <label>Categoría</label>
                    <select className="v2-select" value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value })}>
                      <option value="Herramienta Manual">Herramienta Manual</option>
                      <option value="Herramienta Eléctrica">Herramienta Eléctrica</option>
                      <option value="Equipo de Medición">Equipo de Medición / Calibración</option>
                      <option value="Equipo de Seguridad">Equipo de Seguridad</option>
                      <option value="Herramienta">Otra Herramienta</option>
                    </select>
                  </div>
                  <div className="v2-form-group">
                    <label>Estado Operativo</label>
                    <select className="v2-select" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                      <option value="Disponible">Disponible</option>
                      <option value="En Uso">En Uso</option>
                      <option value="En Reparación">En Taller / Reparación</option>
                      <option value="Fuera de Servicio">Fuera de Servicio</option>
                    </select>
                  </div>
                </div>

                <div className="v2-form-row">
                  <div className="v2-form-group">
                    <label>Marca</label>
                    <input className="v2-input" type="text" value={form.brand}
                      onChange={e => setForm({ ...form, brand: e.target.value })} placeholder="Ej: Bosch, Fluke" />
                  </div>
                  <div className="v2-form-group">
                    <label>Modelo</label>
                    <input className="v2-input" type="text" value={form.model}
                      onChange={e => setForm({ ...form, model: e.target.value })} placeholder="Ej: 115, DHP482" />
                  </div>
                </div>

                <div className="v2-form-row">
                  <div className="v2-form-group">
                    <label>Número de Serie</label>
                    <input className="v2-input" type="text" value={form.serial}
                      onChange={e => setForm({ ...form, serial: e.target.value })} placeholder="S/N: 2026402..." />
                  </div>
                  <div className="v2-form-group">
                    <label>Código Interno / TAG / Placa</label>
                    <input className="v2-input" type="text" value={form.codigo}
                      onChange={e => setForm({ ...form, codigo: e.target.value })} placeholder="HER-001" />
                  </div>
                </div>

                {/* Calibration Dates (Visible always, useful for measuring tools) */}
                <div className="v2-form-row">
                  <div className="v2-form-group">
                    <label>Última Calibración / Control</label>
                    <input className="v2-input" type="date" value={form.lastCal}
                      onChange={e => setForm({ ...form, lastCal: e.target.value })} />
                  </div>
                  <div className="v2-form-group">
                    <label>Próxima Calibración (Vencimiento)</label>
                    <input className="v2-input" type="date" value={form.nextCal}
                      onChange={e => setForm({ ...form, nextCal: e.target.value })} />
                  </div>
                </div>

                <div className="v2-form-group">
                  <label>Ubicación / Taller <span className="req">*</span></label>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <select className="v2-select" value={form.area_id} onChange={e => setForm({ ...form, area_id: e.target.value })}>
                      <option value="">Seleccione ubicación...</option>
                      {areas.map(ar => <option key={ar.id} value={ar.id}>{ar.nombre}</option>)}
                    </select>
                    <button className="v2-add-btn" title="Nueva ubicación" onClick={() => setShowAreaForm(!showAreaForm)}>
                      {showAreaForm ? "✖" : "+"}
                    </button>
                  </div>
                  {showAreaForm && (
                    <div className="v2-inline-form">
                      <input className="v2-input-mini" placeholder="Nombre del taller/ubicación..." value={newAreaName}
                        onChange={e => setNewAreaName(e.target.value)} onKeyDown={e => e.key === "Enter" && saveNewArea()} />
                      <button className="v2-save-mini" onClick={saveNewArea}>OK</button>
                    </div>
                  )}
                </div>

                <div className="v2-form-group">
                  <label>Certificado de Calibración / Manual (PDF)</label>
                  <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                    <input className="v2-input" type="file" accept=".pdf" onChange={e => setFile(e.target.files[0])} />
                    {form.manual_url && (
                      <a href={form.manual_url} target="_blank" rel="noreferrer" className="v2-btn-secondary" style={{ textDecoration: "none", fontSize: "0.75rem", padding: "8px" }}>
                        📄 Ver Actual
                      </a>
                    )}
                  </div>
                </div>

                <div className="v2-form-group">
                  <label>Observaciones / Accesorios / Características Técnicas</label>
                  <textarea className="v2-input" rows={2} value={form.notes}
                    onChange={e => setForm({ ...form, notes: e.target.value })}
                    placeholder="Incluye accesorios, estado físico, rango de medición, etc..." />
                </div>
              </div>
              <div className="modal-v2-footer">
                <button className="v2-btn-secondary" onClick={() => { setShowForm(false); resetForm(); }}>Cancelar</button>
                <button className="v2-btn-primary" onClick={saveEquipo} disabled={saving}>
                  {saving ? "Guardando..." : form.id ? "Actualizar Herramienta" : "Registrar Herramienta"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* HISTORIAL MODAL */}
        {selectedEquipo && (
          <div className="mant-modal-overlay-v2" onClick={() => setSelectedEquipo(null)}>
            <div className="mant-modal-content-centered wide-v2" onClick={e => e.stopPropagation()}>
              <div className="modal-v2-header">
                <div className="v2-header-title">
                  <span className="icon-v2-header">{TIPO_ICON[selectedEquipo.tipo] || "🔧"}</span>
                  <div>
                    <h3>Historial de Intervenciones</h3>
                    <p>{selectedEquipo.nombre} | {selectedEquipo.codigo || "Sin código"} |&nbsp;
                      <span className={`v2-crit-badge crit-${selectedEquipo.criticidad?.toLowerCase() || "baja"}`}>
                        {selectedEquipo.criticidad || "Baja"}
                      </span>
                    </p>
                  </div>
                </div>
                <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                  {selectedEquipo.manual_url && (
                    <a href={selectedEquipo.manual_url} target="_blank" rel="noreferrer" className="v2-btn-secondary" style={{ textDecoration: "none", fontSize: "0.85rem", display: "flex", alignItems: "center", gap: "5px" }}>
                      📄 Ver Certificado
                    </a>
                  )}
                  <button className="v2-btn-primary" style={{ padding: "8px 16px", fontSize: "0.85rem" }} onClick={printHojaRutina}>
                    🖨️ Generar PDF / Imprimir
                  </button>
                  <button className="close-btn-v2" onClick={() => setSelectedEquipo(null)}>✖</button>
                </div>
              </div>
              <div className="scroll-v2">
                {rutinaLoading ? (
                  <div className="mant-loading-state">Cargando historial...</div>
                ) : (
                  <>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "15px" }}>
                      <h4 className="v2-subtitle" style={{ margin: 0 }}>Historial de Mantenimiento / Calibración</h4>
                      <button className="v2-btn-primary" style={{ fontSize: "0.75rem", padding: "6px 12px" }} onClick={() => setShowManualInt(true)}>
                        + Registrar Calibración/Mantenimiento Manual
                      </button>
                    </div>

                    {showManualInt && (
                      <div className="v2-inline-manual-form" style={{ background: "#f8fafc", padding: "15px", borderRadius: "12px", border: "1px solid #e2e8f0", marginBottom: "20px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "10px" }}>
                          <strong>Nueva Intervención / Calibración</strong>
                          <button className="close-btn-v2" onClick={() => setShowManualInt(false)}>✖</button>
                        </div>
                        <div className="v2-form-row">
                          <div className="v2-form-group">
                            <label>Fecha</label>
                            <input type="date" className="v2-input" value={manualIntForm.fecha} onChange={e => setManualIntForm({...manualIntForm, fecha: e.target.value})} />
                          </div>
                          <div className="v2-form-group">
                            <label>Técnico / Proveedor Responsable</label>
                            <select className="v2-select" value={manualIntForm.tecnico} onChange={e => setManualIntForm({...manualIntForm, tecnico: e.target.value})}>
                              <option value="">Seleccione...</option>
                              <optgroup label="👨‍🔧 Técnicos Internos">
                                {proveedores.filter(p => p.tipo === "Interno").map(p => <option key={p.id} value={p.nombre}>{p.nombre}</option>)}
                              </optgroup>
                              <optgroup label="🚚 Proveedores Externos">
                                {proveedores.filter(p => p.tipo !== "Interno").map(p => <option key={p.id} value={p.nombre}>{p.nombre}</option>)}
                              </optgroup>
                            </select>
                          </div>
                          <div className="v2-form-group">
                            <label>Tipo de Intervención</label>
                            <select 
                              className="v2-select" 
                              value={manualIntForm.tipo_solicitud_id} 
                              onChange={e => setManualIntForm({...manualIntForm, tipo_solicitud_id: e.target.value})}
                            >
                              {tiposSolicitud.filter(t => [2, 5, 6].includes(t.id) || t.nombre.toLowerCase().includes("calibracion") || t.nombre.toLowerCase().includes("calibración")).map(t => (
                                <option key={t.id} value={t.id}>{t.nombre}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                        <div className="v2-form-group">
                          <label>Descripción / Problema / Estado de Calibración</label>
                          <input type="text" className="v2-input" value={manualIntForm.descripcion} onChange={e => setManualIntForm({...manualIntForm, descripcion: e.target.value})} />
                        </div>
                        <div className="v2-form-group">
                          <label>Acción Realizada / Ajustes</label>
                          <textarea className="v2-input" rows={2} value={manualIntForm.accion} onChange={e => setManualIntForm({...manualIntForm, accion: e.target.value})} />
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <button className="v2-btn-primary" onClick={saveManualIntervention} disabled={saving}>
                            {saving ? "Guardando..." : "Registrar en Historial"}
                          </button>
                        </div>
                      </div>
                    )}

                    {rutina.length === 0 ? (
                      <div className="v2-empty-state">
                        <div className="v2-empty-icon">📭</div>
                        <p>Esta herramienta no registra mantenimiento o calibraciones previas.</p>
                      </div>
                    ) : (
                      <div className="v2-timeline">
                        {rutina.map(item => {
                          const fechaRef = item.fecha_cierre || item.created_at;
                          const enProceso = !item.fecha_cierre;
                          return (
                            <div key={item.id} className="v2-timeline-item">
                              <div className={`v2-tl-marker ${enProceso ? "tl-marker-proceso" : ""}`}></div>
                              <div className="v2-tl-date">
                                <span className="v2-date-main">{new Date(fechaRef).toLocaleDateString("es-CO")}</span>
                                <span className="v2-date-sub">{enProceso ? "En proceso" : new Date(fechaRef).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                              </div>
                              <div className={`v2-tl-card ${enProceso ? "tl-card-proceso" : ""}`}>
                                <div className="v2-tl-header">
                                  <span className="v2-tl-consec">M-{item.consecutivo}</span>
                                  <span className="v2-tl-type">{item.tipos_solicitud?.nombre || "Manual"}</span>
                                  {enProceso && <span className="tl-badge-proceso">⚙️ En Proceso</span>}
                                </div>
                                <div className="v2-tl-body">
                                  <p className="v2-tl-orig"><strong>Intervención:</strong> {item.descripcion}</p>
                                  {item.accion_realizada && (
                                    <div className="v2-tl-action">
                                      <strong>Acción realizada:</strong>
                                      <p>{item.accion_realizada}</p>
                                    </div>
                                  )}
                                </div>
                                <div className="v2-tl-footer">👨‍🔧 Responsable: {item.usuario_id}</div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
      {!embedded && <Footer />}
    </>
  );
}
