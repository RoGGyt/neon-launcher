package dev.neon.client.mixin;

import dev.neon.client.Ui;
import net.minecraft.client.gui.Font;
import net.minecraft.client.gui.components.EditBox;
import net.minecraft.util.FormattedCharSequence;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Redirect;

/** Поле ввода считает ширину текста по шрифту Inter — чтобы курсор и выделение совпадали с буквами */
@Mixin(EditBox.class)
public abstract class EditBoxMixin {

    @Redirect(method = {"renderWidget", "updateTextPosition", "scrollTo", "findClickedPositionInText", "getScreenX"},
            at = @At(value = "INVOKE", target = "Lnet/minecraft/client/gui/Font;width(Ljava/lang/String;)I"), require = 0)
    private int neon$width(Font font, String s) {
        return Ui.styledScreen() ? Ui.width(font, s) : font.width(s);
    }

    @Redirect(method = {"renderWidget", "updateTextPosition", "scrollTo", "findClickedPositionInText", "getScreenX"},
            at = @At(value = "INVOKE", target = "Lnet/minecraft/client/gui/Font;width(Lnet/minecraft/util/FormattedCharSequence;)I"), require = 0)
    private int neon$widthSeq(Font font, FormattedCharSequence seq) {
        return font.width(Ui.styledScreen() ? Ui.wrap(seq) : seq);
    }

    @Redirect(method = {"renderWidget", "updateTextPosition", "scrollTo", "findClickedPositionInText"},
            at = @At(value = "INVOKE", target = "Lnet/minecraft/client/gui/Font;plainSubstrByWidth(Ljava/lang/String;I)Ljava/lang/String;"), require = 0)
    private String neon$head(Font font, String s, int w) {
        return Ui.styledScreen() ? Ui.head(font, s, w) : font.plainSubstrByWidth(s, w);
    }

    @Redirect(method = {"renderWidget", "updateTextPosition", "scrollTo", "findClickedPositionInText"},
            at = @At(value = "INVOKE", target = "Lnet/minecraft/client/gui/Font;plainSubstrByWidth(Ljava/lang/String;IZ)Ljava/lang/String;"), require = 0)
    private String neon$substr(Font font, String s, int w, boolean tail) {
        if (!Ui.styledScreen()) return font.plainSubstrByWidth(s, w, tail);
        return tail ? Ui.tail(font, s, w) : Ui.head(font, s, w);
    }
}
