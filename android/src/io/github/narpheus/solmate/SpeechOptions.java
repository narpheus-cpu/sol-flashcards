package io.github.narpheus.solmate;
import java.util.regex.Pattern;
final class SpeechOptions {
 private static final Pattern ANNOTATIONS=Pattern.compile("\\([^()]*\\)|（[^（）]*）");
 static double speed(double value,double fallback){return !Double.isNaN(value)&&!Double.isInfinite(value)&&value>=.5&&value<=2?value:fallback;}
 static String text(String value,boolean front,boolean omit){
  String result=value==null?"":value;
  if(front)result=result.replaceAll("<[^>]+>","");
  if(omit){
   String previous;
   do{previous=result;result=ANNOTATIONS.matcher(result).replaceAll(" ");}while(!result.equals(previous));
   result=result.replaceAll("(?U)\\s+"," ").replaceAll("\\s+([,.;:!?。，、！？；：])","$1");
  }
  return result.trim();
 }
}
