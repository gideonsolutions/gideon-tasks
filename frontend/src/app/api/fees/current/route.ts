import { handle } from "@/server/errors";
import { feeBpsForVolume } from "@/server/fees";
import { platformVolumeCents } from "@/server/platform-volume";
import { ok } from "@/server/route-helpers";

export const runtime = "nodejs";

export async function GET() {
  return handle(async () => {
    const volume = await platformVolumeCents();
    const bps = feeBpsForVolume(volume);
    return ok({ fee_bps: bps, platform_volume_cents: volume });
  });
}
