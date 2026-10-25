package dev.neon.client;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.Font;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.screens.ChatScreen;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.gui.screens.inventory.AbstractSignEditScreen;
import net.minecraft.client.gui.screens.inventory.BookEditScreen;
import net.minecraft.client.gui.screens.inventory.BookViewScreen;
import net.minecraft.client.renderer.RenderPipelines;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.FontDescription;
import net.minecraft.network.chat.MutableComponent;
import net.minecraft.network.chat.Style;
import net.minecraft.resources.Identifier;
import net.minecraft.util.FormattedCharSequence;

/** Общий стиль Neon (1.21.11): цвета, шрифт Inter, фон, иконки */
public final class Ui {
    private Ui() {}

    // палитра: тёмный графит, белый текст, приглушённые подписи
    public static final int TEXT = 0xFFE6E8EE;
    public static final int TEXT_HOVER = 0xFFFFFFFF;
    public static final int MUTED = 0xFF8C91A0;
    public static final int FAINT = 0xFF5E6270;
    public static final int DISABLED = 0xFF5E6270;

    public static final FontDescription FONT = new FontDescription.Resource(id("ui"));
    public static final FontDescription FONT_BOLD = new FontDescription.Resource(id("ui_bold"));
    public static final FontDescription FONT_SMALL = new FontDescription.Resource(id("ui_small"));
    public static final Style STYLE = Style.EMPTY.withFont(FONT).withoutShadow();

    private static final int MAX_SCALE = 8;
    private static final FontDescription[][] SCALED = new FontDescription[3][MAX_SCALE + 1];
    static {
        String[] base = {"ui", "ui_bold", "ui_small"};
        for (int b = 0; b < 3; b++)
            for (int i = 1; i <= MAX_SCALE; i++) SCALED[b][i] = new FontDescription.Resource(id(base[b] + "_x" + i));
    }

    /**
     * Шрифт с растром ровно под текущий масштаб интерфейса: буква рисуется пиксель в пиксель,
     * без пережатия текстуры — поэтому края ровные на любом масштабе.
     */
    public static FontDescription scaled(FontDescription f) {
        int b = FONT.equals(f) ? 0 : FONT_BOLD.equals(f) ? 1 : FONT_SMALL.equals(f) ? 2 : -1;
        if (b < 0) return f;
        Minecraft mc = Minecraft.getInstance();
        int gs = mc != null && mc.getWindow() != null ? mc.getWindow().getGuiScale() : 4;
        int scale = Math.max(1, Math.min(MAX_SCALE, gs));
        return SCALED[b][scale];
    }

    public static final Identifier BACKGROUND = id("textures/gui/background.png");
    public static final Identifier LOGO = id("textures/gui/logo.png");
    public static final Identifier BUTTON = Identifier.withDefaultNamespace("widget/button");
    public static final Identifier BUTTON_HOVER = Identifier.withDefaultNamespace("widget/button_highlighted");
    public static final Identifier BUTTON_DISABLED = Identifier.withDefaultNamespace("widget/button_disabled");
    public static final Identifier PANEL = id("panel");
    public static final Identifier SELECTION = id("selection");

    private static final int BG_W = 1600, BG_H = 900;

    public static Identifier id(String path) {
        return Identifier.fromNamespaceAndPath("neonclient", path);
    }

    public static Identifier icon(String name) {
        return id("textures/gui/icons/" + name + ".png");
    }

    /** Текст шрифтом Inter без тени */
    public static MutableComponent text(String s) {
        return Component.literal(s).withStyle(st -> st.withFont(FONT).withoutShadow());
    }

    public static MutableComponent small(String s) {
        return Component.literal(s).withStyle(st -> st.withFont(FONT_SMALL).withoutShadow());
    }

    public static MutableComponent bold(String s) {
        return Component.literal(s).withStyle(st -> st.withFont(FONT_BOLD).withoutShadow());
    }

