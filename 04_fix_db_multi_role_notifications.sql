-- 04_fix_db_multi_role_notifications.sql

-- Actualizar la función trigger para soportar múltiples roles (separados por coma)
-- Anteriormente usaba '=' lo que fallaba al tener 'control_calidad,microbiologia'.

create or replace function public.fn_notificar_cambio_etapa()
returns trigger
language plpgsql
security definer
as $$
declare
    v_pedido_id bigint;
    v_etapa_nombre text;
    v_rol_liberador text;
    v_mensaje text;
begin
    v_pedido_id := NEW.pedido_id;
    v_etapa_nombre := NEW.nombre;
    v_rol_liberador := lower(trim(NEW.rol_liberador));
    
    -- CASO 1: Entra a en_revision y requiere liberación
    if (OLD.estado is distinct from 'en_revision') and (NEW.estado = 'en_revision') and (NEW.requiere_liberacion = true) then
        
        v_mensaje := 'Tienes una etapa lista para revisión: ' || v_etapa_nombre || ' (Pedido #' || v_pedido_id || ')';

        -- Notificar a todos los usuarios cuyo rol esté incluido en la lista de roles del liberador
        insert into public.notificaciones (user_id, pedido_id, pedido_etapa_id, tipo, titulo, mensaje, leida)
        select u.id, v_pedido_id, NEW.id, 'accion_requerida', 'Nueva acción requerida', v_mensaje, false
        from public.usuarios u
        where lower(trim(u.rol)) = ANY(string_to_array(v_rol_liberador, ','));
        
    end if;

    -- CASO 2: Etapa Liberada (pasa a completada o liberada = true)
    if (OLD.estado = 'en_revision') and (NEW.estado = 'completada' or NEW.estado = 'pendiente') then
        
        if (NEW.estado = 'pendiente') then
             v_mensaje := 'La etapa ' || v_etapa_nombre || ' fue devuelta por Calidad/Micro. Revisar observaciones.';
        else
             v_mensaje := 'La etapa ' || v_etapa_nombre || ' ha sido liberada/completada.';
        end if;

        if NEW.asignado_a_usuario is not null then
            insert into public.notificaciones (user_id, pedido_id, pedido_etapa_id, tipo, titulo, mensaje, leida)
            values (NEW.asignado_a_usuario, v_pedido_id, NEW.id, 'info', 'Actualización de Etapa', v_mensaje, false);
        end if;

    end if;

    return NEW;
end;
$$;
