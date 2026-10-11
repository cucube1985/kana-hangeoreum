package com.kana.hangeoreum;

import android.app.Instrumentation;
import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.graphics.Bitmap;
import org.json.JSONTokener;
import java.io.File;
import java.io.FileOutputStream;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

/** 별도의 QA 앱에서 수업·재시작·오프라인 음성을 실제 WebView로 검증합니다. */
public class KanaSmokeTest extends Instrumentation {
    private MainActivity activity;
    @Override public void onCreate(Bundle arguments) { super.onCreate(arguments); start(); }
    private String js(String code) throws Exception {
        CountDownLatch latch=new CountDownLatch(1);AtomicReference<String> value=new AtomicReference<>();
        runOnMainSync(()->activity.webView.evaluateJavascript(code,result->{value.set(result);latch.countDown();}));
        if(!latch.await(15,TimeUnit.SECONDS))throw new AssertionError("JavaScript timeout");return value.get();
    }
    private void check(String expression,String message) throws Exception {if(!"true".equals(js(expression)))throw new AssertionError(message+": "+js("document.body.innerText"));}
    private void loaded() throws Exception {
        for(int i=0;i<80;i++){if("true".equals(js("window.__qaOldPage!==true && document.readyState==='complete' && typeof coursePhase==='function' && document.getElementById('today-title').textContent.length>0")))return;Thread.sleep(250);}throw new AssertionError("Page not loaded");
    }
    private void reload() throws Exception {js("window.__qaOldPage=true;");runOnMainSync(()->activity.webView.reload());loaded();}
    private void answer() throws Exception {
        js("document.querySelector('.answer-option[data-id=\"'+state.quiz.items[state.quiz.index].id+'\"] .answer-main').click();document.getElementById('next-question').click();");
    }
    @Override public void onStart(){
        Bundle report=new Bundle();
        try {
            Intent intent=new Intent().setClassName(getTargetContext().getPackageName(),"com.kana.hangeoreum.MainActivity").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            activity=(MainActivity)startActivitySync(intent);loaded();
            js("localStorage.removeItem('kana-step-v1');");reload();
            check("courseTotals('hira').total===104&&courseTotals('kata').total===120", "Script totals");
            check("courseProgress(currentCoursePlan()).percent===0", "Initial progress");
            // 음성이 완전히 앱 내부에서 로드되어 디코딩되는지 확인.
            runOnMainSync(()->activity.webView.getSettings().setMediaPlaybackRequiresUserGesture(false));
            js("document.getElementById('today-start').click();document.getElementById('today-char-audio').click();");
            boolean audioReady=false;
            for(int i=0;i<30;i++){if("true".equals(js("!!activeAudio && activeAudio.readyState>=2"))){audioReady=true;break;}Thread.sleep(100);}
            if(!audioReady)throw new AssertionError("Bundled audio did not decode: "+js("document.getElementById('audio-status').textContent"));
            js("stopAudio();document.getElementById('course-new').value='3';document.getElementById('course-new').dispatchEvent(new Event('change'));document.getElementById('course-review').value='5';document.getElementById('course-review').dispatchEvent(new Event('change'));document.getElementById('today-start').click();");
            for(int i=0;i<3;i++)js("document.getElementById('today-mark').click();");
            check("state.quiz.items.length===3 && currentCoursePlan().studied.length===3", "New study and confirm start");
            for(int i=0;i<3;i++)answer();
            check("currentCoursePlan().confirmDone.length===3", "Confirm counts");
            js("Array.from(document.querySelectorAll('#quiz-results button')).find(b=>b.textContent==='오늘의 복습으로 →').click();");
            check("state.quiz.items.length===5", "Daily review count");
            for(int i=0;i<2;i++)answer();
            js("returnToToday();");check("currentCoursePlan().reviewDone.length===2", "Review partial save");
            reload();
            check("coursePhase(currentCoursePlan())==='review'&&currentCoursePlan().reviewDone.length===2", "Restart persistence");
            js("document.getElementById('today-start').click();");check("state.quiz.items.length===3", "Resume only remaining questions");
            for(int i=0;i<3;i++)answer();js("returnToToday();");
            check("courseProgress(currentCoursePlan()).percent===100&&coursePhase(currentCoursePlan())==='complete'", "Daily completion");
            check("courseTotals('hira').seen===3&&courseTotals('hira').mastered===2&&courseTotals('kata').seen===0", "Mastery and separate scripts");
            // 필순·따라 쓰기 칸이 구형 WebView에서도 크기를 가져야 해요 (CSS min()·inset 미사용).
            js("setScript('hira');setMode('learn');toggleStrokes(true);");
            check("document.querySelector('.stroke-cell').getBoundingClientRect().width>60&&document.querySelector('.trace-pad').getBoundingClientRect().height>60", "Stroke view size");
            // 뒤로 가기: 필순 닫기 → 오늘의 학습으로 → 첫 화면에서만 앱 종료.
            check("handleAndroidBack()==='handled'&&!state.strokeOpen", "Back closes strokes");
            check("handleAndroidBack()==='handled'&&state.mode==='today'", "Back returns to today");
            check("handleAndroidBack()==='exit'", "Back exits from today");
            // 테마: 앱에 시스템 다크 모드를 물어보고, 어둡게를 고르면 바로 적용돼요.
            check("typeof KanaAndroid.isSystemDark()==='boolean'", "Theme bridge");
            js("applyTheme('dark');");check("document.documentElement.dataset.theme==='dark'", "Dark theme");js("applyTheme('auto');");
            // 새 사용자 화면을 최종 스크린샷으로 남깁니다 (QA 앱 기록만 초기화).
            js("localStorage.removeItem('kana-step-v1');");reload();
            Thread.sleep(500);
            File screenshot=new File(activity.getExternalFilesDir(null),"android-preview.png");
            try(FileOutputStream out=new FileOutputStream(screenshot)){Bitmap bitmap=getUiAutomation().takeScreenshot();bitmap.compress(Bitmap.CompressFormat.PNG,100,out);bitmap.recycle();}
            report.putString("stream","PASS: Android WebView launch, 104/120 progress, bundled audio, study/confirm/review, persistence, resume, mastery, stroke view, back navigation and theme.\nScreenshot: "+screenshot.getAbsolutePath()+"\n");
            finish(Activity.RESULT_OK,report);
        }catch(Throwable error){report.putString("stream","FAIL: "+error.toString()+"\n");finish(Activity.RESULT_CANCELED,report);}
    }
}
