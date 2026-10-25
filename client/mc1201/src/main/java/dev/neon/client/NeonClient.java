package dev.neon.client;

import net.fabricmc.api.ClientModInitializer;

public final class NeonClient implements ClientModInitializer {
    @Override
    public void onInitializeClient() {
        System.out.println("[NeonClient] loaded");
    }
}
