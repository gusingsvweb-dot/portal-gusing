import { useState, useEffect, useRef, useCallback } from "react";
import "./SearchableSelect.css";

// Normaliza texto: minúsculas + quita tildes/diacríticos
function normalize(str) {
    return (str || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
}

const MAX_RESULTS = 80; // Máximo de resultados al filtrar
const MAX_PREVIEW = 20; // Máximo de resultados sin filtro (estado inicial)

export default function SearchableSelect({
    options,
    value,
    onChange,
    placeholder = "Escribe para buscar...",
    name,
    required = false,
    initialSearch = "",  // Nuevo: término de búsqueda inicial (ej: del buscador global)
}) {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState(initialSearch || "");
    const wrapperRef = useRef(null);
    const inputRef = useRef(null);

    // Encontrar la etiqueta del valor seleccionado
    const selectedOption = options.find(opt => String(opt.value) === String(value));

    // Cuando se cierra el dropdown: restaurar texto al ítem seleccionado (o limpiar)
    useEffect(() => {
        if (!isOpen) {
            if (selectedOption) {
                setSearchTerm(selectedOption.label);
            } else {
                // Si no hay selección, dejar el initialSearch para que el usuario sepa qué está buscando
                setSearchTerm(initialSearch || "");
            }
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen]);

    // Si el valor externo cambia (selección desde afuera), sincronizar
    useEffect(() => {
        if (!isOpen && selectedOption) {
            setSearchTerm(selectedOption.label);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value]);

    // Si el initialSearch cambia (usuario escribe en buscador global) y el dropdown está cerrado sin selección
    useEffect(() => {
        if (!isOpen && !value) {
            setSearchTerm(initialSearch || "");
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialSearch]);

    // Cerrar al hacer clic fuera
    useEffect(() => {
        function handleClickOutside(event) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // Filtrar opciones con normalización (sin tildes)
    const normSearch = normalize(searchTerm);
    const filteredOptions = normSearch
        ? options.filter(opt => normalize(opt.label).includes(normSearch))
        : options;

    // Limitar resultados
    const limit = normSearch ? MAX_RESULTS : MAX_PREVIEW;
    const visibleOptions = filteredOptions.slice(0, limit);
    const hiddenCount = filteredOptions.length - visibleOptions.length;

    const handleSelect = useCallback((option) => {
        onChange({ target: { name, value: option.value } });
        setSearchTerm(option.label);
        setIsOpen(false);
    }, [onChange, name]);

    const handleInputChange = (e) => {
        setSearchTerm(e.target.value);
        setIsOpen(true);
        if (e.target.value === "") {
            onChange({ target: { name, value: "" } });
        }
    };

    const handleFocus = () => {
        setIsOpen(true);
        // Seleccionar todo para que el usuario pueda escribir directamente encima
        setTimeout(() => {
            if (inputRef.current) {
                inputRef.current.select();
            }
        }, 0);
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
                autoComplete="off"
                required={required && !value}
            />

            {isOpen && (
                <ul className="searchable-options">
                    {visibleOptions.length > 0 ? (
                        <>
                            {visibleOptions.map((opt) => (
                                <li
                                    key={opt.value + "|" + opt.label}
                                    className={`searchable-option ${String(opt.value) === String(value) ? "selected" : ""}`}
                                    onMouseDown={(e) => {
                                        e.preventDefault();
                                        handleSelect(opt);
                                    }}
                                >
                                    {opt.label}
                                </li>
                            ))}
                            {hiddenCount > 0 && (
                                <li
                                    className="searchable-no-results"
                                    style={{ fontStyle: "italic", color: "#6366f1", cursor: "default" }}
                                >
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
