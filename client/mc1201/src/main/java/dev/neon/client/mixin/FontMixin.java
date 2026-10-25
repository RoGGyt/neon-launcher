package dev.neon.client.mixin;

import dev.neon.client.Ui;
import net.minecraft.client.gui.Font;
import net.minecraft.network.chat.Style;
import net.minecraft.resources.ResourceLocation;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.ModifyVariable;

/** 1.20.1: в экранах шрифт по умолчанию — Inter (и для отрисовки, и для ширины/переноса строк) */
@Mixin(Font.class)
public abstract class FontMixin {
    @ModifyVariable(method = "getFontSet", at = @At("HEAD"), argsOnly = true)
    private ResourceLocation neon$font(ResourceLocation loc) {
        return Ui.inScreen() && Style.DEFAULT_FONT.equals(loc) ? Ui.FONT : loc;
    }
}
