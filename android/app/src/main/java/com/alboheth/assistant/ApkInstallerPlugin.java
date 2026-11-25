package com.alboheth.assistant;

import android.app.PendingIntent;
import android.content.Intent;
import android.content.pm.PackageInstaller;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

/**
 * In-app updates: downloads the new APK into the app's cache, checks that it is a real, NEWER package signed with the SAME key as the installed app,
 * then hands it to Android's installer. Rejects with "invalid_package", "not_newer" or "signature_mismatch" (the update dialog explains each one).
 */
@CapacitorPlugin(name = "ApkInstaller")
public class ApkInstallerPlugin extends Plugin {

    /** true once a verified newer APK is staged in the cache and should be handed to Android's installer as soon as the user leaves the app */
    private volatile boolean commitOnLeave = false;

    private File apkFile() { return new File(new File(getContext().getCacheDir(), "updates"), "update.apk"); }

    @Override
    public void load() {
        // a staged file that is no longer newer (the update was installed) is leftover: remove it
        File f = apkFile();
        if (f.exists() && !"ok".equals(check(f))) f.delete();
    }

    @PluginMethod
    public void canInstall(PluginCall call) {
        JSObject r = new JSObject();
        r.put("allowed", Build.VERSION.SDK_INT < 26 || getContext().getPackageManager().canRequestPackageInstalls());
        call.resolve(r);
    }

    /** downloads and verifies the new APK into the cache (no prompt of any kind); with commitOnLeave it is installed when the user leaves the app */
    @PluginMethod
    public void download(final PluginCall call) {
        final String url = call.getString("url");
        final boolean leave = Boolean.TRUE.equals(call.getBoolean("commitOnLeave", false));
        if (url == null || !url.startsWith("https://")) { call.reject("invalid_url"); return; }
        new Thread(new Runnable() { @Override public void run() {
            String bad = fetch(url);
            if (bad != null) { call.reject(bad); return; }
            commitOnLeave = leave;
            JSObject r = new JSObject(); r.put("status", "ready"); call.resolve(r);
        } }).start();
    }

    /** installs the staged APK now (Android may still ask the user to confirm) */
    @PluginMethod
    public void commit(final PluginCall call) {
        new Thread(new Runnable() { @Override public void run() {
            String st = commitNow();
            if (st.startsWith("error:")) { call.reject(st.substring(6)); return; }
            JSObject r = new JSObject(); r.put("status", st); call.resolve(r);
        } }).start();
    }

    /** download + install in one go (the «تحديث الآن» button of the dialog) */
    @PluginMethod
    public void install(final PluginCall call) {
        final String url = call.getString("url");
        if (url == null || !url.startsWith("https://")) { call.reject("invalid_url"); return; }
        if (Build.VERSION.SDK_INT >= 26 && !getContext().getPackageManager().canRequestPackageInstalls()) {
            openUnknownSourcesSettings();
            JSObject r = new JSObject(); r.put("status", "needs_permission"); call.resolve(r);
            return;
        }
        new Thread(new Runnable() { @Override public void run() {
            String bad = fetch(url);
            if (bad != null) { call.reject(bad); return; }
            String st = commitNow();
            if (st.startsWith("error:")) { call.reject(st.substring(6)); return; }
            JSObject r = new JSObject(); r.put("status", st); call.resolve(r);
        } }).start();
    }

    /** the user leaves the app (home button, switching apps): the best moment to replace it, Android may then do it without asking */
    @Override
    protected void handleOnPause() {
        if (!commitOnLeave) return;
        commitOnLeave = false;
        new Thread(new Runnable() { @Override public void run() { commitNow(); } }).start();
    }

