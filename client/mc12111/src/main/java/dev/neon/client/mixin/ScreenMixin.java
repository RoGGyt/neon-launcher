package dev.neon.client.mixin;

import dev.neon.client.Ui;
import net.minecraft.client.Minecraft;
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

/** Все экраны: заголовок шрифтом Inter, вместо панорамы — фон Neon, без лишнего размытия в меню */
@Mixin(Screen.class)
public abstract class ScreenMixin {
    @Shadow @Final @Mutable protected Component title;
    @Shadow @Final protected Minecraft minecraft;
    @Shadow public int width;
    @Shadow public int height;

    @Inject(method = "<init>(Lnet/minecraft/network/chat/Component;)V", at = @At("RETURN"), require = 0)
    private void neon$styleTitle(Component title, CallbackInfo ci) {
        this.title = Ui.style(this.title);
    }

    @Inject(method = "<init>(Lnet/minecraft/client/Minecraft;Lnet/minecraft/client/gui/Font;Lnet/minecraft/network/chat/Component;)V", at = @At("RETURN"), require = 0)
    private void neon$styleTitle2(Minecraft mc, net.minecraft.client.gui.Font font, Component title, CallbackInfo ci) {
        this.title = Ui.style(this.title);
    }

    @Inject(method = "renderPanorama", at = @At("HEAD"), cancellable = true)
    private void neon$background(GuiGraphics g, float partial, CallbackInfo ci) {
        Ui.background(g, width, height, width / 2, height / 2);
        ci.cancel();
    }

    @Inject(method = "renderBlurredBackground", at = @At("HEAD"), cancellable = true)
    private void neon$noBlurInMenus(GuiGraphics g, CallbackInfo ci) {
        // фон Neon уже размыт; в игре оставляем размытие мира
        if (minecraft != null && minecraft.level == null) ci.cancel();
    }
}
