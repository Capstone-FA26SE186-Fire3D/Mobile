package com.fet3d.unity

import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import android.os.Handler
import android.os.Looper
import com.unity3d.player.UnityPlayer
import org.json.JSONObject
import java.lang.ref.WeakReference

/**
 * Unity calls [onUnityMessage]; each callback is committed to SQLite before JS is notified.
 *
 * Launch delivery (protocol "1"):
 * - First launch in this process: Unity boots, sends `Ready`, then the pending payload is posted as `Launch`.
 * - Unity already alive and idle (it sent `Ready` and no session is running): `Launch` is posted immediately.
 * - After `Exited` Unity tears down and re-sends `Ready` when back in Bootstrap; a launch requested in between waits for
 *   that `Ready` (with a fallback delivery after [READY_FALLBACK_MS] for runtimes that do not re-send it).
 * On `Exited`, or an `Error` that ends the launch, the React Native task is brought back to the front. The Unity activity
 * is never finished and UnityPlayer.quit() is never called: destroying the player kills the shared app process.
 *
 * Unity is idle again only after `Ready`: runtime 2.0.1+ releases a failed or cancelled launch and then sends `Error`
 * followed by `Ready`, so the next launch waits for that `Ready` (the fallback covers 2.0.0, which did not re-send it).
 * Back while the package loads sends one `Abort`; Unity answers `LAUNCH_CANCELLED` and never `Launched`.
 *
 * Handshake: `Launch` is only delivered when the last `Ready` names the same `runtimeVersion` and `protocolVersion` as the
 * launch payload (the values the app sent to BE on start). Otherwise the launch is dropped: [requestLaunch] returns the
 * reason when Unity is already idle, or a `RUNTIME_MISMATCH` Error callback is journaled when the reason only shows on a
 * later `Ready`, so a stale embedded export can never play under another runtime's grant.
 */
object Fire3DUnityBridge {
  private const val RECEIVER = "Fire3DBridge"
  private const val READY_FALLBACK_MS = 5_000L
  const val BUSY = "BUSY"
  /** Manifest meta-data written by plugins/withUnityLibrary.js: RuntimeCatalog.RuntimeVersion of the embedded export. */
  private const val RUNTIME_META = "com.fet3d.unity.RUNTIME_VERSION"

  private val main = Handler(Looper.getMainLooper())
  private var journal: CallbackJournal? = null
  private var appContext: Context? = null
  private var listener: ((Long) -> Unit)? = null
  private var pendingLaunch: String? = null
  private var readySeen = false
  private var idle = false
  private var sessionActive = false
  private var launchedCurrent = false
  private var abortSent = false
  private var lastPayload: String? = null
  private var currentSessionId: String? = null
  private var readyRuntime: String? = null
  private var readyProtocol: String? = null
  private var host: WeakReference<UnityHostActivity>? = null
  private val fallback = Runnable { deliverPendingAfterTimeout() }

  @JvmStatic
  fun onUnityMessage(raw: String) {
    val id: Long
    var rejected: Long? = null
    val returnToApp: Boolean
    synchronized(this) {
      id = requireNotNull(journal) { "Unity callback journal is not initialized." }.append(raw)
      val record = runCatching { JSONObject(raw) }.getOrNull()
      returnToApp = when (record?.optString("type")) {
        "Ready" -> {
          readySeen = true
          idle = true
          sessionActive = false
          val ready = record?.optJSONObject("payload")
          readyRuntime = ready?.optString("runtimeVersion")
          readyProtocol = ready?.optString("protocolVersion")
          main.removeCallbacks(fallback)
          rejected = pendingLaunch?.let { offer(it) }
          rejected != null
        }
        "Launched" -> {
          launchedCurrent = true
          false
        }
        "Exited" -> {
          sessionActive = false
          launchedCurrent = false
          true
        }
        "Error" -> {
          val payload = record?.optJSONObject("payload")
          if (payload?.optString("code") == "SESSION_BUSY") {
            // Unity was still releasing the previous launch: keep this launch and deliver it on the next Ready.
            if (pendingLaunch == null) pendingLaunch = lastPayload
            sessionActive = false
            launchedCurrent = false
            idle = false
            true
          } else {
            // An Error before Launched means this launch failed or was cancelled (bad package, LAUNCH_CANCELLED,
            // MODE_NOT_ALLOWED…). Unity cleans up and sends Ready; until then the next launch is queued.
            val sessionId = record?.optString("sessionId")?.takeIf { it.isNotEmpty() && it != "null" }
            val ours = sessionId == null || sessionId == currentSessionId
            val fatal = ours && (!launchedCurrent || payload?.optBoolean("fatal") == true)
            if (fatal) {
              sessionActive = false
              launchedCurrent = false
              idle = false
              if (readySeen && pendingLaunch != null) {
                main.removeCallbacks(fallback)
                main.postDelayed(fallback, READY_FALLBACK_MS)
              }
            }
            fatal
          }
        }
        else -> false
      }
    }
    if (returnToApp) main.post { bringAppToFront() }
    listener?.invoke(id)
    rejected?.let { listener?.invoke(it) }
  }

