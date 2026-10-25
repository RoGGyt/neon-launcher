package dev.neon.client.mixin;

import com.mojang.blaze3d.font.TrueTypeGlyphProvider;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.ModifyArg;

/**
 * 1.20.1: у TTF-шрифтов левый отступ буквы учитывается дважды (баг игры, исправлен в 1.20.2),
 * из-за этого буквы стоят неровно. Убираем лишний отступ — позиция берётся только из рамки глифа.
 */
@Mixin(TrueTypeGlyphProvider.class)
public abstract class TrueTypeProviderMixin {
    @ModifyArg(method = "getGlyph", at = @At(value = "INVOKE",
            target = "Lcom/mojang/blaze3d/font/TrueTypeGlyphProvider$Glyph;<init>(Lcom/mojang/blaze3d/font/TrueTypeGlyphProvider;IIIIFFI)V"),
            index = 6)
    private float neon$noDoubleBearing(float bearingX) {
        return 0f;
    }
}
