package dev.neon.client;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.Button;
import net.minecraft.network.chat.Component;

/** Кнопка в неоновом стиле: тёмная плашка, при наведении — бирюзовая подсветка и полоска слева */
public class NeonButton extends Button {
    public NeonButton(int x, int y, int w, int h, Component text, OnPress onPress) {
        super(x, y, w, h, text, onPress, DEFAULT_NARRATION);
    }

    @Override
    protected void renderContents(GuiGraphics g, int mouseX, int mouseY, float partial) {
        int x = getX(), y = getY(), w = getWidth(), h = getHeight();
        boolean hot = active && isHoveredOrFocused();
        g.fill(x, y, x + w, y + h, hot ? 0xD0101A3A : 0xB00B0D1F);
        g.renderOutline(x, y, w, h, hot ? NeonStyle.CYAN : 0x55828FFF);
        if (hot) g.fill(x, y, x + 2, y + h, NeonStyle.CYAN);
        int color = !active ? 0xFF5D6290 : hot ? 0xFFFFFFFF : 0xFFC5C9EC;
        var font = Minecraft.getInstance().font;
        g.drawString(font, getMessage(), x + 12, y + (h - font.lineHeight) / 2 + 1, color, false);
    }
}