    private void openUnknownSourcesSettings() {
        Intent s = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName()));
        s.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(s);
    }

    /** "installing" | "needs_permission" | "error:<reason>" */
    private String commitNow() {
        File apk = apkFile();
        if (!apk.exists()) return "error:invalid_package";
        String problem = check(apk);
        if (!"ok".equals(problem)) { apk.delete(); return "error:" + problem; }
        if (Build.VERSION.SDK_INT >= 26 && !getContext().getPackageManager().canRequestPackageInstalls()) { openUnknownSourcesSettings(); return "needs_permission"; }
        try {
            PackageInstaller pi = getContext().getPackageManager().getPackageInstaller();
            PackageInstaller.SessionParams sp = new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
            sp.setAppPackageName(getContext().getPackageName());
            if (Build.VERSION.SDK_INT >= 31) sp.setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED);
            int id = pi.createSession(sp);
            PackageInstaller.Session session = pi.openSession(id);
            try {
                InputStream in = new FileInputStream(apk); OutputStream out = session.openWrite("update", 0, apk.length());
                try { byte[] buf = new byte[64 * 1024]; int n; while ((n = in.read(buf)) > 0) out.write(buf, 0, n); session.fsync(out); }
                finally { out.close(); in.close(); }
                Intent cb = new Intent(getContext(), InstallResultReceiver.class); cb.setPackage(getContext().getPackageName());
                int fl = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 31 ? PendingIntent.FLAG_MUTABLE : 0);
                session.commit(PendingIntent.getBroadcast(getContext(), id, cb, fl).getIntentSender());
            } finally { session.close(); }
            return "installing";
        } catch (Exception e) { return "error:install_failed: " + e.getMessage(); }
    }

    private void progress(int percent) {
        JSObject o = new JSObject(); o.put("percent", percent); notifyListeners("progress", o);
    }

    /** downloads url into the cache and verifies it; null = a good, newer, same-key APK is staged, otherwise the reason */
    private String fetch(String url) {
        File apk = apkFile(); File dir = apk.getParentFile();
        if (!dir.exists()) dir.mkdirs();
        HttpURLConnection c = null;
        try {
            if (apk.exists()) apk.delete();
            c = (HttpURLConnection) new URL(url).openConnection();
            c.setConnectTimeout(20000); c.setReadTimeout(30000); c.setInstanceFollowRedirects(true);
            if (c.getResponseCode() != 200) return "http_" + c.getResponseCode();
            long total = c.getContentLengthLong(); long done = 0; int last = -1;
            InputStream in = c.getInputStream(); OutputStream out = new FileOutputStream(apk);
            try {
                byte[] buf = new byte[64 * 1024]; int n;
                while ((n = in.read(buf)) > 0) {
                    out.write(buf, 0, n); done += n;
                    if (total > 0) { int p = (int) (done * 100 / total); if (p != last) { last = p; progress(p); } }
                }
            } finally { out.close(); in.close(); }
            if (total > 0 && done != total) { apk.delete(); return "invalid_package"; }
            progress(100);
            String problem = check(apk);
            if (!"ok".equals(problem)) { apk.delete(); return problem; }
            return null;
        } catch (Exception e) {
            apk.delete();
            return "download_failed: " + e.getMessage();
        } finally { if (c != null) c.disconnect(); }
    }

    @SuppressWarnings("deprecation")
    private long versionOf(PackageInfo p) { return Build.VERSION.SDK_INT >= 28 ? p.getLongVersionCode() : p.versionCode; }

    @SuppressWarnings("deprecation")
    private Set<String> signers(PackageInfo p) {
        Set<String> s = new HashSet<String>();
        Signature[] sigs = null;
        if (Build.VERSION.SDK_INT >= 28) { if (p.signingInfo != null) sigs = p.signingInfo.getApkContentsSigners(); }
        else sigs = p.signatures;
        if (sigs != null) for (Signature g : sigs) s.add(Arrays.toString(g.toByteArray()));
        return s;
    }

    /** "ok" = fine; otherwise the reason the file must not be installed */
    @SuppressWarnings("deprecation")
    private String check(File apk) {
        try {
            PackageManager pm = getContext().getPackageManager();
            int flags = Build.VERSION.SDK_INT >= 28 ? PackageManager.GET_SIGNING_CERTIFICATES : PackageManager.GET_SIGNATURES;
            PackageInfo n = pm.getPackageArchiveInfo(apk.getAbsolutePath(), flags);
            if (n == null || !getContext().getPackageName().equals(n.packageName)) return "invalid_package";
            PackageInfo cur = pm.getPackageInfo(getContext().getPackageName(), flags);
            if (versionOf(n) <= versionOf(cur)) return "not_newer";
            Set<String> a = signers(n), b = signers(cur);
            if (a.isEmpty() || !a.equals(b)) return "signature_mismatch";
            return "ok";
        } catch (Exception e) { return "invalid_package"; }
    }
}
