export const voiceStates = {
  idle: ["آماده", "Idle"],
  listening: ["شنیدن", "Listening"],
  thinking: ["اندیشیدن", "Thinking"],
  speaking: ["سخن گفتن", "Speaking"],
  error: ["خطا", "Error"],
};
export function energyCore(state = "idle") {
  return `<div class="portrait" data-state="${state}" role="img" aria-label="${document.documentElement.lang === "en" ? "JARVIS mechanical head with luminous particles" : "سرِ مکانیکی جارویس با ذرات نورانی"}"><canvas aria-hidden="true"></canvas></div>`;
}