  @Synchronized
  fun initialize(context: Context, callback: (Long) -> Unit) {
    ensureJournal(context)
    listener = callback
  }

  @Synchronized
  fun ensureJournal(context: Context) {
    if (appContext == null) appContext = context.applicationContext
    if (journal == null) journal = CallbackJournal(context.applicationContext)
  }

  /**
   * Queues or delivers the launch. Returns null when accepted, [BUSY] when a session is still running in Unity, or the
   * mismatch reason when the idle Unity runtime is not the one the launch was started for.
   */
  @Synchronized
  fun requestLaunch(payload: String): String? {
    if (sessionActive) return BUSY
    if (readySeen && idle) {
      mismatch(payload)?.let { return it }
      deliver(payload)
    } else {
      pendingLaunch = payload
      if (readySeen) {
        main.removeCallbacks(fallback)
        main.postDelayed(fallback, READY_FALLBACK_MS)
      }
    }
    return null
  }

  @Synchronized
  fun isUnityAlive(): Boolean = readySeen && host?.get()?.isFinishing == false

  /** Session Unity is loading or playing in this process (null when idle or not booted). */
  @Synchronized
  fun activeSessionId(): String? = if (sessionActive && isUnityAlive()) currentSessionId else null

  /**
   * Runtime of the embedded Unity before the app asks BE to start: the last `Ready` when Unity already booted in this
   * process, otherwise the runtime the prebuild stamped from the Unity export (protocol unknown until `Ready`).
   */
  @Synchronized
  fun handshake(context: Context): Map<String, Any?> {
    if (readySeen && !readyRuntime.isNullOrEmpty())
      return mapOf("source" to "ready", "runtimeVersion" to readyRuntime, "protocolVersion" to readyProtocol)
    val embedded = runCatching {
      val info = context.packageManager.getApplicationInfo(context.packageName, android.content.pm.PackageManager.GET_META_DATA)
      info.metaData?.getString(RUNTIME_META)
    }.getOrNull()
    return if (embedded.isNullOrEmpty()) mapOf("source" to "unknown", "runtimeVersion" to null, "protocolVersion" to null)
    else mapOf("source" to "embedded", "runtimeVersion" to embedded, "protocolVersion" to null)
  }

  @Synchronized
  fun hasActiveSession(): Boolean = sessionActive

  /**
   * Back pressed in Unity. Returns false when there is nothing to stop (the caller brings the app back instead). While the
   * package loads only one Abort is sent; later presses are ignored until Unity answers.
   */
  @Synchronized
  fun requestAbort(reason: String): Boolean {
    if (!sessionActive) return false
    if (!launchedCurrent && abortSent) return true
    abortSent = true
    send("Abort", JSONObject().put("reason", reason).toString())
    return true
  }

  @Synchronized
  fun attachHost(activity: UnityHostActivity) {
    ensureJournal(activity)
    host = WeakReference(activity)
  }

