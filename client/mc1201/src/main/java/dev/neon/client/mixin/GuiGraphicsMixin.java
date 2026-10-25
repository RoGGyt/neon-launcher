package dev.neon.client.mixin;

import dev.neon.client.Ui;
import net.minecraft.client.gui.GuiGraphics;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.ModifyVariable;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** 1.20.1: текст экранов без пиксельной тени; цифры предметов — как в HUD */
@Mixin(GuiGraphics.class)
public abstract class GuiGraphicsMixin {
    @ModifyVariable(method = {"drawString(Lnet/minecraft/client/gui/Font;Ljava/lang/String;IIIZ)I",
            "drawString(Lnet/minecraft/client/gui/Font;Lnet/minecraft/util/FormattedCharSequence;IIIZ)I"},
            at = @At("HEAD"), argsOnly = true, ordinal = 0)
    private boolean neon$noShadow(boolean shadow) {
        return shadow && !Ui.inScreen();
    }

    @Inject(method = "renderItemDecorations(Lnet/minecraft/client/gui/Font;Lnet/minecraft/world/item/ItemStack;IILjava/lang/String;)V", at = @At("HEAD"))
    private void neon$itemsIn(CallbackInfo ci) {
        Ui.suspend(true);
    }

    @Inject(method = "renderItemDecorations(Lnet/minecraft/client/gui/Font;Lnet/minecraft/world/item/ItemStack;IILjava/lang/String;)V", at = @At("RETURN"))
    private void neon$itemsOut(CallbackInfo ci) {
        Ui.suspend(false);
    }
}
