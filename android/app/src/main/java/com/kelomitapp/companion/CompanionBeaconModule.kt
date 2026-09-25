package com.kelomitapp.companion

import android.content.Context
import android.net.wifi.WifiManager
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import org.json.JSONException
import org.json.JSONObject
import java.io.IOException
import java.net.DatagramPacket
import java.net.InetAddress
import java.net.MulticastSocket

/**
 * Listens for the desktop companion's UDP presence beacon (see
 * desktop/src/main/beacon.ts) and forwards each one to JS as a
 * `companionBeacon` device event. Runs only between start() and stop(): the
 * JS side brackets the app's foreground time, so the multicast lock (a
 * battery cost on some radios) is never held in the background.
 */
class CompanionBeaconModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  private var socket: MulticastSocket? = null
  private var lock: WifiManager.MulticastLock? = null

  override fun getName() = "CompanionBeacon"

  @ReactMethod
  fun start(promise: Promise) {
    if (socket != null) {
      promise.resolve(null)
      return
    }
    try {
      val wifi = reactApplicationContext.applicationContext
        .getSystemService(Context.WIFI_SERVICE) as WifiManager
      lock = wifi.createMulticastLock("kelomit-beacon").apply {
        setReferenceCounted(false)
        acquire()
      }
      val s = MulticastSocket(PORT)
      try {
        @Suppress("DEPRECATION")
        s.joinGroup(InetAddress.getByName(GROUP))
      } catch (e: Exception) {
        s.close()
        throw e
      }
      socket = s
      Thread({ loop(s) }, "kelomit-beacon").apply {
        isDaemon = true
        start()
      }
      promise.resolve(null)
    } catch (e: Exception) {
      release()
      promise.reject("BEACON_START", e.message, e)
    }
  }

  @ReactMethod
  fun stop(promise: Promise) {
    release()
    promise.resolve(null)
  }

  private fun release() {
    socket?.close()
    socket = null
    lock?.let { if (it.isHeld) it.release() }
    lock = null
  }

  /** JS reload / host teardown without a stop(): free the socket and the lock. */
  override fun invalidate() {
    release()
    super.invalidate()
  }

  private fun loop(s: MulticastSocket) {
    val buf = ByteArray(1024)
    while (!s.isClosed) {
      val packet = DatagramPacket(buf, buf.size)
      try {
        s.receive(packet)
      } catch (e: IOException) {
        if (s.isClosed) break else continue // closed by stop(), or a transient error
      }
      val json = try {
        JSONObject(String(packet.data, 0, packet.length, Charsets.UTF_8))
      } catch (e: JSONException) {
        continue
      }
      if (json.optString("k") != "kelomit") continue
      val id = if (json.isNull("id")) "" else json.optString("id")
      val name = if (json.isNull("name")) "" else json.optString("name")
      val port = json.optInt("port", 0)
      if (id.isEmpty() || port <= 0 || port > 65535) continue
      val ctx = reactApplicationContext
      if (!ctx.hasActiveReactInstance()) continue
      val map = Arguments.createMap().apply {
        putString("ip", packet.address.hostAddress)
        putInt("port", port)
        putString("id", id)
        putString("name", name)
      }
      ctx.emitDeviceEvent("companionBeacon", map)
    }
  }

  companion object {
    const val PORT = 53318
    const val GROUP = "224.0.0.167"
  }
}
