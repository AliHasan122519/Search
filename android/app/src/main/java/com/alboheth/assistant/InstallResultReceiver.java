package com.alboheth.assistant;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInstaller;
import android.widget.Toast;

/** Android's answer to the install session: it hands over the update screen to show, or says why the update was refused (said here in one short line). */
public class InstallResultReceiver extends BroadcastReceiver {
    @Override
    @SuppressWarnings("deprecation")
    public void onReceive(Context context, Intent intent) {
        int status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE);
        switch (status) {
            case PackageInstaller.STATUS_PENDING_USER_ACTION: {
                Intent confirm = (Intent) intent.getParcelableExtra(Intent.EXTRA_INTENT);
                if (confirm != null) { confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK); try { context.startActivity(confirm); } catch (Exception ignored) { } }
                return;
            }
            case PackageInstaller.STATUS_SUCCESS:
            case PackageInstaller.STATUS_FAILURE_ABORTED:   // the user closed the update screen
                return;
            case PackageInstaller.STATUS_FAILURE_INCOMPATIBLE:
                say(context, "تعذّر التحديث: النسخة المثبّتة موقّعة بمفتاح مختلف. احذف التطبيق ثم ثبّت الجديد."); return;
            case PackageInstaller.STATUS_FAILURE_STORAGE:
                say(context, "تعذّر التحديث: لا توجد مساحة كافية في الجهاز."); return;
            case PackageInstaller.STATUS_FAILURE_INVALID:
                say(context, "تعذّر التحديث: الملف الذي نزل غير صالح. حاول مرة أخرى."); return;
            default:
                say(context, "تعذّر إكمال التحديث. حاول مرة أخرى.");
        }
    }

    private void say(Context context, String text) { Toast.makeText(context, text, Toast.LENGTH_LONG).show(); }
}
