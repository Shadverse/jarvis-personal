// The original refractive volume is baked into one texture. Motion uses only
// composited transforms, so even the static fallback retains the glass optics.
export const voiceStates = {
  idle: ["آماده", "Idle"],
  listening: ["شنیدن", "Listening"],
  thinking: ["اندیشیدن", "Thinking"],
  speaking: ["سخن گفتن", "Speaking"],
  disconnected: ["قطع اتصال", "Disconnected"],
};

export function energyCore(state = "idle") {
  const constrained =
    navigator.connection?.saveData ||
    navigator.hardwareConcurrency <= 2 ||
    navigator.deviceMemory <= 2;
  return `<div aria-hidden="true" class="energy ${constrained ? "still" : ""}" data-state="${state}"><div class="aura"></div><div class="levitate"><i class="jewel"></i></div><div class="reflection"></div></div>`;
}
