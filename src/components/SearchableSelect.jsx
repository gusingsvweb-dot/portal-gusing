import { useState, useEffect, useRef, useCallback } from "react";
import "./SearchableSelect.css";

// Normaliza texto: minúsculas + quita tildes/diacríticos
function normalize(str) {
    return (str || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
}

const MAX_VISIBLE = 80; // Límite de resultados visibles para performance

export default function SearchableSelect({
    options,
    value,
    onChange,
    placeholder = "Escribe para buscar...",
    name,
    required = false
}) {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const wrapperRef = useRef(null);
    const inputRef = useRef(null);
    // Guardamos el valor "comprometido" para no confundir con lo que se está escribiendo
    const committedValueRef = useRef(value);

    // Encontrar la etiqueta del valor seleccionado
    const selectedOption = options.find(opt => String(opt.value) === String(value));

    // Solo actualizar el texto visible cuando cambia el `value` externamente
    // (no cuando el usuario está escribiendo)
    useEffect(() => {
        if (!isOpen) {
            // Sólo sincronizamos si el valor realmente es diferente al que teníamos
            if (value !== committedValueRef.current) {
                committedValueRef.current = value;
            }
            if (selectedOption) {
                setSearchTerm(selectedOption.label);
            } else {
                setSearchTerm("");
            }
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value, isOpen]); // NO incluimos selectedOption para evitar loops

    // Cerrar al hacer clic fuera
    useEffect(() => {
        function handleClickOutside(event) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
                setIsOpen(false);
                // Restaurar texto al item seleccionado (o vacío)
                setSearchTerm(selectedOption ? selectedOption.label : "");
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedOption?.label]); // solo la label, no el objeto

    // Filtrar opciones con normalización de texto (sin tildes)
    const normSearch = normalize(searchTerm);
    const filteredOptions = normSearch
        ? options.filter(opt => normalize(opt.label).includes(normSearch))
        : options;

    // Si no hay texto escrito, mostrar solo 20 items como sugerencia inicial
    const MAX_WHEN_EMPTY = 20;
    const limit = normSearch ? MAX_VISIBLE : MAX_WHEN_EMPTY;
    const visibleOptions = filteredOptions.slice(0, limit);
    const hiddenCount = filteredOptions.length - visibleOptions.length;

    const handleSelect = useCallback((option) => {
        committedValueRef.current = option.value;
        onChange({ target: { name, value: option.value } });
        setSearchTerm(option.label);
        setIsOpen(false);
    }, [onChange, name]);

    const handleInputChange = (e) => {
        const val = e.target.value;
        setSearchTerm(val);
        setIsOpen(true);
        // Si borra todo el texto, limpiar la selección
        if (val === "") {
            committedValueRef.current = "";
            onChange({ target: { name, value: "" } });
        }
    };

    const handleFocus = () => {
        setIsOpen(true);
        // Seleccionar todo el texto para que el usuario pueda escribir directamente encima
        setTimeout(() => {
            if (inputRef.current) {
                inputRef.current.select();
            }
        }, 0);
    };

    const handleBlur = () => {
        // No hacemos nada aquí; el cierre lo maneja el click outside
    };

    return (
        <div className="searchable-select-container" ref={wrapperRef}>
            <input
                ref={inputRef}
                type="text"
                className="searchable-input"
                placeholder={selectedOption ? selectedOption.label : placeholder}
                value={searchTerm}
                onChange={handleInputChange}
                onFocus={handleFocus}
                onBlur={handleBlur}
                autoComplete="off"
                required={required && !value}
            />

            {isOpen && (
                <ul className="searchable-options">
                    {visibleOptions.length > 0 ? (
                        <>
                            {visibleOptions.map((opt) => (
                                <li
                                    key={opt.value + "_" + opt.label.slice(0, 10)}
                                    className={`searchable-option ${String(opt.value) === String(value) ? "selected" : ""}`}
                                    onMouseDown={(e) => {
                                        e.preventDefault(); // Evitar que blur cierre antes de seleccionar
                                        handleSelect(opt);
                                    }}
                                >
                                    {opt.label}
                                </li>
                            ))}
                            {hiddenCount > 0 && (
                                <li className="searchable-no-results" style={{ fontStyle: "italic", color: "#6366f1" }}>
                                    +{hiddenCount} más — escribe para filtrar
                                </li>
                            )}
                        </>
                    ) : (
                        <li className="searchable-no-results">No se encontraron resultados</li>
                    )}
                </ul>
            )}
        </div>
    );
}
