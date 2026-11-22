package io.github.narpheus.solmate;

import android.app.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.*;
import android.util.Base64;
import android.view.*;
import android.webkit.*;
import org.json.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;

public final class MainActivity extends Activity {
 private WebView web;
 private PlaybackService service;
 private boolean bound=false,destroyed=false;
 private ValueCallback<Uri[]> fileChoice;
 private byte[] exportBytes;
 private static final String ORIGIN="https://appassets.androidplatform.net";
 private final ServiceConnection connection=new ServiceConnection(){
  @Override public void onServiceConnected(ComponentName name,IBinder binder){
   service=((PlaybackService.LocalBinder)binder).service();bound=true;
   service.observer=state->runOnUiThread(()->js("window.__solAndroidState&&window.__solAndroidState("+state+")"));
   if(web.getUrl()==null)web.loadUrl(ORIGIN+"/assets/index.html");
  }
  @Override public void onServiceDisconnected(ComponentName name){service=null;bound=false;}
 };
 @Override public void onCreate(Bundle state){
  super.onCreate(state);getWindow().setStatusBarColor(0xff000000);getWindow().setNavigationBarColor(0xff000000);
  web=new WebView(this);setContentView(web);
  web.setOnApplyWindowInsetsListener((view,insets)->{view.setPadding(insets.getSystemWindowInsetLeft(),insets.getSystemWindowInsetTop(),insets.getSystemWindowInsetRight(),insets.getSystemWindowInsetBottom());return insets.consumeSystemWindowInsets();});
  WebSettings settings=web.getSettings();settings.setJavaScriptEnabled(true);settings.setDomStorageEnabled(true);settings.setDatabaseEnabled(true);
  settings.setMediaPlaybackRequiresUserGesture(false);settings.setAllowFileAccess(false);settings.setAllowContentAccess(true);settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
  settings.setBuiltInZoomControls(false);settings.setSupportZoom(false);web.addJavascriptInterface(new Bridge(),"AndroidHost");
  web.setWebViewClient(new WebViewClient(){
   @Override public WebResourceResponse shouldInterceptRequest(WebView view,WebResourceRequest request){
    Uri uri=request.getUrl();String url=uri.toString();
    try{
     if(url.equals("https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"))return asset("vendor/xlsx.full.min.js");
     if(uri.getScheme().equals("https")&&uri.getHost().equals("appassets.androidplatform.net")){
      String p=uri.getPath();if(p==null||p.contains(".."))return denied();
      if(p.startsWith("/assets/"))return asset(p.substring(8));
      if(p.startsWith("/audio/")&&p.substring(7).matches("[a-f0-9]{64}\\.wav")&&service!=null){
       File file=new File(service.audioDir,p.substring(7));return new WebResourceResponse("audio/wav",null,new FileInputStream(file));
      }
      return denied();
     }
    }catch(Exception e){return denied();}
    return null;
   }
   @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request){
    Uri uri=request.getUrl();if(ORIGIN.equals(uri.getScheme()+"://"+uri.getHost())&&uri.getPath().startsWith("/assets/"))return false;
    if(uri.getScheme().equals("https")||uri.getScheme().equals("http")){try{startActivity(new Intent(Intent.ACTION_VIEW,uri));}catch(Exception ignored){}return true;}
    return true;
   }
  });
  web.setWebChromeClient(new WebChromeClient(){
   @Override public boolean onShowFileChooser(WebView view,ValueCallback<Uri[]> result,FileChooserParams params){
    if(fileChoice!=null)fileChoice.onReceiveValue(null);fileChoice=result;
    Intent intent=new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*");
    intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE,false);startActivityForResult(intent,61);return true;
   }
  });
  startService(new Intent(this,PlaybackService.class));bindService(new Intent(this,PlaybackService.class),connection,BIND_AUTO_CREATE);
  if(Build.VERSION.SDK_INT>=33&&checkSelfPermission("android.permission.POST_NOTIFICATIONS")!=PackageManager.PERMISSION_GRANTED)requestPermissions(new String[]{"android.permission.POST_NOTIFICATIONS"},62);
 }
 private WebResourceResponse asset(String name)throws IOException{
  String mime=name.endsWith(".html")?"text/html":name.endsWith(".js")||name.endsWith(".mjs")?"application/javascript":name.endsWith(".css")?"text/css":name.endsWith(".json")||name.endsWith(".webmanifest")?"application/json":name.endsWith(".ttf")?"font/ttf":"text/plain";
  return new WebResourceResponse(mime,"UTF-8",getAssets().open("web/"+name));
 }
 private WebResourceResponse denied(){return new WebResourceResponse("text/plain","UTF-8",404,"Not Found",Collections.emptyMap(),new ByteArrayInputStream(new byte[0]));}
 private void js(String script){if(!destroyed&&web!=null)web.evaluateJavascript(script,null);}
 private void reply(int id,JSONObject result,String error){runOnUiThread(()->js("window.__solAndroidReply&&window.__solAndroidReply("+id+","+(result==null?"null":result.toString())+","+(error==null?"null":JSONObject.quote(error))+")"));}
 private final class Bridge {
  @JavascriptInterface public void request(String raw){
   if(raw.length()>16*1024*1024)return;
   try{JSONObject message=new JSONObject(raw);int id=message.getInt("id");String method=message.getString("method");JSONObject data=message.optJSONObject("payload");if(data==null)data=new JSONObject();final JSONObject payload=data;
    runOnUiThread(()->{
     if(destroyed||web.getUrl()==null||!web.getUrl().startsWith(ORIGIN+"/assets/")){reply(id,null,"앱 화면에서만 사용할 수 있습니다.");return;}
     if(method.equals("export")){
      try{exportBytes=Base64.decode(payload.optString("data",""),Base64.DEFAULT);Intent intent=new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType(payload.optString("mime","application/json"));intent.putExtra(Intent.EXTRA_TITLE,payload.optString("name","solmate-backup.json"));startActivityForResult(intent,63);reply(id,new JSONObject(),null);}catch(Exception e){reply(id,null,e.getMessage());}return;
     }
     if(service==null){reply(id,null,"음성 서비스에 연결 중입니다. 잠시 후 다시 눌러주세요.");return;}
     if(method.equals("download"))getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
     service.request(method,payload,(result,error)->{if(method.equals("download"))runOnUiThread(()->getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON));reply(id,result,error);});
    });
   }catch(Exception ignored){}
  }
 }
 @Override protected void onActivityResult(int requestCode,int resultCode,Intent data){
  super.onActivityResult(requestCode,resultCode,data);
  if(requestCode==61&&fileChoice!=null){Uri[] result=resultCode==RESULT_OK&&data!=null&&data.getData()!=null?new Uri[]{data.getData()}:null;fileChoice.onReceiveValue(result);fileChoice=null;}
  if(requestCode==63&&resultCode==RESULT_OK&&data!=null&&exportBytes!=null){try(OutputStream out=getContentResolver().openOutputStream(data.getData())){out.write(exportBytes);exportBytes=null;}catch(Exception e){new AlertDialog.Builder(this).setMessage("백업 저장 실패: "+e.getMessage()).setPositiveButton("확인",null).show();}}
 }
 @Override public void onBackPressed(){finish();}
 @Override protected void onDestroy(){destroyed=true;if(service!=null)service.observer=null;if(bound)unbindService(connection);if(web!=null){web.removeJavascriptInterface("AndroidHost");web.destroy();web=null;}super.onDestroy();}
}
