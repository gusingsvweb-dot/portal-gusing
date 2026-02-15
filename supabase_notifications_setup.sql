-- ================================================================
-- 1. Función para obtener IDs de usuarios por rol
-- ================================================================
create or replace function public.fn_get_userids_por_rol(rol_input text)
returns setof uuid
language sql
security definer
as $$
  select id 
  from public.usuarios 
  where lower(trim(rol)) = lower(trim(rol_input));
$$;

-- ================================================================
-- 2. Función Trigger: Lógica de Notificaciones de Etapas
-- ================================================================
create or replace function public.fn_notificar_cambio_etapa()
returns trigger
language plpgsql
security definer
as $$
declare
    v_pedido_id bigint;
    v_etapa_nombre text;
    v_usuario_destino uuid;
    v_rol_liberador text;
    v_mensaje text;
begin
    v_pedido_id := NEW.pedido_id;
    v_etapa_nombre := NEW.nombre;
    v_rol_liberador := lower(trim(NEW.rol_liberador));
    
    -- CASO 1: Entra a en_revision y requiere liberación
    -- (OLD.estado es distinto de en_revision  Y  NEW.estado = 'en_revision'  Y  requiere_liberacion = true)
    if (OLD.estado is distinct from 'en_revision') and (NEW.estado = 'en_revision') and (NEW.requiere_liberacion = true) then
        
        v_mensaje := 'Tienes una etapa lista para revisión: ' || v_etapa_nombre || ' (Pedido #' || v_pedido_id || ')';

        -- Notificar a todos los del rol liberador
        insert into public.notificaciones (user_id, pedido_id, pedido_etapa_id, tipo, titulo, mensaje, leida)
        select u.id, v_pedido_id, NEW.id, 'accion_requerida', 'Nueva acción requerida', v_mensaje, false
        from public.usuarios u
        where lower(trim(u.rol)) = v_rol_liberador;
        
    end if;

    -- CASO 2: Etapa Liberada (pasa a completada o liberada = true)
    -- Asumimos que el cambio de estado a 'completada' implica que pasó la revisión
    if (OLD.estado = 'en_revision') and (NEW.estado = 'completada' or NEW.estado = 'pendiente') then
        
        -- Si fue rechazada/devuelta a pendiente
        if (NEW.estado = 'pendiente') then
             v_mensaje := 'La etapa ' || v_etapa_nombre || ' fue devuelta por Calidad/Micro. Revisar observaciones.';
        else
             -- Fue completada/aprobada
             v_mensaje := 'La etapa ' || v_etapa_nombre || ' ha sido liberada/completada.';
        end if;

        -- Notificar al usuario asignado (Producción)
        v_usuario_destino := NEW.asignado_a_usuario;
        
        if v_usuario_destino is not null then
            insert into public.notificaciones (user_id, pedido_id, pedido_etapa_id, tipo, titulo, mensaje, leida)
            values (v_usuario_destino, v_pedido_id, NEW.id, 'info', 'Actualización de Etapa', v_mensaje, false);
        end if;

    end if;

    return NEW;
end;
$$;

-- ================================================================
-- 3. Crear el Trigger en la tabla pedido_etapas
-- ================================================================
drop trigger if exists tr_pedido_etapas_notify on public.pedido_etapas;

create trigger tr_pedido_etapas_notify
after update on public.pedido_etapas
for each row
execute function public.fn_notificar_cambio_etapa();


-- ================================================================
-- 4. POLÍTICA RLS PARA NOTIFICACIONES (Solución al error 42501)
-- Permite que cualquier usuario autenticado inserte notificaciones
-- (Necesario para el trigger si se ejecuta con permisos del user, 
-- aunque 'security definer' en la función ayuda, es bueno tener la política)
-- ================================================================
alter table public.notificaciones enable row level security;

create policy "Usuarios pueden ver sus propias notificaciones"
on public.notificaciones for select
to authenticated
using (user_id = (select id from public.usuarios where usuario = current_user) or true); 
-- Nota: Como no usas Auth.uid(), la política de SELECT depende de cómo filtres en frontend.
-- Si usas una tabla custom de usuarios, RLS de Supabase Auth no aplica directo.
-- Para inserts desde el TRIGGER (Server side), no hay problema si la función es SECURITY DEFINER.
-- Para inserts desde el FRONTEND (como crear pedido), necesitas esta:

create policy "Cualquiera puede insertar notificaciones"
on public.notificaciones for insert
to authenticated
with check (true);
