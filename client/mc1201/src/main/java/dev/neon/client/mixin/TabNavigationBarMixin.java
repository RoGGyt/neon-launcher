package dev.neon.client.mixin;

import com.mojang.blaze3d.systems.RenderSystem;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.tabs.TabNavigationBar;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.Redirect;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** 1.20.1: шапка вкладок без чёрной полосы, разделитель и вкладки — с прозрачностью */
@Mixin(TabNavigationBar.class)
public abstract class TabNavigationBarMixin {
    @Inject(method = "render", at = @At("HEAD"))
    private void neon$blend(GuiGraphics g, int mx, int my, float partial, CallbackInfo ci) {
        RenderSystem.enableBlend();
        RenderSystem.defaultBlendFunc();
    }

    @Redirect(method = "render", at = @At(value = "INVOKE", target = "Lnet/minecraft/client/gui/GuiGraphics;fill(IIIII)V"), require = 0)
    private void neon$noBlackBar(GuiGraphics g, int x1, int y1, int x2, int y2, int color) {
        g.fill(x1, y1, x2, y2, 0x33000000);
    }
}
