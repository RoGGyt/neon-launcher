package dev.neon.client.mixin;

import com.mojang.blaze3d.systems.RenderSystem;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.TabButton;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** 1.20.1: полупрозрачные вкладки рисуются с прозрачностью */
@Mixin(TabButton.class)
public abstract class TabButtonMixin {
    @Inject(method = "renderWidget", at = @At("HEAD"))
    private void neon$blend(GuiGraphics g, int mx, int my, float partial, CallbackInfo ci) {
        RenderSystem.enableBlend();
        RenderSystem.defaultBlendFunc();
    }
}
