package com.fet3d.unity

import android.content.Context
import android.content.Intent
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class Fire3DUnityModule : Module() {
  private fun context(): Context = requireNotNull(appContext.reactContext) { "React context unavailable." }

  /** NEW_TASK + the manifest's taskAffinity/singleTask: creates the Unity task once, then reorders it to the front. */
  private fun showHost(context: Context) {
    val intent = Intent(context, UnityHostActivity::class.java)
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)
    (appContext.currentActivity ?: context).startActivity(intent)
  }

  override fun definition() = ModuleDefinition {
    Name("Fire3DUnity")
    Events("onCallback")
    OnCreate {
      Fire3DUnityBridge.initialize(context()) { id -> sendEvent("onCallback", mapOf("id" to id)) }
    }
    AsyncFunction("pendingCallbacks") { Fire3DUnityBridge.pending() }
    AsyncFunction("acknowledgeCallback") { id: Long -> Fire3DUnityBridge.acknowledge(id) }
    AsyncFunction("launch") { payload: String ->
      if (!Fire3DUnityBridge.requestLaunch(payload))
        throw CodedException("ERR_UNITY_BUSY", "Unity đang chạy một phiên khác. Hãy tiếp tục hoặc kết thúc phiên đó trước.", null)
      showHost(context())
    }
    AsyncFunction("show") {
      if (Fire3DUnityBridge.isUnityAlive()) {
        showHost(context())
        true
      } else {
        false
      }
    }
    AsyncFunction("pause") { Fire3DUnityBridge.send("Pause", "") }
    AsyncFunction("resume") { Fire3DUnityBridge.send("Resume", "") }
    AsyncFunction("abort") { reason: String -> Fire3DUnityBridge.send("Abort", reason) }
  }
}
