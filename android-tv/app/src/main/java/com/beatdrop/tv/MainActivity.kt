package com.beatdrop.tv

import android.annotation.SuppressLint
import android.app.Activity
import android.graphics.Color
import android.os.Bundle
import android.view.Gravity
import android.view.KeyEvent
import android.view.View
import android.view.WindowManager
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.ImageView

class MainActivity : Activity() {
    private lateinit var webView: WebView
    private lateinit var splashView: ImageView
    private val serverPort = 3000

    companion object {
        @Volatile
        private var embeddedServer: EmbeddedBeatdropServer? = null
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Keep TV screen awake during party games
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        // 1. Start the standalone embedded HTTP + SSE Server inside the APK on port 3000
        if (embeddedServer == null) {
            embeddedServer = EmbeddedBeatdropServer(applicationContext, serverPort).also {
                it.start()
            }
        }

        val rootLayout = FrameLayout(this).apply {
            setBackgroundColor(Color.parseColor("#07060E"))
        }

        // 2. Configure full-screen TV WebView with Auto-Play Audio enabled
        webView = WebView(this).apply {
            setBackgroundColor(Color.parseColor("#07060E"))
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            // CRITICAL for TV: allows Phone Remote to trigger song playback without clicking the TV remote!
            settings.mediaPlaybackRequiresUserGesture = false
            settings.mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
            settings.cacheMode = WebSettings.LOAD_DEFAULT

            webChromeClient = WebChromeClient()
            webViewClient = object : WebViewClient() {
                override fun onPageFinished(view: WebView?, url: String?) {
                    super.onPageFinished(view, url)
                    // Smoothly fade out the TV splash screen once the stage UI is ready
                    splashView.animate()
                        .alpha(0f)
                        .setDuration(450)
                        .withEndAction { splashView.visibility = View.GONE }
                        .start()
                }
            }
        }

        // 3. Full-screen TV Splash Screen overlay while embedded server & WebView initialize
        splashView = ImageView(this).apply {
            setImageResource(R.drawable.tv_splash)
            scaleType = ImageView.ScaleType.CENTER_CROP
            layoutParams = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT,
                Gravity.CENTER
            )
        }

        rootLayout.addView(webView, FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.MATCH_PARENT
        ))
        rootLayout.addView(splashView)

        setContentView(rootLayout)

        // 4. Load the Synced TV Stage view from the local embedded server
        webView.loadUrl("http://127.0.0.1:$serverPort/tv")
    }

    override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
        if (keyCode == KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE || keyCode == KeyEvent.KEYCODE_MEDIA_PLAY || keyCode == KeyEvent.KEYCODE_MEDIA_PAUSE) {
            webView.evaluateJavascript(
                "window.dispatchEvent(new KeyboardEvent('keydown', { key: 'MediaPlayPause' }));",
                null
            )
            return true
        }
        if (keyCode == KeyEvent.KEYCODE_BACK && webView.canGoBack()) {
            webView.goBack()
            return true
        }
        return super.onKeyDown(keyCode, event)
    }

    override fun onDestroy() {
        super.onDestroy()
        if (isFinishing) {
            embeddedServer?.stop()
            embeddedServer = null
        }
        webView.destroy()
    }
}
