export const voiceStates = {
  idle: ["آماده", "Ready"],
  listening: ["در حال شنیدن", "Listening"],
  thinking: ["اندیشیدن", "Thinking"],
  speaking: ["در حال پخش", "Playing"],
  error: ["خطا", "Error"],
};
export function energyCore(state = "idle") {
  return `<div class="portrait" data-state="${state}" role="img" aria-label="${document.documentElement.lang === "en" ? "JARVIS portrait drawn in luminous particles" : "چهرهٔ جارویس ترسیم‌شده با ذرات نورانی"}"><canvas aria-hidden="true"></canvas></div>`;
}
