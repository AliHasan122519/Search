package com.alboheth.assistant;

import android.app.DownloadManager;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/**
 * Saves files for the user into the phone's «Downloads» folder without leaving the app:
 *  - download({url, filename, mime}): Android's own download manager fetches the file in the background (with its notification, resume and retry).
 *  - saveText({filename, text}): writes a text made by the app (a book's text) as a UTF-8 file.
 * Answers {status, where} with where = "downloads" (the public folder) or "app" (the app's own folder, when the public one cannot be written on an old Android).
 */
@CapacitorPlugin(name = "FileDownloader")
public class FileDownloaderPlugin extends Plugin {

    /** a file name every Android file system accepts */
    private static String safe(String name) {
        String s = name == null ? "" : name.replaceAll("[\\\\/:*?\"<>|\\r\\n]+", " ").replaceAll("\\s+", " ").trim();
        if (s.isEmpty() || s.equals(".")) s = "file";
        return s.length() > 120 ? s.substring(s.length() - 120) : s;
    }

    @PluginMethod
    public void download(PluginCall call) {
        String url = call.getString("url"); String name = safe(call.getString("filename"));
        String mime = call.getString("mime", "application/octet-stream");
        if (url == null || !(url.startsWith("https://") || url.startsWith("http://"))) { call.reject("invalid_url"); return; }
        try {
            DownloadManager.Request r = new DownloadManager.Request(Uri.parse(url));
            r.setTitle(name); r.setDescription("المكتبة الشاملة"); r.setMimeType(mime);
            r.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            r.setAllowedOverMetered(true); r.setAllowedOverRoaming(true);
            String where = "downloads";
            // Android 10+ lets the download manager write to the public «Downloads» without any permission; an older Android would need one, so the app's own folder is used there
            if (Build.VERSION.SDK_INT >= 29) r.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, name);
            else { r.setDestinationInExternalFilesDir(getContext(), Environment.DIRECTORY_DOWNLOADS, name); where = "app"; }
            DownloadManager dm = (DownloadManager) getContext().getSystemService(Context.DOWNLOAD_SERVICE);
            dm.enqueue(r);
            JSObject o = new JSObject(); o.put("status", "started"); o.put("where", where); call.resolve(o);
        } catch (Exception e) { call.reject("download_failed: " + e.getMessage()); }
    }

    @PluginMethod
    public void saveText(PluginCall call) {
        String name = safe(call.getString("filename")); String text = call.getString("text", "");
        try {
            byte[] bom = new byte[] { (byte) 0xEF, (byte) 0xBB, (byte) 0xBF };
            byte[] body = text.getBytes(StandardCharsets.UTF_8);
            String where = "downloads";
            if (Build.VERSION.SDK_INT >= 29) {
                ContentResolver cr = getContext().getContentResolver();
                ContentValues v = new ContentValues();
                v.put(MediaStore.MediaColumns.DISPLAY_NAME, name); v.put(MediaStore.MediaColumns.MIME_TYPE, "text/plain");
                v.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
                Uri uri = cr.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
                if (uri == null) throw new IllegalStateException("no_uri");
                try (OutputStream out = cr.openOutputStream(uri)) { out.write(bom); out.write(body); }
            } else {
                File dir = getContext().getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
                if (dir == null) throw new IllegalStateException("no_storage");
                if (!dir.exists()) dir.mkdirs();
                try (OutputStream out = new FileOutputStream(new File(dir, name))) { out.write(bom); out.write(body); }
                where = "app";
            }
            JSObject o = new JSObject(); o.put("status", "saved"); o.put("where", where); call.resolve(o);
        } catch (Exception e) { call.reject("save_failed: " + e.getMessage()); }
    }
}
