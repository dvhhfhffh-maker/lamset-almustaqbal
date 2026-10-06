package com.kinan.tahaddi;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.graphics.Color;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

public class MainActivity extends Activity {
    private static final String GAME_URL = "https://tahaddi-alashab-qwe-5564.vercel.app";
    private WebView webView;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        Window window = getWindow();
        window.setStatusBarColor(Color.rgb(7, 16, 31));
        window.setNavigationBarColor(Color.rgb(7, 16, 31));

        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(7, 16, 31));
        webView.setKeepScreenOn(true);
        setContentView(webView);

        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setJavaScriptCanOpenWindowsAutomatically(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setLoadsImagesAutomatically(true);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.LOLLIPOP) {
            s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        }
        s.setUserAgentString(s.getUserAgentString() + " TahaddiAlAshabAndroid/1.0");

        CookieManager.getInstance().setAcceptCookie(true);
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.LOLLIPOP) {
            CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true);
        }

        webView.setWebChromeClient(new WebChromeClient());
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String host = request.getUrl().getHost();
                if (host != null && host.endsWith("vercel.app")) {
                    return false;
                }
                return false;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                injectGameEnhancements();
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) {
                    Toast.makeText(MainActivity.this,
                            "تعذر الاتصال باللعبة. تأكد من الإنترنت ثم حاول مرة أخرى.",
                            Toast.LENGTH_LONG).show();
                }
            }
        });

        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState);
        } else {
            webView.loadUrl(GAME_URL);
        }
    }

    private void injectGameEnhancements() {
        String script =
            "(function(){try{" +
            "if(window.__tahaddiAndroidEnhanced)return;" +
            "window.__tahaddiAndroidEnhanced=true;" +
            "var actions=[" +
            "'قل اسم 7 مدن خلال 12 ثانية'," +
            "'اذكر 6 أكلات تبدأ بحروف مختلفة'," +
            "'قل 5 كلمات إنجليزية بدون توقف'," +
            "'اختر لاعبًا وامدحه بأربع صفات'," +
            "'قل جملة عادية وكأنك مذيع أخبار'," +
            "'قل جملة عادية وكأنك معلّق كرة قدم'," +
            "'قل جملة عادية وكأنك طفل صغير'," +
            "'مثّل أنك ربحت مليون ريال لمدة 10 ثوانٍ'," +
            "'مثّل أنك ضعت في مدينة غريبة لمدة 10 ثوانٍ'," +
            "'تكلم ببطء شديد لمدة 15 ثانية'," +
            "'تكلم بسرعة لمدة 10 ثوانٍ بدون أن تخطئ'," +
            "'قل أسماء 5 حيوانات خلال 7 ثوانٍ'," +
            "'قل أسماء 5 دول خلال 7 ثوانٍ'," +
            "'قل أسماء 5 تطبيقات خلال 7 ثوانٍ'," +
            "'اذكر 5 أشياء لونها أحمر'," +
            "'اذكر 5 أشياء تجدها في المطبخ'," +
            "'اذكر 5 أشياء تجدها في المدرسة'," +
            "'صف هاتفك بثلاث كلمات مضحكة'," +
            "'صف نفسك بثلاث كلمات إيجابية'," +
            "'احكِ موقفًا مضحكًا في 20 ثانية'," +
            "'اختر لاعبًا وقل له أجمل صفة فيه'," +
            "'قل أول ثلاث كلمات تخطر في بالك'," +
            "'اختر حرفًا وقل 6 كلمات تبدأ به'," +
            "'قل جملة كاملة بدون حرف م'," +
            "'قل جملة كاملة بدون حرف ا'," +
            "'قل جملة كاملة بدون حرف ن'," +
            "'قل أسماء 4 مشاهير خلال 8 ثوانٍ'," +
            "'قل أسماء 4 رياضات خلال 8 ثوانٍ'," +
            "'اختر لاعبًا وقلد طريقة ضحك خيالية له'," +
            "'اصنع إعلانًا قصيرًا لكوب ماء'," +
            "'اصنع إعلانًا قصيرًا لهاتفك'," +
            "'اصنع اسم فيلم عن المجموعة'," +
            "'اختر عنوانًا مضحكًا ليومك اليوم'," +
            "'قل مثلًا أو حكمة بصوت درامي'," +
            "'غنِّ أسماء ثلاثة أشياء حولك'," +
            "'قل كلمة صعبة خمس مرات بسرعة'," +
            "'صف أكلة تحبها وكأنها أغلى طبق في العالم'," +
            "'مثّل أنك مدير شركة لمدة 10 ثوانٍ'," +
            "'مثّل أنك مدرس يشرح درسًا مضحكًا'," +
            "'مثّل أنك سائح يسأل عن الطريق'," +
            "'قل تحية بثلاث لهجات مختلفة'," +
            "'قل شكراً بخمس طرق مختلفة'," +
            "'قل جملة رومانسية عن الشاي أو القهوة'," +
            "'اختر لاعبًا واسأله سؤالًا لطيفًا وعشوائيًا'," +
            "'قل 6 أسماء تبدأ بحرف محمد تختاره المجموعة'," +
            "'اذكر 5 مهن خلال 7 ثوانٍ'," +
            "'اذكر 5 ماركات سيارات خلال 8 ثوانٍ'," +
            "'قل وصفًا مضحكًا للإنترنت البطيء'," +
            "'مثّل أنك روبوت لمدة 12 ثانية'," +
            "'مثّل أنك مذيع طقس لمدة 12 ثانية'," +
            "'تكلم وكأنك في فيلم أكشن لمدة 12 ثانية'," +
            "'اختر شيئًا أمامك وامدحه بطريقة مبالغ فيها'," +
            "'قل ثلاث أمنيات بسيطة بسرعة'," +
            "'صف آخر وجبة أكلتها بدون ذكر اسمها'," +
            "'صف لاعبًا في المجموعة بدون ذكر اسمه والبقية يخمنون'," +
            "'اذكر 6 كلمات لها علاقة بالسفر'," +
            "'اذكر 6 كلمات لها علاقة بالرياضة'," +
            "'اذكر 6 كلمات لها علاقة بالمدرسة'," +
            "'اختر رقمًا من 1 إلى 10 واذكر هذا العدد من الكلمات السهلة'," +
            "'قل جملة تبدأ بكل كلمة بحرف مختلف'," +
            "'قل شيئًا مضحكًا حدث لك هذا الأسبوع'," +
            "'قل اسم أغنية أو فيلم بطريقة تمثيلية والبقية يخمنون'," +
            "'قل جملة وكأنك تتحدث عبر الراديو القديم'," +
            "'قل جملة وكأنك بطل لعبة فيديو'," +
            "'اختر لاعبًا وقل له لقبًا مضحكًا ولطيفًا'," +
            "'اختر شيئًا في الغرفة واخترع له استخدامًا جديدًا'," +
            "'قل ثلاثة أسباب تجعلك تستحق نقطة إضافية'," +
            "'اذكر 5 كلمات تنتهي بنفس الحرف'," +
            "'اذكر 5 كلمات قصيرة جدًا بسرعة'," +
            "'قل أربعة أسماء أولاد وأربعة أسماء بنات بسرعة'," +
            "'قل ثلاثة ألوان وثلاث فواكه وثلاث مدن بسرعة'," +
            "'صف يومك في خمس كلمات فقط'," +
            "'قل نكتة قصيرة أو موقفًا طريفًا'," +
            "'مثّل أنك تتلقى جائزة عالمية'," +
            "'مثّل أنك تجري مقابلة عمل مضحكة'," +
            "'قل رسالة صوتية خيالية لشخص نسي موعده'," +
            "'اختر لاعبًا وقل له سؤال اختيار بين شيئين'," +
            "'قل ثلاث كلمات جميلة عن الصداقة'," +
            "'قل خمس كلمات تبدأ بآخر حرف من اسمك'," +
            "'اختر أكلة واصفها بدون ذكر اسمها'," +
            "'اختر دولة واصفها بدون ذكر اسمها'" +
            "];" +
            "var styles=[" +
            "'بصوت جاد جدًا'," +
            "'بصوت مذيع'," +
            "'بسرعة'," +
            "'ببطء'," +
            "'وأنت تحاول ألا تضحك'," +
            "'بأسلوب درامي'," +
            "'بأسلوب رياضي'," +
            "'كأنك في إعلان'," +
            "'كأنك روبوت'," +
            "'كأنك فزت بجائزة'," +
            "'بطريقة فكاهية'," +
            "'بثقة شديدة'" +
            "];" +
            "if(typeof punishments!=='undefined' && Array.isArray(punishments)){" +
            "for(var i=0;i<actions.length;i++){" +
            "for(var j=0;j<styles.length;j++){" +
            "var p=actions[i]+' — '+styles[j];" +
            "if(punishments.indexOf(p)===-1)punishments.push(p);" +
            "}" +
            "}" +
            "}" +
            "if(typeof ICE!=='undefined' && ICE.iceServers){" +
            "ICE.iceServers.push({urls:'stun:stun.cloudflare.com:3478'});" +
            "ICE.iceServers.push({urls:'stun:global.stun.twilio.com:3478'});" +
            "}" +
            "}catch(e){console.log('Tahaddi enhancement',e);}})();";
        webView.evaluateJavascript(script, null);
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) webView.onResume();
    }

    @Override
    protected void onPause() {
        if (webView != null) webView.onPause();
        super.onPause();
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        if (webView != null) webView.saveState(outState);
        super.onSaveInstanceState(outState);
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }
}
