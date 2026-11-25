package com.alboheth.assistant;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ApkInstallerPlugin.class);   // in-app updates (must be registered before super.onCreate)
        super.onCreate(savedInstanceState);
    }
}
