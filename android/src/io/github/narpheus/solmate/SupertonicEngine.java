package io.github.narpheus.solmate;

import ai.onnxruntime.*;
import org.json.*;
import java.io.*;
import java.nio.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.security.MessageDigest;
import java.text.Normalizer;
import java.util.*;

/** Native local inference using the official Supertonic 3 public ONNX contract. */
public final class SupertonicEngine implements AutoCloseable {
 public static final String BASE="https://huggingface.co/supertone-oss-archive/supertonic-3/resolve/aafc6e32416a594460b32413efc49d7fe4ce6d46/";
 public static final String[] FILES={"onnx/tts.json","onnx/unicode_indexer.json","onnx/duration_predictor.onnx","onnx/text_encoder.onnx","onnx/vector_estimator.onnx","onnx/vocoder.onnx","voice_styles/M1.json","voice_styles/F1.json"};
 public static final long[] SIZES={8253,277676,3700147,36416150,256534781,101424195,0,0};
 private final File root, audioDir;
 private final OrtEnvironment env=OrtEnvironment.getEnvironment();
 private OrtSession dp,enc,vector,vocoder;
 private JSONArray indexer;
 private int rate,baseChunk,compress,latentDim;
 private final Map<String,OnnxTensor[]> voices=new HashMap<>();
 private final Random random=new Random();
 public SupertonicEngine(File root,File audioDir){this.root=root;this.audioDir=audioDir;audioDir.mkdirs();}
 public boolean installed(){for(int i=0;i<FILES.length;i++){File f=new File(root,FILES[i]);if(!f.isFile()||f.length()==0||(SIZES[i]>0&&f.length()!=SIZES[i]))return false;}return true;}
 private static String read(File file)throws Exception{return new String(Files.readAllBytes(file.toPath()),StandardCharsets.UTF_8);}
 private synchronized void load()throws Exception{
  if(dp!=null)return;
  if(!installed())throw new IOException("설정에서 오프라인 음성 파일을 먼저 다운로드하세요.");
  JSONObject cfg=new JSONObject(read(new File(root,"onnx/tts.json")));
  rate=cfg.getJSONObject("ae").getInt("sample_rate");baseChunk=cfg.getJSONObject("ae").getInt("base_chunk_size");
  compress=cfg.getJSONObject("ttl").getInt("chunk_compress_factor");latentDim=cfg.getJSONObject("ttl").getInt("latent_dim")*compress;
  indexer=new JSONArray(read(new File(root,"onnx/unicode_indexer.json")));
  try(OrtSession.SessionOptions opts=new OrtSession.SessionOptions()){
   opts.setIntraOpNumThreads(Math.max(1,Math.min(2,Runtime.getRuntime().availableProcessors()-1)));
   opts.setInterOpNumThreads(1);opts.setOptimizationLevel(OrtSession.SessionOptions.OptLevel.ALL_OPT);
   try{
    dp=env.createSession(new File(root,"onnx/duration_predictor.onnx").getAbsolutePath(),opts);
    enc=env.createSession(new File(root,"onnx/text_encoder.onnx").getAbsolutePath(),opts);
    vector=env.createSession(new File(root,"onnx/vector_estimator.onnx").getAbsolutePath(),opts);
    vocoder=env.createSession(new File(root,"onnx/vocoder.onnx").getAbsolutePath(),opts);
   }catch(Exception e){close();throw e;}
  }
 }
 private OnnxTensor tensor(float[] data,long...shape)throws Exception{return OnnxTensor.createTensor(env,FloatBuffer.wrap(data),shape);}
 private static void flatten(JSONArray data,List<Float> out)throws Exception{for(int i=0;i<data.length();i++){Object item=data.get(i);if(item instanceof JSONArray)flatten((JSONArray)item,out);else out.add(((Number)item).floatValue());}}
 private OnnxTensor styleTensor(JSONObject style)throws Exception{
  List<Float> list=new ArrayList<>();flatten(style.getJSONArray("data"),list);float[] values=new float[list.size()];for(int i=0;i<values.length;i++)values[i]=list.get(i);
  JSONArray dims=style.getJSONArray("dims");long[] shape=new long[dims.length()];for(int i=0;i<shape.length;i++)shape[i]=dims.getLong(i);
  return tensor(values,shape);
 }
 private OnnxTensor[] style(String voice)throws Exception{
  if(!voice.equals("M1")&&!voice.equals("F1"))voice="M1";
  OnnxTensor[] cached=voices.get(voice);if(cached!=null)return cached;
  JSONObject json=new JSONObject(read(new File(root,"voice_styles/"+voice+".json")));
  OnnxTensor[] result={styleTensor(json.getJSONObject("style_ttl")),styleTensor(json.getJSONObject("style_dp"))};voices.put(voice,result);return result;
 }
 static String normalize(String text,String lang){
  text=Normalizer.normalize(text,Normalizer.Form.NFKD).replaceAll("[\\x{1F000}-\\x{1FFFF}\\x{2600}-\\x{27BF}]","");
  String[] from={"–","‑","—","_","“","”","‘","’","´","`","[","]","|","/","#","→","←","♥","☆","♡","©","\\"};
  String[] to={"-","-","-"," ","\"","\"","'","'","'","'"," "," "," "," "," "," "," ","","","","",""};
  for(int i=0;i<from.length;i++)text=text.replace(from[i],to[i]);
  text=text.replace("@"," at ").replace("e.g.,","for example, ").replace("i.e.,","that is, ").replaceAll("\\s+([,.!?;:'])","$1");
  while(text.contains("\"\""))text=text.replace("\"\"","\"");while(text.contains("''"))text=text.replace("''","'");
  text=text.replaceAll("\\s+"," ").trim();if(!text.matches("(?s).*[.!?;:,'\")\\]}…。」』】〉》›»]$"))text+=".";
  return "<"+lang+">"+text+"</"+lang+">";
 }
 private static Map<String,OnnxTensor> feed(Object...args){Map<String,OnnxTensor> out=new HashMap<>();for(int i=0;i<args.length;i+=2)out.put((String)args[i],(OnnxTensor)args[i+1]);return out;}
 private static OnnxTensor get(OrtSession.Result result,String name){return(OnnxTensor)result.get(name).get();}
 private static float[] floats(OnnxTensor t){FloatBuffer b=t.getFloatBuffer();float[] values=new float[b.remaining()];b.get(values);return values;}
 private float[] infer(String text,String lang,String voice,int steps)throws Exception{
  int[] codes=normalize(text,lang).codePoints().toArray();long[] ids=new long[codes.length];float[] mask=new float[codes.length];Arrays.fill(mask,1);
  for(int i=0;i<codes.length;i++)ids[i]=codes[i]<indexer.length()?indexer.optLong(codes[i],-1):-1;
  OnnxTensor[] s=style(voice);
  try(OnnxTensor textIds=OnnxTensor.createTensor(env,LongBuffer.wrap(ids),new long[]{1,ids.length});OnnxTensor textMask=tensor(mask,1,1,ids.length);
      OrtSession.Result durationOut=dp.run(feed("text_ids",textIds,"style_dp",s[1],"text_mask",textMask));
      OrtSession.Result textOut=enc.run(feed("text_ids",textIds,"style_ttl",s[0],"text_mask",textMask))){
   float duration=Math.max(.1f,Math.min(45f,floats(get(durationOut,"duration"))[0]));
   int len=(int)Math.ceil((int)(duration*rate)/(double)(baseChunk*compress));
   float[] noise=new float[latentDim*len],lm=new float[len];Arrays.fill(lm,1);
   for(int i=0;i<noise.length;i++)noise[i]=(float)random.nextGaussian();
   try(OnnxTensor latentMask=tensor(lm,1,1,len);OnnxTensor total=tensor(new float[]{steps},1)){
    for(int step=0;step<steps;step++){
     if(Thread.currentThread().isInterrupted())throw new InterruptedException();
     try(OnnxTensor latent=tensor(noise,1,latentDim,len);OnnxTensor current=tensor(new float[]{step},1);
         OrtSession.Result next=vector.run(feed("noisy_latent",latent,"text_emb",get(textOut,"text_emb"),"style_ttl",s[0],"latent_mask",latentMask,"text_mask",textMask,"current_step",current,"total_step",total))){noise=floats(get(next,"denoised_latent"));}
    }
    try(OnnxTensor latent=tensor(noise,1,latentDim,len);OrtSession.Result audio=vocoder.run(feed("latent",latent))){
     float[] wav=floats(get(audio,"wav_tts"));return Arrays.copyOf(wav,Math.min(wav.length,(int)(duration*rate)));
    }
   }
  }
 }
 public static String key(String text,String lang,String voice,int steps)throws Exception{
  byte[] data=MessageDigest.getInstance("SHA-256").digest(("supertonic3-1|"+voice+"|"+steps+"|"+lang+"|"+text.trim().replaceAll("\\s+"," ")).getBytes(StandardCharsets.UTF_8));StringBuilder out=new StringBuilder();for(byte b:data)out.append(String.format(Locale.US,"%02x",b&255));return out.toString();
 }
 public synchronized File generate(String text,String lang,String voice,int steps)throws Exception{
  File file=new File(audioDir,key(text,lang,voice,steps)+".wav");if(file.isFile()&&file.length()>44){file.setLastModified(System.currentTimeMillis());return file;}
  load();steps=steps==2||steps==4?steps:8;
  ByteArrayOutputStream pcm=new ByteArrayOutputStream();int limit=lang.equals("ko")?70:150;
  String remaining=text.trim();boolean first=true;
  while(!remaining.isEmpty()){
   int cut=Math.min(limit,remaining.length());if(cut<remaining.length()){int space=remaining.lastIndexOf(' ',cut);if(space>limit/2)cut=space;}
   String part=remaining.substring(0,cut).trim();remaining=remaining.substring(cut).trim();
   if(!first)pcm.write(new byte[(int)(rate*.12)*2]);first=false;
   for(float sample:infer(part,lang,voice,steps)){int value=(int)(Math.max(-1f,Math.min(1f,sample))*32767);pcm.write(value&255);pcm.write((value>>8)&255);}
  }
  byte[] body=pcm.toByteArray();ByteBuffer header=ByteBuffer.allocate(44).order(ByteOrder.LITTLE_ENDIAN);
  header.put("RIFF".getBytes(StandardCharsets.US_ASCII)).putInt(36+body.length).put("WAVEfmt ".getBytes(StandardCharsets.US_ASCII)).putInt(16).putShort((short)1).putShort((short)1).putInt(rate).putInt(rate*2).putShort((short)2).putShort((short)16).put("data".getBytes(StandardCharsets.US_ASCII)).putInt(body.length);
  File temp=new File(file.getPath()+".tmp");try(FileOutputStream out=new FileOutputStream(temp)){out.write(header.array());out.write(body);}if(!temp.renameTo(file))throw new IOException("음성 저장 실패");prune(file);return file;
 }
 private void prune(File current){File[] files=audioDir.listFiles((dir,name)->name.endsWith(".wav"));if(files==null)return;Arrays.sort(files,Comparator.comparingLong(File::lastModified));long total=0;for(File f:files)total+=f.length();for(File f:files){if(total<=96L*1024*1024)break;if(!f.equals(current)&&f.delete())total-=f.length();}}
 public synchronized void warm(String voice,int steps)throws Exception{load();style(voice);}
 public synchronized void close(){for(OnnxTensor[] s:voices.values())for(OnnxTensor t:s)t.close();voices.clear();for(OrtSession s:new OrtSession[]{dp,enc,vector,vocoder})if(s!=null)try{s.close();}catch(Exception ignored){}dp=enc=vector=vocoder=null;}
}
