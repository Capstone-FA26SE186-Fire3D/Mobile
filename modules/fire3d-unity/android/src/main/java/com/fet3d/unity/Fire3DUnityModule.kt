package com.fet3d.unity

import android.content.Context
import android.content.Intent
import android.net.Uri
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.FileInputStream
import java.security.MessageDigest

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
      when (val refused = Fire3DUnityBridge.requestLaunch(payload)) {
        null -> showHost(context())
        Fire3DUnityBridge.BUSY ->
          throw CodedException("ERR_UNITY_BUSY", "Unity đang chạy một phiên khác. Hãy tiếp tục hoặc kết thúc phiên đó trước.", null)
        else -> throw CodedException("ERR_UNITY_RUNTIME_MISMATCH", refused, null)
      }
    }
    AsyncFunction("show") {
      if (Fire3DUnityBridge.isUnityAlive()) {
        showHost(context())
        true
      } else {
        false
      }
    }
    AsyncFunction("handshake") { Fire3DUnityBridge.handshake(context()) }
    AsyncFunction("activeSession") { Fire3DUnityBridge.activeSessionId() }
    AsyncFunction("pause") { Fire3DUnityBridge.send("Pause", "") }
    AsyncFunction("resume") { Fire3DUnityBridge.send("Resume", "") }
    AsyncFunction("abort") { reason: String -> Fire3DUnityBridge.send("Abort", reason) }
    // Package files are 100+ MB: hashing them in JS (Hermes) pinned the JS thread for minutes on mid phones.
    // AsyncFunction runs off the JS thread; MessageDigest streams the file in 1 MiB chunks.
    AsyncFunction("sha256File") { uri: String -> sha256File(uri) }
  }

  private fun sha256File(uri: String): String {
    val path = if (uri.startsWith("file://")) Uri.parse(uri).path ?: "" else uri
    val file = File(path)
    if (!file.isFile) throw CodedException("ERR_FILE_MISSING", "Không tìm thấy tệp gói trên máy.", null)
    val digest = MessageDigest.getInstance("SHA-256")
    val buffer = ByteArray(1 shl 20)
    FileInputStream(file).use { input ->
      while (true) {
        val read = input.read(buffer)
        if (read < 0) break
        digest.update(buffer, 0, read)
      }
    }
    return digest.digest().joinToString("") { "%02x".format(it) }
  }
}
