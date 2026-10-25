package dev.neon.client;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.Font;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.components.Tooltip;
import net.minecraft.client.renderer.RenderPipelines;
import net.minecraft.network.chat.Component;

/**
 * Кнопка Neon: тёмное стекло со скруглением, иконка и текст по центру.
 * Если текста нет — это квадратная кнопка-иконка с подсказкой.
 */
public class NeonButton extends Button {
    private final String icon;
    private final boolean iconOnly;

    public NeonButton(int x, int y, int w, int h, Component text, String icon, OnPress onPress) {
        super(x, y, w, h, Ui.style(text), onPress, DEFAULT_NARRATION);
        this.icon = icon;
        this.iconOnly = false;
    }

    /** Квадратная кнопка-иконка; text — подсказка и озвучка */
    public static NeonButton icon(int x, int y, int size, String icon, Component text, OnPress onPress) {
        NeonButton b = new NeonButton(x, y, size, size, text, icon, onPress, true);
        b.setTooltip(Tooltip.create(Ui.style(text)));
        return b;
    }

    private NeonButton(int x, int y, int w, int h, Component text, String icon, OnPress onPress, boolean iconOnly) {
        super(x, y, w, h, Ui.style(text), onPress, DEFAULT_NARRATION);
        this.icon = icon;
        this.iconOnly = iconOnly;
    }

    @Override
    protected void renderContents(GuiGraphics g, int mouseX, int mouseY, float partial) {
        int x = getX(), y = getY(), w = getWidth(), h = getHeight();
        boolean hot = active && isHoveredOrFocused();
        g.blitSprite(RenderPipelines.GUI_TEXTURED, !active ? Ui.BUTTON_DISABLED : hot ? Ui.BUTTON_HOVER : Ui.BUTTON, x, y, w, h);
        int color = !active ? Ui.DISABLED : hot ? Ui.TEXT_HOVER : Ui.TEXT;
        int iconColor = !active ? Ui.DISABLED : hot ? Ui.TEXT_HOVER : 0xFFB9BDC9;

        if (iconOnly) {
            int s = Math.min(10, h - 8);
            Ui.icon(g, icon, x + (w - s) / 2, y + (h - s) / 2, s, iconColor);
            return;
        }
        Font font = Minecraft.getInstance().font;
        Component label = Ui.style(getMessage());
        int tw = font.width(label);
        int is = icon != null ? 9 : 0;
        int gap = icon != null ? 6 : 0;
        int sx = x + (w - (is + gap + tw)) / 2;
        if (icon != null) Ui.icon(g, icon, sx, y + (h - is) / 2, is, iconColor);
        g.drawString(font, label, sx + is + gap, y + (h - 8) / 2, color, false);
    }
}
