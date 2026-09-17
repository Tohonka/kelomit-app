package com.kelomitapp.widget

import android.app.Activity
import android.app.AlertDialog
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.codescanner.GmsBarcodeScannerOptions
import com.google.mlkit.vision.codescanner.GmsBarcodeScanning
import com.kelomitapp.MainActivity
import com.kelomitapp.R
import org.json.JSONObject

/**
 * The food widget's barcode button. A see-through activity rather than a
 * broadcast receiver: Android 14+ won't let a receiver start the scanner UI.
 *
 * Known barcode → queued + toast, the app never opens. Unknown → a small
 * dialog: add anyway (placeholder name; the app tries Open Food Facts when it
 * drains the queue) or add + edit (deep link into the editor).
 */
class FoodScanActivity : Activity() {

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    // A recreated instance would launch a second scanner over the first.
    if (savedInstanceState != null) { finish(); return }
    val options = GmsBarcodeScannerOptions.Builder()
      .setBarcodeFormats(Barcode.FORMAT_EAN_13, Barcode.FORMAT_EAN_8, Barcode.FORMAT_UPC_A)
      .enableAutoZoom()
      .build()
    GmsBarcodeScanning.getClient(this, options)
      .startScan()
      .addOnSuccessListener { onCode(it.rawValue) }
      .addOnCanceledListener { finish() }
      .addOnFailureListener { finish() }
  }

  private fun onCode(code: String?) {
    if (code.isNullOrBlank()) { finish(); return }
    val known = FoodWidgetStore.byBarcode(this, code)
    if (known != null) {
      FoodWidgetStore.queue(this, known)
      FoodWidgetProvider.toastAdded(this, known.optString("name"))
      finish()
      return
    }
    AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Dialog_Alert)
      .setTitle(R.string.widget_food_unknown_title)
      .setMessage(getString(R.string.widget_food_unknown_message, code))
      .setPositiveButton(R.string.widget_food_add_anyway) { _, _ ->
        val name = getString(R.string.widget_food_placeholder, code.takeLast(4))
        FoodWidgetStore.queue(this, JSONObject().put("name", name), code)
        FoodWidgetProvider.toastAdded(this, name)
        finish()
      }
      .setNeutralButton(R.string.widget_food_add_edit) { _, _ ->
        startActivity(
          Intent(Intent.ACTION_VIEW, Uri.parse("kelomit://food/scan/$code"))
            .setClass(this, MainActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP),
        )
        finish()
      }
      .setNegativeButton(android.R.string.cancel) { _, _ -> finish() }
      .setOnCancelListener { finish() }
      .show()
  }
}
