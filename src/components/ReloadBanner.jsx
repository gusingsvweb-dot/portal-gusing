import React from "react";
import { useNotifications } from "../context/NotificationsContext";
import "./ReloadBanner.css";

export default function ReloadBanner() {
    const { reloadCountdown, cancelReload } = useNotifications();

    if (reloadCountdown === null) return null;

    return (
        <div className="reload-banner">
            <div className="reload-banner-content">
                <span className="reload-icon">🔄</span>
                <span>Actualizando página en <strong>{reloadCountdown}</strong> segundos...</span>
                <button className="reload-cancel-btn" onClick={cancelReload} title="Cancelar recarga">
                    ✕
                </button>
            </div>
        </div>
    );
}
