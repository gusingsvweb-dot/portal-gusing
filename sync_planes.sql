-- Asegurar que solo haya un plan preventivo por activo para que el upsert funcione
ALTER TABLE planes_preventivos ADD CONSTRAINT planes_preventivos_activo_id_key UNIQUE (activo_id);
ALTER TABLE "NO_planes_preventivos" ADD CONSTRAINT NO_planes_preventivos_activo_id_key UNIQUE (activo_id);
