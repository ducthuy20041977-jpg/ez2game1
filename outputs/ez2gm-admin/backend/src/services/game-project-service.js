import { db } from "../data/mock-db.js";
import { hasDatabaseUrl, query } from "../db/client.js";

function id(prefix, value) {
  return `${prefix}_${String(value).replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").toLowerCase()}`;
}

export async function listGameProjects() {
  if (hasDatabaseUrl()) {
    const projects = await query(`
      select game, project, service_type, frontend_price, backend_price, mode, status, image_url, required_fields
      from game_projects
      order by game, service_type, project
    `);
    const serviceTypes = await query("select name, dispatch, status from service_types order by name");
    return {
      projects: projects.rows.map(item => ({
        game: item.game,
        project: item.project,
        serviceType: item.service_type,
        frontendPrice: item.frontend_price,
        backendPrice: item.backend_price,
        mode: item.mode,
        status: item.status,
        imageUrl: item.image_url,
        requiredFields: item.required_fields
      })),
      serviceTypes: serviceTypes.rows.map(item => ({
        name: item.name,
        dispatch: item.dispatch,
        status: item.status
      }))
    };
  }

  return {
    projects: db.gameProjects,
    serviceTypes: db.serviceTypes
  };
}

function defaultProjectImage(payload = {}) {
  const text = `${payload.serviceType || ""} ${payload.project || ""} ${payload.game || ""}`.toLowerCase();
  if (/cdk|code|key|gift|礼包|兑换/.test(text)) return "assets/projects/service-cdk.png";
  if (/top.?up|recharge|充值|account|账号/.test(text)) return "assets/projects/service-topup.png";
  if (/gold|coin|currency|orb|金币|材料/.test(text)) return "assets/projects/service-gold.png";
  if (/gear|item|equipment|legendary|装备|道具/.test(text)) return "assets/projects/service-gear.png";
  if (/escort|boss|mythic|护送/.test(text)) return "assets/projects/service-escort.png";
  if (/carry|boost|raid|dungeon|leveling|陪跑|代练/.test(text)) return "assets/projects/service-carry.png";
  return "assets/projects/service-gear.png";
}

export async function createGameProject(payload = {}) {
  const project = {
    game: payload.game || "Custom Game",
    project: payload.project || "New Service",
    serviceType: payload.serviceType || "陪跑",
    frontendPrice: payload.frontendPrice || "$0.00",
    backendPrice: payload.backendPrice || "$0.00",
    mode: payload.mode || "manual-confirm",
    status: payload.status || "draft",
    imageUrl: payload.imageUrl || payload.image || defaultProjectImage(payload),
    requiredFields: payload.requiredFields || payload.fields || ""
  };

  if (hasDatabaseUrl()) {
    const result = await query(`
      insert into game_projects (id, game, project, service_type, frontend_price, backend_price, mode, status, image_url, required_fields)
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      on conflict (game, project) do update set
        service_type = excluded.service_type,
        frontend_price = excluded.frontend_price,
        backend_price = excluded.backend_price,
        mode = excluded.mode,
        status = excluded.status,
        image_url = excluded.image_url,
        required_fields = excluded.required_fields,
        updated_at = now()
      returning game, project, service_type, frontend_price, backend_price, mode, status, image_url, required_fields
    `, [
      id("project", `${project.game}_${project.project}`),
      project.game,
      project.project,
      project.serviceType,
      project.frontendPrice,
      project.backendPrice,
      project.mode,
      project.status,
      project.imageUrl,
      project.requiredFields
    ]);
    const row = result.rows[0];
    return {
      game: row.game,
      project: row.project,
      serviceType: row.service_type,
      frontendPrice: row.frontend_price,
      backendPrice: row.backend_price,
      mode: row.mode,
      status: row.status,
      imageUrl: row.image_url,
      requiredFields: row.required_fields
    };
  }

  db.gameProjects.unshift(project);
  return project;
}

export async function bulkCreateGameProjects(payload = {}) {
  const rows = Array.isArray(payload.projects) ? payload.projects : [];
  const created = [];
  for (const item of rows) {
    if (hasDatabaseUrl()) {
      created.push(await createGameProject(item));
      continue;
    }
    const exists = db.gameProjects.some(project => project.game === item.game && project.project === item.project);
    if (!exists) created.push(await createGameProject(item));
  }
  return created;
}
