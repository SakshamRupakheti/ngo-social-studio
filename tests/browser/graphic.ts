import type { Page } from "@playwright/test";
/** Original synthetic campaign artwork for screenshots of the live composer. */
export async function gardenGraphic(page: Page) {
  const encoded = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 900;
    canvas.height = 650;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas unavailable");
    ctx.fillStyle = "#d5df8b";
    ctx.fillRect(0, 0, 900, 650);
    ctx.fillStyle = "#263d30";
    ctx.font = "600 19px Arial";
    ctx.fillText("COMMUNITY GARDEN", 48, 62);
    ctx.fillRect(48, 80, 804, 2);
    ctx.font = "86px Georgia";
    ctx.fillText("Volunteer", 48, 236);
    ctx.fillText("garden day", 48, 328);
    ctx.font = "25px Georgia";
    ctx.fillText("Planting and tending together", 52, 405);
    ctx.lineWidth = 5;
    ctx.strokeStyle = "#263d30";
    ctx.beginPath();
    ctx.moveTo(610, 545);
    ctx.quadraticCurveTo(713, 358, 785, 149);
    ctx.stroke();
    for (let i = 0; i < 6; i++) {
      const x = 639 + i * 24,
        y = 482 - i * 60;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x + side * 97, y - 9, x + side * 92, y - 81);
        ctx.quadraticCurveTo(x + side * 20, y - 75, x, y);
        ctx.fill();
      }
    }
    ctx.fillRect(48, 553, 804, 2);
    ctx.font = "20px Arial";
    ctx.fillText("Volunteer field notes", 48, 602);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  return {
    name: "garden-day.png",
    mimeType: "image/png",
    buffer: Buffer.from(encoded, "base64"),
  };
}
