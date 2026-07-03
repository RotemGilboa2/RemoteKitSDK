package com.example.remotekit

import android.animation.Animator
import android.animation.AnimatorListenerAdapter
import android.os.Bundle
import android.util.Log
import android.view.View
import android.view.animation.AccelerateDecelerateInterpolator
import android.widget.Button
import android.widget.LinearLayout
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import com.example.remoteconfig_sdk.RemoteConfig

class MainActivity : AppCompatActivity() {

    private lateinit var rootLayout: View
    private lateinit var floatingStatusContainer: LinearLayout
    private lateinit var betaSection: LinearLayout
    private lateinit var liveDot: View
    private lateinit var btnPreOrder: Button

    private var animationsStarted = false
    private var isDestroyedActivity = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        rootLayout = findViewById(R.id.rootLayout)
        floatingStatusContainer = findViewById(R.id.floatingStatusContainer)
        betaSection = findViewById(R.id.betaSection)
        liveDot = findViewById(R.id.liveDot)
        btnPreOrder = findViewById(R.id.btnPreOrder)

        setupRemoteConfig()

        startUiAnimations()
    }

    override fun onResume() {
        super.onResume()
        RemoteConfig.refresh(listener = object : RemoteConfig.Listener {
            override fun onReady() {
                runOnUiThread {
                    RemoteConfig.autoApply(rootLayout)
                }
            }

            override fun onError(message: String) {
                Log.e("MainActivity", "Failed to refresh: $message")
            }
        })
    }

    override fun onDestroy() {
        isDestroyedActivity = true
        stopUiAnimations()
        super.onDestroy()
    }

    private fun setupRemoteConfig() {
        RemoteConfig.init(
            context = applicationContext,
            apiKey = "demo-project",
            baseUrl = "http://192.168.1.77:3001",
            country = "IL",
            listener = object : RemoteConfig.Listener {
                override fun onReady() {
                    runOnUiThread {

                        RemoteConfig.autoApply(rootLayout)

                        RemoteConfig.autoRegisterViews(rootLayout)
                    }
                }

                override fun onError(message: String) {
                    Toast.makeText(this@MainActivity, "SDK Error: $message", Toast.LENGTH_LONG).show()
                }
            }
        )
    }

    private fun startUiAnimations() {
        if (animationsStarted) return
        animationsStarted = true
        animateLiveDot()
        animateFloatingStatus()
        animateCtaButton()
    }

    private fun animateLiveDot() {
        if (isDestroyedActivity) return

        liveDot.animate()
            .alpha(0.25f)
            .scaleX(1.65f)
            .scaleY(1.65f)
            .setDuration(650)
            .setInterpolator(AccelerateDecelerateInterpolator())
            .setListener(object : AnimatorListenerAdapter() {
                override fun onAnimationEnd(animation: Animator) {
                    if (isDestroyedActivity) return

                    liveDot.animate()
                        .alpha(1f)
                        .scaleX(1f)
                        .scaleY(1f)
                        .setDuration(650)
                        .setInterpolator(AccelerateDecelerateInterpolator())
                        .setListener(object : AnimatorListenerAdapter() {
                            override fun onAnimationEnd(animation: Animator) {
                                animateLiveDot()
                            }
                        })
                        .start()
                }
            })
            .start()
    }

    private fun animateFloatingStatus() {
        floatingStatusContainer.translationY = -90f
        floatingStatusContainer.alpha = 0f

        floatingStatusContainer.animate()
            .translationY(0f)
            .alpha(1f)
            .setDuration(650)
            .setInterpolator(AccelerateDecelerateInterpolator())
            .start()
    }

    private fun animateCtaButton() {
        if (isDestroyedActivity) return

        btnPreOrder.animate()
            .scaleX(1.025f)
            .scaleY(1.025f)
            .setDuration(950)
            .setInterpolator(AccelerateDecelerateInterpolator())
            .setListener(object : AnimatorListenerAdapter() {
                override fun onAnimationEnd(animation: Animator) {
                    if (isDestroyedActivity) return

                    btnPreOrder.animate()
                        .scaleX(1f)
                        .scaleY(1f)
                        .setDuration(950)
                        .setInterpolator(AccelerateDecelerateInterpolator())
                        .setListener(object : AnimatorListenerAdapter() {
                            override fun onAnimationEnd(animation: Animator) {
                                animateCtaButton()
                            }
                        })
                        .start()
                }
            })
            .start()
    }

    private fun stopUiAnimations() {
        liveDot.animate().cancel()
        floatingStatusContainer.animate().cancel()
        btnPreOrder.animate().cancel()
        betaSection.animate().cancel()
    }
}