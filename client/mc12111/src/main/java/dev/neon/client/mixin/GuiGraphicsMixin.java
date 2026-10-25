package dev.neon.client.mixin;

import dev.neon.client.Ui;
import net.minecraft.client.gui.Font;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.util.FormattedCharSequence;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
import org.spongepowered.asm.mixin.injection.ModifyVariable;
import org.spongepowered.asm.mixin.injection.Redirect;

/** Весь текст, который рисуют экраны игры (не HUD), — шрифтом Inter, по центру с правильной шириной */
@Mixin(GuiGraphics.class)
public abstract class GuiGraphicsMixin {
    @ModifyVariable(method = "drawString(Lnet/minecraft/client/gui/Font;Lnet/minecraft/util/FormattedCharSequence;IIIZ)V", at = @At("HEAD"), argsOnly = true)
    private FormattedCharSequence neon$font(FormattedCharSequence seq) {
        return Ui.inScreen() && seq != null ? Ui.wrap(seq) : seq;
    }

    // цифры количества предметов в слотах — как в HUD
    @Inject(method = "renderItemDecorations(Lnet/minecraft/client/gui/Font;Lnet/minecraft/world/item/ItemStack;IILjava/lang/String;)V", at = @At("HEAD"), require = 0)
    private void neon$itemsIn(CallbackInfo ci) {
        Ui.suspend(true);
    }

    @Inject(method = "renderItemDecorations(Lnet/minecraft/client/gui/Font;Lnet/minecraft/world/item/ItemStack;IILjava/lang/String;)V", at = @At("RETURN"), require = 0)
    private void neon$itemsOut(CallbackInfo ci) {
        Ui.suspend(false);
    }

    @Redirect(method = "drawCenteredString(Lnet/minecraft/client/gui/Font;Ljava/lang/String;III)V",
            at = @At(value = "INVOKE", target = "Lnet/minecraft/client/gui/Font;width(Ljava/lang/String;)I"), require = 0)
    private int neon$centerString(Font font, String s) {
        return Ui.inScreen() ? Ui.width(font, s) : font.width(s);
    }

    @Redirect(method = {"drawCenteredString(Lnet/minecraft/client/gui/Font;Lnet/minecraft/network/chat/Component;III)V",
            "drawCenteredString(Lnet/minecraft/client/gui/Font;Lnet/minecraft/util/FormattedCharSequence;III)V"},
            at = @At(value = "INVOKE", target = "Lnet/minecraft/client/gui/Font;width(Lnet/minecraft/util/FormattedCharSequence;)I"), require = 0)
    private int neon$centerSeq(Font font, FormattedCharSequence seq) {
        return Ui.inScreen() ? font.width(Ui.wrap(seq)) : font.width(seq);
    }
}
