package dev.roggyt.neonautohost;

import net.fabricmc.api.ModInitializer;

import java.lang.reflect.Field;
import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Method;
import java.lang.reflect.Proxy;
import java.net.ServerSocket;
import java.util.concurrent.Executor;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Помощник Neon Launcher для облачных миров.
 * Если игра запущена с -Dneon.autohost=true, после входа в одиночный мир
 * он сам открывает мир для сети (как кнопка «Открыть для сети»). Дальше e4all
 * выдаёт публичный адрес, а лаунчер раздаёт его друзьям.
 *
 * Всё сделано через рефлексию и не ссылается на классы Minecraft напрямую,
 * поэтому один jar работает и на старых (1.20–1.21.x), и на новых (26.x) версиях.
 */
public final class NeonAutoHost implements ModInitializer {
    private static final String TAG = "[NeonAutoHost] ";
    private final AtomicBoolean published = new AtomicBoolean(false);

    @Override
    public void onInitialize() {
        if (!Boolean.getBoolean("neon.autohost")) return;
        try {
            Class<?> events = Class.forName("net.fabricmc.fabric.api.networking.v1.ServerPlayConnectionEvents");
            Field joinField = events.getField("JOIN");
            Object joinEvent = joinField.get(null);
            Class<?> listenerType = Class.forName("net.fabricmc.fabric.api.networking.v1.ServerPlayConnectionEvents$Join");

            InvocationHandler handler = (proxy, method, args) -> {
                if (method.getDeclaringClass() == Object.class) {
                    switch (method.getName()) {
                        case "hashCode": return System.identityHashCode(proxy);
                        case "equals": return proxy == args[0];
                        default: return "NeonAutoHostJoinListener";
                    }
                }
                // onPlayReady(handler, sender, server): сервер — последний аргумент
                if (args != null && args.length > 0 && published.compareAndSet(false, true)) {
                    Object server = args[args.length - 1];
                    startPublishing(server);
                }
                return null;
            };
            Object listener = Proxy.newProxyInstance(listenerType.getClassLoader(), new Class<?>[]{listenerType}, handler);
            Method register = joinEvent.getClass().getMethod("register", Object.class);
            register.invoke(joinEvent, listener);
            System.out.println(TAG + "armed: world will be opened to LAN after join");
        } catch (Throwable t) {
            System.out.println(TAG + "ERROR cannot hook Fabric API (is Fabric API installed?): " + t);
        }
    }

    private void startPublishing(Object server) {
        Thread t = new Thread(() -> {
            try {
                Thread.sleep(4000); // даём клиенту создать игрока
                Object client = clientInstance();
                for (int attempt = 1; attempt <= 30; attempt++) {
                    AtomicBoolean ok = new AtomicBoolean(false);
                    Runnable task = () -> ok.set(tryPublish(server));
                    if (client instanceof Executor) {
                        ((Executor) client).execute(task);
                        Thread.sleep(1000);
                    } else {
                        task.run();
                    }
                    if (ok.get()) return;
                    Thread.sleep(1000);
                }
                System.out.println(TAG + "ERROR gave up opening world to LAN");
            } catch (InterruptedException ignored) {
            } catch (Throwable e) {
                System.out.println(TAG + "ERROR " + e);
            }
        }, "NeonAutoHost");
        t.setDaemon(true);
        t.start();
    }

    private static Object clientInstance() {
        try {
            Class<?> loader = Class.forName("net.fabricmc.loader.api.FabricLoader");
            Object instance = loader.getMethod("getInstance").invoke(null);
            return loader.getMethod("getGameInstance").invoke(instance);
        } catch (Throwable t) {
            return null;
        }
    }

    /** Ищем publishServer/openToLan по сигнатуре (GameMode, boolean, int) -> boolean, имя не важно */
    private static boolean tryPublish(Object server) {
        try {
            Method publish = null;
            for (Method m : server.getClass().getMethods()) {
                Class<?>[] p = m.getParameterTypes();
                if (p.length == 3 && p[0].isEnum() && p[1] == boolean.class && p[2] == int.class && m.getReturnType() == boolean.class) {
                    publish = m;
                    break;
                }
            }
            if (publish == null) {
                System.out.println(TAG + "ERROR publish method not found on " + server.getClass().getName());
                return true; // повторять бессмысленно
            }
            int port = freePort();
            Object result = publish.invoke(server, null, Boolean.FALSE, port);
            if (Boolean.TRUE.equals(result)) {
                System.out.println(TAG + "LAN_OPEN port=" + port);
                return true;
            }
            System.out.println(TAG + "publish returned false, retrying");
            return false;
        } catch (java.lang.reflect.InvocationTargetException e) {
            // игрок ещё не готов (NullPointerException внутри) — попробуем ещё раз
            System.out.println(TAG + "not ready yet: " + e.getCause());
            return false;
        } catch (Throwable e) {
            System.out.println(TAG + "ERROR " + e);
            return true;
        }
    }

    private static int freePort() throws java.io.IOException {
        try (ServerSocket s = new ServerSocket(0)) {
            return s.getLocalPort();
        }
    }
}
