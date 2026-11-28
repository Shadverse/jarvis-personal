import { randomUUID } from "node:crypto";

const intents = {
  createProject: /^(?:create project|ساخت پروژه|پروژه بساز)\s+(.+)$/iu,
  createTask: /^(?:add task|create task|ساخت وظیفه|وظیفه بساز)\s+(.+)$/iu,
  openSite: /^(?:open website|open site|باز کردن سایت|باز کردن وب‌سایت)\s+(https:\/\/\S+)$/iu,
};

function website(value) {
  try {
    const url = new URL(value);
    if (url.protocol === "https:" && !url.username && !url.password && url.hostname.includes("."))
      return url.href;
  } catch {}
  return null;
}

export function openActionIntents(actions) {
  const pending = new Map();
  return {
    clear(sessionId) {
      pending.delete(sessionId);
    },
    execute(session, request) {
      const operation = request.action;
      const input = request.input;
      if (!input || typeof input !== "object" || Array.isArray(input))
        return { error: "intent_invalid" };
      const now = Date.now();
      for (const [id, item] of pending) if (item.expires <= now) pending.delete(id);
      if (operation === "intent.preview") {
        if (typeof input.message !== "string" || input.message.length > 400)
          return { error: "intent_invalid" };
        pending.delete(session.id);
        const message = input.message.trim();
        const projectName = intents.createProject.exec(message)?.[1]?.trim();
        const taskTitle = intents.createTask.exec(message)?.[1]?.trim();
        const destination = intents.openSite.exec(message)?.[1];
        if (destination) {
          const url = website(destination);
          return url ? { plan: { action: "browser.open", url } } : { error: "intent_invalid" };
        }
        let action, args, target;
        if (projectName) {
          if (projectName.length > 120 || /[\x00-\x1f\x7f]/u.test(projectName))
            return { error: "project_invalid" };
          action = "project.create";
          args = { name: projectName };
        } else if (taskTitle) {
          if (taskTitle.length > 200 || /[\x00-\x1f\x7f]/u.test(taskTitle))
            return { error: "task_invalid" };
          const reference = actions.listTasks(session.userId, input.projectId);
          if (reference.error) return { error: "project_missing" };
          action = "task.create";
          args = { projectId: reference.project.id, title: taskTitle };
          target = reference.project.name;
        } else return { error: "intent_invalid" };
        if (pending.size >= 64) pending.delete(pending.keys().next().value);
        const id = randomUUID();
        pending.set(session.id, {
          id,
          owner: session.userId,
          action,
          args,
          expires: now + 120_000,
        });
        return { plan: { id, action, label: projectName ?? taskTitle, target } };
      }
      if (
        !["intent.confirm", "intent.cancel"].includes(operation) ||
        typeof input.id !== "string" ||
        Object.keys(input).length !== 1
      )
        return { error: "intent_invalid" };
      const plan = pending.get(session.id);
      if (!plan || plan.id !== input.id || plan.owner !== session.userId)
        return { error: "intent_missing" };
      pending.delete(session.id);
      if (operation === "intent.cancel") return { status: "canceled" };
      return actions.execute(session.userId, { action: plan.action, input: plan.args });
    },
  };
}
