import React, { useState, useEffect } from "react";
import { supabase } from "../api/supabaseClient";
import Navbar from "../components/navbar.jsx";
import { useAuth } from "../context/AuthContext";
import "./CalendarioProduccion.css";

const DIAS_SEMANA = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const MESES = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
];

// 🇨🇴 Festivos Colombia 2025 (y 2026 según pedido)
const FESTIVOS = {
    "01-01": "Año Nuevo",
    "01-12": "Reyes Magos",
    "03-23": "Día de San José",
    "04-02": "Jueves Santo",
    "04-03": "Viernes Santo",
    "05-01": "Día del Trabajo",
    "05-18": "Ascensión del Señor",
    "06-08": "Corpus Christi",
    "06-15": "Sagrado Corazón",
    "06-29": "San Pedro y San Pablo",
    "07-20": "Independencia",
    "08-07": "Batalla de Boyacá",
    "08-17": "Asunción de la Virgen",
    "10-12": "Día de la Raza",
    "11-02": "Todos los Santos",
    "11-16": "Independencia de Cartagena",
    "12-08": "Inmaculada Concepción",
    "12-25": "Navidad"
};

export default function CalendarioProduccion() {
    const { usuarioActual } = useAuth();
    const [currentDate, setCurrentDate] = useState(new Date());
    const [tareas, setTareas] = useState([]);
    const [loading, setLoading] = useState(false);

    // Modal State
    const [selectedDate, setSelectedDate] = useState(null);
    const [showModal, setShowModal] = useState(false);
    const [form, setForm] = useState({ titulo: "", descripcion: "" });

    const esProduccion = usuarioActual?.rol?.toLowerCase() === "produccion";

    // Cargar tareas al cambiar de mes
    useEffect(() => {
        cargarTareasMes();
    }, [currentDate]);

    async function cargarTareasMes() {
        setLoading(true);
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();

        // Rango del mes completo
        const start = new Date(year, month, 1).toISOString();
        const end = new Date(year, month + 1, 0).toISOString();

        const { data, error } = await supabase
            .from("tareas_produccion")
            .select("*")
            .gte("fecha", start)
            .lte("fecha", end);

        if (error) {
            console.error("Error cargando tareas:", error);
        } else {
            setTareas(data || []);
        }
        setLoading(false);
    }

    // Navegación Mes
    const prevMonth = () => {
        setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
    };
    const nextMonth = () => {
        setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
    };

    // Generación Grid
    const getDaysInMonth = (year, month) => {
        return new Date(year, month + 1, 0).getDate();
    };

    const getFirstDayOfMonth = (year, month) => {
        // 0 = Dom, 1 = Lun ... ajustamos para que Lun=0, Dom=6
        const day = new Date(year, month, 1).getDay();
        return day === 0 ? 6 : day - 1;
    };

    const daysInMonth = getDaysInMonth(currentDate.getFullYear(), currentDate.getMonth());
    const firstDay = getFirstDayOfMonth(currentDate.getFullYear(), currentDate.getMonth());
    const emptyCells = Array(firstDay).fill(null);
    const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

    // Manejadores Modal
    const handleDayClick = (day) => {
        const dateObj = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
        const dateStr = dateObj.toISOString().slice(0, 10);
        const todayStr = new Date().toISOString().slice(0, 10);

        // Si es una fecha pasada, no permitimos abrir el formulario de creación (aunque el modal se abra para ver)
        // pero validaremos en el renderizado del modal si mostramos el form.
        setSelectedDate(dateStr);
        setForm({ titulo: "", descripcion: "" });
        setShowModal(true);
    };

    const closeModal = () => {
        setShowModal(false);
        setSelectedDate(null);
    };

    const guardarTarea = async (e) => {
        e.preventDefault();
        if (!form.titulo.trim()) return;

        const nuevaTarea = {
            fecha: selectedDate,
            titulo: form.titulo,
            descripcion: form.descripcion,
            created_by: usuarioActual?.usuario?.id
        };

        const { error } = await supabase.from("tareas_produccion").insert([nuevaTarea]);

        if (error) {
            alert("Error al guardar tarea");
            console.error(error);
        } else {
            // Recargar y cerrar
            cargarTareasMes();
            setForm({ titulo: "", descripcion: "" }); // Limpiar para agregar otra si se desea
            // No cerramos modal para verla agregada? Mejor cerrar
            // Opcional: mantener abierto para agregar más. Cerremos por UX simple.
            // Pero si queremos ver la lista, mejor solo limpiar form.
            // Vamos a recargar y mantener abierto mostrando la lista actualizada.
        }
    };

    // Filtrar tareas del día seleccionado
    const tareasDelDiaSeleccionado = tareas.filter(t => t.fecha === selectedDate);

    // Renderizar celdas
    const renderCell = (day) => {
        const d = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
        const dateStr = d.toISOString().slice(0, 10);
        const todayStr = new Date().toISOString().slice(0, 10);

        const dayTasks = tareas.filter(t => t.fecha === dateStr);

        const isToday = todayStr === dateStr;
        const isPast = dateStr < todayStr;
        const dayOfWeek = d.getDay(); // 0=Dom, 6=Sáb
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

        const dateMMDD = dateStr.slice(5); // Obtiene "MM-DD"
        const holidayName = FESTIVOS[dateMMDD];
        const isHoliday = !!holidayName;

        let cellClass = "calendar-day-cell";
        if (isPast) cellClass += " past-day";
        if (isWeekend) cellClass += " weekend";
        if (isHoliday) cellClass += " holiday";

        return (
            <div key={day} className={cellClass} onClick={() => handleDayClick(day)}>
                <div className="day-cell-header">
                    <span className={`day-number ${isToday ? "today" : ""}`}>{day}</span>
                    {isHoliday && <span className="holiday-label">Festivo</span>}
                </div>
                {isHoliday && <div className="holiday-name">{holidayName}</div>}
                {dayTasks.map(t => (
                    <div key={t.id} className="task-chip" title={t.titulo}>
                        {t.titulo}
                    </div>
                ))}
            </div>
        );
    };

    return (
        <>
            <Navbar />
            <div className="calendar-container fadeIn">
                <div className="calendar-header">
                    <h2>{MESES[currentDate.getMonth()]} {currentDate.getFullYear()}</h2>
                    <div className="calendar-nav">
                        <button onClick={prevMonth}>&lt; Anterior</button>
                        <button onClick={nextMonth} >Siguiente &gt;</button>
                    </div>
                </div>

                <div className="calendar-grid">
                    {DIAS_SEMANA.map(d => (
                        <div key={d} className="calendar-day-header">{d}</div>
                    ))}

                    {emptyCells.map((_, i) => (
                        <div key={`empty-${i}`} className="calendar-day-cell empty"></div>
                    ))}

                    {days.map(d => renderCell(d))}
                </div>
            </div>

            {showModal && (
                <div className="cal-modal-backdrop" onClick={closeModal}>
                    <div className="cal-modal" onClick={e => e.stopPropagation()}>
                        <h3>📅 Tareas del {selectedDate}</h3>

                        {/* LISTA DE TAREAS EXISTENTES */}
                        <div className="cal-task-list">
                            {tareasDelDiaSeleccionado.length === 0 && <p style={{ color: "#888", fontSize: "14px" }}>No hay tareas programadas.</p>}
                            {tareasDelDiaSeleccionado.map(t => (
                                <div key={t.id} className="cal-task-item">
                                    <h4>{t.titulo}</h4>
                                    {t.descripcion && <p>{t.descripcion}</p>}
                                </div>
                            ))}
                        </div>

                        {/* FORMULARIO SOLO PARA PRODUCCIÓN Y SI NO ES FECHA PASADA NI FIN DE SEMANA */}
                        {(() => {
                            const d = new Date(selectedDate + "T00:00:00");
                            const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                            const isPast = selectedDate < new Date().toISOString().slice(0, 10);
                            const isHoliday = !!FESTIVOS[selectedDate.slice(5)];

                            if (esProduccion && !isPast && !isWeekend && !isHoliday) {
                                return (
                                    <form onSubmit={guardarTarea} className="cal-form">
                                        <label>Nueva Tarea</label>
                                        <input
                                            type="text"
                                            placeholder="Título..."
                                            value={form.titulo}
                                            onChange={e => setForm({ ...form, titulo: e.target.value })}
                                            required
                                        />
                                        <textarea
                                            rows="2"
                                            placeholder="Detalles (opcional)..."
                                            value={form.descripcion}
                                            onChange={e => setForm({ ...form, descripcion: e.target.value })}
                                        />
                                        <div className="cal-actions">
                                            <button type="button" className="cal-btn cancel" onClick={closeModal}>Cerrar</button>
                                            <button type="submit" className="cal-btn save">Guardar</button>
                                        </div>
                                    </form>
                                );
                            }
                            return null;
                        })()}

                        {!esProduccion && (
                            <div className="cal-actions">
                                <button type="button" className="cal-btn cancel" onClick={closeModal}>Cerrar</button>
                            </div>
                        )}

                    </div>
                </div>
            )}
        </>
    );
}
