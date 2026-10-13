import { execSync } from "child_process";
import fs from "fs";
import path from "path";

async function main() {
  console.log("🔍 Consultando proyectos en tu cuenta de Supabase...");
  
  let projects = [];
  try {
    const rawProjects = execSync("npx supabase projects list", { encoding: "utf8" });
    const parsed = JSON.parse(rawProjects);
    projects = parsed.projects || [];
  } catch (err) {
    console.warn("⚠️ No se pudo listar proyectos con npx supabase projects list. Usando proyecto por defecto.");
    projects = [{ ref: "hmvznxwwaoassdiqlaax", name: "gusingsvweb-dot Project" }];
  }

  if (projects.length === 0) {
    projects = [{ ref: "hmvznxwwaoassdiqlaax", name: "gusingsvweb-dot Project" }];
  }

  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}`;

  const backupDir = path.resolve(process.cwd(), "backups");
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  // Detectar comando pg_dump en el sistema
  let pgDumpCmd = "pg_dump";
  try {
    pgDumpCmd = execSync("which pg_dump", { encoding: "utf8" }).trim() || "/opt/homebrew/bin/pg_dump";
  } catch {
    if (fs.existsSync("/opt/homebrew/bin/pg_dump")) {
      pgDumpCmd = "/opt/homebrew/bin/pg_dump";
    }
  }

  console.log(`📦 Se encontraron ${projects.length} proyecto(s) para respaldar.`);

  for (const proj of projects) {
    const ref = proj.ref || proj.id;
    const name = (proj.name || ref).replace(/[^a-zA-Z0-9_-]/g, "_");

    console.log(`\n========================================`);
    console.log(`🚀 Respaldando: ${proj.name || ref} (${ref})`);
    console.log(`========================================`);

    try {
      console.log("🔑 Obteniendo credenciales seguras...");
      const dryRun = execSync(`npx supabase db dump --project-ref "${ref}" --dry-run`, { encoding: "utf8" });

      const host = dryRun.match(/export PGHOST="([^"]+)"/)?.[1];
      const port = dryRun.match(/export PGPORT="([^"]+)"/)?.[1] || "5432";
      const user = dryRun.match(/export PGUSER="([^"]+)"/)?.[1];
      const pass = dryRun.match(/export PGPASSWORD="([^"]+)"/)?.[1];
      const db = dryRun.match(/export PGDATABASE="([^"]+)"/)?.[1] || "postgres";

      if (!host || !user || !pass) {
        throw new Error("No se pudieron extraer las credenciales del proyecto.");
      }

      const schemaFile = path.join(backupDir, `${name}_${timestamp}_schema.sql`);
      const dataFile = path.join(backupDir, `${name}_${timestamp}_datos.sql`);

      console.log("📐 1/2 Descargando estructura y tablas (Schema)...");
      execSync(`"${pgDumpCmd}" -h "${host}" -p "${port}" -U "${user}" -d "${db}" --role="postgres" --schema-only --schema=public -f "${schemaFile}"`, {
        env: { ...process.env, PGPASSWORD: pass }
      });
      console.log(`   ✅ Estructura guardada en: backups/${path.basename(schemaFile)}`);

      console.log("📊 2/2 Descargando registros y datos (Data)...");
      execSync(`"${pgDumpCmd}" -h "${host}" -p "${port}" -U "${user}" -d "${db}" --role="postgres" --data-only --schema=public -f "${dataFile}"`, {
        env: { ...process.env, PGPASSWORD: pass }
      });
      console.log(`   ✅ Datos guardados en: backups/${path.basename(dataFile)}`);

    } catch (projErr) {
      console.error(`❌ Error respaldando proyecto ${ref}:`, projErr.message);
    }
  }

  console.log("\n🎉 ¡Copia de seguridad finalizada con éxito!");
  console.log(`📁 Revisa la carpeta: ${backupDir}\n`);
}

main().catch((err) => {
  console.error("Error general:", err);
  process.exit(1);
});
