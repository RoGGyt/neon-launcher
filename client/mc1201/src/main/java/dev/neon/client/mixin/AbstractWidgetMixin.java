package dev.neon.client.mixin;

import dev.neon.client.Ui;
import net.minecraft.client.gui.Font;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.AbstractWidget;
import net.minecraft.network.chat.Component;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Unique;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.Redirect;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/** 1.20.1: подписи виджетов шрифтом Inter и без грубой пиксельной тени */
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

    @Redirect(method = "renderScrollingString(Lnet/minecraft/client/gui/GuiGraphics;Lnet/minecraft/client/gui/Font;Lnet/minecraft/network/chat/Component;IIIII)V",
            at = @At(value = "INVOKE", target = "Lnet/minecraft/client/gui/GuiGraphics;drawString(Lnet/minecraft/client/gui/Font;Lnet/minecraft/network/chat/Component;III)I"), require = 0)
    private static int neon$scrollNoShadow(GuiGraphics g, Font font, Component text, int x, int y, int color) {
        return g.drawString(font, text, x, y, color, !Ui.ours(text));
    }

    @Redirect(method = "renderScrollingString(Lnet/minecraft/client/gui/GuiGraphics;Lnet/minecraft/client/gui/Font;Lnet/minecraft/network/chat/Component;IIIII)V",
            at = @At(value = "INVOKE", target = "Lnet/minecraft/client/gui/GuiGraphics;drawCenteredString(Lnet/minecraft/client/gui/Font;Lnet/minecraft/network/chat/Component;III)V"), require = 0)
    private static void neon$centerNoShadow(GuiGraphics g, Font font, Component text, int x, int y, int color) {
        g.drawString(font, text, x - font.width(text) / 2, y, color, !Ui.ours(text));
    }
}
