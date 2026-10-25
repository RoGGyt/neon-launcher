package dev.neon.client.mixin;

import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.AbstractSelectionList;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Shadow;
import org.spongepowered.asm.mixin.Unique;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.Redirect;
import dev.neon.client.Ui;
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
    @Shadow protected int width;

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

    /** выбранная строка — мягкая скруглённая подсветка */
    @Inject(method = "renderSelection", at = @At("HEAD"), cancellable = true)
    private void neon$selection(GuiGraphics g, int top, int w, int h, int outer, int inner, CallbackInfo ci) {
        int left = x0 + (width - w) / 2;
        Ui.selection(g, left, top - 2, w, h + 4);
        ci.cancel();
    }

    /** полоса прокрутки — тонкая и полупрозрачная */
    @Redirect(method = "render", at = @At(value = "INVOKE", target = "Lnet/minecraft/client/gui/GuiGraphics;fill(IIIII)V"))
    private void neon$scrollbar(GuiGraphics g, int ax, int ay, int bx, int by, int color) {
        if (color == -4144960) return;
        int c = color == -16777216 ? 0x10FFFFFF : color == -8355712 ? 0x55FFFFFF : color;
        g.fill(ax + 2, ay, bx - 2, by, c);
    }
}
