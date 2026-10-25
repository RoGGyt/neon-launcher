package dev.neon.client;

import net.fabricmc.loader.api.FabricLoader;
import net.fabricmc.loader.api.ModContainer;
import net.fabricmc.loader.api.metadata.ModMetadata;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;

import java.util.Comparator;
import java.util.List;
import java.util.Set;

/** Список установленных модов (по страницам, без прокрутки) */
public class NeonModsScreen extends Screen {
    private static final Set<String> HIDDEN = Set.of("minecraft", "java", "fabricloader", "neonclient", "mixinextras", "neon-autohost");
    private final Screen parent;
    private final List<ModMetadata> mods;
    private int page;
    private int perPage = 8;

    public NeonModsScreen(Screen parent) {
        super(Component.literal("Mods"));
        this.parent = parent;
        this.mods = FabricLoader.getInstance().getAllMods().stream()
                .map(ModContainer::getMetadata)
                .filter(m -> !HIDDEN.contains(m.getId()) && !m.getId().startsWith("fabric-") && m.getType() != null && !"builtin".equals(m.getType()))
                .filter(m -> FabricLoader.getInstance().getModContainer(m.getId()).map(c -> c.getContainingMod().isEmpty()).orElse(true))
                .sorted(Comparator.comparing(m -> m.getName().toLowerCase()))
                .toList();
    }

    private int pages() {
        return Math.max(1, (mods.size() + perPage - 1) / perPage);
    }

    @Override
    protected void init() {
        perPage = Math.max(3, (height - 120) / 26);
        page = Math.min(page, pages() - 1);
        int bw = 100, y = height - 34, cx = width / 2;
        NeonButton prev = addRenderableWidget(new NeonButton(cx - bw - 60, y, 50, 20, Component.literal("<"), b -> { page--; rebuildWidgets(); }));
        addRenderableWidget(new NeonButton(cx - bw / 2, y, bw, 20, Component.translatable("gui.back"), b -> onClose()));
        NeonButton next = addRenderableWidget(new NeonButton(cx + bw / 2 + 10, y, 50, 20, Component.literal(">"), b -> { page++; rebuildWidgets(); }));
        prev.active = page > 0;
        next.active = page < pages() - 1;
    }

    @Override
    public void renderBackground(GuiGraphics g, int mouseX, int mouseY, float partial) {
        NeonStyle.background(g, width, height);
        g.fill(0, 0, width, height, 0x99000000);
    }

    @Override
    public void render(GuiGraphics g, int mouseX, int mouseY, float partial) {
        super.render(g, mouseX, mouseY, partial);
        String title = NeonStyle.t("Моды", "Mods") + "  " + mods.size();
        g.drawCenteredString(font, title, width / 2, 20, NeonStyle.CYAN);
        if (mods.isEmpty()) {
            g.drawCenteredString(font, NeonStyle.t("Модов нет. Их можно поставить в лаунчере во вкладке «Моды».",
                    "No mods yet. Install them in the launcher."), width / 2, height / 2, NeonStyle.MUTE);
            return;
        }
        int rowW = Math.min(420, width - 40);
        int x = (width - rowW) / 2;
        int y = 46;
        int from = page * perPage;
        for (int i = from; i < Math.min(mods.size(), from + perPage); i++) {
            ModMetadata m = mods.get(i);
            g.fill(x, y, x + rowW, y + 22, 0xB00B0D1F);
            g.renderOutline(x, y, rowW, 22, 0x55828FFF);
            g.drawString(font, m.getName(), x + 10, y + 7, NeonStyle.INK, false);
            String ver = m.getVersion().getFriendlyString();
            if (ver.length() > 24) ver = ver.substring(0, 24) + "…";
            g.drawString(font, ver, x + rowW - 10 - font.width(ver), y + 7, NeonStyle.MUTE, false);
            y += 26;
        }
        g.drawCenteredString(font, (page + 1) + " / " + pages(), width / 2, height - 48, NeonStyle.MUTE);
    }

    @Override
    public void onClose() {
        minecraft.setScreen(parent);
    }
}
