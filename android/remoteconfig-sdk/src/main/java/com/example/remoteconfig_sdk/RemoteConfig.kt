package com.example.remoteconfig_sdk

import android.content.Context
import android.content.SharedPreferences
import android.graphics.drawable.ColorDrawable
import android.util.Log
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.UUID

object RemoteConfig {

    private const val TAG = "RemoteConfigSDK"
    private const val PREFS_NAME = "remote_config_prefs"
    private const val KEY_DEVICE_ID = "device_id"
    private const val KEY_CACHE = "config_cache"
    private const val KEY_LAST_FETCH = "last_fetch_time"

    private const val TTL_MILLIS = 0L // change to 3600000L in production

    private var appContext: Context? = null
    private lateinit var prefs: SharedPreferences

    private var initialized = false
    private var apiKey: String = ""
    private var baseUrl: String = ""
    private var country: String = "IL"

    private var configsCache = JSONObject()

    interface Listener {
        fun onReady()
        fun onError(message: String)
    }


    fun init(
        context: Context,
        apiKey: String,
        baseUrl: String,
        country: String? = null,
        listener: Listener? = null
    ) {
        if (initialized) {
            listener?.onReady()
            return
        }

        this.appContext = context.applicationContext
        this.prefs = this.appContext!!.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

        this.apiKey = apiKey.trim()
        this.baseUrl = baseUrl.trim()
        this.country = country ?: java.util.Locale.getDefault().country

        loadFromLocalCache()

        if (configsCache.length() > 0) {
            initialized = true
            listener?.onReady()

            if (isCacheExpired()) {
                Log.d(TAG, "Cache expired. Fetching fresh data silently in background...")
                fetchFromServer(null)
            }
        } else {
            Log.d(TAG, "No local cache found. Fetching from server for the first time...")
            fetchFromServer(listener)
        }
    }

    fun refresh(force: Boolean = false, listener: Listener? = null) {
        if (!initialized) {
            listener?.onError("SDK not initialized yet")
            return
        }

        if (!force && !isCacheExpired()) {
            Log.d(TAG, "Refresh skipped: Cache is still valid. Using local data.")
            listener?.onReady()
            return
        }

        Log.d(TAG, "Fetching fresh data from server...")
        fetchFromServer(listener)
    }

