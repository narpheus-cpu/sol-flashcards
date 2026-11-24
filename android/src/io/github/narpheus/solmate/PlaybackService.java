package io.github.narpheus.solmate;

import android.app.*;
import android.content.*;
import android.media.*;
import android.media.session.*;
import android.os.*;
import android.speech.tts.*;
import org.json.*;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.*;
import java.util.concurrent.*;

/** Playback and synthesis belong to this service, never the WebView lifecycle. */
public final class PlaybackService extends Service {
 public interface Reply {void done(JSONObject result,String error);}
 public interface Observer {void state(JSONObject state);}
 public final class LocalBinder extends Binder {public PlaybackService service(){return PlaybackService.this;}}
 private final IBinder binder=new LocalBinder();
 private final Handler main=new Handler(Looper.getMainLooper());
 private final ExecutorService engineWork=Executors.newSingleThreadExecutor();
 private final ExecutorService downloads=Executors.newSingleThreadExecutor();
 public SupertonicEngine engine;
 public File audioDir,modelDir;
 public volatile Observer observer;
 private MediaPlayer player;
 private float currentRate=1;
 private MediaSession media;
 private AudioManager audioManager;
 private AudioFocusRequest focus;
 private PowerManager.WakeLock wake;
 private TextToSpeech systemTts;
 private boolean systemReady=false,active=false,paused=false;
 private volatile boolean cancelDownload=false;
 private JSONObject job;
 private JSONArray cards=new JSONArray();
 private JSONObject cfg=new JSONObject(),settings=new JSONObject();
 private int index=0,line=0,epoch=0;
 private Runnable nextTask;
 private Runnable expiryTask;
 private long expiresAt=0;
 private boolean stoppedByTimer=false;
 private Reply manualReply;
 private final ArrayList<Line> lines=new ArrayList<>();
 private static final int NOTIFY=41;
 private static final String CHANNEL="solmate-playback";
 private static final class Line {String text,lang,voice;int gap;float rate;Line(String t,String l,int g,double speed,String speaker){text=t;lang=l;gap=g;rate=(float)SpeechOptions.speed(speed,1);voice=SpeechOptions.voice(speaker,"M1");}}
 @Override public void onCreate(){
  super.onCreate();modelDir=new File(getFilesDir(),"supertonic3");audioDir=new File(getFilesDir(),"speech");engine=new SupertonicEngine(modelDir,audioDir);
  audioManager=(AudioManager)getSystemService(AUDIO_SERVICE);
  wake=((PowerManager)getSystemService(POWER_SERVICE)).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK,"Solmate:Playback");wake.setReferenceCounted(false);
  NotificationChannel channel=new NotificationChannel(CHANNEL,"솔메이트 음성 재생",NotificationManager.IMPORTANCE_LOW);channel.setSound(null,null);getSystemService(NotificationManager.class).createNotificationChannel(channel);
  media=new MediaSession(this,"Solmate");media.setCallback(new MediaSession.Callback(){
   @Override public void onPlay(){resume();}@Override public void onPause(){pause();}@Override public void onStop(){stopPlayback();}
   @Override public void onSkipToNext(){move(1);}@Override public void onSkipToPrevious(){move(-1);}
  });
  systemTts=new TextToSpeech(this,status->{systemReady=status==TextToSpeech.SUCCESS;});
  systemTts.setOnUtteranceProgressListener(new UtteranceProgressListener(){
   @Override public void onStart(String id){}
   @Override public void onDone(String id){main.post(()->{if(id.equals("s"+epoch))completed();});}
   @Override public void onError(String id){main.post(()->fail("기기 TTS 재생에 실패했습니다."));}
  });
 }
 @Override public IBinder onBind(Intent intent){return binder;}
 @Override public int onStartCommand(Intent intent,int flags,int startId){
  String action=intent==null?null:intent.getAction();
  if("STOP".equals(action))stopPlayback();else if("NEXT".equals(action))move(1);else if("PREV".equals(action))move(-1);else if("PAUSE".equals(action)){if(paused)resume();else pause();}
  else if(intent==null&&!active){try{File state=new File(getFilesDir(),"queue.json");if(state.isFile())startQueue(new JSONObject(new String(Files.readAllBytes(state.toPath()),StandardCharsets.UTF_8)));}catch(Exception e){fail(e.getMessage());}}
  return active?START_STICKY:START_NOT_STICKY;
 }
 private PendingIntent action(String action,int id){return PendingIntent.getService(this,id,new Intent(this,PlaybackService.class).setAction(action),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);}
 private Notification notification(){
  PendingIntent open=PendingIntent.getActivity(this,1,new Intent(this,MainActivity.class),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
  String title="솔메이트";if(cards.length()>0)title+=" · "+(index+1)+" / "+cards.length();
  return new Notification.Builder(this,CHANNEL).setContentTitle(title).setContentText(paused?"일시 정지":"화면을 꺼도 계속 재생합니다").setSmallIcon(io.github.narpheus.solmate.R.drawable.ic_solmate)
   .setContentIntent(open).setOngoing(active).setOnlyAlertOnce(true).setCategory(Notification.CATEGORY_TRANSPORT)
   .addAction(new Notification.Action.Builder(android.R.drawable.ic_media_previous,"이전",action("PREV",2)).build())
   .addAction(new Notification.Action.Builder(paused?android.R.drawable.ic_media_play:android.R.drawable.ic_media_pause,paused?"재생":"일시 정지",action("PAUSE",3)).build())
   .addAction(new Notification.Action.Builder(android.R.drawable.ic_media_next,"다음",action("NEXT",4)).build())
   .addAction(new Notification.Action.Builder(android.R.drawable.ic_menu_close_clear_cancel,"종료",action("STOP",5)).build())
   .setStyle(new Notification.MediaStyle().setMediaSession(media.getSessionToken()).setShowActionsInCompactView(0,1,2)).build();
 }
 private void mediaState(){
  media.setActive(active);
  media.setMetadata(new MediaMetadata.Builder().putString(MediaMetadata.METADATA_KEY_TITLE,"솔메이트").putString(MediaMetadata.METADATA_KEY_ARTIST,cards.length()>0?(index+1)+" / "+cards.length():"발음 듣기").build());
  media.setPlaybackState(new PlaybackState.Builder().setActions(PlaybackState.ACTION_PLAY|PlaybackState.ACTION_PAUSE|PlaybackState.ACTION_STOP|PlaybackState.ACTION_SKIP_TO_NEXT|PlaybackState.ACTION_SKIP_TO_PREVIOUS).setState(active?(paused?PlaybackState.STATE_PAUSED:PlaybackState.STATE_PLAYING):PlaybackState.STATE_STOPPED,0,1).build());
  if(active)getSystemService(NotificationManager.class).notify(NOTIFY,notification());
 }
 private void begin(){
  active=true;paused=false;startForeground(NOTIFY,notification());
  if(!wake.isHeld())wake.acquire();
  AudioAttributes attrs=new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build();
  focus=new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN).setAudioAttributes(attrs).setOnAudioFocusChangeListener(change->{if(change==AudioManager.AUDIOFOCUS_LOSS||change==AudioManager.AUDIOFOCUS_LOSS_TRANSIENT)pause();}).build();
  if(audioManager.requestAudioFocus(focus)!=AudioManager.AUDIOFOCUS_REQUEST_GRANTED){pause();emit("다른 오디오가 끝난 뒤 알림에서 재생을 눌러주세요.",null);}
  mediaState();
 }
 private void releasePlayer(){if(player!=null){try{player.stop();}catch(Exception ignored){}player.release();player=null;}if(systemTts!=null)systemTts.stop();if(nextTask!=null)main.removeCallbacks(nextTask);nextTask=null;}
 private void clear(boolean notify){
  if(expiryTask!=null)main.removeCallbacks(expiryTask);expiryTask=null;expiresAt=0;
  epoch++;releasePlayer();active=false;paused=false;
  if(wake.isHeld())wake.release();if(focus!=null)audioManager.abandonAudioFocusRequest(focus);focus=null;
  if(manualReply!=null){Reply old=manualReply;manualReply=null;old.done(new JSONObject(),null);}
  new File(getFilesDir(),"queue.json").delete();stopForeground(STOP_FOREGROUND_REMOVE);mediaState();if(notify){emit(null,null);stopSelf();}
 }
 public void stopPlayback(){main.post(()->{stoppedByTimer=false;clear(true);});}
 private void armExpiry(){
  if(expiryTask!=null)main.removeCallbacks(expiryTask);expiryTask=null;
  if(!active||expiresAt<=0)return;
  expiryTask=()->{stoppedByTimer=true;clear(true);};
  main.postDelayed(expiryTask,Math.max(0,expiresAt-System.currentTimeMillis()));
 }
 public void startQueue(JSONObject payload){
  clear(false);job=payload;cards=payload.optJSONArray("cards");if(cards==null)cards=new JSONArray();
  cfg=payload.optJSONObject("config");if(cfg==null)cfg=new JSONObject();settings=payload.optJSONObject("settings");if(settings==null)settings=new JSONObject();
  stoppedByTimer=false;expiresAt=Math.max(0,payload.optLong("expiresAt",0));
  index=Math.max(0,Math.min(cards.length()-1,payload.optInt("index",0)));line=0;
  if(cards.length()==0){emit(null,null);return;}if(expiresAt>0&&expiresAt<=System.currentTimeMillis()){stoppedByTimer=true;clear(true);return;}begin();startService(new Intent(this,PlaybackService.class).setAction("QUEUE_ACTIVE"));save();armExpiry();buildLines();emit(null,null);advance();
 }
 private void buildLines(){
  lines.clear();line=0;JSONObject card=cards.optJSONObject(index);if(card==null)return;
  String ko=SpeechOptions.text(card.optString("korean",""),true,settings.optString("parenthesesFront","include").equals("omit"));String en=SpeechOptions.text(card.optString("english",""),false,settings.optString("parenthesesBack","include").equals("omit"));
  boolean reverse=settings.optString("order","KOR_ENG").equals("ENG_KOR");
  for(int side=0;side<2;side++){
   boolean front=reverse?side==1:side==0;String text=front?ko:en;int repeats=Math.max(0,Math.min(100,settings.optInt(front?"repeatFront":"repeatBack",1)));
   String voice=SpeechOptions.voice(settings.optString(front?"voiceFront":"voiceBack","default"),cfg.optString("voice","M1"));
   for(int r=0;r<repeats&&!text.trim().isEmpty();r++)lines.add(new Line(text,front?"ko":"en",r<repeats-1?800:400,settings.optDouble(front?"speedFront":"speedBack",settings.optDouble("speed",1)),voice));
  }
  if(!lines.isEmpty())lines.get(lines.size()-1).gap=Math.max(0,settings.optInt("interval",2000));
 }
 private void advance(){
  if(!active||paused)return;
  if(line>=lines.size()){
   if(index>=cards.length()-1){clear(true);return;}index++;buildLines();save();mediaState();emit(null,null);
   if(lines.isEmpty()){nextTask=this::advance;main.postDelayed(nextTask,100);return;}
  }
  play(lines.get(line),null);
 }
 private void play(Line item,Reply reply){
  currentRate=item.rate;
  int version=epoch;
  if(cfg.optString("engine","supertonic").equals("system")){
   if(!systemReady){nextTask=()->{if(version==epoch&&active)play(item,reply);};main.postDelayed(nextTask,300);return;}
   systemTts.setLanguage(item.lang.equals("ko")?Locale.KOREAN:Locale.US);systemTts.setSpeechRate(item.rate);
   systemTts.speak(item.text,TextToSpeech.QUEUE_FLUSH,null,"s"+version);return;
  }
  engineWork.execute(()->{
   try{
    File audio=engine.generate(item.text,item.lang,item.voice,cfg.optInt("steps",8));
    main.post(()->{if(version!=epoch||!active)return;try{
     releasePlayer();player=new MediaPlayer();player.setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build());
     player.setWakeMode(this,PowerManager.PARTIAL_WAKE_LOCK);player.setDataSource(audio.getAbsolutePath());player.prepare();
     player.setOnCompletionListener(p->{if(version==epoch)completed();});player.setOnErrorListener((p,w,e)->{fail("음성 재생에 실패했습니다.");return true;});
     if(!paused){player.setPlaybackParams(new PlaybackParams().setSpeed(item.rate).setPitch(1));player.start();}prefetch();
    }catch(Exception e){fail(e.getMessage());}});
   }catch(Exception e){main.post(()->{if(version==epoch)fail(e.getMessage());});}
  });
 }
 private void prefetch(){
  if(!active||cards.length()==0||cfg.optString("engine","supertonic").equals("system"))return;
  ArrayList<Line> upcoming=new ArrayList<>();for(int i=line+1;i<Math.min(lines.size(),line+3);i++)upcoming.add(lines.get(i));
  JSONObject next=cards.optJSONObject(index+1);if(upcoming.size()<2&&next!=null)upcoming.add(new Line(SpeechOptions.text(next.optString("english",""),false,settings.optString("parenthesesBack","include").equals("omit")),"en",0,settings.optDouble("speedBack",settings.optDouble("speed",1)),SpeechOptions.voice(settings.optString("voiceBack","default"),cfg.optString("voice","M1"))));
  int steps=cfg.optInt("steps",8),version=epoch;
  for(Line item:upcoming)engineWork.execute(()->{if(version!=epoch||!active||item.text.isEmpty())return;try{engine.generate(item.text,item.lang,item.voice,steps);}catch(Exception ignored){}});
 }
 private void completed(){
  if(manualReply!=null){clear(true);return;}
  if(!active)return;int delay=line<lines.size()?lines.get(line).gap:0;line++;
  nextTask=this::advance;main.postDelayed(nextTask,delay);
 }
 public void speak(JSONObject payload,Reply reply){
  clear(false);stoppedByTimer=false;cards=new JSONArray();cfg=payload;settings=new JSONObject();try{settings.put("speed",payload.optDouble("rate",1));}catch(Exception ignored){}
  manualReply=reply;begin();startService(new Intent(this,PlaybackService.class).setAction("QUEUE_ACTIVE"));play(new Line(payload.optString("text",""),payload.optString("lang","en"),0,payload.optDouble("rate",1),payload.optString("voice","M1")),reply);
 }
 public void move(int delta){if(!active||cards.length()==0)return;epoch++;releasePlayer();index=Math.max(0,Math.min(cards.length()-1,index+delta));buildLines();save();mediaState();emit(null,null);advance();}
 public void pause(){if(!active)return;paused=true;if(player!=null&&player.isPlaying())player.pause();if(systemTts!=null)systemTts.stop();if(nextTask!=null)main.removeCallbacks(nextTask);if(wake.isHeld())wake.release();mediaState();emit(null,null);}
 public void resume(){if(!active)return;if(expiresAt>0&&expiresAt<=System.currentTimeMillis()){stoppedByTimer=true;clear(true);return;}paused=false;armExpiry();if(!wake.isHeld())wake.acquire();if(player!=null){try{player.setPlaybackParams(new PlaybackParams().setSpeed(currentRate).setPitch(1));player.start();}catch(Exception e){advance();}}else advance();mediaState();emit(null,null);}
 private void fail(String error){Reply failed=manualReply;manualReply=null;clear(false);if(failed!=null)failed.done(null,error);emit(null,error==null?"음성 처리에 실패했습니다.":error);}
 private void save(){if(job==null)return;try{job.put("index",index).put("expiresAt",expiresAt);File file=new File(getFilesDir(),"queue.json");try(FileOutputStream out=new FileOutputStream(file)){out.write(job.toString().getBytes(StandardCharsets.UTF_8));}}catch(Exception ignored){}}
 public JSONObject snapshot(){JSONObject state=new JSONObject();try{state.put("active",active).put("paused",paused).put("index",index).put("cards",cards).put("settings",settings).put("config",cfg).put("expiresAt",expiresAt).put("stoppedByTimer",stoppedByTimer).put("sessionId",job==null?"":job.optString("sessionId",""));}catch(Exception ignored){}return state;}
 private void emit(String message,String error){JSONObject state=snapshot();try{if(message!=null)state.put("message",message);if(error!=null)state.put("error",error);}catch(Exception ignored){}Observer target=observer;if(target!=null)target.state(state);}
 public void request(String method,JSONObject payload,Reply reply){
  if(method.equals("installed")){JSONObject r=new JSONObject();try{r.put("installed",engine.installed());}catch(Exception ignored){}reply.done(r,null);return;}
  if(method.equals("state")){reply.done(snapshot(),null);return;}
  if(method.equals("stop")){stoppedByTimer=false;clear(true);reply.done(new JSONObject(),null);return;}
  if(method.equals("pause")){pause();reply.done(snapshot(),null);return;}
  if(method.equals("resume")){resume();reply.done(snapshot(),null);return;}
  if(method.equals("setExpiry")){expiresAt=Math.max(0,payload.optLong("expiresAt",0));save();armExpiry();reply.done(snapshot(),null);return;}
  if(method.equals("startQueue")){startQueue(payload);reply.done(new JSONObject(),null);return;}
  if(method.equals("move")){move(payload.optInt("delta",1));reply.done(new JSONObject(),null);return;}
  if(method.equals("speak")){speak(payload,reply);return;}
  if(method.equals("cancelDownload")){cancelDownload=true;reply.done(new JSONObject(),null);return;}
  if(method.equals("download")){download(reply);return;}
  if(method.equals("generate")||method.equals("warm")){
   engineWork.execute(()->{try{
    JSONObject result=new JSONObject();
    if(method.equals("warm"))engine.warm(payload.optString("voice","M1"),payload.optInt("steps",8));
    else {File wav=engine.generate(payload.optString("text",""),payload.optString("lang","en"),payload.optString("voice","M1"),payload.optInt("steps",8));result.put("url","https://appassets.androidplatform.net/audio/"+wav.getName());}
    reply.done(result,null);
   }catch(Exception e){reply.done(null,e.getMessage());}});return;
  }
  reply.done(null,"지원하지 않는 동작입니다.");
 }
 private void download(Reply reply){
  cancelDownload=false;downloads.execute(()->{try{
   for(int i=0;i<SupertonicEngine.FILES.length;i++){
    if(cancelDownload)throw new IOException("다운로드 중지됨 · 완성된 파일은 유지됩니다.");
    String name=SupertonicEngine.FILES[i];File file=new File(modelDir,name);long expected=SupertonicEngine.SIZES[i];
    if(file.isFile()&&file.length()>0&&(expected==0||file.length()==expected))continue;
    file.getParentFile().mkdirs();File part=new File(file.getPath()+".part");
    HttpURLConnection connection=(HttpURLConnection)new URL(SupertonicEngine.BASE+name).openConnection();connection.setConnectTimeout(30000);connection.setReadTimeout(45000);connection.setInstanceFollowRedirects(true);
    try{
     if(connection.getResponseCode()!=200)throw new IOException("다운로드 실패: "+name);
     long bytes=0,last=0;try(InputStream in=connection.getInputStream();FileOutputStream out=new FileOutputStream(part)){
      byte[] buffer=new byte[131072];int n;while((n=in.read(buffer))!=-1){if(cancelDownload)throw new IOException("다운로드 중지됨");out.write(buffer,0,n);bytes+=n;if(System.currentTimeMillis()-last>500){last=System.currentTimeMillis();final String message="저장 중 · "+name+" · "+(bytes/1048576)+" MB";main.post(()->emit(message,null));}}
     }
     if(expected>0&&part.length()!=expected)throw new IOException("파일 크기를 확인하지 못했습니다: "+name);
     if(!part.renameTo(file))throw new IOException("파일 저장 실패: "+name);
    }finally{connection.disconnect();}
   }
   main.post(()->emit("오프라인 음성 준비 완료 · Android 네이티브",null));reply.done(new JSONObject(),null);
  }catch(Exception e){reply.done(null,e.getMessage());}});
 }
 @Override public void onTaskRemoved(Intent rootIntent){/* Keep foreground playback when its UI task is dismissed. */super.onTaskRemoved(rootIntent);}
 @Override public void onDestroy(){clear(false);engineWork.shutdownNow();downloads.shutdownNow();if(systemTts!=null)systemTts.shutdown();media.release();super.onDestroy();}
}

