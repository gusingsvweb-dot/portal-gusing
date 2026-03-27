import React, { createContext, useContext, useState, useEffect } from "react";

const ConfigContext = createContext();

export const ConfigProvider = ({ children }) => {
  // Estado para saber si estamos en la versión "No Oficial"
  const [isNoOficial, setIsNoOficial] = useState(() => {
    // Intentar recuperar de localStorage o por parámetro en la URL
    const saved = localStorage.getItem("isNoOficial");
    if (saved !== null) return saved === "true";
    
    // Si la URL contiene /no-oficial o un query param
    return window.location.pathname.includes("/no-oficial") || window.location.search.includes("vers=no");
  });

  useEffect(() => {
    localStorage.setItem("isNoOficial", isNoOficial);
  }, [isNoOficial]);

  // Función helper para obtener el nombre de la tabla con prefijo si aplica
  const t = (tableName) => {
    if (!isNoOficial) return tableName;
    
    // Si ya tiene el prefijo, no agregarlo de nuevo
    if (tableName.startsWith("NO_")) return tableName;
    
    return `NO_${tableName}`;
  };

  return (
    <ConfigContext.Provider value={{ isNoOficial, setIsNoOficial, t }}>
      {children}
    </ConfigContext.Provider>
  );
};

export const useConfig = () => {
  const context = useContext(ConfigContext);
  if (!context) {
    throw new Error("useConfig debe usarse dentro de un ConfigProvider");
  }
  return context;
};
