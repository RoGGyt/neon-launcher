package dev.neon.client.mixin;

import dev.neon.client.Ui;
import net.minecraft.client.gui.components.AbstractWidget;
import net.minecraft.network.chat.Component;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Unique;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/** Подписи всех кнопок, ползунков и переключателей — шрифтом Inter */
@Mixin(AbstractWidget.class)
public abstract class AbstractWidgetMixin {
    @Unique private Component neon$source;
    @Unique private Component neon$styled;

    @Inject(method = "getMessage", at = @At("RETURN"), cancellable = true)
    private void neon$font(CallbackInfoReturnable<Component> cir) {
        Component c = cir.getReturnValue();
        if (c == null) return;
        if (c != neon$source) {
            neon$source = c;
            neon$styled = Ui.style(c);
        }
        cir.setReturnValue(neon$styled);
    }
}
