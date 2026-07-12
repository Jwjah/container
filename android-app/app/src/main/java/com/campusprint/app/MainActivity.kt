package com.campusprint.app

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.webkit.*
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import dagger.hilt.android.AndroidEntryPoint

@AndroidEntryPoint
class MainActivity : ComponentActivity() {

    private var filePathCallback: ValueCallback<Array<Uri>>? = null

    // Register file chooser contract to handle file uploads inside WebView
    private val fileChooserLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        if (result.resultCode == Activity.RESULT_OK) {
            val data: Intent? = result.data
            val results = WebChromeClient.FileChooserParams.parseResult(result.resultCode, data)
            filePathCallback?.onReceiveValue(results)
        } else {
            filePathCallback?.onReceiveValue(null)
        }
        filePathCallback = null
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        // Fullscreen WebView configuration
        val webView = WebView(this).apply {
            layoutParams = android.view.ViewGroup.LayoutParams(
                android.view.ViewGroup.LayoutParams.MATCH_PARENT,
                android.view.ViewGroup.LayoutParams.MATCH_PARENT
            )
            
            // Web settings optimizing for high-performance React/Next.js apps
            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                databaseEnabled = true
                allowFileAccess = true
                allowContentAccess = true
                useWideViewPort = true
                loadWithOverviewMode = true
                javaScriptCanOpenWindowsAutomatically = true
                mediaPlaybackRequiresUserGesture = false
                mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
            }

            // Keep navigation inside the WebView itself
            webViewClient = object : WebViewClient() {
                override fun onPageFinished(view: WebView?, url: String?) {
                    super.onPageFinished(view, url)
                    injectHideBannerScript(view)
                }

                override fun shouldOverrideUrlLoading(
                    view: WebView?,
                    request: WebResourceRequest?
                ): Boolean {
                    val url = request?.url?.toString() ?: return false
                    // Stay inside the WebView for your domain
                    if (url.contains("container-ruby.vercel.app") || url.contains("localhost")) {
                        return false
                    }
                    // Open external links (e.g. payment pages, email links) in external browser
                    try {
                        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
                        startActivity(intent)
                    } catch (e: Exception) {
                        // Fallback
                    }
                    return true
                }
            }

            // Handle file pickers and uploads
            webChromeClient = object : WebChromeClient() {
                override fun onShowFileChooser(
                    webView: WebView?,
                    filePathCallback: ValueCallback<Array<Uri>>?,
                    fileChooserParams: FileChooserParams?
                ): Boolean {
                    this@MainActivity.filePathCallback?.onReceiveValue(null)
                    this@MainActivity.filePathCallback = filePathCallback

                    val intent = fileChooserParams?.createIntent()
                    if (intent != null) {
                        fileChooserLauncher.launch(intent)
                        return true
                    }
                    return false
                }
            }
        }

        setContentView(webView)

        // Load the live website version
        webView.loadUrl("https://container-ruby.vercel.app")
    }

    private fun injectHideBannerScript(webView: WebView?) {
        val js = """
            (function() {
                function hideInstallBanner() {
                    var xpath = "//*[contains(text(), 'Install CampusPrint')]";
                    var matchingElement = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
                    if (matchingElement) {
                        var parent = matchingElement.parentElement;
                        while (parent && parent !== document.body) {
                            if (window.getComputedStyle(parent).position === 'fixed') {
                                parent.style.display = 'none';
                                return true;
                            }
                            parent = parent.parentElement;
                        }
                    }
                    return false;
                }
                
                // Perform immediate clean up
                hideInstallBanner();
                
                // Monitor the DOM dynamically to remove the banner as soon as React mounts it
                var observer = new MutationObserver(function(mutations, obs) {
                    if (hideInstallBanner()) {
                        // Keep observing to handle potential remounts during route changes
                    }
                });
                observer.observe(document.documentElement, { childList: true, subtree: true });
            })()
        """.trimIndent()
        webView?.evaluateJavascript(js, null)
    }

    override fun onBackPressed() {
        val webView = findViewById<WebView>(android.R.id.content)
        if (webView != null && webView.canGoBack()) {
            webView.goBack()
        } else {
            super.onBackPressed()
        }
    }
}
