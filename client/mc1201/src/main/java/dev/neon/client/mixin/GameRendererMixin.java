package dev.neon.client.mixin;

import dev.neon.client.Ui;
import net.minecraft.client.renderer.GameRenderer;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** Границы кадра: внутри кадра Inter только там, где рисуется экран */
@Mixin(GameRenderer.class)
public abstract class GameRendererMixin {
    @Inject(method = "render", at = @At("HEAD"))
    private void neon$frameIn(CallbackInfo ci) {
        Ui.frame(true);
    }

    @Inject(method = "render", at = @At("RETURN"))
    private void neon$frameOut(CallbackInfo ci) {
        Ui.frame(false);
    }
}
