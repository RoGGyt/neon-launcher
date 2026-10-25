package dev.neon.client.mixin;

import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.screens.inventory.tooltip.TooltipRenderUtil;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** 1.20.1: подсказки — тёмная плашка с тонкой рамкой вместо фиолетовой */
@Mixin(TooltipRenderUtil.class)
public abstract class TooltipMixin {
    @Inject(method = "renderTooltipBackground", at = @At("HEAD"), cancellable = true)
    private static void neon$background(GuiGraphics g, int x, int y, int w, int h, int z, CallbackInfo ci) {
        int x1 = x - 4, y1 = y - 4, x2 = x + w + 4, y2 = y + h + 4;
        g.fill(x1 + 1, y1, x2 - 1, y2, z, 0xF20C0D11);
        g.fill(x1, y1 + 1, x1 + 1, y2 - 1, z, 0xF20C0D11);
        g.fill(x2 - 1, y1 + 1, x2, y2 - 1, z, 0xF20C0D11);
        // тонкая рамка
        g.fill(x1 + 1, y1, x2 - 1, y1 + 1, z, 0x24FFFFFF);
        g.fill(x1 + 1, y2 - 1, x2 - 1, y2, z, 0x24FFFFFF);
        g.fill(x1, y1 + 1, x1 + 1, y2 - 1, z, 0x24FFFFFF);
        g.fill(x2 - 1, y1 + 1, x2, y2 - 1, z, 0x24FFFFFF);
        ci.cancel();
    }
}
