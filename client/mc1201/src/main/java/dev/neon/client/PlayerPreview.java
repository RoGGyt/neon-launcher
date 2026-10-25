package dev.neon.client;

import com.mojang.authlib.GameProfile;
import com.mojang.authlib.minecraft.MinecraftProfileTexture;
import com.mojang.blaze3d.platform.Lighting;
import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.math.Axis;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.model.PlayerModel;
import net.minecraft.client.model.geom.ModelLayers;
import net.minecraft.client.renderer.RenderType;
import net.minecraft.client.renderer.texture.OverlayTexture;
import net.minecraft.client.resources.DefaultPlayerSkin;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.world.entity.LivingEntity;

import java.util.Map;

/** 3D-модель игрока со скином для 1.20.1 (в этой версии готового виджета ещё нет) */
public final class PlayerPreview {
    private PlayerModel<LivingEntity> wide;
    private PlayerModel<LivingEntity> slim;
    public float rotY = -25f;
    public float rotX = 0f;

    private PlayerModel<LivingEntity> model(boolean isSlim) {
        Minecraft mc = Minecraft.getInstance();
        if (isSlim) {
            if (slim == null) slim = new PlayerModel<>(mc.getEntityModels().bakeLayer(ModelLayers.PLAYER_SLIM), true);
            return slim;
        }
        if (wide == null) wide = new PlayerModel<>(mc.getEntityModels().bakeLayer(ModelLayers.PLAYER), false);
        return wide;
    }

    public void render(GuiGraphics g, int x, int y, int w, int h) {
        Minecraft mc = Minecraft.getInstance();
        GameProfile profile = mc.getUser().getGameProfile();
        ResourceLocation skin;
        boolean isSlim;
        try {
            skin = mc.getSkinManager().getInsecureSkinLocation(profile);
            Map<MinecraftProfileTexture.Type, MinecraftProfileTexture> info = mc.getSkinManager().getInsecureSkinInformation(profile);
            MinecraftProfileTexture tex = info.get(MinecraftProfileTexture.Type.SKIN);
            isSlim = tex != null ? "slim".equals(tex.getMetadata("model")) : "slim".equals(DefaultPlayerSkin.getSkinModelName(profile.getId()));
        } catch (Throwable t) {
            skin = DefaultPlayerSkin.getDefaultSkin(profile.getId());
            isSlim = "slim".equals(DefaultPlayerSkin.getSkinModelName(profile.getId()));
        }
        PlayerModel<LivingEntity> m = model(isSlim);
        m.young = false;
        m.setAllVisible(true);

        // лёгкое покачивание, пока мышкой не крутят
        float sway = (float) Math.sin(System.currentTimeMillis() / 1600.0) * 4f;

        PoseStack pose = g.pose();
        pose.pushPose();
        pose.translate(x + w / 2.0, y + h, 100.0);
        float scale = h / 2.125f;
        pose.scale(scale, scale, scale);
        pose.translate(0.0, -0.0625, 0.0);
        pose.translate(0.0, -1.0625, 0.0);
        pose.mulPose(Axis.XP.rotationDegrees(rotX));
        pose.translate(0.0, 1.0625, 0.0);
        pose.mulPose(Axis.YP.rotationDegrees(rotY + sway));
        g.flush();
        Lighting.setupForEntityInInventory();
        pose.pushPose();
        pose.scale(1.0f, 1.0f, -1.0f);
        pose.translate(0.0f, -1.5f, 0.0f);
        RenderType type = m.renderType(skin);
        m.renderToBuffer(pose, g.bufferSource().getBuffer(type), 0xF000F0, OverlayTexture.NO_OVERLAY, 1f, 1f, 1f, 1f);
        pose.popPose();
        g.flush();
        Lighting.setupFor3DItems();
        pose.popPose();
    }
}
