package dev.neon.client.mixin;

import dev.neon.client.Ui;
import net.minecraft.network.chat.Component;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/** Подписи выключенных кнопок тоже шрифтом Inter */
@Mixin(targets = "net.minecraft.client.gui.components.AbstractWidget$WithInactiveMessage")
public abstract class WithInactiveMessageMixin {
    @Inject(method = "getMessage", at = @At("RETURN"), cancellable = true, require = 0)
    private void neon$font(CallbackInfoReturnable<Component> cir) {
        cir.setReturnValue(Ui.style(cir.getReturnValue()));
    }
}
