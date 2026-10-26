package dev.neon.client;

import net.fabricmc.loader.api.FabricLoader;

import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;
import java.text.Normalizer;
import java.util.ArrayList;
import java.util.List;

/**
 * Лаунчер открывает облачный мир сразу при запуске (--quickPlaySingleplayer <папка>).
 * На Windows имя папки в командной строке может испортиться (кириллица превращается в «?»,
 * пробелы и регистр букв) — тогда игра пишет «Could not find world with the provided identifier».
 * Здесь ищем папку мира по-умному: точное имя, без учёта регистра/пробелов, с «?» как любой буквой,
 * а если мир в профиле один — берём его.
 */
public final class QuickPlayWorld {
    private QuickPlayWorld() {}

    public static String resolve(String id) {
        if (id == null) return null;
        try {
            Path saves = FabricLoader.getInstance().getGameDir().resolve("saves");
            if (exists(saves, id)) return id;
            List<String> worlds = new ArrayList<>();
            File[] dirs = saves.toFile().listFiles(File::isDirectory);
            if (dirs != null) for (File d : dirs) if (new File(d, "level.dat").isFile()) worlds.add(d.getName());

            String want = norm(id);
            for (String w : worlds) if (norm(w).equals(want)) return found(id, w);
            for (String w : worlds) if (wildcard(want, norm(w))) return found(id, w);
            if (worlds.size() == 1) return found(id, worlds.get(0));
        } catch (Throwable t) {
            System.out.println("[NeonClient] quick play lookup failed: " + t);
        }
        return id;
    }

    private static boolean exists(Path saves, String id) {
        try {
            return Files.isDirectory(saves.resolve(id));
        } catch (Throwable t) {
            return false;
        }
    }

    private static String found(String id, String w) {
        System.out.println("[NeonClient] quick play: «" + id + "» -> «" + w + "»");
        return w;
    }

    private static String norm(String s) {
        return Normalizer.normalize(s, Normalizer.Form.NFC).trim().toLowerCase();
    }

    /** «?» (или «�») в переданном имени — любой один символ */
    private static boolean wildcard(String pattern, String name) {
        if (pattern.length() != name.length()) return false;
        for (int i = 0; i < pattern.length(); i++) {
            char p = pattern.charAt(i);
            if (p != '?' && p != '�' && p != name.charAt(i)) return false;
        }
        return true;
    }
}
