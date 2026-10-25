package dev.neon.client;

import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.client.gui.screens.Screen;

/** Экран выбора шейдеров Iris (или Oculus) — через рефлексию, чтобы не зависеть от Iris при сборке */
public final class Shaders {
    private static final String[] CLASSES = {
            "net.irisshaders.iris.gui.screen.ShaderPackScreen",
            "net.coderbot.iris.gui.screen.ShaderPackScreen",
    };

    private Shaders() {}

    public static boolean available() {
        FabricLoader fl = FabricLoader.getInstance();
        return (fl.isModLoaded("iris") || fl.isModLoaded("oculus")) && find() != null;
    }

    private static Class<?> find() {
        for (String name : CLASSES) {
            try {
                return Class.forName(name);
            } catch (Throwable ignored) {
            }
        }
        return null;
    }

    public static Screen screen(Screen parent) {
        Class<?> c = find();
        if (c == null) return null;
        try {
            return (Screen) c.getConstructor(Screen.class).newInstance(parent);
        } catch (Throwable t) {
            System.out.println("[NeonClient] cannot open Iris screen: " + t);
            return null;
        }
    }
}
