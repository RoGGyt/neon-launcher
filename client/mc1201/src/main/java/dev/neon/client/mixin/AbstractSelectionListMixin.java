package dev.neon.client.mixin;

import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.AbstractSelectionList;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Shadow;
import org.spongepowered.asm.mixin.Unique;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** 1.20.1: списки без земли — лёгкая тёмная подложка и тонкие линии сверху и снизу */
@Mixin(AbstractSelectionList.class)
public abstract class AbstractSelectionListMixin {
    @Shadow private boolean renderBackground;
    @Shadow private boolean renderTopAndBottom;
    @Shadow protected int x0;
    @Shadow protected int x1;
    @Shadow protected int y0;
    @Shadow protected int y1;

    @Unique private Boolean neon$wantsBackground;

    @Inject(method = "render", at = @At("HEAD"))
    private void neon$background(GuiGraphics g, int mouseX, int mouseY, float partial, CallbackInfo ci) {
        if (neon$wantsBackground == null || renderBackground) neon$wantsBackground = renderBackground;
        renderBackground = false;
        renderTopAndBottom = false;
        if (neon$wantsBackground) {
            g.fill(x0, y0, x1, y1, 0x38000000);
            g.fill(x0, y0, x1, y0 + 1, 0x18FFFFFF);
            g.fill(x0, y1 - 1, x1, y1, 0x18FFFFFF);
        }
    }
}
