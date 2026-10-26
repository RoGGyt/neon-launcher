package dev.neon.client;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.gui.screens.multiplayer.JoinMultiplayerScreen;
import net.minecraft.client.gui.screens.options.OptionsScreen;
import net.minecraft.client.gui.screens.worldselection.SelectWorldScreen;

import java.io.File;
import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Consumer;
import java.util.function.Supplier;

/**
 * Только для CI: с -Dneon.tour=1 игра сама открывает экраны по очереди, снимает скриншоты
 * в run/screenshots и закрывается. Так интерфейс можно проверить без живого игрока.
 */
public final class NeonTour {
    private record Step(String name, Runnable action) {}

    private static final boolean ON = System.getProperty("neon.tour") != null;
    private static final List<Step> STEPS = new ArrayList<>();
    private static int index = -1;
    private static int wait = 0;
    private static int readyTicks = 0;

    private NeonTour() {}

    private static void open(String name, Supplier<Screen> screen) {
        STEPS.add(new Step(name, () -> Minecraft.getInstance().setScreen(screen.get())));
    }

    private static Screen reflect(String[] classes, Object... args) {
        for (String cn : classes) {
            try {
                Class<?> c = Class.forName(cn);
                for (var ctor : c.getConstructors()) {
                    if (ctor.getParameterCount() == args.length) return (Screen) ctor.newInstance(args);
                }
            } catch (Throwable ignored) {
            }
        }
        throw new IllegalStateException("no screen " + String.join(",", classes));
    }

    private static void scale(int s) {
        STEPS.add(new Step("scale" + s, () -> {
            Minecraft mc = Minecraft.getInstance();
            mc.options.guiScale().set(s);
            mc.resizeDisplay();
        }));
    }

    private static void build() {
        Minecraft mc = Minecraft.getInstance();
        Screen menu = new NeonMenu();
        open("title", NeonMenu::new);
        open("options", () -> new OptionsScreen(menu, mc.options));
        open("video", () -> reflect(new String[]{"net.minecraft.client.gui.screens.options.VideoSettingsScreen"}, menu, mc, mc.options));
        open("worlds", () -> new SelectWorldScreen(menu));
        open("multiplayer", () -> new JoinMultiplayerScreen(menu));
        open("language", () -> reflect(new String[]{"net.minecraft.client.gui.screens.options.LanguageSelectScreen"}, menu, mc.options, mc.getLanguageManager()));
        open("controls", () -> reflect(new String[]{"net.minecraft.client.gui.screens.options.controls.ControlsScreen"}, menu, mc.options));
        open("mods", () -> new NeonModsScreen(menu));
        scale(2);
        open("title_s2", NeonMenu::new);
        open("options_s2", () -> new OptionsScreen(menu, mc.options));
        scale(3);
        open("title_s3", NeonMenu::new);
        scale(0);
    }

    private static final boolean QP = "qp".equals(System.getProperty("neon.tour"));
    private static int qpTicks = 0;

    public static void tick(Minecraft mc) {
        if (!ON) return;
        // проверка быстрого входа в мир: ждём и снимаем то, что на экране
        if (QP) {
            if (mc.getOverlay() != null) return;
            qpTicks++;
            if (qpTicks == 200) System.out.println("[NeonTour] qp screen=" + (mc.screen == null ? "null (in world)" : mc.screen.getClass().getName()) + " level=" + (mc.level != null));
            if (qpTicks == 200) grab(mc, "quickplay");
            if (qpTicks >= 240) mc.stop();
            return;
        }
        if (index < 0) {
            // ждём, пока игра загрузится
            if (mc.getOverlay() != null || mc.screen == null) { readyTicks = 0; return; }
            if (++readyTicks < 80) return;
            build();
            index = 0;
            wait = 0;
        }
        if (index >= STEPS.size()) {
            System.out.println("[NeonTour] done");
            mc.stop();
            return;
        }
        Step step = STEPS.get(index);
        if (wait == 0) {
            System.out.println("[NeonTour] step " + step.name());
            try {
                step.action().run();
            } catch (Throwable t) {
                System.out.println("[NeonTour] step failed " + step.name() + ": " + t);
                index++;
                return;
            }
        }
        wait++;
        if (wait == 30 && !step.name().startsWith("scale")) {
            grab(mc, step.name());
        }
        if (wait >= 40) {
            index++;
            wait = 0;
        }
    }

    private static void grab(Minecraft mc, String name) {
        try {
            for (Method m : Class.forName("net.minecraft.client.Screenshot").getMethods()) {
                if (!m.getName().equals("grab")) continue;
                Class<?>[] p = m.getParameterTypes();
                boolean hasName = false;
                for (Class<?> t : p) if (t == String.class) hasName = true;
                if (!hasName) continue;
                Object[] args = new Object[p.length];
                for (int i = 0; i < p.length; i++) {
                    if (p[i] == File.class) args[i] = mc.gameDirectory;
                    else if (p[i] == String.class) args[i] = "neon_" + name + ".png";
                    else if (p[i] == int.class) args[i] = 1;
                    else if (p[i] == Consumer.class) args[i] = (Consumer<Object>) msg -> System.out.println("[NeonTour] saved " + name);
                    else args[i] = mc.getMainRenderTarget();
                }
                m.invoke(null, args);
                return;
            }
            System.out.println("[NeonTour] no Screenshot.grab");
        } catch (Throwable t) {
            System.out.println("[NeonTour] screenshot failed: " + t);
        }
    }
}
