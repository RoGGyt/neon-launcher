package dev.neon.client.mixin;

import dev.neon.client.Ui;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;
import org.spongepowered.asm.mixin.Final;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Mutable;
import org.spongepowered.asm.mixin.Shadow;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** 1.20.1: заголовки шрифтом Inter, вместо земли на фоне — фон Neon */
@Mixin(Screen.class)
public abstract class ScreenMixin {
    @Shadow @Final @Mutable protected Component title;
    @Shadow public int width;
    @Shadow public int height;

    @Inject(method = "<init>", at = @At("RETURN"))
    private void neon$styleTitle(Component title, CallbackInfo ci) {
        this.title = Ui.style(this.title);
    }

    @Inject(method = "renderWithTooltip", at = @At("HEAD"))
    private void neon$enter(GuiGraphics g, int mx, int my, float partial, CallbackInfo ci) {
        Ui.enterScreen((Screen) (Object) this);
    }

    @Inject(method = "renderWithTooltip", at = @At("RETURN"))
    private void neon$exit(GuiGraphics g, int mx, int my, float partial, CallbackInfo ci) {
        Ui.exitScreen((Screen) (Object) this);
    }

    @Inject(method = "renderDirtBackground", at = @At("HEAD"), cancellable = true)
    private void neon$background(GuiGraphics g, CallbackInfo ci) {
        Ui.background(g, width, height, width / 2, height / 2);
        g.fill(0, 0, width, height, 0x30000000);
        ci.cancel();
    }
}
