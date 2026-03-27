import React, { createContext, useContext, useEffect, useState, useMemo } from "react";
import { supabase, st } from "../api/supabaseClient";
import { useAuth } from "./AuthContext";

const NotificationsContext = createContext();

export function NotificationsProvider({ children }) {
    const { usuarioActual } = useAuth();
    const userIdInterno = usuarioActual?.id || null;

    const [notifs, setNotifs] = useState([]);
    const [reloadCountdown, setReloadCountdown] = useState(null); // Segundos restantes para recarga

    const noLeidas = useMemo(
        () => notifs.filter((n) => !n.leida).length,
        [notifs]
    );

    async function cargarNotifs() {
        if (!userIdInterno) return;

        const { data, error } = await supabase
            .from(st("notificaciones"))
            .select("id, titulo, mensaje, leida, created_at, pedido_id")
            .eq("user_id", userIdInterno)
            .order("created_at", { ascending: false })
            .limit(20);

        if (!error) setNotifs(data || []);
    }

    async function marcarTodasLeidas() {
        if (!userIdInterno) return;

        const ids = notifs.filter((n) => !n.leida).map((n) => n.id);
        if (ids.length === 0) return;

        const { error } = await supabase
            .from(st("notificaciones"))
            .update({ leida: true })
            .in("id", ids);

        if (!error) {
            setNotifs((prev) => prev.map((n) => ({ ...n, leida: true })));
        }
    }

    async function marcarLeida(notifId) {
        if (!userIdInterno || !notifId) return;

        const { error } = await supabase
            .from(st("notificaciones"))
            .update({ leida: true })
            .eq("id", notifId);

        if (!error) {
            setNotifs((prev) =>
                prev.map((n) => n.id === notifId ? { ...n, leida: true } : n)
            );
        }
    }

    // Pedir permiso para notificaciones de escritorio
    async function activarNotifsEscritorio() {
        if (!("Notification" in window)) return;

        if (Notification.permission === "default") {
            await Notification.requestPermission();
        }
    }

    // Cargar al entrar / cambiar usuario + Polling (fallback)
    useEffect(() => {
        if (!userIdInterno) {
            setNotifs([]);
            return;
        }

        cargarNotifs(); // inicial

        // Polling cada 60s como fallback
        const t = setInterval(() => cargarNotifs(), 60000);

        return () => clearInterval(t);
    }, [userIdInterno]);

    // Helper para sonido sintético (infalible)
    const playSound = () => {
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!AudioContext) return;
            const ctx = new AudioContext();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();

            osc.connect(gain);
            gain.connect(ctx.destination);

            osc.type = "sine";
            osc.frequency.setValueAtTime(587, ctx.currentTime); // Nota Re (D5)
            osc.frequency.exponentialRampToValueAtTime(1174, ctx.currentTime + 0.1); // Subida a Re6

            gain.gain.setValueAtTime(0.3, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);

            osc.start();
            osc.stop(ctx.currentTime + 0.5);
        } catch (e) {
            console.error("AudioContext error", e);
        }
    };

    // Efecto separado para la recarga para evitar fugas de memoria
    useEffect(() => {
        let timer;
        if (reloadCountdown !== null) {
            if (reloadCountdown > 0) {
                timer = setInterval(() => {
                    setReloadCountdown(prev => prev - 1);
                }, 1000);
            } else {
                // Notificar y recargar
                // window.location.reload() es el culpable del 404 si Vercel falla sin redirección. 
                // Al estar el vercel.json configurado, esto ya debería funcionar.
                window.location.reload();
            }
        }
        return () => { if (timer) clearInterval(timer); };
    }, [reloadCountdown]);

    const cancelReload = () => setReloadCountdown(null);

    // Realtime: escuchar inserts SOLO de este usuario interno
    useEffect(() => {
        if (!userIdInterno) return;

        const channel = supabase
            .channel(`notifs-${userIdInterno}`)
            .on(
                "postgres_changes",
                {
                    event: "INSERT",
                    schema: "public",
                    table: "notificaciones",
                    filter: `user_id=eq.${userIdInterno}`,
                },
                (payload) => {
                    const nueva = payload.new;

                    // agregar arriba
                    setNotifs((prev) => [nueva, ...prev].slice(0, 20));

                    // 🔔 Notificación de escritorio
                    if ("Notification" in window && Notification.permission === "granted") {
                        try {
                            playSound();

                            const n = new Notification(nueva.titulo || "Nueva notificación", {
                                body: nueva.mensaje || "Tienes un nuevo mensaje.",
                                requireInteraction: true,
                                silent: false,
                                icon: "https://gqspcolombia.org/wp-content/uploads/2025/09/21.png",
                                image: "https://gqspcolombia.org/wp-content/uploads/2025/09/21.png"
                            });
                            n.onclick = () => window.focus();

                            // 🔄 Iniciar cuenta regresiva para recarga (5s)
                            setReloadCountdown(5);
                        } catch (e) {
                            console.error("Error mostrando notificación real:", e);
                        }
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [userIdInterno]);


    const [toast, setToast] = useState(null);

    const addNotificationUI = (type, message) => {
        console.log("🔔 addNotificationUI Triggered:", { type, message });
        setToast({ type, message });
        setTimeout(() => setToast(null), 4000); // Desaparece tras 4s
    };

    const value = {
        notifs,
        noLeidas,
        cargarNotifs,
        marcarTodasLeidas,
        marcarLeida,
        activarNotifsEscritorio,
        reloadCountdown,
        cancelReload,
        addNotificationUI
    };

    return (
        <NotificationsContext.Provider value={value}>
            {children}

            {/* UI TOASTER (Global) */}
            {toast && (
                <div style={{
                    position: 'fixed',
                    bottom: '30px',
                    right: '30px',
                    zIndex: 9999,
                    animation: 'slideIn 0.3s ease-out'
                }}>
                    <div style={{
                        background: toast.type === 'success' ? '#10b981' : '#ef4444',
                        color: 'white',
                        padding: '12px 24px',
                        borderRadius: '12px',
                        boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        fontWeight: '600',
                        fontSize: '0.95rem'
                    }}>
                        <span>{toast.type === 'success' ? '✅' : '⚠️'}</span>
                        {toast.message}
                    </div>
                </div>
            )}

            <style>{`
                @keyframes slideIn {
                    from { transform: translateY(20px); opacity: 0; }
                    to { transform: translateY(0); opacity: 1; }
                }
            `}</style>
        </NotificationsContext.Provider>
    );
}

export function useNotifications() {
    const context = useContext(NotificationsContext);
    if (!context) {
        throw new Error("useNotifications debe usarse dentro de NotificationsProvider");
    }
    return context;
}
