const sectionNames = [
  "organization",
  "creator",
  "projects",
  "milestones",
  "decisions",
  "preferences",
  "businessRules",
  "infrastructure",
  "checkpoints",
  "tasks",
  "skills",
];
const key = /^[a-zA-Z0-9_-]{1,80}$/u;
const fields = new Set([
  "id",
  "title",
  "text",
  "projectId",
  "relatedProjectIds",
  "workspaceProjectId",
]);
export const bootstrapBodyLimit = 168_000;
const defaults = () => ({
  schemaVersion: 1,
  sections: Object.fromEntries(sectionNames.map((name) => [name, []])),
});

function validated(input, ownsProject, secret) {
  if (
    !input ||
    input.schemaVersion !== 1 ||
    !input.sections ||
    typeof input.sections !== "object" ||
    Array.isArray(input.sections) ||
    Object.keys(input).some((name) => !["schemaVersion", "sections"].includes(name)) ||
    Object.keys(input.sections).some((name) => !sectionNames.includes(name))
  )
    return null;
  const source = JSON.stringify(input);
  if (
    Buffer.byteLength(source) > 125_000 ||
    (secret && source.includes(secret)) ||
    /-----BEGIN [A-Z ]*PRIVATE KEY-----|\bBearer [A-Za-z0-9_-]{24,}/iu.test(source)
  )
    return null;
  const normalized = defaults();
  for (const name of sectionNames) {
    const rows = Object.hasOwn(input.sections, name) ? input.sections[name] : [];
    if (!Array.isArray(rows) || rows.length > 64) return null;
    const seen = new Set();
    for (const row of rows) {
      if (
        !row ||
        typeof row !== "object" ||
        Array.isArray(row) ||
        Object.keys(row).some((name) => !fields.has(name)) ||
        typeof row.id !== "string" ||
        !key.test(row.id) ||
        seen.has(row.id) ||
        typeof row.title !== "string" ||
        !row.title.trim() ||
        row.title.length > 100 ||
        typeof row.text !== "string" ||
        !row.text.trim() ||
        row.text.length > 500 ||
        /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/u.test(row.title + row.text)
      )
        return null;
      if (
        row.projectId !== undefined &&
        (name === "projects" || typeof row.projectId !== "string" || !key.test(row.projectId))
      )
        return null;
      if (
        row.workspaceProjectId !== undefined &&
        (name !== "projects" ||
          typeof row.workspaceProjectId !== "string" ||
          !ownsProject(row.workspaceProjectId))
      )
        return null;
      if (
        row.relatedProjectIds !== undefined &&
        (name !== "projects" ||
          !Array.isArray(row.relatedProjectIds) ||
          row.relatedProjectIds.length > 12 ||
          row.relatedProjectIds.some(
            (id) => typeof id !== "string" || !key.test(id) || id === row.id,
          ) ||
          new Set(row.relatedProjectIds).size !== row.relatedProjectIds.length)
      )
        return null;
      seen.add(row.id);
      normalized.sections[name].push({ ...row, title: row.title.trim(), text: row.text.trim() });
    }
  }
  const projects = normalized.sections.projects;
  const projectIds = new Set(projects.map((row) => row.id));
  const mappings = projects.flatMap((row) =>
    row.workspaceProjectId ? [row.workspaceProjectId] : [],
  );
  if (new Set(mappings).size !== mappings.length) return null;
  for (const rows of Object.values(normalized.sections)) {
    for (const row of rows) {
      if (
        (row.projectId && !projectIds.has(row.projectId)) ||
        row.relatedProjectIds?.some((id) => !projectIds.has(id))
      )
        return null;
    }
  }
  return normalized;
}

export function openBootstrap(db, ownsProject, secret) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS creator_bootstrap (
      id INTEGER PRIMARY KEY CHECK(id=1),
      owner INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      revision INTEGER NOT NULL, payload TEXT NOT NULL, updated INTEGER NOT NULL
    )
  `);
  const read = db.prepare(
    "SELECT revision,payload,updated FROM creator_bootstrap WHERE id=1 AND owner=?",
  );
  const save = db.prepare(`
    INSERT INTO creator_bootstrap(id,owner,revision,payload,updated)
    SELECT 1,?,1,?,? WHERE ?=0 OR EXISTS(SELECT 1 FROM creator_bootstrap WHERE id=1)
    ON CONFLICT(id) DO UPDATE SET revision=creator_bootstrap.revision+1,
      payload=excluded.payload,updated=excluded.updated
    WHERE creator_bootstrap.owner=excluded.owner AND creator_bootstrap.revision=?
    RETURNING revision,updated
  `);
  return {
    read(owner) {
      const current = read.get(owner);
      return current
        ? {
            revision: current.revision,
            updated: current.updated,
            package: JSON.parse(current.payload),
          }
        : { revision: 0, updated: null, package: defaults() };
    },
    replace(owner, body) {
      if (!Number.isSafeInteger(body?.revision) || body.revision < 0)
        return { error: "bootstrap_invalid" };
      const clean = validated(body.package, (id) => ownsProject(owner, id), secret);
      if (!clean) return { error: "bootstrap_invalid" };
      const result = save.get(
        owner,
        JSON.stringify(clean),
        Date.now(),
        body.revision,
        body.revision,
      );
      return result ? { ...result, package: clean } : { error: "bootstrap_conflict" };
    },
    context(owner, workspaceProject) {
      const row = read.get(owner);
      if (!row) return [];
      const { sections } = JSON.parse(row.payload);
      const project = sections.projects.find(
        (record) => record.workspaceProjectId === workspaceProject,
      );
      if (workspaceProject !== null && !project) return [];
      return Object.entries(sections).flatMap(([section, entries]) =>
        entries
          .filter((entry) =>
            project
              ? (section === "projects" && entry.id === project.id) ||
                entry.projectId === project.id
              : section !== "projects" && !entry.projectId,
          )
          .map((entry) => ({
            id: `bootstrap:${section}:${entry.id}`,
            updated: row.revision,
            kind: "organization",
            text: `${entry.title} · ${entry.text}`.slice(0, 500),
            contextAllowed: 1,
          })),
      );
    },
  };
}
