package dev.neon.client.mixin;

import dev.neon.client.NeonMenu;
import dev.neon.client.NeonTour;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.gui.screens.TitleScreen;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** Вместо стандартного главного меню открываем меню Neon */
@Mixin(Minecraft.class)
public abstract class MinecraftMixin {
    @Inject(method = "setScreen", at = @At("HEAD"), cancellable = true)
    private void neon$replaceTitle(Screen screen, CallbackInfo ci) {
        if (screen != null && screen.getClass() == TitleScreen.class) {
            ((Minecraft) (Object) this).setScreen(new NeonMenu());
            ci.cancel();
        }
    }

    @Inject(method = "tick", at = @At("TAIL"))
    private void neon$tour(CallbackInfo ci) {
        NeonTour.tick((Minecraft) (Object) this);
    }
}
