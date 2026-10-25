package dev.neon.client;

import net.fabricmc.loader.api.FabricLoader;
import net.fabricmc.loader.api.ModContainer;
import net.fabricmc.loader.api.metadata.ModMetadata;
import net.fabricmc.loader.api.metadata.ModOrigin;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;
import net.minecraft.util.Mth;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

/** Список модов из папки mods: имя, версия, описание; прокрутка колесом */
public class NeonModsScreen extends Screen {
    private static final int ROW_H = 30, ROW_GAP = 4;
    private final Screen parent;
    private final List<ModMetadata> mods = new ArrayList<>();
    private double scroll;
    private int top, bottom, rowW, rowX;

    public NeonModsScreen(Screen parent) {
        super(Ui.text(Ui.t("Моды", "Mods")));
        this.parent = parent;
        Path modsDir = FabricLoader.getInstance().getGameDir().resolve("mods").toAbsolutePath().normalize();
        for (ModContainer c : FabricLoader.getInstance().getAllMods()) {
            try {
                ModOrigin o = c.getOrigin();
                if (o.getKind() != ModOrigin.Kind.PATH) continue;
                boolean inMods = o.getPaths().stream().anyMatch(p -> p.toAbsolutePath().normalize().startsWith(modsDir));
                if (inMods) mods.add(c.getMetadata());
            } catch (Throwable ignored) {
            }
        }
        mods.sort(Comparator.comparing(m -> m.getName().toLowerCase()));
    }

    @Override
    protected void init() {
        rowW = Math.min(360, width - 40);
        rowX = (width - rowW) / 2;
        top = 44;
        bottom = height - 44;
        addRenderableWidget(new NeonButton(width / 2 - 60, height - 32, 120, 20, Component.translatable("gui.back"), "back", b -> onClose()));
    }

    private int contentHeight() {
        return mods.size() * (ROW_H + ROW_GAP) - ROW_GAP;
    }

    @Override
    public boolean mouseScrolled(double mx, double my, double sx, double sy) {
        int max = Math.max(0, contentHeight() - (bottom - top));
        scroll = Mth.clamp(scroll - sy * 20, 0, max);
        return true;
    }

    @Override
    public void renderBackground(GuiGraphics g, int mouseX, int mouseY, float partial) {
        Ui.background(g, width, height, mouseX, mouseY);
        g.fill(0, 0, width, height, 0x66000000);
    }

    @Override
    public void render(GuiGraphics g, int mouseX, int mouseY, float partial) {
        super.render(g, mouseX, mouseY, partial);
        Component head = Ui.bold(Ui.t("Моды", "Mods"));
        Component count = Ui.text(String.valueOf(mods.size()));
        int hw = font.width(head) + 6 + font.width(count);
        g.drawString(font, head, (width - hw) / 2, 18, Ui.TEXT, false);
        g.drawString(font, count, (width - hw) / 2 + font.width(head) + 6, 18, Ui.FAINT, false);

        if (mods.isEmpty()) {
            Component empty = Ui.text(Ui.t("В папке mods пусто. Моды ставятся в лаунчере, во вкладке «Моды».",
                    "No mods yet. Install them in the launcher."));
            g.drawString(font, empty, (width - font.width(empty)) / 2, height / 2 - 4, Ui.MUTED, false);
            return;
        }

        g.enableScissor(0, top, width, bottom);
        int y = top - (int) scroll;
        for (ModMetadata m : mods) {
            if (y + ROW_H >= top && y <= bottom) {
                Ui.panel(g, rowX, y, rowW, ROW_H);
                Component name = Ui.text(m.getName());
                String ver = m.getVersion().getFriendlyString();
                if (ver.length() > 22) ver = ver.substring(0, 22) + "…";
                Component v = Ui.text(ver);
                g.drawString(font, name, rowX + 10, y + 6, Ui.TEXT, false);
                g.drawString(font, v, rowX + rowW - 10 - font.width(v), y + 6, Ui.FAINT, false);
                String desc = m.getDescription().replace('\n', ' ');
                Component d = Ui.text(font.plainSubstrByWidth(desc, rowW - 20));
                g.drawString(font, d, rowX + 10, y + 17, Ui.MUTED, false);
            }
            y += ROW_H + ROW_GAP;
        }
        g.disableScissor();

        int max = contentHeight() - (bottom - top);
        if (max > 0) {
            int trackH = bottom - top;
            int thumb = Math.max(16, trackH * trackH / contentHeight());
            int ty = top + (int) ((trackH - thumb) * (scroll / max));
            g.fill(rowX + rowW + 6, ty, rowX + rowW + 8, ty + thumb, 0x55FFFFFF);
        }
    }

    @Override
    public void onClose() {
        minecraft.setScreen(parent);
    }
}
