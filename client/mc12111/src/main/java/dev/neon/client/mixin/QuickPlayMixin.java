package dev.neon.client.mixin;

import dev.neon.client.QuickPlayWorld;
import net.minecraft.client.quickplay.QuickPlay;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.ModifyVariable;

/** Быстрый вход в облачный мир: находим папку мира, даже если имя пришло искажённым */
@Mixin(QuickPlay.class)
public abstract class QuickPlayMixin {
    @ModifyVariable(method = "joinSingleplayerWorld", at = @At("HEAD"), argsOnly = true, require = 0)
    private static String neon$findWorld(String id) {
        return QuickPlayWorld.resolve(id);
    }
}
