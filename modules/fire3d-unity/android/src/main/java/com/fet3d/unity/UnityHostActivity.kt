package com.fet3d.unity

import android.os.Build
import android.os.Bundle
import android.view.KeyEvent
import android.window.OnBackInvokedCallback
import android.window.OnBackInvokedDispatcher
import com.unity3d.player.UnityPlayerActivity

/**
 * Runs in the app process (bridge and callback journal stay available) but in its own task (manifest: taskAffinity,
 * singleTask, excludeFromRecents), so Mobile can bring React Native back without finishing this activity: finishing it
 * destroys the UnityPlayer, which kills the shared process. A second launch reorders this task to the front.
 */
class UnityHostActivity : UnityPlayerActivity() {
  private var backCallback: OnBackInvokedCallback? = null
  private var lastBackAt = 0L

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    Fire3DUnityBridge.attachHost(this)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      val callback = OnBackInvokedCallback { onBack() }
      onBackInvokedDispatcher.registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_OVERLAY, callback)
      backCallback = callback
    }
  }

  override fun onDestroy() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU)
      backCallback?.let { onBackInvokedDispatcher.unregisterOnBackInvokedCallback(it) }
    Fire3DUnityBridge.detachHost(this)
    super.onDestroy()
  }

  override fun onPause() {
    // Queued before the player pauses; Unity processes it on its next frame (at the latest on resume).
    Fire3DUnityBridge.send("Pause", "")
    super.onPause()
  }

  override fun onResume() {
    super.onResume()
    Fire3DUnityBridge.send("Resume", "")
  }

  /** Legacy back key (Android < 13, or predictive back disabled). */
  override fun dispatchKeyEvent(event: KeyEvent): Boolean {
    if (event.keyCode == KeyEvent.KEYCODE_BACK) {
      if (event.action == KeyEvent.ACTION_UP) onBack()
      return true
    }
    return super.dispatchKeyEvent(event)
  }

  @Deprecated("Replaced by OnBackInvokedCallback on Android 13+")
  override fun onBackPressed() = onBack()

  /**
   * Back while the package loads cancels the launch (Unity answers LAUNCH_CANCELLED); during a session it ends the
   * session as Abandoned (Completed, then Exited); idle Unity just returns to the app.
   */
  private fun onBack() {
    val now = System.currentTimeMillis()
    if (now - lastBackAt < 800) return
    lastBackAt = now
    if (!Fire3DUnityBridge.requestAbort("BackButton"))
      Fire3DUnityBridge.bringAppToFront()
  }
}
