package dev.neon.client.mixin;

import net.minecraft.client.Minecraft;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/** 1.20.1: ширина буквы TTF кратна пикселю экрана — без «пляшущих» промежутков между буквами */
@Mixin(targets = "com.mojang.blaze3d.font.TrueTypeGlyphProvider$Glyph")
public abstract class TrueTypeGlyphMixin {
    @Inject(method = "getAdvance()F", at = @At("RETURN"), cancellable = true, require = 0)
    private void neon$pixelAdvance(CallbackInfoReturnable<Float> cir) {
        Minecraft mc = Minecraft.getInstance();
        if (mc == null || mc.getWindow() == null) return;
        double s = Math.max(1, Math.round(mc.getWindow().getGuiScale()));
        cir.setReturnValue((float) (Math.round(cir.getReturnValueF() * s) / s));
    }
}
