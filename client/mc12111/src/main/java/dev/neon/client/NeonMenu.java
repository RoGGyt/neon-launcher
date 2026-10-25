package dev.neon.client;

import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.PlayerSkinWidget;
import net.minecraft.client.gui.components.Tooltip;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.gui.screens.multiplayer.JoinMultiplayerScreen;
import net.minecraft.client.gui.screens.options.OptionsScreen;
import net.minecraft.client.gui.screens.worldselection.SelectWorldScreen;
import net.minecraft.network.chat.Component;

/** Главное меню Neon (Minecraft 1.21.11) */
public class NeonMenu extends Screen {
    private int logoScale;
    private int logoY;

    public NeonMenu() {
        super(Component.literal("Neon"));
    }

    @Override
    protected void init() {
        boolean small = height < 320;
        logoScale = small ? 3 : 5;
        logoY = small ? 18 : 34;
        int left = Math.max(16, width / 14);
        int bw = Math.min(200, Math.max(150, width / 4));
        int bh = small ? 18 : 22;
        int gap = small ? 4 : 6;
        int y = logoY + 9 * logoScale + (small ? 22 : 34);

        addRenderableWidget(new NeonButton(left, y, bw, bh, Component.translatable("menu.singleplayer"),
                b -> minecraft.setScreen(new SelectWorldScreen(this))));
        y += bh + gap;
        addRenderableWidget(new NeonButton(left, y, bw, bh, Component.translatable("menu.multiplayer"),
                b -> minecraft.setScreen(new JoinMultiplayerScreen(this))));
        y += bh + gap;
        addRenderableWidget(new NeonButton(left, y, bw, bh, Component.literal(NeonStyle.t("Моды", "Mods")),
                b -> minecraft.setScreen(new NeonModsScreen(this))));
        y += bh + gap;
        NeonButton shaders = addRenderableWidget(new NeonButton(left, y, bw, bh, Component.literal(NeonStyle.t("Шейдеры", "Shaders")),
                b -> { Screen s = Shaders.screen(this); if (s != null) minecraft.setScreen(s); }));
        if (!Shaders.available()) {
            shaders.active = false;
            shaders.setTooltip(Tooltip.create(Component.literal(NeonStyle.t(
                    "Шейдеры работают через Iris — поставь любой шейдер во вкладке «Шейдеры» в лаунчере",
                    "Shaders need Iris — install a shader pack from the launcher"))));
        }
        y += bh + gap;
        addRenderableWidget(new NeonButton(left, y, bw, bh, Component.translatable("menu.options"),
                b -> minecraft.setScreen(new OptionsScreen(this, minecraft.options))));
        y += bh + gap;
        addRenderableWidget(new NeonButton(left, y, bw, bh, Component.translatable("menu.quit"),
                b -> minecraft.stop()));

        // модель игрока со скином, крутится мышкой
        int ph = Math.min((int) (height * 0.62f), 260);
        int pw = ph / 2;
        int px = (int) (width * 0.68f) - pw / 2;
        int py = (int) (height * 0.62f) - ph + ph / 12;
        if (px > left + bw + 20) {
            PlayerSkinWidget player = new PlayerSkinWidget(pw, ph, minecraft.getEntityModels(),
                    minecraft.getSkinManager().createLookup(minecraft.getGameProfile(), false));
            player.setPosition(px, py);
            addRenderableWidget(player);
        }
    }

    @Override
    public void renderBackground(GuiGraphics g, int mouseX, int mouseY, float partial) {
        NeonStyle.background(g, width, height);
        // лёгкое затемнение слева, чтобы кнопки читались
        g.fill(0, 0, Math.max(16, width / 14) + 220, height, 0x40000000);
    }

    @Override
    public void render(GuiGraphics g, int mouseX, int mouseY, float partial) {
        super.render(g, mouseX, mouseY, partial);
        int left = Math.max(16, width / 14);

        // логотип NEON: пурпурная «тень» со сдвигом и бирюзовый текст поверх
        g.pose().pushMatrix();
        g.pose().translate(left, logoY);
        g.pose().scale(logoScale, logoScale);
        g.drawString(font, "NEON", 1, 1, NeonStyle.MAGENTA, false);
        g.drawString(font, "NEON", 0, 0, NeonStyle.CYAN, false);
        g.pose().popMatrix();
        g.drawString(font, "launcher", left + 2, logoY + 9 * logoScale + 4, NeonStyle.MUTE, false);

        // ник и версия внизу слева
        String nick = minecraft.getUser().getName();
        String mc = FabricLoader.getInstance().getModContainer("minecraft")
                .map(c -> c.getMetadata().getVersion().getFriendlyString()).orElse("");
        g.drawString(font, nick, left, height - 28, NeonStyle.INK, true);
        g.drawString(font, "Neon Client  " + mc, left, height - 16, NeonStyle.MUTE, false);

        String copy = "Copyright Mojang AB. Do not distribute!";
        g.drawString(font, copy, width - font.width(copy) - 6, height - 12, 0x99FFFFFF, false);
    }

    @Override
    public boolean shouldCloseOnEsc() {
        return false;
    }

    @Override
    public boolean isPauseScreen() {
        return false;
    }
}
