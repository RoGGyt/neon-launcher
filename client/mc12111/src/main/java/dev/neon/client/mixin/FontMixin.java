package dev.neon.client.mixin;

import dev.neon.client.Ui;
import net.minecraft.client.gui.Font;
import net.minecraft.network.chat.FontDescription;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.ModifyVariable;

/** В экранах шрифт по умолчанию — Inter (ширина, перенос, поля ввода); шрифт Neon — с растром под масштаб */
@Mixin(Font.class)
public abstract class FontMixin {
    @ModifyVariable(method = "getGlyphSource", at = @At("HEAD"), argsOnly = true)
    private FontDescription neon$font(FontDescription font) {
        return Ui.scaled(Ui.inScreen() && FontDescription.DEFAULT.equals(font) ? Ui.FONT : font);
    }
}
