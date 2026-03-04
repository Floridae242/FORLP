const LINE_NOTIFY_TOKEN = process.env.LINE_NOTIFY_TOKEN ?? "";
const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN ?? "";

// Safety threshold from PDF report peak data (~3,000 people)
const SAFETY_THRESHOLD = Number(process.env.SAFETY_THRESHOLD ?? "2500");

interface NotifyPayload {
  count: number;
  zone?: string;
  cameraId?: string;
  timestamp?: string;
}

interface NotifyResult {
  success: boolean;
  method: "notify" | "messaging" | "none";
  triggered: boolean;
  error?: string;
}

/**
 * checkSafetyThreshold — ตรวจสอบว่าเกิน Safety Threshold หรือไม่
 * Logic: If currentCount > 2500 (based on PDF peak ~3,000), trigger alert
 */
export function checkSafetyThreshold(currentCount: number): boolean {
  return currentCount > SAFETY_THRESHOLD;
}

/**
 * Build LINE alert message — format from Master Prompt spec
 */
function buildAlertMessage({
  count,
  zone = "Kad Kong Ta Walking Street",
  cameraId = "LPG-B01-Temp-CC-01",
  timestamp,
}: NotifyPayload): string {
  const time = timestamp
    ? new Date(timestamp).toLocaleTimeString("th-TH", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Asia/Bangkok",
      })
    : new Date().toLocaleTimeString("th-TH", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Asia/Bangkok",
      });

  return [
    "🚨 CROWD ALERT: Kad Kong Ta",
    "",
    `🕐 Time: ${time} น.`,
    `👥 Density: **High** (${count.toLocaleString()} people)`,
    `📍 Zone: ${cameraId} (${zone})`,
    `🔴 Status: Overcrowding Risk (>${SAFETY_THRESHOLD.toLocaleString()})`,
    "",
    "📋 Action Required: Check CCTV.",
    "• เพิ่มเจ้าหน้าที่จุดดูแล",
    "• พิจารณาจำกัดการเข้า-ออก",
    "• เปิดช่องทางฉุกเฉิน",
    "",
    "— Kad Kong Ta AI People Counting System",
    "— เทศบาลนครลำปาง",
  ].join("\n");
}

async function sendViaLineNotify(message: string): Promise<boolean> {
  if (!LINE_NOTIFY_TOKEN) return false;
  const res = await fetch("https://notify-api.line.me/api/notify", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LINE_NOTIFY_TOKEN}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ message }),
  });
  return res.ok;
}

async function sendViaMessagingAPI(message: string): Promise<boolean> {
  if (!LINE_CHANNEL_ACCESS_TOKEN) return false;
  const res = await fetch("https://api.line.me/v2/bot/message/broadcast", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messages: [{ type: "text", text: message }],
    }),
  });
  return res.ok;
}

/**
 * evaluateAndNotify — Main entry point
 * Checks safety threshold, builds message, sends via LINE
 */
export async function evaluateAndNotify(payload: NotifyPayload): Promise<NotifyResult> {
  if (!checkSafetyThreshold(payload.count)) {
    return { success: true, method: "none", triggered: false };
  }

  const message = buildAlertMessage(payload);

  // Try LINE Notify first, fallback to Messaging API
  if (LINE_NOTIFY_TOKEN) {
    const ok = await sendViaLineNotify(message);
    return { success: ok, method: "notify", triggered: true, error: ok ? undefined : "LINE Notify failed" };
  }

  if (LINE_CHANNEL_ACCESS_TOKEN) {
    const ok = await sendViaMessagingAPI(message);
    return { success: ok, method: "messaging", triggered: true, error: ok ? undefined : "Messaging API failed" };
  }

  return { success: false, method: "none", triggered: true, error: "No LINE credentials configured" };
}

export { buildAlertMessage, SAFETY_THRESHOLD };
export type { NotifyPayload, NotifyResult };
