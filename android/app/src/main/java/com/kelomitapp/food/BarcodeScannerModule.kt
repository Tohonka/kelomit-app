package com.kelomitapp.food

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.codescanner.GmsBarcodeScannerOptions
import com.google.mlkit.vision.codescanner.GmsBarcodeScanning

/**
 * Google code scanner (play-services-code-scanner). Play Services draws the
 * scan UI in its own process, so this app needs no camera permission and no
 * camera view — and no VisionCamera, which would force a nitro-modules bump
 * that breaks the WAV recorder (plan 2026-09-14 F2).
 *
 * The `barcode_ui` module is fetched at install time via the manifest
 * `com.google.mlkit.vision.DEPENDENCIES` meta-data; afterwards scanning is
 * fully offline.
 */
class BarcodeScannerModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName() = "BarcodeScanner"

  /** Resolves the raw barcode value, or null when the user backs out. */
  @ReactMethod
  fun scan(promise: Promise) {
    val options = GmsBarcodeScannerOptions.Builder()
      .setBarcodeFormats(
        Barcode.FORMAT_EAN_13,
        Barcode.FORMAT_EAN_8,
        Barcode.FORMAT_UPC_A,
        Barcode.FORMAT_QR_CODE,
      )
      .enableAutoZoom()
      .build()
    val ctx = reactApplicationContext.currentActivity ?: reactApplicationContext
    GmsBarcodeScanning.getClient(ctx, options)
      .startScan()
      .addOnSuccessListener { promise.resolve(it.rawValue) }
      .addOnCanceledListener { promise.resolve(null) }
      .addOnFailureListener { promise.reject("SCAN_FAILED", it.message, it) }
  }
}
