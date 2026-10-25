package dev.neon.client;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;

/** Отрисовка неонового фона: закатное небо, полосатое солнце и бегущая сетка-пол */
public final class NeonStyle {
    public static final int CYAN = 0xFF00F0FF;
    public static final int MAGENTA = 0xFFFF2BD6;
    public static final int INK = 0xFFEEF0FF;
    public static final int MUTE = 0xFF8C91B8;

    private static final int[] STARS = new int[90];

    static {
        long seed = 1337;
        for (int i = 0; i < STARS.length; i++) {
            seed = seed * 6364136223846793005L + 1442695040888963407L;
            STARS[i] = (int) (seed >>> 33);
        }
    }

    private NeonStyle() {}

    public static boolean russian() {
        String code = Minecraft.getInstance().options.languageCode;
        return code != null && (code.startsWith("ru") || code.startsWith("uk") || code.startsWith("be"));
    }

    public static String t(String ru, String en) {
        return russian() ? ru : en;
    }

    public static int alpha(int rgb, int a) {
        return (Math.max(0, Math.min(255, a)) << 24) | (rgb & 0xFFFFFF);
    }

    public static void background(GuiGraphics g, int w, int h) {
        long now = System.currentTimeMillis();
        int horizon = (int) (h * 0.62f);

        // небо
        g.fillGradient(0, 0, w, horizon, 0xFF070820, 0xFF2A0E3F);
        // звёзды
        for (int i = 0; i < STARS.length; i += 2) {
            int x = Math.floorMod(STARS[i], Math.max(1, w));
            int y = Math.floorMod(STARS[i + 1], Math.max(1, horizon - 20));
            double tw = Math.sin(now / 700.0 + i) * 0.5 + 0.5;
            g.fill(x, y, x + 1, y + 1, alpha(0xFFFFFF, (int) (60 + tw * 140)));
        }

        // полосатое солнце
        int cx = (int) (w * 0.68f);
        int r = Math.max(28, Math.min(w, h) / 6);
        int sunBottom = horizon;
        for (int dy = -r; dy < 0; dy++) {
            int y = sunBottom + dy;
            float k = (float) (dy + r) / r; // 0 сверху, 1 у горизонта
            // чем ниже, тем чаще прорези
            if (k > 0.45f) {
                int period = Math.max(3, (int) (9 - k * 6));
                if (Math.floorMod(y + (int) (now / 120), period) == 0) continue;
            }
            int half = (int) Math.sqrt(Math.max(0, r * r - dy * dy));
            int col = lerpColor(0xFFFFE06E, 0xFFFF2BD6, k);
            g.fill(cx - half, y, cx + half, y + 1, col);
        }
        // дымка у горизонта
        g.fillGradient(0, horizon - 50, w, horizon, 0x00FF2BD6, 0x55FF2BD6);

        // пол
        g.fillGradient(0, horizon, w, h, 0xFF14082A, 0xFF05060F);
        g.fill(0, horizon, w, horizon + 1, alpha(0xFF2BD6, 220));

        // горизонтальные линии бегут к зрителю
        float phase = (now % 2400L) / 2400f;
        int lines = 14;
        for (int i = 0; i < lines; i++) {
            float t = (i + phase) / lines;
            int y = horizon + (int) ((h - horizon) * t * t);
            int a = (int) (40 + t * 170);
            g.fill(0, y, w, y + 1, alpha(0x00F0FF, a));
        }
        // линии, сходящиеся к центру горизонта (лесенкой из маленьких отрезков)
        int vx = w / 2;
        int rays = 22;
        for (int k = -rays / 2; k <= rays / 2; k++) {
            float spread = k * (w / (float) rays) * 2.4f;
            for (int y = horizon + 1; y < h; y += 2) {
                float t = (y - horizon) / (float) (h - horizon);
                int x = vx + (int) (spread * t);
                if (x < -2 || x > w + 2) continue;
                g.fill(x, y, x + 1, y + 2, alpha(0x00F0FF, (int) (30 + t * 150)));
            }
        }
    }

    private static int lerpColor(int a, int b, float t) {
        int ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
        int br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
        int r = (int) (ar + (br - ar) * t), gg = (int) (ag + (bg - ag) * t), bl = (int) (ab + (bb - ab) * t);
        return 0xFF000000 | (r << 16) | (gg << 8) | bl;
    }
}
