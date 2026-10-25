package dev.neon.client.mixin;

import dev.neon.client.Ui;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.AbstractSelectionList;
import net.minecraft.client.renderer.RenderPipelines;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** Выбранная строка списка — мягкая скруглённая подсветка вместо белой рамки */
@Mixin(AbstractSelectionList.class)
public abstract class AbstractSelectionListMixin {
    @Inject(method = "renderSelection", at = @At("HEAD"), cancellable = true)
    private void neon$selection(GuiGraphics g, AbstractSelectionList.Entry<?> entry, int color, CallbackInfo ci) {
        g.blitSprite(RenderPipelines.GUI_TEXTURED, Ui.SELECTION, entry.getX(), entry.getY(), entry.getWidth(), entry.getHeight());
        ci.cancel();
    }
}