    /** Перевести чужой текст на шрифт Inter (если у него не задан свой шрифт) */
    public static Component style(Component c) {
        if (c == null) return null;
        if (!FontDescription.DEFAULT.equals(c.getStyle().getFont())) return c;
        return c.copy().withStyle(st -> st.withFont(FONT).withoutShadow());
    }

    // ---- весь текст экранов (не HUD) — шрифтом Inter ----

    private static int screenDepth, suspended;
    private static boolean inFrame;

    /** Экраны, где текст должен совпадать с миром/HUD: чат, таблички, книги — их не трогаем */
    public static boolean styled(Screen s) {
        return s != null && !(s instanceof ChatScreen) && !(s instanceof AbstractSignEditScreen)
                && !(s instanceof BookEditScreen) && !(s instanceof BookViewScreen);
    }

    public static boolean styledScreen() {
        return styled(Minecraft.getInstance().screen);
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

    /** Сейчас считается/рисуется текст экрана: при отрисовке экрана или вне кадра (ввод, вёрстка) при открытом экране */
    public static boolean inScreen() {
        if (suspended > 0) return false;
        if (screenDepth > 0) return true;
        return !inFrame && styledScreen();
    }

    public static boolean isDefault(Style st) {
        return FontDescription.DEFAULT.equals(st.getFont());
    }

    /** Текст со стандартным шрифтом переводим на Inter, остальные шрифты не трогаем */
    public static FormattedCharSequence wrap(FormattedCharSequence seq) {
        return sink -> seq.accept((i, st, cp) -> sink.accept(i, isDefault(st) ? st.withFont(FONT).withoutShadow() : st, cp));
    }

    public static int width(Font f, String s) {
        return f.width(FormattedCharSequence.forward(s, STYLE));
    }

    public static String head(Font f, String s, int w) {
        return f.getSplitter().plainHeadByWidth(s, w, STYLE);
    }

    public static String tail(Font f, String s, int w) {
        return f.getSplitter().plainTailByWidth(s, w, STYLE);
    }

    public static boolean russian() {
        String code = Minecraft.getInstance().options.languageCode;
        return code != null && (code.startsWith("ru") || code.startsWith("uk") || code.startsWith("be"));
    }

    public static String t(String ru, String en) {
        return russian() ? ru : en;
    }

    /** Фон меню: размытая тёмная картинка, заполняет экран, чуть смещается за мышью */
    public static void background(GuiGraphics g, int w, int h, int mouseX, int mouseY) {
        float scale = Math.max(w / (float) BG_W, h / (float) BG_H) * 1.04f;
        int dw = Math.round(BG_W * scale), dh = Math.round(BG_H * scale);
        float px = w > 0 ? (mouseX / (float) w - 0.5f) : 0;
        float py = h > 0 ? (mouseY / (float) h - 0.5f) : 0;
        int x = (w - dw) / 2 - Math.round(px * (dw - w) * 0.8f);
        int y = (h - dh) / 2 - Math.round(py * (dh - h) * 0.8f);
        g.fill(0, 0, w, h, 0xFF08090C);
        g.blit(RenderPipelines.GUI_TEXTURED, BACKGROUND, x, y, 0, 0, dw, dh, BG_W, BG_H, BG_W, BG_H);
    }

    public static void icon(GuiGraphics g, String name, int x, int y, int size, int color) {
        g.blit(RenderPipelines.GUI_TEXTURED, icon(name), x, y, 0, 0, size, size, 64, 64, 64, 64, color);
    }

    public static void logo(GuiGraphics g, int x, int y, int w) {
        int h = Math.round(w * 264f / 1040f);
        g.blit(RenderPipelines.GUI_TEXTURED, LOGO, x, y, 0, 0, w, h, 1040, 264, 1040, 264);
    }

    public static void panel(GuiGraphics g, int x, int y, int w, int h) {
        g.blitSprite(RenderPipelines.GUI_TEXTURED, PANEL, x, y, w, h);
    }
}
