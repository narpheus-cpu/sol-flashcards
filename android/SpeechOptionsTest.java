package io.github.narpheus.solmate;
public final class SpeechOptionsTest {
 private static void check(boolean value,String name){if(!value)throw new AssertionError(name);System.out.println("PASS "+name);}
 public static void main(String[] args){
  check(SpeechOptions.text("<i>안녕</i> (뜻 (설명)) （참고）.",true,true).equals("안녕."),"nested and full-width annotations");
  check(SpeechOptions.text("Hello (note).",false,false).equals("Hello (note)."),"include annotations");
  check(SpeechOptions.text("Hello (note",false,true).equals("Hello (note"),"preserve unmatched tail");
  check(SpeechOptions.text("(only notes)",false,true).isEmpty(),"annotation-only segment omitted");
  check(SpeechOptions.speed(.7,1)==.7&&SpeechOptions.speed(1.8,1)==1.8,"independent front and back rates");
  check(SpeechOptions.speed(Double.NaN,1)==1&&SpeechOptions.speed(0,1)==1,"invalid rates fall back");
  check(SpeechOptions.voice("F1","M1").equals("F1")&&SpeechOptions.voice("M1","F1").equals("M1"),"each side can override the shared voice");
  check(SpeechOptions.voice("default","F1").equals("F1")&&SpeechOptions.voice("bad",null).equals("M1"),"legacy settings inherit shared voice safely");
 }
}
