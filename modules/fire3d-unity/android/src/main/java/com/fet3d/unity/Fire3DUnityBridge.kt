package com.fet3d.unity

import android.content.Context
import android.content.ContentValues
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import android.os.Handler
import android.os.Looper
import com.unity3d.player.UnityPlayer
import org.json.JSONObject

/** Unity calls this exact static method; callback storage commits before JS is notified. */
object Fire3DUnityBridge {
  private var journal: CallbackJournal? = null
  private var listener: ((Long) -> Unit)? = null
  private var launchPayload: String? = null

  @JvmStatic @Synchronized
  fun onUnityMessage(raw: String) {
    val id = requireNotNull(journal) { "Unity callback journal is not initialized." }.append(raw)
    val record = JSONObject(raw)
    if (record.optString("type") == "Ready") {
      launchPayload?.let { payload ->
        launchPayload = null
        Handler(Looper.getMainLooper()).post { UnityPlayer.UnitySendMessage("Fire3DBridge", "Launch", payload) }
      }
    }
    listener?.invoke(id)
  }
  @Synchronized fun initialize(context: Context, callback: (Long) -> Unit) {
    if (journal == null) journal = CallbackJournal(context.applicationContext)
    listener = callback
  }
  @Synchronized fun setLaunch(payload: String) { launchPayload = payload }
  @Synchronized fun pending(): List<Map<String, Any>> = requireNotNull(journal).pending()
  @Synchronized fun acknowledge(id: Long) = requireNotNull(journal).acknowledge(id)
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
    readableDatabase.rawQuery("SELECT id, payload FROM callbacks ORDER BY id", null).use { cursor ->
      while (cursor.moveToNext()) result.add(mapOf("id" to cursor.getLong(0), "payload" to cursor.getString(1)))
    }
    return result
  }
  fun acknowledge(id: Long) { writableDatabase.delete("callbacks", "id=?", arrayOf(id.toString())) }
}