    private fun fetchFromServer(listener: Listener?) {
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val deviceId = getOrCreateDeviceId()
                val urlString = "$baseUrl/api/v1/config?apiKey=$apiKey&deviceId=$deviceId&country=$country"

                Log.d("SCANNER_DEBUG", "📡 Syncing Health & Configs: $urlString")

                val url = URL(urlString)
                val connection = url.openConnection() as HttpURLConnection
                connection.requestMethod = "GET"
                connection.connectTimeout = 5000

                if (connection.responseCode == HttpURLConnection.HTTP_OK) {
                    val response = connection.inputStream.bufferedReader().use { it.readText() }
                    val jsonResponse = JSONObject(response)

                    if (jsonResponse.has("configs")) {
                        configsCache = jsonResponse.getJSONObject("configs")
                        saveToLocalCache(configsCache.toString())
                    }

                    initialized = true
                    CoroutineScope(Dispatchers.Main).launch {
                        listener?.onReady()
                    }
                } else {
                    handleError("Server error: ${connection.responseCode}", listener)
                }
            } catch (e: Exception) {
                handleError("Network exception: ${e.message}", listener)
            }
        }
    }

    private fun handleError(message: String, listener: Listener?) {
        Log.e(TAG, message)
        CoroutineScope(Dispatchers.Main).launch {
            listener?.onError(message)
        }
    }

    private fun loadFromLocalCache() {
        val cachedData = prefs.getString(KEY_CACHE, null)
        if (cachedData != null) {
            try {
                configsCache = JSONObject(cachedData)
            } catch (e: Exception) {
                configsCache = JSONObject()
            }
        }
    }

    private fun saveToLocalCache(jsonData: String) {
        prefs.edit()
            .putString(KEY_CACHE, jsonData)
            .putLong(KEY_LAST_FETCH, System.currentTimeMillis())
            .apply()
    }

    private fun isCacheExpired(): Boolean {
        val lastFetch = prefs.getLong(KEY_LAST_FETCH, 0L)
        return (System.currentTimeMillis() - lastFetch) > TTL_MILLIS
    }

    private fun getOrCreateDeviceId(): String {
        var id = prefs.getString(KEY_DEVICE_ID, null)
        if (id == null) {
            id = UUID.randomUUID().toString()
            prefs.edit().putString(KEY_DEVICE_ID, id).apply()
        }
        return id
    }

    fun getString(key: String, defaultValue: String): String {
        if (!configsCache.has(key)) return defaultValue
        return configsCache.optString(key, defaultValue)
    }

    fun getBoolean(key: String, defaultValue: Boolean): Boolean {
        if (!configsCache.has(key)) return defaultValue
        val value = configsCache.get(key)
        return if (value is String) value.toBoolean() else configsCache.optBoolean(key, defaultValue)
    }

    fun getNumber(key: String, defaultValue: Int): Int {
        if (!configsCache.has(key)) return defaultValue
        val value = configsCache.get(key)
        return if (value is String) value.toIntOrNull() ?: defaultValue else configsCache.optInt(key, defaultValue)
    }

    fun getDouble(key: String, defaultValue: Double): Double {
        if (!configsCache.has(key)) return defaultValue
        val value = configsCache.get(key)
        return (if (value is String) value.toDoubleOrNull() ?: defaultValue else configsCache.optDouble(key, defaultValue)) as Double
    }

    fun autoRegisterViews(rootView: View) {
        Log.d("SCANNER_DEBUG", "1. autoRegisterViews started!")

        if (apiKey.isEmpty() || baseUrl.isEmpty()) {
            Log.e("SCANNER_DEBUG", "ERROR: apiKey or baseUrl is missing.")
            return
        }

        val elementsArray = JSONArray()
        scanViewHierarchy(rootView, elementsArray)

        Log.d("SCANNER_DEBUG", "2. Scan finished. Found ${elementsArray.length()} elements.")

        if (elementsArray.length() > 0) {
            Log.d("SCANNER_DEBUG", "3. Attempting to send data to server...")
            sendAutoRegistrationToServer(elementsArray)
        }
    }

    private fun scanViewHierarchy(view: View, elementsArray: JSONArray) {
        if (view.id != View.NO_ID) {
            try {
                val idName = view.resources.getResourceEntryName(view.id)
                val elementJson = JSONObject()
                elementJson.put("id", idName)
                elementJson.put("type", view.javaClass.simpleName)

                if (view is TextView) {
                    elementJson.put("text", view.text.toString())
                    val hexTextColor = String.format("#%06X", 0xFFFFFF and view.currentTextColor)
                    elementJson.put("textColor", hexTextColor)
                    val sizeSp = view.textSize / view.resources.displayMetrics.scaledDensity
                    elementJson.put("textSize", sizeSp.toDouble())
                }

                val background = view.background
                if (background is ColorDrawable) {
                    val hexColor = String.format("#%06X", 0xFFFFFF and background.color)
                    elementJson.put("bgColor", hexColor)
                }

                elementJson.put("isVisible", view.visibility == View.VISIBLE)
                elementsArray.put(elementJson)
            } catch (e: Exception) {
                // מתעלמים
            }
        }

        if (view is ViewGroup) {
            for (i in 0 until view.childCount) {
                scanViewHierarchy(view.getChildAt(i), elementsArray)
            }
        }
    }

    private fun sendAutoRegistrationToServer(elementsArray: JSONArray) {
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val url = URL("$baseUrl/api/config/auto-register")
                val connection = url.openConnection() as HttpURLConnection
                connection.requestMethod = "POST"
                connection.setRequestProperty("Content-Type", "application/json")
                connection.doOutput = true

                val payload = JSONObject()
                payload.put("projectId", apiKey)
                payload.put("elements", elementsArray)

                connection.outputStream.use { os ->
                    val input = payload.toString().toByteArray(Charsets.UTF_8)
                    os.write(input, 0, input.size)
                }

                if (connection.responseCode == 200 || connection.responseCode == 201) {
                    Log.d("SCANNER_DEBUG", "Auto-registration successful! Portal updated.")
                }
                connection.disconnect()
            } catch (e: Exception) {
                Log.e(TAG, "Error sending auto-registration: ${e.message}")
            }
        }
    }

    private fun trackClickEvent(elementId: String, variantValue: String) {
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val url = URL("$baseUrl/api/analytics/click")
                val conn = url.openConnection() as HttpURLConnection
                conn.requestMethod = "POST"
                conn.setRequestProperty("Content-Type", "application/json; charset=utf-8")
                conn.doOutput = true

                val payload = JSONObject()
                payload.put("projectId", apiKey)
                payload.put("elementId", elementId)
                payload.put("variantValue", variantValue)
                payload.put("country", country)

                val os = conn.outputStream
                os.write(payload.toString().toByteArray(Charsets.UTF_8))
                os.close()

                if (conn.responseCode == 200) {
                    Log.d("SCANNER_DEBUG", "📊 Click Tracked! Element: $elementId | Variant: $variantValue")
                }
                conn.disconnect()
            } catch (e: Exception) {
                Log.e("SCANNER_DEBUG", "Error tracking click: ${e.message}")
            }
        }
    }

    fun autoApply(rootView: View) {
        if (!initialized) {
            Log.e(TAG, "SDK not initialized. Cannot apply config.")
            return
        }

        Log.d("SCANNER_DEBUG", "Starting Auto-Apply injection...")
        applyToViewHierarchy(rootView)
    }

    @android.annotation.SuppressLint("ClickableViewAccessibility")
    private fun applyToViewHierarchy(view: View) {
        if (view.id != View.NO_ID) {
            try {
                val idName = view.resources.getResourceEntryName(view.id)

                if (view is TextView) {
                    val textKey = "${idName}_text"
                    val currentText = view.text.toString()
                    val newText = getString(textKey, currentText)
                    if (newText != currentText) view.text = newText

                    val textColorKey = "${idName}_textColor"
                    val newTextColorHex = getString(textColorKey, "NOT_FOUND")
                    if (newTextColorHex != "NOT_FOUND") {
                        try {
                            view.setTextColor(android.graphics.Color.parseColor(newTextColorHex))
                        } catch (e: Exception) {}
                    }

                    val textSizeKey = "${idName}_textSize"
                    val newTextSize = getDouble(textSizeKey, -1.0)
                    if (newTextSize != -1.0) {
                        view.textSize = newTextSize.toFloat()
                    }
                }

                val colorKey = "${idName}_bgColor"
                val newColorHex = getString(colorKey, "NOT_FOUND")
                if (newColorHex != "NOT_FOUND") {
                    try {
                        val parsedColor = android.graphics.Color.parseColor(newColorHex)
                        if (view is android.widget.Button) {
                            view.backgroundTintList = android.content.res.ColorStateList.valueOf(parsedColor)
                        } else {
                            view.setBackgroundColor(parsedColor)
                        }
                    } catch (e: Exception) {}
                }

                val visibilityKey = "${idName}_isVisible"
                val defaultVisibility = view.visibility == View.VISIBLE
                val isVisible = getBoolean(visibilityKey, defaultVisibility)
                view.visibility = if (isVisible) View.VISIBLE else View.GONE

                if (view is android.widget.Button) {
                    view.setOnTouchListener { v, event ->
                        if (event.action == android.view.MotionEvent.ACTION_UP) {
                            val button = v as android.widget.Button
                            val currentVariant = button.text.toString()
                            trackClickEvent(idName, currentVariant)
                        }
                        false
                    }
                }
            } catch (e: Exception) {}
        }

        if (view is ViewGroup) {
            for (i in 0 until view.childCount) {
                applyToViewHierarchy(view.getChildAt(i))
            }
        }
    }
}