  @Synchronized
  fun detachHost(activity: UnityHostActivity) {
    if (host?.get() === activity) host = null
    // The player of a destroyed activity is gone; a new host boots Unity again and waits for Ready.
    readySeen = false
    idle = false
    sessionActive = false
    launchedCurrent = false
  }

  fun send(method: String, payload: String) {
    main.post { UnityPlayer.UnitySendMessage(RECEIVER, method, payload) }
  }

  @Synchronized fun pending(): List<Map<String, Any>> = requireNotNull(journal).pending()
  @Synchronized fun acknowledge(id: Long) = requireNotNull(journal).acknowledge(id)

  /** Null when the last Ready matches the launch's runtime and protocol; otherwise a message for the app. */
  private fun mismatch(payload: String): String? {
    val launch = runCatching { JSONObject(payload) }.getOrNull() ?: return "Launch payload is not JSON."
    val runtime = launch.optString("runtimeVersion")
    val protocol = launch.optString("protocolVersion")
    if (runtime == readyRuntime && protocol == readyProtocol) return null
    return "Unity runtime $readyRuntime (protocol $readyProtocol) cannot play a launch for runtime $runtime (protocol $protocol)."
  }

  /** Delivers a queued launch that passes the handshake; returns the journaled Error id when it does not. */
  private fun offer(payload: String): Long? {
    val reason = mismatch(payload) ?: return null.also { deliver(payload) }
    return reject(payload, reason)
  }

  /** Drops a queued launch that failed the handshake and journals the Error the app shows for it. */
  private fun reject(payload: String, reason: String): Long {
    pendingLaunch = null
    val sessionId = runCatching { JSONObject(payload).optString("sessionId") }.getOrNull()
    val error = JSONObject()
      .put("type", "Error")
      .put("sessionId", sessionId ?: JSONObject.NULL)
      .put("payload", JSONObject().put("code", "RUNTIME_MISMATCH").put("message", reason).put("fatal", true))
    return requireNotNull(journal).append(error.toString())
  }

  private fun deliver(payload: String) {
    pendingLaunch = null
    lastPayload = payload
    currentSessionId = runCatching { JSONObject(payload).optString("sessionId") }.getOrNull()
    idle = false
    sessionActive = true
    launchedCurrent = false
    abortSent = false
    send("Launch", payload)
  }

  private fun deliverPendingAfterTimeout() {
    var rejected: Long? = null
    synchronized(this) {
      if (!sessionActive)
        rejected = pendingLaunch?.let { offer(it) }
    }
    rejected?.let { id ->
      bringAppToFront()
      listener?.invoke(id)
    }
  }

  /** Brings the React Native task (MainActivity) back, leaving the Unity task alive and paused behind it. */
  fun bringAppToFront() {
    val context = appContext ?: return
    val intent = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: return
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    context.startActivity(intent)
  }
}

private class CallbackJournal(context: Context) : SQLiteOpenHelper(context, "fire3d-unity-callbacks.db", null, 1) {
  override fun onCreate(db: SQLiteDatabase) {
    db.execSQL("CREATE TABLE callbacks (id INTEGER PRIMARY KEY AUTOINCREMENT, payload TEXT NOT NULL, received_at INTEGER NOT NULL)")
  }
  override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) = Unit
  override fun onConfigure(db: SQLiteDatabase) {
    super.onConfigure(db)
    db.execSQL("PRAGMA synchronous=FULL")
  }
  fun append(payload: String): Long {
    val values = ContentValues().apply { put("payload", payload); put("received_at", System.currentTimeMillis()) }
    return writableDatabase.insertOrThrow("callbacks", null, values)
  }
  fun pending(): List<Map<String, Any>> {
    val result = mutableListOf<Map<String, Any>>()
    readableDatabase.rawQuery("SELECT id, payload, received_at FROM callbacks ORDER BY id", null).use { cursor ->
      while (cursor.moveToNext())
        result.add(mapOf("id" to cursor.getLong(0), "payload" to cursor.getString(1), "receivedAt" to cursor.getLong(2)))
    }
    return result
  }
  fun acknowledge(id: Long) { writableDatabase.delete("callbacks", "id=?", arrayOf(id.toString())) }
}
