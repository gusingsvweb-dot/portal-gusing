import { supabase } from "./supabaseClient";

/**
 * Envía una notificación a un usuario específico.
 */
export async function notifyUser(userId, titulo, mensaje, pedidoId = null) {
    try {
        const { error } = await supabase.from("notificaciones").insert([
            {
                user_id: userId,
                titulo,
                mensaje,
                pedido_id: pedidoId,
                leida: false,
            },
        ]);

        if (error) throw error;
        return true;
    } catch (err) {
        console.error("Error enviando notif a usuario:", err);
        return false;
    }
}

/**
 * Envía una notificación a todos los usuarios que tengan ciertos roles.
 * @param {string[]} roles - Array de roles, ej: ["produccion", "gerencia"]
 */
export async function notifyRoles(roles, titulo, mensaje, pedidoId = null, tipo = 'info') {
    try {
        const uniqueRoles = [...new Set(roles.map(r => r.toLowerCase().trim()))];
        console.log("🔔 Buscando usuarios con roles:", uniqueRoles);

        // 2. Buscar TODOS los usuarios y filtrar en memoria por tolerancia a tildes/espacios
        const { data: allUsers, error: errUsers } = await supabase
            .from("usuarios")
            .select("id, rol");

        if (errUsers) throw errUsers;

        // Limpiar strings: quitar tildes y pasar a minúscula
        const normalizeStr = (str) =>
            str ? str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim() : "";

        const rolesNormalizados = uniqueRoles.map(normalizeStr);

        const users = allUsers.filter(u => {
            const userRolNormalizado = normalizeStr(u.rol);
            return rolesNormalizados.some(r => userRolNormalizado.includes(r));
        });

        console.log(`🔔 Usuarios encontrados: ${users?.length || 0}`, users);

        if (!users || users.length === 0) return { sent: 0 };

        // 3. Preparar inserts
        // IMPORTANTE: Incluimos 'tipo' porque la tabla lo requiere
        const notificaciones = users.map((u) => ({
            user_id: u.id,
            titulo,
            mensaje,
            pedido_id: pedidoId,
            tipo: tipo,
            leida: false,
        }));

        // 4. Insertar
        const { error: errIns } = await supabase
            .from("notificaciones")
            .insert(notificaciones);

        if (errIns) throw errIns;

        return { sent: notificaciones.length };
    } catch (err) {
        console.error("❌ Error CRÍTICO enviando notif a roles:", JSON.stringify(err, null, 2));
        if (err.code === "42501") {
            alert("Error de Permisos (RLS): No puedes enviar notificaciones. Contacta al admin.");
        }
        return { sent: 0, error: err };
    }
}
/**
 * Verifica si todas las etapas de un pedido están completadas.
 * De ser así, envía una notificación a Producción.
 */
export async function checkAndNotifyFlowCompletion(pedidoId) {
    try {
        const { data: etapas, error } = await supabase
            .from("pedido_etapas")
            .select("estado, nombre")
            .eq("pedido_id", pedidoId);

        if (error) throw error;
        if (!etapas || etapas.length === 0) return false;

        // FILTRAR: Ignoramos "Acondicionamiento" para la lógica de completitud
        const relevantes = etapas.filter(e => !e.nombre.toLowerCase().includes("acondicionamiento"));

        if (relevantes.length === 0) return false;

        const todasCompletas = relevantes.every((e) => e.estado === "completada");

        if (todasCompletas) {
            await notifyRoles(
                ["produccion"],
                "🚀 Flujo de Etapas Completo",
                `Todas las etapas internas del Pedido #${pedidoId} han finalizado. Ya puede ingresar a Acondicionamiento.`,
                pedidoId,
                "proceso_completado"
            );
            return true;
        }
        return false;
    } catch (err) {
        console.error("Error en checkAndNotifyFlowCompletion:", err);
        return false;
    }
}
