package dev.neon.client;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.screens.ChatScreen;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.gui.screens.inventory.AbstractSignEditScreen;
import net.minecraft.client.gui.screens.inventory.BookEditScreen;
import net.minecraft.client.gui.screens.inventory.BookViewScreen;
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

    private static final int MAX_SCALE = 8;
    private static final ResourceLocation[][] SCALED = new ResourceLocation[2][MAX_SCALE + 1];
    static {
        for (int i = 1; i <= MAX_SCALE; i++) {
            SCALED[0][i] = id("ui_x" + i);
            SCALED[1][i] = id("ui_bold_x" + i);
        }
    }

    /** Шрифт с растром ровно под текущий масштаб интерфейса — буквы пиксель в пиксель, края ровные */
    public static ResourceLocation scaled(ResourceLocation f) {
        int b = FONT.equals(f) ? 0 : FONT_BOLD.equals(f) ? 1 : -1;
        if (b < 0) return f;
        Minecraft mc = Minecraft.getInstance();
        double gs = mc != null && mc.getWindow() != null ? mc.getWindow().getGuiScale() : 4;
        int scale = (int) Math.max(1, Math.min(MAX_SCALE, Math.round(gs)));
        return SCALED[b][scale];
    }
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

    // ---- весь текст экранов (не HUD и не мир) — шрифтом Inter ----
    // Пока открыт экран, шрифт по умолчанию подменяется на Inter: при отрисовке экрана и при обработке
    // ввода/вёрстке (вне кадра). HUD, мир, тосты и цифры предметов остаются ванильными.

    private static int screenDepth, suspended;
    private static boolean inFrame;

    public static boolean styled(Screen s) {
        return s != null && !(s instanceof ChatScreen) && !(s instanceof AbstractSignEditScreen)
                && !(s instanceof BookEditScreen) && !(s instanceof BookViewScreen);
    }

    public static void enterScreen(Screen s) {
        if (styled(s)) screenDepth++;
    }

    public static void exitScreen(Screen s) {
        if (styled(s) && screenDepth > 0) screenDepth--;
    }

    public static void frame(boolean on) {
        inFrame = on;
        if (!on) screenDepth = 0;
    }

    public static void suspend(boolean on) {
        suspended += on ? 1 : (suspended > 0 ? -1 : 0);
    }

    public static boolean inScreen() {
        if (suspended > 0) return false;
        if (screenDepth > 0) return true;
        return !inFrame && styled(Minecraft.getInstance().screen);
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

    public static void selection(GuiGraphics g, int x, int y, int w, int h) {
        com.mojang.blaze3d.systems.RenderSystem.enableBlend();
        g.blitNineSliced(WIDGETS, x, y, w, h, 5, 5, 32, 32, 40, 112);
    }

    public static void panel(GuiGraphics g, int x, int y, int w, int h) {
        com.mojang.blaze3d.systems.RenderSystem.enableBlend();
        g.blitNineSliced(WIDGETS, x, y, w, h, 5, 5, 32, 32, 0, 112);
    }
}
