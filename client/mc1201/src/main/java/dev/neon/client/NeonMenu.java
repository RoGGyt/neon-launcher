package dev.neon.client;

import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.Tooltip;
import net.minecraft.client.gui.screens.OptionsScreen;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.gui.screens.multiplayer.JoinMultiplayerScreen;
import net.minecraft.client.gui.screens.worldselection.SelectWorldScreen;
import net.minecraft.network.chat.Component;

/** Главное меню Neon (Minecraft 1.20.1) */
public class NeonMenu extends Screen {
    private final PlayerPreview player = new PlayerPreview();
    private int logoScale;
    private int logoY;
    private int px, py, pw, ph;
    private boolean showPlayer;
    private boolean dragging;

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

        ph = Math.min((int) (height * 0.62f), 260);
        pw = ph / 2;
        px = (int) (width * 0.68f) - pw / 2;
        py = (int) (height * 0.62f) - ph + ph / 12;
        showPlayer = px > left + bw + 20;
    }

    @Override
    public void render(GuiGraphics g, int mouseX, int mouseY, float partial) {
        NeonStyle.background(g, width, height);
        int left = Math.max(16, width / 14);
        g.fill(0, 0, left + 220, height, 0x40000000);

        if (showPlayer) {
            try {
                player.render(g, px, py, pw, ph);
            } catch (Throwable t) {
                showPlayer = false;
                System.out.println("[NeonClient] player preview disabled: " + t);
            }
        }

        super.render(g, mouseX, mouseY, partial);

        g.pose().pushPose();
        g.pose().translate(left, logoY, 0);
        g.pose().scale(logoScale, logoScale, 1);
        g.drawString(font, "NEON", 1, 1, NeonStyle.MAGENTA, false);
        g.drawString(font, "NEON", 0, 0, NeonStyle.CYAN, false);
        g.pose().popPose();
        g.drawString(font, "launcher", left + 2, logoY + 9 * logoScale + 4, NeonStyle.MUTE, false);

        String nick = minecraft.getUser().getName();
        String mc = FabricLoader.getInstance().getModContainer("minecraft")
                .map(c -> c.getMetadata().getVersion().getFriendlyString()).orElse("");
        g.drawString(font, nick, left, height - 28, NeonStyle.INK, true);
        g.drawString(font, "Neon Client  " + mc, left, height - 16, NeonStyle.MUTE, false);

        String copy = "Copyright Mojang AB. Do not distribute!";
        g.drawString(font, copy, width - font.width(copy) - 6, height - 12, 0x99FFFFFF, false);
    }

    // модель крутится, если тянуть мышкой
    @Override
    public boolean mouseClicked(double mx, double my, int button) {
        if (showPlayer && mx >= px && mx <= px + pw && my >= py && my <= py + ph) {
            dragging = true;
            return true;
        }
        return super.mouseClicked(mx, my, button);
    }

    @Override
    public boolean mouseReleased(double mx, double my, int button) {
        dragging = false;
        return super.mouseReleased(mx, my, button);
    }

    @Override
    public boolean mouseDragged(double mx, double my, int button, double dx, double dy) {
        if (dragging) {
            player.rotY += (float) dx * 2.5f;
            player.rotX = Math.max(-50f, Math.min(50f, player.rotX - (float) dy * 2.5f));
            return true;
        }
        return super.mouseDragged(mx, my, button, dx, dy);
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
