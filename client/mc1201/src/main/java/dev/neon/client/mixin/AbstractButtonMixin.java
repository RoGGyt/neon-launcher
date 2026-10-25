package dev.neon.client.mixin;

import dev.neon.client.Ui;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.AbstractButton;
import net.minecraft.resources.ResourceLocation;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Redirect;

/** 1.20.1: все кнопки игры рисуются текстурой Neon */
@Mixin(AbstractButton.class)
public abstract class AbstractButtonMixin {
    @Redirect(method = "renderWidget", at = @At(value = "INVOKE", target = "Lnet/minecraft/client/gui/GuiGraphics;blitNineSliced(Lnet/minecraft/resources/ResourceLocation;IIIIIIIIII)V"), require = 0)
    private void neon$texture(GuiGraphics g, ResourceLocation tex, int x, int y, int w, int h, int sw, int sh, int uw, int vh, int u, int v) {
        g.blitNineSliced(Ui.WIDGETS, x, y, w, h, sw, sh, uw, vh, u, v);
    }
}
