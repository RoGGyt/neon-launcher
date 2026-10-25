package dev.neon.client.mixin;

import net.minecraft.client.gui.screens.LoadingOverlay;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Redirect;

import java.util.function.IntSupplier;

/** Экран загрузки игры: тёмный фон вместо красного */
@Mixin(LoadingOverlay.class)
public abstract class LoadingOverlayMixin {
    @Redirect(method = "render", at = @At(value = "INVOKE", target = "Ljava/util/function/IntSupplier;getAsInt()I"), require = 0)
    private int neon$darkBackground(IntSupplier supplier) {
        return 0x0B0C10;
    }
}
