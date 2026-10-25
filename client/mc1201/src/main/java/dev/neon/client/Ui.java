package dev.neon.client;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.MutableComponent;
import net.minecraft.network.chat.Style;
import net.minecraft.resources.ResourceLocation;

/** Общий стиль Neon (1.20.1): цвета, шрифт Inter, фон, иконки */
public final class Ui {
    private Ui() {}

    public static final int TEXT = 0xFFE6E8EE;
    public static final int TEXT_HOVER = 0xFFFFFFFF;
    public static final int MUTED = 0xFF8C91A0;
    public static final int FAINT = 0xFF5E6270;
    public static final int DISABLED = 0xFF5E6270;

    public static final ResourceLocation FONT = id("ui");
    public static final ResourceLocation FONT_BOLD = id("ui_bold");
    public static final ResourceLocation BACKGROUND = id("textures/gui/background.png");
    public static final ResourceLocation LOGO = id("textures/gui/logo.png");
    /** кнопки в той же раскладке, что widgets.png: v=46 выключена, 66 обычная, 86 под мышью; панель 32x32 на v=112 */
    public static final ResourceLocation WIDGETS = id("textures/gui/widgets.png");

    private static final int BG_W = 1600, BG_H = 900;

    public static ResourceLocation id(String path) {
        return new ResourceLocation("neonclient", path);
    }

    public static MutableComponent text(String s) {
        return Component.literal(s).withStyle(st -> st.withFont(FONT));
    }

    public static MutableComponent bold(String s) {
        return Component.literal(s).withStyle(st -> st.withFont(FONT_BOLD));
    }

    public static Component style(Component c) {
        if (c == null) return null;
        if (!Style.DEFAULT_FONT.equals(c.getStyle().getFont())) return c;
        return c.copy().withStyle(st -> st.withFont(FONT));
    }

    public static boolean ours(Component c) {
        if (c == null) return false;
        ResourceLocation f = c.getStyle().getFont();
        return FONT.equals(f) || FONT_BOLD.equals(f);
    }

    public static boolean russian() {
        String code = Minecraft.getInstance().options.languageCode;
        return code != null && (code.startsWith("ru") || code.startsWith("uk") || code.startsWith("be"));
    }

    public static String t(String ru, String en) {
        return russian() ? ru : en;
    }

    public static void background(GuiGraphics g, int w, int h, int mouseX, int mouseY) {
        float scale = Math.max(w / (float) BG_W, h / (float) BG_H) * 1.04f;
        int dw = Math.round(BG_W * scale), dh = Math.round(BG_H * scale);
        float px = w > 0 ? (mouseX / (float) w - 0.5f) : 0;
        float py = h > 0 ? (mouseY / (float) h - 0.5f) : 0;
        int x = (w - dw) / 2 - Math.round(px * (dw - w) * 0.8f);
        int y = (h - dh) / 2 - Math.round(py * (dh - h) * 0.8f);
        g.fill(0, 0, w, h, 0xFF08090C);
        g.blit(BACKGROUND, x, y, dw, dh, 0, 0, BG_W, BG_H, BG_W, BG_H);
    }

    public static void icon(GuiGraphics g, String name, int x, int y, int size, int color) {
        float a = ((color >>> 24) & 255) / 255f, r = ((color >> 16) & 255) / 255f, gr = ((color >> 8) & 255) / 255f, b = (color & 255) / 255f;
        com.mojang.blaze3d.systems.RenderSystem.enableBlend();
        g.setColor(r, gr, b, a);
        g.blit(id("textures/gui/icons/" + name + ".png"), x, y, size, size, 0, 0, 64, 64, 64, 64);
        g.setColor(1, 1, 1, 1);
    }

    public static void logo(GuiGraphics g, int x, int y, int w) {
        int h = Math.round(w * 264f / 1040f);
        com.mojang.blaze3d.systems.RenderSystem.enableBlend();
        g.blit(LOGO, x, y, w, h, 0, 0, 1040, 264, 1040, 264);
    }

    /** Кнопка-подложка тех же текстур, что у всех кнопок игры */
    public static void button(GuiGraphics g, int x, int y, int w, int h, boolean active, boolean hot) {
        com.mojang.blaze3d.systems.RenderSystem.enableBlend();
        g.blitNineSliced(WIDGETS, x, y, w, h, 20, 4, 200, 20, 0, !active ? 46 : hot ? 86 : 66);
    }

    public static void panel(GuiGraphics g, int x, int y, int w, int h) {
        com.mojang.blaze3d.systems.RenderSystem.enableBlend();
        g.blitNineSliced(WIDGETS, x, y, w, h, 5, 5, 32, 32, 0, 112);
    }
}
