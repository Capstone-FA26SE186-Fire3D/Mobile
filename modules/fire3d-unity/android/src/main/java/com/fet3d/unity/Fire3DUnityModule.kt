package com.fet3d.unity

import android.content.Intent
import com.unity3d.player.UnityPlayer
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class Fire3DUnityModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("Fire3DUnity")
    Events("onCallback")
    OnCreate {
      val context = requireNotNull(appContext.reactContext) { "React context unavailable." }
      Fire3DUnityBridge.initialize(context) { id -> sendEvent("onCallback", mapOf("id" to id)) }
    }
    AsyncFunction("pendingCallbacks") { Fire3DUnityBridge.pending() }
    AsyncFunction("acknowledgeCallback") { id: Long -> Fire3DUnityBridge.acknowledge(id) }
    AsyncFunction("launch") { payload: String ->
      val context = requireNotNull(appContext.reactContext) { "React context unavailable." }
      Fire3DUnityBridge.setLaunch(payload)
      context.startActivity(Intent(context, UnityHostActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }
    AsyncFunction("pause") { UnityPlayer.UnitySendMessage("Fire3DBridge", "Pause", "") }
    AsyncFunction("resume") { UnityPlayer.UnitySendMessage("Fire3DBridge", "Resume", "") }
    AsyncFunction("abort") { reason: String -> UnityPlayer.UnitySendMessage("Fire3DBridge", "Abort", reason) }
  }
}
