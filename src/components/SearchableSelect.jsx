import { useState, useEffect, useRef } from "react";
import "./SearchableSelect.css";

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

    // Encontrar la etiqueta seleccionada basada en el valor interno (ID)
    const selectedOption = options.find(opt => opt.value == value);

    // Sincronizar el input de búsqueda con el valor seleccionado si no está abierto
    useEffect(() => {
        if (selectedOption && !isOpen) {
            setSearchTerm(selectedOption.label);
        } else if (!value && !isOpen) {
            setSearchTerm("");
        }
    }, [value, selectedOption, isOpen]);

    // Cerrar al hacer clic fuera
    useEffect(() => {
        function handleClickOutside(event) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
                setIsOpen(false);
                // Si cerramos, restauramos el texto a la opción seleccionada (o vacío si no hay nada)
                if (selectedOption) {
                    setSearchTerm(selectedOption.label);
                } else {
                    setSearchTerm("");
                    // Si es requerido y está vacío, ya se validará por fuera, pero podríamos forzar limpieza
                }
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [selectedOption]);

    // Filtrar opciones
    const filteredOptions = options.filter(opt =>
        opt.label.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const handleSelect = (option) => {
        onChange({ target: { name, value: option.value } });
        setSearchTerm(option.label);
        setIsOpen(false);
    };

    const handleInputChange = (e) => {
        setSearchTerm(e.target.value);
        setIsOpen(true);
        // Si borra todo, limpiamos la selección
        if (e.target.value === "") {
            onChange({ target: { name, value: "" } });
        }
    };

    return (
        <div className="searchable-select-container" ref={wrapperRef}>
            <input
                type="text"
                className="searchable-input"
                placeholder={placeholder}
                value={searchTerm}
                onChange={handleInputChange}
                onFocus={() => setIsOpen(true)}
                required={required && !value} // Truco para validación HTML5 básica
            />

            {isOpen && (
                <ul className="searchable-options fadeIn">
                    {filteredOptions.length > 0 ? (
                        filteredOptions.map((opt) => (
                            <li
                                key={opt.value}
                                className={`searchable-option ${opt.value === value ? "selected" : ""}`}
                                onClick={() => handleSelect(opt)}
                            >
                                {opt.label}
                            </li>
                        ))
                    ) : (
                        <li className="searchable-no-results">No se encontraron resultados</li>
                    )}
                </ul>
            )}
        </div>
    );
}
