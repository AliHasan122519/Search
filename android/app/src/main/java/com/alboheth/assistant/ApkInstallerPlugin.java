package com.alboheth.assistant;

import android.app.PendingIntent;
import android.content.Intent;
import android.content.pm.PackageInstaller;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * In-app update, as fast as Android allows: the new APK is streamed from the network STRAIGHT into an install session (no temporary copy, no second pass over the file),
 * and the session is committed the moment the last byte arrives, so Android's own «تحديث» screen opens at once. Android itself checks that the package, its version and its signing key
 * fit the installed app; a refusal is reported by InstallResultReceiver in a short message.
 * Rejects with "invalid_url", "http_<code>", "invalid_package" or "download_failed: …" (the update dialog explains each one).
 */
@CapacitorPlugin(name = "ApkInstaller")
public class ApkInstallerPlugin extends Plugin {

    @Override
    public void load() {
        // an older version of the app kept the downloaded file in the cache: free that space
        File old = new File(getContext().getCacheDir(), "updates");
        if (old.isDirectory()) { File[] fs = old.listFiles(); if (fs != null) for (File f : fs) f.delete(); old.delete(); }
    }

    @PluginMethod
    public void install(final PluginCall call) {
        final String url = call.getString("url");
        if (url == null || !url.startsWith("https://")) { call.reject("invalid_url"); return; }
        if (Build.VERSION.SDK_INT >= 26 && !getContext().getPackageManager().canRequestPackageInstalls()) {
            Intent s = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName()));
            s.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(s);
            JSObject r = new JSObject(); r.put("status", "needs_permission"); call.resolve(r);
            return;
        }
        new Thread(new Runnable() { @Override public void run() { stream(call, url); } }).start();
    }

    private void progress(int percent) {
        JSObject o = new JSObject(); o.put("percent", percent); notifyListeners("progress", o);
    }

    private void stream(PluginCall call, String url) {
        PackageInstaller installer = getContext().getPackageManager().getPackageInstaller();
        PackageInstaller.Session session = null; HttpURLConnection c = null;
        try {
            c = (HttpURLConnection) new URL(url).openConnection();
            c.setConnectTimeout(20000); c.setReadTimeout(30000); c.setInstanceFollowRedirects(true);
            if (c.getResponseCode() != 200) { call.reject("http_" + c.getResponseCode()); return; }
            long total = c.getContentLengthLong();
            PackageInstaller.SessionParams sp = new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
            sp.setAppPackageName(getContext().getPackageName());
            if (total > 0) sp.setSize(total);
            int id = installer.createSession(sp);
            session = installer.openSession(id);
            long done = 0; int last = -1;
            InputStream in = c.getInputStream(); OutputStream out = session.openWrite("update", 0, total > 0 ? total : -1);
            try {
                byte[] buf = new byte[128 * 1024]; int n;
                while ((n = in.read(buf)) > 0) {
                    out.write(buf, 0, n); done += n;
                    if (total > 0) { int p = (int) (done * 100 / total); if (p != last) { last = p; progress(p); } }
                }
                session.fsync(out);
            } finally { out.close(); in.close(); }
            if (total > 0 && done != total) { session.abandon(); session = null; call.reject("invalid_package"); return; }
            progress(100);
            Intent cb = new Intent(getContext(), InstallResultReceiver.class); cb.setPackage(getContext().getPackageName());
            int fl = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 31 ? PendingIntent.FLAG_MUTABLE : 0);
            session.commit(PendingIntent.getBroadcast(getContext(), id, cb, fl).getIntentSender());
            session.close(); session = null;
            JSObject r = new JSObject(); r.put("status", "installing"); call.resolve(r);   // the dialog closes now; Android's update screen is already on its way
        } catch (Exception e) {
            if (session != null) { try { session.abandon(); } catch (Exception ignored) { } }
            call.reject("download_failed: " + e.getMessage());
        } finally { if (c != null) c.disconnect(); }
    }
}
