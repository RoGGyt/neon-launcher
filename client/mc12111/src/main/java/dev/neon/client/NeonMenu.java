package dev.neon.client;

import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.PlayerFaceRenderer;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.gui.screens.multiplayer.JoinMultiplayerScreen;
import net.minecraft.client.gui.screens.options.LanguageSelectScreen;
import net.minecraft.client.gui.screens.options.OptionsScreen;
import net.minecraft.client.gui.screens.packs.PackSelectionScreen;
import net.minecraft.client.gui.screens.worldselection.SelectWorldScreen;
import net.minecraft.network.chat.Component;
import net.minecraft.world.entity.player.PlayerSkin;

import java.util.function.Supplier;

/** Главное меню Neon (Minecraft 1.21.11): минимализм в тёмных тонах */
public class NeonMenu extends Screen {
    private Supplier<PlayerSkin> skin;
    private int logoW, logoY;
    private String version = "";

    public NeonMenu() {
        super(Component.literal("Neon"));
    }

    @Override
    protected void init() {
        if (skin == null) {
            try {
                skin = minecraft.getSkinManager().createLookup(minecraft.getGameProfile(), false);
            } catch (Throwable ignored) {
            }
        }
        version = FabricLoader.getInstance().getModContainer("minecraft")
                .map(c -> c.getMetadata().getVersion().getFriendlyString()).orElse("");

        int cx = width / 2;
        int bw = 150, bh = 20, gap = 4;
        logoW = Math.min(112, width / 4);
        int logoH = Math.round(logoW * 264f / 1040f);
        int block = logoH + 26 + 3 * bh + 2 * gap;
        logoY = Math.max(24, (height - block) / 2 - 12);
        int y = logoY + logoH + 26;

        addRenderableWidget(new NeonButton(cx - bw / 2, y, bw, bh, Component.translatable("menu.singleplayer"), "user",
                b -> minecraft.setScreen(new SelectWorldScreen(this))));
        y += bh + gap;
        addRenderableWidget(new NeonButton(cx - bw / 2, y, bw, bh, Component.translatable("menu.multiplayer"), "users",
                b -> minecraft.setScreen(new JoinMultiplayerScreen(this))));
        y += bh + gap;
        addRenderableWidget(new NeonButton(cx - bw / 2, y, bw, bh, Ui.text(Ui.t("Моды", "Mods")), "puzzle",
                b -> minecraft.setScreen(new NeonModsScreen(this))));

        // нижняя панель: квадратные кнопки-иконки
        int s = 20, n = 5;
        int bx = cx - (n * s + (n - 1) * gap) / 2;
        int by = height - s - 14;
        addRenderableWidget(NeonButton.icon(bx, by, s, "settings", Component.translatable("menu.options"),
                b -> minecraft.setScreen(new OptionsScreen(this, minecraft.options))));
        bx += s + gap;
        NeonButton shaders = addRenderableWidget(NeonButton.icon(bx, by, s, "sun", Ui.text(Ui.t("Шейдеры", "Shaders")),
                b -> { Screen sc = Shaders.screen(this); if (sc != null) minecraft.setScreen(sc); }));
        if (!Shaders.available()) {
            shaders.active = false;
            shaders.setTooltip(net.minecraft.client.gui.components.Tooltip.create(Ui.text(Ui.t(
                    "Шейдеры работают через Iris: поставь шейдер в лаунчере, во вкладке «Шейдеры»",
                    "Shaders need Iris: install a shader pack in the launcher"))));
        }
        bx += s + gap;
        addRenderableWidget(NeonButton.icon(bx, by, s, "layers", Component.translatable("options.resourcepack"),
                b -> minecraft.setScreen(new PackSelectionScreen(minecraft.getResourcePackRepository(), repo -> {
                    minecraft.options.updateResourcePacks(repo);
                    minecraft.setScreen(this);
                }, minecraft.getResourcePackDirectory(), Component.translatable("resourcePack.title")))));
        bx += s + gap;
        addRenderableWidget(NeonButton.icon(bx, by, s, "globe", Component.translatable("options.language"),
                b -> minecraft.setScreen(new LanguageSelectScreen(this, minecraft.options, minecraft.getLanguageManager()))));
        bx += s + gap;
        addRenderableWidget(NeonButton.icon(bx, by, s, "power", Component.translatable("menu.quit"),
                b -> minecraft.stop()));
    }

    @Override
    public void renderBackground(GuiGraphics g, int mouseX, int mouseY, float partial) {
        Ui.background(g, width, height, mouseX, mouseY);
    }

    @Override
    public void render(GuiGraphics g, int mouseX, int mouseY, float partial) {
        super.render(g, mouseX, mouseY, partial);

        Ui.logo(g, (width - logoW) / 2, logoY, logoW);

        // аккаунт в левом верхнем углу
        String nick = minecraft.getUser().getName();
        Component name = Ui.text(nick);
        int pw = 8 + 12 + 6 + font.width(name) + 9;
        Ui.panel(g, 8, 8, pw, 22);
        if (skin != null) {
            try {
                PlayerFaceRenderer.draw(g, skin.get(), 13, 13, 12);
            } catch (Throwable ignored) {
            }
        }
        g.drawString(font, name, 13 + 12 + 6, 15, Ui.TEXT, false);

        // подписи внизу
        g.drawString(font, Ui.text("Neon Client · " + version), 10, height - 16, Ui.FAINT, false);
        Component legal = Ui.text(Ui.t("Не связан с Mojang и Microsoft", "Not affiliated with Mojang or Microsoft"));
        g.drawString(font, legal, width - 10 - font.width(legal), height - 16, Ui.FAINT, false);
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
