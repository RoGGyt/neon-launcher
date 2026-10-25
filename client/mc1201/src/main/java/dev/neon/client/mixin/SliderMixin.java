package dev.neon.client.mixin;

import dev.neon.client.Ui;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.AbstractSliderButton;
import net.minecraft.resources.ResourceLocation;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Redirect;

/** 1.20.1: ползунок — тёмная дорожка и тонкая светлая ручка */
@Mixin(AbstractSliderButton.class)
public abstract class SliderMixin {
    @Redirect(method = "renderWidget", at = @At(value = "INVOKE", ordinal = 0,
            target = "Lnet/minecraft/client/gui/GuiGraphics;blitNineSliced(Lnet/minecraft/resources/ResourceLocation;IIIIIIIIII)V"))
    private void neon$track(GuiGraphics g, ResourceLocation tex, int x, int y, int w, int h, int sw, int sh, int uw, int vh, int u, int v) {
        Ui.button(g, x, y, w, h, true, v > 0);
    }

    @Redirect(method = "renderWidget", at = @At(value = "INVOKE", ordinal = 1,
            target = "Lnet/minecraft/client/gui/GuiGraphics;blitNineSliced(Lnet/minecraft/resources/ResourceLocation;IIIIIIIIII)V"))
    private void neon$handle(GuiGraphics g, ResourceLocation tex, int x, int y, int w, int h, int sw, int sh, int uw, int vh, int u, int v) {
        com.mojang.blaze3d.systems.RenderSystem.enableBlend();
        g.blit(Ui.WIDGETS, x, y, v >= 60 ? 220 : 210, 0, 8, 20);
    }
}
