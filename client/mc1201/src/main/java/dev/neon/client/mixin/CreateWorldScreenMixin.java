package dev.neon.client.mixin;

import com.mojang.blaze3d.systems.RenderSystem;
import dev.neon.client.Ui;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.gui.screens.worldselection.CreateWorldScreen;
import net.minecraft.network.chat.Component;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** 1.20.1: создание мира — фон Neon вместо светлой земли, разделители с прозрачностью */
@Mixin(CreateWorldScreen.class)
public abstract class CreateWorldScreenMixin extends Screen {
    protected CreateWorldScreenMixin(Component title) {
        super(title);
    }

    @Inject(method = "renderDirtBackground", at = @At("HEAD"), cancellable = true, require = 0)
    private void neon$background(GuiGraphics g, CallbackInfo ci) {
        Ui.background(g, width, height, width / 2, height / 2);
        g.fill(0, 0, width, height, 0x30000000);
        ci.cancel();
    }

    @Inject(method = "render", at = @At("HEAD"), require = 0)
    private void neon$blend(GuiGraphics g, int mx, int my, float partial, CallbackInfo ci) {
        RenderSystem.enableBlend();
        RenderSystem.defaultBlendFunc();
    }
}
